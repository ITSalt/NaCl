# NaCl 0.10.1 — Honor Fix Contract in Downstream Skills

This patch release closes a systemic gap that appeared when `nacl-tl-fix` changed its output contract in 0.10.0 but its two main consumers — `nacl-tl-reopened` and `nacl-tl-hotfix` — were not audited in the same release. The result: both skills continued to parse pre-0.10.0 output markers only, missed all six new statuses, and always advanced to the ship step regardless of whether the fix was verified. That is the bug this release fixes.

---

## Why This Release Exists

`nacl-tl-fix` 0.10.0 introduced a status-aware output contract: six statuses (`PASS` / `BLOCKED` / `UNVERIFIED` / `NO_INFRA` / `RUNNER_BROKEN` / `REGRESSION`), three report headers (`FIX COMPLETE` / `FIX APPLIED — UNVERIFIED` / `FIX INCOMPLETE`), and a `Status:` field in every Step 8 report.

Neither `nacl-tl-reopened` nor `nacl-tl-hotfix` was updated alongside `nacl-tl-fix`. Both skills continued to look for the old markers (`"VERIFICATION REPORT"`, `"Development report"`) and treated the output of `/nacl-tl-fix` as a binary pass/fail with no status discrimination. Specifically:

- `nacl-tl-reopened` always advanced to Step 8 (review + stubs) and Step 9 (auto-ship) after `/nacl-tl-fix` returned, even when the fix status was `UNVERIFIED`, `BLOCKED`, `NO_INFRA`, or `RUNNER_BROKEN`. A fix with no test evidence could be shipped automatically.
- `nacl-tl-hotfix` Step 3 described `/nacl-tl-fix` failure as "if /nacl-tl-fix fails, STOP" without defining "fails" against the six-status vocabulary. `UNVERIFIED` and `BLOCKED` are not failures in the old binary sense — the fix was applied — so neither condition triggered a halt. An unverified fix could reach Step 6 (PR + merge to main) without any additional prompt.

The root cause is a missing discipline: when a skill changes its output contract, its downstream consumers must be identified and updated in the same release. This release introduces that discipline explicitly as a `## Contract` section in both affected skills.

---

## What Changed

### nacl-tl-reopened/SKILL.md — four changes

**Change 1 — Step 2 marker list extended.**
The chat-message scan now recognizes all six status-aware headers introduced in 0.10.0:
`FIX COMPLETE`, `FIX APPLIED — UNVERIFIED`, `FIX APPLIED — BLOCKED`, `FIX APPLIED — NO_INFRA`,
`FIX APPLIED — RUNNER_BROKEN`, `FIX INCOMPLETE` (and `FIX INCOMPLETE — REGRESSION`).
The pre-0.10.0 markers (`"VERIFICATION REPORT"`, `"Development report"`) are retained for backward-compat with task history that predates 0.10.0.

**Change 2 — new Step 7.5 "Parse fix status".**
A new mandatory step inserted between Step 7 (FIX) and Step 8 (REVIEW + STUBS). It extracts the `Status:` line from the `/nacl-tl-fix` Step 8 report and branches:
- `PASS` → proceed to Step 8 and Step 9 normally.
- `BLOCKED` → post advisory to YouGile task chat with pre-existing failure list; require user acknowledgment ("proceed" / "investigate"); do NOT auto-ship in Step 9.
- `UNVERIFIED` → post advisory; halt; escalate with explicit message "fix applied but no test exercises the change"; do NOT proceed to auto-review or auto-ship.
- `NO_INFRA` → post advisory; halt; recommend user adds test infra via `/nacl-tl-dev`.
- `RUNNER_BROKEN` → post advisory; halt; escalate as infra problem.
- `REGRESSION` → post failure notice; halt; do NOT proceed to Step 8 or Step 9; note new failures in YouGile chat.

**Change 3 — Step 9 SHIP auto-ship gate.**
The unconditional auto-ship block is replaced with an explicit status check. Auto-ship (when `--auto-ship` was passed) is only permitted when Step 7.5 status is `PASS`. For `BLOCKED` fixes that the user confirmed, ship proceeds but always requires explicit `/nacl-tl-ship` invocation — never auto.

**Change 4 — YouGile rework report template gains `📊 Статус фикса` field.**
The report now includes a `📊 Статус фикса: {STATUS}` line placed alongside `📊 Уровень фикса`, plus a one-line `Пояснение:` taken from the reason text in the `/nacl-tl-fix` Step 8 report. Testers see the verification status without needing to read the full fix report.

### nacl-tl-hotfix/SKILL.md — three changes

**Change 1 — Step 3 Scenario 3: explicit status capture.**
`/nacl-tl-fix` status is captured from its Step 8 `Status:` field. Every non-PASS status triggers a halt-and-confirm prompt — the default answer is "no". The prompt text names the status explicitly (`HOTFIX BLOCKED — UNVERIFIED`, etc.) so the user understands what they are overriding.

**Change 2 — Step 4 VALIDATE: error-source discrimination.**
When tests fail on the hotfix branch, the skill now distinguishes:
- `NO_INFRA` or `RUNNER_BROKEN` from `/nacl-tl-fix` → infrastructure problem, not a code regression; surfaces as `HOTFIX BLOCKED — NO_INFRA` / `HOTFIX BLOCKED — RUNNER_BROKEN`.
- Missing feature-branch dependency → surfaces as the existing "fix depends on feature-only code" advisory.
- Pre-existing failures on main → surfaces as `HOTFIX BLOCKED — pre-existing failures detected`.
The hotfix-specific status vocabulary (`HOTFIX COMPLETE` / `HOTFIX BLOCKED — {SUFFIX}` / `HOTFIX HALTED — {SUFFIX}`) uses only the canonical suffixes from `nacl-tl-fix`; no new suffixes are introduced.

**Change 3 — Step 6 pre-merge gate.**
A status check is inserted before the user confirmation. If fix status is `PASS`, the existing user gate proceeds normally. If status is anything other than `PASS` (and the user has not already confirmed in Step 3), an additional confirmation is required:
```
Fix status: {STATUS}. Shipping a non-PASS fix to main is high-risk. Confirm? [yes/no]
Default: no
```
The PR body now includes `**Fix status:**` and, for non-PASS cases, a note that the fix was shipped with explicit user override.

### Both skills — new `## Contract` section

A `## Contract` section was added to both `nacl-tl-reopened/SKILL.md` and `nacl-tl-hotfix/SKILL.md`, placed after the frontmatter and before the first numbered step. See "Contract Policy" below.

---

## Contract Policy

This release introduces a `## Contract` section as a standard component of every skill that depends on another skill's output. The section documents:

1. **Inputs this skill consumes** — which other skills' output this skill reads, including the specific vocabulary it expects (status codes, headline strings, field names).
2. **Outputs this skill produces** — what downstream consumers can expect.
3. **Downstream consumers** — who (human or automated) reads this skill's output.
4. **Contract change discipline** — a standing rule: if this skill's output contract changes, every downstream consumer listed above must be audited and updated in the same release.

The 0.10.0→0.10.1 regression was caused by the absence of this discipline. `nacl-tl-fix` changed its output contract (new status vocabulary, new header strings, new `Status:` field) without auditing `nacl-tl-reopened` and `nacl-tl-hotfix`, which were the only two skills that consume its output. Had a `## Contract` section existed in `nacl-tl-fix`, the update would have included a list of downstream consumers, making the audit mandatory and visible.

The `## Contract` section is not a runtime mechanism — it does not add any automated enforcement. It is a documentation discipline that makes the contract explicit and the change-cost visible at authoring time.

---

## Migration Impact

**Users:** No change in invocation syntax. Existing `/nacl-tl-reopened` and `/nacl-tl-hotfix` commands work identically. The difference in behavior is that non-PASS fix statuses now halt rather than silently proceeding.

**Orchestrators / automated pipelines:** If any orchestrator reads `nacl-tl-reopened`'s YouGile rework report and parses specific fields, the new `📊 Статус фикса` field is additive — existing field parsing is unaffected. If any orchestrator greps `nacl-tl-hotfix` output for `HOTFIX SHIPPED`, that text is unchanged for the PASS case.

**Behavior change for UNVERIFIED/BLOCKED fixes:** Previously, a reopened task whose fix returned `UNVERIFIED` would be auto-reviewed and auto-shipped if `--auto-ship` was passed. After 0.10.1, it halts and requires explicit user input. This is a deliberate behavior change; the old behavior was a bug.

---

## Verification

These skills are prompt files, not code. The regression tests for this release are manual scenarios.

### Scenario 1 — reopened halts on UNVERIFIED fix

**Setup:** A reopened task is processed via `/nacl-tl-reopened`. During Step 7, `/nacl-tl-fix` returns with status `UNVERIFIED` (header: `FIX APPLIED — UNVERIFIED`, reason: "no test exercises the change").

**Expected behavior:**
1. Step 7.5 detects status `UNVERIFIED`.
2. An advisory is posted to YouGile task chat (or logged locally if YouGile is not configured) with the text "fix applied but no test exercises the change".
3. The skill halts before invoking `/nacl-tl-review` or `/nacl-tl-stubs`.
4. The skill does NOT invoke `/nacl-tl-ship` and does NOT move the task to DevDone.
5. The user is presented with two options: write a regression test now, or accept unverified and confirm "proceed unverified".

**Failure condition (would indicate the bug is still present):** Skill invokes `/nacl-tl-review` or `/nacl-tl-stubs` automatically without user input, or moves the task to DevDone.

### Scenario 2 — hotfix prompts second confirmation on UNVERIFIED fix

**Setup:** `/nacl-tl-hotfix "description"` is invoked (Scenario 3). During Step 3, `/nacl-tl-fix` returns with status `UNVERIFIED`.

**Expected behavior:**
1. Step 3 detects status `UNVERIFIED` (not `PASS`).
2. Skill presents halt prompt:
   ```
   HOTFIX BLOCKED — UNVERIFIED
   Fix applied but no test exercises the change. Cannot machine-verify correctness.
   Shipping a non-PASS fix to main is high-risk. Confirm to proceed? [yes/no]
   Default: no
   ```
3. If the user does not respond or responds "no", the skill stops entirely (no PR created, no push).
4. If the user responds "yes", the workflow continues to Step 4.
5. At Step 6 (PR + MERGE), a second confirmation appears:
   ```
   Fix status: UNVERIFIED. Shipping a non-PASS fix to main is high-risk. Confirm? [yes/no]
   Default: no
   ```
6. The PR body, if created, includes `**Fix status:** UNVERIFIED` and a note that the fix was shipped with explicit user override.

**Failure condition (would indicate the bug is still present):** Skill proceeds past Step 3 without any halt or confirmation when status is `UNVERIFIED`, or creates a PR without surfacing the status.

---

## Known Limitations

- The `## Contract` section is documentation, not a runtime check. There is no automated enforcement that downstream consumers have been audited when a contract change is made. Discipline is maintained by convention and code review.
- `nacl-tl-reopened` Step 2 adds the new status-aware markers to its scan table, but the scan is implemented by the LLM parsing chat messages — not by a structured parser. If `/nacl-tl-fix` produces an unusual report format, the marker search may miss the status. The `Status:` field in the `/nacl-tl-fix` Step 8 report is the canonical extraction target; the markers are for context.
- The `BLOCKED` path in `nacl-tl-reopened` (pre-existing failures confirmed by baseline) is the only non-PASS status that can continue to review + ship with user consent. The other non-PASS statuses (`UNVERIFIED`, `NO_INFRA`, `RUNNER_BROKEN`, `REGRESSION`) all halt and require remediation before proceeding.
