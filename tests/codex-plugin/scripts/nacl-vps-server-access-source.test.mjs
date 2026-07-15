import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = path.join(repo, "graph-infra/vps/server-access-control.mjs");

function run(state, action, args = []) {
  return JSON.parse(execFileSync(process.execPath, [cli, action, "--state-dir", state, "--server-id", "graph.example.com", ...args], { encoding: "utf8" }));
}

test("VPS control plane provisions unique ports, inherits server grants and applies explicit union migration", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "nacl-vps-control-"));
  try {
    assert.equal(run(root, "provision", ["--scope", "project-a", "--port", "7443"]).status, "VERIFIED");
    assert.equal(run(root, "grant", ["--cn", "developer.alice"]).status, "VERIFIED");
    assert.equal(run(root, "provision", ["--scope", "project-b", "--port", "7444"]).status, "VERIFIED");
    const automatic = run(root, "provision", ["--scope", "project-auto"]);
    assert.equal(automatic.gateway_port, 7687);
    assert.equal(readFileSync(path.join(root, "project-b", "allowed-cns"), "utf8"), "developer.alice\n");
    assert.throws(() => run(root, "provision", ["--scope", "project-c", "--port", "7444"]));

    const legacyA = path.join(root, "legacy-a");
    const legacyB = path.join(root, "legacy-b");
    writeFileSync(legacyA, "developer.alice\n");
    writeFileSync(legacyB, "developer.bob\n");
    const plan = run(root, "migration-plan", ["--legacy", legacyA, "--legacy", legacyB]);
    assert.deepEqual(plan.proposed_trusted_cns, ["developer.alice", "developer.bob"]);
    assert.equal(run(root, "migration-apply", ["--legacy", legacyA, "--legacy", legacyB, "--confirmation", plan.confirmation]).status, "VERIFIED");
    assert.equal(readFileSync(path.join(root, "project-a", "allowed-cns"), "utf8"), "developer.alice\ndeveloper.bob\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("POSIX and PowerShell create/connect scripts expose the exact full route contract", () => {
  const pairs = [
    ["create-remote.sh", "create-remote.ps1"],
    ["connect-remote.sh", "connect-remote.ps1"],
  ];
  const fields = ["host", "gateway-port", "sidecar-port", "client-cert", "client-key", "ca-cert", "tls", "secret-source"];
  for (const [shellName, powershellName] of pairs) {
    const shell = readFileSync(path.join(repo, "nacl-tl-core/scripts", shellName), "utf8").toLowerCase();
    const powershell = readFileSync(path.join(repo, "nacl-tl-core/scripts", powershellName), "utf8").toLowerCase();
    for (const field of fields) {
      assert.match(shell, new RegExp(`--${field}`), `${shellName} omits ${field}`);
      const psName = field.split("-").map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join("").toLowerCase();
      assert.ok(powershell.replaceAll("-", "").includes(psName), `${powershellName} omits ${field}`);
    }
  }
});

test("VPS provision/issue/revoke use authoritative server control and never mutate a single project grant", () => {
  const provision = readFileSync(path.join(repo, "graph-infra/vps/provision-vps.sh"), "utf8");
  const issue = readFileSync(path.join(repo, "graph-infra/vps/issue-client-cert.sh"), "utf8");
  const revoke = readFileSync(path.join(repo, "graph-infra/vps/revoke-client-cert.sh"), "utf8");
  assert.match(provision, /server-access-control\.mjs/);
  assert.match(provision, /node "\$ACCESS_CONTROL" provision/);
  assert.match(provision, /node "\$ACCESS_CONTROL" grant/);
  assert.doesNotMatch(issue, /allowlist_add/);
  assert.doesNotMatch(revoke, /allowlist_remove/);
  assert.match(issue, /server-access-control\.mjs/);
  assert.match(issue, /node "\$ACCESS_CONTROL" grant/);
  assert.match(revoke, /server-access-control\.mjs/);
  assert.match(revoke, /node "\$ACCESS_CONTROL" revoke/);
  assert.match(revoke, /stop gateway/);
});

test("provider-neutral and VPS registries project to the same state-dir/scope/allowed-cns layout", () => {
  const abstractSource = readFileSync(path.join(repo, "codex-plugin-src/package/runtime/graph-gateway/server-access-registry.mjs"), "utf8");
  const vpsSource = readFileSync(path.join(repo, "graph-infra/vps/server-access-control.mjs"), "utf8");
  assert.match(abstractSource, /path\.join\(this\.#stateDir, scope, "allowed-cns"\)/);
  assert.match(vpsSource, /path\.join\(stateDir, id\(scope, "project_scope"\), "allowed-cns"\)/);
  assert.doesNotMatch(abstractSource, /this\.#stateDir, "projects", scope/);
});
