# Codex Migration Plan

## Decisions

- Use `skills-for-codex/` as the namespace.
- Keep original skill names such as `nacl-core` and `nacl-tl-dev-be`.
- Convert only the five-skill pilot first.
- Use `SKILL.md` only during the pilot.
- Do not add `agents/openai.yaml` unless a concrete Codex UI or routing metadata
  need is proven later.
- Do not modify root-level `nacl-*` source skill folders.
- Do not replace Claude model routing with Codex model routing. Model selection
  belongs to the Codex runtime or user configuration.

## Mandatory Implementation Order

1. Create `README.md` and `MIGRATION.md` skeletons.
2. Create `references/verification-vocabulary.md`.
3. Create `references/orchestration-model.md`.
4. Create `references/migration-rules.md`.
5. Create `nacl-core/SKILL.md`.
6. Create `nacl-ba-context/SKILL.md`, `nacl-sa-domain/SKILL.md`, and
   `nacl-tl-dev-be/SKILL.md`.
7. Create `nacl-tl-conductor/SKILL.md` last.
8. Finalize `README.md` and `MIGRATION.md` based on the completed pilot
   structure and reference rules.

`nacl-tl-conductor` depends on the approved pilot orchestration model and must
not be written before that model exists.

## Pilot Definition Of Done

- The pilot folder contains only the approved pilot structure.
- Each pilot `SKILL.md` has frontmatter with only `name` and `description`.
- Each pilot skill includes a standard `Capabilities` section.
- Each pilot skill includes a concise `Source Comparison` section.
- Pilot skills use only statuses from `references/verification-vocabulary.md`.
- `references/orchestration-model.md` defines Codex-native orchestration and
  rejects naive Task-agent replacement.
- No root-level `nacl-*` source skill folder is modified.
- Pre/post `git status --short` checks confirm only intended
  `skills-for-codex/` files were added or modified.

## Pilot Status

- Five-skill pilot created.
- Static validation VERIFIED.
- User-level symlink discovery VERIFIED.
- Read-only invocation smoke test VERIFIED.
- Next migration stage is Wave 2 conversion after install docs are committed.

## Rollout After Pilot

After review, migrate remaining skills in waves: core/utilities, BA, SA, TL
individual skills, orchestrators, then documentation and validation automation.
