# API Contract Template

## File Name

`api-contract.md`

Located in: `.tl/tasks/{{task_id}}/api-contract.md`

Example: `.tl/tasks/UC001/api-contract.md`

## Purpose

The API contract file. Serves as the **single source of truth** for BE/FE interaction: defines endpoints, shared types, error codes, events, authentication, and validation rules. This file is the bridge between backend and frontend — both sides implement against this contract. The contract is created **before** development starts, enabling BE and FE to work in parallel without blocking each other.

**Key principle**: Contract first. BE implements the contract, FE consumes the contract. Any API change starts with a contract update.

## Created By

`tl-plan` skill

## Read By

`tl-dev-be` skill, `tl-dev-fe` skill, `tl-sync` skill

## Contents

```markdown
---
uc_id: {{uc_id}}
title: "API Contract: {{title}}"
version: "1.0.0"
status: draft
created: {{YYYY-MM-DD}}
updated: {{YYYY-MM-DD}}
participants:
  - role: BE
  - role: FE
---

# API Contract: {{uc_id}} {{Title}}

## Shared Types

### File: src/shared/types/{{domain}}.types.ts

\```typescript
export type {{EntityStatus}} = '{{STATE1}}' | '{{STATE2}}' | '{{STATE3}}';

export interface {{Entity}} {
  id: string;
  {{field1}}: {{type}};
  {{field2}}: {{type}};
  status: {{EntityStatus}};
  createdAt: string;          // ISO 8601
  updatedAt: string;          // ISO 8601
}

export interface {{NestedEntity}} {
  id: string;
  {{parentEntity}}Id: string;
  {{field1}}: {{type}};
  {{field2}}: {{type}};
}

export interface Create{{Entity}}Request {
  {{requiredField1}}: {{type}};
  {{requiredField2}}: {{type}};
  {{optionalField}}?: {{type}};
}

export interface Create{{Entity}}Response {
  id: string;
  {{field1}}: {{type}};
  status: {{EntityStatus}};
  createdAt: string;          // ISO 8601
}

export interface Update{{Entity}}Request {
  {{field1}}?: {{type}};
  {{field2}}?: {{type}};
}

export interface {{Entity}}Filter {
  status?: {{EntityStatus}};
  {{filterField}}?: {{type}};
}
\```

### File: src/shared/types/common.types.ts

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
  error: string;              // UPPER_SNAKE_CASE error code
  message: string;            // Human-readable description
  details?: Record<string, string[]>;  // Field-level errors (for validation)
}
\```

## Endpoints

### POST /api/{{resource}}

**Description**: {{Brief description of what this endpoint does.}}

**Authorization**: Bearer Token (role: {{required_role}})

**Request Body**:
\```typescript
Create{{Entity}}Request
\```

**Validation Rules**:
| Field | Type | Required | Rules | Error Message |
|-------|------|----------|-------|---------------|
| {{field1}} | {{type}} | Yes | {{validation_rule}} | "{{error_message}}" |
| {{field2}} | {{type}} | Yes | {{validation_rule}} | "{{error_message}}" |
| {{field3}} | {{type}} | No | {{validation_rule}} | "{{error_message}}" |

**Zod Schema**:
\```typescript
import { z } from 'zod';

export const Create{{Entity}}Schema = z.object({
  {{field1}}: z.string().uuid(),
  {{field2}}: z.number().int().positive(),
  {{optionalField}}: z.string().max({{maxLength}}).optional(),
});
\```

**Response (201)**:
\```typescript
Create{{Entity}}Response
\```

**Errors**:
| HTTP | error | message | When |
|------|-------|---------|------|
| 400 | VALIDATION_ERROR | Request validation failed | Invalid request data |
| 401 | UNAUTHORIZED | Authentication required | No token or token invalid |
| 403 | FORBIDDEN | Insufficient permissions | Token valid but role not {{required_role}} |
| 404 | {{ENTITY}}_NOT_FOUND | {{Entity}} not found | Referenced entity does not exist |
| 409 | {{ENTITY}}_CONFLICT | {{Entity}} conflict | Duplicate or conflicting resource |
| 422 | BUSINESS_RULE_VIOLATION | Cannot create {{entity}}: {reason} | Business rule violated |
| 500 | INTERNAL_ERROR | Internal server error | Unexpected error |

### GET /api/{{resource}}

**Description**: {{Brief description: retrieve list with pagination and filtering.}}

**Authorization**: Bearer Token (role: {{required_role}})

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Items per page (max 100) |
| sort | string | "createdAt" | Sort field |
| order | "asc" \| "desc" | "desc" | Sort direction |
| {{filterParam1}} | {{type}} | - | Filter by {{description}} |
| {{filterParam2}} | {{type}} | - | Filter by {{description}} |

**Response (200)**:
\```typescript
PaginatedResponse<{{Entity}}>
\```

**Errors**:
| HTTP | error | message | When |
|------|-------|---------|------|
| 401 | UNAUTHORIZED | Authentication required | No token |
| 403 | FORBIDDEN | Insufficient permissions | Wrong role |

### GET /api/{{resource}}/:id

**Description**: {{Brief description: retrieve single entity by ID.}}

**Authorization**: Bearer Token (role: {{required_role}})

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | {{Entity}} ID |

**Response (200)**:
\```typescript
{{Entity}}
\```

**Errors**:
| HTTP | error | message | When |
|------|-------|---------|------|
| 401 | UNAUTHORIZED | Authentication required | No token |
| 404 | {{ENTITY}}_NOT_FOUND | {{Entity}} not found | Entity does not exist |

### PUT /api/{{resource}}/:id

**Description**: {{Brief description: update existing entity.}}

**Authorization**: Bearer Token (role: {{required_role}})

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | {{Entity}} ID |

**Request Body**:
\```typescript
Update{{Entity}}Request
\```

**Response (200)**:
\```typescript
{{Entity}}
\```

**Errors**:
| HTTP | error | message | When |
|------|-------|---------|------|
| 400 | VALIDATION_ERROR | Request validation failed | Invalid data |
| 401 | UNAUTHORIZED | Authentication required | No token |
| 403 | FORBIDDEN | Insufficient permissions | Wrong role |
| 404 | {{ENTITY}}_NOT_FOUND | {{Entity}} not found | Entity does not exist |
| 409 | {{ENTITY}}_CONFLICT | {{Entity}} conflict | Conflicting update |
| 422 | BUSINESS_RULE_VIOLATION | Cannot update {{entity}}: {reason} | Business rule violated |

### DELETE /api/{{resource}}/:id

**Description**: {{Brief description: delete entity by ID.}}

**Authorization**: Bearer Token (role: {{required_role}})

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | {{Entity}} ID |

**Response (204)**: No content

**Errors**:
| HTTP | error | message | When |
|------|-------|---------|------|
| 401 | UNAUTHORIZED | Authentication required | No token |
| 403 | FORBIDDEN | Insufficient permissions | Wrong role |
| 404 | {{ENTITY}}_NOT_FOUND | {{Entity}} not found | Entity does not exist |
| 422 | BUSINESS_RULE_VIOLATION | Cannot delete {{entity}}: {reason} | Business rule violated |

## Events

### Event: {{entity}}:created

**Channel**: /ws/{{resource}}
**Direction**: Server -> Client
**Trigger**: {{Trigger description}}

\```typescript
interface {{Entity}}CreatedEvent {
  {{entity}}Id: string;
  {{field1}}: {{type}};
  status: {{EntityStatus}};
  createdAt: string;          // ISO 8601
  createdBy: string;          // userId
}
\```

### Event: {{entity}}:status_changed

**Channel**: /ws/{{resource}}/:{{entity}}Id
**Direction**: Server -> Client
**Trigger**: {{Trigger description}}

\```typescript
interface {{Entity}}StatusChangedEvent {
  {{entity}}Id: string;
  previousStatus: {{EntityStatus}};
  newStatus: {{EntityStatus}};
  changedAt: string;          // ISO 8601
  changedBy: string;          // userId
}
\```

### Event Envelope (common for all events)

\```typescript
interface WebSocketMessage<T> {
  event: string;              // event name
  payload: T;                 // typed data
  timestamp: string;          // ISO 8601
  correlationId?: string;     // for tracking event chains
}
\```

## Authentication

**Method**: JWT Bearer Token

**Header**: `Authorization: Bearer <jwt_token>`

**Required Role**: {{required_role}} (for all endpoints in this UC)

**Standard Auth Headers**:
\```typescript
interface AuthHeaders {
  'Authorization': `Bearer ${string}`;   // JWT token
  'X-Request-Id'?: string;               // for tracing
  'X-Tenant-Id'?: string;                // for multi-tenancy
}
\```

**Access Levels**:
| Level | Notation | Description |
|-------|----------|-------------|
| Public | Authorization: Not required | Open endpoint |
| Authenticated | Authorization: Bearer Token | Any authenticated user |
| Role-based | Authorization: Bearer Token (role: X) | Specific role required |
| Owner | Authorization: Bearer Token (owner) | Resource owner only |

**Auth Error Responses**:
- 401 Unauthorized: Token missing, expired, or invalid
- 403 Forbidden: Token valid but insufficient permissions

\```typescript
interface UnauthorizedError {
  error: 'UNAUTHORIZED';
  message: 'Authentication required';
}

interface ForbiddenError {
  error: 'FORBIDDEN';
  message: 'Insufficient permissions';
  required: string[];           // required roles
}
\```

## Validation Rules

**General validation approach**: Zod schemas for runtime validation on BE, TypeScript types for compile-time safety on both BE and FE.

| Field | Type | Required | Rules | Error Message |
|-------|------|----------|-------|---------------|
| {{field1}} | string | Yes | UUID v4 | "Invalid {{field1}} format" |
| {{field2}} | number | Yes | int, > 0 | "{{field2}} must be a positive integer" |
| {{field3}} | string | No | max {{N}} chars | "{{field3}} must not exceed {{N}} characters" |
| {{field4}} | array | Yes | min 1 item | "Must have at least one item" |

**Response Shape Guarantees**:

\```typescript
// Successful response always wraps data
interface SuccessResponse<T> {
  data: T;
}

// Error response always follows this shape
interface ErrorResponse {
  error: string;              // UPPER_SNAKE_CASE code
  message: string;            // Human-readable description
  details?: Record<string, string[]>;  // Per-field errors (validation)
}
\```

## Changelog

### v1.0.0 ({{YYYY-MM-DD}})
- Initial contract version
- Endpoints: {{list of endpoints}}
- Shared Types: {{list of types}}
- Events: {{list of events}}
```

## Status Values Reference

| Status | Meaning |
|--------|---------|
| `draft` | Contract created, not yet agreed upon |
| `agreed` | Both BE and FE confirmed the contract |
| `implemented` | Contract fully implemented by both sides |
| `deprecated` | Contract superseded by newer version |

## Versioning Reference

| Change | Version Bump | Example |
|--------|-------------|---------|
| Breaking change (remove field, change type) | MAJOR | 1.0.0 -> 2.0.0 |
| New endpoint or optional field | MINOR | 1.0.0 -> 1.1.0 |
| Description fix, typo correction | PATCH | 1.0.0 -> 1.0.1 |

## Naming Conventions Reference

| Suffix | Purpose | Example |
|--------|---------|---------|
| `Request` | Request body | `CreateOrderRequest` |
| `Response` | Response body | `CreateOrderResponse` |
| `Dto` | Data Transfer Object (internal) | `OrderItemDto` |
| `Params` | Query/Path parameters | `GetOrderParams` |
| `Filter` | List filtering | `OrderFilter` |
| (no suffix) | Domain entity | `Order`, `OrderStatus` |

## Quality Checklist

Before committing an api-contract.md file, verify:

- [ ] Frontmatter complete (uc_id, title, version, status, participants)
- [ ] Shared Types defined with proper naming conventions (PascalCase, correct suffixes)
- [ ] All endpoints documented (method, path, request/response types, errors)
- [ ] Error tables complete for every endpoint (400, 401, 403 at minimum)
- [ ] Pagination described for list endpoints (query params + PaginatedResponse)
- [ ] Validation rules listed with field constraints and error messages
- [ ] Zod schemas provided for request bodies
- [ ] Events documented with channel, direction, trigger, and typed payload
- [ ] Authentication section specifies required headers and access levels
- [ ] All types use camelCase for JSON fields (no snake_case)
- [ ] All dates documented as ISO 8601 string format
- [ ] Changelog section present with initial version entry
- [ ] NO `any` types used — all types are concrete interfaces
- [ ] NO hardcoded URLs — only relative paths (`/api/resource`)
- [ ] NO duplicated type definitions — single source in `src/shared/types/`
