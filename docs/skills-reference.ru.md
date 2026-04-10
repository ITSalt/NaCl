[Главная](../README.ru.md) > Каталог скиллов

🇬🇧 [English version](skills-reference.md)

# Каталог скиллов

56 скиллов, организованных по уровням и функциям.

## Оркестраторы

| Скилл | Описание |
|-------|----------|
| `/graph_ba_full` | Полный цикл бизнес-анализа (10 фаз) |
| `/graph_sa_full` | Полная системная спецификация (8 фаз) |
| `/graph_tl_conductor` | Полный пайплайн: планирование → разработка → staging |
| `/tl-full` | Автономный жизненный цикл одного UC |

## Graph BA — Бизнес-анализ (14 скиллов)

> Эти скиллы работают на русском языке — язык SKILL.md определяет язык общения Claude.

| Скилл | Описание | Пример |
|-------|----------|--------|
| `graph_ba_context` | Определение границ системы | `/graph_ba_context` |
| `graph_ba_process` | Карта бизнес-процессов | `/graph_ba_process` |
| `graph_ba_workflow` | Activity diagram для процесса | `/graph_ba_workflow BP-001` |
| `graph_ba_entities` | Каталог бизнес-сущностей | `/graph_ba_entities` |
| `graph_ba_roles` | Идентификация бизнес-ролей | `/graph_ba_roles` |
| `graph_ba_glossary` | Глоссарий предметной области | `/graph_ba_glossary` |
| `graph_ba_rules` | Каталог бизнес-правил | `/graph_ba_rules` |
| `graph_ba_validate` | Валидация BA-модели (L1-L8) | `/graph_ba_validate` |
| `graph_ba_handoff` | Передача BA→SA | `/graph_ba_handoff` |
| `graph_ba_full` | Оркестратор: все 10 фаз | `/graph_ba_full` |
| `graph_ba_from_board` | Импорт документа + борд + граф | `/graph_ba_from_board import doc.docx` |
| `graph_ba_import_doc` | Парсинг документа клиента | `/graph_ba_import_doc doc.docx` |
| `graph_ba_analyze` | Анализ Excalidraw-борда | `/graph_ba_analyze` |
| `graph_ba_sync` | Синхронизация борда с графом | `/graph_ba_sync` |

## Graph SA — Системный анализ (9 скиллов)

> Эти скиллы работают на русском языке.

| Скилл | Описание | Пример |
|-------|----------|--------|
| `graph_sa_architect` | Модули, Context Map, NFR | `/graph_sa_architect` |
| `graph_sa_domain` | Доменная модель | `/graph_sa_domain` |
| `graph_sa_uc` | Реестр Use Cases + детализация | `/graph_sa_uc` |
| `graph_sa_roles` | Системные роли и матрица прав | `/graph_sa_roles` |
| `graph_sa_ui` | UI-архитектура, компоненты | `/graph_sa_ui` |
| `graph_sa_validate` | Валидация спецификации | `/graph_sa_validate` |
| `graph_sa_finalize` | Финализация: глоссарий, ADR, статистика | `/graph_sa_finalize` |
| `graph_sa_feature` | Инкрементальная фича через граф | `/graph_sa_feature "описание"` |
| `graph_sa_full` | Оркестратор: все фазы SA | `/graph_sa_full` |

## Graph TL — Планирование (6 скиллов)

| Скилл | Описание | Пример |
|-------|----------|--------|
| `graph_tl_plan` | Задачи и волны из SA-графа | `/graph_tl_plan` |
| `graph_tl_intake` | Триаж запросов с контекстом графа | `/graph_tl_intake` |
| `graph_tl_conductor` | Пакетный workflow: intake → staging | `/graph_tl_conductor` |
| `graph_tl_full` | Полный цикл разработки из графа | `/graph_tl_full` |
| `graph_tl_status` | Статус проекта из графа | `/graph_tl_status` |
| `graph_tl_next` | Рекомендация следующей задачи | `/graph_tl_next` |

## Графовая инфраструктура (3 скилла)

| Скилл | Описание |
|-------|----------|
| `graph_core` | Общие ссылки для всех graph_* скиллов (не вызывается напрямую) |
| `graph_render` | Рендер графа в Markdown/Excalidraw | 
| `graph_publish` | Публикация графа в Docmost |

## TL — Разработка (24 скилла)

### Планирование

| Скилл | Описание |
|-------|----------|
| `tl-plan` | Создание задач из SA-спецификации |
| `tl-intake` | Триаж запросов пользователей |
| `tl-next` | Рекомендация следующей задачи |
| `tl-status` | Статус проекта |

### Разработка

| Скилл | Описание |
|-------|----------|
| `tl-dev-be` | Бэкенд TDD (test → implement → refactor) |
| `tl-dev-fe` | Фронтенд TDD (React/Next.js) |
| `tl-dev` | Инфра/TECH задачи |

### Качество

| Скилл | Описание |
|-------|----------|
| `tl-review` | Код-ревью (--be или --fe) |
| `tl-sync` | Проверка синхронизации BE/FE |
| `tl-stubs` | Поиск стабов и моков |
| `tl-verify-code` | Статический анализ корректности |
| `tl-verify` | Оркестратор: код + E2E + YouGile |
| `tl-qa` | E2E тестирование (Playwright) |

### Доставка

| Скилл | Описание |
|-------|----------|
| `tl-ship` | Коммит, пуш, PR |
| `tl-deploy` | Мониторинг CI/CD |
| `tl-deliver` | Полная доставка: push → CI → staging → verify |
| `tl-release` | Релиз: version bump, tag, changelog |

### Исправление и восстановление

| Скилл | Описание |
|-------|----------|
| `tl-fix` | Исправление бага (spec-first) |
| `tl-reopened` | Переоткрытые задачи (QA failures) |
| `tl-diagnose` | Диагностика здоровья проекта |
| `tl-reconcile` | Синхронизация доков с кодом |

### Документация и оркестрация

| Скилл | Описание |
|-------|----------|
| `tl-docs` | Обновление документации |
| `tl-full` | Полный цикл одного UC |
| `tl-conductor` | Пакетный workflow |

## Инициализация (1 скилл)

| Скилл | Описание |
|-------|----------|
| `project-init` | Создание CLAUDE.md + config.yaml для нового проекта |

## Что дальше

- [Гайд по скиллам](skills-guide.ru.md) — какой скилл для чего
- [Сценарии](workflows.ru.md) — готовые end-to-end сценарии
