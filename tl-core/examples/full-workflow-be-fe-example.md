# Example: Full BE+FE+QA Workflow (All 12 Skills)

This example demonstrates the complete end-to-end workflow using all 12 TL skills. We follow the implementation of UC001 (Create Order) through every phase -- from planning through QA and documentation, including the **rejected -> fix -> re-review** cycle.

This supplements [full-workflow-example.md](./full-workflow-example.md) (which covers only BE: plan -> dev -> review -> docs) with the full architecture: separate BE/FE development, sync verification, stub scanning, E2E testing, and the rejection retry mechanism.

---

## Workflow Overview

```
                        FULL TL WORKFLOW (12 skills)
  ┌──────────────────────────────────────────────────────────────────────┐
  │                                                                      │
  │  Phase 0: INIT                                                       │
  │  ┌──────────┐                                                        │
  │  │ tl-plan  │ --> master-plan.md, Execution Waves, task files        │
  │  └──────────┘                                                        │
  │       │                                                              │
  │       ▼                                                              │
  │  Phase 1: INFRA (Wave 0)                                             │
  │  ┌──────────┐                                                        │
  │  │ tl-dev   │ --> TECH-001: Docker, DB, Redis                       │
  │  └──────────┘                                                        │
  │       │                                                              │
  │       ▼                                                              │
  │  Phase 2: UC DEVELOPMENT (Wave 1 -> Wave 2)                          │
  │  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐          │
  │  │tl-dev-be │   │tl-dev-fe │   │ tl-sync  │   │ tl-stubs │          │
  │  │ (BE TDD) │   │ (FE TDD) │   │(contract)│   │ (scan)   │          │
  │  └──────────┘   └──────────┘   └──────────┘   └──────────┘          │
  │       │               │              │               │               │
  │       ▼               ▼              ▼               ▼               │
  │  ┌──────────┐   ┌──────────┐   ┌──────────┐                         │
  │  │tl-review │   │tl-review │   │  tl-qa   │                         │
  │  │  --be    │   │  --fe    │   │  (E2E)   │                         │
  │  └──────────┘   └──────────┘   └──────────┘                         │
  │       │               │              │                               │
  │       │          REJECTED?           │                               │
  │       │            │  ▲              │                               │
  │       │            ▼  │              │                               │
  │       │       tl-dev-fe              │                               │
  │       │       --continue             │                               │
  │       │               │              │                               │
  │       ▼               ▼              ▼                               │
  │  Phase 3: FINALIZATION                                               │
  │  ┌──────────┐   ┌──────────┐   ┌──────────┐                         │
  │  │ tl-docs  │   │tl-status │   │ tl-next  │                         │
  │  └──────────┘   └──────────┘   └──────────┘                         │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: INIT (`tl-plan`)

### 0.1 Trigger

```
User: /tl-plan
```

### 0.2 Что делает tl-plan

```
Reads:
  docs/_index.md                        # Обзор проекта
  docs/10-architecture/module-tree.md   # Модульная структура
  docs/12-domain/_domain-model.md       # Доменная модель
  docs/13-roles/role-matrix.md          # Роли
  docs/14-usecases/*.md                 # Use Cases
  docs/15-interfaces/screens/*.md       # Экраны
  docs/16-requirements/nfr.md           # NFR

Creates:
  .tl/master-plan.md                    # Мастер-план с Execution Waves
  .tl/status.json                       # Начальный статус
  .tl/tasks/BE-UC001/task.md            # Backend-задача
  .tl/tasks/BE-UC001/test-spec.md       # Спецификация тестов (BE)
  .tl/tasks/BE-UC001/impl-brief.md      # Инструкция реализации (BE)
  .tl/tasks/BE-UC001/acceptance.md      # Критерии приёмки
  .tl/tasks/BE-UC001/api-contract.md    # API-контракт
  .tl/tasks/FE-UC001/task.md            # Frontend-задача
  .tl/tasks/FE-UC001/test-spec.md       # Спецификация тестов (FE, RTL)
  .tl/tasks/FE-UC001/impl-brief.md      # Инструкция реализации (FE)
  .tl/tasks/FE-UC001/acceptance.md      # Критерии приёмки
  .tl/tasks/TECH-001/task.md            # Инфраструктурная задача
  .tl/tasks/TECH-001/impl-brief.md      # Инструкция (Docker, DB, Redis)
```

### 0.3 Execution Waves

```markdown
## Execution Waves

### Wave 0: INFRA (инфраструктура)
| Task | Title | Type | Dependencies |
|------|-------|------|-------------|
| TECH-001 | Docker Compose (PostgreSQL, Redis) | TECH | None |
| TECH-002 | Shared types & project config | TECH | None |

### Wave 1: UC001-BE (backend)
| Task | Title | Type | Dependencies |
|------|-------|------|-------------|
| BE-UC001 | Create Order API | BE | TECH-001, TECH-002 |

### Wave 2: UC001-FE (frontend)
| Task | Title | Type | Dependencies |
|------|-------|------|-------------|
| FE-UC001 | Create Order Form & API Client | FE | BE-UC001 |
```

### 0.4 Диаграмма зависимостей

```
Wave 0                Wave 1              Wave 2
┌──────────┐
│ TECH-001 │──────┐
│ Docker   │      ├──► ┌──────────┐
└──────────┘      │    │ BE-UC001 │──────► ┌──────────┐
┌──────────┐      │    │ Order API│        │ FE-UC001 │
│ TECH-002 │──────┘    └──────────┘        │ Order UI │
│ Shared   │                               └──────────┘
└──────────┘
```

### 0.5 status.json (начальное состояние)

```json
{
  "project": "Order Management System",
  "created": "2025-01-30T10:00:00Z",
  "updated": "2025-01-30T10:00:00Z",
  "waves": [
    { "id": 0, "name": "INFRA", "status": "pending" },
    { "id": 1, "name": "UC001-BE", "status": "pending" },
    { "id": 2, "name": "UC001-FE", "status": "pending" }
  ],
  "summary": {
    "total": 4,
    "pending": 4,
    "in_progress": 0,
    "ready_for_review": 0,
    "approved": 0,
    "done": 0,
    "blocked": 0
  },
  "tasks": [
    { "id": "TECH-001", "title": "Docker Compose Setup", "type": "TECH", "wave": 0, "status": "pending", "depends_on": [] },
    { "id": "TECH-002", "title": "Shared Types & Config", "type": "TECH", "wave": 0, "status": "pending", "depends_on": [] },
    { "id": "BE-UC001", "title": "Create Order API", "type": "BE", "wave": 1, "status": "pending", "depends_on": ["TECH-001", "TECH-002"] },
    { "id": "FE-UC001", "title": "Create Order Form", "type": "FE", "wave": 2, "status": "pending", "depends_on": ["BE-UC001"] }
  ]
}
```

---

## Phase 1: INFRA -- Wave 0 (`tl-dev TECH-001`)

### 1.1 Trigger

```
User: /tl-dev TECH-001
```

### 1.2 Что делает tl-dev

```
Reads:
  .tl/tasks/TECH-001/task.md        # Что: Docker Compose с PostgreSQL + Redis
  .tl/tasks/TECH-001/impl-brief.md  # Как: docker-compose.yml, .env.example

Creates:
  docker-compose.yml                # PostgreSQL 15 + Redis 7
  .env.example                      # Переменные окружения
  src/config/database.ts            # DB connection config
  src/config/redis.ts               # Redis connection config
  src/database/migrations/001_init.sql  # Начальная миграция
  .tl/tasks/TECH-001/result.md      # Результат

Updates:
  .tl/status.json                   # TECH-001: pending -> done
```

### 1.3 Краткий результат

```
TECH-001 Docker Compose Setup
  Created: docker-compose.yml (PostgreSQL 15, Redis 7)
  Created: DB config, Redis config, initial migration
  Tests: docker-compose up -d -> services healthy
  Status: done (15 min)
```

Аналогично выполняется TECH-002 (shared types, tsconfig, project config).

После завершения Wave 0:

```
Wave 0 [2/2 done] ██████████████████████ 100%
  TECH-001 Docker Compose          done
  TECH-002 Shared Types & Config   done
```

---

## Phase 2: UC Development

### Step 2a: Backend TDD (`tl-dev-be UC001`)

#### Trigger

```
User: /tl-dev-be BE-UC001
```

#### Что делает tl-dev-be

```
Reads:
  .tl/tasks/BE-UC001/task.md           # Что: POST/GET /api/orders
  .tl/tasks/BE-UC001/test-spec.md      # Тесты: 7 unit + 2 integration
  .tl/tasks/BE-UC001/impl-brief.md     # Как: Express + TypeScript + Zod
  .tl/tasks/BE-UC001/api-contract.md   # Контракт: endpoints, types, errors

Creates:
  src/backend/orders/order.controller.ts    # Маршруты
  src/backend/orders/order.service.ts       # Бизнес-логика
  src/backend/orders/order.repository.ts    # БД-операции
  src/backend/orders/dto/create-order.dto.ts # DTO (Zod)
  tests/backend/orders/create-order.test.ts  # Тесты
  .tl/tasks/BE-UC001/result-be.md           # Результат

Updates:
  .tl/status.json                      # BE-UC001: pending -> ready_for_review
```

#### TDD-цикл (кратко)

```
RED Phase (15 min)
  - Написаны 9 тестов (7 unit + 2 integration)
  - Все FAILING (ожидаемо)
  - Commit: test(orders): add create order test cases

GREEN Phase (40 min)
  - OrderService, OrderController, OrderRepository, DTO
  - Все 9 тестов PASSING
  - Commit: feat(orders): implement create order API

REFACTOR Phase (20 min)
  - Извлечён generateOrderNumber()
  - Улучшены сообщения ошибок
  - Все тесты GREEN
  - Commit: refactor(orders): extract order number generation

Result: 9/9 tests pass, coverage 89%
Status: ready_for_review
```

---

### Step 2b: Frontend TDD (`tl-dev-fe UC001`)

#### Trigger

```
User: /tl-dev-fe FE-UC001
```

#### Что делает tl-dev-fe

```
Reads:
  .tl/tasks/FE-UC001/task.md           # Что: форма создания заказа
  .tl/tasks/FE-UC001/test-spec.md      # Тесты: RTL + user-event
  .tl/tasks/FE-UC001/impl-brief.md     # Как: React Hook Form + Zod + API client
  .tl/tasks/BE-UC001/api-contract.md   # Контракт (какие endpoints вызывать)

Creates:
  src/frontend/features/orders/pages/CreateOrderPage.tsx    # Страница
  src/frontend/features/orders/components/OrderForm.tsx     # Форма
  src/frontend/features/orders/api/orderApi.ts              # API-клиент
  src/frontend/features/orders/hooks/useCreateOrder.ts      # Хук создания
  tests/frontend/orders/CreateOrderPage.test.tsx            # Тесты (RTL)
  tests/frontend/orders/OrderForm.test.tsx                  # Тесты формы
  .tl/tasks/FE-UC001/result-fe.md                          # Результат

Updates:
  .tl/status.json                      # FE-UC001: pending -> ready_for_review
```

#### TDD-цикл (кратко)

```
RED Phase (20 min)
  - 11 тестов RTL (render, user interactions, form validation, API calls)
  - Все FAILING (ожидаемо)
  - Commit: test(orders): add create order form tests (RTL)

GREEN Phase (50 min)
  - CreateOrderPage, OrderForm, orderApi, useCreateOrder
  - MSW для мокирования API в тестах
  - Все 11 тестов PASSING
  - Commit: feat(orders): implement create order form and API client

REFACTOR Phase (25 min)
  - Извлечён useOrderForm hook
  - Добавлены ARIA-атрибуты (a11y)
  - Оптимизация ре-рендеров (React.memo)
  - Все тесты GREEN
  - Commit: refactor(orders): extract form hook, improve a11y

Result: 11/11 tests pass, coverage 85%
Status: ready_for_review
```

---

### Step 2c: Sync Verification (`tl-sync UC001`)

#### Trigger

```
User: /tl-sync UC001
```

#### Что делает tl-sync

```
Reads:
  .tl/tasks/BE-UC001/api-contract.md    # Контракт (эталон)
  .tl/tasks/BE-UC001/result-be.md       # Что реализовано на BE
  .tl/tasks/FE-UC001/result-fe.md       # Что реализовано на FE
  src/backend/orders/**/*.ts            # BE-код (маршруты, DTO, сервисы)
  src/frontend/features/orders/**/*.ts  # FE-код (API-клиент, хуки)
  src/shared/types/order.types.ts       # Shared-типы

Creates:
  .tl/tasks/UC001/sync-report.md        # Отчёт синхронизации
```

#### Результат

```
tl-sync UC001

  Contract Compliance:
    POST /api/orders       .............. PASS
    GET  /api/orders/:id   .............. PASS
    GET  /api/orders       .............. PASS

  Type Consistency:
    CreateOrderRequest     .............. PASS
    CreateOrderResponse    .............. PASS
    OrderDetailResponse    .............. PASS
    OrderFormData (FE-only).............. WARNING (extra optional field)

  Error Handling:
    400 VALIDATION_ERROR   .............. PASS
    401 UNAUTHORIZED       .............. PASS
    404 CLIENT_NOT_FOUND   .............. PASS
    409 ORDER_CONFLICT     .............. WARNING (not handled in FE)

  Mock Remnants:           .............. CLEAN (0 found)
  Auth Flow:               .............. PASS (all endpoints)

  Verdict: PASS_WITH_WARNINGS (12 pass, 0 fail, 2 warnings)
  --> Можно передавать в tl-review
```

See [sync-report-example.md](./sync-report-example.md) for the complete sync-report.md file.

---

### Step 2d: Stub Scanning (`tl-stubs UC001`)

#### Trigger

```
User: /tl-stubs UC001
```

#### Что делает tl-stubs

```
Reads:
  src/**/*.ts, src/**/*.tsx            # Весь исходный код
  .tl/stub-registry.json              # Текущий реестр (если есть)

Scans for:
  TODO, FIXME, STUB, MOCK, HACK       # Маркеры в коде

Updates:
  .tl/stub-registry.json              # Обновлённый реестр
```

#### Результат

```
tl-stubs UC001

  Scanned: 14 files (BE: 5, FE: 7, Shared: 2)

  Found: 2 stubs
  ┌────────────┬─────────────────────────────────────┬──────────┬──────┐
  │ ID         │ Text                                │ Severity │ File │
  ├────────────┼─────────────────────────────────────┼──────────┼──────┤
  │ STUB-001   │ TODO: add pagination to order list  │ medium   │ order.repository.ts:45 │
  │ STUB-002   │ MOCK: hardcoded page size = 20      │ low      │ order.controller.ts:58 │
  └────────────┴─────────────────────────────────────┴──────────┴──────┘

  Critical: 0 | High: 0 | Medium: 1 | Low: 1
  --> No critical stubs. Can proceed to review.
```

---

### Step 2e: Backend Review (`tl-review UC001 --be`)

#### Trigger

```
User: /tl-review UC001 --be
```

#### Что делает tl-review --be

```
Reads:
  .tl/tasks/BE-UC001/task.md           # Требования
  .tl/tasks/BE-UC001/test-spec.md      # Ожидаемые тесты
  .tl/tasks/BE-UC001/acceptance.md     # Критерии приёмки
  .tl/tasks/BE-UC001/result-be.md      # Результат разработки
  .tl/tasks/UC001/sync-report.md       # Отчёт синхронизации
  .tl/stub-registry.json               # Реестр заглушек
  src/backend/orders/**/*.ts           # Исходный код (BE)
  tests/backend/orders/**/*.test.ts    # Тесты

Creates:
  .tl/tasks/BE-UC001/review-be.md      # Результат ревью

Updates:
  .tl/status.json                      # BE-UC001: ready_for_review -> approved
```

#### Результат

```
tl-review UC001 --be

  Checklist (8 categories):
    1. Correctness     .............. PASS (all acceptance criteria met)
    2. Code Quality    .............. PASS (naming, structure, TypeScript strict)
    3. Error Handling  .............. PASS (custom errors, proper status codes)
    4. Testing         .............. PASS (9/9, coverage 89%, AAA pattern)
    5. Security        .............. PASS (parameterized queries, input validation)
    6. Performance     .............. PASS (no N+1, indexes created)
    7. Documentation   .............. PASS (JSDoc on public methods)
    8. Stub Gate       .............. PASS (no critical stubs)

  Issues: 1 minor suggestion (add rate limiting -- separate task)
  Verdict: APPROVED
```

---

### Step 2f: Frontend Review (`tl-review UC001 --fe`) -- REJECTED

#### Trigger

```
User: /tl-review UC001 --fe
```

#### Что делает tl-review --fe

```
Reads:
  .tl/tasks/FE-UC001/task.md           # Требования
  .tl/tasks/FE-UC001/test-spec.md      # Ожидаемые тесты
  .tl/tasks/FE-UC001/acceptance.md     # Критерии приёмки
  .tl/tasks/FE-UC001/result-fe.md      # Результат разработки
  .tl/tasks/UC001/sync-report.md       # Отчёт синхронизации (включая warnings)
  .tl/stub-registry.json               # Реестр заглушек
  src/frontend/features/orders/**/*.tsx # Исходный код (FE)
  tests/frontend/orders/**/*.test.tsx   # Тесты

Creates:
  .tl/tasks/FE-UC001/review-fe.md      # Результат ревью (REJECTED)

Updates:
  .tl/status.json                      # FE-UC001: ready_for_review -> rejected
```

#### Результат: REJECTED

```
tl-review UC001 --fe

  Checklist (8 categories):
    1. Correctness     .............. PASS
    2. Code Quality    .............. PASS
    3. Error Handling  .............. FAIL (missing ErrorBoundary)
    4. Testing         .............. PASS (11/11, coverage 85%)
    5. Security        .............. PASS
    6. Performance     .............. PASS
    7. Documentation   .............. PASS
    8. Stub Gate       .............. PASS

  Blocking Issues: 1

  BLOCKER #1: Missing ErrorBoundary
    File:    src/frontend/features/orders/pages/CreateOrderPage.tsx
    Problem: CreateOrderPage не обёрнута в ErrorBoundary.
             При runtime-ошибке (например, API вернул неожиданный формат)
             вся страница упадёт с белым экраном.
    Fix:     Добавить ErrorBoundary с fallback-компонентом.
    Ref:     FE-UC001/acceptance.md, AC-FE-07: "Graceful error handling"

  Verdict: REJECTED
  --> Возвращаем в tl-dev-fe для доработки
```

---

### Step 2f (retry): Fix and Re-review

Это ключевая демонстрация **механизма retry** -- rejected -> fix -> re-review.

```
             RETRY CYCLE
  ┌──────────────────────────────────────────────────────┐
  │                                                      │
  │  tl-review --fe                                      │
  │       │                                              │
  │       ▼                                              │
  │   REJECTED (missing ErrorBoundary)                   │
  │       │                                              │
  │       ▼                                              │
  │  tl-dev-fe UC001 --continue                          │
  │       │                                              │
  │       │  Reads: review-fe.md (замечания)             │
  │       │  Fixes: adds ErrorBoundary                   │
  │       │  Tests: 12/12 pass (1 new test)              │
  │       │  Updates: result-fe.md                       │
  │       │                                              │
  │       ▼                                              │
  │  tl-review --fe (повторно)                           │
  │       │                                              │
  │       ▼                                              │
  │   APPROVED                                           │
  │                                                      │
  └──────────────────────────────────────────────────────┘
```

#### Fix: tl-dev-fe UC001 --continue

```
User: /tl-dev-fe FE-UC001 --continue
```

```
Reads:
  .tl/tasks/FE-UC001/review-fe.md      # Замечания (BLOCKER: ErrorBoundary)

Fixes:
  1. Created src/frontend/features/orders/components/OrderErrorBoundary.tsx
  2. Wrapped CreateOrderPage in OrderErrorBoundary
  3. Added test: "renders error fallback on runtime error"

Tests: 12/12 pass (was 11, added 1 new)
Commit: fix(orders): add ErrorBoundary to CreateOrderPage

Updates:
  .tl/tasks/FE-UC001/result-fe.md      # Обновлён (добавлен fix section)
  .tl/status.json                      # FE-UC001: rejected -> ready_for_review
```

#### Re-review: tl-review UC001 --fe

```
User: /tl-review UC001 --fe
```

```
  Checklist (8 categories):
    1. Correctness     .............. PASS
    2. Code Quality    .............. PASS
    3. Error Handling  .............. PASS (ErrorBoundary added)
    4. Testing         .............. PASS (12/12, coverage 87%)
    5. Security        .............. PASS
    6. Performance     .............. PASS
    7. Documentation   .............. PASS
    8. Stub Gate       .............. PASS

  Previous blocker resolved: ErrorBoundary added with fallback UI
  Verdict: APPROVED
```

---

### Step 2g: E2E Testing (`tl-qa UC001`)

#### Trigger

```
User: /tl-qa UC001
```

#### Что делает tl-qa

```
Reads:
  .tl/tasks/BE-UC001/acceptance.md     # Критерии приёмки (BE)
  .tl/tasks/FE-UC001/acceptance.md     # Критерии приёмки (FE)
  .tl/tasks/UC001/sync-report.md       # Отчёт синхронизации
  .tl/tasks/BE-UC001/result-be.md      # Что реализовано (BE)
  .tl/tasks/FE-UC001/result-fe.md      # Что реализовано (FE)

Executes:
  Playwright MCP: open browser -> navigate -> interact -> verify

Creates:
  .tl/tasks/UC001/qa-report.md         # E2E-отчёт
  .tl/qa-screenshots/UC001/step-01-open-form.png
  .tl/qa-screenshots/UC001/step-02-fill-client.png
  .tl/qa-screenshots/UC001/step-03-add-items.png
  .tl/qa-screenshots/UC001/step-04-submit.png
  .tl/qa-screenshots/UC001/step-05-success.png
  .tl/qa-screenshots/UC001/step-06-view-order.png
```

#### E2E-сценарий (кратко)

```
tl-qa UC001

  Scenario: Create Order (Happy Path)

  Step 1: Open Create Order page
    Navigate: http://localhost:3000/orders/new
    Verify: form is visible, title "Create Order"
    Screenshot: step-01-open-form.png .............. PASS

  Step 2: Select client
    Action: click client dropdown, select "Acme Corp"
    Verify: client name displayed
    Screenshot: step-02-fill-client.png ............ PASS

  Step 3: Add items
    Action: click "Add Item", select product, set quantity = 2
    Verify: item row appears, subtotal calculated
    Screenshot: step-03-add-items.png .............. PASS

  Step 4: Submit form
    Action: click "Create Order" button
    Verify: loading spinner, then redirect
    Screenshot: step-04-submit.png ................. PASS

  Step 5: Success
    Verify: success toast "Order created"
    Verify: redirected to /orders/:id
    Screenshot: step-05-success.png ................ PASS

  Step 6: View created order
    Verify: order number format ORD-YYYYMMDD-NNNN
    Verify: status = NEW, items match
    Screenshot: step-06-view-order.png ............. PASS

  ─────────────────────────────────────
  E2E Result: 6/6 steps PASS
  Duration: 12 seconds
  Screenshots: 6 saved to .tl/qa-screenshots/UC001/
```

---

### Step 2h: Documentation (`tl-docs UC001`)

#### Trigger

```
User: /tl-docs UC001
```

#### Что делает tl-docs

```
Reads:
  .tl/tasks/BE-UC001/result-be.md      # BE-реализация
  .tl/tasks/FE-UC001/result-fe.md      # FE-реализация
  .tl/tasks/BE-UC001/review-be.md      # Результат BE-ревью
  .tl/tasks/FE-UC001/review-fe.md      # Результат FE-ревью
  .tl/tasks/BE-UC001/api-contract.md   # API-контракт
  README.md                            # Текущий README
  CHANGELOG.md                         # Текущий CHANGELOG

Updates:
  docs/api/orders.md                   # API-документация (POST, GET endpoints)
  README.md                            # Features checklist: [x] Create Order
  CHANGELOG.md                         # New entry: UC001 Create Order implemented

Updates:
  .tl/status.json                      # BE-UC001, FE-UC001: approved -> done
```

#### Результат

```
tl-docs UC001

  Updated: docs/api/orders.md
    - POST /api/orders (request, response, errors, example)
    - GET /api/orders/:id (request, response, errors)
    - GET /api/orders (query params, pagination)

  Updated: README.md
    - [x] Create Order (UC001)

  Updated: CHANGELOG.md
    - [2025-01-31] UC001 Create Order -- full-stack implementation

  Status: BE-UC001 -> done, FE-UC001 -> done
```

---

## Phase 3: FINALIZATION

### Final Stub Check

```
User: /tl-stubs --final
```

```
tl-stubs --final

  Scanned: 18 files
  Total stubs: 2 (unchanged from last scan)

  Critical: 0 | High: 0 | Medium: 1 | Low: 1

  No critical stubs remaining.
  Project is clean for release.
```

### Final Status

```
User: /tl-status
```

```
=== TL Project Status: Order Management System ===

Wave 0 [2/2 done] ██████████████████████ 100%
  TECH-001 Docker Compose Setup        done
  TECH-002 Shared Types & Config       done

Wave 1 [1/1 done] ██████████████████████ 100%
  BE-UC001 Create Order API            done

Wave 2 [1/1 done] ██████████████████████ 100%
  FE-UC001 Create Order Form           done

--- Sync ---
  UC001: PASS_WITH_WARNINGS (2 warnings, 0 blockers)

--- Stubs ---
  Total: 2 (TODO: 1, MOCK: 1)
  Critical: 0 | High: 0

--- QA ---
  UC001: 6/6 steps PASS

--- Review History ---
  BE-UC001: APPROVED (1st attempt)
  FE-UC001: APPROVED (2nd attempt -- 1st was REJECTED, missing ErrorBoundary)

Overall: 4/4 tasks done (100%)
```

---

## Complete Timeline

```
10:00  [tl-plan]      Planning started
                      - 4 tasks created (2 TECH, 1 BE, 1 FE)
                      - 3 Execution Waves defined
                      - .tl/ structure created

10:15  [tl-dev]       TECH-001 Docker Compose
       - 10:30        - PostgreSQL + Redis configured
                      - Status: done

10:30  [tl-dev]       TECH-002 Shared Types & Config
       - 10:50        - tsconfig, shared types, project structure
                      - Status: done

11:00  [tl-dev-be]    BE-UC001 development started
                      - Status: in_progress

11:00  [tl-dev-be]    RED phase
       - 11:15        - 9 tests written, all FAILING

11:15  [tl-dev-be]    GREEN phase
       - 11:55        - OrderService, Controller, Repository
                      - All 9 tests PASSING

11:55  [tl-dev-be]    REFACTOR phase
       - 12:15        - Code improved, tests GREEN
                      - Status: ready_for_review

12:15  [tl-dev-fe]    FE-UC001 development started
                      - Status: in_progress

12:15  [tl-dev-fe]    RED phase
       - 12:35        - 11 RTL tests written, all FAILING

12:35  [tl-dev-fe]    GREEN phase
       - 13:25        - Components, API client, hooks
                      - All 11 tests PASSING

13:25  [tl-dev-fe]    REFACTOR phase
       - 13:50        - a11y, memo, hook extraction
                      - Status: ready_for_review

14:00  [tl-sync]      UC001 sync check
       - 14:15        - 12 pass, 0 fail, 2 warnings
                      - Verdict: PASS_WITH_WARNINGS

14:15  [tl-stubs]     UC001 stub scan
                      - 2 stubs found (medium, low)
                      - No critical -> proceed

14:30  [tl-review]    BE-UC001 review (--be)
       - 14:45        - Verdict: APPROVED (1st attempt)

14:45  [tl-review]    FE-UC001 review (--fe)         <-- FIRST ATTEMPT
       - 15:00        - Verdict: REJECTED
                      - Blocker: missing ErrorBoundary

15:00  [tl-dev-fe]    FE-UC001 fix (--continue)      <-- RETRY
       - 15:20        - ErrorBoundary added
                      - 12/12 tests pass
                      - Status: ready_for_review

15:20  [tl-review]    FE-UC001 re-review (--fe)      <-- SECOND ATTEMPT
       - 15:35        - Verdict: APPROVED

15:35  [tl-qa]        UC001 E2E testing
       - 15:50        - 6/6 steps PASS
                      - Screenshots saved

15:50  [tl-docs]      UC001 documentation
       - 16:00        - API docs, README, CHANGELOG updated
                      - Status: done

16:00  [tl-stubs]     Final stub check
                      - 0 critical stubs

16:00  [tl-status]    Final project status
                      - 4/4 tasks done (100%)
```

---

## Диаграмма потока данных

```
                    FILES CREATED/UPDATED BY EACH SKILL
  ┌───────────────────────────────────────────────────────────────────┐
  │                                                                   │
  │  tl-plan                                                          │
  │  ├── .tl/master-plan.md                                           │
  │  ├── .tl/status.json                                              │
  │  ├── .tl/tasks/BE-UC001/  (task.md, test-spec.md, impl-brief.md, │
  │  │                         acceptance.md, api-contract.md)        │
  │  ├── .tl/tasks/FE-UC001/  (task.md, test-spec.md, impl-brief.md, │
  │  │                         acceptance.md)                         │
  │  └── .tl/tasks/TECH-001/  (task.md, impl-brief.md)               │
  │                                                                   │
  │  tl-dev (TECH)                                                    │
  │  ├── docker-compose.yml, src/config/*, src/database/*             │
  │  └── .tl/tasks/TECH-001/result.md                                 │
  │                                                                   │
  │  tl-dev-be                                                        │
  │  ├── src/backend/orders/**/*.ts                                   │
  │  ├── tests/backend/orders/**/*.test.ts                            │
  │  └── .tl/tasks/BE-UC001/result-be.md                              │
  │                                                                   │
  │  tl-dev-fe                                                        │
  │  ├── src/frontend/features/orders/**/*.tsx                        │
  │  ├── tests/frontend/orders/**/*.test.tsx                          │
  │  └── .tl/tasks/FE-UC001/result-fe.md                              │
  │                                                                   │
  │  tl-sync                                                          │
  │  └── .tl/tasks/UC001/sync-report.md                               │
  │                                                                   │
  │  tl-stubs                                                         │
  │  └── .tl/stub-registry.json                                       │
  │                                                                   │
  │  tl-review                                                        │
  │  ├── .tl/tasks/BE-UC001/review-be.md                              │
  │  └── .tl/tasks/FE-UC001/review-fe.md                              │
  │                                                                   │
  │  tl-qa                                                            │
  │  ├── .tl/tasks/UC001/qa-report.md                                 │
  │  └── .tl/qa-screenshots/UC001/*.png                               │
  │                                                                   │
  │  tl-docs                                                          │
  │  ├── docs/api/orders.md                                           │
  │  ├── README.md                                                    │
  │  └── CHANGELOG.md                                                 │
  │                                                                   │
  │  tl-status                                                        │
  │  └── (reads only, writes nothing)                                 │
  │                                                                   │
  │  tl-next                                                          │
  │  └── (reads only, writes nothing)                                 │
  │                                                                   │
  └───────────────────────────────────────────────────────────────────┘
```

---

## Key Points Demonstrated

### 1. Разделение BE/FE

Каждый слой разрабатывается отдельным агентом (`tl-dev-be` / `tl-dev-fe`), ревьюится отдельно (`--be` / `--fe`), и результаты хранятся в отдельных файлах (`result-be.md` / `result-fe.md`).

### 2. API-контракт как источник истины

`api-contract.md` создаётся на этапе планирования и служит эталоном для:
- `tl-dev-be` -- реализует endpoints по контракту
- `tl-dev-fe` -- вызывает endpoints по контракту
- `tl-sync` -- проверяет соответствие обоих слоёв контракту

### 3. Rejection -> Fix -> Re-review цикл

```
REJECTED (review-fe.md: "missing ErrorBoundary")
    │
    ▼
tl-dev-fe --continue (reads review-fe.md, fixes issue)
    │
    ▼
tl-review --fe (re-reviews -> APPROVED)
```

Это ключевой механизм quality gate. Задача не может быть `done` без прохождения ревью. Максимум 3 попытки, после чего -- эскалация (status: `blocked`).

### 4. Sync перед Review

`tl-sync` запускается **после** обоих `tl-dev-be` и `tl-dev-fe`, но **перед** `tl-review`. Если sync находит BLOCKER -- review не начинается.

```
tl-dev-be --> tl-dev-fe --> tl-sync --> tl-review
                                 │
                            BLOCKER? --> tl-dev (fix) --> tl-sync (retry)
                            WARN?   --> continue to tl-review (with notes)
                            PASS?   --> continue to tl-review
```

### 5. Stub Safety Net

`tl-stubs` запускается после каждой фазы разработки и перед каждым ревью. Если в `stub-registry.json` есть записи с severity `high` или `critical` -- ревью автоматически REJECTED (Stub Gate).

### 6. E2E как финальная проверка

`tl-qa` запускается только когда и BE, и FE одобрены ревью. Он проверяет полный user flow через Playwright MCP.

### 7. Execution Waves

Задачи группируются в волны по зависимостям. Внутри одной волны задачи могут выполняться параллельно. BE-задачи идут раньше FE-задач.

### 8. Complete Audit Trail

Каждый шаг оставляет файл в `.tl/tasks/`:
- `result-be.md`, `result-fe.md` -- что было сделано
- `review-be.md`, `review-fe.md` -- что сказал ревьюер
- `sync-report.md` -- синхронизация BE/FE
- `qa-report.md` -- E2E-результаты

---

## Related Examples

- [full-workflow-example.md](./full-workflow-example.md) -- simplified workflow (BE only: plan -> dev -> review -> docs)
- [sync-report-example.md](./sync-report-example.md) -- complete sync-report.md file
- [tdd-cycle-example.md](./tdd-cycle-example.md) -- detailed TDD cycle
- [task-example.md](./task-example.md) -- task file format
