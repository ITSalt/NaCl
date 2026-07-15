import { rolesForCapability as defaultRolesForCapability } from "./authorization.mjs";
import {
  allocationPrefix,
  concurrencyRequestContext,
  deriveWorkerId,
} from "./concurrency.mjs";
import { ALLOCATION_STATEMENTS, CONCURRENCY_STATEMENTS } from "./concurrency-cypher.mjs";
import { gatewayError } from "./errors.mjs";
import { assertTrustedRequestPrincipal } from "./principal.mjs";

export const CONCURRENCY_OPERATIONS = new Set([
  "concurrency-identity",
  "lease-acquire",
  "lease-heartbeat",
  "lease-release",
  "lease-handoff",
  "resource-mutate",
  "allocate-and-create",
  "membership-bootstrap",
  "membership-set",
]);

function pullRequestParameters(identity, prefix = "") {
  return {
    [`${prefix}pull_request_url`]: identity.pull_request?.url ?? null,
    [`${prefix}pull_request_number`]: identity.pull_request?.number ?? null,
    [`${prefix}pull_request_head_sha`]: identity.pull_request?.head_sha ?? null,
  };
}

function identityParameters(identity, prefix = "") {
  return {
    [`${prefix}principal_id`]: identity.principal_id,
    [`${prefix}client_id`]: identity.client_id,
    [`${prefix}session_id`]: identity.session_id,
    [`${prefix}worker_id`]: identity.worker_id,
    [`${prefix}worktree_id`]: identity.worktree_id,
    [`${prefix}branch`]: identity.branch,
    [`${prefix}base_sha`]: identity.base_sha,
    ...pullRequestParameters(identity, prefix),
  };
}

function parameters(input, context, allowedRoles, runtime = {}) {
  return {
    project_id: input.project_id,
    resource_type: context.resourceType,
    resource_id: context.resourceId ?? null,
    allowed_roles: allowedRoles ?? [],
    now_ms: context.nowMs,
    expires_at_ms: context.expiresAtMs ?? null,
    fencing_token: input.fencing_token ?? null,
    expected_revision: input.expected_revision ?? null,
    idempotency_key_hash: context.idempotencyKeyHash ?? null,
    payload_hash: context.payloadHash,
    request_nonce: context.requestNonce,
    bootstrap_fencing_token: runtime.bootstrapFencingToken ?? null,
    changes: context.changes ?? {},
    target_principal_id: input.target_principal_id ?? null,
    target_role: input.target_role ?? null,
    target_active: input.target_active ?? null,
    ...identityParameters(context.identity),
    ...(context.targetIdentity ? identityParameters(context.targetIdentity, "target_") : {}),
  };
}

function rowError(row) {
  const common = { retryable: false, details: { ...row } };
  switch (row?.code) {
    case "LEASE_HELD":
      return gatewayError("LEASE_HELD", "The protected resource is leased by another worker.", {
        ...common,
        status: "BLOCKED",
        retryable: true,
      });
    case "STALE_FENCING_TOKEN":
      return gatewayError("STALE_FENCING_TOKEN", "The lease is expired, released, transferred, or fenced by a newer owner.", {
        ...common,
        status: "BLOCKED",
      });
    case "REVISION_CONFLICT":
      return gatewayError("CONFLICT", "The protected resource revision changed; reread and replan.", {
        ...common,
        status: "BLOCKED",
        details: { reason: "REVISION_CONFLICT", currentRevision: row.currentRevision },
      });
    case "IDEMPOTENCY_CONFLICT":
      return gatewayError("IDEMPOTENCY_CONFLICT", "The idempotency key was already used with a different payload.", common);
    case "IDEMPOTENCY_INCOMPLETE":
      return gatewayError(
        "IDEMPOTENCY_INCOMPLETE",
        "The idempotency ledger contains an incomplete record; an administrator must reconcile it before retrying.",
        {
        ...common,
          status: "BLOCKED",
          details: { ...row, recovery: "ADMIN_RECONCILIATION_REQUIRED" },
        },
      );
    case "BOOTSTRAP_DISABLED":
      return gatewayError("BOOTSTRAP_DISABLED", "Initial project-admin bootstrap is permanently disabled for this project.", {
        ...common,
        status: "BLOCKED",
      });
    case "LAST_ADMIN_REQUIRED":
      return gatewayError("LAST_ADMIN_REQUIRED", "The last active project administrator cannot be revoked or demoted.", {
        ...common,
        status: "BLOCKED",
      });
    case "RESOURCE_NOT_FOUND":
    case "LEASE_REQUIRED":
      return gatewayError(row.code, "The protected resource or its active lease is unavailable.", {
        ...common,
        status: "BLOCKED",
      });
    default:
      return gatewayError("CONCURRENCY_REJECTED", "The graph rejected the concurrent operation.", {
        ...common,
        status: "BLOCKED",
      });
  }
}

function concurrencySuccess(definition, input, context, row) {
  const base = {
    code: row.code,
    graphAuthoritative: true,
    localCacheMode: "derived-only",
    offlineWriteQueue: false,
    resourceType: context.resourceType,
    resourceId: row.resourceId ?? context.resourceId,
    principalId: row.principalId ?? context.identity.principal_id,
    workerId: row.workerId ?? context.identity.worker_id,
    membershipRevision: row.membershipRevision,
    replay: row.replay === true,
  };
  if (Number.isSafeInteger(row.fencingToken)) base.fencingToken = row.fencingToken;
  if (Number.isSafeInteger(row.revision)) base.revision = row.revision;
  if (typeof row.expiresAt === "string") base.expiresAt = row.expiresAt;
  if (definition.operation === "allocate-and-create") base.idPrefix = allocationPrefix(context.resourceType);
  if (row.branch) {
    base.git = {
      branch: row.branch,
      worktreeId: row.worktreeId,
      baseSha: row.baseSha,
      ...(row.pullRequestUrl
        ? {
            pullRequest: {
              url: row.pullRequestUrl,
              number: row.pullRequestNumber,
              headSha: row.pullRequestHeadSha,
            },
          }
        : {}),
    };
  }
  return base;
}

export async function runConcurrencyOperation(definition, input, runtime) {
  if (!CONCURRENCY_OPERATIONS.has(definition.operation)) {
    throw gatewayError("OPERATION_UNSUPPORTED", "The concurrency operation is not allow-listed.");
  }
  const trustedPrincipal = await assertTrustedRequestPrincipal(input.principal_id, runtime.resolvePrincipal);
  if (definition.operation === "concurrency-identity") {
    return {
      code: "IDENTITY_DERIVED",
      workerId: deriveWorkerId({
        principal_id: input.principal_id,
        client_id: input.client_id,
        session_id: input.session_id,
      }),
      graphAuthoritative: true,
      localCacheMode: "derived-only",
      offlineWriteQueue: false,
      principalId: trustedPrincipal.principal_id,
      principalAssurance: trustedPrincipal.assurance,
    };
  }
  const clock = runtime.clock ?? Date.now;
  const context = concurrencyRequestContext(definition, input, { nowMs: clock() });
  const bootstrapOperation = definition.operation === "membership-bootstrap";
  const rolesForCapability = runtime.rolesForCapability ?? defaultRolesForCapability;
  const allowedRoles = bootstrapOperation ? [] : rolesForCapability(context.capability);
  if (!bootstrapOperation && (!Array.isArray(allowedRoles) || allowedRoles.length === 0)) {
    throw gatewayError("AUTHORIZATION_POLICY_UNAVAILABLE", "No server-side role policy grants this operation.", {
      status: "BLOCKED",
    });
  }
  const statement = definition.operation === "allocate-and-create"
    ? ALLOCATION_STATEMENTS[context.resourceType]
    : CONCURRENCY_STATEMENTS[definition.operation];
  if (typeof statement !== "string") {
    throw gatewayError("QUERY_CATALOG_CORRUPT", "The named concurrency statement is unavailable.");
  }
  const [rows] = await runtime.transport.execute([
    { statement, parameters: parameters(input, context, allowedRoles, runtime) },
  ]);
  const row = rows[0];
  if (!row) {
    throw gatewayError(
      "ACCESS_OR_RESOURCE_NOT_FOUND",
      "The authoritative membership is inactive/unauthorized or the protected resource is unavailable.",
      { status: "BLOCKED", retryable: false },
    );
  }
  if (row.accepted !== true) throw rowError(row);
  return concurrencySuccess(definition, input, context, row);
}
