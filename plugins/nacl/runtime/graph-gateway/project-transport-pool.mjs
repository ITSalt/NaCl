import { createHash } from "node:crypto";
import { gatewayError } from "./errors.mjs";

function routeSignature(profile) {
  return JSON.stringify({
    projectId: profile.projectId,
    endpoint: profile.endpoint,
    database: profile.database,
    username: profile.username,
    secretReference: profile.secretReference,
  });
}

function secretFingerprint(secret) {
  return createHash("sha256").update(secret).digest("hex");
}

export function createProjectTransportPool(options = {}) {
  if (typeof options.createTransport !== "function") {
    throw new TypeError("createProjectTransportPool requires createTransport");
  }
  const entries = new Map();

  return Object.freeze({
    get({ projectId, profile, secret }) {
      if (profile?.projectId !== projectId) {
        throw gatewayError("PROJECT_MISMATCH", "The transport route does not match project_id.");
      }
      const signature = routeSignature(profile);
      const credential = secretFingerprint(secret);
      const existing = entries.get(projectId);
      if (existing && existing.signature === signature && existing.credential === credential) {
        return existing.transport;
      }
      const transport = options.createTransport(profile, secret);
      entries.set(projectId, { signature, credential, transport });
      return transport;
    },
    clear(projectId) {
      entries.delete(projectId);
    },
    size() {
      return entries.size;
    },
  });
}
