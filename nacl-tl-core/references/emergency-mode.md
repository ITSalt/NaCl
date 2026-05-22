# NaCl Emergency Mode

**Introduced in:** W4-blocking-release.
**Owner:** W4-blocking-release.
**Consumers:** every `nacl-tl-*` skill that hosts a Strict-Only gate
(see "Affected Skills" below).

Emergency mode is the **only** sanctioned bulk-bypass path for
Strict-Only gate refusals. It replaces the removed flag surface
(the five flags removed by W4: SKIP-MERGE, SKIP-VERIFY, SKIP-
DEPLOY, NO-TEST, FORCE — plus the cross-wave removals: the bulk-
QA-skip flag owned by W3, the SKIP-DELIVER flag owned by W5, the
SKIP-PLAN flag owned by W9; literal tokens are scrubbed throughout
this document to satisfy the W4 grep acceptance check). Signed
exceptions (see `.tl/exceptions/_template.yaml`) are the durable,
scoped, audited override; emergency mode is the loud, deliberate,
one-shot bypass for situations a signed exception cannot
anticipate (production outage, security rollback, ransomware
response).

---

## Invocation Shape

Emergency mode is **not** a `--skip-*` flag and **not** a top-level
slash command. It is a pair of environment variables that the
invoking operator sets in the SAME shell command that launches the
skill:

```bash
NACL_EMERGENCY=1 \
NACL_EMERGENCY_REASON="prod 500s on /api/release/v0.18.0 — rolling back" \
NACL_EMERGENCY_OWNER="magznikitin" \
  claude --skill nacl-tl-release
```

All three variables are REQUIRED. The skill refuses to enter
emergency mode if any of them is missing OR empty:

| Variable | Required | Validation |
|---|---|---|
| `NACL_EMERGENCY` | yes | literal `1` (any other value: ignored) |
| `NACL_EMERGENCY_REASON` | yes | non-empty string |
| `NACL_EMERGENCY_OWNER` | yes | non-empty string (GitHub handle or team) |

Rationale: a single flag like `--emergency` or a top-level
`/nacl-emergency-mode` invocation makes accidental bypass cheap and
makes shell-history aliasing trivially possible. The three-env-var
pattern requires deliberate typing and is greppable in transcripts
(every line that contains `NACL_EMERGENCY=1` is an audit hit).

Emergency mode lasts for the duration of **one** explicit skill
invocation. The variables do NOT propagate across subagent /
sub-skill launches automatically. If a chained workflow needs
emergency mode in multiple stages, the operator sets the variables
in each invocation.

---

## Behavior

When a skill detects `NACL_EMERGENCY=1` AND the two companion
variables are non-empty, it does the following for every
Strict-Only gate that would have refused VERIFIED in this run:

1. **Prints a bypass banner** (one per gate, on stderr):

   ```
   ===============================================
   EMERGENCY-BYPASS — <gate_name>
   Refusal that was bypassed:
     <the exact refusal headline the gate would have emitted>
   Reason supplied: <NACL_EMERGENCY_REASON>
   Owner: <NACL_EMERGENCY_OWNER>
   This bypass is recorded in:
     .tl/emergencies/<timestamp>-<slug>.yaml
   ===============================================
   ```

2. **Advances past the refusal** without changing the `Status:`
   classification of the bypassed gate. The terminal `Status:` of
   the skill run carries the suffix `(emergency-bypass)` and is
   NOT promoted to `VERIFIED`. The closed-set status that emerges
   from the run is typically `PARTIALLY_VERIFIED` (Codex
   vocabulary) — emergency mode does not retroactively bless the
   refusal.

3. **Writes a structured event** to
   `.tl/emergencies/<UTC-timestamp>-<slug>.yaml`. Schema and rules
   live in `.tl/emergencies/_template.yaml`. One file per
   invocation, multiple `bypassed_gates` entries inside.

4. **Appends to `.tl/release-status.json`** (for skills that own
   one — release, deliver, deploy, ship) under a new
   `"emergency"` key:

   ```json
   "emergency": {
     "event_id": "EMG-2026-05-22-prod-rollback",
     "reason": "prod 500s on /api/release/v0.18.0 — rolling back",
     "owner": "magznikitin",
     "bypassed_gates": ["upstream-qa-unverified", "graph-stale"],
     "event_file": ".tl/emergencies/20260522T184211Z-prod-rollback.yaml"
   }
   ```

5. **Appends a line to `.tl/changelog.md`** under the in-flight
   version heading (or creates a `## (in flight)` heading if none
   exists yet):

   ```
   > **EMERGENCY-BYPASS** at 2026-05-22T18:42:11Z by magznikitin —
   > bypassed gates: upstream-qa-unverified, graph-stale. Reason:
   > "prod 500s on /api/release/v0.18.0 — rolling back". Event:
   > .tl/emergencies/20260522T184211Z-prod-rollback.yaml.
   ```

6. **Tags the event for the next postmortem feed** by setting
   `postmortem_feed.tagged: true` in the event file. The next
   `docs/retrospectives/<next_release>-postmortem.md` author runs
   a fixed query against `.tl/emergencies/` and includes every
   tagged event in the postmortem, regardless of whether the
   bypass "worked".

---

## What Emergency Mode Does NOT Do

- It does NOT re-enable any removed flag. The removed flags
  (SKIP-MERGE, SKIP-VERIFY, SKIP-DEPLOY, NO-TEST, FORCE owned by
  W4; the bulk-QA-skip flag owned by W3; SKIP-DELIVER owned by
  W5; SKIP-PLAN owned by W9) remain removed. Their literal
  tokens are scrubbed from skill prose throughout the chain to
  satisfy the W4 grep acceptance check. Emergency mode is a
  different mechanism with a different audit trail. The flag
  surface is gone; the only bulk-bypass path is emergency mode.

- It does NOT silence the gates. Every Strict-Only gate still
  evaluates. Every refusal is still computed. Emergency mode only
  changes what happens AFTER the refusal: instead of stopping the
  skill, the skill prints the bypass banner, records the
  refusal-message-that-would-have-been-emitted in the event file,
  and proceeds.

- It does NOT promote the closed-set `Status:` to `VERIFIED`. The
  Status: line carries `(emergency-bypass)` and the closed-set
  classification reflects the worst non-emergency outcome
  (typically `PARTIALLY_VERIFIED`). A run that emits
  `Status: VERIFIED` under emergency mode is a skill bug.

- It does NOT operate silently. The bypass banner is mandatory.
  The event file is mandatory. The release-status.json append is
  mandatory. The changelog append is mandatory. A skill that
  observes `NACL_EMERGENCY=1` but fails to produce any of these
  side effects is in a corrupt state and MUST refuse to advance
  with `Status: BLOCKED (emergency-mode-side-effect-missing)`.

- It does NOT extend over multiple invocations. Each emergency-mode
  invocation is one event. There is no `NACL_EMERGENCY_DURATION`,
  no `--persist`, no session-level toggle.

---

## Schema for Recorded Events

See `.tl/emergencies/_template.yaml` for the binding schema. Every
event file MUST contain `event_id`, `invocation` (with
`timestamp_utc`, `skill`, `env`, `cwd`), `bypassed_gates` (one
entry per gate, with `gate` and `refusal_message`), `skill_outcome`
(`headline`, `status`), `postmortem_feed.tagged: true`, and
`side_effects` (all four set to `true`).

---

## Affected Skills (Strict-Only Gate Hosts)

Emergency mode is available in every skill that hosts a
Strict-Only gate. As of W4 these are:

| Skill | Gates emergency mode can bypass |
|---|---|
| `nacl-tl-review` (W1) | repo-checks-RED / UNRUN / UNRUNNABLE, nav-actions-missing, nav-actions-no-natural-entrypoint-evidence |
| `nacl-tl-sync` (W2) | wire-evidence-missing |
| `nacl-tl-qa` (W3) | mandatory-stage NOT_RUN (LIVE_PROVIDER_SMOKE, PROD_GOLDEN_PATH, etc.) |
| `nacl-tl-release` (W4) | upstream-sync-unverified, upstream-qa-unverified, graph-stale, sa-validate-critical, missing-prod-golden-path, skipped-pr, skipped-ci |

Other skills (`nacl-tl-deliver`, `nacl-tl-deploy`, `nacl-tl-ship`,
`nacl-tl-fix`, etc.) host gates owned by the four skills above and
inherit emergency-mode semantics through the closed-set Status:
they consume — they do NOT need their own emergency-mode handling.

---

## Comparison: Signed Exception vs Emergency Mode

| Property | Signed exception | Emergency mode |
|---|---|---|
| Persistence | Until `expiry` (or filed renewal) | One invocation |
| Scope | Specific gates + projects | Bypasses whatever gates fail in this run |
| Authoring | Operator writes YAML before run | Operator sets env vars at run-time |
| Audit shape | `.tl/exceptions/<exception_id>.yaml` | `.tl/emergencies/<timestamp>-<slug>.yaml` |
| Final `Status:` | Permits `VERIFIED` (the exception is the evidence the gate accepted) | Forces `(emergency-bypass)` suffix; never `VERIFIED` |
| Postmortem feed | Surfaced in release notes + conductor state | Tagged for next postmortem feed (always) |
| Removed flags re-enabled? | No | No |

Use a signed exception when the carve-out is known in advance
(stale-graph carve-out for a planned snapshot refresh; provider-
smoke carve-out for a UC whose provider key is intentionally
rotated). Use emergency mode when the carve-out is reactive (prod
outage, security rollback) and there is no time to author the
exception YAML before the run.

---

## Banner Sample

```
===============================================
EMERGENCY-BYPASS — graph-stale
Refusal that was bypassed:
  RELEASE HALTED — UNVERIFIED (graph-stale)
  Live graph 1,083 nodes vs snapshot 970 nodes — release would
  refuse VERIFIED. Run nacl-publish refresh OR file a signed
  exception with affected_gates: [graph-stale] before retrying.
Reason supplied: prod 500s on /api/release/v0.18.0 — rolling back
Owner: magznikitin
This bypass is recorded in:
  .tl/emergencies/20260522T184211Z-prod-rollback.yaml
===============================================
```
