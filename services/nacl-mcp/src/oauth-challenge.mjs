const SAFE_TOKEN = /^[A-Za-z0-9._~-]+$/;
const SAFE_SCOPE = /^[A-Za-z0-9._:-]+(?: [A-Za-z0-9._:-]+)*$/;

function quoted(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || /[\0\r\n"\\]/.test(value)) {
    throw new TypeError("OAuth challenge value is unsafe.");
  }
  return `"${value}"`;
}

function safeScope(scope) {
  if (typeof scope !== "string" || !SAFE_SCOPE.test(scope)) throw new TypeError("OAuth scope is unsafe.");
  return scope;
}

export function transportChallenge({ resourceMetadataUrl, scope = "nacl.server.read" }) {
  return `Bearer resource_metadata=${quoted(resourceMetadataUrl)}, scope=${quoted(safeScope(scope))}`;
}

export function toolChallenge({
  resourceMetadataUrl,
  scope = "nacl.server.read",
  error = "insufficient_scope",
} = {}) {
  if (!SAFE_TOKEN.test(error)) throw new TypeError("OAuth error is unsafe.");
  return `Bearer resource_metadata=${quoted(resourceMetadataUrl)}, error=${quoted(error)}, error_description=${quoted("Authorization is required for this capability.")}, scope=${quoted(safeScope(scope))}`;
}
