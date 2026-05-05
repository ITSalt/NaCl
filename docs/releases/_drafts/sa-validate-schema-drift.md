# Draft fragment: nacl-sa-validate schema-drift hardening

**Status:** queued for next release.
**Source commit(s):** see `git log -- nacl-sa-validate/SKILL.md CHANGELOG.md` after this entry.
**Canonical CHANGELOG entry:** `CHANGELOG.md` `[Unreleased]` -> `### Fixed` and `### Documentation` (sa-validate bullets).

When preparing the next release notes, lift the bullets below into `docs/releases/<ver>-<slug>/release-notes.md` under a "Validation hardening" or "Quality gate" heading. Suggested release-slug: `sa-validate-schema-drift`.

---

## What shipped

`/nacl-sa-validate` previously had **four hardcoded schema assumptions** with no schema-introspection guardrail:

1. SA-layer node labels: `Module`, `DomainEntity`, `Requirement`, `SystemRole`, `Component` (~40 inline references in Cypher).
2. BA->SA handoff edge types: `AUTOMATES_AS`, `REALIZED_AS`, `IMPLEMENTED_BY`, `MAPPED_TO`, `TYPED_AS`.
3. `WorkflowStep.stereotype = 'Автоматизируется'` (Russian only) on XL6.1 / XL6.4.
4. `EnumValue.value` as the only recognized value-property name on L1.4.

A graph that diverged from any of these (e.g. `:SAModule` / `:SAEntity` / edge `TRACES_TO` / English `'Automated'` stereotype / `EnumValue.code`) would produce **silent FAIL** with all L2-L7 / XL6-XL9 returning zero rows. A real-world incident burned ~4 hours of orchestrated "fix" work on a graph that was actually fine.

This release closes the failure mode at the source.

## Highlights for release-notes

- **Schema-drift detection in pre-flight (Step 0a, new).** Validator now calls `db.labels()` + `db.relationshipTypes()` and compares against the canonical SA dictionary. If non-canonical aliases (`:SAModule`, `:SAEntity`, `:SARequirement`, `:SAActor`, `:SAComponent`, edge `TRACES_TO`) are found without canonical counterparts, validation **HALTs** with an explicit drift report instead of running queries that would silently match zero rows. This converts silent FAIL into a loud, actionable diagnostic.
- **Two-section pre-flight node-count report (Step 0b).** Canonical labels and any non-canonical labels are listed side-by-side, so schema drift is visible on the first screen of the report rather than hidden in 7 false-positive criticals.
- **XL6.1 / XL6.4 stereotype tolerance.** Now accept both `'Автоматизируется'` (Russian) and `'Automated'` (English). XL6.4 coverage summary additionally counts steps that have an `AUTOMATES_AS` edge, treating the edge as authoritative ground truth.
- **L1.4 enum-property tolerance.** `EnumValue` empty/duplicate check now coalesces `.value`, `.code`, `.label`. New informational L1.5 reports which property convention the graph uses (`canonical (.value)` / `drift (.code only)` / `mixed` / `broken`).
- **Schema Reference section.** New top-of-skill section enumerating canonical writers (`/nacl-sa-architect`, `/nacl-sa-domain`, etc.) and the non-canonical aliases that trigger HALT. Removes guesswork from "what does this validator expect".
- **Migration Cypher Appendix.** Bottom-of-skill idempotent rename blocks for the five label dialects and a six-way split of `TRACES_TO` into the canonical handoff edges (`SUGGESTS`, `REALIZED_AS`, `MAPPED_TO`, `IMPLEMENTED_BY`, `AUTOMATES_AS`, `TYPED_AS`) based on (source, target) label pair. APOC-based, requires `apoc.refactor.rename.label` / `apoc.refactor.setType`.

## Not shipped

- Migration of any specific client graph to canonical labels -- that's a per-project decision; the appendix is a tool, not an action.
- Full schema-introspection (`apoc.meta.nodeTypeProperties()`-driven aliasing). Only the one observed dialect is recognized; if a third dialect appears in the future, revisit.
- `--label-aliases` runtime override flag. HALT + migration is cleaner than per-run remapping.

## Files changed

- `nacl-sa-validate/SKILL.md` (+325 / -13)
- `CHANGELOG.md` (+36)

## TG-post angle suggestion

Frame the user-visible benefit as: **"`/nacl-sa-validate` теперь не врёт о критических ошибках, когда у графа просто слегка другие имена лейблов"**. Concrete example: Karatov-кейс, 7 false-positive CRITICAL до фикса -> явный HALT с drift-отчётом и идемпотентным cypher-блоком для миграции.

## Cleanup

After release notes are merged, **delete this draft file** so `docs/releases/_drafts/` stays empty between releases.
