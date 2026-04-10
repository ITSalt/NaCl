# Протокол взаимодействия агентов TL

## Общие принципы

Каждый агент (скилл) TL-сюиты спроектирован для:
1. **Автономной работы** -- можно запустить вручную через `/tl-{name}`
2. **Оркестрации** -- можно вызвать из `nacl-tl-full` или другого агента с параметрами
3. **Идемпотентности** -- повторный запуск при тех же входных данных даёт тот же результат
4. **Разделения BE/FE** -- backend и frontend разрабатываются параллельно с чёткими контрактами

---

## Диаграмма статусов задач

```
pending --> in_progress --> ready_for_review --> in_review
                                                    |
                                          +---------+---------+
                                          |                   |
                                       approved          rejected
                                          |                   |
                                      documenting      in_progress (повторно)
                                          |
                                         done
```

Переходы статусов:
| Переход | Кто выполняет | Событие |
|---------|---------------|---------|
| `pending` -> `in_progress` | nacl-tl-dev-be / nacl-tl-dev-fe / nacl-tl-dev | Начало разработки |
| `in_progress` -> `ready_for_review` | nacl-tl-dev-be / nacl-tl-dev-fe / nacl-tl-dev | TDD-цикл завершён, тесты зелёные |
| `ready_for_review` -> `in_review` | nacl-tl-review | Начало ревью |
| `in_review` -> `approved` | nacl-tl-review | Ревью пройдено |
| `in_review` -> `rejected` | nacl-tl-review | Ревью не пройдено, найдены блокеры |
| `rejected` -> `in_progress` | nacl-tl-dev-be / nacl-tl-dev-fe | Доработка по замечаниям (--continue) |
| `approved` -> `documenting` | nacl-tl-docs | Начало документирования |
| `documenting` -> `done` | nacl-tl-docs | Документация обновлена |

---

## Execution Waves (Волны Выполнения)

Задачи группируются в волны по зависимостям. Внутри одной волны задачи можно выполнять параллельно.

```
Wave 1: [BE-001, BE-002, FE-001]     -- базовые модели, общая UI-оболочка
Wave 2: [BE-003, FE-002, FE-003]     -- зависят от Wave 1
Wave 3: [TECH-001, BE-004, FE-004]   -- зависят от Wave 2
Wave 4: [SYNC-001, QA-001]           -- интеграция и E2E после всех волн
```

Правила волн:
- **BE перед FE**: если FE-задача зависит от API, соответствующая BE-задача должна быть в более ранней волне
- **TECH независимо**: TECH-задачи (инфраструктура, конфиг) могут идти в любой волне
- **SYNC после пар**: nacl-tl-sync запускается когда и BE, и FE для одного UC в статусе approved
- **QA в конце**: E2E тесты идут в финальных волнах

---

## Контракты агентов

### 1. nacl-tl-full

```yaml
agent: nacl-tl-full
trigger: /nacl-tl-full
context_mode: inline
description: >
  Оркестратор полного цикла разработки. Управляет последовательностью
  запуска всех агентов через Execution Waves. Отслеживает прогресс,
  разрешает зависимости, координирует BE/FE параллелизм.

reads:
  - docs/**/*                       # SA-артефакты (передаёт в nacl-tl-plan)
  - .tl/master-plan.md              # Мастер-план с волнами
  - .tl/status.json                 # Текущий прогресс
  - .tl/stub-registry.json          # Реестр заглушек
  - .tl/tasks/*/task.md             # Статусы задач
  - .tl/tasks/*/review-be.md        # Результаты BE-ревью
  - .tl/tasks/*/review-fe.md        # Результаты FE-ревью

writes:
  - .tl/status.json                 # Обновляет прогресс после каждого шага

creates_directories:
  - .tl/
  - .tl/tasks/
  - .tl/qa-screenshots/

calls_next:
  - nacl-tl-plan                         # Шаг 1: планирование
  - nacl-tl-dev-be                       # Шаг 2a: backend-разработка
  - nacl-tl-dev-fe                       # Шаг 2b: frontend-разработка
  - nacl-tl-dev                          # Шаг 2c: TECH-задачи
  - nacl-tl-sync                         # Шаг 3: синхронизация BE/FE
  - nacl-tl-stubs                        # Шаг 3.5: проверка заглушек
  - nacl-tl-review --be                  # Шаг 4a: ревью backend
  - nacl-tl-review --fe                  # Шаг 4b: ревью frontend
  - nacl-tl-qa                           # Шаг 5: E2E тестирование
  - nacl-tl-docs                         # Шаг 6: документация
  - nacl-tl-status                       # Между шагами: отчёт

called_by: []                       # Верхнеуровневый оркестратор, вызывается только пользователем

parameters:
  scope: full | wave | task         # full = весь проект, wave = одна волна, task = одна задача
  wave_number: number               # только если scope=wave
  task_id: string                   # только если scope=task
  skip_plan: boolean                # пропустить планирование (master-plan.md уже создан)
  skip_qa: boolean                  # пропустить E2E (нет MCP Playwright)
```

**Порядок оркестрации (scope=full):**

```
nacl-tl-full (orchestrator)
|
+-- 1. nacl-tl-plan (scope: full)
|      L-- Создаёт .tl/ структуру, master-plan.md, волны
|
+-- 2. Для каждой Wave (последовательно):
|   |
|   +-- 2a. nacl-tl-dev-be (для BE-задач волны, параллельно)
|   +-- 2b. nacl-tl-dev-fe (для FE-задач волны, параллельно)
|   +-- 2c. nacl-tl-dev (для TECH-задач волны, параллельно)
|   |
|   +-- 2d. nacl-tl-stubs (сканирование после разработки)
|   |
|   +-- 2e. nacl-tl-review --be (для каждой BE-задачи)
|   +-- 2f. nacl-tl-review --fe (для каждой FE-задачи)
|   |
|   +-- 2g. nacl-tl-sync (для завершённых BE+FE пар)
|   |
|   +-- 2h. nacl-tl-status (отчёт по волне)
|
+-- 3. nacl-tl-qa (E2E тесты по всем approved задачам)
|
+-- 4. nacl-tl-docs (обновление документации)
|
+-- 5. nacl-tl-status (финальный отчёт)
```

---

### 2. nacl-tl-plan

```yaml
agent: nacl-tl-plan
trigger: /nacl-tl-plan
context_mode: inline
description: >
  Читает SA-артефакты из docs/, создаёт структуру .tl/ с задачами,
  разбитыми на BE, FE и TECH, формирует Execution Waves с учётом
  зависимостей между backend и frontend.

reads:
  - docs/_index.md                       # Обзор проекта
  - docs/10-architecture/module-tree.md  # Модульная структура
  - docs/10-architecture/context-map.md  # Карта контекстов
  - docs/11-overview/goals.md            # Цели проекта
  - docs/11-overview/scope.md            # Границы проекта
  - docs/12-domain/_domain-model.md      # Доменная модель
  - docs/12-domain/entities/*.md         # Сущности
  - docs/12-domain/enumerations/*.md     # Перечисления
  - docs/13-roles/role-matrix.md         # Матрица ролей
  - docs/14-usecases/_uc-index.md        # Индекс UC
  - docs/14-usecases/*.md                # Детали каждого UC
  - docs/15-interfaces/navigation.md     # Навигация
  - docs/15-interfaces/screens/*.md      # Экраны
  - docs/15-interfaces/_component-catalog.md  # Каталог компонентов
  - docs/16-requirements/nfr.md          # Нефункциональные требования

writes:
  - .tl/master-plan.md                   # Мастер-план с волнами
  - .tl/status.json                      # Начальный статус
  - .tl/tasks/{id}/task.md               # Описание задачи (BE/FE/TECH)
  - .tl/tasks/{id}/test-spec.md          # Спецификация тестов
  - .tl/tasks/{id}/impl-brief.md         # Инструкция реализации
  - .tl/tasks/{id}/acceptance.md         # Критерии приёмки

creates_directories:
  - .tl/
  - .tl/tasks/
  - .tl/tasks/{id}/                      # Для каждой задачи

calls_next:
  - nacl-tl-dev-be                            # После создания плана
  - nacl-tl-dev-fe
  - nacl-tl-dev

called_by:
  - nacl-tl-full                              # Шаг 1 оркестрации
  - user                                 # Ручной запуск

parameters:
  scope: full | module | task            # full = все UC, module = один модуль, task = один UC
  module: string                         # только если scope=module
  uc_id: string                          # только если scope=task

modes:
  FULL: >
    Чтение всех SA-артефактов, создание полной структуры .tl/
    с BE+FE+TECH задачами и Execution Waves
  MODULE: >
    Чтение артефактов одного модуля, добавление задач
    в существующий master-plan.md
  TASK: >
    Создание задач для одного UC (все типы: BE/FE/TECH)
```

**Правила разделения задач на типы:**

| Тип задачи | Префикс | Что включает | Агент |
|-------------|---------|--------------|-------|
| Backend | BE-{UC_ID} | API, сервисы, репозитории, миграции БД | nacl-tl-dev-be |
| Frontend | FE-{UC_ID} | Компоненты, страницы, хуки, формы | nacl-tl-dev-fe |
| Technical | TECH-{NNN} | Инфраструктура, конфиг, CI/CD, типы | nacl-tl-dev |

---

### 3. nacl-tl-dev-be

```yaml
agent: nacl-tl-dev-be
trigger: /nacl-tl-dev-be
context_mode: forked
description: >
  Backend-разработка по методологии TDD (RED -> GREEN -> REFACTOR).
  Работает с Node.js/TypeScript, Express/Fastify, PostgreSQL.
  Флаг --continue читает review-be.md для доработки по замечаниям.

reads:
  - .tl/tasks/{id}/task.md               # Что реализовать
  - .tl/tasks/{id}/test-spec.md          # Какие тесты написать
  - .tl/tasks/{id}/impl-brief.md         # Как реализовать
  - .tl/tasks/{id}/review-be.md          # Замечания ревью (при --continue)
  - .tl/stub-registry.json               # Реестр заглушек (чтобы не дублировать)
  - src/**/*.ts                          # Существующий код (для интеграции)
  - package.json                         # Зависимости проекта
  - tsconfig.json                        # Конфигурация TypeScript

writes:
  - src/**/*.ts                          # Production-код (сервисы, контроллеры, репозитории)
  - src/**/*.test.ts                     # Unit-тесты и интеграционные тесты
  - src/**/dto/*.ts                      # DTO для валидации
  - src/**/types/*.ts                    # Типы и интерфейсы
  - .tl/tasks/{id}/result-be.md          # Результат разработки

calls_next:
  - nacl-tl-stubs                             # После разработки -- сканировать заглушки
  - nacl-tl-review --be                       # После TDD-цикла -- ревью

called_by:
  - nacl-tl-full                              # Из оркестратора
  - user                                 # Ручной запуск

parameters:
  task_id: string                        # ID задачи (обязательный)
  --continue: flag                       # Доработка после ревью (читает review-be.md)
  --dry-run: flag                        # Показать план без выполнения
```

**TDD-цикл (backend):**

```
RED Phase:
  1. Прочитать test-spec.md
  2. Написать failing-тесты (Jest)
  3. Запустить тесты -- убедиться что FAIL
  4. Убедиться что причина падения правильная

GREEN Phase:
  1. Прочитать impl-brief.md
  2. Написать минимальный код для прохождения тестов
  3. Запустить тесты -- убедиться что PASS
  4. НЕ оптимизировать на этом шаге

REFACTOR Phase:
  1. Извлечь общие паттерны
  2. Улучшить именование
  3. Убрать дублирование
  4. Запустить тесты после каждого изменения
  5. Тесты ДОЛЖНЫ оставаться GREEN
```

---

### 4. nacl-tl-dev-fe

```yaml
agent: nacl-tl-dev-fe
trigger: /nacl-tl-dev-fe
context_mode: forked
description: >
  Frontend-разработка по методологии TDD с React Testing Library (RTL).
  Работает с React/Next.js, TypeScript, RTL + user-event.
  Флаг --continue читает review-fe.md для доработки по замечаниям.

reads:
  - .tl/tasks/{id}/task.md               # Что реализовать
  - .tl/tasks/{id}/test-spec.md          # Какие тесты написать (RTL)
  - .tl/tasks/{id}/impl-brief.md         # Как реализовать (компоненты, хуки)
  - .tl/tasks/{id}/review-fe.md          # Замечания ревью (при --continue)
  - .tl/stub-registry.json               # Реестр заглушек
  - src/**/*.tsx                         # Существующие компоненты
  - src/**/*.ts                          # Хуки, утилиты, типы
  - package.json                         # Зависимости
  - tsconfig.json                        # TypeScript-конфиг
  - next.config.js                       # Next.js-конфиг (если есть)

writes:
  - src/**/*.tsx                         # React-компоненты
  - src/**/*.ts                          # Хуки, утилиты, типы
  - src/**/*.test.tsx                    # Тесты компонентов (RTL)
  - src/**/*.test.ts                     # Тесты хуков/утилит
  - src/**/*.module.css                  # CSS Modules (если используются)
  - .tl/tasks/{id}/result-fe.md          # Результат разработки

calls_next:
  - nacl-tl-stubs                             # После разработки -- сканировать заглушки
  - nacl-tl-review --fe                       # После TDD-цикла -- ревью

called_by:
  - nacl-tl-full                              # Из оркестратора
  - user                                 # Ручной запуск

parameters:
  task_id: string                        # ID задачи (обязательный)
  --continue: flag                       # Доработка после ревью (читает review-fe.md)
  --dry-run: flag                        # Показать план без выполнения
```

**TDD-цикл (frontend):**

```
RED Phase:
  1. Прочитать test-spec.md (секция Frontend Tests)
  2. Написать failing-тесты с RTL + user-event
  3. Тестировать ПОВЕДЕНИЕ, не реализацию:
     - render() + screen.getByRole/getByText
     - userEvent.click/type/selectOptions
     - waitFor() для асинхронных операций
  4. Запустить тесты -- убедиться что FAIL

GREEN Phase:
  1. Прочитать impl-brief.md (секция UI Implementation)
  2. Написать минимальный компонент, проходящий тесты
  3. Использовать React Hook Form + Zod для форм
  4. MSW для мокирования API
  5. Запустить тесты -- убедиться что PASS

REFACTOR Phase:
  1. Извлечь кастомные хуки (useFormState, useFetchData)
  2. Разделить большие компоненты на мелкие
  3. Добавить ARIA-атрибуты для доступности
  4. Оптимизировать ре-рендеры (memo, useMemo, useCallback)
  5. Тесты ДОЛЖНЫ оставаться GREEN
```

---

### 5. nacl-tl-dev

```yaml
agent: nacl-tl-dev
trigger: /nacl-tl-dev
context_mode: forked
description: >
  Универсальный агент разработки для TECH-задач (инфраструктура,
  конфигурация, shared-типы, CI/CD). Не используется для BE/FE --
  для них есть специализированные агенты nacl-tl-dev-be и nacl-tl-dev-fe.

reads:
  - .tl/tasks/{id}/task.md               # Что реализовать
  - .tl/tasks/{id}/test-spec.md          # Тесты (если применимо)
  - .tl/tasks/{id}/impl-brief.md         # Как реализовать
  - src/**/*                             # Существующий код
  - package.json
  - tsconfig.json
  - docker-compose.yml                   # Docker-конфигурация (если есть)
  - .github/workflows/*.yml              # CI/CD (если есть)

writes:
  - src/shared/**/*.ts                   # Общие типы, утилиты, константы
  - src/config/**/*.ts                   # Конфигурация
  - src/database/migrations/*.ts         # Миграции БД
  - docker-compose.yml                   # Docker
  - .github/workflows/*.yml              # CI/CD
  - package.json                         # Обновление зависимостей
  - tsconfig.json                        # Обновление конфигурации
  - .tl/tasks/{id}/result.md             # Результат разработки

calls_next:
  - nacl-tl-stubs                             # После разработки
  - nacl-tl-review --be                       # TECH-задачи ревьюятся как backend

called_by:
  - nacl-tl-full
  - user

parameters:
  task_id: string                        # ID задачи (обязательный)
  --dry-run: flag                        # Показать план без выполнения
```

---

### 6. nacl-tl-sync

```yaml
agent: nacl-tl-sync
trigger: /nacl-tl-sync
context_mode: forked
description: >
  Проверяет синхронизацию между BE и FE: API-контракты (URL, методы,
  тела запросов/ответов), shared-типы, отсутствие моков в production-коде.
  Запускается после завершения парных BE+FE задач для одного UC.

reads:
  - .tl/tasks/{id}/task.md               # Исходные требования
  - .tl/tasks/{id}/impl-brief.md         # API-спецификация
  - .tl/tasks/{id}/result-be.md          # Что реализовано на backend
  - .tl/tasks/{id}/result-fe.md          # Что реализовано на frontend
  - src/**/controllers/*.ts              # BE: API-эндпоинты
  - src/**/dto/*.ts                      # BE: DTO
  - src/**/types/*.ts                    # Shared: типы
  - src/**/api/*.ts                      # FE: API-клиент
  - src/**/hooks/use*.ts                 # FE: data-fetching хуки
  - src/**/services/*.ts                 # BE: сервисы

writes:
  - .tl/tasks/{id}/sync-report.md        # Отчёт о синхронизации

calls_next:
  - nacl-tl-dev-be                            # Если найдены расхождения на backend
  - nacl-tl-dev-fe                            # Если найдены расхождения на frontend

called_by:
  - nacl-tl-full                              # Шаг 2g в волне
  - user                                 # Ручной запуск

parameters:
  task_id: string                        # ID задачи (UC, для которого есть BE+FE)
  --fix: flag                            # Автоматически исправить мелкие расхождения
```

**Что проверяет nacl-tl-sync:**

| Проверка | Описание | Severity |
|----------|----------|----------|
| API URL match | URL в FE-клиенте совпадает с BE-роутером | BLOCKER |
| HTTP method match | GET/POST/PUT/DELETE совпадают | BLOCKER |
| Request body shape | Структура тела запроса совпадает с DTO | BLOCKER |
| Response body shape | FE-тип ответа совпадает с BE-возвратом | BLOCKER |
| Shared types | Один источник типов (не дублирование) | CRITICAL |
| No mock in production | Нет MSW/mock-данных в production-коде | CRITICAL |
| Error format | FE обрабатывает все error-коды из BE | MAJOR |
| Auth headers | FE отправляет нужные заголовки авторизации | MAJOR |

---

### 7. nacl-tl-stubs

```yaml
agent: nacl-tl-stubs
trigger: /nacl-tl-stubs
context_mode: inline
description: >
  Сканирует кодовую базу на наличие маркеров TODO, FIXME, STUB,
  MOCK, HACK. Поддерживает stub-registry.json -- реестр всех
  заглушек с привязкой к задачам и приоритетом замены.

reads:
  - src/**/*.ts                          # TypeScript-файлы
  - src/**/*.tsx                         # React-компоненты
  - tests/**/*.ts                        # Тест-файлы
  - .tl/stub-registry.json               # Текущий реестр (если есть)

writes:
  - .tl/stub-registry.json               # Обновлённый реестр заглушек

calls_next: []                           # Информационный агент, не вызывает других

called_by:
  - nacl-tl-full                              # После каждой волны разработки
  - nacl-tl-dev-be                            # После завершения backend-задачи
  - nacl-tl-dev-fe                            # После завершения frontend-задачи
  - nacl-tl-dev                               # После завершения TECH-задачи
  - nacl-tl-review                            # Stub gate при ревью
  - user                                 # Ручной запуск

parameters:
  --scan-only: flag                      # Только сканировать, не обновлять реестр
  --report: flag                         # Вывести отчёт в консоль
```

**Формат stub-registry.json:**

```json
{
  "version": 1,
  "last_scan": "2025-01-30T15:00:00Z",
  "stubs": [
    {
      "id": "STUB-001",
      "marker": "TODO",
      "file": "src/orders/order.service.ts",
      "line": 45,
      "text": "TODO: заменить захардкоженную цену на lookup из product-сервиса",
      "task_id": "BE-UC001",
      "severity": "high",
      "created": "2025-01-30",
      "resolved": null
    }
  ],
  "summary": {
    "total": 12,
    "todo": 5,
    "fixme": 3,
    "stub": 2,
    "mock": 1,
    "hack": 1,
    "resolved": 0
  }
}
```

---

### 8. nacl-tl-review

```yaml
agent: nacl-tl-review
trigger: /nacl-tl-review
context_mode: forked
description: >
  Код-ревью с обязательным флагом --be или --fe. Проверяет по чеклисту
  из 8 категорий + stub gate (нет критических заглушек).
  Генерирует review-be.md или review-fe.md.

reads:
  - .tl/tasks/{id}/task.md               # Требования
  - .tl/tasks/{id}/test-spec.md          # Ожидаемые тесты
  - .tl/tasks/{id}/acceptance.md         # Критерии приёмки
  - .tl/tasks/{id}/result-be.md          # Результат BE (при --be)
  - .tl/tasks/{id}/result-fe.md          # Результат FE (при --fe)
  - .tl/stub-registry.json               # Реестр заглушек
  - src/**/*.ts                          # Исходный код (BE)
  - src/**/*.tsx                         # Исходный код (FE)
  - src/**/*.test.ts                     # Тесты (BE)
  - src/**/*.test.tsx                    # Тесты (FE)

writes:
  - .tl/tasks/{id}/review-be.md          # Результат BE-ревью (при --be)
  - .tl/tasks/{id}/review-fe.md          # Результат FE-ревью (при --fe)
  - .tl/tasks/{id}/task.md               # Обновляет статус (approved / rejected)

calls_next:
  - nacl-tl-dev-be --continue                 # Если rejected (BE)
  - nacl-tl-dev-fe --continue                 # Если rejected (FE)
  - nacl-tl-sync                              # Если approved и есть парная задача
  - nacl-tl-docs                              # Если approved (финальная задача)

called_by:
  - nacl-tl-full                              # Шаг 2e/2f в волне
  - nacl-tl-dev-be                            # Автоматически после TDD
  - nacl-tl-dev-fe                            # Автоматически после TDD
  - user                                 # Ручной запуск

parameters:
  task_id: string                        # ID задачи (обязательный)
  --be: flag                             # Ревью backend-кода (обязателен один из --be/--fe)
  --fe: flag                             # Ревью frontend-кода
  --strict: flag                         # Строгий режим (minor issues тоже блокируют)
```

**Чеклист ревью (8 категорий):**

| # | Категория | Описание | Применяется к |
|---|-----------|----------|---------------|
| 1 | Корректность кода | Логика, edge cases, null safety | BE + FE |
| 2 | Качество кода | Именование, структура, TypeScript строгость | BE + FE |
| 3 | Обработка ошибок | try/catch, кастомные ошибки, логирование | BE + FE |
| 4 | Тестирование | Покрытие, AAA-паттерн, независимость тестов | BE + FE |
| 5 | Безопасность | Инъекции, аутентификация, секреты | BE (приоритет) |
| 6 | Производительность | N+1, кэширование, ре-рендеры | BE + FE |
| 7 | Документация | JSDoc, комментарии WHY, нет TODO без тикета | BE + FE |
| 8 | Stub Gate | Нет CRITICAL/HIGH заглушек в stub-registry.json | BE + FE |

**Stub Gate:** Ревью автоматически получает verdict `rejected`, если в `stub-registry.json` есть записи с severity `high` или `critical` для данной задачи.

---

### 9. nacl-tl-qa

```yaml
agent: nacl-tl-qa
trigger: /nacl-tl-qa
context_mode: forked
description: >
  End-to-End тестирование через MCP Playwright. Запускает браузер,
  проходит по сценариям из acceptance.md, делает скриншоты на каждом
  шаге. Скриншоты сохраняются в .tl/qa-screenshots/.

reads:
  - .tl/tasks/{id}/task.md               # Сценарии (Main Flow)
  - .tl/tasks/{id}/acceptance.md         # Критерии приёмки
  - .tl/tasks/{id}/impl-brief.md         # API-эндпоинты, URL-ы
  - .tl/tasks/{id}/result-be.md          # Что реализовано на BE
  - .tl/tasks/{id}/result-fe.md          # Что реализовано на FE
  - .tl/tasks/{id}/sync-report.md        # Результат синхронизации
  - src/**/*.tsx                         # Компоненты (для селекторов)

writes:
  - .tl/tasks/{id}/qa-report.md          # E2E-отчёт
  - .tl/qa-screenshots/{id}/*.png        # Скриншоты шагов

creates_directories:
  - .tl/qa-screenshots/
  - .tl/qa-screenshots/{id}/

calls_next:
  - nacl-tl-dev-fe                            # Если UI-баг
  - nacl-tl-dev-be                            # Если API-баг

called_by:
  - nacl-tl-full                              # Шаг 3 (после всех волн)
  - user                                 # Ручной запуск

parameters:
  task_id: string                        # ID задачи или "all" для всех approved
  --headless: flag                       # Запуск в headless-режиме (по умолчанию)
  --screenshots: flag                    # Делать скриншоты (по умолчанию: true)
  --base-url: string                     # Базовый URL (по умолчанию: http://localhost:3000)
```

**E2E-цикл:**

```
1. Запустить dev-сервер (если не запущен)
2. Для каждого acceptance criteria:
   a. Выполнить сценарий через Playwright MCP
   b. Сделать скриншот каждого шага
   c. Проверить ожидаемый результат
   d. Записать PASS/FAIL в qa-report.md
3. Сгенерировать итоговый qa-report.md
4. Сохранить скриншоты в .tl/qa-screenshots/{id}/
```

---

### 10. nacl-tl-docs

```yaml
agent: nacl-tl-docs
trigger: /nacl-tl-docs
context_mode: forked
description: >
  Обновляет пользовательскую документацию после одобрения задачи.
  Работает с README, API docs, CHANGELOG. Запускается только
  после перехода задачи в статус approved.

reads:
  - .tl/tasks/{id}/task.md               # Что было реализовано
  - .tl/tasks/{id}/result-be.md          # Детали BE-реализации
  - .tl/tasks/{id}/result-fe.md          # Детали FE-реализации
  - .tl/tasks/{id}/review-be.md          # Замечания ревью (для release notes)
  - .tl/tasks/{id}/review-fe.md          # Замечания ревью
  - README.md                            # Текущий README
  - CHANGELOG.md                         # Текущий CHANGELOG
  - docs/api/*.md                        # API-документация (если есть)

writes:
  - README.md                            # Обновлённый README
  - CHANGELOG.md                         # Новая запись в CHANGELOG
  - docs/api/*.md                        # Обновлённая API-документация
  - .tl/tasks/{id}/task.md               # Обновляет статус -> done

calls_next: []                           # Финальный шаг для задачи

called_by:
  - nacl-tl-full                              # Шаг 4
  - nacl-tl-review                            # После approved
  - user                                 # Ручной запуск

parameters:
  task_id: string                        # ID задачи (обязательный)
  --changelog-only: flag                 # Только обновить CHANGELOG
  --api-docs: flag                       # Только обновить API-документацию
```

---

### 11. nacl-tl-status

```yaml
agent: nacl-tl-status
trigger: /nacl-tl-status
context_mode: inline
description: >
  Отображает текущий прогресс проекта: статусы задач по типам
  (BE/FE/TECH), заглушки, результаты QA, прогресс по волнам.

reads:
  - .tl/master-plan.md                   # Волны и зависимости
  - .tl/status.json                      # Общий прогресс
  - .tl/stub-registry.json               # Реестр заглушек
  - .tl/tasks/*/task.md                  # Статусы задач (frontmatter)
  - .tl/tasks/*/qa-report.md             # Результаты QA (если есть)
  - .tl/tasks/*/sync-report.md           # Результаты синхронизации

writes: []                               # Только чтение, ничего не пишет

calls_next: []                           # Информационный агент

called_by:
  - nacl-tl-full                              # Между волнами
  - user                                 # Ручной запуск

parameters:
  --wave: number                         # Показать статус конкретной волны
  --type: be | fe | tech | all           # Фильтр по типу задач
  --stubs: flag                          # Показать только заглушки
  --qa: flag                             # Показать только результаты QA
```

**Пример вывода nacl-tl-status:**

```
=== TL Project Status ===

Wave 1 [3/3 done] ██████████████████████ 100%
  BE-UC001 Create Order API          ✅ done
  BE-UC002 Edit Order API            ✅ done
  FE-UC001 Create Order Form         ✅ done

Wave 2 [1/3 in progress] ███████░░░░░░░░░░░░░░ 33%
  FE-UC002 Edit Order Form           🔄 in_progress
  BE-UC003 Delete Order API          ⏳ pending
  TECH-001 Database Migrations       ✅ done

Wave 3 [0/2 pending] ░░░░░░░░░░░░░░░░░░░░░ 0%
  SYNC-UC001 BE/FE Sync Check        ⏳ pending (blocked by Wave 2)
  QA-001 E2E Order CRUD              ⏳ pending (blocked by Wave 2)

--- Stubs ---
Total: 5 (TODO: 3, FIXME: 1, STUB: 1)
Critical: 0 | High: 1 | Medium: 3 | Low: 1

--- QA ---
Not started (blocked by Wave 2)

Overall: 4/8 tasks done (50%)
```

---

### 12. nacl-tl-next

```yaml
agent: nacl-tl-next
trigger: /nacl-tl-next
context_mode: inline
description: >
  Рекомендует следующую задачу для выполнения. Учитывает Execution Waves,
  зависимости BE->FE, приоритеты и текущий прогресс.

reads:
  - .tl/master-plan.md                   # Волны и зависимости
  - .tl/status.json                      # Текущий прогресс
  - .tl/tasks/*/task.md                  # Статусы задач (frontmatter: status, depends_on)
  - .tl/stub-registry.json               # Заглушки (влияют на приоритет)

writes: []                               # Только чтение, ничего не пишет

calls_next: []                           # Информационный агент, рекомендует действие

called_by:
  - nacl-tl-full                              # Для выбора следующей задачи в волне
  - user                                 # Ручной запуск

parameters:
  --type: be | fe | tech | any           # Фильтр по типу задачи
  --wave: number                         # Ограничить конкретной волной
  --count: number                        # Сколько рекомендаций показать (по умолчанию: 3)
```

**Алгоритм выбора следующей задачи:**

```
1. Определить текущую активную волну (первая незавершённая)
2. Отфильтровать задачи с status=pending в этой волне
3. Проверить зависимости (depends_on все в status=approved или done)
4. Приоритизировать:
   a. BE-задачи перед FE (FE часто зависит от BE)
   b. Задачи с высшим priority
   c. Задачи, блокирующие другие (blocks не пуст)
   d. Задачи с заглушками высокого приоритета (из stub-registry.json)
5. Вернуть top-N рекомендаций с обоснованием
```

**Пример вывода nacl-tl-next:**

```
=== Рекомендации (Wave 2) ===

1. BE-UC003 Delete Order API [priority: high]
   Причина: Разблокирует FE-UC003 и SYNC-UC001
   Команда: /nacl-tl-dev-be BE-UC003

2. FE-UC002 Edit Order Form [priority: high]
   Причина: BE-UC002 уже approved, можно начинать FE
   Команда: /nacl-tl-dev-fe FE-UC002

3. TECH-002 Error Handling Middleware [priority: medium]
   Причина: Независимая задача, нет блокирующих зависимостей
   Команда: /nacl-tl-dev TECH-002
```

---

### 13. nacl-tl-reopened

```yaml
agent: nacl-tl-reopened
trigger: /nacl-tl-reopened
context_mode: inline
description: >
  Обработка задач из YouGile Reopened колонки (не прошедших верификацию/QA).
  Читает фидбек тестировщика из чата задачи, синтезирует описание проблемы,
  делегирует фикс в /nacl-tl-fix, прогоняет quality gates, отправляет обратно
  в DevDone. Замыкает петлю: nacl-tl-verify → Reopened → nacl-tl-reopened → DevDone.

reads:
  - config.yaml                          # YouGile column IDs, модули, git strategy
  - .tl/tasks/{id}/*                     # Контекст задачи (Path A)
  - .tl/status.json                      # Текущий прогресс

writes: []                               # Не пишет напрямую — делегирует в nacl-tl-fix, nacl-tl-ship

calls_next:
  - nacl-tl-fix                               # Основной фикс (spec-first)
  - nacl-tl-review                            # Quality gate после фикса
  - nacl-tl-stubs                             # Проверка заглушек
  - nacl-tl-ship                              # Commit + push + YouGile update

called_by:
  - user                                 # Ручной запуск

parameters:
  task_code: string                      # Код задачи в YouGile (опционально)
  uc_id: string                          # UC ID (опционально)
  --all: flag                            # Обработать все задачи из Reopened
  --task: string                         # Конкретная задача по коду YouGile
  --yes: flag                            # Пропустить USER GATE
  --auto-ship: flag                      # Автоматически ship после фикса
  --dry-run: flag                        # Только анализ, без изменений
```

**Петля обратной связи:**

```
/nacl-tl-verify ─── FAIL ──→ Reopened
                              │
/nacl-tl-reopened → /nacl-tl-fix → /nacl-tl-ship → DevDone
                                       │
                          /nacl-tl-verify → PASS → ToRelease
```

**Защита от бесконечного цикла:** если задача прошла через nacl-tl-reopened 2+ раз, эскалация пользователю вместо автофикса.

---

## Правила взаимодействия

### 1. Чтение перед записью

Перед записью в файл агент **обязан** прочитать текущее содержимое, если файл существует. Это предотвращает потерю данных при параллельной работе.

### 2. Confirmation Gate

Каждый агент завершается запросом подтверждения от пользователя перед переходом к следующему. Исключения: `nacl-tl-status` и `nacl-tl-next` (информационные, не меняют состояние).

### 3. Файловый протокол

- Агент читает только файлы из своего `reads` списка
- Агент пишет только в файлы из своего `writes` списка
- Выход за рамки допускается только при явном указании пользователя

### 4. Разделение BE/FE

- Backend-код ревьюит только `nacl-tl-review --be`
- Frontend-код ревьюит только `nacl-tl-review --fe`
- Результаты записываются в отдельные файлы: `result-be.md` / `result-fe.md`
- Замечания ревью в отдельных файлах: `review-be.md` / `review-fe.md`

### 5. Передача контекста

При вызове одного агента другим передаётся:
- `parameters` -- конкретные значения для вызываемого агента
- Контекст -- через файловую систему (.tl/), не через промежуточные переменные

### 6. Обработка ошибок

- Если prerequisite-файл отсутствует -> агент предлагает запустить нужный предшественник
- Если данные неполны -> агент фиксирует проблему и продолжает с предупреждением
- Если пользователь отменяет -> агент сохраняет текущее состояние и останавливается
- Если тесты не проходят -> агент НЕ переходит к следующему шагу TDD

### 7. Stub Safety Net

Перед каждым ревью автоматически запускается `nacl-tl-stubs` для обновления реестра заглушек. Ревью с критическими заглушками автоматически получает verdict `rejected`.

---

## Структура каталогов .tl/

```
.tl/
├── master-plan.md              # Мастер-план с Execution Waves
├── status.json                 # Общий прогресс проекта
├── stub-registry.json          # Реестр заглушек
├── qa-screenshots/             # Скриншоты E2E-тестов
│   ├── UC001/
│   │   ├── step-01-open-form.png
│   │   ├── step-02-fill-data.png
│   │   └── step-03-submit.png
│   └── UC002/
├── tasks/
│   ├── BE-UC001/
│   │   ├── task.md
│   │   ├── test-spec.md
│   │   ├── impl-brief.md
│   │   ├── acceptance.md
│   │   ├── result-be.md        # Результат backend-разработки
│   │   └── review-be.md        # Результат backend-ревью
│   ├── FE-UC001/
│   │   ├── task.md
│   │   ├── test-spec.md
│   │   ├── impl-brief.md
│   │   ├── acceptance.md
│   │   ├── result-fe.md        # Результат frontend-разработки
│   │   └── review-fe.md        # Результат frontend-ревью
│   ├── TECH-001/
│   │   ├── task.md
│   │   ├── impl-brief.md
│   │   ├── result.md
│   │   └── review-be.md        # TECH ревьюится как BE
│   └── ...
```

---

## Краткая сводка агентов

| # | Агент | Команда | Режим | Роль |
|---|-------|---------|-------|------|
| 1 | nacl-tl-full | `/nacl-tl-full` | inline | Оркестратор полного цикла |
| 2 | nacl-tl-plan | `/nacl-tl-plan` | inline | Планирование из SA-артефактов |
| 3 | nacl-tl-dev-be | `/nacl-tl-dev-be` | forked | Backend TDD-разработка |
| 4 | nacl-tl-dev-fe | `/nacl-tl-dev-fe` | forked | Frontend TDD-разработка (RTL) |
| 5 | nacl-tl-dev | `/nacl-tl-dev` | forked | TECH-задачи (legacy) |
| 6 | nacl-tl-sync | `/nacl-tl-sync` | forked | Синхронизация BE/FE |
| 7 | nacl-tl-stubs | `/nacl-tl-stubs` | inline | Реестр заглушек |
| 8 | nacl-tl-review | `/nacl-tl-review` | forked | Код-ревью (--be / --fe) |
| 9 | nacl-tl-qa | `/nacl-tl-qa` | forked | E2E через Playwright MCP |
| 10 | nacl-tl-docs | `/nacl-tl-docs` | forked | Документация |
| 11 | nacl-tl-status | `/nacl-tl-status` | inline | Прогресс и отчёты |
| 12 | nacl-tl-next | `/nacl-tl-next` | inline | Рекомендация следующей задачи |
| 13 | nacl-tl-reopened | `/nacl-tl-reopened` | inline | Обработка задач из Reopened |
