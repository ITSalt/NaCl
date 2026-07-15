import { LifecycleError } from "../graph-cli/contracts.mjs";
import { createProjectRouter } from "../graph-cli/project-registry.mjs";
import { GatewayError } from "./errors.mjs";
import path from "node:path";

const PROJECT_ID = {
  type: "string",
  minLength: 3,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$",
};
const PROJECT_ROOT = { type: "string", minLength: 1, maxLength: 4096 };
const UUID_V4 = {
  type: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
};

function objectSchema(properties, required = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

function outputSchema() {
  return {
    type: "object",
    required: ["contract", "status", "code", "operation"],
    properties: {
      contract: { const: "nacl-project-router-v1" },
      status: { enum: ["VERIFIED", "FAILED", "PARTIALLY_VERIFIED", "BLOCKED"] },
      code: { type: "string" },
      operation: { type: "string" },
      projectId: { type: "string" },
      projectRoot: { type: "string" },
      graphProfile: { type: "string" },
      schemaVersion: { type: "integer" },
    },
    additionalProperties: true,
  };
}

export const PROJECT_TOOL_DEFINITIONS = [
  {
    name: "nacl_project_resolve",
    title: "Resolve NaCl project",
    description: "Resolve one canonical registered project root without using last-active state or persisting on read.",
    operation: "project-resolve",
    inputSchema: objectSchema({ project_root: PROJECT_ROOT }),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_project_migrate_identity",
    title: "Migrate NaCl project identity",
    description: "Persist an exact presented generated project identity only after bound confirmation and read-back.",
    operation: "project-migrate-identity",
    inputSchema: objectSchema(
      {
        project_root: PROJECT_ROOT,
        presented_project_id: UUID_V4,
        confirmation: { type: "string", minLength: 1, maxLength: 160 },
      },
      ["project_root", "presented_project_id", "confirmation"],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "nacl_project_register_root",
    title: "Register NaCl project root",
    description: "Register a canonical clone/worktree root after explicit confirmation and Git-lineage verification.",
    operation: "project-register-root",
    inputSchema: objectSchema(
      {
        project_id: PROJECT_ID,
        project_root: PROJECT_ROOT,
        confirmation: { const: "REGISTER_PROJECT_ROOT" },
      },
      ["project_id", "project_root", "confirmation"],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
];

export const PROJECT_TOOL_BY_NAME = new Map(
  PROJECT_TOOL_DEFINITIONS.map((definition) => [definition.name, definition]),
);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateArguments(definition, input) {
  if (!isObject(input)) {
    throw new LifecycleError("INVALID_ARGUMENT", "arguments must be an object.");
  }
  const properties = definition.inputSchema.properties;
  const unknown = Object.keys(input).filter((key) => !Object.hasOwn(properties, key));
  if (unknown.length > 0) {
    throw new LifecycleError("INVALID_ARGUMENT", `Unknown argument(s): ${unknown.join(", ")}.`);
  }
  for (const required of definition.inputSchema.required ?? []) {
    if (input[required] === undefined) {
      throw new LifecycleError("INVALID_ARGUMENT", `Missing required argument: ${required}.`);
    }
  }
  for (const [key, schema] of Object.entries(properties)) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "string" || input[key].length < (schema.minLength ?? 0) || input[key].length > (schema.maxLength ?? Infinity)) {
      throw new LifecycleError("INVALID_ARGUMENT", `${key} is malformed.`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern)).test(input[key])) {
      throw new LifecycleError("INVALID_ARGUMENT", `${key} is malformed.`);
    }
    if (key === "project_root" && !path.isAbsolute(input[key])) {
      throw new LifecycleError("PROJECT_ROOT_INVALID", "project_root must be absolute.");
    }
    if (schema.const && input[key] !== schema.const) {
      throw new LifecycleError("CONFIRMATION_REQUIRED", `Explicit confirmation ${schema.const} is required.`, {
        status: "BLOCKED",
      });
    }
  }
}

function publicResolution(record, canonicalRoot) {
  return {
    projectId: record.projectId,
    projectRoot: canonicalRoot,
    registeredRoots: [...record.registeredRoots],
    graphMode: record.graphMode,
    graphProfile: record.graphProfile,
    endpointReference: record.endpointReference,
    secretReference: record.secretReference,
    schemaVersion: record.schemaVersion,
    lastHealthStatus: record.lastHealthStatus,
  };
}

function result(operation, status, code, details = {}) {
  return { contract: "nacl-project-router-v1", operation, status, code, ...details };
}

function failure(operation, error) {
  const normalized = error instanceof LifecycleError || error instanceof GatewayError
    ? error
    : new LifecycleError("PROJECT_ROUTER_INTERNAL_ERROR", "The project router failed safely.");
  return result(operation, normalized.status, normalized.code, {
    ...(Object.keys(normalized.details ?? {}).length > 0 ? normalized.details : {}),
  });
}

export function createProjectToolGateway(options = {}) {
  const router = options.router ?? createProjectRouter(options.routerOptions);
  const preflight = options.preflight;

  return Object.freeze({
    router,
    listTools() {
      return PROJECT_TOOL_DEFINITIONS.map((definition) => {
        const { operation, ...tool } = definition;
        return tool;
      });
    },
    async callTool(name, input = {}) {
      const definition = PROJECT_TOOL_BY_NAME.get(name);
      if (!definition) return result("unknown", "FAILED", "TOOL_NOT_FOUND");
      try {
        validateArguments(definition, input);
        if (typeof preflight === "function") await preflight({ name, input, definition });
        if (definition.operation === "project-resolve") {
          const resolved = await router.resolve({ projectRoot: input.project_root });
          return result(definition.operation, "VERIFIED", "PROJECT_RESOLVED", publicResolution(
            resolved.record,
            resolved.canonicalRoot,
          ));
        }
        if (definition.operation === "project-migrate-identity") {
          const migrated = await router.migrateIdentity({
            projectRoot: input.project_root,
            presentedProjectId: input.presented_project_id,
            confirmation: input.confirmation,
          });
          return result(definition.operation, "VERIFIED", "PROJECT_ID_MIGRATED", {
            ...publicResolution(migrated.record, migrated.canonicalRoot),
            configReadbackVerified: migrated.configReadbackVerified,
          });
        }
        const registered = await router.registerRoot({
          projectId: input.project_id,
          projectRoot: input.project_root,
          confirmation: input.confirmation,
        });
        return result(definition.operation, "VERIFIED", "PROJECT_ROOT_REGISTERED", publicResolution(
          registered.record,
          registered.canonicalRoot,
        ));
      } catch (error) {
        return failure(definition.operation, error);
      }
    },
  });
}
