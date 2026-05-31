# Acceptance Criteria — UC001 (backend)

## Functional

- FC01: `GET /orders/:id` returns the matching order.
- FC02: `GET /orders/:id` returns `null` when no order matches.
- FC03: `GET /orders` returns orders ordered by `created_at` descending.
- FC04: `GET /orders` applies a default limit of 50 when none is supplied.
- FC05: `DELETE /orders/:id` removes the order.
- FC06: `computeTotal` returns the sum of `price * qty` across line items (0 for an empty list).

## Security

- SC01: Every route requires an authenticated caller (enforced by `AuthGuard`).
- SC02: All database access uses parameterized queries — no user input is interpolated
  into SQL strings.

## Error Handling

- EH01: A missing order id yields `null`, not an exception.
