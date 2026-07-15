# Goal Permissions

Denylist, allowlist, required permission modes, and NEVER conditions for `/nacl-goal`.

---

## Required permission modes

`/nacl-goal` runs only in one of two permission configurations:

1. **Default permissions with explicit approvals** — the standard Claude Code mode. Tool calls that write files or run shell commands prompt for approval as usual. `/nacl-goal`'s denylist intercepts attempts before they reach the approval prompt.
2. **Auto mode WITH NaCl allowlist active** — auto-approval enabled only for the set of actions in the per-alias allowlist below. The denylist is still enforced on top.

## NEVER conditions

`/nacl-goal` refuses to start or continue under any of these four conditions:

1. **`--dangerously-skip-permissions`** — the denylist cannot enforce without the permission gate. Refusal code: `REFUSE_DANGEROUSLY_SKIP_PERMISSIONS`.
2. **Hooks disabled** — the runtime gate detector (2.10.1) and stop-signal probe depend on PostToolUse hooks. If hooks are disabled globally or for the workspace, `/nacl-goal` refuses. Refusal code: `REFUSE_HOOKS_DISABLED`.
3. **Workspace trust not granted** — `/goal` itself requires workspace trust for its hook-based evaluator. Without it, `/nacl-goal` cannot function. Refusal code: `REFUSE_UNTRUSTED_WORKSPACE`.
4. **Concurrent goal lock active** — a node in the alias's lock scope already has `goal_lock_until > now` set in the graph (2.10.1). Refusal code: `REFUSE_CONCURRENT_GOAL_LOCKED`.

---

## Universal denylist

These actions are blocked for **every alias** without exception. An attempt triggers `REFUSE_PRODUCTION_MUTATION` (or the specific applicable refusal code) and clears the goal so the user can run the action interactively.

- `git push` to any remote
- `git merge` into `main`, `master`, or any `release/*` branch
- `gh pr merge` (any PR)
- Release-publishing actions: `npm publish`, `gh release create`, any registry publish command
- Production database migrations (any migration command against a non-test database)
- `rm -rf` outside the current workspace root
- Writing to `.env*`, secrets files, credentials files, `.ssh/`, `~/.aws/`, `~/.config/gh`
- Changing CI/CD configuration or credentials
- Calling third-party paid APIs with side effects beyond the project's test budget

---

## Per-alias allowlist

These actions are permitted within `/nacl-goal` sessions. All other actions not on this list require standard approval prompts.

- Local test execution (`npm test`, `pytest`, `go test`, equivalent runners)
- Graph reads and writes scoped to the current project
- Branch commits (`git add`, `git commit`, `git checkout -b`)
- `gh pr create` (create only; merge is universal denylist)
- YouGile column moves within the current project board
- File writes within the current workspace (outside secret file paths)
- Read-only API calls (YouGile reads, Docmost reads, graph queries)

---

## `conduct` specific rules (2.18.0)

The `conduct` multi-cluster orchestrator inherits the full universal denylist and adds NO new permissions. It does, however, exercise the per-alias allowlist N times — once per cluster — plus one wrapper-level working-branch merge:

- **PERMIT** N × `gh pr create` — one PR per cluster (still create-only; `gh pr merge` stays on the universal denylist).
- **PERMIT** N × `git checkout -b feature/goal-<hash>-<cluster_id> integration/goal-<hash>` — the wrapper cuts each cluster branch; `/nacl-tl-ship` only ever commits to the branch it is handed (it never switches branches).
- **PERMIT** wrapper-level `git merge <verified-cluster-branch>` INTO `integration/goal-<hash>` — a merge into a NON-protected working branch, so a later wave's branches are cut from a base that contains their dependencies.
- **DENY** (universal, unchanged) any `git merge` / `gh pr merge` into `main`/`master`/`release/*` — `REFUSE_PRODUCTION_MUTATION`. The integration branch itself is cut FROM a non-production checkout; running `conduct` from a production branch refuses pre-`/goal` with `PLAN_BLOCKED_UNSAFE_PRODUCTION_MUTATION`.
- Cluster PRs are OPENED, never merged, by the run; the user (or `nacl-tl-release`) merges them afterward.

---

## `migrate-canary` specific rules

The `migrate-canary` alias (2.10.1) has additional restrictions beyond the universal denylist:

- **DENY** any action belonging to a post-canary migration phase. The alias runs only up to the retrospective gate.
- **DENY** any database-mutating migration step that has not been pre-approved by the user in the current session's interactive setup.
- The check script (`nacl-goal/checks/migrate-canary.sh`) must verify on every turn that the retrospective gate has NOT been crossed for the current project. If it has, the script returns `GOAL_BLOCKED` with reason `retrospective_gate_already_passed_use_interactive_skill`.
- If the gate is crossed mid-run (e.g. another terminal crossed it concurrently), the runtime gate detector emits `GATE_VIOLATION_DETECTED`, the proof script returns `GOAL_BLOCKED` on the next probe, and the run file records the event in `gate_violation_attempts[]`.

For the retrospective gate requirement, see `feedback_migration_retrospective_gate` memory: after the canary project, a mandatory 3-sub-agent audit and explicit user approval are required before proceeding with any further migration.

---

## Refusal behavior

Every refusal must:

1. Name the specific gate it fired on, by ID from `nacl-tl-core/references/gate-fire-catalog.md` where applicable.
2. Offer a fallback path. A flat "no" is not acceptable.
3. Print the copy-paste command for the interactive path where a split-mode exists.
4. Log to `.tl/goal-runs/<ts>-refused.md` when the refusal occurs at `--start` time (post-preview). Preview-only refusals are not logged.

Full refusal catalog with message text: `nacl-goal/refusal-catalog.md`.

---

## Enabling hooks

If `/nacl-goal` refuses with `REFUSE_HOOKS_DISABLED`, check `.claude/settings.json`:

```json
{
  "hooks": {
    "enabled": true
  }
}
```

Re-enable hooks and re-run. The runtime gate detector installs its PostToolUse hook at `--start` prelude and removes it at exit; it does not leave permanent hook configuration.
