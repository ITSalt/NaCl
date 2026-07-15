import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deriveWorkerId } from "../../../plugins/nacl/runtime/graph-gateway/identity.mjs";
import { diagnoseInstallation } from "../../../plugins/nacl/scripts/installation-doctor-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pluginRoot = path.join(repoRoot, "plugins", "nacl");
const serverPath = path.join(pluginRoot, "scripts", "nacl-package-mcp.mjs");
const legacyInstaller = path.join(
  repoRoot,
  "skills-for-codex",
  "scripts",
  "install-user-symlinks.sh",
);
const fallbackPath = path.join(
  repoRoot,
  "skills-for-codex",
  "nacl-core",
  "scripts",
  "nacl-installation-fallback.mjs",
);

function graphIdentity() {
  const value = {
    principal_id: "principal-package-server-test",
    client_id: "client-package-server-test",
    session_id: "session-package-server-test",
    worktree_id: "worktree-package-server-test",
    branch: "codex/package-server-test",
    base_sha: "c".repeat(40),
  };
  return {
    ...value,
    worker_id: deriveWorkerId({
      principal_id: value.principal_id,
      client_id: value.client_id,
      session_id: value.session_id,
    }),
  };
}

function runProtocol(root, home, requests) {
  const result = spawnSync("node", ["./scripts/nacl-package-mcp.mjs"], {
    cwd: root,
    env: { PATH: process.env.PATH, HOME: home },
    input: `${requests.map((request) => JSON.stringify(request)).join("\n")}\n`,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  return result.stdout.trim().split("\n").filter(Boolean).map(JSON.parse);
}

async function makeLegacy(home, name = "nacl-core") {
  const source = path.join(home, "legacy-source", name);
  const destination = path.join(home, ".agents", "skills", name);
  await mkdir(source, { recursive: true });
  await writeFile(
    path.join(source, "SKILL.md"),
    `---\nname: ${name}\ndescription: Valid isolated legacy fixture.\n---\n\n# ${name}\n`,
  );
  await mkdir(path.dirname(destination), { recursive: true });
  await symlink(source, destination);
}

async function makeRecognizedLegacy(home, name = "nacl-core") {
  const destination = path.join(home, ".agents", "skills", name);
  await mkdir(path.dirname(destination), { recursive: true });
  await symlink(path.join(repoRoot, "skills-for-codex", name), destination);
  return destination;
}

async function fakeCodexBin(root) {
  const bin = path.join(root, "bin");
  const executable = path.join(bin, "codex");
  await mkdir(bin, { recursive: true });
  await writeFile(
    executable,
    "#!/bin/sh\n" +
      "test \"$*\" = \"plugin list --json\" || exit 64\n" +
      "printf '%s\\n' \"$NACL_FAKE_CODEX_OUTPUT\"\n" +
      "exit \"${NACL_FAKE_CODEX_EXIT:-0}\"\n",
  );
  await chmod(executable, 0o755);
  return bin;
}

function runFallback(bin, catalog, exitCode = 0, options = {}) {
  const result = spawnSync(process.execPath, [options.helperPath ?? fallbackPath], {
    encoding: "utf8",
    env: {
      HOME: options.home ?? os.tmpdir(),
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      NACL_FAKE_CODEX_OUTPUT: catalog,
      NACL_FAKE_CODEX_EXIT: String(exitCode),
    },
  });
  return { ...result, diagnosis: JSON.parse(result.stdout) };
}

test("MCP lists the installation doctor and split graph tools with standard metadata", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "nacl-doctor-home-"));
  try {
    const responses = runProtocol(pluginRoot, home, [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18" },
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: { _meta: { progressToken: "list" } },
      },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "nacl_installation_doctor",
          arguments: {},
          _meta: { progressToken: "call" },
        },
      },
    ]);
    assert.equal(responses.length, 3);
    assert.equal(responses[0].result.serverInfo.name, "nacl-graph-gateway");
    assert.deepEqual(responses[1].result.tools.map((tool) => tool.name), [
      "nacl_installation_doctor",
      "nacl_project_resolve",
      "nacl_project_migrate_identity",
      "nacl_project_register_root",
      "nacl_legacy_symlinks_plan",
      "nacl_legacy_symlinks_apply",
      "nacl_graph_local_init",
      "nacl_graph_local_start",
      "nacl_graph_local_doctor",
      "nacl_agent_profiles_plan",
      "nacl_agent_profiles_apply",
      "nacl_graph_health",
      "nacl_graph_schema_status",
      "nacl_graph_read",
      "nacl_graph_apply_migrations",
      "nacl_graph_write_canary",
      "nacl_graph_derive_worker_identity",
      "nacl_graph_claim_resource",
      "nacl_graph_heartbeat_resource",
      "nacl_graph_release_resource",
      "nacl_graph_handoff_resource",
      "nacl_graph_mutate_resource",
      "nacl_graph_allocate_id",
      "nacl_graph_bootstrap_admin",
      "nacl_graph_set_membership",
    ]);
    assert.deepEqual(
      responses[1].result.tools.slice(1).map((tool) => tool.annotations.readOnlyHint),
      [true, false, false, true, false, false, false, true, true, false, true, true, true, false, false, true, false, false, false, false, false, false, false, false],
    );
    const diagnosis = responses[2].result.structuredContent;
    assert.equal(diagnosis.contract, "nacl-codex-installation-v1");
    assert.equal(diagnosis.mode, "plugin-only");
    assert.equal(diagnosis.status, "VERIFIED");
    assert.equal(diagnosis.pluginVersion, responses[0].result.serverInfo.version);
    assert.equal(responses[2].result.isError, false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("graph tool validation fails closed before lifecycle resolution", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "nacl-gateway-invalid-"));
  try {
    const [response] = runProtocol(pluginRoot, home, [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "nacl_graph_health",
          arguments: { project_id: "?", project_root: path.join(os.tmpdir(), "project"), ...graphIdentity() },
        },
      },
    ]);
    assert.equal(response.result.structuredContent.contract, "nacl-graph-gateway-v1");
    assert.equal(response.result.structuredContent.status, "FAILED");
    assert.equal(response.result.structuredContent.code, "INVALID_PROJECT_ID");
    assert.equal(response.result.isError, true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("doctor distinguishes plugin-only, legacy-only, both, and neither", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-doctor-modes-"));
  try {
    const pluginOnlyHome = path.join(root, "plugin-only");
    const legacyOnlyHome = path.join(root, "legacy-only");
    const bothHome = path.join(root, "both");
    const neitherHome = path.join(root, "neither");
    await Promise.all([
      mkdir(pluginOnlyHome),
      mkdir(legacyOnlyHome),
      mkdir(bothHome),
      mkdir(neitherHome),
    ]);
    await makeLegacy(legacyOnlyHome);
    await makeLegacy(bothHome);
    const missingPlugin = path.join(root, "missing-plugin");

    const results = await Promise.all([
      diagnoseInstallation({ pluginRoot, home: pluginOnlyHome }),
      diagnoseInstallation({ pluginRoot: missingPlugin, home: legacyOnlyHome }),
      diagnoseInstallation({ pluginRoot, home: bothHome }),
      diagnoseInstallation({ pluginRoot: missingPlugin, home: neitherHome }),
    ]);
    assert.deepEqual(results.map((result) => result.mode), [
      "plugin-only",
      "legacy-only",
      "both",
      "neither",
    ]);
    assert.deepEqual(results.map((result) => result.status), [
      "VERIFIED",
      "VERIFIED",
      "FAILED",
      "BLOCKED",
    ]);
    assert.match(results[2].guidance, /remove the nacl plugin or remove only the legacy/);
    assert.match(results[3].guidance, /Install NaCl/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor fails closed for empty, broken, and malformed legacy artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-doctor-invalid-legacy-"));
  try {
    const emptyHome = path.join(root, "empty");
    const brokenHome = path.join(root, "broken");
    const malformedHome = path.join(root, "malformed");
    await Promise.all([
      mkdir(path.join(emptyHome, ".agents", "skills", "nacl-empty"), { recursive: true }),
      mkdir(path.join(brokenHome, ".agents", "skills"), { recursive: true }),
      mkdir(malformedHome, { recursive: true }),
    ]);
    await symlink(
      path.join(brokenHome, "missing-target"),
      path.join(brokenHome, ".agents", "skills", "nacl-broken"),
    );
    await makeLegacy(malformedHome, "nacl-wrong");
    await writeFile(
      path.join(malformedHome, "legacy-source", "nacl-wrong", "SKILL.md"),
      "---\nname: nacl-other\ndescription: Wrong fixture.\n---\n",
    );

    const missingPlugin = path.join(root, "missing-plugin");
    const results = await Promise.all([
      diagnoseInstallation({ pluginRoot: missingPlugin, home: emptyHome }),
      diagnoseInstallation({ pluginRoot: missingPlugin, home: brokenHome }),
      diagnoseInstallation({ pluginRoot: missingPlugin, home: malformedHome }),
    ]);
    assert.deepEqual(results.map((result) => result.status), ["FAILED", "FAILED", "FAILED"]);
    assert.deepEqual(results.map((result) => result.mode), [
      "invalid-legacy-artifacts",
      "invalid-legacy-artifacts",
      "invalid-legacy-artifacts",
    ]);
    assert.deepEqual(results.map((result) => result.invalidLegacyEntries[0].reason), [
      "skill-missing-or-unreadable",
      "target-unresolvable",
      "skill-frontmatter-name-mismatch",
    ]);
    assert.deepEqual(results.map((result) => result.legacyPresent), [false, false, false]);
    assert.deepEqual(results.map((result) => result.legacyArtifactPresent), [true, true, true]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy fallback fails when the plugin is enabled and verifies only proven absence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-fallback-catalog-"));
  try {
    const bin = await fakeCodexBin(root);
    const enabled = runFallback(
      bin,
      JSON.stringify({ installed: [{ pluginId: "nacl@personal", enabled: true }] }),
    );
    assert.equal(enabled.status, 1);
    assert.equal(enabled.diagnosis.status, "FAILED");
    assert.equal(enabled.diagnosis.mode, "plugin-active-doctor-unavailable");

    const absent = runFallback(
      bin,
      JSON.stringify({ installed: [{ pluginId: "other@personal", enabled: true }] }),
    );
    assert.equal(absent.status, 0);
    assert.equal(absent.diagnosis.status, "VERIFIED");
    assert.equal(absent.diagnosis.mode, "legacy-only");

    const disabled = runFallback(
      bin,
      JSON.stringify({ installed: [{ pluginId: "nacl@personal", enabled: false }] }),
    );
    assert.equal(disabled.status, 2);
    assert.equal(disabled.diagnosis.status, "BLOCKED");

    const unavailable = runFallback(bin, "{}", 1);
    assert.equal(unavailable.status, 2);
    assert.equal(unavailable.diagnosis.reason, "codex-plugin-list-failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy fallback executes through an installer-created user symlink", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-fallback-symlink-"));
  try {
    const home = path.join(root, "home");
    await mkdir(home);
    const install = spawnSync("sh", [legacyInstaller], {
      encoding: "utf8",
      env: { HOME: home, PATH: process.env.PATH ?? "" },
    });
    assert.equal(install.status, 0, `${install.stdout}\n${install.stderr}`);
    assert.match(install.stdout, /Summary: created=60 already_present=0 blocked=0/);

    const helperPath = path.join(
      home,
      ".agents",
      "skills",
      "nacl-core",
      "scripts",
      "nacl-installation-fallback.mjs",
    );
    const bin = await fakeCodexBin(root);
    const scenarios = [
      {
        catalog: JSON.stringify({ installed: [] }),
        expectedExit: 0,
        expectedStatus: "VERIFIED",
        expectedMode: "legacy-only",
      },
      {
        catalog: JSON.stringify({ installed: [{ pluginId: "nacl@personal", enabled: true }] }),
        expectedExit: 1,
        expectedStatus: "FAILED",
        expectedMode: "plugin-active-doctor-unavailable",
      },
      {
        catalog: "{}",
        catalogExit: 1,
        expectedExit: 2,
        expectedStatus: "BLOCKED",
        expectedMode: "catalog-unavailable",
      },
    ];
    for (const scenario of scenarios) {
      const result = runFallback(bin, scenario.catalog, scenario.catalogExit ?? 0, {
        helperPath,
        home,
      });
      assert.equal(result.status, scenario.expectedExit, result.stderr);
      assert.notEqual(result.stdout.trim(), "", "symlink invocation must emit structured output");
      assert.equal(result.stderr, "");
      assert.equal(result.diagnosis.status, scenario.expectedStatus);
      assert.equal(result.diagnosis.mode, scenario.expectedMode);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy fallback fails closed when a direct entrypoint cannot be canonicalized", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-fallback-unresolved-"));
  try {
    const unresolved = path.join(root, "nacl-installation-fallback.mjs");
    const program = [
      `process.argv[1] = ${JSON.stringify(unresolved)};`,
      `await import(${JSON.stringify(pathToFileURL(fallbackPath).href)});`,
    ].join("\n");
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", program],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stderr, "");
    assert.notEqual(result.stdout.trim(), "");
    const diagnosis = JSON.parse(result.stdout);
    assert.equal(diagnosis.status, "BLOCKED");
    assert.equal(diagnosis.reason, "entrypoint-unresolvable");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("double installation fails closed through the MCP result", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "nacl-doctor-conflict-"));
  try {
    await makeLegacy(home, "nacl-init");
    const [response] = runProtocol(pluginRoot, home, [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "nacl_installation_doctor", arguments: {} },
      },
    ]);
    assert.equal(response.result.structuredContent.mode, "both");
    assert.equal(response.result.structuredContent.status, "FAILED");
    assert.equal(response.result.isError, true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("double installation also blocks direct graph tool calls", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "nacl-gateway-conflict-"));
  try {
    await makeLegacy(home, "nacl-init");
    const [response] = runProtocol(pluginRoot, home, [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "nacl_graph_health",
          arguments: { project_id: "project-a", project_root: path.join(os.tmpdir(), "project-a"), ...graphIdentity() },
        },
      },
    ]);
    assert.equal(response.result.structuredContent.status, "FAILED");
    assert.equal(response.result.structuredContent.code, "INSTALLATION_CONFLICT");
    assert.equal(response.result.isError, true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("double installation permits only exact legacy symlink recovery and reads back plugin-only", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "nacl-legacy-recovery-"));
  try {
    const legacyPath = await makeRecognizedLegacy(home);
    const beforeTarget = await readFile(path.join(repoRoot, "skills-for-codex", "nacl-core", "SKILL.md"));
    const responses = runProtocol(pluginRoot, home, [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "nacl_legacy_symlinks_plan", arguments: {} },
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "nacl_graph_local_doctor",
          arguments: { project_id: "legacy-recovery", project_root: home },
        },
      },
    ]);
    const plan = responses.find((response) => response.id === 1).result.structuredContent;
    const blocked = responses.find((response) => response.id === 2).result.structuredContent;
    assert.equal(plan.status, "VERIFIED");
    assert.equal(plan.code, "LEGACY_SYMLINK_PLAN_READY");
    assert.equal(plan.entries.length, 1);
    assert.equal(blocked.status, "FAILED");
    assert.equal(blocked.code, "INSTALLATION_CONFLICT");

    const [applyResponse] = runProtocol(pluginRoot, home, [
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "nacl_legacy_symlinks_apply",
          arguments: {
            plan_token: plan.planToken,
            confirmation: plan.confirmation,
          },
        },
      },
    ]);
    assert.equal(applyResponse.result.structuredContent.status, "VERIFIED");
    assert.equal(applyResponse.result.structuredContent.code, "LEGACY_SYMLINKS_REMOVED");
    await assert.rejects(lstat(legacyPath), (error) => error.code === "ENOENT");
    assert.deepEqual(
      await readFile(path.join(repoRoot, "skills-for-codex", "nacl-core", "SKILL.md")),
      beforeTarget,
    );

    const [doctorResponse] = runProtocol(pluginRoot, home, [
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "nacl_installation_doctor", arguments: {} },
      },
    ]);
    assert.equal(doctorResponse.result.structuredContent.status, "VERIFIED");
    assert.equal(doctorResponse.result.structuredContent.mode, "plugin-only");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("server runs from an isolated package copy", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-package-server-copy-"));
  try {
    const sourceRoot = path.join(tempRoot, "marketplace-source", "nacl");
    const copyRoot = path.join(tempRoot, "cache", "nacl");
    const home = path.join(tempRoot, "home");
    const projectRoot = path.join(tempRoot, "project");
    await cp(pluginRoot, sourceRoot, { recursive: true });
    await cp(sourceRoot, copyRoot, { recursive: true });
    await rename(sourceRoot, `${sourceRoot}.unavailable`);
    await mkdir(home);
    await mkdir(projectRoot);
    const responses = runProtocol(copyRoot, home, [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "nacl_installation_doctor", arguments: {} },
      },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "nacl_graph_local_init",
          arguments: {
            project_id: "source-unavailable-project",
            project_root: projectRoot,
            confirmation: "NOT_CONFIRMED",
          },
        },
      },
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "nacl_agent_profiles_plan", arguments: { project_root: projectRoot } },
      },
    ]);
    const response = responses.find((item) => item.id === 1);
    const list = responses.find((item) => item.id === 2);
    const lifecycleInit = responses.find((item) => item.id === 3);
    const profilePlan = responses.find((item) => item.id === 4);
    assert.equal(response.result.structuredContent.mode, "plugin-only");
    assert.equal(response.result.structuredContent.status, "VERIFIED");
    assert.deepEqual(list.result.tools.map((tool) => tool.name), [
      "nacl_installation_doctor",
      "nacl_project_resolve",
      "nacl_project_migrate_identity",
      "nacl_project_register_root",
      "nacl_legacy_symlinks_plan",
      "nacl_legacy_symlinks_apply",
      "nacl_graph_local_init",
      "nacl_graph_local_start",
      "nacl_graph_local_doctor",
      "nacl_agent_profiles_plan",
      "nacl_agent_profiles_apply",
      "nacl_graph_health",
      "nacl_graph_schema_status",
      "nacl_graph_read",
      "nacl_graph_apply_migrations",
      "nacl_graph_write_canary",
      "nacl_graph_derive_worker_identity",
      "nacl_graph_claim_resource",
      "nacl_graph_heartbeat_resource",
      "nacl_graph_release_resource",
      "nacl_graph_handoff_resource",
      "nacl_graph_mutate_resource",
      "nacl_graph_allocate_id",
      "nacl_graph_bootstrap_admin",
      "nacl_graph_set_membership",
    ]);
    assert.equal(lifecycleInit.result.structuredContent.status, "BLOCKED");
    assert.equal(lifecycleInit.result.structuredContent.code, "CONFIRMATION_REQUIRED");
    assert.equal(profilePlan.result.structuredContent.status, "VERIFIED");
    assert.equal(profilePlan.result.structuredContent.code, "AGENT_PROFILE_PLAN_READY");
    assert.equal(profilePlan.result.structuredContent.entries.length, 5);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("malformed calls fail without reflecting input", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "nacl-doctor-malformed-"));
  try {
    const responses = runProtocol(pluginRoot, home, [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "wrong", arguments: {} },
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "nacl_installation_doctor", arguments: { extra: "secret-marker" } },
      },
    ]);
    assert.deepEqual(responses.map((response) => response.error.code), [-32602, -32602]);
    assert.equal(JSON.stringify(responses).includes("secret-marker"), false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("server executable exists at the manifest-declared path", async () => {
  const metadata = await import("node:fs/promises").then(({ lstat }) => lstat(serverPath));
  assert.equal(metadata.isFile(), true);
});
