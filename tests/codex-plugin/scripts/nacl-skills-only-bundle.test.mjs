import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
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
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-bootstrap-symlink-"));
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
      "--confirmation", "INIT_LOCAL_GRAPH:demo-alpha",
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
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-preflight-zero-mutation-"));
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
        "--confirmation", `INIT_LOCAL_GRAPH:demo-${name}`,
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
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-bootstrap-rollback-"));
  try {
    const project = path.join(root, "project");
    const fakeBin = path.join(root, "fake-bin");
    await mkdir(project);
    await mkdir(fakeBin);
    await writeFile(path.join(project, ".gitignore"), "preserved\n");
    const fakeDocker = path.join(fakeBin, "docker");
    await writeFile(fakeDocker, "#!/bin/sh\ncase \"$1\" in info) exit 0;; inspect|volume|network) exit 1;; *) exit 0;; esac\n");
    await chmod(fakeDocker, 0o700);
    const result = run("sh", [
      path.join(packagedBootstrap, "setup-project-graph.sh"),
      "--project-root", project,
      "--project-id", "demo-rollback",
      "--bolt-port", "28687",
      "--http-port", "28474",
      "--confirmation", "INIT_LOCAL_GRAPH:demo-rollback",
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
