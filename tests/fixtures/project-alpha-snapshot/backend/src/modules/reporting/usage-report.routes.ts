// Synthetic reconstruction of the wave-tip typecheck error #1.
// Source episode: .tl/fix-plan-wave-4-audit-2026-05-11.md claim 3:
//   "`usage-report.routes.ts:35` — exactOptionalPropertyTypes: true rejects
//    passing `string | undefined` where the param type is declared `string`
//    (optional, but not `| undefined`)."
//
// This file intentionally contains the unfixed shape so post-W1 review's
// `pnpm -r typecheck` requirement fires.

interface UsageReportQuery {
  user_id?: string; // strict-optional under exactOptionalPropertyTypes: true
  task_type?: string;
}

interface AggregationParams {
  userId?: string;
  taskType?: string;
}

function aggregate(_params: AggregationParams): void {
  // no-op
}

export function handler(query: { user_id: string | undefined; task_type: string | undefined }): void {
  const reportQuery: UsageReportQuery = {
    user_id: query.user_id, // L35 — TS2375 with exactOptionalPropertyTypes
    task_type: query.task_type,
  };
  aggregate({
    userId: reportQuery.user_id,
    taskType: reportQuery.task_type,
  });
}
