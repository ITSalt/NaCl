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
description: |
  One-paragraph description of what this skill does.
  Use when: trigger phrases that help Claude route to this skill.
---
```

The `name` field must match the directory name.

### Skill Body

After frontmatter, the skill body contains:

1. **Role declaration** — `## Your Role` section defining the AI persona
2. **Invocation** — how users call the skill (e.g., `/my-skill "args"`)
3. **Workflow** — numbered phases with clear inputs/outputs
4. **References** — links to shared resources

## Naming Conventions

All NaCl skills follow the pattern `nacl-{layer}-{action}` with hyphens as separators.

| Prefix | Stands for | Layer | Example |
|--------|-----------|-------|---------|
| `nacl-ba-` | **B**usiness **A**nalysis | Analysis of business processes, entities, roles, rules | `nacl-ba-context` |
| `nacl-sa-` | **S**ystem **A**nalysis | Technical specification: architecture, domain model, UC, UI | `nacl-sa-domain` |
| `nacl-tl-` | **T**eam **L**ead | Development lifecycle: TDD, review, QA, deploy, release | `nacl-tl-dev-be` |
| `nacl-` | *(utility)* | Shared infrastructure: core references, render, publish | `nacl-render` |

## Language Conventions

- **BA/SA skills** (`nacl-ba-*`, `nacl-sa-*`): Written in Russian. The skill language controls Claude's output language with the user. BA/SA artifacts are typically in Russian.
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

- [ ] SKILL.md has YAML frontmatter with `name` field
- [ ] Directory name matches the `name` in frontmatter
- [ ] Tested locally with Claude Code
- [ ] No hardcoded paths (`~/projects/`, `/Users/`)
- [ ] No credentials or API keys
- [ ] Follows naming conventions
- [ ] Documentation updated if needed

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

## Questions?

Open a [Discussion](https://github.com/ITSalt/NaCl/discussions) or create an issue with the `question` label.
