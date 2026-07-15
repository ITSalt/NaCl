import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const driftPath = path.join(repoRoot, "codex-plugin-src", "current-main-drift.json");

async function buildProjection() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-drift-projection-"));
  const output = path.join(tempRoot, "nacl");
  const result = spawnSync(process.execPath, ["scripts/build-codex-plugin.mjs", "--output", output], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return { tempRoot, output };
}

test("all 17 direct current-main counterparts are projected byte-for-byte", async () => {
  const drift = JSON.parse(await readFile(driftPath, "utf8"));
  assert.equal(drift.directCounterparts.length, 17);
  assert.equal(new Set(drift.directCounterparts.map((entry) => entry.source)).size, 17);
  const { tempRoot, output } = await buildProjection();
  try {
    for (const entry of drift.directCounterparts) {
      const [source, packaged] = await Promise.all([
        readFile(path.join(repoRoot, entry.source)),
        readFile(path.join(output, entry.destination)),
      ]);
      assert.deepEqual(packaged, source, entry.source);
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("all seven non-direct drifts have exact executable dispositions", async () => {
  const drift = JSON.parse(await readFile(driftPath, "utf8"));
  assert.equal(drift.nonDirectDispositions.length, 7);
  assert.equal(new Set(drift.nonDirectDispositions.map((entry) => entry.source)).size, 7);
  const { tempRoot, output } = await buildProjection();
  try {
    for (const entry of drift.nonDirectDispositions) {
      assert.ok(entry.evidence.length >= 80, entry.source);
      if (entry.destination) {
        assert.deepEqual(
          await readFile(path.join(output, entry.destination)),
          await readFile(path.join(repoRoot, entry.source)),
          entry.source,
        );
      }
    }
    await assert.rejects(stat(path.join(output, ".claude", "agents", "verifier.md")));
    await assert.rejects(stat(path.join(output, "resources", "graph-infra", "handover", "README.md")));
    await assert.rejects(stat(path.join(output, "resources", "nacl-core", "scripts", "graph-doctor.test.mjs")));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("legacy fallback and corrected postmortem flow through skills-for-codex into the package", async () => {
  const { tempRoot, output } = await buildProjection();
  try {
    assert.deepEqual(
      await readFile(path.join(output, "resources", "nacl-core", "scripts", "nacl-installation-fallback.mjs")),
      await readFile(path.join(repoRoot, "skills-for-codex", "nacl-core", "scripts", "nacl-installation-fallback.mjs")),
    );
    assert.deepEqual(
      await readFile(path.join(output, "resources", "workflows", "nacl-postmortem", "SKILL.md")),
      await readFile(path.join(repoRoot, "skills-for-codex", "nacl-postmortem", "SKILL.md")),
    );
    const parity = JSON.parse(await readFile(path.join(output, "resources", "references", "workflow-parity-baseline.json"), "utf8"));
    assert.equal(parity.historicalLegacyTargets.length, 5);
    assert.equal(new Set(parity.historicalLegacyTargets.map((entry) => entry.workflow)).size, 5);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
