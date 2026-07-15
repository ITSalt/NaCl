import os from "node:os";
import { gatewayError } from "./errors.mjs";

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,127}$/;
const TRUSTED_ASSURANCE = new Set(["local-os-user", "trusted-test-harness"]);

export function validateTrustedPrincipal(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !["principal_id", "assurance"].includes(key)) ||
    typeof value.principal_id !== "string" ||
    !PRINCIPAL_ID.test(value.principal_id) ||
    value.principal_id.includes("..") ||
    value.principal_id.includes("//") ||
    /[./:@-]$/.test(value.principal_id) ||
    !TRUSTED_ASSURANCE.has(value.assurance)
  ) {
    throw gatewayError("PRINCIPAL_RESOLUTION_INVALID", "The trusted runtime principal is invalid.", {
      status: "BLOCKED",
    });
  }
  return Object.freeze({
    principal_id: value.principal_id,
    assurance: value.assurance,
  });
}

export function createLocalOsPrincipalResolver(options = {}) {
  const userInfo = options.userInfo ?? os.userInfo;
  return async () => {
    let current;
    try {
      current = userInfo();
    } catch {
      throw gatewayError("PRINCIPAL_UNAVAILABLE", "The local OS principal could not be resolved.", {
        status: "BLOCKED",
      });
    }
    if (!Number.isSafeInteger(current?.uid) || current.uid < 0) {
      throw gatewayError("PRINCIPAL_UNAVAILABLE", "The local OS account has no stable numeric principal binding.", {
        status: "BLOCKED",
      });
    }
    return validateTrustedPrincipal({
      principal_id: `local-os:${current.uid}`,
      assurance: "local-os-user",
    });
  };
}

const defaultResolver = createLocalOsPrincipalResolver();

export function resolveLocalOsPrincipal() {
  return defaultResolver();
}

export async function assertTrustedRequestPrincipal(requestPrincipalId, resolver = resolveLocalOsPrincipal) {
  const trusted = validateTrustedPrincipal(await resolver());
  if (requestPrincipalId !== trusted.principal_id) {
    throw gatewayError(
      "PRINCIPAL_MISMATCH",
      "principal_id does not match the runtime-authenticated local OS principal.",
      { status: "BLOCKED", retryable: false },
    );
  }
  return trusted;
}
