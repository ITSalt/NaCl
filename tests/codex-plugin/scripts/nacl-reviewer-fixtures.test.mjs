import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceRoot = path.join(repoRoot, "codex-plugin-src", "package");
const pluginRoot = path.join(repoRoot, "plugins", "nacl");
const fixtureRelative = "submission/reviewer-fixtures.json";
const schemaRelative = "submission/reviewer-fixtures.schema.json";

async function json(root, relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

test("Skills-only reviewer fixture set is byte-identical in source and generated package", async () => {
  for (const relative of [fixtureRelative, schemaRelative, "submission/reviewer-fixtures.md"]) {
    assert.deepEqual(await readFile(path.join(pluginRoot, relative)), await readFile(path.join(sourceRoot, relative)), relative);
  }
});

test("reviewer fixtures contain exactly five positive and three negative local cases", async () => {
  const fixture = await json(sourceRoot, fixtureRelative);
  assert.equal(fixture.schemaVersion, 2);
  assert.equal(fixture.fixtureSetVersion, "nacl-skills-only-reviewer-fixtures-v1");
  assert.equal(fixture.submissionType, "SKILLS_ONLY");
  assert.equal(fixture.status, "LOCAL_CONTRACT_ONLY");
  assert.equal(fixture.positive.length, 5);
  assert.equal(fixture.negative.length, 3);
  assert.deepEqual(fixture.positive.map(({ id }) => id), ["P1", "P2", "P3", "P4", "P5"]);
  assert.deepEqual(fixture.negative.map(({ id }) => id), ["N1", "N2", "N3"]);
  assert.equal(fixture.executionEvidence.localSimulation.status, "VERIFIED_CONTRACT_ONLY");
  assert.equal(fixture.executionEvidence.liveReviewer.status, "NOT_RUN");
});

test("every fixture routes to a shipped public skill and preserves closed status semantics", async () => {
  const fixture = await json(sourceRoot, fixtureRelative);
  const shipped = new Set((await readdir(path.join(sourceRoot, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  for (const item of [...fixture.positive, ...fixture.negative]) {
    assert.ok(shipped.has(item.entrySkill), item.entrySkill);
    assert.ok(item.expectedBehavior.length >= 2, item.id);
  }
  assert.deepEqual(fixture.negative.map(({ expectedStatus }) => expectedStatus), ["BLOCKED", "BLOCKED", "BLOCKED"]);
  assert.deepEqual(fixture.negative.map(({ expectedCode }) => expectedCode), [
    "PROJECT_MCP_NOT_CONFIGURED",
    "CONFIRMATION_REQUIRED",
    "CODEX_CONFIG_CONFLICT_OR_UNSAFE_STATE",
  ]);
  assert.match(fixture.positive[1].expectedBehavior.join(" "), /secret-free managed section in project \.codex\/config\.toml/);
  assert.match(fixture.positive[2].expectedBehavior.join(" "), /project nacl_neo4j MCP/);
});

test("fixture schema binds the Skills-only shape and exact case counts", async () => {
  const schema = await json(sourceRoot, schemaRelative);
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, 2);
  assert.equal(schema.properties.submissionType.const, "SKILLS_ONLY");
  assert.deepEqual(
    [schema.properties.positive.minItems, schema.properties.positive.maxItems, schema.properties.negative.minItems, schema.properties.negative.maxItems],
    [5, 5, 3, 3],
  );
  assert.equal(schema.$defs.negative.properties.expectedStatus.const, "BLOCKED");
});

test("reviewer artifacts contain no public endpoint, OAuth contract, credentials, secret value, or personal path", async () => {
  const combined = (await Promise.all([
    fixtureRelative,
    schemaRelative,
    "submission/reviewer-fixtures.md",
    "submission/release-candidate-metadata.json",
  ].map((relative) => readFile(path.join(sourceRoot, relative), "utf8")))).join("\n");
  assert.doesNotMatch(combined, /https?:\/\/(?:example\.|localhost|127\.0\.0\.1)[^\s"`]*/i);
  assert.doesNotMatch(combined, /plugin_asdk_app_|client_secret|access_token|bearer\s+[A-Za-z0-9._-]+|\/(?:Users|home)\//i);
  assert.doesNotMatch(combined, /nacl_(?:installation_doctor|graph_|project_|legacy_symlinks_|agent_profiles_)/);
  const metadata = await json(sourceRoot, "submission/release-candidate-metadata.json");
  assert.equal(metadata.portal.publicMcp, "NOT_APPLICABLE");
  assert.equal(metadata.portal.oauth, "NOT_APPLICABLE");
  assert.equal(metadata.portal.reviewerCredentials, "NOT_REQUIRED");
});
