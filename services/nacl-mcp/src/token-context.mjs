import { PublicMcpError } from "./errors.mjs";

const SUBJECT = /^[A-Za-z0-9][A-Za-z0-9._:@|/-]{2,127}$/;
const SESSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const TOKEN = /^[\x21-\x7e]{16,8192}$/;
const SCOPE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

function exactObject(value, allowed, required, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`);
  if (Object.keys(value).some((key) => !allowed.includes(key)) || required.some((key) => value[key] === undefined)) {
    throw new Error(`${label} is invalid`);
  }
}

function canonicalAudience(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error("audience is invalid");
  return url.href;
}

function canonicalIssuer(value) {
  const issuer = canonicalAudience(value);
  if (new URL(issuer).protocol !== "https:") throw new Error("issuer must use HTTPS");
  return issuer;
}

function invalidToken() {
  return new PublicMcpError("INVALID_TOKEN", "The access token is invalid or expired.", { httpStatus: 401 });
}

export function createInjectedTokenContextVerifier({
  resourceUrl,
  trustedIssuers,
  supportedScopes,
  resolveVerifiedToken,
  now = () => Math.floor(Date.now() / 1000),
  clockSkewSeconds = 30,
} = {}) {
  const resource = canonicalAudience(resourceUrl);
  if (!Array.isArray(trustedIssuers) || trustedIssuers.length === 0) throw new TypeError("trustedIssuers are required.");
  const issuers = new Set(trustedIssuers.map((value) => canonicalIssuer(value)));
  if (!Array.isArray(supportedScopes) || supportedScopes.some((value) => typeof value !== "string" || !SCOPE.test(value))) {
    throw new TypeError("supportedScopes are invalid.");
  }
  const allowedScopes = new Set(supportedScopes);
  if (typeof resolveVerifiedToken !== "function") throw new TypeError("resolveVerifiedToken must be injected.");
  if (!Number.isSafeInteger(clockSkewSeconds) || clockSkewSeconds < 0 || clockSkewSeconds > 300) throw new TypeError("clockSkewSeconds is invalid.");

  return async function verifyAuthorization(authorization) {
    try {
      if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) throw invalidToken();
      const rawToken = authorization.slice(7);
      if (!TOKEN.test(rawToken) || /\s/.test(rawToken)) throw invalidToken();
      // The provider adapter must verify the signature before returning. This
      // service deliberately does not decode an untrusted JWT or run an OAuth
      // authorization server.
      const claims = await resolveVerifiedToken(rawToken);
      exactObject(
        claims,
        ["verified", "issuer", "subject", "audiences", "scopes", "session_id", "issued_at", "not_before", "expires_at", "token_epoch"],
        ["verified", "issuer", "subject", "audiences", "scopes", "session_id", "issued_at", "not_before", "expires_at", "token_epoch"],
        "verified token context",
      );
      if (claims.verified !== true || !issuers.has(canonicalIssuer(claims.issuer))) throw invalidToken();
      if (!SUBJECT.test(claims.subject) || claims.subject.includes("..") || claims.subject.includes("//") || /[./:@|-]$/.test(claims.subject)) throw invalidToken();
      if (!SESSION.test(claims.session_id) || claims.session_id.includes("..") || /[.:-]$/.test(claims.session_id)) throw invalidToken();
      if (!Array.isArray(claims.audiences) || !claims.audiences.map(canonicalAudience).includes(resource)) throw invalidToken();
      if (!Array.isArray(claims.scopes) || claims.scopes.some((scope) => typeof scope !== "string" || !SCOPE.test(scope))) throw invalidToken();
      const scopes = [...new Set(claims.scopes.filter((scope) => allowedScopes.has(scope)))].sort();
      if (![claims.issued_at, claims.not_before, claims.expires_at, claims.token_epoch].every(Number.isSafeInteger)) throw invalidToken();
      const current = now();
      if (claims.issued_at > current + clockSkewSeconds || claims.not_before > current + clockSkewSeconds || claims.expires_at <= current - clockSkewSeconds || claims.expires_at <= claims.issued_at || claims.token_epoch < 0) {
        throw invalidToken();
      }
      return Object.freeze({
        verified: true,
        issuer: claims.issuer,
        subject: claims.subject,
        audience: resource,
        scopes: Object.freeze(scopes),
        sessionId: claims.session_id,
        issuedAt: claims.issued_at,
        expiresAt: claims.expires_at,
        tokenEpoch: claims.token_epoch,
      });
    } catch {
      throw invalidToken();
    }
  };
}
