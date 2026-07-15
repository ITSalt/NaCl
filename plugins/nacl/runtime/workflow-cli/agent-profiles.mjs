import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  link,
  mkdir,
  open,
  readFile,
  realpath,
  readdir,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const AGENT_PROFILE_CONTRACT = "nacl-agent-profiles-v1";
export const AGENT_PROFILE_FILENAMES = Object.freeze([
  "nacl-business-analyst.toml",
  "nacl-developer.toml",
  "nacl-system-architect.toml",
  "nacl-team-lead.toml",
  "nacl-verifier.toml",
]);

const PROFILE_FILENAME = /^[a-z][a-z0-9-]{1,63}\.toml$/;
const PROFILE_NAME = /^[a-z][a-z0-9-]{1,63}$/;
const REQUIRED_KEYS = Object.freeze(["name", "description", "developer_instructions"]);
const TEMPLATE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../resources/templates/agents",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function result(status, code, details = {}) {
  return { contract: AGENT_PROFILE_CONTRACT, operation: "install-agent-profiles", status, code, ...details };
}

function fail(code, message, details = {}, status = "BLOCKED") {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

async function optionalLstat(filename) {
  try {
    return await lstat(filename);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function parseTemplate(content, filename) {
  if (Buffer.byteLength(content) > 65_536) {
    throw fail("AGENT_PROFILE_TEMPLATE_INVALID", `${filename} exceeds the template size limit.`, {}, "FAILED");
  }
  const values = {};
  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^([a-z][a-z0-9_]*)\s*=\s*("(?:\\.|[^"\\])*")$/.exec(line);
    if (!match) {
      throw fail("AGENT_PROFILE_TEMPLATE_INVALID", `${filename}:${index + 1} is not a supported standalone TOML string assignment.`, {}, "FAILED");
    }
    const [, key, encoded] = match;
    if (Object.hasOwn(values, key)) {
      throw fail("AGENT_PROFILE_TEMPLATE_INVALID", `${filename} repeats ${key}.`, {}, "FAILED");
    }
    try {
      values[key] = JSON.parse(encoded);
    } catch {
      throw fail("AGENT_PROFILE_TEMPLATE_INVALID", `${filename}:${index + 1} has an invalid TOML string.`, {}, "FAILED");
    }
  }
  if (Object.keys(values).sort().join("\0") !== [...REQUIRED_KEYS].sort().join("\0")) {
    throw fail(
      "AGENT_PROFILE_TEMPLATE_INVALID",
      `${filename} must contain only name, description, and developer_instructions.`,
      {},
      "FAILED",
    );
  }
  if (
    !PROFILE_NAME.test(values.name) ||
    values.description.trim().length < 12 ||
    values.developer_instructions.trim().length < 40
  ) {
    throw fail("AGENT_PROFILE_TEMPLATE_INVALID", `${filename} has invalid required field values.`, {}, "FAILED");
  }
  if (/\bmodel(?:_reasoning_effort)?\b/.test(content)) {
    throw fail("AGENT_PROFILE_TEMPLATE_INVALID", `${filename} must inherit model settings.`, {}, "FAILED");
  }
  return Object.freeze(values);
}

async function loadTemplates(templateRoot = TEMPLATE_ROOT) {
  const rootState = await optionalLstat(templateRoot);
  if (!rootState?.isDirectory() || rootState.isSymbolicLink()) {
    throw fail("AGENT_PROFILE_TEMPLATES_UNAVAILABLE", "The packaged agent profile directory is unavailable.");
  }
  const actual = (await readdir(templateRoot)).filter((entry) => entry.endsWith(".toml")).sort();
  if (actual.join("\0") !== AGENT_PROFILE_FILENAMES.join("\0")) {
    throw fail("AGENT_PROFILE_TEMPLATE_SET_INVALID", "The packaged agent profile set differs from the indexed set.", {}, "FAILED");
  }
  const templates = [];
  for (const filename of actual) {
    if (!PROFILE_FILENAME.test(filename)) {
      throw fail("AGENT_PROFILE_TEMPLATE_INVALID", `Unsupported template filename: ${filename}.`, {}, "FAILED");
    }
    const source = path.join(templateRoot, filename);
    const sourceState = await lstat(source);
    if (!sourceState.isFile() || sourceState.isSymbolicLink()) {
      throw fail("AGENT_PROFILE_TEMPLATE_INVALID", `${filename} is not a regular packaged file.`, {}, "FAILED");
    }
    const content = await readFile(source, "utf8");
    const parsed = parseTemplate(content, filename);
    if (`${parsed.name}.toml` !== filename) {
      throw fail("AGENT_PROFILE_TEMPLATE_INVALID", `${filename} does not match its agent name.`, {}, "FAILED");
    }
    templates.push(Object.freeze({ filename, source, content, hash: sha256(content), parsed }));
  }
  return Object.freeze(templates);
}

async function assertSafeProjectRoot(projectRoot) {
  if (typeof projectRoot !== "string" || !path.isAbsolute(projectRoot) || /[\0\r\n]/.test(projectRoot)) {
    throw fail("PROJECT_ROOT_INVALID", "project_root must be an absolute path.", {}, "FAILED");
  }
  const resolved = path.resolve(projectRoot);
  const rootState = await optionalLstat(resolved);
  if (!rootState?.isDirectory() || rootState.isSymbolicLink()) {
    throw fail("PROJECT_ROOT_INVALID", "project_root must be a real directory, not a symlink.", {}, "FAILED");
  }
  const canonical = await realpath(resolved);
  return canonical;
}

async function assertSafeOptionalDirectory(filename, label) {
  const state = await optionalLstat(filename);
  if (state === null) return false;
  if (!state.isDirectory() || state.isSymbolicLink()) {
    throw fail("AGENT_PROFILE_DESTINATION_UNSAFE", `${label} must be a real directory and not a symlink.`, {}, "FAILED");
  }
  if (await realpath(filename) !== filename) {
    throw fail("AGENT_PROFILE_DESTINATION_UNSAFE", `${label} contains a symlinked path component.`, {}, "FAILED");
  }
  return true;
}

async function inspectDestination(destination, template) {
  const state = await optionalLstat(destination);
  if (state === null) {
    return Object.freeze({
      filename: template.filename,
      destination,
      action: "create",
      templateHash: template.hash,
      currentHash: null,
    });
  }
  if (!state.isFile() || state.isSymbolicLink()) {
    throw fail("AGENT_PROFILE_DESTINATION_UNSAFE", `${template.filename} exists but is not a regular file.`, {}, "FAILED");
  }
  const content = await readFile(destination);
  const currentHash = sha256(content);
  return Object.freeze({
    filename: template.filename,
    destination,
    action: currentHash === template.hash ? "unchanged" : "conflict",
    templateHash: template.hash,
    currentHash,
  });
}

function tokenPayload(projectRoot, entries) {
  return {
    contract: AGENT_PROFILE_CONTRACT,
    projectRoot,
    entries: entries.map(({ filename, action, templateHash, currentHash }) => ({
      filename,
      action,
      templateHash,
      currentHash,
    })),
  };
}

export async function planAgentProfiles(options = {}) {
  try {
    const projectRoot = await assertSafeProjectRoot(options.projectRoot);
    const templates = await loadTemplates(options.templateRoot);
    const codexDirectory = path.join(projectRoot, ".codex");
    const agentsDirectory = path.join(codexDirectory, "agents");
    const codexExists = await assertSafeOptionalDirectory(codexDirectory, ".codex");
    if (codexExists) await assertSafeOptionalDirectory(agentsDirectory, ".codex/agents");
    const entries = [];
    for (const template of templates) {
      entries.push(await inspectDestination(path.join(agentsDirectory, template.filename), template));
    }
    const planToken = sha256(canonicalJson(tokenPayload(projectRoot, entries)));
    const conflicts = entries.filter((entry) => entry.action === "conflict");
    return result(conflicts.length === 0 ? "VERIFIED" : "BLOCKED", conflicts.length === 0 ? "AGENT_PROFILE_PLAN_READY" : "AGENT_PROFILE_CONFLICT", {
      projectRoot,
      destination: agentsDirectory,
      planToken,
      entries,
      confirmation: `INSTALL_AGENT_PROFILES:${planToken}`,
    });
  } catch (error) {
    return result(error.status ?? "FAILED", error.code ?? "AGENT_PROFILE_PLAN_FAILED", error.details ?? {});
  }
}

async function atomicCreate(destination, content, beforeCreateLink) {
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    if (typeof beforeCreateLink === "function") await beforeCreateLink({ destination, temporary });
    await link(temporary, destination);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw fail("AGENT_PROFILE_TOCTOU_CONFLICT", `${path.basename(destination)} changed after the plan.`);
    }
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
  await chmod(destination, 0o600);
}

export async function applyAgentProfiles(options = {}) {
  let lockPath = null;
  const changed = [];
  try {
    const plan = await planAgentProfiles(options);
    const { projectRoot, destination, planToken, entries } = plan;
    if (!projectRoot || !planToken || !Array.isArray(entries)) return plan;
    if (entries.some((entry) => entry.action === "conflict")) return plan;
    if (options.planToken !== planToken) {
      throw fail("AGENT_PROFILE_PLAN_STALE", "The supplied plan token does not match current project state.");
    }
    const expectedConfirmation = `INSTALL_AGENT_PROFILES:${planToken}`;
    if (options.confirmation !== expectedConfirmation) {
      throw fail("CONFIRMATION_REQUIRED", `Exact confirmation ${expectedConfirmation} is required.`);
    }
    const codexDirectory = path.join(projectRoot, ".codex");
    await mkdir(codexDirectory, { recursive: false, mode: 0o700 }).catch((error) => {
      if (error?.code !== "EEXIST") throw error;
    });
    await assertSafeOptionalDirectory(codexDirectory, ".codex");
    await mkdir(destination, { recursive: false, mode: 0o700 }).catch((error) => {
      if (error?.code !== "EEXIST") throw error;
    });
    await assertSafeOptionalDirectory(destination, ".codex/agents");
    lockPath = path.join(destination, ".nacl-agent-profiles.lock");
    const lock = await open(lockPath, "wx", 0o600).catch((error) => {
      if (error?.code === "EEXIST") throw fail("AGENT_PROFILE_INSTALL_BUSY", "Another agent profile installation is in progress.");
      throw error;
    });
    await lock.close();

    const lockedPlan = await planAgentProfiles(options);
    if (lockedPlan.planToken !== planToken) {
      throw fail("AGENT_PROFILE_PLAN_STALE", "Project state changed after lock acquisition.");
    }
    const templates = await loadTemplates(options.templateRoot);
    const templateByName = new Map(templates.map((entry) => [entry.filename, entry]));
    for (const entry of lockedPlan.entries) {
      if (entry.action === "unchanged") continue;
      const template = templateByName.get(entry.filename);
      if (entry.action === "create") {
        await atomicCreate(entry.destination, template.content, options.beforeCreateLink);
      } else {
        throw fail("AGENT_PROFILE_CONFLICT", `${entry.filename} differs from the packaged profile.`);
      }
      const readbackState = await lstat(entry.destination);
      const readbackHash = sha256(await readFile(entry.destination));
      if (!readbackState.isFile() || readbackState.isSymbolicLink() || readbackHash !== entry.templateHash) {
        throw fail("AGENT_PROFILE_READBACK_FAILED", `${entry.filename} failed atomic read-back.`, {}, "PARTIALLY_VERIFIED");
      }
      changed.push(entry.filename);
    }
    const finalPlan = await planAgentProfiles(options);
    if (finalPlan.entries.some((entry) => entry.action !== "unchanged")) {
      throw fail("AGENT_PROFILE_READBACK_FAILED", "Installed agent profiles did not converge to the packaged hashes.", {}, "PARTIALLY_VERIFIED");
    }
    return result("VERIFIED", changed.length === 0 ? "AGENT_PROFILES_ALREADY_CURRENT" : "AGENT_PROFILES_INSTALLED", {
      projectRoot,
      destination,
      planToken: finalPlan.planToken,
      changed,
      entries: finalPlan.entries,
    });
  } catch (error) {
    if (changed.length > 0 && error.status !== "PARTIALLY_VERIFIED") {
      return result("PARTIALLY_VERIFIED", "AGENT_PROFILE_INSTALL_PARTIAL", {
        changed,
        causeCode: error.code ?? "AGENT_PROFILE_INSTALL_FAILED",
      });
    }
    return result(error.status ?? "FAILED", error.code ?? "AGENT_PROFILE_INSTALL_FAILED", {
      ...(error.details ?? {}),
      ...(changed.length > 0 ? { changed } : {}),
    });
  } finally {
    if (lockPath) await rm(lockPath, { force: true }).catch(() => {});
  }
}

export async function validateAgentProfileTemplates(options = {}) {
  try {
    const templates = await loadTemplates(options.templateRoot);
    return result("VERIFIED", "AGENT_PROFILE_TEMPLATES_VALID", {
      count: templates.length,
      profiles: templates.map(({ filename, hash, parsed }) => ({ filename, hash, name: parsed.name })),
    });
  } catch (error) {
    return result(error.status ?? "FAILED", error.code ?? "AGENT_PROFILE_TEMPLATE_VALIDATION_FAILED", error.details ?? {});
  }
}
