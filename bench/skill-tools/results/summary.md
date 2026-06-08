# Skill-tools benchmark results

Base ref: `main` · runs per tool: 20 · token estimate = chars / 4

## H1 — determinism (byte-identical output across N runs)

| tool | runs | distinct outputs | deterministic | output chars (tok est) |
|------|-----:|-----------------:|:-------------:|------------------------:|
| ship/branch.sh | 20 | 1 | ✅ | 26 (7) |
| ship/branch.sh | 20 | 1 | ✅ | 51 (13) |
| plan/wave-plan.mjs | 20 | 1 | ✅ | 1309 (327) |
| sa-validate/classify-findings.mjs | 20 | 1 | ✅ | 465 (116) |
| ba-sync/nacl-ids.mjs | 20 | 1 | ✅ | 10 (3) |
| release/wait-for-ci.sh | 20 | 1 | ✅ | 9 (2) |

**H1 verdict: HOLDS** — 6/6 tools byte-identical across 20 runs.

## H2 — carried-procedure size removed from SKILL.md (git diff)

| SKILL.md | removed inline chars (tok est) | added invocation chars (tok est) | net |
|----------|-------------------------------:|---------------------------------:|----:|
| nacl-tl-ship/SKILL.md | 482 (121) | 572 (143) | 90 |
| nacl-tl-plan/SKILL.md | 490 (123) | 1280 (320) | 790 |
| nacl-sa-validate/SKILL.md | 0 (0) | 869 (217) | 869 |
| nacl-tl-release/SKILL.md | 660 (165) | 934 (234) | 274 |
| nacl-ba-sync/SKILL.md | 994 (249) | 1389 (347) | 395 |

Removed inline procedural text totals 2626 chars (~657 tok est). Note: the static
SKILL.md delta is modest by design — the compounding win is at RUNTIME, where each invocation
now emits a fixed small token (H1 column) instead of the agent re-deriving the procedure.

