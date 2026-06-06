# /nacl-goal default safe-exception envelope

The `intake` alias runs autonomously by default. Some safe, narrow exceptions
are pre-authorized by the user's invocation itself so the wrapper can avoid
halting mid-flow for human-in-the-loop questions whose answers are already
encoded in the user's choice to invoke `/nacl-goal intake`.

This file is the closed contract for that envelope. Adding a new gate is a
code change (intentional friction). User opt-out is via `--strict`.

---

## Authorization model

The user's invocation of `/nacl-goal intake` **is** the human decision. The
wrapper materializes that decision into the on-disk form inner skills already
understand: a signed exception YAML, owned by the user, living in a
wrapper-scoped namespace, expiring at the end of the run.

This preserves NaCl's standing rule "agent never self-decides exception
disposition" — the decision happens at user-invocation time, not silently
mid-flow inside the inner skill.

---

## Namespace

Wrapper-authored exception YAMLs live at:

```
.tl/exceptions/goal-runs/<run_id>/EXC-goal-<gate>.yaml
```

**Distinct from** the shared `.tl/exceptions/` root, which stays the home of
human-authored audit YAMLs (per the existing W4 schema in `nacl-tl-fix`).

Inner skills (in PR2 of the 2.10.1 milestone) extend their exception-lookup
glob to scan **both**:

- `.tl/exceptions/EXC-*.yaml` — human-authored, persistent
- `.tl/exceptions/goal-runs/*/EXC-goal-*.yaml` — wrapper-authored, run-scoped

Until PR2 ships, wrapper exceptions are written but not yet honored by inner
skills. PR1 establishes the contract only.

---

## Auto-enabled gates (closed, global)

A gate is "auto-enabled" when, given a `--strict`-disabled run, the wrapper
will materialize a signed exception YAML for it whenever an atom in the plan
would predictably hit it.

### `spec-first-prerequisite`

| | |
|---|---|
| Inner skill | `nacl-tl-fix` Step 6.SF |
| Triggers | L1 code-only fix where graph spec is prose-level (not column-granular or step-granular at the affected surface) |
| Precondition for envelope | Plan atom has `risk_level == L1` AND `linked_uc` is present AND atom's `evidence` includes `GRAPH` AND `hard_refuse_triggers` is empty |
| Precedent | `EXC-2026-05-25-uc-804-key-column-name` (UC-804 «Ключ» column display fix) |

### `spec-gap-routing`

| | |
|---|---|
| Inner skill | `nacl-tl-intake` SPEC_GAP atom routing |
| Triggers | `/nacl-tl-intake --emit-state` reports `spec_gap: true` for an atom |
| Precondition for envelope | **All** of: same `linked_uc` as a routed precedent; same affected component/module; same gate family; no `hard_refuse_triggers` from {`schema_migration`, `public_api_contract`, `auth_or_security`, `billing`}; `risk_level == L1`; `confidence == HIGH`; evidence includes `GRAPH` |

### `medium-confidence-routing` (2.14+)

| | |
|---|---|
| Inner skill | `nacl-tl-intake --autonomous` Step 2b (Template D auto-route) |
| Triggers | An atom classifies at `confidence == MEDIUM` with `evidence` including `GRAPH`; instead of the interactive recommendation prompt, the leading guess is routed and the alternative is recorded as `residual_note` (reason `medium_confidence_alternative`) with a tracked follow-up |
| Precondition for envelope | **All** of: `hard_refuse_triggers` is empty (an atom carrying ANY hard-refuse trigger never auto-routes — Template C / `PLAN_BLOCKED_*` path); `risk_level` ∈ {`L0`, `L1`, `L2`}; `linked_uc` present; `residual_note.followup_task` recorded (an auto-route without the tracked alternative is invalid) |

The user decided at invocation time (autonomy-by-default `intake`); the
wrapper materializes the exception so the confidence call is audit-logged
like every other envelope gate — `exceptions.log` + PR-body authorization
section, never silent. Listed in
`plan.lock.json.authorization.envelope_gates` when the plan contains at
least one MEDIUM-confidence atom.

`column-display-undocumented` is **NOT** in the 2.10.1 global envelope. It is
project-specific in spirit and belongs to the deferred project-local
exception policy mechanism (planned for 2.10.2+ as
`.tl/project-exception-policy.yaml`).

---

## Hard-refuse list (never auto-except, even when `--strict` is off)

The wrapper never materializes an exception for any of:

- Production-branch mutation: `git push` to `main`/`master`/`release/*`, or `gh pr merge` into those (already covered by `REFUSE_PRODUCTION_MUTATION`)
- Migrations / schema changes: DB migrations, message-contract changes, public-API contract changes
- Auth / security / permissions changes
- Billing / payment changes
- Destructive data operations
- L2 / L3 architecture or product-contract amendments
- Ambiguous feature requirements (also caught by `PLAN_BLOCKED_AMBIGUOUS_CLASSIFICATION`)
- Hotfix / release routing — `/nacl-tl-hotfix` and `/nacl-tl-release` remain separate human moments

When a plan would require crossing any of these, the wrapper refuses
**before** issuing `/goal` with the appropriate `PLAN_BLOCKED_FEATURE_REQUIRES_*` code from `refusal-catalog.md`.

---

## YAML template

```yaml
exception_id: "EXC-goal-<run_id>-<gate>"

owner: "<git user.email>"

gate: "<gate-name>"

reason: |
  Pre-authorized via /nacl-goal intake at <ts>.
  Goal run-id: <run_id>.
  Source goal hash: <goal_fingerprint>.
  Source goal preview: <sanitized_preview>

expires: "<issued_at + 3h>"   # matches Tier-M wall-clock budget

followup: "<linked UC from plan>"

authorization_source: "user invocation of /nacl-goal intake"
```

### `sanitized_preview` rules (YAML-injection defense)

The free-text goal must NOT be embedded raw in `reason`. The wrapper computes
a `sanitized_preview` by:

1. Truncating to max 200 characters
2. Collapsing all newlines to single spaces
3. Escaping YAML control chars: `:`, `"`, `'`, `|`, `>`, `&`, `*`, `#`, `%`, `@`, `` ` ``
4. Stripping non-printable / control bytes (< 0x20 except space, and ≥ 0x7F that aren't printable Unicode)

The full goal text already lives in the gitignored `request.json`. The
exception YAML carries only the sanitized preview + the cryptographic
fingerprint that links back to it. This prevents:

- YAML parser breakage on embedded `: ` or quote runs
- Accidental log exposure of full PII goals into shared exception audit tooling
- Visual injection (control sequences in terminal display of the YAML)

---

## Lifecycle

```
1. Plan classification produces atoms with predicted gates.
2. Step 7 (MATERIALIZE EXCEPTION ENVELOPE) writes one YAML per gate that the
   plan would hit, into .tl/exceptions/goal-runs/<run_id>/.
3. Inner skill (in PR2+) detects the YAML via its extended exception-glob and
   bypasses the gate exactly as if a human had filed the exception manually.
4. On GOAL_OK: original YAMLs stay in place under
   .tl/exceptions/goal-runs/<run_id>/ as audit artifacts (full file retained).
   A one-line JSONL summary per YAML is also appended to
   .tl/goal-runs/<run_id>/exceptions.log for skim audit.
5. On GOAL_BLOCKED / budget exhaustion: YAMLs and run artifacts are left in
   place for forensics.
6. `expires` is honored as a hard bound. If the run goes past 3h, the inner
   skill must treat the exception as invalid even if the YAML is still on disk.
```

---

## `--strict` semantics

`--strict` on `/nacl-goal intake` does two things:

1. Skips step 7 entirely — no exception YAMLs are written.
2. Triggers step 6 (`--STRICT PRE-FLIGHT`): if the plan predicts any
   auto-enabled gate would fire, the wrapper refuses at preview time with
   `PLAN_BLOCKED_STRICT_REQUIRES_INTERACTIVE_FLOW`. The user must run the
   inner skill interactively (and file a human exception, if any).

This means `--strict` is opt-in to the full interactive contract. It does
NOT silently halt mid-flow — the refusal happens before `/goal` is issued.

---

## What this envelope is NOT

- **Not** a free-for-all bypass. The whitelist is closed and small.
- **Not** an "agent decides" mechanism. The user decides at invocation time;
  the wrapper just materializes the decision.
- **Not** a place to add project-specific gates. Those wait for the
  `.tl/project-exception-policy.yaml` mechanism in 2.10.2+.
- **Not** persistent. Exceptions expire with the run.
- **Not** retroactive. Resume re-uses existing on-disk YAMLs (if still
  unexpired); it does not author new ones for atoms that were already
  verified before the interruption.

---

## Audit

For every wrapper-authored exception, the following is durable:

- The YAML file under `.tl/exceptions/goal-runs/<run_id>/`
- A JSONL line in `.tl/goal-runs/<run_id>/exceptions.log`:
  ```
  {"ts":"...","run_id":"...","exc_file":".tl/exceptions/goal-runs/.../EXC-goal-<gate>.yaml","gate":"<gate>","atom_ids":["..."],"owner":"<email>","expires":"..."}
  ```
- An entry in the inner skill's own audit trail (e.g. `nacl-tl-fix`'s
  Step 8 report includes `exception_id` + `expiry` + `followup_task`),
  which proceeds exactly as it would for a human-filed exception.

Three audit surfaces, one mechanism. The wrapper does not invent a new
exception schema — it reuses the existing W4 schema with the run-scoped
filename pattern as the only distinguishing feature.
