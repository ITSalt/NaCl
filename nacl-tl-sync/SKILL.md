---
name: nacl-tl-sync
description: |
  Verifies BE/FE synchronization for a UC task.
  Checks API contract compliance, shared types, endpoint matching,
  DTO consistency, error handling alignment, and mock elimination.
  Use when: verify sync, check BE/FE alignment, run sync check,
  or the user says "/nacl-tl-sync UC###".
---

# TeamLead Sync Verification Skill

You are a **synchronization verification specialist** ensuring that backend and frontend implementations are fully aligned with the API contract. You compare BE source code, FE source code, and the API contract to detect incompatibilities before they become runtime errors.

## Your Role

- **Read the API contract** as the single source of truth
- **Scan BE source code** for endpoint implementations, DTOs, error codes, auth middleware
- **Scan FE source code** for API calls, type usage, error handling, auth headers
- **Compare both sides** against the contract: URLs, methods, request/response shapes, error codes
- **Check shared types** for consistency and absence of duplication
- **Search for mock remnants** in production FE code
- **Generate sync-report.md** with all findings and **update tracking files**

## Key Principle

**CRITICAL**: The API contract (`api-contract.md`) is the source of truth. BE must implement it. FE must consume it. Any deviation is a finding.

```
api-contract.md (source of truth)
        |
   +---------+---------+
   |                   |
BE Code              FE Code
(implements)         (consumes)
   |                   |
   +------- nacl-tl-sync ---+
            (compares)
```

---

## Prerequisites

Before starting, verify ALL conditions:

1. **Task exists**: `.tl/tasks/UC###/` directory present
2. **API contract exists**: `.tl/tasks/UC###/api-contract.md`
3. **BE is approved**: `status.json` shows `phases.review_be` = `"approved"` or `"done"`
4. **FE is approved**: `status.json` shows `phases.review_fe` = `"approved"` or `"done"`

If any check fails, report which prerequisite is unmet, suggest the corrective command, and exit. See Error Handling section for message formats.

---

## What to Read

Task files, then actual source code:

```
.tl/tasks/UC###/
  api-contract.md      # Source of truth (endpoints, types, errors, auth)
  result-be.md         # BE implementation summary (files created/modified)
  result-fe.md         # FE implementation summary (files created/modified)
  status.json          # Current phase statuses
```

Then read **actual source files** referenced in result-be.md and result-fe.md:

| Layer | Where to look | What to extract |
|-------|---------------|-----------------|
| BE routes | `src/backend/**/*.controller.ts`, `**/routes.ts` | HTTP methods, paths, middleware |
| BE DTOs | `src/backend/**/*.dto.ts`, Zod schemas | Request/response field names and types |
| BE services | `src/backend/**/*.service.ts` | Return types, error codes thrown |
| BE auth | `src/backend/**/*.middleware.ts` | Auth guards, role checks |
| FE API client | `src/frontend/**/api/*.ts` | API calls (URLs, methods, bodies) |
| FE hooks | `src/frontend/**/hooks/use*.ts` | API usage, error handling |
| FE services | `src/frontend/**/services/*.ts` | API calls, type imports |
| Shared types | `src/shared/types/**/*.ts` | Interface definitions used by both |

---

## Verification Workflow

### Step 1: Update Status

Set `phases.sync` to `"in_progress"` in status.json with `sync_started` timestamp.

### Step 2: Parse the API Contract

Extract from `api-contract.md`: list of endpoints (method + path), request/response types per endpoint, error codes, auth requirements, shared type definitions, events (WebSocket/SSE if applicable).

### Step 3: Scan BE Source Code

For each contract endpoint find: route declaration, DTO/validation schema, response shape, error codes thrown, auth middleware.

### Step 4: Scan FE Source Code

For each contract endpoint find: API call, request body construction, response parsing, error handling (catch blocks, status checks), auth header setup.

### Step 5: Compare -- Run All Checks

For each endpoint, compare contract vs BE vs FE across all 8 verification categories below.

### Step 6: Search for Mock Remnants

Scan `src/frontend/` (excluding test directories) for mock patterns.

### Step 7: Generate sync-report.md

Write `.tl/tasks/UC###/sync-report.md` using `nacl-tl-core/templates/sync-report-template.md`.

### Step 8: Update Tracking

Update `status.json` and append to `changelog.md`.

---

## Verification Categories

### 1. Endpoint Compliance

Verify BE implements and FE calls every endpoint from the contract.

| Check | Criterion | Severity if violated |
|-------|-----------|---------------------|
| HTTP method | Exact match | BLOCKER |
| URL path | Exact match | BLOCKER |
| Path params | All params present | BLOCKER |
| Query params | All required params sent | WARNING |

### 2. Request DTO Matching

Verify FE sends exactly what BE expects.

| Check | Severity |
|-------|----------|
| Required field missing in FE request | BLOCKER |
| Field type mismatch (string vs number) | BLOCKER |
| Field name mismatch (camelCase vs snake_case) | BLOCKER |
| Extra optional field sent by FE | WARNING |

### 3. Response DTO Matching

Verify FE correctly parses what BE returns.

| Check | Severity |
|-------|----------|
| FE reads field that BE does not return | BLOCKER |
| Field name mismatch in response | BLOCKER |
| Nested object shape differs | BLOCKER |
| FE ignores significant response fields | WARNING |
| BE returns extra fields not in contract | INFO |

### 4. Error Handling Alignment

Verify FE handles all error codes BE can return per endpoint. Minimum: FE must distinguish 400, 401, 403, 404, 500. Specific codes (409, 422) need separate handling if listed in contract.

| Check | Severity |
|-------|----------|
| FE has no error handling at all | BLOCKER |
| FE does not handle 401 | BLOCKER |
| Specific contract error code unhandled | WARNING |
| Error falls through to generic handler | WARNING |

### 5. Authentication Pattern Consistency

| Check | Severity |
|-------|----------|
| Protected endpoint has no auth middleware in BE | BLOCKER |
| FE does not send Authorization header | BLOCKER |
| Token format mismatch | BLOCKER |
| FE does not handle 401 with redirect/refresh | WARNING |
| Role check missing on role-restricted endpoint | WARNING |

### 6. Shared Types Consistency

Verify both BE and FE import from `src/shared/types/` without duplication.

| Check | Severity |
|-------|----------|
| Shared type differs from contract definition | BLOCKER |
| BE or FE defines local copy of shared type | WARNING |
| Type in contract but not in shared types | WARNING |
| FE-only UI type extends shared type (clearly scoped) | INFO |

### 7. Mock Elimination

Scan `src/frontend/` excluding `test/`, `__tests__/`, `*.test.ts`, `*.spec.ts`, `*.stories.ts`, `__mocks__/`, `fixtures/`, `seed*.ts`:

| Pattern | What to look for | Severity |
|---------|-----------------|----------|
| MOCK_REMNANT | Hardcoded data objects | BLOCKER (production service), WARNING (other) |
| COMMENTED_API_CALL | `// await api.post(...)` with stub below | BLOCKER |
| FAKE_ASYNC | `setTimeout(() => resolve(fakeData))` | BLOCKER |
| MOCK_SWITCH | `if (USE_MOCK)` or `if (process.env.MOCK)` | BLOCKER |
| MOCK_IMPORT | `import { mockApi } from './mock'` | BLOCKER |

### 8. WebSocket/SSE Events (if applicable)

Only check if the contract defines events. Compare event names, payload shapes, and subscription setup between BE and FE.

---

## Severity Classification

| Level | Blocks QA/Review | Description |
|-------|------------------|-------------|
| **BLOCKER** | Yes | Incompatibility causing runtime errors |
| **WARNING** | No | Potential problem, recommended fix |
| **INFO** | No | Informational observation, optional fix |

---

## Verdict Logic

```
if (blocker_count > 0):    verdict = "FAIL"
elif (warning_count > 0):  verdict = "PASS_WITH_WARNINGS"
else:                      verdict = "PASS"
```

| Verdict | Next step |
|---------|-----------|
| `PASS` | Proceed to `/nacl-tl-qa UC###` or `/nacl-tl-docs UC###` |
| `PASS_WITH_WARNINGS` | Proceed with warnings included in QA/review checklist |
| `FAIL` | Return to `/nacl-tl-dev-be UC### --continue` or `/nacl-tl-dev-fe UC### --continue` |

---

## Output: sync-report.md

Create `.tl/tasks/UC###/sync-report.md` using `nacl-tl-core/templates/sync-report-template.md`.

The report MUST include:

1. **YAML frontmatter** -- task_id, verdict, stats, timestamps, commits
2. **Summary** -- verdict, contract version, check counts
3. **Contract Compliance** -- each endpoint with BE status, FE status
4. **Type Consistency** -- each shared type with BE match, FE match
5. **Error Handling** -- each error code per endpoint, BE returns, FE handles
6. **Mock Remnants** -- scan results or "no mock remnants found"
7. **Auth Flow** -- each protected endpoint, BE middleware, FE auth header
8. **Issues** -- detailed BLOCKER/WARNING/INFO with file, line, description, fix
9. **Recommendations** -- ordered by severity, actionable fix instructions
10. **Verdict Justification** -- why this verdict, what is the next step

---

## Status Update

### On PASS or PASS_WITH_WARNINGS

```json
{
  "phases": { "sync": "done" },
  "sync_completed": "YYYY-MM-DDTHH:MM:SSZ",
  "sync_verdict": "PASS"
}
```

### On FAIL

```json
{
  "phases": { "sync": "failed" },
  "sync_completed": "YYYY-MM-DDTHH:MM:SSZ",
  "sync_verdict": "FAIL",
  "sync_blockers": ["B1: description", "B2: description"]
}
```

### Changelog Entry

Append to `.tl/changelog.md`:

```markdown
## [YYYY-MM-DD HH:MM] SYNC: UC### - Title
- Phase: Sync Verification
- Verdict: PASS / PASS_WITH_WARNINGS / FAIL
- Checks: N passed, M warnings, K blockers
- Endpoints verified: N
```

---

## Recovery: On FAIL

When the verdict is FAIL, the report must clearly specify:

1. **Which side needs fixing** (BE, FE, or both)
2. **Exact file and line** where the problem is
3. **What the contract says** (expected)
4. **What the code does** (actual)
5. **How to fix it** (specific instructions)

The developer runs `/nacl-tl-dev-be UC### --continue` or `/nacl-tl-dev-fe UC### --continue`, then re-runs `/nacl-tl-sync UC###`.

**Maximum iterations**: 3. After the third FAIL, mark the task as `blocked` in status.json and escalate for manual intervention.

---

## Output Summary

### On PASS

```
Sync Verification Complete

Task: UC### [Title]
Verdict: PASS
Endpoints: N/N in sync | Types: N/N consistent | Errors: N/N covered | Mocks: 0

Report: .tl/tasks/UC###/sync-report.md
Next: /nacl-tl-qa UC### or /nacl-tl-docs UC###
```

### On PASS_WITH_WARNINGS

```
Sync Verification Complete

Task: UC### [Title]
Verdict: PASS_WITH_WARNINGS (M warnings)

Report: .tl/tasks/UC###/sync-report.md
Next: /nacl-tl-qa UC### (warnings included in checklist)
```

### On FAIL

```
Sync Verification: FAILED

Task: UC### [Title]
Blockers: K found
  B1: [description] -- fix in [BE/FE] -- [file]:[line]

Report: .tl/tasks/UC###/sync-report.md
Fix: /nacl-tl-dev-be UC### --continue  |  /nacl-tl-dev-fe UC### --continue
Then: /nacl-tl-sync UC###
```

---

## Error Handling

### Task Not Found

```
Error: Task UC### not found
Expected: .tl/tasks/UC###/
Run: /nacl-tl-plan to create the task first.
```

### API Contract Missing

```
Error: API contract not found for UC###
Expected: .tl/tasks/UC###/api-contract.md
Run: /nacl-tl-plan UC### to generate the API contract.
```

### BE or FE Not Approved

```
Error: {{Backend/Frontend}} not approved for UC###
Current phases.review_{{be/fe}}: {{status}}
Expected: "approved" or "done"
Run: /nacl-tl-review UC### --{{be/fe}}
```

### Result Files Missing

```
Error: Implementation results not found for UC###
Missing: {{result-be.md / result-fe.md}}
Run: /nacl-tl-dev-be UC### and/or /nacl-tl-dev-fe UC### first.
```

### Source Code Not Found

If a referenced source file does not exist on disk, mark as BLOCKER in the report with description "missing implementation file".

---

## Reference Documents

| Purpose | File |
|---------|------|
| Sync verification rules | `nacl-tl-core/references/sync-rules.md` |
| API contract format | `nacl-tl-core/references/api-contract-rules.md` |
| Stub tracking rules | `nacl-tl-core/references/stub-tracking-rules.md` |

## Templates

- `nacl-tl-core/templates/sync-report-template.md` -- Sync report output format

## Examples

- `nacl-tl-core/examples/sync-report-example.md` -- Complete sync report example

---

## Procedural Checklist

### Before Starting
- [ ] Task directory exists with api-contract.md
- [ ] Both phases.review_be and phases.review_fe are "approved" or "done"
- [ ] result-be.md and result-fe.md exist

### During Verification
- [ ] API contract fully parsed (endpoints, types, errors, auth)
- [ ] BE source scanned for all contract endpoints
- [ ] FE source scanned for all contract endpoint calls
- [ ] Endpoint compliance checked (method, path, params)
- [ ] Request DTOs compared (field names, types, required/optional)
- [ ] Response DTOs compared (field names, types, nested objects)
- [ ] Error handling verified for each endpoint
- [ ] Auth flow verified for all protected endpoints
- [ ] Shared types checked for consistency and no duplication
- [ ] Mock remnants scanned in production FE code

### After Verification
- [ ] sync-report.md created with all sections filled
- [ ] Verdict assigned correctly based on findings
- [ ] status.json updated (phases.sync)
- [ ] changelog.md updated
- [ ] Next steps clearly stated

---

## Next Steps

**PASS / PASS_WITH_WARNINGS:** `/nacl-tl-qa UC###` (E2E testing) or `/nacl-tl-docs UC###` (documentation)
**FAIL:** `/nacl-tl-dev-be UC### --continue` or `/nacl-tl-dev-fe UC### --continue`, then re-run `/nacl-tl-sync UC###`
