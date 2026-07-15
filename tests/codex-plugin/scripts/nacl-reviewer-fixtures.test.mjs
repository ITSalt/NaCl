import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createToolApplication } from "../../../services/nacl-mcp/src/application.mjs";
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

function deterministicApplication() {
  let supportIndex = 0;
  const supportRefs = "1234567".split("").map((digit) => `support_${digit.repeat(32)}`);
  const graphAdapter = {
    async projectSummary() {
      return { summary: "Demo Alpha is active with one approved delivery task.", revision: 7 };
    },
    async namedRead() {
      return { items: ["DEMO-TASK-001"], revision: 7 };
    },
    async mutateProject() {
      return { summary: "Updated DEMO-TASK-001 to active.", revision: 8 };
    },
    async applySchema() {
      return { summary: "Applied gateway-foundation-v1.", revision: 9 };
    },
    async createBackup() {
      return { job_ref: "job_DEMOBACKUP0000001" };
    },
    async requestRestore() {
      return { job_ref: "job_DEMORESTORE0000001" };
    },
  };
  const application = createToolApplication({
    controlPlane: {
      async listProjects() {
        return {
          principalId: "reviewer-owner",
          projects: [
            { project_ref: "prj_DEMOALPHA00000001", label: "Demo Alpha" },
            { project_ref: "prj_DEMOBETA000000002", label: "Demo Beta" },
          ],
        };
      },
      async authorize({ projectRef }) {
        return {
          principalId: "reviewer-owner",
          serverId: "fixture-server",
          projectRef,
          projectScope: "fixture-project-scope",
          certificateCn: "fixture-principal",
          authorizationRevision: 1,
        };
      },
    },
    graphAdapter,
    auditSink: {
      newSupportRef() {
        const supportRef = supportRefs[supportIndex];
        supportIndex += 1;
        return supportRef;
      },
      async record() {},
    },
    rateLimiter: { async assert() {} },
    idempotencyLedger: {
      async execute({ operation }) {
        return { value: await operation(), replayed: false, outcome: "committed" };
      },
    },
    now: () => 1_000,
  });
  const authContext = Object.freeze({
    issuer: "fixture-issuer",
    subject: "reviewer-owner",
    sessionId: "fixture-session",
    sourceAddress: "fixture-source",
    scopes: ["nacl.server.read", "nacl.server.write", "nacl.server.schema", "nacl.server.backup", "nacl.server.restore"],
  });
  return { application, authContext };
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
  assert.ok(schema.$defs.positiveCase.required.includes("expectedToolResults"));
  assert.equal(schema.$defs.negativeCase.oneOf.length, 2);
});

test("every positive call and result matches the frozen public input, output, and application runtime", async () => {
  const fixture = await readJson(sourceRoot, fixtureRelative);
  const { application, authContext } = deterministicApplication();
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
    assert.equal(item.expectedToolResults.length, item.toolCalls.length, `${item.id} must bind one result per tool call`);
    assert.deepEqual(
      item.expectedToolResults.map(({ tool }) => tool),
      item.toolCalls.map(({ tool }) => tool),
      `${item.id} result order must match call order`,
    );
    for (const [index, call] of item.toolCalls.entries()) {
      assert.ok(PUBLIC_TOOL_NAMES.includes(call.tool), `${item.id} references unshipped tool ${call.tool}`);
      const descriptor = TOOL_BY_NAME.get(call.tool);
      assert.equal(descriptor.securitySchemes[0].scopes[0], call.scope);
      const inputValidation = validateSchema(descriptor.inputSchema, call.arguments);
      assert.equal(inputValidation.valid, true, `${item.id}/${call.tool}: ${inputValidation.errors.join(", ")}`);
      assert.equal(call.arguments.confirmation ?? null, call.confirmation);
      const expectedResult = item.expectedToolResults[index].result;
      const outputValidation = validateSchema(descriptor.outputSchema, expectedResult);
      assert.equal(outputValidation.valid, true, `${item.id}/${call.tool} output: ${outputValidation.errors.join(", ")}`);
      assert.equal(expectedResult.code, "OPERATION_COMPLETED");
      const actualResult = await application({
        name: call.tool,
        arguments: call.arguments,
        authContext,
        requiredScope: call.scope,
      });
      assert.deepEqual(actualResult, expectedResult, `${item.id}/${call.tool} fixture drifted from application runtime`);
    }
  }
});

test("negative cases bind exact denial codes and never authorize a graph call", async () => {
  const fixture = await readJson(sourceRoot, fixtureRelative);
  const expected = {
    N1: { tool: "nacl_project_summary", scope: "nacl.server.read", code: "INVALID_TOKEN", httpStatus: 401 },
    N2: { tool: "nacl_project_summary", scope: "nacl.server.read", code: "ACCESS_OR_RESOURCE_NOT_FOUND", httpStatus: 403 },
  };
  for (const item of fixture.negative.slice(0, 2)) {
    const contract = expected[item.id];
    assert.deepEqual(
      { tool: item.attemptedTool, scope: item.requiredScope, code: item.expectedDenial.code, httpStatus: item.expectedDenial.httpStatus },
      contract,
    );
    assert.equal(item.expectedDenial.graphCall, false);
    if (item.attemptedTool) assert.ok(PUBLIC_TOOL_NAMES.includes(item.attemptedTool));
  }
  const refusal = fixture.negative[2];
  assert.equal(refusal.id, "N3");
  assert.equal(refusal.attemptedTool, null);
  assert.equal(refusal.requiredScope, null);
  assert.equal(Object.hasOwn(refusal, "expectedDenial"), false);
  assert.deepEqual(
    {
      mode: refusal.expectedRefusal.mode,
      toolCallCount: refusal.expectedRefusal.toolCallCount,
      mcpResult: refusal.expectedRefusal.mcpResult,
      graphCall: refusal.expectedRefusal.graphCall,
    },
    { mode: "CONVERSATIONAL_NO_TOOL_CALL", toolCallCount: 0, mcpResult: null, graphCall: false },
  );
});

test("fixture digest is bound into honest non-submission metadata and source/package bytes match", async () => {
  const [sourceFixture, packagedFixture, sourceSchema, packagedSchema, metadata, sourceLicense, packagedLicense] = await Promise.all([
    readFile(path.join(sourceRoot, fixtureRelative)),
    readFile(path.join(pluginRoot, fixtureRelative)),
    readFile(path.join(sourceRoot, schemaRelative)),
    readFile(path.join(pluginRoot, schemaRelative)),
    readJson(sourceRoot, metadataRelative),
    readFile(path.join(repoRoot, "LICENSE")),
    readFile(path.join(pluginRoot, "LICENSE")),
  ]);
  assert.deepEqual(packagedFixture, sourceFixture);
  assert.deepEqual(packagedSchema, sourceSchema);
  assert.deepEqual(packagedLicense, sourceLicense);
  assert.equal(metadata.reviewerFixtureSet.version, "nacl-reviewer-fixtures-v1");
  assert.equal(metadata.reviewerFixtureSet.sha256, sha256(sourceFixture));
  assert.equal(metadata.reviewerFixtureSet.schemaSha256, sha256(sourceSchema));
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
