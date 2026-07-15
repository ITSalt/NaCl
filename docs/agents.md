[Home](../README.md) > Agent Architecture

# Agent Architecture

NaCl assigns every skill a cognitive profile: which Claude model runs it, how deeply it reasons, and what tools it can access. Seven agent definitions in `.claude/agents/` encode these profiles. Orchestrator skills delegate work to the right agent automatically.

## Why Model Selection Matters

Claude models differ in reasoning depth and cost:

| Model | Strength | Cost (per MTok out) | Use for |
|-------|----------|---------------------|---------|
| **Opus** | Deep reasoning, cross-system analysis | $25 | Architecture, validation, review, planning |
| **Sonnet** | Balanced speed and quality | $15 | Code generation, structured content, testing |
| **Haiku** | Fast, low-latency | $5 | Status queries, quick lookups, sync |

Running all 59 skills on Opus wastes budget on tasks that Sonnet handles equally well. Running everything on Haiku loses quality where reasoning matters. The agent architecture routes each skill to the right model.

## Skill Frontmatter

Every SKILL.md declares its model and effort level:

```yaml
---
name: nacl-tl-review
model: opus
effort: high
description: |
  Code review for completed tasks...
---
```

| Field | Values | Effect |
|-------|--------|--------|
| `model` | `opus`, `sonnet`, `haiku` | Which Claude model executes the skill |
| `effort` | `high`, `medium`, `low` | Reasoning depth (adaptive thinking budget) |

## The Seven Agents

Agents live in `.claude/agents/` and are symlinked to `~/.claude/agents/` during installation (same pattern as skills). Each agent defines a model, effort level, tool restrictions, and a system prompt describing its cognitive profile.

Six agents are routed whole skills via the orchestrators. The seventh -- `diagnostician` -- is not routed a top-level skill; it is invoked as a sub-agent to run **Phase A of `nacl-tl-fix`** (the diagnose-and-spec half), the way `nacl-tl-regression-test` is invoked as a sub-agent to write a test.

### strategist -- Opus, high effort (12 skills)

The thinking brain. Reads, analyzes, judges -- never writes code.

**Tools:** Read, Grep, Glob, Bash (no Write or Edit)

**Skills:**
- SA architecture: `nacl-sa-architect`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-sa-uc`
- BA validation: `nacl-ba-validate`
- TL planning: `nacl-tl-plan`, `nacl-tl-intake`, `nacl-tl-diagnose`, `nacl-tl-reconcile`
- TL quality: `nacl-tl-review`, `nacl-tl-hotfix`

**Why Opus:** These skills make decisions that cascade downstream. Wrong architecture wastes all development. Missed review findings become production bugs. Misclassified triage wastes entire cycles.

### diagnostician -- Opus, high effort (Phase A of `nacl-tl-fix`)

The bug-fix reasoner. Diagnoses a bug and authors the specification that fixes it, then hands a structured fix-plan to the sonnet execution core.

**Tools:** Read, Write, Edit, Grep, Glob, Bash

**Runs:** `nacl-tl-fix` Steps 1–5 — TRIAGE (graph impact traversal), CONTEXT LOAD, GAP-CHECK + L0/L1/L2/L3 classification, DEFINE CORRECT BEHAVIOR, FIX DOCS. Returns the fix-plan artifact; never writes production code; never commits.

**Why Opus:** The bug-fix pipeline's diagnostic half is exactly the work that justifies Opus elsewhere — graph impact analysis and the L3-feature classification, the single most important guardrail in `nacl-tl-fix` (a misclassified feature shipped through the fix path becomes an UNVERIFIED feature factory). Before this split, that judgment ran on Sonnet because `nacl-tl-fix` ended in code generation and was routed wholesale to the developer agent.

**Why it has Write (unlike the strategist):** it authors *specifications* — docs, `.tl/*` artifacts, graph nodes — not production code, and it does not commit. The firewall the framework depends on is "the spec author ≠ the code author"; that holds, because the sonnet core (Phase B) writes and commits the code. See Design Principle 1 below.

### analyst -- Sonnet, medium effort (11 skills)

The domain modeler. Creates structured BA/SA artifacts from domain knowledge.

**Tools:** Read, Grep, Glob, Write

**Skills:**
- BA phase skills: `nacl-ba-context`, `nacl-ba-process`, `nacl-ba-workflow`, `nacl-ba-entities`, `nacl-ba-roles`, `nacl-ba-glossary`, `nacl-ba-rules`, `nacl-ba-handoff`
- SA content: `nacl-sa-roles`, `nacl-sa-ui`, `nacl-sa-finalize`

**Why Sonnet:** These skills fill structured templates with domain knowledge provided by the user. The reasoning challenge is formalization, not invention.

### developer -- Sonnet, medium effort (7 skills)

The code generator. Implements features via TDD from specifications.

**Tools:** Read, Write, Edit, Grep, Glob, Bash

**Skills:** `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`, `nacl-tl-fix`, `nacl-tl-regression-test`, `nacl-tl-docs`, `nacl-tl-reopened`

**Why Sonnet:** Code generation from complete specifications is a translation task. Sonnet matches Opus quality here within 2-3% while running faster and cheaper.

**Note on `nacl-tl-fix`:** it is routed here because it ends in code generation and is the shared honest-execution core that `nacl-tl-dev-be/fe --continue`, `nacl-tl-reopened`, and `nacl-tl-hotfix` delegate into. But its *diagnose-and-spec half* (Steps 1–5) is delegated up to the `diagnostician` (Opus) sub-agent — so the seam premise holds: Sonnet's Phase B (Steps 6–8) receives a complete spec and only generates code. This mirrors how `nacl-tl-regression-test` is delegated as a sub-agent for the test.

### verifier -- Sonnet, medium effort (5 skills)

The quality gate. Tests, verifies, and reports without modifying code.

**Tools:** Read, Grep, Glob, Bash

**Skills:** `nacl-tl-verify`, `nacl-tl-verify-code`, `nacl-tl-qa`, `nacl-tl-sync`, `nacl-tl-stubs`

**Why Sonnet:** Verification is systematic: trace data flows, match API contracts, run E2E scripts. Pattern matching, not creative reasoning.

### operator -- Sonnet, low effort (7 skills)

The shipping arm. Git operations, CI/CD monitoring, publishing.

**Tools:** Read, Grep, Bash

**Skills:** `nacl-tl-ship`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-release`, `nacl-render`, `nacl-publish`, `nacl-ba-from-board`

**Why Sonnet + low effort:** These skills follow rigid scripts defined in `config.yaml`. No judgment calls -- just execute and report.

### scout -- Haiku, low effort (6 skills)

The fast lookup arm. Status queries and lightweight operations.

**Tools:** Read, Grep, Glob

**Skills:** `nacl-tl-status`, `nacl-tl-next`, `nacl-ba-analyze`, `nacl-ba-sync`, `nacl-ba-import-doc`, `nacl-init`

**Why Haiku:** These skills run simple Neo4j queries or parse structured data. Speed matters more than depth.

## Orchestrators

The four orchestrators (`nacl-ba-full`, `nacl-sa-full`, `nacl-tl-conductor`, `nacl-tl-full`) run in the **main session context** with `model: opus` and `effort: high`. They are the brain that delegates -- they never get `context: fork`.

Orchestrators delegate work to agents via the Agent tool:

```
L0: Orchestrator (main session, Opus)
  |
  +-- Agent(strategist) -> /nacl-tl-review UC028
  +-- Agent(developer)  -> /nacl-tl-dev-be UC028
  +-- Agent(verifier)   -> /nacl-tl-verify UC028
  +-- Agent(operator)   -> /nacl-tl-ship
```

Skills are **not** preloaded into agents. The orchestrator passes the specific skill name in the prompt when delegating. This prevents context bloat from loading 200-400 lines per skill upfront.

## Model Distribution Summary

```
                opus (18)             sonnet (34)           haiku (6)
              ┌─────────────┐    ┌──────────────────┐    ┌──────────┐
  effort:high │ strategist  │    │                  │    │          │
              │ (12 skills) │    │                  │    │          │
              │ orchestrator│    │                  │    │          │
              │ (4 skills)  │    │                  │    │          │
              ├─────────────┤    ├──────────────────┤    │          │
effort:medium │             │    │ analyst (11)     │    │          │
              │             │    │ developer (7)    │    │          │
              │             │    │ verifier (5)     │    │          │
              ├─────────────┤    ├──────────────────┤    ├──────────┤
  effort:low  │             │    │ operator (7)     │    │ scout(6) │
              └─────────────┘    └──────────────────┘    └──────────┘
```

The seventh agent, **`diagnostician`** (Opus, high effort), is not in the skill counts above: it runs no top-level skill. It is invoked as a sub-agent for **Phase A of `nacl-tl-fix`** (Steps 1–5), so its reasoning sits in the Opus/high-effort tier while the skill itself stays counted under `developer` (Sonnet) for its Phase B. This is the same pattern as `nacl-tl-regression-test` being delegated as a sub-agent.

## Installation

Two channels ship agents, same as skills:

- **Claude Code Desktop (plugin):** `/plugin marketplace add ITSalt/NaCl` then `/plugin install nacl@nacl` installs `plugin/agents/` (all 7 agent files) alongside the plugin's skills -- no manual symlinking.
- **Claude Code CLI:** run `scripts/install-claude-code-skills.sh`, which symlinks both `.claude/agents/*.md` -> `~/.claude/agents/<name>` and the skills in one pass. The manual loops below do the same thing by hand, for environments where running the script isn't an option.

```bash
# Unix/macOS/Linux
mkdir -p ~/.claude/agents
for file in ~/NaCl/.claude/agents/*.md; do
  [ -f "$file" ] && ln -sf "$file" ~/.claude/agents/"$(basename "$file")"
done
```

```powershell
# Windows (PowerShell, Administrator)
$agentsDir = "$env:USERPROFILE\.claude\agents"
New-Item -ItemType Directory -Force -Path $agentsDir | Out-Null
Get-ChildItem -Path "$HOME\NaCl\.claude\agents" -Filter "*.md" | ForEach-Object {
    $target = Join-Path $agentsDir $_.Name
    if (Test-Path $target) { Remove-Item $target -Force }
    New-Item -ItemType SymbolicLink -Path $target -Target $_.FullName | Out-Null
}
```

See platform-specific guides: [macOS](setup/install-macos.md) | [Linux](setup/install-linux.md) | [Windows](setup/install-windows.md)

## Design Principles

1. **Thinkers don't write _code_.** The strategist has no Write or Edit tools — it reads, analyzes, and returns verdicts, so a reviewer can't silently "fix" code during review. The refinement the `diagnostician` adds: an Opus agent _may_ write **specifications** (docs, `.tl/*` artifacts, graph nodes) and still respect this principle, as long as it writes no production code and does not commit. The firewall that matters is **spec author ≠ code author** — the diagnostician authors the spec, the Sonnet core writes and commits the code. (The `analyst` agent is the same shape at Sonnet tier: it writes BA/SA specs, never code.)

2. **Skills load on demand.** Agents don't preload skills via the `skills:` frontmatter field. 12 skills at 200-400 lines each would consume 2400-4800 lines of context before any work begins.

3. **Orchestrators never fork.** Orchestrators run in the main session so they can interact with the user at decision gates. They delegate via the Agent tool, not `context: fork`.

4. **Assignments will go stale.** As models improve, Sonnet may handle tasks currently assigned to Opus. Review assignments when new model versions release. The Anthropic Managed Agents article warns: "harnesses encode assumptions about what Claude can't do on its own. Those assumptions need to be frequently questioned."
