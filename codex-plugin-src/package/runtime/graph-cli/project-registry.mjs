import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  EXPECTED_GATEWAY_SCHEMA,
  SUPPORTED_GATEWAY_SCHEMAS,
  LifecycleError,
  assertProjectId,
  keychainReference,
} from "./contracts.mjs";

const execFileAsync = promisify(execFile);

export const PROJECT_REGISTRY_CONTRACT = "nacl-project-registry-record-v1";
export const PROJECT_REGISTRY_SCHEMA_VERSION = 1;
export const DEFAULT_PROJECT_REGISTRY_ROOT = path.join(
  os.homedir(),
  ".nacl",
  "codex",
  "local-graph",
  ".project-registry",
);

const PROJECT_ID_MIGRATION =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CLOSED_HEALTH_STATUSES = new Set(["VERIFIED", "BLOCKED", "FAILED", "PARTIALLY_VERIFIED"]);
const RECORD_KEYS = new Set([
  "contract",
  "registrySchemaVersion",
  "projectId",
  "registeredRoots",
  "repositoryIdentity",
  "graphMode",
  "graphProfile",
  "endpointReference",
  "secretReference",
  "schemaVersion",
  "lastHealthStatus",
  "createdAt",
  "updatedAt",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function projectError(code, message, options = {}) {
  return new LifecycleError(code, message, {
    status: options.status ?? "FAILED",
    details: options.details ?? {},
  });
}

function parseScalar(raw) {
  const withoutComment = raw.replace(/\s+#.*$/, "").trim();
  if (withoutComment.startsWith('"')) {
    try {
      const parsed = JSON.parse(withoutComment);
      return typeof parsed === "string" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (withoutComment.startsWith("'") && withoutComment.endsWith("'")) {
    return withoutComment.slice(1, -1).replace(/''/g, "'");
  }
  if (/^[A-Za-z0-9._-]+$/.test(withoutComment)) return withoutComment;
  return null;
}

export function parseProjectConfig(content) {
  if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > 1024 * 1024) {
    throw projectError("PROJECT_CONFIG_INVALID", "config.yaml is missing or exceeds the supported size.");
  }
  const bomLength = content.startsWith("\uFEFF") ? 1 : 0;
  const effectiveContent = content.slice(bomLength);
  const lines = effectiveContent.split(/\r?\n/);
  const projectHeaders = [];
  for (const [index, line] of lines.entries()) {
    if (/^project:\s*(?:#.*)?$/.test(line)) projectHeaders.push(index);
  }
  if (projectHeaders.length !== 1) {
    throw projectError(
      "PROJECT_CONFIG_INVALID",
      "config.yaml must contain exactly one top-level project mapping.",
    );
  }
  const start = projectHeaders[0] + 1;
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "" || /^\s*#/.test(line)) continue;
    if (!/^\s/.test(line)) {
      end = index;
      break;
    }
  }
  const candidates = lines.slice(start, end)
    .map((line, offset) => ({ line, index: start + offset }))
    .filter(({ line }) => line.trim() !== "" && !/^\s*#/.test(line));
  const indents = candidates.map(({ line }) => line.match(/^ */)?.[0].length ?? 0).filter((value) => value > 0);
  const childIndent = indents.length > 0 ? Math.min(...indents) : 2;
  const direct = candidates.filter(({ line }) => (line.match(/^ */)?.[0].length ?? 0) === childIndent);
  const values = new Map();
  for (const key of ["id", "name"]) {
    const matches = direct.filter(({ line }) => new RegExp(`^ {${childIndent}}${key}:`).test(line));
    if (matches.length > 1) {
      throw projectError("PROJECT_CONFIG_INVALID", `config.yaml contains duplicate project.${key}.`);
    }
    if (matches.length === 1) {
      const raw = matches[0].line.slice(matches[0].line.indexOf(":") + 1);
      const value = parseScalar(raw);
      if (value === null) {
        throw projectError("PROJECT_CONFIG_INVALID", `config.yaml contains an unsupported project.${key} scalar.`);
      }
      values.set(key, value);
    }
  }
  const projectId = values.get("id") ?? null;
  if (projectId !== null) assertProjectId(projectId);
  const headerMatches = [...effectiveContent.matchAll(/^project:\s*(?:#.*)?(?:\r\n|\n|$)/gm)];
  if (headerMatches.length !== 1) {
    throw projectError("PROJECT_CONFIG_INVALID", "config.yaml project mapping cannot be edited safely.");
  }
  const header = headerMatches[0];
  const headerText = header[0];
  const newline = headerText.endsWith("\r\n") ? "\r\n" : "\n";
  const headerHasNewline = headerText.endsWith("\n");
  return {
    projectId,
    projectName: values.get("name") ?? null,
    projectLine: projectHeaders[0],
    childIndent,
    lines,
    insertOffset: bomLength + header.index + headerText.length,
    insertionPrefix: headerHasNewline ? "" : newline,
    newline,
  };
}

export async function inspectProjectRoot(projectRoot) {
  if (
    typeof projectRoot !== "string" ||
    projectRoot.length === 0 ||
    projectRoot.length > 4096 ||
    /[\0\r\n]/.test(projectRoot) ||
    !path.isAbsolute(projectRoot)
  ) {
    throw projectError("PROJECT_ROOT_INVALID", "project_root must be a bounded absolute filesystem path.");
  }
  let canonicalRoot;
  try {
    canonicalRoot = await realpath(path.resolve(projectRoot));
    if (!(await stat(canonicalRoot)).isDirectory()) throw new Error("not a directory");
  } catch {
    throw projectError("PROJECT_ROOT_UNAVAILABLE", "The project root does not resolve to a readable directory.", {
      status: "BLOCKED",
    });
  }
  const configPath = path.join(canonicalRoot, "config.yaml");
  let metadata;
  try {
    metadata = await lstat(configPath);
  } catch {
    throw projectError("PROJECT_CONFIG_MISSING", "The project root does not contain config.yaml.", {
      status: "BLOCKED",
    });
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw projectError("PROJECT_CONFIG_UNSAFE", "config.yaml must be a regular file inside the project root.");
  }
  let configRealPath;
  try {
    configRealPath = await realpath(configPath);
  } catch {
    throw projectError("PROJECT_CONFIG_UNAVAILABLE", "config.yaml cannot be resolved.", { status: "BLOCKED" });
  }
  if (path.dirname(configRealPath) !== canonicalRoot) {
    throw projectError("PROJECT_CONFIG_UNSAFE", "config.yaml escapes the canonical project root.");
  }
  let content;
  let configBytes;
  let configDigest;
  try {
    const handle = await open(configPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        opened.dev !== metadata.dev ||
        opened.ino !== metadata.ino
      ) {
        throw new Error("config identity changed while opening");
      }
      configBytes = await handle.readFile();
      const afterRead = await handle.stat();
      if (
        !afterRead.isFile() ||
        afterRead.dev !== opened.dev ||
        afterRead.ino !== opened.ino ||
        afterRead.size !== opened.size ||
        afterRead.mtimeMs !== opened.mtimeMs ||
        afterRead.ctimeMs !== opened.ctimeMs
      ) {
        throw new Error("config changed while reading");
      }
    } finally {
      await handle.close();
    }
    content = configBytes.toString("utf8");
    if (!Buffer.from(content, "utf8").equals(configBytes)) {
      throw new Error("config is not canonical UTF-8");
    }
    configDigest = createHash("sha256").update(configBytes).digest("hex");
  } catch {
    throw projectError("PROJECT_CONFIG_UNAVAILABLE", "config.yaml cannot be read.", { status: "BLOCKED" });
  }
  return {
    canonicalRoot,
    configPath,
    configMode: metadata.mode & 0o777,
    configDevice: metadata.dev,
    configInode: metadata.ino,
    configBytes,
    configDigest,
    content,
    ...parseProjectConfig(content),
  };
}

export function generateProjectId(idGenerator = randomUUID) {
  const candidate = String(idGenerator()).toLowerCase();
  if (!PROJECT_ID_MIGRATION.test(candidate)) {
    throw projectError("PROJECT_ID_GENERATOR_INVALID", "The project identity generator did not return UUIDv4.");
  }
  return candidate;
}

async function defaultRepositoryIdentity(projectRoot) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      "git",
      ["rev-list", "--max-parents=0", "HEAD"],
      { cwd: projectRoot, encoding: "utf8", timeout: 5_000, maxBuffer: 64 * 1024 },
    ));
  } catch {
    throw projectError(
      "PROJECT_REPOSITORY_UNAVAILABLE",
      "The project root must be a Git repository with readable history.",
      { status: "BLOCKED" },
    );
  }
  const roots = stdout.trim().split(/\s+/).filter(Boolean).sort();
  if (roots.length === 0 || roots.some((value) => !/^[a-f0-9]{40,64}$/.test(value))) {
    throw projectError("PROJECT_REPOSITORY_INVALID", "Git did not return a stable repository lineage.");
  }
  return `git-roots-sha256:${createHash("sha256").update(roots.join("\n")).digest("hex")}`;
}

function validateHealth(value) {
  if (value === null) return null;
  if (
    !isObject(value) ||
    !CLOSED_HEALTH_STATUSES.has(value.status) ||
    typeof value.code !== "string" ||
    value.code.length < 1 ||
    value.code.length > 128 ||
    typeof value.checkedAt !== "string" ||
    !Number.isFinite(Date.parse(value.checkedAt)) ||
    Object.keys(value).some((key) => !["status", "code", "checkedAt"].includes(key))
  ) {
    throw new Error("invalid health");
  }
  return value;
}

export function validateProjectRecord(record) {
  try {
    if (!isObject(record) || Object.keys(record).some((key) => !RECORD_KEYS.has(key))) throw new Error();
    if (record.contract !== PROJECT_REGISTRY_CONTRACT) throw new Error();
    if (record.registrySchemaVersion !== PROJECT_REGISTRY_SCHEMA_VERSION) throw new Error();
    assertProjectId(record.projectId);
    if (!Array.isArray(record.registeredRoots) || record.registeredRoots.length === 0) throw new Error();
    const roots = [...new Set(record.registeredRoots)];
    if (
      roots.length !== record.registeredRoots.length ||
      roots.some((root) => typeof root !== "string" || !path.isAbsolute(root) || path.normalize(root) !== root || /[\0\r\n]/.test(root)) ||
      [...roots].sort().some((root, index) => root !== roots[index])
    ) {
      throw new Error();
    }
    if (!/^git-roots-sha256:[a-f0-9]{64}$/.test(record.repositoryIdentity)) throw new Error();
    if (record.graphMode !== "local" || record.graphProfile !== "default") throw new Error();
    if (record.endpointReference !== `local-instance:${record.projectId}`) throw new Error();
    if (record.secretReference !== keychainReference(record.projectId)) throw new Error();
    if (!SUPPORTED_GATEWAY_SCHEMAS.some((schema) => schema.version === record.schemaVersion)) throw new Error();
    validateHealth(record.lastHealthStatus);
    if (!Number.isFinite(Date.parse(record.createdAt)) || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error();
  } catch {
    throw projectError("PROJECT_REGISTRY_CORRUPT", "The project registry record is corrupt.");
  }
  return record;
}

async function atomicWriteJson(filename, value, mode = 0o600) {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", mode);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, filename);
    await chmod(filename, mode);
  } finally {
    await rm(temporary, { force: true });
  }
}

export class FileProjectRegistryStore {
  constructor(root = DEFAULT_PROJECT_REGISTRY_ROOT) {
    this.root = path.resolve(root);
  }

  filename(projectId) {
    assertProjectId(projectId);
    return path.join(this.root, `${projectId}.json`);
  }

  async get(projectId) {
    assertProjectId(projectId);
    let content;
    try {
      content = await readFile(this.filename(projectId), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw projectError("PROJECT_REGISTRY_UNAVAILABLE", "The project registry is unavailable.", {
        status: "BLOCKED",
      });
    }
    try {
      const record = validateProjectRecord(JSON.parse(content));
      if (record.projectId !== projectId) {
        throw projectError("PROJECT_REGISTRY_CORRUPT", "The project registry filename does not match its record.");
      }
      return record;
    } catch (error) {
      if (error instanceof LifecycleError) throw error;
      throw projectError("PROJECT_REGISTRY_CORRUPT", "The project registry record is corrupt.");
    }
  }

  async list() {
    let entries;
    try {
      entries = await readdir(this.root, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw projectError("PROJECT_REGISTRY_UNAVAILABLE", "The project registry is unavailable.", {
        status: "BLOCKED",
      });
    }
    const records = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        throw projectError("PROJECT_REGISTRY_CORRUPT", "The project registry contains an unexpected entry.");
      }
      const projectId = entry.name.slice(0, -5);
      records.push(await this.get(projectId));
    }
    return records;
  }

  async put(record) {
    validateProjectRecord(record);
    await atomicWriteJson(this.filename(record.projectId), record);
    const readback = await this.get(record.projectId);
    if (JSON.stringify(readback) !== JSON.stringify(record)) {
      throw projectError("PROJECT_REGISTRY_READBACK_FAILED", "The project registry write did not pass read-back.", {
        status: "PARTIALLY_VERIFIED",
      });
    }
    return readback;
  }
}

async function assertConfigUnchanged(inspected) {
  let current;
  try {
    current = await inspectProjectRoot(inspected.canonicalRoot);
  } catch {
    throw projectError("PROJECT_CONFIG_CHANGED", "config.yaml changed after presentation; inspect it again.", {
      status: "BLOCKED",
    });
  }
  if (
    current.configDevice !== inspected.configDevice ||
    current.configInode !== inspected.configInode ||
    current.configMode !== inspected.configMode ||
    current.configDigest !== inspected.configDigest ||
    !current.configBytes.equals(inspected.configBytes)
  ) {
    throw projectError("PROJECT_CONFIG_CHANGED", "config.yaml changed after presentation; inspect it again.", {
      status: "BLOCKED",
    });
  }
  return current;
}

async function atomicInsertProjectId(inspected, projectId, options = {}) {
  if (!PROJECT_ID_MIGRATION.test(projectId)) {
    throw projectError("PROJECT_ID_INVALID", "The presented project identity is not a generated UUIDv4.");
  }
  await assertConfigUnchanged(inspected);
  const indent = inspected.childIndent ?? 2;
  const insertion = `${inspected.insertionPrefix}${" ".repeat(indent)}id: "${projectId}"${inspected.newline}`;
  const next =
    inspected.content.slice(0, inspected.insertOffset) +
    insertion +
    inspected.content.slice(inspected.insertOffset);
  const temporary = `${inspected.configPath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", inspected.configMode);
  try {
    await handle.writeFile(next, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    if (typeof options.beforeRename === "function") await options.beforeRename(inspected);
    await assertConfigUnchanged(inspected);
    await rename(temporary, inspected.configPath);
    await chmod(inspected.configPath, inspected.configMode);
  } finally {
    await rm(temporary, { force: true });
  }
  const readback = await inspectProjectRoot(inspected.canonicalRoot);
  if (readback.projectId !== projectId) {
    throw projectError("PROJECT_ID_READBACK_FAILED", "The project identity write did not pass read-back.", {
      status: "PARTIALLY_VERIFIED",
    });
  }
  return readback;
}

export function createProjectRouter(options = {}) {
  const store = options.store ?? new FileProjectRegistryStore(options.registryRoot);
  const clock = options.clock ?? (() => new Date());
  const idGenerator = options.idGenerator ?? randomUUID;
  const repositoryIdentity = options.repositoryIdentity ?? defaultRepositoryIdentity;
  const beforeConfigCommit = options.beforeConfigCommit;
  const beforeConfigRename = options.beforeConfigRename;

  async function proposed(projectRoot) {
    const inspected = await inspectProjectRoot(projectRoot);
    if (inspected.projectId) {
      return { inspected, presentedProjectId: null, requiredConfirmation: null };
    }
    const presentedProjectId = generateProjectId(idGenerator);
    return {
      inspected,
      presentedProjectId,
      requiredConfirmation: `MIGRATE_PROJECT_ID:${presentedProjectId}`,
    };
  }

  async function registerRoot({ projectId, projectRoot, confirmation }) {
    assertProjectId(projectId);
    if (confirmation !== "REGISTER_PROJECT_ROOT") {
      throw projectError("CONFIRMATION_REQUIRED", "Explicit confirmation REGISTER_PROJECT_ROOT is required.", {
        status: "BLOCKED",
      });
    }
    const inspected = await inspectProjectRoot(projectRoot);
    if (inspected.projectId !== projectId) {
      throw projectError("PROJECT_MISMATCH", "project_id does not match project.id in config.yaml.");
    }
    const lineage = await repositoryIdentity(inspected.canonicalRoot);
    const records = await store.list();
    const rootOwner = records.find((record) => record.registeredRoots.includes(inspected.canonicalRoot));
    if (rootOwner && rootOwner.projectId !== projectId) {
      throw projectError("PROJECT_ROOT_CONFLICT", "The canonical root is registered to another project.");
    }
    const existing = records.find((record) => record.projectId === projectId) ?? null;
    if (existing && existing.repositoryIdentity !== lineage) {
      throw projectError(
        "PROJECT_LINEAGE_MISMATCH",
        "The root has the same config identity but belongs to an unrelated Git repository.",
      );
    }
    const now = clock().toISOString();
    const record = existing
      ? {
          ...existing,
          registeredRoots: [...new Set([...existing.registeredRoots, inspected.canonicalRoot])].sort(),
          updatedAt: now,
        }
      : {
          contract: PROJECT_REGISTRY_CONTRACT,
          registrySchemaVersion: PROJECT_REGISTRY_SCHEMA_VERSION,
          projectId,
          registeredRoots: [inspected.canonicalRoot],
          repositoryIdentity: lineage,
          graphMode: "local",
          graphProfile: "default",
          endpointReference: `local-instance:${projectId}`,
          secretReference: keychainReference(projectId),
          schemaVersion: EXPECTED_GATEWAY_SCHEMA.version,
          lastHealthStatus: null,
          createdAt: now,
          updatedAt: now,
        };
    const readback = await store.put(record);
    if (!readback.registeredRoots.includes(inspected.canonicalRoot)) {
      throw projectError("PROJECT_REGISTRY_READBACK_FAILED", "The registered root was not read back.", {
        status: "PARTIALLY_VERIFIED",
      });
    }
    return { record: readback, canonicalRoot: inspected.canonicalRoot };
  }

  async function migrateIdentity({ projectRoot, presentedProjectId, confirmation }) {
    if (!PROJECT_ID_MIGRATION.test(presentedProjectId ?? "")) {
      throw projectError("PROJECT_ID_INVALID", "The presented project identity is not a generated UUIDv4.");
    }
    if (confirmation !== `MIGRATE_PROJECT_ID:${presentedProjectId}`) {
      throw projectError("CONFIRMATION_REQUIRED", "The exact presented project identity must be confirmed.", {
        status: "BLOCKED",
      });
    }
    const inspected = await inspectProjectRoot(projectRoot);
    if (inspected.projectId !== null) {
      throw projectError("PROJECT_ID_ALREADY_PRESENT", "config.yaml already contains project.id.", {
        status: "BLOCKED",
      });
    }
    if (await store.get(presentedProjectId)) {
      throw projectError("PROJECT_ID_COLLISION", "The generated project identity already exists.", {
        status: "BLOCKED",
      });
    }
    if (typeof beforeConfigCommit === "function") await beforeConfigCommit(inspected);
    const migrated = await atomicInsertProjectId(inspected, presentedProjectId, {
      beforeRename: beforeConfigRename,
    });
    try {
      const registered = await registerRoot({
        projectId: presentedProjectId,
        projectRoot: migrated.canonicalRoot,
        confirmation: "REGISTER_PROJECT_ROOT",
      });
      return { ...registered, configReadbackVerified: true };
    } catch (error) {
      throw projectError(
        "PROJECT_MIGRATION_PARTIAL",
        "project.id was written and verified, but registry completion failed; reconcile before retrying.",
        {
          status: "PARTIALLY_VERIFIED",
          details: {
            projectId: presentedProjectId,
            configReadbackVerified: true,
            recovery: {
              action: "project_register_root",
              confirmation: "REGISTER_PROJECT_ROOT",
              automaticRetry: false,
            },
          },
        },
      );
    }
  }

  async function resolveRegistered({ projectId, projectRoot }) {
    assertProjectId(projectId);
    if (typeof projectRoot !== "string" || projectRoot.length === 0) {
      throw projectError("PROJECT_ROOT_REQUIRED", "project_root is required with project_id.", {
        status: "BLOCKED",
      });
    }
    const inspected = await inspectProjectRoot(projectRoot);
    if (inspected.projectId === null) {
      throw projectError("PROJECT_ID_MIGRATION_REQUIRED", "config.yaml has no stable project.id.", {
        status: "BLOCKED",
      });
    }
    if (inspected.projectId !== projectId) {
      throw projectError("PROJECT_MISMATCH", "project_id does not match project.id in config.yaml.");
    }
    const record = await store.get(projectId);
    if (!record) {
      throw projectError("PROJECT_REGISTRATION_REQUIRED", "The project root is not registered.", {
        status: "BLOCKED",
      });
    }
    if (!record.registeredRoots.includes(inspected.canonicalRoot)) {
      throw projectError("PROJECT_ROOT_NOT_REGISTERED", "The canonical root is not registered for this project.", {
        status: "BLOCKED",
      });
    }
    const lineage = await repositoryIdentity(inspected.canonicalRoot);
    if (lineage !== record.repositoryIdentity) {
      throw projectError("PROJECT_LINEAGE_MISMATCH", "The registered root no longer matches project lineage.");
    }
    return { record, canonicalRoot: inspected.canonicalRoot };
  }

  async function resolve({ projectRoot } = {}) {
    if (projectRoot === undefined) {
      const records = await store.list();
      const roots = records.flatMap((record) => record.registeredRoots);
      if (roots.length === 0) {
        throw projectError("PROJECT_ROOT_REQUIRED", "project_root is required because no project is registered.", {
          status: "BLOCKED",
        });
      }
      if (roots.length !== 1) {
        throw projectError("AMBIGUOUS_PROJECT", "Several project roots are registered; supply project_root.", {
          status: "BLOCKED",
          details: { registeredRootCount: roots.length },
        });
      }
      projectRoot = roots[0];
    }
    const proposal = await proposed(projectRoot);
    if (proposal.presentedProjectId) {
      throw projectError("PROJECT_ID_MIGRATION_REQUIRED", "Present and confirm the generated project identity.", {
        status: "BLOCKED",
        details: {
          canonicalRoot: proposal.inspected.canonicalRoot,
          presentedProjectId: proposal.presentedProjectId,
          requiredConfirmation: proposal.requiredConfirmation,
        },
      });
    }
    const record = await store.get(proposal.inspected.projectId);
    if (!record || !record.registeredRoots.includes(proposal.inspected.canonicalRoot)) {
      throw projectError("PROJECT_REGISTRATION_REQUIRED", "Present and confirm root registration.", {
        status: "BLOCKED",
        details: {
          projectId: proposal.inspected.projectId,
          canonicalRoot: proposal.inspected.canonicalRoot,
          requiredConfirmation: "REGISTER_PROJECT_ROOT",
        },
      });
    }
    return resolveRegistered({
      projectId: proposal.inspected.projectId,
      projectRoot: proposal.inspected.canonicalRoot,
    });
  }

  async function updateHealth({ projectId, projectRoot, status, code }) {
    const { record, canonicalRoot } = await resolveRegistered({ projectId, projectRoot });
    if (!CLOSED_HEALTH_STATUSES.has(status) || typeof code !== "string" || code.length === 0 || code.length > 128) {
      throw projectError("PROJECT_HEALTH_INVALID", "The health result cannot be recorded.");
    }
    const updated = {
      ...record,
      lastHealthStatus: { status, code, checkedAt: clock().toISOString() },
      updatedAt: clock().toISOString(),
    };
    return { record: await store.put(updated), canonicalRoot };
  }

  async function updateSchemaVersion({ projectId, projectRoot, schemaVersion }) {
    const { record, canonicalRoot } = await resolveRegistered({ projectId, projectRoot });
    if (
      schemaVersion !== EXPECTED_GATEWAY_SCHEMA.version ||
      record.schemaVersion > schemaVersion
    ) {
      throw projectError("PROJECT_SCHEMA_INVALID", "The project schema metadata cannot be advanced.");
    }
    if (record.schemaVersion === schemaVersion) return { record, canonicalRoot };
    const updated = {
      ...record,
      schemaVersion,
      updatedAt: clock().toISOString(),
    };
    return { record: await store.put(updated), canonicalRoot };
  }

  return Object.freeze({
    store,
    proposed,
    resolve,
    resolveRegistered,
    migrateIdentity,
    registerRoot,
    updateHealth,
    updateSchemaVersion,
  });
}
