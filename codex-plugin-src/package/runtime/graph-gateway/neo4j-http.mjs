import { gatewayError } from "./errors.mjs";

function validateEndpoint(endpoint) {
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw gatewayError("ENDPOINT_INVALID", "The graph endpoint is not a valid URL.");
  }
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1") {
    throw gatewayError(
      "ENDPOINT_NOT_LOOPBACK",
      "The local graph endpoint must use http://127.0.0.1 and an explicit port.",
    );
  }
  if (!parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw gatewayError(
      "ENDPOINT_INVALID",
      "The local graph endpoint must contain an explicit port and no credentials, query, or fragment.",
    );
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  return parsed;
}

function mapNeo4jError(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (code.startsWith("Neo.TransientError.")) {
    return gatewayError("GRAPH_BACKPRESSURE", "Neo4j requested a bounded retry for transient concurrent work.", {
      status: "BLOCKED",
      retryable: true,
      details: { neo4jCode: code },
    });
  }
  if (code.includes("Security.Unauthorized") || code.includes("Security.Forbidden")) {
    return gatewayError("AUTH_FAILED", "Neo4j rejected the configured secret reference.", {
      status: "FAILED",
      retryable: false,
    });
  }
  if (code.includes("ConstraintValidationFailed")) {
    return gatewayError("GRAPH_CONFLICT", "Neo4j rejected a conflicting graph mutation.", {
      status: "FAILED",
      retryable: false,
    });
  }
  return gatewayError("QUERY_FAILED", "Neo4j rejected a packaged graph statement.", {
    status: "FAILED",
    retryable: false,
    details: code ? { neo4jCode: code } : {},
  });
}

function rowsFromResult(result) {
  const columns = Array.isArray(result?.columns) ? result.columns : [];
  const data = Array.isArray(result?.data) ? result.data : [];
  return data.map((entry) => Object.fromEntries(
    columns.map((column, index) => [column, entry?.row?.[index]]),
  ));
}

export class Neo4jHttpTransport {
  #secret;

  constructor(profile, secret, options = {}) {
    this.endpoint = validateEndpoint(profile.endpoint);
    this.database = profile.database ?? "neo4j";
    this.username = profile.username ?? "neo4j";
    this.#secret = secret;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 8_000;
    if (typeof this.fetch !== "function") {
      throw gatewayError("RUNTIME_UNSUPPORTED", "Node.js fetch support is unavailable.", {
        status: "BLOCKED",
      });
    }
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(this.database)) {
      throw gatewayError("DATABASE_INVALID", "The graph database name is malformed.");
    }
  }

  async execute(statements) {
    if (!Array.isArray(statements) || statements.length === 0) {
      throw gatewayError("QUERY_INVALID", "At least one packaged statement is required.");
    }
    const body = {
      statements: statements.map(({ statement, parameters = {} }) => {
        if (typeof statement !== "string" || statement.trim().length === 0) {
          throw gatewayError("QUERY_INVALID", "A packaged statement is missing.");
        }
        if (parameters === null || typeof parameters !== "object" || Array.isArray(parameters)) {
          throw gatewayError("QUERY_INVALID", "Statement parameters must be an object.");
        }
        return { statement, parameters, resultDataContents: ["row"] };
      }),
    };
    const url = new URL(
      `/db/${encodeURIComponent(this.database)}/tx/commit`,
      `${this.endpoint.origin}/`,
    );
    let response;
    try {
      response = await this.fetch(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Basic ${Buffer.from(`${this.username}:${this.#secret}`).toString("base64")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError") {
        throw gatewayError("GRAPH_TIMEOUT", "The local graph did not respond before the bounded timeout.", {
          status: "BLOCKED",
          retryable: true,
        });
      }
      throw gatewayError("GRAPH_UNAVAILABLE", "The local graph endpoint is unavailable.", {
        status: "BLOCKED",
        retryable: true,
      });
    }
    if (response.status === 401 || response.status === 403) {
      throw gatewayError("AUTH_FAILED", "Neo4j rejected the configured secret reference.");
    }
    if (response.status === 429) {
      throw gatewayError("GRAPH_BACKPRESSURE", "The local graph temporarily rejected excess concurrent work.", {
        status: "BLOCKED",
        retryable: true,
        details: { httpStatus: 429 },
      });
    }
    if (!response.ok) {
      throw gatewayError("GRAPH_HTTP_ERROR", "The local graph returned an unexpected HTTP status.", {
        status: response.status >= 500 ? "BLOCKED" : "FAILED",
        retryable: response.status >= 500,
        details: { httpStatus: response.status },
      });
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw gatewayError("GRAPH_RESPONSE_INVALID", "The local graph returned malformed JSON.");
    }
    if (!Array.isArray(payload?.results) || !Array.isArray(payload?.errors)) {
      throw gatewayError("GRAPH_RESPONSE_INVALID", "The local graph response shape is invalid.");
    }
    if (payload.errors.length > 0) throw mapNeo4jError(payload.errors[0]);
    return payload.results.map(rowsFromResult);
  }
}

export function assertLoopbackEndpoint(endpoint) {
  return validateEndpoint(endpoint).toString();
}
