# Example: UC001. Create Order Task File

This example demonstrates a fully completed task.md file created by `tl-plan` for the `tl-dev` agent.

---

```markdown
---
task_id: UC001
title: "Create Order"
source_uc: docs/14-usecases/UC001-create-order.md
status: pending
priority: high
module: orders
actor: Sales Manager
created: 2025-01-30
updated: 2025-01-30
depends_on: []
blocks: [UC002, UC003]
tags: [orders, crud, primary]
---

# UC001. Create Order

## Description

Implement the order creation functionality that allows sales managers to create new customer orders in the system. The created order will be processed and shipped to the customer. This is the primary entry point for the order management workflow.

## Actor

Sales Manager - A user with the "sales_manager" role who has permissions to create and manage customer orders.

## Preconditions

- User is authenticated in the system
- User has the "Sales Manager" role with order.create permission
- At least one client exists in the clients table
- At least one product exists with available stock

## Input Data

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| client_id | UUID | Yes | Must exist in clients table | Customer placing the order |
| items | Array<OrderItem> | Yes | Min 1 item, each with valid product | List of products with quantities |
| items[].product_id | UUID | Yes | Must exist in products table | Product to order |
| items[].quantity | Integer | Yes | Must be > 0 | Quantity to order |
| notes | String | No | Max 500 characters | Additional order instructions |

## Output Data

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier of the created order |
| order_number | String | Human-readable order number (ORD-YYYYMMDD-NNNN) |
| status | Enum | Initial status: "NEW" |
| total | Decimal | Calculated total: sum of (quantity x price) for all items |
| created_at | DateTime | Timestamp of order creation |

## Main Flow

1. User opens the order creation form
2. System displays an empty form with client selector and items table
3. User selects a client from the dropdown (populated from GET /api/clients)
4. System loads and displays client details (phone, email) in read-only fields
5. User adds items to the order by selecting product and entering quantity
6. System calculates and displays the running total after each item change
7. User optionally enters notes in the comment field
8. User clicks "Create Order" button
9. System validates all input data
10. System creates the order with status "NEW"
11. System generates a unique order number in format ORD-YYYYMMDD-NNNN
12. System displays the order confirmation with order number and details

## Alternative Flows

### A1. Client Not Found in System

**Trigger:** The required client is not in the client directory

**Actions:**
1. User clicks "Add Client" button
2. System navigates to UC005. Create Client
3. After client creation, system returns to order form with new client selected

**Result:** Order is created for the newly added client

### A2. Product Out of Stock

**Trigger:** Requested quantity exceeds available stock

**Actions:**
1. System displays warning with available quantity
2. User adjusts quantity or removes the item
3. Continue from step 6 of main flow

**Result:** Order is created with available quantities

### A3. Cancel Order Creation

**Trigger:** User clicks "Cancel" button

**Actions:**
1. System prompts for confirmation: "Discard unsaved changes?"
2. If confirmed, system closes the form without saving
3. If declined, system returns to the form

**Result:** Order is not created

### A4. Validation Failure

**Trigger:** Invalid data detected at step 9

**Actions:**
1. System highlights invalid fields with red border
2. System displays specific error messages below each invalid field
3. User corrects the errors
4. Continue from step 8 of main flow

**Result:** Order is created after corrections

## Context Extract

### Related Entities

**Entity: Order**
| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Primary key, auto-generated |
| number | String | Yes | Auto-generated ORD-YYYYMMDD-NNNN |
| date | DateTime | Yes | Creation timestamp |
| client_id | UUID | Yes | Reference to clients.id |
| status | OrderStatus | Yes | Current order status |
| total | Decimal(12,2) | Yes | Calculated from items |
| notes | Text | No | Optional order notes |
| created_at | DateTime | Yes | Record creation timestamp |
| updated_at | DateTime | Yes | Record update timestamp |

**Entity: OrderItem**
| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Primary key, auto-generated |
| order_id | UUID | Yes | Reference to orders.id |
| product_id | UUID | Yes | Reference to products.id |
| quantity | Integer | Yes | Must be > 0 |
| price | Decimal(12,2) | Yes | Product price at order time |
| amount | Decimal(12,2) | Yes | Calculated: quantity x price |

**Entity: Client**
| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Primary key |
| name | String | Yes | Client name |
| phone | String | No | Contact phone |
| email | String | No | Contact email |

### Status Values

```
OrderStatus:
- NEW -> IN_PROGRESS -> COMPLETED
- NEW -> CANCELLED
- IN_PROGRESS -> CANCELLED
```

### Business Rules

- BR01: Order number is auto-generated on creation in format ORD-YYYYMMDD-NNNN where NNNN is a daily sequential number with leading zeros
- BR02: Order must have at least one item (empty orders not allowed)
- BR03: Total is calculated as sum of all item amounts (quantity x price)
- BR04: Product price is captured at order creation time (historical price)
- BR05: All order data (order + items) must be saved in a single transaction
- BR06: Initial order status is always "NEW"
- BR07: Item quantity must be a positive integer

## SA References (For Human Review Only)

- Use Case: docs/14-usecases/UC001-create-order.md
- Entity - Order: docs/12-domain/entities/order.md
- Entity - Client: docs/12-domain/entities/client.md
- Form: docs/13-interfaces/forms/order-create-form.md
- Requirements: docs/14-requirements/functional/FR-orders.md
```

---

## Key Points Demonstrated

1. **Self-Sufficient Content**: The task file contains ALL information needed for development - no need to read original SA artifacts
2. **Complete Frontmatter**: All required metadata fields are populated
3. **Detailed Input/Output Tables**: Include types, validation rules, and clear descriptions
4. **Numbered Main Flow**: Clear step-by-step process
5. **Comprehensive Alternative Flows**: Cover error cases and user cancellation
6. **Context Extract**: Includes entities, status values, and business rules
7. **SA References**: Provided for human review ONLY - dev agent should not read these
