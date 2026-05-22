# Fixture: Unreachable Actor-Triggered UC — UC-FX11 (Orphan URL-only Upload)

Wave: W7-ui-reachability
Owner: nacl-sa-ui (consumer: nacl-sa-validate, nacl-tl-review)
Purpose: replay artifact to assert that an actor-triggered UC whose
Form has NO inbound `HAS_INBOUND_ACTION` edges is caught by the W7
reachability rule as a blocker.

This fixture replays the **project-beta missing-upload-button**
episode: a fully specified Form with fields, MAPS_TO mappings, and a
mounted route, but no Component in the navigation tree exposes a
user affordance to open it. Users can only reach the screen by
pasting the URL.

Expected outcome on replay:

- `ui_reachability_blockers` query returns ONE row for UC-FX11 with
  `reason: 'no-inbound-action'`.
- `nacl-tl-review` Nav-actions consumer check refuses with
  `REVIEW APPLIED — BLOCKED (nav-actions-missing)`; verdict
  `CHANGES REQUESTED`.
- `nacl-sa-validate` UI-reachability L-rule reports BLOCKED for
  UC-FX11.

## UC-FX11 shape

```yaml
use_case:
  id: UC-FX11
  name: Upload audio (orphan URL-only)
  actor: User
  has_ui: true
  entrypoint_type: standard          # NOT 'deep-link-only', so the
                                     # rule applies — no exemption
  detail_status: detailed
forms:
  - id: FORM-OrphanUpload
    name: Upload audio (orphan)
    used_in:
      - CMP-OrphanUploadPage
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
  - id: CMP-OrphanUploadPage
    component_type: navigation
    parent_menu: CMP-NavSidebar    # mounted, but no inbound nav-action
    route: /upload
    menu_order: 3
inbound_actions: []                  # <-- the bug: nothing here
qa_evidence:
  url_only_navigation:
    - step: navigate
      route: /upload                 # direct URL paste; no affordance click
    - step: assert
      route: /upload
```

## Form Spec excerpt — FORM-OrphanUpload (the broken state)

```
Nav Actions (HAS_INBOUND_ACTION):
  (none — Form is unreachable from any user affordance)
```

The route `/upload` is mounted and the page renders correctly when
the user types the URL, but no Component carries a
`HAS_INBOUND_ACTION` edge to `FORM-OrphanUpload`. This is the
**project-beta missing-upload-button** pattern: every other piece of
the spec is satisfied (fields, validation, MAPS_TO, routing,
auth-aware redirect, role access), but the page is invisible to
anyone who has not been told the URL.

## Replay expectations

When the W7 acceptance suite (W11 pilot) loads this fixture and runs:

1. `ui_reachability_blockers` (from
   `nacl-sa-ui/references/reachability.cypher` § 4) — returns ONE
   row:
   ```
   uc_id="UC-FX11", form_id="FORM-OrphanUpload",
   actor_name="User", reason="no-inbound-action"
   ```
2. `nav_actions_consumer_check` from
   `nacl-tl-review/SKILL.md` with `$affected_uc_ids = ['UC-FX11']`
   returns the same row.
3. Review halts. Headline: `REVIEW APPLIED — BLOCKED
   (nav-actions-missing)`. Code judgment: `CHANGES REQUESTED`.
   Action required: "add HAS_INBOUND_ACTION edges per
   nacl-sa-ui/SKILL.md Nav Actions subsection; re-run
   `/nacl-sa-ui navigation` to capture the parent-screen affordance;
   re-submit for review."
4. Even if QA evidence were attached, Condition 2 also fails — the
   only navigation trace shows direct URL paste, no
   `HAS_INBOUND_ACTION.label`-matching click.

The fixture demonstrates the false-PASS the W7 gate exists to
prevent.

## Optional exemption variant (not the default)

A variant of this fixture sets `entrypoint_type: deep-link-only`
on UC-FX11. With that flag, the rule exempts UC-FX11 from the
check and emits `nav-actions-EXEMPT:UC-FX11:deep-link-only`. This
variant is documentation-only and is NOT the default expected
outcome for this fixture.

This file is documentation-only; the graph nodes are created at
fixture-replay time by downstream consumers (W11 pilot).
