export class GatewayError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "GatewayError";
    this.code = code;
    this.status = options.status ?? "FAILED";
    this.retryable = options.retryable ?? false;
    this.details = options.details ?? {};
  }
}

export function gatewayError(code, message, options) {
  return new GatewayError(code, message, options);
}

export function normalizeGatewayError(error) {
  if (error instanceof GatewayError) return error;
  return new GatewayError(
    "INTERNAL_ERROR",
    "The graph gateway failed without a safe diagnostic.",
    { status: "FAILED", retryable: false },
  );
}

export function errorResult(error, context = {}) {
  const normalized = normalizeGatewayError(error);
  return {
    contract: "nacl-graph-gateway-v1",
    status: normalized.status,
    code: normalized.code,
    message: normalized.message,
    retryable: normalized.retryable,
    capability: context.capability ?? "unknown",
    operation: context.operation ?? "unknown",
    ...(context.projectId ? { projectId: context.projectId } : {}),
    ...(context.auditId ? { auditId: context.auditId } : {}),
    ...normalized.details,
  };
}
