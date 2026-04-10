# Чеклист код-ревью для Frontend (React/TypeScript)

## Обзор

Данный чеклист дополняет основной [review-checklist.md](./review-checklist.md) (бэкенд) и фокусируется на специфике фронтенд-разработки: компоненты React, типизация, управление состоянием, доступность и производительность клиентской части.

**Философия ревью**: Быть конкретным, быть конструктивным, помогать расти.

```
Цель:           Надёжный, поддерживаемый и доступный UI
Фокус:          Архитектура компонентов, типобезопасность, UX
Рекомендация:   Ревью UI-кода проводить вместе с просмотром в браузере
Связь:          Используется совместно с review-checklist.md (общие проверки)
```

---

## Уровни серьёзности

| Уровень | Действие | Описание |
|---------|----------|----------|
| 🔴 **Blocker** | Обязательно исправить до мержа | Ломает функциональность, безопасность или доступность |
| 🟠 **Critical** | Настоятельно исправить до мержа | Серьёзные проблемы качества, сопровождаемости |
| 🟡 **Major** | Исправить, можно отдельным тикетом | Ухудшает качество, но не ломает |
| 🟢 **Minor** | Желательно, на усмотрение автора | Стилистические улучшения, предложения |

---

## 1. Компонентная архитектура

### Чеклист

| Серьёзность | Проверка |
|-------------|----------|
| 🔴 Blocker | Бизнес-логика вынесена из компонентов в хуки/утилиты |
| 🟠 Critical | Компонент не превышает 150 строк |
| 🟠 Critical | Один компонент на файл (один экспорт по умолчанию) |
| 🟡 Major | Props-интерфейс явно определён и экспортирован |
| 🟡 Major | Корректное использование `children` и композиции |
| 🟢 Minor | Именованные экспорты предпочтительнее default-экспортов |

### На что смотреть

Компонент должен быть "тонким" слоем представления. Вся логика обработки данных, вычислений, трансформаций и побочных эффектов должна находиться в кастомных хуках или утилитарных функциях. Компонент отвечает только за рендеринг UI на основе пропсов и состояния.

Крупные компоненты (>150 строк) обычно сигнализируют о нарушении принципа единой ответственности. Стоит разбить на подкомпоненты или вынести логику в хуки.

### Типичные ошибки

```tsx
// ❌ Бизнес-логика прямо в компоненте
function OrderPage() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    fetch('/api/orders')
      .then(res => res.json())
      .then(data => {
        // Фильтрация, сортировка, трансформация — всё здесь
        const filtered = data.filter(o => o.status !== 'cancelled');
        const sorted = filtered.sort((a, b) => b.date - a.date);
        const mapped = sorted.map(o => ({ ...o, total: calcTotal(o) }));
        setOrders(mapped);
      });
  }, []);

  return <div>{/* 200 строк JSX */}</div>;
}

// ✅ Логика в хуке, компонент тонкий
function OrderPage() {
  const { orders, isLoading, error } = useOrders();

  if (isLoading) return <OrderSkeleton />;
  if (error) return <ErrorBanner error={error} />;

  return <OrderList orders={orders} />;
}
```

```tsx
// ❌ Два компонента в одном файле
// components/UserCard.tsx
export function UserCard({ user }) { /* ... */ }
export function UserAvatar({ url }) { /* ... */ }  // Должен быть в отдельном файле

// ❌ Props без интерфейса
function Button(props) { /* props неизвестны */ }

// ✅ Явный интерфейс пропсов
export interface ButtonProps {
  variant: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({ variant, size = 'md', children, onClick }: ButtonProps) {
  // ...
}
```

### Как формулировать замечания

```
🔴 BLOCKER: Компонент OrderPage содержит логику фильтрации и сортировки
заказов (строки 45-78). Вынесите в хук useOrders() — компонент должен
только рендерить данные.

🟠 CRITICAL: Файл Dashboard.tsx — 280 строк. Разбейте на подкомпоненты:
DashboardHeader, DashboardMetrics, DashboardChart.

🟡 MAJOR: Пропсы компонента UserCard не типизированы интерфейсом.
Добавьте export interface UserCardProps { ... }.
```

---

## 2. TypeScript строгость

### Чеклист

| Серьёзность | Проверка |
|-------------|----------|
| 🔴 Blocker | Нет `any` в пропсах и состоянии |
| 🔴 Blocker | Нет type assertions (`as`) без обоснования в комментарии |
| 🟠 Critical | Корректная типизация событий (`React.ChangeEvent<HTMLInputElement>` и др.) |
| 🟠 Critical | Generic-компоненты правильно ограничены (constraints) |
| 🟡 Major | Discriminated unions для вариантов и состояний |
| 🟢 Minor | Возвращаемые типы указаны на кастомных хуках |

### На что смотреть

TypeScript должен работать на нас, а не против. `any` уничтожает всю ценность типизации: ошибки перестают обнаруживаться при компиляции и всплывают в рантайме. Type assertions (`as`) обходят проверки компилятора и допустимы только с чётким обоснованием (например, работа со сторонней библиотекой без типов).

Событийная типизация часто упускается: `onChange` принимает `React.ChangeEvent<HTMLInputElement>`, не `any` и не `Event`.

### Типичные ошибки

```tsx
// ❌ any в пропсах — полная потеря типобезопасности
interface TableProps {
  data: any[];           // Что за данные?
  onRowClick: (row: any) => void;
}

// ✅ Generic-компонент с ограничениями
interface TableProps<T extends { id: string | number }> {
  data: T[];
  columns: Column<T>[];
  onRowClick: (row: T) => void;
}

function Table<T extends { id: string | number }>({ data, columns, onRowClick }: TableProps<T>) {
  // TypeScript знает точный тип каждой строки
}
```

```tsx
// ❌ Небезопасный type assertion
const user = JSON.parse(response) as User;  // А если формат не совпадает?

// ✅ Валидация через Zod
const userSchema = z.object({ id: z.string(), name: z.string() });
const user = userSchema.parse(JSON.parse(response));
```

```tsx
// ❌ Неправильная типизация события
const handleChange = (e: any) => {
  setValue(e.target.value);
};

// ✅ Корректный тип события
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setValue(e.target.value);
};
```

```tsx
// ❌ Строковые литералы вместо discriminated union
interface Notification {
  type: string;
  message: string;
  errorCode?: number;    // Есть только при type === 'error', но TS не знает
}

// ✅ Discriminated union — компилятор знает, какие поля доступны
type Notification =
  | { type: 'success'; message: string }
  | { type: 'error'; message: string; errorCode: number }
  | { type: 'warning'; message: string; dismissable: boolean };
```

### Как формулировать замечания

```
🔴 BLOCKER: TableProps.data типизирован как any[] (строка 12). Используйте
generic: TableProps<T extends { id: string }> с конкретным типом строки.

🔴 BLOCKER: Type assertion `as AdminUser` (строка 45) без проверки типа.
Используйте type guard или runtime-валидацию (Zod/io-ts).

🟠 CRITICAL: handleChange (строка 33) принимает `e: any`. Укажите тип
React.ChangeEvent<HTMLSelectElement>.
```

---

## 3. State Management

### Чеклист

| Серьёзность | Проверка |
|-------------|----------|
| 🔴 Blocker | Нет prop drilling глубже 3-х уровней |
| 🟠 Critical | Серверные данные через React Query, а не локальное состояние |
| 🟠 Critical | Нет избыточного состояния (вычисляется из существующего) |
| 🟡 Major | Zustand — для глобального клиентского состояния; Context — для темы/auth |
| 🟡 Major | Нет `useEffect` для производного состояния (использовать `useMemo`) |

### На что смотреть

Каждый `useState` — это потенциальный источник рассинхронизации. Если значение можно вычислить из других данных, оно не должно быть отдельным состоянием. Серверные данные (результаты API-запросов) должны управляться через React Query (TanStack Query), который берёт на себя кэширование, рефетч, стейлирование и дедупликацию запросов.

Prop drilling (прокидывание пропсов через промежуточные компоненты, которые сами их не используют) ведёт к хрупкому коду. При глубине >3 уровней используйте Zustand/Context.

### Типичные ошибки

```tsx
// ❌ Избыточное состояние — fullName вычисляется из firstName + lastName
const [firstName, setFirstName] = useState('');
const [lastName, setLastName] = useState('');
const [fullName, setFullName] = useState('');

useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);

// ✅ Производное значение через useMemo (или просто переменная)
const [firstName, setFirstName] = useState('');
const [lastName, setLastName] = useState('');
const fullName = `${firstName} ${lastName}`;  // Не нужен даже useMemo
```

```tsx
// ❌ Серверные данные в локальном состоянии
const [users, setUsers] = useState<User[]>([]);
const [loading, setLoading] = useState(false);

useEffect(() => {
  setLoading(true);
  fetchUsers().then(data => {
    setUsers(data);
    setLoading(false);
  });
}, []);

// ✅ React Query — кэш, рефетч, обработка ошибок из коробки
const { data: users, isLoading, error } = useQuery({
  queryKey: ['users'],
  queryFn: fetchUsers,
});
```

```tsx
// ❌ Prop drilling через 4 уровня
<App>
  <Layout user={user}>
    <Sidebar user={user}>
      <UserMenu user={user}>
        <Avatar user={user} />  {/* Layout и Sidebar не используют user */}
      </UserMenu>
    </Sidebar>
  </Layout>
</App>

// ✅ Zustand store для глобального состояния
const useUserStore = create<UserStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));

function Avatar() {
  const user = useUserStore((state) => state.user);
  return <img src={user?.avatarUrl} alt={user?.name} />;
}
```

### Как формулировать замечания

```
🔴 BLOCKER: Проп `theme` прокидывается через 5 уровней (App → Layout →
PageWrapper → Section → Card → CardTitle). Используйте Context или
Zustand store.

🟠 CRITICAL: Данные пользователей хранятся в useState + useEffect для
загрузки (строки 15-28). Перенесите на React Query — получите кэширование,
обработку ошибок и индикацию загрузки.

🟠 CRITICAL: `filteredItems` — избыточное состояние. Вычисляйте через
useMemo из items + filterCriteria.
```

---

## 4. API Integration

### Чеклист

| Серьёзность | Проверка |
|-------------|----------|
| 🔴 Blocker | Нет прямого `fetch()` в компонентах |
| 🔴 Blocker | Обработка ошибок для всех API-вызовов |
| 🟠 Critical | Состояния загрузки (скелетоны/спиннеры) |
| 🟠 Critical | Типизированные ответы API (без `any`) |
| 🟡 Major | Оптимистичные обновления там, где уместно |
| 🟡 Major | Корректная инвалидация кэша |

### На что смотреть

API-вызовы должны быть изолированы в отдельном слое (api-клиент), а не разбросаны по компонентам. Каждый запрос оборачивается в React Query хук. Ответы должны проходить через runtime-валидацию (Zod-схему) для гарантии типобезопасности.

Пользователь должен всегда понимать, что происходит: загрузка данных, ошибка запроса, пустой результат. Молчаливый провал API-вызова без обратной связи пользователю — это баг.

### Типичные ошибки

```tsx
// ❌ fetch() прямо в компоненте, нет обработки ошибок
function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(res => res.json())
      .then(setUser);  // Ошибка сети? Ответ 500? Всё молча ломается
  }, [userId]);

  return <div>{user?.name}</div>;  // null → пустая страница без объяснений
}

// ✅ Выделенный API-слой + React Query + обработка состояний
// api/users.ts
export const usersApi = {
  getById: (id: string) =>
    httpClient.get<UserResponse>(`/users/${id}`).then(userSchema.parse),
};

// hooks/useUser.ts
export function useUser(userId: string) {
  return useQuery({
    queryKey: ['users', userId],
    queryFn: () => usersApi.getById(userId),
  });
}

// components/UserProfile.tsx
function UserProfile({ userId }: { userId: string }) {
  const { data: user, isLoading, error } = useUser(userId);

  if (isLoading) return <ProfileSkeleton />;
  if (error) return <ErrorBanner message="Не удалось загрузить профиль" retry />;

  return <ProfileCard user={user} />;
}
```

```tsx
// ❌ Мутация без инвалидации кэша
const handleDelete = async (id: string) => {
  await fetch(`/api/items/${id}`, { method: 'DELETE' });
  // Список на экране не обновится!
};

// ✅ useMutation с инвалидацией
const deleteMutation = useMutation({
  mutationFn: (id: string) => itemsApi.delete(id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['items'] });
    toast.success('Элемент удалён');
  },
  onError: () => {
    toast.error('Не удалось удалить элемент');
  },
});
```

### Как формулировать замечания

```
🔴 BLOCKER: Прямой fetch() в компоненте ProductList (строка 22). Вынесите
в API-слой (api/products.ts) и оберните в React Query хук useProducts().

🔴 BLOCKER: Ошибка запроса /api/orders не обрабатывается (строка 35). При
сетевой ошибке пользователь увидит пустой экран. Добавьте error state.

🟠 CRITICAL: Нет индикации загрузки при запросе пользователей. Добавьте
скелетон или спиннер на время isLoading.
```

---

## 5. Формы и валидация

### Чеклист

| Серьёзность | Проверка |
|-------------|----------|
| 🔴 Blocker | Весь пользовательский ввод валидируется (Zod + React Hook Form) |
| 🟠 Critical | Ошибки валидации отображаются у соответствующих полей |
| 🟠 Critical | Кнопка отправки заблокирована во время отправки |
| 🟡 Major | Корректный паттерн controlled/uncontrolled |
| 🟢 Minor | Сброс формы после успешной отправки |

### На что смотреть

Формы — основная точка ввода данных от пользователя и частый источник багов. React Hook Form обеспечивает производительную работу с формами (без лишних рендеров), а Zod даёт единую схему валидации для фронта и бэка. Каждое поле должно показывать свою ошибку, а не общее сообщение вверху формы.

Кнопка отправки без блокировки при pending-запросе приводит к дубликатам: пользователь нажимает дважды, создаётся два заказа.

### Типичные ошибки

```tsx
// ❌ Ручная валидация, нет блокировки кнопки, ошибки не у полей
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('Заполните все поля');  // Какое именно поле?
      return;
    }
    await login(email, password);  // Двойной клик = два запроса
  };

  return (
    <form>
      {error && <div className="error">{error}</div>}
      <input value={email} onChange={e => setEmail(e.target.value)} />
      <input value={password} onChange={e => setPassword(e.target.value)} />
      <button onClick={handleSubmit}>Войти</button>
    </form>
  );
}

// ✅ React Hook Form + Zod + блокировка + ошибки у полей
const loginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(8, 'Минимум 8 символов'),
});

type LoginFormData = z.infer<typeof loginSchema>;

function LoginForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    await login(data.email, data.password);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <input {...register('email')} placeholder="Email" />
        {errors.email && <span className="field-error">{errors.email.message}</span>}
      </div>
      <div>
        <input {...register('password')} type="password" placeholder="Пароль" />
        {errors.password && <span className="field-error">{errors.password.message}</span>}
      </div>
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Вход...' : 'Войти'}
      </button>
    </form>
  );
}
```

### Как формулировать замечания

```
🔴 BLOCKER: Форма регистрации (строки 20-55) не валидирует ввод. Email
и пароль отправляются на сервер без проверки. Добавьте Zod-схему и
React Hook Form с zodResolver.

🟠 CRITICAL: Ошибка валидации отображается одним общим сообщением вверху
формы (строка 30). Привяжите ошибки к конкретным полям через
errors.fieldName.message.

🟠 CRITICAL: Кнопка "Оформить заказ" не заблокирована при отправке
(строка 48). Добавьте disabled={isSubmitting} для предотвращения дублей.
```

---

## 6. Доступность (Accessibility)

### Чеклист

| Серьёзность | Проверка |
|-------------|----------|
| 🔴 Blocker | Интерактивные элементы имеют доступное имя (`aria-label` или видимый текст) |
| 🔴 Blocker | Изображения имеют `alt` текст |
| 🟠 Critical | Клавиатурная навигация работает (Tab, Enter, Escape) |
| 🟠 Critical | Контраст цветов соответствует WCAG AA (4.5:1 для текста) |
| 🟡 Major | Управление фокусом при открытии/закрытии модалок |
| 🟡 Major | Семантический HTML (`button` вместо `div[onClick]`) |
| 🟢 Minor | Screen reader анонсы для динамического контента |

### На что смотреть

Доступность — не опциональная функция, а базовое требование. Проверяйте, что все интерактивные элементы доступны с клавиатуры, имеют понятные имена для screen reader, и контраст текста достаточен. Простое правило: если элемент нельзя нажать через Tab + Enter, это баг.

`div` с `onClick` — не кнопка: он не получает фокус, не реагирует на Enter/Space, не объявляется screen reader как интерактивный элемент.

### Типичные ошибки

```tsx
// ❌ div вместо button — недоступен с клавиатуры
<div className="btn-primary" onClick={handleClick}>
  Сохранить
</div>

// ✅ Семантический HTML
<button className="btn-primary" onClick={handleClick}>
  Сохранить
</button>
```

```tsx
// ❌ Иконка-кнопка без доступного имени
<button onClick={onClose}>
  <XIcon />
</button>

// ✅ Иконка-кнопка с aria-label
<button onClick={onClose} aria-label="Закрыть диалог">
  <XIcon aria-hidden="true" />
</button>
```

```tsx
// ❌ Изображение без alt
<img src={product.image} />

// ✅ Информативный alt
<img src={product.image} alt={`Фото товара: ${product.name}`} />

// ✅ Декоративное изображение — пустой alt
<img src="/decorative-line.svg" alt="" />
```

```tsx
// ❌ Модалка не управляет фокусом
function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;
  return <div className="modal-overlay">{children}</div>;
}

// ✅ Фокус при открытии, возврат при закрытии, ловушка фокуса
function Modal({ isOpen, onClose, children }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      closeRef.current?.focus();
    } else {
      previousFocusRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Диалог">
      <button ref={closeRef} onClick={onClose} aria-label="Закрыть">
        <XIcon aria-hidden="true" />
      </button>
      {children}
    </div>
  );
}
```

### Как формулировать замечания

```
🔴 BLOCKER: Кнопка удаления (строка 34) — иконка без aria-label. Screen
reader произнесёт "button" без контекста. Добавьте aria-label="Удалить
элемент".

🔴 BLOCKER: Аватарка пользователя (строка 18) без alt текста. Добавьте
alt={user.name} или alt="" если декоративная.

🟠 CRITICAL: Карточка товара (строка 50) использует div[onClick] вместо
button или <a>. Недоступна с клавиатуры. Замените на семантический элемент.

🟡 MAJOR: Модалка (строка 72) не перемещает фокус при открытии. Пользователь
клавиатуры остаётся на фоновом элементе.
```

---

## 7. Responsive Design

### Чеклист

| Серьёзность | Проверка |
|-------------|----------|
| 🟠 Critical | Mobile-first подход (базовые стили, далее sm → md → lg) |
| 🟠 Critical | Нет горизонтальной прокрутки на мобильных |
| 🟡 Major | Тач-цели >= 44x44px |
| 🟡 Major | Нет фиксированных ширин, ломающих мелкие экраны |
| 🟢 Minor | Проверено на 375px (мобильный) и 1280px (десктоп) |

### На что смотреть

Mobile-first означает, что базовые стили пишутся для мобильного, а расширения добавляются через брейкпоинты вверх (min-width). Горизонтальная прокрутка на мобильных — один из самых частых визуальных багов. Проверяйте таблицы, длинные строки без переноса, абсолютно позиционированные элементы.

Тач-цели меньше 44x44px приводят к мис-тапам на мобильных устройствах (рекомендация Apple и Google).

### Типичные ошибки

```css
/* ❌ Desktop-first — мобильный добавлен как исключение */
.container {
  display: grid;
  grid-template-columns: 1fr 300px;
}
@media (max-width: 768px) {
  .container {
    grid-template-columns: 1fr;
  }
}

/* ✅ Mobile-first — базовый стиль мобильный, расширяем вверх */
.container {
  display: grid;
  grid-template-columns: 1fr;
}
@media (min-width: 768px) {
  .container {
    grid-template-columns: 1fr 300px;
  }
}
```

```tsx
// ❌ Фиксированная ширина, ломается на мобильных
<div style={{ width: '800px' }}>
  <table style={{ width: '100%' }}>...</table>
</div>

// ✅ Адаптивная обёртка с прокруткой для таблиц
<div className="w-full overflow-x-auto">
  <table className="min-w-[600px] w-full">...</table>
</div>
```

```css
/* ❌ Мелкие тач-цели */
.icon-button {
  width: 24px;
  height: 24px;
}

/* ✅ Минимум 44px для тач-области */
.icon-button {
  width: 24px;
  height: 24px;
  padding: 10px;  /* Визуально 24px, тач-зона 44px */
}
```

### Как формулировать замечания

```
🟠 CRITICAL: Страница каталога имеет горизонтальную прокрутку на 375px.
Таблица характеристик (строка 88) имеет фиксированную ширину 600px.
Оберните в overflow-x-auto контейнер.

🟡 MAJOR: Кнопки пагинации (строка 45) — 28x28px. Увеличьте тач-зону
до минимум 44x44px (можно через padding).

🟠 CRITICAL: Стили написаны desktop-first с max-width медиа-запросами
(строки 10-30). Перепишите в mobile-first подходе: базовые стили для
мобильных, @media (min-width: ...) для расширения.
```

---

## 8. Performance

### Чеклист

| Серьёзность | Проверка |
|-------------|----------|
| 🟠 Critical | Нет лишних ре-рендеров (проверка React DevTools Profiler) |
| 🟠 Critical | Длинные списки виртуализированы (react-window / @tanstack/virtual) |
| 🟡 Major | Изображения оптимизированы (Next.js Image component) |
| 🟡 Major | Динамические импорты для тяжёлых компонентов |
| 🟡 Major | `useMemo` / `useCallback` для реально дорогих вычислений (без преждевременной оптимизации) |
| 🟢 Minor | Учтено влияние на размер бандла |

### На что смотреть

Производительность фронтенда — это баланс. Не нужно оборачивать каждую функцию в `useCallback`: оптимизируйте только то, что реально тормозит. React DevTools Profiler покажет, какие компоненты рендерятся лишний раз.

Список из 1000+ элементов без виртуализации вызывает заметные тормоза: в DOM создаются тысячи узлов. Виртуализация рендерит только видимые элементы.

Тяжёлые библиотеки (графики, редакторы, карты) должны загружаться по требованию через `React.lazy()` / `next/dynamic`.

### Типичные ошибки

```tsx
// ❌ Список 5000 элементов без виртуализации
function ProductList({ products }: { products: Product[] }) {
  return (
    <div>
      {products.map(p => (
        <ProductCard key={p.id} product={p} />  // 5000 DOM-узлов
      ))}
    </div>
  );
}

// ✅ Виртуализированный список
import { useVirtualizer } from '@tanstack/react-virtual';

function ProductList({ products }: { products: Product[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
  });

  return (
    <div ref={parentRef} style={{ overflow: 'auto', height: '600px' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <ProductCard
            key={products[virtualItem.index].id}
            product={products[virtualItem.index]}
            style={{
              position: 'absolute',
              top: virtualItem.start,
              height: virtualItem.size,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

```tsx
// ❌ Тяжёлый импорт в основном бандле
import { Chart } from 'chart.js';  // +200KB в main bundle

// ✅ Динамический импорт — загружается по требованию
const Chart = lazy(() => import('./components/Chart'));

function Dashboard() {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <Chart data={data} />
    </Suspense>
  );
}
```

```tsx
// ❌ Преждевременная оптимизация — useMemo для тривиальной операции
const fullName = useMemo(() => `${first} ${last}`, [first, last]);

// ✅ useMemo для действительно дорогой операции
const sortedAndFilteredProducts = useMemo(
  () => products
    .filter(p => p.category === selectedCategory)
    .sort((a, b) => a.price - b.price),
  [products, selectedCategory]
);
```

### Как формулировать замечания

```
🟠 CRITICAL: Список транзакций (строка 55) рендерит все 3000 элементов
в DOM. Используйте @tanstack/react-virtual для виртуализации.

🟡 MAJOR: Компонент ChartEditor импортируется статически (строка 3), но
показывается только при клике на "Аналитика". Вынесите в React.lazy() +
Suspense для уменьшения начального бандла.

🟡 MAJOR: useMemo на строке 28 оборачивает конкатенацию строки — это
преждевременная оптимизация. useMemo имеет свой overhead и оправдан только
для дорогих вычислений.
```

---

## 9. Тестирование (React Testing Library)

### Чеклист

| Серьёзность | Проверка |
|-------------|----------|
| 🔴 Blocker | Тесты покрывают все критерии приёмки (acceptance criteria) |
| 🟠 Critical | Тесты ищут элементы по роли/тексту (не по test-id без необходимости) |
| 🟠 Critical | Пользовательские взаимодействия тестируются через `userEvent` |
| 🟡 Major | Граничные случаи протестированы (пустое состояние, ошибка, загрузка) |
| 🟡 Major | Не тестируются детали реализации |
| 🟢 Minor | Snapshot-тесты только для стабильных UI-компонентов |

### На что смотреть

Тесты должны проверять поведение, а не реализацию. Если тест ломается при рефакторинге, не меняющем поведение, это плохой тест. React Testing Library поощряет тестирование с точки зрения пользователя: ищем элементы так, как их найдёт пользователь (по тексту, роли, лейблу), а не по CSS-классам или data-testid.

`userEvent` предпочтительнее `fireEvent` — он эмулирует реальное взаимодействие (фокус, набор текста посимвольно, клик).

### Типичные ошибки

```tsx
// ❌ Тест зависит от реализации
test('updates state on click', () => {
  const { result } = renderHook(() => useCounter());
  act(() => result.current.increment());
  expect(result.current.count).toBe(1);  // Тестирует хук, не поведение UI
});

// ✅ Тест проверяет поведение с точки зрения пользователя
test('counter increments when user clicks the plus button', async () => {
  const user = userEvent.setup();
  render(<Counter />);

  expect(screen.getByText('Счётчик: 0')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /увеличить/i }));

  expect(screen.getByText('Счётчик: 1')).toBeInTheDocument();
});
```

```tsx
// ❌ Поиск по test-id, когда есть более доступная альтернатива
const button = screen.getByTestId('submit-btn');

// ✅ Поиск по роли и тексту — как это найдёт пользователь
const button = screen.getByRole('button', { name: /отправить/i });
```

```tsx
// ❌ fireEvent вместо userEvent
fireEvent.change(input, { target: { value: 'test@email.com' } });
fireEvent.click(button);

// ✅ userEvent эмулирует реальные взаимодействия
const user = userEvent.setup();
await user.type(input, 'test@email.com');
await user.click(button);
```

```tsx
// ❌ Не протестированы граничные случаи
test('renders user list', () => {
  render(<UserList users={mockUsers} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
});
// А если users = []? А если загрузка? А если ошибка?

// ✅ Граничные случаи покрыты
test('shows empty state when no users', () => {
  render(<UserList users={[]} />);
  expect(screen.getByText(/нет пользователей/i)).toBeInTheDocument();
});

test('shows skeleton during loading', () => {
  render(<UserList users={[]} isLoading />);
  expect(screen.getByRole('status')).toBeInTheDocument(); // скелетон
});

test('shows error banner on fetch failure', () => {
  render(<UserList users={[]} error={new Error('Network error')} />);
  expect(screen.getByRole('alert')).toBeInTheDocument();
});
```

### Как формулировать замечания

```
🔴 BLOCKER: Acceptance criteria: "Пользователь видит ошибку при неверном
пароле". Тест на этот сценарий отсутствует. Добавьте тест с вводом
неверного пароля и проверкой сообщения об ошибке.

🟠 CRITICAL: Тест (строка 15) ищет кнопку через getByTestId('delete-btn').
У кнопки есть текст "Удалить" — используйте getByRole('button',
{ name: /удалить/i }).

🟠 CRITICAL: Используется fireEvent.click (строка 22). Замените на
userEvent.click для эмуляции реального взаимодействия пользователя.
```

---

## 10. Заглушки (Stub Check)

### Чеклист

| Серьёзность | Проверка |
|-------------|----------|
| 🔴 Blocker | Нет TODO / STUB / MOCK в продакшн-компонентах |
| 🔴 Blocker | Нет захардкоженных mock-данных в API-хуках |
| 🟠 Critical | Нет плейсхолдер-текста ("Lorem ipsum", "test", "TODO") |
| 🟡 Major | Нет закомментированных блоков кода |
| 🟡 Major | Нет `console.log` выражений |

### На что смотреть

Заглушки — нормальная часть разработки, но они не должны попадать в production-код. Проверяйте, что временные решения заменены на реальные реализации. Особенно опасны mock-данные в API-хуках: приложение работает в dev-режиме, но ломается при деплое.

Закомментированный код — мёртвый код. Он вносит путаницу, устаревает и никогда не раскомментируется. Для истории есть git.

### Типичные ошибки

```tsx
// ❌ TODO в продакшн-компоненте
function PaymentForm() {
  // TODO: добавить валидацию карты
  const handleSubmit = () => {
    // STUB: пока просто логируем
    console.log('payment submitted');
  };
  return <form onSubmit={handleSubmit}>...</form>;
}

// ❌ Mock-данные вместо API
function useProducts() {
  // return useQuery({ queryKey: ['products'], queryFn: fetchProducts });
  return {
    data: [
      { id: 1, name: 'Test Product', price: 100 },
      { id: 2, name: 'Another Test', price: 200 },
    ],
    isLoading: false,
    error: null,
  };
}

// ❌ Закомментированный код и console.log
function UserProfile({ user }: { user: User }) {
  console.log('user data:', user);
  // const [editing, setEditing] = useState(false);
  // const handleSave = () => { ... };

  return (
    <div>
      {/* <button onClick={() => setEditing(true)}>Edit</button> */}
      <h2>{user.name}</h2>
      <p>Lorem ipsum dolor sit amet</p> {/* Плейсхолдер! */}
    </div>
  );
}
```

### Как формулировать замечания

```
🔴 BLOCKER: Хук useProducts (строка 5) возвращает захардкоженные mock-данные
вместо вызова API. При деплое пользователи увидят "Test Product".
Подключите реальный API-эндпоинт.

🔴 BLOCKER: TODO на строке 12: "добавить валидацию карты". Платёжная форма
без валидации — критический баг. Реализуйте валидацию или создайте тикет
и заблокируйте мерж.

🟠 CRITICAL: Текст "Lorem ipsum" в описании продукта (строка 38).
Замените на реальный текст или подключите данные из API.

🟡 MAJOR: console.log на строке 8. Уберите перед мержом — утечка данных
в консоль браузера.

🟡 MAJOR: Закомментированный блок кода (строки 22-35). Удалите — история
изменений хранится в git.
```

---

## Быстрый чеклист для самопроверки

Перед тем как отправить PR на ревью, пройдитесь по этому сокращённому списку:

```markdown
## Самопроверка перед PR

### Критические проверки
- [ ] Нет `any` в пропсах, состоянии и API-ответах
- [ ] Бизнес-логика вынесена из компонентов в хуки
- [ ] Все API-вызовы обёрнуты в React Query
- [ ] Ошибки обрабатываются и показываются пользователю
- [ ] Формы валидируются (Zod + React Hook Form)
- [ ] Интерактивные элементы доступны с клавиатуры
- [ ] Нет TODO/STUB/mock-данных
- [ ] Тесты покрывают acceptance criteria

### Дополнительные проверки
- [ ] Компоненты < 150 строк
- [ ] Нет prop drilling > 3 уровней
- [ ] Нет горизонтальной прокрутки на мобильных
- [ ] Длинные списки виртуализированы
- [ ] Нет console.log / закомментированного кода
- [ ] Тесты ищут элементы по роли/тексту
```

---

## Шаблоны комментариев для ревьюера

### По серьёзности

```
🔴 BLOCKER: [Описание проблемы]. [Почему это критично].
   Решение: [Конкретное предложение].

🟠 CRITICAL: [Описание проблемы]. [Риск/последствия].
   Предлагаю: [Вариант исправления].

🟡 MAJOR: [Описание проблемы].
   Можно улучшить: [Предложение].

🟢 MINOR: [Наблюдение/предложение]. Не блокирует мерж.
```

### По типу

```
❓ ВОПРОС: [Не понимаю причину решения]. Можешь объяснить выбор?

💡 ПРЕДЛОЖЕНИЕ: [Альтернативный подход]. Не настаиваю, но стоит
   рассмотреть.

👍 Отлично! [Что именно хорошо сделано и почему].
```
