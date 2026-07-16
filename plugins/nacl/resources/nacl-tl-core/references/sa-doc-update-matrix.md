# SA Document Update Matrix for Code Changes

A reference document for the **nacl-tl-fix** skill. Defines which SA document needs to be updated for a specific type of code change, and which tool to use.

---

## Full Matrix

| Code change type | SA document | Skill / update method | Fix level |
|---|---|---|---|
| Enum / status (add, rename, or remove a value) | `docs/12-domain/enumerations/` | `sa-domain --mode=MODIFY` | L2 |
| State machine transitions (new transition, changed conditions) | `session-status.md` | `sa-domain --mode=MODIFY` | L2 |
| API endpoint contract change (response code, request/response body) | `api-contract.md` + UC spec | Manual within nacl-tl-fix | L2 |
| New API endpoint | UC spec in `docs/14-usecases/` | `sa-uc --mode=update` | L2 |
| UC flow change (step order, conditions, alternative scenarios) | `docs/14-usecases/` | `sa-uc --mode=update` | L2 |
| Screen / UI (new elements, layout change, modals) | `docs/15-interfaces/screens/` | Manual within nacl-tl-fix | L2 |
| DB migration (new column, type change, new table) | `docs/12-domain/entities/` | `sa-domain --mode=MODIFY` | L2 |
| Deploy / CI (configuration, environment variables) | `docs/DEPLOY.md` | Manual | L2 |
| CSS / layout fix (visual-only changes) | None | --- | L1 |
| Code typo, missing null-check | None | --- | L1 |
| New unspecified feature (no UC exists) | `docs/14-usecases/` + `docs/12-domain/` | `sa-uc` + `sa-domain` (create) | L3 |

---

## Detailed Description by Change Type

### Enums / Statuses

**Path:** `docs/12-domain/enumerations/`

**When to update:** A value has been added, renamed, or removed in any enum (session status, task type, user role, etc.).

**How to update:**
```bash
sa-domain --mode=MODIFY
```
Specify the enum and describe the change. The skill will update the enumeration file and verify references from other documents.

**What to verify:** Ensure that all UCs referencing this enum correctly describe the new/changed values.

---

### State Machine Transitions

**Path:** `session-status.md` (or the corresponding state machine file)

**When to update:** A new transition between states has been added, a transition condition has changed, or a new state has been introduced.

**How to update:**
```bash
sa-domain --mode=MODIFY
```
Describe the new/changed transition. The skill will update the state diagram and the transition table.

**What to verify:** All transitions are reachable, there are no dead-end states, guard conditions are consistent.

---

### API Endpoint Contract Changes

**Path:** `api-contract.md` + the corresponding UC spec

**When to update:** The HTTP method, URL, response code, request/response body structure, or headers have changed.

**How to update:** Manually within nacl-tl-fix:
1. Update `api-contract.md` -- find the endpoint, fix its description.
2. Update the UC spec if it references a specific contract.

**What to verify:** The frontend client and tests use the up-to-date contract.

---

### New API Endpoints

**Path:** UC spec in `docs/14-usecases/`

**When to update:** A new endpoint has been added that implements part of an existing UC or extends it.

**How to update:**
```bash
sa-uc --mode=update
```
Specify the UC, describe the new endpoint and its role in the scenario.

**What to verify:** The endpoint is added to `api-contract.md`, and the UC describes when and why it is called.

---

### UC Flow Changes

**Path:** `docs/14-usecases/`

**When to update:** The step order has changed, a step has been added or removed, branching conditions have changed, or an alternative scenario has been added.

**How to update:**
```bash
sa-uc --mode=update
```
Specify the UC and describe the flow change.

**What to verify:** Step numbering is sequential, alternative scenarios do not contradict the main flow, pre/postconditions are up to date.

---

### Screen / UI Changes

**Path:** `docs/15-interfaces/screens/`

**When to update:** A new UI element has been added (button, field, modal), the layout has changed, or an interactive element's behavior has changed.

**How to update:** Manually within nacl-tl-fix:
1. Find the screen description in `docs/15-interfaces/screens/`.
2. Update the element list, their states, and behavior.

**What to verify:** All interactive elements are described, states (disabled, loading, error) are accounted for.

---

### DB Migrations

**Path:** `docs/12-domain/entities/`

**When to update:** A new column has been added, a data type has changed, a new table has been created, or indexes/constraints have changed.

**How to update:**
```bash
sa-domain --mode=MODIFY
```
Describe the schema change. The skill will update the entity description.

**What to verify:** Entity relationships are up to date, nullable/default values are described, indexes are reflected.

---

### Deploy / CI

**Path:** `docs/DEPLOY.md`

**When to update:** Environment variables, Docker configuration, CI pipeline, ports, or infrastructure dependencies have changed.

**How to update:** Manually -- find the corresponding section in `DEPLOY.md` and update it.

**What to verify:** All environment variables are listed, deployment instructions are up to date.

---

### New Unspecified Features (L3)

**Path:** `docs/14-usecases/` + `docs/12-domain/`

**When to update:** The code area is not covered by any documentation.

**How to update:**
1. Create a UC: `sa-uc` (create) -- minimal scenario specification.
2. Create a domain model: `sa-domain` (create) -- if entities/enums are involved.

**What to verify:** The created specification covers the current bug and the main happy path.

---

## CSS / Layout Fixes and Typos (L1)

No documentation update is required. The specification is already correct; the issue is only in the code.
