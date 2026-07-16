import { EXPECTED_GATEWAY_SCHEMA } from "./contracts.mjs";

const READ_CANARY = "RETURN 1 AS canary";
const SCHEMA_READ =
  "MATCH (migration:SchemaMigration {component: $component}) " +
  "RETURN migration.version AS version, migration.checksum AS checksum " +
  "ORDER BY migration.version DESC LIMIT 1";

function wait(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export class Neo4jHttpProbe {
  constructor(options = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.attempts = options.attempts ?? 12;
    this.delayMs = options.delayMs ?? 500;
  }

  async #query(instance, secret, statements) {
    let lastKind = "unavailable";
    for (let attempt = 0; attempt < this.attempts; attempt += 1) {
      try {
        const authorization = Buffer.from(`neo4j:${secret}`, "utf8").toString("base64");
        const response = await this.fetch(`${instance.endpoint.httpUrl}/db/neo4j/tx/commit`, {
          method: "POST",
          headers: {
            authorization: `Basic ${authorization}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ statements }),
          signal: AbortSignal.timeout(2_000),
        });
        if (response.status === 401 || response.status === 403) return { kind: "secret-rejected" };
        if (!response.ok) {
          lastKind = "unavailable";
        } else {
          const payload = await response.json();
          if (Array.isArray(payload.errors) && payload.errors.length > 0) {
            return { kind: "query-failed" };
          }
          return { kind: "query-ok", payload };
        }
      } catch {
        lastKind = "unavailable";
      }
      if (attempt + 1 < this.attempts) await wait(this.delayMs);
    }
    return { kind: lastKind };
  }

  async probe({ instance, secret }) {
    const response = await this.#query(instance, secret, [
      { statement: READ_CANARY, parameters: {} },
      {
        statement: SCHEMA_READ,
        parameters: { component: instance.gatewaySchema.component },
      },
    ]);
    if (response.kind !== "query-ok") return response;
    const results = response.payload.results ?? [];
    const canary = results[0]?.data?.[0]?.row?.[0];
    if (canary !== 1) return { kind: "read-canary-failed" };
    const row = results[1]?.data?.[0]?.row;
    if (!row) return { kind: "schema-missing", readCanary: true };
    const [version, checksum] = row;
    const schema = { component: EXPECTED_GATEWAY_SCHEMA.component, version, checksum };
    if (version < instance.gatewaySchema.version) {
      return { kind: "schema-stale", readCanary: true, schema };
    }
    if (
      version > instance.gatewaySchema.version &&
      version === EXPECTED_GATEWAY_SCHEMA.version &&
      checksum === EXPECTED_GATEWAY_SCHEMA.checksum
    ) {
      return { kind: "healthy", readCanary: true, schema, metadataUpgradeRequired: true };
    }
    if (version !== instance.gatewaySchema.version) {
      return { kind: "schema-incompatible", readCanary: true, schema };
    }
    if (checksum !== instance.gatewaySchema.checksum) {
      return { kind: "schema-checksum-mismatch", readCanary: true, schema };
    }
    return { kind: "healthy", readCanary: true, schema };
  }
}
