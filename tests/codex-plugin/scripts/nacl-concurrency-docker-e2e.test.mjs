import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { deriveWorkerId } from "../../../plugins/nacl/runtime/graph-gateway/identity.mjs";
import { concurrencyRequestContext } from "../../../plugins/nacl/runtime/graph-gateway/concurrency.mjs";
import { runConcurrencyOperation } from "../../../plugins/nacl/runtime/graph-gateway/concurrency-engine.mjs";
import { loadMigrationCatalog } from "../../../plugins/nacl/runtime/graph-gateway/catalog.mjs";
import { createGraphGateway } from "../../../plugins/nacl/runtime/graph-gateway/gateway.mjs";
import { createLifecycleProjectResolver } from "../../../plugins/nacl/runtime/graph-gateway/lifecycle-adapter.mjs";
import { Neo4jHttpTransport } from "../../../plugins/nacl/runtime/graph-gateway/neo4j-http.mjs";
import { GRAPH_TOOL_BY_NAME } from "../../../plugins/nacl/runtime/graph-gateway/tool-schemas.mjs";
import { validateToolArguments } from "../../../plugins/nacl/runtime/graph-gateway/validation.mjs";
import { createLocalGraphLifecycle } from "../../../plugins/nacl/runtime/graph-cli/lifecycle.mjs";
import { EXPECTED_GATEWAY_SCHEMA } from "../../../plugins/nacl/runtime/graph-cli/contracts.mjs";
import { Neo4jHttpProbe } from "../../../plugins/nacl/runtime/graph-cli/graph-probe.mjs";
import { createProjectRouter } from "../../../plugins/nacl/runtime/graph-cli/project-registry.mjs";
import { MemorySecretProvider } from "../../../plugins/nacl/runtime/graph-cli/secret-provider.mjs";
import { prepareExactNeo4jImage } from "./neo4j-image-fixture.mjs";

const enabled = process.env.NACL_RUN_DOCKER_SMOKE === "1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pluginRoot = path.join(repoRoot, "plugins", "nacl");
const exactImage = "neo4j:5.24.2-community";
const sourceImage = "neo4j:5.24-community";
const baseSha = "b".repeat(40);

function docker(args) {
  return spawnSync("docker", args, { encoding: "utf8" });
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function identity(principal, session, suffix) {
  const core = {
    principal_id: principal,
    client_id: "client-desktop-wave5",
    session_id: session,
  };
  return {
    ...core,
    worker_id: deriveWorkerId(core),
    worktree_id: `worktree-${suffix}`,
    branch: `codex/wave5-${suffix}`,
    base_sha: baseSha,
  };
}

function approval(resourceType) {
  return {
    Task: "APPROVE_TL_WRITE",
    UseCase: "APPROVE_SA_WRITE",
    Module: "APPROVE_SA_WRITE",
    FeatureRequest: "APPROVE_SA_WRITE",
    Board: "APPROVE_BA_WRITE",
    SchemaMigration: "CONFIRM_SCHEMA_ADMIN",
    ReleaseEnvironment: "CONFIRM_RELEASE_OPERATION",
  }[resourceType];
}

function exactResourceAbsent(instance) {
  assert.notEqual(docker(["container", "inspect", instance.containerName]).status, 0);
  assert.notEqual(docker(["volume", "inspect", instance.volumeName]).status, 0);
  assert.notEqual(docker(["network", "inspect", `${instance.composeProject}_default`]).status, 0);
}

test(
  "real Neo4j serializes leases, fencing, CAS, idempotency, RBAC/revoke, and 1,000 typed allocations",
  { skip: !enabled, timeout: 600_000 },
  async () => {
    assert.equal(docker(["version", "--format", "{{.Server.Version}}"]).status, 0, "Docker daemon is required");
    const preparedImage = prepareExactNeo4jImage({ docker, exactImage, sourceImage });
    const root = await mkdtemp(path.join(os.tmpdir(), "nacl-wave5-concurrency-"));
    const stateRoot = path.join(root, "state");
    const projectRoot = path.join(root, "project");
    const projectId = `wave5-${Date.now()}-${process.pid}`;
    const secret = `wave5-${Date.now()}-${process.pid}-disposable-secret`;
    await mkdir(projectRoot);
    await writeFile(path.join(projectRoot, "config.yaml"), `project:\n  id: "${projectId}"\n`);
    git(projectRoot, ["init", "-q"]);
    git(projectRoot, ["config", "user.name", "NaCl Test"]);
    git(projectRoot, ["config", "user.email", "nacl-test@example.invalid"]);
    git(projectRoot, ["add", "config.yaml"]);
    git(projectRoot, ["commit", "-q", "-m", "wave5 fixture"]);

    const projectRouter = createProjectRouter({ registryRoot: path.join(stateRoot, ".project-registry") });
    await projectRouter.registerRoot({ projectId, projectRoot, confirmation: "REGISTER_PROJECT_ROOT" });
    const secrets = new MemorySecretProvider();
    const lifecycle = createLocalGraphLifecycle({
      stateRoot,
      projectRouter,
      secretProvider: secrets,
      secretGenerator: () => secret,
      graphProbe: new Neo4jHttpProbe({ attempts: 90, delayMs: 500 }),
      pluginRoot,
    });
    let instance;
    try {
      const initialized = await lifecycle.init({ projectId, projectRoot });
      assert.equal(initialized.status, "VERIFIED", JSON.stringify(initialized));
      instance = initialized.instance;
      assert.equal((await lifecycle.start({ projectId, projectRoot })).code, "SCHEMA_MISSING");
      let gatewaySchemaReady = false;
      const resolveGatewayProject = async () => ({
        projectId,
        projectRoot,
        endpoint: instance.endpoint.httpUrl,
        database: "neo4j",
        username: "neo4j",
        secretReference: instance.secretReference,
        auditPath: path.join(stateRoot, "wave5-gateway-audit.jsonl"),
        lifecycleStatus: gatewaySchemaReady ? "VERIFIED" : "BLOCKED",
        lifecycleCode: gatewaySchemaReady ? "HEALTHY" : "SCHEMA_MISSING",
        capabilities: ["read", "write", "schema-admin"],
        async recordSchema() {
          gatewaySchemaReady = true;
        },
      });
      const transport = new Neo4jHttpTransport(
        { endpoint: instance.endpoint.httpUrl },
        secret,
        { timeoutMs: 120_000 },
      );
      const execute = (statement, parameters = {}) => transport.execute([{ statement, parameters }]);
      const runOnce = async (toolName, input, nowMs, trustedPrincipalId = input.principal_id) => {
        const definition = GRAPH_TOOL_BY_NAME.get(toolName);
        validateToolArguments(definition, input);
        return runConcurrencyOperation(definition, input, {
          transport,
          clock: () => nowMs,
          resolvePrincipal: async () => ({
            principal_id: trustedPrincipalId,
            assurance: "trusted-test-harness",
          }),
        });
      };
      const run = async (toolName, input, nowMs, trustedPrincipalId = input.principal_id) => {
        let lastError;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            return await runOnce(toolName, input, nowMs, trustedPrincipalId);
          } catch (error) {
            lastError = error;
            if (!["GRAPH_BACKPRESSURE", "GRAPH_UNAVAILABLE", "GRAPH_TIMEOUT"].includes(error?.code)) throw error;
            await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
          }
        }
        throw lastError;
      };
      const common = { project_id: projectId, project_root: projectRoot };
      const callGateway = async (toolName, input, nowMs) => {
        let lastResult;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const gateway = createGraphGateway({
            resolveProject: resolveGatewayProject,
            resolveSecret: (reference) => secrets.get(reference),
            createTransport: () => transport,
            clock: () => nowMs,
            resolvePrincipal: async () => ({
              principal_id: input.principal_id,
              assurance: "trusted-test-harness",
            }),
          });
          lastResult = await gateway.callTool(toolName, input);
          if (!["GRAPH_BACKPRESSURE", "GRAPH_UNAVAILABLE", "GRAPH_TIMEOUT"].includes(lastResult.code)) {
            return lastResult;
          }
          await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        }
        return lastResult;
      };

      const bootstrapInputs = Array.from({ length: 10 }, (_, index) => ({
        ...common,
        ...identity("principal-admin", `session-bootstrap-${index}`, `bootstrap-${index}`),
        idempotency_key: `bootstrap-admin-${index}`,
        confirmation: "CONFIRM_INITIAL_PROJECT_ADMIN",
      }));
      const bootstrapResults = await Promise.all(
        bootstrapInputs.map((input) => callGateway("nacl_graph_bootstrap_admin", input, 5_000)),
      );
      assert.equal(bootstrapResults.filter((result) => result.status === "VERIFIED").length, 1, JSON.stringify(bootstrapResults));
      assert.equal(
        bootstrapResults.filter((result) => result.status === "BLOCKED" && result.code === "BOOTSTRAP_DISABLED").length,
        9,
        JSON.stringify(bootstrapResults),
      );
      const bootstrapWinner = bootstrapResults.findIndex((result) => result.status === "VERIFIED");
      assert.deepEqual(bootstrapResults[bootstrapWinner].schema.applied, [1, 2, 3]);
      const bootstrapReplay = await callGateway(
        "nacl_graph_bootstrap_admin",
        bootstrapInputs[bootstrapWinner],
        5_001,
      );
      assert.equal(bootstrapReplay.status, "VERIFIED", JSON.stringify(bootstrapReplay));
      assert.equal(bootstrapReplay.replay, true);
      assert.equal(bootstrapReplay.revision, 1);
      const lateBootstrap = await callGateway("nacl_graph_bootstrap_admin", {
        ...common,
        ...identity("principal-admin", "session-bootstrap-late", "bootstrap-late"),
        idempotency_key: "bootstrap-admin-late",
        confirmation: "CONFIRM_INITIAL_PROJECT_ADMIN",
      }, 5_002);
      assert.equal(lateBootstrap.status, "BLOCKED");
      assert.equal(lateBootstrap.code, "BOOTSTRAP_DISABLED");
      const [[bootstrapReadback]] = await execute(
        "MATCH (guard:ProjectAuthorization {project_id: $project_id}) OPTIONAL MATCH (membership:ProjectMembership {project_id: $project_id}) RETURN guard.state AS state, count(membership) AS memberships, collect(membership.role) AS roles, collect(membership.principal_id) AS principals",
        { project_id: projectId },
      );
      assert.deepEqual(bootstrapReadback, {
        state: "BOOTSTRAPPED",
        memberships: 1,
        roles: ["project_admin"],
        principals: ["principal-admin"],
      });
      let spoofGraphCalls = 0;
      const spoofTransport = {
        async execute() {
          spoofGraphCalls += 1;
          return [[]];
        },
      };
      await assert.rejects(
        runConcurrencyOperation(
          GRAPH_TOOL_BY_NAME.get("nacl_graph_bootstrap_admin"),
          {
            ...common,
            ...identity("principal-admin", "session-spoof", "spoof"),
            idempotency_key: "bootstrap-spoof-admin",
            confirmation: "CONFIRM_INITIAL_PROJECT_ADMIN",
          },
          {
            transport: spoofTransport,
            resolvePrincipal: async () => ({
              principal_id: "developer-0",
              assurance: "trusted-test-harness",
            }),
          },
        ),
        (error) => error.code === "PRINCIPAL_MISMATCH",
      );
      assert.equal(spoofGraphCalls, 0);

      const principals = Array.from({ length: 10 }, (_, index) => `developer-${index}`);
      const memberships = [
        ...principals.map((principal_id) => ({ principal_id, role: "developer" })),
        { principal_id: "principal-analyst", role: "analyst" },
        { principal_id: "principal-architect", role: "architect" },
        { principal_id: "principal-release", role: "release_manager" },
        { principal_id: "principal-viewer", role: "viewer" },
        { principal_id: "principal-race", role: "developer" },
      ];
      const admin = identity("principal-admin", "session-admin", "admin");
      for (const [index, membership] of memberships.entries()) {
        const granted = await run("nacl_graph_set_membership", {
          ...common,
          ...admin,
          target_principal_id: membership.principal_id,
          target_role: membership.role,
          target_active: true,
          expected_revision: 0,
          idempotency_key: `initial-membership-${index}`,
          approval: "CONFIRM_MEMBERSHIP_ADMIN",
        }, 6_000 + index);
        assert.equal(granted.revision, 1);
      }
      const schemaLease = await run("nacl_graph_claim_resource", {
        ...common,
        ...admin,
        resource_type: "SchemaMigration",
        resource_id: "MIG-GATEWAY",
        ttl_seconds: 600,
        idempotency_key: "schema-gateway-admin-lease",
        approval: approval("SchemaMigration"),
      }, 7_000);
      assert.equal(schemaLease.fencingToken, 1);

      const legacyRoleActors = [
        ["viewer", identity("principal-viewer", "session-role-viewer", "role-viewer")],
        ["analyst", identity("principal-analyst", "session-role-analyst", "role-analyst")],
        ["architect", identity("principal-architect", "session-role-architect", "role-architect")],
        ["developer", identity("developer-0", "session-role-developer", "role-developer")],
        ["release_manager", identity("principal-release", "session-role-release", "role-release")],
        ["project_admin", admin],
      ];
      for (const [role, actor] of legacyRoleActors) {
        for (const [toolName, extra] of [
          ["nacl_graph_health", {}],
          ["nacl_graph_schema_status", {}],
          ["nacl_graph_read", { query: "summary" }],
        ]) {
          const result = await callGateway(toolName, { ...common, ...actor, ...extra }, 8_000);
          assert.equal(result.status, "VERIFIED", `${role}/${toolName}: ${JSON.stringify(result)}`);
        }
        const canary = await callGateway("nacl_graph_write_canary", {
          ...common,
          ...actor,
          idempotency_key: `role-canary-${role}`,
          approval: "APPROVE_PROJECT_WRITE",
          confirmation: "WRITE_CANARY",
        }, 8_001);
        assert.equal(canary.status === "VERIFIED", role !== "viewer", `${role}/canary: ${JSON.stringify(canary)}`);
        if (role === "viewer") assert.equal(canary.code, "ACCESS_OR_RESOURCE_NOT_FOUND");

        const migration = await callGateway("nacl_graph_apply_migrations", {
          ...common,
          ...actor,
          fencing_token: schemaLease.fencingToken,
          idempotency_key: `role-migration-${role}`,
          approval: "CONFIRM_SCHEMA_ADMIN",
          confirmation: "APPLY_MIGRATIONS",
        }, 8_002);
        assert.equal(migration.status === "VERIFIED", role === "project_admin", `${role}/migration: ${JSON.stringify(migration)}`);
        if (role === "project_admin") assert.deepEqual(migration.schema.alreadyApplied, [1, 2, 3]);
        else assert.equal(migration.code, "ACCESS_OR_RESOURCE_NOT_FOUND");
      }

      const resources = [
        ["Task", "TASK-CLAIM"],
        ["Task", "TASK-EXPIRY"],
        ["Task", "TASK-RACE"],
        ["Task", "TASK-IDEMP-ACQUIRE"],
        ["Task", "TASK-IDEMP-HEARTBEAT"],
        ["Task", "TASK-IDEMP-RELEASE"],
        ["Task", "TASK-IDEMP-HANDOFF"],
        ["Task", "TASK-IDEMP-AMBIGUITY"],
        ["Task", "TASK-IDEMP-PENDING"],
        ["Task", "TASK-IDEMP-ROLLBACK"],
        ["Task", "TASK-NO-TEST"],
        ["UseCase", "UC-PROTECTED"],
        ["Module", "MOD-PROTECTED"],
        ["FeatureRequest", "FR-PROTECTED"],
        ["Board", "BOARD-PROTECTED"],
        ["SchemaMigration", "MIG-PROTECTED"],
        ["ReleaseEnvironment", "RELENV-PROTECTED"],
      ];
      await execute(
        resources.map(([label, id]) => `CREATE (:${label} {id: '${id}', project_id: $project_id, revision: 0, status: 'new'})`).join("\n"),
        { project_id: projectId },
      );

      const contenders = principals.map((principal, index) => {
        const actor = identity(principal, `session-contender-${index}`, `contender-${index}`);
        return run("nacl_graph_claim_resource", {
          ...common,
          ...actor,
          resource_type: "Task",
          resource_id: "TASK-CLAIM",
          ttl_seconds: 300,
          idempotency_key: `claim-contender-${index}`,
          approval: approval("Task"),
        }, 10_000);
      });
      const claimResults = await Promise.allSettled(contenders);
      const acceptedClaims = claimResults.filter((result) => result.status === "fulfilled");
      assert.equal(acceptedClaims.length, 1, JSON.stringify(claimResults));
      assert.equal(claimResults.filter((result) => result.status === "rejected" && result.reason.code === "LEASE_HELD").length, 9);

      const samePrincipalA = identity("developer-0", "session-same-a", "same-a");
      const samePrincipalB = identity("developer-0", "session-same-b", "same-b");
      assert.notEqual(samePrincipalA.worker_id, samePrincipalB.worker_id);
      const firstLease = await run("nacl_graph_claim_resource", {
        ...common,
        ...samePrincipalA,
        resource_type: "Task",
        resource_id: "TASK-EXPIRY",
        ttl_seconds: 30,
        idempotency_key: "expiry-first-claim",
        approval: approval("Task"),
      }, 20_000);
      assert.equal(firstLease.fencingToken, 1);
      const takeover = await run("nacl_graph_claim_resource", {
        ...common,
        ...samePrincipalB,
        resource_type: "Task",
        resource_id: "TASK-EXPIRY",
        ttl_seconds: 30,
        idempotency_key: "expiry-takeover-claim",
        approval: approval("Task"),
      }, 50_000);
      assert.equal(takeover.fencingToken, 2, "expires_at == now must permit takeover and increment fence");

      const invalidTerminalEvidence = [
        { evidence: `test-GREEN:${path.join(os.tmpdir(), "absolute.test.mjs")}`, code: "TERMINAL_TASK_EVIDENCE_INVALID" },
        { evidence: "test-GREEN:tests/../escape.test.mjs", code: "TERMINAL_TASK_EVIDENCE_INVALID" },
        { evidence: "qa-stage:component:PASS test-GREEN:tests/task.test.mjs", code: "TERMINAL_TASK_EVIDENCE_INVALID" },
        { evidence: "test-GREEN:tests/task.test.mjs test-GREEN:tests/task.test.mjs", code: "TERMINAL_TASK_EVIDENCE_INVALID" },
        { evidence: "no-test", code: "NO_TEST_EVIDENCE_CONFIRMATION_REQUIRED" },
      ];
      for (const [index, probe] of invalidTerminalEvidence.entries()) {
        await assert.rejects(
          run("nacl_graph_mutate_resource", {
            ...common,
            ...samePrincipalB,
            resource_type: "Task",
            resource_id: "TASK-EXPIRY",
            fencing_token: takeover.fencingToken,
            expected_revision: 0,
            idempotency_key: `invalid-terminal-evidence-${index}`,
            approval: approval("Task"),
            changes: { status: "done", verification_evidence: probe.evidence },
          }, 50_001),
          (error) => error.code === probe.code,
        );
      }
      const [[preMutationReadback]] = await execute(
        "MATCH (task:Task {id: 'TASK-EXPIRY'}) RETURN task.status AS status, task.verification_evidence AS verificationEvidence, task.revision AS revision",
      );
      assert.deepEqual(preMutationReadback, { status: "new", verificationEvidence: null, revision: 0 });

      for (const [tool, extra, key] of [
        ["nacl_graph_heartbeat_resource", { ttl_seconds: 30 }, "stale-heartbeat"],
        ["nacl_graph_release_resource", {}, "stale-release"],
        ["nacl_graph_mutate_resource", { expected_revision: 0, changes: { status: "stale" } }, "stale-mutate"],
      ]) {
        await assert.rejects(
          run(tool, {
            ...common,
            ...samePrincipalA,
            resource_type: "Task",
            resource_id: "TASK-EXPIRY",
            fencing_token: firstLease.fencingToken,
            idempotency_key: key,
            approval: approval("Task"),
            ...extra,
          }, 50_001),
          (error) => error.code === "STALE_FENCING_TOKEN",
        );
      }

      const mutationArgs = {
        ...common,
        ...samePrincipalB,
        resource_type: "Task",
        resource_id: "TASK-EXPIRY",
        fencing_token: takeover.fencingToken,
        expected_revision: 0,
        idempotency_key: "accepted-mutation-key",
        approval: approval("Task"),
        changes: {
          status: "done",
          verification_evidence: "test-GREEN:tests/codex-plugin/scripts/nacl-concurrency-docker-e2e.test.mjs",
        },
      };
      const mutation = await run("nacl_graph_mutate_resource", mutationArgs, 50_002);
      assert.equal(mutation.revision, 1);
      const replay = await run("nacl_graph_mutate_resource", mutationArgs, 50_003);
      assert.equal(replay.replay, true);
      assert.equal(replay.revision, 1);
      await assert.rejects(
        run("nacl_graph_mutate_resource", {
          ...mutationArgs,
          expected_revision: 1,
          changes: { status: "different" },
        }, 50_004),
        (error) => error.code === "IDEMPOTENCY_CONFLICT",
      );
      await assert.rejects(
        run("nacl_graph_mutate_resource", {
          ...mutationArgs,
          idempotency_key: "stale-cas-key",
          expected_revision: 0,
          changes: { status: "partial-write-must-not-happen" },
        }, 50_004),
        (error) => error.code === "CONFLICT" && error.details.currentRevision === 1,
      );
      const [[taskReadback]] = await execute(
        "MATCH (task:Task {id: 'TASK-EXPIRY'}) RETURN task.status AS status, task.verification_evidence AS verificationEvidence, task.revision AS revision, task.updated_by_principal AS principalId, task.updated_by_worker AS workerId",
      );
      assert.deepEqual(taskReadback, {
        status: "done",
        verificationEvidence: "test-GREEN:tests/codex-plugin/scripts/nacl-concurrency-docker-e2e.test.mjs",
        revision: 1,
        principalId: samePrincipalB.principal_id,
        workerId: samePrincipalB.worker_id,
      });

      const noTestLease = await run("nacl_graph_claim_resource", {
        ...common,
        ...samePrincipalB,
        resource_type: "Task",
        resource_id: "TASK-NO-TEST",
        ttl_seconds: 30,
        idempotency_key: "no-test-claim",
        approval: approval("Task"),
      }, 50_010);
      const noTestMutation = await run("nacl_graph_mutate_resource", {
        ...common,
        ...samePrincipalB,
        resource_type: "Task",
        resource_id: "TASK-NO-TEST",
        fencing_token: noTestLease.fencingToken,
        expected_revision: 0,
        idempotency_key: "no-test-mutation",
        approval: approval("Task"),
        evidence_confirmation: "CONFIRM_NO_TEST_EVIDENCE",
        changes: { status: "done", verification_evidence: "no-test" },
      }, 50_011);
      assert.equal(noTestMutation.revision, 1);
      const [[noTestReadback]] = await execute(
        "MATCH (task:Task {id: 'TASK-NO-TEST'}) RETURN task.status AS status, task.verification_evidence AS verificationEvidence, task.revision AS revision",
      );
      assert.deepEqual(noTestReadback, { status: "done", verificationEvidence: "no-test", revision: 1 });

      const idempotencyA = identity("developer-5", "session-idempotency-a", "idempotency-a");
      const idempotencyB = identity("developer-6", "session-idempotency-b", "idempotency-b");
      const idempotencyC = identity("developer-7", "session-idempotency-c", "idempotency-c");
      const idempotencyHash = (value) => createHash("sha256").update(value).digest("hex");
      const snapshot = async (resourceId, key) => {
        const [[row]] = await execute(
          "MATCH (membership:ProjectMembership {project_id: $project_id, principal_id: $principal_id}) " +
            "MATCH (resource:Task {project_id: $project_id, id: $resource_id}) " +
            "OPTIONAL MATCH (lease:ResourceLease {project_id: $project_id, resource_type: 'Task', resource_id: $resource_id}) " +
            "OPTIONAL MATCH (request:IdempotencyRecord {project_id: $project_id, key_hash: $key_hash}) " +
            "RETURN properties(membership) AS membership, properties(resource) AS resource, properties(lease) AS lease, properties(request) AS request",
          {
            project_id: projectId,
            principal_id: idempotencyA.principal_id,
            resource_id: resourceId,
            key_hash: idempotencyHash(key),
          },
        );
        return row;
      };
      const assertConflictWithoutMutation = async (toolName, original, changed, nowMs) => {
        const before = await snapshot(original.resource_id, original.idempotency_key);
        await assert.rejects(
          run(toolName, { ...original, ...changed }, nowMs),
          (error) => error.code === "IDEMPOTENCY_CONFLICT",
        );
        assert.deepEqual(
          await snapshot(original.resource_id, original.idempotency_key),
          before,
          `${toolName} same-key/different-payload changed persisted state`,
        );
      };

      const acquireArgs = {
        ...common,
        ...idempotencyA,
        resource_type: "Task",
        resource_id: "TASK-IDEMP-ACQUIRE",
        ttl_seconds: 300,
        idempotency_key: "idempotency-acquire-terminal",
        approval: approval("Task"),
      };
      const originalAcquire = await run("nacl_graph_claim_resource", acquireArgs, 100_000);
      await run("nacl_graph_release_resource", {
        ...common,
        ...idempotencyA,
        resource_type: "Task",
        resource_id: acquireArgs.resource_id,
        fencing_token: originalAcquire.fencingToken,
        idempotency_key: "idempotency-acquire-release",
        approval: approval("Task"),
      }, 100_001);
      await run("nacl_graph_claim_resource", {
        ...acquireArgs,
        ...idempotencyB,
        idempotency_key: "idempotency-acquire-takeover",
      }, 100_002);
      const acquireReplay = await run("nacl_graph_claim_resource", acquireArgs, 100_003);
      assert.equal(acquireReplay.replay, true);
      assert.equal(acquireReplay.fencingToken, originalAcquire.fencingToken);
      assert.equal(acquireReplay.workerId, originalAcquire.workerId);
      assert.equal(acquireReplay.expiresAt, originalAcquire.expiresAt);
      await assertConflictWithoutMutation(
        "nacl_graph_claim_resource",
        acquireArgs,
        { ttl_seconds: 301 },
        100_004,
      );

      const heldArgs = {
        ...acquireArgs,
        ...idempotencyC,
        idempotency_key: "idempotency-rejected-held",
      };
      let firstHeld;
      await assert.rejects(run("nacl_graph_claim_resource", heldArgs, 100_005), (error) => {
        firstHeld = error.details;
        return error.code === "LEASE_HELD";
      });
      const currentAcquireLease = await run("nacl_graph_claim_resource", {
        ...acquireArgs,
        ...idempotencyB,
        idempotency_key: "idempotency-acquire-takeover",
      }, 100_006);
      await run("nacl_graph_release_resource", {
        ...common,
        ...idempotencyB,
        resource_type: "Task",
        resource_id: acquireArgs.resource_id,
        fencing_token: currentAcquireLease.fencingToken,
        idempotency_key: "idempotency-held-owner-release",
        approval: approval("Task"),
      }, 100_007);
      await assert.rejects(run("nacl_graph_claim_resource", heldArgs, 100_008), (error) => {
        for (const field of ["code", "principalId", "workerId", "fencingToken", "expiresAt"]) {
          assert.equal(error.details[field], firstHeld[field], field);
        }
        return error.code === "LEASE_HELD";
      });

      const heartbeatClaim = await run("nacl_graph_claim_resource", {
        ...acquireArgs,
        resource_id: "TASK-IDEMP-HEARTBEAT",
        idempotency_key: "idempotency-heartbeat-claim",
      }, 110_000);
      const heartbeatArgs = {
        ...common,
        ...idempotencyA,
        resource_type: "Task",
        resource_id: "TASK-IDEMP-HEARTBEAT",
        fencing_token: heartbeatClaim.fencingToken,
        ttl_seconds: 300,
        idempotency_key: "idempotency-heartbeat-terminal",
        approval: approval("Task"),
      };
      const originalHeartbeat = await run("nacl_graph_heartbeat_resource", heartbeatArgs, 110_001);
      await run("nacl_graph_handoff_resource", {
        ...common,
        ...idempotencyA,
        ...Object.fromEntries(Object.entries(idempotencyB).map(([key, value]) => [`target_${key}`, value])),
        resource_type: "Task",
        resource_id: heartbeatArgs.resource_id,
        fencing_token: heartbeatClaim.fencingToken,
        ttl_seconds: 300,
        idempotency_key: "idempotency-heartbeat-handoff",
        approval: approval("Task"),
        confirmation: `HANDOFF_RESOURCE:Task:${heartbeatArgs.resource_id}:${idempotencyB.worker_id}`,
      }, 110_002);
      const heartbeatReplay = await run("nacl_graph_heartbeat_resource", heartbeatArgs, 110_003);
      assert.equal(heartbeatReplay.replay, true);
      assert.equal(heartbeatReplay.workerId, originalHeartbeat.workerId);
      assert.equal(heartbeatReplay.expiresAt, originalHeartbeat.expiresAt);
      await assertConflictWithoutMutation(
        "nacl_graph_heartbeat_resource",
        heartbeatArgs,
        { ttl_seconds: 301 },
        110_004,
      );

      const releaseClaim = await run("nacl_graph_claim_resource", {
        ...acquireArgs,
        resource_id: "TASK-IDEMP-RELEASE",
        idempotency_key: "idempotency-release-claim",
      }, 120_000);
      const releaseArgs = {
        ...common,
        ...idempotencyA,
        resource_type: "Task",
        resource_id: "TASK-IDEMP-RELEASE",
        fencing_token: releaseClaim.fencingToken,
        idempotency_key: "idempotency-release-terminal",
        approval: approval("Task"),
      };
      const originalRelease = await run("nacl_graph_release_resource", releaseArgs, 120_001);
      await run("nacl_graph_claim_resource", {
        ...acquireArgs,
        ...idempotencyB,
        resource_id: releaseArgs.resource_id,
        idempotency_key: "idempotency-release-takeover",
      }, 120_002);
      const releaseReplay = await run("nacl_graph_release_resource", releaseArgs, 120_003);
      assert.equal(releaseReplay.replay, true);
      assert.equal(releaseReplay.fencingToken, originalRelease.fencingToken);
      assert.equal(releaseReplay.workerId, originalRelease.workerId);
      await assertConflictWithoutMutation(
        "nacl_graph_release_resource",
        releaseArgs,
        { fencing_token: releaseArgs.fencing_token + 1 },
        120_004,
      );

      const handoffClaim = await run("nacl_graph_claim_resource", {
        ...acquireArgs,
        resource_id: "TASK-IDEMP-HANDOFF",
        idempotency_key: "idempotency-handoff-claim",
      }, 130_000);
      const handoffArgs = {
        ...common,
        ...idempotencyA,
        ...Object.fromEntries(Object.entries(idempotencyB).map(([key, value]) => [`target_${key}`, value])),
        resource_type: "Task",
        resource_id: "TASK-IDEMP-HANDOFF",
        fencing_token: handoffClaim.fencingToken,
        ttl_seconds: 300,
        idempotency_key: "idempotency-handoff-terminal",
        approval: approval("Task"),
        confirmation: `HANDOFF_RESOURCE:Task:TASK-IDEMP-HANDOFF:${idempotencyB.worker_id}`,
      };
      const originalHandoff = await run("nacl_graph_handoff_resource", handoffArgs, 130_001);
      await run("nacl_graph_heartbeat_resource", {
        ...common,
        ...idempotencyB,
        resource_type: "Task",
        resource_id: handoffArgs.resource_id,
        fencing_token: originalHandoff.fencingToken,
        ttl_seconds: 301,
        idempotency_key: "idempotency-handoff-target-heartbeat",
        approval: approval("Task"),
      }, 130_002);
      const handoffReplay = await run("nacl_graph_handoff_resource", handoffArgs, 130_003);
      assert.equal(handoffReplay.replay, true);
      assert.equal(handoffReplay.fencingToken, originalHandoff.fencingToken);
      assert.equal(handoffReplay.workerId, originalHandoff.workerId);
      assert.equal(handoffReplay.expiresAt, originalHandoff.expiresAt);
      await assertConflictWithoutMutation(
        "nacl_graph_handoff_resource",
        handoffArgs,
        { ttl_seconds: 301 },
        130_004,
      );

      const ambiguityClaim = await run("nacl_graph_claim_resource", {
        ...acquireArgs,
        resource_id: "TASK-IDEMP-AMBIGUITY",
        idempotency_key: "idempotency-ambiguity-claim",
      }, 140_000);
      const ambiguityArgs = {
        ...common,
        ...idempotencyA,
        resource_type: "Task",
        resource_id: "TASK-IDEMP-AMBIGUITY",
        fencing_token: ambiguityClaim.fencingToken,
        ttl_seconds: 300,
        idempotency_key: "idempotency-ambiguity-heartbeat",
        approval: approval("Task"),
      };
      let injectAmbiguity = true;
      const ambiguityTransport = {
        async execute(statements) {
          const result = await transport.execute(statements);
          if (injectAmbiguity) {
            injectAmbiguity = false;
            const error = new Error("Injected response loss after commit.");
            error.code = "GRAPH_TIMEOUT";
            throw error;
          }
          return result;
        },
      };
      await assert.rejects(
        runConcurrencyOperation(
          GRAPH_TOOL_BY_NAME.get("nacl_graph_heartbeat_resource"),
          ambiguityArgs,
          {
            transport: ambiguityTransport,
            clock: () => 140_001,
            resolvePrincipal: async () => ({
              principal_id: idempotencyA.principal_id,
              assurance: "trusted-test-harness",
            }),
          },
        ),
        (error) => error.code === "GRAPH_TIMEOUT",
      );
      const ambiguityReplay = await run("nacl_graph_heartbeat_resource", ambiguityArgs, 140_002);
      assert.equal(ambiguityReplay.replay, true);
      assert.equal(ambiguityReplay.fencingToken, ambiguityClaim.fencingToken);

      const pendingClaim = await run("nacl_graph_claim_resource", {
        ...acquireArgs,
        resource_id: "TASK-IDEMP-PENDING",
        idempotency_key: "idempotency-pending-claim",
      }, 150_000);
      const pendingArgs = {
        ...common,
        ...idempotencyA,
        resource_type: "Task",
        resource_id: "TASK-IDEMP-PENDING",
        fencing_token: pendingClaim.fencingToken,
        ttl_seconds: 300,
        idempotency_key: "idempotency-existing-pending",
        approval: approval("Task"),
      };
      const pendingContext = concurrencyRequestContext(
        GRAPH_TOOL_BY_NAME.get("nacl_graph_heartbeat_resource"),
        pendingArgs,
        { nowMs: 150_001 },
      );
      await execute(
        "CREATE (:IdempotencyRecord {project_id: $project_id, key_hash: $key_hash, payload_hash: $payload_hash, request_nonce: 'orphaned-request', state: 'PENDING', lock_version: 0})",
        {
          project_id: projectId,
          key_hash: idempotencyHash(pendingArgs.idempotency_key),
          payload_hash: pendingContext.payloadHash,
        },
      );
      const beforePending = await snapshot(pendingArgs.resource_id, pendingArgs.idempotency_key);
      await assert.rejects(
        run("nacl_graph_heartbeat_resource", pendingArgs, 150_002),
        (error) => error.code === "IDEMPOTENCY_INCOMPLETE" && error.status === "BLOCKED",
      );
      assert.deepEqual(await snapshot(pendingArgs.resource_id, pendingArgs.idempotency_key), beforePending);
      await execute(
        "MATCH (request:IdempotencyRecord {project_id: $project_id, key_hash: $key_hash}) DELETE request",
        { project_id: projectId, key_hash: idempotencyHash(pendingArgs.idempotency_key) },
      );

      const unauthorizedKey = "idempotency-viewer-denied";
      await assert.rejects(
        run("nacl_graph_claim_resource", {
          ...common,
          ...identity("principal-viewer", "session-viewer-denied", "viewer-denied"),
          resource_type: "Task",
          resource_id: "TASK-IDEMP-ROLLBACK",
          ttl_seconds: 300,
          idempotency_key: unauthorizedKey,
          approval: approval("Task"),
        }, 160_000),
        (error) => error.code === "ACCESS_OR_RESOURCE_NOT_FOUND",
      );
      const [[unauthorizedRecord]] = await execute(
        "MATCH (request:IdempotencyRecord {project_id: $project_id, key_hash: $key_hash}) RETURN count(request) AS count",
        { project_id: projectId, key_hash: idempotencyHash(unauthorizedKey) },
      );
      assert.equal(unauthorizedRecord.count, 0, "membership authorization must precede record creation");

      const rollbackArgs = {
        ...acquireArgs,
        resource_id: "TASK-IDEMP-ROLLBACK",
        idempotency_key: "idempotency-transaction-rollback",
      };
      const invalidParameterTransport = {
        execute(statements) {
          return transport.execute(statements.map((entry) => ({
            ...entry,
            parameters: { ...entry.parameters, expires_at_ms: { invalid: true } },
          })));
        },
      };
      await assert.rejects(
        runConcurrencyOperation(
          GRAPH_TOOL_BY_NAME.get("nacl_graph_claim_resource"),
          rollbackArgs,
          {
            transport: invalidParameterTransport,
            clock: () => 160_001,
            resolvePrincipal: async () => ({
              principal_id: idempotencyA.principal_id,
              assurance: "trusted-test-harness",
            }),
          },
        ),
        (error) => error.code === "QUERY_FAILED",
      );
      const [[rollbackRecord]] = await execute(
        "MATCH (request:IdempotencyRecord {project_id: $project_id, key_hash: $key_hash}) RETURN count(request) AS count",
        { project_id: projectId, key_hash: idempotencyHash(rollbackArgs.idempotency_key) },
      );
      assert.equal(rollbackRecord.count, 0, "a rolled-back transaction must not retain PENDING");
      const [[pendingCount]] = await execute(
        "MATCH (request:IdempotencyRecord {project_id: $project_id, state: 'PENDING'}) RETURN count(request) AS count",
        { project_id: projectId },
      );
      assert.equal(pendingCount.count, 0, "normal terminal returns must leave no PENDING records");

      const kindActors = {
        Task: identity("developer-1", "session-task", "kind-task"),
        UseCase: identity("principal-architect", "session-uc", "kind-uc"),
        Module: identity("principal-architect", "session-module", "kind-module"),
        FeatureRequest: identity("principal-architect", "session-fr", "kind-fr"),
        Board: identity("principal-analyst", "session-board", "kind-board"),
        SchemaMigration: identity("principal-admin", "session-schema", "kind-schema"),
        ReleaseEnvironment: identity("principal-release", "session-release", "kind-release"),
      };
      const protectedIds = {
        Task: "TASK-RACE",
        UseCase: "UC-PROTECTED",
        Module: "MOD-PROTECTED",
        FeatureRequest: "FR-PROTECTED",
        Board: "BOARD-PROTECTED",
        SchemaMigration: "MIG-PROTECTED",
        ReleaseEnvironment: "RELENV-PROTECTED",
      };
      for (const [kind, actor] of Object.entries(kindActors)) {
        const claimed = await run("nacl_graph_claim_resource", {
          ...common,
          ...actor,
          resource_type: kind,
          resource_id: protectedIds[kind],
          ttl_seconds: 300,
          idempotency_key: `all-kinds-${kind}`,
          approval: approval(kind),
        }, 60_000);
        assert.equal(claimed.fencingToken, 1, kind);
      }

      const raceActor = identity("principal-race", "session-race", "race");
      const raceLease = await run("nacl_graph_claim_resource", {
        ...common,
        ...raceActor,
        resource_type: "Task",
        resource_id: "TASK-RACE",
        ttl_seconds: 300,
        idempotency_key: "race-claim-key",
        approval: approval("Task"),
      }, 70_000).catch((error) => {
        if (error.code !== "LEASE_HELD") throw error;
        return null;
      });
      assert.equal(raceLease, null, "the all-kinds developer must own TASK-RACE before explicit handoff");
      const currentRaceOwner = kindActors.Task;
      const handoff = await run("nacl_graph_handoff_resource", {
        ...common,
        ...currentRaceOwner,
        ...Object.fromEntries(Object.entries(raceActor).map(([key, value]) => [`target_${key}`, value])),
        resource_type: "Task",
        resource_id: "TASK-RACE",
        fencing_token: 1,
        ttl_seconds: 300,
        idempotency_key: "race-handoff-key",
        approval: approval("Task"),
        confirmation: `HANDOFF_RESOURCE:Task:TASK-RACE:${raceActor.worker_id}`,
      }, 70_001);
      assert.equal(handoff.fencingToken, 2);
      assert.equal(handoff.workerId, raceActor.worker_id);

      const mutationRace = run("nacl_graph_mutate_resource", {
        ...common,
        ...raceActor,
        resource_type: "Task",
        resource_id: "TASK-RACE",
        fencing_token: 2,
        expected_revision: 0,
        idempotency_key: "revoke-race-mutation",
        approval: approval("Task"),
        changes: { status: "race-accepted-before-revoke" },
      }, 70_002);
      const revokeRace = run("nacl_graph_set_membership", {
        ...common,
        ...admin,
        target_principal_id: raceActor.principal_id,
        target_role: "developer",
        target_active: false,
        expected_revision: 1,
        idempotency_key: "revoke-race-admin",
        approval: "CONFIRM_MEMBERSHIP_ADMIN",
      }, 70_002);
      const [mutationRaceResult, revokeRaceResult] = await Promise.allSettled([mutationRace, revokeRace]);
      assert.equal(revokeRaceResult.status, "fulfilled", JSON.stringify(revokeRaceResult));
      assert.equal(revokeRaceResult.value.revision, 2);
      const [[raceReadback]] = await execute(
        "MATCH (membership:ProjectMembership {project_id: $project_id, principal_id: $principal_id}) MATCH (task:Task {id: 'TASK-RACE'}) RETURN membership.active AS active, membership.revision AS membershipRevision, task.revision AS taskRevision, task.membership_revision AS writeMembershipRevision",
        { project_id: projectId, principal_id: raceActor.principal_id },
      );
      assert.equal(raceReadback.active, false);
      assert.equal(raceReadback.membershipRevision, 2);
      if (mutationRaceResult.status === "fulfilled") {
        assert.equal(raceReadback.taskRevision, 1);
        assert.equal(raceReadback.writeMembershipRevision, 1, "accepted write serialized before revoke");
      } else {
        assert.equal(mutationRaceResult.reason.code, "ACCESS_OR_RESOURCE_NOT_FOUND");
        assert.equal(raceReadback.taskRevision, 0, "revoke serialized before a blocked write");
      }
      const revokedRead = await callGateway("nacl_graph_read", {
        ...common,
        ...raceActor,
        query: "summary",
      }, 70_002);
      assert.equal(revokedRead.status, "BLOCKED");
      assert.equal(revokedRead.code, "ACCESS_OR_RESOURCE_NOT_FOUND");
      const revokedWrite = await callGateway("nacl_graph_write_canary", {
        ...common,
        ...raceActor,
        idempotency_key: "revoked-legacy-write-canary",
        approval: "APPROVE_PROJECT_WRITE",
        confirmation: "WRITE_CANARY",
      }, 70_002);
      assert.equal(revokedWrite.status, "BLOCKED");
      assert.equal(revokedWrite.code, "ACCESS_OR_RESOURCE_NOT_FOUND");
      const revokeReplay = await run("nacl_graph_set_membership", {
        ...common,
        ...admin,
        target_principal_id: raceActor.principal_id,
        target_role: "developer",
        target_active: false,
        expected_revision: 1,
        idempotency_key: "revoke-race-admin",
        approval: "CONFIRM_MEMBERSHIP_ADMIN",
      }, 70_002);
      assert.equal(revokeReplay.replay, true);
      assert.equal(revokeReplay.revision, 2);
      await assert.rejects(
        run("nacl_graph_set_membership", {
          ...common,
          ...admin,
          target_principal_id: raceActor.principal_id,
          target_role: "developer",
          target_active: true,
          expected_revision: 2,
          idempotency_key: "revoke-race-admin",
          approval: "CONFIRM_MEMBERSHIP_ADMIN",
        }, 70_003),
        (error) => error.code === "IDEMPOTENCY_CONFLICT",
      );
      await assert.rejects(
        run("nacl_graph_set_membership", {
          ...common,
          ...admin,
          target_principal_id: raceActor.principal_id,
          target_role: "developer",
          target_active: true,
          expected_revision: 1,
          idempotency_key: "stale-membership-cas",
          approval: "CONFIRM_MEMBERSHIP_ADMIN",
        }, 70_003),
        (error) => error.code === "CONFLICT" && error.details.currentRevision === 2,
      );
      await assert.rejects(
        run("nacl_graph_set_membership", {
          ...common,
          ...kindActors.Task,
          target_principal_id: "developer-3",
          target_role: "project_admin",
          target_active: true,
          expected_revision: 1,
          idempotency_key: "ordinary-role-admin-spoof",
          approval: "CONFIRM_MEMBERSHIP_ADMIN",
        }, 70_003),
        (error) => error.code === "ACCESS_OR_RESOURCE_NOT_FOUND",
      );
      await assert.rejects(
        run("nacl_graph_set_membership", {
          ...common,
          ...admin,
          target_principal_id: admin.principal_id,
          target_role: "project_admin",
          target_active: false,
          expected_revision: 1,
          idempotency_key: "last-admin-revoke-denied",
          approval: "CONFIRM_MEMBERSHIP_ADMIN",
        }, 70_003),
        (error) => error.code === "LAST_ADMIN_REQUIRED",
      );

      const allocator = identity("developer-2", "session-allocator", "allocator");
      const allocationInputs = Array.from({ length: 1_000 }, (_, index) => ({
          ...common,
          ...allocator,
          entity_kind: "Task",
          ttl_seconds: 300,
          idempotency_key: `allocation-${String(index).padStart(4, "0")}`,
          approval: approval("Task"),
          changes: { status: "allocated" },
      }));
      const allocations = new Array(1_000);
      let pending = allocationInputs.map((_, index) => index);
      let initialTransientCount = 0;
      let retryAttempts = 0;
      let roundsUsed = 0;
      for (let attempt = 0; attempt < 5 && pending.length > 0; attempt += 1) {
        roundsUsed = attempt + 1;
        const indices = pending;
        if (attempt > 0) retryAttempts += indices.length;
        const settled = await Promise.allSettled(indices.map((index) => runOnce(
          "nacl_graph_allocate_id",
          allocationInputs[index],
          80_000,
        )));
        pending = [];
        for (const [position, result] of settled.entries()) {
          const index = indices[position];
          if (result.status === "fulfilled") {
            allocations[index] = result.value;
          } else if (["GRAPH_BACKPRESSURE", "GRAPH_UNAVAILABLE", "GRAPH_TIMEOUT"].includes(result.reason?.code)) {
            pending.push(index);
          } else {
            throw result.reason;
          }
        }
        if (attempt === 0) initialTransientCount = pending.length;
        if (pending.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      assert.deepEqual(pending, [], "all 1,000 concurrent allocation requests must complete or replay safely");
      process.stdout.write(
        `wave5-allocation-burst initial=1000 initialTransient=${initialTransientCount} retryAttempts=${retryAttempts} rounds=${roundsUsed}\n`,
      );
      const allocatedIds = allocations.map((entry) => entry.resourceId);
      assert.equal(new Set(allocatedIds).size, 1_000);
      assert.deepEqual(
        allocatedIds.map((id) => Number(id.slice("TASK-".length))).sort((a, b) => a - b),
        Array.from({ length: 1_000 }, (_, index) => index + 1),
      );
      const allocationReplay = await run("nacl_graph_allocate_id", {
        ...common,
        ...allocator,
        entity_kind: "Task",
        ttl_seconds: 300,
        idempotency_key: "allocation-0000",
        approval: approval("Task"),
        changes: { status: "allocated" },
      }, 80_000);
      assert.equal(allocationReplay.replay, true);
      assert.equal(allocationReplay.resourceId, allocations[0].resourceId);

      const [[counts]] = await execute(
        "MATCH (task:Task) WHERE task.id =~ '^TASK-[0-9]{12}$' WITH count(task) AS taskCount MATCH (lease:ResourceLease {project_id: $project_id, resource_type: 'Task'}) WHERE lease.resource_id =~ '^TASK-[0-9]{12}$' WITH taskCount, count(lease) AS leaseCount, min(lease.fencing_token) AS minFence, max(lease.fencing_token) AS maxFence MATCH (request:IdempotencyRecord {project_id: $project_id, operation: 'allocate-and-create', resource_type: 'Task'}) WITH taskCount, leaseCount, minFence, maxFence, count(request) AS idempotencyCount MATCH (sequence:IdSequence {project_id: $project_id, entity_kind: 'Task'}) RETURN taskCount, leaseCount, minFence, maxFence, idempotencyCount, sequence.next_value AS sequenceNext",
        { project_id: projectId },
      );
      assert.deepEqual(counts, {
        taskCount: 1_000,
        leaseCount: 1_000,
        minFence: 1,
        maxFence: 1,
        idempotencyCount: 1_000,
        sequenceNext: 1_000,
      });

      await assert.rejects(
        run("nacl_graph_allocate_id", {
          ...common,
          ...allocator,
          project_id: "other-project",
          entity_kind: "Task",
          ttl_seconds: 300,
          idempotency_key: "cross-project-blocked",
          approval: approval("Task"),
          changes: { status: "must-not-write" },
        }, 90_000),
        (error) => error.code === "ACCESS_OR_RESOURCE_NOT_FOUND",
      );
      assert.equal((await lifecycle.stop({ projectId, projectRoot })).status, "VERIFIED");
    } finally {
      if (instance) {
        docker(["container", "rm", "--force", instance.containerName]);
        docker(["volume", "rm", instance.volumeName]);
        docker(["network", "rm", `${instance.composeProject}_default`]);
        exactResourceAbsent(instance);
      }
      await rm(root, { recursive: true, force: true });
      if (preparedImage.createdTag) docker(["image", "rm", exactImage]);
    }
  },
);

test(
  "real SCHEMA_STALE lifecycle upgrades an old v2 ledger through the public fenced v3 corridor",
  { skip: !enabled, timeout: 600_000 },
  async () => {
    assert.equal(docker(["version", "--format", "{{.Server.Version}}"]).status, 0, "Docker daemon is required");
    const preparedImage = prepareExactNeo4jImage({ docker, exactImage, sourceImage });
    const root = await mkdtemp(path.join(os.tmpdir(), "nacl-wave5-stale-upgrade-"));
    const stateRoot = path.join(root, "state");
    const projectRoot = path.join(root, "project");
    const projectId = `wave5-stale-${Date.now()}-${process.pid}`;
    const secret = `wave5-stale-${Date.now()}-${process.pid}-disposable-secret`;
    await mkdir(projectRoot);
    await writeFile(path.join(projectRoot, "config.yaml"), `project:\n  id: "${projectId}"\n`);
    git(projectRoot, ["init", "-q"]);
    git(projectRoot, ["config", "user.name", "NaCl Test"]);
    git(projectRoot, ["config", "user.email", "nacl-test@example.invalid"]);
    git(projectRoot, ["add", "config.yaml"]);
    git(projectRoot, ["commit", "-q", "-m", "wave5 stale fixture"]);

    const projectRouter = createProjectRouter({ registryRoot: path.join(stateRoot, ".project-registry") });
    await projectRouter.registerRoot({ projectId, projectRoot, confirmation: "REGISTER_PROJECT_ROOT" });
    const secrets = new MemorySecretProvider();
    const lifecycle = createLocalGraphLifecycle({
      stateRoot,
      projectRouter,
      secretProvider: secrets,
      secretGenerator: () => secret,
      graphProbe: new Neo4jHttpProbe({ attempts: 90, delayMs: 500 }),
      pluginRoot,
    });
    let instance;
    try {
      const initialized = await lifecycle.init({ projectId, projectRoot });
      assert.equal(initialized.status, "VERIFIED", JSON.stringify(initialized));
      instance = initialized.instance;
      assert.equal((await lifecycle.start({ projectId, projectRoot })).code, "SCHEMA_MISSING");

      const transport = new Neo4jHttpTransport(
        { endpoint: instance.endpoint.httpUrl },
        secret,
        { timeoutMs: 120_000 },
      );
      const execute = (statement, parameters = {}) => transport.execute([{ statement, parameters }]);
      const packagedMigrations = await loadMigrationCatalog();
      assert.deepEqual(packagedMigrations.map((migration) => migration.version), [1, 2, 3]);
      const admin = identity("principal-admin", "session-stale-admin", "stale-admin");
      const common = { project_id: projectId, project_root: projectRoot, ...admin };
      const trustedAdmin = async () => ({
        principal_id: admin.principal_id,
        assurance: "trusted-test-harness",
      });

      const setupGateway = createGraphGateway({
        migrations: packagedMigrations.slice(0, 2),
        resolveProject: async () => ({
          projectId,
          projectRoot,
          endpoint: instance.endpoint.httpUrl,
          database: "neo4j",
          username: "neo4j",
          secretReference: instance.secretReference,
          auditPath: path.join(stateRoot, "wave5-stale-setup-audit.jsonl"),
          lifecycleStatus: "BLOCKED",
          lifecycleCode: "SCHEMA_MISSING",
          capabilities: ["read", "write", "schema-admin"],
          async recordSchema() {},
        }),
        resolveSecret: (reference) => secrets.get(reference),
        createTransport: () => transport,
        resolvePrincipal: trustedAdmin,
      });
      const bootstrap = await setupGateway.callTool("nacl_graph_bootstrap_admin", {
        ...common,
        idempotency_key: "stale-v2-bootstrap-admin",
        confirmation: "CONFIRM_INITIAL_PROJECT_ADMIN",
      });
      assert.equal(bootstrap.status, "VERIFIED", JSON.stringify(bootstrap));
      assert.deepEqual(bootstrap.schema.applied, [1, 2]);
      assert.equal(bootstrap.schema.currentVersion, 2);

      const stale = await lifecycle.doctor({ projectId, projectRoot });
      assert.equal(stale.status, "BLOCKED", JSON.stringify(stale));
      assert.equal(stale.code, "SCHEMA_STALE");
      assert.equal(stale.checks.schema.version, 2);
      assert.equal(stale.handoff.requiredVersion, 3);

      let recordSchemaCalls = 0;
      let recordedSchemaResult;
      const instrumentedLifecycle = {
        ...lifecycle,
        async recordSchema(args) {
          recordSchemaCalls += 1;
          recordedSchemaResult = await lifecycle.recordSchema(args);
          return recordedSchemaResult;
        },
      };
      const gateway = createGraphGateway({
        migrations: packagedMigrations,
        resolveProject: createLifecycleProjectResolver({
          getLifecycle: async () => instrumentedLifecycle,
        }),
        resolveSecret: (reference) => secrets.get(reference),
        createTransport: () => transport,
        resolvePrincipal: trustedAdmin,
      });

      const ordinaryResource = await gateway.callTool("nacl_graph_claim_resource", {
        ...common,
        resource_type: "Task",
        resource_id: "TASK-STALE-CLOSED",
        ttl_seconds: 300,
        idempotency_key: "stale-ordinary-resource",
        approval: "APPROVE_TL_WRITE",
      });
      assert.equal(ordinaryResource.status, "BLOCKED");
      assert.equal(ordinaryResource.code, "SCHEMA_STALE");

      await execute(
        "MATCH (membership:ProjectMembership {project_id: $project_id, principal_id: $principal_id}) SET membership.active = false RETURN membership.active AS active",
        { project_id: projectId, principal_id: admin.principal_id },
      );
      const revokedAdmin = await gateway.callTool("nacl_graph_claim_resource", {
        ...common,
        resource_type: "SchemaMigration",
        resource_id: "MIG-GATEWAY",
        ttl_seconds: 600,
        idempotency_key: "stale-revoked-admin",
        approval: "CONFIRM_SCHEMA_ADMIN",
      });
      assert.equal(revokedAdmin.status, "BLOCKED");
      assert.equal(revokedAdmin.code, "ACCESS_OR_RESOURCE_NOT_FOUND");
      await execute(
        "MATCH (membership:ProjectMembership {project_id: $project_id, principal_id: $principal_id}) SET membership.active = true RETURN membership.active AS active",
        { project_id: projectId, principal_id: admin.principal_id },
      );

      const lease = await gateway.callTool("nacl_graph_claim_resource", {
        ...common,
        resource_type: "SchemaMigration",
        resource_id: "MIG-GATEWAY",
        ttl_seconds: 600,
        idempotency_key: "stale-schema-lease",
        approval: "CONFIRM_SCHEMA_ADMIN",
      });
      assert.equal(lease.status, "VERIFIED", JSON.stringify(lease));
      assert.equal(lease.fencingToken, 1);

      const staleFence = await gateway.callTool("nacl_graph_apply_migrations", {
        ...common,
        fencing_token: lease.fencingToken + 1,
        idempotency_key: "stale-wrong-fence",
        approval: "CONFIRM_SCHEMA_ADMIN",
        confirmation: "APPLY_MIGRATIONS",
      });
      assert.equal(staleFence.status, "BLOCKED");
      assert.equal(staleFence.code, "ACCESS_OR_RESOURCE_NOT_FOUND");
      const [[beforeUpgrade]] = await execute(
        "OPTIONAL MATCH (migration:SchemaMigration {component: 'nacl-graph-gateway', version: 3}) RETURN migration.checksum AS checksum",
      );
      assert.equal(beforeUpgrade.checksum, null);

      const upgraded = await gateway.callTool("nacl_graph_apply_migrations", {
        ...common,
        fencing_token: lease.fencingToken,
        idempotency_key: "stale-v3-upgrade",
        approval: "CONFIRM_SCHEMA_ADMIN",
        confirmation: "APPLY_MIGRATIONS",
      });
      assert.equal(upgraded.status, "VERIFIED", JSON.stringify(upgraded));
      assert.deepEqual(upgraded.schema.applied, [3]);
      assert.deepEqual(upgraded.schema.alreadyApplied, [1, 2]);
      assert.equal(upgraded.schema.currentVersion, 3);
      assert.equal(upgraded.schema.checksum, EXPECTED_GATEWAY_SCHEMA.checksum);
      assert.equal(recordSchemaCalls, 1);
      assert.equal(recordedSchemaResult.status, "VERIFIED", JSON.stringify(recordedSchemaResult));
      assert.equal(recordedSchemaResult.code, "SCHEMA_METADATA_RECORDED");

      const [[[ledger]], [[constraint]]] = await Promise.all([
        execute(
          "MATCH (migration:SchemaMigration {component: 'nacl-graph-gateway'}) WITH migration ORDER BY migration.version RETURN collect({version: migration.version, checksum: migration.checksum}) AS entries",
        ),
        execute(
          "SHOW CONSTRAINTS YIELD name WHERE name = 'nacl_schema_resource_identity' RETURN collect(name) AS names",
        ),
      ]);
      assert.deepEqual(ledger.entries.map((entry) => entry.version), [1, 2, 3]);
      assert.equal(ledger.entries.at(-1).checksum, EXPECTED_GATEWAY_SCHEMA.checksum);
      assert.deepEqual(constraint.names, ["nacl_schema_resource_identity"]);

      const resolved = await lifecycle.resolve({ projectId, projectRoot });
      assert.equal(resolved.status, "VERIFIED");
      assert.deepEqual(resolved.instance.gatewaySchema, EXPECTED_GATEWAY_SCHEMA);
      const registered = await projectRouter.resolveRegistered({ projectId, projectRoot });
      assert.equal(registered.record.schemaVersion, EXPECTED_GATEWAY_SCHEMA.version);
      const healthy = await lifecycle.doctor({ projectId, projectRoot });
      assert.equal(healthy.status, "VERIFIED", JSON.stringify(healthy));
      assert.equal(healthy.code, "GRAPH_HEALTHY");
      assert.equal(healthy.checks.schema.version, 3);

      const released = await gateway.callTool("nacl_graph_release_resource", {
        ...common,
        resource_type: "SchemaMigration",
        resource_id: "MIG-GATEWAY",
        fencing_token: lease.fencingToken,
        idempotency_key: "stale-schema-release",
        approval: "CONFIRM_SCHEMA_ADMIN",
      });
      assert.equal(released.status, "VERIFIED", JSON.stringify(released));
      const health = await gateway.callTool("nacl_graph_health", common);
      assert.equal(health.status, "VERIFIED", JSON.stringify(health));
      assert.equal(health.code, "GRAPH_HEALTHY");
      assert.equal((await lifecycle.stop({ projectId, projectRoot })).status, "VERIFIED");
    } finally {
      if (instance) {
        docker(["container", "rm", "--force", instance.containerName]);
        docker(["volume", "rm", instance.volumeName]);
        docker(["network", "rm", `${instance.composeProject}_default`]);
        exactResourceAbsent(instance);
      }
      await rm(root, { recursive: true, force: true });
      if (preparedImage.createdTag) docker(["image", "rm", exactImage]);
    }
  },
);
