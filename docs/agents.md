[Home](../README.md) > Agent Architecture

# Agent Architecture

NaCl assigns every skill a cognitive profile: which Claude model runs it, how deeply it reasons, and what tools it can access. Six agent definitions in `.claude/agents/` encode these profiles. Orchestrator skills delegate work to the right agent automatically.

## Why Model Selection Matters

Claude models differ in reasoning depth and cost:

| Model | Strength | Cost (per MTok out) | Use for |
|-------|----------|---------------------|---------|
| **Opus** | Deep reasoning, cross-system analysis | $25 | Architecture, validation, review, planning |
| **Sonnet** | Balanced speed and quality | $15 | Code generation, structured content, testing |
| **Haiku** | Fast, low-latency | $5 | Status queries, quick lookups, sync |

Running all 51 skills on Opus wastes budget on tasks that Sonnet handles equally well. Running everything on Haiku loses quality where reasoning matters. The agent architecture routes each skill to the right model.

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

## The Six Agents

Agents live in `.claude/agents/` and are symlinked to `~/.claude/agents/` during installation (same pattern as skills). Each agent defines a model, effort level, tool restrictions, and a system prompt describing its cognitive profile.

### strategist -- Opus, high effort (12 skills)

The thinking brain. Reads, analyzes, judges -- never writes code.

**Tools:** Read, Grep, Glob, Bash (no Write or Edit)

**Skills:**
- SA architecture: `nacl-sa-architect`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-sa-uc`
- BA validation: `nacl-ba-validate`
- TL planning: `nacl-tl-plan`, `nacl-tl-intake`, `nacl-tl-diagnose`, `nacl-tl-reconcile`
- TL quality: `nacl-tl-review`, `nacl-tl-hotfix`

**Why Opus:** These skills make decisions that cascade downstream. Wrong architecture wastes all development. Missed review findings become production bugs. Misclassified triage wastes entire cycles.

### analyst -- Sonnet, medium effort (11 skills)

The domain modeler. Creates structured BA/SA artifacts from domain knowledge.

**Tools:** Read, Grep, Glob, Write

**Skills:**
- BA phase skills: `nacl-ba-context`, `nacl-ba-process`, `nacl-ba-workflow`, `nacl-ba-entities`, `nacl-ba-roles`, `nacl-ba-glossary`, `nacl-ba-rules`, `nacl-ba-handoff`
- SA content: `nacl-sa-roles`, `nacl-sa-ui`, `nacl-sa-finalize`

**Why Sonnet:** These skills fill structured templates with domain knowledge provided by the user. The reasoning challenge is formalization, not invention.

### developer -- Sonnet, medium effort (6 skills)

The code generator. Implements features via TDD from specifications.

**Tools:** Read, Write, Edit, Grep, Glob, Bash

**Skills:** `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`, `nacl-tl-fix`, `nacl-tl-docs`, `nacl-tl-reopened`

**Why Sonnet:** Code generation from complete specifications is a translation task. Sonnet matches Opus quality here within 2-3% while running faster and cheaper.

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
                opus (16)             sonnet (29)           haiku (6)
              ┌─────────────┐    ┌──────────────────┐    ┌──────────┐
  effort:high │ strategist  │    │                  │    │          │
              │ (12 skills) │    │                  │    │          │
              │ orchestrator│    │                  │    │          │
              │ (4 skills)  │    │                  │    │          │
              ├─────────────┤    ├──────────────────┤    │          │
effort:medium │             │    │ analyst (11)     │    │          │
              │             │    │ developer (6)    │    │          │
              │             │    │ verifier (5)     │    │          │
              ├─────────────┤    ├──────────────────┤    ├──────────┤
  effort:low  │             │    │ operator (7)     │    │ scout(6) │
              └─────────────┘    └──────────────────┘    └──────────┘
```

## Installation

Agents are installed alongside skills using symlinks:

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

1. **Thinkers don't write.** The strategist has no Write or Edit tools. It reads, analyzes, and returns verdicts. Separation between judgment and implementation prevents a reviewer from silently "fixing" code during review.

2. **Skills load on demand.** Agents don't preload skills via the `skills:` frontmatter field. 12 skills at 200-400 lines each would consume 2400-4800 lines of context before any work begins.

3. **Orchestrators never fork.** Orchestrators run in the main session so they can interact with the user at decision gates. They delegate via the Agent tool, not `context: fork`.

4. **Assignments will go stale.** As models improve, Sonnet may handle tasks currently assigned to Opus. Review assignments when new model versions release. The Anthropic Managed Agents article warns: "harnesses encode assumptions about what Claude can't do on its own. Those assumptions need to be frequently questioned."
