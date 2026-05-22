# Fixture: Reachable Actor-Triggered UC — UC-FX10 (Catalog Upload)

Wave: W7-ui-reachability
Owner: nacl-sa-ui (consumer: nacl-sa-validate, nacl-tl-review)
Purpose: replay artifact to assert that an actor-triggered UC whose
Form has populated `HAS_INBOUND_ACTION` edges from reachable
Components passes the W7 reachability rule.

Expected outcome on replay:

- `ui_reachability_blockers` query returns ZERO rows for UC-FX10.
- `nacl-tl-review` Nav-actions consumer check returns
  `nav-actions-GREEN:UC-FX10`.
- `nacl-sa-validate` UI-reachability L-rule reports PASS for UC-FX10.

## UC-FX10 shape

```yaml
use_case:
  id: UC-FX10
  name: Upload audio from catalog
  actor: User
  has_ui: true
  entrypoint_type: standard
  detail_status: detailed
forms:
  - id: FORM-CatalogUpload
    name: Upload audio
    used_in:
      - CMP-UploadPage
nav_components:
  - id: CMP-NavRoot
    component_type: navigation
    parent_menu: null
    route: /
    menu_order: 0
  - id: CMP-NavSidebar
    component_type: navigation
    parent_menu: CMP-NavRoot
    route: null
    menu_order: 1
  - id: CMP-CatalogPage
    component_type: navigation
    parent_menu: CMP-NavSidebar
    route: /catalog
    menu_order: 2
  - id: CMP-UploadPage
    component_type: navigation
    parent_menu: CMP-NavSidebar
    route: /upload
    menu_order: 3
inbound_actions:
  - source: CMP-CatalogPage
    target: FORM-CatalogUpload
    affordance: primary CTA
    label: "New upload"
  - source: CMP-NavSidebar
    target: FORM-CatalogUpload
    affordance: menu item
    label: "Upload"
qa_evidence:
  natural_entrypoint_path:
    - step: navigate
      route: /catalog
    - step: click
      locator: 'button:has-text("New upload")'
    - step: assert
      route: /upload
```

## Form Spec excerpt — FORM-CatalogUpload

```
Nav Actions (HAS_INBOUND_ACTION):
  - CMP-CatalogPage   primary CTA       "New upload"
  - CMP-NavSidebar    menu item         "Upload"
```

Both sources are reachable from the root navigation
(`CMP-NavRoot → CMP-NavSidebar → CMP-CatalogPage` and
`CMP-NavRoot → CMP-NavSidebar` respectively). The Form has two
inbound action edges from reachable Components, so
`ui_reachability_blockers` returns no row for UC-FX10.

The QA evidence demonstrates a natural-entrypoint path
(`/catalog` → click "New upload" → `/upload`) using a locator that
matches a captured `HAS_INBOUND_ACTION.label`.

## Replay expectations

When the W7 acceptance suite (W11 pilot) loads this fixture and runs:

1. `ui_reachability_blockers` (from
   `nacl-sa-ui/references/reachability.cypher`) — returns ZERO rows
   for UC-FX10.
2. `nav_actions_consumer_check` from
   `nacl-tl-review/SKILL.md` with `$affected_uc_ids = ['UC-FX10']`
   returns ZERO rows; the review emits
   `nav-actions-GREEN:UC-FX10` and proceeds to the repo-wide gate.
3. QA-evidence inspection finds the natural-entrypoint path; the
   review records both conditions satisfied.

This file is documentation-only; the graph nodes are created at
fixture-replay time by downstream consumers (W11 pilot).
