# Skills structure convention

NaCl-skills follow the [Agent Skills standard](https://code.claude.com/docs/en/skills) with an explicit layout convention for `references/` and `assets/`. This doc is the source of truth for that layout.

Baseline snapshot before the first refactor: `skills-structure-baseline.txt`.

## Target SKILL.md size

**Hard target: < 500 lines** (Anthropic's recommendation).
**Soft target: < 300 lines** for non-orchestrator skills.

Skills over the hard target must either be split into subskills or have their private scenarios and large references moved to `references/` / `assets/`.

## Directory layout

```
nacl-<name>/
├── SKILL.md              # required; main flow only
├── references/           # optional; private-scenario details, loaded on demand
│   ├── <topic>.md
│   └── ...
└── assets/               # optional; reusable templates/scaffolding for output
    ├── <artifact>.<ext>
    └── ...
```

## When to move content out of SKILL.md

Apply the **reference test** from [anatomy-of-claude-skills post]:

> If a block works standalone → make it a separate skill.
> If it's meaningless without the parent `SKILL.md` but loads into context on every call while only relevant sometimes → it belongs in `references/`.

### Move to `references/` — examples

- Branch-specific flows ("when user passes `--foo` flag…", "if input matches schema X…")
- Long lookup tables (stereotypes, error codes, type mappings, Cypher templates)
- Reproducible algorithms (layout math, scoring formulas) that only run for certain inputs
- Troubleshooting / diagnostic procedures needed only when something breaks
- Full worked examples (especially multi-page ones)

### Move to `assets/` — examples

- JSON template skeletons (Excalidraw element shapes, API payload stubs)
- Markdown document scaffolds (Docmost pages, ADR, report templates)
- Task-file templates reused per UC
- Any artifact the skill outputs where the structure is constant and only values vary

### Do NOT move

- The main algorithm / step sequence
- The skill's invocation contract (what args, what it produces)
- Short (< 5 line) conventions and constants
- Anything the skill unconditionally needs for every invocation

## Naming

- `references/`: `<snake_case_topic>.md` — topic-driven, not structural. Good: `layout-algorithm.md`, `cypher-templates.md`, `error-handling.md`. Bad: `part-2.md`, `section-references.md`.
- `assets/`: `<snake_case_artifact>.<ext>` — matches the artifact it templates. Good: `swimlane.json`, `docmost-page.md`, `task-be.md`. Use the actual file extension the skill will emit.
- Subdirectories allowed when count exceeds ~8: `references/cypher/l1-data-consistency.md`.

## SKILL.md link patterns

### Reference link — imperative, not conditional

**Good:**
> Before computing swimlane positions, read `references/layout-algorithm.md`.

**Bad:**
> See `references/layout-algorithm.md` if needed.

The model follows imperatives reliably; "if needed" gets skipped. When a reference is optional, make the condition explicit:
> If the input contains a decision diamond, read `references/decision-layout.md` first.

### Asset link — with variable list inline

```markdown
Generate each swimlane using `assets/swimlane.json` as template.
Substitute the following variables:

- `{SWIMLANE_ID}` — unique id (`sw_<index>`)
- `{SWIMLANE_TITLE}` — role name from BA layer
- `{Y_POSITION}` — computed per `references/layout-algorithm.md`
- `{HEIGHT}` — `SWIMLANE_HEIGHT` constant (200)
```

The variable list is the contract between `assets/` and `SKILL.md`. If the template adds/removes a variable, both places must be updated in the same commit.

## Variable naming in assets

All variables in `assets/*.{json,md,…}` use `{UPPER_SNAKE_CASE}` so they are grep-able:

```bash
grep -oh '{[A-Z_]*}' assets/swimlane.json | sort -u
```

The same list must appear in SKILL.md next to the asset reference. A `bench/lint-asset-vars.sh` check can sanity-verify this.

## Control group (not touched in the current refactor)

Until the refactor is proven on other skills, these three are left as-is to serve as a baseline:

- `nacl-core` — shared library, referenced by 40+ other skills.
- `nacl-tl-dev-be`
- `nacl-tl-dev-fe`

Revisit after waves 1–3 have landed and benchmarks confirm the gain.

## See also

- [Anthropic skills docs](https://code.claude.com/docs/en/skills) — canonical reference.
