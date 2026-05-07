---
name: nacl-tl-diagnose
description: |
  Diagnose NaCl project health by analyzing git history, documentation drift,
  code health, regression patterns, and TL status evidence. Use when the project
  seems unhealthy, drift is suspected, or when the user says
  `/nacl-tl-diagnose`.
---

# NaCl TL Diagnose For Codex

Diagnose and recommend next actions. Do not implement fixes in this skill.

## Workflow

1. Resolve diagnosis window, project scope, and focus area.
2. Collect git history, documentation state, TL state, code health signals, and
   regression patterns using available tools.
3. Parallelize independent reads when possible.
4. Score findings by severity and confidence.
5. Write `DIAGNOSTIC-REPORT.md` only when file editing is available and the user
   confirms.
6. Recommend which NaCl skill or manual action should run next.

## Capabilities

### May Do

- Inspect git history, docs, `.tl/` files, and code health indicators.
- Identify stale docs, hot files, repeated fixes, and missing verification
  evidence.
- Produce a structured diagnostic report.
- Recommend follow-up skills or manual investigation.

### Must Not Do

- Modify code or docs as part of diagnosis.
- Claim independent validation when only local evidence was gathered.
- Launch unsupported subagents.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Git analysis requires repository access.
- Code and docs analysis require file access.
- Test or linter checks require available project commands and user approval
  when they are costly.
- Report file writes require writable workspace access and confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when required repository, file, or tool access is unavailable.
- Use `FAILED` when a requested diagnostic check runs and finds failing
  evidence.
- Use `PARTIALLY_VERIFIED` when only some diagnostic dimensions can be checked.
- Use `NOT_RUN` for checks outside the requested scope.
- Use `UNVERIFIED` when evidence is insufficient for a conclusion.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-diagnose/SKILL.md`

### Preserved Methodology

- Data-driven project health diagnosis.
- Git, docs, code, and regression signal analysis.
- Diagnostic report with actionable recommendations.
- No fixes during diagnosis.

### Removed Claude Mechanics

- Assumed runtime-specific parallel agent launch.
- Source status labels outside the closed vocabulary.
- Runtime-specific tool names as guaranteed capabilities.
- Model routing fields.

### Codex Replacement Behavior

- Use available parallel tool calls and local evidence.
- Report unsupported dimensions honestly.
- Keep diagnosis separate from remediation.
- Use the closed verification vocabulary.
