import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createToolApplication } from "../../../services/nacl-mcp/src/application.mjs";
import { PUBLIC_TOOL_NAMES, TOOL_BY_NAME } from "../../../services/nacl-mcp/src/contracts.mjs";
import { PublicMcpError, ReauthorizationRequired } from "../../../services/nacl-mcp/src/errors.mjs";
import { createStreamableHttpServer, STABLE_PROTOCOL_VERSION } from "../../../services/nacl-mcp/src/http-server.mjs";
import { validateSchema } from "../../../services/nacl-mcp/src/json-schema.mjs";
import { createSdkMcpServer } from "../../../services/nacl-mcp/src/sdk-server.mjs";
import { createMemorySessionRegistry, createServerControlPlane } from "../../../services/nacl-mcp/src/server-control.mjs";

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

async function deterministicNegativeWireFixture() {
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  reservation.close();
  await once(reservation, "close");
  const base = `http://127.0.0.1:${port}`;
  const metadataUrl = `${base}/.well-known/oauth-protected-resource`;
  let authenticationRejections = 0;
  let graphCalls = 0;
  let supportIndex = 0;
  const supportRefs = [
    "support_88888888888888888888888888888888",
    "support_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "support_99999999999999999999999999999999",
  ];
  const accepted = new Set(["Bearer stale-fixture", "Bearer revoked-fixture", "Bearer cross-server-fixture"]);
  const graphAdapter = Object.fromEntries([
    "projectSummary", "namedRead", "mutateProject", "applySchema", "createBackup", "requestRestore",
  ].map((method) => [method, async () => {
    graphCalls += 1;
    throw new Error("negative fixture reached graph adapter");
  }]));
  const callTool = createToolApplication({
    controlPlane: {
      async listProjects() {
        throw new Error("negative fixture reached project listing");
      },
      async authorize({ tokenContext, projectRef }) {
        if (["stale-fixture", "revoked-fixture"].includes(tokenContext.sessionId)) {
          throw new ReauthorizationRequired({ error: "invalid_token", scope: "nacl.server.read" });
        }
        if (projectRef === "prj_DEMORESTRICTED0001") {
          throw new PublicMcpError("ACCESS_OR_RESOURCE_NOT_FOUND", "Access or project route was not found.", { httpStatus: 403 });
        }
        throw new Error("negative fixture accepted an unexpected route");
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
  const server = createStreamableHttpServer({
    resourceUrl: `${base}/mcp`,
    resourceMetadataUrl: metadataUrl,
    authorizationServers: ["https://identity.invalid/"],
    scopesSupported: ["nacl.server.read", "nacl.server.write", "nacl.server.schema", "nacl.server.backup", "nacl.server.restore"],
    allowedOrigins: ["https://chatgpt.com"],
    async verifyAuthorization(header) {
      if (!accepted.has(header)) throw new Error("transport authorization rejected");
      return Object.freeze({ issuer: "https://identity.invalid/", subject: "reviewer", sessionId: header.slice(7), scopes: ["nacl.server.read"] });
    },
    async auditAuthenticationRejection() {
      authenticationRejections += 1;
    },
    createMcpServer({ authContext }) {
      return createSdkMcpServer({
        authContext,
        resourceMetadataUrl: metadataUrl,
        async auditRejection() {},
        callTool,
      });
    },
  });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return {
    base,
    metadataUrl,
    server,
    authenticationRejections: () => authenticationRejections,
    toolCalls: () => supportIndex,
    graphCalls: () => graphCalls,
  };
}

async function actualServerControlReauthorizationErrors() {
  const issuer = "https://identity.invalid/";
  const subject = "reviewer-subject";
  const principalId = "reviewer-principal";
  const trusted = new Set();
  const registry = {
    async grantPrincipal(certificateCn) {
      trusted.add(certificateCn);
      return { status: "VERIFIED" };
    },
    async rotatePrincipal(previousCertificateCn, nextCertificateCn) {
      trusted.delete(previousCertificateCn);
      trusted.add(nextCertificateCn);
      return { status: "VERIFIED" };
    },
    async revokePrincipal(certificateCn) {
      trusted.delete(certificateCn);
      return { status: "VERIFIED" };
    },
    async verifyPrincipal(certificateCn) {
      return { status: trusted.has(certificateCn) ? "VERIFIED" : "BLOCKED" };
    },
  };
  const control = createServerControlPlane({
    routes: [{
      project_ref: "prj_DEMOALPHA00000001",
      server_id: "fixture-server",
      project_scope: "fixture-project-scope",
      label: "Demo Alpha",
      enabled: true,
    }],
    serverRegistries: new Map([["fixture-server", registry]]),
    sessionRegistry: createMemorySessionRegistry({ now: () => 1_500_000 }),
    principalLinkVerifier: {
      async verifyAndConsume({ issuer: verifiedIssuer, subject: verifiedSubject, principalId: verifiedPrincipal, certificateCn }) {
        return {
          verified: true,
          issuer: verifiedIssuer,
          subject: verifiedSubject,
          principal_id: verifiedPrincipal,
          certificate_cn: certificateCn,
          receipt_id: "proof_fixture_0000000000000001",
          revision: 1,
          expires_at: 2_000_000,
        };
      },
    },
    now: () => 1_500_000,
  });
  await control.registerSubject({
    issuer,
    subject,
    principalId,
    certificateCn: "fixture-cn-v1",
    linkReceipt: "link_fixture_0000000000000001",
  });
  await control.grantServer({ issuer, subject, serverId: "fixture-server" });
  const tokenContext = (sessionId, tokenEpoch) => ({
    verified: true,
    issuer,
    subject,
    sessionId,
    tokenEpoch,
    expiresAt: 2_000,
  });
  const stale = tokenContext("session-stale-0001", await control.currentTokenEpoch(issuer, subject));
  await control.listProjects({ tokenContext: stale });
  await control.rotatePrincipal({ issuer, subject, nextCertificateCn: "fixture-cn-v2" });
  let staleError;
  try {
    await control.listProjects({ tokenContext: stale });
  } catch (error) {
    staleError = error;
  }

  const revoked = tokenContext("session-revoked-0001", await control.currentTokenEpoch(issuer, subject));
  await control.listProjects({ tokenContext: revoked });
  await control.revokeSession({ issuer, subject, sessionId: revoked.sessionId, expiresAt: Number.MAX_SAFE_INTEGER });
  let revokedError;
  try {
    await control.listProjects({ tokenContext: revoked });
  } catch (error) {
    revokedError = error;
  }
  assert.ok(staleError instanceof ReauthorizationRequired);
  assert.ok(revokedError instanceof ReauthorizationRequired);
  return [staleError.oauthError, revokedError.oauthError];
}

async function postTool(base, token, projectRef) {
  return fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      ...(token ? { authorization: token } : {}),
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": STABLE_PROTOCOL_VERSION,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: token ?? "missing",
      method: "tools/call",
      params: { name: "nacl_project_summary", arguments: { project_ref: projectRef } },
    }),
  });
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
  assert.equal(schema.$defs.negativeCase.oneOf.length, 3);
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

test("negative cases match the actual transport and MCP wire contracts without graph access", async (t) => {
  const fixture = await readJson(sourceRoot, fixtureRelative);
  const [authentication, crossServer, refusal] = fixture.negative;
  const wire = await deterministicNegativeWireFixture();
  t.after(() => new Promise((resolve) => wire.server.close(resolve)));

  assert.equal(authentication.id, "N1");
  assert.equal(authentication.attemptedTool, "nacl_project_summary");
  assert.equal(authentication.requiredScope, "nacl.server.read");
  assert.deepEqual(authentication.expectedTransportRejection.cases, ["missing", "expired", "wrong-audience"]);
  const transportTokens = [null, "Bearer expired-fixture", "Bearer wrong-audience-fixture"];
  for (const token of transportTokens) {
    const response = await postTool(wire.base, token, "prj_DEMOALPHA00000001");
    assert.equal(response.status, authentication.expectedTransportRejection.wireHttpStatus);
    assert.equal(await response.text(), "");
    const challenge = authentication.expectedTransportRejection.wwwAuthenticate;
    assert.equal(
      response.headers.get("www-authenticate"),
      `${challenge.scheme} resource_metadata="${wire.metadataUrl}", scope="${challenge.scope}"`,
    );
  }
  assert.equal(authentication.expectedTransportRejection.body, "EMPTY");
  assert.equal(authentication.expectedTransportRejection.mcpResult, null);
  assert.equal(authentication.expectedTransportRejection.internalAuditCode, "INVALID_TOKEN");
  assert.equal(wire.authenticationRejections(), 3);
  const summaryOutputSchema = TOOL_BY_NAME.get("nacl_project_summary").outputSchema;

  assert.deepEqual(authentication.expectedSessionReauthorization.cases, ["stale-rotation", "revoked-session"]);
  assert.deepEqual(
    await actualServerControlReauthorizationErrors(),
    authentication.expectedSessionReauthorization.cases.map(() => authentication.expectedSessionReauthorization.wwwAuthenticate.error),
  );
  assert.deepEqual(
    authentication.expectedSessionReauthorization.expectedMcpResults.map((item) => item.case),
    authentication.expectedSessionReauthorization.cases,
  );
  for (const [index, token] of ["Bearer stale-fixture", "Bearer revoked-fixture"].entries()) {
    const response = await postTool(wire.base, token, "prj_DEMOALPHA00000001");
    assert.equal(response.status, authentication.expectedSessionReauthorization.wireHttpStatus);
    const body = await response.json();
    assert.equal(body.result.isError, authentication.expectedSessionReauthorization.isError);
    const expectedStructuredContent = authentication.expectedSessionReauthorization.expectedMcpResults[index].structuredContent;
    assert.equal(validateSchema(summaryOutputSchema, expectedStructuredContent).valid, true);
    assert.deepEqual(body.result.structuredContent, expectedStructuredContent);
    const challenge = authentication.expectedSessionReauthorization.wwwAuthenticate;
    assert.equal(
      body.result._meta["mcp/www_authenticate"],
      `${challenge.scheme} resource_metadata="${wire.metadataUrl}", error="${challenge.error}", error_description="${challenge.errorDescription}", scope="${challenge.scope}"`,
    );
  }

  assert.equal(crossServer.id, "N2");
  assert.equal(crossServer.attemptedTool, "nacl_project_summary");
  assert.equal(crossServer.requiredScope, "nacl.server.read");
  const crossResponse = await postTool(wire.base, "Bearer cross-server-fixture", "prj_DEMORESTRICTED0001");
  assert.equal(crossResponse.status, crossServer.expectedMcpDenial.wireHttpStatus);
  const crossBody = await crossResponse.json();
  assert.equal(crossBody.result.isError, crossServer.expectedMcpDenial.isError);
  assert.deepEqual(crossBody.result.structuredContent, crossServer.expectedMcpDenial.structuredContent);
  assert.equal(crossBody.result._meta, undefined);
  assert.equal(crossServer.expectedMcpDenial.applicationHttpStatus, 403);
  assert.equal(crossServer.expectedMcpDenial.wwwAuthenticate, null);
  assert.equal(validateSchema(summaryOutputSchema, crossServer.expectedMcpDenial.structuredContent).valid, true);
  assert.doesNotMatch(JSON.stringify(crossBody), /Demo Restricted|fixture-server|fixture-project-scope/);
  assert.equal(wire.toolCalls(), 3);
  assert.equal(wire.graphCalls(), 0);

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
