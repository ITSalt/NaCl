import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const provision = path.join(repo, "graph-infra/vps/provision-vps.sh");
const controllerSource = path.join(repo, "graph-infra/vps/server-access-control.mjs");

function control(cli, state, action, args = []) {
  return JSON.parse(execFileSync(process.execPath, [
    cli,
    action,
    "--state-dir", state,
    "--server-id", "graph.example.com",
    ...args,
  ], { encoding: "utf8" }));
}

function tryControl(cli, state, action, args = []) {
  return spawnSync(process.execPath, [
    cli,
    action,
    "--state-dir", state,
    "--server-id", "graph.example.com",
    ...args,
  ], { encoding: "utf8" });
}

function executable(filename, source) {
  writeFileSync(filename, source);
  chmodSync(filename, 0o755);
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "nacl-vps-provision-r2-"));
  const state = path.join(root, "state");
  const skills = path.join(root, "skills");
  const vps = path.join(skills, "graph-infra/vps");
  const templateDir = path.join(skills, "nacl-tl-core/templates");
  const bin = path.join(root, "bin");
  const log = path.join(root, "docker.log");
  const controlLog = path.join(root, "control.log");
  const physicalLive = path.join(root, "physical-live");
  mkdirSync(vps, { recursive: true });
  mkdirSync(templateDir, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const realController = path.join(vps, "server-access-control.real.mjs");
  copyFileSync(controllerSource, realController);
  writeFileSync(path.join(vps, "server-access-control.mjs"), `
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const action = args[0] ?? "missing";
const cnIndex = args.indexOf("--cn");
const stateIndex = args.indexOf("--state-dir");
const stateDir = stateIndex >= 0 ? args[stateIndex + 1] : "";
if (process.env.FAKE_CONTROL_LOG) appendFileSync(process.env.FAKE_CONTROL_LOG, \`${'${action}'}:${'${cnIndex >= 0 ? args[cnIndex + 1] : "-"}'}\\n\`);
if (action === "grant" && process.env.FAIL_GRANT_COMMAND === "1") process.exit(37);
const result = spawnSync(process.execPath, [${JSON.stringify(realController)}, ...args], { stdio: "inherit", env: process.env });
if (result.status === 0 && action === "grant" && process.env.TAMPER_AFTER_GRANT_SCOPE) {
  writeFileSync(path.join(stateDir, process.env.TAMPER_AFTER_GRANT_SCOPE, "allowed-cns"), process.env.TAMPER_ALLOWED_CNS ?? "");
}
if (result.status === 0 && action === "grant" && process.env.TAMPER_TRUSTED_AFTER_GRANT) {
  writeFileSync(path.join(stateDir, "trusted-cns"), process.env.TAMPER_TRUSTED_AFTER_GRANT);
}
if (result.status === 0 && action === "authorization-snapshot" && process.env.STALE_AFTER_AUTHORIZATION_SNAPSHOT === "1") {
  const inventoryPath = path.join(stateDir, "gateways.json");
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  inventory.authorization_revision += 1;
  writeFileSync(inventoryPath, \`${'${JSON.stringify(inventory, null, 2)}'}\\n\`);
}
process.exit(result.status ?? 1);
`);
  copyFileSync(path.join(repo, "graph-infra/vps/lib-gateway-quarantine.sh"), path.join(vps, "lib-gateway-quarantine.sh"));
  const authorizationHelper = path.join(repo, "graph-infra/vps/lib-gateway-authorization.sh");
  if (existsSync(authorizationHelper)) copyFileSync(authorizationHelper, path.join(vps, "lib-gateway-authorization.sh"));
  copyFileSync(path.join(repo, "graph-infra/vps/revoke-client-cert.sh"), path.join(vps, "revoke-client-cert.sh"));
  writeFileSync(path.join(vps, "lib-ca.sh"), `
ensure_ca() {
  mkdir -p "$CA_DIR"
  : > "$CA_DIR/ca.crt"
  : > "$CA_DIR/ca.key"
  : > "$CA_DIR/crl.pem"
}
gen_crl() { : > "$CA_DIR/crl.pem"; }
issue_server_cert() {
  mkdir -p "$2"
  : > "$2/server.crt"
  : > "$2/server.key"
  : > "$2/ca.crt"
}
issue_client_cert() {
  mkdir -p "$2"
  : > "$2/client.crt"
  : > "$2/client.key"
  : > "$2/ca.crt"
}
revoke_cert() { :; }
render_gateway_allowlist() {
  _scope="$(basename "$1")"
  printf 'render:%s\\n' "$_scope" >> "$FAKE_DOCKER_LOG"
  [ "\${FAIL_RENDER_SCOPE:-}" != "$_scope" ]
}
`);
  writeFileSync(path.join(templateDir, "graph-docker-compose.vps.yml"), "services:\n  gateway: {}\n");
  executable(path.join(bin, "docker"), `#!/bin/sh
scope="$(basename "$PWD")"
case "$1:$2" in
  compose:version) exit 0 ;;
  compose:up)
    printf 'up:%s\\n' "$scope" >> "$FAKE_DOCKER_LOG"
    if [ "\${DELETE_COMPOSE_ON_UP_SCOPE:-}" = "$scope" ]; then
      rm -f "$PWD/docker-compose.yml"
      : > "$FAKE_PHYSICAL_LIVE"
      exit 37
    fi
    [ "\${FAIL_UP_SCOPE:-}" != "$scope" ]
    exit $?
    ;;
  compose:stop)
    printf 'stop:%s\\n' "$scope" >> "$FAKE_DOCKER_LOG"
    [ "\${FAIL_STOP_SCOPE:-}" != "$scope" ]
    exit $?
    ;;
  compose:down)
    printf 'down:%s\\n' "$scope" >> "$FAKE_DOCKER_LOG"
    [ "\${FAIL_DOWN_SCOPE:-}" != "$scope" ]
    exit $?
    ;;
  inspect:*) printf 'healthy\\n'; exit 0 ;;
  cp:*|exec:*) exit 0 ;;
esac
exit 0
`);
  executable(path.join(bin, "docker-compose"), "#!/bin/sh\nexit 99\n");
  executable(path.join(bin, "openssl"), `#!/bin/sh
[ "$1:$2" = "rand:-hex" ] && { printf '0123456789abcdef0123456789abcdef0123456789abcdef\\n'; exit 0; }
exit 0
`);
  executable(path.join(bin, "ss"), "#!/bin/sh\nprintf 'LISTEN 0 128 0.0.0.0:%s \\n' \"$FAKE_LISTEN_PORT\"\n");

  const cli = path.join(vps, "server-access-control.mjs");
  mkdirSync(state, { recursive: true });
  for (const [scope, port] of [["project-a", "7443"], ["project-b", "7444"]]) {
    control(cli, state, "provision", ["--scope", scope, "--port", port]);
    writeFileSync(path.join(state, scope, "docker-compose.yml"), "services:\n  gateway: {}\n");
  }
  return { root, state, skills, vps, cli, bin, log, controlLog, physicalLive };
}

function runProvision(ctx, extraEnv = {}) {
  return spawnSync("/bin/bash", [
    provision,
    "--skills-dir", ctx.skills,
    "--host", "graph.example.com",
    "--project-scope", "project-c",
    "--prefix", "project-c",
    "--gateway-port", "7445",
    "--first-developer", "developer.alice",
    "--state-dir", ctx.state,
    "--no-firewall",
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${ctx.bin}:${process.env.PATH}`,
      FAKE_DOCKER_LOG: ctx.log,
      FAKE_PHYSICAL_LIVE: ctx.physicalLive,
      FAKE_LISTEN_PORT: "7445",
      ...extraEnv,
    },
  });
}

function logLines(ctx) {
  return existsSync(ctx.log) ? readFileSync(ctx.log, "utf8").trim().split("\n").filter(Boolean) : [];
}

function treeSnapshot(root) {
  const entries = [];
  function visit(filename, relative) {
    const metadata = lstatSync(filename);
    const mode = metadata.mode & 0o7777;
    if (metadata.isDirectory()) {
      entries.push({ path: relative || ".", type: "directory", mode });
      for (const name of readdirSync(filename).sort()) visit(path.join(filename, name), relative ? `${relative}/${name}` : name);
    } else if (metadata.isFile()) {
      entries.push({ path: relative, type: "file", mode, content: readFileSync(filename, "utf8") });
    } else if (metadata.isSymbolicLink()) {
      entries.push({ path: relative, type: "symlink", mode });
    } else entries.push({ path: relative, type: "other", mode });
  }
  visit(root, "");
  return entries;
}

function validCompose(inner = '      - "--allow-cn=old"') {
  return [
    "services:",
    "  gateway:",
    "    command:",
    "      # >>> NACL allow-cn (managed) — generated projection of <state>/trusted-cns",
    inner,
    "      # <<< NACL allow-cn (managed)",
    "",
  ].join("\n");
}

function useRealAuthorizationRenderer(ctx) {
  copyFileSync(path.join(repo, "graph-infra/vps/lib-ca.sh"), path.join(ctx.vps, "lib-ca.sh"));
  for (const scope of ["project-a", "project-b"]) {
    writeFileSync(path.join(ctx.state, scope, "docker-compose.yml"), validCompose());
  }
}

function assertNoUpAndGlobalQuarantine(ctx) {
  const lines = logLines(ctx);
  for (const scope of ["project-a", "project-b"]) {
    assert.ok(lines.includes(`stop:${scope}`), `missing global quarantine for ${scope}: ${lines.join(", ")}`);
    assert.equal(lines.includes(`up:${scope}`), false, `unexpected up for ${scope}: ${lines.join(", ")}`);
  }
  assert.ok(control(ctx.cli, ctx.state, "inventory").gateways.every((entry) => entry.enabled === false));
}

function runGrantHelper(ctx, principal = "developer.bob", extraEnv = {}) {
  const script = [
    `. ${JSON.stringify(path.join(ctx.vps, "lib-ca.sh"))}`,
    `. ${JSON.stringify(path.join(ctx.vps, "lib-gateway-quarantine.sh"))}`,
    `. ${JSON.stringify(path.join(ctx.vps, "lib-gateway-authorization.sh"))}`,
    `STATE_DIR=${JSON.stringify(ctx.state)}`,
    `SERVER_ID=graph.example.com`,
    `ACCESS_CONTROL=${JSON.stringify(ctx.cli)}`,
    `DC='docker compose'`,
    `grant_and_reload_all_gateways ${principal}`,
  ].join("\n");
  return spawnSync("/bin/bash", ["-c", script], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${ctx.bin}:${process.env.PATH}`, FAKE_DOCKER_LOG: ctx.log, ...extraEnv },
  });
}

test("provision grant renders and reloads two existing gateways and the new gateway", () => {
  const ctx = fixture();
  try {
    const result = runProvision(ctx);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /NACL_VPS_RESULT: status=READY/);
    const lines = logLines(ctx);
    for (const scope of ["project-a", "project-b", "project-c"]) {
      assert.ok(lines.includes(`render:${scope}`), `missing render for ${scope}: ${lines.join(", ")}`);
      assert.ok(lines.includes(`up:${scope}`), `missing reload for ${scope}: ${lines.join(", ")}`);
    }
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test("provision grant reload uncertainty physically quarantines every registered gateway", () => {
  const ctx = fixture();
  try {
    const result = runProvision(ctx, { FAIL_UP_SCOPE: "project-b" });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /NACL_VPS_RESULT: status=FAILED/);
    const lines = logLines(ctx);
    for (const scope of ["project-a", "project-b", "project-c"]) {
      assert.ok(lines.includes(`stop:${scope}`), `missing physical quarantine for ${scope}: ${lines.join(", ")}`);
    }
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test("provision grant command failure best-effort revokes before quarantining every gateway", () => {
  const ctx = fixture();
  try {
    const result = runProvision(ctx, { FAIL_GRANT_COMMAND: "1", FAKE_CONTROL_LOG: ctx.controlLog });
    assert.notEqual(result.status, 0);
    const actions = readFileSync(ctx.controlLog, "utf8").trim().split("\n");
    assert.ok(actions.includes("grant:developer.alice"), actions.join(", "));
    assert.ok(actions.includes("revoke:developer.alice"), `missing best-effort revoke: ${actions.join(", ")}`);
    const lines = logLines(ctx);
    for (const scope of ["project-a", "project-b", "project-c"]) {
      assert.ok(lines.includes(`stop:${scope}`), `missing physical quarantine for ${scope}: ${lines.join(", ")}`);
    }
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test("state-aware grant renders all projections but never starts disabled or release-pending gateways", () => {
  const ctx = fixture();
  try {
    const quarantined = tryControl(ctx.cli, ctx.state, "quarantine", ["--scope", "project-b", "--reason", "previous-failure"]);
    assert.notEqual(quarantined.status, 0);
    const reserved = control(ctx.cli, ctx.state, "reserve", ["--scope", "project-c", "--port", "7445"]);
    mkdirSync(path.join(ctx.state, "project-c"), { recursive: true });
    writeFileSync(path.join(ctx.state, "project-c", "docker-compose.yml"), "services:\n  gateway: {}\n");
    control(ctx.cli, ctx.state, "release", ["--scope", "project-c", "--reservation-token", reserved.reservation_token]);
    rmSync(ctx.log, { force: true });
    const script = [
      `. ${JSON.stringify(path.join(ctx.vps, "lib-ca.sh"))}`,
      `. ${JSON.stringify(path.join(ctx.vps, "lib-gateway-quarantine.sh"))}`,
      `. ${JSON.stringify(path.join(ctx.vps, "lib-gateway-authorization.sh"))}`,
      `STATE_DIR=${JSON.stringify(ctx.state)}`,
      `SERVER_ID=graph.example.com`,
      `ACCESS_CONTROL=${JSON.stringify(ctx.cli)}`,
      `DC='docker compose'`,
      `grant_and_reload_all_gateways developer.bob`,
    ].join("\n");
    const result = spawnSync("/bin/sh", ["-c", script], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${ctx.bin}:${process.env.PATH}`, FAKE_DOCKER_LOG: ctx.log },
    });
    assert.equal(result.status, 0, result.stderr);
    const lines = logLines(ctx);
    for (const scope of ["project-a", "project-b", "project-c"]) assert.ok(lines.includes(`render:${scope}`), lines.join(", "));
    assert.ok(lines.includes("up:project-a"), lines.join(", "));
    assert.ok(lines.includes("stop:project-b"), lines.join(", "));
    assert.ok(lines.includes("stop:project-c"), lines.join(", "));
    assert.equal(lines.includes("up:project-b"), false, lines.join(", "));
    assert.equal(lines.includes("up:project-c"), false, lines.join(", "));
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test("reserve then metadata quarantine is never treated as active provisioning during grant", () => {
  const ctx = fixture();
  try {
    const reserved = control(ctx.cli, ctx.state, "reserve", ["--scope", "project-c", "--port", "7445"]);
    mkdirSync(path.join(ctx.state, "project-c"), { recursive: true });
    writeFileSync(path.join(ctx.state, "project-c", "docker-compose.yml"), "services:\n  gateway: {}\n");
    const quarantined = tryControl(ctx.cli, ctx.state, "quarantine", ["--scope", "project-c", "--reason", "prior-failure"]);
    assert.notEqual(quarantined.status, 0);
    const gateway = control(ctx.cli, ctx.state, "inventory").gateways.find((entry) => entry.project_scope === "project-c");
    assert.equal(gateway.provisioning, true);
    assert.equal(gateway.reservation_token, reserved.reservation_token);
    assert.equal(gateway.quarantine_reason, "prior-failure");
    rmSync(ctx.log, { force: true });
    const result = runGrantHelper(ctx);
    assert.equal(result.status, 0, result.stderr);
    const lines = logLines(ctx);
    assert.ok(lines.includes("render:project-c"), lines.join(", "));
    assert.ok(lines.includes("stop:project-c"), lines.join(", "));
    assert.equal(lines.includes("up:project-c"), false, lines.join(", "));
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test("release and quarantine stop-precedence wins over corrupt enabled metadata", () => {
  const ctx = fixture();
  try {
    const inventoryPath = path.join(ctx.state, "gateways.json");
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    const projectA = inventory.gateways.find((entry) => entry.project_scope === "project-a");
    const projectB = inventory.gateways.find((entry) => entry.project_scope === "project-b");
    Object.assign(projectA, { enabled: true, provisioning: true, release_pending: true, quarantine_reason: null });
    Object.assign(projectB, { enabled: true, provisioning: false, quarantine_reason: "drifted-quarantine" });
    writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
    rmSync(ctx.log, { force: true });
    const result = runGrantHelper(ctx);
    assert.equal(result.status, 0, result.stderr);
    const lines = logLines(ctx);
    for (const scope of ["project-a", "project-b"]) {
      assert.ok(lines.includes(`stop:${scope}`), lines.join(", "));
      assert.equal(lines.includes(`up:${scope}`), false, lines.join(", "));
    }
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test("certificate revoke uses state-aware reconciliation and does not restart a disabled gateway", () => {
  const ctx = fixture();
  try {
    const quarantined = tryControl(ctx.cli, ctx.state, "quarantine", ["--scope", "project-b", "--reason", "previous-failure"]);
    assert.notEqual(quarantined.status, 0);
    const certDir = path.join(ctx.state, "clients/developer.alice");
    mkdirSync(certDir, { recursive: true });
    writeFileSync(path.join(certDir, "client.crt"), "fixture\n");
    rmSync(ctx.log, { force: true });
    const result = spawnSync("/bin/bash", [
      path.join(ctx.vps, "revoke-client-cert.sh"),
      "developer.alice",
      "--state-dir", ctx.state,
      "--server-id", "graph.example.com",
    ], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${ctx.bin}:${process.env.PATH}`, FAKE_DOCKER_LOG: ctx.log },
    });
    assert.equal(result.status, 0, result.stderr);
    const lines = logLines(ctx);
    assert.ok(lines.includes("render:project-a"), lines.join(", "));
    assert.ok(lines.includes("render:project-b"), lines.join(", "));
    assert.ok(lines.includes("up:project-a"), lines.join(", "));
    assert.ok(lines.includes("stop:project-b"), lines.join(", "));
    assert.equal(lines.includes("up:project-b"), false, lines.join(", "));
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test("real allowlist renderer writes and verifies the exact managed projection", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "nacl-vps-render-exact-"));
  try {
    const graph = path.join(root, "project-a");
    mkdirSync(graph, { recursive: true });
    writeFileSync(path.join(graph, "allowed-cns"), "developer.alice\ndeveloper.bob\n");
    writeFileSync(path.join(graph, "docker-compose.yml"), validCompose());
    const script = `. ${JSON.stringify(path.join(repo, "graph-infra/vps/lib-ca.sh"))}\nrender_gateway_allowlist ${JSON.stringify(graph)}`;
    const result = spawnSync("/bin/bash", ["-c", script], { encoding: "utf8", env: { ...process.env, CA_DIR: path.join(root, "ca") } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(path.join(graph, "docker-compose.yml"), "utf8"), validCompose([
      '      - "--allow-cn=developer.alice"',
      '      - "--allow-cn=developer.bob"',
    ].join("\n")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("tamper after grant cannot render wildcard, duplicate, unsorted or stale project authorization", () => {
  const ctx = fixture();
  try {
    useRealAuthorizationRenderer(ctx);
    rmSync(ctx.log, { force: true });
    const result = runGrantHelper(ctx, "developer.zed", {
      TAMPER_AFTER_GRANT_SCOPE: "project-a",
      TAMPER_ALLOWED_CNS: "developer.zed\n*\ndeveloper.zed\ndeveloper.aaa\n",
    });
    assert.notEqual(result.status, 0);
    assertNoUpAndGlobalQuarantine(ctx);
    const compose = readFileSync(path.join(ctx.state, "project-a", "docker-compose.yml"), "utf8");
    assert.doesNotMatch(compose, /--allow-cn=\*/);
    assert.equal((compose.match(/--allow-cn=developer\.zed/g) ?? []).length <= 1, true);
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test("canonical but non-equal project projection is stale and fails closed", () => {
  const ctx = fixture();
  try {
    useRealAuthorizationRenderer(ctx);
    rmSync(ctx.log, { force: true });
    const result = runGrantHelper(ctx, "developer.zed", {
      TAMPER_AFTER_GRANT_SCOPE: "project-a",
      TAMPER_ALLOWED_CNS: "developer.aaa\ndeveloper.zed\n",
    });
    assert.notEqual(result.status, 0);
    assertNoUpAndGlobalQuarantine(ctx);
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test("non-canonical authoritative trusted-cns fails closed before every gateway action", () => {
  const ctx = fixture();
  try {
    useRealAuthorizationRenderer(ctx);
    rmSync(ctx.log, { force: true });
    const result = runGrantHelper(ctx, "developer.zed", {
      TAMPER_TRUSTED_AFTER_GRANT: "developer.zed\n*\ndeveloper.zed\ndeveloper.aaa\n",
    });
    assert.notEqual(result.status, 0);
    assertNoUpAndGlobalQuarantine(ctx);
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test("authorization revision drift after snapshot prevents render and up and globally quarantines", () => {
  const ctx = fixture();
  try {
    useRealAuthorizationRenderer(ctx);
    rmSync(ctx.log, { force: true });
    const result = runGrantHelper(ctx, "developer.zed", { STALE_AFTER_AUTHORIZATION_SNAPSHOT: "1" });
    assert.notEqual(result.status, 0);
    assertNoUpAndGlobalQuarantine(ctx);
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

for (const malformed of [
  { name: "missing managed markers", compose: "services:\n  gateway: {}\n" },
  { name: "duplicate managed markers", compose: validCompose().replace("      # <<< NACL allow-cn (managed)", "      # >>> NACL allow-cn (managed)\n      # <<< NACL allow-cn (managed)") },
]) {
  test(`grant reload fails closed for ${malformed.name}`, () => {
    const ctx = fixture();
    try {
      copyFileSync(path.join(repo, "graph-infra/vps/lib-ca.sh"), path.join(ctx.vps, "lib-ca.sh"));
      const target = path.join(ctx.state, "project-a", "docker-compose.yml");
      writeFileSync(target, malformed.compose);
      writeFileSync(path.join(ctx.state, "project-b", "docker-compose.yml"), validCompose());
      const before = readFileSync(target, "utf8");
      rmSync(ctx.log, { force: true });
      const result = runGrantHelper(ctx);
      assert.notEqual(result.status, 0);
      assert.equal(readFileSync(target, "utf8"), before, "malformed compose must remain unchanged");
      const lines = logLines(ctx);
      assert.ok(lines.includes("stop:project-a"), lines.join(", "));
      assert.ok(lines.includes("stop:project-b"), lines.join(", "));
      assert.equal(lines.includes("up:project-a"), false, lines.join(", "));
      const inventory = control(ctx.cli, ctx.state, "inventory");
      assert.ok(inventory.gateways.every((entry) => entry.enabled === false));
    } finally {
      rmSync(ctx.root, { recursive: true, force: true });
    }
  });
}

test("failed docker down retains the disabled reservation and prevents later port reuse", () => {
  const ctx = fixture();
  try {
    const result = runProvision(ctx, { FAIL_UP_SCOPE: "project-c", FAIL_DOWN_SCOPE: "project-c" });
    assert.notEqual(result.status, 0);
    const gateway = control(ctx.cli, ctx.state, "inventory").gateways.find((entry) => entry.project_scope === "project-c");
    assert.ok(gateway, "failed cleanup must retain the reservation");
    assert.equal(gateway.enabled, false);
    assert.equal(gateway.release_pending, true);
    assert.equal(existsSync(path.join(ctx.state, "project-c")), true);
    const collision = tryControl(ctx.cli, ctx.state, "reserve", ["--scope", "project-d", "--port", "7445"]);
    assert.notEqual(collision.status, 0);
    assert.match(collision.stderr, /GATEWAY_COLLISION/);
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test("start attempt that loses compose cannot release a physically live gateway or its port", () => {
  const ctx = fixture();
  try {
    const result = runProvision(ctx, { DELETE_COMPOSE_ON_UP_SCOPE: "project-c" });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(ctx.physicalLive), true, "fixture must prove that a physical start was attempted");
    assert.equal(existsSync(path.join(ctx.state, "project-c", "docker-compose.yml")), false);
    const gateway = control(ctx.cli, ctx.state, "inventory").gateways.find((entry) => entry.project_scope === "project-c");
    assert.ok(gateway, "unverified shutdown must retain the reservation");
    assert.equal(gateway.release_pending, true);
    assert.equal(existsSync(path.join(ctx.state, "project-c")), true);
    const collision = tryControl(ctx.cli, ctx.state, "reserve", ["--scope", "project-d", "--port", "7445"]);
    assert.notEqual(collision.status, 0);
    assert.match(collision.stderr, /GATEWAY_COLLISION/);
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test("failed owned-artifact cleanup is retryable and keeps the port reserved until commit", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "nacl-vps-release-r2-"));
  const state = path.join(root, "state");
  const project = path.join(state, "project-a");
  try {
    const reserved = control(controllerSource, state, "reserve", ["--scope", "project-a", "--port", "7443"]);
    mkdirSync(project, { recursive: true });
    const locked = path.join(project, "z-locked");
    mkdirSync(locked);
    writeFileSync(path.join(project, "a-removable"), "must survive a failed cleanup\n");
    writeFileSync(path.join(locked, "owned-artifact"), "keep until cleanup succeeds\n");
    chmodSync(path.join(project, "a-removable"), 0o640);
    chmodSync(path.join(locked, "owned-artifact"), 0o600);
    chmodSync(locked, 0o500);
    const beforeFailure = treeSnapshot(project);
    const pending = control(controllerSource, state, "release", ["--scope", "project-a", "--reservation-token", reserved.reservation_token]);
    assert.equal(pending.status, "PENDING");
    assert.equal(pending.code, "GATEWAY_RESERVATION_RELEASE_PENDING");

    const failed = tryControl(controllerSource, state, "release-commit", ["--scope", "project-a", "--reservation-token", reserved.reservation_token]);
    assert.notEqual(failed.status, 0);
    assert.equal(control(controllerSource, state, "inventory").gateways[0].release_pending, true);
    assert.equal(existsSync(project), true);
    assert.deepEqual(treeSnapshot(project), beforeFailure, "failed cleanup must preserve every path, byte and mode");
    const collision = tryControl(controllerSource, state, "reserve", ["--scope", "project-b", "--port", "7443"]);
    assert.notEqual(collision.status, 0);
    assert.match(collision.stderr, /GATEWAY_COLLISION/);

    chmodSync(locked, 0o700);
    const beforeCommit = treeSnapshot(project);
    const committed = control(controllerSource, state, "release-commit", ["--scope", "project-a", "--reservation-token", reserved.reservation_token]);
    assert.equal(committed.code, "GATEWAY_RESERVATION_RELEASED");
    assert.equal(committed.artifact_gc_status, "RETAINED");
    assert.ok(path.isAbsolute(committed.artifact_tombstone));
    const replayed = control(controllerSource, state, "release-commit", ["--scope", "project-a", "--reservation-token", reserved.reservation_token]);
    assert.deepEqual(replayed, committed, "lost-ACK retry must return the exact durable result");
    const wrongToken = tryControl(controllerSource, state, "release-commit", ["--scope", "project-a", "--reservation-token", "0".repeat(32)]);
    assert.notEqual(wrongToken.status, 0);
    assert.match(wrongToken.stderr, /RESERVATION_MISMATCH/);
    const committedInventory = control(controllerSource, state, "inventory");
    assert.deepEqual(committedInventory.gateways, []);
    assert.equal(committedInventory.release_receipts.length, 1);
    assert.equal(Object.hasOwn(committedInventory.release_receipts[0], "reservation_token"), false, "receipt must never retain the raw token");
    assert.equal(lstatSync(path.join(state, "gateways.json")).mode & 0o777, 0o600);
    assert.equal(existsSync(project), false);
    assert.deepEqual(treeSnapshot(committed.artifact_tombstone), beforeCommit);
  } finally {
    if (existsSync(path.join(project, "z-locked"))) chmodSync(path.join(project, "z-locked"), 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

test("release commit resumes after tombstone rename and rejects corrupt or symlinked durable state", () => {
  for (const corruption of ["tombstone", "receipt", "inventory-symlink"]) {
    const root = mkdtempSync(path.join(os.tmpdir(), `nacl-vps-release-${corruption}-`));
    const state = path.join(root, "state");
    const project = path.join(state, "project-a");
    try {
      const reserved = control(controllerSource, state, "reserve", ["--scope", "project-a", "--port", "7443"]);
      mkdirSync(project, { recursive: true });
      writeFileSync(path.join(project, "owned-artifact"), "durable\n", { mode: 0o640 });
      control(controllerSource, state, "release", ["--scope", "project-a", "--reservation-token", reserved.reservation_token]);
      const tokenDigest = createHash("sha256").update(reserved.reservation_token).digest("hex");
      const tombstone = path.join(state, `.nacl-release-project-a-${tokenDigest}`);
      renameSync(project, tombstone);
      const committed = control(controllerSource, state, "release-commit", ["--scope", "project-a", "--reservation-token", reserved.reservation_token]);
      assert.equal(committed.artifact_tombstone, tombstone);
      assert.deepEqual(control(controllerSource, state, "release-commit", ["--scope", "project-a", "--reservation-token", reserved.reservation_token]), committed);

      const inventoryPath = path.join(state, "gateways.json");
      if (corruption === "tombstone") {
        writeFileSync(path.join(tombstone, "owned-artifact"), "tampered\n");
        const failed = tryControl(controllerSource, state, "release-commit", ["--scope", "project-a", "--reservation-token", reserved.reservation_token]);
        assert.notEqual(failed.status, 0);
        assert.match(failed.stderr, /RELEASE_RECEIPT_STATE_MISMATCH/);
        continue;
      } else if (corruption === "receipt") {
        const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
        inventory.release_receipts[0].token_digest = "corrupt";
        writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, { mode: 0o600 });
      } else {
        const target = path.join(state, "gateways.backing.json");
        renameSync(inventoryPath, target);
        symlinkSync(target, inventoryPath);
      }
      const failed = tryControl(controllerSource, state, "inventory");
      assert.notEqual(failed.status, 0);
      assert.match(failed.stderr, /INVENTORY_INVALID/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
