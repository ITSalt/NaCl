# Frontend Test Specification Template

## File Name

`test-spec-fe.md`

Located in: `.tl/tasks/{{task_id}}/test-spec-fe.md`

Example: `.tl/tasks/UC001/test-spec-fe.md`

## Purpose

Defines all frontend test cases for the task. The development agent uses this file during the RED phase of TDD to write failing tests BEFORE implementation. Contains component tests, hook tests, form tests, integration tests, accessibility tests, and edge cases. Uses React Testing Library (RTL) + user-event for component testing and MSW for API mocking.

For backend test specification, see the paired file `test-spec.md`.

## Created By

`tl-plan` skill

## Read By

`tl-dev-fe` skill

## Contents

```markdown
---
task_id: {{task_id}}
title: "FE Test Specification: {{title}}"
source_uc: {{path_to_source_uc}}
status: pending
created: {{YYYY-MM-DD}}
updated: {{YYYY-MM-DD}}
test_framework: vitest
test_library: "@testing-library/react + @testing-library/user-event"
mock_server: msw
tags: [tests, fe, {{module}}, {{task_id}}]
---

# FE Test Specification: {{task_id}}

## Overview

{{Brief description of what these frontend tests verify.}}

## Test Environment

### Dependencies

- vitest: {{version}}
- @testing-library/react: {{version}}
- @testing-library/user-event: {{version}}
- @testing-library/jest-dom: {{version}}
- msw: {{version}}

### Setup Requirements

```typescript
// test/setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { server } from './mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
```

### Test Utilities

```typescript
// test/utils.tsx
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function AllProviders({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: AllProviders, ...options }),
  };
}
```

## MSW Handlers

### Handler: {{handlerGroupName}}

**Endpoints Mocked:**

```typescript
// test/mocks/handlers/{{entity}}.ts
import { http, HttpResponse } from 'msw';

import { {{fixtureName}} } from '../fixtures/{{entity}}';

export const {{entity}}Handlers = [
  // GET /api/{{entities}}
  http.get('/api/{{entities}}', () => {
    return HttpResponse.json({{fixtureName}});
  }),

  // GET /api/{{entities}}/:id
  http.get('/api/{{entities}}/:id', ({ params }) => {
    const item = {{fixtureName}}.find((e) => e.id === params.id);
    if (!item) {
      return HttpResponse.json(
        { message: 'Not found' },
        { status: 404 }
      );
    }
    return HttpResponse.json(item);
  }),

  // POST /api/{{entities}}
  http.post('/api/{{entities}}', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(
      { id: '{{mock_id}}', ...body },
      { status: 201 }
    );
  }),

  // PATCH /api/{{entities}}/:id
  http.patch('/api/{{entities}}/:id', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: '{{mock_id}}', ...body });
  }),

  // DELETE /api/{{entities}}/:id
  http.delete('/api/{{entities}}/:id', () => {
    return new HttpResponse(null, { status: 204 });
  }),
];
```

### Handler: Error Scenarios

```typescript
// Override handlers for error testing
export const {{entity}}ErrorHandlers = {
  serverError: http.get('/api/{{entities}}', () => {
    return HttpResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }),

  validationError: http.post('/api/{{entities}}', () => {
    return HttpResponse.json(
      { message: 'Validation failed', errors: { {{field}}: '{{error_message}}' } },
      { status: 400 }
    );
  }),

  notFound: http.get('/api/{{entities}}/:id', () => {
    return HttpResponse.json(
      { message: 'Not found' },
      { status: 404 }
    );
  }),
};
```

## Component Tests

### CT01. {{Component group name}}

**Component:** `{{ComponentName}}`

#### CT01.1. {{Test case: renders correctly}}

**Description:** {{Component renders with provided props}}

**Test:**
```typescript
it('should render {{component description}}', () => {
  // Arrange
  renderWithProviders(<{{ComponentName}} {{props}} />);

  // Assert
  expect(screen.getByRole('{{role}}', { name: '{{accessible_name}}' })).toBeInTheDocument();
  expect(screen.getByText('{{expected_text}}')).toBeInTheDocument();
});
```

#### CT01.2. {{Test case: user interaction}}

**Description:** {{User clicks/interacts with component}}

**Test:**
```typescript
it('should {{expected behavior}} when user {{action}}', async () => {
  // Arrange
  const {{handler}} = vi.fn();
  const { user } = renderWithProviders(
    <{{ComponentName}} on{{Action}}={{{handler}}} {{otherProps}} />
  );

  // Act
  await user.click(screen.getByRole('button', { name: '{{button_text}}' }));

  // Assert
  expect({{handler}}).toHaveBeenCalledWith({{expected_args}});
});
```

#### CT01.3. {{Test case: conditional rendering}}

**Description:** {{Component shows/hides elements based on props/state}}

**Test:**
```typescript
it('should {{show/hide}} {{element}} when {{condition}}', () => {
  // Arrange
  renderWithProviders(<{{ComponentName}} {{conditionalProp}}={{value}} />);

  // Assert
  expect(screen.{{queryByRole/getByRole}}('{{role}}')).{{toBeInTheDocument/not.toBeInTheDocument}}();
});
```

### CT02. {{Another component group}}

**Component:** `{{ComponentName}}`

#### CT02.1. {{Test case: loading state}}

**Description:** {{Component shows skeleton during loading}}

**Test:**
```typescript
it('should show loading skeleton while data is fetching', () => {
  // Arrange
  renderWithProviders(<{{ComponentName}} isLoading />);

  // Assert
  expect(screen.getByTestId('{{skeleton-test-id}}')).toBeInTheDocument();
  expect(screen.queryByRole('{{content_role}}')).not.toBeInTheDocument();
});
```

#### CT02.2. {{Test case: empty state}}

**Description:** {{Component shows empty state when no data}}

**Test:**
```typescript
it('should show empty state when list is empty', () => {
  // Arrange
  renderWithProviders(<{{ComponentName}} items={[]} />);

  // Assert
  expect(screen.getByText('{{empty_message}}')).toBeInTheDocument();
});
```

## Hook Tests

### HT01. {{Hook group name}}

**Hook:** `use{{HookName}}`

#### HT01.1. {{Test case: returns data}}

**Description:** {{Hook fetches and returns data correctly}}

**Test:**
```typescript
it('should return {{entity}} list', async () => {
  // Arrange
  const { result } = renderHook(() => use{{Entity}}List(), {
    wrapper: AllProviders,
  });

  // Assert
  await waitFor(() => {
    expect(result.current.data).toHaveLength({{expected_count}});
  });
  expect(result.current.data?.[0]).toMatchObject({
    {{field}}: {{expected_value}},
  });
});
```

#### HT01.2. {{Test case: mutation success}}

**Description:** {{Hook performs mutation and invalidates queries}}

**Test:**
```typescript
it('should create {{entity}} and invalidate list query', async () => {
  // Arrange
  const { result } = renderHook(() => useCreate{{Entity}}(), {
    wrapper: AllProviders,
  });

  // Act
  await act(async () => {
    result.current.mutate({{mutation_input}});
  });

  // Assert
  await waitFor(() => {
    expect(result.current.isSuccess).toBe(true);
  });
});
```

#### HT01.3. {{Test case: error handling}}

**Description:** {{Hook handles API error correctly}}

**Test:**
```typescript
it('should handle error when API returns {{status}}', async () => {
  // Arrange
  server.use({{entity}}ErrorHandlers.serverError);

  const { result } = renderHook(() => use{{Entity}}List(), {
    wrapper: AllProviders,
  });

  // Assert
  await waitFor(() => {
    expect(result.current.isError).toBe(true);
  });
  expect(result.current.error).toBeDefined();
});
```

## Form Tests

### FT01. {{Form group name}}

**Component:** `{{FormComponent}}`

#### FT01.1. {{Test case: successful submission}}

**Description:** {{User fills form and submits successfully}}

**Test:**
```typescript
it('should submit form with valid data', async () => {
  // Arrange
  const onSubmit = vi.fn();
  const { user } = renderWithProviders(
    <{{FormComponent}} onSubmit={onSubmit} />
  );

  // Act
  await user.type(screen.getByRole('textbox', { name: '{{label}}' }), '{{value}}');
  await user.selectOptions(screen.getByRole('combobox', { name: '{{label}}' }), '{{option}}');
  await user.type(screen.getByRole('spinbutton', { name: '{{label}}' }), '{{number}}');
  await user.click(screen.getByRole('button', { name: '{{submit_button_text}}' }));

  // Assert
  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledWith({
      {{field1}}: '{{value1}}',
      {{field2}}: '{{value2}}',
      {{field3}}: {{value3}},
    });
  });
});
```

#### FT01.2. {{Test case: validation errors}}

**Description:** {{Form shows validation errors for invalid input}}

**Test:**
```typescript
it('should show validation errors for empty required fields', async () => {
  // Arrange
  const onSubmit = vi.fn();
  const { user } = renderWithProviders(
    <{{FormComponent}} onSubmit={onSubmit} />
  );

  // Act -- submit without filling required fields
  await user.click(screen.getByRole('button', { name: '{{submit_button_text}}' }));

  // Assert
  expect(await screen.findByText('{{validation_error_message}}')).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});
```

#### FT01.3. {{Test case: field-specific validation}}

**Description:** {{Specific field validation rule}}

**Test:**
```typescript
it('should show error when {{field}} {{violation}}', async () => {
  // Arrange
  const { user } = renderWithProviders(
    <{{FormComponent}} onSubmit={vi.fn()} />
  );

  // Act
  await user.type(screen.getByRole('textbox', { name: '{{label}}' }), '{{invalid_value}}');
  await user.tab(); // trigger blur

  // Assert
  expect(await screen.findByText('{{error_message}}')).toBeInTheDocument();
});
```

#### FT01.4. {{Test case: submit loading state}}

**Description:** {{Button shows loading state during submission}}

**Test:**
```typescript
it('should disable submit button while submitting', async () => {
  // Arrange
  const onSubmit = vi.fn(() => new Promise((resolve) => setTimeout(resolve, 100)));
  const { user } = renderWithProviders(
    <{{FormComponent}} onSubmit={onSubmit} />
  );

  // Act -- fill valid data
  await user.type(screen.getByRole('textbox', { name: '{{label}}' }), '{{valid_value}}');
  await user.click(screen.getByRole('button', { name: '{{submit_button_text}}' }));

  // Assert
  expect(screen.getByRole('button', { name: /{{loading_text}}/i })).toBeDisabled();
});
```

## Integration Tests

### IT01. {{Integration scenario name}}

**Components:** `{{Page/Component1}}`, `{{Component2}}`, `use{{Hook}}`

**Description:** {{Full user flow testing}}

**Test:**
```typescript
it('should {{complete user flow description}}', async () => {
  // Arrange
  const { user } = renderWithProviders(<{{PageComponent}} />);

  // Wait for data to load
  expect(await screen.findByRole('{{role}}', { name: '{{name}}' })).toBeInTheDocument();

  // Act -- step 1: {{action}}
  await user.click(screen.getByRole('button', { name: '{{button_text}}' }));

  // Act -- step 2: {{action}}
  await user.type(screen.getByRole('textbox', { name: '{{label}}' }), '{{value}}');

  // Act -- step 3: {{submit/confirm}}
  await user.click(screen.getByRole('button', { name: '{{submit_text}}' }));

  // Assert -- final state
  await waitFor(() => {
    expect(screen.getByText('{{success_message}}')).toBeInTheDocument();
  });
});
```

### IT02. {{Another integration scenario}}

**Components:** {{Components}}

**Description:** {{Description}}

**Test:**
```typescript
it('should {{behavior}}', async () => {
  // Arrange
  {{setup}}

  // Act
  {{actions}}

  // Assert
  {{assertions}}
});
```

## Accessibility Tests

### AT01. {{Accessibility test group}}

**Component:** `{{ComponentName}}`

#### AT01.1. {{Keyboard navigation}}

**Description:** {{Component is navigable via keyboard}}

**Test:**
```typescript
it('should be navigable with keyboard', async () => {
  // Arrange
  const { user } = renderWithProviders(<{{ComponentName}} {{props}} />);

  // Act
  await user.tab();

  // Assert
  expect(screen.getByRole('{{role}}', { name: '{{name}}' })).toHaveFocus();

  // Act -- continue navigation
  await user.tab();
  expect(screen.getByRole('{{next_role}}', { name: '{{next_name}}' })).toHaveFocus();
});
```

#### AT01.2. {{ARIA attributes}}

**Description:** {{Component has proper ARIA attributes}}

**Test:**
```typescript
it('should have correct ARIA attributes', () => {
  // Arrange
  renderWithProviders(<{{ComponentName}} {{props}} />);

  // Assert
  const element = screen.getByRole('{{role}}');
  expect(element).toHaveAttribute('aria-label', '{{label}}');
  expect(element).toHaveAttribute('aria-{{attribute}}', '{{value}}');
});
```

#### AT01.3. {{Screen reader text}}

**Description:** {{Important content is accessible to screen readers}}

**Test:**
```typescript
it('should provide accessible {{description}} for screen readers', () => {
  // Arrange
  renderWithProviders(<{{ComponentName}} {{props}} />);

  // Assert
  expect(screen.getByRole('{{role}}', { name: '{{accessible_name}}' })).toBeInTheDocument();
});
```

## Edge Cases

### EC01. {{Edge case name}}

**Scenario:** {{Description of edge case}}

**Test:**
```typescript
it('should handle {{edge case}}', async () => {
  // Arrange
  {{setup_for_edge_case}}

  // Act
  {{action}}

  // Assert
  {{assertion}}
});
```

### EC02. {{Network interruption}}

**Scenario:** {{Network fails during data fetch}}

**Test:**
```typescript
it('should show error state on network failure', async () => {
  // Arrange
  server.use(
    http.get('/api/{{entities}}', () => {
      return HttpResponse.error();
    })
  );
  renderWithProviders(<{{ComponentName}} />);

  // Assert
  expect(await screen.findByText(/{{error_pattern}}/i)).toBeInTheDocument();
});
```

### EC03. {{Long content / overflow}}

**Scenario:** {{Content exceeds expected length}}

**Test:**
```typescript
it('should truncate long {{field}} text', () => {
  // Arrange
  const longItem = { ...{{fixture}}, {{field}}: 'A'.repeat(500) };
  renderWithProviders(<{{ComponentName}} item={longItem} />);

  // Assert
  expect(screen.getByText(/A{1,50}/)).toBeInTheDocument(); // truncated
});
```

### EC04. {{Rapid user actions}}

**Scenario:** {{User clicks button multiple times quickly}}

**Test:**
```typescript
it('should not submit multiple times on rapid clicks', async () => {
  // Arrange
  const onSubmit = vi.fn();
  const { user } = renderWithProviders(
    <{{FormComponent}} onSubmit={onSubmit} />
  );

  // Act -- fill form and click submit rapidly
  await user.type(screen.getByRole('textbox', { name: '{{label}}' }), '{{value}}');
  const submitButton = screen.getByRole('button', { name: '{{submit_text}}' });
  await user.click(submitButton);
  await user.click(submitButton);
  await user.click(submitButton);

  // Assert
  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
```

## Test Data Fixtures

### Fixture: {{FixtureName}}

**Purpose:** {{What this fixture represents}}

```typescript
// test/mocks/fixtures/{{entity}}.ts
import type { {{EntityType}} } from '@/types/{{entity}}';

export const {{fixtureName}}: {{EntityType}} = {
  id: '{{mock_id}}',
  {{field1}}: '{{value1}}',
  {{field2}}: {{value2}},
  {{field3}}: '{{value3}}',
  createdAt: '{{ISO_date}}',
  updatedAt: '{{ISO_date}}',
};

export const {{fixtureListName}}: {{EntityType}}[] = [
  {{fixtureName}},
  {
    id: '{{mock_id_2}}',
    {{field1}}: '{{value1_2}}',
    {{field2}}: {{value2_2}},
    {{field3}}: '{{value3_2}}',
    createdAt: '{{ISO_date}}',
    updatedAt: '{{ISO_date}}',
  },
];
```

### Fixture: {{AnotherFixture}}

```typescript
export const {{name}}: {{Type}} = {{fixture_definition}};
```

## Coverage Requirements

| Metric | Minimum | Target |
|--------|---------|--------|
| Statements | {{N}}% | {{M}}% |
| Branches | {{N}}% | {{M}}% |
| Functions | {{N}}% | {{M}}% |
| Lines | {{N}}% | {{M}}% |

## Test Execution Order

1. Component Tests (CT*) - Isolated component rendering and interactions
2. Hook Tests (HT*) - Custom hook behavior with mocked API
3. Form Tests (FT*) - Form validation, submission, error display
4. Integration Tests (IT*) - Full page flows with multiple components
5. Accessibility Tests (AT*) - Keyboard navigation, ARIA, screen readers
6. Edge Cases (EC*) - Network errors, overflow, rapid actions

## SA References (For Human Review Only)

- Use Case: {{path_to_usecase}}
- Requirements: {{path_to_requirements}}
- Entity: {{path_to_entity}}
- UI Mockup: {{path_to_mockup}}
```

## Test ID Conventions

| Prefix | Type | Example |
|--------|------|---------|
| CT | Component Test | CT01.1 |
| HT | Hook Test | HT01.1 |
| FT | Form Test | FT01.1 |
| IT | Integration Test | IT01 |
| AT | Accessibility Test | AT01.1 |
| EC | Edge Case | EC01 |

## Status Values Reference

| Status | Meaning |
|--------|---------|
| `pending` | Tests not written |
| `red` | Tests written, failing |
| `green` | Tests passing |
| `complete` | All tests verified |

## Quality Checklist

Before committing a test-spec-fe.md file, verify:

- [ ] Frontmatter complete (task_id, title, status, test_framework)
- [ ] MSW handlers defined for all API endpoints used
- [ ] Component tests cover rendering, interactions, conditional rendering
- [ ] Hook tests cover data fetching, mutations, error handling
- [ ] Form tests cover submission, validation errors, loading states
- [ ] Integration tests cover full user flows
- [ ] Accessibility tests cover keyboard navigation and ARIA
- [ ] Edge cases: network errors, overflow, rapid actions
- [ ] Test fixtures defined with proper TypeScript types
- [ ] All tests use RTL patterns: screen.getByRole, user-event, waitFor
- [ ] Coverage requirements specified
- [ ] NO external references for dev agent (SA refs for humans only)
