import { useState, useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';
import type { Run } from '../state/store.js';

function phaseIcon(phase: Run['phase']): string {
  switch (phase) {
    case 'queued':    return '🕐';
    case 'running':   return '🔵';
    case 'blocked':   return '⏸';
    case 'completed': return '🟢';
    case 'failed':    return '🔴';
  }
}

function elapsedLabel(run: Run): string {
  if (!run.startedAt) return '';
  const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
  const ms = end - new Date(run.startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface CountdownProps {
  msUntilRetry: number;
}

function Countdown({ msUntilRetry }: CountdownProps) {
  const [remaining, setRemaining] = useState(msUntilRetry);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        const next = r - 1000;
        return next < 0 ? 0 : next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <span>retry in {Math.ceil(remaining / 1000)}s</span>;
}

interface RunRowProps {
  run: Run;
}

function RunRow({ run }: RunRowProps) {
  return (
    <div className={`run-row run-row--${run.phase}`}>
      <span className="run-row-icon">{phaseIcon(run.phase)}</span>
      <span className="run-row-kind">{run.kind}</span>
      <span className="run-row-board">{run.board}</span>
      <span className="run-row-elapsed">{elapsedLabel(run)}</span>
      {run.phase === 'blocked' && run.blockedReason && (
        <span className="run-row-blocked">
          Blocked: {run.blockedReason}
          {run.msUntilRetry != null && run.msUntilRetry > 0
            ? <> — <Countdown msUntilRetry={run.msUntilRetry} /></>
            : null}
        </span>
      )}
      {run.phase === 'failed' && (
        <span className="run-row-error">failed</span>
      )}
      {run.phase === 'completed' && run.exitCode !== undefined && run.exitCode !== 0 && (
        <span className="run-row-exitcode">exit {run.exitCode}</span>
      )}
    </div>
  );
}

export default function RunPanel() {
  const runs = useStore((s) => s.runs);
  const pacerBlocked = useStore((s) => s.pacerBlocked);
  const [expanded, setExpanded] = useState(false);
  const prevRunCount = useRef(0);

  const allRuns = [...runs.values()].reverse();
  const activeRuns = allRuns.filter(
    (r) => r.phase === 'queued' || r.phase === 'running' || r.phase === 'blocked',
  );
  const recentRuns = allRuns.slice(0, 50);
  const displayRuns = expanded ? recentRuns : allRuns.slice(0, 10);

  // Auto-open panel when a new run starts
  useEffect(() => {
    const current = runs.size;
    if (current > prevRunCount.current) {
      prevRunCount.current = current;
    }
  }, [runs]);

  if (runs.size === 0 && !pacerBlocked) return null;

  return (
    <aside className="run-panel">
      <div className="run-panel-header" onClick={() => setExpanded((e) => !e)}>
        <span className="run-panel-title">
          Runs {activeRuns.length > 0 && <span className="run-panel-active-badge">{activeRuns.length} active</span>}
        </span>
        <span className="run-panel-toggle">{expanded ? '▼' : '▲'}</span>
      </div>
      {pacerBlocked && (
        <div className="run-panel-blocked-banner">
          ⏸ Queue paused: {pacerBlocked.reason}
          {pacerBlocked.msUntilRetry != null && pacerBlocked.msUntilRetry > 0 && (
            <> — <Countdown msUntilRetry={pacerBlocked.msUntilRetry} /></>
          )}
        </div>
      )}
      <div className="run-panel-body">
        {displayRuns.map((run) => (
          <RunRow key={run.runId} run={run} />
        ))}
        {!expanded && recentRuns.length > 10 && (
          <button className="run-panel-more" onClick={() => setExpanded(true)}>
            Show all {recentRuns.length} runs
          </button>
        )}
      </div>
    </aside>
  );
}
