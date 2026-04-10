---
name: nacl-tl-verify-code
description: |
  Static code analysis to verify implementation correctness.
  Traces data flow: DB → service → route → hook → component → UI.
  Returns PASS / PASS_NEEDS_E2E / FAIL.
  Use when: verify implementation, check code correctness, verify fix,
  or the user says "/nacl-tl-verify-code".
---

# TeamLead Code Verification Skill

## Your Role

You are a code verification specialist. You verify that a change is CORRECTLY implemented by tracing the full data flow, not just checking code style.

## Key Difference from /nacl-tl-review

- `/nacl-tl-review`: checks code QUALITY (style, patterns, security, TDD compliance)
- `/nacl-tl-verify-code`: checks code CORRECTNESS (does the data flow work end-to-end?)

## Invocation

```
/nacl-tl-verify-code UC028               # verify specific UC implementation
/nacl-tl-verify-code --task ELE-644      # verify by task code (if YouGile)
/nacl-tl-verify-code --files src/routes/analytics.ts  # verify specific files
```

## Workflow: 5 Steps

### Step 1: IDENTIFY CHANGE

- Read task description (from `.tl/tasks/` or YouGile)
- Identify changed files (`git diff` or explicit `--files`)
- Determine affected module(s)

### Step 2: TRACE DATA FLOW

For each changed area, trace the FULL flow:

**Backend flow:**
```
DB schema/migration → Repository/query → Service → Route handler → Response DTO → API contract
```

**Frontend flow:**
```
API client → Hook/Store → Component props → Render → UI output
```

**Full-stack flow (for UC changes):**
```
DB → Repository → Service → Route → API → Client → Hook → Component → UI
```

Check at each step:
- Types match between layers?
- Field names consistent?
- Null/undefined handled?
- Error cases propagated?
- New fields reach the final consumer (UI)?

### Step 3: DB VERIFICATION (if DB changes)

- Check migration exists and is correct
- Verify schema matches entity definition in docs
- Check indexes for query performance
- Verify constraints (NOT NULL, UNIQUE, FK)
- Sample data query if possible (via MCP if available)

### Step 4: COMMON ISSUE CHECKS

- Missing fields after rename/refactor (field renamed in DB but not in service)
- Type mismatches (string in DB, number in TypeScript)
- Incomplete renames (old name still used in some files)
- Missing null checks on optional fields
- Missing error handling for new error codes
- Frontend displays field that backend doesn't send
- API contract says X, code returns Y

### Step 5: RETURN RESULT

Result format (structured):

```
VERIFY_CODE_RESULT:
  result: PASS | PASS_NEEDS_E2E | FAIL
  taskCode: UC028
  module: backend + frontend
  summary: "one-line summary"
  findings:
    - file: src/routes/analytics.ts
      line: 42
      status: OK | ISSUE | SUGGESTION
      detail: "description"
      suggestedFix: "what to change" (only for ISSUE)
  dbChecks:
    - query: "SELECT ..."
      expected: "column exists, type is varchar"
      actual: "confirmed"
      status: OK | FAIL
  recommendation: "PASS_NEEDS_E2E because new data reaches UI components"
```

**Decision logic:**
- **PASS**: All checks pass, no UI-visible changes (backend-only refactor, config change)
- **PASS_NEEDS_E2E**: All checks pass, but changes affect UI — need browser verification
- **FAIL**: Issues found that would cause runtime errors or incorrect behavior

## Output Language

- Result structure: English (consumed by `/nacl-tl-verify` orchestrator)
- Findings detail: English (technical descriptions)
- User-facing summary: user's language

## References

- `nacl-tl-core/references/review-checklist.md` — for additional quality checks
- `nacl-tl-core/references/sa-doc-update-matrix.md` — for understanding doc impact
