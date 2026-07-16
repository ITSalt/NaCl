import { createHash, randomUUID } from "node:crypto";
import { JsonlAuditSink } from "./audit.mjs";
import { loadMigrationCatalog, loadQueryCatalog } from "./catalog.mjs";
import { rolesForCapability as defaultRolesForCapability } from "./authorization.mjs";
import { CONCURRENCY_OPERATIONS, runConcurrencyOperation } from "./concurrency-engine.mjs";
import { validateIdentity } from "./concurrency.mjs";
import { errorResult, gatewayError, normalizeGatewayError } from "./errors.mjs";
import { applyMigrations, schemaStatus } from "./migrations.mjs";
import { assertLoopbackEndpoint, Neo4jHttpTransport } from "./neo4j-http.mjs";
import { createProjectTransportPool } from "./project-transport-pool.mjs";
import { assertTrustedRequestPrincipal } from "./principal.mjs";
import {
  BOOTSTRAP_GUARD_CONSTRAINT,
  BOOTSTRAP_SCHEMA_CHECK,
  BOOTSTRAP_SCHEMA_PREPARE,
  BOOTSTRAP_STATE_INSPECT,
  PROJECT_READ_CHECK,
  SCHEMA_LEASE_CHECK,
  SCHEMA_MIGRATION_RESOURCE_ID,
  authorizedBootstrapConstraintStatement,
  authorizedBootstrapSchemaStatement,
  authorizedConstraintStatement,
  authorizedReadStatement,
  authorizedSchemaStatement,
  authorizedWriteStatement,
} from "./rbac-cypher.mjs";
import { resolveSecret, secretReferenceKind } from "./secret-provider.mjs";
import { GRAPH_TOOL_BY_NAME, GRAPH_TOOL_DEFINITIONS } from "./tool-schemas.mjs";
import { validateToolArguments } from "./validation.mjs";

const SCHEMA_STALE_LEASE_OPERATIONS = new Set([
  "lease-acquire",
  "lease-heartbeat",
  "lease-release",
  "lease-handoff",
]);

function hashIdempotencyKey(value) {
  return createHash("sha256").update(value).digest("hex");
}

function successResult(definition, projectId, code, details = {}) {
  return {
    contract: "nacl-graph-gateway-v1",
    status: "VERIFIED",
    code,
    capability: definition.capability,
    operation: definition.operation,
    projectId,
    retryable: false,
    ...details,
  };
}

function validateProfile(profile, projectId, definition, validatedInput) {
  if (profile === null || typeof profile !== "object" || Array.isArray(profile)) {
    throw gatewayError("REGISTRY_CORRUPT", "The local graph lifecycle returned an invalid project profile.");
  }
  if (
    typeof profile.projectId !== "string" ||
    typeof profile.projectRoot !== "string" ||
    typeof profile.endpoint !== "string" ||
    typeof profile.lifecycleStatus !== "string" ||
    typeof profile.lifecycleCode !== "string"
  ) {
    throw gatewayError("REGISTRY_CORRUPT", "The local graph lifecycle profile is incomplete.");
  }
  if (profile.projectId !== projectId) {
    throw gatewayError("PROJECT_MISMATCH", "The requested project does not match the resolved lifecycle profile.");
  }
  if (!Array.isArray(profile.capabilities) || !profile.capabilities.includes(definition.capability)) {
    throw gatewayError("CAPABILITY_DENIED", `The project profile does not grant ${definition.capability}.`);
  }
  if (typeof profile.auditPath !== "string" || typeof profile.secretReference !== "string") {
    throw gatewayError("REGISTRY_CORRUPT", "The project profile omits its audit path or opaque secret reference.");
  }
  assertLoopbackEndpoint(profile.endpoint);
  if (secretReferenceKind(profile.secretReference) !== "keychain") {
    throw gatewayError("SECRET_REFERENCE_INVALID", "The local project profile must use a Keychain reference.");
  }
  if (profile.secretReference !== `keychain:com.itsalt.nacl.local-graph/${projectId}`) {
    throw gatewayError(
      "PROJECT_SECRET_MISMATCH",
      "The project profile secret reference does not belong to project_id.",
    );
  }
  const status = profile.lifecycleStatus;
  const code = profile.lifecycleCode;
  const missingBootstrapAllowed = code === "SCHEMA_MISSING" &&
    definition.operation === "membership-bootstrap";
  const staleMigrationAllowed = code === "SCHEMA_STALE" && (
    definition.operation === "apply-migrations" ||
    (
      SCHEMA_STALE_LEASE_OPERATIONS.has(definition.operation) &&
      validatedInput.resource_type === "SchemaMigration" &&
      validatedInput.resource_id === SCHEMA_MIGRATION_RESOURCE_ID
    )
  );
  const handoffAllowed = missingBootstrapAllowed || staleMigrationAllowed;
  if (status !== "VERIFIED" && !handoffAllowed) {
    throw gatewayError(
      typeof code === "string" ? code : "LIFECYCLE_NOT_VERIFIED",
      "The local graph lifecycle preflight is not verified.",
      { status: status === "FAILED" ? "FAILED" : "BLOCKED", retryable: true },
    );
  }
  return profile;
}

function query(catalog, name) {
  const selected = catalog.queries[name];
  if (!selected) throw gatewayError("QUERY_CATALOG_CORRUPT", `Packaged query ${name} is unavailable.`);
  return selected;
}

function identityParameters(identity) {
  return {
    principal_id: identity.principal_id,
    client_id: identity.client_id,
    session_id: identity.session_id,
    worker_id: identity.worker_id,
    worktree_id: identity.worktree_id,
    branch: identity.branch,
    base_sha: identity.base_sha,
    pull_request_url: identity.pull_request?.url ?? null,
    pull_request_number: identity.pull_request?.number ?? null,
    pull_request_head_sha: identity.pull_request?.head_sha ?? null,
  };
}

async function legacyAuthorization(input, capability, context) {
  const identity = validateIdentity(input);
  const trusted = await assertTrustedRequestPrincipal(input.principal_id, context.resolvePrincipal);
  const rolesForCapability = context.rolesForCapability ?? defaultRolesForCapability;
  const allowedRoles = rolesForCapability(capability);
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw gatewayError("AUTHORIZATION_POLICY_UNAVAILABLE", "No server-side role policy grants this operation.", {
      status: "BLOCKED",
    });
  }
  return {
    identity,
    trusted,
    capability,
    parameters: {
      project_id: input.project_id,
      allowed_roles: allowedRoles,
      now_ms: (context.clock ?? Date.now)(),
      schema_resource_id: SCHEMA_MIGRATION_RESOURCE_ID,
      fencing_token: input.fencing_token ?? null,
      ...identityParameters(identity),
    },
  };
}

function accessDenied(message) {
  return gatewayError("ACCESS_OR_RESOURCE_NOT_FOUND", message, {
    status: "BLOCKED",
    retryable: false,
  });
}

async function assertSchemaLease(transport, parameters) {
  const [rows] = await transport.execute([{ statement: SCHEMA_LEASE_CHECK, parameters }]);
  if (!rows[0]) throw accessDenied("Schema administration membership, resource, or lease is unavailable.");
  return rows[0];
}

async function assertProjectRead(transport, parameters) {
  const [rows] = await transport.execute([{ statement: PROJECT_READ_CHECK, parameters }]);
  if (!rows[0]) throw accessDenied("Project read membership is unavailable.");
  return rows[0];
}

async function assertBootstrapSchemaGuard(transport, parameters) {
  const [rows] = await transport.execute([{ statement: BOOTSTRAP_SCHEMA_CHECK, parameters }]);
  if (!rows[0]) {
    throw accessDenied("Initial schema bootstrap guard, owner, fence, or zero-membership invariant was lost.");
  }
  return rows[0];
}

function bootstrapDisabled(message = "Initial project-admin bootstrap is permanently disabled or owned by another worker.") {
  return gatewayError("BOOTSTRAP_DISABLED", message, {
    status: "BLOCKED",
    retryable: false,
  });
}

async function prepareInitialBootstrap(input, context) {
  const identity = validateIdentity(input);
  await assertTrustedRequestPrincipal(input.principal_id, context.resolvePrincipal);
  const nowMs = (context.clock ?? Date.now)();
  const parameters = {
    project_id: input.project_id,
    now_ms: nowMs,
    idempotency_key_hash: hashIdempotencyKey(input.idempotency_key),
    ...identityParameters(identity),
  };
  const [inspectRows] = await context.transport.execute([{
    statement: BOOTSTRAP_STATE_INSPECT,
    parameters,
  }]);
  const state = inspectRows[0];
  if (!state || !Number.isSafeInteger(state.membershipCount) || state.membershipCount < 0) {
    throw gatewayError("GRAPH_RESPONSE_INVALID", "Initial bootstrap state inspection returned an invalid result.", {
      status: "BLOCKED",
      retryable: true,
    });
  }
  const exactBootstrapOwner =
    state.principalId === identity.principal_id &&
    state.workerId === identity.worker_id &&
    state.idempotencyKeyHash === parameters.idempotency_key_hash;
  if (state.state === "BOOTSTRAPPED" && exactBootstrapOwner && state.membershipCount === 1) {
    return {
      identity,
      parameters: {
        ...parameters,
        bootstrap_fencing_token: state.fencingToken,
      },
      fencingToken: state.fencingToken,
      completedReplay: true,
    };
  }
  if (state.membershipCount !== 0 || state.state === "BOOTSTRAPPED") {
    throw bootstrapDisabled();
  }
  const exactPreparingOwner = state.state === "PREPARING" && exactBootstrapOwner;
  if (state.state === "PREPARING" && !exactPreparingOwner) {
    throw bootstrapDisabled("Initial project-admin bootstrap is already PREPARING under another exact owner/key.");
  }
  if (state.state !== null && state.state !== "UNINITIALIZED" && !exactPreparingOwner) {
    throw bootstrapDisabled("Initial project-admin bootstrap guard is in a closed state.");
  }
  if (!exactPreparingOwner) {
    context.markMutationStarted();
    await context.transport.execute([{ statement: BOOTSTRAP_GUARD_CONSTRAINT, parameters: {} }]);
  }
  const [prepareRows] = await context.transport.execute([{
    statement: BOOTSTRAP_SCHEMA_PREPARE,
    parameters,
  }]);
  const prepared = prepareRows[0];
  if (!prepared?.accepted || !Number.isSafeInteger(prepared.fencingToken) || prepared.fencingToken < 1) {
    throw bootstrapDisabled();
  }
  return {
    identity,
    parameters: {
      ...parameters,
      bootstrap_fencing_token: prepared.fencingToken,
    },
    fencingToken: prepared.fencingToken,
  };
}

async function runOperation(definition, input, context) {
  const { transport, migrations, queries } = context;
  if (CONCURRENCY_OPERATIONS.has(definition.operation)) {
    if (definition.operation === "membership-bootstrap") {
      const bootstrap = await prepareInitialBootstrap(input, context);
      if (bootstrap.completedReplay) {
        const details = await runConcurrencyOperation(definition, input, {
          transport,
          clock: context.clock,
          rolesForCapability: context.rolesForCapability,
          resolvePrincipal: context.resolvePrincipal,
          bootstrapFencingToken: bootstrap.fencingToken,
        });
        return successResult(definition, input.project_id, details.code, details);
      }
      const schema = await applyMigrations(transport, migrations, {
        onBeforeMutation: context.markMutationStarted,
        beforeDdl: () => assertBootstrapSchemaGuard(transport, bootstrap.parameters),
        afterDdl: () => assertBootstrapSchemaGuard(transport, bootstrap.parameters),
        beforeBoundary: () => assertBootstrapSchemaGuard(transport, bootstrap.parameters),
        afterBoundary: () => assertBootstrapSchemaGuard(transport, bootstrap.parameters),
        readStatement: authorizedBootstrapSchemaStatement,
        writeStatement: authorizedBootstrapSchemaStatement,
        constraintStatement: authorizedBootstrapConstraintStatement,
        authorizationParameters: bootstrap.parameters,
      });
      if (typeof context.recordSchema === "function") {
        await context.recordSchema({
          component: "nacl-graph-gateway",
          version: schema.currentVersion,
          checksum: schema.checksum,
        });
      }
      const details = await runConcurrencyOperation(definition, input, {
        transport,
        clock: context.clock,
        rolesForCapability: context.rolesForCapability,
        resolvePrincipal: context.resolvePrincipal,
        bootstrapFencingToken: bootstrap.fencingToken,
      });
      return successResult(definition, input.project_id, details.code, {
        ...details,
        schema,
        bootstrapFencingToken: bootstrap.fencingToken,
      });
    }
    if (definition.operation !== "concurrency-identity") context.markMutationStarted();
    const details = await runConcurrencyOperation(definition, input, {
      transport,
      clock: context.clock,
      rolesForCapability: context.rolesForCapability,
      resolvePrincipal: context.resolvePrincipal,
    });
    return successResult(definition, input.project_id, details.code, details);
  }
  switch (definition.operation) {
    case "schema-status": {
      const auth = await legacyAuthorization(input, "project.read", context);
      const schema = await schemaStatus(transport, migrations, {
        readStatement: authorizedReadStatement,
        constraintStatement: () => authorizedConstraintStatement(),
        beforeBoundary: () => assertProjectRead(transport, auth.parameters),
        afterBoundary: () => assertProjectRead(transport, auth.parameters),
        authorizationParameters: auth.parameters,
      });
      return successResult(definition, input.project_id, "SCHEMA_CURRENT", {
        schema,
        principalId: auth.identity.principal_id,
        workerId: auth.identity.worker_id,
      });
    }
    case "health": {
      const auth = await legacyAuthorization(input, "project.read", context);
      const authorizationOptions = {
        readStatement: authorizedReadStatement,
        constraintStatement: () => authorizedConstraintStatement(),
        beforeBoundary: () => assertProjectRead(transport, auth.parameters),
        afterBoundary: () => assertProjectRead(transport, auth.parameters),
        authorizationParameters: auth.parameters,
      };
      const schema = await schemaStatus(transport, migrations, authorizationOptions);
      const canary = query(queries, "transport-canary");
      const [rows] = await transport.execute([
        {
          statement: authorizedReadStatement(canary.statement),
          parameters: { ...canary.fixedParameters, ...auth.parameters },
        },
      ]);
      if (!rows[0]) throw accessDenied("Project read membership is unavailable.");
      if (rows[0].observed !== canary.fixedParameters.expected) {
        throw gatewayError("READ_CANARY_FAILED", "The graph read canary did not return the expected value.");
      }
      return successResult(definition, input.project_id, "GRAPH_HEALTHY", {
        schema,
        readCanary: "VERIFIED",
        principalId: auth.identity.principal_id,
        workerId: auth.identity.worker_id,
      });
    }
    case "read": {
      const auth = await legacyAuthorization(input, "project.read", context);
      await schemaStatus(transport, migrations, {
        readStatement: authorizedReadStatement,
        constraintStatement: () => authorizedConstraintStatement(),
        beforeBoundary: () => assertProjectRead(transport, auth.parameters),
        afterBoundary: () => assertProjectRead(transport, auth.parameters),
        authorizationParameters: auth.parameters,
      });
      const queryName = input.query === "canary" ? "transport-canary" : "summary";
      const selected = query(queries, queryName);
      if (selected.capability !== "read") {
        throw gatewayError("QUERY_CAPABILITY_MISMATCH", "The packaged query capability is invalid.");
      }
      const [rows] = await transport.execute([
        {
          statement: authorizedReadStatement(selected.statement),
          parameters: { ...(selected.fixedParameters ?? {}), ...auth.parameters },
        },
      ]);
      if (!rows[0]) throw accessDenied("Project read membership is unavailable.");
      if (input.query === "canary" && rows[0]?.observed !== selected.fixedParameters.expected) {
        throw gatewayError("READ_CANARY_FAILED", "The graph read canary did not return the expected value.");
      }
      return successResult(definition, input.project_id, "READ_VERIFIED", {
        query: input.query,
        rows,
        principalId: auth.identity.principal_id,
        workerId: auth.identity.worker_id,
      });
    }
    case "apply-migrations": {
      const auth = await legacyAuthorization(input, "schema.admin", context);
      const schemaAuthorization = await assertSchemaLease(transport, auth.parameters);
      const schema = await applyMigrations(transport, migrations, {
        onBeforeMutation: context.markMutationStarted,
        beforeDdl: () => assertSchemaLease(transport, auth.parameters),
        afterDdl: () => assertSchemaLease(transport, auth.parameters),
        beforeBoundary: () => assertSchemaLease(transport, auth.parameters),
        afterBoundary: () => assertSchemaLease(transport, auth.parameters),
        readStatement: authorizedSchemaStatement,
        writeStatement: authorizedSchemaStatement,
        constraintStatement: () => authorizedConstraintStatement({ schemaLease: true }),
        authorizationParameters: auth.parameters,
      });
      if (typeof context.recordSchema === "function") {
        await context.recordSchema({
          component: "nacl-graph-gateway",
          version: schema.currentVersion,
          checksum: schema.checksum,
        });
      }
      const finalAuthorization = await assertSchemaLease(transport, auth.parameters);
      return successResult(definition, input.project_id, "MIGRATIONS_APPLIED", {
        schema,
        principalId: auth.identity.principal_id,
        workerId: auth.identity.worker_id,
        membershipRevision: finalAuthorization.membershipRevision ?? schemaAuthorization.membershipRevision,
        fencingToken: finalAuthorization.fencingToken,
      });
    }
    case "write-canary": {
      const auth = await legacyAuthorization(input, "project.write", context);
      await schemaStatus(transport, migrations, {
        readStatement: authorizedReadStatement,
        constraintStatement: () => authorizedConstraintStatement(),
        beforeBoundary: () => assertProjectRead(transport, auth.parameters),
        afterBoundary: () => assertProjectRead(transport, auth.parameters),
        authorizationParameters: auth.parameters,
      });
      const write = query(queries, "write-canary");
      const readback = query(queries, "write-canary-readback");
      const parameters = {
        project_id: input.project_id,
        idempotency_key: input.idempotency_key,
        ...auth.parameters,
      };
      context.markMutationStarted();
      const [writeRows] = await transport.execute([{
        statement: authorizedWriteStatement(write.statement),
        parameters,
      }]);
      if (!writeRows[0]) throw accessDenied("Project write membership is unavailable.");
      const [readRows] = await transport.execute([{
        statement: authorizedReadStatement(readback.statement),
        parameters,
      }]);
      const observed = readRows[0];
      if (
        !observed ||
        observed.projectId !== input.project_id ||
        observed.idempotencyKey !== input.idempotency_key ||
        !Number.isInteger(observed.revision) ||
        observed.revision < 1
      ) {
        throw gatewayError("WRITE_READBACK_FAILED", "The confirmed write canary did not pass read-back.", {
          status: "PARTIALLY_VERIFIED",
          retryable: true,
        });
      }
      return successResult(definition, input.project_id, "WRITE_READBACK_VERIFIED", {
        canary: {
          revision: observed.revision,
          replay: writeRows[0]?.replay === true,
          idempotencyKeyHash: hashIdempotencyKey(input.idempotency_key),
        },
        principalId: auth.identity.principal_id,
        workerId: auth.identity.worker_id,
        membershipRevision: writeRows[0].membershipRevision,
      });
    }
    default:
      throw gatewayError("OPERATION_UNSUPPORTED", "The packaged gateway operation is unsupported.");
  }
}

export function createGraphGateway(dependencies = {}) {
  if (typeof dependencies.resolveProject !== "function") {
    throw new TypeError("createGraphGateway requires resolveProject");
  }
  const migrationPromise = dependencies.migrations
    ? Promise.resolve(dependencies.migrations)
    : loadMigrationCatalog();
  const queryPromise = dependencies.queries
    ? Promise.resolve(dependencies.queries)
    : loadQueryCatalog();
  const secretResolver = dependencies.resolveSecret ?? resolveSecret;
  const transportFactory = dependencies.createTransport ??
    ((profile, secret) => new Neo4jHttpTransport(profile, secret));
  const transportPool = dependencies.transportPool ?? createProjectTransportPool({
    createTransport: transportFactory,
  });
  const auditFactory = dependencies.createAuditSink ??
    ((profile) => new JsonlAuditSink(profile.auditPath));

  return {
    listTools() {
      return GRAPH_TOOL_DEFINITIONS.map(({ capability, operation, ...tool }) => tool);
    },

    async callTool(name, input = {}) {
      const definition = GRAPH_TOOL_BY_NAME.get(name);
      if (!definition) {
        return errorResult(gatewayError("TOOL_NOT_FOUND", "The requested graph tool is unavailable."));
      }
      const projectId = typeof input?.project_id === "string" ? input.project_id : undefined;
      const auditId = randomUUID();
      const started = Date.now();
      let profile;
      let audit;
      let mutationStarted = false;
      try {
        validateToolArguments(definition, input);
        if (typeof dependencies.preflight === "function") {
          await dependencies.preflight({ name, input, definition });
        }
        profile = validateProfile(
          await dependencies.resolveProject({
            projectId: input.project_id,
            projectRoot: input.project_root,
            operation: definition.operation,
          }),
          input.project_id,
          definition,
          input,
        );
        audit = auditFactory(profile);
        const writeLike = definition.capability !== "read";
        const idempotencyKeyHash = input.idempotency_key
          ? hashIdempotencyKey(input.idempotency_key)
          : undefined;
        if (writeLike) {
          await audit.append({
            auditId,
            projectId: input.project_id,
            operation: definition.operation,
            capability: definition.capability,
            phase: "attempt",
            status: "UNVERIFIED",
            code: "MUTATION_ATTEMPT",
            idempotencyKeyHash,
            principalId: typeof input.principal_id === "string" ? input.principal_id : undefined,
            workerId: typeof input.worker_id === "string" ? input.worker_id : undefined,
          });
        }
        const secret = await secretResolver(profile.secretReference);
        const transport = await transportPool.get({
          projectId: input.project_id,
          profile,
          secret,
        });
        const result = await runOperation(definition, input, {
          transport,
          migrations: await migrationPromise,
          queries: await queryPromise,
          markMutationStarted() {
            mutationStarted = true;
          },
          clock: dependencies.clock,
          rolesForCapability: dependencies.rolesForCapability,
          resolvePrincipal: dependencies.resolvePrincipal,
          recordSchema: profile.recordSchema,
        });
        await audit.append({
          auditId,
          projectId: input.project_id,
          operation: definition.operation,
          capability: definition.capability,
          phase: "complete",
          status: result.status,
          code: result.code,
          durationMs: Date.now() - started,
          idempotencyKeyHash,
          migrationVersion: result.schema?.currentVersion,
          schemaChecksum: result.schema?.checksum,
          principalId: result.principalId,
          workerId: result.workerId,
          membershipRevision: result.membershipRevision,
          fencingToken: result.fencingToken,
          resourceRevision: result.revision,
        });
        return { ...result, auditId };
      } catch (error) {
        let normalized = normalizeGatewayError(error);
        if (
          mutationStarted &&
          ["GRAPH_TIMEOUT", "GRAPH_UNAVAILABLE", "GRAPH_HTTP_ERROR", "GRAPH_RESPONSE_INVALID"].includes(normalized.code)
        ) {
          normalized = gatewayError(
            "MUTATION_OUTCOME_UNKNOWN",
            "The graph transport failed after a mutation began; read back before retrying.",
            { status: "PARTIALLY_VERIFIED", retryable: true },
          );
        }
        if (
          mutationStarted &&
          definition.operation === "apply-migrations" &&
          normalized.code === "ACCESS_OR_RESOURCE_NOT_FOUND"
        ) {
          normalized = gatewayError(
            "MIGRATION_AUTHORIZATION_LOST_AFTER_BOUNDARY",
            "Schema membership, lease, or fence was lost after migration work began; inspect the ledger and schema before retrying.",
            { status: "PARTIALLY_VERIFIED", retryable: false },
          );
        }
        if (normalized.code === "AUDIT_UNAVAILABLE" && mutationStarted) {
          normalized = gatewayError(
            "AUDIT_COMPLETION_FAILED",
            "The mutation completed but its final audit record could not be persisted.",
            { status: "PARTIALLY_VERIFIED", retryable: true },
          );
        }
        if (audit && normalized.code !== "AUDIT_UNAVAILABLE") {
          try {
            await audit.append({
              auditId,
              projectId,
              operation: definition.operation,
              capability: definition.capability,
              phase: "failed",
              status: normalized.status,
              code: normalized.code,
              retryable: normalized.retryable,
              durationMs: Date.now() - started,
              idempotencyKeyHash: input?.idempotency_key
                ? hashIdempotencyKey(input.idempotency_key)
                : undefined,
            });
          } catch {
            if (mutationStarted) {
              normalized = gatewayError(
                "MUTATION_AUDIT_FAILED",
                "A graph mutation failed and its failure audit could not be persisted.",
                { status: "PARTIALLY_VERIFIED", retryable: true },
              );
            }
          }
        }
        return errorResult(normalized, {
          capability: definition.capability,
          operation: definition.operation,
          projectId,
          auditId: profile ? auditId : undefined,
        });
      }
    },
  };
}
