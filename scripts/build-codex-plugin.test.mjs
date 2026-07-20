import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { transformPackageDocSecretPlaceholder, transformPortablePythonTempLog } from "./build-codex-plugin.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builder = path.join(repoRoot, "scripts", "build-codex-plugin.mjs");

test("package doc secret transform accepts only exact safe placeholders and fails closed", () => {
  const safeEnvironmentReference = Buffer.from('neo4j_password: "${NEO4J_PASSWORD}"\n');
  assert.equal(transformPackageDocSecretPlaceholder(safeEnvironmentReference), safeEnvironmentReference);

  const legacySentinel = Buffer.from('neo4j_password: "neo4j_graph_dev"\n');
  assert.equal(
    transformPackageDocSecretPlaceholder(legacySentinel).toString("utf8"),
    'neo4j_password: "<generated-by-nacl-local-init>"\n',
  );

  assert.throws(
    () => transformPackageDocSecretPlaceholder(Buffer.from("neo4j_password: missing\n")),
    /expected an exact secret placeholder source match/,
  );
  assert.throws(
    () => transformPackageDocSecretPlaceholder(Buffer.from('neo4j_password: "neo4j_graph_dev_backup"\n')),
    /unsafe legacy-secret near-match/,
  );
  assert.throws(
    () => transformPackageDocSecretPlaceholder(Buffer.from('neo4j_password: "${NEO4J_PASSWORD:-demo}"\n')),
    /unsafe environment-secret near-match/,
  );
});

test("portable Python transform preserves LF or CRLF and rejects mixed line endings", () => {
  const source = [
    "import re",
    "from pathlib import Path",
    "# dropped; non-matching tokens are warn-logged to /tmp/ko-sa-parse.log so",
    "# sentinel characters",
    '_SA_PARSE_LOG = "/tmp/ko-sa-parse.log"',
    "",
  ].join("\n");
  const expected = [
    "import re",
    "import tempfile",
    "from pathlib import Path",
    "# dropped; non-matching tokens are warn-logged under the platform's safe",
    "# temporary directory so",
    "# sentinel characters",
    '_SA_PARSE_LOG = Path(tempfile.gettempdir()) / "ko-sa-parse.log"',
    "",
  ].join("\n");

  assert.equal(transformPortablePythonTempLog(Buffer.from(source)).toString("utf8"), expected);
  assert.equal(
    transformPortablePythonTempLog(Buffer.from(source.replaceAll("\n", "\r\n"))).toString("utf8"),
    expected.replaceAll("\n", "\r\n"),
  );
  assert.throws(
    () => transformPortablePythonTempLog(Buffer.from(source.replace("import re\n", "import re\r\n"))),
    /mixed line endings/,
  );
  assert.throws(
    () => transformPortablePythonTempLog(Buffer.from(source.replace("import re\n", "import re\r"))),
    /lone carriage return/,
  );
});

test("repository checkout policy keeps generated plugin bytes platform-independent", async () => {
  assert.equal(await readFile(path.join(repoRoot, ".gitattributes"), "utf8"), "* text=auto eol=lf\n");
});

async function treeDigest(root) {
  const records = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      const metadata = await lstat(filename);
      assert.equal(metadata.isSymbolicLink(), false, filename);
      if (metadata.isDirectory()) await visit(filename);
      else {
        assert.equal(metadata.isFile(), true, filename);
        records.push(`${path.relative(root, filename).split(path.sep).join("/")} ${createHash("sha256").update(await readFile(filename)).digest("hex")} ${(metadata.mode & 0o777).toString(8)}`);
      }
    }
  }
  await visit(root);
  return createHash("sha256").update(records.join("\n")).digest("hex");
}

test("two clean Codex builds are byte-identical and contain exact public/workflow inventories", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-codex-builder-test-"));
  try {
    const first = path.join(tempRoot, "first");
    const second = path.join(tempRoot, "second");
    for (const output of [first, second]) {
      const result = spawnSync(process.execPath, [builder, "--output", output], { cwd: repoRoot, encoding: "utf8" });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    }
    assert.equal(await treeDigest(first), await treeDigest(second));
    const index = JSON.parse(await readFile(path.join(first, "resources", "package-index.json"), "utf8"));
    assert.equal(index.publicEntrySkills.length, 10);
    assert.equal(index.internalWorkflows.length, 60);
    const parity = JSON.parse(await readFile(path.join(first, "resources", "references", "workflow-parity-baseline.json"), "utf8"));
    assert.equal(parity.sourceChain, "root -> skills-for-codex -> plugins/nacl");
    assert.equal(parity.byteIdenticalCount + parity.deliberateDivergences.length, 60);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
test("builder refuses to write to another repository path", () => {
  const forbidden = path.join(repoRoot, "docs", "codex-builder-forbidden-output");
  const result = spawnSync(process.execPath, [builder, "--output", forbidden], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /must not write elsewhere in the repository/);
});

test("committed plugins/nacl is generated and current", () => {
  const result = spawnSync(process.execPath, [builder, "--check"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("same-filesystem staged swap rolls back the exact prior tree after injected failure", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-codex-builder-rollback-"));
  try {
    const output = path.join(tempRoot, "candidate");
    const first = spawnSync(process.execPath, [builder, "--output", output], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    await writeFile(path.join(output, "rollback-sentinel"), "exact-prior-tree\n");
    const before = await treeDigest(output);
    const failed = spawnSync(process.execPath, [builder, "--output", output], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, CODEX_BUILDER_TEST_MODE: "1", NACL_CODEX_BUILDER_FAILURE_INJECTION: "after-backup" },
    });
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /Injected failure after backup/);
    assert.equal(await treeDigest(output), before);
    await assert.rejects(lstat(`${output}.codex-build-backup`), /ENOENT/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("generated package modes are deterministic data modes and all runtime entries name an interpreter", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-codex-builder-modes-"));
  try {
    const output = path.join(tempRoot, "candidate");
    const result = spawnSync(process.execPath, [builder, "--output", output], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    async function visit(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(filename);
        else assert.equal((await lstat(filename)).mode & 0o777, 0o644, path.relative(output, filename));
      }
    }
    await visit(output);
    const mcp = JSON.parse(await readFile(path.join(output, ".mcp.json"), "utf8"));
    assert.equal(mcp.mcpServers.nacl.command, "node");
    assert.match(mcp.mcpServers.nacl.args[0], /\.mjs$/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("builder rejects symlinked root packages, shared trees, and shared files before reading them", async () => {
  const repoFixture = await mkdtemp(path.join(repoRoot, ".nacl-codex-builder-symlink-"));
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-codex-builder-symlink-output-"));
  try {
    const baseManifest = JSON.parse(await readFile(path.join(repoRoot, "scripts", "codex-plugin-manifest.json"), "utf8"));
    const fixtures = [
      {
        name: "root-package",
        target: path.join(repoRoot, "nacl-core"),
        link: path.join(repoFixture, "root-package"),
        mutate(manifest, relativeLink) { manifest.rootPackages[0] = relativeLink; },
      },
      {
        name: "shared-tree",
        target: path.join(repoRoot, "graph-infra", "queries"),
        link: path.join(repoFixture, "shared-tree"),
        mutate(manifest, relativeLink) { manifest.sharedTrees[0].source = relativeLink; },
      },
      {
        name: "shared-file",
        target: path.join(repoRoot, "docs", "configuration.md"),
        link: path.join(repoFixture, "shared-file"),
        mutate(manifest, relativeLink) { manifest.sharedFiles[0].source = relativeLink; },
      },
    ];
    for (const fixture of fixtures) {
      await symlink(fixture.target, fixture.link);
      const manifest = structuredClone(baseManifest);
      fixture.mutate(manifest, path.relative(repoRoot, fixture.link).split(path.sep).join("/"));
      const manifestPath = path.join(repoFixture, `${fixture.name}.json`);
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const result = spawnSync(process.execPath, [builder, "--manifest", manifestPath, "--output", path.join(outputRoot, fixture.name)], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      assert.equal(result.status, 1, `${fixture.name}\n${result.stdout}\n${result.stderr}`);
      assert.match(result.stderr, /Source symlink is forbidden/);
    }
  } finally {
    await rm(repoFixture, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
  }
});
