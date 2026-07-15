import { CONCURRENCY_RESOURCE_TYPES, allocationPrefix } from "./concurrency.mjs";

const AUTHORIZE_WRITE = `
MATCH (membership:ProjectMembership {project_id: $project_id, principal_id: $principal_id})
SET membership.auth_lock_version = membership.auth_lock_version
WITH membership
WHERE membership.active = true AND membership.role IN $allowed_roles
`.trim();

const RESOURCE_MATCH = `
MATCH (resource {id: $resource_id})
WHERE $resource_type IN labels(resource)
  AND (resource.project_id IS NULL OR resource.project_id = $project_id)
`.trim();

function leaseStatement({
  operation,
  acceptedCode,
  rejectedCode,
  createLease = false,
  acceptedExpression,
  mutation,
  resultPrincipal = "lease.principal_id",
  resultWorker = "lease.worker_id",
  resultExpiresAt = "lease.expires_at",
  resultBranch = "lease.branch",
  resultWorktree = "lease.worktree_id",
  resultBaseSha = "lease.base_sha",
  resultPullRequestUrl = "lease.pull_request_url",
  resultPullRequestNumber = "lease.pull_request_number",
  resultPullRequestHeadSha = "lease.pull_request_head_sha",
}) {
  const newRequestLease = createLease
    ? `MERGE (lease:ResourceLease {
        project_id: $project_id,
        resource_type: $resource_type,
        resource_id: $resource_id
      })
      ON CREATE SET lease.fencing_token = 0,
                    lease.worker_id = null,
                    lease.expires_at = null,
                    lease.lock_version = 0
      SET lease.lock_version = lease.lock_version
      RETURN lease`
    : `OPTIONAL MATCH (lease:ResourceLease {
        project_id: $project_id,
        resource_type: $resource_type,
        resource_id: $resource_id
      })
      FOREACH (_ IN CASE WHEN lease IS NULL THEN [] ELSE [1] END |
        SET lease.lock_version = lease.lock_version
      )
      RETURN lease`;
  return `${AUTHORIZE_WRITE}
${RESOURCE_MATCH}
MERGE (request:IdempotencyRecord {
  project_id: $project_id,
  key_hash: $idempotency_key_hash
})
ON CREATE SET request.request_nonce = $request_nonce,
              request.payload_hash = $payload_hash,
              request.state = 'PENDING',
              request.lock_version = 0,
              request.created_at = datetime({epochMillis: $now_ms})
SET request.lock_version = request.lock_version
WITH membership, resource, request,
  request.request_nonce = $request_nonce AS request_created_here,
  request.payload_hash = $payload_hash AS same_payload
CALL {
  WITH request_created_here, same_payload
  WITH request_created_here, same_payload
  WHERE request_created_here AND same_payload
  ${newRequestLease}
  UNION
  WITH request_created_here, same_payload
  WITH request_created_here, same_payload
  WHERE NOT (request_created_here AND same_payload)
  OPTIONAL MATCH (lease:ResourceLease {
    project_id: $project_id,
    resource_type: $resource_type,
    resource_id: $resource_id
  })
  RETURN lease
}
WITH membership, request, lease, request_created_here, same_payload,
  CASE
    WHEN NOT same_payload THEN 'IDEMPOTENCY_CONFLICT'
    WHEN NOT request_created_here AND request.state = 'COMPLETED' THEN 'REPLAY'
    WHEN NOT request_created_here THEN 'IDEMPOTENCY_INCOMPLETE'
    WHEN lease IS NOT NULL AND (${acceptedExpression}) THEN '${acceptedCode}'
    ELSE '${rejectedCode}'
  END AS outcome
FOREACH (_ IN CASE WHEN outcome = '${acceptedCode}' THEN [1] ELSE [] END |
  ${mutation}
)
FOREACH (_ IN CASE WHEN request_created_here THEN [1] ELSE [] END |
  SET request.state = 'COMPLETED',
      request.operation = '${operation}',
      request.resource_type = $resource_type,
      request.resource_id = $resource_id,
      request.result_code = outcome,
      request.result_accepted = outcome = '${acceptedCode}',
      request.result_principal_id = ${resultPrincipal},
      request.result_worker_id = ${resultWorker},
      request.result_fencing_token = lease.fencing_token,
      request.result_expires_at = ${resultExpiresAt},
      request.result_branch = ${resultBranch},
      request.result_worktree_id = ${resultWorktree},
      request.result_base_sha = ${resultBaseSha},
      request.result_pull_request_url = ${resultPullRequestUrl},
      request.result_pull_request_number = ${resultPullRequestNumber},
      request.result_pull_request_head_sha = ${resultPullRequestHeadSha},
      request.principal_id = $principal_id,
      request.worker_id = $worker_id,
      request.membership_revision = membership.revision,
      request.completed_at = datetime({epochMillis: $now_ms})
)
RETURN
  CASE WHEN outcome = 'REPLAY' THEN request.result_code ELSE outcome END AS code,
  CASE WHEN outcome = 'REPLAY' THEN request.result_accepted ELSE outcome = '${acceptedCode}' END AS accepted,
  outcome = 'REPLAY' AS replay,
  $resource_id AS resourceId,
  CASE WHEN outcome IN ['REPLAY', 'IDEMPOTENCY_INCOMPLETE'] THEN request.result_principal_id ELSE ${resultPrincipal} END AS principalId,
  CASE WHEN outcome IN ['REPLAY', 'IDEMPOTENCY_INCOMPLETE'] THEN request.result_worker_id ELSE ${resultWorker} END AS workerId,
  CASE WHEN outcome IN ['REPLAY', 'IDEMPOTENCY_INCOMPLETE'] THEN request.result_fencing_token ELSE lease.fencing_token END AS fencingToken,
  toString(CASE WHEN outcome IN ['REPLAY', 'IDEMPOTENCY_INCOMPLETE'] THEN request.result_expires_at ELSE ${resultExpiresAt} END) AS expiresAt,
  CASE WHEN outcome IN ['REPLAY', 'IDEMPOTENCY_INCOMPLETE'] THEN request.result_branch ELSE ${resultBranch} END AS branch,
  CASE WHEN outcome IN ['REPLAY', 'IDEMPOTENCY_INCOMPLETE'] THEN request.result_worktree_id ELSE ${resultWorktree} END AS worktreeId,
  CASE WHEN outcome IN ['REPLAY', 'IDEMPOTENCY_INCOMPLETE'] THEN request.result_base_sha ELSE ${resultBaseSha} END AS baseSha,
  CASE WHEN outcome IN ['REPLAY', 'IDEMPOTENCY_INCOMPLETE'] THEN request.result_pull_request_url ELSE ${resultPullRequestUrl} END AS pullRequestUrl,
  CASE WHEN outcome IN ['REPLAY', 'IDEMPOTENCY_INCOMPLETE'] THEN request.result_pull_request_number ELSE ${resultPullRequestNumber} END AS pullRequestNumber,
  CASE WHEN outcome IN ['REPLAY', 'IDEMPOTENCY_INCOMPLETE'] THEN request.result_pull_request_head_sha ELSE ${resultPullRequestHeadSha} END AS pullRequestHeadSha,
  CASE WHEN outcome IN ['REPLAY', 'IDEMPOTENCY_INCOMPLETE'] THEN request.membership_revision ELSE membership.revision END AS membershipRevision`;
}

export const LEASE_ACQUIRE = leaseStatement({
  operation: "lease-acquire",
  acceptedCode: "LEASE_ACQUIRED",
  rejectedCode: "LEASE_HELD",
  createLease: true,
  acceptedExpression: `lease.worker_id IS NULL
    OR lease.expires_at IS NULL
    OR lease.expires_at <= datetime({epochMillis: $now_ms})
    OR (lease.worker_id = $worker_id AND lease.expires_at > datetime({epochMillis: $now_ms}))`,
  mutation: `SET lease.fencing_token = coalesce(lease.fencing_token, 0) + CASE
        WHEN lease.worker_id IS NULL OR lease.expires_at IS NULL OR lease.expires_at <= datetime({epochMillis: $now_ms}) THEN 1
        ELSE 0
      END,
      lease.principal_id = $principal_id,
      lease.client_id = $client_id,
      lease.session_id = $session_id,
      lease.worker_id = $worker_id,
      lease.worktree_id = $worktree_id,
      lease.branch = $branch,
      lease.base_sha = $base_sha,
      lease.pull_request_url = $pull_request_url,
      lease.pull_request_number = $pull_request_number,
      lease.pull_request_head_sha = $pull_request_head_sha,
      lease.acquired_at = CASE
        WHEN lease.worker_id IS NULL OR lease.expires_at IS NULL OR lease.expires_at <= datetime({epochMillis: $now_ms}) THEN datetime({epochMillis: $now_ms})
        ELSE lease.acquired_at
      END,
      lease.heartbeat_at = datetime({epochMillis: $now_ms}),
      lease.expires_at = datetime({epochMillis: $expires_at_ms}),
      lease.membership_revision = membership.revision,
      lease.last_idempotency_key_hash = $idempotency_key_hash`,
});

export const LEASE_HEARTBEAT = leaseStatement({
  operation: "lease-heartbeat",
  acceptedCode: "LEASE_HEARTBEAT_ACCEPTED",
  rejectedCode: "STALE_FENCING_TOKEN",
  acceptedExpression: `lease.worker_id = $worker_id
    AND lease.principal_id = $principal_id
    AND lease.fencing_token = $fencing_token
    AND lease.expires_at > datetime({epochMillis: $now_ms})`,
  mutation: `SET lease.heartbeat_at = datetime({epochMillis: $now_ms}),
      lease.expires_at = datetime({epochMillis: $expires_at_ms}),
      lease.membership_revision = membership.revision,
      lease.last_idempotency_key_hash = $idempotency_key_hash`,
});

export const LEASE_RELEASE = leaseStatement({
  operation: "lease-release",
  acceptedCode: "LEASE_RELEASED",
  rejectedCode: "STALE_FENCING_TOKEN",
  acceptedExpression: `lease.worker_id = $worker_id
    AND lease.principal_id = $principal_id
    AND lease.fencing_token = $fencing_token
    AND lease.expires_at > datetime({epochMillis: $now_ms})`,
  mutation: `SET lease.worker_id = null,
      lease.client_id = null,
      lease.session_id = null,
      lease.worktree_id = null,
      lease.branch = null,
      lease.base_sha = null,
      lease.pull_request_url = null,
      lease.pull_request_number = null,
      lease.pull_request_head_sha = null,
      lease.heartbeat_at = null,
      lease.expires_at = null,
      lease.released_at = datetime({epochMillis: $now_ms}),
      lease.released_by_principal = $principal_id,
      lease.released_by_worker = $worker_id,
      lease.membership_revision = membership.revision,
      lease.last_idempotency_key_hash = $idempotency_key_hash`,
  resultPrincipal: "$principal_id",
  resultWorker: "$worker_id",
  resultExpiresAt: "null",
  resultBranch: "$branch",
  resultWorktree: "$worktree_id",
  resultBaseSha: "$base_sha",
  resultPullRequestUrl: "$pull_request_url",
  resultPullRequestNumber: "$pull_request_number",
  resultPullRequestHeadSha: "$pull_request_head_sha",
});

export const LEASE_HANDOFF = leaseStatement({
  operation: "lease-handoff",
  acceptedCode: "LEASE_HANDOFF_ACCEPTED",
  rejectedCode: "STALE_FENCING_TOKEN",
  acceptedExpression: `lease.worker_id = $worker_id
    AND lease.principal_id = $principal_id
    AND lease.fencing_token = $fencing_token
    AND lease.expires_at > datetime({epochMillis: $now_ms})`,
  mutation: `SET lease.fencing_token = lease.fencing_token + 1,
      lease.principal_id = $target_principal_id,
      lease.client_id = $target_client_id,
      lease.session_id = $target_session_id,
      lease.worker_id = $target_worker_id,
      lease.worktree_id = $target_worktree_id,
      lease.branch = $target_branch,
      lease.base_sha = $target_base_sha,
      lease.pull_request_url = $target_pull_request_url,
      lease.pull_request_number = $target_pull_request_number,
      lease.pull_request_head_sha = $target_pull_request_head_sha,
      lease.acquired_at = datetime({epochMillis: $now_ms}),
      lease.heartbeat_at = datetime({epochMillis: $now_ms}),
      lease.expires_at = datetime({epochMillis: $expires_at_ms}),
      lease.handed_off_by_principal = $principal_id,
      lease.handed_off_by_worker = $worker_id,
      lease.membership_revision = membership.revision,
      lease.last_idempotency_key_hash = $idempotency_key_hash`,
  resultPrincipal: "$target_principal_id",
  resultWorker: "$target_worker_id",
  resultBranch: "$target_branch",
  resultWorktree: "$target_worktree_id",
  resultBaseSha: "$target_base_sha",
  resultPullRequestUrl: "$target_pull_request_url",
  resultPullRequestNumber: "$target_pull_request_number",
  resultPullRequestHeadSha: "$target_pull_request_head_sha",
});

export const RESOURCE_MUTATE = `${AUTHORIZE_WRITE}
OPTIONAL MATCH (resource {id: $resource_id})
WHERE $resource_type IN labels(resource)
  AND (resource.project_id IS NULL OR resource.project_id = $project_id)
OPTIONAL MATCH (lease:ResourceLease {
  project_id: $project_id,
  resource_type: $resource_type,
  resource_id: $resource_id
})
FOREACH (_ IN CASE WHEN lease IS NULL THEN [] ELSE [1] END |
  SET lease.lock_version = lease.lock_version
)
MERGE (request:IdempotencyRecord {
  project_id: $project_id,
  key_hash: $idempotency_key_hash
})
ON CREATE SET request.request_nonce = $request_nonce,
              request.payload_hash = $payload_hash,
              request.state = 'PENDING',
              request.lock_version = 0,
              request.created_at = datetime({epochMillis: $now_ms})
SET request.lock_version = request.lock_version
WITH membership, resource, lease, request,
  request.request_nonce = $request_nonce AS created_here,
  request.payload_hash = $payload_hash AS same_payload
WITH membership, resource, lease, request, created_here, same_payload,
  CASE
    WHEN NOT same_payload THEN 'IDEMPOTENCY_CONFLICT'
    WHEN NOT created_here AND request.state = 'COMPLETED' THEN 'REPLAY'
    WHEN NOT created_here THEN 'IDEMPOTENCY_INCOMPLETE'
    WHEN resource IS NULL THEN 'RESOURCE_NOT_FOUND'
    WHEN lease IS NULL THEN 'LEASE_REQUIRED'
    WHEN lease.worker_id <> $worker_id
      OR lease.principal_id <> $principal_id
      OR lease.fencing_token <> $fencing_token
      OR lease.expires_at <= datetime({epochMillis: $now_ms}) THEN 'STALE_FENCING_TOKEN'
    WHEN coalesce(resource.revision, 0) <> $expected_revision THEN 'REVISION_CONFLICT'
    ELSE 'MUTATION_ACCEPTED'
  END AS outcome
FOREACH (_ IN CASE WHEN outcome = 'MUTATION_ACCEPTED' THEN [1] ELSE [] END |
  SET resource += $changes,
      resource.revision = $expected_revision + 1,
      resource.updated_at = datetime({epochMillis: $now_ms}),
      resource.updated_by_principal = $principal_id,
      resource.updated_by_worker = $worker_id,
      resource.updated_from_client = $client_id,
      resource.updated_from_session = $session_id,
      resource.updated_from_worktree = $worktree_id,
      resource.updated_from_branch = $branch,
      resource.updated_from_base_sha = $base_sha,
      resource.updated_from_pull_request_url = $pull_request_url,
      resource.updated_from_pull_request_number = $pull_request_number,
      resource.updated_from_pull_request_head_sha = $pull_request_head_sha,
      resource.membership_revision = membership.revision,
      resource.fencing_token = $fencing_token
)
FOREACH (_ IN CASE WHEN created_here THEN [1] ELSE [] END |
  SET request.state = 'COMPLETED',
      request.operation = 'resource-mutate',
      request.resource_type = $resource_type,
      request.resource_id = $resource_id,
      request.result_code = outcome,
      request.result_revision = CASE WHEN outcome = 'MUTATION_ACCEPTED' THEN $expected_revision + 1 ELSE coalesce(resource.revision, 0) END,
      request.principal_id = $principal_id,
      request.worker_id = $worker_id,
      request.membership_revision = membership.revision,
      request.completed_at = datetime({epochMillis: $now_ms})
)
RETURN
  CASE WHEN outcome = 'REPLAY' THEN request.result_code ELSE outcome END AS code,
  CASE WHEN outcome = 'REPLAY' THEN request.result_code = 'MUTATION_ACCEPTED' ELSE outcome = 'MUTATION_ACCEPTED' END AS accepted,
  outcome = 'REPLAY' AS replay,
  request.result_revision AS revision,
  coalesce(resource.revision, 0) AS currentRevision,
  request.principal_id AS principalId,
  request.worker_id AS workerId,
  request.membership_revision AS membershipRevision`;

export const MEMBERSHIP_SET = `${AUTHORIZE_WRITE}
MERGE (target:ProjectMembership {project_id: $project_id, principal_id: $target_principal_id})
ON CREATE SET target.created_nonce = $request_nonce,
              target.active = false,
              target.role = $target_role,
              target.revision = 0
SET target.auth_lock_version = coalesce(target.auth_lock_version, 0)
MERGE (request:IdempotencyRecord {
  project_id: $project_id,
  key_hash: $idempotency_key_hash
})
ON CREATE SET request.request_nonce = $request_nonce,
              request.payload_hash = $payload_hash,
              request.state = 'PENDING',
              request.lock_version = 0,
              request.created_at = datetime({epochMillis: $now_ms})
SET request.lock_version = request.lock_version
WITH membership, target, request,
  target.created_nonce = $request_nonce AS target_created_here,
  request.request_nonce = $request_nonce AS request_created_here,
  request.payload_hash = $payload_hash AS same_payload
OPTIONAL MATCH (other_admin:ProjectMembership {project_id: $project_id})
WHERE other_admin.principal_id <> $target_principal_id
  AND other_admin.active = true
  AND other_admin.role = 'project_admin'
WITH membership, target, request, target_created_here, request_created_here, same_payload,
  count(other_admin) AS other_active_admins,
  coalesce(target.revision, 0) AS current_target_revision
WITH membership, target, request, target_created_here, request_created_here,
  same_payload, other_active_admins, current_target_revision,
  CASE
    WHEN NOT same_payload THEN 'IDEMPOTENCY_CONFLICT'
    WHEN NOT request_created_here AND request.state = 'COMPLETED' THEN 'REPLAY'
    WHEN NOT request_created_here THEN 'IDEMPOTENCY_INCOMPLETE'
    WHEN coalesce(target.revision, 0) <> $expected_revision THEN 'REVISION_CONFLICT'
    WHEN target.active = true
      AND target.role = 'project_admin'
      AND ($target_active = false OR $target_role <> 'project_admin')
      AND other_active_admins = 0 THEN 'LAST_ADMIN_REQUIRED'
    ELSE 'MEMBERSHIP_UPDATED'
  END AS outcome
FOREACH (_ IN CASE WHEN outcome = 'MEMBERSHIP_UPDATED' THEN [1] ELSE [] END |
  SET target.role = $target_role,
      target.active = $target_active,
      target.revision = $expected_revision + 1,
      target.updated_at = datetime({epochMillis: $now_ms}),
      target.updated_by_principal = $principal_id,
      target.updated_by_worker = $worker_id,
      target.membership_revision = membership.revision,
      target.created_nonce = null
)
FOREACH (_ IN CASE WHEN target_created_here AND outcome <> 'MEMBERSHIP_UPDATED' THEN [1] ELSE [] END |
  DELETE target
)
FOREACH (_ IN CASE WHEN request_created_here THEN [1] ELSE [] END |
  SET request.state = 'COMPLETED',
      request.operation = 'membership-set',
      request.resource_type = 'ProjectMembership',
      request.resource_id = $target_principal_id,
      request.result_code = outcome,
      request.result_revision = CASE WHEN outcome = 'MEMBERSHIP_UPDATED' THEN $expected_revision + 1 ELSE current_target_revision END,
      request.principal_id = $principal_id,
      request.worker_id = $worker_id,
      request.membership_revision = membership.revision,
      request.completed_at = datetime({epochMillis: $now_ms})
)
RETURN
  CASE WHEN outcome = 'REPLAY' THEN request.result_code ELSE outcome END AS code,
  CASE WHEN outcome = 'REPLAY' THEN request.result_code = 'MEMBERSHIP_UPDATED' ELSE outcome = 'MEMBERSHIP_UPDATED' END AS accepted,
  outcome = 'REPLAY' AS replay,
  $target_principal_id AS resourceId,
  request.result_revision AS revision,
  current_target_revision AS currentRevision,
  request.principal_id AS principalId,
  request.worker_id AS workerId,
  request.membership_revision AS membershipRevision`;

export const MEMBERSHIP_BOOTSTRAP = `MATCH (guard:ProjectAuthorization {project_id: $project_id})
SET guard.lock_version = guard.lock_version
WITH guard
OPTIONAL MATCH (existing_membership:ProjectMembership {project_id: $project_id})
WITH guard, count(existing_membership) AS membership_count
MERGE (request:IdempotencyRecord {
  project_id: $project_id,
  key_hash: $idempotency_key_hash
})
ON CREATE SET request.request_nonce = $request_nonce,
              request.payload_hash = $payload_hash,
              request.state = 'PENDING',
              request.lock_version = 0,
              request.created_at = datetime({epochMillis: $now_ms})
SET request.lock_version = request.lock_version
WITH guard, membership_count, request,
  request.request_nonce = $request_nonce AS request_created_here,
  request.payload_hash = $payload_hash AS same_payload
WITH guard, membership_count, request, request_created_here,
  CASE
    WHEN NOT same_payload THEN 'IDEMPOTENCY_CONFLICT'
    WHEN NOT request_created_here AND request.state = 'COMPLETED' THEN 'REPLAY'
    WHEN NOT request_created_here THEN 'IDEMPOTENCY_INCOMPLETE'
    WHEN guard.state <> 'PREPARING'
      OR guard.bootstrap_principal_id <> $principal_id
      OR guard.bootstrap_worker_id <> $worker_id
      OR guard.bootstrap_idempotency_key_hash <> $idempotency_key_hash
      OR guard.bootstrap_fencing_token <> $bootstrap_fencing_token
      OR membership_count <> 0 THEN 'BOOTSTRAP_DISABLED'
    ELSE 'BOOTSTRAP_ACCEPTED'
  END AS outcome
FOREACH (_ IN CASE WHEN outcome = 'BOOTSTRAP_ACCEPTED' THEN [1] ELSE [] END |
  CREATE (membership:ProjectMembership {
    project_id: $project_id,
    principal_id: $principal_id,
    role: 'project_admin',
    active: true,
    revision: 1,
    auth_lock_version: 1,
    created_at: datetime({epochMillis: $now_ms}),
    updated_at: datetime({epochMillis: $now_ms}),
    updated_by_principal: $principal_id,
    updated_by_worker: $worker_id,
    client_id: $client_id,
    session_id: $session_id,
    worktree_id: $worktree_id,
    branch: $branch,
    base_sha: $base_sha,
    pull_request_url: $pull_request_url,
    pull_request_number: $pull_request_number,
    pull_request_head_sha: $pull_request_head_sha
  })
  MERGE (schema_resource:SchemaMigration {project_id: $project_id, id: 'MIG-GATEWAY'})
  ON CREATE SET schema_resource.revision = 0,
                schema_resource.status = 'current',
                schema_resource.created_at = datetime({epochMillis: $now_ms}),
                schema_resource.created_by_principal = $principal_id,
                schema_resource.created_by_worker = $worker_id
  SET guard.state = 'BOOTSTRAPPED',
      guard.bootstrapped_at = datetime({epochMillis: $now_ms}),
      guard.initial_principal_id = $principal_id,
      guard.initial_worker_id = $worker_id
)
FOREACH (_ IN CASE WHEN outcome = 'BOOTSTRAP_DISABLED' AND membership_count <> 0 THEN [1] ELSE [] END |
  SET guard.state = 'BOOTSTRAPPED',
      guard.disabled_at = coalesce(guard.disabled_at, datetime({epochMillis: $now_ms})),
      guard.disabled_reason = coalesce(guard.disabled_reason, 'MEMBERSHIP_ALREADY_EXISTS')
)
FOREACH (_ IN CASE WHEN request_created_here THEN [1] ELSE [] END |
  SET request.state = 'COMPLETED',
      request.operation = 'membership-bootstrap',
      request.resource_type = 'ProjectAuthorization',
      request.resource_id = $project_id,
      request.result_code = outcome,
      request.result_revision = CASE WHEN outcome = 'BOOTSTRAP_ACCEPTED' THEN 1 ELSE 0 END,
      request.principal_id = $principal_id,
      request.worker_id = $worker_id,
      request.membership_revision = CASE WHEN outcome = 'BOOTSTRAP_ACCEPTED' THEN 1 ELSE 0 END,
      request.completed_at = datetime({epochMillis: $now_ms})
)
RETURN
  CASE WHEN outcome = 'REPLAY' THEN request.result_code ELSE outcome END AS code,
  CASE WHEN outcome = 'REPLAY' THEN request.result_code = 'BOOTSTRAP_ACCEPTED' ELSE outcome = 'BOOTSTRAP_ACCEPTED' END AS accepted,
  outcome = 'REPLAY' AS replay,
  $project_id AS resourceId,
  request.result_revision AS revision,
  request.principal_id AS principalId,
  request.worker_id AS workerId,
  request.membership_revision AS membershipRevision`;

function allocationStatement(resourceType) {
  const prefix = allocationPrefix(resourceType);
  const expression = `'^${prefix}-[0-9]{12}$'`;
  const substringStart = prefix.length + 1;
  return `${AUTHORIZE_WRITE}
MERGE (request:IdempotencyRecord {
  project_id: $project_id,
  key_hash: $idempotency_key_hash
})
ON CREATE SET request.request_nonce = $request_nonce,
              request.payload_hash = $payload_hash,
              request.state = 'PENDING',
              request.lock_version = 0,
              request.created_at = datetime({epochMillis: $now_ms})
SET request.lock_version = request.lock_version
MERGE (sequence:IdSequence {project_id: $project_id, entity_kind: $resource_type})
ON CREATE SET sequence.next_value = 0
SET sequence.lock_version = coalesce(sequence.lock_version, 0) + 1
WITH membership, request, sequence,
  request.request_nonce = $request_nonce AS created_here,
  request.payload_hash = $payload_hash AS same_payload
OPTIONAL MATCH (existing:${resourceType})
WHERE existing.id =~ ${expression}
WITH membership, request, sequence, created_here, same_payload,
  coalesce(max(toInteger(substring(existing.id, ${substringStart}))), 0) AS observed_max
WITH membership, request, sequence, created_here, same_payload,
  CASE
    WHEN NOT same_payload THEN 'IDEMPOTENCY_CONFLICT'
    WHEN NOT created_here AND request.state = 'COMPLETED' THEN 'REPLAY'
    WHEN NOT created_here THEN 'IDEMPOTENCY_INCOMPLETE'
    ELSE 'ALLOCATION_ACCEPTED'
  END AS outcome,
  CASE WHEN sequence.next_value > observed_max THEN sequence.next_value + 1 ELSE observed_max + 1 END AS allocated_value
WITH membership, request, sequence, created_here, outcome, allocated_value,
  '${prefix}-' + right('000000000000' + toString(allocated_value), 12) AS allocated_id
FOREACH (_ IN CASE WHEN outcome = 'ALLOCATION_ACCEPTED' THEN [1] ELSE [] END |
  SET sequence.next_value = allocated_value,
      sequence.updated_at = datetime({epochMillis: $now_ms}),
      sequence.updated_by_principal = $principal_id,
      sequence.updated_by_worker = $worker_id
  CREATE (resource:${resourceType} {
    id: allocated_id,
    project_id: $project_id,
    revision: 0,
    created_at: datetime({epochMillis: $now_ms}),
    created_by_principal: $principal_id,
    created_by_worker: $worker_id,
    created_from_client: $client_id,
    created_from_session: $session_id,
    created_from_worktree: $worktree_id,
    created_from_branch: $branch,
    created_from_base_sha: $base_sha,
    created_from_pull_request_url: $pull_request_url,
    created_from_pull_request_number: $pull_request_number,
    created_from_pull_request_head_sha: $pull_request_head_sha,
    membership_revision: membership.revision
  })
  SET resource += $changes
  CREATE (lease:ResourceLease {
    project_id: $project_id,
    resource_type: $resource_type,
    resource_id: allocated_id,
    fencing_token: 1,
    principal_id: $principal_id,
    client_id: $client_id,
    session_id: $session_id,
    worker_id: $worker_id,
    worktree_id: $worktree_id,
    branch: $branch,
    base_sha: $base_sha,
    pull_request_url: $pull_request_url,
    pull_request_number: $pull_request_number,
    pull_request_head_sha: $pull_request_head_sha,
    acquired_at: datetime({epochMillis: $now_ms}),
    heartbeat_at: datetime({epochMillis: $now_ms}),
    expires_at: datetime({epochMillis: $expires_at_ms}),
    membership_revision: membership.revision,
    last_idempotency_key_hash: $idempotency_key_hash,
    lock_version: 1
  })
  SET request.state = 'COMPLETED',
      request.operation = 'allocate-and-create',
      request.resource_type = $resource_type,
      request.resource_id = allocated_id,
      request.result_code = 'ALLOCATION_ACCEPTED',
      request.result_revision = 0,
      request.result_fencing_token = 1,
      request.principal_id = $principal_id,
      request.worker_id = $worker_id,
      request.membership_revision = membership.revision,
      request.completed_at = datetime({epochMillis: $now_ms})
)
RETURN
  CASE WHEN outcome = 'REPLAY' THEN request.result_code ELSE outcome END AS code,
  CASE WHEN outcome = 'REPLAY' THEN request.result_code = 'ALLOCATION_ACCEPTED' ELSE outcome = 'ALLOCATION_ACCEPTED' END AS accepted,
  outcome = 'REPLAY' AS replay,
  CASE WHEN outcome = 'REPLAY' THEN request.resource_id ELSE allocated_id END AS resourceId,
  request.result_revision AS revision,
  request.result_fencing_token AS fencingToken,
  request.principal_id AS principalId,
  request.worker_id AS workerId,
  request.membership_revision AS membershipRevision`;
}

export const ALLOCATION_STATEMENTS = Object.freeze(Object.fromEntries(
  CONCURRENCY_RESOURCE_TYPES.map((resourceType) => [resourceType, allocationStatement(resourceType)]),
));

export const CONCURRENCY_STATEMENTS = Object.freeze({
  "lease-acquire": LEASE_ACQUIRE,
  "lease-heartbeat": LEASE_HEARTBEAT,
  "lease-release": LEASE_RELEASE,
  "lease-handoff": LEASE_HANDOFF,
  "resource-mutate": RESOURCE_MUTATE,
  "membership-bootstrap": MEMBERSHIP_BOOTSTRAP,
  "membership-set": MEMBERSHIP_SET,
});
