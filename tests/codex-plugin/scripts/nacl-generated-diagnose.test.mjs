import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("generated nacl-diagnose closes its TOML parser and diagnoses without graph initialization", async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nacl-generated-diagnose-")));
  try {
    const env = { PATH: path.dirname(process.execPath) };
    for (const [key, directory] of Object.entries({ HOME: "home", XDG_CONFIG_HOME: "config", XDG_CACHE_HOME: "cache", XDG_DATA_HOME: "data", TMPDIR: "tmp" })) {
      env[key] = path.join(root, directory);
      await mkdir(env[key]);
    }
    env.TMP = env.TEMP = env.TMPDIR;
    env.GIT_CONFIG_NOSYSTEM = "1";
    env.GIT_CONFIG_GLOBAL = "/dev/null";
    const bundle = path.join(root, "bundle"); // New, nonexistent, outside the repository.
    const project = path.join(root, "project");
    await mkdir(project);
    // Child permissions are explicit: the parent's Node permissions do not propagate.
    const run = (script, args, { build = false } = {}) => {
      const permissions = ["--permission", `--allow-fs-read=${root}`];
      if (build) permissions.push(`--allow-fs-read=${repoRoot}`, `--allow-fs-write=${root}`);
      const result = spawnSync(process.execPath, [...permissions, script, ...args], { cwd: project, env, encoding: "utf8" });
      assert.ifError(result.error);
      assert.equal(result.signal, null, result.stderr);
      return result;
    };
    const built = run(path.join(repoRoot, "scripts", "build-codex-skills-only.mjs"), ["--output", bundle], { build: true });
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    const bootstrap = path.join(bundle, "skills", "nacl-diagnose", "resources", "bootstrap");
    const diagnose = () => {
      const result = run(path.join(bootstrap, "plan-project-graph.mjs"), ["--diagnose-only", "--project-root", project]);
      // Before the fix this must fail here with MODULE_NOT_FOUND, not at an existence check.
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      const document = JSON.parse(result.stdout);
      assert.equal(document.status, "NOT_RUN");
      assert.equal(document.code, "PROJECT_MCP_NOT_CONFIGURED");
      assert.equal(document.initializationState, "UNINITIALIZED");
      assert.equal(document.canonicalProjectRoot, project);
      assert.equal(document.mutation, "NONE");
      assert.equal(document.network, "NONE");
      assert.equal(document.docker, "NOT_INSPECTED");
      return document;
    };
    const empty = diagnose();
    assert.ok(empty.evidence.length > 0);
    assert.ok(empty.evidence.every(({ state }) => state === "ABSENT"));
    assert.deepEqual(await readdir(project), []);

    // Exercise TOML parsing too, while remaining an uninitialized project.
    await mkdir(path.join(project, ".codex"));
    const config = 'model = "synthetic-model"\n';
    await writeFile(path.join(project, ".codex", "config.toml"), config);
    const configured = diagnose();
    assert.equal(configured.evidence[0].sha256, digest(config));
    assert.equal(await readFile(path.join(project, ".codex", "config.toml"), "utf8"), config);
    assert.deepEqual(await readdir(project), [".codex"]);
    assert.deepEqual(await readdir(path.join(project, ".codex")), ["config.toml"]);

    for (const name of ["smol-toml-1.7.0.cjs", "smol-toml-LICENSE.txt", "PROVENANCE.md"]) {
      assert.deepEqual(await readFile(path.join(bootstrap, "vendor", name)), await readFile(path.join(repoRoot, "plugins", "nacl", "resources", "bootstrap", "vendor", name)), name);
    }
    assert.equal(digest(await readFile(path.join(bootstrap, "vendor", "smol-toml-1.7.0.cjs"))), "173006d8b690034d636c1af4dc6836db8dc6a708bcd4fea90c8d04ea250afa7d");
    assert.equal(digest(await readFile(path.join(bootstrap, "vendor", "smol-toml-LICENSE.txt"))), "fa5659948374d4f555594f47f6da073b40dc503e921aeeece30df4362b3051a5");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
