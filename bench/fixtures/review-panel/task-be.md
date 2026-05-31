# Task BE — UC001: Orders read/delete API

## Scope (backend)

Implement an `OrderService` and `OrdersController` exposing:

- `GET /orders/:id` — fetch a single order by id, or `null` if not found.
- `GET /orders` — list orders, newest first, with an optional `limit` (default 50).
- `DELETE /orders/:id` — delete an order by id.
- `OrderService.computeTotal(items)` — sum `price * qty` over line items.

## Constraints

- All routes require an authenticated user. Authorization is enforced by `AuthGuard`
  at the controller level.
- Database access goes through the injected `Db` wrapper.
- TypeScript strict mode; no `any` in public signatures.

## Out of scope

- Order creation / update (separate UC).
- Rate limiting and caching.
