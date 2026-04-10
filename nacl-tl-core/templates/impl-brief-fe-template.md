# Frontend Implementation Brief Template

## File Name

`impl-brief-fe.md`

Located in: `.tl/tasks/{{task_id}}/impl-brief-fe.md`

Example: `.tl/tasks/UC001/impl-brief-fe.md`

## Purpose

Provides frontend implementation guidance for the development agent. Contains HOW to implement the task on the frontend: component architecture, file locations, Next.js App Router patterns, API integration hooks, state management, styling approach, and TDD order. This file bridges the gap between WHAT (task-fe.md) and testing (test-spec-fe.md).

For backend implementation brief, see the paired file `impl-brief.md`.

## Created By

`nacl-tl-plan` skill

## Read By

`nacl-tl-dev-fe` skill

## Contents

```markdown
---
task_id: {{task_id}}
title: "FE Implementation Brief: {{title}}"
source_uc: {{path_to_source_uc}}
status: pending
created: {{YYYY-MM-DD}}
updated: {{YYYY-MM-DD}}
architecture_type: next-app-router
tags: [implementation, fe, {{module}}, {{task_id}}]
---

# FE Implementation Brief: {{task_id}}

## Overview

{{Brief description of the frontend implementation approach.}}
{{Key UI/UX decisions and rationale.}}

## Project Structure (Next.js App Router)

```
src/
├── app/
│   ├── {{route_group}}/
│   │   ├── {{route}}/
│   │   │   ├── page.tsx           # {{Page description}}
│   │   │   └── loading.tsx        # {{Loading UI}}
│   │   ├── {{route}}/[id]/
│   │   │   ├── page.tsx           # {{Detail page description}}
│   │   │   └── not-found.tsx      # {{404 for this route}}
│   │   └── layout.tsx             # {{Layout description}}
├── components/
│   ├── ui/                        # Reusable UI components
│   │   └── {{UIComponent}}.tsx
│   └── features/
│       └── {{domain}}/            # Feature-specific components
│           ├── {{Component1}}.tsx
│           ├── {{Component2}}.tsx
│           └── {{FormComponent}}.tsx
├── hooks/
│   └── use{{Entity}}.ts           # TanStack Query hooks
├── lib/
│   └── api/
│       └── {{entity}}.ts          # API client functions
├── types/
│   └── {{entity}}.ts              # TypeScript types
├── stores/
│   └── {{store}}.ts               # Zustand stores
└── test/
    └── mocks/
        ├── handlers/
        │   └── {{entity}}.ts      # MSW handlers
        └── fixtures/
            └── {{entity}}.ts      # Test fixtures
```

## Component Hierarchy

```
{{PageComponent}} (app/{{route}}/page.tsx)
├── {{LayoutComponent}} (app/{{route_group}}/layout.tsx)
│   ├── {{HeaderComponent}}
│   └── {{SidebarComponent}}
├── {{FilterBarComponent}}
│   ├── {{SearchInput}} (ui)
│   └── {{StatusFilter}} (ui)
├── {{ListComponent}}
│   ├── {{CardComponent}} (per item)
│   │   ├── {{StatusBadge}} (ui)
│   │   ├── {{InfoSection}}
│   │   └── {{ActionButtons}} (ui)
│   └── {{EmptyState}} (ui)
├── {{PaginationComponent}} (ui)
└── {{ModalComponent}} (conditional)
    └── {{FormComponent}}
        ├── {{InputField}} (ui, per field)
        └── {{SubmitButton}} (ui)
```

## Files to Create

| File | Purpose | Reference |
|------|---------|-----------|
| `src/app/{{route}}/page.tsx` | {{Page component}} | {{existing_similar_page}} |
| `src/app/{{route}}/loading.tsx` | {{Loading skeleton}} | {{reference}} |
| `src/components/features/{{domain}}/{{Component}}.tsx` | {{Feature component}} | {{reference}} |
| `src/components/features/{{domain}}/{{FormComponent}}.tsx` | {{Form component}} | {{reference}} |
| `src/hooks/use{{Entity}}.ts` | {{TanStack Query hooks}} | {{reference}} |
| `src/lib/api/{{entity}}.ts` | {{API client functions}} | {{reference}} |
| `src/types/{{entity}}.ts` | {{TypeScript types}} | {{reference}} |
| `src/stores/{{store}}.ts` | {{Zustand store}} | {{reference}} |
| `src/test/mocks/handlers/{{entity}}.ts` | {{MSW handlers}} | {{reference}} |
| `src/test/mocks/fixtures/{{entity}}.ts` | {{Test fixtures}} | {{reference}} |

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/{{route_group}}/layout.tsx` | modify | {{Add navigation link}} |
| `src/components/layouts/{{Sidebar}}.tsx` | modify | {{Add menu item}} |
| `src/test/mocks/handlers/index.ts` | add | {{Register new MSW handlers}} |

## Routing (App Router)

### Route Configuration

| Route Pattern | File | Server/Client | Params |
|--------------|------|---------------|--------|
| `/{{path}}` | `app/{{path}}/page.tsx` | {{Server / Client}} | {{none}} |
| `/{{path}}/[id]` | `app/{{path}}/[id]/page.tsx` | {{Server / Client}} | `id: string` |
| `/{{path}}/new` | `app/{{path}}/new/page.tsx` | Client | {{none}} |

### Page Components

```typescript
// app/{{route}}/page.tsx
// Server Component (default) -- fetches initial data
export default async function {{PageName}}Page() {
  return (
    <div className="{{layout_classes}}">
      <{{PageHeading}} />
      <{{MainContent}} />
    </div>
  );
}
```

```typescript
// app/{{route}}/[id]/page.tsx
// Server Component with params
interface {{PageName}}DetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function {{PageName}}DetailPage({ params }: {{PageName}}DetailPageProps) {
  const { id } = await params;
  return <{{DetailComponent}} id={id} />;
}
```

### Client Components

```typescript
// components/features/{{domain}}/{{Component}}.tsx
'use client';

// Client Component -- handles interactivity, hooks, state
export function {{ComponentName}}({{ props }}: {{ComponentProps}}) {
  const { data, isLoading } = use{{Entity}}List();
  // ...
}
```

## API Client Integration (TanStack Query)

### API Functions

```typescript
// lib/api/{{entity}}.ts
import { apiClient } from './client';
import type { {{Entity}}, Create{{Entity}}Input, Update{{Entity}}Input, {{Entity}}Filters } from '@/types/{{entity}}';

export const {{entity}}Api = {
  getAll: (filters?: {{Entity}}Filters) =>
    apiClient<{{Entity}}[]>('/api/{{entities}}', {
      method: 'GET',
      // query params from filters
    }),

  getById: (id: string) =>
    apiClient<{{Entity}}>(`/api/{{entities}}/${id}`),

  create: (input: Create{{Entity}}Input) =>
    apiClient<{{Entity}}>('/api/{{entities}}', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (id: string, input: Update{{Entity}}Input) =>
    apiClient<{{Entity}}>(`/api/{{entities}}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  delete: (id: string) =>
    apiClient<void>(`/api/{{entities}}/${id}`, {
      method: 'DELETE',
    }),
};
```

### Query Hooks

```typescript
// hooks/use{{Entity}}.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { {{entity}}Api } from '@/lib/api/{{entity}}';

export function use{{Entity}}List(filters?: {{Entity}}Filters) {
  return useQuery({
    queryKey: ['{{entities}}', filters],
    queryFn: () => {{entity}}Api.getAll(filters),
  });
}

export function use{{Entity}}(id: string) {
  return useQuery({
    queryKey: ['{{entities}}', id],
    queryFn: () => {{entity}}Api.getById(id),
    enabled: !!id,
  });
}

export function useCreate{{Entity}}() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: {{entity}}Api.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['{{entities}}'] });
    },
  });
}

export function useUpdate{{Entity}}() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Update{{Entity}}Input }) =>
      {{entity}}Api.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['{{entities}}'] });
      queryClient.invalidateQueries({ queryKey: ['{{entities}}', id] });
    },
  });
}

export function useDelete{{Entity}}() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: {{entity}}Api.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['{{entities}}'] });
    },
  });
}
```

## State Management (Zustand)

### Store: {{storeName}}

**Purpose:** {{What client-side state this manages (filters, UI state, modal open/close)}}

```typescript
// stores/{{store}}.ts
import { create } from 'zustand';

interface {{StoreState}} {
  // State
  {{filter}}: {{Type}};
  {{isModalOpen}}: boolean;
  {{selectedId}}: string | null;

  // Actions
  set{{Filter}}: (value: {{Type}}) => void;
  open{{Modal}}: (id?: string) => void;
  close{{Modal}}: () => void;
  reset: () => void;
}

const initialState = {
  {{filter}}: {{defaultValue}},
  {{isModalOpen}}: false,
  {{selectedId}}: null,
};

export const use{{Store}} = create<{{StoreState}}>((set) => ({
  ...initialState,

  set{{Filter}}: (value) => set({ {{filter}}: value }),

  open{{Modal}}: (id) => set({ {{isModalOpen}}: true, {{selectedId}}: id ?? null }),

  close{{Modal}}: () => set({ {{isModalOpen}}: false, {{selectedId}}: null }),

  reset: () => set(initialState),
}));
```

## Styling (Tailwind CSS)

### Layout Patterns

| Element | Tailwind Classes | Description |
|---------|-----------------|-------------|
| Page container | `{{container_classes}}` | {{Layout description}} |
| Card grid | `{{grid_classes}}` | {{Responsive grid}} |
| Form layout | `{{form_classes}}` | {{Form spacing}} |
| Action bar | `{{action_classes}}` | {{Button alignment}} |

### Component Variants

```typescript
// Variant maps for key components
const {{component}}Variants = {
  {{variant1}}: '{{tailwind_classes}}',
  {{variant2}}: '{{tailwind_classes}}',
  {{variant3}}: '{{tailwind_classes}}',
} as const;
```

### Responsive Breakpoints

| Breakpoint | Width | Layout Change |
|------------|-------|---------------|
| Base (mobile) | `< 640px` | {{Single column, stacked}} |
| `sm:` | `>= 640px` | {{Two columns}} |
| `md:` | `>= 768px` | {{Sidebar visible}} |
| `lg:` | `>= 1024px` | {{Full layout}} |

## Form Implementation (React Hook Form + Zod)

### Schema

```typescript
// Zod schema defined in form component file
const {{schemaName}} = z.object({
  {{field1}}: z.string().min({{min}}, '{{error}}').max({{max}}, '{{error}}'),
  {{field2}}: z.number({ invalid_type_error: '{{error}}' }).positive('{{error}}'),
  {{field3}}: z.enum([{{values}}]),
  {{field4}}: z.string().optional(),
});

type {{FormDataType}} = z.infer<typeof {{schemaName}}>;
```

### Form Component Pattern

```typescript
export function {{FormComponent}}({ onSubmit, defaultValues }: {{FormProps}}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{{FormDataType}}>({
    resolver: zodResolver({{schemaName}}),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Fields with per-field error display */}
      {/* Submit button with disabled={isSubmitting} and loading text */}
    </form>
  );
}
```

## Dependencies

### Internal Dependencies

| Module | Import From | Purpose |
|--------|-------------|---------|
| {{UIComponent}} | `@/components/ui/{{Component}}` | {{Reusable UI element}} |
| cn | `@/lib/utils/cn` | {{Class name merge utility}} |
| apiClient | `@/lib/api/client` | {{Base HTTP client}} |

### External Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@tanstack/react-query` | `{{version}}` | Server state management |
| `react-hook-form` | `{{version}}` | Form handling |
| `@hookform/resolvers` | `{{version}}` | Zod integration for RHF |
| `zod` | `{{version}}` | Schema validation |
| `zustand` | `{{version}}` | Client state management |
| `clsx` | `{{version}}` | Conditional class names |
| `tailwind-merge` | `{{version}}` | Tailwind class deduplication |

### New Dependencies Required

| Package | Version | Purpose | Install Command |
|---------|---------|---------|-----------------|
| {{package}} | `{{version}}` | {{Purpose}} | `npm install {{package}}` |

## Error Handling Strategy

| Error Type | UI Component | User Message |
|------------|-------------|--------------|
| Network error | `<ErrorBanner />` | {{Connection error message}} |
| 400 Validation | Per-field errors under inputs | {{Field-specific messages from API}} |
| 404 Not Found | `<NotFound />` component | {{Resource not found message}} |
| 403 Forbidden | Redirect to access denied | {{No access message}} |
| 500 Server Error | `<ErrorBanner />` with retry | {{Generic server error, try again}} |
| Unhandled | `<ErrorBoundary />` fallback | {{Something went wrong}} |

## TDD Implementation Order

Follow this order during RED-GREEN-REFACTOR:

### Phase 1: RED (Write Failing Tests)

1. Write component tests (CT) for `{{ComponentName}}` -- render, interactions
2. Write hook tests (HT) for `use{{Entity}}List`, `useCreate{{Entity}}`
3. Write form tests (FT) for `{{FormComponent}}` -- validation, submission
4. Write integration tests (IT) for full page flow

### Phase 2: GREEN (Minimal Implementation)

1. Create TypeScript types in `src/types/{{entity}}.ts`
2. Create API client functions in `src/lib/api/{{entity}}.ts`
3. Create MSW handlers and test fixtures
4. Implement TanStack Query hooks in `src/hooks/use{{Entity}}.ts`
5. Implement `{{ComponentName}}` to pass CT01
6. Implement `{{FormComponent}}` to pass FT01
7. Create page component in `app/{{route}}/page.tsx` to pass IT01
8. Add Zustand store if needed

### Phase 3: REFACTOR (Improve Quality)

1. Extract reusable UI components to `components/ui/`
2. Add loading skeletons for all loading states
3. Add error boundaries
4. Ensure accessibility (AT tests pass)
5. Handle edge cases (EC tests pass)
6. Optimize with useMemo/useCallback where needed

## Code Patterns

### Pattern: Server Component with Client Child

**Use When:** Page needs server-side data + client interactivity

**Reference Implementation:** `{{path/to/reference/page.tsx}}`

```typescript
// app/{{route}}/page.tsx (Server Component)
export default async function {{Page}}() {
  return (
    <div>
      <h1>{{Title}}</h1>
      <{{ClientComponent}} />  {/* 'use client' component */}
    </div>
  );
}
```

### Pattern: List with Filters

**Use When:** Displaying filtered, paginated lists

**Reference Implementation:** `{{path/to/reference}}`

```typescript
// Client component with query hooks + Zustand filters
'use client';
export function {{ListComponent}}() {
  const filters = use{{Store}}((s) => ({ status: s.statusFilter }));
  const { data, isLoading } = use{{Entity}}List(filters);

  if (isLoading) return <{{ListSkeleton}} />;
  if (!data?.length) return <EmptyState message="{{message}}" />;

  return (
    <div className="{{grid_classes}}">
      {data.map((item) => (
        <{{CardComponent}} key={item.id} item={item} />
      ))}
    </div>
  );
}
```

### Pattern: Modal Form

**Use When:** Create/Edit forms in modal dialogs

**Reference Implementation:** `{{path/to/reference}}`

```typescript
'use client';
export function {{ModalForm}}() {
  const { isModalOpen, selectedId, closeModal } = use{{Store}}();
  const createMutation = useCreate{{Entity}}();

  if (!isModalOpen) return null;

  return (
    <Dialog open={isModalOpen} onClose={closeModal}>
      <{{FormComponent}}
        onSubmit={async (data) => {
          await createMutation.mutateAsync(data);
          closeModal();
        }}
      />
    </Dialog>
  );
}
```

## Code Style Guidelines

- Follow existing patterns in `{{reference_file}}`
- Named exports for all components (no default exports)
- Props destructured in function signature
- Component size < 150 lines; extract sub-components if larger
- Tailwind utility classes, cn() for conditional classes
- No `any` in props, strict TypeScript
- Reference: `nacl-tl-core/references/fe-code-style.md`

## Verification Commands

```bash
# Run FE tests
npx vitest run --reporter=verbose

# Run specific test file
npx vitest run src/components/features/{{domain}}/{{Component}}.test.tsx

# Type check
npx tsc --noEmit

# Lint
npx eslint src/ --ext .ts,.tsx

# Build
npx next build
```

## SA References (For Human Review Only)

- Use Case: {{path_to_usecase}}
- Entity: {{path_to_entity}}
- Form: {{path_to_form}}
- UI Mockup: {{path_to_mockup}}
- Architecture: {{path_to_architecture_doc}}
```

## Architecture Types Reference

| Type | Description | Use Case |
|------|-------------|----------|
| `next-app-router` | Next.js 14+ App Router (Server/Client Components) | Default for all FE tasks |

## Status Values Reference

| Status | Meaning |
|--------|---------|
| `pending` | Brief created, not started |
| `in_progress` | Development using this brief |
| `complete` | Implementation finished |

## Quality Checklist

Before committing an impl-brief-fe.md file, verify:

- [ ] Frontmatter complete (task_id, title, status, architecture_type)
- [ ] Project structure documented (App Router layout)
- [ ] Component hierarchy tree included
- [ ] All files to create/modify listed
- [ ] Routing configuration with Server/Client component types
- [ ] API client functions and TanStack Query hooks defined
- [ ] Zustand store defined (if client state needed)
- [ ] Styling approach with Tailwind patterns
- [ ] Form implementation with Zod schema
- [ ] TDD implementation order specified (RED/GREEN/REFACTOR)
- [ ] Code patterns with references included
- [ ] Dependencies (internal and external) listed
- [ ] Error handling strategy defined
- [ ] Verification commands provided
- [ ] NO external references for dev agent (SA refs for humans only)
