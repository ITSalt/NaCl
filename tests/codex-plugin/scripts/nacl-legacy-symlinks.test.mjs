import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  applyLegacySymlinkRemoval,
  planLegacySymlinkRemoval,
} from "../../../plugins/nacl/runtime/workflow-cli/legacy-symlinks.mjs";
import { createWorkflowToolGateway } from "../../../plugins/nacl/runtime/workflow-cli/workflow-tools.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pluginRoot = path.join(repoRoot, "plugins", "nacl");
const legacyRoot = path.join(repoRoot, "skills-for-codex");
const stateRelative = path.join(".nacl", "codex", "legacy-migration");
const execFileAsync = promisify(execFile);
const auditedLegacyBase = "d98f7399e7b9941341421321407ad27ee895d221";
const auditedLegacyHashes = new Map(Object.entries({
  "nacl-core": "2e4d35d3414d4483de4ff3430344f4a711d1fe99da78b906fcabcae251f766b2",
  "nacl-goal": "ff953ce107f15ee16553afc8fa2a32a44d4096a83dd46403f2a840d78d90158a",
  "nacl-migrate-sa": "1af1f87724ac5a2298578959ffa26d8d028eacf47bfa1bc612afb31fae4cfe65",
  "nacl-tl-core": "faab6033e052c4702e5a89b86b2e66893eb40a7522a9278c2b26fa89db632bdb",
}));

async function json(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

async function exists(filename) {
  try {
    await lstat(filename);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function hash(filename) {
  return createHash("sha256").update(await readFile(filename)).digest("hex");
}

async function makeHome(names, options = {}) {
  const home = await mkdtemp(path.join(os.tmpdir(), "nacl-legacy-migration-"));
  const skillsRoot = path.join(home, ".agents", "skills");
  await mkdir(skillsRoot, { recursive: true });
  for (const name of names) {
    const source = options.sources?.[name] ?? path.join(legacyRoot, name);
    await symlink(source, path.join(skillsRoot, name));
  }
  return { home, skillsRoot };
}

async function exactNames() {
  const index = await json(path.join(pluginRoot, "resources", "package-index.json"));
  return [...index.internalWorkflows].sort();
}

async function materializeAuditedLegacyTargets(root) {
  const sources = {};
  for (const [name, expectedHash] of auditedLegacyHashes) {
    const { stdout } = await execFileAsync("git", [
      "show",
      `${auditedLegacyBase}:skills-for-codex/${name}/SKILL.md`,
    ], { cwd: repoRoot, encoding: "buffer", maxBuffer: 1024 * 1024 });
    const target = path.join(root, name);
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "SKILL.md"), stdout);
    assert.equal(await hash(path.join(target, "SKILL.md")), expectedHash, name);
    sources[name] = target;
  }
  return sources;
}

test("actual 59-link audited-base installation is a recognized migration plan", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-audited-legacy-targets-"));
  const names = (await exactNames()).filter((name) => name !== "nacl-postmortem");
  const historicalSources = await materializeAuditedLegacyTargets(targetRoot);
  const { home } = await makeHome(names, { sources: historicalSources });
  try {
    const plan = await planLegacySymlinkRemoval({ home, pluginRoot });
    if (plan.status === "BLOCKED") {
      assert.equal(plan.entries.length, 55);
      assert.deepEqual(
        plan.blockers.map(({ name, reason }) => ({ name, reason })),
        [...auditedLegacyHashes.keys()].sort().map((name) => ({
          name,
          reason: "target-hash-unrecognized",
        })),
      );
    }
    assert.equal(plan.status, "VERIFIED");
    assert.equal(plan.code, "LEGACY_SYMLINK_PLAN_READY");
    assert.equal(plan.catalogSize, 60);
    assert.equal(plan.foundCount, 59);
    assert.equal(plan.entries.length, 59);
    assert.equal(plan.missingCount, 1);
    assert.deepEqual(plan.blockers, []);
    assert.deepEqual(
      plan.entries
        .filter((entry) => entry.acceptedGeneration === "audited-base-d98f7399")
        .map((entry) => [entry.name, entry.targetHash, entry.acceptedSourceCommit]),
      [...auditedLegacyHashes.entries()].sort().map(([name, targetHash]) => [
        name,
        targetHash,
        auditedLegacyBase,
      ]),
    );
    assert.equal(plan.confirmation, `REMOVE_LEGACY_NACL_SYMLINKS:${plan.planToken}`);
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("one-byte drift from an accepted audited-base target remains blocked", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-audited-legacy-drift-"));
  const historicalSources = await materializeAuditedLegacyTargets(targetRoot);
  const { home } = await makeHome(["nacl-core"], { sources: historicalSources });
  try {
    const skillPath = path.join(historicalSources["nacl-core"], "SKILL.md");
    const bytes = await readFile(skillPath);
    bytes[bytes.length - 1] ^= 1;
    await writeFile(skillPath, bytes);
    const plan = await planLegacySymlinkRemoval({ home, pluginRoot });
    assert.equal(plan.status, "BLOCKED");
    assert.equal(plan.code, "LEGACY_SYMLINK_PLAN_BLOCKED");
    assert.deepEqual(
      plan.blockers.map(({ name, reason }) => ({ name, reason })),
      [{ name: "nacl-core", reason: "target-hash-unrecognized" }],
    );
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("plan recognizes the exact 60 catalog with 21 accepted divergences and allows missing entries", async () => {
  const names = await exactNames();
  assert.equal(names.length, 60);
  const { home } = await makeHome(names);
  try {
    const plan = await planLegacySymlinkRemoval({ home, pluginRoot });
    assert.equal(plan.status, "VERIFIED");
    assert.equal(plan.code, "LEGACY_SYMLINK_PLAN_READY");
    assert.equal(plan.catalogSize, 60);
    assert.equal(plan.entries.length, 60);
    assert.equal(plan.missingCount, 0);
    assert.equal(plan.entries.filter((entry) => entry.parity === "deliberate-divergence").length, 21);
    assert.equal(plan.entries.filter((entry) => entry.parity === "byte-identical").length, 39);
    assert.equal(plan.confirmation, `REMOVE_LEGACY_NACL_SYMLINKS:${plan.planToken}`);

    await rm(path.join(home, ".agents", "skills", names[0]));
    const missing = await planLegacySymlinkRemoval({ home, pluginRoot });
    assert.equal(missing.status, "VERIFIED");
    assert.equal(missing.entries.length, 59);
    assert.equal(missing.missingCount, 1);
    assert.notEqual(missing.planToken, plan.planToken);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("confirmed apply removes only recognized links, preserves targets and unrelated state, and retries from a 0600 receipt", async () => {
  const names = await exactNames();
  const { home, skillsRoot } = await makeHome(names);
  const projectRoot = path.join(home, "project");
  const graphSentinel = path.join(home, ".nacl", "codex", "local-graph", "graph.json");
  const profileSentinel = path.join(projectRoot, ".codex", "agents", "user.toml");
  await mkdir(path.dirname(graphSentinel), { recursive: true });
  await mkdir(path.dirname(profileSentinel), { recursive: true });
  await writeFile(graphSentinel, "graph-user-data\n");
  await writeFile(profileSentinel, "profile-user-data\n");
  const sourceHashes = new Map();
  for (const name of names) sourceHashes.set(name, await hash(path.join(legacyRoot, name, "SKILL.md")));
  try {
    const plan = await planLegacySymlinkRemoval({ home, pluginRoot });
    const applied = await applyLegacySymlinkRemoval({
      home,
      pluginRoot,
      planToken: plan.planToken,
      confirmation: plan.confirmation,
    });
    assert.equal(applied.status, "VERIFIED");
    assert.equal(applied.code, "LEGACY_SYMLINKS_REMOVED");
    assert.deepEqual(applied.removed, names);
    for (const name of names) {
      assert.equal(await exists(path.join(skillsRoot, name)), false, name);
      assert.equal(await hash(path.join(legacyRoot, name, "SKILL.md")), sourceHashes.get(name), name);
    }
    assert.equal(await readFile(graphSentinel, "utf8"), "graph-user-data\n");
    assert.equal(await readFile(profileSentinel, "utf8"), "profile-user-data\n");
    const receiptState = await lstat(applied.receiptPath);
    assert.equal(receiptState.isFile(), true);
    assert.equal(receiptState.isSymbolicLink(), false);
    assert.equal(receiptState.mode & 0o777, 0o600);
    const receipt = await json(applied.receiptPath);
    assert.equal(receipt.planToken, plan.planToken);
    assert.deepEqual(receipt.removed, names);

    const retry = await applyLegacySymlinkRemoval({
      home,
      pluginRoot,
      planToken: plan.planToken,
      confirmation: plan.confirmation,
    });
    assert.equal(retry.status, "VERIFIED");
    assert.equal(retry.code, "LEGACY_SYMLINKS_ALREADY_REMOVED");
    assert.deepEqual(retry.removed, names);
    assert.equal(retry.receiptVerified, true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("wrong confirmation and stale token have zero migration side effects", async () => {
  const { home, skillsRoot } = await makeHome(["nacl-core"]);
  try {
    const plan = await planLegacySymlinkRemoval({ home, pluginRoot });
    const wrong = await applyLegacySymlinkRemoval({
      home,
      pluginRoot,
      planToken: plan.planToken,
      confirmation: "REMOVE_LEGACY_NACL_SYMLINKS:wrong",
    });
    assert.equal(wrong.status, "BLOCKED");
    assert.equal(wrong.code, "CONFIRMATION_REQUIRED");
    assert.equal((await lstat(path.join(skillsRoot, "nacl-core"))).isSymbolicLink(), true);
    assert.equal(await exists(path.join(home, stateRelative)), false);

    const stale = await applyLegacySymlinkRemoval({
      home,
      pluginRoot,
      planToken: "a".repeat(64),
      confirmation: `REMOVE_LEGACY_NACL_SYMLINKS:${"a".repeat(64)}`,
    });
    assert.equal(stale.status, "BLOCKED");
    assert.equal(stale.code, "LEGACY_SYMLINK_PLAN_STALE");
    assert.equal(await exists(path.join(home, stateRelative)), false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("unsafe audit and receipt symlinks block before removal without touching their targets", async (t) => {
  for (const kind of ["audit", "receipt"]) {
    await t.test(kind, async () => {
      const { home, skillsRoot } = await makeHome(["nacl-core"]);
      const plan = await planLegacySymlinkRemoval({ home, pluginRoot });
      const stateRoot = path.join(home, stateRelative);
      const sentinel = path.join(home, `${kind}-sentinel.txt`);
      await mkdir(stateRoot, { recursive: true, mode: 0o700 });
      await writeFile(sentinel, `${kind}-user-data\n`);
      if (kind === "audit") {
        await symlink(sentinel, path.join(stateRoot, "audit.jsonl"));
      } else {
        const receipts = path.join(stateRoot, "receipts");
        await mkdir(receipts, { mode: 0o700 });
        await symlink(sentinel, path.join(receipts, `${plan.planToken}.json`));
      }
      try {
        const applied = await applyLegacySymlinkRemoval({
          home,
          pluginRoot,
          planToken: plan.planToken,
          confirmation: plan.confirmation,
        });
        assert.equal(applied.status, "FAILED");
        assert.equal(
          applied.code,
          kind === "audit" ? "LEGACY_MIGRATION_AUDIT_FAILED" : "LEGACY_MIGRATION_RECEIPT_INVALID",
        );
        assert.equal((await lstat(path.join(skillsRoot, "nacl-core"))).isSymbolicLink(), true);
        assert.equal(await readFile(sentinel, "utf8"), `${kind}-user-data\n`);
      } finally {
        await rm(home, { recursive: true, force: true });
      }
    });
  }
});

test("unknown, broken, real, drifted, and symlink-root artifacts block before side effects", async (t) => {
  await t.test("unknown", async () => {
    const { home, skillsRoot } = await makeHome([]);
    try {
      await symlink(path.join(legacyRoot, "nacl-core"), path.join(skillsRoot, "nacl-unknown-extra"));
      const plan = await planLegacySymlinkRemoval({ home, pluginRoot });
      assert.equal(plan.status, "BLOCKED");
      assert.equal(plan.blockers[0].reason, "unknown-nacl-artifact");
      assert.equal(await exists(path.join(home, stateRelative)), false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  await t.test("broken", async () => {
    const { home, skillsRoot } = await makeHome([]);
    try {
      await symlink(path.join(home, "missing"), path.join(skillsRoot, "nacl-core"));
      const plan = await planLegacySymlinkRemoval({ home, pluginRoot });
      assert.equal(plan.status, "BLOCKED");
      assert.equal(plan.blockers[0].reason, "broken-or-unresolvable-link");
      assert.equal(await exists(path.join(home, stateRelative)), false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  for (const kind of ["file", "directory"]) {
    await t.test(kind, async () => {
      const { home, skillsRoot } = await makeHome([]);
      try {
        const candidate = path.join(skillsRoot, "nacl-core");
        if (kind === "file") await writeFile(candidate, "user-data\n");
        else await mkdir(candidate);
        const plan = await planLegacySymlinkRemoval({ home, pluginRoot });
        assert.equal(plan.status, "BLOCKED");
        assert.equal(plan.blockers[0].reason, "not-a-symlink");
        assert.equal(await exists(path.join(home, stateRelative)), false);
        assert.equal(await exists(candidate), true);
      } finally {
        await rm(home, { recursive: true, force: true });
      }
    });
  }

  await t.test("target drift", async () => {
    const { home, skillsRoot } = await makeHome(["nacl-core"]);
    try {
      const original = await readlink(path.join(skillsRoot, "nacl-core"));
      const drift = path.join(home, "drift-target");
      await mkdir(drift);
      await writeFile(path.join(drift, "SKILL.md"), "---\nname: nacl-core\ndescription: drift\n---\n");
      await rm(path.join(skillsRoot, "nacl-core"));
      await symlink(drift, path.join(skillsRoot, "nacl-core"));
      const plan = await planLegacySymlinkRemoval({ home, pluginRoot });
      assert.equal(plan.status, "BLOCKED");
      assert.equal(plan.blockers[0].reason, "target-hash-unrecognized");
      assert.equal(await exists(path.join(home, stateRelative)), false);
      assert.notEqual(await readlink(path.join(skillsRoot, "nacl-core")), original);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  await t.test("symlinked skills root", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "nacl-legacy-root-link-"));
    try {
      const actual = path.join(home, "actual-skills");
      await mkdir(path.join(home, ".agents"), { recursive: true });
      await mkdir(actual);
      await symlink(actual, path.join(home, ".agents", "skills"));
      const plan = await planLegacySymlinkRemoval({ home, pluginRoot });
      assert.equal(plan.status, "BLOCKED");
      assert.equal(plan.code, "LEGACY_SKILLS_ROOT_UNSAFE");
      assert.equal(await exists(path.join(home, stateRelative)), false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

for (const racedKind of ["file", "directory"]) {
  test(`concurrent swap to ${racedKind} is quarantined and never deleted`, async () => {
    const { home, skillsRoot } = await makeHome(["nacl-core"]);
    const candidate = path.join(skillsRoot, "nacl-core");
    try {
      const plan = await planLegacySymlinkRemoval({ home, pluginRoot });
      const applied = await applyLegacySymlinkRemoval({
        home,
        pluginRoot,
        planToken: plan.planToken,
        confirmation: plan.confirmation,
        beforeQuarantineRename: async () => {
          await rm(candidate);
          if (racedKind === "file") await writeFile(candidate, "raced-user-file\n");
          else {
            await mkdir(candidate);
            await writeFile(path.join(candidate, "user.txt"), "raced-user-directory\n");
          }
        },
        afterQuarantineRename: racedKind === "file" ? async () => {
          await writeFile(candidate, "new-concurrent-writer\n");
        } : undefined,
      });
      assert.equal(applied.status, "PARTIALLY_VERIFIED");
      assert.equal(applied.code, "LEGACY_SYMLINK_RACE_PRESERVED");
      assert.equal(applied.preserved.length, 1);
      const preservedPath = applied.preserved[0].preservedPath;
      const preservedState = await lstat(preservedPath);
      assert.equal(preservedState.isSymbolicLink(), false);
      if (racedKind === "file") {
        assert.equal(await readFile(preservedPath, "utf8"), "raced-user-file\n");
        assert.equal(await readFile(candidate, "utf8"), "new-concurrent-writer\n");
      } else {
        assert.equal(await readFile(path.join(preservedPath, "user.txt"), "utf8"), "raced-user-directory\n");
      }
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
}

test("target drift after locked preflight preserves the symlink in quarantine", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-legacy-target-"));
  const target = path.join(targetRoot, "nacl-core");
  await cp(path.join(legacyRoot, "nacl-core"), target, { recursive: true });
  const { home } = await makeHome(["nacl-core"], { sources: { "nacl-core": target } });
  try {
    const plan = await planLegacySymlinkRemoval({ home, pluginRoot });
    const applied = await applyLegacySymlinkRemoval({
      home,
      pluginRoot,
      planToken: plan.planToken,
      confirmation: plan.confirmation,
      beforeQuarantineRename: async () => {
        await writeFile(path.join(target, "SKILL.md"), "---\nname: nacl-core\ndescription: concurrent drift\n---\n");
      },
    });
    assert.equal(applied.status, "PARTIALLY_VERIFIED");
    assert.equal(applied.code, "LEGACY_TARGET_DRIFT_PRESERVED");
    assert.equal(applied.preserved.length, 1);
    assert.equal((await lstat(applied.preserved[0].preservedPath)).isSymbolicLink(), true);
    assert.equal(await readFile(path.join(target, "SKILL.md"), "utf8"), "---\nname: nacl-core\ndescription: concurrent drift\n---\n");
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("workflow gateway bypasses installation conflict only for the two migration tools", async () => {
  const { home } = await makeHome(["nacl-core"]);
  try {
    const preflightCalls = [];
    const gateway = createWorkflowToolGateway({
      home,
      pluginRoot,
      preflight: async ({ name }) => {
        preflightCalls.push(name);
        const error = new Error("conflict");
        error.code = "INSTALLATION_CONFLICT";
        error.status = "FAILED";
        throw error;
      },
      lifecycle: { doctor: async () => ({ status: "VERIFIED" }) },
    });
    const plan = await gateway.callTool("nacl_legacy_symlinks_plan", {});
    assert.equal(plan.status, "VERIFIED");
    const applied = await gateway.callTool("nacl_legacy_symlinks_apply", {
      plan_token: plan.planToken,
      confirmation: plan.confirmation,
    });
    assert.equal(applied.status, "VERIFIED");
    const blocked = await gateway.callTool("nacl_graph_local_doctor", {
      project_id: "project-a",
      project_root: home,
    });
    assert.equal(blocked.status, "FAILED");
    assert.equal(blocked.code, "INSTALLATION_CONFLICT");
    assert.deepEqual(preflightCalls, ["nacl_graph_local_doctor"]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
