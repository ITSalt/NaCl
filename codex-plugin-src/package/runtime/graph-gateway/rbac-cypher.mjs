export const SCHEMA_MIGRATION_RESOURCE_ID = "MIG-GATEWAY";

const AUTHORIZE_READ = `MATCH (membership:ProjectMembership {
  project_id: $project_id,
  principal_id: $principal_id
})
WITH membership
WHERE membership.active = true AND membership.role IN $allowed_roles`;

const AUTHORIZE_WRITE = `MATCH (membership:ProjectMembership {
  project_id: $project_id,
  principal_id: $principal_id
})
SET membership.auth_lock_version = membership.auth_lock_version
WITH membership
WHERE membership.active = true AND membership.role IN $allowed_roles`;

export const BOOTSTRAP_GUARD_CONSTRAINT =
  "CREATE CONSTRAINT nacl_project_authorization_identity IF NOT EXISTS FOR (guard:ProjectAuthorization) REQUIRE guard.project_id IS UNIQUE";

export const BOOTSTRAP_STATE_INSPECT = `OPTIONAL MATCH (guard:ProjectAuthorization {project_id: $project_id})
OPTIONAL MATCH (existing_membership:ProjectMembership {project_id: $project_id})
RETURN guard.state AS state,
  guard.bootstrap_principal_id AS principalId,
  guard.bootstrap_worker_id AS workerId,
  guard.bootstrap_idempotency_key_hash AS idempotencyKeyHash,
  guard.bootstrap_fencing_token AS fencingToken,
  count(existing_membership) AS membershipCount`;

export const BOOTSTRAP_SCHEMA_PREPARE = `MERGE (guard:ProjectAuthorization {project_id: $project_id})
ON CREATE SET guard.state = 'UNINITIALIZED',
              guard.lock_version = 0,
              guard.bootstrap_fencing_token = 0,
              guard.created_at = datetime({epochMillis: $now_ms})
SET guard.lock_version = guard.lock_version
WITH guard
OPTIONAL MATCH (existing_membership:ProjectMembership {project_id: $project_id})
WITH guard, count(existing_membership) AS membership_count
WITH guard, membership_count,
  CASE
    WHEN membership_count <> 0 OR guard.state = 'BOOTSTRAPPED' THEN 'BOOTSTRAP_DISABLED'
    WHEN guard.state = 'PREPARING'
      AND guard.bootstrap_principal_id = $principal_id
      AND guard.bootstrap_worker_id = $worker_id
      AND guard.bootstrap_idempotency_key_hash = $idempotency_key_hash THEN 'BOOTSTRAP_PREPARED'
    WHEN guard.state = 'UNINITIALIZED' THEN 'BOOTSTRAP_PREPARED'
    ELSE 'BOOTSTRAP_DISABLED'
  END AS outcome
FOREACH (_ IN CASE WHEN outcome = 'BOOTSTRAP_PREPARED' AND guard.state = 'UNINITIALIZED' THEN [1] ELSE [] END |
  SET guard.state = 'PREPARING',
      guard.bootstrap_principal_id = $principal_id,
      guard.bootstrap_worker_id = $worker_id,
      guard.bootstrap_idempotency_key_hash = $idempotency_key_hash,
      guard.bootstrap_fencing_token = coalesce(guard.bootstrap_fencing_token, 0) + 1,
      guard.preparing_at = datetime({epochMillis: $now_ms})
)
RETURN outcome = 'BOOTSTRAP_PREPARED' AS accepted,
  outcome AS code,
  guard.bootstrap_fencing_token AS fencingToken,
  membership_count AS membershipCount`;

const AUTHORIZE_BOOTSTRAP_SCHEMA = `MATCH (guard:ProjectAuthorization {project_id: $project_id})
SET guard.lock_version = guard.lock_version
WITH guard
OPTIONAL MATCH (existing_membership:ProjectMembership {project_id: $project_id})
WITH guard, count(existing_membership) AS membership_count
WHERE membership_count = 0
  AND guard.state = 'PREPARING'
  AND guard.bootstrap_principal_id = $principal_id
  AND guard.bootstrap_worker_id = $worker_id
  AND guard.bootstrap_idempotency_key_hash = $idempotency_key_hash
  AND guard.bootstrap_fencing_token = $bootstrap_fencing_token`;

export const BOOTSTRAP_SCHEMA_CHECK = `${AUTHORIZE_BOOTSTRAP_SCHEMA}
RETURN guard.bootstrap_fencing_token AS fencingToken,
  membership_count AS membershipCount`;

const AUTHORIZE_SCHEMA_LEASE = `${AUTHORIZE_WRITE}
MATCH (schema_resource:SchemaMigration {
  project_id: $project_id,
  id: $schema_resource_id
})
MATCH (schema_lease:ResourceLease {
  project_id: $project_id,
  resource_type: 'SchemaMigration',
  resource_id: $schema_resource_id
})
SET schema_lease.lock_version = schema_lease.lock_version
WITH membership, schema_resource, schema_lease
WHERE schema_lease.principal_id = $principal_id
  AND schema_lease.worker_id = $worker_id
  AND schema_lease.fencing_token = $fencing_token
  AND schema_lease.expires_at > datetime({epochMillis: $now_ms})`;

export function authorizedReadStatement(statement) {
  return `${AUTHORIZE_READ}\n${statement}`;
}

export function authorizedWriteStatement(statement) {
  return `${AUTHORIZE_WRITE}\n${statement}`;
}

export function authorizedSchemaStatement(statement) {
  return `${AUTHORIZE_SCHEMA_LEASE}\n${statement}`;
}

export function authorizedBootstrapSchemaStatement(statement) {
  return `${AUTHORIZE_BOOTSTRAP_SCHEMA}\n${statement}`;
}

export function authorizedConstraintStatement({ schemaLease = false } = {}) {
  void schemaLease;
  return "SHOW CONSTRAINTS YIELD name WHERE name IN $names RETURN collect(name) AS names";
}

export function authorizedBootstrapConstraintStatement() {
  return "SHOW CONSTRAINTS YIELD name WHERE name IN $names RETURN collect(name) AS names";
}

export const PROJECT_READ_CHECK = `${AUTHORIZE_READ}
RETURN membership.revision AS membershipRevision`;

export const SCHEMA_LEASE_CHECK = `${AUTHORIZE_SCHEMA_LEASE}
RETURN membership.revision AS membershipRevision,
  schema_lease.fencing_token AS fencingToken,
  toString(schema_lease.expires_at) AS expiresAt`;
