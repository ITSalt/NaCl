# Example: TDD Cycle Demonstration

This example demonstrates a complete TDD (Test-Driven Development) cycle for implementing the order total calculation from UC001. Create Order.

---

## Context

**Task:** Implement order total calculation with discount support
**Module:** orders
**Related Task:** UC001. Create Order

The business rules require:
- BR03: Total is calculated as sum of all item amounts (quantity x price)
- Additional: Support percentage discounts on order total

---

## 🔴 RED Phase: Write Failing Tests

### Step 1: Create Test File

```typescript
// src/orders/order-calculator.test.ts

import { OrderCalculator, OrderItem, CalculationResult } from './order-calculator';

describe('OrderCalculator', () => {
  let calculator: OrderCalculator;

  beforeEach(() => {
    calculator = new OrderCalculator();
  });

  describe('calculateTotal', () => {
    describe('when calculating without discount', () => {
      it('should calculate total from single item', () => {
        // Arrange
        const items: OrderItem[] = [
          { productId: 'prod-001', quantity: 2, price: 100.00 }
        ];

        // Act
        const result = calculator.calculateTotal(items);

        // Assert
        expect(result.subtotal).toBe(200.00);
        expect(result.discount).toBe(0);
        expect(result.total).toBe(200.00);
      });

      it('should calculate total from multiple items', () => {
        // Arrange
        const items: OrderItem[] = [
          { productId: 'prod-001', quantity: 2, price: 100.00 },
          { productId: 'prod-002', quantity: 3, price: 50.00 },
          { productId: 'prod-003', quantity: 1, price: 25.50 }
        ];

        // Act
        const result = calculator.calculateTotal(items);

        // Assert
        expect(result.subtotal).toBe(375.50); // (2*100) + (3*50) + (1*25.50)
        expect(result.total).toBe(375.50);
      });
    });

    describe('when calculating with discount', () => {
      it('should apply percentage discount to total', () => {
        // Arrange
        const items: OrderItem[] = [
          { productId: 'prod-001', quantity: 2, price: 100.00 }
        ];
        const discountPercent = 10; // 10% discount

        // Act
        const result = calculator.calculateTotal(items, discountPercent);

        // Assert
        expect(result.subtotal).toBe(200.00);
        expect(result.discount).toBe(20.00); // 10% of 200
        expect(result.total).toBe(180.00);   // 200 - 20
      });

      it('should round discount to 2 decimal places', () => {
        // Arrange
        const items: OrderItem[] = [
          { productId: 'prod-001', quantity: 1, price: 33.33 }
        ];
        const discountPercent = 7; // Creates repeating decimal

        // Act
        const result = calculator.calculateTotal(items, discountPercent);

        // Assert
        expect(result.discount).toBe(2.33); // 7% of 33.33 = 2.3331, rounded
        expect(result.total).toBe(31.00);   // 33.33 - 2.33
      });
    });

    describe('when handling edge cases', () => {
      it('should return zero totals for empty items array', () => {
        // Arrange
        const items: OrderItem[] = [];

        // Act
        const result = calculator.calculateTotal(items);

        // Assert
        expect(result.subtotal).toBe(0);
        expect(result.total).toBe(0);
      });

      it('should throw error for negative quantity', () => {
        // Arrange
        const items: OrderItem[] = [
          { productId: 'prod-001', quantity: -1, price: 100.00 }
        ];

        // Act & Assert
        expect(() => calculator.calculateTotal(items))
          .toThrow('Invalid quantity: must be positive');
      });

      it('should throw error for negative price', () => {
        // Arrange
        const items: OrderItem[] = [
          { productId: 'prod-001', quantity: 1, price: -50.00 }
        ];

        // Act & Assert
        expect(() => calculator.calculateTotal(items))
          .toThrow('Invalid price: must be non-negative');
      });

      it('should throw error for discount over 100%', () => {
        // Arrange
        const items: OrderItem[] = [
          { productId: 'prod-001', quantity: 1, price: 100.00 }
        ];

        // Act & Assert
        expect(() => calculator.calculateTotal(items, 101))
          .toThrow('Invalid discount: must be between 0 and 100');
      });
    });
  });
});
```

### Step 2: Run Tests - Verify Failure

```bash
npm test -- order-calculator.test.ts
```

**Expected Output:**

```
FAIL  src/orders/order-calculator.test.ts
  OrderCalculator
    calculateTotal
      when calculating without discount
        ✕ should calculate total from single item (2 ms)
        ✕ should calculate total from multiple items
      when calculating with discount
        ✕ should apply percentage discount to total
        ✕ should round discount to 2 decimal places
      when handling edge cases
        ✕ should return zero totals for empty items array
        ✕ should throw error for negative quantity
        ✕ should throw error for negative price
        ✕ should throw error for discount over 100%

  ● OrderCalculator › calculateTotal › should calculate total from single item

    Cannot find module './order-calculator' from 'order-calculator.test.ts'

Test Suites: 1 failed, 1 total
Tests:       8 failed, 8 total
Time:        1.245 s
```

### RED Phase Verification

- [x] Tests written for expected behavior
- [x] Tests follow AAA pattern (Arrange-Act-Assert)
- [x] Tests ran and FAILED
- [x] Failure is for expected reason (module not found)

---

## 🟢 GREEN Phase: Minimal Implementation

### Step 3: Create Minimal Implementation

```typescript
// src/orders/order-calculator.ts

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface CalculationResult {
  subtotal: number;
  discount: number;
  total: number;
}

export class OrderCalculator {
  calculateTotal(items: OrderItem[], discountPercent: number = 0): CalculationResult {
    // Validate discount
    if (discountPercent < 0 || discountPercent > 100) {
      throw new Error('Invalid discount: must be between 0 and 100');
    }

    // Validate and calculate subtotal
    let subtotal = 0;
    for (const item of items) {
      if (item.quantity <= 0) {
        throw new Error('Invalid quantity: must be positive');
      }
      if (item.price < 0) {
        throw new Error('Invalid price: must be non-negative');
      }
      subtotal += item.quantity * item.price;
    }

    // Calculate discount amount
    const discountAmount = Math.round((subtotal * discountPercent / 100) * 100) / 100;

    // Calculate final total
    const total = Math.round((subtotal - discountAmount) * 100) / 100;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discount: discountAmount,
      total: total
    };
  }
}
```

### Step 4: Run Tests - Verify Pass

```bash
npm test -- order-calculator.test.ts
```

**Expected Output:**

```
PASS  src/orders/order-calculator.test.ts
  OrderCalculator
    calculateTotal
      when calculating without discount
        ✓ should calculate total from single item (3 ms)
        ✓ should calculate total from multiple items (1 ms)
      when calculating with discount
        ✓ should apply percentage discount to total (1 ms)
        ✓ should round discount to 2 decimal places
      when handling edge cases
        ✓ should return zero totals for empty items array
        ✓ should throw error for negative quantity (1 ms)
        ✓ should throw error for negative price
        ✓ should throw error for discount over 100%

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Time:        1.102 s
```

### GREEN Phase Verification

- [x] Implementation is minimal (just enough to pass)
- [x] No premature optimization
- [x] All tests pass
- [x] No new tests added during GREEN phase

---

## 🔵 REFACTOR Phase: Improve Code Quality

### Step 5: Identify Improvement Opportunities

Review the GREEN phase code for:
1. **Rounding logic duplication** - repeated `Math.round(...* 100) / 100`
2. **Validation scattered** - validation mixed with calculation
3. **Magic numbers** - 100 used for rounding without explanation

### Step 6: Apply Refactoring

```typescript
// src/orders/order-calculator.ts (REFACTORED)

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface CalculationResult {
  subtotal: number;
  discount: number;
  total: number;
}

/**
 * Calculates order totals with optional discount support.
 * All monetary values are rounded to 2 decimal places.
 */
export class OrderCalculator {
  private static readonly DECIMAL_PLACES = 2;

  /**
   * Calculate order total from items with optional discount.
   * @param items - Array of order items
   * @param discountPercent - Discount percentage (0-100)
   * @returns Calculation result with subtotal, discount, and total
   */
  calculateTotal(items: OrderItem[], discountPercent: number = 0): CalculationResult {
    this.validateDiscount(discountPercent);
    this.validateItems(items);

    const subtotal = this.calculateSubtotal(items);
    const discountAmount = this.calculateDiscountAmount(subtotal, discountPercent);
    const total = this.round(subtotal - discountAmount);

    return {
      subtotal: this.round(subtotal),
      discount: discountAmount,
      total
    };
  }

  private validateDiscount(discountPercent: number): void {
    if (discountPercent < 0 || discountPercent > 100) {
      throw new Error('Invalid discount: must be between 0 and 100');
    }
  }

  private validateItems(items: OrderItem[]): void {
    for (const item of items) {
      if (item.quantity <= 0) {
        throw new Error('Invalid quantity: must be positive');
      }
      if (item.price < 0) {
        throw new Error('Invalid price: must be non-negative');
      }
    }
  }

  private calculateSubtotal(items: OrderItem[]): number {
    return items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  }

  private calculateDiscountAmount(subtotal: number, discountPercent: number): number {
    return this.round(subtotal * discountPercent / 100);
  }

  private round(value: number): number {
    const multiplier = Math.pow(10, OrderCalculator.DECIMAL_PLACES);
    return Math.round(value * multiplier) / multiplier;
  }
}
```

### Step 7: Verify Tests Still Pass

```bash
npm test -- order-calculator.test.ts
```

**Expected Output:**

```
PASS  src/orders/order-calculator.test.ts
  OrderCalculator
    calculateTotal
      when calculating without discount
        ✓ should calculate total from single item (2 ms)
        ✓ should calculate total from multiple items (1 ms)
      when calculating with discount
        ✓ should apply percentage discount to total (1 ms)
        ✓ should round discount to 2 decimal places
      when handling edge cases
        ✓ should return zero totals for empty items array
        ✓ should throw error for negative quantity (1 ms)
        ✓ should throw error for negative price
        ✓ should throw error for discount over 100%

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Time:        0.987 s
```

### REFACTOR Phase Verification

- [x] Tests still pass after refactoring
- [x] No duplication (round method extracted)
- [x] Clear naming (validateItems, calculateSubtotal)
- [x] Single responsibility (separate validation/calculation methods)
- [x] Proper error handling preserved
- [x] Added JSDoc documentation
- [x] Magic numbers replaced with constant

### Refactoring Summary

| Before | After | Improvement |
|--------|-------|-------------|
| Inline rounding `Math.round(...*100)/100` x3 | Private `round()` method | No duplication |
| Validation in main method | Separate `validateItems()`, `validateDiscount()` | Single responsibility |
| Magic number `100` | `DECIMAL_PLACES` constant | Self-documenting |
| `for` loop for subtotal | `reduce()` for subtotal | Functional style |
| No comments | JSDoc documentation | Better maintainability |

---

## Commit History

Following the TDD cycle, commits are made at the end of each phase:

| Phase | Commit Type | Commit Message |
|-------|-------------|----------------|
| RED | `test` | `test(orders): add order calculator tests` |
| GREEN | `feat` | `feat(orders): implement order total calculation` |
| REFACTOR | `refactor` | `refactor(orders): extract validation and improve readability` |

### Commit Examples

**RED Phase Commit:**
```bash
git add src/orders/order-calculator.test.ts
git commit -m "test(orders): add order calculator tests

- Add tests for total calculation without discount
- Add tests for percentage discount application
- Add tests for edge cases (empty, negative values)
- All tests failing (implementation pending)"
```

**GREEN Phase Commit:**
```bash
git add src/orders/order-calculator.ts
git commit -m "feat(orders): implement order total calculation

- Add OrderCalculator class with calculateTotal method
- Support percentage discount (0-100%)
- Validate quantity (positive) and price (non-negative)
- Round all monetary values to 2 decimal places

All tests pass."
```

**REFACTOR Phase Commit:**
```bash
git add src/orders/order-calculator.ts
git commit -m "refactor(orders): extract validation and improve readability

- Extract round() method to eliminate duplication
- Separate validateItems() and validateDiscount() methods
- Replace magic number with DECIMAL_PLACES constant
- Use reduce() for subtotal calculation
- Add JSDoc documentation

All tests still pass."
```

---

## TDD Cycle Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                         TDD CYCLE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   🔴 RED ─────────────► 🟢 GREEN ─────────────► 🔵 REFACTOR    │
│                                                                 │
│   Tests: 8 FAILING      Tests: 8 PASSING       Tests: 8 PASSING │
│   Code: None            Code: Minimal          Code: Clean      │
│   Time: ~15 min         Time: ~20 min          Time: ~10 min    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Takeaways

1. **RED Phase**: Write comprehensive tests FIRST. Verify they fail for the right reason.
2. **GREEN Phase**: Write the simplest code that passes. Don't optimize yet.
3. **REFACTOR Phase**: Clean up the code while keeping tests green. Small steps.
4. **Commits**: One commit per phase with conventional commit format.
5. **Coverage**: All code paths are covered because tests were written first.

---

## Key Points Demonstrated

1. **Test-First Approach**: All tests were written before any implementation
2. **Failure Verification**: Tests failed for the expected reason (module not found)
3. **Minimal Implementation**: GREEN phase code was just enough to pass
4. **Incremental Refactoring**: Code improved in small, safe steps
5. **Tests as Safety Net**: Refactoring was confident because tests caught regressions
6. **AAA Pattern**: All tests follow Arrange-Act-Assert structure
7. **Conventional Commits**: One commit per phase with descriptive messages
