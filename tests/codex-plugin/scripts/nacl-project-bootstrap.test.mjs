import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const bootstrap = path.join(repoRoot, "codex-plugin-src", "package", "resources", "bootstrap");
const planner = path.join(bootstrap, "plan-project-creation.mjs");
const applier = path.join(bootstrap, "apply-project-creation.mjs");
const identity = { ...process.env, GIT_AUTHOR_NAME: "NaCl Test", GIT_AUTHOR_EMAIL: "nacl-test@example.invalid", GIT_COMMITTER_NAME: "NaCl Test", GIT_COMMITTER_EMAIL: "nacl-test@example.invalid" };

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: identity, timeout: 30_000 });
}

function json(result) {
  return JSON.parse((result.status === 0 ? result.stdout : result.stderr).trim());
}

function planArgs(root, name = "PROGrapher") {
  return ["--project-root", root, "--project-name", name, "--project-description", "Create short vertical videos.", "--tech-stack", "Node.js Fastify"];
}

test("project bootstrap plans without writes, then creates config, AGENTS, Git, and a first commit", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nacl-project-bootstrap-"));
  const project = path.join(temporary, "project");
  await mkdir(project);
  try {
    const planned = run(planner, planArgs(project));
    assert.equal(planned.status, 0, planned.stderr);
    const plan = json(planned);
    assert.equal(plan.status, "VERIFIED");
    assert.equal(plan.code, "PROJECT_CREATION_PLAN_READY");
    assert.equal(plan.agents.action, "create");
    await assert.rejects(readFile(path.join(project, "config.yaml")), { code: "ENOENT" });

    const denied = run(applier, [...planArgs(project), "--plan-hash", plan.planHash, "--confirmation", "CREATE_NACL_PROJECT:wrong"]);
    assert.notEqual(denied.status, 0);
    assert.equal(json(denied).code, "CONFIRMATION_REQUIRED");

    const applied = run(applier, [...planArgs(project), "--plan-hash", plan.planHash, "--confirmation", plan.confirmation]);
    assert.equal(applied.status, 0, applied.stderr);
    const result = json(applied);
    assert.equal(result.status, "VERIFIED");
    assert.deepEqual(result.created, ["config.yaml", "AGENTS.md"]);
    assert.match(await readFile(path.join(project, "config.yaml"), "utf8"), new RegExp(`id: "${result.projectId}"`));
    const agents = await readFile(path.join(project, "AGENTS.md"), "utf8");
    assert.match(agents, /Keep this file concise and repository-specific/);
    assert.match(agents, /closer nested `AGENTS\.md`/);
    const log = spawnSync("git", ["log", "--format=%s", "-1"], { cwd: project, encoding: "utf8" });
    assert.equal(log.status, 0, log.stderr);
    assert.equal(log.stdout.trim(), "Initialize NaCl project");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("project bootstrap preserves existing AGENTS and blocks a non-Git directory with files", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nacl-project-bootstrap-existing-"));
  const project = path.join(temporary, "project");
  await mkdir(project);
  try {
    await writeFile(path.join(project, "notes.txt"), "do not adopt\n");
    const blocked = run(planner, planArgs(project, "Existing files"));
    assert.notEqual(blocked.status, 0);
    assert.equal(json(blocked).code, "PROJECT_ROOT_NOT_EMPTY");
    assert.equal(await readFile(path.join(project, "notes.txt"), "utf8"), "do not adopt\n");

    const gitInit = spawnSync("git", ["init", "-q"], { cwd: project, encoding: "utf8" });
    assert.equal(gitInit.status, 0, gitInit.stderr);
    const originalAgents = "# Existing guidance\n\nKeep this intact.\n";
    await writeFile(path.join(project, "AGENTS.md"), originalAgents);
    const planResult = run(planner, planArgs(project, "Existing files"));
    assert.equal(planResult.status, 0, planResult.stderr);
    const plan = json(planResult);
    assert.equal(plan.agents.action, "preserve");
    const applyResult = run(applier, [...planArgs(project, "Existing files"), "--plan-hash", plan.planHash, "--confirmation", plan.confirmation]);
    assert.equal(applyResult.status, 0, applyResult.stderr);
    assert.equal(await readFile(path.join(project, "AGENTS.md"), "utf8"), originalAgents);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
