import { chmod, link, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  COMPOSE_CONTRACT,
  EXPECTED_GATEWAY_SCHEMA,
  INSTANCE_STATE_CONTRACT,
  LOOPBACK_HOST,
  NEO4J_IMAGE,
  SUPPORTED_GATEWAY_SCHEMAS,
  LifecycleError,
  assertProjectId,
  assertPort,
  keychainReference,
  projectDockerNames,
} from "./contracts.mjs";
import { parseSecretReference } from "./secret-provider.mjs";

export const DEFAULT_STATE_ROOT = path.join(os.homedir(), ".nacl", "codex", "local-graph");

export function auditPathFor(stateRoot, projectId) {
  assertProjectId(projectId);
  return path.join(path.resolve(stateRoot), projectId, "audit.jsonl");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateInstanceState(instance) {
  try {
    if (!isObject(instance) || instance.contract !== INSTANCE_STATE_CONTRACT) throw new Error();
    assertProjectId(instance.projectId);
    if (instance.composeContract !== COMPOSE_CONTRACT) throw new Error();
    const expectedNames = projectDockerNames(instance.projectId);
    for (const field of ["composeProject", "containerName", "volumeName"]) {
      if (instance[field] !== expectedNames[field]) {
        throw new Error();
      }
    }
    if (instance.image !== NEO4J_IMAGE) throw new Error();
    if (!isObject(instance.endpoint) || instance.endpoint.host !== LOOPBACK_HOST) throw new Error();
    assertPort(instance.endpoint.httpPort, "httpPort");
    assertPort(instance.endpoint.boltPort, "boltPort");
    if (
      instance.endpoint.httpUrl !== `http://${LOOPBACK_HOST}:${instance.endpoint.httpPort}` ||
      instance.endpoint.boltUrl !== `bolt://${LOOPBACK_HOST}:${instance.endpoint.boltPort}`
    ) {
      throw new Error();
    }
    parseSecretReference(instance.secretReference);
    if (instance.secretReference !== keychainReference(instance.projectId)) throw new Error();
    if (!isObject(instance.gatewaySchema) || !SUPPORTED_GATEWAY_SCHEMAS.some((schema) =>
      schema.component === instance.gatewaySchema.component &&
      schema.version === instance.gatewaySchema.version &&
      schema.checksum === instance.gatewaySchema.checksum
    )) {
      throw new Error();
    }
    if (typeof instance.createdAt !== "string" || !Number.isFinite(Date.parse(instance.createdAt))) {
      throw new Error();
    }
  } catch (error) {
    if (error instanceof LifecycleError && ["PROJECT_ID_INVALID", "PORT_INVALID"].includes(error.code)) {
      // Normalize validation details so corrupt records never leak their content.
    }
    throw new LifecycleError("REGISTRY_CORRUPT", "The local graph instance record is corrupt.");
  }
  return instance;
}

export class FileInstanceStore {
  constructor(stateRoot = DEFAULT_STATE_ROOT) {
    this.stateRoot = path.resolve(stateRoot);
  }

  projectDirectory(projectId) {
    assertProjectId(projectId);
    return path.join(this.stateRoot, projectId);
  }

  filename(projectId) {
    return path.join(this.projectDirectory(projectId), "instance.json");
  }

  auditPath(projectId) {
    return auditPathFor(this.stateRoot, projectId);
  }

  async resolve(projectId) {
    assertProjectId(projectId);
    let content;
    try {
      content = await readFile(this.filename(projectId), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw new LifecycleError("REGISTRY_UNAVAILABLE", "The local graph instance record is unavailable.", {
        status: "BLOCKED",
      });
    }
    try {
      const instance = validateInstanceState(JSON.parse(content));
      if (instance.projectId !== projectId) {
        throw new LifecycleError("REGISTRY_CORRUPT", "The local graph instance filename does not match its record.");
      }
      return instance;
    } catch (error) {
      if (error instanceof LifecycleError) throw error;
      throw new LifecycleError("REGISTRY_CORRUPT", "The local graph instance record is corrupt.");
    }
  }

  async create(instance) {
    validateInstanceState(instance);
    const directory = this.projectDirectory(instance.projectId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const filename = this.filename(instance.projectId);
    const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(instance, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await link(temporary, filename);
    } finally {
      await rm(temporary, { force: true });
    }
    return this.resolve(instance.projectId);
  }

  async updateSchema(projectId, schema) {
    assertProjectId(projectId);
    const existing = await this.resolve(projectId);
    if (!existing) {
      throw new LifecycleError("INSTANCE_NOT_INITIALIZED", "The local graph instance is not initialized.", {
        status: "BLOCKED",
      });
    }
    if (
      schema?.component !== EXPECTED_GATEWAY_SCHEMA.component ||
      schema?.version !== EXPECTED_GATEWAY_SCHEMA.version ||
      schema?.checksum !== EXPECTED_GATEWAY_SCHEMA.checksum ||
      existing.gatewaySchema.version > schema.version
    ) {
      throw new LifecycleError("SCHEMA_METADATA_INVALID", "The graph schema metadata cannot be advanced.");
    }
    if (
      existing.gatewaySchema.version === schema.version &&
      existing.gatewaySchema.checksum === schema.checksum
    ) {
      return existing;
    }
    const updated = { ...existing, gatewaySchema: { ...schema } };
    validateInstanceState(updated);
    const filename = this.filename(projectId);
    const temporary = `${filename}.${process.pid}.${Date.now()}.schema.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await chmod(temporary, 0o600);
      await rename(temporary, filename);
      await chmod(filename, 0o600);
    } finally {
      await rm(temporary, { force: true });
    }
    const readback = await this.resolve(projectId);
    if (
      readback?.gatewaySchema.version !== schema.version ||
      readback?.gatewaySchema.checksum !== schema.checksum
    ) {
      throw new LifecycleError("SCHEMA_METADATA_READBACK_FAILED", "The graph schema metadata was not read back.", {
        status: "PARTIALLY_VERIFIED",
      });
    }
    return readback;
  }

  async list() {
    let entries;
    try {
      entries = await readdir(this.stateRoot, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw new LifecycleError("REGISTRY_UNAVAILABLE", "The local graph registry is unavailable.", {
        status: "BLOCKED",
      });
    }
    const instances = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const instance = await this.resolve(entry.name);
      if (instance) instances.push(instance);
    }
    return instances;
  }
}

export function createInstanceStore(options = {}) {
  return new FileInstanceStore(options.stateRoot ?? DEFAULT_STATE_ROOT);
}
