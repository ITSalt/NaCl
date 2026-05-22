// Synthetic reconstruction of the Project-Alpha "unwired publisher" pattern.
// Source episode: project-alpha-postmortem.md § 3.12 + .tl/fix-plan-wave-4-audit-2026-05-11.md claims 1 + 2.
//
// IMPORTANT — this file is INTENTIONALLY a defined-but-uncalled module.
// Every export below is referenced ONLY by its unit test in this fixture;
// no `worker.ts` / `engine.ts` call exists. That is the exact bug shape
// that Wave 4 closed PASS on at 17:07 on 2026-05-11.
//
// Wave 1 (post-W1 review gate) would catch this via lint+typecheck on the
// import graph and via the repo-wide test green requirement: a publisher
// with zero call sites in production code is a "stub" surface that the
// W10 stub gate also picks up. The acid test is the repo-wide check
// gate firing on the wave-tip commit.

import type { Task } from '../../../packages/shared/src/task-105.js';

export interface TaskEvent {
  task_id: string;
  type: 'task.created' | 'task.completed' | 'task.failed';
  emitted_at: string;
}

// Defined here. NEVER imported by worker.ts / engine.ts / event-listener.ts.
export function publishTaskEvent(task: Task, type: TaskEvent['type']): void {
  // L33 in the real project-alpha backend source — the line cited by
  // the fix-plan ("`task.events.ts:33`").
  const event: TaskEvent = {
    task_id: task.id,
    type,
    emitted_at: new Date().toISOString(),
  };
  console.log('publishTaskEvent (uncalled):', event);
}

// Defined here. NEVER imported by queue/worker.ts or workflow-engine/*.
export function publishNotification(taskId: string, message: string): void {
  console.log('publishNotification (uncalled):', { taskId, message });
}

// Defined here. NEVER imported by queue/worker.ts or workflow-engine/*.
export function pushSseEvent(taskId: string, payload: unknown): void {
  console.log('pushSseEvent (uncalled):', { taskId, payload });
}
