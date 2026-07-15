import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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
  mkdirSync(vps, { recursive: true });
  mkdirSync(templateDir, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const realController = path.join(vps, "server-access-control.real.mjs");
  copyFileSync(controllerSource, realController);
  writeFileSync(path.join(vps, "server-access-control.mjs"), `
import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const action = args[0] ?? "missing";
const cnIndex = args.indexOf("--cn");
if (process.env.FAKE_CONTROL_LOG) appendFileSync(process.env.FAKE_CONTROL_LOG, \`${'${action}'}:${'${cnIndex >= 0 ? args[cnIndex + 1] : "-"}'}\\n\`);
if (action === "grant" && process.env.FAIL_GRANT_COMMAND === "1") process.exit(37);
const result = spawnSync(process.execPath, [${JSON.stringify(realController)}, ...args], { stdio: "inherit", env: process.env });
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
  return { root, state, skills, vps, cli, bin, log, controlLog };
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
      FAKE_LISTEN_PORT: "7445",
      ...extraEnv,
    },
  });
}

function logLines(ctx) {
  return existsSync(ctx.log) ? readFileSync(ctx.log, "utf8").trim().split("\n").filter(Boolean) : [];
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

test("failed owned-artifact cleanup is retryable and keeps the port reserved until commit", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "nacl-vps-release-r2-"));
  const state = path.join(root, "state");
  const project = path.join(state, "project-a");
  try {
    const reserved = control(controllerSource, state, "reserve", ["--scope", "project-a", "--port", "7443"]);
    mkdirSync(project, { recursive: true });
    writeFileSync(path.join(project, "owned-artifact"), "keep until cleanup succeeds\n");
    const pending = control(controllerSource, state, "release", ["--scope", "project-a", "--reservation-token", reserved.reservation_token]);
    assert.equal(pending.status, "PENDING");
    assert.equal(pending.code, "GATEWAY_RESERVATION_RELEASE_PENDING");

    chmodSync(project, 0o500);
    const failed = tryControl(controllerSource, state, "release-commit", ["--scope", "project-a", "--reservation-token", reserved.reservation_token]);
    assert.notEqual(failed.status, 0);
    assert.equal(control(controllerSource, state, "inventory").gateways[0].release_pending, true);
    const collision = tryControl(controllerSource, state, "reserve", ["--scope", "project-b", "--port", "7443"]);
    assert.notEqual(collision.status, 0);
    assert.match(collision.stderr, /GATEWAY_COLLISION/);

    chmodSync(project, 0o700);
    const committed = control(controllerSource, state, "release-commit", ["--scope", "project-a", "--reservation-token", reserved.reservation_token]);
    assert.equal(committed.code, "GATEWAY_RESERVATION_RELEASED");
    assert.deepEqual(control(controllerSource, state, "inventory").gateways, []);
    assert.equal(existsSync(project), false);
  } finally {
    if (existsSync(project)) chmodSync(project, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});
