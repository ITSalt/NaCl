[Home](../README.md) > Contributing

🇷🇺 [Русская версия](contributing.ru.md)

# Contributing

Thank you for your interest in NaCl! This guide explains how to contribute skills, fixes, and improvements.

## Getting Started

1. Fork the repository
2. Clone your fork and set up skills ([Quick Start](quickstart.md))
3. Create a feature branch: `git checkout -b feat/my-skill`
4. Make your changes
5. Test locally with Claude Code
6. Submit a pull request

## Skill File Format

Each skill is a directory containing a `SKILL.md` file:

```
my-skill/
└── SKILL.md
```

### YAML Frontmatter (required)

Every SKILL.md must start with frontmatter:

```yaml
---
name: my-skill
model: sonnet
effort: medium
description: |
  One-paragraph description of what this skill does.
  Use when: trigger phrases that help Claude route to this skill.
---
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Must match the directory name |
| `model` | Yes | Target model: `opus`, `sonnet`, or `haiku` (see [Agent Architecture](agents.md)) |
| `effort` | Yes | Reasoning effort: `high`, `medium`, or `low` |
| `description` | Yes | What the skill does + "Use when:" trigger phrases |

### Skill Body

After frontmatter, the skill body contains:

1. **Role declaration** — `## Your Role` section defining the AI persona
2. **Invocation** — how users call the skill (e.g., `/my-skill "args"`)
3. **Workflow** — numbered phases with clear inputs/outputs
4. **Parameters/Modifiers** — document all invocation variants in a table (see [Modifier Conventions](skill-modifiers.md#conventions) for naming rules)
5. **References** — links to shared resources

## Naming Conventions

All NaCl skills follow the pattern `nacl-{layer}-{action}` with hyphens as separators.

| Prefix | Stands for | Layer | Example |
|--------|-----------|-------|---------|
| `nacl-ba-` | **B**usiness **A**nalysis | Analysis of business processes, entities, roles, rules | `nacl-ba-context` |
| `nacl-sa-` | **S**ystem **A**nalysis | Technical specification: architecture, domain model, UC, UI | `nacl-sa-domain` |
| `nacl-tl-` | **T**eam **L**ead | Development lifecycle: TDD, review, QA, deploy, release | `nacl-tl-dev-be` |
| `nacl-` | *(utility)* | Shared infrastructure: core references, render, publish | `nacl-render` |

## Language Conventions

- **BA/SA skills** (`nacl-ba-*`, `nacl-sa-*`): Authored in English (many SKILL.md files have no Russian at all). Output language with the user is **not** controlled by the skill file's own language — it is resolved via `--lang` flag > `config.yaml` `project.lang` > default `ru`, per [nacl-core/lang-directive.md](../nacl-core/lang-directive.md). BA/SA artifacts default to Russian output unless `--lang=en` (or `project.lang: en`) is set.
- **TL skills** (`nacl-tl-*`): Written in English.
- **CLAUDE.md files**: Always in English.
- **Documentation (docs/)**: English primary, Russian as `*.ru.md`.

## Testing Your Skill

Before submitting a PR:

1. Link your skill: `ln -sf /path/to/my-skill ~/.claude/skills/my-skill`
2. Open Claude Code in a test project
3. Invoke the skill and verify it produces correct output
4. Check that the skill handles edge cases (missing config, empty graph, etc.)

## Pull Request Checklist

- [ ] SKILL.md has YAML frontmatter with `name`, `model`, `effort` fields
- [ ] Directory name matches the `name` in frontmatter
- [ ] `model` is set to the correct tier (`opus`/`sonnet`/`haiku`) per [Agent Architecture](agents.md)
- [ ] Tested locally with Claude Code
- [ ] No hardcoded paths (`~/projects/`, `/Users/`)
- [ ] No credentials or API keys
- [ ] Follows naming conventions
- [ ] Modifiers documented (if any) per [conventions](skill-modifiers.md#conventions)
- [ ] Documentation updated if needed

### Codex Skill Sync

For changes under root `nacl-*/SKILL.md`, update the matching
`skills-for-codex/<skill>/SKILL.md` file or add a documented exemption under
`skills-for-codex/sync-exemptions/<skill>.md`.

Run the guard locally before opening the PR:

```sh
sh skills-for-codex/scripts/check-root-codex-sync.sh origin/main HEAD
```

Codex SKILL.md frontmatter is intentionally different from Claude skills:
`skills-for-codex/*/SKILL.md` uses `name` and `description` only.

### Desktop Plugin Sync

For changes under `nacl-*/**` or `.claude/agents/**`, regenerate the
committed `plugin/` artifact:

```sh
node scripts/build-plugin.mjs
```

CI (`.github/workflows/build-plugin.yml`) runs
`node scripts/build-plugin.mjs --check` on every PR touching those paths and
fails if `plugin/` is stale.

## Code Style (CLI Tools)

For changes to `docmost-sync/` or `yougile-setup/`:

- TypeScript with ESM modules
- Build must pass: `npm ci && npm run build`
- No new runtime dependencies without justification

## Reporting Issues

Use [GitHub Issues](https://github.com/ITSalt/NaCl/issues) with the appropriate template:

- **Bug Report** — something isn't working
- **Feature Request** — suggest an improvement
- **New Skill Proposal** — propose a new skill

## Translating Skills

BA/SA skills (`nacl-ba-*`, `nacl-sa-*`) default to Russian **output** (most
SKILL.md files themselves are authored in English). The `--lang` flag lets
users request output in a different language without modifying the skill
itself.

### The `--lang` flag pattern

Invocation example:

```
/nacl-ba-context --lang=en
```

When a skill receives `--lang=en`, it produces all user-facing output (analysis,
artifact text, progress messages) in English while keeping internal IDs and
structure unchanged.

### Adding language support to a skill that does not have it yet

1. **Invocation table** — add a `--lang` row to the Parameters/Modifiers table
   in `SKILL.md`:

   | Modifier | Values | Default | Effect |
   |----------|--------|---------|--------|
   | `--lang` | `ru`, `en` | `ru` | Output language |

2. **Language section** — add a `## Language` section to the skill body that
   documents which strings are localised (artifact names, section headers,
   status messages) and which remain language-neutral (IDs, Cypher, filenames).

3. **Test it** — invoke the skill with `--lang=en` on a sample project and
   verify that all user-facing output is in English and no Russian strings leak
   into the result.

### Notes

- **TL skills** (`nacl-tl-*`) are already written in English and do not need
  `--lang` support.
- The `--lang` flag follows the standard flag conventions described in
  [Skill Modifiers](skill-modifiers.md).

## Questions?

Open a [Discussion](https://github.com/ITSalt/NaCl/discussions) or create an issue with the `question` label.
