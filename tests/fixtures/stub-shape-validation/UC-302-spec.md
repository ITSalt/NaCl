# UC-302 — Workflow Step Catalog (spec excerpt)

## FormField set (required-field subset)

| Field | Type | Required | Spec-ref |
|---|---|---|---|
| `id` | uuid | yes | UC-302:FormField:id |
| `name` | string | yes | UC-302:FormField:name |
| `step_order` | int | yes | UC-302:FormField:step_order |
| `kind` | enum (`transform`, `filter`, `aggregate`, `export`) | yes | UC-302:FormField:kind |

## Notes

- Source-of-truth: the per-UC graph nodes `(:UseCase {id: 'UC-302'})-[:HAS_FORM_FIELD]->(:FormField)`.
- `nacl-tl-stubs` reads this set when running the shape-validation
  procedure on stubs that closed against the workflow-steps service.
- The canonical `<spec-ref>` for this UC's workflow-step entity is
  `UC-302:FormField:workflow-step` (the umbrella ref covering the four
  fields above). Per-field refs (e.g. `UC-302:FormField:step_order`)
  are also valid for finer-grained closure evidence.
