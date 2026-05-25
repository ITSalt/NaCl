# /nacl-goal refusal catalog

Every refusal path through `/nacl-goal` returns one of these codes.
Refusals are logged to `.tl/goal-runs/<ts>-refused.md` when they occur
at `--start` (post-preview); preview-only refusals are not logged.

## REFUSE_HUMAN_GATE_BA_SA_HANDOFF

| | |
|---|---|
| Triggers | Alias resolves to a workflow that crosses the BA→SA handoff confirmation, OR runtime gate detector spots the handoff prompt |
| Message | "`/nacl-goal` cannot wrap a workflow that crosses the BA→SA handoff. This is a mandatory human-approval gate that locks the BA layer before SA decomposition. Run `/nacl-ba-handoff` interactively, confirm the handoff, then re-run `/nacl-goal`." |
| Fallback | Run `/nacl-ba-handoff` interactively. After confirmation, the original `/nacl-goal <alias>` becomes valid. |
| Logs to runs/ | Yes if hit at `--start` (gate detector). No if caught at preview. |
| Reference | `nacl-tl-core/references/gate-fire-catalog.md#ba-sa-handoff` |

## REFUSE_HUMAN_GATE_SA_PHASE_CONFIRMATION

| | |
|---|---|
| Triggers | Alias resolves to `nacl-sa-full` or any SA phase that requires user confirmation between phases (context → domain → roles → UC → UI → finalize) |
| Message | "`/nacl-goal` cannot wrap `nacl-sa-full` or any incremental SA phase. Each SA phase has a mandatory user confirmation gate. Run `/nacl-sa-full` interactively through phase confirmation, then `/nacl-goal validate:module:<X>` to verify." |
| Fallback | `/nacl-sa-full` interactively, then `/nacl-goal validate:module:<X>` |
| Logs to runs/ | Yes if hit at `--start`. No if caught at preview. |
| Reference | `nacl-tl-core/references/gate-fire-catalog.md#sa-phase-confirmation` |

## REFUSE_HOTFIX_JUDGMENT

| | |
|---|---|
| Triggers | Alias resolves to `nacl-tl-hotfix`, OR `fix:<BUG>` where the bug is L0/L1, OR `reopened-drain` containing emergency-tagged items |
| Message | "`/nacl-goal` cannot wrap emergency hotfix work. Hotfix routing requires human judgment about urgency, scope, and target branch. Run `/nacl-tl-hotfix` interactively. Resume the wrapper for the post-hotfix verification work afterwards." |
| Fallback | `/nacl-tl-hotfix` interactively |
| Logs to runs/ | Yes if hit at `--start`. No if caught at preview. |
| Reference | `feedback_ship_never_switch_branches.md` (memory) |

## REFUSE_POST_CANARY_RETROSPECTIVE

| | |
|---|---|
| Triggers | `migrate-canary` alias when retrospective gate has already been passed for this project, OR runtime detection of attempted post-canary migration step |
| Message | "`/nacl-goal migrate-canary` runs only up to the retrospective gate. After the canary project (per `feedback_migration_retrospective_gate.md`), a mandatory 3-sub-agent audit and explicit user approval are required before any further migration. Continue `/nacl-migrate` interactively." |
| Fallback | `/nacl-migrate` interactively from the retrospective gate forward |
| Logs to runs/ | Yes |
| Reference | `feedback_migration_retrospective_gate.md` (memory) |

## REFUSE_PRODUCTION_MUTATION

| | |
|---|---|
| Triggers | Universal denylist hit: `git push`, `gh pr merge`, `npm publish`, `gh release create`, production DB migration, or any action against `main`/`master`/`release/*` |
| Message | "`/nacl-goal` blocked an attempt to mutate a production target (`<command>`). Production mutations always require a human gate. The work up to the merge boundary was preserved; the wrapper has cleared the goal so you can run the production step interactively." |
| Fallback | Run the blocked command yourself, then a fresh `/nacl-goal` if more loop-able work remains |
| Logs to runs/ | Yes; `gate_violation_attempts[]` populated |
| Reference | `docs/guides/goal-permissions.md` |

## REFUSE_UNTIERED_CUSTOM_GOAL

| | |
|---|---|
| Triggers | `/nacl-goal custom` invoked without `--tier=` AND/OR without `--check-script=`, OR the supplied `--check-script` path does not exist / is not executable |
| Message | "`/nacl-goal custom` requires both `--tier=<S\|M\|L\|XL>` and `--check-script=<path>`. The check script must produce GOAL_PROOF-compatible output (see `docs/guides/goal-proof-protocol.md`). Without a script there is no way for the evaluator to verify your custom objective." |
| Fallback | Provide both flags, or use a built-in alias |
| Logs to runs/ | No (preview-time refusal) |
| Reference | `docs/guides/goal-command.md` §custom |

## REFUSE_UNTRUSTED_WORKSPACE

| | |
|---|---|
| Triggers | Workspace trust has not been granted in Claude Code (required for hooks, which `/goal` depends on) |
| Message | "`/nacl-goal` requires workspace trust, which `/goal` uses for its hook-based evaluator. Accept the trust dialog (`Esc` → workspace trust) and re-run." |
| Fallback | Accept the workspace trust dialog |
| Logs to runs/ | No (cannot write run file without trust) |
| Reference | Claude Code 2.1.139 release notes |

## REFUSE_HOOKS_DISABLED

| | |
|---|---|
| Triggers | The user has disabled hooks globally or for this workspace |
| Message | "`/nacl-goal` cannot run with hooks disabled — the runtime gate detector and stop-signal probe both depend on PostToolUse hooks. Re-enable hooks in `.claude/settings.json` and re-run." |
| Fallback | Re-enable hooks |
| Logs to runs/ | No |
| Reference | `docs/guides/goal-permissions.md` |

## REFUSE_CONCURRENT_GOAL_LOCKED

| | |
|---|---|
| Triggers | A node in this alias's `lock_scope` already has `goal_lock_until > now` set in the graph |
| Message | "`/nacl-goal <alias>` is already running under `run_id=<id>` (started at `<ts>`, lock expires at `<ts>`). Two concurrent runs over the same scope would corrupt the run file and double-spend tokens. Either wait, or run `/nacl-goal abort <run_id>` if you believe the lock is stale." |
| Fallback | Wait, or `/nacl-goal abort <run_id>` |
| Logs to runs/ | Yes (separate refused-due-to-lock entry, references blocking run_id) |
| Reference | Architecture §7 |

## REFUSE_DANGEROUSLY_SKIP_PERMISSIONS

| | |
|---|---|
| Triggers | Session was started with `--dangerously-skip-permissions` |
| Message | "`/nacl-goal` will not run when permissions are bypassed. The denylist (`git push`, `gh pr merge`, production mutations, secret-file writes) depends on the standard permission gate to enforce. Restart the session without `--dangerously-skip-permissions`." |
| Fallback | Restart Claude Code without the flag |
| Logs to runs/ | No |
| Reference | `docs/guides/goal-permissions.md` |

---

## Behavior contract for refusals

1. Refusals MUST name the specific gate they fired on, by ID from
   `nacl-tl-core/references/gate-fire-catalog.md` where applicable.
2. Refusals MUST offer a fallback. A flat "no" is not acceptable.
3. Where a "split-mode" path exists (interactive skill → wrapper), the
   refusal message MUST print the copy-paste command for the
   interactive path.
4. Tier-C refusals fire at **preview** time wherever statically
   possible (i.e. by alias identity). The runtime gate detector only
   exists to catch dynamic crossings that static resolution missed.
5. Refusal codes are part of the wire format. Renaming or removing a
   code is a major version bump for `/nacl-goal`.
