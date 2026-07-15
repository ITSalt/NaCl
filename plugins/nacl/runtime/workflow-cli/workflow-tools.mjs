import { createLocalGraphLifecycle } from "../graph-cli/lifecycle.mjs";
import { applyAgentProfiles, planAgentProfiles } from "./agent-profiles.mjs";
import {
  applyLegacySymlinkRemoval,
  planLegacySymlinkRemoval,
} from "./legacy-symlinks.mjs";

const PROJECT_ID = { type: "string", minLength: 3, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" };
const PROJECT_ROOT = { type: "string", minLength: 1, maxLength: 4096 };
const SHA256 = { type: "string", pattern: "^[0-9a-f]{64}$" };

function objectSchema(properties, required = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

function outputSchema(contract) {
  return {
    type: "object",
    required: ["contract", "operation", "status", "code"],
    properties: {
      contract: { const: contract },
      operation: { type: "string" },
      status: { enum: ["VERIFIED", "FAILED", "PARTIALLY_VERIFIED", "BLOCKED", "NOT_RUN", "UNVERIFIED"] },
      code: { type: "string" },
    },
    additionalProperties: true,
  };
}

export const WORKFLOW_TOOL_DEFINITIONS = Object.freeze([
  {
    name: "nacl_legacy_symlinks_plan",
    title: "Plan removal of legacy NaCl skill symlinks",
    description: "Inspect only the exact recognized NaCl user-skill symlinks and return a hash-bound removal plan; real files, directories, broken links, unknown artifacts, or drift block without side effects.",
    operation: "legacy-symlinks-plan",
    installationRecovery: true,
    inputSchema: objectSchema({}),
    outputSchema: outputSchema("nacl-legacy-symlink-migration-v1"),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_legacy_symlinks_apply",
    title: "Remove validated legacy NaCl skill symlinks",
    description: "After exact confirmation, quarantine and remove only symlink entries from a current 60-name NaCl migration plan; targets and non-symlink user data are never deleted.",
    operation: "legacy-symlinks-apply",
    installationRecovery: true,
    inputSchema: objectSchema(
      {
        plan_token: SHA256,
        confirmation: { type: "string", minLength: 1, maxLength: 256 },
      },
      ["plan_token", "confirmation"],
    ),
    outputSchema: outputSchema("nacl-legacy-symlink-migration-v1"),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  {
    name: "nacl_graph_local_init",
    title: "Initialize the local NaCl graph",
    description: "Create project-owned local graph state only after exact project-bound confirmation; never accepts a credential value.",
    operation: "local-graph-init",
    inputSchema: objectSchema(
      {
        project_id: PROJECT_ID,
        project_root: PROJECT_ROOT,
        confirmation: { type: "string", minLength: 1, maxLength: 256 },
      },
      ["project_id", "project_root", "confirmation"],
    ),
    outputSchema: outputSchema("nacl-local-graph-lifecycle-v1"),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_graph_local_start",
    title: "Start the local NaCl graph",
    description: "Start one already initialized project-owned local graph after exact project-bound confirmation.",
    operation: "local-graph-start",
    inputSchema: objectSchema(
      {
        project_id: PROJECT_ID,
        project_root: PROJECT_ROOT,
        confirmation: { type: "string", minLength: 1, maxLength: 256 },
      },
      ["project_id", "project_root", "confirmation"],
    ),
    outputSchema: outputSchema("nacl-local-graph-lifecycle-v1"),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_graph_local_doctor",
    title: "Inspect the local NaCl graph lifecycle",
    description: "Read project-owned local graph lifecycle and schema health without mutating state.",
    operation: "local-graph-doctor",
    inputSchema: objectSchema(
      { project_id: PROJECT_ID, project_root: PROJECT_ROOT },
      ["project_id", "project_root"],
    ),
    outputSchema: outputSchema("nacl-local-graph-lifecycle-v1"),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_agent_profiles_plan",
    title: "Plan NaCl project agent profiles",
    description: "Read the packaged profile templates and project destination, returning exact hashes and a deterministic confirmation token without writes.",
    operation: "agent-profiles-plan",
    inputSchema: objectSchema({ project_root: PROJECT_ROOT }, ["project_root"]),
    outputSchema: outputSchema("nacl-agent-profiles-v1"),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_agent_profiles_apply",
    title: "Install NaCl project agent profiles",
    description: "Atomically create absent profiles from an exact plan; any differing existing file remains blocked and is never overwritten.",
    operation: "agent-profiles-apply",
    inputSchema: objectSchema(
      {
        project_root: PROJECT_ROOT,
        plan_token: SHA256,
        confirmation: { type: "string", minLength: 1, maxLength: 256 },
      },
      ["project_root", "plan_token", "confirmation"],
    ),
    outputSchema: outputSchema("nacl-agent-profiles-v1"),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
]);

export const WORKFLOW_TOOL_BY_NAME = new Map(WORKFLOW_TOOL_DEFINITIONS.map((definition) => [definition.name, definition]));

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(operation, code = "INVALID_ARGUMENT", status = "FAILED") {
  const contract = operation.startsWith("agent-")
    ? "nacl-agent-profiles-v1"
    : operation.startsWith("legacy-")
      ? "nacl-legacy-symlink-migration-v1"
      : "nacl-local-graph-lifecycle-v1";
  return { contract, operation, status, code };
}

function validate(definition, input) {
  if (!isObject(input)) return false;
  const properties = definition.inputSchema.properties;
  if (Object.keys(input).some((key) => !Object.hasOwn(properties, key))) return false;
  if ((definition.inputSchema.required ?? []).some((key) => input[key] === undefined)) return false;
  if (
    Object.hasOwn(properties, "project_root") &&
    (typeof input.project_root !== "string" || !input.project_root.startsWith("/") || /[\0\r\n]/.test(input.project_root))
  ) return false;
  if (input.project_id !== undefined && (typeof input.project_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(input.project_id))) return false;
  if (input.plan_token !== undefined && !/^[0-9a-f]{64}$/.test(input.plan_token)) return false;
  if (input.confirmation !== undefined && typeof input.confirmation !== "string") return false;
  return true;
}

export function createWorkflowToolGateway(options = {}) {
  const lifecycle = options.lifecycle ?? createLocalGraphLifecycle(options.lifecycleOptions);
  const preflight = options.preflight;
  return Object.freeze({
    listTools() {
      return WORKFLOW_TOOL_DEFINITIONS.map(({ operation, installationRecovery, ...definition }) => definition);
    },
    async callTool(name, input = {}) {
      const definition = WORKFLOW_TOOL_BY_NAME.get(name);
      if (!definition) return invalid("unknown", "TOOL_NOT_FOUND");
      if (!validate(definition, input)) return invalid(definition.operation);
      if (!definition.installationRecovery && typeof preflight === "function") {
        try {
          await preflight({ name, input, definition });
        } catch (error) {
          return invalid(definition.operation, error?.code ?? "INSTALLATION_NOT_VERIFIED", error?.status ?? "FAILED");
        }
      }
      if (definition.operation === "legacy-symlinks-plan") {
        return planLegacySymlinkRemoval({
          ...(options.home ? { home: options.home } : {}),
          ...(options.pluginRoot ? { pluginRoot: options.pluginRoot } : {}),
        });
      }
      if (definition.operation === "legacy-symlinks-apply") {
        return applyLegacySymlinkRemoval({
          planToken: input.plan_token,
          confirmation: input.confirmation,
          ...(options.home ? { home: options.home } : {}),
          ...(options.pluginRoot ? { pluginRoot: options.pluginRoot } : {}),
        });
      }
      if (definition.operation === "local-graph-init") {
        if (input.confirmation !== `INIT_LOCAL_GRAPH:${input.project_id}`) {
          return { contract: "nacl-local-graph-lifecycle-v1", operation: "init", status: "BLOCKED", code: "CONFIRMATION_REQUIRED", requiredConfirmation: `INIT_LOCAL_GRAPH:${input.project_id}` };
        }
        return lifecycle.init({ projectId: input.project_id, projectRoot: input.project_root });
      }
      if (definition.operation === "local-graph-start") {
        if (input.confirmation !== `START_LOCAL_GRAPH:${input.project_id}`) {
          return { contract: "nacl-local-graph-lifecycle-v1", operation: "start", status: "BLOCKED", code: "CONFIRMATION_REQUIRED", requiredConfirmation: `START_LOCAL_GRAPH:${input.project_id}` };
        }
        return lifecycle.start({ projectId: input.project_id, projectRoot: input.project_root });
      }
      if (definition.operation === "local-graph-doctor") {
        return lifecycle.doctor({ projectId: input.project_id, projectRoot: input.project_root });
      }
      if (definition.operation === "agent-profiles-plan") {
        return planAgentProfiles({ projectRoot: input.project_root, ...(options.templateRoot ? { templateRoot: options.templateRoot } : {}) });
      }
      return applyAgentProfiles({
        projectRoot: input.project_root,
        planToken: input.plan_token,
        confirmation: input.confirmation,
        ...(options.templateRoot ? { templateRoot: options.templateRoot } : {}),
      });
    },
  });
}
