import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const bootstrap = path.join(repoRoot, "codex-plugin-src", "package", "resources", "bootstrap");
const packagedBootstrap = path.join(repoRoot, "plugins", "nacl", "resources", "bootstrap");
const writer = path.join(bootstrap, "write-codex-mcp-config.mjs");
const guard = path.join(bootstrap, "codex-config-guard.mjs");
const launcherSource = path.join(bootstrap, "project-neo4j-launcher.mjs");

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

test("Codex TOML guard and writer fail closed without changing malformed, conflicting, or duplicate sections", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-mcp-no-clobber-"));
  try {
    await mkdir(path.join(root, ".codex"));
    const cases = [
      ["malformed", "{not-toml\n", /CODEX_CONFIG_MALFORMED/],
      ["conflict", "# >>> NaCl managed MCP: nacl_neo4j\n[mcp_servers.nacl_neo4j]\ncommand = \"/different\"\nargs = []\n# <<< NaCl managed MCP: nacl_neo4j\n", /CODEX_MCP_CONFIG_CONFLICT/],
      ["duplicate", "[mcp_servers.nacl_neo4j]\ncommand = \"one\"\n\n[mcp_servers.\"nacl_neo4j\"]\ncommand = \"two\"\n", /CODEX_MCP_SECTION_AMBIGUOUS/],
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
    const secret = "opaque-value-that-must-never-be-printed-1234567890";
    const envFile = path.join(root, "graph-infra", ".env");
    await writeFile(envFile, `COMPOSE_PROJECT_NAME=demo-graph\nCONTAINER_PREFIX=demo\nNEO4J_PASSWORD=${secret}\nNEO4J_HTTP_PORT=7474\nNEO4J_BOLT_PORT=7687\n`, { mode: 0o600 });
    await chmod(envFile, 0o600);
    const checked = run(process.execPath, [launcher, "--check-only"]);
    assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);
    assert.match(checked.stdout, /status=VERIFIED secret=protected/);
    assert.doesNotMatch(`${checked.stdout}\n${checked.stderr}`, new RegExp(secret));
    const verified = run(process.execPath, [launcher, "--binary", "/usr/bin/true"]);
    assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
    assert.doesNotMatch(`${verified.stdout}\n${verified.stderr}`, new RegExp(secret));
    await chmod(envFile, 0o644);
    const broad = run(process.execPath, [launcher, "--binary", "/usr/bin/true"]);
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
    assert.match(content, /UNPINNED_BINARY_VERSION_FORBIDDEN/);
    assert.match(content, /BINARY_RECEIPT_MISMATCH/);
    assert.match(content, /neo4j-mcp\.sha256/);
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

test("Skills-only builder refuses repository-local output", () => {
  const output = path.join(repoRoot, ".skills-only-should-not-exist");
  const result = run(process.execPath, [path.join(repoRoot, "scripts", "build-codex-skills-only.mjs"), "--output", output]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside the repository/);
});
