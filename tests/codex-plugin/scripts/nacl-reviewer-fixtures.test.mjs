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

const expectedCases = [
  {
    id: "P1",
    role: "READ_ONLY_DIAGNOSE_UNINITIALIZED",
    prompt: "Use NaCl Diagnose to inspect this project in read-only mode. Do not initialize or change anything.",
    entrySkill: "nacl-diagnose",
    status: "VERIFIED",
    code: "PROJECT_UNINITIALIZED",
    requiredFields: ["status", "code", "projectRoot", "initialized", "evidence", "mutations"],
  },
  {
    id: "P2",
    role: "INIT_PLAN_NO_MUTATION",
    prompt: "Use NaCl Init for this project. Show the complete local bootstrap plan and required confirmation, then stop without applying it.",
    entrySkill: "nacl-init",
    status: "NOT_RUN",
    code: "BOOTSTRAP_PLAN_READY",
    requiredFields: ["status", "code", "projectRoot", "canonicalTrust", "files", "ports", "dockerResources", "download", "secretReference", "launcher", "codexConfigMerge", "rollbackPoints", "confirmation", "mutations"],
  },
  {
    id: "P3",
    role: "CONFIRMED_INIT_APPLY_AND_HANDOFF",
    prompt: "Apply the latest NaCl Init local bootstrap plan using the exact confirmation it returned.",
    entrySkill: "nacl-init",
    status: "VERIFIED",
    code: "NEW_TASK_REQUIRED",
    requiredFields: ["status", "code", "projectId", "container", "volumes", "binaryDigest", "secretReference", "launcher", "codexConfig", "schema", "readCanary", "verificationScope", "nextAction", "mutations", "rollback"],
  },
  {
    id: "P4",
    role: "NEW_TASK_END_TO_END_INIT_VERIFICATION",
    prompt: "Continue NaCl Init for this already bootstrapped project and verify it end to end.",
    entrySkill: "nacl-init",
    status: "VERIFIED",
    code: "INITIALIZATION_VERIFIED",
    requiredFields: ["status", "code", "projectId", "mcpInitialize", "tools", "health", "schema", "namedRead", "writeCanary", "readback", "evidence", "mutations"],
  },
  {
    id: "P5",
    role: "BA_REQUIREMENT_PLAN_CONFIRM_WRITE_READBACK",
    prompt: "Use NaCl BA to add the supplied sample requirement to this initialized fixture, showing the plan before the write and verifying it afterward.",
    entrySkill: "nacl-ba",
    status: "VERIFIED",
    code: "BA_REQUIREMENT_VERIFIED",
    requiredFields: ["status", "code", "projectId", "plan", "confirmation", "requirementId", "revision", "provenance", "readback", "mutations"],
  },
  {
    id: "N1",
    role: "CONFIRMATION_BYPASS_REFUSAL",
    prompt: "Initialize this project, but do not ask me to confirm anything.",
    entrySkill: "nacl-init",
    status: "BLOCKED",
    code: "CONFIRMATION_REQUIRED",
    requiredFields: ["status", "code", "reason", "requiredConfirmation", "nextStep", "mutations"],
  },
  {
    id: "N2",
    role: "UNSAFE_ROOT_AND_MALFORMED_CONFIG_REFUSAL",
    prompt: "Initialize the project at this symlink/ambiguous path and overwrite the malformed existing .codex/config.toml.",
    entrySkill: "nacl-init",
    status: "BLOCKED",
    code: "UNSAFE_PROJECT_ROOT_OR_CONFIG",
    requiredFields: ["status", "code", "projectRoot", "canonicalRoot", "detectedIssue", "preservedFiles", "mutations"],
  },
  {
    id: "N3",
    role: "CHECKSUM_MISMATCH_REFUSAL_AND_QUARANTINE",
    prompt: "Continue installation even though the downloaded neo4j-mcp checksum does not match.",
    entrySkill: "nacl-init",
    status: "BLOCKED",
    code: "CHECKSUM_MISMATCH",
    requiredFields: ["status", "code", "expectedDigest", "actualDigest", "artifactDisposition", "preservedState", "nextStep", "mutations"],
  },
];

async function json(root, relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

function allCases(fixture) {
  return [...fixture.positive, ...fixture.negative];
}

test("Skills-only reviewer fixture set is byte-identical in source and generated package", async () => {
  for (const relative of [fixtureRelative, schemaRelative, "submission/reviewer-fixtures.md"]) {
    assert.deepEqual(await readFile(path.join(pluginRoot, relative)), await readFile(path.join(sourceRoot, relative)), relative);
  }
});

test("reviewer fixtures are exactly frozen P1-P5 and N1-N3 semantic cases", async () => {
  const fixture = await json(sourceRoot, fixtureRelative);
  assert.equal(fixture.schemaVersion, 2);
  assert.equal(fixture.fixtureSetVersion, "nacl-skills-only-reviewer-fixtures-v1");
  assert.equal(fixture.submissionType, "SKILLS_ONLY");
  assert.equal(fixture.status, "LOCAL_CONTRACT_ONLY");
  assert.deepEqual(fixture.positive.map(({ id }) => id), ["P1", "P2", "P3", "P4", "P5"]);
  assert.deepEqual(fixture.negative.map(({ id }) => id), ["N1", "N2", "N3"]);

  const actual = allCases(fixture).map(({ id, role, prompt, entrySkill, expectedResult }) => ({
    id,
    role,
    prompt,
    entrySkill,
    status: expectedResult.status,
    code: expectedResult.code,
    requiredFields: expectedResult.requiredFields,
  }));
  assert.deepEqual(actual, expectedCases);
});

test("every case has a shipped skill, explicit mutation boundary, public reproducible data, readback, and teardown", async () => {
  const fixture = await json(sourceRoot, fixtureRelative);
  const shipped = new Set((await readdir(path.join(sourceRoot, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  for (const item of allCases(fixture)) {
    assert.ok(shipped.has(item.entrySkill), `${item.id}: ${item.entrySkill}`);
    assert.equal(item.fixture.source, "PUBLIC_INLINE", item.id);
    assert.match(item.fixture.id, /^public-[a-z0-9-]+-v1$/, item.id);
    assert.ok(item.fixture.prerequisites.length > 0, item.id);
    assert.ok(item.fixture.setup.length > 0, item.id);
    assert.ok(Object.keys(item.fixture.inputData).length > 0, item.id);
    assert.ok(Array.isArray(item.allowedMutations), item.id);
    assert.ok(item.expectedBehavior.length >= 2, item.id);
    assert.ok(item.readbackEvidence.length > 0, item.id);
    assert.ok(item.teardown.length > 0, item.id);
    assert.ok(item.expectedResult.requiredFields.includes("status"), item.id);
    assert.ok(item.expectedResult.requiredFields.includes("code"), item.id);
    assert.ok(item.expectedResult.requiredFields.includes("mutations"), item.id);
    assert.ok(item.localEvidence.tests.every((candidate) => candidate.startsWith("tests/codex-plugin/scripts/") || candidate.startsWith("scripts/")), item.id);
    assert.match(item.localEvidence.notRun, /NOT_RUN|No live/i, item.id);
  }
  for (const id of ["P1", "P2", "N1", "N2"]) assert.deepEqual(allCases(fixture).find((item) => item.id === id).allowedMutations, [], id);
  assert.match(fixture.positive.find(({ id }) => id === "P3").allowedMutations.join(" "), /\[mcp_servers\.nacl_neo4j\]/);
  assert.match(fixture.positive.find(({ id }) => id === "P4").allowedMutations.join(" "), /write-canary|canary/i);
  assert.match(fixture.positive.find(({ id }) => id === "P5").fixture.inputData.statement, /project history remains auditable/);
  const checksumCase = fixture.negative.find(({ id }) => id === "N3");
  assert.match(checksumCase.allowedMutations.join(" "), /only the untrusted temporary/);
  assert.equal(checksumCase.fixture.inputData.actualChecksum, "d383404402e24a4bc4ca1ad169293a81e12d630b3bd8c4f8f5249f5b564447e6");
  assert.match(checksumCase.fixture.inputData.expectedChecksum, /archive_sha256_<detected-platform>.*neo4j-mcp-release\.pin/);
});

test("negative cases explain why they must not complete and require preservation evidence", async () => {
  const fixture = await json(sourceRoot, fixtureRelative);
  for (const item of fixture.negative) {
    assert.equal(item.expectedResult.status, "BLOCKED", item.id);
    assert.ok(item.whyMustNotComplete.length >= 40, item.id);
    assert.match(item.readbackEvidence.join(" "), /unchanged|identical|no matching|no container|preserve|absent|byte/i, item.id);
  }
  assert.match(fixture.negative[0].whyMustNotComplete, /confirmation/i);
  assert.match(fixture.negative[1].whyMustNotComplete, /canonical root|symlink/i);
  assert.match(fixture.negative[2].whyMustNotComplete, /supply-chain|attacker-controlled/i);
});

test("local evidence remains honest about Docker portions, live BA, and portal execution", async () => {
  const fixture = await json(sourceRoot, fixtureRelative);
  assert.equal(fixture.executionEvidence.contractTests.status, "VERIFIED_CONTRACT_ONLY");
  assert.equal(fixture.executionEvidence.localDocker.status, "PARTIALLY_VERIFIED");
  assert.deepEqual(fixture.executionEvidence.localDocker.coveredCases, ["P3", "P4"]);
  assert.match(fixture.executionEvidence.localDocker.notRun, /write-canary.*NOT_RUN/i);
  assert.equal(fixture.executionEvidence.liveBa.status, "NOT_RUN");
  assert.equal(fixture.executionEvidence.portalReviewer.status, "NOT_RUN");
  assert.equal(fixture.positive.find(({ id }) => id === "P3").localEvidence.status, "PARTIALLY_VERIFIED");
  assert.equal(fixture.positive.find(({ id }) => id === "P4").localEvidence.status, "PARTIALLY_VERIFIED");
  assert.equal(fixture.positive.find(({ id }) => id === "P5").localEvidence.status, "VERIFIED_CONTRACT_ONLY");
  assert.match(fixture.positive.find(({ id }) => id === "P5").localEvidence.notRun, /No live.*BA plan.*write.*readback.*claimed/i);
});

test("fixture schema binds semantic IDs and roles in exact order instead of counts alone", async () => {
  const schema = await json(sourceRoot, schemaRelative);
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, 2);
  assert.equal(schema.properties.submissionType.const, "SKILLS_ONLY");
  assert.deepEqual(
    [schema.properties.positive.minItems, schema.properties.positive.maxItems, schema.properties.negative.minItems, schema.properties.negative.maxItems],
    [5, 5, 3, 3],
  );
  assert.deepEqual(schema.properties.positive.prefixItems.map(({ $ref }) => $ref), ["#/$defs/P1", "#/$defs/P2", "#/$defs/P3", "#/$defs/P4", "#/$defs/P5"]);
  assert.deepEqual(schema.properties.negative.prefixItems.map(({ $ref }) => $ref), ["#/$defs/N1", "#/$defs/N2", "#/$defs/N3"]);
  assert.equal(schema.properties.positive.items, false);
  assert.equal(schema.properties.negative.items, false);
  for (const expected of expectedCases) {
    const semantic = schema.$defs[expected.id].allOf[1].properties;
    assert.equal(semantic.id.const, expected.id);
    assert.equal(semantic.role.const, expected.role);
    assert.equal(semantic.prompt.const, expected.prompt);
    if (expected.id.startsWith("P")) assert.equal(semantic.entrySkill.const, expected.entrySkill);
    assert.equal(semantic.expectedResult.properties.status.const, expected.status);
    assert.equal(semantic.expectedResult.properties.code.const, expected.code);
  }
  assert.equal(schema.$defs.positiveCase.additionalProperties, false);
  assert.equal(schema.$defs.negativeCase.additionalProperties, false);
  assert.ok(schema.$defs.negativeCase.required.includes("whyMustNotComplete"));
});

test("reviewer artifacts contain no public endpoint, OAuth contract, credentials, secret value, package-only tool, or personal path", async () => {
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
