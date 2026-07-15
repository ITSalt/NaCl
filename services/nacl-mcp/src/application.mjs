import { CONTRACT_VERSION } from "./contracts.mjs";
import { PublicMcpError, ReauthorizationRequired } from "./errors.mjs";

const OPERATION = Object.freeze({
  nacl_project_summary: { capability: "project.read", toolClass: "read", method: "projectSummary", cost: 1 },
  nacl_named_read: { capability: "project.read", toolClass: "read", method: "namedRead", cost: 1 },
  nacl_project_mutate: { capability: "project.write", toolClass: "project-write", confirmation: "APPROVE_PROJECT_WRITE", method: "mutateProject", cost: 3 },
  nacl_schema_apply: { capability: "schema.admin", toolClass: "schema-admin", confirmation: "CONFIRM_SCHEMA_ADMIN", method: "applySchema", cost: 8 },
  nacl_backup_create: { capability: "backup.admin", toolClass: "backup-admin", confirmation: "CONFIRM_BACKUP_ADMIN", method: "createBackup", cost: 8 },
  nacl_restore_request: { capability: "restore.admin", toolClass: "restore-admin", confirmation: "CONFIRM_RESTORE_ADMIN", method: "requestRestore", cost: 10 },
});

function safeData(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new PublicMcpError("INTERNAL_ERROR", "The graph adapter returned an invalid result.");
  const data = {};
  if (value.summary !== undefined) data.summary = String(value.summary).slice(0, 2000);
  if (value.items !== undefined) data.items = value.items.slice(0, 50).map((item) => String(item).slice(0, 500));
  if (Number.isSafeInteger(value.revision) && value.revision >= 0) data.revision = value.revision;
  if (typeof value.job_ref === "string" && /^job_[A-Za-z0-9_-]{16,76}$/.test(value.job_ref)) data.job_ref = value.job_ref;
  return data;
}

export function createToolApplication({ controlPlane, graphAdapter, auditSink, rateLimiter, idempotencyLedger, now = () => Date.now() } = {}) {
  if (!controlPlane || !graphAdapter || !auditSink || !rateLimiter || !idempotencyLedger) throw new TypeError("application dependencies are required.");
  return async function callTool({ name, arguments: args, authContext, requiredScope }) {
    const started = now();
    const support_ref = auditSink.newSupportRef();
    let route = { principalId: "unknown", serverId: "unknown", projectRef: args.project_ref, sessionId: authContext?.sessionId ?? "unknown" };
    let resultCode = "INTERNAL_ERROR";
    let decision = "rejected";
    let idempotencyOutcome = "not-applicable";
    const operation = OPERATION[name];
    try {
      if (!operation) throw new PublicMcpError("TOOL_NOT_ALLOWED", "The public tool is not allowed.");
      if (!authContext?.scopes?.includes(requiredScope)) throw new ReauthorizationRequired({ scope: requiredScope });
      route = await controlPlane.authorize({
        tokenContext: authContext,
        projectRef: args.project_ref,
        capability: operation.capability,
        toolClass: operation.toolClass,
        ...(operation.confirmation ? { confirmation: operation.confirmation } : {}),
      });
      rateLimiter.assert([
        `ip:${authContext.sourceAddress ?? "direct"}`,
        `subject:${authContext.subject}`,
        `session:${authContext.sessionId}`,
        `server:${route.serverId}`,
        `project:${route.projectRef}`,
        `tool:${name}`,
      ], operation.cost);
      const invoke = () => graphAdapter[operation.method]({
        route: Object.freeze({
          serverId: route.serverId,
          projectScope: route.projectScope,
          projectRef: route.projectRef,
          certificateCn: route.certificateCn,
          authorizationRevision: route.authorizationRevision,
        }),
        input: args,
      });
      let graphResult;
      let replayed = false;
      if (args.idempotency_key) {
        const recorded = await idempotencyLedger.execute({
          principalId: route.principalId,
          tool: name,
          key: args.idempotency_key,
          payload: args,
          operation: invoke,
        });
        graphResult = recorded.value;
        replayed = recorded.replayed;
        idempotencyOutcome = recorded.outcome;
      } else graphResult = await invoke();
      decision = "accepted";
      resultCode = "OPERATION_COMPLETED";
      return {
        contract: CONTRACT_VERSION,
        status: "VERIFIED",
        code: resultCode,
        data: safeData(graphResult),
        retryable: false,
        replayed,
        support_ref,
      };
    } catch (error) {
      resultCode = error instanceof PublicMcpError ? error.code : "INTERNAL_ERROR";
      if (error instanceof PublicMcpError) error.supportRef = support_ref;
      throw error;
    } finally {
      auditSink.record({
        support_ref,
        actor: route.principalId,
        server: route.serverId,
        project: route.projectRef,
        session: route.sessionId,
        tool: name,
        capability: operation?.capability ?? "unknown",
        decision,
        resultCode,
        latencyMs: now() - started,
        idempotencyOutcome,
      });
    }
  };
}
