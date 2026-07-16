const SECRET_ASSIGNMENT = /((?:password|passwd|token|secret|authorization|neo4j_auth)\s*[=:]\s*)[^\s,;]+/gi;
const BASIC_AUTH = /(authorization\s*:\s*basic\s+)[A-Za-z0-9+/=]+/gi;

export function redactText(value, sensitiveValues = []) {
  let text = typeof value === "string" ? value : String(value ?? "");
  for (const sensitive of sensitiveValues) {
    if (typeof sensitive === "string" && sensitive.length > 0) {
      text = text.split(sensitive).join("[REDACTED]");
    }
  }
  return text
    .replace(SECRET_ASSIGNMENT, "$1[REDACTED]")
    .replace(BASIC_AUTH, "$1[REDACTED]");
}

export function assertSecretAbsentFromArgv(args, sensitiveValues) {
  for (const arg of args) {
    for (const sensitive of sensitiveValues) {
      if (typeof sensitive === "string" && sensitive.length > 0 && String(arg).includes(sensitive)) {
        throw new Error("A sensitive value was rejected from process arguments.");
      }
    }
  }
}
