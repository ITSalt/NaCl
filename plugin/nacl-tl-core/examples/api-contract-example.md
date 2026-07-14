# Example: API Contract for UC001 Create Order

This example demonstrates a fully completed `api-contract.md` file as it would appear in `.tl/tasks/UC001/api-contract.md`. It serves as the reference template for all API contracts in the project.

---

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

```typescript
export type OrderStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Order {
  id: string;                 // UUID v4
  orderNumber: string;        // Формат: ORD-YYYYMMDD-NNNN
  date: string;               // ISO 8601
  clientId: string;           // UUID v4, ссылка на clients.id
  clientName: string;         // Денормализованное имя клиента для отображения
  status: OrderStatus;
  total: number;              // Сумма заказа, 2 знака после запятой
  notes?: string;             // Комментарий к заказу
  items: OrderItem[];
  createdAt: string;          // ISO 8601
  updatedAt: string;          // ISO 8601
}

export interface OrderItem {
  id: string;                 // UUID v4
  productId: string;          // UUID v4, ссылка на products.id
  productName: string;        // Денормализованное имя продукта
  quantity: number;           // Целое число > 0
  price: number;              // Цена за единицу на момент заказа
  amount: number;             // Рассчитанная сумма: quantity * price
}

export interface CreateOrderRequest {
  clientId: string;           // UUID v4
  items: CreateOrderItemRequest[];
  notes?: string;             // Макс. 500 символов
}

export interface CreateOrderItemRequest {
  productId: string;          // UUID v4
  quantity: number;           // Целое число > 0
}

export interface CreateOrderResponse {
  id: string;
  orderNumber: string;
  status: OrderStatus;        // Всегда "NEW" при создании
  total: number;
  items: OrderItemResponse[];
  createdAt: string;          // ISO 8601
}

export interface OrderItemResponse {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  amount: number;
}

export interface OrderListParams {
  page?: number;              // По умолчанию: 1
  limit?: number;             // По умолчанию: 20, макс: 100
  sort?: string;              // По умолчанию: "createdAt"
  order?: 'asc' | 'desc';    // По умолчанию: "desc"
  status?: OrderStatus;       // Фильтр по статусу
  clientId?: string;          // Фильтр по клиенту
  dateFrom?: string;          // ISO 8601, фильтр по дате (от)
  dateTo?: string;            // ISO 8601, фильтр по дате (до)
}
```

### Файл: src/shared/types/common.types.ts

```typescript
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;             // Текущая страница
    limit: number;            // Элементов на странице
    total: number;            // Всего записей
    totalPages: number;       // Всего страниц
  };
}

export interface ErrorResponse {
  error: string;              // Код ошибки (UPPER_SNAKE_CASE)
  message: string;            // Человекочитаемое описание
  details?: Record<string, string[]>;  // Ошибки по полям (для валидации)
}

export interface SuccessResponse<T> {
  data: T;
}
```

---

## Endpoints

### POST /api/orders

**Описание**: Создание нового заказа. Система автоматически рассчитывает цены на основе текущих цен продуктов и генерирует уникальный номер заказа.

**Авторизация**: Bearer Token (роль: customer, admin)

**Request Body**:
```typescript
CreateOrderRequest
```

**Validation Rules**:

| Поле | Тип | Обязательное | Правила | Сообщение об ошибке |
|------|-----|-------------|---------|---------------------|
| clientId | string | Да | UUID v4, должен существовать в clients | "Invalid client ID format" / "Client not found" |
| items | array | Да | min 1, max 100 элементов | "Order must have at least one item" / "Order cannot have more than 100 items" |
| items[].productId | string | Да | UUID v4, должен существовать в products | "Invalid product ID format" / "Product not found" |
| items[].quantity | number | Да | int, > 0, <= 9999 | "Quantity must be a positive integer" / "Quantity cannot exceed 9999" |
| notes | string | Нет | max 500 символов, trim | "Notes must not exceed 500 characters" |

**Zod Schema**:
```typescript
import { z } from 'zod';

export const CreateOrderItemSchema = z.object({
  productId: z.string().uuid('Invalid product ID format'),
  quantity: z
    .number()
    .int('Quantity must be an integer')
    .positive('Quantity must be a positive integer')
    .max(9999, 'Quantity cannot exceed 9999'),
});

export const CreateOrderSchema = z.object({
  clientId: z.string().uuid('Invalid client ID format'),
  items: z
    .array(CreateOrderItemSchema)
    .min(1, 'Order must have at least one item')
    .max(100, 'Order cannot have more than 100 items'),
  notes: z
    .string()
    .max(500, 'Notes must not exceed 500 characters')
    .transform((val) => val.trim())
    .optional(),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
```

**Response (201)**:
```typescript
CreateOrderResponse
```

**Пример запроса**:
```json
{
  "clientId": "550e8400-e29b-41d4-a716-446655440001",
  "items": [
    { "productId": "550e8400-e29b-41d4-a716-446655440010", "quantity": 2 },
    { "productId": "550e8400-e29b-41d4-a716-446655440011", "quantity": 1 }
  ],
  "notes": "Delivery before 3 PM"
}
```

**Пример ответа (201)**:
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "orderNumber": "ORD-20250130-0001",
  "status": "NEW",
  "total": 450.00,
  "items": [
    {
      "id": "f1e2d3c4-b5a6-7890-abcd-ef1234567891",
      "productId": "550e8400-e29b-41d4-a716-446655440010",
      "productName": "Widget A",
      "quantity": 2,
      "price": 100.00,
      "amount": 200.00
    },
    {
      "id": "f1e2d3c4-b5a6-7890-abcd-ef1234567892",
      "productId": "550e8400-e29b-41d4-a716-446655440011",
      "productName": "Widget B",
      "quantity": 1,
      "price": 250.00,
      "amount": 250.00
    }
  ],
  "createdAt": "2025-01-30T10:00:00.000Z"
}
```

**Ошибки**:

| HTTP | error | message | Когда |
|------|-------|---------|-------|
| 400 | VALIDATION_ERROR | Request validation failed | Невалидные данные (см. details по полям) |
| 401 | UNAUTHORIZED | Authentication required | Токен отсутствует или истёк |
| 403 | FORBIDDEN | Insufficient permissions | Нет роли customer или admin |
| 404 | CLIENT_NOT_FOUND | Client not found | clientId не существует в базе |
| 404 | PRODUCT_NOT_FOUND | Product not found: {productId} | productId не существует в базе |
| 409 | ORDER_NUMBER_CONFLICT | Order number generation conflict, retry | Коллизия при генерации номера (клиент должен повторить запрос) |
| 422 | INSUFFICIENT_STOCK | Insufficient stock for product: {productName} | Запрошенное количество превышает остаток |
| 500 | INTERNAL_ERROR | Internal server error | Непредвиденная ошибка сервера |

**Пример ошибки валидации (400)**:
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": {
    "items": ["Order must have at least one item"],
    "clientId": ["Invalid client ID format"]
  }
}
```

**Пример бизнес-ошибки (422)**:
```json
{
  "error": "INSUFFICIENT_STOCK",
  "message": "Insufficient stock for product: Widget A",
  "details": {
    "productId": ["550e8400-e29b-41d4-a716-446655440010"],
    "requested": ["10"],
    "available": ["3"]
  }
}
```

---

### GET /api/orders/:id

**Описание**: Получение полной информации о заказе по его ID, включая все позиции.

**Авторизация**: Bearer Token (роль: customer, admin)

**Path Parameters**:

| Параметр | Тип | Описание |
|----------|-----|----------|
| id | string (UUID v4) | Уникальный идентификатор заказа |

**Response (200)**:
```typescript
Order
```

**Пример запроса**:
```
GET /api/orders/a1b2c3d4-e5f6-7890-abcd-ef1234567890
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Пример ответа (200)**:
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "orderNumber": "ORD-20250130-0001",
  "date": "2025-01-30T10:00:00.000Z",
  "clientId": "550e8400-e29b-41d4-a716-446655440001",
  "clientName": "Acme Corporation",
  "status": "NEW",
  "total": 450.00,
  "notes": "Delivery before 3 PM",
  "items": [
    {
      "id": "f1e2d3c4-b5a6-7890-abcd-ef1234567891",
      "productId": "550e8400-e29b-41d4-a716-446655440010",
      "productName": "Widget A",
      "quantity": 2,
      "price": 100.00,
      "amount": 200.00
    },
    {
      "id": "f1e2d3c4-b5a6-7890-abcd-ef1234567892",
      "productId": "550e8400-e29b-41d4-a716-446655440011",
      "productName": "Widget B",
      "quantity": 1,
      "price": 250.00,
      "amount": 250.00
    }
  ],
  "createdAt": "2025-01-30T10:00:00.000Z",
  "updatedAt": "2025-01-30T10:00:00.000Z"
}
```

**Ошибки**:

| HTTP | error | message | Когда |
|------|-------|---------|-------|
| 400 | VALIDATION_ERROR | Invalid order ID format | id не является валидным UUID |
| 401 | UNAUTHORIZED | Authentication required | Токен отсутствует или истёк |
| 403 | FORBIDDEN | Insufficient permissions | Нет роли customer/admin или customer пытается получить чужой заказ |
| 404 | ORDER_NOT_FOUND | Order not found | Заказ с таким id не существует |

---

### GET /api/orders

**Описание**: Получение списка заказов с пагинацией, сортировкой и фильтрацией. Роль customer видит только свои заказы, admin видит все.

**Авторизация**: Bearer Token (роль: customer, admin)

**Query Parameters**:

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| page | number | 1 | Номер страницы (>= 1) |
| limit | number | 20 | Элементов на странице (1-100) |
| sort | string | "createdAt" | Поле сортировки. Допустимые: "createdAt", "updatedAt", "total", "orderNumber", "status" |
| order | "asc" \| "desc" | "desc" | Направление сортировки |
| status | OrderStatus | - | Фильтр по статусу заказа |
| clientId | string (UUID) | - | Фильтр по клиенту (только для admin) |
| dateFrom | string (ISO 8601) | - | Фильтр: заказы созданные после этой даты (включительно) |
| dateTo | string (ISO 8601) | - | Фильтр: заказы созданные до этой даты (включительно) |

**Response (200)**:
```typescript
PaginatedResponse<Order>
```

**Пример запроса**:
```
GET /api/orders?page=1&limit=10&status=NEW&sort=createdAt&order=desc
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Пример ответа (200)**:
```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "orderNumber": "ORD-20250130-0001",
      "date": "2025-01-30T10:00:00.000Z",
      "clientId": "550e8400-e29b-41d4-a716-446655440001",
      "clientName": "Acme Corporation",
      "status": "NEW",
      "total": 450.00,
      "notes": "Delivery before 3 PM",
      "items": [
        {
          "id": "f1e2d3c4-b5a6-7890-abcd-ef1234567891",
          "productId": "550e8400-e29b-41d4-a716-446655440010",
          "productName": "Widget A",
          "quantity": 2,
          "price": 100.00,
          "amount": 200.00
        }
      ],
      "createdAt": "2025-01-30T10:00:00.000Z",
      "updatedAt": "2025-01-30T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

**Ошибки**:

| HTTP | error | message | Когда |
|------|-------|---------|-------|
| 400 | VALIDATION_ERROR | Invalid query parameters | Невалидные параметры пагинации/фильтрации |
| 401 | UNAUTHORIZED | Authentication required | Токен отсутствует или истёк |
| 403 | FORBIDDEN | Insufficient permissions | Нет роли customer или admin |

---

## Events

### Event: order:created

**Канал**: /ws/orders
**Направление**: Server -> Client
**Триггер**: Успешное создание заказа (после commit в БД)

**Payload**:
```typescript
interface OrderCreatedEvent {
  orderId: string;            // UUID созданного заказа
  orderNumber: string;        // Сгенерированный номер ORD-YYYYMMDD-NNNN
  clientId: string;           // UUID клиента
  clientName: string;         // Имя клиента
  status: OrderStatus;        // Всегда "NEW"
  total: number;              // Итоговая сумма заказа
  itemCount: number;          // Количество позиций
  createdAt: string;          // ISO 8601
  createdBy: string;          // UUID пользователя, создавшего заказ
}
```

**Пример события**:
```json
{
  "event": "order:created",
  "payload": {
    "orderId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "orderNumber": "ORD-20250130-0001",
    "clientId": "550e8400-e29b-41d4-a716-446655440001",
    "clientName": "Acme Corporation",
    "status": "NEW",
    "total": 450.00,
    "itemCount": 2,
    "createdAt": "2025-01-30T10:00:00.000Z",
    "createdBy": "user-uuid-001"
  },
  "timestamp": "2025-01-30T10:00:00.123Z",
  "correlationId": "req-abc-123"
}
```

**Кто получает**: Все авторизованные пользователи, подписанные на канал `/ws/orders`.

---

### Event: order:status_changed

**Канал**: /ws/orders/:orderId
**Направление**: Server -> Client
**Триггер**: Изменение статуса заказа (переход между состояниями)

**Payload**:
```typescript
interface OrderStatusChangedEvent {
  orderId: string;            // UUID заказа
  orderNumber: string;        // Номер заказа для отображения
  previousStatus: OrderStatus; // Статус до изменения
  newStatus: OrderStatus;     // Новый статус
  changedAt: string;          // ISO 8601
  changedBy: string;          // UUID пользователя, изменившего статус
  reason?: string;            // Причина (обязательна для CANCELLED)
}
```

**Допустимые переходы статусов**:
```
NEW -> IN_PROGRESS     (начало обработки)
NEW -> CANCELLED       (отмена нового заказа)
IN_PROGRESS -> COMPLETED   (выполнение)
IN_PROGRESS -> CANCELLED   (отмена в процессе)
```

**Пример события**:
```json
{
  "event": "order:status_changed",
  "payload": {
    "orderId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "orderNumber": "ORD-20250130-0001",
    "previousStatus": "NEW",
    "newStatus": "IN_PROGRESS",
    "changedAt": "2025-01-30T11:30:00.000Z",
    "changedBy": "user-uuid-002"
  },
  "timestamp": "2025-01-30T11:30:00.456Z",
  "correlationId": "req-def-456"
}
```

**Кто получает**: Все авторизованные пользователи, подписанные на канал `/ws/orders/:orderId`.

### Общий формат конверта WebSocket

```typescript
interface WebSocketMessage<T> {
  event: string;              // Имя события (entity:action)
  payload: T;                 // Типизированные данные
  timestamp: string;          // ISO 8601, время отправки
  correlationId?: string;     // Для трассировки цепочки запрос-событие
}
```

---

## Authentication

**Метод**: JWT Bearer Token

**Заголовок**: `Authorization: Bearer <jwt_token>`

**Требуемые роли для эндпоинтов UC001**:

| Эндпоинт | Роли | Особенности |
|-----------|------|-------------|
| POST /api/orders | customer, admin | customer создаёт от своего имени; admin может указать любой clientId |
| GET /api/orders/:id | customer, admin | customer видит только свои заказы; admin видит все |
| GET /api/orders | customer, admin | customer видит только свои; admin видит все + может фильтровать по clientId |

**Стандартные заголовки**:
```typescript
interface AuthHeaders {
  'Authorization': `Bearer ${string}`;   // JWT token (обязательный)
  'X-Request-Id'?: string;               // Для трассировки запросов (опциональный)
}
```

**JWT Payload (claims)**:
```typescript
interface JwtPayload {
  sub: string;                // userId (UUID)
  email: string;              // email пользователя
  role: 'customer' | 'admin'; // роль пользователя
  iat: number;                // issued at (Unix timestamp)
  exp: number;                // expiration (Unix timestamp)
}
```

**Ответы при ошибках авторизации**:

```typescript
// 401 Unauthorized -- токен отсутствует, истёк или невалиден
{
  "error": "UNAUTHORIZED",
  "message": "Authentication required"
}

// 403 Forbidden -- токен валиден, но прав недостаточно
{
  "error": "FORBIDDEN",
  "message": "Insufficient permissions",
  "details": {
    "required": ["admin"],
    "current": ["customer"]
  }
}
```

---

## Validation Rules

### Сводная таблица валидации для POST /api/orders

| Поле | Тип | Обяз. | Правила | Сообщение об ошибке |
|------|-----|-------|---------|---------------------|
| clientId | string | Да | UUID v4 | "Invalid client ID format" |
| clientId | string | Да | exists in clients table | "Client not found" |
| items | array | Да | min 1 | "Order must have at least one item" |
| items | array | Да | max 100 | "Order cannot have more than 100 items" |
| items[].productId | string | Да | UUID v4 | "Invalid product ID format" |
| items[].productId | string | Да | exists in products table | "Product not found" |
| items[].quantity | number | Да | integer | "Quantity must be an integer" |
| items[].quantity | number | Да | > 0 | "Quantity must be a positive integer" |
| items[].quantity | number | Да | <= 9999 | "Quantity cannot exceed 9999" |
| notes | string | Нет | max 500 chars | "Notes must not exceed 500 characters" |

### Валидация query parameters для GET /api/orders

| Параметр | Тип | Правила | Значение при ошибке |
|----------|-----|---------|---------------------|
| page | number | int, >= 1 | 1 (fallback) |
| limit | number | int, 1-100 | 20 (fallback) |
| sort | string | одно из: "createdAt", "updatedAt", "total", "orderNumber", "status" | "createdAt" (fallback) |
| order | string | "asc" \| "desc" | "desc" (fallback) |
| status | string | одно из OrderStatus values | Игнорируется (нет фильтра) |
| clientId | string | UUID v4 | 400 VALIDATION_ERROR |
| dateFrom | string | ISO 8601 | 400 VALIDATION_ERROR |
| dateTo | string | ISO 8601, >= dateFrom | 400 VALIDATION_ERROR |

### Бизнес-правила валидации

| Правило | Код ошибки | HTTP | Описание |
|---------|-----------|------|----------|
| BR01 | Автоматическое | - | Номер заказа генерируется: ORD-YYYYMMDD-NNNN |
| BR02 | VALIDATION_ERROR | 400 | Заказ должен содержать хотя бы одну позицию |
| BR03 | Автоматическое | - | Сумма рассчитывается: sum(quantity * price) |
| BR04 | Автоматическое | - | Цена фиксируется на момент создания заказа |
| BR05 | INTERNAL_ERROR | 500 | Заказ + позиции сохраняются в одной транзакции |
| BR06 | Автоматическое | - | Начальный статус всегда NEW |
| BR07 | VALIDATION_ERROR | 400 | Количество должно быть положительным целым числом |
| Stock check | INSUFFICIENT_STOCK | 422 | Количество не должно превышать остаток |

### Гарантии формата ответов

```typescript
// Успешный ответ -- всегда содержит data
interface SuccessResponse<T> {
  data: T;
}

// Успешный ответ списка -- всегда содержит data + pagination
interface PaginatedSuccessResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Ответ с ошибкой -- всегда содержит error + message
interface ErrorResponse {
  error: string;              // UPPER_SNAKE_CASE код
  message: string;            // Человекочитаемое описание (английский)
  details?: Record<string, string[]>;  // Детализация по полям
}
```

---

## Changelog

### v1.0.0 (2025-01-30)

**Начальная версия контракта.**

- Добавлены эндпоинты:
  - POST /api/orders -- создание заказа
  - GET /api/orders/:id -- получение заказа по ID
  - GET /api/orders -- список заказов с пагинацией и фильтрацией
- Добавлены Shared Types:
  - Order, OrderItem, OrderStatus
  - CreateOrderRequest, CreateOrderItemRequest
  - CreateOrderResponse, OrderItemResponse
  - OrderListParams
  - PaginatedResponse<T>, ErrorResponse, SuccessResponse<T>
- Добавлены Events:
  - order:created -- уведомление о создании заказа
  - order:status_changed -- уведомление об изменении статуса
- Добавлена авторизация:
  - JWT Bearer Token
  - Роли: customer, admin
  - Разграничение доступа: customer видит только свои заказы
- Добавлены Validation Rules:
  - Zod-схема для CreateOrderRequest
  - Таблицы валидации для всех полей
  - Бизнес-правила BR01-BR07
  - Проверка остатков (stock check)
```

---

## Key Points Demonstrated

1. **YAML Frontmatter**: Contains uc_id, version, status, dates, and participants (BE/FE roles)
2. **Shared Types in TypeScript**: All interfaces in one place with JSDoc-style comments, ready for `src/shared/types/`
3. **Three Endpoints**: POST (create), GET by ID, GET list -- covering the full CRUD read + create cycle for UC001
4. **Zod Schema**: Complete validation schema matching the contract rules, ready to copy into codebase
5. **Realistic Error Codes**: Differentiated between validation (400), auth (401/403), not-found (404), business logic (422), and server (500) errors
6. **Pagination Standard**: Uses `PaginatedResponse<T>` with page/limit/total/totalPages
7. **WebSocket Events**: Two events with typed payloads, channel patterns, and delivery scope
8. **Authentication Section**: JWT claims, role-based access, per-endpoint role matrix
9. **Validation Tables**: Both request body and query parameter validation with error messages
10. **Business Rules Mapping**: BR01-BR07 mapped to error codes and HTTP statuses
11. **Response Format Guarantees**: Consistent SuccessResponse/ErrorResponse shapes
12. **Changelog**: Version 1.0.0 entry documenting initial contract scope
