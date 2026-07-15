import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readlink,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LEGACY_SYMLINK_CONTRACT = "nacl-legacy-symlink-migration-v1";
const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PLUGIN_ROOT = path.resolve(MODULE_ROOT, "../..");
const TOKEN = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;

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

function result(status, code, fields = {}) {
  return {
    contract: LEGACY_SYMLINK_CONTRACT,
    operation: "remove-legacy-symlinks",
    status,
    code,
    ...fields,
  };
}

function fail(code, message, details = {}, status = "BLOCKED") {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

async function optionalLstat(filename, options) {
  try {
    return await lstat(filename, options);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function identity(state) {
  return {
    dev: String(state.dev),
    ino: String(state.ino),
    mode: String(state.mode),
    uid: String(state.uid),
    gid: String(state.gid),
    size: String(state.size),
    mtimeNs: String(state.mtimeNs),
    ctimeNs: String(state.ctimeNs),
  };
}

function stableIdentity(state) {
  const value = identity(state);
  delete value.ctimeNs;
  return value;
}

function parseSkillName(content) {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return frontmatter?.[1].match(/^name:\s*([a-z0-9-]+)\s*$/m)?.[1] ?? null;
}

async function loadCatalog(pluginRoot) {
  const [index, parity] = await Promise.all([
    readFile(path.join(pluginRoot, "resources", "package-index.json"), "utf8").then(JSON.parse),
    readFile(path.join(pluginRoot, "resources", "references", "workflow-parity-baseline.json"), "utf8").then(JSON.parse),
  ]);
  const names = index?.internalWorkflows;
  if (!Array.isArray(names) || names.length !== 60 || new Set(names).size !== 60) {
    throw fail("LEGACY_CATALOG_INVALID", "The packaged legacy workflow catalog is not the exact 60-name set.", {}, "FAILED");
  }
  if (
    parity?.schemaVersion !== 2 ||
    parity?.codexRootWorkflowCount !== 60 ||
    !Array.isArray(parity?.deliberateDivergences) ||
    !Array.isArray(parity?.historicalLegacyTargets)
  ) {
    throw fail("LEGACY_CATALOG_INVALID", "The packaged parity baseline is unavailable.", {}, "FAILED");
  }
  const divergences = new Map(parity.deliberateDivergences.map((entry) => [entry.workflow, entry]));
  const catalog = new Map();
  for (const name of [...names].sort()) {
    const packagedPath = path.join(pluginRoot, "resources", "workflows", name, "SKILL.md");
    const packagedContent = await readFile(packagedPath);
    const packagedHash = sha256(packagedContent);
    const divergence = divergences.get(name);
    if (divergence) {
      if (
        divergence.packagedSha256 !== packagedHash ||
        !TOKEN.test(divergence.codexRootSha256) ||
        typeof divergence.reason !== "string"
      ) {
        throw fail("LEGACY_CATALOG_DRIFT", `Parity metadata drifted for ${name}.`, {}, "FAILED");
      }
      const acceptedTargets = [{
        sha256: divergence.codexRootSha256,
        generation: "current-parity-baseline",
        sourceCommit: null,
        sourcePath: `skills-for-codex/${name}/SKILL.md`,
        reason: "Current exact Codex root parity hash.",
      }];
      catalog.set(name, {
        name,
        acceptedTargets,
        packagedHash,
        parity: "deliberate-divergence",
      });
    } else {
      catalog.set(name, {
        name,
        acceptedTargets: [{
          sha256: packagedHash,
          generation: "current-byte-identical",
          sourceCommit: null,
          sourcePath: `skills-for-codex/${name}/SKILL.md`,
          reason: "Current byte-identical package and Codex root hash.",
        }],
        packagedHash,
        parity: "byte-identical",
      });
    }
  }
  if ([...divergences.keys()].some((name) => !catalog.has(name))) {
    throw fail("LEGACY_CATALOG_INVALID", "The parity baseline names a workflow outside the exact catalog.", {}, "FAILED");
  }
  for (const historical of parity.historicalLegacyTargets) {
    const entry = catalog.get(historical?.workflow);
    if (
      !entry ||
      !TOKEN.test(historical?.sha256) ||
      !/^audited-base-[0-9a-f]{7,12}$/.test(historical?.generation ?? "") ||
      !COMMIT.test(historical?.sourceCommit ?? "") ||
      typeof historical?.reason !== "string" ||
      historical.reason.length < 40 ||
      entry.acceptedTargets.some((target) => target.sha256 === historical.sha256)
    ) {
      throw fail("LEGACY_CATALOG_DRIFT", `Historical parity metadata drifted for ${historical?.workflow ?? "unknown"}.`, {}, "FAILED");
    }
    entry.acceptedTargets.push({
      sha256: historical.sha256,
      generation: historical.generation,
      sourceCommit: historical.sourceCommit,
      sourcePath: `skills-for-codex/${historical.workflow}/SKILL.md`,
      reason: historical.reason,
    });
  }
  return catalog;
}

async function assertRealDirectory(filename, label, { allowMissing = false } = {}) {
  const state = await optionalLstat(filename);
  if (state === null && allowMissing) return null;
  if (!state?.isDirectory() || state.isSymbolicLink()) {
    throw fail("LEGACY_SKILLS_ROOT_UNSAFE", `${label} must be a real directory, not a symlink.`);
  }
  const canonical = await realpath(filename);
  if (canonical !== filename) {
    throw fail("LEGACY_SKILLS_ROOT_UNSAFE", `${label} contains a symlinked final component.`);
  }
  return canonical;
}

async function resolveRoots(home) {
  if (typeof home !== "string" || !path.isAbsolute(home) || /[\0\r\n]/.test(home)) {
    throw fail("LEGACY_HOME_INVALID", "The process home must be an absolute path.", {}, "FAILED");
  }
  const resolvedHome = path.resolve(home);
  const homeState = await optionalLstat(resolvedHome);
  if (!homeState?.isDirectory() || homeState.isSymbolicLink()) {
    throw fail("LEGACY_HOME_INVALID", "The process home must be a real directory.", {}, "FAILED");
  }
  const canonicalHome = await realpath(resolvedHome);
  const agentsRoot = path.join(canonicalHome, ".agents");
  const agents = await assertRealDirectory(agentsRoot, "$HOME/.agents", { allowMissing: true });
  const skillsRoot = path.join(agentsRoot, "skills");
  if (agents !== null) await assertRealDirectory(skillsRoot, "$HOME/.agents/skills", { allowMissing: true });
  return { canonicalHome, agentsRoot, skillsRoot };
}

async function inspectKnownLink(candidate, name, catalogEntry) {
  const state = await lstat(candidate, { bigint: true });
  if (!state.isSymbolicLink()) {
    return { blocker: { name, reason: "not-a-symlink", path: candidate } };
  }
  const rawTarget = await readlink(candidate);
  let targetCanonical;
  try {
    targetCanonical = await realpath(candidate);
  } catch {
    return { blocker: { name, reason: "broken-or-unresolvable-link", path: candidate } };
  }
  let targetState;
  try {
    targetState = await stat(candidate);
  } catch {
    return { blocker: { name, reason: "target-unreadable", path: candidate } };
  }
  if (!targetState.isDirectory()) {
    return { blocker: { name, reason: "target-not-a-directory", path: candidate } };
  }
  const skillPath = path.join(targetCanonical, "SKILL.md");
  const skillState = await optionalLstat(skillPath);
  if (!skillState?.isFile() || skillState.isSymbolicLink()) {
    return { blocker: { name, reason: "target-skill-not-a-regular-file", path: candidate } };
  }
  let content;
  try {
    content = await readFile(skillPath);
  } catch {
    return { blocker: { name, reason: "target-skill-unreadable", path: candidate } };
  }
  const targetHash = sha256(content);
  const frontmatterName = parseSkillName(content.toString("utf8"));
  if (frontmatterName !== name) {
    return { blocker: { name, reason: "target-frontmatter-mismatch", path: candidate } };
  }
  const acceptedTarget = catalogEntry.acceptedTargets.find((entry) => entry.sha256 === targetHash);
  if (!acceptedTarget) {
    return { blocker: { name, reason: "target-hash-unrecognized", path: candidate } };
  }
  return {
    entry: {
      name,
      path: candidate,
      action: "remove-symlink",
      rawTarget,
      targetCanonical,
      targetSkillPath: skillPath,
      targetHash,
      acceptedGeneration: acceptedTarget.generation,
      acceptedSourceCommit: acceptedTarget.sourceCommit,
      frontmatterName,
      parity: catalogEntry.parity,
      linkIdentity: identity(state),
    },
  };
}

function planPayload(canonicalHome, entries) {
  return {
    contract: LEGACY_SYMLINK_CONTRACT,
    canonicalHome,
    entries: entries.map((entry) => ({
      name: entry.name,
      rawTarget: entry.rawTarget,
      targetCanonical: entry.targetCanonical,
      targetHash: entry.targetHash,
      acceptedGeneration: entry.acceptedGeneration,
      acceptedSourceCommit: entry.acceptedSourceCommit,
      frontmatterName: entry.frontmatterName,
      parity: entry.parity,
      linkIdentity: entry.linkIdentity,
    })),
  };
}

export async function planLegacySymlinkRemoval(options = {}) {
  try {
    const pluginRoot = path.resolve(options.pluginRoot ?? DEFAULT_PLUGIN_ROOT);
    const home = options.home ?? os.homedir();
    const [catalog, roots] = await Promise.all([loadCatalog(pluginRoot), resolveRoots(home)]);
    const rootState = await optionalLstat(roots.skillsRoot);
    const names = rootState === null ? [] : await readdir(roots.skillsRoot);
    const found = names.filter((name) => /^nacl(?:-|$)/.test(name)).sort();
    const catalogFoundCount = found.filter((name) => catalog.has(name)).length;
    const entries = [];
    const blockers = [];
    for (const name of found) {
      if (!catalog.has(name)) {
        blockers.push({ name, reason: "unknown-nacl-artifact", path: path.join(roots.skillsRoot, name) });
        continue;
      }
      const inspected = await inspectKnownLink(path.join(roots.skillsRoot, name), name, catalog.get(name));
      if (inspected.blocker) blockers.push(inspected.blocker);
      else entries.push(inspected.entry);
    }
    const planToken = sha256(canonicalJson(planPayload(roots.canonicalHome, entries)));
    const fields = {
      canonicalHome: roots.canonicalHome,
      skillsRoot: roots.skillsRoot,
      catalogSize: catalog.size,
      foundCount: found.length,
      catalogFoundCount,
      acceptedCount: entries.length,
      missingCount: catalog.size - catalogFoundCount,
      planToken,
      entries,
      blockers,
    };
    if (blockers.length > 0) {
      return result("BLOCKED", "LEGACY_SYMLINK_PLAN_BLOCKED", fields);
    }
    if (entries.length === 0) {
      return result("VERIFIED", "LEGACY_SYMLINKS_ALREADY_ABSENT", fields);
    }
    return result("VERIFIED", "LEGACY_SYMLINK_PLAN_READY", {
      ...fields,
      confirmation: `REMOVE_LEGACY_NACL_SYMLINKS:${planToken}`,
    });
  } catch (error) {
    return result(error.status ?? "FAILED", error.code ?? "LEGACY_SYMLINK_PLAN_FAILED", error.details ?? {});
  }
}

async function assertStateDirectory(filename, { requirePrivate = true } = {}) {
  let created = false;
  await mkdir(filename, { recursive: false, mode: 0o700 }).then(() => {
    created = true;
  }).catch((error) => {
    if (error?.code !== "EEXIST") throw error;
  });
  const state = await lstat(filename);
  if (!state.isDirectory() || state.isSymbolicLink()) {
    throw fail("LEGACY_MIGRATION_STATE_UNSAFE", "Migration state contains a non-directory or symlink.", {}, "FAILED");
  }
  if (created) await chmod(filename, 0o700);
  if (requirePrivate && (state.mode & 0o777) !== 0o700) {
    throw fail("LEGACY_MIGRATION_STATE_UNSAFE", "Migration state must be mode 0700.", {}, "FAILED");
  }
  if ((await realpath(filename)) !== filename) {
    throw fail("LEGACY_MIGRATION_STATE_UNSAFE", "Migration state contains a symlinked final component.", {}, "FAILED");
  }
}

async function ensureStateRoot(canonicalHome) {
  const nacl = path.join(canonicalHome, ".nacl");
  const codex = path.join(nacl, "codex");
  const migration = path.join(codex, "legacy-migration");
  await assertStateDirectory(nacl, { requirePrivate: false });
  await assertStateDirectory(codex, { requirePrivate: false });
  await assertStateDirectory(migration);
  return migration;
}

async function appendAudit(stateRoot, record) {
  const filename = path.join(stateRoot, "audit.jsonl");
  const flags = fsConstants.O_WRONLY |
    fsConstants.O_APPEND |
    fsConstants.O_CREAT |
    fsConstants.O_NOFOLLOW |
    fsConstants.O_NONBLOCK;
  let handle;
  try {
    handle = await open(filename, flags, 0o600);
    const before = await handle.stat();
    if (!before.isFile()) {
      throw fail("LEGACY_MIGRATION_AUDIT_FAILED", "Migration audit is not a regular file.", {}, "PARTIALLY_VERIFIED");
    }
    await handle.chmod(0o600);
    await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
    await handle.sync();
    const after = await handle.stat();
    if (!after.isFile() || (after.mode & 0o777) !== 0o600) {
      throw fail("LEGACY_MIGRATION_AUDIT_FAILED", "Migration audit read-back failed.", {}, "PARTIALLY_VERIFIED");
    }
  } catch (error) {
    if (error?.code === "LEGACY_MIGRATION_AUDIT_FAILED") throw error;
    throw fail("LEGACY_MIGRATION_AUDIT_FAILED", "Migration audit could not be opened safely.", {}, "PARTIALLY_VERIFIED");
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function assertAuditPathSafe(stateRoot) {
  const filename = path.join(stateRoot, "audit.jsonl");
  const state = await optionalLstat(filename);
  if (state !== null && (!state.isFile() || state.isSymbolicLink())) {
    throw fail("LEGACY_MIGRATION_AUDIT_FAILED", "Migration audit path is unsafe.", {}, "FAILED");
  }
}

async function readReceipt(stateRoot, token) {
  const filename = path.join(stateRoot, "receipts", `${token}.json`);
  const state = await optionalLstat(filename);
  if (state === null) return null;
  if (!state.isFile() || state.isSymbolicLink()) {
    throw fail("LEGACY_MIGRATION_RECEIPT_INVALID", "Migration receipt is unsafe.", {}, "FAILED");
  }
  let handle;
  let receipt;
  try {
    handle = await open(filename, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
    const openedState = await handle.stat();
    if (!openedState.isFile() || (openedState.mode & 0o777) !== 0o600) {
      throw fail("LEGACY_MIGRATION_RECEIPT_INVALID", "Migration receipt is unsafe.", {}, "FAILED");
    }
    receipt = JSON.parse(await handle.readFile("utf8"));
  } catch (error) {
    if (error?.code === "LEGACY_MIGRATION_RECEIPT_INVALID") throw error;
    throw fail("LEGACY_MIGRATION_RECEIPT_INVALID", "Migration receipt could not be read safely.", {}, "FAILED");
  } finally {
    await handle?.close().catch(() => {});
  }
  if (receipt?.contract !== LEGACY_SYMLINK_CONTRACT || receipt?.planToken !== token || !Array.isArray(receipt?.removed)) {
    throw fail("LEGACY_MIGRATION_RECEIPT_INVALID", "Migration receipt content is invalid.", {}, "FAILED");
  }
  return receipt;
}

async function writeReceipt(stateRoot, token, removed) {
  const receipts = path.join(stateRoot, "receipts");
  await assertStateDirectory(receipts);
  const filename = path.join(receipts, `${token}.json`);
  const payload = `${JSON.stringify({
    contract: LEGACY_SYMLINK_CONTRACT,
    planToken: token,
    removed: [...removed].sort(),
    completedAt: new Date().toISOString(),
  }, null, 2)}\n`;
  const handle = await open(filename, "wx", 0o600).catch(async (error) => {
    if (error?.code !== "EEXIST") throw error;
    return null;
  });
  if (handle) {
    try {
      await handle.writeFile(payload, "utf8");
      await handle.sync();
      await handle.chmod(0o600);
      const state = await handle.stat();
      if (!state.isFile() || (state.mode & 0o777) !== 0o600) {
        throw fail("LEGACY_MIGRATION_RECEIPT_INVALID", "Migration receipt write-back failed.", {}, "PARTIALLY_VERIFIED");
      }
    } finally {
      await handle.close();
    }
  }
  const receipt = await readReceipt(stateRoot, token);
  if (receipt.removed.join("\0") !== [...removed].sort().join("\0")) {
    throw fail("LEGACY_MIGRATION_RECEIPT_INVALID", "Migration receipt differs from the completed plan.", {}, "PARTIALLY_VERIFIED");
  }
  return filename;
}

function entryIdentityMatches(state, entry) {
  return canonicalJson(stableIdentity(state)) === canonicalJson((() => {
    const value = { ...entry.linkIdentity };
    delete value.ctimeNs;
    return value;
  })());
}

async function validateQuarantinedLink(quarantinePath, entry) {
  const state = await lstat(quarantinePath, { bigint: true });
  if (!state.isSymbolicLink()) {
    throw fail("LEGACY_SYMLINK_RACE_PRESERVED", "A concurrent non-symlink was preserved in quarantine.", {
      name: entry.name,
      preservedPath: quarantinePath,
      preservedKind: state.isDirectory() ? "directory" : state.isFile() ? "file" : "other",
    }, "PARTIALLY_VERIFIED");
  }
  const rawTarget = await readlink(quarantinePath);
  if (rawTarget !== entry.rawTarget || !entryIdentityMatches(state, entry)) {
    throw fail("LEGACY_SYMLINK_RACE_PRESERVED", "A changed symlink was preserved in quarantine.", {
      name: entry.name,
      preservedPath: quarantinePath,
      preservedKind: "symlink",
    }, "PARTIALLY_VERIFIED");
  }
  const targetState = await lstat(entry.targetSkillPath);
  const targetContent = await readFile(entry.targetSkillPath);
  if (
    !targetState.isFile() ||
    targetState.isSymbolicLink() ||
    sha256(targetContent) !== entry.targetHash ||
    parseSkillName(targetContent.toString("utf8")) !== entry.name
  ) {
    throw fail("LEGACY_TARGET_DRIFT_PRESERVED", "The accepted target changed and its symlink was preserved in quarantine.", {
      name: entry.name,
      preservedPath: quarantinePath,
      preservedKind: "symlink",
    }, "PARTIALLY_VERIFIED");
  }
  return state;
}

export async function applyLegacySymlinkRemoval(options = {}) {
  const home = options.home ?? os.homedir();
  const pluginRoot = path.resolve(options.pluginRoot ?? DEFAULT_PLUGIN_ROOT);
  const removed = [];
  const preserved = [];
  let lockPath = null;
  let quarantineRoot = null;
  let quarantineTouched = false;
  let stateRoot = null;
  try {
    if (!TOKEN.test(options.planToken ?? "")) {
      throw fail("LEGACY_SYMLINK_PLAN_STALE", "A valid plan token is required.");
    }
    const expectedConfirmation = `REMOVE_LEGACY_NACL_SYMLINKS:${options.planToken}`;
    if (options.confirmation !== expectedConfirmation) {
      throw fail("CONFIRMATION_REQUIRED", `Exact confirmation ${expectedConfirmation} is required.`);
    }

    const initialPlan = await planLegacySymlinkRemoval({ home, pluginRoot });
    if (initialPlan.status !== "VERIFIED") return initialPlan;
    const roots = await resolveRoots(home);
    stateRoot = path.join(roots.canonicalHome, ".nacl", "codex", "legacy-migration");
    const existingState = await optionalLstat(stateRoot);
    if (existingState !== null) {
      await assertStateDirectory(stateRoot);
      await assertAuditPathSafe(stateRoot);
      const receipt = await readReceipt(stateRoot, options.planToken);
      if (receipt && initialPlan.code === "LEGACY_SYMLINKS_ALREADY_ABSENT") {
        await appendAudit(stateRoot, {
          timestamp: new Date().toISOString(),
          contract: LEGACY_SYMLINK_CONTRACT,
          operation: "remove-legacy-symlinks",
          status: "VERIFIED",
          code: "LEGACY_SYMLINKS_ALREADY_REMOVED",
          planToken: options.planToken,
          removed: [...receipt.removed].sort(),
        });
        return result("VERIFIED", "LEGACY_SYMLINKS_ALREADY_REMOVED", {
          canonicalHome: roots.canonicalHome,
          planToken: options.planToken,
          removed: receipt.removed,
          receiptVerified: true,
        });
      }
    }
    if (initialPlan.code !== "LEGACY_SYMLINK_PLAN_READY" || initialPlan.planToken !== options.planToken) {
      throw fail("LEGACY_SYMLINK_PLAN_STALE", "The supplied plan token does not match current legacy state.");
    }

    // All validation above is read-only. Durable state begins only after the
    // exact plan and confirmation are accepted.
    stateRoot = await ensureStateRoot(roots.canonicalHome);
    await assertAuditPathSafe(stateRoot);
    lockPath = path.join(stateRoot, ".apply.lock");
    const lock = await open(lockPath, "wx", 0o600).catch((error) => {
      if (error?.code === "EEXIST") throw fail("LEGACY_SYMLINK_MIGRATION_BUSY", "Another legacy migration is in progress.");
      throw error;
    });
    await lock.close();
    quarantineRoot = path.join(stateRoot, "quarantine", `${options.planToken}-${randomUUID()}`);
    await assertStateDirectory(path.dirname(quarantineRoot));
    await assertStateDirectory(quarantineRoot);

    const lockedPlan = await planLegacySymlinkRemoval({ home, pluginRoot });
    if (lockedPlan.status !== "VERIFIED" || lockedPlan.code !== "LEGACY_SYMLINK_PLAN_READY" || lockedPlan.planToken !== options.planToken) {
      throw fail("LEGACY_SYMLINK_PLAN_STALE", "Legacy state changed after migration lock acquisition.");
    }

    for (const entry of lockedPlan.entries) {
      if (typeof options.beforeQuarantineRename === "function") {
        await options.beforeQuarantineRename({ entry, quarantineRoot });
      }
      const quarantinePath = path.join(quarantineRoot, entry.name);
      await rename(entry.path, quarantinePath);
      quarantineTouched = true;
      if (typeof options.afterQuarantineRename === "function") {
        await options.afterQuarantineRename({ entry, quarantinePath, quarantineRoot });
      }
      try {
        await validateQuarantinedLink(quarantinePath, entry);
      } catch (error) {
        if (error?.details?.preservedPath) preserved.push(error.details);
        throw error;
      }
      const finalState = await lstat(quarantinePath);
      if (!finalState.isSymbolicLink()) {
        const details = {
          name: entry.name,
          preservedPath: quarantinePath,
          preservedKind: finalState.isDirectory() ? "directory" : "file",
        };
        preserved.push(details);
        throw fail("LEGACY_SYMLINK_RACE_PRESERVED", "A non-symlink was preserved instead of removed.", details, "PARTIALLY_VERIFIED");
      }
      await unlink(quarantinePath);
      removed.push(entry.name);
    }

    const finalPlan = await planLegacySymlinkRemoval({ home, pluginRoot });
    if (
      finalPlan.status !== "VERIFIED" ||
      finalPlan.code !== "LEGACY_SYMLINKS_ALREADY_ABSENT" ||
      finalPlan.blockers.length !== 0 ||
      finalPlan.entries.length !== 0
    ) {
      throw fail("LEGACY_SYMLINK_READBACK_FAILED", "Legacy symlink removal did not read back cleanly.", {}, "PARTIALLY_VERIFIED");
    }
    const receiptPath = await writeReceipt(stateRoot, options.planToken, removed);
    await appendAudit(stateRoot, {
      timestamp: new Date().toISOString(),
      contract: LEGACY_SYMLINK_CONTRACT,
      operation: "remove-legacy-symlinks",
      status: "VERIFIED",
      code: "LEGACY_SYMLINKS_REMOVED",
      planToken: options.planToken,
      removed: [...removed].sort(),
    });
    await rmdir(quarantineRoot);
    quarantineRoot = null;
    return result("VERIFIED", "LEGACY_SYMLINKS_REMOVED", {
      canonicalHome: roots.canonicalHome,
      planToken: options.planToken,
      removed: [...removed].sort(),
      receiptPath,
      receiptVerified: true,
      readback: "plugin-only-ready",
    });
  } catch (error) {
    if (stateRoot && (removed.length > 0 || preserved.length > 0)) {
      await appendAudit(stateRoot, {
        timestamp: new Date().toISOString(),
        contract: LEGACY_SYMLINK_CONTRACT,
        operation: "remove-legacy-symlinks",
        status: "PARTIALLY_VERIFIED",
        code: error.code ?? "LEGACY_SYMLINK_MIGRATION_PARTIAL",
        planToken: TOKEN.test(options.planToken ?? "") ? options.planToken : null,
        removed: [...removed].sort(),
        preserved: preserved.map(({ name, preservedKind }) => ({ name, preservedKind })),
      }).catch(() => {});
    }
    return result(
      removed.length > 0 || preserved.length > 0 ? "PARTIALLY_VERIFIED" : error.status ?? "FAILED",
      removed.length > 0 || preserved.length > 0 ? error.code ?? "LEGACY_SYMLINK_MIGRATION_PARTIAL" : error.code ?? "LEGACY_SYMLINK_MIGRATION_FAILED",
      {
        removed: [...removed].sort(),
        preserved,
        ...(error.details ?? {}),
      },
    );
  } finally {
    if (lockPath) await rm(lockPath, { force: true }).catch(() => {});
    if (quarantineRoot && !quarantineTouched) {
      await rm(quarantineRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
}
