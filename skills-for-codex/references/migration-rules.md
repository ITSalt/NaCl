# Migration Rules

## Principle

Preserve NaCl methodology, not Claude execution mechanics.

## Language Policy

Codex migration documentation must be written in English. This includes:

- `skills-for-codex/README.md`
- `skills-for-codex/MIGRATION.md`
- `skills-for-codex/references/*.md`
- pilot `SKILL.md` files

This does not change NaCl artifact language rules:

- BA/SA produced artifacts remain Russian where the NaCl methodology requires
  Russian.
- TL artifacts remain English where the NaCl methodology requires English.

## SKILL.md Frontmatter

Use only:

```yaml
---
name: nacl-example
description: |
  ...
---
```

Do not include `model`, `effort`, model names, or model-tier routing. Model
selection belongs to the Codex runtime or user configuration.

## Trigger Descriptions

Descriptions must use natural-language trigger conditions with "Use when...".
Retain slash-command phrases only as compatibility triggers, for example:

```text
Use when defining system scope in the NaCl graph. Also use when the user says
`/nacl-ba-context`.
```

Do not imply that Codex requires slash-command invocation.

## Claude-Specific Terms

Claude-specific terms are forbidden as active execution instructions in Codex
`SKILL.md` files. They may appear in migration documents only when describing
source material, removed mechanics, or prohibited patterns.

## Standard Capabilities Section

Every pilot skill must include:

```markdown
## Capabilities

### May Do

### Must Not Do

### Conditional Tools And Actions

### Blocked Or Unverified Reporting
```

Graph access, file edits, tests, and subagent/tool use are allowed only when
actually available in the Codex environment. Otherwise report honestly using the
closed vocabulary from `verification-vocabulary.md`.

## Confirmation Gate Pattern

Confirmation gates must be written as explicit user-facing stop points, not
implied conversational behavior.

Before writing graph data, modifying project files, running destructive actions,
or moving to the next major workflow phase, ask the user for explicit
confirmation. If confirmation is not given, stop and report the next required
confirmation step.

For phased workflows, use wording like:

```text
Stop after Phase N and ask the user whether to proceed to Phase N+1.
```

## Source Comparison

Each pilot skill must include a concise `Source Comparison` section:

```markdown
## Source Comparison

- Source Claude skill path: `../<matching-nacl-skill>/SKILL.md`

### Preserved Methodology

- ...

### Removed Claude Mechanics

- ...

### Codex Replacement Behavior

- ...
```

Each pilot skill must use its real matching source path, not the template
placeholder. Use 3-5 bullets maximum under each subsection.

