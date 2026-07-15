import { createHash } from "node:crypto";

export const LIFECYCLE_CONTRACT = "nacl-local-graph-lifecycle-v1";
export const INSTANCE_STATE_CONTRACT = "nacl-local-graph-instance-v1";
export const BACKUP_CONTRACT = "nacl-local-graph-backup-v1";
export const COMPOSE_CONTRACT = "nacl-local-neo4j-compose-v1";

export const NEO4J_IMAGE = "neo4j:5.24.2-community";
export const LOOPBACK_HOST = "127.0.0.1";
export const KEYCHAIN_SERVICE = "com.itsalt.nacl.local-graph";

export const SUPPORTED_GATEWAY_SCHEMAS = Object.freeze([
  Object.freeze({
    component: "nacl-graph-gateway",
    version: 1,
    checksum: "320481b3ad98cec6bbbc55ec24b86108c9be9945cbd4fdd3ac78dc14354d4ba7",
  }),
  Object.freeze({
    component: "nacl-graph-gateway",
    version: 2,
    checksum: "8bf48a60b7af77b61440c0d8d1429768ec32ca21597574ef5e7a18c1db3aef90",
  }),
  Object.freeze({
    component: "nacl-graph-gateway",
    version: 3,
    checksum: "a0f6a5925eae88ae59e00baf056b1a29750ec40d97cfef7bdfd018f993bb40b2",
  }),
]);

// This checksum is the byte checksum of the latest packaged graph migration.
// Older exact descriptors remain readable so an installed cache can perform an
// additive upgrade and then atomically advance its external metadata.
export const EXPECTED_GATEWAY_SCHEMA = Object.freeze({
  component: "nacl-graph-gateway",
  version: 3,
  checksum: "a0f6a5925eae88ae59e00baf056b1a29750ec40d97cfef7bdfd018f993bb40b2",
});

export const CLOSED_STATUSES = Object.freeze([
  "VERIFIED",
  "BLOCKED",
  "FAILED",
  "PARTIALLY_VERIFIED",
]);
export const STATUS_EXIT_CODES = Object.freeze({
  VERIFIED: 0,
  BLOCKED: 2,
  FAILED: 1,
  PARTIALLY_VERIFIED: 2,
});

export class LifecycleError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "LifecycleError";
    this.code = code;
    this.status = options.status ?? "FAILED";
    this.details = options.details ?? {};
  }
}

export function assertProjectId(projectId) {
  if (
    typeof projectId !== "string" ||
    projectId.length < 3 ||
    projectId.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId)
  ) {
    throw new LifecycleError(
      "PROJECT_ID_INVALID",
      "projectId must be a stable 3-128 character identifier.",
    );
  }
  return projectId;
}

export function assertPort(port, field) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new LifecycleError("PORT_INVALID", `${field} must be an integer from 1024 to 65535.`);
  }
  return port;
}

export function projectDockerNames(projectId) {
  assertProjectId(projectId);
  const suffix = createHash("sha256").update(projectId).digest("hex").slice(0, 16);
  return Object.freeze({
    composeProject: `nacl-g-${suffix}`,
    containerName: `nacl-graph-${suffix}`,
    volumeName: `nacl_graph_${suffix}`,
  });
}

export function keychainReference(projectId) {
  assertProjectId(projectId);
  return `keychain:${KEYCHAIN_SERVICE}/${projectId}`;
}

export function endpoint(httpPort, boltPort) {
  assertPort(httpPort, "httpPort");
  assertPort(boltPort, "boltPort");
  if (httpPort === boltPort) {
    throw new LifecycleError("PORT_INVALID", "httpPort and boltPort must be different.");
  }
  return Object.freeze({
    host: LOOPBACK_HOST,
    httpPort,
    boltPort,
    httpUrl: `http://${LOOPBACK_HOST}:${httpPort}`,
    boltUrl: `bolt://${LOOPBACK_HOST}:${boltPort}`,
  });
}

export function publicInstance(instance) {
  return {
    contract: instance.contract,
    projectId: instance.projectId,
    composeContract: instance.composeContract,
    composeProject: instance.composeProject,
    containerName: instance.containerName,
    volumeName: instance.volumeName,
    image: instance.image,
    endpoint: { ...instance.endpoint },
    secretReference: instance.secretReference,
    gatewaySchema: { ...instance.gatewaySchema },
  };
}

export function lifecycleResult(operation, status, code, fields = {}) {
  if (!CLOSED_STATUSES.includes(status)) {
    throw new TypeError(`Unsupported lifecycle status: ${status}`);
  }
  return {
    contract: LIFECYCLE_CONTRACT,
    operation,
    status,
    code,
    ...fields,
  };
}

export function migrationHandoff(instance) {
  return {
    action: "graph_apply_migrations",
    component: instance.gatewaySchema.component,
    requiredVersion: instance.gatewaySchema.version,
    requiredChecksum: instance.gatewaySchema.checksum,
  };
}
