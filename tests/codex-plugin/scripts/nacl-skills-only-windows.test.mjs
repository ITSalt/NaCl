import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const windows = process.platform === "win32";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const bootstrap = path.join(repoRoot, "codex-plugin-src", "package", "resources", "bootstrap");
const packagedBootstrap = path.join(repoRoot, "plugins", "nacl", "resources", "bootstrap");
const protectedEnvHelper = path.join(packagedBootstrap, "protected-env.ps1");

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", timeout: 30_000, ...options });
}

test("Windows Skills-only security path executes natively without Docker", { skip: !windows }, async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nacl-windows-security-")));
  try {
    const planProject = path.join(root, "plan-project");
    await mkdir(planProject);
    const planRunner = path.join(packagedBootstrap, "plan-project-graph.mjs");
    const planSelection = ["--project-root", planProject, "--project-id", "win-plan", "--bolt-port", "38687", "--http-port", "38474", "--database", "neo4j"];
    const planned = run(process.execPath, [planRunner, ...planSelection]);
    assert.equal(planned.status, 0, `${planned.stdout}\n${planned.stderr}`);
    const plan = JSON.parse(planned.stdout);
    assert.equal(plan.confirmation, `INIT_LOCAL_GRAPH:win-plan:${plan.planHash}`);
    const verifiedPlan = run(process.execPath, [planRunner, ...planSelection, "--verify-token", plan.confirmation]);
    assert.equal(verifiedPlan.status, 0, `${verifiedPlan.stdout}\n${verifiedPlan.stderr}`);
    const aliasProject = path.join(root, "plan-project-alias");
    await symlink(planProject, aliasProject, "junction");
    const aliasSelection = ["--project-root", aliasProject, "--project-id", "win-plan", "--bolt-port", "38687", "--http-port", "38474", "--database", "neo4j"];
    const aliasPlan = run(process.execPath, [planRunner, ...aliasSelection]);
    assert.notEqual(aliasPlan.status, 0);
    assert.equal(JSON.parse(aliasPlan.stderr).code, "PROJECT_ROOT_NOT_CANONICAL");
    const aliasApply = run("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(packagedBootstrap, "setup-project-graph.ps1"),
      "-ProjectRoot", aliasProject, "-ProjectId", "win-plan", "-BoltPort", "38687", "-HttpPort", "38474", "-Confirmation", plan.confirmation,
    ]);
    assert.notEqual(aliasApply.status, 0);
    assert.match(aliasApply.stderr, /PROJECT_ROOT_NOT_CANONICAL/);
    await assert.rejects(readFile(path.join(planProject, "graph-infra", ".env")), /ENOENT/);
    await writeFile(path.join(planProject, ".gitignore"), "changed\n");
    const stalePlan = run(process.execPath, [planRunner, ...planSelection, "--verify-token", plan.confirmation]);
    assert.notEqual(stalePlan.status, 0);
    assert.equal(JSON.parse(stalePlan.stderr).code, "PLAN_TOKEN_STALE");

    const malformedProject = path.join(root, "malformed");
    await mkdir(path.join(malformedProject, ".codex"), { recursive: true });
    const malformed = "model=\"a\"\nmodel=\"b\"\n";
    const malformedConfig = path.join(malformedProject, ".codex", "config.toml");
    await writeFile(malformedConfig, malformed);
    const blocked = run("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(packagedBootstrap, "setup-project-graph.ps1"),
      "-ProjectRoot", malformedProject, "-ProjectId", "win-malformed", "-BoltPort", "37687", "-HttpPort", "37474", "-Confirmation", `INIT_LOCAL_GRAPH:win-malformed:${"a".repeat(64)}`,
    ]);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /CODEX_CONFIG_MALFORMED/);
    assert.equal(await readFile(malformedConfig, "utf8"), malformed);
    await assert.rejects(readFile(path.join(malformedProject, "graph-infra", ".env")), /ENOENT/);

    const project = path.join(root, "project");
    const scripts = path.join(project, "graph-infra", "scripts");
    const binDir = path.join(project, "graph-infra", "bin");
    await mkdir(path.join(project, ".codex"), { recursive: true });
    await mkdir(scripts, { recursive: true });
    await mkdir(binDir);
    const launcher = path.join(scripts, "nacl-neo4j-mcp-launcher.mjs");
    const supplySource = path.join(bootstrap, "neo4j-mcp-supply.mjs");
    await copyFile(path.join(bootstrap, "project-neo4j-launcher.mjs"), launcher);
    await copyFile(supplySource, path.join(scripts, "neo4j-mcp-supply.mjs"));
    const binary = path.join(binDir, "neo4j-mcp.exe");
    await copyFile(process.execPath, binary);
    const binarySha256 = createHash("sha256").update(await readFile(binary)).digest("hex");
    const pin = `version=v9.9.9\nasset_windows_${process.arch === "arm64" ? "arm64" : "x86_64"}=neo4j-mcp_Windows_${process.arch === "arm64" ? "arm64" : "x86_64"}.zip\narchive_sha256_windows_${process.arch === "arm64" ? "arm64" : "x86_64"}=${"a".repeat(64)}\nbinary_sha256_windows_${process.arch === "arm64" ? "arm64" : "x86_64"}=${binarySha256}\n`;
    const pinPath = path.join(scripts, "neo4j-mcp-release.pin");
    await writeFile(pinPath, pin);
    const supply = await import(`${pathToFileURL(supplySource).href}?windows=${Date.now()}`);
    const identity = supply.releaseIdentity(pinPath);
    await writeFile(path.join(binDir, "neo4j-mcp.receipt.json"), supply.receiptBytes(identity));
    const envFile = path.join(project, "graph-infra", ".env");
    const protectedEnvDriver = path.join(root, "create-protected-env.ps1");
    await writeFile(protectedEnvDriver, [
      "param([string]$Helper,[string]$Target,[string]$Icacls)",
      ". $Helper",
      "$content = \"COMPOSE_PROJECT_NAME=win-project-graph`nCONTAINER_PREFIX=win-project`nNEO4J_PASSWORD=windows-secret-with-at-least-thirty-two-bytes`nNEO4J_HTTP_PORT=37474`nNEO4J_BOLT_PORT=37687`n\"",
      "Write-ProtectedEnv -Target $Target -Content $content -IcaclsPath $Icacls",
      "Assert-ProtectedEnvAcl -Path $Target -IcaclsPath $Icacls",
      "Write-Output 'PROTECTED_ENV_CREATED'",
      "",
    ].join("\n"));
    const icaclsPath = path.join(process.env.SystemRoot, "System32", "icacls.exe");
    const acl = run("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", protectedEnvDriver,
      "-Helper", protectedEnvHelper, "-Target", envFile, "-Icacls", icaclsPath,
    ]);
    assert.equal(acl.status, 0, `${acl.stdout}\n${acl.stderr}`);
    assert.match(acl.stdout, /PROTECTED_ENV_CREATED/);

    const runtimeEnv = {
      SystemRoot: process.env.SystemRoot,
      NEO4J_URI: "bolt://127.0.0.1:37687",
      NEO4J_USERNAME: "neo4j",
      NEO4J_DATABASE: "neo4j",
      NEO4J_MCP_VERSION: "v9.9.9",
    };
    const verified = run(process.execPath, [launcher, "--verify-supply-only", "--binary", binary], { env: runtimeEnv });
    assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
    assert.match(verified.stdout, /status=VERIFIED receipt=strict binary=pinned/);
    await writeFile(path.join(binDir, "neo4j-mcp.receipt.json"), "{}\n");
    const receiptTamper = run(process.execPath, [launcher, "--verify-supply-only", "--binary", binary], { env: runtimeEnv });
    assert.notEqual(receiptTamper.status, 0);
    assert.match(receiptTamper.stderr, /BINARY_RECEIPT_MISMATCH/);

    const writer = path.join(bootstrap, "write-codex-mcp-config.mjs");
    const binding = ["--project-root", project, "--node", process.execPath, "--launcher", launcher, "--binary", binary, "--uri", "bolt://localhost:37687", "--database", "neo4j"];
    const merged = run(process.execPath, [writer, ...binding]);
    assert.equal(merged.status, 0, `${merged.stdout}\n${merged.stderr}`);
    const config = await readFile(path.join(project, ".codex", "config.toml"), "utf8");
    assert.match(config, /\[mcp_servers\.nacl_neo4j\]/);
    assert.doesNotMatch(config, /password|secret/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
