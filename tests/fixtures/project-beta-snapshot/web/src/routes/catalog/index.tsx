// Synthetic reconstruction of the project-beta UC-001 catalog page.
// Source episode: project-beta-postmortem.md § 3.4
//   "UC-001 catalog has no upload entry-point — SPEC MISSING"
//
// The UC-001 form-fields table specified only `title`, `status`,
// `language`, `uploaded_at`, `duration_sec`, `open_button` (Navigates to
// /meetings/:id). No upload affordance. No outgoing nav-action to UC-100.
//
// Post-W7, sa-ui requires `HAS_INBOUND_ACTION` edges from the parent
// Component (CatalogPage) to UC-100's Form. Without that edge AND
// without an exemption (`actor=SYSTEM` / `has_ui=false` /
// `entrypoint_type ∈ {deep-link-only, embed-only}`), tl-review fires
// `BLOCKED (nav-actions-missing)`.
//
// Reachability query:
//   nacl-sa-ui/references/reachability.cypher § 4 `ui_reachability_blockers`
//   → returns one row: (UC-100, FORM-UploadMeeting, 'no-inbound-action').

import * as React from 'react';

export function CatalogPage(): JSX.Element {
  return (
    <div>
      <h1>Meeting Catalog</h1>
      {/* INTENTIONAL: no "Upload" button. */}
      {/* No `<Link to="/upload">…` element. */}
      {/* No menu item. No empty-state CTA pointing to UC-100. */}
      <table>
        <thead>
          <tr><th>title</th><th>status</th><th>language</th><th>uploaded_at</th><th>duration_sec</th><th></th></tr>
        </thead>
        <tbody>
          {/* open_button = the only declared affordance */}
        </tbody>
      </table>
    </div>
  );
}
