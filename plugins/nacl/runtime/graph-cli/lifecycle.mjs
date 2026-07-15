import { createHash, randomUUID } from "node:crypto";
import { appendFile, chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BACKUP_CONTRACT,
  COMPOSE_CONTRACT,
  EXPECTED_GATEWAY_SCHEMA,
  INSTANCE_STATE_CONTRACT,
  NEO4J_IMAGE,
  LifecycleError,
  assertProjectId,
  endpoint,
  keychainReference,
  lifecycleResult,
  migrationHandoff,
  projectDockerNames,
  publicInstance,
} from "./contracts.mjs";
import {
  sha256File,
  snapshotsEqual,
  validateBackupManifest,
  validateSnapshot,
} from "./backup-contract.mjs";
import { Neo4jHttpProbe } from "./graph-probe.mjs";
import { DEFAULT_STATE_ROOT, createInstanceStore } from "./instance-store.mjs";
import { allocateLoopbackPorts, NodePortProbe } from "./ports.mjs";
import { createProcessRunner } from "./process-runner.mjs";
import { createProjectRouter } from "./project-registry.mjs";
import { generateGraphSecret, MacOsKeychainSecretProvider } from "./secret-provider.mjs";
import { createGraphRestoreProbe } from "./verification-snapshot.mjs";

export {
  BACKUP_CONTRACT,
  COMPOSE_CONTRACT,
  EXPECTED_GATEWAY_SCHEMA,
  INSTANCE_STATE_CONTRACT,
  LIFECYCLE_CONTRACT,
  NEO4J_IMAGE,
} from "./contracts.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultPluginRoot = path.resolve(moduleDirectory, "../..");
const OWNED_RESTORE_CONTAINER = /^nacl-restore-[a-f0-9]{12}-[a-z0-9]{8}$/;
const OWNED_RESTORE_VOLUME = /^nacl_restore_[a-f0-9]{12}_[a-z0-9]{8}$/;

function dockerEnvironment(extra = {}) {
  const inherited = {};
  for (const name of ["PATH", "HOME", "DOCKER_HOST", "DOCKER_CONTEXT", "TMPDIR"]) {
    if (process.env[name] !== undefined) inherited[name] = process.env[name];
  }
  return { ...inherited, ...extra };
}

function compactId(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8).padEnd(8, "0");
}

function instanceWithAudit(instance, instanceStore) {
  return {
    projectId: instance.projectId,
    ...(instance.projectRoot ? { projectRoot: instance.projectRoot } : {}),
    instance: publicInstance(instance),
    auditPath: instanceStore.auditPath(instance.projectId),
  };
}

function secretRecoveryHandoff(instance) {
  return {
    action: "graph_secret_recover",
    secretReference: instance.secretReference,
    automaticRotation: false,
  };
}

function normalizeFailure(operation, projectId, error, instanceStore, instance = null, scopedRoot = null) {
  const lifecycleError =
    error instanceof LifecycleError
      ? error
      : new LifecycleError("LIFECYCLE_INTERNAL_ERROR", "The lifecycle operation failed.");
  let scoped = {};
  try {
    if (instance) {
      scoped = instanceWithAudit(instance, instanceStore);
    } else if (scopedRoot) {
      assertProjectId(projectId);
      scoped = {
        projectId,
        projectRoot: scopedRoot,
        auditPath: instanceStore.auditPath(projectId),
      };
    }
  } catch {
    scoped = {};
  }
  return lifecycleResult(operation, lifecycleError.status, lifecycleError.code, {
    ...scoped,
    ...(instance && ["SECRET_MISSING", "SECRET_REVOKED"].includes(lifecycleError.code)
      ? { handoff: secretRecoveryHandoff(instance) }
      : {}),
    ...(Object.keys(lifecycleError.details).length > 0 ? { details: lifecycleError.details } : {}),
  });
}

export async function resolveInstanceState({ instanceStore, projectId }) {
  assertProjectId(projectId);
  const instance = await instanceStore.resolve(projectId);
  if (!instance) {
    throw new LifecycleError(
      "INSTANCE_NOT_INITIALIZED",
      "Initialize the project local graph before using it.",
      { status: "BLOCKED" },
    );
  }
  return instance;
}

export function createLocalGraphLifecycle(options = {}) {
  const stateRoot = path.resolve(options.stateRoot ?? options.instanceStore?.stateRoot ?? DEFAULT_STATE_ROOT);
  const instanceStore = options.instanceStore ?? createInstanceStore({ stateRoot });
  const processRunner = options.processRunner ?? createProcessRunner();
  const secretProvider = options.secretProvider ?? new MacOsKeychainSecretProvider();
  const portProbe = options.portProbe ?? new NodePortProbe();
  const graphProbe = options.graphProbe ?? new Neo4jHttpProbe();
  const restoreProbe = options.restoreProbe ?? createGraphRestoreProbe();
  const pluginRoot = path.resolve(options.pluginRoot ?? defaultPluginRoot);
  const composePath = path.join(pluginRoot, "graph", "compose", "local-neo4j.compose.yml");
  const clock = options.clock ?? (() => new Date());
  const idGenerator = options.idGenerator ?? randomUUID;
  const secretGenerator = options.secretGenerator ?? generateGraphSecret;
  const auditAppender = options.auditAppender ?? appendAuditRecord;
  const projectRouter = options.projectRouter ?? createProjectRouter({
    registryRoot: options.projectRegistryRoot ?? path.join(stateRoot, ".project-registry"),
    ...(options.projectRouterOptions ?? {}),
  });

  async function resolveScopedInstance({ projectId, projectRoot }) {
    const resolved = await projectRouter.resolveRegistered({ projectId, projectRoot });
    const instance = await resolveInstanceState({ instanceStore, projectId });
    return { ...instance, projectRoot: resolved.canonicalRoot };
  }

  async function recordHealth(result, projectRoot) {
    await projectRouter.updateHealth({
      projectId: result.projectId,
      projectRoot,
      status: result.status,
      code: result.code,
    });
    return result;
  }

  async function appendAuditRecord(result, phase = "completion") {
    const auditPath = instanceStore.auditPath(result.projectId);
    await mkdir(path.dirname(auditPath), { recursive: true, mode: 0o700 });
    try {
      await chmod(auditPath, 0o600);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await appendFile(
      auditPath,
      `${JSON.stringify({
        timestamp: clock().toISOString(),
        contract: result.contract,
        operation: result.operation,
        phase,
        status: result.status,
        code: result.code,
        projectId: result.projectId,
      })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await chmod(auditPath, 0o600);
    const metadata = await stat(auditPath);
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
      throw new Error("audit mode verification failed");
    }
  }

  async function audit(result, options = {}) {
    if (!result.projectId) return result;
    const auditPath = instanceStore.auditPath(result.projectId);
    try {
      await auditAppender(result, options.phase ?? "completion");
      return result;
    } catch {
      const effectOccurred = options.effectOccurred === true;
      return lifecycleResult(
        result.operation,
        effectOccurred ? "PARTIALLY_VERIFIED" : "FAILED",
        effectOccurred ? "AUDIT_COMPLETION_FAILED" : "AUDIT_UNAVAILABLE",
        {
        projectId: result.projectId,
        auditPath,
        effect: result.code,
          ...(effectOccurred
            ? {
                recovery: {
                  action: "graph_init_reconcile",
                  automaticRetry: false,
                },
              }
            : {}),
        },
      );
    }
  }

  async function requireAuditAttempt(projectId, operation) {
    const attempt = lifecycleResult(operation, "BLOCKED", "OPERATION_ATTEMPT", {
      projectId,
      auditPath: instanceStore.auditPath(projectId),
    });
    await auditAppender(attempt, "attempt");
  }

  async function beginScopedAudit({ projectId, projectRoot, operation }) {
    try {
      await requireAuditAttempt(projectId, operation);
      return null;
    } catch {
      return lifecycleResult(operation, "FAILED", "AUDIT_UNAVAILABLE", {
        projectId,
        projectRoot,
        auditPath: instanceStore.auditPath(projectId),
      });
    }
  }

  async function dockerPreflight() {
    const result = await processRunner.run({
      command: "docker",
      args: ["version", "--format", "{{.Server.Version}}"],
      env: dockerEnvironment(),
    });
    if (result.errorCode === "ENOENT") {
      throw new LifecycleError("DOCKER_UNAVAILABLE", "Docker is not installed or not on PATH.", {
        status: "BLOCKED",
      });
    }
    if (result.status !== 0) {
      throw new LifecycleError("DOCKER_STOPPED", "The Docker daemon is unavailable.", {
        status: "BLOCKED",
      });
    }
  }

  async function containerState(containerName) {
    const result = await processRunner.run({
      command: "docker",
      args: ["container", "inspect", "--format", "{{json .State}}", containerName],
      env: dockerEnvironment(),
    });
    if (result.status !== 0) return null;
    try {
      const state = JSON.parse(result.stdout);
      if (
        typeof state.Running !== "boolean" ||
        typeof state.Status !== "string" ||
        !Number.isInteger(state.ExitCode) ||
        typeof state.OOMKilled !== "boolean"
      ) {
        throw new Error("invalid state");
      }
      return {
        running: state.Running,
        status: state.Status,
        exitCode: state.ExitCode,
        oomKilled: state.OOMKilled,
      };
    } catch {
      throw new LifecycleError("CONTAINER_STATE_INVALID", "Docker returned an invalid container state.");
    }
  }

  async function containerRunning(containerName) {
    return (await containerState(containerName))?.running === true;
  }

  function cleanExit(state) {
    return (
      state?.running === false &&
      state.status === "exited" &&
      state.exitCode === 0 &&
      state.oomKilled === false
    );
  }

  async function containerExists(containerName) {
    const result = await processRunner.run({
      command: "docker",
      args: ["container", "inspect", containerName],
      env: dockerEnvironment(),
    });
    return result.status === 0;
  }

  async function volumeExists(volumeName) {
    const result = await processRunner.run({
      command: "docker",
      args: ["volume", "inspect", volumeName],
      env: dockerEnvironment(),
    });
    return result.status === 0;
  }

  async function derivedResourcePreflight(names) {
    const checks = [
      {
        kind: "container",
        args: [
          "container",
          "ls",
          "--all",
          "--filter",
          `name=^/${names.containerName}$`,
          "--format",
          "{{.Names}}",
        ],
        expected: names.containerName,
      },
      {
        kind: "volume",
        args: ["volume", "ls", "--filter", `name=^${names.volumeName}$`, "--format", "{{.Name}}"],
        expected: names.volumeName,
      },
      {
        kind: "network",
        args: [
          "network",
          "ls",
          "--filter",
          `name=^${names.composeProject}_default$`,
          "--format",
          "{{.Name}}",
        ],
        expected: `${names.composeProject}_default`,
      },
    ];
    const existing = [];
    for (const check of checks) {
      const result = await processRunner.run({
        command: "docker",
        args: check.args,
        env: dockerEnvironment(),
      });
      if (result.status !== 0) {
        throw new LifecycleError(
          "INIT_RESOURCE_PREFLIGHT_FAILED",
          "Existing local graph resources could not be checked safely.",
          { status: "BLOCKED" },
        );
      }
      if (result.stdout.split(/\r?\n/).includes(check.expected)) existing.push(check.kind);
    }
    if (existing.length > 0) {
      throw new LifecycleError(
        "INIT_ORPHANED_RESOURCES",
        "Derived graph resources exist without a valid registry record and were not changed.",
        {
          status: "BLOCKED",
          details: { resourceKinds: existing },
        },
      );
    }
  }

  async function resolveSecret(instance) {
    try {
      return await secretProvider.get(instance.secretReference);
    } catch (error) {
      if (error instanceof LifecycleError) throw error;
      throw new LifecycleError("SECRET_REVOKED", "The project secret cannot be resolved.", {
        status: "BLOCKED",
      });
    }
  }

  function probeResult(operation, instance, probe) {
    const common = instanceWithAudit(instance, instanceStore);
    switch (probe.kind) {
      case "healthy":
        return lifecycleResult(operation, "VERIFIED", "GRAPH_HEALTHY", {
          ...common,
          checks: { readCanary: true, schema: probe.schema },
        });
      case "secret-rejected":
        return lifecycleResult(operation, "FAILED", "SECRET_REJECTED", {
          ...common,
          handoff: secretRecoveryHandoff(instance),
        });
      case "schema-missing":
        return lifecycleResult(operation, "BLOCKED", "SCHEMA_MISSING", {
          ...common,
          checks: { readCanary: probe.readCanary === true },
          handoff: migrationHandoff(instance),
        });
      case "schema-stale":
        return lifecycleResult(operation, "BLOCKED", "SCHEMA_STALE", {
          ...common,
          checks: { readCanary: probe.readCanary === true, schema: probe.schema },
          handoff: migrationHandoff(instance),
        });
      case "schema-checksum-mismatch":
        return lifecycleResult(operation, "FAILED", "SCHEMA_CHECKSUM_MISMATCH", {
          ...common,
          checks: { readCanary: probe.readCanary === true, schema: probe.schema },
          handoff: migrationHandoff(instance),
        });
      case "schema-incompatible":
        return lifecycleResult(operation, "FAILED", "SCHEMA_INCOMPATIBLE", {
          ...common,
          checks: { readCanary: probe.readCanary === true, schema: probe.schema },
        });
      case "read-canary-failed":
      case "query-failed":
        return lifecycleResult(operation, "FAILED", "READ_CANARY_FAILED", common);
      default:
        return lifecycleResult(operation, "BLOCKED", "GRAPH_UNAVAILABLE", common);
    }
  }

  async function resolve({ projectId, projectRoot }) {
    let instance;
    try {
      instance = await resolveScopedInstance({ projectId, projectRoot });
      const attemptFailure = await beginScopedAudit({
        projectId,
        projectRoot: instance.projectRoot,
        operation: "resolve",
      });
      if (attemptFailure) return attemptFailure;
      return audit(lifecycleResult("resolve", "VERIFIED", "INSTANCE_RESOLVED", {
        ...instanceWithAudit(instance, instanceStore),
      }));
    } catch (error) {
      const result = normalizeFailure("resolve", projectId, error, instanceStore, instance);
      return instance ? audit(result) : result;
    }
  }

  async function recordSchema({ projectId, projectRoot, schema } = {}) {
    let instance;
    let instanceUpdated = false;
    try {
      instance = await resolveScopedInstance({ projectId, projectRoot });
      const attemptFailure = await beginScopedAudit({
        projectId,
        projectRoot: instance.projectRoot,
        operation: "record-schema",
      });
      if (attemptFailure) return attemptFailure;
      if (
        schema?.component !== EXPECTED_GATEWAY_SCHEMA.component ||
        schema?.version !== EXPECTED_GATEWAY_SCHEMA.version ||
        schema?.checksum !== EXPECTED_GATEWAY_SCHEMA.checksum
      ) {
        throw new LifecycleError("SCHEMA_METADATA_INVALID", "The verified graph schema descriptor is invalid.");
      }
      const updated = await instanceStore.updateSchema(projectId, schema);
      instanceUpdated = true;
      await projectRouter.updateSchemaVersion({
        projectId,
        projectRoot: instance.projectRoot,
        schemaVersion: schema.version,
      });
      return audit(lifecycleResult("record-schema", "VERIFIED", "SCHEMA_METADATA_RECORDED", {
        projectId,
        projectRoot: instance.projectRoot,
        ...instanceWithAudit(updated, instanceStore),
      }), { effectOccurred: true });
    } catch (error) {
      if (instanceUpdated) {
        return audit(lifecycleResult("record-schema", "PARTIALLY_VERIFIED", "SCHEMA_METADATA_PARTIAL", {
          projectId,
          projectRoot: instance?.projectRoot,
          auditPath: instanceStore.auditPath(projectId),
          recovery: { action: "graph_apply_migrations", automaticRetry: false },
        }), { effectOccurred: true });
      }
      const result = normalizeFailure("record-schema", projectId, error, instanceStore, instance);
      return instance ? audit(result) : result;
    }
  }

  async function init({ projectId, projectRoot, httpPort, boltPort, secretReference } = {}) {
    let secretCreated = false;
    let instanceCreated = false;
    let instance;
    let validatedRoot;
    try {
      assertProjectId(projectId);
      const scope = await projectRouter.resolveRegistered({ projectId, projectRoot });
      const existingRecord = await instanceStore.resolve(projectId);
      validatedRoot = scope.canonicalRoot;
      instance = existingRecord ? { ...existingRecord, projectRoot: validatedRoot } : null;
      const attemptFailure = await beginScopedAudit({
        projectId,
        projectRoot: validatedRoot,
        operation: "init",
      });
      if (attemptFailure) return attemptFailure;
      if (instance) {
        await resolveSecret(instance);
        return audit(
          lifecycleResult("init", "VERIFIED", "ALREADY_INITIALIZED", {
            ...instanceWithAudit(instance, instanceStore),
            phase: "configured",
          }),
        );
      }
      const reference = secretReference ?? keychainReference(projectId);
      if (reference !== keychainReference(projectId)) {
        throw new LifecycleError(
          "SECRET_REFERENCE_INVALID",
          "The local pilot secret reference must match the project Keychain identity.",
          { status: "BLOCKED" },
        );
      }
      const secretExists = await secretProvider.exists(reference);
      await dockerPreflight();
      const names = projectDockerNames(projectId);
      await derivedResourcePreflight(names);
      if (secretExists) {
        throw new LifecycleError(
          "INIT_ORPHANED_SECRET",
          "A project secret exists without a valid registry record and was not changed.",
          {
            status: "BLOCKED",
            details: { recoveryRequired: true },
          },
        );
      }
      const instances = await instanceStore.list();
      const reservedPorts = instances.flatMap((instance) => [
        instance.endpoint.httpPort,
        instance.endpoint.boltPort,
      ]);
      const ports = await allocateLoopbackPorts({
        projectId,
        httpPort,
        boltPort,
        reservedPorts,
        portProbe,
      });
      const secret = secretGenerator();
      await secretProvider.create(reference, secret);
      secretCreated = true;
      instance = {
        contract: INSTANCE_STATE_CONTRACT,
        projectId,
        composeContract: COMPOSE_CONTRACT,
        ...names,
        image: NEO4J_IMAGE,
        endpoint: endpoint(ports.httpPort, ports.boltPort),
        secretReference: reference,
        gatewaySchema: { ...EXPECTED_GATEWAY_SCHEMA },
        createdAt: clock().toISOString(),
      };
      await instanceStore.create(instance);
      instance = { ...instance, projectRoot: scope.canonicalRoot };
      instanceCreated = true;
      return audit(
        lifecycleResult("init", "VERIFIED", "INSTANCE_INITIALIZED", {
          ...instanceWithAudit(instance, instanceStore),
          phase: "configured",
          graphVerified: false,
        }),
        { effectOccurred: true },
      );
    } catch (error) {
      if (!validatedRoot) {
        return normalizeFailure("init", projectId, error, instanceStore);
      }
      if (secretCreated || instanceCreated) {
        return audit(
          lifecycleResult("init", "PARTIALLY_VERIFIED", "INIT_OUTCOME_AMBIGUOUS", {
            projectId,
            auditPath: instanceStore.auditPath(projectId),
            phase: instanceCreated ? "registry-created" : "secret-created",
            recovery: {
              action: "graph_init_reconcile",
              automaticRetry: false,
            },
          }),
          { effectOccurred: true },
        );
      }
      return audit(normalizeFailure("init", projectId, error, instanceStore, instance, validatedRoot));
    }
  }

  async function health({ projectId, projectRoot } = {}) {
    let instance;
    try {
      instance = await resolveScopedInstance({ projectId, projectRoot });
      const attemptFailure = await beginScopedAudit({
        projectId,
        projectRoot: instance.projectRoot,
        operation: "health",
      });
      if (attemptFailure) return attemptFailure;
      await dockerPreflight();
      if (!(await containerRunning(instance.containerName))) {
        const result = lifecycleResult("health", "BLOCKED", "CONTAINER_STOPPED", {
            ...instanceWithAudit(instance, instanceStore),
        });
        await recordHealth(result, instance.projectRoot);
        return audit(result);
      }
      const secret = await resolveSecret(instance);
      const probe = await graphProbe.probe({ instance, secret });
      const result = await recordHealth(probeResult("health", instance, probe), instance.projectRoot);
      return audit(result);
    } catch (error) {
      const result = normalizeFailure("health", projectId, error, instanceStore, instance);
      if (instance?.projectRoot) {
        try {
          await recordHealth(result, instance.projectRoot);
        } catch {
          return audit(lifecycleResult("health", "FAILED", "REGISTRY_HEALTH_UPDATE_FAILED", {
            ...instanceWithAudit(instance, instanceStore),
          }));
        }
      }
      return audit(result);
    }
  }

  async function start({ projectId, projectRoot } = {}) {
    let instance;
    try {
      instance = await resolveScopedInstance({ projectId, projectRoot });
      const attemptFailure = await beginScopedAudit({
        projectId,
        projectRoot: instance.projectRoot,
        operation: "start",
      });
      if (attemptFailure) return attemptFailure;
      await dockerPreflight();
      const secret = await resolveSecret(instance);
      if (!(await containerRunning(instance.containerName))) {
        for (const [field, port] of [
          ["httpPort", instance.endpoint.httpPort],
          ["boltPort", instance.endpoint.boltPort],
        ]) {
          if (!(await portProbe.isAvailable(port))) {
            throw new LifecycleError("PORT_COLLISION", `${field} is already in use.`, {
              status: "BLOCKED",
              details: { field, port },
            });
          }
        }
        const auth = `neo4j/${secret}`;
        const result = await processRunner.run({
          command: "docker",
          args: [
            "compose",
            "--project-name",
            instance.composeProject,
            "--file",
            composePath,
            "up",
            "--detach",
          ],
          cwd: pluginRoot,
          env: dockerEnvironment({
            NACL_CONTAINER_NAME: instance.containerName,
            NACL_VOLUME_NAME: instance.volumeName,
            NACL_HTTP_PORT: String(instance.endpoint.httpPort),
            NACL_BOLT_PORT: String(instance.endpoint.boltPort),
            NACL_NEO4J_IMAGE: instance.image,
            NACL_NEO4J_AUTH: auth,
          }),
          sensitiveValues: [secret, auth],
        });
        if (result.status !== 0) {
          throw new LifecycleError("CONTAINER_START_FAILED", "Docker could not start the graph.");
        }
      }
      const probe = await graphProbe.probe({ instance, secret });
      return audit(probeResult("start", instance, probe));
    } catch (error) {
      return audit(normalizeFailure("start", projectId, error, instanceStore, instance));
    }
  }

  async function stop({ projectId, projectRoot } = {}) {
    let instance;
    try {
      instance = await resolveScopedInstance({ projectId, projectRoot });
      const attemptFailure = await beginScopedAudit({
        projectId,
        projectRoot: instance.projectRoot,
        operation: "stop",
      });
      if (attemptFailure) return attemptFailure;
      await dockerPreflight();
      const before = await containerState(instance.containerName);
      if (!before?.running) {
        if (before && !cleanExit(before)) {
          throw new LifecycleError(
            "CONTAINER_UNCLEAN_STOP",
            "The graph container did not complete a clean shutdown.",
            {
              details: {
                containerStatus: before.status,
                exitCode: before.exitCode,
                oomKilled: before.oomKilled,
              },
            },
          );
        }
        return audit(
          lifecycleResult("stop", "VERIFIED", "ALREADY_STOPPED", {
            ...instanceWithAudit(instance, instanceStore),
            dataPreserved: true,
          }),
        );
      }
      const result = await processRunner.run({
        command: "docker",
        args: ["container", "stop", "--time", "120", instance.containerName],
        env: dockerEnvironment(),
      });
      if (result.status !== 0) {
        throw new LifecycleError("CONTAINER_STOP_FAILED", "Docker could not stop the graph.");
      }
      const after = await containerState(instance.containerName);
      if (!cleanExit(after)) {
        throw new LifecycleError(
          "CONTAINER_UNCLEAN_STOP",
          "The graph container did not complete a clean shutdown.",
          {
            details: {
              containerStatus: after?.status ?? "missing",
              exitCode: after?.exitCode ?? null,
              oomKilled: after?.oomKilled ?? null,
            },
          },
        );
      }
      return audit(
        lifecycleResult("stop", "VERIFIED", "CONTAINER_STOPPED", {
          ...instanceWithAudit(instance, instanceStore),
          dataPreserved: true,
          cleanStop: true,
        }),
      );
    } catch (error) {
      return audit(normalizeFailure("stop", projectId, error, instanceStore, instance));
    }
  }

  async function doctor({ projectId, projectRoot } = {}) {
    let instance;
    try {
      instance = await resolveScopedInstance({ projectId, projectRoot });
      const attemptFailure = await beginScopedAudit({
        projectId,
        projectRoot: instance.projectRoot,
        operation: "doctor",
      });
      if (attemptFailure) return attemptFailure;
      await dockerPreflight();
      const secret = await resolveSecret(instance);
      const running = await containerRunning(instance.containerName);
      if (!running) {
        for (const [field, port] of [
          ["httpPort", instance.endpoint.httpPort],
          ["boltPort", instance.endpoint.boltPort],
        ]) {
          if (!(await portProbe.isAvailable(port))) {
            const result = lifecycleResult("doctor", "BLOCKED", "PORT_COLLISION", {
                ...instanceWithAudit(instance, instanceStore),
                details: { field, port },
            });
            await recordHealth(result, instance.projectRoot);
            return audit(result);
          }
        }
        const result = lifecycleResult("doctor", "BLOCKED", "CONTAINER_STOPPED", {
            ...instanceWithAudit(instance, instanceStore),
            checks: { registry: true, docker: true, secret: true, ports: true },
        });
        await recordHealth(result, instance.projectRoot);
        return audit(result);
      }
      const probe = await graphProbe.probe({ instance, secret });
      const result = probeResult("doctor", instance, probe);
      const diagnosed = {
        ...result,
        checks: {
          registry: true,
          docker: true,
          secret: result.code !== "SECRET_REJECTED",
          container: true,
          ...(result.checks ?? {}),
        },
      };
      await recordHealth(diagnosed, instance.projectRoot);
      return audit(diagnosed);
    } catch (error) {
      const result = normalizeFailure("doctor", projectId, error, instanceStore, instance);
      if (instance?.projectRoot) {
        try {
          await recordHealth(result, instance.projectRoot);
        } catch {
          return audit(lifecycleResult("doctor", "FAILED", "REGISTRY_HEALTH_UPDATE_FAILED", {
            ...instanceWithAudit(instance, instanceStore),
          }));
        }
      }
      return audit(result);
    }
  }

  async function backup({ projectId, projectRoot, backupDir, snapshot } = {}) {
    let instance;
    try {
      instance = await resolveScopedInstance({ projectId, projectRoot });
      const attemptFailure = await beginScopedAudit({
        projectId,
        projectRoot: instance.projectRoot,
        operation: "backup",
      });
      if (attemptFailure) return attemptFailure;
      validateSnapshot(snapshot);
      await dockerPreflight();
      const state = await containerState(instance.containerName);
      if (state?.running) {
        throw new LifecycleError(
          "BACKUP_REQUIRES_STOP",
          "Neo4j Community offline dump requires an explicit stop first.",
          { status: "BLOCKED" },
        );
      }
      if (!cleanExit(state)) {
        throw new LifecycleError(
          "BACKUP_REQUIRES_CLEAN_STOP",
          "Backup requires inspected status=exited and exitCode=0 from the project container.",
          {
            status: "BLOCKED",
            details: {
              containerStatus: state?.status ?? "missing",
              exitCode: state?.exitCode ?? null,
              oomKilled: state?.oomKilled ?? null,
            },
          },
        );
      }
      if (!(await volumeExists(instance.volumeName))) {
        throw new LifecycleError("VOLUME_MISSING", "The project graph volume does not exist.", {
          status: "BLOCKED",
        });
      }
      if (typeof backupDir !== "string" || backupDir.length === 0) {
        throw new LifecycleError("BACKUP_PATH_INVALID", "backupDir is required.");
      }
      const externalRoot = path.resolve(backupDir);
      if (externalRoot === pluginRoot || externalRoot.startsWith(`${pluginRoot}${path.sep}`)) {
        throw new LifecycleError(
          "BACKUP_PATH_INVALID",
          "Backups must be stored outside the replaceable plugin cache.",
        );
      }
      const backupId = `${createHash("sha256").update(projectId).digest("hex").slice(0, 12)}-${compactId(idGenerator())}`;
      const directory = path.join(externalRoot, backupId);
      await mkdir(directory, { recursive: false, mode: 0o700 });
      const dumpFile = path.join(directory, "neo4j.dump");
      const result = await processRunner.run({
        command: "docker",
        args: [
          "run",
          "--rm",
          "--network",
          "none",
          "--hostname",
          "nacl-offline-admin",
          "--add-host",
          "nacl-offline-admin:127.0.0.1",
          "--user",
          "0:0",
          "--entrypoint",
          "neo4j-admin",
          "--volume",
          `${instance.volumeName}:/data`,
          "--volume",
          `${directory}:/backups`,
          instance.image,
          "database",
          "dump",
          "--verbose",
          "neo4j",
          "--to-path=/backups",
          "--overwrite-destination=true",
        ],
        env: dockerEnvironment(),
      });
      if (result.status !== 0) {
        throw new LifecycleError("BACKUP_FAILED", "The offline database dump failed.");
      }
      const dumpSha256 = await sha256File(dumpFile).catch(() => null);
      if (!dumpSha256) throw new LifecycleError("BACKUP_FAILED", "The dump artifact is missing.");
      const manifest = {
        contract: BACKUP_CONTRACT,
        backupId,
        createdAt: clock().toISOString(),
        source: publicInstance(instance),
        dumpFile,
        dumpSha256,
        snapshot,
      };
      const manifestPath = path.join(directory, "manifest.json");
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      return audit(
        lifecycleResult("backup", "VERIFIED", "BACKUP_VERIFIED", {
          ...instanceWithAudit(instance, instanceStore),
          backup: { backupId, manifestPath, dumpSha256 },
        }),
      );
    } catch (error) {
      return audit(normalizeFailure("backup", projectId, error, instanceStore, instance));
    }
  }

  async function restoreVerify({ projectId, projectRoot, manifestPath, httpPort, boltPort } = {}) {
    let source;
    let candidateContainer;
    let candidateVolume;
    let candidateCreated = false;
    let volumeCreated = false;
    let operationResult;
    try {
      source = await resolveScopedInstance({ projectId, projectRoot });
      const attemptFailure = await beginScopedAudit({
        projectId,
        projectRoot: source.projectRoot,
        operation: "restore-verify",
      });
      if (attemptFailure) return attemptFailure;
      await dockerPreflight();
      const secret = await resolveSecret(source);
      if (typeof manifestPath !== "string" || manifestPath.length === 0) {
        throw new LifecycleError("BACKUP_MANIFEST_CORRUPT", "manifestPath is required.");
      }
      let manifest;
      try {
        manifest = validateBackupManifest(JSON.parse(await readFile(path.resolve(manifestPath), "utf8")));
      } catch (error) {
        if (error instanceof LifecycleError) throw error;
        throw new LifecycleError("BACKUP_MANIFEST_CORRUPT", "The backup manifest is corrupt.");
      }
      if (manifest.source.projectId !== projectId) {
        throw new LifecycleError("BACKUP_PROJECT_MISMATCH", "The backup belongs to a different project.");
      }
      const expectedDump = path.join(path.dirname(path.resolve(manifestPath)), "neo4j.dump");
      if (path.resolve(manifest.dumpFile) !== expectedDump) {
        throw new LifecycleError("BACKUP_MANIFEST_CORRUPT", "The dump path escapes its backup directory.");
      }
      if ((await sha256File(expectedDump)) !== manifest.dumpSha256) {
        throw new LifecycleError("BACKUP_CHECKSUM_MISMATCH", "The backup dump checksum does not match.");
      }
      const instances = await instanceStore.list();
      const reservedPorts = instances.flatMap((instance) => [
        instance.endpoint.httpPort,
        instance.endpoint.boltPort,
      ]);
      const ports = await allocateLoopbackPorts({
        projectId: `${projectId}-restore`,
        httpPort,
        boltPort,
        reservedPorts,
        portProbe,
      });
      const sourceHash = createHash("sha256").update(projectId).digest("hex").slice(0, 12);
      const suffix = compactId(idGenerator());
      candidateContainer = `nacl-restore-${sourceHash}-${suffix}`;
      candidateVolume = `nacl_restore_${sourceHash}_${suffix}`;
      if (!OWNED_RESTORE_CONTAINER.test(candidateContainer) || !OWNED_RESTORE_VOLUME.test(candidateVolume)) {
        throw new LifecycleError("RESTORE_OWNERSHIP_INVALID", "Disposable restore naming failed closed.");
      }
      if ((await containerExists(candidateContainer)) || (await volumeExists(candidateVolume))) {
        throw new LifecycleError(
          "RESTORE_CANDIDATE_COLLISION",
          "The generated disposable restore target already exists.",
          { status: "BLOCKED" },
        );
      }
      let result = await processRunner.run({
        command: "docker",
        args: [
          "volume",
          "create",
          "--label",
          "com.itsalt.nacl.disposable=true",
          "--label",
          `com.itsalt.nacl.project=${projectId}`,
          candidateVolume,
        ],
        env: dockerEnvironment(),
      });
      if (result.status !== 0) throw new LifecycleError("RESTORE_PREPARE_FAILED", "Restore volume creation failed.");
      volumeCreated = true;
      result = await processRunner.run({
        command: "docker",
        args: [
          "run",
          "--rm",
          "--network",
          "none",
          "--hostname",
          "nacl-offline-admin",
          "--add-host",
          "nacl-offline-admin:127.0.0.1",
          "--user",
          "0:0",
          "--entrypoint",
          "neo4j-admin",
          "--volume",
          `${candidateVolume}:/data`,
          "--volume",
          `${path.dirname(expectedDump)}:/backups:ro`,
          source.image,
          "database",
          "load",
          "neo4j",
          "--from-path=/backups",
          "--overwrite-destination=true",
        ],
        env: dockerEnvironment(),
      });
      if (result.status !== 0) throw new LifecycleError("RESTORE_LOAD_FAILED", "Restore load failed.");
      result = await processRunner.run({
        command: "docker",
        args: [
          "run",
          "--rm",
          "--network",
          "none",
          "--user",
          "0:0",
          "--entrypoint",
          "chown",
          "--volume",
          `${candidateVolume}:/data`,
          source.image,
          "-R",
          "7474:7474",
          "/data",
        ],
        env: dockerEnvironment(),
      });
      if (result.status !== 0) {
        throw new LifecycleError("RESTORE_PREPARE_FAILED", "Restored data ownership could not be normalized.");
      }
      const auth = `neo4j/${secret}`;
      result = await processRunner.run({
        command: "docker",
        args: [
          "run",
          "--detach",
          "--name",
          candidateContainer,
          "--label",
          "com.itsalt.nacl.disposable=true",
          "--label",
          `com.itsalt.nacl.project=${projectId}`,
          "--security-opt",
          "no-new-privileges:true",
          "--cap-drop",
          "ALL",
          "--cap-add",
          "CHOWN",
          "--cap-add",
          "DAC_OVERRIDE",
          "--cap-add",
          "FOWNER",
          "--cap-add",
          "SETGID",
          "--cap-add",
          "SETUID",
          "--publish",
          `127.0.0.1:${ports.httpPort}:7474`,
          "--publish",
          `127.0.0.1:${ports.boltPort}:7687`,
          "--mount",
          `source=${candidateVolume},target=/data`,
          "--env",
          "NEO4J_AUTH",
          "--env",
          "NEO4J_PLUGINS",
          "--env",
          "NEO4J_dbms_security_procedures_allowlist",
          "--env",
          "NEO4J_dbms_security_procedures_unrestricted",
          source.image,
        ],
        env: dockerEnvironment({
          NEO4J_AUTH: auth,
          NEO4J_PLUGINS: "[]",
          NEO4J_dbms_security_procedures_allowlist: "",
          NEO4J_dbms_security_procedures_unrestricted: "",
        }),
        sensitiveValues: [secret, auth],
      });
      if (result.status !== 0) throw new LifecycleError("RESTORE_START_FAILED", "Restore candidate failed to start.");
      candidateCreated = true;
      const candidate = {
        ...source,
        composeProject: candidateContainer,
        containerName: candidateContainer,
        volumeName: candidateVolume,
        endpoint: endpoint(ports.httpPort, ports.boltPort),
      };
      const actualSnapshot = await restoreProbe({
        instance: publicInstance(candidate),
        secret,
        expectedSnapshot: manifest.snapshot,
      });
      if (!snapshotsEqual(manifest.snapshot, actualSnapshot)) {
        throw new LifecycleError("RESTORE_VERIFICATION_FAILED", "Restored graph evidence differs from backup evidence.");
      }
      operationResult = lifecycleResult("restore-verify", "VERIFIED", "RESTORE_VERIFIED", {
        ...instanceWithAudit(source, instanceStore),
        backupId: manifest.backupId,
        originalUntouched: true,
        candidate: {
          containerName: candidateContainer,
          volumeName: candidateVolume,
          endpoint: candidate.endpoint,
        },
      });
    } catch (error) {
      operationResult = normalizeFailure("restore-verify", projectId, error, instanceStore, source);
    }

    let cleanupFailed = false;
    if (candidateCreated && OWNED_RESTORE_CONTAINER.test(candidateContainer)) {
      const cleanup = await processRunner.run({
        command: "docker",
        args: ["container", "rm", "--force", candidateContainer],
        env: dockerEnvironment(),
      });
      cleanupFailed ||= cleanup.status !== 0;
    }
    if (volumeCreated && OWNED_RESTORE_VOLUME.test(candidateVolume)) {
      const cleanup = await processRunner.run({
        command: "docker",
        args: ["volume", "rm", candidateVolume],
        env: dockerEnvironment(),
      });
      cleanupFailed ||= cleanup.status !== 0;
    }
    if (cleanupFailed) {
      operationResult = lifecycleResult("restore-verify", "FAILED", "RESTORE_CLEANUP_FAILED", {
        projectId,
        auditPath: instanceStore.auditPath(projectId),
        originalUntouched: true,
        candidate: { containerName: candidateContainer, volumeName: candidateVolume },
      });
    } else if (operationResult.code === "RESTORE_VERIFIED") {
      operationResult.candidate.cleaned = true;
    }
    return audit(operationResult);
  }

  return Object.freeze({
    init,
    resolve,
    start,
    health,
    stop,
    doctor,
    backup,
    restoreVerify,
    recordSchema,
    contracts: Object.freeze({
      lifecycle: "nacl-local-graph-lifecycle-v1",
      instance: INSTANCE_STATE_CONTRACT,
      compose: COMPOSE_CONTRACT,
      gatewaySchema: EXPECTED_GATEWAY_SCHEMA,
    }),
  });
}
