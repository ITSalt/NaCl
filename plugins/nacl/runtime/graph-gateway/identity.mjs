import { createHash } from "node:crypto";
import { gatewayError } from "./errors.mjs";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,127}$/;
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const FORBIDDEN_BRANCH_CHARACTERS = /[\x00-\x20\x7f~^:?*\[\\]/;

function assertRecord(value, label, allowed, required = allowed) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw gatewayError("IDENTITY_INVALID", `${label} must be an object.`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw gatewayError("IDENTITY_INVALID", `${label} contains unknown field(s): ${unknown.join(", ")}.`);
  }
  const missing = required.filter((key) => value[key] === undefined);
  if (missing.length > 0) {
    throw gatewayError("IDENTITY_INVALID", `${label} omits required field(s): ${missing.join(", ")}.`);
  }
}

function boundedIdentifier(value, label) {
  if (
    typeof value !== "string" ||
    !IDENTIFIER.test(value) ||
    value.includes("..") ||
    value.includes("//") ||
    /[./:@-]$/.test(value)
  ) {
    throw gatewayError("IDENTITY_INVALID", `${label} is malformed.`);
  }
  return value;
}

function gitBranch(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 255 ||
    value === "@" ||
    FORBIDDEN_BRANCH_CHARACTERS.test(value) ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.startsWith(".") ||
    value.endsWith(".") ||
    value.includes("..") ||
    value.includes("//") ||
    value.includes("@{") ||
    value.split("/").some((part) => part.length === 0 || part.endsWith(".lock"))
  ) {
    throw gatewayError("IDENTITY_INVALID", "branch is malformed.");
  }
  return value;
}

function gitSha(value, label) {
  if (typeof value !== "string" || !SHA.test(value)) {
    throw gatewayError("IDENTITY_INVALID", `${label} must be a lowercase full Git object ID.`);
  }
  return value;
}

function pullRequest(value) {
  if (value === undefined || value === null) return undefined;
  assertRecord(value, "pull_request", ["number", "url", "head_sha"]);
  if (!Number.isSafeInteger(value.number) || value.number < 1 || value.number > 2_147_483_647) {
    throw gatewayError("IDENTITY_INVALID", "pull_request.number is malformed.");
  }
  if (typeof value.url !== "string" || value.url.length > 2048 || /[\0\r\n]/.test(value.url)) {
    throw gatewayError("IDENTITY_INVALID", "pull_request.url is malformed.");
  }
  let url;
  try {
    url = new URL(value.url);
  } catch {
    throw gatewayError("IDENTITY_INVALID", "pull_request.url is malformed.");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw gatewayError("IDENTITY_INVALID", "pull_request.url must be an HTTPS URL without credentials.");
  }
  return Object.freeze({
    number: value.number,
    url: url.href,
    head_sha: gitSha(value.head_sha, "pull_request.head_sha"),
  });
}

function workerDigest(principalId, clientId, sessionId) {
  const hash = createHash("sha256");
  hash.update("nacl-worker-v1\0");
  for (const value of [principalId, clientId, sessionId]) {
    hash.update(`${Buffer.byteLength(value, "utf8")}:`);
    hash.update(value);
    hash.update("\0");
  }
  return `worker-${hash.digest("hex").slice(0, 48)}`;
}

export function deriveWorkerId(input) {
  assertRecord(input, "worker identity", ["principal_id", "client_id", "session_id"]);
  return workerDigest(
    boundedIdentifier(input.principal_id, "principal_id"),
    boundedIdentifier(input.client_id, "client_id"),
    boundedIdentifier(input.session_id, "session_id"),
  );
}

export function validateIdentityContext(input) {
  assertRecord(
    input,
    "identity",
    [
      "principal_id",
      "client_id",
      "session_id",
      "worker_id",
      "worktree_id",
      "branch",
      "base_sha",
      "pull_request",
    ],
    ["principal_id", "client_id", "session_id", "worktree_id", "branch", "base_sha"],
  );
  const principalId = boundedIdentifier(input.principal_id, "principal_id");
  const clientId = boundedIdentifier(input.client_id, "client_id");
  const sessionId = boundedIdentifier(input.session_id, "session_id");
  const expectedWorkerId = workerDigest(principalId, clientId, sessionId);
  if (input.worker_id !== undefined && input.worker_id !== expectedWorkerId) {
    throw gatewayError(
      "WORKER_ID_MISMATCH",
      "worker_id must be derived from principal_id, client_id, and session_id.",
      { status: "BLOCKED" },
    );
  }
  const identity = {
    principal_id: principalId,
    client_id: clientId,
    session_id: sessionId,
    worker_id: expectedWorkerId,
    worktree_id: boundedIdentifier(input.worktree_id, "worktree_id"),
    branch: gitBranch(input.branch),
    base_sha: gitSha(input.base_sha, "base_sha"),
  };
  const pr = pullRequest(input.pull_request);
  if (pr) identity.pull_request = pr;
  return Object.freeze(identity);
}

export const IDENTITY_LIMITS = Object.freeze({
  identifierMinLength: 3,
  identifierMaxLength: 128,
  branchMaxLength: 255,
  pullRequestUrlMaxLength: 2048,
});
