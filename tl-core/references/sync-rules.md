# Sync Rules (tl-sync)

## 1. Назначение

Скилл `tl-sync` выполняет верификацию синхронизации между backend (BE) и frontend (FE) кодом на основе API-контракта. Цель --- убедиться, что BE реализует именно то, что описано в `api-contract.md`, а FE потребляет API именно так, как оно реализовано.

### Какие проблемы предотвращает

| Проблема | Последствия | Как tl-sync ловит |
|----------|------------|-------------------|
| BE изменил формат ответа, FE не обновлён | Runtime-ошибки у пользователя | Сравнение Response типов |
| FE отправляет лишнее поле, BE его игнорирует | Скрытый баг, данные теряются | Сравнение Request типов |
| FE не обрабатывает код ошибки 409 | Пользователь видит generic error | Проверка error handling |
| BE добавил обязательное поле, FE не знает | 400 ошибка при каждом запросе | Проверка required полей |
| FE использует mock-данные вместо API | Работает локально, ломается на staging | Поиск mock-остатков |
| URL эндпоинта в FE не совпадает с BE | 404 при каждом запросе | Сравнение путей |
| FE не отправляет Authorization header | 401 на каждый запрос | Проверка auth flow |

### Когда запускается

```
tl-plan → tl-dev(BE) → tl-dev(FE) → tl-sync → tl-review
                                        ↑
                                  Запускается после
                                  завершения BE и FE
```

---

## 2. Что проверяется

### a. API Contract Match

Проверяется, что эндпоинты в BE-коде соответствуют `api-contract.md`.

**Что сравнивается:**

| Элемент контракта | Где искать в BE | Критерий соответствия |
|-------------------|-----------------|----------------------|
| HTTP метод (POST, GET...) | Декоратор маршрута / `router.post(...)` | Точное совпадение |
| Path (`/api/orders`) | Маршрут контроллера | Точное совпадение |
| Path params (`:id`) | Параметры маршрута | Все params присутствуют |
| Query params | Парсинг query в контроллере | Все обязательные params |
| Request Body type | DTO / Zod-схема в контроллере | Структурное совпадение |
| Response type | Return type сервиса/контроллера | Структурное совпадение |
| HTTP status codes | `res.status(...)` / return | Все коды из контракта |

**Пример проверки:**

```
Контракт: POST /api/orders → CreateOrderRequest → 201 CreateOrderResponse
BE код:   router.post('/api/orders', ...) → CreateOrderDto → 201 { id, orderNumber, ... }

Результат: PASS (метод, путь, типы совпадают)
```

### b. Type Consistency

Проверяется, что shared types из `src/shared/types/` используются в обоих слоях без дублирования.

**Что проверяется:**

- BE импортирует типы из `src/shared/types/`, а не определяет свои
- FE импортирует типы из `src/shared/types/`, а не определяет свои
- Нет дублирующих определений интерфейсов в `src/backend/` или `src/frontend/`
- Все типы из контракта присутствуют в `src/shared/types/`

**Типичные нарушения:**

```typescript
// НАРУШЕНИЕ: дублирование типа в BE
// Файл: src/backend/orders/order.types.ts
interface Order {                    // Должен импортироваться из shared!
  id: string;
  orderNumber: string;
  // ...
}

// ПРАВИЛЬНО:
// Файл: src/backend/orders/order.service.ts
import { Order, CreateOrderRequest } from '@shared/types';
```

### c. Request/Response Shape

Проверяется, что FE отправляет именно ту структуру, которую ожидает BE, и обрабатывает именно ту структуру, которую BE возвращает.

**Что сравнивается:**

| Проверка | Описание | Пример нарушения |
|----------|----------|------------------|
| Лишние поля в запросе FE | FE отправляет поля, которых нет в контракте | FE отправляет `{ clientId, items, priority }`, а `priority` нет в контракте |
| Пропущенные обязательные поля | FE не отправляет required-поле | FE не отправляет `clientId` |
| Неправильный тип поля | FE отправляет string вместо number | `quantity: "2"` вместо `quantity: 2` |
| Обращение к несуществующему полю ответа | FE читает поле, которого нет в ответе | `response.data.client.name`, а BE возвращает только `clientId` |
| Игнорирование полей ответа | FE не использует существенные поля | FE не показывает `orderNumber` |

### d. Error Handling

Проверяется, что FE обрабатывает все коды ошибок, которые BE может вернуть.

**Правила:**

- Для каждого эндпоинта: все HTTP-коды ошибок из контракта должны иметь обработку в FE
- Минимально: FE должен различать 400, 401, 403, 404, 500
- Специфические ошибки (409, 422) должны иметь отдельную обработку, если описаны в контракте

**Пример проверки:**

```
Контракт POST /api/orders → ошибки: 400, 401, 403, 404, 409, 422, 500

FE код (api-client.ts):
  try { await api.post('/orders', data); }
  catch (error) {
    if (error.status === 400) → показать ошибки валидации     ✅
    if (error.status === 401) → редирект на логин              ✅
    if (error.status === 404) → "Клиент не найден"            ✅
    else → "Неизвестная ошибка"                               ⚠️ WARNING: 403, 409, 422 не обработаны отдельно
  }
```

### e. Mock Elimination

Проверяется, что FE использует реальный API-клиент, а не захардкоженные данные или моки.

**Что ищем:**

| Паттерн | Файлы | Критерий |
|---------|-------|----------|
| Захардкоженные данные | `*.ts`, `*.tsx` | Объекты с тестовыми данными, не в `test/` или `fixtures/` |
| Mock API | `mock*.ts`, `fake*.ts` | Файлы с mock-реализациями вне `test/` |
| Закомментированный API-вызов | `*.ts` | `// await api.post(...)` с заглушкой ниже |
| `setTimeout` как имитация API | `*.ts` | `setTimeout` + `resolve` с фейковыми данными |
| Условные переключатели | `*.ts` | `if (USE_MOCK)` или `if (process.env.MOCK)` |

**Исключения (не являются нарушениями):**

- Файлы в `test/`, `__tests__/`, `*.test.ts`, `*.spec.ts`
- Файлы в `fixtures/`, `__mocks__/` (Jest-моки)
- Storybook stories (`*.stories.ts`)
- Seed-скрипты (`seed*.ts`)

### f. Auth Flow

Проверяется, что FE отправляет auth-токены, а BE их валидирует.

**Проверки:**

| Что | FE | BE |
|-----|----|----|
| Заголовок Authorization | Устанавливается в API-клиенте | Проверяется middleware |
| Формат токена | `Bearer <token>` | Парсинг `Bearer` + JWT verify |
| Обработка 401 | Редирект на логин / refresh | Возврат 401 при невалидном токене |
| Обработка 403 | Сообщение "Нет доступа" | Проверка ролей после аутентификации |
| Token refresh | Автоматический refresh при 401 | Refresh endpoint существует |

---

## 3. Процесс верификации

### Пошаговый алгоритм

```
Шаг 1: Read api-contract.md
         ↓
Шаг 2: Scan BE source → найти реализации эндпоинтов
         ↓
Шаг 3: Scan FE source → найти вызовы API
         ↓
Шаг 4: Compare → типы, пути, методы, ошибки
         ↓
Шаг 5: Check mocks → поиск остатков заглушек
         ↓
Шаг 6: Generate sync-report.md
```

### Шаг 1: Чтение api-contract.md

```
Входные данные: .tl/tasks/UC###/api-contract.md

Извлекаем:
- Список эндпоинтов (метод + path)
- Для каждого эндпоинта:
  - Request type (имя интерфейса)
  - Response type (имя интерфейса)
  - Error codes (HTTP status → error code)
  - Auth requirements (роли)
- Shared Types (список интерфейсов + файлы)
- Events (если есть)
```

### Шаг 2: Сканирование BE-кода

```
Где искать:
- src/backend/**/*.controller.ts     → маршруты
- src/backend/**/*.service.ts        → бизнес-логика (типы возврата)
- src/backend/**/*.dto.ts            → DTO (типы запросов)
- src/backend/**/*.middleware.ts      → auth middleware
- src/backend/**/routes.ts           → маршрутизация

Что собираем:
- Декораторы/вызовы маршрутов: router.post('/api/orders', ...)
- Типы параметров: (req: Request<CreateOrderDto>) или Zod-схемы
- Типы ответов: res.status(201).json(result)
- Коды ошибок: res.status(400), throw new HttpException(400, ...)
- Auth guards: @Roles('Manager'), authMiddleware
```

### Шаг 3: Сканирование FE-кода

```
Где искать:
- src/frontend/**/api/*.ts           → API-клиент
- src/frontend/**/services/*.ts      → Сервисы, вызывающие API
- src/frontend/**/hooks/use*.ts      → Хуки с API-вызовами
- src/frontend/**/store/*.ts         → Store actions с API

Что собираем:
- API-вызовы: api.post('/orders', data), fetch('/api/orders')
- Типы запросов: data as CreateOrderRequest
- Обработку ответов: response.data.orderNumber
- Обработку ошибок: catch (error) { if (error.status === 400) ... }
- Auth headers: headers: { Authorization: `Bearer ${token}` }
```

### Шаг 4: Сравнение

Для каждого эндпоинта из контракта:

```
┌─────────────────────────────────────────────────────┐
│ Endpoint: POST /api/orders                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Contract    BE Code       FE Code       Result     │
│  ─────────   ──────────    ──────────    ──────     │
│  POST        router.post   api.post      ✅ PASS    │
│  /api/orders /api/orders   /api/orders   ✅ PASS    │
│  Req: Create CreateOrder   { clientId,   ✅ PASS    │
│  OrderReq    Dto           items }                  │
│  Res: Create { id, order   response.     ✅ PASS    │
│  OrderResp   Number, ... } data.id                  │
│  Err: 400    res.status    catch 400     ✅ PASS    │
│  Err: 409    res.status    (not handled) ⚠️ WARN    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Шаг 5: Поиск mock-остатков

```
Паттерны для поиска (в src/frontend/, исключая test/):

1. const mockOrders = [...]            → MOCK_REMNANT
2. const fakeData = {...}              → MOCK_REMNANT
3. // api.post('/orders', data)        → COMMENTED_API_CALL
4. return new Promise(resolve =>
     setTimeout(() => resolve(...))    → FAKE_ASYNC
5. if (USE_MOCK) { ... }              → MOCK_SWITCH
6. import { mockApi } from './mock'    → MOCK_IMPORT
```

---

## 4. Формат sync-report.md

Отчёт `sync-report.md` создаётся в `.tl/tasks/UC###/sync-report.md`.

### Структура отчёта

```markdown
---
task_id: UC001
title: "Sync Report: Create Order"
generated_at: 2025-01-30T16:00:00Z
contract_version: "1.0.0"
verdict: PASS | FAIL | WARN
stats:
  total_checks: 18
  passed: 15
  failed: 1
  warnings: 2
---

# Sync Report: UC001 Create Order

## Summary

**Verdict**: WARN
**Contract version**: 1.0.0
**Checks**: 15 passed, 1 failed, 2 warnings

## Passed Checks

| # | Check | Category | Details |
|---|-------|----------|---------|
| 1 | POST /api/orders exists in BE | Contract Match | order.controller.ts:25 |
| 2 | POST /api/orders called in FE | Contract Match | orderApi.ts:12 |
| 3 | Request type matches | Type Consistency | CreateOrderRequest used in both |
| 4 | Response type matches | Type Consistency | CreateOrderResponse used in both |
| 5 | clientId: string (UUID) | Request Shape | Validated in Zod schema |
| 6 | items: array min 1 | Request Shape | Validated in Zod schema |
| 7 | 400 error handled in FE | Error Handling | orderApi.ts:28 |
| 8 | 401 error handled in FE | Error Handling | apiClient.ts:15 (interceptor) |
| 9 | 404 error handled in FE | Error Handling | orderApi.ts:32 |
| 10 | Auth header sent by FE | Auth Flow | apiClient.ts:8 |
| 11 | Auth middleware on BE | Auth Flow | authMiddleware.ts |
| 12 | Shared types imported in BE | Type Consistency | order.service.ts:1 |
| 13 | Shared types imported in FE | Type Consistency | orderApi.ts:1 |
| 14 | GET /api/orders exists in BE | Contract Match | order.controller.ts:40 |
| 15 | GET /api/orders/:id exists in BE | Contract Match | order.controller.ts:55 |

## Failed Checks

| # | Check | Category | Severity | Details | How to Fix |
|---|-------|----------|----------|---------|------------|
| 1 | Response shape mismatch | Request/Response Shape | BLOCKER | BE returns `client_id` (snake_case), contract specifies `clientId` (camelCase) | Обновить BE serializer: использовать camelCase в JSON-ответах |

## Warnings

| # | Check | Category | Severity | Details | Recommendation |
|---|-------|----------|----------|---------|----------------|
| 1 | 409 CONFLICT not handled | Error Handling | WARNING | FE не обрабатывает 409 отдельно, попадает в generic error handler | Добавить обработку 409 с сообщением "Повторите попытку" |
| 2 | 422 BUSINESS_RULE_VIOLATION not handled | Error Handling | WARNING | FE не обрабатывает 422 отдельно | Добавить обработку 422 с показом business rule message |

## Mock Remnants

| # | File | Line | Pattern | Details |
|---|------|------|---------|---------|
| - | - | - | - | Mock-остатки не найдены ✅ |

## Recommendations

1. **BLOCKER**: Исправить snake_case → camelCase в BE serializer (блокирует review)
2. **WARNING**: Добавить обработку 409 и 422 в FE (рекомендуется до review)
```

---

## 5. Severity Levels

### Уровни серьёзности

| Уровень | Обозначение | Блокирует review | Описание |
|---------|------------|------------------|----------|
| **BLOCKER** | `BLOCKER` | Да | Несовместимость, вызывающая runtime-ошибки |
| **WARNING** | `WARNING` | Нет | Потенциальная проблема, рекомендуется исправить |
| **INFO** | `INFO` | Нет | Информационное замечание, исправление опционально |

### Что является BLOCKER

| Проблема | Почему BLOCKER |
|----------|---------------|
| Тип поля не совпадает (string vs number) | Runtime-ошибка парсинга |
| Обязательное поле отсутствует в запросе FE | 400 ошибка при каждом запросе |
| Path эндпоинта не совпадает | 404 при каждом запросе |
| HTTP метод не совпадает (POST vs PUT) | 405 Method Not Allowed |
| Имя поля не совпадает (camelCase vs snake_case) | Данные не маппятся |
| Shared type не совпадает с контрактом | Оба слоя работают с разными структурами |
| Auth middleware отсутствует на защищённом эндпоинте | Эндпоинт доступен без авторизации |

### Что является WARNING

| Проблема | Почему WARNING |
|----------|---------------|
| Код ошибки не обработан отдельно в FE | Пользователь видит generic error |
| Эндпоинт описан в контракте, но не вызывается из FE | Возможно, FE ещё не готов |
| Лишнее опциональное поле в запросе FE | BE игнорирует, но может запутать |
| FE не использует все поля ответа | Потерянные данные (но не ошибка) |
| Deprecated mock-файлы всё ещё в проекте | Не влияет на runtime, но засоряет |

### Что является INFO

| Проблема | Почему INFO |
|----------|------------|
| Дополнительная валидация в FE (сверх контракта) | Хорошая практика, не проблема |
| BE возвращает лишнее поле (сверх контракта) | FE игнорирует, не ломается |
| Различия в комментариях/описаниях | Не влияет на работу |
| Порядок полей в JSON отличается | JSON не зависит от порядка |

---

## 6. Интеграция в workflow

### Место в рабочем процессе

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌─────────┐     ┌───────────┐
│ tl-plan │ ──→ │ tl-dev   │ ──→ │ tl-dev   │ ──→ │ tl-sync │ ──→ │ tl-review │
│         │     │ (BE)     │     │ (FE)     │     │         │     │           │
│ Создаёт │     │ Реализует│     │ Реализует│     │Проверяет│     │ Ревьюит   │
│ контракт│     │ API      │     │ UI+API   │     │ синхрон │     │ код       │
└─────────┘     └──────────┘     └──────────┘     └─────────┘     └───────────┘
                                                       │
                                                       ▼
                                                  sync-report.md
                                                       │
                                                ┌──────┴──────┐
                                                │             │
                                            BLOCKER?      Нет BLOCKER
                                                │             │
                                                ▼             ▼
                                          Блокирует     Передаёт в
                                          review        tl-review
```

### Правила блокировки

1. **Если есть BLOCKER**: `tl-review` НЕ запускается. Возвращаем задачу в `tl-dev` для исправления
2. **Если только WARNING**: `tl-review` запускается, но warnings включаются в review checklist
3. **Если только INFO или чисто**: `tl-review` запускается нормально

### Обновление статуса задачи

```
sync-report.verdict = "FAIL" (есть BLOCKER):
  → task.status = "in_progress"
  → Создаётся список fix-задач в sync-report.md
  → tl-dev перечитывает sync-report.md и исправляет

sync-report.verdict = "WARN" (нет BLOCKER, есть WARNING):
  → task.status = "ready_for_review"
  → sync-report.md прикладывается к review

sync-report.verdict = "PASS" (всё чисто):
  → task.status = "ready_for_review"
  → sync-report.md прикладывается к review
```

### Повторный запуск

После исправлений `tl-sync` запускается повторно:

```
tl-dev (fix) → tl-sync (re-check) → PASS? → tl-review
                                   → FAIL? → tl-dev (fix again)
```

Максимум 3 итерации. После 3-й итерации с BLOCKER --- эскалация (задача помечается как `blocked`, требуется ручное вмешательство).

---

## Примеры типичных проблем синхронизации

### Пример 1: Несовпадение имени поля (BLOCKER)

```
Контракт: CreateOrderResponse { orderNumber: string }
BE код:   return { order_number: order.number }    ← snake_case!
FE код:   const num = response.data.orderNumber    ← camelCase

Проблема: FE получает undefined вместо номера заказа.

Отчёт:
  Category: Request/Response Shape
  Severity: BLOCKER
  Details: BE returns `order_number`, FE expects `orderNumber`
  Fix: Добавить serialization middleware (camelCase) или обновить BE response
```

### Пример 2: Пропущенная обработка ошибки (WARNING)

```
Контракт: POST /api/orders → Error 409 ORDER_NUMBER_CONFLICT
BE код:   throw new ConflictException('ORDER_NUMBER_CONFLICT')    ← реализовано
FE код:   catch (e) { if (e.status === 400) ... else genericError }  ← 409 не обработан

Проблема: Пользователь видит "Неизвестная ошибка" вместо "Повторите попытку".

Отчёт:
  Category: Error Handling
  Severity: WARNING
  Details: FE does not handle 409 CONFLICT separately
  Recommendation: Добавить case для 409 с retry-логикой или сообщением
```

### Пример 3: Mock-остаток в production-коде (WARNING)

```
Файл: src/frontend/services/orderService.ts

const createOrder = async (data: CreateOrderRequest) => {
  // TODO: replace with real API call
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        id: 'fake-uuid',
        orderNumber: 'ORD-00000000-0000',
        status: 'NEW',
        total: 0,
      });
    }, 500);
  });
};

Проблема: FE использует фейковые данные вместо реального API.

Отчёт:
  Category: Mock Elimination
  Severity: BLOCKER (mock в production service, а не в тестах)
  Details: orderService.ts:5 contains setTimeout + fake data
  Fix: Заменить на реальный API-вызов: api.post('/api/orders', data)
```

### Пример 4: Дублирование типов (WARNING)

```
Файл: src/shared/types/order.types.ts
  export interface Order { id: string; orderNumber: string; ... }

Файл: src/frontend/types/order.ts
  export interface Order { id: string; orderNumber: string; ... }   ← дубликат!

Проблема: При изменении shared-типа FE-дубликат останется старым.

Отчёт:
  Category: Type Consistency
  Severity: WARNING
  Details: Order interface duplicated in src/frontend/types/order.ts
  Fix: Удалить src/frontend/types/order.ts, импортировать из @shared/types
```

### Пример 5: Отсутствие auth middleware (BLOCKER)

```
Контракт: POST /api/orders → Авторизация: Bearer Token (роль: Manager)
BE код:   router.post('/api/orders', orderController.create)   ← нет auth middleware!

Проблема: Эндпоинт доступен без авторизации.

Отчёт:
  Category: Auth Flow
  Severity: BLOCKER
  Details: POST /api/orders has no auth middleware, contract requires Manager role
  Fix: Добавить auth middleware: router.post('/api/orders', auth('Manager'), orderController.create)
```
