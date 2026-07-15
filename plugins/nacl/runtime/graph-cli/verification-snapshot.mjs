import { createHash, randomUUID } from "node:crypto";
import { loadQueryCatalog } from "../graph-gateway/catalog.mjs";
import { GatewayError } from "../graph-gateway/errors.mjs";
import { Neo4jHttpTransport } from "../graph-gateway/neo4j-http.mjs";
import { validateSnapshot } from "./backup-contract.mjs";
import { EXPECTED_GATEWAY_SCHEMA, LifecycleError, assertProjectId } from "./contracts.mjs";
import { Neo4jHttpProbe } from "./graph-probe.mjs";

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function histogram(rows, key) {
  return Object.fromEntries(rows.map((row) => [row[key], row.count]));
}

function probeFailure(kind) {
  if (kind === "secret-rejected") {
    return new LifecycleError(
      "RESTORE_SECRET_REJECTED",
      "Neo4j rejected the resolved candidate secret.",
    );
  }
  if (["schema-missing", "schema-stale"].includes(kind)) {
    return new LifecycleError(
      "RESTORE_SCHEMA_UNAVAILABLE",
      "The restored candidate schema is incomplete.",
      { status: "BLOCKED" },
    );
  }
  if (["schema-checksum-mismatch", "schema-incompatible", "query-failed"].includes(kind)) {
    return new LifecycleError(
      "RESTORE_SCHEMA_INVALID",
      "The restored candidate schema failed verification.",
    );
  }
  return new LifecycleError(
    "RESTORE_PROBE_UNAVAILABLE",
    "The restored candidate did not become available for verification.",
    { status: "BLOCKED" },
  );
}

function mapGatewayFailure(error) {
  if (error instanceof LifecycleError) return error;
  if (error instanceof GatewayError) {
    const runtimeUnavailable = error.code === "RUNTIME_UNSUPPORTED";
    return new LifecycleError(
      runtimeUnavailable ? "RESTORE_RUNTIME_UNSUPPORTED" : "RESTORE_PROBE_FAILED",
      runtimeUnavailable
        ? "The package-local restore probe requires Node.js fetch support."
        : "The restored candidate could not produce complete verification evidence.",
      { status: runtimeUnavailable ? "BLOCKED" : error.status },
    );
  }
  return new LifecycleError(
    "RESTORE_PROBE_FAILED",
    "The restored candidate could not produce complete verification evidence.",
  );
}

export async function collectGraphVerificationSnapshot(options) {
  const { instance, secret } = options;
  const projectId = assertProjectId(options.projectId);
  if (typeof secret !== "string" || secret.length < 24) {
    throw new LifecycleError("RESTORE_SECRET_INVALID", "The resolved candidate secret is invalid.");
  }
  const catalog = await loadQueryCatalog();
  const representative = catalog.queries["write-canary-readback"];
  if (!representative || representative.capability !== "read") {
    throw new LifecycleError(
      "RESTORE_PROBE_UNAVAILABLE",
      "The packaged representative query is unavailable.",
      { status: "BLOCKED" },
    );
  }
  const transport = new Neo4jHttpTransport(
    { endpoint: instance.endpoint.httpUrl, database: "neo4j", username: "neo4j" },
    secret,
    { fetch: options.fetch, timeoutMs: options.timeoutMs ?? 10_000 },
  );
  const results = await transport.execute([
    { statement: "MATCH (node) RETURN count(node) AS count", parameters: {} },
    { statement: "MATCH ()-[relationship]->() RETURN count(relationship) AS count", parameters: {} },
    {
      statement:
        "MATCH (node) UNWIND labels(node) AS label " +
        "RETURN label, count(*) AS count ORDER BY label",
      parameters: {},
    },
    {
      statement:
        "MATCH ()-[relationship]->() RETURN type(relationship) AS relationshipType, " +
        "count(*) AS count ORDER BY relationshipType",
      parameters: {},
    },
    { statement: "SHOW CONSTRAINTS YIELD name RETURN collect(name) AS names", parameters: {} },
    { statement: "SHOW INDEXES YIELD name RETURN collect(name) AS names", parameters: {} },
    {
      statement:
        "MATCH (migration:SchemaMigration {component: $component}) " +
        "RETURN migration.version AS version, migration.checksum AS checksum " +
        "ORDER BY migration.version DESC LIMIT 1",
      parameters: { component: EXPECTED_GATEWAY_SCHEMA.component },
    },
    { statement: representative.statement, parameters: { project_id: projectId } },
  ]);
  const smokeNonce = randomUUID();
  const [smokeRows] = await transport.execute([
    {
      statement:
        "CREATE (probe:NaclRestoreVerification {nonce: $nonce}) " +
        "WITH probe, probe.nonce AS observed DELETE probe RETURN observed",
      parameters: { nonce: smokeNonce },
    },
  ]);
  if (smokeRows.length !== 1 || smokeRows[0].observed !== smokeNonce) {
    throw new LifecycleError(
      "RESTORE_READ_WRITE_SMOKE_FAILED",
      "The restored candidate failed the transactional read/write smoke.",
    );
  }
  const representativeRows = results[7];
  const snapshot = {
    contract: "nacl-graph-verification-snapshot-v1",
    nodeCount: results[0][0]?.count,
    relationshipCount: results[1][0]?.count,
    labelHistogram: histogram(results[2], "label"),
    relationshipTypeHistogram: histogram(results[3], "relationshipType"),
    constraints: [...(results[4][0]?.names ?? [])].sort(),
    indexes: [...(results[5][0]?.names ?? [])].sort(),
    schemaMigration: {
      version: results[6][0]?.version,
      checksum: results[6][0]?.checksum,
    },
    representativeQueries: {
      "gateway-canary": {
        rowCount: representativeRows.length,
        digest: digest(representativeRows),
      },
    },
    readWriteSmoke: "VERIFIED",
  };
  return validateSnapshot(snapshot);
}

export function createGraphRestoreProbe(options = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const graphProbe = options.graphProbe ?? new Neo4jHttpProbe({
    fetch: fetchImpl,
    attempts: options.attempts ?? 60,
    delayMs: options.delayMs ?? 500,
  });
  return async ({ instance, secret, expectedSnapshot }) => {
    try {
      if (typeof fetchImpl !== "function") {
        throw new LifecycleError(
          "RESTORE_RUNTIME_UNSUPPORTED",
          "The package-local restore probe requires Node.js fetch support.",
          { status: "BLOCKED" },
        );
      }
      validateSnapshot(expectedSnapshot);
      if (
        Object.keys(expectedSnapshot.representativeQueries).length !== 1 ||
        !expectedSnapshot.representativeQueries["gateway-canary"]
      ) {
        throw new LifecycleError(
          "RESTORE_EVIDENCE_UNSUPPORTED",
          "The backup does not use the package-local representative query contract.",
          { status: "BLOCKED" },
        );
      }
      const health = await graphProbe.probe({ instance, secret });
      if (health.kind !== "healthy") throw probeFailure(health.kind);
      return await collectGraphVerificationSnapshot({
        instance,
        secret,
        projectId: instance.projectId,
        fetch: fetchImpl,
        timeoutMs: options.timeoutMs,
      });
    } catch (error) {
      throw mapGatewayFailure(error);
    }
  };
}
