import { gatewayError } from "./errors.mjs";

let lifecyclePromise;

async function defaultLifecycle() {
  lifecyclePromise ??= import("../graph-cli/lifecycle.mjs")
    .then((module) => module.createLocalGraphLifecycle())
    .catch(() => {
      throw gatewayError(
        "LIFECYCLE_ADAPTER_UNAVAILABLE",
        "The package-local graph lifecycle adapter is unavailable.",
        { status: "BLOCKED", retryable: false },
      );
    });
  return lifecyclePromise;
}

function lifecycleFailure(result, fallbackCode) {
  const code = typeof result?.code === "string" ? result.code : fallbackCode;
  throw gatewayError(code, "The local graph lifecycle could not resolve a verified instance.", {
    status: result?.status === "PARTIALLY_VERIFIED"
      ? "PARTIALLY_VERIFIED"
      : result?.status === "FAILED"
        ? "FAILED"
        : "BLOCKED",
    retryable: result?.status !== "FAILED",
  });
}

export function createLifecycleProjectResolver(options = {}) {
  const getLifecycle = options.getLifecycle ?? defaultLifecycle;
  return async ({ projectId, projectRoot }) => {
    const lifecycle = await getLifecycle();
    let resolved;
    try {
      resolved = await lifecycle.resolve({ projectId, projectRoot });
    } catch {
      throw gatewayError("REGISTRY_CORRUPT", "The local graph instance registry could not be resolved.");
    }
    if (resolved?.status && resolved.status !== "VERIFIED") {
      lifecycleFailure(resolved, "REGISTRY_CORRUPT");
    }
    const instance = resolved?.instance ?? resolved;
    if (instance?.contract !== "nacl-local-graph-instance-v1") {
      throw gatewayError("REGISTRY_CORRUPT", "The local graph instance record has an invalid contract.");
    }

    let doctor;
    try {
      doctor = await lifecycle.doctor({ projectId, projectRoot });
    } catch {
      throw gatewayError("LIFECYCLE_UNAVAILABLE", "The local graph lifecycle doctor failed.", {
        status: "BLOCKED",
        retryable: true,
      });
    }
    if (doctor?.contract !== "nacl-local-graph-lifecycle-v1") {
      throw gatewayError("LIFECYCLE_RESPONSE_INVALID", "The local graph lifecycle doctor returned an invalid contract.");
    }
    const current = doctor.instance ?? instance;
    const canonicalRoot = doctor.projectRoot ?? resolved.projectRoot;
    if (typeof canonicalRoot !== "string" || canonicalRoot.length === 0) {
      throw gatewayError("LIFECYCLE_RESPONSE_INVALID", "The lifecycle omitted the canonical project root.");
    }
    const endpoint = current.endpoint?.httpUrl;
    const auditPath = resolved?.auditPath ?? doctor.auditPath ?? current.auditPath;
    return {
      projectId,
      projectRoot: canonicalRoot,
      endpoint,
      database: "neo4j",
      username: "neo4j",
      secretReference: current.secretReference,
      auditPath,
      lifecycleStatus: doctor.status,
      lifecycleCode: doctor.code,
      capabilities: ["read", "write", "schema-admin"],
      gatewaySchema: current.gatewaySchema,
      async recordSchema(schema) {
        if (typeof lifecycle.recordSchema !== "function") return null;
        const recorded = await lifecycle.recordSchema({
          projectId,
          projectRoot: canonicalRoot,
          schema,
        });
        if (recorded?.status !== "VERIFIED") {
          lifecycleFailure(recorded, "SCHEMA_METADATA_PARTIAL");
        }
        return recorded;
      },
    };
  };
}
