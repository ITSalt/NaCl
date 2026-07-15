import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("VPS reservation is inventory-only, collision leaves no project artifacts, and release removes the reservation", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "nacl-vps-reservation-"));
  try {
    const reserved = run(root, "reserve", ["--scope", "project-a", "--port", "7443"]);
    assert.equal(reserved.status, "RESERVED");
    assert.match(reserved.reservation_token, /^[0-9a-f]{32}$/);
    assert.throws(() => readFileSync(path.join(root, "project-a", "allowed-cns"), "utf8"));
    assert.throws(() => run(root, "reserve", ["--scope", "project-b", "--port", "7443"]));
    assert.throws(() => readFileSync(path.join(root, "project-b", ".env"), "utf8"));
    mkdirSync(path.join(root, "project-a"), { recursive: true });
    writeFileSync(path.join(root, "project-a", ".env"), "injected-later-failure\n");
    const pending = run(root, "release", ["--scope", "project-a", "--reservation-token", reserved.reservation_token]);
    assert.equal(pending.code, "GATEWAY_RESERVATION_RELEASE_PENDING");
    assert.equal(run(root, "inventory").gateways[0].release_pending, true);
    const released = run(root, "release-commit", ["--scope", "project-a", "--reservation-token", reserved.reservation_token]);
    assert.equal(released.code, "GATEWAY_RESERVATION_RELEASED");
    assert.deepEqual(run(root, "inventory").gateways, []);
    assert.equal(existsSync(path.join(root, "project-a")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("VPS quarantine helper reports stop failures as unresolved critical instead of claiming success", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "nacl-vps-stop-failure-"));
  try {
    const bin = path.join(root, "bin");
    const state = path.join(root, "state");
    const graph = path.join(state, "project-a");
    mkdirSync(bin, { recursive: true });
    run(state, "provision", ["--scope", "project-a", "--port", "7443"]);
    writeFileSync(path.join(graph, "docker-compose.yml"), "services: {}\n");
    const docker = path.join(bin, "docker");
    writeFileSync(docker, "#!/bin/sh\n[ \"$1 $2\" = \"compose version\" ] && exit 0\nexit 37\n");
    chmodSync(docker, 0o755);
    const script = [
      `. ${JSON.stringify(path.join(repo, "graph-infra/vps/lib-gateway-quarantine.sh"))}`,
      `PATH=${JSON.stringify(`${bin}:${process.env.PATH}`)}`,
      `STATE_DIR=${JSON.stringify(state)}`,
      `SERVER_ID=graph.example.com`,
      `ACCESS_CONTROL=${JSON.stringify(cli)}`,
      `DC='docker compose'`,
      `quarantine_all_gateways injected-failure`,
    ].join("\n");
    const result = spawnSync("/bin/sh", ["-c", script], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /CRITICAL: physical gateway stop failed/);
    assert.doesNotMatch(result.stderr, /every gateway was stopped/);
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

test("POSIX and PowerShell marker queries keep every dynamic value in MCP parameters", () => {
  const createSh = readFileSync(path.join(repo, "nacl-tl-core/scripts/create-remote.sh"), "utf8");
  const connectSh = readFileSync(path.join(repo, "nacl-tl-core/scripts/connect-remote.sh"), "utf8");
  const createPs = readFileSync(path.join(repo, "nacl-tl-core/scripts/create-remote.ps1"), "utf8");
  const connectPs = readFileSync(path.join(repo, "nacl-tl-core/scripts/connect-remote.ps1"), "utf8");
  const psHelper = readFileSync(path.join(repo, "nacl-tl-core/scripts/lib-neo4j-mcp.ps1"), "utf8");

  assert.doesNotMatch(createSh, /id:'\$SCOPE'|created_by='\$DEV'|updated_by='\$DEV'/);
  assert.doesNotMatch(connectSh, /id:'\$SCOPE'/);
  assert.match(createSh, /\$projectScope/);
  assert.match(createSh, /\$developerId/);
  assert.match(createSh, /--param-string "projectScope=\$SCOPE"/);
  assert.match(createSh, /--param-string "developerId=\$DEV"/);
  assert.match(connectSh, /\$projectScope/);
  assert.match(connectSh, /--param-string "projectScope=\$SCOPE"/);

  assert.doesNotMatch(createPs, /id:'\$ProjectScope'|created_by='\$DeveloperId'|updated_by='\$DeveloperId'/);
  assert.doesNotMatch(connectPs, /id:'\$ProjectScope'/);
  assert.match(createPs, /-Params @\{ projectScope = \$ProjectScope; developerId = \$DeveloperId \}/);
  assert.match(connectPs, /-Params @\{ projectScope = \$ProjectScope \}/);
  assert.match(psHelper, /\[hashtable\]\$Params/);
  assert.match(psHelper, /\$Params\[\$key\] -is \[string\]/);
  assert.match(psHelper, /"--param-string"/);
});

test("POSIX and PowerShell remote flows use one secret resolver and one transactional route writer", () => {
  for (const name of ["create-remote.sh", "connect-remote.sh", "create-remote.ps1", "connect-remote.ps1"]) {
    const source = readFileSync(path.join(repo, "nacl-tl-core/scripts", name), "utf8");
    assert.match(source, /secret-source-contract\.mjs/);
    assert.match(source, /write-remote-route\.mjs/);
    assert.doesNotMatch(source, /write-mcp-config\.mjs/);
    assert.doesNotMatch(source, /write-graph-config\.mjs/);
  }
});

test("VPS provision/issue/revoke use authoritative server control and never mutate a single project grant", () => {
  const provision = readFileSync(path.join(repo, "graph-infra/vps/provision-vps.sh"), "utf8");
  const issue = readFileSync(path.join(repo, "graph-infra/vps/issue-client-cert.sh"), "utf8");
  const revoke = readFileSync(path.join(repo, "graph-infra/vps/revoke-client-cert.sh"), "utf8");
  const authorization = readFileSync(path.join(repo, "graph-infra/vps/lib-gateway-authorization.sh"), "utf8");
  assert.match(provision, /server-access-control\.mjs/);
  assert.match(provision, /node "\$ACCESS_CONTROL" reserve/);
  assert.match(provision, /node "\$ACCESS_CONTROL" activate/);
  assert.match(provision, /node "\$ACCESS_CONTROL" release/);
  assert.ok(provision.indexOf('node "$ACCESS_CONTROL" reserve') < provision.indexOf('mkdir -p "$GRAPH_DIR"'));
  assert.match(provision, /grant_and_reload_all_gateways/);
  assert.doesNotMatch(issue, /allowlist_add/);
  assert.doesNotMatch(revoke, /allowlist_remove/);
  assert.match(issue, /server-access-control\.mjs/);
  assert.match(issue, /grant_and_reload_all_gateways/);
  assert.match(authorization, /node "\$ACCESS_CONTROL" grant/);
  assert.match(authorization, /reload_all_registered_gateways/);
  assert.match(authorization, /quarantine_all_gateways/);
  assert.match(revoke, /server-access-control\.mjs/);
  assert.match(revoke, /node "\$ACCESS_CONTROL" revoke/);
  assert.match(issue, /lib-gateway-quarantine\.sh/);
  assert.match(revoke, /quarantine_all_gateways/);
  assert.doesNotMatch(issue, /stop gateway[^\n]*\|\| true/);
  assert.doesNotMatch(revoke, /stop gateway[^\n]*\|\| true/);
});

test("provider-neutral and VPS registries project to the same state-dir/scope/allowed-cns layout", () => {
  const abstractSource = readFileSync(path.join(repo, "codex-plugin-src/package/runtime/graph-gateway/server-access-registry.mjs"), "utf8");
  const vpsSource = readFileSync(path.join(repo, "graph-infra/vps/server-access-control.mjs"), "utf8");
  assert.match(abstractSource, /path\.join\(this\.#stateDir, scope, "allowed-cns"\)/);
  assert.match(vpsSource, /path\.join\(stateDir, id\(scope, "project_scope"\), "allowed-cns"\)/);
  assert.doesNotMatch(abstractSource, /this\.#stateDir, "projects", scope/);
});
