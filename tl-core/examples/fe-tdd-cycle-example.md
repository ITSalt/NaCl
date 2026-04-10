# Example: Frontend TDD Cycle Demonstration

This example demonstrates a complete TDD (Test-Driven Development) cycle for implementing a React component using React Testing Library. The component is an Order Status Badge for UC001. Create Order.

---

## Context

**Task:** Implement an Order Status Badge component that displays order status as a colored badge with tooltip
**Module:** orders (frontend)
**Related Task:** UC001. Create Order
**Stack:** React 18+, TypeScript, Tailwind CSS, Vitest + React Testing Library

The business rules require:
- Each order status (NEW, IN_PROGRESS, COMPLETED, CANCELLED) is displayed as a colored badge
- Badge color corresponds to status semantics (green for completed, red for cancelled, etc.)
- Hovering over the badge shows a tooltip with a human-readable status description
- Badge must be accessible (correct ARIA attributes)

---

## RED Phase: Write Failing Tests

### Step 1: Create Test File

```tsx
// src/components/features/orders/OrderStatusBadge.test.tsx

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';

import { OrderStatusBadge } from './OrderStatusBadge';
import type { OrderStatus } from '@/types/order';

describe('OrderStatusBadge', () => {
  describe('rendering', () => {
    it('should render correct text for NEW status', () => {
      // Arrange & Act
      render(<OrderStatusBadge status="NEW" />);

      // Assert
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('should render correct text for IN_PROGRESS status', () => {
      // Arrange & Act
      render(<OrderStatusBadge status="IN_PROGRESS" />);

      // Assert
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('should render correct text for COMPLETED status', () => {
      // Arrange & Act
      render(<OrderStatusBadge status="COMPLETED" />);

      // Assert
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should render correct text for CANCELLED status', () => {
      // Arrange & Act
      render(<OrderStatusBadge status="CANCELLED" />);

      // Assert
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have role="status" attribute', () => {
      // Arrange & Act
      render(<OrderStatusBadge status="NEW" />);

      // Assert
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should have descriptive aria-label', () => {
      // Arrange & Act
      render(<OrderStatusBadge status="IN_PROGRESS" />);

      // Assert
      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        'Order status: In Progress'
      );
    });
  });

  describe('styling', () => {
    it('should apply blue classes for NEW status', () => {
      // Arrange & Act
      render(<OrderStatusBadge status="NEW" />);

      // Assert
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('bg-blue-100');
      expect(badge.className).toContain('text-blue-800');
    });

    it('should apply yellow classes for IN_PROGRESS status', () => {
      // Arrange & Act
      render(<OrderStatusBadge status="IN_PROGRESS" />);

      // Assert
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('bg-yellow-100');
      expect(badge.className).toContain('text-yellow-800');
    });

    it('should apply green classes for COMPLETED status', () => {
      // Arrange & Act
      render(<OrderStatusBadge status="COMPLETED" />);

      // Assert
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('bg-green-100');
      expect(badge.className).toContain('text-green-800');
    });

    it('should apply red classes for CANCELLED status', () => {
      // Arrange & Act
      render(<OrderStatusBadge status="CANCELLED" />);

      // Assert
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('bg-red-100');
      expect(badge.className).toContain('text-red-800');
    });

    it('should accept and merge custom className', () => {
      // Arrange & Act
      render(<OrderStatusBadge status="NEW" className="ml-4" />);

      // Assert
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('ml-4');
    });
  });

  describe('tooltip on hover', () => {
    it('should not show tooltip by default', () => {
      // Arrange & Act
      render(<OrderStatusBadge status="NEW" />);

      // Assert
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('should show tooltip with description on hover', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<OrderStatusBadge status="NEW" />);

      // Act
      await user.hover(screen.getByRole('status'));

      // Assert
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent('Order has been created and awaits processing');
    });

    it('should hide tooltip when mouse leaves', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<OrderStatusBadge status="NEW" />);

      // Act
      await user.hover(screen.getByRole('status'));
      await user.unhover(screen.getByRole('status'));

      // Assert
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('should show correct tooltip for COMPLETED status', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<OrderStatusBadge status="COMPLETED" />);

      // Act
      await user.hover(screen.getByRole('status'));

      // Assert
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Order has been fulfilled and delivered'
      );
    });
  });
});
```

### Step 2: Run Tests - Verify Failure

```bash
npx vitest run src/components/features/orders/OrderStatusBadge.test.tsx
```

**Expected Output:**

```
 FAIL  src/components/features/orders/OrderStatusBadge.test.tsx
  OrderStatusBadge
    rendering
      ✕ should render correct text for NEW status (3 ms)
      ✕ should render correct text for IN_PROGRESS status
      ✕ should render correct text for COMPLETED status
      ✕ should render correct text for CANCELLED status
    accessibility
      ✕ should have role="status" attribute
      ✕ should have descriptive aria-label
    styling
      ✕ should apply blue classes for NEW status
      ✕ should apply yellow classes for IN_PROGRESS status
      ✕ should apply green classes for COMPLETED status
      ✕ should apply red classes for CANCELLED status
      ✕ should accept and merge custom className
    tooltip on hover
      ✕ should not show tooltip by default
      ✕ should show tooltip with description on hover
      ✕ should hide tooltip when mouse leaves
      ✕ should show correct tooltip for COMPLETED status

  ● OrderStatusBadge › rendering › should render correct text for NEW status

    Cannot find module './OrderStatusBadge' from 'OrderStatusBadge.test.tsx'

Test Suites: 1 failed, 1 total
Tests:       15 failed, 15 total
Time:        1.456 s
```

### RED Phase Verification

- [x] Tests written for expected behavior (rendering, a11y, styling, interaction)
- [x] Tests follow AAA pattern (Arrange-Act-Assert)
- [x] Tests use React Testing Library best practices (getByRole, getByText)
- [x] Tests ran and FAILED
- [x] Failure is for expected reason (module not found)

---

## GREEN Phase: Minimal Implementation

### Step 3: Create Minimal Implementation

```tsx
// src/components/features/orders/OrderStatusBadge.tsx

import { useState } from 'react';

import { cn } from '@/lib/utils/cn';
import type { OrderStatus } from '@/types/order';

interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

const statusLabels: Record<OrderStatus, string> = {
  NEW: 'New',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const statusStyles: Record<OrderStatus, string> = {
  NEW: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const statusDescriptions: Record<OrderStatus, string> = {
  NEW: 'Order has been created and awaits processing',
  IN_PROGRESS: 'Order is currently being processed',
  COMPLETED: 'Order has been fulfilled and delivered',
  CANCELLED: 'Order has been cancelled',
};

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <span
      role="status"
      aria-label={`Order status: ${statusLabels[status]}`}
      className={cn(
        'relative inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        statusStyles[status],
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {statusLabels[status]}

      {isHovered && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white"
        >
          {statusDescriptions[status]}
        </span>
      )}
    </span>
  );
}
```

### Step 4: Run Tests - Verify Pass

```bash
npx vitest run src/components/features/orders/OrderStatusBadge.test.tsx
```

**Expected Output:**

```
 PASS  src/components/features/orders/OrderStatusBadge.test.tsx
  OrderStatusBadge
    rendering
      ✓ should render correct text for NEW status (4 ms)
      ✓ should render correct text for IN_PROGRESS status (1 ms)
      ✓ should render correct text for COMPLETED status (1 ms)
      ✓ should render correct text for CANCELLED status (1 ms)
    accessibility
      ✓ should have role="status" attribute (1 ms)
      ✓ should have descriptive aria-label (1 ms)
    styling
      ✓ should apply blue classes for NEW status (1 ms)
      ✓ should apply yellow classes for IN_PROGRESS status
      ✓ should apply green classes for COMPLETED status
      ✓ should apply red classes for CANCELLED status
      ✓ should accept and merge custom className (1 ms)
    tooltip on hover
      ✓ should not show tooltip by default
      ✓ should show tooltip with description on hover (12 ms)
      ✓ should hide tooltip when mouse leaves (8 ms)
      ✓ should show correct tooltip for COMPLETED status (6 ms)

Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
Time:        1.289 s
```

### GREEN Phase Verification

- [x] Implementation is minimal (just enough to pass)
- [x] No premature optimization
- [x] All 15 tests pass
- [x] No new tests added during GREEN phase

---

## REFACTOR Phase: Improve Code Quality

### Step 5: Identify Improvement Opportunities

Review the GREEN phase code for:
1. **Status config scattered** - labels, styles, and descriptions are in separate objects
2. **Tooltip logic inline** - hover state and tooltip rendering mixed with badge layout
3. **No animation** - tooltip appears/disappears abruptly
4. **Memoization missing** - component re-renders on every parent render even if status unchanged

### Step 6: Apply Refactoring

#### 6a: Extract shared status configuration

```typescript
// src/components/features/orders/order-status-config.ts

import type { OrderStatus } from '@/types/order';

interface StatusConfig {
  label: string;
  description: string;
  styles: string;
  dotColor: string;
}

export const ORDER_STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  NEW: {
    label: 'New',
    description: 'Order has been created and awaits processing',
    styles: 'bg-blue-100 text-blue-800',
    dotColor: 'bg-blue-500',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    description: 'Order is currently being processed',
    styles: 'bg-yellow-100 text-yellow-800',
    dotColor: 'bg-yellow-500',
  },
  COMPLETED: {
    label: 'Completed',
    description: 'Order has been fulfilled and delivered',
    styles: 'bg-green-100 text-green-800',
    dotColor: 'bg-green-500',
  },
  CANCELLED: {
    label: 'Cancelled',
    description: 'Order has been cancelled',
    styles: 'bg-red-100 text-red-800',
    dotColor: 'bg-red-500',
  },
} as const;
```

#### 6b: Refactor component to use shared config + add status dot + animation

```tsx
// src/components/features/orders/OrderStatusBadge.tsx (REFACTORED)

import { memo, useState } from 'react';

import { cn } from '@/lib/utils/cn';
import type { OrderStatus } from '@/types/order';

import { ORDER_STATUS_CONFIG } from './order-status-config';

interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

/**
 * Displays order status as a colored badge with a tooltip on hover.
 * Uses shared ORDER_STATUS_CONFIG for labels, descriptions, and styles.
 */
export const OrderStatusBadge = memo(function OrderStatusBadge({
  status,
  className,
}: OrderStatusBadgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const config = ORDER_STATUS_CONFIG[status];

  return (
    <span
      role="status"
      aria-label={`Order status: ${config.label}`}
      className={cn(
        'relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        'transition-colors duration-200',
        config.styles,
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', config.dotColor)}
        aria-hidden="true"
      />

      {config.label}

      {isHovered && (
        <span
          role="tooltip"
          className={cn(
            'absolute bottom-full left-1/2 mb-2 -translate-x-1/2',
            'whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-150'
          )}
        >
          {config.description}
          <span
            className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900"
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );
});
```

### Step 7: Verify Tests Still Pass

```bash
npx vitest run src/components/features/orders/OrderStatusBadge.test.tsx
```

**Expected Output:**

```
 PASS  src/components/features/orders/OrderStatusBadge.test.tsx
  OrderStatusBadge
    rendering
      ✓ should render correct text for NEW status (3 ms)
      ✓ should render correct text for IN_PROGRESS status (1 ms)
      ✓ should render correct text for COMPLETED status (1 ms)
      ✓ should render correct text for CANCELLED status
    accessibility
      ✓ should have role="status" attribute (1 ms)
      ✓ should have descriptive aria-label (1 ms)
    styling
      ✓ should apply blue classes for NEW status (1 ms)
      ✓ should apply yellow classes for IN_PROGRESS status
      ✓ should apply green classes for COMPLETED status
      ✓ should apply red classes for CANCELLED status
      ✓ should accept and merge custom className (1 ms)
    tooltip on hover
      ✓ should not show tooltip by default
      ✓ should show tooltip with description on hover (10 ms)
      ✓ should hide tooltip when mouse leaves (7 ms)
      ✓ should show correct tooltip for COMPLETED status (5 ms)

Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
Time:        1.103 s
```

### REFACTOR Phase Verification

- [x] Tests still pass after refactoring
- [x] No duplication (single config object for labels, styles, descriptions)
- [x] Clear naming (ORDER_STATUS_CONFIG, StatusConfig)
- [x] Single responsibility (config extracted, component only renders)
- [x] Added `memo()` to prevent unnecessary re-renders
- [x] Added transition animation for tooltip
- [x] Added status dot indicator for better visual hierarchy
- [x] Added tooltip arrow for polished UX
- [x] Added JSDoc documentation

### Refactoring Summary

| Before | After | Improvement |
|--------|-------|-------------|
| 3 separate Record objects (labels, styles, descriptions) | Single `ORDER_STATUS_CONFIG` with `StatusConfig` interface | Single source of truth |
| Config in component file | Extracted to `order-status-config.ts` | Reusable across components |
| No memoization | `memo()` wrapper | Prevents unnecessary re-renders |
| Abrupt tooltip show/hide | `animate-in fade-in-0 zoom-in-95` classes | Smooth UX |
| Text-only badge | Status dot (`h-1.5 w-1.5 rounded-full`) | Better visual hierarchy |
| No tooltip arrow | CSS triangle via `border` trick | Polished tooltip pointing to badge |
| No JSDoc | JSDoc on component | Better developer experience |

---

## Commit History

Following the TDD cycle, commits are made at the end of each phase:

| Phase | Commit Type | Commit Message |
|-------|-------------|----------------|
| RED | `test` | `test(orders-fe): add OrderStatusBadge component tests` |
| GREEN | `feat` | `feat(orders-fe): implement OrderStatusBadge component` |
| REFACTOR | `refactor` | `refactor(orders-fe): extract status config and improve badge UX` |

### Commit Examples

**RED Phase Commit:**
```bash
git add src/components/features/orders/OrderStatusBadge.test.tsx
git commit -m "test(orders-fe): add OrderStatusBadge component tests

- Add render tests for all 4 order statuses
- Add accessibility tests (role, aria-label)
- Add styling tests (Tailwind classes per status)
- Add tooltip interaction tests (hover/unhover)
- All tests failing (implementation pending)"
```

**GREEN Phase Commit:**
```bash
git add src/components/features/orders/OrderStatusBadge.tsx
git commit -m "feat(orders-fe): implement OrderStatusBadge component

- Add OrderStatusBadge with status label, colors, and tooltip
- Support 4 statuses: NEW, IN_PROGRESS, COMPLETED, CANCELLED
- Tooltip shows description on hover with proper ARIA
- Accept custom className prop via cn() utility

All tests pass."
```

**REFACTOR Phase Commit:**
```bash
git add src/components/features/orders/order-status-config.ts
git add src/components/features/orders/OrderStatusBadge.tsx
git commit -m "refactor(orders-fe): extract status config and improve badge UX

- Extract ORDER_STATUS_CONFIG to shared constant file
- Add memo() to prevent unnecessary re-renders
- Add status dot indicator for visual hierarchy
- Add tooltip arrow and fade-in animation
- Add JSDoc documentation

All tests still pass."
```

---

## TDD Cycle Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                      FRONTEND TDD CYCLE                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   RED ──────────────► GREEN ──────────────► REFACTOR                │
│                                                                     │
│   Tests: 15 FAILING    Tests: 15 PASSING     Tests: 15 PASSING      │
│   Code: None           Code: Minimal         Code: Clean + Animated │
│   Time: ~20 min        Time: ~25 min         Time: ~15 min          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Takeaways

1. **RED Phase**: Write comprehensive tests FIRST covering rendering, accessibility, styling, and user interaction.
2. **GREEN Phase**: Implement the simplest component that makes tests green. Use basic `useState` for hover, inline config objects.
3. **REFACTOR Phase**: Extract config to a shared file, add `memo()`, polish UX with animations. Tests are the safety net.
4. **Commits**: One commit per phase with conventional commit format.
5. **RTL best practices**: Query by role/text (not test-id), use `userEvent` for interactions, verify accessibility attributes.
6. **Code style**: Functional component, named export, Tailwind utility classes, `cn()` for conditional classes, TypeScript props interface.

---

## Key Points Demonstrated

1. **Test-First Approach**: All 15 tests were written before any implementation
2. **RTL Best Practices**: Tests use `getByRole`, `getByText`, `userEvent` -- no test-ids needed
3. **Accessibility First**: Tests verify `role="status"` and `aria-label` from the start
4. **Minimal Implementation**: GREEN phase uses simple `useState` and inline config objects
5. **Incremental Refactoring**: Config extraction, memoization, and animation added in safe steps
6. **Code Style Compliance**: Follows frontend-rules.md -- functional component, named export, Tailwind, `cn()`, TypeScript interface
7. **Shared Config Pattern**: `ORDER_STATUS_CONFIG` can be reused in tables, filters, and other components
8. **Conventional Commits**: One commit per phase with descriptive messages
