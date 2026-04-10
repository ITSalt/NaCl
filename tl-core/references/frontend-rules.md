# Правила Frontend-разработки: React/Next.js + TypeScript

## Общие принципы

Этот документ определяет стандарты и правила для frontend-разработки в рамках TL skill suite. Все компоненты, хуки и утилиты следуют этим правилам. Агент `tl-dev-fe` использует этот документ как руководство при реализации FE-задач.

**Стек:** React 18+, Next.js 14+ (App Router), TypeScript 5+, React Testing Library, Zod, React Hook Form, Zustand/React Query.

---

## 1. Архитектура компонентов

### Только функциональные компоненты

Классовые компоненты запрещены. Используем только функциональные компоненты с хуками.

```typescript
// Правильно: функциональный компонент с типизацией props
interface OrderCardProps {
  order: Order;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  isLoading?: boolean;
}

export function OrderCard({ order, onEdit, onDelete, isLoading = false }: OrderCardProps) {
  if (isLoading) {
    return <OrderCardSkeleton />;
  }

  return (
    <article className={styles.card}>
      <h3>{order.number}</h3>
      <OrderStatusBadge status={order.status} />
      <p>Клиент: {order.client.name}</p>
      <p>Сумма: {formatCurrency(order.total)}</p>
      <div className={styles.actions}>
        <Button onClick={() => onEdit(order.id)} variant="secondary">
          Редактировать
        </Button>
        <Button onClick={() => onDelete(order.id)} variant="danger">
          Удалить
        </Button>
      </div>
    </article>
  );
}
```

### Правила именования

| Элемент | Формат | Пример |
|---------|--------|--------|
| Компонент | PascalCase | `OrderCard`, `UserProfile` |
| Хук | camelCase с `use` | `useOrders`, `useFormValidation` |
| Утилита | camelCase | `formatCurrency`, `parseDate` |
| Тип/Интерфейс | PascalCase | `Order`, `CreateOrderInput` |
| Константа | UPPER_SNAKE_CASE | `MAX_ITEMS_PER_PAGE`, `API_BASE_URL` |
| Файл компонента | PascalCase или kebab-case | `OrderCard.tsx` или `order-card.tsx` |
| Файл хука | camelCase | `useOrders.ts` |
| Файл теста | *.test.tsx / *.test.ts | `OrderCard.test.tsx` |
| CSS Module | kebab-case | `order-card.module.css` |

### Композиция вместо наследования

```typescript
// Правильно: композиция через children и render props
interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  renderRow?: (item: T, index: number) => React.ReactNode;
  emptyState?: React.ReactNode;
  isLoading?: boolean;
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  renderRow,
  emptyState = <EmptyState message="Нет данных" />,
  isLoading,
}: DataTableProps<T>) {
  if (isLoading) return <TableSkeleton columns={columns.length} />;
  if (data.length === 0) return emptyState;

  return (
    <table>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key}>{col.title}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((item, index) =>
          renderRow ? renderRow(item, index) : (
            <tr key={item.id}>
              {columns.map((col) => (
                <td key={col.key}>{col.render(item)}</td>
              ))}
            </tr>
          )
        )}
      </tbody>
    </table>
  );
}
```

### Правила по размеру компонентов

- Максимум 150 строк на компонент (включая импорты)
- Максимум 5 props у компонента (иначе объединить в объект или разбить компонент)
- Максимум 3 уровня вложенности JSX
- Если компонент содержит > 3 хуков -- выделить кастомный хук

---

## 2. Структура проекта

### Структура каталогов Next.js App Router

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Корневой layout
│   ├── page.tsx                  # Главная страница
│   ├── loading.tsx               # Глобальный loading state
│   ├── error.tsx                 # Глобальный Error Boundary
│   ├── not-found.tsx             # 404
│   ├── (auth)/                   # Route group: авторизация
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (dashboard)/              # Route group: защищённые страницы
│   │   ├── layout.tsx            # Layout с сайдбаром
│   │   ├── orders/
│   │   │   ├── page.tsx          # Список заказов
│   │   │   ├── [id]/page.tsx     # Детали заказа
│   │   │   ├── [id]/edit/page.tsx
│   │   │   ├── new/page.tsx      # Создание заказа
│   │   │   └── loading.tsx
│   │   └── clients/
│   │       ├── page.tsx
│   │       └── [id]/page.tsx
│   └── api/                      # Route Handlers (API)
│       └── orders/
│           └── route.ts
│
├── components/                   # Переиспользуемые компоненты
│   ├── ui/                       # Базовые UI-компоненты (Button, Input, Modal)
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Select.tsx
│   │   ├── Toast.tsx
│   │   └── index.ts              # Barrel export
│   ├── forms/                    # Компоненты форм
│   │   ├── OrderForm.tsx
│   │   ├── ClientForm.tsx
│   │   └── FormField.tsx
│   ├── layout/                   # Компоненты разметки
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── PageContainer.tsx
│   └── shared/                   # Общие бизнес-компоненты
│       ├── OrderStatusBadge.tsx
│       ├── DataTable.tsx
│       └── EmptyState.tsx
│
├── hooks/                        # Кастомные хуки
│   ├── useOrders.ts              # Data fetching: заказы
│   ├── useClients.ts             # Data fetching: клиенты
│   ├── useDebounce.ts            # Утилитарный хук
│   ├── useMediaQuery.ts
│   └── useToast.ts
│
├── lib/                          # Утилиты и конфигурация
│   ├── api/                      # API-клиент
│   │   ├── client.ts             # Базовый HTTP-клиент
│   │   ├── orders.ts             # API-функции для заказов
│   │   ├── clients.ts            # API-функции для клиентов
│   │   └── errors.ts             # Обработка API-ошибок
│   ├── utils/                    # Утилиты
│   │   ├── format.ts             # Форматирование (даты, валюта)
│   │   ├── validation.ts         # Zod-схемы
│   │   └── cn.ts                 # classnames утилита
│   └── constants.ts              # Константы
│
├── types/                        # Глобальные типы
│   ├── order.ts                  # Order, OrderItem, OrderStatus
│   ├── client.ts                 # Client
│   ├── api.ts                    # ApiResponse, ApiError, PaginatedResponse
│   └── index.ts                  # Barrel export
│
├── styles/                       # Глобальные стили
│   ├── globals.css               # CSS reset, CSS variables
│   └── tokens.css                # Дизайн-токены
│
└── __tests__/                    # Конфигурация тестов
    ├── setup.ts                  # Jest/Vitest setup
    └── mocks/
        ├── handlers.ts           # MSW request handlers
        └── server.ts             # MSW server setup
```

### Правила организации

- **Colocation:** Тесты рядом с компонентами (`OrderCard.tsx` + `OrderCard.test.tsx`)
- **Barrel exports:** `index.ts` в каждом каталоге компонентов
- **Server/Client:** Компоненты по умолчанию серверные; `'use client'` только где необходимо
- **Нет логики в `page.tsx`:** Страница только импортирует компоненты и передаёт параметры

```typescript
// app/(dashboard)/orders/page.tsx -- правильно: минимальная логика
import { OrdersPageContent } from '@/components/pages/OrdersPageContent';

export default function OrdersPage() {
  return <OrdersPageContent />;
}
```

---

## 3. Управление состоянием

### Серверное состояние: React Query (TanStack Query)

Для данных с сервера (API-ответы) используем React Query. **Не** храним серверные данные в локальном стейте.

```typescript
// hooks/useOrders.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api/orders';
import type { Order, CreateOrderInput } from '@/types/order';

// Ключи запросов -- централизованные
export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters: OrderFilters) => [...orderKeys.lists(), filters] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
};

// Хук для списка заказов
export function useOrders(filters: OrderFilters = {}) {
  return useQuery({
    queryKey: orderKeys.list(filters),
    queryFn: () => ordersApi.getAll(filters),
    staleTime: 5 * 60 * 1000,          // 5 минут
    placeholderData: keepPreviousData,   // Не показывать loading при смене фильтров
  });
}

// Хук для одного заказа
export function useOrder(id: string) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => ordersApi.getById(id),
    enabled: !!id,                       // Не запрашивать без ID
  });
}

// Хук для создания заказа
export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOrderInput) => ordersApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
}
```

### Клиентское состояние: Zustand

Для UI-состояния (модальные окна, фильтры, sidebar, тема) используем Zustand. **Не** используем Zustand для серверных данных.

```typescript
// stores/useUIStore.ts
import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  activeModal: string | null;
  openModal: (modalId: string) => void;
  closeModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  activeModal: null,
  openModal: (modalId) => set({ activeModal: modalId }),
  closeModal: () => set({ activeModal: null }),
}));
```

### React Context: только для DI и темы

Context используем минимально -- для dependency injection (провайдеры) и глобальной темы.

```typescript
// Правильно: Context для темы
const ThemeContext = createContext<Theme>('light');
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Неправильно: Context для серверных данных
// Используйте React Query вместо этого
```

### Матрица выбора

| Тип данных | Хранилище | Пример |
|------------|-----------|--------|
| Данные с API | React Query | Список заказов, детали клиента |
| UI-состояние | Zustand | Sidebar, modal, фильтры |
| Тема, локаль | React Context | Dark mode, i18n |
| Форма | React Hook Form | Ввод данных заказа |
| URL-состояние | Next.js searchParams | Пагинация, сортировка |

---

## 4. Интеграция с API

### Типизированный API-клиент

```typescript
// lib/api/client.ts
import type { ApiResponse, ApiError } from '@/types/api';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: 'UNKNOWN_ERROR',
        message: `HTTP ${response.status}: ${response.statusText}`,
      }));
      throw new ApiRequestError(response.status, error);
    }

    return response.json() as Promise<T>;
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient(BASE_URL);
```

### API-ошибки

```typescript
// lib/api/errors.ts
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly apiError: ApiError
  ) {
    super(apiError.message);
    this.name = 'ApiRequestError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isValidationError(): boolean {
    return this.status === 400 || this.status === 422;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}
```

### Типизированные API-функции

```typescript
// lib/api/orders.ts
import { apiClient } from './client';
import type { Order, CreateOrderInput, UpdateOrderInput, PaginatedResponse } from '@/types';

export const ordersApi = {
  getAll: (filters?: OrderFilters) =>
    apiClient.get<PaginatedResponse<Order>>(
      `/orders?${new URLSearchParams(filters as Record<string, string>)}`
    ),

  getById: (id: string) =>
    apiClient.get<Order>(`/orders/${id}`),

  create: (data: CreateOrderInput) =>
    apiClient.post<Order>('/orders', data),

  update: (id: string, data: UpdateOrderInput) =>
    apiClient.put<Order>(`/orders/${id}`, data),

  delete: (id: string) =>
    apiClient.delete<void>(`/orders/${id}`),
};
```

### Обработка loading/error состояний

```typescript
// Паттерн: обёртка для data-fetching компонентов
interface AsyncContentProps<T> {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  data: T | undefined;
  children: (data: T) => React.ReactNode;
  loadingFallback?: React.ReactNode;
  errorFallback?: (error: Error) => React.ReactNode;
}

function AsyncContent<T>({
  isLoading,
  isError,
  error,
  data,
  children,
  loadingFallback = <Spinner />,
  errorFallback,
}: AsyncContentProps<T>) {
  if (isLoading) return loadingFallback;
  if (isError && error) {
    return errorFallback ? errorFallback(error) : <ErrorMessage error={error} />;
  }
  if (!data) return null;
  return children(data);
}

// Использование
function OrdersList() {
  const { data, isLoading, isError, error } = useOrders();

  return (
    <AsyncContent data={data} isLoading={isLoading} isError={isError} error={error}>
      {(orders) => (
        <ul>
          {orders.items.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </ul>
      )}
    </AsyncContent>
  );
}
```

### Оптимистичные обновления

```typescript
// hooks/useDeleteOrder.ts
export function useDeleteOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ordersApi.delete(id),

    // Оптимистичное обновление: убрать из списка сразу
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: orderKeys.lists() });
      const previousOrders = queryClient.getQueryData(orderKeys.lists());

      queryClient.setQueriesData(
        { queryKey: orderKeys.lists() },
        (old: PaginatedResponse<Order> | undefined) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.filter((order) => order.id !== deletedId),
            total: old.total - 1,
          };
        }
      );

      return { previousOrders };
    },

    // При ошибке -- откатить
    onError: (_err, _id, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(orderKeys.lists(), context.previousOrders);
      }
    },

    // В любом случае -- перезапросить
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
}
```

---

## 5. Работа с формами

### React Hook Form + Zod

Все формы строятся на React Hook Form с валидацией через Zod-схемы.

```typescript
// lib/utils/validation.ts
import { z } from 'zod';

export const createOrderSchema = z.object({
  clientId: z.string().uuid('Выберите клиента'),
  items: z
    .array(
      z.object({
        productId: z.string().uuid('Выберите продукт'),
        quantity: z.number().int().min(1, 'Минимальное количество: 1'),
      })
    )
    .min(1, 'Добавьте хотя бы один товар'),
  notes: z.string().max(500, 'Максимум 500 символов').optional(),
});

export type CreateOrderFormData = z.infer<typeof createOrderSchema>;
```

### Компонент формы

```typescript
// components/forms/OrderForm.tsx
'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createOrderSchema, type CreateOrderFormData } from '@/lib/utils/validation';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';

interface OrderFormProps {
  onSubmit: (data: CreateOrderFormData) => void;
  isSubmitting?: boolean;
  defaultValues?: Partial<CreateOrderFormData>;
}

export function OrderForm({ onSubmit, isSubmitting = false, defaultValues }: OrderFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateOrderFormData>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      clientId: '',
      items: [{ productId: '', quantity: 1 }],
      notes: '',
      ...defaultValues,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormField
        label="Клиент"
        error={errors.clientId?.message}
        required
      >
        <select {...register('clientId')} aria-invalid={!!errors.clientId}>
          <option value="">Выберите клиента</option>
          {/* Опции загружаются через useClients() */}
        </select>
      </FormField>

      <fieldset>
        <legend>Товары</legend>
        {fields.map((field, index) => (
          <div key={field.id} role="group" aria-label={`Товар ${index + 1}`}>
            <FormField
              label="Продукт"
              error={errors.items?.[index]?.productId?.message}
              required
            >
              <select {...register(`items.${index}.productId`)}>
                <option value="">Выберите продукт</option>
              </select>
            </FormField>

            <FormField
              label="Количество"
              error={errors.items?.[index]?.quantity?.message}
              required
            >
              <input
                type="number"
                min={1}
                {...register(`items.${index}.quantity`, { valueAsNumber: true })}
              />
            </FormField>

            {fields.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => remove(index)}
                aria-label={`Удалить товар ${index + 1}`}
              >
                Удалить
              </Button>
            )}
          </div>
        ))}

        {errors.items?.root?.message && (
          <p role="alert" className={styles.error}>
            {errors.items.root.message}
          </p>
        )}

        <Button
          type="button"
          variant="secondary"
          onClick={() => append({ productId: '', quantity: 1 })}
        >
          Добавить товар
        </Button>
      </fieldset>

      <FormField label="Примечания" error={errors.notes?.message}>
        <textarea {...register('notes')} rows={3} />
      </FormField>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Создание...' : 'Создать заказ'}
      </Button>
    </form>
  );
}
```

### Компонент FormField (переиспользуемый)

```typescript
// components/ui/FormField.tsx
interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}

export function FormField({ label, error, required, children, hint }: FormFieldProps) {
  const id = useId();

  return (
    <div className={styles.field}>
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {hint && <p id={`${id}-hint`} className={styles.hint}>{hint}</p>}
      {React.cloneElement(children as React.ReactElement, {
        id,
        'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
        'aria-invalid': !!error,
      })}
      {error && (
        <p id={`${id}-error`} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
```

---

## 6. Стратегия тестирования

### React Testing Library (RTL) + user-event

Тестируем **поведение пользователя**, а не реализацию компонента.

```typescript
// components/forms/OrderForm.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderForm } from './OrderForm';

// Setup user-event
const user = userEvent.setup();

describe('OrderForm', () => {
  const mockSubmit = vi.fn();

  beforeEach(() => {
    mockSubmit.mockClear();
  });

  it('должна отображать все обязательные поля', () => {
    render(<OrderForm onSubmit={mockSubmit} />);

    expect(screen.getByLabelText(/клиент/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/продукт/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/количество/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /создать заказ/i })).toBeInTheDocument();
  });

  it('должна показывать ошибки валидации при пустой отправке', async () => {
    render(<OrderForm onSubmit={mockSubmit} />);

    await user.click(screen.getByRole('button', { name: /создать заказ/i }));

    await waitFor(() => {
      expect(screen.getByText(/выберите клиента/i)).toBeInTheDocument();
    });

    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('должна вызывать onSubmit с корректными данными', async () => {
    render(<OrderForm onSubmit={mockSubmit} />);

    await user.selectOptions(screen.getByLabelText(/клиент/i), 'client-uuid');
    await user.selectOptions(screen.getByLabelText(/продукт/i), 'product-uuid');
    await user.clear(screen.getByLabelText(/количество/i));
    await user.type(screen.getByLabelText(/количество/i), '3');
    await user.click(screen.getByRole('button', { name: /создать заказ/i }));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith({
        clientId: 'client-uuid',
        items: [{ productId: 'product-uuid', quantity: 3 }],
        notes: '',
      });
    });
  });

  it('должна позволять добавлять и удалять товары', async () => {
    render(<OrderForm onSubmit={mockSubmit} />);

    // Изначально один товар
    expect(screen.getAllByRole('group', { name: /товар/i })).toHaveLength(1);

    // Добавить товар
    await user.click(screen.getByRole('button', { name: /добавить товар/i }));
    expect(screen.getAllByRole('group', { name: /товар/i })).toHaveLength(2);

    // Удалить товар
    const deleteButtons = screen.getAllByRole('button', { name: /удалить товар/i });
    await user.click(deleteButtons[0]);
    expect(screen.getAllByRole('group', { name: /товар/i })).toHaveLength(1);
  });

  it('должна блокировать кнопку при отправке', () => {
    render(<OrderForm onSubmit={mockSubmit} isSubmitting />);

    expect(screen.getByRole('button', { name: /создание/i })).toBeDisabled();
  });
});
```

### MSW для мокирования API

```typescript
// __tests__/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

const BASE_URL = 'http://localhost:3001/api';

export const handlers = [
  // GET /api/orders -- список заказов
  http.get(`${BASE_URL}/orders`, () => {
    return HttpResponse.json({
      items: [
        {
          id: 'order-1',
          number: 'ORD-20250130-0001',
          status: 'NEW',
          total: 450,
          client: { id: 'client-1', name: 'ООО "Тест"' },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  }),

  // POST /api/orders -- создание заказа
  http.post(`${BASE_URL}/orders`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(
      {
        id: 'new-order-uuid',
        number: 'ORD-20250130-0002',
        status: 'NEW',
        total: 0,
        ...body,
      },
      { status: 201 }
    );
  }),

  // GET /api/orders/:id -- детали заказа
  http.get(`${BASE_URL}/orders/:id`, ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      number: 'ORD-20250130-0001',
      status: 'NEW',
      total: 450,
      client: { id: 'client-1', name: 'ООО "Тест"' },
      items: [
        { id: 'item-1', productId: 'prod-1', quantity: 2, price: 100, amount: 200 },
        { id: 'item-2', productId: 'prod-2', quantity: 1, price: 250, amount: 250 },
      ],
    });
  }),
];
```

```typescript
// __tests__/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

```typescript
// __tests__/setup.ts
import { server } from './mocks/server';
import '@testing-library/jest-dom';

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Тестирование хуков

```typescript
// hooks/useOrders.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOrders } from './useOrders';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('useOrders', () => {
  it('должен загружать список заказов', async () => {
    const { result } = renderHook(() => useOrders(), {
      wrapper: createWrapper(),
    });

    // Начальное состояние: загрузка
    expect(result.current.isLoading).toBe(true);

    // После загрузки
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.items[0].number).toBe('ORD-20250130-0001');
  });
});
```

### Правила тестирования

| Правило | Описание |
|---------|----------|
| Тестировать поведение | `screen.getByRole`, не `querySelector('.btn-class')` |
| user-event вместо fireEvent | `userEvent.click()` вместо `fireEvent.click()` |
| waitFor для асинхронности | Не использовать `setTimeout` или `act()` напрямую |
| Один тест -- одна проверка | Одна концепция на `it()` блок |
| Осмысленные данные | `'ООО Тест'` вместо `'asdf123'` |
| Нет тестов реализации | Не тестировать внутренний state или вызовы методов |
| MSW вместо jest.mock | Перехват HTTP-запросов, не мокирование модулей |

---

## 7. TDD для Frontend

### RED: тест описывает поведение, не реализацию

```typescript
// RED Phase -- тест написан ДО компонента

describe('OrderStatusBadge', () => {
  it('должен отображать статус "Новый" для status=NEW', () => {
    render(<OrderStatusBadge status="NEW" />);
    expect(screen.getByText('Новый')).toBeInTheDocument();
  });

  it('должен применять зелёный стиль для status=COMPLETED', () => {
    render(<OrderStatusBadge status="COMPLETED" />);
    const badge = screen.getByText('Завершён');
    expect(badge).toHaveClass('badge-success');
  });

  it('должен иметь role=status для доступности', () => {
    render(<OrderStatusBadge status="NEW" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

// Запуск: npm test -- OrderStatusBadge
// Результат: FAIL (компонент не существует)
```

### GREEN: минимальный компонент, проходящий тесты

```typescript
// GREEN Phase -- минимальная реализация

const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Новый',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершён',
  CANCELLED: 'Отменён',
};

const STATUS_STYLES: Record<OrderStatus, string> = {
  NEW: 'badge-info',
  IN_PROGRESS: 'badge-warning',
  COMPLETED: 'badge-success',
  CANCELLED: 'badge-danger',
};

interface OrderStatusBadgeProps {
  status: OrderStatus;
}

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  return (
    <span role="status" className={`badge ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// Запуск: npm test -- OrderStatusBadge
// Результат: PASS (все 3 теста)
```

### REFACTOR: извлечь хуки и компоненты

```typescript
// REFACTOR Phase -- извлечение в хук, если логика растёт

// Если компонент вырос -- выделяем хук
function useOrderStatus(status: OrderStatus) {
  return {
    label: STATUS_LABELS[status],
    style: STATUS_STYLES[status],
    isTerminal: status === 'COMPLETED' || status === 'CANCELLED',
  };
}

// Компонент становится тоньше
export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const { label, style } = useOrderStatus(status);

  return (
    <span role="status" className={`badge ${style}`}>
      {label}
    </span>
  );
}

// Запуск: npm test -- OrderStatusBadge
// Результат: PASS (тесты не изменились, рефакторинг прозрачен)
```

### Порядок TDD-цикла для FE-задачи

```
1. Прочитать test-spec.md (секция Frontend Tests)
2. RED:   Написать тесты для компонента (render + assertions)
3. RED:   Запустить -- убедиться FAIL
4. GREEN: Написать минимальный компонент
5. GREEN: Запустить -- убедиться PASS
6. REFACTOR: Извлечь хуки, разделить компоненты
7. REFACTOR: Добавить ARIA, оптимизировать
8. REFACTOR: Запустить -- убедиться PASS
9. Повторить для следующего компонента/хука
```

---

## 8. Доступность (Accessibility / a11y)

### Семантический HTML

```typescript
// Правильно: семантические элементы
<nav aria-label="Основная навигация">
  <ul>
    <li><a href="/orders">Заказы</a></li>
    <li><a href="/clients">Клиенты</a></li>
  </ul>
</nav>

<main>
  <h1>Список заказов</h1>
  <section aria-labelledby="active-orders-title">
    <h2 id="active-orders-title">Активные заказы</h2>
    <table>
      <caption>Список активных заказов</caption>
      {/* ... */}
    </table>
  </section>
</main>

// Неправильно: div-суп
<div className="nav">
  <div className="nav-item" onClick={...}>Заказы</div>
</div>
```

### ARIA-атрибуты

| Ситуация | Атрибут | Пример |
|----------|---------|--------|
| Иконка-кнопка | `aria-label` | `<button aria-label="Удалить заказ">` |
| Загрузка | `aria-busy` | `<div aria-busy={isLoading}>` |
| Ошибка формы | `aria-invalid` + `aria-describedby` | `<input aria-invalid={!!error} aria-describedby="error-id">` |
| Модальное окно | `role="dialog"` + `aria-modal` | `<div role="dialog" aria-modal="true">` |
| Живые области | `aria-live` | `<div aria-live="polite">{notification}</div>` |
| Статус | `role="status"` | `<span role="status">{badge}</span>` |
| Прогресс | `role="progressbar"` | `<div role="progressbar" aria-valuenow={50}>` |

### Клавиатурная навигация

```typescript
// Кастомный dropdown с клавиатурной навигацией
function CustomSelect({ options, value, onChange }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (isOpen && focusedIndex >= 0) {
          onChange(options[focusedIndex].value);
          setIsOpen(false);
        } else {
          setIsOpen(true);
        }
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (!isOpen) setIsOpen(true);
        setFocusedIndex((prev) => Math.min(prev + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  return (
    <div
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <span>{selectedLabel}</span>
      {isOpen && (
        <ul role="listbox">
          {options.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              data-focused={index === focusedIndex}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Тестирование доступности

```typescript
// Используем jest-axe для автоматической проверки a11y
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

describe('OrderForm a11y', () => {
  it('не должна иметь нарушений доступности', async () => {
    const { container } = render(<OrderForm onSubmit={vi.fn()} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

### Чеклист a11y для каждого компонента

- [ ] Все интерактивные элементы доступны с клавиатуры (Tab, Enter, Space, Escape)
- [ ] Изображения имеют `alt` текст (или `alt=""` для декоративных)
- [ ] Формы имеют `<label>` для каждого поля
- [ ] Ошибки анонсируются screen reader (`role="alert"`)
- [ ] Контраст цветов >= 4.5:1 (WCAG AA)
- [ ] Фокус видим и стилизован (`:focus-visible`)
- [ ] Модальные окна запирают фокус (focus trap)
- [ ] Загрузки анонсируются (`aria-busy="true"`)

---

## 9. Производительность

### Code Splitting (динамический импорт)

```typescript
// Next.js dynamic import для тяжёлых компонентов
import dynamic from 'next/dynamic';

// Тяжёлый график -- загружаем лениво
const OrderChart = dynamic(() => import('@/components/charts/OrderChart'), {
  loading: () => <ChartSkeleton />,
  ssr: false,       // Не рендерить на сервере (если использует window)
});

// Модальное окно -- загружаем по требованию
const DeleteConfirmModal = dynamic(
  () => import('@/components/modals/DeleteConfirmModal')
);

// Использование
function OrderDashboard() {
  const [showChart, setShowChart] = useState(false);

  return (
    <div>
      <Button onClick={() => setShowChart(true)}>Показать график</Button>
      {showChart && <OrderChart data={data} />}
    </div>
  );
}
```

### Оптимизация изображений

```typescript
// Next.js Image: автоматическая оптимизация
import Image from 'next/image';

function ProductCard({ product }: { product: Product }) {
  return (
    <div>
      <Image
        src={product.imageUrl}
        alt={product.name}
        width={300}
        height={200}
        placeholder="blur"                // Размытый placeholder при загрузке
        blurDataURL={product.thumbUrl}
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        priority={false}                   // true только для above-the-fold
      />
    </div>
  );
}
```

### Правила memo / useMemo / useCallback

**Не оптимизируй преждевременно.** Используй мемоизацию только когда есть измеримая проблема.

```typescript
// Когда ИСПОЛЬЗОВАТЬ React.memo:
// 1. Компонент рендерится часто с одинаковыми props
// 2. Компонент тяжёлый (много DOM-узлов)
// 3. Родитель рендерится часто, а дочерний -- нет

const OrderCard = React.memo(function OrderCard({ order }: { order: Order }) {
  return (
    <article>
      <h3>{order.number}</h3>
      <p>{order.client.name}</p>
    </article>
  );
});

// Когда ИСПОЛЬЗОВАТЬ useMemo:
// 1. Тяжёлые вычисления (сортировка/фильтрация больших массивов)
// 2. Объект передаётся как props в memo-компонент

function OrdersList({ orders }: { orders: Order[] }) {
  const [filter, setFilter] = useState('');

  // Правильно: фильтрация тысяч записей
  const filteredOrders = useMemo(
    () => orders.filter((o) => o.number.includes(filter)),
    [orders, filter]
  );

  return <OrderTable orders={filteredOrders} />;
}

// Когда ИСПОЛЬЗОВАТЬ useCallback:
// 1. Функция передаётся в memo-компонент
// 2. Функция передаётся в useEffect зависимости

function OrderPage() {
  const deleteOrder = useDeleteOrder();

  // Правильно: передаётся в memo-компонент OrderCard
  const handleDelete = useCallback(
    (id: string) => deleteOrder.mutate(id),
    [deleteOrder]
  );

  return <OrderCard onDelete={handleDelete} />;
}
```

### Когда НЕ использовать мемоизацию

```typescript
// Неправильно: мемоизация простого значения
const name = useMemo(() => `${firstName} ${lastName}`, [firstName, lastName]);

// Правильно: просто вычисляем
const name = `${firstName} ${lastName}`;

// Неправильно: useCallback для inline-обработчика без memo
<button onClick={useCallback(() => setOpen(true), [])}>Открыть</button>

// Правильно: просто inline
<button onClick={() => setOpen(true)}>Открыть</button>
```

### Виртуализация длинных списков

```typescript
// Для списков > 100 элементов используем виртуализацию
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualOrdersList({ orders }: { orders: Order[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: orders.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,              // Примерная высота строки
    overscan: 5,                         // Дополнительные строки за viewport
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              transform: `translateY(${virtualItem.start}px)`,
              width: '100%',
            }}
          >
            <OrderRow order={orders[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 10. Обработка ошибок

### Error Boundaries

```typescript
// components/shared/ErrorBoundary.tsx
'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
    // Отправка в мониторинг (Sentry, etc.)
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.handleReset);
      }
      return this.props.fallback ?? <DefaultErrorFallback onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

// Default fallback
function DefaultErrorFallback({ onReset }: { onReset: () => void }) {
  return (
    <div role="alert" className={styles.errorFallback}>
      <h2>Что-то пошло не так</h2>
      <p>Произошла непредвиденная ошибка. Попробуйте обновить страницу.</p>
      <Button onClick={onReset}>Попробовать снова</Button>
    </div>
  );
}
```

### Next.js error.tsx

```typescript
// app/(dashboard)/orders/error.tsx
'use client';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function OrdersError({ error, reset }: ErrorPageProps) {
  return (
    <div role="alert">
      <h2>Ошибка загрузки заказов</h2>
      <p>{error.message}</p>
      <Button onClick={reset}>Попробовать снова</Button>
    </div>
  );
}
```

### Toast-уведомления

```typescript
// hooks/useToast.ts
import { create } from 'zustand';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));

    // Авто-удаление
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

// Хелперы
export function useToast() {
  const { addToast } = useToastStore();

  return {
    success: (title: string, message?: string) =>
      addToast({ type: 'success', title, message }),
    error: (title: string, message?: string) =>
      addToast({ type: 'error', title, message, duration: 8000 }),
    warning: (title: string, message?: string) =>
      addToast({ type: 'warning', title, message }),
    info: (title: string, message?: string) =>
      addToast({ type: 'info', title, message }),
  };
}
```

### Паттерн обработки ошибок мутаций

```typescript
// Полный паттерн: мутация с toast-уведомлениями
function CreateOrderPage() {
  const router = useRouter();
  const toast = useToast();
  const createOrder = useCreateOrder();

  const handleSubmit = async (data: CreateOrderFormData) => {
    try {
      const order = await createOrder.mutateAsync(data);
      toast.success('Заказ создан', `Номер: ${order.number}`);
      router.push(`/orders/${order.id}`);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.isValidationError) {
          toast.error('Ошибка валидации', error.apiError.message);
        } else if (error.isServerError) {
          toast.error('Ошибка сервера', 'Попробуйте позже');
        } else {
          toast.error('Ошибка', error.apiError.message);
        }
      } else {
        toast.error('Непредвиденная ошибка', 'Попробуйте обновить страницу');
      }
    }
  };

  return (
    <PageContainer title="Новый заказ">
      <OrderForm onSubmit={handleSubmit} isSubmitting={createOrder.isPending} />
    </PageContainer>
  );
}
```

### Fallback UI

```typescript
// Компонент для пустых состояний и ошибок
interface FallbackUIProps {
  type: 'empty' | 'error' | 'not-found' | 'forbidden';
  title?: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function FallbackUI({ type, title, message, action }: FallbackUIProps) {
  const defaults = {
    empty: {
      icon: <InboxIcon />,
      title: 'Нет данных',
      message: 'Здесь пока ничего нет',
    },
    error: {
      icon: <AlertCircleIcon />,
      title: 'Произошла ошибка',
      message: 'Не удалось загрузить данные',
    },
    'not-found': {
      icon: <SearchIcon />,
      title: 'Не найдено',
      message: 'Запрашиваемый ресурс не существует',
    },
    forbidden: {
      icon: <LockIcon />,
      title: 'Доступ запрещён',
      message: 'У вас нет прав для просмотра этой страницы',
    },
  };

  const config = defaults[type];

  return (
    <div role="status" className={styles.fallback}>
      {config.icon}
      <h3>{title ?? config.title}</h3>
      <p>{message ?? config.message}</p>
      {action && (
        <Button onClick={action.onClick} variant="primary">
          {action.label}
        </Button>
      )}
    </div>
  );
}
```

---

## Сводная таблица правил

| # | Область | Правило | Приоритет |
|---|---------|---------|-----------|
| 1 | Компоненты | Только функциональные, макс. 150 строк | Обязательно |
| 2 | Типизация | Strict TypeScript, нет `any` | Обязательно |
| 3 | Состояние | React Query для сервера, Zustand для UI | Обязательно |
| 4 | Формы | React Hook Form + Zod | Обязательно |
| 5 | API | Типизированный клиент, централизованные ошибки | Обязательно |
| 6 | Тесты | RTL + user-event + MSW | Обязательно |
| 7 | TDD | RED -> GREEN -> REFACTOR для каждого компонента | Обязательно |
| 8 | a11y | Семантический HTML, ARIA, клавиатурная навигация | Обязательно |
| 9 | Производительность | Code splitting, memo только по необходимости | Рекомендовано |
| 10 | Ошибки | Error Boundary + Toast + FallbackUI | Обязательно |
