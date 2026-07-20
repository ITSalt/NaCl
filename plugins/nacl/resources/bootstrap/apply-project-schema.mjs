#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Neo4jHttpTransport } from "../../runtime/graph-gateway/neo4j-http.mjs";
import { applyMigrations } from "../../runtime/graph-gateway/migrations.mjs";

function fail(code) {
  process.stderr.write(`NACL_SCHEMA_RESULT: status=FAILED code=${code}\n`);
  process.exit(1);
}

function options(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) result[argv[index]?.replace(/^--/, "")] = argv[index + 1];
  return result;
}

function statements(source) {
  return source
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => ({ statement, parameters: {} }));
}

const selected = options(process.argv.slice(2));
if (!selected.endpoint || !process.env.NEO4J_PASSWORD) fail("ARGUMENT_OR_SECRET_MISSING");
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptRoot, "../..");
const schemaRoot = path.join(skillRoot, "resources", "graph-infra", "schema");
const migrationRoot = path.join(skillRoot, "graph", "migrations");
try {
  const transport = new Neo4jHttpTransport({ endpoint: selected.endpoint, database: selected.database ?? "neo4j" }, process.env.NEO4J_PASSWORD);
  const schemaFiles = ["ba-schema.cypher", "sa-schema.cypher", "tl-schema.cypher"];
  const schemaStatements = [];
  for (const filename of schemaFiles) schemaStatements.push(...statements(await readFile(path.join(schemaRoot, filename), "utf8")));
  for (const statement of schemaStatements) await transport.execute([statement]);
  const migrationFiles = ["001-gateway-foundation.json", "002-concurrency-foundation.json", "003-schema-resource-identity.json"];
  const migrations = [];
  for (const filename of migrationFiles) migrations.push(JSON.parse(await readFile(path.join(migrationRoot, filename), "utf8")));
  const migration = await applyMigrations(transport, migrations);
  const [canary] = await transport.execute([{ statement: "RETURN 1 AS ok", parameters: {} }]);
  if (canary[0]?.ok !== 1) fail("READ_CANARY_FAILED");
  process.stdout.write(`NACL_SCHEMA_RESULT: status=VERIFIED statements=${schemaStatements.length} migration_version=${migration.currentVersion} read_canary=ok\n`);
} catch {
  fail("SCHEMA_APPLY_OR_READBACK_FAILED");
}
