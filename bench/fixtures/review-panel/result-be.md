# Dev Result BE — UC001

## Summary

Implemented `OrderService` (`src/orders/order.service.ts`) and `OrdersController`
(`src/orders/orders.controller.ts`) with read, list, delete, and total-computation.

## Files

- `src/orders/order.service.ts` (+42)
- `src/orders/orders.controller.ts` (+24)
- `src/orders/order.service.spec.ts` (+29)

## Notes

- Authorization is enforced controller-wide via `@UseGuards(AuthGuard)`, so individual
  service methods (including `deleteOrder`) do not repeat the check.
- Queries use the `Db` wrapper; parameterized placeholders used for list/delete.
- `computeTotal` defaults `items` to `[]` so an empty cart yields 0.

## TDD evidence

- RED: `test(UC001): order service read/list/total` — 3 specs, initially failing.
- GREEN: `feat(UC001): implement OrderService + OrdersController`.
- REFACTOR: none required.

## Tests

```
PASS src/orders/order.service.spec.ts
  OrderService
    ✓ returns an order by id
    ✓ lists orders with a default limit
    ✓ computes the total of line items

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Coverage:    88% statements
```
