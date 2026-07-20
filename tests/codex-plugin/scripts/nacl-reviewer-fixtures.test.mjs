import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceRoot = path.join(repoRoot, "codex-plugin-src", "package");
const pluginRoot = path.join(repoRoot, "plugins", "nacl");
const fixtureRelative = "submission/reviewer-fixtures.json";
const schemaRelative = "submission/reviewer-fixtures.schema.json";
const bootstrapRoot = path.join(pluginRoot, "resources", "bootstrap");
const planRunner = path.join(bootstrapRoot, "plan-project-graph.mjs");
const setupPosix = path.join(bootstrapRoot, "setup-project-graph.sh");
const setupPowerShell = path.join(bootstrapRoot, "setup-project-graph.ps1");
const archiveProbe = path.join(bootstrapRoot, "install-pinned-neo4j-mcp.mjs");
const initSkill = path.join(sourceRoot, "skills", "nacl-init", "SKILL.md");

const expectedCases = [
  {
    id: "P1",
    role: "READ_ONLY_DIAGNOSE_UNINITIALIZED",
    prompt: "Use NaCl Diagnose to inspect this project in read-only mode. Do not initialize or change anything.",
    entrySkill: "nacl-diagnose",
    status: "NOT_RUN",
    code: "PROJECT_MCP_NOT_CONFIGURED",
    requiredFields: ["status", "code", "initializationState", "canonicalProjectRoot", "evidence", "mutation", "network", "docker"],
  },
  {
    id: "P2",
    role: "INIT_PLAN_NO_MUTATION",
    prompt: "Use NaCl Init for this project. Show the complete local bootstrap plan and required confirmation, then stop without applying it.",
    entrySkill: "nacl-init",
    status: "NOT_RUN",
    code: "PLAN_READY",
    requiredFields: ["contract", "status", "code", "plan", "planHash", "confirmation"],
  },
  {
    id: "P3",
    role: "CONFIRMED_INIT_APPLY_AND_HANDOFF",
    prompt: "Apply the latest NaCl Init local bootstrap plan using the exact confirmation it returned.",
    entrySkill: "nacl-init",
    status: "PARTIALLY_VERIFIED",
    code: "RESTART_REQUIRED",
    requiredFields: ["status", "code", "bootstrap", "initialization"],
  },
  {
    id: "P4",
    role: "NEW_TASK_END_TO_END_INIT_VERIFICATION",
    prompt: "Continue NaCl Init for this already bootstrapped project and verify it end to end.",
    entrySkill: "nacl-init",
    status: "VERIFIED",
    code: "INITIALIZATION_VERIFIED",
    requiredFields: ["status", "code", "initializationState", "mcpServerKey", "mcpInitialize", "mcpToolsList", "readTool", "writeTool", "graphHealth", "schemaVersion", "schemaChecksum", "namedRead", "writeCanary", "writeReadback"],
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
    code: "PROJECT_ROOT_NOT_CANONICAL",
    requiredFields: ["contract", "status", "code"],
  },
  {
    id: "N3",
    role: "CHECKSUM_MISMATCH_READ_ONLY_REFUSAL",
    prompt: "Continue installation even though the downloaded neo4j-mcp checksum does not match.",
    entrySkill: "nacl-init",
    status: "BLOCKED",
    code: "BINARY_ARCHIVE_CHECKSUM_MISMATCH",
    requiredFields: ["status", "code", "expected_sha256", "actual_sha256", "artifact_disposition", "mutation"],
  },
];

async function json(root, relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

function allCases(fixture) {
  return [...fixture.positive, ...fixture.negative];
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", timeout: 30_000, ...options });
}

function parseMarker(output, prefix) {
  const line = output.split(/\r?\n/).find((candidate) => candidate.includes(prefix));
  assert.ok(line, `missing ${prefix} in ${output}`);
  const payload = line.slice(line.indexOf(prefix) + prefix.length);
  return Object.fromEntries([...payload.matchAll(/([A-Za-z_][A-Za-z0-9_]*)=([^\s"']+)/g)]
    .map((match) => [match[1], match[2]]));
}

function assertRequiredFields(actual, expected, label) {
  for (const field of expected) assert.ok(Object.hasOwn(actual, field), `${label}: ${field}`);
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

test("P1 and P2 are cross-checked against the real read-only plan runner", async () => {
  const fixture = await json(sourceRoot, fixtureRelative);
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nacl-reviewer-p1-p2-")));
  const project = path.join(root, "project");
  try {
    await mkdir(project);
    await writeFile(path.join(project, "README.md"), "# NaCl public reviewer fixture");

    const diagnosedProcess = run(process.execPath, [planRunner, "--diagnose-only", "--project-root", project]);
    assert.equal(diagnosedProcess.status, 0, diagnosedProcess.stderr);
    const diagnosed = JSON.parse(diagnosedProcess.stdout);
    const p1 = fixture.positive.find(({ id }) => id === "P1");
    assert.equal(diagnosed.status, p1.expectedResult.status);
    assert.equal(diagnosed.code, p1.expectedResult.code);
    assertRequiredFields(diagnosed, p1.expectedResult.requiredFields, "P1");
    assert.equal(diagnosed.initializationState, "UNINITIALIZED");
    assert.equal(diagnosed.canonicalProjectRoot, project);
    assert.equal(diagnosed.mutation, "NONE");
    assert.equal(diagnosed.network, "NONE");
    assert.equal(diagnosed.docker, "NOT_INSPECTED");
    assert.ok(diagnosed.evidence.every(({ state }) => state === "ABSENT"));
    assert.deepEqual(await readdir(project), ["README.md"]);
    assert.equal(await readFile(path.join(project, "README.md"), "utf8"), "# NaCl public reviewer fixture");

    const plannedProcess = run(process.execPath, [
      planRunner,
      "--project-root", project,
      "--project-id", "review-fixture",
      "--database", "neo4j",
      "--bolt-port", "39687",
      "--http-port", "39474",
    ]);
    assert.equal(plannedProcess.status, 0, plannedProcess.stderr);
    const planned = JSON.parse(plannedProcess.stdout);
    const p2 = fixture.positive.find(({ id }) => id === "P2");
    assert.equal(planned.status, p2.expectedResult.status);
    assert.equal(planned.code, p2.expectedResult.code);
    assert.deepEqual(Object.keys(planned), p2.expectedResult.requiredFields);
    assert.equal(planned.plan.canonicalProjectRoot, project);
    assert.ok(planned.plan.intendedFiles.length > 0);
    assert.deepEqual(planned.plan.ports, {
      bolt: { host: "127.0.0.1", port: 39687, availability: "VALIDATED_BY_APPLY_PREFLIGHT" },
      http: { host: "127.0.0.1", port: 39474, availability: "VALIDATED_BY_APPLY_PREFLIGHT" },
    });
    assert.equal(planned.plan.intendedDockerResources.container, "review-fixture-neo4j");
    assert.equal(planned.plan.neo4jMcp.source, "neo4j/mcp");
    assert.equal(planned.plan.rollbackPolicy.freshProjectFiles, "REMOVE_ONLY_FILES_CREATED_BY_THIS_RUN");
    assert.match(planned.confirmation, new RegExp(`^INIT_LOCAL_GRAPH:review-fixture:${planned.planHash}$`));
    assert.deepEqual(await readdir(project), ["README.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("P3 and P4 exact aggregates are bound to both bootstrap runners and nacl-init", async () => {
  const fixture = await json(sourceRoot, fixtureRelative);
  const p3 = fixture.positive.find(({ id }) => id === "P3");
  for (const filename of [setupPosix, setupPowerShell]) {
    const source = await readFile(filename, "utf8");
    const marker = parseMarker(source, "NACL_SKILLS_ONLY_BOOTSTRAP:");
    assertRequiredFields(marker, p3.expectedResult.requiredFields, path.basename(filename));
    assert.equal(marker.status, p3.expectedResult.status);
    assert.equal(marker.code, p3.expectedResult.code);
    assert.equal(marker.bootstrap, "VERIFIED");
    assert.equal(marker.initialization, "NOT_RUN");
    assert.doesNotMatch(source.slice(source.indexOf("NACL_SKILLS_ONLY_BOOTSTRAP:")), /status=VERIFIED\b/);
  }

  const skill = await readFile(initSkill, "utf8");
  const start = skill.indexOf("Return these exact result fields:");
  const end = skill.indexOf(". Set `status=VERIFIED`", start);
  assert.ok(start >= 0 && end > start);
  const aggregateFields = [...skill.slice(start, end).matchAll(/`([A-Za-z][A-Za-z0-9]*)`/g)].map((match) => match[1]);
  const p4 = fixture.positive.find(({ id }) => id === "P4");
  assert.deepEqual(aggregateFields, p4.expectedResult.requiredFields);
  assert.match(skill, /Set `status=VERIFIED`, `code=INITIALIZATION_VERIFIED`, and\s+`initializationState=VERIFIED` only when every field is verified/);
});

test("N1 exact confirmation refusal is executable and required by nacl-init", { skip: process.platform === "win32" }, async () => {
  const fixture = await json(sourceRoot, fixtureRelative);
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nacl-reviewer-n1-")));
  try {
    await writeFile(path.join(root, "README.md"), "preserved\n");
    const refused = run("sh", [
      setupPosix,
      "--project-root", root,
      "--project-id", "review-n1",
      "--bolt-port", "40687",
      "--http-port", "40474",
      "--confirmation", "ABSENT",
    ]);
    assert.notEqual(refused.status, 0);
    const marker = parseMarker(refused.stderr, "NACL_GRAPH_RESULT:");
    const n1 = fixture.negative.find(({ id }) => id === "N1");
    assert.equal(marker.status, n1.expectedResult.status);
    assert.equal(marker.code, n1.expectedResult.code);
    assert.deepEqual(await readdir(root), ["README.md"]);
    assert.equal(await readFile(path.join(root, "README.md"), "utf8"), "preserved\n");
    const skill = await readFile(initSkill, "utf8");
    assert.match(skill, /fresh\s+`INIT_LOCAL_GRAPH:<project-id>:<sha256>` token, then stop/);
    assert.match(skill, /After the user repeats that exact token/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("N2 canonical-root gate wins before malformed config and preserves every byte", { skip: process.platform === "win32" }, async () => {
  const fixture = await json(sourceRoot, fixtureRelative);
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nacl-reviewer-n2-")));
  const project = path.join(root, "project");
  const alias = path.join(root, "project-alias");
  try {
    await mkdir(path.join(project, ".codex"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# NaCl unsafe-root fixture");
    await writeFile(path.join(project, ".codex", "config.toml"), "model =");
    await symlink(project, alias);
    const before = await readFile(path.join(project, ".codex", "config.toml"));
    const refused = run(process.execPath, [
      planRunner,
      "--project-root", alias,
      "--project-id", "review-n2",
      "--database", "neo4j",
      "--bolt-port", "41687",
      "--http-port", "41474",
    ]);
    assert.notEqual(refused.status, 0);
    const result = JSON.parse(refused.stderr);
    const n2 = fixture.negative.find(({ id }) => id === "N2");
    assert.deepEqual(Object.keys(result), n2.expectedResult.requiredFields);
    assert.equal(result.status, n2.expectedResult.status);
    assert.equal(result.code, n2.expectedResult.code);
    assert.deepEqual(await readFile(path.join(project, ".codex", "config.toml")), before);
    assert.deepEqual((await readdir(project)).sort(), [".codex", "README.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("N3 invokes the bundled read-only archive checksum probe and preserves public bytes", async () => {
  const fixture = await json(sourceRoot, fixtureRelative);
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nacl-reviewer-n3-")));
  const artifact = path.join(root, "reviewer-artifact.bin");
  try {
    await writeFile(artifact, "untrusted reviewer fixture");
    const before = await readFile(artifact);
    const refused = run(process.execPath, [archiveProbe, "--verify-archive", artifact], { cwd: root });
    assert.notEqual(refused.status, 0);
    assert.equal(refused.stdout, "");
    const result = parseMarker(refused.stderr, "NACL_BINARY_ARCHIVE_CHECKSUM:");
    const n3 = fixture.negative.find(({ id }) => id === "N3");
    assert.deepEqual(Object.keys(result), n3.expectedResult.requiredFields);
    assert.equal(result.status, n3.expectedResult.status);
    assert.equal(result.code, n3.expectedResult.code);
    const supply = await import(`${pathToFileURL(path.join(bootstrapRoot, "neo4j-mcp-supply.mjs")).href}?reviewer=${Date.now()}`);
    const identity = supply.releaseIdentity(path.join(bootstrapRoot, "neo4j-mcp-release.pin"));
    assert.equal(result.expected_sha256, identity.archiveSha256);
    assert.equal(result.actual_sha256, n3.fixture.inputData.actualChecksum);
    assert.equal(result.artifact_disposition, "PRESERVED_INPUT");
    assert.equal(result.mutation, "NONE");
    assert.deepEqual(await readFile(artifact), before);
    assert.deepEqual(await readdir(root), ["reviewer-artifact.bin"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
    assert.ok(item.localEvidence.tests.every((candidate) => candidate.startsWith("tests/codex-plugin/scripts/") || candidate.startsWith("scripts/")), item.id);
    assert.match(item.localEvidence.notRun, /NOT_RUN|No live/i, item.id);
  }
  for (const id of ["P1", "P2", "N1", "N2", "N3"]) assert.deepEqual(allCases(fixture).find((item) => item.id === id).allowedMutations, [], id);
  assert.match(fixture.positive.find(({ id }) => id === "P3").allowedMutations.join(" "), /\[mcp_servers\.nacl_neo4j\]/);
  assert.match(fixture.positive.find(({ id }) => id === "P4").allowedMutations.join(" "), /write-canary|canary/i);
  assert.match(fixture.positive.find(({ id }) => id === "P5").fixture.inputData.statement, /project history remains auditable/);
  const checksumCase = fixture.negative.find(({ id }) => id === "N3");
  assert.equal(checksumCase.fixture.inputData.actualChecksum, "d383404402e24a4bc4ca1ad169293a81e12d630b3bd8c4f8f5249f5b564447e6");
  assert.match(checksumCase.fixture.inputData.expectedChecksum, /archive_sha256_<detected-platform>.*neo4j-mcp-release\.pin/);
  assert.doesNotMatch(JSON.stringify({
    allowedMutations: checksumCase.allowedMutations,
    fixture: checksumCase.fixture,
    expectedBehavior: checksumCase.expectedBehavior,
    expectedResult: checksumCase.expectedResult,
    readbackEvidence: checksumCase.readbackEvidence,
    teardown: checksumCase.teardown,
  }), /quarantine|offline artifact|package installation/i);
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
