import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGraphGateway } from "../../../plugins/nacl/runtime/graph-gateway/gateway.mjs";
import { deriveWorkerId } from "../../../plugins/nacl/runtime/graph-gateway/identity.mjs";
import { createLifecycleProjectResolver } from "../../../plugins/nacl/runtime/graph-gateway/lifecycle-adapter.mjs";
import { createLocalGraphLifecycle } from "../../../plugins/nacl/runtime/graph-cli/lifecycle.mjs";
import { Neo4jHttpProbe } from "../../../plugins/nacl/runtime/graph-cli/graph-probe.mjs";
import { createProjectRouter } from "../../../plugins/nacl/runtime/graph-cli/project-registry.mjs";
import { MemorySecretProvider } from "../../../plugins/nacl/runtime/graph-cli/secret-provider.mjs";
import { collectGraphVerificationSnapshot } from "../../../plugins/nacl/runtime/graph-cli/verification-snapshot.mjs";
import { prepareExactNeo4jImage } from "./neo4j-image-fixture.mjs";

const enabled = process.env.NACL_RUN_DOCKER_SMOKE === "1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pluginRoot = path.join(repoRoot, "plugins", "nacl");
const exactImage = "neo4j:5.24.2-community";
const sourceImage = "neo4j:5.24-community";

function command(program, args, options = {}) {
  return spawnSync(program, args, { encoding: "utf8", ...options });
}

function docker(args, options = {}) {
  return command("docker", args, options);
}

function git(cwd, args) {
  const result = command("git", args, { cwd });
  assert.equal(result.status, 0, result.stderr);
}

async function createProject(projectRoot, projectId, name) {
  await mkdir(projectRoot);
  await writeFile(
    path.join(projectRoot, "config.yaml"),
    `project:\n  id: "${projectId}"\n  name: "${name}"\n`,
  );
  git(projectRoot, ["init", "-q"]);
  git(projectRoot, ["config", "user.name", "NaCl Test"]);
  git(projectRoot, ["config", "user.email", "nacl-test@example.invalid"]);
  git(projectRoot, ["add", "config.yaml"]);
  git(projectRoot, ["commit", "-q", "-m", `fixture ${name}`]);
}

async function transaction(instance, secret, statements) {
  const authorization = Buffer.from(`neo4j:${secret}`).toString("base64");
  const response = await fetch(`${instance.endpoint.httpUrl}/db/neo4j/tx/commit`, {
    method: "POST",
    headers: {
      authorization: `Basic ${authorization}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      statements: statements.map(({ statement, parameters = {} }) => ({ statement, parameters })),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function exactResourceAbsent(instance) {
  assert.notEqual(docker(["container", "inspect", instance.containerName]).status, 0);
  assert.notEqual(docker(["volume", "inspect", instance.volumeName]).status, 0);
  assert.notEqual(docker(["network", "inspect", `${instance.composeProject}_default`]).status, 0);
}

function gatewayIdentity() {
  const value = {
    principal_id: "principal-wave4-admin",
    client_id: "client-wave4-e2e",
    session_id: "session-wave4-e2e",
    worktree_id: "worktree-wave4-e2e",
    branch: "codex/wave4-e2e",
    base_sha: "b".repeat(40),
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
  "real two-project Docker E2E has zero lifecycle, credential, schema, data, backup, or reinstall cross-talk",
  { skip: !enabled, timeout: 300_000 },
  async () => {
    assert.equal(docker(["version", "--format", "{{.Server.Version}}"]).status, 0, "Docker daemon is required");
    const preparedImage = prepareExactNeo4jImage({ docker, exactImage, sourceImage });
    const createdTag = preparedImage.createdTag;
    assert.equal(preparedImage.version, "5.24.2");

    const root = await mkdtemp(path.join(os.tmpdir(), "nacl-wave4-docker-"));
    const stateRoot = path.join(root, "state");
    const backupRoot = path.join(root, "backups");
    const cacheRoot = path.join(root, "installed-cache", "nacl");
    const unique = `${Date.now()}-${process.pid}`;
    const projectIdA = `wave4-a-${unique}`;
    const projectIdB = `wave4-b-${unique}`;
    const projectRootA = path.join(root, "project-a");
    const projectRootB = path.join(root, "project-b");
    const secretA = `wave4-a-${unique}-secret-value`;
    const secretB = `wave4-b-${unique}-secret-value`;
    await createProject(projectRootA, projectIdA, "Tenant A");
    await createProject(projectRootB, projectIdB, "Tenant B");

    const projectRouter = createProjectRouter({
      registryRoot: path.join(stateRoot, ".project-registry"),
    });
    await projectRouter.registerRoot({
      projectId: projectIdA,
      projectRoot: projectRootA,
      confirmation: "REGISTER_PROJECT_ROOT",
    });
    await projectRouter.registerRoot({
      projectId: projectIdB,
      projectRoot: projectRootB,
      confirmation: "REGISTER_PROJECT_ROOT",
    });

    const secrets = new MemorySecretProvider();
    let generated = 0;
    const lifecycleOptions = {
      stateRoot,
      projectRouter,
      secretProvider: secrets,
      secretGenerator: () => (++generated === 1 ? secretA : secretB),
      graphProbe: new Neo4jHttpProbe({ attempts: 90, delayMs: 500 }),
      pluginRoot,
    };
    const lifecycle = createLocalGraphLifecycle(lifecycleOptions);
    const scopeA = { projectId: projectIdA, projectRoot: projectRootA };
    const scopeB = { projectId: projectIdB, projectRoot: projectRootB };
    const actor = gatewayIdentity();
    const gatewayArgsA = { project_id: projectIdA, project_root: projectRootA, ...actor };
    const gatewayArgsB = { project_id: projectIdB, project_root: projectRootB, ...actor };
    let instanceA;
    let instanceB;
    try {
      const initializedA = await lifecycle.init(scopeA);
      const initializedB = await lifecycle.init(scopeB);
      assert.equal(initializedA.status, "VERIFIED", JSON.stringify(initializedA));
      assert.equal(initializedB.status, "VERIFIED", JSON.stringify(initializedB));
      instanceA = initializedA.instance;
      instanceB = initializedB.instance;
      assert.notEqual(instanceA.containerName, instanceB.containerName);
      assert.notEqual(instanceA.volumeName, instanceB.volumeName);
      assert.notEqual(instanceA.endpoint.httpPort, instanceB.endpoint.httpPort);

      assert.equal((await lifecycle.start(scopeA)).code, "SCHEMA_MISSING");
      assert.equal((await lifecycle.start(scopeB)).code, "SCHEMA_MISSING");
      const gateway = createGraphGateway({
        resolveProject: createLifecycleProjectResolver({ getLifecycle: async () => lifecycle }),
        resolveSecret: (reference) => secrets.get(reference),
        resolvePrincipal: async () => ({
          principal_id: actor.principal_id,
          assurance: "trusted-test-harness",
        }),
      });

      const migratedA = await gateway.callTool("nacl_graph_bootstrap_admin", {
        ...gatewayArgsA,
        idempotency_key: `wave4-bootstrap-${unique}-a`,
        confirmation: "CONFIRM_INITIAL_PROJECT_ADMIN",
      });
      assert.equal(migratedA.status, "VERIFIED", JSON.stringify(migratedA));
      const bBeforeMigration = await gateway.callTool("nacl_graph_schema_status", gatewayArgsB);
      assert.equal(bBeforeMigration.status, "BLOCKED", JSON.stringify(bBeforeMigration));
      assert.equal(bBeforeMigration.code, "SCHEMA_MISSING", "A migration must not advance B");
      const migratedB = await gateway.callTool("nacl_graph_bootstrap_admin", {
        ...gatewayArgsB,
        idempotency_key: `wave4-bootstrap-${unique}-b`,
        confirmation: "CONFIRM_INITIAL_PROJECT_ADMIN",
      });
      assert.equal(migratedB.status, "VERIFIED", JSON.stringify(migratedB));

      for (const [args, suffix] of [[gatewayArgsA, "a"], [gatewayArgsB, "b"]]) {
        const written = await gateway.callTool("nacl_graph_write_canary", {
          ...args,
          idempotency_key: `wave4-shared-canary-${unique}-${suffix}`,
          approval: "APPROVE_PROJECT_WRITE",
          confirmation: "WRITE_CANARY",
        });
        assert.equal(written.status, "VERIFIED", JSON.stringify(written));
      }

      const identicalEntities = [
        { statement: "CREATE (:UseCase {id: $id, tenant: $tenant})", parameters: { id: "UC-001" } },
        { statement: "CREATE (:Module {id: $id, tenant: $tenant})", parameters: { id: "MOD-001" } },
        { statement: "CREATE (:Task {id: $id, tenant: $tenant})", parameters: { id: "Task" } },
      ];
      for (const [instance, secret, tenant] of [
        [instanceA, secretA, "A"],
        [instanceB, secretB, "B"],
      ]) {
        const created = await transaction(instance, secret, identicalEntities.map((entry) => ({
          statement: entry.statement,
          parameters: { ...entry.parameters, tenant },
        })));
        assert.equal(created.response.ok, true);
        assert.deepEqual(created.payload.errors, []);
      }
      for (const [instance, secret, tenant] of [
        [instanceA, secretA, "A"],
        [instanceB, secretB, "B"],
      ]) {
        const observed = await transaction(instance, secret, [{
          statement: "MATCH (node) WHERE node.id IN $ids RETURN collect(node.tenant) AS tenants",
          parameters: { ids: ["UC-001", "MOD-001", "Task"] },
        }]);
        assert.equal(observed.response.ok, true);
        assert.deepEqual(observed.payload.errors, []);
        assert.deepEqual([...observed.payload.results[0].data[0].row[0]].sort(), [tenant, tenant, tenant]);
      }
      const wrongSecret = await transaction(instanceB, secretA, [{ statement: "RETURN 1" }]);
      assert.equal(wrongSecret.response.status, 401, "A credential must not open B");

      assert.equal((await gateway.callTool("nacl_graph_health", gatewayArgsB)).status, "VERIFIED");
      const snapshotA = await collectGraphVerificationSnapshot({
        instance: instanceA,
        secret: secretA,
        projectId: projectIdA,
      });
      assert.equal((await lifecycle.stop(scopeA)).status, "VERIFIED");
      assert.equal((await gateway.callTool("nacl_graph_health", gatewayArgsB)).status, "VERIFIED", "stopping A must not stop B");
      await mkdir(backupRoot);
      const backupA = await lifecycle.backup({ ...scopeA, backupDir: backupRoot, snapshot: snapshotA });
      assert.equal(backupA.status, "VERIFIED", JSON.stringify(backupA));
      const restoredA = await lifecycle.restoreVerify({
        ...scopeA,
        manifestPath: backupA.backup.manifestPath,
      });
      assert.equal(restoredA.status, "VERIFIED", JSON.stringify(restoredA));
      assert.equal(restoredA.originalUntouched, true);
      assert.equal(restoredA.candidate.cleaned, true);
      assert.equal((await gateway.callTool("nacl_graph_health", gatewayArgsB)).status, "VERIFIED", "A restore must not affect B");

      await cp(pluginRoot, cacheRoot, { recursive: true });
      const cachedLifecycleModule = await import(
        `${pathToFileURL(path.join(cacheRoot, "runtime", "graph-cli", "lifecycle.mjs")).href}?wave4=${unique}`
      );
      const replacement = cachedLifecycleModule.createLocalGraphLifecycle({
        ...lifecycleOptions,
        pluginRoot: cacheRoot,
      });
      assert.equal((await replacement.resolve(scopeA)).status, "VERIFIED");
      assert.equal((await replacement.resolve(scopeB)).status, "VERIFIED");
      assert.equal((await replacement.start(scopeA)).status, "VERIFIED");
      await rm(cacheRoot, { recursive: true, force: true });
      assert.equal(docker(["volume", "inspect", instanceA.volumeName]).status, 0);
      assert.equal(docker(["volume", "inspect", instanceB.volumeName]).status, 0);
      assert.equal((await gateway.callTool("nacl_graph_health", gatewayArgsA)).status, "VERIFIED");
      assert.equal((await gateway.callTool("nacl_graph_health", gatewayArgsB)).status, "VERIFIED");
    } finally {
      for (const instance of [instanceA, instanceB].filter(Boolean)) {
        docker(["container", "rm", "--force", instance.containerName]);
        docker(["volume", "rm", instance.volumeName]);
        docker(["network", "rm", `${instance.composeProject}_default`]);
      }
      if (instanceA) {
        const restoreHash = createHash("sha256").update(projectIdA).digest("hex").slice(0, 12);
        const containers = docker(["container", "ls", "--all", "--format", "{{.Names}}"]).stdout;
        const volumes = docker(["volume", "ls", "--format", "{{.Name}}"]).stdout;
        assert.equal(containers.split(/\r?\n/).some((name) => name.startsWith(`nacl-restore-${restoreHash}-`)), false);
        assert.equal(volumes.split(/\r?\n/).some((name) => name.startsWith(`nacl_restore_${restoreHash}_`)), false);
      }
      for (const instance of [instanceA, instanceB].filter(Boolean)) exactResourceAbsent(instance);
      await rm(root, { recursive: true, force: true });
      if (createdTag) docker(["image", "rm", exactImage]);
    }
  },
);
