import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gatewayError } from "./errors.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultMigrationRoot = path.join(pluginRoot, "graph", "migrations");
const defaultQueryCatalog = path.join(pluginRoot, "graph", "queries", "catalog.json");

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function loadMigrationCatalog(root = defaultMigrationRoot) {
  let filenames;
  try {
    filenames = (await readdir(root)).filter((name) => /^\d{3}-[a-z0-9-]+\.json$/.test(name)).sort();
  } catch {
    throw gatewayError("MIGRATION_CATALOG_UNAVAILABLE", "The packaged migration catalog is unavailable.", {
      status: "BLOCKED",
    });
  }
  if (filenames.length === 0) {
    throw gatewayError("MIGRATION_CATALOG_EMPTY", "The packaged migration catalog is empty.", {
      status: "BLOCKED",
    });
  }
  const migrations = [];
  for (const [index, filename] of filenames.entries()) {
    const content = await readFile(path.join(root, filename), "utf8");
    let migration;
    try {
      migration = JSON.parse(content);
    } catch {
      throw gatewayError("MIGRATION_CATALOG_CORRUPT", `Packaged migration ${filename} is invalid JSON.`);
    }
    if (
      !isObject(migration) ||
      migration.component !== "nacl-graph-gateway" ||
      migration.version !== index + 1 ||
      !["additive", "risky"].includes(migration.risk) ||
      typeof migration.backupRequired !== "boolean" ||
      !Array.isArray(migration.statements) ||
      migration.statements.length === 0 ||
      migration.statements.some((statement) => typeof statement !== "string" || statement.length === 0)
    ) {
      throw gatewayError("MIGRATION_CATALOG_CORRUPT", `Packaged migration ${filename} has an invalid contract.`);
    }
    if (migration.risk === "risky" && migration.backupRequired !== true) {
      throw gatewayError("MIGRATION_CATALOG_CORRUPT", `Risky migration ${filename} must require a backup.`);
    }
    migrations.push({ ...migration, filename, checksum: sha256(content) });
  }
  return migrations;
}

export async function loadQueryCatalog(filename = defaultQueryCatalog) {
  let catalog;
  try {
    catalog = JSON.parse(await readFile(filename, "utf8"));
  } catch {
    throw gatewayError("QUERY_CATALOG_UNAVAILABLE", "The packaged query catalog is unavailable.", {
      status: "BLOCKED",
    });
  }
  if (!isObject(catalog) || catalog.schemaVersion !== 1 || !isObject(catalog.queries)) {
    throw gatewayError("QUERY_CATALOG_CORRUPT", "The packaged query catalog has an invalid contract.");
  }
  for (const [name, query] of Object.entries(catalog.queries)) {
    if (
      !/^[a-z][a-z0-9-]+$/.test(name) ||
      !isObject(query) ||
      !["read", "write"].includes(query.capability) ||
      typeof query.statement !== "string" ||
      query.statement.length === 0 ||
      /\$\{/.test(query.statement)
    ) {
      throw gatewayError("QUERY_CATALOG_CORRUPT", `Packaged query ${name} has an invalid contract.`);
    }
  }
  return catalog;
}

export function gatewaySchemaDescriptor(migrations) {
  const latest = migrations.at(-1);
  return {
    component: "nacl-graph-gateway",
    version: latest.version,
    checksum: latest.checksum,
  };
}
