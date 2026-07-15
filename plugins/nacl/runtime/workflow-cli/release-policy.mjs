export const CLOSED_WORKFLOW_STATUSES = Object.freeze([
  "VERIFIED",
  "FAILED",
  "PARTIALLY_VERIFIED",
  "BLOCKED",
  "NOT_RUN",
  "UNVERIFIED",
]);

const CLOSED = new Set(CLOSED_WORKFLOW_STATUSES);

export function classifyReleaseSaValidation(input = {}) {
  if (!CLOSED.has(input.status)) {
    throw new Error("SA validation must use an exact closed status.");
  }
  if (!Array.isArray(input.findings)) {
    throw new Error("SA validation findings must be an array.");
  }
  if (
    input.status === "FAILED" &&
    input.findings.some((finding) => finding !== null && typeof finding === "object" && finding.severity === "CRITICAL")
  ) {
    return { status: "BLOCKED", code: "sa-validate-critical" };
  }
  return { status: "VERIFIED", code: "sa-validate-release-check-passed" };
}
