import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_GATEWAY_SCHEMA,
  createLocalGraphLifecycle,
} from "../../../plugins/nacl/runtime/graph-cli/lifecycle.mjs";
import { SNAPSHOT_CONTRACT } from "../../../plugins/nacl/runtime/graph-cli/backup-contract.mjs";
import {
  keychainReference,
  projectDockerNames,
  SUPPORTED_GATEWAY_SCHEMAS,
} from "../../../plugins/nacl/runtime/graph-cli/contracts.mjs";
import {
  FileInstanceStore,
  validateInstanceState,
} from "../../../plugins/nacl/runtime/graph-cli/instance-store.mjs";
import { createProcessRunner } from "../../../plugins/nacl/runtime/graph-cli/process-runner.mjs";
import { createProjectRouter } from "../../../plugins/nacl/runtime/graph-cli/project-registry.mjs";
import {
  MacOsKeychainSecretProvider,
  MemorySecretProvider,
} from "../../../plugins/nacl/runtime/graph-cli/secret-provider.mjs";
import { createGraphRestoreProbe } from "../../../plugins/nacl/runtime/graph-cli/verification-snapshot.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pluginRoot = path.join(repoRoot, "plugins", "nacl");
const composePath = path.join(pluginRoot, "graph", "compose", "local-neo4j.compose.yml");
const secretValue = "fixture-secret-value-that-is-never-public";
const projectId = "01J-WAVE3-LIFECYCLE-FIXTURE";

function snapshot(overrides = {}) {
  return {
    contract: SNAPSHOT_CONTRACT,
    nodeCount: 7,
    relationshipCount: 4,
    labelHistogram: { Module: 2, SchemaMigration: 1, UseCase: 4 },
    relationshipTypeHistogram: { DEPENDS_ON: 4 },
    constraints: ["nacl_schema_migration_identity"],
    indexes: ["nacl_schema_migration_identity"],
    schemaMigration: {
      version: EXPECTED_GATEWAY_SCHEMA.version,
      checksum: EXPECTED_GATEWAY_SCHEMA.checksum,
    },
    representativeQueries: {
      "module-list": { rowCount: 2, digest: "a".repeat(64) },
      "use-case-list": { rowCount: 4, digest: "b".repeat(64) },
    },
    readWriteSmoke: "VERIFIED",
    ...overrides,
  };
}

class FakePortProbe {
  constructor(busy = []) {
    this.busy = new Set(busy);
  }

  async isAvailable(port) {
    return !this.busy.has(port);
  }
}

class FakeGraphProbe {
  constructor(kind = "healthy") {
    this.kind = kind;
    this.calls = [];
  }

  async probe(input) {
    this.calls.push({ projectId: input.instance.projectId, secretSeen: input.secret === secretValue });
    if (typeof this.kind === "object") return this.kind;
    return {
      kind: this.kind,
      readCanary: true,
      schema: { ...EXPECTED_GATEWAY_SCHEMA },
    };
  }
}

class FakeDockerRunner {
  constructor(options = {}) {
    this.available = options.available ?? true;
    this.daemon = options.daemon ?? true;
    this.running = new Set();
    this.states = new Map();
    this.stopExitCode = options.stopExitCode ?? 0;
    this.stopOomKilled = options.stopOomKilled ?? false;
    this.volumes = new Set();
    this.networks = new Set();
    this.calls = [];
  }

  async run(spec) {
    this.calls.push({
      command: spec.command,
      args: [...(spec.args ?? [])],
      envKeys: Object.keys(spec.env ?? {}).sort(),
      env: { ...(spec.env ?? {}) },
      sensitiveValues: [...(spec.sensitiveValues ?? [])],
    });
    const args = spec.args ?? [];
    if (args[0] === "version") {
      if (!this.available) return { status: null, errorCode: "ENOENT", stdout: "", stderr: "" };
      return this.daemon
        ? { status: 0, stdout: "29.6.1\n", stderr: "", errorCode: null }
        : { status: 1, stdout: "", stderr: "daemon stopped", errorCode: null };
    }
    if (args[0] === "container" && args[1] === "inspect") {
      const name = args.at(-1);
      const state = this.states.get(name);
      if (!state) return { status: 1, stdout: "", stderr: "not found", errorCode: null };
      return {
        status: 0,
        stdout: `${JSON.stringify({
          Status: state.status,
          Running: state.running,
          ExitCode: state.exitCode,
          OOMKilled: state.oomKilled,
        })}\n`,
        stderr: "",
        errorCode: null,
      };
    }
    if (args[0] === "container" && args[1] === "ls") {
      const expected = args[args.indexOf("--filter") + 1]?.replace(/^name=\^\//, "").replace(/\$$/, "");
      return {
        status: 0,
        stdout: this.states.has(expected) ? `${expected}\n` : "",
        stderr: "",
        errorCode: null,
      };
    }
    if (args[0] === "volume" && args[1] === "ls") {
      const expected = args[args.indexOf("--filter") + 1]?.replace(/^name=\^/, "").replace(/\$$/, "");
      return {
        status: 0,
        stdout: this.volumes.has(expected) ? `${expected}\n` : "",
        stderr: "",
        errorCode: null,
      };
    }
    if (args[0] === "network" && args[1] === "ls") {
      const expected = args[args.indexOf("--filter") + 1]?.replace(/^name=\^/, "").replace(/\$$/, "");
      return {
        status: 0,
        stdout: this.networks.has(expected) ? `${expected}\n` : "",
        stderr: "",
        errorCode: null,
      };
    }
    if (args[0] === "compose" && args.includes("up")) {
      this.running.add(spec.env.NACL_CONTAINER_NAME);
      this.states.set(spec.env.NACL_CONTAINER_NAME, {
        status: "running",
        running: true,
        exitCode: 0,
        oomKilled: false,
      });
      this.volumes.add(spec.env.NACL_VOLUME_NAME);
      this.networks.add(`${args[args.indexOf("--project-name") + 1]}_default`);
      return { status: 0, stdout: secretValue, stderr: secretValue, errorCode: null };
    }
    if (args[0] === "container" && args[1] === "stop") {
      const name = args.at(-1);
      this.running.delete(name);
      this.states.set(name, {
        status: "exited",
        running: false,
        exitCode: this.stopExitCode,
        oomKilled: this.stopOomKilled,
      });
      return { status: 0, stdout: name, stderr: "", errorCode: null };
    }
    if (args[0] === "volume" && args[1] === "create") {
      this.volumes.add(args.at(-1));
      return { status: 0, stdout: args.at(-1), stderr: "", errorCode: null };
    }
    if (args[0] === "volume" && args[1] === "inspect") {
      return this.volumes.has(args[2])
        ? { status: 0, stdout: args[2], stderr: "", errorCode: null }
        : { status: 1, stdout: "", stderr: "not found", errorCode: null };
    }
    if (args[0] === "volume" && args[1] === "rm") {
      this.volumes.delete(args[2]);
      return { status: 0, stdout: args[2], stderr: "", errorCode: null };
    }
    if (args[0] === "container" && args[1] === "rm") {
      const name = args.at(-1);
      this.running.delete(name);
      this.states.delete(name);
      return { status: 0, stdout: name, stderr: "", errorCode: null };
    }
    if (args[0] === "run" && args.includes("dump")) {
      const mount = args.find((value) => value.endsWith(":/backups"));
      await writeFile(path.join(mount.slice(0, -":/backups".length), "neo4j.dump"), "dump-fixture");
      return { status: 0, stdout: "dumped", stderr: "", errorCode: null };
    }
    if (args[0] === "run" && args.includes("load")) {
      return { status: 0, stdout: "loaded", stderr: "", errorCode: null };
    }
    if (args[0] === "run" && args.includes("chown")) {
      return { status: 0, stdout: "", stderr: "", errorCode: null };
    }
    if (args[0] === "run" && args.includes("--detach")) {
      const name = args[args.indexOf("--name") + 1];
      this.running.add(name);
      this.states.set(name, { status: "running", running: true, exitCode: 0, oomKilled: false });
      return { status: 0, stdout: name, stderr: "", errorCode: null };
    }
    return { status: 0, stdout: "", stderr: "", errorCode: null };
  }
}

async function fixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-lifecycle-"));
  const stateRoot = path.join(root, "state");
  const projectRoot = path.join(root, "project");
  await mkdir(projectRoot);
  await writeFile(path.join(projectRoot, "config.yaml"), `project:\n  id: "${projectId}"\n`);
  const projectRouter = createProjectRouter({
    registryRoot: path.join(stateRoot, ".project-registry"),
    repositoryIdentity: async () => `git-roots-sha256:${"a".repeat(64)}`,
    clock: () => new Date("2026-07-14T12:00:00.000Z"),
  });
  await projectRouter.registerRoot({
    projectId,
    projectRoot,
    confirmation: "REGISTER_PROJECT_ROOT",
  });
  const secrets = options.secrets ?? new MemorySecretProvider();
  const docker = options.docker ?? new FakeDockerRunner();
  const ports = options.ports ?? new FakePortProbe();
  const graph = options.graph ?? new FakeGraphProbe();
  const rawLifecycle = createLocalGraphLifecycle({
    stateRoot,
    projectRouter,
    secretProvider: secrets,
    processRunner: docker,
    portProbe: ports,
    graphProbe: graph,
    restoreProbe: options.restoreProbe,
    auditAppender: options.auditAppender,
    secretGenerator: () => secretValue,
    clock: () => new Date("2026-07-14T12:00:00.000Z"),
    idGenerator: () => "restore1",
    pluginRoot,
  });
  const lifecycle = Object.fromEntries(
    ["init", "resolve", "start", "health", "stop", "doctor", "backup", "restoreVerify"].map((name) => [
      name,
      (input = {}) => rawLifecycle[name]({ ...input, projectRoot: input.projectRoot ?? projectRoot }),
    ]),
  );
  return {
    root,
    stateRoot,
    projectRoot,
    projectRouter,
    rawLifecycle,
    lifecycle,
    secrets,
    docker,
    ports,
    graph,
  };
}

test("every lifecycle action requires explicit project_id plus project_root", async () => {
  const context = await fixture();
  try {
    for (const operation of ["init", "resolve", "start", "health", "stop", "doctor"]) {
      const result = await context.rawLifecycle[operation]({ projectId });
      assert.equal(result.status, "BLOCKED", `${operation}: ${JSON.stringify(result)}`);
      assert.equal(result.code, "PROJECT_ROOT_REQUIRED");
    }
    assert.equal(context.docker.calls.length, 0, "scope rejection must happen before Docker");
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("rejected lifecycle scopes never create audits, mutate project files, or call Docker", async () => {
  const context = await fixture();
  const mismatchedRoot = path.join(context.root, "project-b");
  const unregisteredRoot = path.join(context.root, "project-a-unregistered");
  await Promise.all([mkdir(mismatchedRoot), mkdir(unregisteredRoot)]);
  await Promise.all([
    writeFile(path.join(mismatchedRoot, "config.yaml"), 'project:\n  id: "01J-WAVE4-PROJECT-B"\n'),
    writeFile(path.join(unregisteredRoot, "config.yaml"), `project:\n  id: "${projectId}"\n`),
  ]);
  try {
    const initialized = await context.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
    assert.equal(initialized.status, "VERIFIED");
    context.docker.calls.length = 0;
    const auditBefore = await readFile(initialized.auditPath, "utf8");
    const instancePath = path.join(context.stateRoot, projectId, "instance.json");
    const instanceBefore = await readFile(instancePath, "utf8");
    const registryPath = context.projectRouter.store.filename(projectId);
    const registryBefore = await readFile(registryPath, "utf8");
    const entriesBefore = (await readdir(context.stateRoot, { recursive: true })).sort();
    const invalidScopes = [
      { projectRoot: undefined, code: "PROJECT_ROOT_REQUIRED" },
      { projectRoot: mismatchedRoot, code: "PROJECT_MISMATCH" },
      { projectRoot: unregisteredRoot, code: "PROJECT_ROOT_NOT_REGISTERED" },
    ];
    const operations = [
      ["init", { httpPort: 28474, boltPort: 28687 }],
      ["resolve", {}],
      ["start", {}],
      ["health", {}],
      ["stop", {}],
      ["doctor", {}],
      ["backup", { backupDir: path.join(context.root, "backups"), snapshot: snapshot() }],
      ["restoreVerify", { manifestPath: path.join(context.root, "missing-manifest.json") }],
    ];
    for (const [operation, extra] of operations) {
      for (const invalid of invalidScopes) {
        const result = await context.rawLifecycle[operation]({
          projectId,
          projectRoot: invalid.projectRoot,
          ...extra,
        });
        assert.equal(result.code, invalid.code, `${operation}: ${JSON.stringify(result)}`);
        assert.equal("auditPath" in result, false, `${operation} leaked an unvalidated audit path`);
      }
    }
    assert.equal(context.docker.calls.length, 0);
    assert.equal(await readFile(initialized.auditPath, "utf8"), auditBefore);
    assert.equal(await readFile(instancePath, "utf8"), instanceBefore);
    assert.equal(await readFile(registryPath, "utf8"), registryBefore);
    assert.deepEqual((await readdir(context.stateRoot, { recursive: true })).sort(), entriesBefore);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("instance filenames bind the requested project before lifecycle audit or process access", async () => {
  const context = await fixture();
  const foreignProject = "01J-WAVE4-PROJECT-B";
  try {
    const initialized = await context.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
    const instancePath = path.join(context.stateRoot, projectId, "instance.json");
    const valid = JSON.parse(await readFile(instancePath, "utf8"));
    const foreign = {
      ...valid,
      projectId: foreignProject,
      ...projectDockerNames(foreignProject),
      secretReference: keychainReference(foreignProject),
    };
    const foreignBytes = `${JSON.stringify(foreign, null, 2)}\n`;
    await writeFile(instancePath, foreignBytes);
    context.docker.calls.length = 0;
    const auditBefore = await readFile(initialized.auditPath, "utf8");
    const registryPath = context.projectRouter.store.filename(projectId);
    const registryBefore = await readFile(registryPath, "utf8");
    const entriesBefore = (await readdir(context.stateRoot, { recursive: true })).sort();

    await assert.rejects(
      new FileInstanceStore(context.stateRoot).resolve(projectId),
      (error) => error.code === "REGISTRY_CORRUPT" && error.status === "FAILED",
    );
    for (const [operation, extra] of [
      ["init", { httpPort: 28474, boltPort: 28687 }],
      ["resolve", {}],
      ["start", {}],
      ["health", {}],
      ["stop", {}],
      ["doctor", {}],
      ["backup", { backupDir: path.join(context.root, "backups"), snapshot: snapshot() }],
      ["restoreVerify", { manifestPath: path.join(context.root, "missing-manifest.json") }],
    ]) {
      const result = await context.rawLifecycle[operation]({
        projectId,
        projectRoot: context.projectRoot,
        ...extra,
      });
      assert.equal(result.code, "REGISTRY_CORRUPT", `${operation}: ${JSON.stringify(result)}`);
      assert.equal("auditPath" in result, false, `${operation} leaked an unvalidated audit path`);
    }
    assert.equal(context.docker.calls.length, 0);
    assert.equal(await readFile(instancePath, "utf8"), foreignBytes);
    assert.equal(await readFile(initialized.auditPath, "utf8"), auditBefore);
    assert.equal(await readFile(registryPath, "utf8"), registryBefore);
    assert.deepEqual((await readdir(context.stateRoot, { recursive: true })).sort(), entriesBefore);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("init creates a non-secret durable record and is idempotent across reinstall", async () => {
  const context = await fixture();
  try {
    const first = await context.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
    assert.equal(first.status, "VERIFIED");
    assert.equal(first.code, "INSTANCE_INITIALIZED");
    assert.equal(first.graphVerified, false);
    assert.equal(first.instance.endpoint.host, "127.0.0.1");
    assert.deepEqual(first.instance.gatewaySchema, EXPECTED_GATEWAY_SCHEMA);
    assert.match(first.auditPath, /audit\.jsonl$/);
    const recordPath = path.join(context.stateRoot, projectId, "instance.json");
    const record = await readFile(recordPath, "utf8");
    assert.equal(record.includes(secretValue), false);
    assert.equal(record.includes(pluginRoot), false);
    assert.equal((await stat(recordPath)).mode & 0o777, 0o600);

    const second = await context.lifecycle.init({ projectId, httpPort: 28888, boltPort: 29999 });
    assert.equal(second.code, "ALREADY_INITIALIZED");
    assert.deepEqual(second.instance, first.instance);

    const reinstalled = createLocalGraphLifecycle({
      stateRoot: context.stateRoot,
      projectRouter: context.projectRouter,
      secretProvider: context.secrets,
      processRunner: context.docker,
      portProbe: context.ports,
      graphProbe: context.graph,
      pluginRoot: path.join(context.root, "replacement-cache-copy"),
    });
    const resolved = await reinstalled.resolve({ projectId, projectRoot: context.projectRoot });
    assert.equal(resolved.status, "VERIFIED");
    assert.deepEqual(resolved.instance, first.instance);
    assert.equal(resolved.auditPath, first.auditPath);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("verified additive migration atomically advances legacy v1 instance and project metadata to the current schema", async () => {
  const context = await fixture();
  try {
    const initialized = await context.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
    assert.equal(initialized.status, "VERIFIED");
    const legacy = SUPPORTED_GATEWAY_SCHEMAS.find((schema) => schema.version === 1);
    assert.ok(legacy);
    const instancePath = path.join(context.stateRoot, projectId, "instance.json");
    const registryPath = context.projectRouter.store.filename(projectId);
    const instance = JSON.parse(await readFile(instancePath, "utf8"));
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    await writeFile(instancePath, `${JSON.stringify({ ...instance, gatewaySchema: legacy }, null, 2)}\n`);
    await writeFile(registryPath, `${JSON.stringify({ ...registry, schemaVersion: 1 }, null, 2)}\n`);

    const recorded = await context.rawLifecycle.recordSchema({
      projectId,
      projectRoot: context.projectRoot,
      schema: EXPECTED_GATEWAY_SCHEMA,
    });
    assert.equal(recorded.status, "VERIFIED", JSON.stringify(recorded));
    assert.equal(recorded.code, "SCHEMA_METADATA_RECORDED");
    assert.deepEqual((await new FileInstanceStore(context.stateRoot).resolve(projectId)).gatewaySchema, EXPECTED_GATEWAY_SCHEMA);
    assert.equal(
      (await context.projectRouter.resolveRegistered({ projectId, projectRoot: context.projectRoot })).record.schemaVersion,
      EXPECTED_GATEWAY_SCHEMA.version,
    );
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("init blocks orphaned secrets and derived Docker resources without overwriting either", async () => {
  const reference = keychainReference(projectId);
  const orphanSecret = new MemorySecretProvider({ [reference]: secretValue });
  const secretCase = await fixture({ secrets: orphanSecret });
  const resourceDocker = new FakeDockerRunner();
  const names = projectDockerNames(projectId);
  resourceDocker.volumes.add(names.volumeName);
  resourceDocker.networks.add(`${names.composeProject}_default`);
  const resourceCase = await fixture({ docker: resourceDocker });
  try {
    const secretResult = await secretCase.lifecycle.init({
      projectId,
      httpPort: 27474,
      boltPort: 27687,
    });
    assert.equal(secretResult.status, "BLOCKED");
    assert.equal(secretResult.code, "INIT_ORPHANED_SECRET");
    assert.equal(await orphanSecret.get(reference), secretValue);
    assert.equal(await new FileInstanceStore(secretCase.stateRoot).resolve(projectId), null);
    assert.equal(
      secretCase.docker.calls.filter((call) => call.args[1] === "ls").length,
      3,
      "secret and all derived resources must be preflighted before init blocks",
    );

    const resourceResult = await resourceCase.lifecycle.init({
      projectId,
      httpPort: 27474,
      boltPort: 27687,
    });
    assert.equal(resourceResult.status, "BLOCKED");
    assert.equal(resourceResult.code, "INIT_ORPHANED_RESOURCES");
    assert.deepEqual(resourceResult.details.resourceKinds, ["volume", "network"]);
    assert.equal(resourceCase.secrets.entries.size, 0);
    assert.ok(resourceDocker.volumes.has(names.volumeName));
    assert.ok(resourceDocker.networks.has(`${names.composeProject}_default`));
    assert.equal(await new FileInstanceStore(resourceCase.stateRoot).resolve(projectId), null);
  } finally {
    await Promise.all(
      [secretCase, resourceCase].map((context) =>
        rm(context.root, { recursive: true, force: true }),
      ),
    );
  }
});

test("init writes its attempt before side effects and reports ambiguous completion safely", async () => {
  const preflightBlocked = await fixture({
    auditAppender: async () => {
      throw new Error("audit unavailable");
    },
  });
  let auditCalls = 0;
  const completionBlocked = await fixture({
    auditAppender: async () => {
      auditCalls += 1;
      if (auditCalls > 1) throw new Error("completion unavailable");
    },
  });
  try {
    const preflight = await preflightBlocked.lifecycle.init({
      projectId,
      httpPort: 27474,
      boltPort: 27687,
    });
    assert.equal(preflight.status, "FAILED");
    assert.equal(preflight.code, "AUDIT_UNAVAILABLE");
    assert.equal(preflightBlocked.secrets.entries.size, 0);
    assert.equal(preflightBlocked.docker.calls.length, 0);
    assert.equal(await new FileInstanceStore(preflightBlocked.stateRoot).resolve(projectId), null);

    const completion = await completionBlocked.lifecycle.init({
      projectId,
      httpPort: 27474,
      boltPort: 27687,
    });
    assert.equal(completion.status, "PARTIALLY_VERIFIED");
    assert.equal(completion.code, "AUDIT_COMPLETION_FAILED");
    assert.equal(completion.effect, "INSTANCE_INITIALIZED");
    assert.equal(completion.recovery.action, "graph_init_reconcile");
    assert.equal(completionBlocked.secrets.entries.has(keychainReference(projectId)), true);
    assert.ok(await new FileInstanceStore(completionBlocked.stateRoot).resolve(projectId));
  } finally {
    await Promise.all(
      [preflightBlocked, completionBlocked].map((context) =>
        rm(context.root, { recursive: true, force: true }),
      ),
    );
  }
});

test("every audit use repairs and verifies an existing file mode to 0600", async () => {
  const context = await fixture();
  try {
    const initialized = await context.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
    await chmod(initialized.auditPath, 0o644);
    const diagnosis = await context.lifecycle.doctor({ projectId });
    assert.equal(diagnosis.status, "BLOCKED");
    assert.equal((await stat(initialized.auditPath)).mode & 0o777, 0o600);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("start uses package Compose, secret-only environment, and schema handoff", async () => {
  const graph = new FakeGraphProbe("schema-missing");
  const context = await fixture({ graph });
  try {
    await context.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
    const started = await context.lifecycle.start({ projectId });
    assert.equal(started.status, "BLOCKED");
    assert.equal(started.code, "SCHEMA_MISSING");
    assert.deepEqual(started.handoff, {
      action: "graph_apply_migrations",
      component: EXPECTED_GATEWAY_SCHEMA.component,
      requiredVersion: EXPECTED_GATEWAY_SCHEMA.version,
      requiredChecksum: EXPECTED_GATEWAY_SCHEMA.checksum,
    });
    const compose = context.docker.calls.find((call) => call.args[0] === "compose");
    assert.ok(compose.args.includes(composePath));
    assert.equal(compose.args.join(" ").includes(secretValue), false);
    assert.equal(compose.env.NACL_NEO4J_AUTH, `neo4j/${secretValue}`);
    assert.equal(JSON.stringify(started).includes(secretValue), false);

    graph.kind = "schema-stale";
    const stale = await context.lifecycle.health({ projectId });
    assert.equal(stale.status, "BLOCKED");
    assert.equal(stale.code, "SCHEMA_STALE");
    graph.kind = "healthy";
    const healthy = await context.lifecycle.health({ projectId });
    assert.equal(healthy.status, "VERIFIED");
    assert.equal(healthy.checks.readCanary, true);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("stop is idempotent and never removes the persistent volume", async () => {
  const context = await fixture();
  try {
    const initialized = await context.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
    await context.lifecycle.start({ projectId });
    const stopped = await context.lifecycle.stop({ projectId });
    assert.equal(stopped.status, "VERIFIED");
    assert.equal(stopped.dataPreserved, true);
    assert.equal(stopped.cleanStop, true);
    assert.ok(
      context.docker.calls.some(
        (call) =>
          call.command === "docker" &&
          JSON.stringify(call.args) ===
            JSON.stringify([
              "container",
              "stop",
              "--time",
              "120",
              initialized.instance.containerName,
            ]),
      ),
    );
    const repeated = await context.lifecycle.stop({ projectId });
    assert.equal(repeated.code, "ALREADY_STOPPED");
    assert.ok(context.docker.volumes.has(initialized.instance.volumeName));
    const argv = context.docker.calls.map((call) => call.args.join(" ")).join("\n");
    assert.doesNotMatch(argv, /compose .*down|down -v|volume rm/);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("stop and backup fail closed when Docker reports an unclean exit", async () => {
  const context = await fixture({ docker: new FakeDockerRunner({ stopExitCode: 137 }) });
  try {
    await context.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
    await context.lifecycle.start({ projectId });
    const stopped = await context.lifecycle.stop({ projectId });
    assert.equal(stopped.status, "FAILED");
    assert.equal(stopped.code, "CONTAINER_UNCLEAN_STOP");
    assert.equal(stopped.details.containerStatus, "exited");
    assert.equal(stopped.details.exitCode, 137);
    assert.equal(stopped.details.oomKilled, false);

    const backupRoot = path.join(context.root, "backups");
    await mkdir(backupRoot);
    const backup = await context.lifecycle.backup({
      projectId,
      backupDir: backupRoot,
      snapshot: snapshot(),
    });
    assert.equal(backup.status, "BLOCKED");
    assert.equal(backup.code, "BACKUP_REQUIRES_CLEAN_STOP");
    assert.equal(backup.details.containerStatus, "exited");
    assert.equal(backup.details.exitCode, 137);
    assert.equal(backup.details.oomKilled, false);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("stop fails closed when Docker reports an OOM kill with exit code zero", async () => {
  const context = await fixture({
    docker: new FakeDockerRunner({ stopExitCode: 0, stopOomKilled: true }),
  });
  try {
    await context.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
    await context.lifecycle.start({ projectId });
    const stopped = await context.lifecycle.stop({ projectId });
    assert.equal(stopped.status, "FAILED");
    assert.equal(stopped.code, "CONTAINER_UNCLEAN_STOP");
    assert.equal(stopped.details.exitCode, 0);
    assert.equal(stopped.details.oomKilled, true);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("failure injection is explicit for Docker, ports, secrets, auth, and corrupt registry", async () => {
  const unavailable = await fixture({ docker: new FakeDockerRunner({ available: false }) });
  const stopped = await fixture({ docker: new FakeDockerRunner({ daemon: false }) });
  const collision = await fixture({ ports: new FakePortProbe([27474]) });
  try {
    const unavailableResult = await unavailable.lifecycle.init({
      projectId,
      httpPort: 27474,
      boltPort: 27687,
    });
    assert.equal(unavailableResult.code, "DOCKER_UNAVAILABLE");
    assert.equal(unavailable.secrets.entries.size, 0);

    assert.equal(
      (await stopped.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 })).code,
      "DOCKER_STOPPED",
    );
    assert.equal(stopped.secrets.entries.size, 0);

    const portResult = await collision.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
    assert.equal(portResult.code, "PORT_COLLISION");

    const secrets = new MemorySecretProvider();
    const secretCase = await fixture({ secrets });
    try {
      await secretCase.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
      secrets.revoke(`keychain:com.itsalt.nacl.local-graph/${projectId}`);
      assert.equal((await secretCase.lifecycle.doctor({ projectId })).code, "SECRET_REVOKED");
    } finally {
      await rm(secretCase.root, { recursive: true, force: true });
    }

    const missingSecrets = new MemorySecretProvider();
    const missingCase = await fixture({ secrets: missingSecrets });
    try {
      await missingCase.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
      missingSecrets.entries.delete(`keychain:com.itsalt.nacl.local-graph/${projectId}`);
      const missing = await missingCase.lifecycle.doctor({ projectId });
      assert.equal(missing.code, "SECRET_MISSING");
      assert.equal(missing.instance.projectId, projectId);
    } finally {
      await rm(missingCase.root, { recursive: true, force: true });
    }

    const rejected = await fixture({ graph: new FakeGraphProbe("secret-rejected") });
    try {
      await rejected.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
      await rejected.lifecycle.start({ projectId });
      assert.equal((await rejected.lifecycle.health({ projectId })).code, "SECRET_REJECTED");
    } finally {
      await rm(rejected.root, { recursive: true, force: true });
    }

    const corrupt = await fixture();
    try {
      await mkdir(path.join(corrupt.stateRoot, projectId), { recursive: true });
      await writeFile(path.join(corrupt.stateRoot, projectId, "instance.json"), "{not-json");
      const diagnosis = await corrupt.lifecycle.doctor({ projectId });
      assert.equal(diagnosis.status, "FAILED");
      assert.equal(diagnosis.code, "REGISTRY_CORRUPT");
    } finally {
      await rm(corrupt.root, { recursive: true, force: true });
    }
  } finally {
    await Promise.all(
      [unavailable, stopped, collision].map((context) =>
        rm(context.root, { recursive: true, force: true }),
      ),
    );
  }
});

test("forged registry ownership is rejected before any Docker process call", async () => {
  const context = await fixture();
  try {
    const initialized = await context.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
    const recordPath = path.join(context.stateRoot, projectId, "instance.json");
    const valid = JSON.parse(await readFile(recordPath, "utf8"));
    for (const mutation of [
      { composeProject: "nacl-g-attacker" },
      { containerName: "nacl-graph-attacker" },
      { volumeName: "nacl_graph_attacker" },
      { secretReference: "keychain:com.itsalt.nacl.local-graph/other-project" },
    ]) {
      assert.throws(
        () => validateInstanceState({ ...valid, ...mutation }),
        (error) => error.code === "REGISTRY_CORRUPT",
      );
    }

    await writeFile(
      recordPath,
      `${JSON.stringify({ ...valid, containerName: "nacl-graph-attacker" }, null, 2)}\n`,
    );
    context.docker.calls.length = 0;
    const results = [
      await context.lifecycle.start({ projectId }),
      await context.lifecycle.stop({ projectId }),
      await context.lifecycle.backup({
        projectId,
        backupDir: path.join(context.root, "backups"),
        snapshot: snapshot(),
      }),
    ];
    assert.ok(results.every((result) => result.status === "FAILED"));
    assert.ok(results.every((result) => result.code === "REGISTRY_CORRUPT"));
    assert.equal(context.docker.calls.length, 0);
    assert.equal(initialized.instance.containerName, projectDockerNames(projectId).containerName);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("backup and restore verification preserve the original and clean only owned candidates", async () => {
  const expected = snapshot();
  const context = await fixture({ restoreProbe: async () => expected });
  try {
    const initialized = await context.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
    await context.lifecycle.start({ projectId });
    await context.lifecycle.stop({ projectId });
    const backupRoot = path.join(context.root, "backups");
    await mkdir(backupRoot);
    const backup = await context.lifecycle.backup({ projectId, backupDir: backupRoot, snapshot: expected });
    assert.equal(backup.status, "VERIFIED");
    assert.equal(backup.code, "BACKUP_VERIFIED");
    const manifest = JSON.parse(await readFile(backup.backup.manifestPath, "utf8"));
    assert.equal(JSON.stringify(manifest).includes(secretValue), false);

    const restored = await context.lifecycle.restoreVerify({
      projectId,
      manifestPath: backup.backup.manifestPath,
      httpPort: 28474,
      boltPort: 28687,
    });
    assert.equal(restored.status, "VERIFIED");
    assert.equal(restored.originalUntouched, true);
    assert.equal(restored.candidate.cleaned, true);
    assert.ok(context.docker.volumes.has(initialized.instance.volumeName));
    assert.equal(context.docker.running.has(initialized.instance.containerName), false);
    const removals = context.docker.calls.filter(
      (call) =>
        (call.args[0] === "container" && call.args[1] === "rm") ||
        (call.args[0] === "volume" && call.args[1] === "rm"),
    );
    assert.equal(removals.length, 2);
    assert.ok(removals.every((call) => !call.args.includes(initialized.instance.containerName)));
    assert.ok(removals.every((call) => !call.args.includes(initialized.instance.volumeName)));
    assert.ok(context.docker.calls.every((call) => !call.args.join("\n").includes(secretValue)));
    const audit = await readFile(backup.auditPath, "utf8");
    assert.equal(audit.includes(secretValue), false);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("restore mismatch fails closed and still cleans the disposable candidate", async () => {
  const expected = snapshot();
  const actual = snapshot({ nodeCount: 8 });
  const context = await fixture({ restoreProbe: async () => actual });
  try {
    await context.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
    await context.lifecycle.start({ projectId });
    await context.lifecycle.stop({ projectId });
    const backupRoot = path.join(context.root, "backups");
    await mkdir(backupRoot);
    const backup = await context.lifecycle.backup({ projectId, backupDir: backupRoot, snapshot: expected });
    const result = await context.lifecycle.restoreVerify({
      projectId,
      manifestPath: backup.backup.manifestPath,
      httpPort: 28474,
      boltPort: 28687,
    });
    assert.equal(result.status, "FAILED");
    assert.equal(result.code, "RESTORE_VERIFICATION_FAILED");
    assert.equal([...context.docker.running].some((name) => name.startsWith("nacl-restore-")), false);
    assert.equal([...context.docker.volumes].some((name) => name.startsWith("nacl_restore_")), false);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("restore refuses a pre-existing candidate and never cleans a resource it did not create", async () => {
  const expected = snapshot();
  const context = await fixture({ restoreProbe: async () => expected });
  try {
    await context.lifecycle.init({ projectId, httpPort: 27474, boltPort: 27687 });
    await context.lifecycle.start({ projectId });
    await context.lifecycle.stop({ projectId });
    const backupRoot = path.join(context.root, "backups");
    await mkdir(backupRoot);
    const backup = await context.lifecycle.backup({ projectId, backupDir: backupRoot, snapshot: expected });
    const sourceHash = createHash("sha256").update(projectId).digest("hex").slice(0, 12);
    const collision = `nacl_restore_${sourceHash}_restore1`;
    context.docker.volumes.add(collision);
    const result = await context.lifecycle.restoreVerify({
      projectId,
      manifestPath: backup.backup.manifestPath,
      httpPort: 28474,
      boltPort: 28687,
    });
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.code, "RESTORE_CANDIDATE_COLLISION");
    assert.ok(context.docker.volumes.has(collision));
    assert.equal(
      context.docker.calls.some(
        (call) => call.args[0] === "volume" && call.args[1] === "rm" && call.args[2] === collision,
      ),
      false,
    );
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("Keychain provider keeps the generated value off argv and marks lookup output sensitive", async () => {
  const calls = [];
  const runner = {
    async run(spec) {
      calls.push(spec);
      if (spec.args[0] === "find-generic-password") {
        return { status: 0, sensitiveStdout: `${secretValue}\n`, stdout: "", stderr: "" };
      }
      return { status: 0, sensitiveStdout: "", stdout: "", stderr: "" };
    },
  };
  const provider = new MacOsKeychainSecretProvider({ platform: "darwin", runner });
  const reference = `keychain:com.itsalt.nacl.local-graph/${projectId}`;
  assert.equal(await provider.exists(reference), true);
  await provider.create(reference, secretValue);
  assert.equal(await provider.get(reference), secretValue);
  const create = calls.find((call) => call.args[0] === "add-generic-password");
  assert.equal(create.args.join(" ").includes(secretValue), false);
  assert.equal(create.args.includes("-U"), false);
  assert.equal(create.input, `${secretValue}\n`);
  assert.equal(create.args.at(-1), "-w");
  assert.ok(calls.filter((call) => call.args[0] === "find-generic-password").every((call) => call.sensitiveOutput));
});

test("process runner rejects secret argv and redacts child output", async () => {
  const runner = createProcessRunner();
  assert.throws(
    () =>
      runner.run({
        command: process.execPath,
        args: ["-e", `process.stdout.write('${secretValue}')`],
        sensitiveValues: [secretValue],
      }),
    /sensitive value/i,
  );
  const result = await runner.run({
    command: process.execPath,
    args: ["-e", "process.stdout.write(process.env.NACL_TEST_SECRET)"],
    env: { NACL_TEST_SECRET: secretValue },
    sensitiveValues: [secretValue],
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "[REDACTED]");
});

test("static Compose and lifecycle sources enforce loopback, pinning, and non-destructive semantics", async () => {
  const compose = await readFile(composePath, "utf8");
  const lifecycle = await readFile(
    path.join(pluginRoot, "runtime", "graph-cli", "lifecycle.mjs"),
    "utf8",
  );
  assert.match(compose, /127\.0\.0\.1:\$\{NACL_HTTP_PORT/);
  assert.match(compose, /127\.0\.0\.1:\$\{NACL_BOLT_PORT/);
  assert.doesNotMatch(compose, /0\.0\.0\.0|:latest\b/);
  assert.match(compose, /NEO4J_PLUGINS: "\[\]"/);
  assert.match(compose, /cap_drop:\s*\n\s*- ALL/);
  assert.match(compose, /cap_add:[\s\S]*?\n\s*- KILL(?:\s|$)/);
  assert.match(compose, /procedures_unrestricted: ""/);
  assert.match(compose, /persistent: "true"/);
  assert.doesNotMatch(compose, new RegExp(secretValue));
  assert.doesNotMatch(lifecycle, /compose[\s\S]{0,80}"down"/);
  assert.doesNotMatch(lifecycle, /volume", "rm", instance\.volumeName/);
});

test("CLI refuses secret-bearing flags without echoing their values", async () => {
  const { spawnSync } = await import("node:child_process");
  const cli = path.join(pluginRoot, "runtime", "graph-cli", "cli.mjs");
  const result = spawnSync(
    process.execPath,
    [cli, "init", "--project-id", projectId, "--password", secretValue],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.includes(secretValue), false);
  assert.equal(JSON.parse(result.stdout).code, "CLI_ARGUMENT_INVALID");

  const invalidProject = spawnSync(
    process.execPath,
    [cli, "resolve", "--project-id", "../escape", "--state-root", os.tmpdir()],
    { encoding: "utf8" },
  );
  assert.equal(invalidProject.status, 1);
  assert.equal(JSON.parse(invalidProject.stdout).code, "PROJECT_ID_INVALID");

  const colonProject = spawnSync(
    process.execPath,
    [cli, "init", "--project-id", "project:escape", "--state-root", os.tmpdir()],
    { encoding: "utf8" },
  );
  assert.equal(colonProject.status, 1);
  assert.equal(JSON.parse(colonProject.stdout).code, "PROJECT_ID_INVALID");

  const restoreRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-cli-restore-"));
  try {
    const restore = spawnSync(
      process.execPath,
      [
        cli,
        "restore-verify",
        "--project-id",
        projectId,
        "--state-root",
        restoreRoot,
        "--manifest",
        path.join(restoreRoot, "missing-manifest.json"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(restore.status, 2);
    const result = JSON.parse(restore.stdout);
    assert.equal(result.code, "PROJECT_ROOT_REQUIRED");
    assert.notEqual(result.code, "RESTORE_PROBE_REQUIRED");
  } finally {
    await rm(restoreRoot, { recursive: true, force: true });
  }
});

test("CLI rejects raw relative project roots before project tools or lifecycle dispatch", () => {
  const cli = path.join(pluginRoot, "runtime", "graph-cli", "cli.mjs");
  const commands = [
    "project-resolve",
    "project-migrate-id",
    "project-register-root",
    "init",
    "resolve",
    "start",
    "health",
    "stop",
    "doctor",
    "backup",
    "restore-verify",
  ];
  for (const command of commands) {
    for (const relativeRoot of [".", "..", "repo"]) {
      const invoked = spawnSync(
        process.execPath,
        [cli, command, "--project-root", relativeRoot],
        { encoding: "utf8" },
      );
      assert.notEqual(invoked.status, 0, `${command} accepted ${relativeRoot}`);
      assert.equal(invoked.stderr, "");
      assert.equal(JSON.parse(invoked.stdout).code, "PROJECT_ROOT_INVALID");
    }
  }
});

test("package-local restore probe reports a specific runtime prerequisite failure", async () => {
  const probe = createGraphRestoreProbe({ fetch: false });
  await assert.rejects(
    () =>
      probe({
        instance: {
          projectId,
          endpoint: { httpUrl: "http://127.0.0.1:27474" },
          gatewaySchema: EXPECTED_GATEWAY_SCHEMA,
        },
        secret: secretValue,
        expectedSnapshot: snapshot(),
      }),
    (error) => error.code === "RESTORE_RUNTIME_UNSUPPORTED" && error.status === "BLOCKED",
  );
});

test("record mode and store validation fail closed after permission-safe creation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-instance-store-"));
  try {
    await chmod(root, 0o700);
    const store = new FileInstanceStore(root);
    assert.equal(await store.resolve(projectId), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
