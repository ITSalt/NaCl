import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PUBLIC_TOOL_NAMES, TOOL_BY_NAME } from "../../../services/nacl-mcp/src/contracts.mjs";
import { validateSchema } from "../../../services/nacl-mcp/src/json-schema.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceRoot = path.join(repoRoot, "codex-plugin-src", "package");
const pluginRoot = path.join(repoRoot, "plugins", "nacl");
const fixtureRelative = "submission/reviewer-fixtures.json";
const schemaRelative = "submission/reviewer-fixtures.schema.json";
const metadataRelative = "submission/release-candidate-metadata.json";
const runbookRelative = "submission/reviewer-fixtures.md";

async function readJson(root, relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

test("review package contains exactly P1-P5 and N1-N3 with no hidden fixture", async () => {
  const fixture = await readJson(sourceRoot, fixtureRelative);
  assert.equal(fixture.fixtureSetVersion, "nacl-reviewer-fixtures-v1");
  assert.equal(fixture.status, "LOCAL_CONTRACT_ONLY");
  assert.deepEqual(fixture.positive.map((item) => item.id), ["P1", "P2", "P3", "P4", "P5"]);
  assert.deepEqual(fixture.negative.map((item) => item.id), ["N1", "N2", "N3"]);
  assert.equal(fixture.positive.length, 5);
  assert.equal(fixture.negative.length, 3);
  assert.equal(fixture.executionEvidence.localSimulation.status, "VERIFIED_CONTRACT_ONLY");
  assert.equal(fixture.executionEvidence.liveReviewer.status, "NOT_RUN");
  assert.equal(fixture.seed.status, "LOCAL_SIMULATION_ONLY");
  assert.equal(fixture.seed.projects.length, 3);
  assert.equal(fixture.seed.actors.length, 2);

  const schema = await readJson(sourceRoot, schemaRelative);
  assert.equal(schema.properties.positive.minItems, 5);
  assert.equal(schema.properties.positive.maxItems, 5);
  assert.equal(schema.properties.negative.minItems, 3);
  assert.equal(schema.properties.negative.maxItems, 3);
  assert.equal(schema.$defs.positiveCase.properties.id.pattern, "^P[1-5]$");
  assert.equal(schema.$defs.negativeCase.properties.id.pattern, "^N[1-3]$");
});

test("every positive case matches the frozen public tool, scope, confirmation, and input contract", async () => {
  const fixture = await readJson(sourceRoot, fixtureRelative);
  const expected = {
    P1: [{ tool: "nacl_projects_list", scope: "nacl.server.read", confirmation: null }],
    P2: [
      { tool: "nacl_project_summary", scope: "nacl.server.read", confirmation: null },
      { tool: "nacl_named_read", scope: "nacl.server.read", confirmation: null },
    ],
    P3: [{ tool: "nacl_project_mutate", scope: "nacl.server.write", confirmation: "APPLY_PROJECT_MUTATION" }],
    P4: [{ tool: "nacl_schema_apply", scope: "nacl.server.schema", confirmation: "APPLY_REVIEWED_MIGRATIONS" }],
    P5: [
      { tool: "nacl_backup_create", scope: "nacl.server.backup", confirmation: "CREATE_PROJECT_BACKUP" },
      { tool: "nacl_restore_request", scope: "nacl.server.restore", confirmation: "RESTORE_TO_ISOLATED_TARGET" },
    ],
  };
  for (const item of fixture.positive) {
    assert.deepEqual(item.toolCalls.map(({ tool, scope, confirmation }) => ({ tool, scope, confirmation })), expected[item.id]);
    for (const call of item.toolCalls) {
      assert.ok(PUBLIC_TOOL_NAMES.includes(call.tool), `${item.id} references unshipped tool ${call.tool}`);
      const descriptor = TOOL_BY_NAME.get(call.tool);
      assert.equal(descriptor.securitySchemes[0].scopes[0], call.scope);
      const validation = validateSchema(descriptor.inputSchema, call.arguments);
      assert.equal(validation.valid, true, `${item.id}/${call.tool}: ${validation.errors.join(", ")}`);
      assert.equal(call.arguments.confirmation ?? null, call.confirmation);
    }
    assert.match(item.expectedResult.status, /^VERIFIED$/);
    assert.match(item.expectedResult.code, /^[A-Z][A-Z0-9_]+$/);
  }
});

test("negative cases bind exact denial codes and never authorize a graph call", async () => {
  const fixture = await readJson(sourceRoot, fixtureRelative);
  const expected = {
    N1: { tool: "nacl_project_summary", scope: "nacl.server.read", code: "INVALID_TOKEN", httpStatus: 401 },
    N2: { tool: "nacl_project_summary", scope: "nacl.server.read", code: "ACCESS_OR_RESOURCE_NOT_FOUND", httpStatus: 403 },
    N3: { tool: null, scope: null, code: "UNSUPPORTED_PUBLIC_OPERATION", httpStatus: undefined },
  };
  for (const item of fixture.negative) {
    const contract = expected[item.id];
    assert.deepEqual(
      { tool: item.attemptedTool, scope: item.requiredScope, code: item.expectedDenial.code, httpStatus: item.expectedDenial.httpStatus },
      contract,
    );
    assert.equal(item.expectedDenial.graphCall, false);
    if (item.attemptedTool) assert.ok(PUBLIC_TOOL_NAMES.includes(item.attemptedTool));
  }
});

test("fixture digest is bound into honest non-submission metadata and source/package bytes match", async () => {
  const [sourceFixture, packagedFixture, metadata, sourceLicense, packagedLicense] = await Promise.all([
    readFile(path.join(sourceRoot, fixtureRelative)),
    readFile(path.join(pluginRoot, fixtureRelative)),
    readJson(sourceRoot, metadataRelative),
    readFile(path.join(repoRoot, "LICENSE")),
    readFile(path.join(pluginRoot, "LICENSE")),
  ]);
  assert.deepEqual(packagedFixture, sourceFixture);
  assert.deepEqual(packagedLicense, sourceLicense);
  assert.equal(metadata.reviewerFixtureSet.version, "nacl-reviewer-fixtures-v1");
  assert.equal(metadata.reviewerFixtureSet.sha256, sha256(sourceFixture));
  assert.equal(metadata.reviewerFixtureSet.positiveCount, 5);
  assert.equal(metadata.reviewerFixtureSet.negativeCount, 3);
  assert.equal(metadata.reviewerFixtureSet.liveStatus, "NOT_RUN");
  assert.equal(metadata.status, "NOT_READY_FOR_SUBMISSION");
  assert.equal(metadata.portal.draftStatus, "NOT_CREATED");
  assert.equal(metadata.portal.submissionAuthorized, false);
  assert.deepEqual(metadata.portal.appBinding, { active: false, appIdStatus: "NOT_PROVIDED", appId: null });
  assert.equal(metadata.publicMetadata.publisherIdentity.status, "NOT_VERIFIED");
  assert.equal(metadata.publicMetadata.publisherIdentity.value, null);
  assert.equal(metadata.publicMetadata.privacyPolicy.status, "NOT_VERIFIED");
  assert.equal(metadata.publicMetadata.privacyPolicy.value, null);
  assert.equal(metadata.publicMetadata.termsOfService.status, "NOT_VERIFIED");
  assert.equal(metadata.publicMetadata.termsOfService.value, null);
  assert.equal(metadata.publicMetadata.repository.value, "https://github.com/ITSalt/NaCl");
  assert.equal(metadata.publicMetadata.license.spdx, "MIT");
  assert.equal(metadata.screenshots.status, "NOT_RUN");
  assert.deepEqual(metadata.screenshots.items, []);
});

test("reviewer artifacts contain no live endpoint, app ID, personal path, secret, or database statement", async () => {
  const artifacts = await Promise.all([
    fixtureRelative,
    schemaRelative,
    metadataRelative,
    runbookRelative,
  ].map((relative) => readFile(path.join(sourceRoot, relative), "utf8")));
  const combined = artifacts.join("\n");
  assert.doesNotMatch(combined, /plugin_asdk_app_/);
  assert.doesNotMatch(combined, /\/(?:Users|home)\/[A-Za-z0-9._-]+/);
  assert.doesNotMatch(combined, /(?:bolt|neo4j|http):\/\//i);
  assert.doesNotMatch(combined, /"(?:host|server_id|password|token|certificate|private_key)"\s*:/i);
  assert.doesNotMatch(combined, /\b(?:MATCH|MERGE|CREATE|DELETE|DETACH|DROP)\s*(?:\(|[A-Z])/);
  assert.doesNotMatch(
    combined,
    /(?:sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9._~-]{20,})/,
  );
  assert.doesNotMatch(combined, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(combined, /example\.(?:com|test|invalid)/);
});
