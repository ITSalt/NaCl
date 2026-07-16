import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SNAPSHOT_CONTRACT } from "../../../plugins/nacl/runtime/graph-cli/backup-contract.mjs";
import { EXPECTED_GATEWAY_SCHEMA, projectDockerNames } from "../../../plugins/nacl/runtime/graph-cli/contracts.mjs";
import { createLocalGraphLifecycle } from "../../../plugins/nacl/runtime/graph-cli/lifecycle.mjs";
import { createProjectRouter } from "../../../plugins/nacl/runtime/graph-cli/project-registry.mjs";
import { MemorySecretProvider } from "../../../plugins/nacl/runtime/graph-cli/secret-provider.mjs";
import { createGraphGateway } from "../../../plugins/nacl/runtime/graph-gateway/gateway.mjs";
import { loadMigrationCatalog, loadQueryCatalog } from "../../../plugins/nacl/runtime/graph-gateway/catalog.mjs";
import { deriveWorkerId } from "../../../plugins/nacl/runtime/graph-gateway/identity.mjs";

const projectA = "01J-WAVE4-TENANT-A";
const projectB = "01J-WAVE4-TENANT-B";
const secretA = "tenant-a-secret-value-that-remains-private";
const secretB = "tenant-b-secret-value-that-remains-private";
const gatewayIdentity = Object.freeze({
  principal_id: "principal-wave4-admin",
  client_id: "client-wave4-fixture",
  session_id: "session-wave4-fixture",
  worktree_id: "worktree-wave4-fixture",
  branch: "codex/wave4-fixture",
  base_sha: "a".repeat(40),
});
const gatewayWorkerId = deriveWorkerId({
  principal_id: gatewayIdentity.principal_id,
  client_id: gatewayIdentity.client_id,
  session_id: gatewayIdentity.session_id,
});

class PortProbe {
  constructor() {
    this.busy = new Set();
  }
  async isAvailable(port) {
    return !this.busy.has(port);
  }
}

class DockerRunner {
  constructor() {
    this.states = new Map();
    this.volumes = new Set();
    this.networks = new Set();
    this.calls = [];
  }

  async run(spec) {
    const args = spec.args ?? [];
    this.calls.push({ args: [...args], env: { ...(spec.env ?? {}) } });
    if (args[0] === "version") return { status: 0, stdout: "29.6.1\n", stderr: "" };
    if (args[0] === "container" && args[1] === "ls") {
      const expected = args[args.indexOf("--filter") + 1]?.replace(/^name=\^\//, "").replace(/\$$/, "");
      return { status: 0, stdout: this.states.has(expected) ? `${expected}\n` : "", stderr: "" };
    }
    if (args[0] === "volume" && args[1] === "ls") {
      const expected = args[args.indexOf("--filter") + 1]?.replace(/^name=\^/, "").replace(/\$$/, "");
      return { status: 0, stdout: this.volumes.has(expected) ? `${expected}\n` : "", stderr: "" };
    }
    if (args[0] === "network" && args[1] === "ls") {
      const expected = args[args.indexOf("--filter") + 1]?.replace(/^name=\^/, "").replace(/\$$/, "");
      return { status: 0, stdout: this.networks.has(expected) ? `${expected}\n` : "", stderr: "" };
    }
    if (args[0] === "container" && args[1] === "inspect") {
      const name = args.at(-1);
      const state = this.states.get(name);
      if (!state) return { status: 1, stdout: "", stderr: "not found" };
      return {
        status: 0,
        stdout: `${JSON.stringify({
          Running: state.running,
          Status: state.status,
          ExitCode: state.exitCode,
          OOMKilled: false,
        })}\n`,
        stderr: "",
      };
    }
    if (args[0] === "compose" && args.includes("up")) {
      const container = spec.env.NACL_CONTAINER_NAME;
      this.states.set(container, { running: true, status: "running", exitCode: 0 });
      this.volumes.add(spec.env.NACL_VOLUME_NAME);
      this.networks.add(`${args[args.indexOf("--project-name") + 1]}_default`);
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "container" && args[1] === "stop") {
      const container = args.at(-1);
      this.states.set(container, { running: false, status: "exited", exitCode: 0 });
      return { status: 0, stdout: container, stderr: "" };
    }
    if (args[0] === "volume" && args[1] === "inspect") {
      return this.volumes.has(args[2])
        ? { status: 0, stdout: args[2], stderr: "" }
        : { status: 1, stdout: "", stderr: "not found" };
    }
    if (args[0] === "volume" && args[1] === "create") {
      this.volumes.add(args.at(-1));
      return { status: 0, stdout: args.at(-1), stderr: "" };
    }
    if (args[0] === "volume" && args[1] === "rm") {
      this.volumes.delete(args[2]);
      return { status: 0, stdout: args[2], stderr: "" };
    }
    if (args[0] === "container" && args[1] === "rm") {
      this.states.delete(args.at(-1));
      return { status: 0, stdout: args.at(-1), stderr: "" };
    }
    if (args[0] === "run" && args.includes("dump")) {
      const mount = args.find((value) => value.endsWith(":/backups"));
      await writeFile(path.join(mount.slice(0, -":/backups".length), "neo4j.dump"), "tenant-a-dump");
      return { status: 0, stdout: "dumped", stderr: "" };
    }
    if (args[0] === "run" && args.includes("load")) return { status: 0, stdout: "loaded", stderr: "" };
    if (args[0] === "run" && args.includes("chown")) return { status: 0, stdout: "", stderr: "" };
    if (args[0] === "run" && args.includes("--detach")) {
      const container = args[args.indexOf("--name") + 1];
      this.states.set(container, { running: true, status: "running", exitCode: 0 });
      return { status: 0, stdout: container, stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  }
}

class TenantTransport {
  constructor(projectId) {
    this.projectId = projectId;
    this.ledger = new Map();
    this.constraints = new Set();
    this.canaries = new Map();
    this.domainIds = new Set();
    this.membership = {
      project_id: projectId,
      principal_id: gatewayIdentity.principal_id,
      role: "project_admin",
      active: true,
      revision: 1,
    };
    this.schemaLease = {
      principal_id: gatewayIdentity.principal_id,
      worker_id: gatewayWorkerId,
      fencing_token: 1,
      expires_at_ms: Date.now() + 60_000,
    };
  }

  async execute(statements) {
    const results = [];
    for (const { statement, parameters = {} } of statements) {
      if (statement.includes("MATCH (membership:ProjectMembership")) {
        const membershipAccepted = this.membership.active === true &&
          this.membership.project_id === parameters.project_id &&
          this.membership.principal_id === parameters.principal_id &&
          parameters.allowed_roles.includes(this.membership.role);
        const schemaLeaseRequired = statement.includes("MATCH (schema_lease:ResourceLease");
        const leaseAccepted = !schemaLeaseRequired || (
          this.schemaLease.principal_id === parameters.principal_id &&
          this.schemaLease.worker_id === parameters.worker_id &&
          this.schemaLease.fencing_token === parameters.fencing_token &&
          this.schemaLease.expires_at_ms > parameters.now_ms
        );
        if (!membershipAccepted || !leaseAccepted) {
          results.push([]);
          continue;
        }
        if (statement.includes("RETURN membership.revision AS membershipRevision")) {
          results.push([{
            membershipRevision: this.membership.revision,
            fencingToken: this.schemaLease.fencing_token,
            expiresAt: new Date(this.schemaLease.expires_at_ms).toISOString(),
          }]);
          continue;
        }
      }
      if (statement.includes("OPTIONAL MATCH (migration:SchemaMigration")) {
        const key = `${parameters.component}:${parameters.version}`;
        results.push([{ checksum: this.ledger.get(key) ?? null }]);
      } else if (statement.includes("MERGE (migration:SchemaMigration")) {
        const key = `${parameters.component}:${parameters.version}`;
        if (!this.ledger.has(key)) this.ledger.set(key, parameters.checksum);
        results.push([{ checksum: this.ledger.get(key) }]);
      } else if (statement.startsWith("CREATE CONSTRAINT")) {
        this.constraints.add(statement.match(/^CREATE CONSTRAINT ([A-Za-z0-9_]+)/)[1]);
        results.push([]);
      } else if (statement.startsWith("SHOW CONSTRAINTS")) {
        results.push([{ names: parameters.names.filter((name) => this.constraints.has(name)) }]);
      } else if (statement.includes("RETURN $expected AS observed")) {
        results.push([{ observed: parameters.expected }]);
      } else if (statement.includes("MATCH (node) RETURN count(node) AS nodeCount")) {
        results.push([{ nodeCount: this.domainIds.size }]);
      } else if (statement.startsWith("OPTIONAL MATCH (guard:ProjectAuthorization")) {
        results.push([{ state: "UNINITIALIZED", membershipCount: 0 }]);
      } else if (statement.startsWith("MERGE (guard:ProjectAuthorization") && statement.includes("MERGE (canary:NaclGatewayCanary")) {
        assert.equal(parameters.project_id, this.projectId, "project parameter must match physical tenant");
        const previous = this.canaries.get(parameters.project_id);
        const replay = previous?.idempotencyKey === parameters.idempotency_key;
        const current = replay
          ? previous
          : { revision: (previous?.revision ?? 0) + 1, idempotencyKey: parameters.idempotency_key };
        this.canaries.set(parameters.project_id, current);
        results.push([{
          projectId: parameters.project_id,
          revision: current.revision,
          idempotencyKey: current.idempotencyKey,
          replay,
        }]);
      } else if (statement.startsWith("MATCH (canary:NaclGatewayCanary")) {
        const current = this.canaries.get(parameters.project_id);
        results.push(current ? [{
          projectId: parameters.project_id,
          revision: current.revision,
          idempotencyKey: current.idempotencyKey,
        }] : []);
      } else {
        throw new Error(`Unexpected packaged statement: ${statement}`);
      }
    }
    return results;
  }
}

function snapshot() {
  return {
    contract: SNAPSHOT_CONTRACT,
    nodeCount: 3,
    relationshipCount: 0,
    labelHistogram: { Module: 1, Task: 1, UseCase: 1 },
    relationshipTypeHistogram: {},
    constraints: ["nacl_schema_migration_identity"],
    indexes: ["nacl_schema_migration_identity"],
    schemaMigration: {
      version: EXPECTED_GATEWAY_SCHEMA.version,
      checksum: EXPECTED_GATEWAY_SCHEMA.checksum,
    },
    representativeQueries: {
      "tenant-ids": { rowCount: 3, digest: "a".repeat(64) },
    },
    readWriteSmoke: "VERIFIED",
  };
}

test("two projects retain separate lifecycle, schema, data, secrets, and recovery routes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-multi-project-"));
  const stateRoot = path.join(root, "state");
  const projectRootA = path.join(root, "project-a");
  const projectRootB = path.join(root, "project-b");
  await Promise.all([mkdir(projectRootA), mkdir(projectRootB)]);
  await Promise.all([
    writeFile(path.join(projectRootA, "config.yaml"), `project:\n  id: "${projectA}"\n`),
    writeFile(path.join(projectRootB, "config.yaml"), `project:\n  id: "${projectB}"\n`),
  ]);
  const router = createProjectRouter({
    registryRoot: path.join(stateRoot, ".project-registry"),
    repositoryIdentity: async (projectRoot) =>
      `git-roots-sha256:${createHash("sha256").update(projectRoot).digest("hex")}`,
    clock: () => new Date("2026-07-14T16:30:00.000Z"),
  });
  await router.registerRoot({ projectId: projectA, projectRoot: projectRootA, confirmation: "REGISTER_PROJECT_ROOT" });
  await router.registerRoot({ projectId: projectB, projectRoot: projectRootB, confirmation: "REGISTER_PROJECT_ROOT" });

  const secrets = new MemorySecretProvider();
  const docker = new DockerRunner();
  const ports = new PortProbe();
  const graphProbe = {
    async probe() {
      return { kind: "schema-missing", readCanary: true };
    },
  };
  let generated = 0;
  const lifecycleOptions = {
    stateRoot,
    projectRouter: router,
    secretProvider: secrets,
    secretGenerator: () => (++generated === 1 ? secretA : secretB),
    processRunner: docker,
    portProbe: ports,
    graphProbe,
    restoreProbe: async () => snapshot(),
    idGenerator: () => "restore01",
    pluginRoot: path.resolve("plugins/nacl"),
  };
  const lifecycle = createLocalGraphLifecycle(lifecycleOptions);
  const scopeA = { projectId: projectA, projectRoot: projectRootA };
  const scopeB = { projectId: projectB, projectRoot: projectRootB };
  let instanceA;
  let instanceB;
  try {
    const initializedA = await lifecycle.init({ ...scopeA, httpPort: 38474, boltPort: 38687 });
    const initializedB = await lifecycle.init({ ...scopeB, httpPort: 39474, boltPort: 39687 });
    assert.equal(initializedA.status, "VERIFIED", JSON.stringify(initializedA));
    assert.equal(initializedB.status, "VERIFIED", JSON.stringify(initializedB));
    instanceA = initializedA.instance;
    instanceB = initializedB.instance;
    assert.notEqual(instanceA.containerName, instanceB.containerName);
    assert.notEqual(instanceA.volumeName, instanceB.volumeName);
    assert.notEqual(instanceA.composeProject, instanceB.composeProject);
    assert.notEqual(instanceA.endpoint.httpPort, instanceB.endpoint.httpPort);
    assert.deepEqual(projectDockerNames(projectA), {
      composeProject: instanceA.composeProject,
      containerName: instanceA.containerName,
      volumeName: instanceA.volumeName,
    });

    assert.equal((await lifecycle.start(scopeA)).code, "SCHEMA_MISSING");
    assert.equal((await lifecycle.start(scopeB)).code, "SCHEMA_MISSING");
    assert.equal(docker.states.get(instanceA.containerName).running, true);
    assert.equal(docker.states.get(instanceB.containerName).running, true);

    const transports = new Map([
      [projectA, new TenantTransport(projectA)],
      [projectB, new TenantTransport(projectB)],
    ]);
    const profiles = new Map([
      [projectA, {
        projectId: projectA,
        projectRoot: projectRootA,
        endpoint: instanceA.endpoint.httpUrl,
        database: "neo4j",
        username: "neo4j",
        secretReference: instanceA.secretReference,
        auditPath: initializedA.auditPath,
        lifecycleStatus: "VERIFIED",
        lifecycleCode: "HEALTHY",
        capabilities: ["read", "write", "schema-admin"],
      }],
      [projectB, {
        projectId: projectB,
        projectRoot: projectRootB,
        endpoint: instanceB.endpoint.httpUrl,
        database: "neo4j",
        username: "neo4j",
        secretReference: instanceB.secretReference,
        auditPath: initializedB.auditPath,
        lifecycleStatus: "VERIFIED",
        lifecycleCode: "HEALTHY",
        capabilities: ["read", "write", "schema-admin"],
      }],
    ]);
    const gateway = createGraphGateway({
      migrations: await loadMigrationCatalog(),
      queries: await loadQueryCatalog(),
      resolveProject: async ({ projectId, projectRoot }) => {
        const profile = profiles.get(projectId);
        if (!profile || profile.projectRoot !== projectRoot) throw new Error("forged route");
        return profile;
      },
      resolveSecret: (reference) => secrets.get(reference),
      createTransport: (profile) => transports.get(profile.projectId),
      createAuditSink: () => ({ append: async () => {} }),
      resolvePrincipal: async () => ({
        principal_id: gatewayIdentity.principal_id,
        assurance: "trusted-test-harness",
      }),
    });
    const migrateA = await gateway.callTool("nacl_graph_apply_migrations", {
      project_id: projectA,
      project_root: projectRootA,
      ...gatewayIdentity,
      worker_id: gatewayWorkerId,
      fencing_token: 1,
      idempotency_key: "wave4-migration-a",
      approval: "CONFIRM_SCHEMA_ADMIN",
      confirmation: "APPLY_MIGRATIONS",
    });
    assert.equal(migrateA.status, "VERIFIED", JSON.stringify(migrateA));
    assert.equal(transports.get(projectA).ledger.size, EXPECTED_GATEWAY_SCHEMA.version);
    assert.equal(transports.get(projectB).ledger.size, 0, "A migration must not mutate B");
    const migrateB = await gateway.callTool("nacl_graph_apply_migrations", {
      project_id: projectB,
      project_root: projectRootB,
      ...gatewayIdentity,
      worker_id: gatewayWorkerId,
      fencing_token: 1,
      idempotency_key: "wave4-migration-b",
      approval: "CONFIRM_SCHEMA_ADMIN",
      confirmation: "APPLY_MIGRATIONS",
    });
    assert.equal(migrateB.status, "VERIFIED", JSON.stringify(migrateB));

    for (const transport of transports.values()) {
      for (const id of ["UC-001", "MOD-001", "Task"]) transport.domainIds.add(id);
    }
    transports.get(projectB).domainIds.add("B-ONLY");
    assert.deepEqual([...transports.get(projectA).domainIds].sort(), ["MOD-001", "Task", "UC-001"]);
    assert.equal(transports.get(projectA).domainIds.has("B-ONLY"), false);

    assert.equal((await lifecycle.stop(scopeA)).status, "VERIFIED");
    assert.equal(docker.states.get(instanceA.containerName).running, false);
    assert.equal(docker.states.get(instanceB.containerName).running, true, "stopping A must not stop B");
    const backupRoot = path.join(root, "backups");
    await mkdir(backupRoot);
    const backedUp = await lifecycle.backup({ ...scopeA, backupDir: backupRoot, snapshot: snapshot() });
    assert.equal(backedUp.status, "VERIFIED", JSON.stringify(backedUp));
    const restored = await lifecycle.restoreVerify({
      ...scopeA,
      manifestPath: backedUp.backup.manifestPath,
      httpPort: 40474,
      boltPort: 40687,
    });
    assert.equal(restored.status, "VERIFIED", JSON.stringify(restored));
    assert.equal(restored.originalUntouched, true);
    assert.equal(docker.states.get(instanceB.containerName).running, true, "A restore must not affect B");

    const replacement = createLocalGraphLifecycle({ ...lifecycleOptions, pluginRoot: path.join(root, "replacement-cache") });
    assert.equal((await replacement.resolve(scopeA)).status, "VERIFIED");
    assert.equal((await replacement.resolve(scopeB)).status, "VERIFIED");
    assert.equal(docker.volumes.has(instanceA.volumeName), true);
    assert.equal(docker.volumes.has(instanceB.volumeName), true);

    const bResourceMentions = docker.calls.filter((call) =>
      call.args.some((value) => value === instanceB.containerName || value === instanceB.volumeName),
    );
    assert.equal(
      bResourceMentions.some((call) => call.args.includes("rm") || call.args.includes("dump") || call.args.includes("load")),
      false,
      "A recovery path must not remove/dump/load B resources",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
