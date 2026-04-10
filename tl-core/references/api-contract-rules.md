# API Contract Rules

## 1. Назначение

API-контракт --- это единый источник правды о взаимодействии между backend (BE) и frontend (FE). Контракт фиксирует эндпоинты, типы данных, коды ошибок и события до начала разработки, позволяя BE и FE командам работать параллельно без блокировок.

**Ключевой принцип**: Контракт первичен. BE реализует контракт, FE потребляет контракт. Любое изменение API начинается с обновления контракта.

```
SA Artifacts           api-contract.md           BE / FE Code
──────────────         ───────────────           ─────────────
UC flows        →      Endpoints                →  Controllers / API client
Entities        →      Shared Types             →  DTOs / Interfaces
Forms           →      Request Body             →  Validation / Forms
Requirements    →      Error Codes              →  Error handling
```

---

## 2. Структура файла api-contract.md

Каждый Use Case (или группа связанных UC) получает свой файл контракта в `.tl/tasks/UC###/api-contract.md`.

### YAML Frontmatter

```yaml
---
uc_id: UC001
title: "API Contract: Create Order"
version: "1.0.0"
status: draft          # draft | agreed | implemented | deprecated
created: 2025-01-30
updated: 2025-01-30
participants:
  - role: BE
  - role: FE
---
```

### Обязательные секции

| Секция | Описание |
|--------|----------|
| Endpoints | HTTP-эндпоинты с методами, путями, телами запросов/ответов |
| Shared Types | TypeScript-интерфейсы, используемые обеими сторонами |
| Error Codes | Стандартизированные коды ошибок с описаниями |
| Events | WebSocket/SSE события (если применимо) |
| Authentication | Требования к авторизации |
| Validation Rules | Правила валидации запросов |

---

## 3. Описание эндпоинтов

Каждый эндпоинт описывается по следующему шаблону:

### Шаблон описания эндпоинта

```markdown
### [METHOD] /api/resource

**Описание**: Краткое описание действия.

**Авторизация**: Bearer Token (роль: Manager)

**Request Body**:
\```typescript
interface CreateResourceRequest {
  field1: string;       // описание
  field2: number;       // описание
  nested?: NestedDto;   // опционально
}
\```

**Response (201)**:
\```typescript
interface CreateResourceResponse {
  id: string;
  createdAt: string;    // ISO 8601
}
\```

**Ошибки**:
| Код | Тело (error) | Описание |
|-----|-------------|----------|
| 400 | VALIDATION_ERROR | Невалидные данные запроса |
| 401 | UNAUTHORIZED | Токен отсутствует или невалиден |
| 403 | FORBIDDEN | Недостаточно прав |
| 404 | NOT_FOUND | Ресурс не найден |
| 409 | CONFLICT | Конфликт (дублирование) |
| 500 | INTERNAL_ERROR | Внутренняя ошибка сервера |

**Пагинация** (для списочных эндпоинтов):
| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| page | number | 1 | Номер страницы |
| limit | number | 20 | Элементов на странице (max 100) |
| sort | string | "createdAt" | Поле сортировки |
| order | "asc" \| "desc" | "desc" | Направление сортировки |
```

### Формат ответа со списком (пагинация)

```typescript
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

---

## 4. Shared Types

Общие типы размещаются в `src/shared/types/` и используются как BE, так и FE без дублирования.

### Правила Shared Types

1. **Один файл --- одна доменная область**: `src/shared/types/order.types.ts`, `src/shared/types/client.types.ts`
2. **Только интерфейсы и типы**: никакой логики, никаких классов
3. **Экспорт через barrel-файл**: `src/shared/types/index.ts`
4. **Именование**: PascalCase, суффикс по назначению

### Соглашение об именовании

| Суффикс | Назначение | Пример |
|---------|-----------|--------|
| `Request` | Тело запроса | `CreateOrderRequest` |
| `Response` | Тело ответа | `CreateOrderResponse` |
| `Dto` | Data Transfer Object (внутренний) | `OrderItemDto` |
| `Params` | Query/Path параметры | `GetOrderParams` |
| `Filter` | Фильтрация списков | `OrderFilter` |
| (без суффикса) | Доменная сущность | `Order`, `OrderStatus` |

### Пример структуры

```
src/shared/types/
├── index.ts                # barrel export
├── common.types.ts         # PaginatedResponse, ApiError, etc.
├── order.types.ts          # Order, CreateOrderRequest, etc.
├── client.types.ts         # Client, ClientFilter, etc.
└── product.types.ts        # Product, ProductParams, etc.
```

### Пример файла типов

```typescript
// src/shared/types/order.types.ts

export type OrderStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Order {
  id: string;
  orderNumber: string;
  date: string;              // ISO 8601
  clientId: string;
  status: OrderStatus;
  total: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  price: number;
  amount: number;
}

export interface CreateOrderRequest {
  clientId: string;
  items: CreateOrderItemRequest[];
  notes?: string;
}

export interface CreateOrderItemRequest {
  productId: string;
  quantity: number;
}

export interface CreateOrderResponse {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
}
```

---

## 5. Версионирование

### Семантическое версионирование контракта

Контракт использует формат `MAJOR.MINOR.PATCH`:

| Изменение | Версия | Пример |
|-----------|--------|--------|
| Breaking change (удаление поля, изменение типа) | MAJOR | 1.0.0 → 2.0.0 |
| Новый эндпоинт или опциональное поле | MINOR | 1.0.0 → 1.1.0 |
| Уточнение описания, исправление опечатки | PATCH | 1.0.0 → 1.0.1 |

### Когда обновлять версию

- **Обязательно** (MAJOR): удаление эндпоинта/поля, изменение типа поля, изменение формата ответа
- **Обязательно** (MINOR): добавление нового эндпоинта, добавление опционального поля в запрос/ответ
- **По желанию** (PATCH): обновление описаний, примеров, уточнение валидации

### Процесс обновления

```
1. Обновить api-contract.md (изменить version, updated, описать изменения)
2. Добавить секцию ## Changelog в конец файла
3. Уведомить BE и FE о breaking changes (MAJOR)
4. BE и FE обновляют код в соответствии с новой версией
5. tl-sync проверяет соответствие после обновления
```

### Формат Changelog

```markdown
## Changelog

### v2.0.0 (2025-02-15)
- **BREAKING**: Поле `client` переименовано в `clientId` (string UUID)
- **BREAKING**: Удалён эндпоинт DELETE /api/orders/:id/items/:itemId

### v1.1.0 (2025-02-01)
- Добавлен эндпоинт GET /api/orders/:id/history
- Добавлено опциональное поле `priority` в CreateOrderRequest

### v1.0.0 (2025-01-30)
- Начальная версия контракта
```

---

## 6. Events

Формат описания WebSocket/SSE событий для real-time взаимодействия.

### Шаблон описания события

```markdown
### Event: order:status_changed

**Канал**: /ws/orders/:orderId
**Направление**: Server → Client
**Триггер**: Изменение статуса заказа

**Payload**:
\```typescript
interface OrderStatusChangedEvent {
  orderId: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  changedAt: string;       // ISO 8601
  changedBy: string;       // userId
}
\```
```

### Соглашения по именованию событий

| Формат | Пример | Описание |
|--------|--------|----------|
| `entity:action` | `order:created` | Создание сущности |
| `entity:action_completed` | `order:status_changed` | Завершённое действие |
| `entity:action_failed` | `order:payment_failed` | Ошибка при действии |

### Общий формат конверта события

```typescript
interface WebSocketMessage<T> {
  event: string;          // имя события
  payload: T;             // типизированные данные
  timestamp: string;      // ISO 8601
  correlationId?: string; // для отслеживания цепочки
}
```

---

## 7. Authentication

### Описание авторизации в контракте

Каждый эндпоинт должен указывать требования к авторизации:

```markdown
**Авторизация**: Bearer Token
**Роли**: Manager, Admin
**Заголовок**: Authorization: Bearer <jwt_token>
```

### Стандартные заголовки авторизации

```typescript
interface AuthHeaders {
  'Authorization': `Bearer ${string}`;   // JWT token
  'X-Request-Id'?: string;               // для трассировки
  'X-Tenant-Id'?: string;                // для мультитенантности
}
```

### Уровни доступа в контракте

| Уровень | Обозначение | Описание |
|---------|------------|----------|
| Public | `Авторизация: Не требуется` | Открытый эндпоинт |
| Authenticated | `Авторизация: Bearer Token` | Любой авторизованный пользователь |
| Role-based | `Авторизация: Bearer Token (роль: X)` | Конкретная роль |
| Owner | `Авторизация: Bearer Token (owner)` | Только владелец ресурса |

### Ошибки авторизации

Контракт должен описывать стандартные ответы:

```typescript
// 401 Unauthorized --- токен отсутствует или невалиден
interface UnauthorizedError {
  error: 'UNAUTHORIZED';
  message: 'Authentication required';
}

// 403 Forbidden --- токен валиден, но прав недостаточно
interface ForbiddenError {
  error: 'FORBIDDEN';
  message: 'Insufficient permissions';
  required: string[];     // требуемые роли
}
```

---

## 8. Validation Rules

### Валидация запросов (Zod-схемы)

Контракт должен фиксировать правила валидации, которые реализуются через Zod-схемы в коде:

```typescript
// Контракт фиксирует правила:
// clientId: UUID, обязательное
// items: массив, минимум 1 элемент
// items[].productId: UUID, обязательное
// items[].quantity: целое число > 0
// notes: строка, максимум 500 символов, опциональное

// Соответствующая Zod-схема:
import { z } from 'zod';

export const CreateOrderSchema = z.object({
  clientId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1, 'Order must have at least one item'),
  notes: z.string().max(500).optional(),
});
```

### Формат описания валидации в контракте

```markdown
### Validation Rules

| Поле | Тип | Обязательное | Правила | Сообщение об ошибке |
|------|-----|-------------|---------|---------------------|
| clientId | string | Да | UUID v4 | "Invalid client ID format" |
| items | array | Да | min 1 | "Order must have at least one item" |
| items[].productId | string | Да | UUID v4 | "Invalid product ID format" |
| items[].quantity | number | Да | int, > 0 | "Quantity must be a positive integer" |
| notes | string | Нет | max 500 | "Notes must not exceed 500 characters" |
```

### Гарантии формы ответа

Контракт гарантирует, что BE всегда возвращает ответ определённой формы:

```typescript
// Успешный ответ всегда содержит эти поля
interface SuccessResponse<T> {
  data: T;
}

// Ответ с ошибкой всегда содержит эти поля
interface ErrorResponse {
  error: string;          // код ошибки (UPPER_SNAKE_CASE)
  message: string;        // человекочитаемое описание
  details?: Record<string, string[]>;  // ошибки по полям (для валидации)
}

// Пример ошибки валидации
{
  "error": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": {
    "clientId": ["Invalid client ID format"],
    "items": ["Order must have at least one item"]
  }
}
```

---

## 9. Генерация из SA артефактов

Скилл `tl-plan` автоматически генерирует заготовку `api-contract.md` из артефактов SA.

### Источники данных

| SA артефакт | Что извлекается | Куда попадает |
|-------------|-----------------|---------------|
| `UC*.md` → Main Flow | HTTP-действия (создать, получить, обновить) | Endpoints |
| `UC*.md` → Input/Output | Поля ввода/вывода | Request/Response Body |
| `entities/*.md` → Attributes | Атрибуты сущностей | Shared Types |
| `entities/*.md` → Relationships | Связи между сущностями | Nested types, IDs |
| `forms/*.md` → Elements | Элементы форм с валидацией | Validation Rules |
| `enumerations/*.md` → Values | Перечисления | Type Aliases (union types) |
| `FR-*.md` → Rules | Бизнес-правила | Validation Rules, Error Codes |

### Алгоритм генерации

```
1. Читаем UC файл → определяем CRUD-операции
   - "Пользователь создаёт" → POST /api/resource
   - "Пользователь просматривает список" → GET /api/resource
   - "Пользователь редактирует" → PUT /api/resource/:id
   - "Пользователь удаляет" → DELETE /api/resource/:id

2. Читаем Entity файл → формируем Shared Types
   - Атрибуты → поля интерфейса
   - Типы SA (String, Number, DateTime) → TypeScript-типы
   - Обязательность → required/optional
   - Enumerations → union types

3. Читаем Form файл → формируем Request Body + Validation
   - Элементы формы → поля запроса
   - Валидация формы → Zod-правила
   - Обязательные поля → required-поля в интерфейсе

4. Читаем Requirements → формируем Error Codes
   - Бизнес-правила → специфические ошибки (BR_VIOLATION)
   - Ограничения → валидационные ошибки
```

---

## 10. Anti-patterns

### Что НЕЛЬЗЯ делать в API-контрактах

| Anti-pattern | Почему плохо | Правильный подход |
|-------------|-------------|-------------------|
| Хардкодить URL (`http://localhost:3000/api/...`) | Ломается в разных окружениях | Указывать только path: `/api/orders` |
| Использовать `any` в типах | Теряется type safety | Описывать конкретные типы |
| Пропускать ошибки | FE не знает, что обрабатывать | Описывать ВСЕ возможные ошибки |
| Использовать `object` вместо интерфейса | Нет информации о полях | Создавать конкретный interface |
| Не версионировать | Невозможно отследить breaking changes | Всегда указывать version |
| Дублировать типы в BE и FE | Рассинхронизация типов | Использовать shared types |
| Смешивать camelCase и snake_case | Путаница | Один стиль: camelCase для JSON |
| Не указывать формат дат | BE и FE интерпретируют по-разному | Всегда: ISO 8601 (`string`) |
| Возвращать разную структуру ошибок | FE не может парсить ошибки единообразно | Единый `ErrorResponse` формат |
| Описывать только happy path | FE не готов к ошибкам | Описывать все сценарии |

### Примеры anti-patterns

```typescript
// WRONG: использование any
interface BadResponse {
  data: any;              // Что здесь? Никто не знает
  meta: any;
}

// CORRECT: конкретные типы
interface GoodResponse {
  data: Order;
  meta: PaginationMeta;
}

// WRONG: разная структура ошибок
// Эндпоинт A: { error: "not found" }
// Эндпоинт B: { message: "Not Found", code: 404 }
// Эндпоинт C: { err: { msg: "not found" } }

// CORRECT: единая структура
interface ErrorResponse {
  error: string;          // UPPER_SNAKE_CASE код
  message: string;        // Человекочитаемое описание
  details?: Record<string, string[]>;
}

// WRONG: хардкодить URL
const API_URL = 'http://localhost:3000/api/orders';

// CORRECT: использовать относительный path
const ORDERS_PATH = '/api/orders';
```

---

## Полный пример: api-contract.md для UC001 "Create Order"

```markdown
---
uc_id: UC001
title: "API Contract: Create Order"
version: "1.0.0"
status: draft
created: 2025-01-30
updated: 2025-01-30
participants:
  - role: BE
  - role: FE
---

# API Contract: UC001 Create Order

## Shared Types

### Файл: src/shared/types/order.types.ts

\```typescript
export type OrderStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Order {
  id: string;
  orderNumber: string;
  date: string;
  clientId: string;
  clientName: string;
  status: OrderStatus;
  total: number;
  notes?: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  amount: number;
}

export interface CreateOrderRequest {
  clientId: string;
  items: CreateOrderItemRequest[];
  notes?: string;
}

export interface CreateOrderItemRequest {
  productId: string;
  quantity: number;
}

export interface CreateOrderResponse {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  items: OrderItemResponse[];
  createdAt: string;
}

export interface OrderItemResponse {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  amount: number;
}
\```

### Файл: src/shared/types/common.types.ts

\```typescript
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, string[]>;
}
\```

## Endpoints

### POST /api/orders

**Описание**: Создание нового заказа.

**Авторизация**: Bearer Token (роль: Manager)

**Request Body**:
\```typescript
CreateOrderRequest
\```

**Validation Rules**:
| Поле | Тип | Обязательное | Правила | Сообщение об ошибке |
|------|-----|-------------|---------|---------------------|
| clientId | string | Да | UUID v4 | "Invalid client ID format" |
| items | array | Да | min 1 | "Order must have at least one item" |
| items[].productId | string | Да | UUID v4 | "Invalid product ID format" |
| items[].quantity | number | Да | int, > 0 | "Quantity must be a positive integer" |
| notes | string | Нет | max 500 | "Notes must not exceed 500 characters" |

**Response (201)**:
\```typescript
CreateOrderResponse
\```

**Пример запроса**:
\```json
{
  "clientId": "550e8400-e29b-41d4-a716-446655440001",
  "items": [
    { "productId": "550e8400-e29b-41d4-a716-446655440010", "quantity": 2 },
    { "productId": "550e8400-e29b-41d4-a716-446655440011", "quantity": 1 }
  ],
  "notes": "Доставка до 15:00"
}
\```

**Пример ответа (201)**:
\```json
{
  "id": "550e8400-e29b-41d4-a716-446655440099",
  "orderNumber": "ORD-20250130-0001",
  "status": "NEW",
  "total": 450.00,
  "items": [
    {
      "id": "item-uuid-1",
      "productId": "550e8400-e29b-41d4-a716-446655440010",
      "productName": "Widget A",
      "quantity": 2,
      "price": 100.00,
      "amount": 200.00
    },
    {
      "id": "item-uuid-2",
      "productId": "550e8400-e29b-41d4-a716-446655440011",
      "productName": "Widget B",
      "quantity": 1,
      "price": 250.00,
      "amount": 250.00
    }
  ],
  "createdAt": "2025-01-30T10:00:00.000Z"
}
\```

**Ошибки**:
| HTTP | error | message | Когда |
|------|-------|---------|-------|
| 400 | VALIDATION_ERROR | Request validation failed | Невалидные данные |
| 401 | UNAUTHORIZED | Authentication required | Нет токена |
| 403 | FORBIDDEN | Insufficient permissions | Нет роли Manager |
| 404 | CLIENT_NOT_FOUND | Client not found | clientId не существует |
| 404 | PRODUCT_NOT_FOUND | Product not found | productId не существует |
| 409 | ORDER_NUMBER_CONFLICT | Order number conflict | Коллизия номера (retry) |
| 422 | BUSINESS_RULE_VIOLATION | Cannot create order: {reason} | Нарушение бизнес-правила |
| 500 | INTERNAL_ERROR | Internal server error | Непредвиденная ошибка |

**Пример ошибки валидации (400)**:
\```json
{
  "error": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": {
    "items": ["Order must have at least one item"],
    "clientId": ["Invalid client ID format"]
  }
}
\```

### GET /api/orders

**Описание**: Получение списка заказов с пагинацией и фильтрацией.

**Авторизация**: Bearer Token (роль: Manager)

**Query Parameters**:
| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| page | number | 1 | Номер страницы |
| limit | number | 20 | Элементов на странице (max 100) |
| sort | string | "createdAt" | Поле сортировки |
| order | "asc" \| "desc" | "desc" | Направление |
| status | OrderStatus | - | Фильтр по статусу |
| clientId | string | - | Фильтр по клиенту |

**Response (200)**:
\```typescript
PaginatedResponse<Order>
\```

### GET /api/orders/:id

**Описание**: Получение заказа по ID.

**Авторизация**: Bearer Token (роль: Manager)

**Path Parameters**:
| Параметр | Тип | Описание |
|----------|-----|----------|
| id | string (UUID) | ID заказа |

**Response (200)**:
\```typescript
Order
\```

**Ошибки**:
| HTTP | error | Когда |
|------|-------|-------|
| 401 | UNAUTHORIZED | Нет токена |
| 404 | ORDER_NOT_FOUND | Заказ не найден |

## Events

### Event: order:created

**Канал**: /ws/orders
**Направление**: Server → Client
**Триггер**: Успешное создание заказа

\```typescript
interface OrderCreatedEvent {
  orderId: string;
  orderNumber: string;
  clientId: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  createdBy: string;
}
\```

### Event: order:status_changed

**Канал**: /ws/orders/:orderId
**Направление**: Server → Client
**Триггер**: Изменение статуса заказа

\```typescript
interface OrderStatusChangedEvent {
  orderId: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  changedAt: string;
  changedBy: string;
}
\```

## Authentication

**Метод**: JWT Bearer Token

**Заголовок**: `Authorization: Bearer <jwt_token>`

**Требуемая роль**: Manager (для всех эндпоинтов данного UC)

**Ответы при ошибках авторизации**:
- 401: Токен отсутствует, истёк или невалиден
- 403: Токен валиден, но роль не Manager

## Changelog

### v1.0.0 (2025-01-30)
- Начальная версия контракта
- Эндпоинты: POST /api/orders, GET /api/orders, GET /api/orders/:id
- Shared Types: Order, OrderItem, CreateOrderRequest, CreateOrderResponse
- Events: order:created, order:status_changed
```
