import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CAPABILITY_POLICY } from "../../../plugins/nacl/runtime/graph-gateway/authorization.mjs";
import {
  concurrencyRequestContext,
  deriveWorkerId,
  parseVerificationEvidence,
  sanitizeChanges,
  RESOURCE_CAPABILITIES,
} from "../../../plugins/nacl/runtime/graph-gateway/concurrency.mjs";
import { PROJECT_TOOL_DEFINITIONS } from "../../../plugins/nacl/runtime/graph-gateway/project-tools.mjs";
import { GRAPH_TOOL_DEFINITIONS } from "../../../plugins/nacl/runtime/graph-gateway/tool-schemas.mjs";
import { WORKFLOW_TOOL_DEFINITIONS, createWorkflowToolGateway } from "../../../plugins/nacl/runtime/workflow-cli/workflow-tools.mjs";
import {
  CLOSED_WORKFLOW_STATUSES,
  classifyReleaseSaValidation,
} from "../../../plugins/nacl/runtime/workflow-cli/release-policy.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pluginRoot = path.join(repoRoot, "plugins", "nacl");
const indexPath = path.join(pluginRoot, "resources", "package-index.json");
const mapPath = path.join(pluginRoot, "resources", "references", "workflow-gateway-map.json");
const parityPath = path.join(pluginRoot, "resources", "references", "workflow-parity-baseline.json");
const CLOSED = ["VERIFIED", "FAILED", "PARTIALLY_VERIFIED", "BLOCKED", "NOT_RUN", "UNVERIFIED"];

async function json(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

async function hash(filename) {
  return createHash("sha256").update(await readFile(filename)).digest("hex");
}

function description(content) {
  const match = /^---\n[\s\S]*?^description:\s*(.+)$[\s\S]*?^---$/m.exec(content);
  assert.ok(match, "description frontmatter is required");
  return match[1].trim();
}

test("all ten public entries and all 60 internal workflows have deterministic mapped coverage", async () => {
  const [index, map] = await Promise.all([json(indexPath), json(mapPath)]);
  assert.deepEqual(map.closedStatuses, CLOSED);
  assert.equal(Object.keys(map.publicEntries).length, 10);
  assert.deepEqual(Object.keys(map.publicEntries).sort(), [...index.publicEntrySkills].sort());
  const audited = map.workflowAuditGroups.flatMap((group) => group.workflows);
  assert.equal(audited.length, 60);
  assert.equal(new Set(audited).size, 60);
  assert.deepEqual([...audited].sort(), [...index.internalWorkflows].sort());
  for (const group of map.workflowAuditGroups) {
    assert.ok(Object.hasOwn(map.sequences, group.sequence), group.id);
    assert.ok(typeof group.reason === "string" && group.reason.length >= 40, group.id);
  }
  for (const [entry, binding] of Object.entries(map.publicEntries)) {
    assert.ok(Object.hasOwn(map.sequences, binding.sequence), entry);
    assert.ok(binding.workflows.length > 0, entry);
    assert.ok(binding.workflows.every((name) => index.internalWorkflows.includes(name)), entry);
  }
});

test("workflow map names only shipped tools, exact approvals, and supported resource capabilities", async () => {
  const map = await json(mapPath);
  const definitions = [
    { name: "nacl_installation_doctor" },
    ...PROJECT_TOOL_DEFINITIONS,
    ...WORKFLOW_TOOL_DEFINITIONS,
    ...GRAPH_TOOL_DEFINITIONS,
  ];
  const names = new Set(definitions.map((definition) => definition.name));
  assert.equal(names.size, definitions.length);
  for (const [sequenceName, sequence] of Object.entries(map.sequences)) {
    assert.ok(sequence.tools.length > 0, sequenceName);
    for (const tool of sequence.tools) assert.ok(names.has(tool), `${sequenceName}: ${tool}`);
  }
  assert.equal(RESOURCE_CAPABILITIES.Board, "ba.write");
  assert.equal(RESOURCE_CAPABILITIES.Module, "sa.write");
  assert.equal(RESOURCE_CAPABILITIES.FeatureRequest, "sa.write");
  assert.equal(RESOURCE_CAPABILITIES.UseCase, "sa.write");
  assert.equal(RESOURCE_CAPABILITIES.Task, "tl.write");
  assert.equal(RESOURCE_CAPABILITIES.SchemaMigration, "schema.admin");
  assert.equal(RESOURCE_CAPABILITIES.ReleaseEnvironment, "release.write");
  assert.equal(CAPABILITY_POLICY[RESOURCE_CAPABILITIES.UseCase].confirmation, "APPROVE_SA_WRITE");
  assert.equal(map.sequences["ba-resource"].approval, "APPROVE_BA_WRITE");
  assert.equal(map.sequences["sa-resource"].approval, "APPROVE_SA_WRITE");
  assert.equal(map.sequences["tl-task"].approval, "APPROVE_TL_WRITE");
  assert.equal(map.sequences["tl-task"].noTestEvidenceConfirmation, "CONFIRM_NO_TEST_EVIDENCE");
  assert.equal(map.sequences.release.approval, "CONFIRM_RELEASE_OPERATION");
  assert.equal(map.sequences.release.taskApproval, "APPROVE_TL_WRITE");
});

test("public description budget and conductor bindings retain every critical entry", async () => {
  const index = await json(indexPath);
  let bytes = 0;
  for (const entry of index.publicEntrySkills) {
    const content = await readFile(path.join(pluginRoot, "skills", entry, "SKILL.md"), "utf8");
    const summary = description(content);
    bytes += Buffer.byteLength(summary);
    assert.ok(summary.length >= 80, entry);
    assert.match(content, /nacl_installation_doctor/, entry);
    assert.match(content, /workflow-gateway-contract\.md/, entry);
    assert.doesNotMatch(content, /\b(?:model|model_reasoning_effort)\s*:/i, entry);
    assert.doesNotMatch(content, /\/Users\//, entry);
  }
  assert.ok(bytes <= 2048, `public description budget is ${bytes} bytes`);
  for (const conductor of ["nacl-init", "nacl-goal", "nacl-ba-full", "nacl-sa-full", "nacl-tl-conductor", "nacl-tl-full", "nacl-migrate", "nacl-publish"]) {
    const content = await readFile(path.join(pluginRoot, "resources", "workflows", conductor, "SKILL.md"), "utf8");
    assert.match(content, /## Packaged Gateway Binding/, conductor);
    assert.match(content, /workflow-gateway-contract\.md/, conductor);
  }
});

test("strict evidence parser accepts every documented semantic shape", () => {
  const valid = [
    "test-GREEN:tests/task.test.mjs",
    "test-GREEN:.tl/tasks/UC-302/regression-test.md",
    "test-UNVERIFIED",
    "no-test",
    "repo-checks-GREEN:abcdef1",
    "wire-evidence:fixture:tests/fixtures/provider/response.json",
    "wire-evidence:contract-test:tests/contracts/provider.test.mjs",
    "wire-evidence:live-smoke:2026-05-19T22:28:00Z",
    "wire-evidence:live-smoke:2026-05-19T22:28:00.123+03:00",
    "qa-stage:component:VERIFIED",
    "qa-stage:local-runtime:PARTIALLY_VERIFIED",
    "qa-stage:wire-contract:FAILED",
    "qa-stage:provider-fixture:BLOCKED",
    "qa-stage:live-provider-smoke:NOT_RUN",
    "qa-stage:prod-golden-path:UNVERIFIED",
    "stub-shape-validated:UC-302:FormField:workflow-step",
    "stub-shape-validated:TECH-12:DomainAttribute:s3_keys",
    "stub-shape-validated:.tl/specs/UC-302.md:42",
    "stub-shape-validated:.tl/tasks/UC-302/api-contract.md:18",
  ];
  for (const evidence of valid) assert.equal(parseVerificationEvidence(evidence).tokens.length, 1, evidence);
  const combined = valid.filter((value) => value !== "no-test" && value !== "test-UNVERIFIED").join(" ");
  assert.equal(parseVerificationEvidence(combined).qaStages.size, 6);
});

test("strict evidence parser rejects unknown, duplicate, unsafe, and malformed evidence", () => {
  const invalid = [
    "unknown",
    "test-GREEN:tests/a.mjs test-GREEN:tests/a.mjs",
    "repo-checks-GREEN:abcdef1 repo-checks-GREEN:abcdef2",
    "qa-stage:component:VERIFIED qa-stage:component:FAILED",
    "stub-shape-validated:UC-302:FormField:field stub-shape-validated:UC-302:FormField:field",
    "test-GREEN:/tmp/test.mjs",
    "test-GREEN:./tests/test.mjs",
    "test-GREEN:tests//test.mjs",
    "test-GREEN:tests/./test.mjs",
    "test-GREEN:tests/../test.mjs",
    "test-GREEN:tests/my test.mjs",
    "test-GREEN:tests\\test.mjs",
    "wire-evidence:fixture:C:/absolute.json",
    "wire-evidence:contract-test:../contract.test.mjs",
    "wire-evidence:live-smoke:2026-02-30T22:28:00Z",
    "wire-evidence:live-smoke:2026-05-19T25:28:00Z",
    "wire-evidence:live-smoke:not-an-instant",
    "qa-stage:unknown:VERIFIED",
    "qa-stage:component:PASS",
    "stub-shape-validated:UC-302:Unknown:field",
    "stub-shape-validated:UC302:FormField:field",
    "stub-shape-validated:.tl/specs/UC-302.md:0",
    "stub-shape-validated:../spec.md:42",
    " test-UNVERIFIED",
    "test-UNVERIFIED ",
    "test-UNVERIFIED  qa-stage:component:UNVERIFIED",
  ];
  for (const evidence of invalid) {
    assert.throws(() => parseVerificationEvidence(evidence), (error) => error.code === "TERMINAL_TASK_EVIDENCE_INVALID", evidence);
  }
});

test("successful terminal Task writes require semantic same-mutation evidence and explicit no-test confirmation", () => {
  assert.throws(
    () => sanitizeChanges("Task", { status: "done" }),
    (error) => error.code === "TERMINAL_TASK_EVIDENCE_REQUIRED" && error.status === "BLOCKED",
  );
  assert.throws(
    () => sanitizeChanges("Task", { status: "done", verification_evidence: "unknown" }),
    (error) => error.code === "TERMINAL_TASK_EVIDENCE_INVALID",
  );
  assert.throws(
    () => sanitizeChanges("Task", { status: "done", verification_evidence: "test-UNVERIFIED" }),
    (error) => error.code === "TERMINAL_TASK_EVIDENCE_INVALID",
  );
  assert.throws(
    () => sanitizeChanges("Task", { status: "done", verification_evidence: "no-test" }),
    (error) => error.code === "NO_TEST_EVIDENCE_CONFIRMATION_REQUIRED" && error.status === "BLOCKED",
  );
  assert.throws(
    () => sanitizeChanges("Task", { status: "done", verification_evidence: "no-test" }, { evidenceConfirmation: "WRONG" }),
    (error) => error.code === "NO_TEST_EVIDENCE_CONFIRMATION_REQUIRED",
  );
  assert.throws(
    () => sanitizeChanges("Task", { status: "done", verification_evidence: "test-GREEN:tests/task.test.mjs test-UNVERIFIED" }),
    (error) => error.code === "TERMINAL_TASK_EVIDENCE_INVALID",
  );
  assert.deepEqual(
    sanitizeChanges("Task", { status: "done", verification_evidence: "repo-checks-GREEN:abcdef1 test-GREEN:tests/task.test.mjs" }),
    { status: "done", verification_evidence: "repo-checks-GREEN:abcdef1 test-GREEN:tests/task.test.mjs" },
  );
  assert.deepEqual(
    sanitizeChanges("Task", { status: "verified-pending", verification_evidence: "test-UNVERIFIED qa-stage:component:PARTIALLY_VERIFIED" }),
    { status: "verified-pending", verification_evidence: "test-UNVERIFIED qa-stage:component:PARTIALLY_VERIFIED" },
  );
  assert.deepEqual(
    sanitizeChanges(
      "Task",
      { status: "done", verification_evidence: "no-test" },
      { evidenceConfirmation: "CONFIRM_NO_TEST_EVIDENCE" },
    ),
    { status: "done", verification_evidence: "no-test" },
  );
  assert.throws(
    () => sanitizeChanges(
      "Task",
      { status: "done", verification_evidence: "test-GREEN:tests/task.test.mjs" },
      { evidenceConfirmation: "CONFIRM_NO_TEST_EVIDENCE" },
    ),
    (error) => error.code === "NO_TEST_EVIDENCE_CONFIRMATION_UNEXPECTED",
  );
  assert.deepEqual(sanitizeChanges("Task", { status: "blocked", blocked_reason: "dependency" }), {
    blocked_reason: "dependency",
    status: "blocked",
  });
});

test("no-test confirmation is an exact mutate schema field bound into request context", () => {
  const definition = GRAPH_TOOL_DEFINITIONS.find((item) => item.name === "nacl_graph_mutate_resource");
  assert.equal(definition.inputSchema.properties.evidence_confirmation.const, "CONFIRM_NO_TEST_EVIDENCE");
  const identity = {
    principal_id: "principal-evidence",
    client_id: "client-desktop",
    session_id: "session-evidence",
    worktree_id: "worktree-evidence",
    branch: "codex/evidence",
    base_sha: "a".repeat(40),
  };
  identity.worker_id = deriveWorkerId({
    principal_id: identity.principal_id,
    client_id: identity.client_id,
    session_id: identity.session_id,
  });
  const request = {
    project_id: "evidence-project",
    project_root: "/tmp/evidence-project",
    ...identity,
    resource_type: "Task",
    resource_id: "TASK-EVIDENCE",
    fencing_token: 1,
    expected_revision: 0,
    idempotency_key: "evidence-no-test-001",
    approval: "APPROVE_TL_WRITE",
    evidence_confirmation: "CONFIRM_NO_TEST_EVIDENCE",
    changes: { status: "done", verification_evidence: "no-test" },
  };
  const context = concurrencyRequestContext(definition, request, { nowMs: 1 });
  assert.equal(context.evidenceConfirmation, "CONFIRM_NO_TEST_EVIDENCE");
  assert.match(context.payloadHash, /^[0-9a-f]{64}$/);
});

test("release methodology uses only closed statuses and FAILED plus CRITICAL blocks", async () => {
  assert.deepEqual(CLOSED_WORKFLOW_STATUSES, CLOSED);
  assert.deepEqual(
    classifyReleaseSaValidation({ status: "FAILED", findings: [{ severity: "CRITICAL" }] }),
    { status: "BLOCKED", code: "sa-validate-critical" },
  );
  assert.equal(
    classifyReleaseSaValidation({ status: "FAILED", findings: [{ severity: "WARNING" }] }).status,
    "VERIFIED",
  );
  assert.throws(() => classifyReleaseSaValidation({ status: "FAIL", findings: [{ severity: "CRITICAL" }] }), /closed status/);
  const release = await readFile(path.join(pluginRoot, "resources", "workflows", "nacl-tl-release", "SKILL.md"), "utf8");
  assert.match(release, /reports `Status: FAILED` with at least one finding at `severity: CRITICAL` \| `BLOCKED` \| `sa-validate-critical`/);
  const packagedSource = await readFile(path.join(pluginRoot, "resources", "nacl-tl-release", "SKILL.md"), "utf8");
  for (const content of [release, packagedSource]) {
    for (const [, status] of content.matchAll(/Status:\s*([A-Z][A-Z_-]*)/g)) {
      assert.ok(CLOSED.includes(status), status);
    }
  }
});

test("MCP lifecycle tools stop on confirmation before side effects", async () => {
  const calls = [];
  const lifecycle = {
    async init(input) { calls.push(["init", input]); return { contract: "nacl-local-graph-lifecycle-v1", operation: "init", status: "VERIFIED", code: "INSTANCE_INITIALIZED" }; },
    async start(input) { calls.push(["start", input]); return { contract: "nacl-local-graph-lifecycle-v1", operation: "start", status: "VERIFIED", code: "GRAPH_STARTED" }; },
    async doctor(input) { calls.push(["doctor", input]); return { contract: "nacl-local-graph-lifecycle-v1", operation: "doctor", status: "VERIFIED", code: "GRAPH_HEALTHY" }; },
  };
  const gateway = createWorkflowToolGateway({ lifecycle });
  const common = { project_id: "workflow-project", project_root: "/tmp/workflow-project" };
  const declined = await gateway.callTool("nacl_graph_local_init", { ...common, confirmation: "no" });
  assert.equal(declined.status, "BLOCKED");
  assert.equal(declined.code, "CONFIRMATION_REQUIRED");
  assert.deepEqual(calls, []);
  assert.equal((await gateway.callTool("nacl_graph_local_init", { ...common, confirmation: "INIT_LOCAL_GRAPH:workflow-project" })).status, "VERIFIED");
  assert.equal((await gateway.callTool("nacl_graph_local_start", { ...common, confirmation: "START_LOCAL_GRAPH:workflow-project" })).status, "VERIFIED");
  assert.equal((await gateway.callTool("nacl_graph_local_doctor", common)).status, "VERIFIED");
  assert.deepEqual(calls.map(([name]) => name), ["init", "start", "doctor"]);
});

test("public nacl-init profile guidance matches create-only MCP schema and behavior", async () => {
  const publicEntry = await readFile(path.join(pluginRoot, "skills", "nacl-init", "SKILL.md"), "utf8");
  const plan = WORKFLOW_TOOL_DEFINITIONS.find((definition) => definition.name === "nacl_agent_profiles_plan");
  const apply = WORKFLOW_TOOL_DEFINITIONS.find((definition) => definition.name === "nacl_agent_profiles_apply");
  assert.equal(plan.annotations.readOnlyHint, true);
  assert.equal(apply.annotations.destructiveHint, false);
  assert.deepEqual(apply.inputSchema.required, ["project_root", "plan_token", "confirmation"]);
  assert.equal(Object.hasOwn(apply.inputSchema.properties, "expected_current_hashes"), false);
  assert.match(apply.description, /never overwritten/);
  assert.match(publicEntry, /`AGENT_PROFILE_CONFLICT`/);
  assert.match(publicEntry, /move or back up/);
  assert.match(publicEntry, /fresh plan/);
  assert.match(publicEntry, /nacl_agent_profiles_apply/);
  assert.doesNotMatch(publicEntry, /replacement confirmation|current hashes|paths\/actions\/hashes/i);

  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-public-init-contract-"));
  const gateway = createWorkflowToolGateway({ lifecycle: {} });
  try {
    const initialPlan = await gateway.callTool("nacl_agent_profiles_plan", { project_root: projectRoot });
    assert.equal(initialPlan.status, "VERIFIED");
    assert.equal(initialPlan.code, "AGENT_PROFILE_PLAN_READY");
    const installed = await gateway.callTool("nacl_agent_profiles_apply", {
      project_root: projectRoot,
      plan_token: initialPlan.planToken,
      confirmation: initialPlan.confirmation,
    });
    assert.equal(installed.status, "VERIFIED");
    assert.equal(installed.code, "AGENT_PROFILES_INSTALLED");

    const conflictPath = installed.entries[0].destination;
    const userBytes = "user-owned profile\n";
    await writeFile(conflictPath, userBytes, "utf8");
    const conflictPlan = await gateway.callTool("nacl_agent_profiles_plan", { project_root: projectRoot });
    assert.equal(conflictPlan.status, "BLOCKED");
    assert.equal(conflictPlan.code, "AGENT_PROFILE_CONFLICT");
    const conflictApply = await gateway.callTool("nacl_agent_profiles_apply", {
      project_root: projectRoot,
      plan_token: conflictPlan.planToken,
      confirmation: conflictPlan.confirmation,
    });
    assert.equal(conflictApply.status, "BLOCKED");
    assert.equal(conflictApply.code, "AGENT_PROFILE_CONFLICT");
    assert.equal(await readFile(conflictPath, "utf8"), userBytes);

    await rename(conflictPath, `${conflictPath}.user-backup`);
    const freshPlan = await gateway.callTool("nacl_agent_profiles_plan", { project_root: projectRoot });
    assert.equal(freshPlan.status, "VERIFIED");
    assert.equal(freshPlan.code, "AGENT_PROFILE_PLAN_READY");
    const reapplied = await gateway.callTool("nacl_agent_profiles_apply", {
      project_root: projectRoot,
      plan_token: freshPlan.planToken,
      confirmation: freshPlan.confirmation,
    });
    assert.equal(reapplied.status, "VERIFIED");
    assert.equal(reapplied.code, "AGENT_PROFILES_INSTALLED");
    assert.equal(await readFile(`${conflictPath}.user-backup`, "utf8"), userBytes);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("public nacl-init exposes only the bounded legacy-symlink migration corridor during mode=both", async () => {
  const publicEntry = await readFile(path.join(pluginRoot, "skills", "nacl-init", "SKILL.md"), "utf8");
  const plan = WORKFLOW_TOOL_DEFINITIONS.find((definition) => definition.name === "nacl_legacy_symlinks_plan");
  const apply = WORKFLOW_TOOL_DEFINITIONS.find((definition) => definition.name === "nacl_legacy_symlinks_apply");

  assert.ok(plan);
  assert.ok(apply);
  assert.equal(plan.annotations.readOnlyHint, true);
  assert.equal(plan.annotations.destructiveHint, false);
  assert.deepEqual(plan.inputSchema.required, []);
  assert.equal(apply.annotations.readOnlyHint, false);
  assert.equal(apply.annotations.destructiveHint, true);
  assert.equal(apply.annotations.idempotentHint, true);
  assert.deepEqual(apply.inputSchema.required, ["plan_token", "confirmation"]);
  assert.equal(apply.inputSchema.properties.plan_token.pattern, "^[0-9a-f]{64}$");

  assert.match(publicEntry, /status=FAILED.*mode=both/s);
  assert.match(publicEntry, /nacl_legacy_symlinks_plan/);
  assert.match(publicEntry, /nacl_legacy_symlinks_apply/);
  assert.match(publicEntry, /fixed 60-name catalog/);
  assert.match(publicEntry, /unknown `nacl-\*` artifacts, broken links, real files\/directories/);
  assert.match(publicEntry, /REMOVE_LEGACY_NACL_SYMLINKS:<plan-token>/);
  assert.match(publicEntry, /PARTIALLY_VERIFIED.*quarantine path/s);
  assert.match(publicEntry, /nacl_installation_doctor.*status=VERIFIED.*mode=plugin-only/s);
  assert.match(publicEntry, /No other project, graph, profile, or workflow tool is allowed.*mode=both/s);
  assert.match(publicEntry, /never modifies their source targets, real files\/directories,\s*project graph data, or project agent profiles/s);
});

test("packaged workflow parity has 39 exact copies and 21 explicit hash-bound divergences", async () => {
  const [index, parity] = await Promise.all([json(indexPath), json(parityPath)]);
  const actualDivergences = [];
  let exact = 0;
  for (const workflow of index.internalWorkflows) {
    const packaged = path.join(pluginRoot, "resources", "workflows", workflow, "SKILL.md");
    const codexRoot = path.join(repoRoot, "skills-for-codex", workflow, "SKILL.md");
    const [packagedSha256, codexRootSha256] = await Promise.all([hash(packaged), hash(codexRoot)]);
    if (packagedSha256 === codexRootSha256) exact += 1;
    else actualDivergences.push({ workflow, packagedSha256, codexRootSha256 });
  }
  assert.equal(index.internalWorkflows.length, 60);
  assert.equal(exact, parity.byteIdenticalCount);
  assert.equal(actualDivergences.length, parity.deliberateDivergences.length);
  assert.deepEqual(
    actualDivergences,
    parity.deliberateDivergences.map(({ workflow, packagedSha256, codexRootSha256 }) => ({ workflow, packagedSha256, codexRootSha256 })),
  );
  assert.ok(parity.deliberateDivergences.every((entry) => entry.reason.length >= 40));
});

test("all indexed workflow directories exist and no hidden peer workflow is omitted", async () => {
  const index = await json(indexPath);
  const actual = (await readdir(path.join(pluginRoot, "resources", "workflows"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("nacl-"))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(actual, [...index.internalWorkflows].sort());
  for (const workflow of actual) {
    const content = await readFile(path.join(pluginRoot, "resources", "workflows", workflow, "SKILL.md"), "utf8");
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(frontmatter, workflow);
    assert.doesNotMatch(frontmatter[1], /^(?:model|effort|model_reasoning_effort):/m, workflow);
    assert.doesNotMatch(content, /^```cypher$|^(?:MATCH|MERGE) \(/m, workflow);
    assert.doesNotMatch(content, /\/Users\/|\.\.\/\.\.\/\.\.\//, workflow);
  }
});
