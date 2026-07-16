import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AGENT_PROFILE_FILENAMES,
  applyAgentProfiles,
  planAgentProfiles,
  validateAgentProfileTemplates,
} from "../../../plugins/nacl/runtime/workflow-cli/agent-profiles.mjs";

async function projectFixture(prefix = "nacl-agent-profiles-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test("packaged agent templates match the required standalone Codex schema", async () => {
  const result = await validateAgentProfileTemplates();
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.code, "AGENT_PROFILE_TEMPLATES_VALID");
  assert.equal(result.count, 5);
  assert.deepEqual(result.profiles.map((entry) => entry.filename), AGENT_PROFILE_FILENAMES);
});

test("fresh plan, confirmed apply, read-back, and exact reinstall are deterministic", async () => {
  const root = await projectFixture();
  try {
    const unrelated = path.join(root, "keep.txt");
    await writeFile(unrelated, "keep\n");
    const plan = await planAgentProfiles({ projectRoot: root });
    assert.equal(plan.status, "VERIFIED");
    assert.equal(plan.code, "AGENT_PROFILE_PLAN_READY");
    assert.ok(plan.entries.every((entry) => entry.action === "create"));

    const declined = await applyAgentProfiles({
      projectRoot: root,
      planToken: plan.planToken,
      confirmation: "DECLINED",
    });
    assert.equal(declined.status, "BLOCKED");
    assert.equal(declined.code, "CONFIRMATION_REQUIRED");
    await assert.rejects(lstat(path.join(root, ".codex")), { code: "ENOENT" });

    const installed = await applyAgentProfiles({
      projectRoot: root,
      planToken: plan.planToken,
      confirmation: plan.confirmation,
    });
    assert.equal(installed.status, "VERIFIED");
    assert.equal(installed.code, "AGENT_PROFILES_INSTALLED");
    assert.deepEqual(installed.changed, AGENT_PROFILE_FILENAMES);
    for (const entry of installed.entries) {
      assert.equal(entry.action, "unchanged");
      assert.equal((await lstat(entry.destination)).mode & 0o777, 0o600);
    }
    assert.equal(await readFile(unrelated, "utf8"), "keep\n");

    const repeatPlan = await planAgentProfiles({ projectRoot: root });
    const repeated = await applyAgentProfiles({
      projectRoot: root,
      planToken: repeatPlan.planToken,
      confirmation: repeatPlan.confirmation,
    });
    assert.equal(repeated.status, "VERIFIED");
    assert.equal(repeated.code, "AGENT_PROFILES_ALREADY_CURRENT");
    assert.deepEqual(repeated.changed, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("differing files are always blocked and are never overwritten", async () => {
  const root = await projectFixture();
  try {
    const agents = path.join(root, ".codex", "agents");
    await mkdir(agents, { recursive: true });
    const conflictPath = path.join(agents, AGENT_PROFILE_FILENAMES[0]);
    await writeFile(conflictPath, "name = \"user-owned\"\n");
    const plan = await planAgentProfiles({ projectRoot: root });
    assert.equal(plan.status, "BLOCKED");
    assert.equal(plan.code, "AGENT_PROFILE_CONFLICT");
    assert.equal(plan.entries.filter((entry) => entry.action === "conflict").length, 1);

    const ordinary = await applyAgentProfiles({
      projectRoot: root,
      planToken: plan.planToken,
      confirmation: `INSTALL_AGENT_PROFILES:${plan.planToken}`,
    });
    assert.equal(ordinary.status, "BLOCKED");
    assert.equal(ordinary.code, "AGENT_PROFILE_CONFLICT");
    assert.equal("replacementConfirmation" in plan, false);
    assert.equal("expectedCurrentHashes" in plan, false);
    assert.equal(await readFile(conflictPath, "utf8"), "name = \"user-owned\"\n");
    await assert.rejects(lstat(path.join(agents, AGENT_PROFILE_FILENAMES[1])), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a concurrent final-link writer wins without overwrite, data loss, or temp residue", async () => {
  const root = await projectFixture();
  try {
    const plan = await planAgentProfiles({ projectRoot: root });
    const conflictPath = plan.entries[0].destination;
    let hookCalls = 0;
    const outcome = await applyAgentProfiles({
      projectRoot: root,
      planToken: plan.planToken,
      confirmation: plan.confirmation,
      beforeCreateLink: async ({ destination }) => {
        if (destination !== conflictPath) return;
        hookCalls += 1;
        await writeFile(destination, "external-writer\n", { flag: "wx" });
      },
    });
    assert.equal(hookCalls, 1);
    assert.equal(outcome.status, "BLOCKED");
    assert.equal(outcome.code, "AGENT_PROFILE_TOCTOU_CONFLICT");
    assert.equal(await readFile(conflictPath, "utf8"), "external-writer\n");
    const agents = path.dirname(conflictPath);
    assert.deepEqual(await readdir(agents), [AGENT_PROFILE_FILENAMES[0]]);
  } finally {
    const agents = path.join(root, ".codex", "agents");
    const entries = await readdir(agents).catch(() => []);
    assert.equal(entries.some((entry) => entry.endsWith(".tmp") || entry === ".nacl-agent-profiles.lock"), false);
    await rm(root, { recursive: true, force: true });
  }
});

test("stale plans, symlinked roots, symlinked destinations, and non-files fail closed", async () => {
  const root = await projectFixture();
  const parent = await projectFixture("nacl-agent-profile-links-");
  try {
    const plan = await planAgentProfiles({ projectRoot: root });
    await mkdir(path.join(root, ".codex", "agents"), { recursive: true });
    await writeFile(path.join(root, ".codex", "agents", AGENT_PROFILE_FILENAMES[0]), "changed\n");
    const stale = await applyAgentProfiles({
      projectRoot: root,
      planToken: plan.planToken,
      confirmation: plan.confirmation,
    });
    assert.equal(stale.status, "BLOCKED");
    assert.equal(stale.code, "AGENT_PROFILE_CONFLICT");

    const rootLink = path.join(parent, "project-link");
    await symlink(root, rootLink);
    const symlinkRoot = await planAgentProfiles({ projectRoot: rootLink });
    assert.equal(symlinkRoot.status, "FAILED");
    assert.equal(symlinkRoot.code, "PROJECT_ROOT_INVALID");

    const unsafeRoot = path.join(parent, "unsafe-project");
    const outside = path.join(parent, "outside-agents");
    await mkdir(path.join(unsafeRoot, ".codex"), { recursive: true });
    await mkdir(outside);
    await symlink(outside, path.join(unsafeRoot, ".codex", "agents"));
    const symlinkDestination = await planAgentProfiles({ projectRoot: unsafeRoot });
    assert.equal(symlinkDestination.status, "FAILED");
    assert.equal(symlinkDestination.code, "AGENT_PROFILE_DESTINATION_UNSAFE");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(parent, { recursive: true, force: true });
  }
});

test("template mutation and forbidden model fields fail schema validation", async () => {
  const templateRoot = await projectFixture("nacl-agent-template-invalid-");
  try {
    for (const filename of AGENT_PROFILE_FILENAMES) {
      const name = filename.slice(0, -5);
      await writeFile(
        path.join(templateRoot, filename),
        `name = "${name}"\ndescription = "A sufficiently long agent description."\ndeveloper_instructions = "A sufficiently long set of project-safe developer instructions for this test."\n`,
      );
    }
    await chmod(path.join(templateRoot, AGENT_PROFILE_FILENAMES[0]), 0o600);
    await writeFile(
      path.join(templateRoot, AGENT_PROFILE_FILENAMES[0]),
      `name = "nacl-business-analyst"\ndescription = "A sufficiently long agent description."\ndeveloper_instructions = "A sufficiently long set of project-safe developer instructions for this test."\nmodel = "forbidden"\n`,
    );
    const invalid = await validateAgentProfileTemplates({ templateRoot });
    assert.equal(invalid.status, "FAILED");
    assert.equal(invalid.code, "AGENT_PROFILE_TEMPLATE_INVALID");
  } finally {
    await rm(templateRoot, { recursive: true, force: true });
  }
});
