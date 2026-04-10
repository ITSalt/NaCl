# Frontend Code Style Guide: React/Next.js + TypeScript

## Overview

Этот документ определяет конвенции кода для фронтенд-проектов на React/Next.js и TypeScript в рамках TL workflow. Дополняет основной [code-style.md](./code-style.md), который покрывает бэкенд Node.js/TypeScript. Общие правила TypeScript (strict mode, именование переменных, async-паттерны, обработка ошибок) наследуются из основного гайда. Здесь описана React-специфика.

## Ключевой принцип: Компонентность и композиция

**CRITICAL**: Интерфейс строится из маленьких, переиспользуемых компонентов. Каждый компонент решает одну задачу. Сложное поведение -- результат композиции, а не монолитных компонентов.

```
Компоненты:  Маленькие, сфокусированные, композируемые
Состояние:   Минимальное, поднятое на нужный уровень
Стили:       Tailwind utility classes
Типизация:   Строгая, без any в пропсах
```

---

## 1. Структура проекта (Next.js App Router)

### Рекомендуемый layout

```
src/
├── app/                    # App Router pages
│   ├── (auth)/             # Route groups (логическая группировка)
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── register/
│   │       └── page.tsx
│   ├── (dashboard)/        # Другая route group
│   │   ├── orders/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   └── layout.tsx
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   └── not-found.tsx       # 404 page
├── components/
│   ├── ui/                 # Базовые UI компоненты (Button, Input, Card)
│   ├── features/           # Feature-specific компоненты
│   │   ├── orders/         # Компоненты для работы с заказами
│   │   └── users/          # Компоненты для работы с пользователями
│   └── layouts/            # Layout компоненты (Header, Sidebar, Footer)
├── hooks/                  # Custom hooks
│   ├── useOrders.ts
│   ├── useAuth.ts
│   └── useMediaQuery.ts
├── lib/                    # Утилиты и конфигурации
│   ├── api/                # API client (fetch wrappers, React Query hooks)
│   │   ├── client.ts       # Базовый HTTP клиент
│   │   └── orders.ts       # API функции для заказов
│   └── utils/              # Helper functions
│       ├── cn.ts           # className utility
│       └── format.ts       # Форматирование дат, валют и т.д.
├── types/                  # TypeScript типы и интерфейсы
│   ├── order.ts
│   └── user.ts
├── stores/                 # State management (Zustand stores)
│   ├── orderStore.ts
│   └── uiStore.ts
└── styles/                 # Global styles, Tailwind config
    └── globals.css
```

### Правила размещения файлов

| Тип файла | Расположение | Пример |
|-----------|-------------|--------|
| Страница | `app/{route}/page.tsx` | `app/orders/page.tsx` |
| Layout | `app/{route}/layout.tsx` | `app/(dashboard)/layout.tsx` |
| UI компонент | `components/ui/` | `components/ui/Button.tsx` |
| Feature компонент | `components/features/{domain}/` | `components/features/orders/OrderCard.tsx` |
| Custom hook | `hooks/` | `hooks/useOrders.ts` |
| Zustand store | `stores/` | `stores/orderStore.ts` |
| Типы | `types/` | `types/order.ts` |
| API функции | `lib/api/` | `lib/api/orders.ts` |

---

## 2. Именование

### React-специфичные конвенции

| Элемент | Конвенция | Пример |
|---------|-----------|--------|
| Компоненты | PascalCase | `OrderForm.tsx`, `UserCard.tsx` |
| Тесты компонентов | PascalCase + `.test` | `OrderForm.test.tsx` |
| Hooks | camelCase + `use` prefix | `useOrders.ts`, `useAuth.ts` |
| Stores | camelCase + `Store` suffix | `orderStore.ts`, `uiStore.ts` |
| Props интерфейсы | PascalCase + `Props` suffix | `OrderFormProps`, `UserCardProps` |
| Input типы | PascalCase + `Input` suffix | `CreateOrderInput` |
| Страницы/Routes | kebab-case директории | `app/order-details/page.tsx` |
| Утилиты | camelCase | `formatDate.ts`, `cn.ts` |

### Именование компонентов

```typescript
// ✅ Good - PascalCase, описательное имя
OrderForm.tsx
OrderListItem.tsx
UserProfileCard.tsx
DashboardSidebar.tsx

// ✅ Good - тесты рядом с компонентом
Button.tsx
Button.test.tsx

// ❌ Bad
orderForm.tsx          // camelCase для компонента
Form.tsx               // Слишком общее имя
OrderFormComponent.tsx // Суффикс Component избыточен
order-form.tsx         // kebab-case для компонента
```

### Именование пропсов и типов

```typescript
// ✅ Good - без I-префикса, с Props суффиксом
interface OrderFormProps {
  orderId: string;
  onSubmit: (data: CreateOrderInput) => void;
  isLoading?: boolean;
}

interface UserCardProps {
  user: User;
  variant?: 'compact' | 'full';
}

// ❌ Bad
interface IOrderFormProps { }   // I-префикс
interface OrderFormPropsType { } // Избыточный суффикс
interface Props { }             // Слишком общее
```

---

## 3. Компоненты

### Базовая структура компонента

```tsx
// ✅ Good - правильный порядок: типы, компонент, экспорт
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils/format';
import type { Order } from '@/types/order';

interface OrderCardProps {
  order: Order;
  onCancel?: (orderId: string) => void;
  className?: string;
}

export function OrderCard({ order, onCancel, className }: OrderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={cn('rounded-lg border p-4', className)}>
      <h3 className="text-lg font-semibold">{order.title}</h3>
      <p className="text-sm text-gray-600">{formatCurrency(order.total)}</p>

      {isExpanded && (
        <div className="mt-4">
          {order.items.map((item) => (
            <OrderItemRow key={item.id} item={item} />
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? 'Collapse' : 'Expand'}
        </Button>
        {onCancel && (
          <Button variant="destructive" onClick={() => onCancel(order.id)}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
```

### Правила компонентов

```tsx
// ✅ Good - named export (предпочтительно)
export function OrderForm({ orderId, onSubmit }: OrderFormProps) {
  // ...
}

// ❌ Bad - default export (сложнее рефакторить)
export default function OrderForm({ orderId, onSubmit }: OrderFormProps) {
  // ...
}

// ✅ Good - деструктуризация пропсов в сигнатуре
export function UserCard({ user, variant = 'compact' }: UserCardProps) {
  // ...
}

// ❌ Bad - обращение через props.
export function UserCard(props: UserCardProps) {
  return <div>{props.user.name}</div>;
}

// ✅ Good - композиция через children
interface CardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, children, className }: CardProps) {
  return (
    <div className={cn('rounded-lg border bg-white p-6', className)}>
      <h2 className="mb-4 text-xl font-bold">{title}</h2>
      {children}
    </div>
  );
}

// Использование:
<Card title="Order Details">
  <OrderInfo order={order} />
  <OrderActions orderId={order.id} />
</Card>
```

### Размер компонента: максимум ~150 строк

Если компонент растёт -- извлекайте подкомпоненты:

```tsx
// ❌ Bad - монолитный компонент на 300+ строк
export function OrderPage() {
  // ...50 строк хуков и стейта...
  return (
    <div>
      {/* ...200 строк JSX... */}
    </div>
  );
}

// ✅ Good - декомпозиция
export function OrderPage() {
  const { order, isLoading } = useOrder(orderId);

  if (isLoading) return <OrderPageSkeleton />;
  if (!order) return <NotFound resource="Order" />;

  return (
    <div className="space-y-6">
      <OrderHeader order={order} />
      <OrderItemsTable items={order.items} />
      <OrderSummary total={order.total} discount={order.discount} />
      <OrderActions orderId={order.id} status={order.status} />
    </div>
  );
}
```

### Один компонент на файл

Исключение -- тесно связанные маленькие компоненты:

```tsx
// ✅ OK - тесно связанные компоненты в одном файле
interface StatusBadgeProps {
  status: OrderStatus;
}

function StatusIcon({ status }: StatusBadgeProps) {
  const icons: Record<OrderStatus, React.ReactNode> = {
    pending: <ClockIcon className="h-4 w-4" />,
    confirmed: <CheckIcon className="h-4 w-4" />,
    shipped: <TruckIcon className="h-4 w-4" />,
  };
  return <>{icons[status]}</>;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1', statusStyles[status])}>
      <StatusIcon status={status} />
      {status}
    </span>
  );
}
```

---

## 4. Hooks

### Custom hooks для переиспользуемой логики

```typescript
// hooks/useOrders.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { ordersApi } from '@/lib/api/orders';
import type { CreateOrderInput, Order } from '@/types/order';

// ✅ Good - hook для получения списка
export function useOrderList(filters?: OrderFilters) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => ordersApi.getAll(filters),
  });
}

// ✅ Good - hook для получения одного объекта
export function useOrder(id: string) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => ordersApi.getById(id),
    enabled: !!id,
  });
}

// ✅ Good - hook для мутации
export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOrderInput) => ordersApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
```

### Именование хуков: useEntityAction

```typescript
// ✅ Good - конвенция: use + Entity + Action
useOrderList()       // получить список заказов
useOrder(id)         // получить один заказ
useCreateOrder()     // создать заказ
useUpdateOrder()     // обновить заказ
useDeleteOrder()     // удалить заказ

useAuth()            // текущая авторизация
useCurrentUser()     // текущий пользователь
useMediaQuery(query) // media query hook

// ❌ Bad
useData()            // Слишком общее
useGetOrders()       // Избыточный get (use уже подразумевает)
useFetchOrder()      // fetch -- деталь реализации
```

### Возвращаемые значения: object для 3+, tuple для 2

```typescript
// ✅ Good - tuple для 2 значений
function useToggle(initial = false): [boolean, () => void] {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue((v) => !v), []);
  return [value, toggle];
}

// Использование:
const [isOpen, toggleOpen] = useToggle();

// ✅ Good - object для 3+ значений
function useOrderList(filters?: OrderFilters) {
  const query = useQuery({
    queryKey: ['orders', filters],
    queryFn: () => ordersApi.getAll(filters),
  });

  return {
    orders: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// Использование:
const { orders, isLoading, error } = useOrderList({ status: 'pending' });
```

### Никогда не вызывайте хуки условно

```tsx
// ❌ Bad - условный вызов хука
function UserProfile({ userId }: { userId?: string }) {
  if (!userId) return null;
  const { data: user } = useUser(userId); // НАРУШЕНИЕ правил хуков
  return <div>{user?.name}</div>;
}

// ✅ Good - хук всегда вызывается, условие через enabled
function UserProfile({ userId }: { userId?: string }) {
  const { data: user } = useUser(userId ?? '', { enabled: !!userId });

  if (!userId) return null;
  return <div>{user?.name}</div>;
}
```

### Извлекайте API-вызовы в хуки

```tsx
// ❌ Bad - fetch прямо в компоненте
export function OrderList() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/orders')
      .then((res) => res.json())
      .then((data) => setOrders(data))
      .finally(() => setIsLoading(false));
  }, []);

  return <div>{/* ... */}</div>;
}

// ✅ Good - логика в хуке, компонент чистый
export function OrderList() {
  const { orders, isLoading } = useOrderList();

  if (isLoading) return <OrderListSkeleton />;

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </div>
  );
}
```

---

## 5. TypeScript в React

### Типизация компонентов (без React.FC)

```tsx
// ✅ Good - явная типизация пропсов и возвращаемого значения
interface GreetingProps {
  name: string;
  age?: number;
}

export function Greeting({ name, age }: GreetingProps): React.ReactElement {
  return (
    <p>
      Hello, {name}{age ? `, age ${age}` : ''}
    </p>
  );
}

// ❌ Avoid - React.FC скрывает типизацию, добавляет неявный children
const Greeting: React.FC<GreetingProps> = ({ name, age }) => {
  return <p>Hello, {name}</p>;
};
```

### Generic компоненты

```tsx
// ✅ Good - generic компонент для списка
interface DataListProps<T> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
}

export function DataList<T>({
  items,
  renderItem,
  keyExtractor,
  emptyMessage = 'No items found',
}: DataListProps<T>): React.ReactElement {
  if (items.length === 0) {
    return <p className="text-gray-500">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={keyExtractor(item)}>{renderItem(item)}</li>
      ))}
    </ul>
  );
}

// Использование -- TypeScript автоматически выводит T:
<DataList
  items={orders}
  renderItem={(order) => <OrderCard order={order} />}
  keyExtractor={(order) => order.id}
/>
```

### Discriminated unions для вариантов компонентов

```tsx
// ✅ Good - discriminated union для разных вариантов кнопки
type ButtonProps =
  | {
      variant: 'link';
      href: string;
      onClick?: never;
    }
  | {
      variant: 'button';
      href?: never;
      onClick: () => void;
    };

type CommonButtonProps = ButtonProps & {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
};

export function ActionButton({ variant, children, className, ...props }: CommonButtonProps) {
  if (variant === 'link') {
    return (
      <a href={props.href} className={cn('text-blue-600 hover:underline', className)}>
        {children}
      </a>
    );
  }

  return (
    <button onClick={props.onClick} className={cn('rounded bg-blue-600 px-4 py-2', className)}>
      {children}
    </button>
  );
}
```

### Строгая типизация событий

```tsx
// ✅ Good - строгая типизация событий
function SearchInput({ onSearch }: { onSearch: (query: string) => void }) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onSearch(event.target.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSearch(event.currentTarget.value);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // ...
  };

  return (
    <form onSubmit={handleSubmit}>
      <input onChange={handleChange} onKeyDown={handleKeyDown} />
    </form>
  );
}
```

### Типизация refs

```tsx
// ✅ Good - правильная типизация ref
import { useRef, useEffect } from 'react';

export function AutoFocusInput() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return <input ref={inputRef} className="border rounded px-3 py-2" />;
}

// ✅ Good - forwarded ref
interface CustomInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const CustomInput = React.forwardRef<HTMLInputElement, CustomInputProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div>
        <label className="block text-sm font-medium">{label}</label>
        <input
          ref={ref}
          className={cn('mt-1 block w-full rounded border px-3 py-2', error && 'border-red-500', className)}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);

CustomInput.displayName = 'CustomInput';
```

---

## 6. Стилизация (Tailwind CSS)

### Tailwind utility classes -- основной подход

```tsx
// ✅ Good - Tailwind utility classes
export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('rounded-lg border bg-white p-6 shadow-sm', className)}>
      {children}
    </div>
  );
}

// ❌ Bad - inline styles
export function Card({ children }: CardProps) {
  return (
    <div style={{ borderRadius: 8, border: '1px solid #e5e7eb', padding: 24 }}>
      {children}
    </div>
  );
}

// ❌ Bad - CSS modules без необходимости (Tailwind покрывает)
import styles from './Card.module.css';
export function Card({ children }: CardProps) {
  return <div className={styles.card}>{children}</div>;
}
```

### Утилита cn() для условных классов

```typescript
// lib/utils/cn.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

```tsx
// ✅ Good - cn() для условных и мержа классов
interface BadgeProps {
  variant: 'success' | 'warning' | 'error';
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        {
          'bg-green-100 text-green-800': variant === 'success',
          'bg-yellow-100 text-yellow-800': variant === 'warning',
          'bg-red-100 text-red-800': variant === 'error',
        },
        className
      )}
    >
      {children}
    </span>
  );
}
```

### Responsive: mobile-first

```tsx
// ✅ Good - mobile-first: базовые стили для мобильных, усложнение для больших экранов
export function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-6 sm:px-6 md:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {children}
        </div>
      </div>
    </div>
  );
}

// Порядок брейкпоинтов: base → sm: → md: → lg: → xl: → 2xl:
```

### Извлечение повторяющихся паттернов

```tsx
// ✅ Good - вариации через пропсы компонента (вместо @apply)
const buttonVariants = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-gray-700 hover:bg-gray-100',
} as const;

const buttonSizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-base',
  lg: 'h-12 px-6 text-lg',
} as const;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
```

---

## 7. Формы

### React Hook Form + Zod

```tsx
// ✅ Good - полный пример формы
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Zod схема рядом с формой
const createOrderSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(100, 'Title must be at most 100 characters'),
  description: z.string().optional(),
  amount: z
    .number({ invalid_type_error: 'Amount must be a number' })
    .positive('Amount must be positive'),
  priority: z.enum(['low', 'medium', 'high'], {
    errorMap: () => ({ message: 'Please select a priority' }),
  }),
});

type CreateOrderFormData = z.infer<typeof createOrderSchema>;

interface CreateOrderFormProps {
  onSubmit: (data: CreateOrderFormData) => Promise<void>;
  defaultValues?: Partial<CreateOrderFormData>;
}

export function CreateOrderForm({ onSubmit, defaultValues }: CreateOrderFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrderFormData>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      priority: 'medium',
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Text input */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          Title
        </label>
        <input
          id="title"
          {...register('title')}
          className={cn(
            'mt-1 block w-full rounded border px-3 py-2',
            errors.title && 'border-red-500'
          )}
        />
        {errors.title && (
          <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
        )}
      </div>

      {/* Number input */}
      <div>
        <label htmlFor="amount" className="block text-sm font-medium">
          Amount
        </label>
        <input
          id="amount"
          type="number"
          step="0.01"
          {...register('amount', { valueAsNumber: true })}
          className={cn(
            'mt-1 block w-full rounded border px-3 py-2',
            errors.amount && 'border-red-500'
          )}
        />
        {errors.amount && (
          <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>
        )}
      </div>

      {/* Select */}
      <div>
        <label htmlFor="priority" className="block text-sm font-medium">
          Priority
        </label>
        <select
          id="priority"
          {...register('priority')}
          className="mt-1 block w-full rounded border px-3 py-2"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        {errors.priority && (
          <p className="mt-1 text-sm text-red-600">{errors.priority.message}</p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Creating...' : 'Create Order'}
      </button>
    </form>
  );
}
```

### Controller для сложных компонентов

```tsx
import { Controller, useForm } from 'react-hook-form';

// Для компонентов, не поддерживающих ref (кастомные select, datepicker и т.д.)
export function OrderFilterForm() {
  const { control, handleSubmit } = useForm<OrderFilterData>();

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        name="dateRange"
        control={control}
        render={({ field, fieldState }) => (
          <div>
            <DateRangePicker
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
            {fieldState.error && (
              <p className="mt-1 text-sm text-red-600">{fieldState.error.message}</p>
            )}
          </div>
        )}
      />
    </form>
  );
}
```

### Правила для форм

| Правило | Описание |
|---------|----------|
| Zod-схема рядом с формой | Схема определяется в том же файле, что и форма |
| Тип из схемы | `type FormData = z.infer<typeof schema>` |
| Ошибки под полем | Per-field сообщение сразу под инпутом |
| Disabled при submit | Кнопка `disabled={isSubmitting}` |
| Loading state | Текст кнопки меняется: `Creating...` |
| `valueAsNumber` | Для number-полей: `register('amount', { valueAsNumber: true })` |

---

## 8. API Integration

### React Query / TanStack Query

```typescript
// lib/api/client.ts -- базовый HTTP клиент
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiClient<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new ApiError(
      `API Error: ${response.statusText}`,
      response.status,
      await response.json().catch(() => null)
    );
  }

  return response.json() as Promise<T>;
}
```

```typescript
// lib/api/orders.ts -- API функции для entity
import { apiClient } from './client';
import type { Order, CreateOrderInput, OrderFilters } from '@/types/order';

export const ordersApi = {
  getAll: (filters?: OrderFilters) =>
    apiClient<Order[]>('/api/orders', {
      method: 'GET',
      // ...query params
    }),

  getById: (id: string) =>
    apiClient<Order>(`/api/orders/${id}`),

  create: (input: CreateOrderInput) =>
    apiClient<Order>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (id: string, input: Partial<CreateOrderInput>) =>
    apiClient<Order>(`/api/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  delete: (id: string) =>
    apiClient<void>(`/api/orders/${id}`, {
      method: 'DELETE',
    }),
};
```

```typescript
// hooks/useOrders.ts -- React Query хуки
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { ordersApi } from '@/lib/api/orders';
import type { CreateOrderInput, OrderFilters } from '@/types/order';

export function useOrderList(filters?: OrderFilters) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => ordersApi.getAll(filters),
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => ordersApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ordersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateOrderInput> }) =>
      ordersApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders', id] });
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ordersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
```

### Optimistic updates

```typescript
export function useToggleOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      ordersApi.update(id, { status }),

    // Optimistic update
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['orders', id] });
      const previousOrder = queryClient.getQueryData<Order>(['orders', id]);

      queryClient.setQueryData<Order>(['orders', id], (old) =>
        old ? { ...old, status } : old
      );

      return { previousOrder };
    },

    // Откат при ошибке
    onError: (_error, { id }, context) => {
      if (context?.previousOrder) {
        queryClient.setQueryData(['orders', id], context.previousOrder);
      }
    },

    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['orders', id] });
    },
  });
}
```

### Loading skeletons вместо спиннеров

```tsx
// ✅ Good - skeleton показывает layout загружаемого контента
export function OrderCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border p-4">
      <div className="h-5 w-2/3 rounded bg-gray-200" />
      <div className="mt-2 h-4 w-1/3 rounded bg-gray-200" />
      <div className="mt-4 h-8 w-24 rounded bg-gray-200" />
    </div>
  );
}

export function OrderListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </div>
  );
}

// Использование в компоненте
export function OrderList() {
  const { data: orders, isLoading, error } = useOrderList();

  if (isLoading) return <OrderListSkeleton />;
  if (error) return <ErrorMessage error={error} />;
  if (!orders?.length) return <EmptyState message="No orders yet" />;

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </div>
  );
}

// ❌ Bad - спиннер не показывает структуру
export function OrderList() {
  const { data: orders, isLoading } = useOrderList();
  if (isLoading) return <Spinner />;
  // ...
}
```

### Error Boundaries

```tsx
// components/ui/ErrorBoundary.tsx
'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
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
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <h2 className="text-lg font-semibold text-red-800">Something went wrong</h2>
          <p className="mt-2 text-sm text-red-600">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Использование:
<ErrorBoundary fallback={<OrderErrorFallback />}>
  <OrderList />
</ErrorBoundary>
```

---

## 9. Anti-patterns

### Запрещённые паттерны и их решения

#### Нет `any` в пропсах

```tsx
// ❌ Bad
interface TableProps {
  data: any[];
  columns: any[];
  onRowClick: (row: any) => void;
}

// ✅ Good
interface TableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  onRowClick: (row: T) => void;
}
```

#### Нет бизнес-логики в компонентах

```tsx
// ❌ Bad - бизнес-логика в компоненте
export function OrderSummary({ items }: { items: OrderItem[] }) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.2;
  const discount = subtotal > 1000 ? subtotal * 0.1 : 0;
  const total = subtotal + tax - discount;

  return <div>Total: {total}</div>;
}

// ✅ Good - логика в утилите/хуке
// lib/utils/order.ts
export function calculateOrderSummary(items: OrderItem[]): OrderSummary {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.2;
  const discount = subtotal > 1000 ? subtotal * 0.1 : 0;
  const total = subtotal + tax - discount;
  return { subtotal, tax, discount, total };
}

// Компонент только отображает
export function OrderSummary({ items }: { items: OrderItem[] }) {
  const summary = calculateOrderSummary(items);
  return <div>Total: {formatCurrency(summary.total)}</div>;
}
```

#### Нет прямых fetch() в компонентах

```tsx
// ❌ Bad - fetch в компоненте
export function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    fetch(`/api/users/${userId}`).then(r => r.json()).then(setUser);
  }, [userId]);
  return <div>{user?.name}</div>;
}

// ✅ Good - через API хук
export function UserProfile({ userId }: { userId: string }) {
  const { data: user, isLoading } = useUser(userId);
  if (isLoading) return <ProfileSkeleton />;
  return <div>{user?.name}</div>;
}
```

#### Нет prop drilling > 2 уровней

```tsx
// ❌ Bad - prop drilling через 3+ уровня
function Page() {
  const { user } = useAuth();
  return <Dashboard user={user} />;
}
function Dashboard({ user }: { user: User }) {
  return <Sidebar user={user} />;
}
function Sidebar({ user }: { user: User }) {
  return <UserMenu user={user} />;
}
function UserMenu({ user }: { user: User }) {
  return <span>{user.name}</span>;
}

// ✅ Good - Zustand store или Context
// stores/authStore.ts
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));

// Любой компонент на любом уровне:
function UserMenu() {
  const user = useAuthStore((state) => state.user);
  return <span>{user?.name}</span>;
}
```

#### Нет useEffect для производного состояния

```tsx
// ❌ Bad - useEffect для вычисляемого значения
function OrderList({ orders }: { orders: Order[] }) {
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (statusFilter === 'all') {
      setFilteredOrders(orders);
    } else {
      setFilteredOrders(orders.filter((o) => o.status === statusFilter));
    }
  }, [orders, statusFilter]);

  return <div>{filteredOrders.map(/* ... */)}</div>;
}

// ✅ Good - useMemo для производного состояния
function OrderList({ orders }: { orders: Order[] }) {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredOrders = useMemo(
    () =>
      statusFilter === 'all'
        ? orders
        : orders.filter((o) => o.status === statusFilter),
    [orders, statusFilter]
  );

  return <div>{filteredOrders.map(/* ... */)}</div>;
}
```

#### Нет index как key для динамических списков

```tsx
// ❌ Bad - index как key для списка, который может меняться
{orders.map((order, index) => (
  <OrderCard key={index} order={order} />
))}

// ✅ Good - уникальный стабильный id
{orders.map((order) => (
  <OrderCard key={order.id} order={order} />
))}

// ✅ OK - index допустим ТОЛЬКО для статических списков
{menuItems.map((item, index) => (
  <li key={index}>{item}</li>
))}
```

---

## Quick Reference Card

### Именование (React)

```
Компонент       → PascalCase      → OrderForm.tsx
Тест            → PascalCase      → OrderForm.test.tsx
Hook            → use + camelCase → useOrders.ts
Store           → camelCase       → orderStore.ts
Props           → PascalCase      → OrderFormProps
Page directory  → kebab-case      → order-details/
```

### Структура компонента

```
1. Imports (built-in → external → internal → types)
2. Types/Interfaces (Props)
3. Вспомогательные функции/константы
4. Component function (export function)
5. Sub-components (если тесно связаны)
```

### Импорт порядок (React)

```typescript
// 1. React / Next.js
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

// 2. Внешние библиотеки
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

// 3. Внутренние модули (абсолютные пути)
import { Button } from '@/components/ui/Button';
import { useOrders } from '@/hooks/useOrders';
import { cn } from '@/lib/utils/cn';

// 4. Типы
import type { Order, OrderStatus } from '@/types/order';
```

### Стек технологий

```
UI framework:     React 18+ / Next.js 14+ (App Router)
Language:         TypeScript (strict)
Styling:          Tailwind CSS
Forms:            React Hook Form + Zod
Server state:     TanStack Query (React Query)
Client state:     Zustand
Class utility:    clsx + tailwind-merge (cn())
Testing:          Vitest + React Testing Library
```

---

## Checklist: Frontend Code Review

### Компоненты

- [ ] Только функциональные компоненты
- [ ] Named exports (не default)
- [ ] Props деструктурированы в сигнатуре
- [ ] Размер < 150 строк
- [ ] Один основной компонент на файл
- [ ] children для композиции

### TypeScript

- [ ] Нет `any` в props
- [ ] Строгая типизация событий
- [ ] Props interface определён над компонентом
- [ ] Generic компоненты с constraints

### Hooks

- [ ] Custom hooks для переиспользуемой логики
- [ ] Именование: useEntityAction
- [ ] Нет условных вызовов хуков
- [ ] API вызовы в хуках, не в компонентах

### Стили

- [ ] Tailwind utility classes
- [ ] cn() для условных классов
- [ ] Нет inline styles
- [ ] Mobile-first responsive

### Формы

- [ ] React Hook Form + Zod
- [ ] Ошибки под каждым полем
- [ ] Disabled кнопка при submit
- [ ] Loading state на кнопке

### API

- [ ] TanStack Query для серверного состояния
- [ ] Custom hooks на entity (useOrders, useCreateOrder)
- [ ] Loading skeletons (не спиннеры)
- [ ] Error boundaries

### Anti-patterns

- [ ] Нет бизнес-логики в компонентах
- [ ] Нет прямых fetch() в компонентах
- [ ] Нет prop drilling > 2 уровней
- [ ] Нет useEffect для производного состояния
- [ ] Нет index как key в динамических списках
