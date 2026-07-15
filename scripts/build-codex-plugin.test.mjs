import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builder = path.join(repoRoot, "scripts", "build-codex-plugin.mjs");

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
