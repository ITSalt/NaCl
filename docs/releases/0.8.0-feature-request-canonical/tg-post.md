**NaCl 0.8.0: FeatureRequest as a graph-canonical artifact**

`nacl-sa-feature` now writes the `:FeatureRequest` node to Neo4j alongside the markdown, with `INCLUDES_UC` / `AFFECTS_MODULE` / `AFFECTS_ENTITY` edges. Markdown stays the source of truth for prose; the graph becomes the source of truth for scope. Downstream skills (`nacl-tl-conductor`, `nacl-tl-plan --feature`, `nacl-tl-full --feature`) stop falling back to markdown parsing.

FR-id allocation is now collision-safe: it scans disk + graph + every node label, respects the `FR-LEG-*` / `FR-LEG-INTAKE-*` tombstone reservation, and supports `--namespace=DOM` sub-namespaces.

A new validation level — `L7 FeatureRequest Consistency` — adds six checks: markdown↔graph correspondence, edge integrity, kind drift, dangling refs, duplicate markdown files, cross-label id reuse.

Also fixed: a long-standing terminology bug where `nacl-sa-feature` referenced `Screen` / `NavigationRoute` labels that never existed in the SA schema. Rewritten in terms of the canonical `Form` + `Component(component_type='navigation')` model.

Schema delta (one-off, idempotent) and full upgrade walkthrough: `docs/releases/0.8.0-feature-request-canonical/release-notes.md`
