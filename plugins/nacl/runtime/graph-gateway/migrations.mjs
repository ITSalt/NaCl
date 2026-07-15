import { gatewayError } from "./errors.mjs";

const LEDGER_READ =
  "OPTIONAL MATCH (migration:SchemaMigration {component: $component, version: $version}) RETURN migration.checksum AS checksum LIMIT 1";
const LEDGER_WRITE =
  "MERGE (migration:SchemaMigration {component: $component, version: $version}) " +
  "ON CREATE SET migration.checksum = $checksum, migration.applied_at = datetime() " +
  "ON MATCH SET migration.last_verified_at = datetime() " +
  "RETURN migration.checksum AS checksum";

function requiredConstraintNames(migrations) {
  return migrations.flatMap((migration) => migration.statements.flatMap((statement) => {
    const match = statement.match(/^CREATE\s+CONSTRAINT\s+([A-Za-z0-9_]+)\s+/i);
    return match ? [match[1]] : [];
  }));
}

function preparedStatement(statement, parameters, options, kind) {
  const adapter = options[`${kind}Statement`];
  return {
    statement: typeof adapter === "function" ? adapter(statement) : statement,
    parameters: { ...parameters, ...(options.authorizationParameters ?? {}) },
  };
}

async function executeBoundary(transport, entry, options, boundary) {
  await options.beforeBoundary?.({ boundary });
  const result = await transport.execute([entry]);
  try {
    await options.afterBoundary?.({ boundary });
  } catch (error) {
    throw gatewayError(
      "MIGRATION_AUTHORIZATION_LOST_AFTER_BOUNDARY",
      `Schema authorization or fencing was lost after ${boundary}.`,
      {
        status: "PARTIALLY_VERIFIED",
        retryable: false,
        cause: error,
        details: { boundary },
      },
    );
  }
  return result;
}

async function verifySchemaObjects(transport, migrations, options = {}) {
  const required = [...new Set(requiredConstraintNames(migrations))].sort();
  if (required.length === 0) return [];
  const [rows] = await executeBoundary(
    transport,
    preparedStatement(
      "SHOW CONSTRAINTS YIELD name WHERE name IN $names RETURN collect(name) AS names",
      { names: required },
      options,
      "constraint",
    ),
    options,
    "constraint read-back",
  );
  if (!rows[0]) {
    throw gatewayError("ACCESS_OR_RESOURCE_NOT_FOUND", "Schema status authorization or lease validation failed.", {
      status: "BLOCKED",
    });
  }
  const observed = Array.isArray(rows[0]?.names) ? [...rows[0].names].sort() : [];
  const missing = required.filter((name) => !observed.includes(name));
  if (missing.length > 0) {
    throw gatewayError(
      "SCHEMA_OBJECTS_MISSING",
      "The migration ledger is current but required graph constraints are missing.",
      { status: "BLOCKED", details: { missingConstraints: missing } },
    );
  }
  return observed;
}

async function ledgerEntry(transport, migration, options = {}) {
  const [rows] = await executeBoundary(
    transport,
    preparedStatement(
      LEDGER_READ,
      { component: migration.component, version: migration.version },
      options,
      "read",
    ),
    options,
    `migration ${migration.version} ledger read`,
  );
  if (!rows[0]) {
    throw gatewayError("ACCESS_OR_RESOURCE_NOT_FOUND", "Schema ledger authorization or lease validation failed.", {
      status: "BLOCKED",
    });
  }
  return rows[0]?.checksum ?? null;
}

export async function schemaStatus(transport, migrations, options = {}) {
  const applied = [];
  for (const migration of migrations) {
    const checksum = await ledgerEntry(transport, migration, options);
    if (checksum === null) {
      throw gatewayError(
        applied.length === 0 ? "SCHEMA_MISSING" : "SCHEMA_STALE",
        applied.length === 0
          ? "The NaCl graph schema ledger is missing."
          : "The NaCl graph schema ledger is behind the packaged version.",
        {
          status: "BLOCKED",
          retryable: false,
          details: {
            currentVersion: applied.at(-1)?.version ?? 0,
            requiredVersion: migrations.at(-1).version,
            requiredChecksum: migrations.at(-1).checksum,
          },
        },
      );
    }
    if (checksum !== migration.checksum) {
      throw gatewayError(
        "SCHEMA_CHECKSUM_MISMATCH",
        `Schema migration ${migration.version} checksum does not match the packaged migration.`,
        {
          status: "FAILED",
          retryable: false,
          details: {
            currentVersion: migration.version,
            requiredVersion: migrations.at(-1).version,
            requiredChecksum: migrations.at(-1).checksum,
          },
        },
      );
    }
    applied.push({ version: migration.version, checksum });
  }
  const constraints = await verifySchemaObjects(transport, migrations, options);
  return {
    currentVersion: applied.at(-1).version,
    requiredVersion: migrations.at(-1).version,
    checksum: applied.at(-1).checksum,
    migrations: applied,
    constraints,
  };
}

export async function applyMigrations(transport, migrations, options = {}) {
  const applied = [];
  const alreadyApplied = [];
  for (const migration of migrations) {
    const existing = await ledgerEntry(transport, migration, options);
    if (existing !== null && existing !== migration.checksum) {
      throw gatewayError(
        "SCHEMA_CHECKSUM_MISMATCH",
        `Schema migration ${migration.version} checksum differs from the packaged migration.`,
      );
    }
    if (existing === migration.checksum) {
      alreadyApplied.push(migration.version);
      if (migration.risk === "additive") {
        let successfulStatements = 0;
        try {
          for (const statement of migration.statements) {
            await options.beforeDdl?.();
            options.onBeforeMutation?.();
            await transport.execute([{ statement, parameters: {} }]);
            successfulStatements += 1;
            await options.afterDdl?.();
          }
        } catch (error) {
          if (successfulStatements > 0) {
            throw gatewayError(
              "MIGRATION_PARTIALLY_APPLIED",
              `Migration ${migration.version} stopped after an additive statement was applied.`,
              { status: "PARTIALLY_VERIFIED", retryable: true, cause: error },
            );
          }
          throw error;
        }
      }
      continue;
    }
    if (migration.backupRequired && options.backupVerified !== true) {
      throw gatewayError(
        "BACKUP_REQUIRED",
        `Migration ${migration.version} requires a verified backup before it can run.`,
        { status: "BLOCKED" },
      );
    }
    let successfulStatements = 0;
    let writeRows;
    try {
      for (const statement of migration.statements) {
        await options.beforeDdl?.();
        options.onBeforeMutation?.();
        await transport.execute([{ statement, parameters: {} }]);
        successfulStatements += 1;
        await options.afterDdl?.();
      }
      options.onBeforeMutation?.();
      [writeRows] = await executeBoundary(
        transport,
        preparedStatement(
          LEDGER_WRITE,
          {
            component: migration.component,
            version: migration.version,
            checksum: migration.checksum,
          },
          options,
          "write",
        ),
        options,
        `migration ${migration.version} ledger write`,
      );
    } catch (error) {
      if (successfulStatements > 0) {
        throw gatewayError(
          "MIGRATION_PARTIALLY_APPLIED",
          `Migration ${migration.version} stopped after an additive statement was applied.`,
          { status: "PARTIALLY_VERIFIED", retryable: true, cause: error },
        );
      }
      throw error;
    }
    if (writeRows[0]?.checksum !== migration.checksum) {
      throw gatewayError("MIGRATION_READBACK_FAILED", `Migration ${migration.version} ledger read-back failed.`);
    }
    const readback = await ledgerEntry(transport, migration, options);
    if (readback !== migration.checksum) {
      throw gatewayError("MIGRATION_READBACK_FAILED", `Migration ${migration.version} checksum read-back failed.`);
    }
    applied.push(migration.version);
  }
  const status = await schemaStatus(transport, migrations, options);
  return { ...status, applied, alreadyApplied };
}
