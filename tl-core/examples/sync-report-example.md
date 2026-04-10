# Example: Sync Report (tl-sync)

This example demonstrates the complete `sync-report.md` as it would appear in `.tl/tasks/UC001/sync-report.md` after `tl-sync` verifies synchronization between BE and FE implementations.

**Scenario**: UC001 (Create Order) -- backend is implemented, frontend is implemented, now `tl-sync` checks that both sides are in sync with the API contract.

---

## Контекст

```
tl-plan --> tl-dev-be UC001 --> tl-dev-fe UC001 --> tl-sync UC001
                                                        ^
                                                   МЫ ЗДЕСЬ
```

### Входные файлы

| Файл | Описание |
|------|----------|
| `.tl/tasks/UC001/api-contract.md` | API-контракт (3 эндпоинта) |
| `.tl/tasks/UC001/result-be.md` | Результат BE-разработки |
| `.tl/tasks/UC001/result-fe.md` | Результат FE-разработки |
| `src/backend/orders/order.controller.ts` | BE: маршруты |
| `src/backend/orders/order.service.ts` | BE: бизнес-логика |
| `src/backend/orders/dto/create-order.dto.ts` | BE: DTO |
| `src/frontend/features/orders/api/orderApi.ts` | FE: API-клиент |
| `src/frontend/features/orders/hooks/useCreateOrder.ts` | FE: хук создания |
| `src/shared/types/order.types.ts` | Shared-типы |

---

## Полный sync-report.md

Ниже -- полный файл, который `tl-sync` создаёт в `.tl/tasks/UC001/sync-report.md`:

```markdown
---
task_id: UC001
title: "Sync Report: Create Order"
generated_by: tl-sync
generated_at: 2025-01-31T14:30:00Z
api_contract_version: 1
verdict: PASS_WITH_WARNINGS
stats:
  total_checks: 14
  passed: 12
  failed: 0
  warnings: 2
---

# Sync Report: UC001 Create Order

## Summary

**Verdict**: PASS_WITH_WARNINGS
**API Contract Version**: 1
**Checks**: 12 passed, 0 failed, 2 warnings

```
 Результат синхронизации
 ========================

 Эндпоинты:    3 проверено, 3 в синхронизации
 Типы:         5 проверено, 4 совпадают, 1 WARNING
 Ошибки:       7 кодов проверено, 6 обработаны, 1 WARNING
 Mock-остатки: 0 найдено
 Auth Flow:    все эндпоинты защищены

 Итог: Можно передавать в tl-review (нет BLOCKER)
```

---

## 1. Contract Compliance (Соответствие контракту)

Проверка: каждый эндпоинт из api-contract.md существует в BE и вызывается из FE.

### POST /api/orders

| Проверка | Contract | BE Code | FE Code | Результат |
|----------|----------|---------|---------|-----------|
| HTTP метод | POST | `router.post(...)` | `api.post(...)` | PASS |
| Path | `/api/orders` | `order.controller.ts:25` | `orderApi.ts:14` | PASS |
| Request Type | `CreateOrderRequest` | `CreateOrderDto` (maps to shared type) | `CreateOrderRequest` (from shared) | PASS |
| Response Type | `CreateOrderResponse` | `{ id, orderNumber, status, total, createdAt }` | `CreateOrderResponse` (from shared) | PASS |
| Status 201 | Created | `res.status(201).json(result)` | `response.status === 201` | PASS |

**Verdict**: PASS

### GET /api/orders/:id

| Проверка | Contract | BE Code | FE Code | Результат |
|----------|----------|---------|---------|-----------|
| HTTP метод | GET | `router.get(...)` | `api.get(...)` | PASS |
| Path | `/api/orders/:id` | `order.controller.ts:40` | `orderApi.ts:28` | PASS |
| Path param | `:id` (UUID) | `req.params.id` | `` `${BASE}/orders/${id}` `` | PASS |
| Response Type | `OrderDetailResponse` | `{ id, orderNumber, status, items, client, total, ... }` | `OrderDetailResponse` (from shared) | PASS |

**Verdict**: PASS

### GET /api/orders

| Проверка | Contract | BE Code | FE Code | Результат |
|----------|----------|---------|---------|-----------|
| HTTP метод | GET | `router.get(...)` | `api.get(...)` | PASS |
| Path | `/api/orders` | `order.controller.ts:55` | `orderApi.ts:35` | PASS |
| Query params | `page`, `limit`, `status` | `req.query.page`, `req.query.limit`, `req.query.status` | `{ params: { page, limit, status } }` | PASS |
| Response Type | `PaginatedResponse<OrderListItem>` | `{ data, total, page, limit }` | `PaginatedResponse<OrderListItem>` (from shared) | PASS |

**Verdict**: PASS

### Contract Compliance Summary

```
POST /api/orders       .............. PASS
GET  /api/orders/:id   .............. PASS
GET  /api/orders       .............. PASS

All endpoints: 3/3 PASS
```

---

## 2. Type Consistency (Консистентность типов)

Проверка: shared-типы используются в обоих слоях без дублирования.

| Тип | Файл | BE использует | FE использует | Результат |
|-----|------|---------------|---------------|-----------|
| `CreateOrderRequest` | `src/shared/types/order.types.ts` | `order.service.ts:3` (import) | `orderApi.ts:2` (import) | PASS |
| `CreateOrderResponse` | `src/shared/types/order.types.ts` | `order.service.ts:4` (import) | `orderApi.ts:3` (import) | PASS |
| `OrderDetailResponse` | `src/shared/types/order.types.ts` | `order.service.ts:5` (import) | `orderApi.ts:4` (import) | PASS |
| `OrderListItem` | `src/shared/types/order.types.ts` | `order.service.ts:6` (import) | `orderApi.ts:5` (import) | PASS |
| `OrderFormData` | **N/A** (FE-only) | N/A | `useCreateOrder.ts:8` (local) | WARNING |

### WARNING: FE-only тип OrderFormData

```
Файл:    src/frontend/features/orders/hooks/useCreateOrder.ts:8
Тип:     OrderFormData
Причина: Тип определён только в FE, отсутствует в shared/types

  interface OrderFormData extends CreateOrderRequest {
    clientName?: string;    // <-- extra optional field for UI display
  }

Severity: WARNING
Обоснование: OrderFormData расширяет CreateOrderRequest дополнительным
  опциональным полем clientName, которое используется только для
  отображения в UI и не передаётся на BE. Это не вызовет runtime-ошибку,
  но может запутать при поддержке.
```

### Type Consistency Summary

```
Shared types imported correctly: 4/4
Duplicated types found:          0
FE-only extra types:             1 (WARNING)
BE-only extra types:             0
```

---

## 3. Error Handling (Обработка ошибок)

Проверка: FE обрабатывает все коды ошибок, которые BE может вернуть.

### POST /api/orders

| HTTP Code | Error Code | BE реализация | FE обработка | Результат |
|-----------|------------|---------------|--------------|-----------|
| 400 | `VALIDATION_ERROR` | `order.controller.ts:30` | `orderApi.ts:20` -- показывает field errors | PASS |
| 401 | `UNAUTHORIZED` | `authMiddleware.ts:15` | `apiClient.ts:42` -- interceptor -> login redirect | PASS |
| 403 | `FORBIDDEN` | `authMiddleware.ts:28` | `apiClient.ts:48` -- "Нет доступа" toast | PASS |
| 404 | `CLIENT_NOT_FOUND` | `order.service.ts:35` | `orderApi.ts:24` -- "Клиент не найден" | PASS |
| 409 | `ORDER_NUMBER_CONFLICT` | `order.service.ts:42` | Generic error handler | WARNING |
| 422 | `BUSINESS_RULE_VIOLATION` | N/A (not in BE) | N/A | PASS (N/A) |
| 500 | `INTERNAL_ERROR` | Express error handler | `apiClient.ts:55` -- generic error toast | PASS |

### WARNING: 409 CONFLICT не обработан отдельно

```
Файл:    src/frontend/features/orders/api/orderApi.ts
Строка:  18-26

  export const createOrder = async (data: CreateOrderRequest) => {
    try {
      const response = await api.post('/api/orders', data);
      return response.data;
    } catch (error) {
      if (error.status === 400) throw new ValidationError(error.data);
      if (error.status === 404) throw new NotFoundError('Client not found');
      throw error;  // <-- 409 попадает сюда, пользователь видит generic error
    }
  };

Severity: WARNING
Обоснование: Если BE возвращает 409 (конфликт номера заказа, race condition),
  FE не показывает специфическое сообщение. Пользователь увидит
  "Произошла ошибка" вместо "Повторите попытку, номер заказа занят".
```

### GET /api/orders/:id

| HTTP Code | Error Code | BE реализация | FE обработка | Результат |
|-----------|------------|---------------|--------------|-----------|
| 401 | `UNAUTHORIZED` | `authMiddleware.ts:15` | `apiClient.ts:42` (interceptor) | PASS |
| 404 | `ORDER_NOT_FOUND` | `order.service.ts:58` | `orderApi.ts:32` -- "Заказ не найден" | PASS |
| 500 | `INTERNAL_ERROR` | Express error handler | `apiClient.ts:55` (generic) | PASS |

### GET /api/orders

| HTTP Code | Error Code | BE реализация | FE обработка | Результат |
|-----------|------------|---------------|--------------|-----------|
| 401 | `UNAUTHORIZED` | `authMiddleware.ts:15` | `apiClient.ts:42` (interceptor) | PASS |
| 500 | `INTERNAL_ERROR` | Express error handler | `apiClient.ts:55` (generic) | PASS |

### Error Handling Summary

```
Error codes checked:    7
Properly handled:       6
Missing handling:       1 (409 CONFLICT -- WARNING)
```

---

## 4. Mock Remnants (Mock-остатки)

Проверка: FE не использует заглушки вместо реального API.

### Результаты сканирования

```
Scanned: src/frontend/**/*.ts, src/frontend/**/*.tsx
Excluded: **/*.test.ts, **/*.test.tsx, **/*.stories.tsx, __mocks__/**

Patterns checked:
  [x] Hardcoded data objects    --> 0 found
  [x] Mock/fake imports         --> 0 found
  [x] Commented-out API calls   --> 0 found
  [x] setTimeout + resolve      --> 0 found
  [x] USE_MOCK / MOCK_MODE      --> 0 found
  [x] Mock API interceptors     --> 0 found (outside test files)

Result: CLEAN -- no mock remnants in production code
```

### Mock Remnants Summary

```
Mock remnants found: 0
Status: CLEAN
```

---

## 5. Auth Flow (Авторизация)

Проверка: FE отправляет auth-токены, BE их валидирует.

| Проверка | FE | BE | Результат |
|----------|----|----|-----------|
| Authorization header | `apiClient.ts:8` -- `Bearer ${token}` interceptor | `authMiddleware.ts:5` -- parses Bearer token | PASS |
| Token format | JWT from AuthContext | JWT verify via `jsonwebtoken` | PASS |
| 401 handling | Redirect to `/login` | Returns 401 with `UNAUTHORIZED` code | PASS |
| 403 handling | Toast "Нет доступа" | Returns 403 with `FORBIDDEN` code | PASS |
| Token refresh | `apiClient.ts:50` -- auto-refresh on 401 | `auth.controller.ts:25` -- POST /api/auth/refresh | PASS |
| Protected routes | All order endpoints use `api` (with interceptor) | All order routes use `authMiddleware` | PASS |

### Auth Flow Summary

```
Auth checks:       6/6 PASS
All endpoints properly authenticated.
```

---

## Issues Summary (Сводка проблем)

### Blockers: 0

Нет блокирующих проблем. Задача может быть передана в `tl-review`.

### Warnings: 2

#### WARNING #1: FE extra optional field in OrderFormData

- **Category**: Type Consistency
- **Severity**: WARNING
- **File**: `src/frontend/features/orders/hooks/useCreateOrder.ts:8`
- **Description**: FE определяет `OrderFormData` с дополнительным опциональным полем `clientName`, которого нет в shared-типах
- **Impact**: Не вызывает runtime-ошибок, но может запутать при поддержке
- **Recommendation**: Переместить `OrderFormData` в `src/shared/types/` или явно пометить комментарием `// FE-only UI type, не передаётся на BE`

#### WARNING #2: 409 CONFLICT не обработан в FE

- **Category**: Error Handling
- **Severity**: WARNING
- **File**: `src/frontend/features/orders/api/orderApi.ts:18-26`
- **Description**: FE не обрабатывает HTTP 409 (ORDER_NUMBER_CONFLICT) отдельно -- ошибка попадает в generic error handler
- **Impact**: Пользователь видит "Произошла ошибка" вместо специфичного "Повторите попытку"
- **Recommendation**: Добавить обработку 409 с retry-сообщением:
  ```typescript
  if (error.status === 409) throw new ConflictError('Order number conflict, please retry');
  ```

---

## Recommendations (Рекомендации)

### Перед tl-review (рекомендуется)

1. **Добавить обработку 409 в FE** -- `orderApi.ts`, добавить `case 409` с сообщением для пользователя. Это улучшит UX при race conditions.

2. **Пометить FE-only тип** -- добавить JSDoc-комментарий к `OrderFormData` с пояснением, что тип используется только для UI и не передаётся на BE. Либо перенести в shared/types с пометкой `@frontend-only`.

### На будущее (не блокирует)

3. **Рассмотреть generic retry logic** -- для всех 409-ответов можно добавить автоматический retry с exponential backoff в `apiClient.ts` interceptor.

---

## Verdict

```
╔═══════════════════════════════════════════╗
║                                           ║
║   VERDICT: PASS_WITH_WARNINGS             ║
║                                           ║
║   Blockers:  0                            ║
║   Warnings:  2                            ║
║   Passed:    12                           ║
║                                           ║
║   --> Можно передавать в tl-review        ║
║   --> Warnings будут включены в checklist  ║
║                                           ║
╚═══════════════════════════════════════════╝
```

## Next Step

```bash
/tl-review UC001 --be
/tl-review UC001 --fe
```
```

---

## Как читать этот отчёт

| Секция | Что проверяется | Ключевой вопрос |
|--------|----------------|-----------------|
| Contract Compliance | Эндпоинты (URL, метод, типы) | BE реализует то, что описано в контракте? |
| Type Consistency | Shared-типы | Один источник типов для BE и FE? |
| Error Handling | Коды ошибок | FE обрабатывает все ошибки, которые BE может вернуть? |
| Mock Remnants | Заглушки в production | FE вызывает реальный API, а не моки? |
| Auth Flow | Авторизация | FE отправляет токен, BE проверяет? |

### Severity Guide

| Severity | Блокирует review | Действие |
|----------|------------------|----------|
| **BLOCKER** | Да | Обязательно исправить до review |
| **WARNING** | Нет | Рекомендуется исправить, но review может начаться |
| **INFO** | Нет | Информационное, исправление опционально |

---

## Связанные примеры

- [full-workflow-example.md](./full-workflow-example.md) -- полный workflow (plan -> dev -> review -> docs)
- [full-workflow-be-fe-example.md](./full-workflow-be-fe-example.md) -- полный workflow со всеми 12 скиллами
- [tdd-cycle-example.md](./tdd-cycle-example.md) -- подробный пример TDD-цикла
