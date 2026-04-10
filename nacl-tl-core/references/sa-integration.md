# SA Integration Rules

## Overview

This document defines how TL (TeamLead) skills read and process SA (System Analyst) artifacts from the `docs/` structure. The SA skill creates standardized documentation; TL skills consume this documentation to create development tasks split into separate BE and FE tracks with a shared API contract.

## Key Principle: Self-Sufficiency

**CRITICAL**: Task files created by `nacl-tl-plan` must be **self-sufficient**. Development agents (`nacl-tl-dev-be`, `nacl-tl-dev-fe`, `nacl-tl-dev`) should NOT read original SA artifacts during development. Everything needed for implementation must be embedded in the task files.

```
SA Artifacts (docs/)                TL Task Files (.tl/tasks/UC001/)
────────────────────────            ──────────────────────────────────
UC*.md (API-side steps)         →   task-be.md
UC*.md (UI-side steps)          →   task-fe.md
UC*.md (Input/Output)           →   task-be.md + api-contract.md
entities/*.md                   →   task-be.md Context Extract
screens/*.md                    →   task-fe.md + impl-brief-fe.md
15-interfaces/layouts/          →   impl-brief-fe.md
15-interfaces/components/       →   impl-brief-fe.md
15-interfaces/_navigation.md    →   task-fe.md Routes
FR-*.md (functional)            →   acceptance.md
NFR-*.md (non-functional)       →   acceptance.md
UC Activity Diagram API steps   →   api-contract.md endpoints
```

---

## SA Artifact Structure

### Standard `docs/` Layout (Classic SA)

```
docs/
├── _index.md                    # Documentation index
├── 14-usecases/
│   ├── _uc-index.md            # Use case index with priorities
│   ├── UC001-create-order.md
│   └── ...
├── 12-domain/
│   ├── _domain-model.md        # Class diagram overview
│   ├── entities/
│   │   ├── orders.md
│   │   └── clients.md
│   └── enumerations/
│       └── order-status.md
├── 15-interfaces/
│   ├── _navigation.md          # Screen flow / navigation map
│   └── screens/
│       └── order-form.md
├── 16-requirements/
│   ├── functional/
│   │   └── FR-orders.md
│   └── non-functional/
│       └── NFR-performance.md
└── 05-appendix/
    └── glossary.md
```

### Extended `docs/` Layout (SA with sa-ui Skill)

In newer projects where the SA uses the `sa-ui` skill, an additional `15-interfaces/` directory contains frontend-specific artifacts.

```
docs/
├── ...existing structure above...
└── 15-interfaces/                    # NEW (created by sa-ui skill)
    ├── _navigation.md               # Navigation map / sitemap
    ├── layouts/
    │   ├── main-layout.md           # Main application layout
    │   └── auth-layout.md           # Authentication layout
    ├── components/
    │   ├── _component-catalog.md    # Shared component specifications
    │   └── data-table.md            # Reusable component spec
    └── design-tokens/
        └── tokens.md               # Colors, fonts, spacing
```

**NOTE**: `docs/15-interfaces/` contains forms, navigation, layouts, components, and design tokens.

---

## Reading Rules

### Rule 1: Read in Order

When `nacl-tl-plan` processes SA artifacts, read in this sequence:

1. **`docs/_index.md`** -- Get project overview, scope, directory structure
2. **`docs/14-usecases/_uc-index.md`** (or `14-usecases/`) -- Get task list and priorities
3. **Individual UC files** -- Get details for each task
4. **`docs/12-domain/`** -- Get entity context, domain model, enumerations
5. **`docs/15-interfaces/`** -- Get forms, navigation (if no 15-interfaces/)
6. **`docs/16-requirements/`** (or `16-requirements/`) -- Get acceptance criteria
7. **`docs/15-interfaces/`** (if exists) -- Get layouts, components, design tokens for FE

### Rule 2: Extract, Don't Reference

**DO**: Extract relevant content into task files (entity tables, business rules, status values).

**DON'T**: Leave references like "See docs/12-domain/entities/orders.md".

### Rule 3: Map Artifacts to Task Components (BE + FE Split)

| SA Artifact | Maps To | Purpose |
|-------------|---------|---------|
| `UC*.md` Main Flow (API-side steps) | `task-be.md` | Backend task description |
| `UC*.md` Main Flow (UI-side steps) | `task-fe.md` | Frontend task description |
| `UC*.md` Input/Output | `task-be.md` + `api-contract.md` | Data contract |
| `entities/*.md` | `task-be.md` Context Extract | Domain knowledge for BE |
| `enumerations/*.md` | `task-be.md` Context Extract | Status values, lookups |
| `screens/*.md` | `task-fe.md` + `impl-brief-fe.md` | Form specs -> Zod schemas |
| `15-interfaces/layouts/` | `impl-brief-fe.md` Layout section | Page layout composition |
| `15-interfaces/components/` | `impl-brief-fe.md` Components | Shared component specs |
| `15-interfaces/_navigation.md` | `task-fe.md` Routes section | Next.js App Router routes |
| `15-interfaces/design-tokens/` | `impl-brief-fe.md` Styling | Tailwind CSS config |
| `FR-*.md` (functional) | `acceptance.md` Functional criteria | Acceptance tests |
| `NFR-*.md` (non-functional) | `acceptance.md` Non-functional | Performance, security |
| UC Activity Diagram API steps | `api-contract.md` endpoints | API endpoint design |

---

## Splitting UC Flow into BE and FE Steps

A Use Case Main Flow contains both UI and API steps mixed together. `nacl-tl-plan` must split them into separate BE and FE tasks.

**Rule of thumb:**
- Steps starting with "User..." belong to FE
- Steps starting with "System..." belong to BE
- Steps involving both (e.g., "System loads data for display") generate entries in BOTH tracks plus an endpoint in api-contract.md

### Example: Splitting UC Main Flow

```
UC Main Flow (original):
1. User opens order creation page          → FE (routing, page render)
2. System loads client list                → BE (GET /api/clients) + FE (TanStack Query)
3. User selects client from dropdown       → FE (form state management)
4. User adds items to order                → FE (form array management)
5. User clicks Submit                      → FE (form submit handler)
6. System validates data                   → BE (DTO validation)
7. System creates order                    → BE (service + repository)
8. System returns order details            → BE (response) + FE (success handling)

Result of the split:
  Steps 1, 3, 4, 5 → task-fe.md (user interactions)
  Steps 6, 7       → task-be.md (API logic)
  Steps 2, 8       → task-be.md + task-fe.md + api-contract.md (both sides)
  Steps 2, 5-8     → api-contract.md (endpoints: GET /api/clients, POST /api/orders)
```

---

## Artifact Types

### Use Case Files

**Location**: `docs/14-usecases/UC*.md` or `docs/14-usecases/UC*.md`

**Sections to extract and split**:

| UC Section | Maps To BE | Maps To FE | Maps To Contract |
|------------|-----------|-----------|-----------------|
| Description | task-be.md description | task-fe.md description | -- |
| Preconditions | task-be.md preconditions | task-fe.md preconditions | -- |
| Main Flow (system steps) | task-be.md steps | -- | api-contract.md endpoints |
| Main Flow (user steps) | -- | task-fe.md interactions | -- |
| Main Flow (data loading) | task-be.md endpoint | task-fe.md query hook | api-contract.md endpoint |
| Alternative Flows | task-be.md edge cases | task-fe.md error states | api-contract.md error codes |
| Postconditions | acceptance.md criteria | acceptance.md criteria | -- |
| Activity Diagram | impl-brief.md workflow | impl-brief-fe.md flow | api-contract.md endpoints |

### Entity Files

**Location**: `docs/12-domain/entities/*.md`

**Extract for task-be.md context**: Attribute table, relationships, business rules, status transitions. **Extract for api-contract.md**: Entity fields become TypeScript interface properties, status enumerations become union types.

### Form Files

**Location**: `docs/15-interfaces/screens/*.md`

**Extract for task-fe.md**: Form fields with types and validation rules become Zod schema definitions. **Extract for impl-brief-fe.md**: Element table becomes component props, form behavior becomes event handlers, field dependencies become conditional rendering, error messages become Zod error map entries.

### Interface Files (15-interfaces/)

**Location**: `docs/15-interfaces/` (if exists)

- `_navigation.md` -> Routes table in task-fe.md (Next.js App Router paths)
- `layouts/*.md` -> Page layout composition in impl-brief-fe.md
- `components/*.md` -> Shared component specs in impl-brief-fe.md
- `design-tokens/tokens.md` -> Tailwind theme configuration in impl-brief-fe.md

### Requirements Files

**Location**: `docs/16-requirements/` or `docs/16-requirements/`

**Extract for acceptance.md**: FR numbers and descriptions become functional criteria (AC01, AC02...), validation rules become criteria with expected behavior, NFR become non-functional criteria.

---

## Integration Patterns

### Pattern 1: UC-to-Task Mapping (BE + FE Split)

```
UC001-create-order.md  →  .tl/tasks/UC001/
                           ├── task-be.md          ← API steps, Input/Output, Entity Context
                           ├── task-fe.md          ← UI steps, Routes, Components, Forms
                           ├── test-spec.md        ← BE test cases
                           ├── test-spec-fe.md     ← FE test cases (CT, HT, FT, IT, AT)
                           ├── impl-brief.md       ← Service/Controller/Repo, DB schema
                           ├── impl-brief-fe.md    ← Next.js structure, TanStack Query, Zustand
                           ├── acceptance.md       ← Criteria from FR + NFR
                           └── api-contract.md     ← Endpoints, shared types, error codes
```

### Pattern 2: Entity Context Embedding

Instead of referencing SA files, embed entity data directly:

```markdown
# task-be.md (GOOD -- self-sufficient)
## Context Extract

### Entity: Order
| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| number | String | Yes | Auto-generated ORD-YYYYMMDD-NNNN |
| date | DateTime | Yes | Creation timestamp |
| client | -> Client | Yes | Reference to client |
| status | -> OrderStatus | Yes | Current status |
| total | Number | Yes | Calculated from items |

### Business Rules
- BR01: Order number auto-generated on creation
- BR02: Order requires at least one item
- BR03: Total calculated as sum of item amounts
```

Never do this:
```markdown
# task-be.md (BAD -- external reference)
For entity details, see docs/12-domain/entities/orders.md
```

### Pattern 3: Form-to-Zod Schema Mapping

SA form specification (from `docs/15-interfaces/screens/`):
```markdown
## Elements
| ID | Type | Label | Validation |
|----|------|-------|------------|
| clientSelect | dropdown | Client | Required |
| itemsTable | table | Items | Min 1 row |
| notesInput | textarea | Notes | Max 500 chars |
```

Becomes Zod schema in task-fe.md:
```markdown
## Forms
### CreateOrderForm
#### Zod Schema
const createOrderSchema = z.object({
  clientId: z.string().uuid('Client is required'),
  items: z.array(orderItemSchema).min(1, 'At least one item required'),
  notes: z.string().max(500).optional(),
});
```

### Pattern 4: Navigation-to-Routes Mapping

SA navigation (from `15-interfaces/_navigation.md`):
```
Dashboard -> /dashboard
Orders List -> /orders
Create Order -> /orders/new
Order Details -> /orders/:id
```

Becomes routes table in task-fe.md:

| Route | Component | Layout | Description |
|-------|-----------|--------|-------------|
| `/orders` | `OrderListPage` | `MainLayout` | Orders list with filtering |
| `/orders/new` | `CreateOrderPage` | `MainLayout` | Order creation form |
| `/orders/[id]` | `OrderDetailPage` | `MainLayout` | Order details view |

### Pattern 5: Design Tokens-to-Tailwind Mapping

SA design tokens (colors, fonts, spacing from `15-interfaces/design-tokens/`) become Tailwind theme extension in impl-brief-fe.md:

```typescript
// tailwind.config.ts (extend section)
colors: {
  primary: '#2563EB',
  secondary: '#64748B',
  error: '#DC2626',
}
```

### Pattern 6: Component Catalog Mapping

SA component specs (from `15-interfaces/components/`) become shared component definitions in impl-brief-fe.md:

```markdown
### DataTable
- Location: src/shared/components/DataTable.tsx
- Props: columns, data, onSort, onFilter, onPageChange, selectionMode
- Features: Sortable columns, pagination (10/25/50), row selection
- Test: src/shared/components/__tests__/DataTable.test.tsx
- Used by: OrderListPage, ClientListPage
```

---

## UC Processing Checklist

```markdown
## UC Processing Checklist: UC___

- [ ] UC file read and parsed
- [ ] BE task: Description extracted to task-be.md
- [ ] BE task: Input/Output defined
- [ ] BE task: Related entities embedded as Context Extract
- [ ] FE task: UI steps extracted to task-fe.md
- [ ] FE task: Pages/Routes defined
- [ ] FE task: Components listed
- [ ] FE task: Forms with Zod schemas defined
- [ ] API contract: Endpoints derived from UC flow
- [ ] API contract: Shared types defined
- [ ] API contract: Events listed (if applicable)
- [ ] BE impl-brief: Service/Controller/Repository patterns
- [ ] FE impl-brief: Component hierarchy, TanStack Query hooks
- [ ] BE test-spec: Unit + integration tests defined
- [ ] FE test-spec: RTL tests defined (CT, HT, FT, IT, AT)
- [ ] Acceptance criteria derived from requirements
- [ ] No external references left (all content self-sufficient)
```

---

## Pre-Reading Checklist

Before starting `nacl-tl-plan`, verify the SA artifacts are complete:

```markdown
### Required
- [ ] docs/_index.md exists and lists all modules
- [ ] UC index exists with UC list and priorities
- [ ] Each UC has complete frontmatter (uc_id, priority, status, actor)
- [ ] Each UC has Main Flow with numbered steps
- [ ] Domain model exists with class diagram
- [ ] Entities referenced in UCs have files in docs/12-domain/entities/
- [ ] Requirements are numbered (FR001, FR002... or FR-module-NNN)

### Optional (check if exists)
- [ ] docs/15-interfaces/screens/ -- screen specifications
- [ ] docs/15-interfaces/_navigation.md -- navigation map
- [ ] docs/15-interfaces/ -- FE-specific artifacts (sa-ui skill)
- [ ] docs/15-interfaces/layouts/ -- page layout specs
- [ ] docs/15-interfaces/components/ -- shared component specs
- [ ] docs/15-interfaces/design-tokens/ -- color, font, spacing tokens
```

---

## Error Handling

### Missing Artifacts

If an SA artifact is missing:

```markdown
## Warning: Missing Artifact

**Expected**: docs/15-interfaces/screens/order-form.md
**Referenced in**: UC001 Activity Diagram, step 3

**Action**:
1. Add to blockers in status.json
2. Continue with other UCs
3. Mark affected UC task files as incomplete
4. Add TODO in task-fe.md: "Form spec pending from SA"
```

### Incomplete Artifacts

If an SA artifact is incomplete:

```markdown
## Warning: Incomplete Artifact

**File**: docs/14-usecases/UC002-edit-order.md
**Missing**: Activity Diagram

**Action**:
1. Create task files with available information
2. Add note in impl-brief.md: "Activity diagram pending"
3. Set task priority to low until resolved
4. Flag in master-plan.md blockers section
```

### Inconsistent Data

If SA artifacts have inconsistencies:

```markdown
## Warning: Inconsistency Detected

**Issue**: OrderStatus values differ
- docs/12-domain/enumerations/order-status.md: NEW, IN_PROGRESS, DONE
- docs/14-usecases/UC001.md: New, In Progress, Completed

**Action**:
1. Use Domain Model as source of truth (docs/12-domain/)
2. Note discrepancy in task-be.md Context Extract
3. Use consistent values in api-contract.md shared types
```

### Missing 15-interfaces/ Directory

If the SA project does not have `docs/15-interfaces/`:

```markdown
## Note: No 15-interfaces/ Directory

**Action**:
1. Use docs/15-interfaces/ for navigation and form specs
2. Derive layout from project conventions or defaults
3. Skip design tokens section in impl-brief-fe.md
4. Note in impl-brief-fe.md: "Use project default Tailwind config"
```

---

## Reference Summary

| What | Where (Classic) | Where (Extended) | Used By |
|------|----------------|------------------|---------|
| Task list + priorities | `_uc-index.md` | `_uc-index.md` | nacl-tl-plan (master-plan.md) |
| Task details | `UC*.md` | `UC*.md` | nacl-tl-plan (task-be + task-fe) |
| Entity context | `entities/*.md` | `entities/*.md` | nacl-tl-plan (task-be Context Extract) |
| Status values | `enumerations/*.md` | `enumerations/*.md` | nacl-tl-plan (task-be + api-contract) |
| Form specs | `screens/*.md` | `screens/*.md` | nacl-tl-plan (task-fe + impl-brief-fe) |
| Navigation | `15-interfaces/_navigation.md` | `15-interfaces/_navigation.md` | nacl-tl-plan (task-fe Routes) |
| Layouts | -- | `15-interfaces/layouts/` | nacl-tl-plan (impl-brief-fe Layout) |
| Components | -- | `15-interfaces/components/` | nacl-tl-plan (impl-brief-fe Components) |
| Design tokens | -- | `15-interfaces/design-tokens/` | nacl-tl-plan (impl-brief-fe Styling) |
| Functional reqs | `FR-*.md` | `FR-*.md` | nacl-tl-plan (acceptance.md) |
| Non-functional reqs | `NFR-*.md` | `NFR-*.md` | nacl-tl-plan (acceptance.md) |
