import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGraphGateway } from "../../../plugins/nacl/runtime/graph-gateway/gateway.mjs";
import { deriveWorkerId } from "../../../plugins/nacl/runtime/graph-gateway/identity.mjs";
import { createLifecycleProjectResolver } from "../../../plugins/nacl/runtime/graph-gateway/lifecycle-adapter.mjs";
import { createLocalGraphLifecycle } from "../../../plugins/nacl/runtime/graph-cli/lifecycle.mjs";
import { Neo4jHttpProbe } from "../../../plugins/nacl/runtime/graph-cli/graph-probe.mjs";
import { MemorySecretProvider } from "../../../plugins/nacl/runtime/graph-cli/secret-provider.mjs";
import { createProjectRouter } from "../../../plugins/nacl/runtime/graph-cli/project-registry.mjs";
import { collectGraphVerificationSnapshot } from "../../../plugins/nacl/runtime/graph-cli/verification-snapshot.mjs";
import { prepareExactNeo4jImage } from "./neo4j-image-fixture.mjs";

const enabled = process.env.NACL_RUN_DOCKER_SMOKE === "1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pluginRoot = path.join(repoRoot, "plugins", "nacl");
const exactImage = "neo4j:5.24.2-community";
const sourceImage = "neo4j:5.24-community";
const cliHarness = path.join(
  repoRoot,
  "tests",
  "codex-plugin",
  "scripts",
  "nacl-graph-cli-process-harness.mjs",
);

function docker(args) {
  return spawnSync("docker", args, { encoding: "utf8" });
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function gatewayIdentity() {
  const value = {
    principal_id: "principal-wave3-admin",
    client_id: "client-wave3-e2e",
    session_id: "session-wave3-e2e",
    worktree_id: "worktree-wave3-e2e",
    branch: "codex/wave3-e2e",
    base_sha: "a".repeat(40),
  };
  return {
    ...value,
    worker_id: deriveWorkerId({
      principal_id: value.principal_id,
      client_id: value.client_id,
      session_id: value.session_id,
    }),
  };
}

test(
  "real gateway and lifecycle preserve schema/data across restart, cache replacement, backup, restore, and uninstall",
  { skip: !enabled, timeout: 180_000 },
  async () => {
    assert.equal(docker(["version", "--format", "{{.Server.Version}}"]).status, 0, "Docker daemon is required");
    const preparedImage = prepareExactNeo4jImage({ docker, exactImage, sourceImage });
    const createdTag = preparedImage.createdTag;
    assert.equal(preparedImage.version, "5.24.2");
    assert.match(preparedImage.identity.id, /^sha256:[a-f0-9]{64}$/);

    const root = await mkdtemp(path.join(os.tmpdir(), "nacl-gateway-docker-e2e-"));
    const stateRoot = path.join(root, "state");
    const backupRoot = path.join(root, "backups");
    const cacheRoot = path.join(root, "installed-cache", "nacl");
    const projectId = `wave3-gateway-${Date.now()}-${process.pid}`;
    const projectRoot = path.join(root, "project");
    await mkdir(projectRoot);
    await writeFile(path.join(projectRoot, "config.yaml"), `project:\n  id: "${projectId}"\n`);
    git(projectRoot, ["init", "-q"]);
    git(projectRoot, ["config", "user.name", "NaCl Test"]);
    git(projectRoot, ["config", "user.email", "nacl-test@example.invalid"]);
    git(projectRoot, ["add", "config.yaml"]);
    git(projectRoot, ["commit", "-q", "-m", "fixture"]);
    const projectRouter = createProjectRouter({
      registryRoot: path.join(stateRoot, ".project-registry"),
    });
    await projectRouter.registerRoot({
      projectId,
      projectRoot,
      confirmation: "REGISTER_PROJECT_ROOT",
    });
    const idempotencyKey = `wave3-canary-${Date.now()}-${process.pid}`;
    const secret = `disposable-${Date.now()}-${process.pid}-graph-secret`;
    const secrets = new MemorySecretProvider();
    let instance;
    const lifecycleOptions = {
      stateRoot,
      projectRouter,
      secretProvider: secrets,
      secretGenerator: () => secret,
      graphProbe: new Neo4jHttpProbe({ attempts: 60, delayMs: 500 }),
      pluginRoot,
    };
    try {
      const lifecycle = createLocalGraphLifecycle(lifecycleOptions);
      const initialized = await lifecycle.init({ projectId, projectRoot });
      assert.equal(initialized.status, "VERIFIED");
      instance = initialized.instance;
      const started = await lifecycle.start({ projectId, projectRoot });
      assert.equal(started.status, "BLOCKED");
      assert.equal(started.code, "SCHEMA_MISSING");

      const gateway = createGraphGateway({
        resolveProject: createLifecycleProjectResolver({ getLifecycle: async () => lifecycle }),
        resolveSecret: (reference) => secrets.get(reference),
        resolvePrincipal: async () => ({
          principal_id: gatewayIdentity().principal_id,
          assurance: "trusted-test-harness",
        }),
      });
      const actor = gatewayIdentity();
      const gatewayArgs = { project_id: projectId, project_root: projectRoot, ...actor };
      const missing = await gateway.callTool("nacl_graph_health", gatewayArgs);
      assert.equal(missing.status, "BLOCKED");
      assert.equal(missing.code, "SCHEMA_MISSING");

      const migrated = await gateway.callTool("nacl_graph_bootstrap_admin", {
        ...gatewayArgs,
        idempotency_key: "wave3-bootstrap-admin",
        confirmation: "CONFIRM_INITIAL_PROJECT_ADMIN",
      });
      assert.equal(migrated.status, "VERIFIED", JSON.stringify(migrated));
      assert.deepEqual(migrated.schema.applied, [1, 2, 3]);
      const schemaLease = await gateway.callTool("nacl_graph_claim_resource", {
        ...gatewayArgs,
        resource_type: "SchemaMigration",
        resource_id: "MIG-GATEWAY",
        ttl_seconds: 300,
        idempotency_key: "wave3-schema-lease",
        approval: "CONFIRM_SCHEMA_ADMIN",
      });
      assert.equal(schemaLease.status, "VERIFIED", JSON.stringify(schemaLease));
      const migrationRepeat = await gateway.callTool("nacl_graph_apply_migrations", {
        ...gatewayArgs,
        fencing_token: schemaLease.fencingToken,
        idempotency_key: "wave3-migration-repeat",
        approval: "CONFIRM_SCHEMA_ADMIN",
        confirmation: "APPLY_MIGRATIONS",
      });
      assert.equal(migrationRepeat.status, "VERIFIED");
      assert.deepEqual(migrationRepeat.schema.alreadyApplied, [1, 2, 3]);

      const healthy = await gateway.callTool("nacl_graph_health", gatewayArgs);
      assert.equal(healthy.status, "VERIFIED", JSON.stringify(healthy));
      const writeArgs = {
        ...gatewayArgs,
        idempotency_key: idempotencyKey,
        approval: "APPROVE_PROJECT_WRITE",
        confirmation: "WRITE_CANARY",
      };
      const written = await gateway.callTool("nacl_graph_write_canary", writeArgs);
      assert.equal(written.status, "VERIFIED", JSON.stringify(written));
      const replayed = await gateway.callTool("nacl_graph_write_canary", writeArgs);
      assert.equal(replayed.status, "VERIFIED");
      assert.equal(replayed.canary.replay, true);
      assert.equal(replayed.canary.revision, written.canary.revision);

      const snapshot = await collectGraphVerificationSnapshot({
        instance,
        secret,
        projectId,
      });
      const stopped = await lifecycle.stop({ projectId, projectRoot });
      assert.equal(stopped.status, "VERIFIED", JSON.stringify(stopped));
      await mkdir(backupRoot, { recursive: true });
      const backup = await lifecycle.backup({ projectId, projectRoot, backupDir: backupRoot, snapshot });
      assert.equal(backup.status, "VERIFIED", JSON.stringify(backup));
      const cliEnvironment = Object.fromEntries(
        ["PATH", "HOME", "DOCKER_HOST", "DOCKER_CONTEXT", "TMPDIR"]
          .filter((name) => process.env[name] !== undefined)
          .map((name) => [name, process.env[name]]),
      );
      const cliArguments = [
        cliHarness,
        "restore-verify",
        "--project-id",
        projectId,
        "--project-root",
        projectRoot,
        "--state-root",
        stateRoot,
        "--manifest",
        backup.backup.manifestPath,
      ];
      const restoreProcess = spawnSync(
        process.execPath,
        cliArguments,
        {
          encoding: "utf8",
          env: { ...cliEnvironment, NACL_TEST_GRAPH_SECRET: secret },
          timeout: 120_000,
        },
      );
      assert.equal(restoreProcess.status, 0, restoreProcess.stderr);
      const restore = JSON.parse(restoreProcess.stdout);
      assert.equal(restore.operation, "restore-verify");
      assert.equal(restore.code, "RESTORE_VERIFIED");
      assert.equal(restore.status, "VERIFIED", JSON.stringify(restore));
      assert.equal(restore.originalUntouched, true);
      assert.equal(restore.candidate.cleaned, true);
      assert.equal(restoreProcess.stdout.includes(secret), false);
      assert.equal(restoreProcess.stderr.includes(secret), false);
      assert.equal(
        cliArguments.join(" ").includes(secret),
        false,
        "the injected fixture secret must stay out of child argv",
      );

      await cp(pluginRoot, cacheRoot, { recursive: true });
      const lifecycleModule = await import(
        `${pathToFileURL(path.join(cacheRoot, "runtime", "graph-cli", "lifecycle.mjs")).href}?cache=e2e`
      );
      const gatewayModule = await import(
        `${pathToFileURL(path.join(cacheRoot, "runtime", "graph-gateway", "gateway.mjs")).href}?cache=e2e`
      );
      const adapterModule = await import(
        `${pathToFileURL(path.join(cacheRoot, "runtime", "graph-gateway", "lifecycle-adapter.mjs")).href}?cache=e2e`
      );
      const replacement = lifecycleModule.createLocalGraphLifecycle({
        ...lifecycleOptions,
        pluginRoot: cacheRoot,
      });
      assert.equal((await replacement.resolve({ projectId, projectRoot })).status, "VERIFIED");
      assert.equal((await replacement.start({ projectId, projectRoot })).status, "VERIFIED");
      const cachedGateway = gatewayModule.createGraphGateway({
        resolveProject: adapterModule.createLifecycleProjectResolver({ getLifecycle: async () => replacement }),
        resolveSecret: (reference) => secrets.get(reference),
        resolvePrincipal: async () => ({
          principal_id: actor.principal_id,
          assurance: "trusted-test-harness",
        }),
      });
      assert.equal((await cachedGateway.callTool("nacl_graph_health", gatewayArgs)).status, "VERIFIED");
      assert.equal((await cachedGateway.callTool("nacl_graph_write_canary", writeArgs)).canary.replay, true);
      assert.equal((await replacement.stop({ projectId, projectRoot })).status, "VERIFIED");

      await rm(cacheRoot, { recursive: true, force: true });
      assert.equal(docker(["volume", "inspect", instance.volumeName]).status, 0, "plugin uninstall must not delete data");
      assert.equal((await lifecycle.start({ projectId, projectRoot })).status, "VERIFIED");
      assert.equal((await gateway.callTool("nacl_graph_write_canary", writeArgs)).canary.replay, true);
      assert.equal((await lifecycle.stop({ projectId, projectRoot })).status, "VERIFIED");

      const audit = await readFile(initialized.auditPath, "utf8");
      assert.equal(audit.includes(secret), false);
      assert.equal(audit.includes(idempotencyKey), false);
      assert.match(audit, /MIGRATIONS_APPLIED/);
      assert.match(audit, /WRITE_READBACK_VERIFIED/);
    } finally {
      if (instance) {
        docker(["container", "rm", "--force", instance.containerName]);
        docker(["volume", "rm", instance.volumeName]);
        docker(["network", "rm", `${instance.composeProject}_default`]);
      }
      await rm(root, { recursive: true, force: true });
      if (createdTag) docker(["image", "rm", exactImage]);
    }
  },
);
