# Code Style Guide for Node.js/TypeScript

## Overview

This document defines the code style conventions for Node.js and TypeScript projects within the TL workflow. Consistent code style improves readability, reduces cognitive load, and enables effective code review. All code produced by TL skills MUST follow these conventions.

## Key Principle: Clarity Over Cleverness

**CRITICAL**: Write code for humans first, computers second. Code is read far more often than it is written. Optimize for maintainability and clarity, not brevity.

```
📝 Naming:     Descriptive and consistent
📐 Formatting: Automated with Prettier/ESLint
📁 Structure:  Modular and organized
🛡️ Safety:     TypeScript strict mode
```

---

## TypeScript Configuration

### Recommended tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Required Strict Mode Settings

| Setting | Value | Reason |
|---------|-------|--------|
| `strict` | `true` | Enables all strict type-checking |
| `noImplicitAny` | `true` | (via strict) No implicit `any` types |
| `strictNullChecks` | `true` | (via strict) Null safety |
| `noUnusedLocals` | `true` | Clean unused code |
| `noUnusedParameters` | `true` | Clean unused parameters |

---

## Naming Conventions

### General Rules

| Element | Convention | Example |
|---------|------------|---------|
| Variables | camelCase | `orderTotal`, `isActive` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `API_BASE_URL` |
| Functions | camelCase | `calculateTotal()`, `validateUser()` |
| Classes | PascalCase | `OrderService`, `UserRepository` |
| Interfaces | PascalCase | `CreateOrderInput`, `UserDto` |
| Type aliases | PascalCase | `OrderStatus`, `UserId` |
| Enums | PascalCase | `OrderStatus.Pending` |
| Files | kebab-case | `order-service.ts`, `user.dto.ts` |
| Folders | kebab-case | `order-management/`, `user-auth/` |

### Naming Patterns

```typescript
// ✅ Good naming
const orderCount = orders.length;
const isValidEmail = validateEmail(email);
const hasPermission = user.roles.includes('admin');

function calculateOrderTotal(items: OrderItem[]): number { }
function isUserActive(user: User): boolean { }
function createOrder(input: CreateOrderInput): Promise<Order> { }

class OrderService { }
class UserRepository { }
class PaymentGateway { }

interface CreateOrderInput { }
interface OrderResponse { }
type OrderId = string;
type OrderStatus = 'pending' | 'confirmed' | 'shipped';

// ❌ Bad naming
const n = orders.length;           // Too short
const orderCountNumber = 5;        // Redundant type in name
const data = fetchUser();          // Too vague
const processData = () => {};      // Non-descriptive
class Svc { }                      // Abbreviated
interface IUser { }                // Unnecessary I prefix
```

### Boolean Naming

Boolean variables and functions should read like questions:

```typescript
// ✅ Good - reads naturally
const isActive = true;
const hasPermission = checkPermission(user);
const canDelete = user.isAdmin && !order.isShipped;

function isValidEmail(email: string): boolean { }
function hasAccess(user: User, resource: Resource): boolean { }
function shouldRetry(error: Error): boolean { }

// ❌ Bad - doesn't read as boolean
const active = true;
const permission = checkPermission(user);
const deleteAllowed = true;

function validateEmail(email: string): boolean { }  // Suggests void return
function checkAccess(user: User): boolean { }        // Unclear return type
```

### Function Naming by Purpose

| Purpose | Prefix | Example |
|---------|--------|---------|
| Data retrieval | `get`, `find`, `fetch` | `getUser()`, `findById()` |
| Data creation | `create`, `add`, `insert` | `createOrder()`, `addItem()` |
| Data update | `update`, `set`, `modify` | `updateStatus()`, `setName()` |
| Data deletion | `delete`, `remove`, `clear` | `deleteUser()`, `removeItem()` |
| Boolean check | `is`, `has`, `can`, `should` | `isValid()`, `hasAccess()` |
| Conversion | `to`, `from`, `parse` | `toDto()`, `fromEntity()` |
| Calculation | `calculate`, `compute` | `calculateTotal()` |
| Validation | `validate`, `check`, `verify` | `validateInput()` |

---

## File Structure

### Project Layout

```
src/
├── index.ts                 # Entry point
├── app.ts                   # Application setup
├── config/
│   ├── index.ts            # Config barrel export
│   ├── database.config.ts
│   └── app.config.ts
├── modules/
│   ├── order/
│   │   ├── index.ts        # Module barrel export
│   │   ├── order.service.ts
│   │   ├── order.service.test.ts
│   │   ├── order.repository.ts
│   │   ├── order.repository.test.ts
│   │   ├── order.controller.ts
│   │   ├── order.controller.test.ts
│   │   ├── dto/
│   │   │   ├── create-order.dto.ts
│   │   │   └── order-response.dto.ts
│   │   ├── entities/
│   │   │   └── order.entity.ts
│   │   └── __tests__/
│   │       └── order.integration.test.ts
│   └── user/
│       └── ...
├── shared/
│   ├── errors/
│   │   ├── index.ts
│   │   ├── app.error.ts
│   │   └── validation.error.ts
│   ├── utils/
│   │   ├── index.ts
│   │   └── date.utils.ts
│   └── types/
│       └── index.ts
└── __tests__/
    └── e2e/
        └── order.e2e.test.ts
```

### File Naming Patterns

| Type | Pattern | Example |
|------|---------|---------|
| Service | `{name}.service.ts` | `order.service.ts` |
| Repository | `{name}.repository.ts` | `order.repository.ts` |
| Controller | `{name}.controller.ts` | `order.controller.ts` |
| DTO | `{action}-{name}.dto.ts` | `create-order.dto.ts` |
| Entity | `{name}.entity.ts` | `order.entity.ts` |
| Test | `{name}.test.ts` | `order.service.test.ts` |
| Config | `{name}.config.ts` | `database.config.ts` |
| Types | `{name}.types.ts` | `order.types.ts` |
| Utils | `{name}.utils.ts` | `date.utils.ts` |

### Barrel Exports

Use `index.ts` files to create clean import paths:

```typescript
// src/modules/order/index.ts
export { OrderService } from './order.service';
export { OrderRepository } from './order.repository';
export { OrderController } from './order.controller';
export type { CreateOrderDto, OrderResponseDto } from './dto';

// Usage - clean imports
import { OrderService, CreateOrderDto } from './modules/order';
```

---

## Code Formatting

### Prettier Configuration

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "useTabs": false,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always"
}
```

### ESLint Configuration

```javascript
// .eslintrc.js
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/naming-convention': [
      'error',
      { selector: 'interface', format: ['PascalCase'] },
      { selector: 'typeAlias', format: ['PascalCase'] },
      { selector: 'class', format: ['PascalCase'] },
      { selector: 'enum', format: ['PascalCase'] },
    ],
  },
};
```

### Formatting Rules

| Rule | Correct | Incorrect |
|------|---------|-----------|
| Semicolons | Required | Optional |
| Quotes | Single | Double |
| Indentation | 2 spaces | Tabs |
| Line length | Max 100 chars | Unlimited |
| Trailing comma | ES5 compatible | None |
| Bracket spacing | `{ foo }` | `{foo}` |

---

## TypeScript Best Practices

### Type Definitions

```typescript
// ✅ Good - explicit types
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

type UserId = string;
type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered';

function getUser(id: UserId): Promise<User | null> {
  // implementation
}

// ❌ Bad - implicit any, loose types
function getUser(id) {  // implicit any
  return db.query();    // unknown return type
}

const user: any = fetchUser();  // explicit any defeats TypeScript
```

### Use Readonly and Immutability

```typescript
// ✅ Good - immutable by default
interface Config {
  readonly apiUrl: string;
  readonly timeout: number;
  readonly retries: number;
}

function processItems(items: readonly Item[]): Result[] {
  // items cannot be mutated
  return items.map(transform);
}

// ❌ Bad - mutable when not needed
interface Config {
  apiUrl: string;  // mutable
  timeout: number;
}

function processItems(items: Item[]): void {
  items.push(newItem);  // mutates input
}
```

### Union Types Over Enums (Prefer)

```typescript
// ✅ Preferred - union types
type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered';

interface Order {
  status: OrderStatus;
}

// ✅ Also OK - const objects for additional metadata
const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
} as const;

type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

// ⚠️ Use sparingly - TypeScript enums
enum OrderStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
}
```

### Discriminated Unions

```typescript
// ✅ Good - discriminated union for result types
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

function parseJson<T>(json: string): Result<T> {
  try {
    return { success: true, data: JSON.parse(json) as T };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

// Usage with type narrowing
const result = parseJson<User>(jsonString);
if (result.success) {
  console.log(result.data.name);  // TypeScript knows data exists
} else {
  console.error(result.error.message);  // TypeScript knows error exists
}
```

---

## Error Handling

### Custom Error Classes

```typescript
// Base application error
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Specific error types
export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}
```

### Error Handling Patterns

```typescript
// ✅ Good - specific error handling
async function getOrder(id: string): Promise<Order> {
  if (!isValidId(id)) {
    throw new ValidationError('Invalid order ID format', 'id');
  }

  const order = await orderRepository.findById(id);

  if (!order) {
    throw new NotFoundError('Order', id);
  }

  return order;
}

// ✅ Good - try-catch with proper typing
async function processOrder(id: string): Promise<Result<Order>> {
  try {
    const order = await getOrder(id);
    return { success: true, data: order };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { success: false, error };
    }
    // Re-throw unexpected errors
    throw error;
  }
}

// ❌ Bad - swallowing errors
async function getOrder(id: string): Promise<Order | null> {
  try {
    return await orderRepository.findById(id);
  } catch {
    return null;  // Error is lost
  }
}
```

### Never Ignore Errors

```typescript
// ❌ Bad - empty catch block
try {
  await riskyOperation();
} catch {
  // silent failure
}

// ❌ Bad - logging without handling
try {
  await riskyOperation();
} catch (error) {
  console.log(error);  // Then what?
}

// ✅ Good - explicit handling
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', { error, context });
  throw new AppError('Operation failed', 'OPERATION_FAILED');
}
```

---

## Async Patterns

### Prefer async/await

```typescript
// ✅ Good - async/await
async function fetchUserOrders(userId: string): Promise<Order[]> {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new NotFoundError('User', userId);
  }

  const orders = await orderRepository.findByUserId(userId);
  return orders;
}

// ❌ Bad - nested promises
function fetchUserOrders(userId: string): Promise<Order[]> {
  return userRepository.findById(userId)
    .then((user) => {
      if (!user) {
        throw new NotFoundError('User', userId);
      }
      return orderRepository.findByUserId(userId);
    })
    .then((orders) => orders);
}
```

### Parallel Operations

```typescript
// ✅ Good - parallel when operations are independent
async function getDashboardData(userId: string): Promise<DashboardData> {
  const [user, orders, notifications] = await Promise.all([
    userService.getUser(userId),
    orderService.getUserOrders(userId),
    notificationService.getUserNotifications(userId),
  ]);

  return { user, orders, notifications };
}

// ✅ Good - Promise.allSettled for partial failures OK
async function sendNotifications(userIds: string[]): Promise<NotificationResult[]> {
  const results = await Promise.allSettled(
    userIds.map((id) => notificationService.send(id))
  );

  return results.map((result, index) => ({
    userId: userIds[index],
    success: result.status === 'fulfilled',
    error: result.status === 'rejected' ? result.reason : undefined,
  }));
}

// ❌ Bad - sequential when could be parallel
async function getDashboardData(userId: string): Promise<DashboardData> {
  const user = await userService.getUser(userId);
  const orders = await orderService.getUserOrders(userId);  // waits unnecessarily
  const notifications = await notificationService.getUserNotifications(userId);

  return { user, orders, notifications };
}
```

### Handling Multiple Async Operations

```typescript
// ✅ Good - for-of with await for sequential processing
async function processOrders(orders: Order[]): Promise<void> {
  for (const order of orders) {
    await processOrder(order);  // Must be sequential
  }
}

// ✅ Good - map with Promise.all for parallel processing
async function validateOrders(orders: Order[]): Promise<ValidationResult[]> {
  return Promise.all(orders.map((order) => validateOrder(order)));
}

// ❌ Bad - forEach with async (doesn't wait)
orders.forEach(async (order) => {
  await processOrder(order);  // Fire and forget!
});
```

---

## Function Guidelines

### Function Length

Keep functions short and focused. If a function exceeds 20-30 lines, consider extracting sub-functions.

```typescript
// ✅ Good - small focused functions
async function createOrder(input: CreateOrderInput): Promise<Order> {
  await validateOrderInput(input);
  const orderNumber = generateOrderNumber();
  const total = calculateTotal(input.items);
  const order = await persistOrder({ ...input, orderNumber, total });
  await sendOrderConfirmation(order);
  return order;
}

// ❌ Bad - too many responsibilities
async function createOrder(input: CreateOrderInput): Promise<Order> {
  // 100+ lines of validation, calculation, persistence, notifications...
}
```

### Single Return Type

```typescript
// ✅ Good - consistent return type
async function findUser(id: string): Promise<User | null> {
  return userRepository.findById(id);
}

// ✅ Good - never null, throws instead
async function getUser(id: string): Promise<User> {
  const user = await userRepository.findById(id);
  if (!user) {
    throw new NotFoundError('User', id);
  }
  return user;
}

// ❌ Bad - mixed patterns
async function findUser(id: string): Promise<User | null | undefined> {
  if (!id) return undefined;  // Why different from null?
  return userRepository.findById(id);
}
```

### Default Parameters

```typescript
// ✅ Good - default parameters
function paginate<T>(
  items: T[],
  page = 1,
  pageSize = 20
): PaginatedResult<T> {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
  };
}

// ❌ Bad - manual defaults
function paginate<T>(
  items: T[],
  page?: number,
  pageSize?: number
): PaginatedResult<T> {
  const actualPage = page ?? 1;
  const actualPageSize = pageSize ?? 20;
  // ...
}
```

---

## Class Design

### Class Structure Order

```typescript
class OrderService {
  // 1. Static properties
  private static readonly DEFAULT_PAGE_SIZE = 20;

  // 2. Instance properties (readonly first)
  private readonly repository: OrderRepository;
  private readonly eventBus: EventBus;

  // 3. Constructor
  constructor(repository: OrderRepository, eventBus: EventBus) {
    this.repository = repository;
    this.eventBus = eventBus;
  }

  // 4. Public methods
  async createOrder(input: CreateOrderInput): Promise<Order> {
    // ...
  }

  async getOrder(id: string): Promise<Order> {
    // ...
  }

  // 5. Private methods
  private async validateInput(input: CreateOrderInput): Promise<void> {
    // ...
  }

  private generateOrderNumber(): string {
    // ...
  }
}
```

### Dependency Injection

```typescript
// ✅ Good - constructor injection
class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly paymentService: PaymentService,
    private readonly notificationService: NotificationService
  ) {}
}

// ❌ Bad - hard-coded dependencies
class OrderService {
  private repository = new OrderRepository();
  private paymentService = new PaymentService();
}
```

---

## Import Organization

### Import Order

```typescript
// 1. Node.js built-in modules
import { readFile } from 'fs/promises';
import path from 'path';

// 2. External packages (alphabetical)
import express from 'express';
import { z } from 'zod';

// 3. Internal modules - absolute paths
import { AppError } from '@/shared/errors';
import { logger } from '@/shared/logger';

// 4. Internal modules - relative paths
import { OrderRepository } from './order.repository';
import { CreateOrderDto } from './dto/create-order.dto';

// 5. Types (separate import if needed)
import type { Order, OrderItem } from './order.types';
```

### Import Best Practices

```typescript
// ✅ Good - named imports
import { OrderService, OrderRepository } from './order';
import type { Order, CreateOrderInput } from './order.types';

// ✅ Good - namespace import for many exports
import * as validators from './validators';
validators.validateEmail(email);

// ❌ Bad - default exports (harder to refactor)
export default class OrderService { }
import OrderService from './order.service';

// ❌ Bad - import then re-export default
import OrderService from './order.service';
export { OrderService };
```

---

## Comments and Documentation

### When to Comment

```typescript
// ✅ Good - explain WHY, not WHAT
// Use setTimeout instead of setInterval to prevent
// overlapping executions if processing takes longer than interval
setTimeout(processQueue, POLL_INTERVAL);

// ✅ Good - explain complex business logic
// Orders over $1000 require manager approval per policy POL-2023-42
if (order.total > 1000) {
  await requestManagerApproval(order);
}

// ✅ Good - document workarounds
// HACK: API returns dates as strings, convert until backend fix in v2.1
const createdAt = new Date(response.created_at);

// ❌ Bad - obvious comments
// Loop through orders
for (const order of orders) {
  // Process order
  await processOrder(order);
}

// ❌ Bad - outdated comments
// Calculate total with 10% discount
const total = subtotal * 0.85;  // Comment says 10%, code is 15%
```

### JSDoc for Public APIs

```typescript
/**
 * Creates a new order with the specified items.
 *
 * @param input - Order creation parameters
 * @returns The created order with generated ID and calculated total
 * @throws {ValidationError} When input validation fails
 * @throws {NotFoundError} When referenced client doesn't exist
 *
 * @example
 * ```typescript
 * const order = await orderService.createOrder({
 *   clientId: 'client-123',
 *   items: [{ productId: 'prod-1', quantity: 2 }]
 * });
 * ```
 */
async createOrder(input: CreateOrderInput): Promise<Order> {
  // ...
}
```

---

## Anti-Patterns

### Common Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Magic numbers | Unclear meaning | Use named constants |
| Nested callbacks | Callback hell | Use async/await |
| God classes | Too many responsibilities | Split into focused classes |
| Primitive obsession | String/number for everything | Create domain types |
| Feature envy | Methods use other class's data | Move method to data owner |
| Long parameter lists | Hard to call correctly | Use options object |

### Examples

```typescript
// ❌ Magic numbers
if (user.age >= 18 && order.total < 10000) { }

// ✅ Named constants
const MINIMUM_AGE = 18;
const MAX_ORDER_WITHOUT_APPROVAL = 10000;
if (user.age >= MINIMUM_AGE && order.total < MAX_ORDER_WITHOUT_APPROVAL) { }

// ❌ Long parameter list
function createUser(
  name: string,
  email: string,
  age: number,
  address: string,
  phone: string,
  role: string
): User { }

// ✅ Options object
interface CreateUserOptions {
  name: string;
  email: string;
  age: number;
  address?: string;
  phone?: string;
  role?: string;
}

function createUser(options: CreateUserOptions): User { }

// ❌ Primitive obsession
function processOrder(orderId: string, userId: string, productId: string) { }
processOrder(userId, orderId, productId);  // Easy to mix up!

// ✅ Branded types
type OrderId = string & { readonly __brand: 'OrderId' };
type UserId = string & { readonly __brand: 'UserId' };

function processOrder(orderId: OrderId, userId: UserId) { }
```

---

## Quick Reference Card

### Naming
```
variable      → camelCase      → orderTotal
constant      → UPPER_SNAKE    → MAX_RETRIES
function      → camelCase      → calculateTotal()
class         → PascalCase     → OrderService
interface     → PascalCase     → CreateOrderInput
file          → kebab-case     → order-service.ts
```

### Boolean Prefixes
```
is, has, can, should, was, will
```

### Function Prefixes
```
get, find, fetch    → retrieve data
create, add         → create new
update, set         → modify existing
delete, remove      → delete
is, has, can        → boolean check
validate, check     → validation
to, from, parse     → conversion
```

### File Suffixes
```
.service.ts         → business logic
.repository.ts      → data access
.controller.ts      → HTTP handling
.dto.ts             → data transfer objects
.entity.ts          → database entities
.test.ts            → unit tests
.config.ts          → configuration
```

---

## Checklist: Code Style Review

### Naming

- [ ] Variables use camelCase
- [ ] Constants use UPPER_SNAKE_CASE
- [ ] Classes/interfaces use PascalCase
- [ ] Files use kebab-case
- [ ] Names are descriptive and meaningful
- [ ] Boolean names read as questions (is/has/can)

### TypeScript

- [ ] Strict mode enabled
- [ ] No `any` types (or justified with comment)
- [ ] Explicit function return types
- [ ] Readonly where mutation not needed
- [ ] Proper null handling

### Structure

- [ ] Functions are small and focused
- [ ] Classes follow single responsibility
- [ ] Imports are organized
- [ ] Files follow naming conventions

### Error Handling

- [ ] Custom error classes used
- [ ] Errors are not swallowed
- [ ] Async errors properly caught
- [ ] Error messages are helpful

### Async

- [ ] async/await used (not raw promises)
- [ ] Parallel operations use Promise.all
- [ ] No forEach with async

### Documentation

- [ ] Complex logic is commented (WHY)
- [ ] Public APIs have JSDoc
- [ ] No obvious/outdated comments
