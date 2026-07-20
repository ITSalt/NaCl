#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Neo4jHttpTransport } from "../../runtime/graph-gateway/neo4j-http.mjs";
import { loadMigrationCatalog } from "../../runtime/graph-gateway/catalog.mjs";
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
  const migrations = await loadMigrationCatalog(migrationRoot);
  const migration = await applyMigrations(transport, migrations);
  const [apocVersion, apocMeta, canary] = await transport.execute([
    { statement: "RETURN apoc.version() AS version", parameters: {} },
    { statement: "CALL apoc.meta.schema() YIELD value RETURN value", parameters: {} },
    { statement: "RETURN 1 AS ok", parameters: {} },
  ]);
  if (apocVersion[0]?.version !== "5.24.2" || !Array.isArray(apocMeta)) fail("APOC_RUNTIME_CANARY_FAILED");
  if (canary[0]?.ok !== 1) fail("READ_CANARY_FAILED");
  process.stdout.write(`NACL_SCHEMA_RESULT: status=VERIFIED statements=${schemaStatements.length} migration_version=${migration.currentVersion} apoc_version=5.24.2 meta_canary=ok read_canary=ok\n`);
} catch {
  fail("SCHEMA_APPLY_OR_READBACK_FAILED");
}
