export class PublicMcpError extends Error {
  constructor(code, message, { httpStatus = 400, retryable = false } = {}) {
    super(message);
    this.name = "PublicMcpError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

export class ReauthorizationRequired extends PublicMcpError {
  constructor({ error = "insufficient_scope", scope = "nacl.server.read" } = {}) {
    super("REAUTHORIZATION_REQUIRED", "Authorization is required for this capability.", {
      httpStatus: 401,
      retryable: true,
    });
    this.name = "ReauthorizationRequired";
    this.oauthError = error;
    this.scope = scope;
  }
}

export function publicError(code, message, options) {
  return new PublicMcpError(code, message, options);
}
