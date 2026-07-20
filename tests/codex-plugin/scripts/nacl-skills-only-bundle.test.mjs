import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const bootstrap = path.join(repoRoot, "codex-plugin-src", "package", "resources", "bootstrap");
const packagedBootstrap = path.join(repoRoot, "plugins", "nacl", "resources", "bootstrap");
const writer = path.join(bootstrap, "write-codex-mcp-config.mjs");
const guard = path.join(bootstrap, "codex-config-guard.mjs");
const launcherSource = path.join(bootstrap, "project-neo4j-launcher.mjs");
const supplySource = path.join(bootstrap, "neo4j-mcp-supply.mjs");
const planRunner = path.join(packagedBootstrap, "plan-project-graph.mjs");
const binaryInstaller = path.join(packagedBootstrap, "install-pinned-neo4j-mcp.mjs");

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", timeout: 30_000, ...options });
}

function binding(root) {
  return [
    "--project-root", root,
    "--node", process.execPath,
    "--launcher", path.join(root, "graph-infra", "scripts", "nacl-neo4j-mcp-launcher.mjs"),
    "--binary", process.platform === "win32" ? process.execPath : "/usr/bin/true",
    "--uri", "bolt://localhost:7687",
    "--database", "neo4j",
  ];
}

function bootstrapSelection(root, projectId, boltPort, httpPort) {
  return [
    "--project-root", root,
    "--project-id", projectId,
    "--bolt-port", String(boltPort),
    "--http-port", String(httpPort),
    "--database", "neo4j",
  ];
}

function createBootstrapPlan(root, projectId, boltPort, httpPort, options = {}) {
  const result = run(process.execPath, [planRunner, ...bootstrapSelection(root, projectId, boltPort, httpPort)], options);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

test("secure Codex TOML writer appends one managed MCP section and preserves unrelated bytes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-secure-mcp-"));
  try {
    await mkdir(path.join(root, ".codex"));
    const original = "model = \"gpt-5\"\n\n[mcp_servers.other]\ncommand = \"/usr/bin/other\"\nargs = []\n";
    const filename = path.join(root, ".codex", "config.toml");
    await writeFile(filename, original);
    const result = run(process.execPath, [writer, ...binding(root)]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const raw = await readFile(filename, "utf8");
    assert.ok(raw.startsWith(original), "unrelated TOML prefix changed");
    assert.match(raw, /# >>> NaCl managed MCP: nacl_neo4j/);
    assert.match(raw, /\[mcp_servers\.nacl_neo4j\]/);
    assert.ok(raw.includes(`command = ${JSON.stringify(process.execPath)}`));
    assert.match(raw, /args = \[.*nacl-neo4j-mcp-launcher\.mjs.*"--binary"/);
    assert.match(raw, /env = \{ NEO4J_URI = "bolt:\/\/localhost:7687", NEO4J_USERNAME = "neo4j", NEO4J_DATABASE = "neo4j", NEO4J_TELEMETRY = "false" \}/);
    assert.doesNotMatch(raw, /password|secret|credential/i);
    const parsed = run("python3", ["-c", "import json,sys,tomllib; d=tomllib.load(open(sys.argv[1],'rb')); print(json.dumps(d['mcp_servers']['nacl_neo4j']))", filename]);
    assert.equal(parsed.status, 0, `${parsed.stdout}\n${parsed.stderr}`);
    const server = JSON.parse(parsed.stdout);
    assert.equal(server.command, process.execPath);
    assert.deepEqual(server.args, [binding(root)[5], "--binary", binding(root)[7]]);
    assert.equal(server.env.NEO4J_PASSWORD, undefined);
    const readback = run(process.execPath, [guard, "--phase", "readback", ...binding(root)]);
    assert.equal(readback.status, 0, `${readback.stdout}\n${readback.stderr}`);
    assert.match(readback.stdout, /state=ready/);
    const idempotent = run(process.execPath, [writer, ...binding(root)]);
    assert.equal(idempotent.status, 0, `${idempotent.stdout}\n${idempotent.stderr}`);
    assert.equal(await readFile(filename, "utf8"), raw);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("vendored TOML parser is pinned with exact BSD provenance", async () => {
  const vendor = path.join(bootstrap, "vendor");
  assert.equal(createHash("sha256").update(await readFile(path.join(vendor, "smol-toml-1.7.0.cjs"))).digest("hex"), "173006d8b690034d636c1af4dc6836db8dc6a708bcd4fea90c8d04ea250afa7d");
  assert.equal(createHash("sha256").update(await readFile(path.join(vendor, "smol-toml-LICENSE.txt"))).digest("hex"), "fa5659948374d4f555594f47f6da073b40dc503e921aeeece30df4362b3051a5");
  const provenance = await readFile(path.join(vendor, "PROVENANCE.md"), "utf8");
  assert.match(provenance, /Package: `smol-toml`[\s\S]*Version: `1\.7\.0`/);
  assert.match(provenance, /BSD-3-Clause/);
  assert.match(provenance, /sha512-aqVvWoyO21L23mb/);
});

test("Codex TOML guard and writer fail closed without changing malformed, conflicting, or duplicate sections", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-mcp-no-clobber-"));
  try {
    await mkdir(path.join(root, ".codex"));
    const cases = [
      ["malformed", "{not-toml\n", /CODEX_CONFIG_MALFORMED/],
      ["duplicate-key", "model = \"a\"\nmodel = \"b\"\n", /CODEX_CONFIG_MALFORMED/],
      ["invalid-bare", "foo = ???\n", /CODEX_CONFIG_MALFORMED/],
      ["broken-array", "features = [\"one\",\n", /CODEX_CONFIG_MALFORMED/],
      ["broken-table", "[mcp_servers.other\ncommand = \"x\"\n", /CODEX_CONFIG_MALFORMED/],
      ["broken-string", "model = \"unterminated\n", /CODEX_CONFIG_MALFORMED/],
      ["conflict", "# >>> NaCl managed MCP: nacl_neo4j\n[mcp_servers.nacl_neo4j]\ncommand = \"/different\"\nargs = []\n# <<< NaCl managed MCP: nacl_neo4j\n", /CODEX_MCP_CONFIG_CONFLICT/],
      ["duplicate", "[mcp_servers.nacl_neo4j]\ncommand = \"one\"\n\n[mcp_servers.\"nacl_neo4j\"]\ncommand = \"two\"\n", /CODEX_CONFIG_MALFORMED/],
    ];
    for (const [name, bytes, pattern] of cases) {
      const filename = path.join(root, ".codex", "config.toml");
      await writeFile(filename, bytes);
      const preflight = run(process.execPath, [guard, "--phase", "preflight", ...binding(root)]);
      assert.notEqual(preflight.status, 0, name);
      assert.match(preflight.stderr, pattern, name);
      assert.equal(await readFile(filename, "utf8"), bytes, name);
      const mutation = run(process.execPath, [writer, ...binding(root)]);
      assert.notEqual(mutation.status, 0, name);
      assert.match(mutation.stderr, pattern, name);
      assert.equal(await readFile(filename, "utf8"), bytes, name);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project launcher accepts only a protected project env and never prints its secret", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-launcher-"));
  const scripts = path.join(root, "graph-infra", "scripts");
  try {
    await mkdir(scripts, { recursive: true });
    const launcher = path.join(scripts, "nacl-neo4j-mcp-launcher.mjs");
    await copyFile(launcherSource, launcher);
    await copyFile(supplySource, path.join(scripts, "neo4j-mcp-supply.mjs"));
    const binDir = path.join(root, "graph-infra", "bin");
    await mkdir(binDir);
    const binary = path.join(binDir, "neo4j-mcp");
    const probeSource = path.join(root, "environment-probe.c");
    await writeFile(probeSource, "#include <stdio.h>\nextern char **environ;\nint main(void){for(char **e=environ;*e;e++) puts(*e);return 0;}\n");
    const compileProbe = () => {
      const compiled = run("cc", [probeSource, "-o", binary]);
      assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`);
    };
    compileProbe();
    await chmod(binary, 0o700);
    const canonicalBinary = await realpath(binary);
    const binarySha256 = createHash("sha256").update(await readFile(binary)).digest("hex");
    const platform = process.platform === "darwin" ? "darwin" : "linux";
    const architecture = process.arch === "arm64" ? "arm64" : "x86_64";
    const label = platform === "darwin" ? "Darwin" : "Linux";
    const asset = `neo4j-mcp_${label}_${architecture}.tar.gz`;
    const pin = `version=v9.9.9\nasset_${platform}_${architecture}=${asset}\narchive_sha256_${platform}_${architecture}=${"a".repeat(64)}\nbinary_sha256_${platform}_${architecture}=${binarySha256}\n`;
    const pinPath = path.join(scripts, "neo4j-mcp-release.pin");
    await writeFile(pinPath, pin);
    const supply = await import(`${pathToFileURL(supplySource).href}?launcher-test=${Date.now()}`);
    const identity = supply.releaseIdentity(pinPath);
    await writeFile(path.join(binDir, "neo4j-mcp.receipt.json"), supply.receiptBytes(identity), { mode: 0o600 });
    const secret = "opaque-value-that-must-never-be-printed-1234567890";
    const envFile = path.join(root, "graph-infra", ".env");
    await writeFile(envFile, `COMPOSE_PROJECT_NAME=demo-graph\nCONTAINER_PREFIX=demo\nNEO4J_PASSWORD=${secret}\nNEO4J_HTTP_PORT=7474\nNEO4J_BOLT_PORT=7687\n`, { mode: 0o600 });
    await chmod(envFile, 0o600);
    const checked = run(process.execPath, [launcher, "--check-only"]);
    assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);
    assert.match(checked.stdout, /status=VERIFIED secret=protected/);
    assert.doesNotMatch(`${checked.stdout}\n${checked.stderr}`, new RegExp(secret));
    const runtimeEnv = {
      NEO4J_URI: "bolt://127.0.0.1:7687",
      NEO4J_USERNAME: "neo4j",
      NEO4J_DATABASE: "neo4j",
      NEO4J_MCP_VERSION: "v9.9.9",
      UNRELATED_HOST_SECRET: "must-not-cross-launcher",
    };
    const verified = run(process.execPath, [launcher, "--binary", canonicalBinary], { env: runtimeEnv });
    assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
    assert.doesNotMatch(verified.stdout, /UNRELATED_HOST_SECRET|must-not-cross-launcher/);
    assert.deepEqual(new Set(verified.stdout.trim().split(/\r?\n/)), new Set([
      "NEO4J_URI=bolt://127.0.0.1:7687",
      "NEO4J_USERNAME=neo4j",
      `NEO4J_PASSWORD=${secret}`,
      "NEO4J_DATABASE=neo4j",
      "NEO4J_TELEMETRY=false",
    ]));
    const override = run(process.execPath, [launcher, "--binary", canonicalBinary], { env: { ...runtimeEnv, NEO4J_MCP_VERSION: "latest" } });
    assert.notEqual(override.status, 0);
    assert.match(override.stderr, /BINARY_VERSION_OVERRIDE_FORBIDDEN/);
    await writeFile(binary, "tampered\n");
    await chmod(binary, 0o700);
    const tampered = run(process.execPath, [launcher, "--binary", canonicalBinary], { env: runtimeEnv });
    assert.notEqual(tampered.status, 0);
    assert.match(tampered.stderr, /BINARY_DIGEST_MISMATCH/);
    compileProbe();
    await chmod(binary, 0o700);
    const receipt = path.join(binDir, "neo4j-mcp.receipt.json");
    await writeFile(receipt, "{}\n", { mode: 0o600 });
    const receiptTamper = run(process.execPath, [launcher, "--binary", canonicalBinary], { env: runtimeEnv });
    assert.notEqual(receiptTamper.status, 0);
    assert.match(receiptTamper.stderr, /BINARY_RECEIPT_MISMATCH/);
    await writeFile(receipt, supply.receiptBytes(identity), { mode: 0o600 });
    const cache = path.join(root, "graph-infra", "cache");
    await mkdir(cache);
    const cacheTamper = run(process.execPath, [launcher, "--binary", canonicalBinary], { env: runtimeEnv });
    assert.notEqual(cacheTamper.status, 0);
    assert.match(cacheTamper.stderr, /UNTRUSTED_BINARY_CACHE_PRESENT/);
    await rm(cache, { recursive: true });
    await rm(binary);
    await symlink("/usr/bin/env", binary);
    const linked = run(process.execPath, [launcher, "--binary", canonicalBinary], { env: runtimeEnv });
    assert.notEqual(linked.status, 0);
    assert.match(linked.stderr, /BINARY_RECEIPT_UNSAFE|binary path does not match/);
    await rm(binary);
    compileProbe();
    await chmod(binary, 0o700);
    await chmod(envFile, 0o644);
    const broad = run(process.execPath, [launcher, "--binary", canonicalBinary], { env: runtimeEnv });
    assert.notEqual(broad.status, 0);
    assert.match(broad.stderr, /permissions are too broad/);
    assert.doesNotMatch(broad.stderr, new RegExp(secret));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("POSIX bootstrap blocks a symlinked graph directory before writing outside the project", { skip: process.platform === "win32" }, async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nacl-bootstrap-symlink-")));
  const project = path.join(root, "project");
  const outside = path.join(root, "outside");
  try {
    await mkdir(project);
    await mkdir(outside);
    await writeFile(path.join(outside, "sentinel"), "preserved\n");
    await symlink(outside, path.join(project, "graph-infra"));
    const result = run("sh", [
      path.join(packagedBootstrap, "setup-project-graph.sh"),
      "--project-root", project,
      "--project-id", "demo-alpha",
      "--bolt-port", "17687",
      "--http-port", "17474",
      "--confirmation", `INIT_LOCAL_GRAPH:demo-alpha:${"a".repeat(64)}`,
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /code=DIRECTORY_UNSAFE/);
    assert.equal(await readFile(path.join(outside, "sentinel"), "utf8"), "preserved\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("OS bootstrap scripts are bundle-relative, confirmation-gated, pinned, and secret-argument-free", async () => {
  const [posix, powershell] = await Promise.all([
    readFile(path.join(bootstrap, "setup-project-graph.sh"), "utf8"),
    readFile(path.join(bootstrap, "setup-project-graph.ps1"), "utf8"),
  ]);
  for (const content of [posix, powershell]) {
    assert.match(content, /INIT_LOCAL_GRAPH:/);
    assert.match(content, /plan-project-graph\.mjs/);
    assert.match(content, /verify-token|VerifyToken/);
    assert.match(content, /PARTIALLY_VERIFIED/);
    assert.match(content, /RESTART_REQUIRED/);
    assert.match(content, /codex-config-guard\.mjs/);
    assert.match(content, /write-codex-mcp-config\.mjs/);
    assert.match(content, /project-neo4j-launcher\.mjs/);
    assert.match(content, /apply-project-schema\.mjs/);
    assert.match(content, /neo4j-mcp-release\.pin/);
    assert.match(content, /install-pinned-neo4j-mcp\.mjs/);
    assert.match(content, /rollback-project-bootstrap\.mjs/);
    assert.match(content, /graph-infra/);
    assert.match(content, /\.env/);
    assert.match(content, /\.codex\/config\.toml/);
    assert.doesNotMatch(content, /\.neo4j-mcp-bin/);
    assert.doesNotMatch(content, /\/Users\/|[A-Za-z]:\\Users\\|NaCl-worker|~\/\.claude/);
    assert.doesNotMatch(content, /--password\s+[^|]/);
  }
  const syntax = run("sh", ["-n", path.join(bootstrap, "setup-project-graph.sh")]);
  assert.equal(syntax.status, 0, syntax.stderr);
});

test("local archive checksum probe is public, read-only, size-bounded, and preserves mismatched input", async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nacl-archive-probe-")));
  try {
    const project = path.join(root, "project");
    const artifact = path.join(root, "reviewer-artifact.bin");
    const zero = path.join(root, "empty.bin");
    const oversized = path.join(root, "oversized.bin");
    const fakeBin = path.join(root, "fake-bin");
    const marker = path.join(root, "external-command-called");
    await mkdir(project);
    await mkdir(fakeBin);
    await writeFile(path.join(project, "sentinel"), "project-preserved\n");
    await writeFile(artifact, "untrusted reviewer fixture");
    await writeFile(zero, "");
    await writeFile(oversized, "x");
    await truncate(oversized, 64 * 1024 * 1024 + 1);
    await writeFile(path.join(fakeBin, "tar"), `#!/bin/sh\nprintf called > "$MARKER"\nexit 99\n`);
    await chmod(path.join(fakeBin, "tar"), 0o700);
    const protectedFiles = [
      path.join(bootstrap, "install-pinned-neo4j-mcp.mjs"),
      binaryInstaller,
      path.join(packagedBootstrap, "neo4j-mcp-release.pin"),
    ];
    const before = await Promise.all(protectedFiles.map((filename) => readFile(filename)));
    const supply = await import(`${pathToFileURL(path.join(packagedBootstrap, "neo4j-mcp-supply.mjs")).href}?archive-probe=${Date.now()}`);
    const identity = supply.releaseIdentity(path.join(packagedBootstrap, "neo4j-mcp-release.pin"));
    const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ""}` };

    const mismatch = run(process.execPath, [binaryInstaller, "--verify-archive", artifact], { env, cwd: project });
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /NACL_BINARY_ARCHIVE_CHECKSUM: status=BLOCKED code=BINARY_ARCHIVE_CHECKSUM_MISMATCH/);
    assert.match(mismatch.stderr, new RegExp(`expected_sha256=${identity.archiveSha256}`));
    assert.match(mismatch.stderr, /actual_sha256=d383404402e24a4bc4ca1ad169293a81e12d630b3bd8c4f8f5249f5b564447e6/);
    assert.match(mismatch.stderr, /artifact_disposition=PRESERVED_INPUT mutation=NONE/);
    assert.equal(await readFile(artifact, "utf8"), "untrusted reviewer fixture");
    assert.equal(await readFile(path.join(project, "sentinel"), "utf8"), "project-preserved\n");
    await assert.rejects(readFile(path.join(project, "graph-infra", "bin", "neo4j-mcp")), /ENOENT/);
    await assert.rejects(readFile(marker), /ENOENT/);

    const relative = run(process.execPath, [binaryInstaller, "--verify-archive", path.basename(artifact)], { cwd: root });
    assert.notEqual(relative.status, 0);
    assert.match(relative.stderr, /code=BINARY_ARCHIVE_PATH_UNSAFE/);
    const directory = run(process.execPath, [binaryInstaller, "--verify-archive", project]);
    assert.notEqual(directory.status, 0);
    assert.match(directory.stderr, /code=BINARY_ARCHIVE_PATH_UNSAFE/);
    const empty = run(process.execPath, [binaryInstaller, "--verify-archive", zero]);
    assert.notEqual(empty.status, 0);
    assert.match(empty.stderr, /code=BINARY_ARCHIVE_SIZE_INVALID/);
    const tooLarge = run(process.execPath, [binaryInstaller, "--verify-archive", oversized]);
    assert.notEqual(tooLarge.status, 0);
    assert.match(tooLarge.stderr, /code=BINARY_ARCHIVE_SIZE_INVALID/);
    if (process.platform !== "win32") {
      const alias = path.join(root, "artifact-alias.bin");
      await symlink(artifact, alias);
      const linked = run(process.execPath, [binaryInstaller, "--verify-archive", alias]);
      assert.notEqual(linked.status, 0);
      assert.match(linked.stderr, /code=BINARY_ARCHIVE_PATH_UNSAFE/);
    }
    const after = await Promise.all(protectedFiles.map((filename) => readFile(filename)));
    assert.deepEqual(after, before);
    assert.deepEqual((await readdir(project)).sort(), ["sentinel"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("content-addressed bootstrap plan is read-only and rejects stale root, ports, files, and legacy tokens", { skip: process.platform === "win32" }, async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nacl-bootstrap-plan-")));
  try {
    const project = path.join(root, "project");
    const otherProject = path.join(root, "other-project");
    const fakeBin = path.join(root, "fake-bin");
    const marker = path.join(root, "docker-called");
    await mkdir(project);
    await mkdir(otherProject);
    await mkdir(fakeBin);
    await writeFile(path.join(project, ".gitignore"), "preserved\n");
    await writeFile(path.join(fakeBin, "docker"), `#!/bin/sh\nprintf called > "$MARKER"\nexit 0\n`);
    await chmod(path.join(fakeBin, "docker"), 0o700);
    const env = { ...process.env, PATH: `${fakeBin}:${path.dirname(process.execPath)}:/usr/bin:/bin`, MARKER: marker };

    const planned = createBootstrapPlan(project, "demo-plan", 29687, 29474, { env });
    assert.equal(planned.contract, "nacl-skills-only-bootstrap-plan-v1");
    assert.equal(planned.status, "NOT_RUN");
    assert.equal(planned.code, "PLAN_READY");
    assert.match(planned.planHash, /^[0-9a-f]{64}$/);
    assert.equal(planned.confirmation, `INIT_LOCAL_GRAPH:demo-plan:${planned.planHash}`);
    assert.equal(planned.plan.canonicalProjectRoot, await realpath(project));
    assert.equal(planned.plan.projectId, "demo-plan");
    assert.equal(planned.plan.database, "neo4j");
    assert.deepEqual([planned.plan.ports.bolt.port, planned.plan.ports.http.port], [29687, 29474]);
    assert.match(planned.plan.neo4j.image, /^neo4j:5\.24\.2-community@sha256:[0-9a-f]{64}$/);
    assert.equal(planned.plan.neo4j.apoc.sha256, "39092c89df1cb80f4f3d8799821e74c7f1d10503f92625be32882b70b13002fa");
    assert.equal(planned.plan.neo4jMcp.version, "v1.5.3");
    assert.match(planned.plan.neo4jMcp.archiveSha256, /^[0-9a-f]{64}$/);
    assert.match(planned.plan.neo4jMcp.binarySha256, /^[0-9a-f]{64}$/);
    assert.equal(planned.plan.bootstrapPolicyVersion, "nacl-skills-only-bootstrap-policy-v2");
    assert.ok(planned.plan.intendedFiles.some((entry) => entry.destination === "graph-infra/schema/sa-schema.cypher"));
    assert.ok(planned.plan.intendedFiles.every((entry) => entry.destination !== "graph-infra/schema/seed-data.cypher"));
    assert.deepEqual(planned.plan.intendedFileStates.map((entry) => entry.path), planned.plan.intendedFiles.map((entry) => entry.destination));
    assert.ok(planned.plan.bundlePolicyAssets.some((entry) => entry.destination.endsWith("vendor/smol-toml-1.7.0.cjs")));
    assert.equal(planned.plan.currentState.gitignore.state, "FILE");
    assert.equal(planned.plan.rollbackPolicy.existingConfigAndGitignore, "RESTORE_EXACT_PRE_RUN_BYTES");
    await assert.rejects(readFile(marker), /ENOENT/);
    await assert.rejects(readFile(path.join(project, "graph-infra", ".env")), /ENOENT/);

    const verified = run(process.execPath, [planRunner, ...bootstrapSelection(project, "demo-plan", 29687, 29474), "--verify-token", planned.confirmation], { env });
    assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
    assert.equal(JSON.parse(verified.stdout).code, "PLAN_TOKEN_VERIFIED");

    const alias = path.join(root, "project-alias");
    await mkdir(path.join(project, ".codex"));
    await writeFile(path.join(project, ".codex", "config.toml"), "model =");
    await symlink(project, alias);
    const aliasPlan = run(process.execPath, [planRunner, ...bootstrapSelection(alias, "demo-plan", 29687, 29474)], { env });
    assert.notEqual(aliasPlan.status, 0);
    assert.equal(JSON.parse(aliasPlan.stderr).code, "PROJECT_ROOT_NOT_CANONICAL");
    const aliasApply = run("sh", [
      path.join(packagedBootstrap, "setup-project-graph.sh"),
      ...bootstrapSelection(alias, "demo-plan", 29687, 29474),
      "--confirmation", planned.confirmation,
    ], { env });
    assert.notEqual(aliasApply.status, 0);
    assert.match(aliasApply.stderr, /status=BLOCKED code=PROJECT_ROOT_NOT_CANONICAL/);
    assert.equal(await readFile(path.join(project, ".gitignore"), "utf8"), "preserved\n");
    assert.equal(await readFile(path.join(project, ".codex", "config.toml"), "utf8"), "model =");
    await assert.rejects(readFile(marker), /ENOENT/);
    await assert.rejects(readFile(path.join(project, "graph-infra", ".env")), /ENOENT/);

    await writeFile(path.join(project, ".gitignore"), "changed\n");
    for (const selection of [
      bootstrapSelection(project, "demo-plan", 29687, 29474),
      bootstrapSelection(project, "demo-plan", 29688, 29474),
      bootstrapSelection(otherProject, "demo-plan", 29687, 29474),
    ]) {
      const stale = run(process.execPath, [planRunner, ...selection, "--verify-token", planned.confirmation], { env });
      assert.notEqual(stale.status, 0);
      assert.equal(JSON.parse(stale.stderr).code, "PLAN_TOKEN_STALE");
    }
    assert.equal(await readFile(path.join(project, ".gitignore"), "utf8"), "changed\n");
    await assert.rejects(readFile(marker), /ENOENT/);

    const legacy = run("sh", [
      path.join(packagedBootstrap, "setup-project-graph.sh"),
      "--project-root", project,
      "--project-id", "demo-plan",
      "--bolt-port", "29687",
      "--http-port", "29474",
      "--confirmation", "INIT_LOCAL_GRAPH:demo-plan",
    ], { env });
    assert.notEqual(legacy.status, 0);
    assert.match(legacy.stderr, /code=CONFIRMATION_REQUIRED/);
    await assert.rejects(readFile(marker), /ENOENT/);
    await assert.rejects(readFile(path.join(project, "graph-infra", ".env")), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("file-only diagnosis distinguishes uninitialized and blocked partial bootstrap without Docker", async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nacl-bootstrap-diagnose-")));
  try {
    const project = path.join(root, "project");
    const fakeBin = path.join(root, "fake-bin");
    const marker = path.join(root, "docker-called");
    await mkdir(project);
    await mkdir(fakeBin);
    await writeFile(path.join(fakeBin, "docker"), `#!/bin/sh\nprintf called > "$MARKER"\nexit 0\n`);
    await chmod(path.join(fakeBin, "docker"), 0o700);
    const env = { ...process.env, PATH: `${fakeBin}:${path.dirname(process.execPath)}:/usr/bin:/bin`, MARKER: marker };
    const fresh = run(process.execPath, [planRunner, "--diagnose-only", "--project-root", project], { env });
    assert.equal(fresh.status, 0, `${fresh.stdout}\n${fresh.stderr}`);
    const freshResult = JSON.parse(fresh.stdout);
    assert.deepEqual(
      { status: freshResult.status, code: freshResult.code, initializationState: freshResult.initializationState },
      { status: "NOT_RUN", code: "PROJECT_MCP_NOT_CONFIGURED", initializationState: "UNINITIALIZED" },
    );
    assert.equal(freshResult.docker, "NOT_INSPECTED");
    await mkdir(path.join(project, "graph-infra"));
    await writeFile(path.join(project, "graph-infra", "docker-compose.yml"), "partial\n");
    const partial = run(process.execPath, [planRunner, "--diagnose-only", "--project-root", project], { env });
    assert.notEqual(partial.status, 0);
    const partialResult = JSON.parse(partial.stdout);
    assert.deepEqual(
      { status: partialResult.status, code: partialResult.code, initializationState: partialResult.initializationState },
      { status: "BLOCKED", code: "PARTIAL_BOOTSTRAP_STATE", initializationState: "BLOCKED" },
    );
    await assert.rejects(readFile(marker), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bootstrap plan fails closed when mandatory schema, query, or migration inputs are missing or symlinked", { skip: process.platform === "win32" }, async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nacl-bootstrap-inputs-")));
  try {
    const bundle = path.join(root, "bundle");
    const project = path.join(root, "project");
    await mkdir(project);
    const built = run(process.execPath, [path.join(repoRoot, "scripts", "build-codex-skills-only.mjs"), "--output", bundle]);
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    const initRoot = path.join(bundle, "skills", "nacl-init");
    const isolatedPlan = path.join(initRoot, "resources", "bootstrap", "plan-project-graph.mjs");
    const selection = ["--project-root", project, "--project-id", "input-check", "--bolt-port", "30687", "--http-port", "30474", "--database", "neo4j"];
    const inputs = [
      [path.join(initRoot, "resources", "graph-infra", "schema", "sa-schema.cypher"), "missing"],
      [path.join(initRoot, "resources", "graph-infra", "queries", "sa-queries.cypher"), "symlink"],
      [path.join(initRoot, "graph", "migrations", "003-schema-resource-identity.json"), "missing"],
    ];
    for (const [filename, mode] of inputs) {
      const original = await readFile(filename);
      await rm(filename);
      if (mode === "symlink") await symlink("/dev/null", filename);
      const blocked = run(process.execPath, [isolatedPlan, ...selection]);
      assert.notEqual(blocked.status, 0, filename);
      assert.match(blocked.stderr, /BUNDLE_RESOURCE_(?:MISSING|UNSAFE)/, filename);
      await rm(filename, { force: true });
      await writeFile(filename, original);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Skills-only Neo4j Compose is immutable and publishes only loopback ports", async () => {
  const compose = await readFile(path.join(bootstrap, "graph-docker-compose.yml"), "utf8");
  assert.match(compose, /image: neo4j:5\.24\.2-community@sha256:2e7e4eea5bc1eec581a3097c018dfeb3747f3638e67a963c10554825c31c1425/);
  assert.match(compose, /127\.0\.0\.1:\$\{NEO4J_HTTP_PORT:-3574\}:7474/);
  assert.match(compose, /127\.0\.0\.1:\$\{NEO4J_BOLT_PORT:-3587\}:7687/);
  assert.doesNotMatch(compose, /^\s+-\s+"\$\{NEO4J_(?:HTTP|BOLT)_PORT/m);
  assert.match(compose, /NEO4J_PLUGINS: '\["apoc"\]'/);
  assert.doesNotMatch(compose, /procedures_(?:unrestricted|allowlist)|latest/i);
  const provenance = await readFile(path.join(bootstrap, "neo4j-image-PROVENANCE.md"), "utf8");
  assert.match(provenance, /docker\.io\/library\/neo4j:5\.24\.2-community/);
  assert.match(provenance, /linux\/amd64[\s\S]*linux\/arm64\/v8/);
  assert.match(provenance, /apoc-5\.24\.2-core\.jar[\s\S]*39092c89df1cb80f4f3d8799821e74c7f1d10503f92625be32882b70b13002fa/);
});

test("Skills-only query rewrite is isolated from canonical plugins and preserves wide UC identifiers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-skills-query-rewrite-"));
  try {
    const bundle = path.join(root, "bundle");
    const built = run(process.execPath, [path.join(repoRoot, "scripts", "build-codex-skills-only.mjs"), "--output", bundle]);
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    const queryRoot = path.join(bundle, "skills", "nacl-init", "resources", "graph-infra", "queries");
    const queryFiles = (await readdir(queryRoot)).filter((entry) => entry.endsWith(".cypher"));
    const shippedQueries = (await Promise.all(queryFiles.map((entry) => readFile(path.join(queryRoot, entry), "utf8")))).join("\n");
    assert.doesNotMatch(shippedQueries, /apoc\.text\.lpad/i);
    const queries = await readFile(path.join(queryRoot, "sa-queries.cypher"), "utf8");
    const start = queries.indexOf("// Query: sa_next_uc_in_module");
    const end = queries.indexOf("// Query:", start + 10);
    const allocator = queries.slice(start, end < 0 ? undefined : end);
    assert.ok(start >= 0);
    assert.doesNotMatch(allocator, /apoc|CALL\s+dbms\.procedures/i);
    assert.match(allocator, /CASE WHEN size\(digits\) < 3/);
    assert.match(allocator, /ELSE digits END AS nextUcId/);
    const canonical = await readFile(path.join(repoRoot, "graph-infra", "queries", "sa-queries.cypher"), "utf8");
    const generated = await readFile(path.join(repoRoot, "plugins", "nacl", "resources", "graph-infra", "queries", "sa-queries.cypher"), "utf8");
    assert.match(canonical, /apoc\.text\.lpad\(toString\(nextNum\), 3, '0'\)/);
    assert.equal(generated, canonical);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preflight rejects adversarial TOML before any project, Docker, or download mutation", { skip: process.platform === "win32" }, async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nacl-preflight-zero-mutation-")));
  try {
    const fakeBin = path.join(root, "fake-bin");
    await mkdir(fakeBin);
    const marker = path.join(root, "docker-called");
    const fakeDocker = path.join(fakeBin, "docker");
    await writeFile(fakeDocker, `#!/bin/sh\nprintf called > "$MARKER"\nexit 0\n`);
    await chmod(fakeDocker, 0o700);
    for (const [name, malformed] of [
      ["duplicate", "model=\"a\"\nmodel=\"b\"\n"],
      ["bare", "foo = ???\n"],
      ["conflict", "[mcp_servers.nacl_neo4j]\ncommand=\"other\"\n"],
    ]) {
      const project = path.join(root, name);
      await mkdir(path.join(project, ".codex"), { recursive: true });
      const config = path.join(project, ".codex", "config.toml");
      await writeFile(config, malformed);
      await writeFile(path.join(project, ".gitignore"), "sentinel\n");
      const result = run("sh", [
        path.join(packagedBootstrap, "setup-project-graph.sh"),
        "--project-root", project,
        "--project-id", `demo-${name}`,
        "--bolt-port", "27687",
        "--http-port", "27474",
        "--confirmation", `INIT_LOCAL_GRAPH:demo-${name}:${"a".repeat(64)}`,
      ], { env: { ...process.env, PATH: `${fakeBin}:${path.dirname(process.execPath)}:/usr/bin:/bin`, MARKER: marker } });
      assert.notEqual(result.status, 0);
      assert.equal(await readFile(config, "utf8"), malformed);
      assert.equal(await readFile(path.join(project, ".gitignore"), "utf8"), "sentinel\n");
      await assert.rejects(readFile(path.join(project, "graph-infra", ".env")), /ENOENT/);
      await assert.rejects(readFile(marker), /ENOENT/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("post-mutation failure rolls back a fresh project and reports an exact inventory", { skip: process.platform === "win32" }, async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nacl-bootstrap-rollback-")));
  try {
    const project = path.join(root, "project");
    const fakeBin = path.join(root, "fake-bin");
    await mkdir(project);
    await mkdir(fakeBin);
    await writeFile(path.join(project, ".gitignore"), "preserved\n");
    const fakeDocker = path.join(fakeBin, "docker");
    await writeFile(fakeDocker, "#!/bin/sh\ncase \"$1\" in info) exit 0;; inspect|volume|network) exit 1;; *) exit 0;; esac\n");
    await chmod(fakeDocker, 0o700);
    const planned = createBootstrapPlan(project, "demo-rollback", 28687, 28474);
    const result = run("sh", [
      path.join(packagedBootstrap, "setup-project-graph.sh"),
      "--project-root", project,
      "--project-id", "demo-rollback",
      "--bolt-port", "28687",
      "--http-port", "28474",
      "--confirmation", planned.confirmation,
    ], { env: {
      ...process.env,
      PATH: `${fakeBin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
      CODEX_BUILDER_TEST_MODE: "1",
      NACL_SKILLS_ONLY_FAILURE_INJECTION: "after-files",
    } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /code=INJECTED_AFTER_FILES rollback=VERIFIED/);
    assert.equal(await readFile(path.join(project, ".gitignore"), "utf8"), "preserved\n");
    await assert.rejects(readFile(path.join(project, "graph-infra", ".env")), /ENOENT/);
    await assert.rejects(readFile(path.join(project, ".codex", "config.toml")), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Skills-only builder refuses repository-local output", () => {
  const output = path.join(repoRoot, ".skills-only-should-not-exist");
  const result = run(process.execPath, [path.join(repoRoot, "scripts", "build-codex-skills-only.mjs"), "--output", output]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside the repository/);
});
