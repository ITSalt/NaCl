import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PUBLIC_TOOL_NAMES } from "../../../services/nacl-mcp/src/contracts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const builder = path.join(repoRoot, "scripts", "build-codex-plugin.mjs");
const appId = "plugin_asdk_app_0123456789abcdef";
const mcpUrl = "https://mcp.example.test/mcp";

function build(arguments_) {
  return spawnSync(process.execPath, [builder, ...arguments_], { cwd: repoRoot, encoding: "utf8" });
}

test("release-only builder emits an OAuth MCP binding and portal app mapping without changing the committed local package", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nacl-production-binding-"));
  try {
    const output = path.join(temporary, "nacl");
    const result = build(["--output", output, "--production-mcp-url", mcpUrl, "--production-app-id", appId]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const manifest = JSON.parse(await readFile(path.join(output, ".codex-plugin", "plugin.json"), "utf8"));
    const app = JSON.parse(await readFile(path.join(output, ".app.json"), "utf8"));
    const mcp = JSON.parse(await readFile(path.join(output, ".mcp.json"), "utf8"));
    assert.equal(manifest.apps, "./.app.json");
    assert.deepEqual(app, { apps: { nacl: { id: appId } } });
    assert.deepEqual(mcp.mcpServers.nacl, {
      type: "http",
      url: mcpUrl,
    });
    assert.deepEqual(PUBLIC_TOOL_NAMES, [
      "nacl_projects_list",
      "nacl_project_summary",
      "nacl_named_read",
      "nacl_project_mutate",
      "nacl_schema_apply",
      "nacl_backup_create",
      "nacl_restore_request",
    ]);
    const validator = spawnSync("bash", ["scripts/validate-codex-plugin.sh", output], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(validator.status, 0, `${validator.stdout}\n${validator.stderr}`);
    assert.match(validator.stdout, /Status: VERIFIED/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }

  const committedManifest = JSON.parse(await readFile(path.join(repoRoot, "plugins", "nacl", ".codex-plugin", "plugin.json"), "utf8"));
  assert.equal(Object.hasOwn(committedManifest, "apps"), false);
  await assert.rejects(access(path.join(repoRoot, "plugins", "nacl", ".app.json")), /ENOENT/);
  const committedMcp = JSON.parse(await readFile(path.join(repoRoot, "plugins", "nacl", ".mcp.json"), "utf8"));
  assert.equal(committedMcp.mcpServers.nacl.command, "node");
  assert.equal(Object.hasOwn(committedMcp.mcpServers.nacl, "url"), false);
});

test("production binding fails closed for incomplete, insecure, malformed, or repository-local release data", () => {
  const cases = [
    ["--output", path.join(os.tmpdir(), "nacl-bind-incomplete"), "--production-mcp-url", mcpUrl],
    ["--output", path.join(os.tmpdir(), "nacl-bind-http"), "--production-mcp-url", "http://mcp.example.test/mcp", "--production-app-id", appId],
    ["--output", path.join(os.tmpdir(), "nacl-bind-path"), "--production-mcp-url", "https://mcp.example.test/other", "--production-app-id", appId],
    ["--output", path.join(os.tmpdir(), "nacl-bind-app"), "--production-mcp-url", mcpUrl, "--production-app-id", "plugin_asdk_app_placeholder"],
    ["--output", path.join(repoRoot, "plugins", "nacl"), "--production-mcp-url", mcpUrl, "--production-app-id", appId],
  ];
  for (const arguments_ of cases) {
    const result = build(arguments_);
    assert.equal(result.status, 1, `${arguments_.join(" ")}\n${result.stdout}\n${result.stderr}`);
  }
});
