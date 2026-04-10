[Главная](../README.ru.md) > Каталог скиллов

🇬🇧 [English version](skills-reference.md)

# Каталог скиллов

51 скилл, организованный по уровням и функциям. Все скиллы следуют конвенции `nacl-{слой}-{действие}`: **BA** = Business Analysis, **SA** = System Analysis, **TL** = TeamLead.

## Оркестраторы

| Скилл | Описание |
|-------|----------|
| `/nacl-ba-full` | Полный цикл бизнес-анализа (10 фаз) |
| `/nacl-sa-full` | Полная системная спецификация (8 фаз) |
| `/nacl-tl-conductor` | Полный пайплайн: планирование → разработка → staging |
| `/nacl-tl-full` | Автономный жизненный цикл одного UC |

## BA — Бизнес-анализ (14 скиллов)

> Эти скиллы работают на русском языке — язык SKILL.md определяет язык общения Claude.

| Скилл | Описание | Пример |
|-------|----------|--------|
| `nacl-ba-context` | Определение границ системы | `/nacl-ba-context` |
| `nacl-ba-process` | Карта бизнес-процессов | `/nacl-ba-process` |
| `nacl-ba-workflow` | Activity diagram для процесса | `/nacl-ba-workflow BP-001` |
| `nacl-ba-entities` | Каталог бизнес-сущностей | `/nacl-ba-entities` |
| `nacl-ba-roles` | Идентификация бизнес-ролей | `/nacl-ba-roles` |
| `nacl-ba-glossary` | Глоссарий предметной области | `/nacl-ba-glossary` |
| `nacl-ba-rules` | Каталог бизнес-правил | `/nacl-ba-rules` |
| `nacl-ba-validate` | Валидация BA-модели (L1-L8) | `/nacl-ba-validate` |
| `nacl-ba-handoff` | Передача BA→SA | `/nacl-ba-handoff` |
| `nacl-ba-full` | Оркестратор: все 10 фаз | `/nacl-ba-full` |
| `nacl-ba-from-board` | Импорт документа + борд + граф | `/nacl-ba-from-board import doc.docx` |
| `nacl-ba-import-doc` | Парсинг документа клиента | `/nacl-ba-import-doc doc.docx` |
| `nacl-ba-analyze` | Анализ Excalidraw-борда | `/nacl-ba-analyze` |
| `nacl-ba-sync` | Синхронизация борда с графом | `/nacl-ba-sync` |

## SA — Системный анализ (9 скиллов)

> Эти скиллы работают на русском языке.

| Скилл | Описание | Пример |
|-------|----------|--------|
| `nacl-sa-architect` | Модули, Context Map, NFR | `/nacl-sa-architect` |
| `nacl-sa-domain` | Доменная модель | `/nacl-sa-domain` |
| `nacl-sa-uc` | Реестр Use Cases + детализация | `/nacl-sa-uc` |
| `nacl-sa-roles` | Системные роли и матрица прав | `/nacl-sa-roles` |
| `nacl-sa-ui` | UI-архитектура, компоненты | `/nacl-sa-ui` |
| `nacl-sa-validate` | Валидация спецификации | `/nacl-sa-validate` |
| `nacl-sa-finalize` | Финализация: глоссарий, ADR, статистика | `/nacl-sa-finalize` |
| `nacl-sa-feature` | Инкрементальная фича через граф | `/nacl-sa-feature "описание"` |
| `nacl-sa-full` | Оркестратор: все фазы SA | `/nacl-sa-full` |

## Утилиты (4 скилла)

| Скилл | Описание |
|-------|----------|
| `nacl-core` | Общие ссылки для всех nacl-* скиллов (не вызывается напрямую) |
| `nacl-render` | Рендер графа в Markdown/Excalidraw | 
| `nacl-publish` | Публикация графа в Docmost |
| `nacl-init` | Создание CLAUDE.md + config.yaml для нового проекта |

## TL — TeamLead (24 скилла)

### Планирование

| Скилл | Описание |
|-------|----------|
| `nacl-tl-plan` | Создание задач из SA-спецификации |
| `nacl-tl-intake` | Триаж запросов пользователей |
| `nacl-tl-next` | Рекомендация следующей задачи |
| `nacl-tl-status` | Статус проекта |

### Разработка

| Скилл | Описание |
|-------|----------|
| `nacl-tl-dev-be` | Бэкенд TDD (test → implement → refactor) |
| `nacl-tl-dev-fe` | Фронтенд TDD (React/Next.js) |
| `nacl-tl-dev` | Инфра/TECH задачи |

### Качество

| Скилл | Описание |
|-------|----------|
| `nacl-tl-review` | Код-ревью (--be или --fe) |
| `nacl-tl-sync` | Проверка синхронизации BE/FE |
| `nacl-tl-stubs` | Поиск стабов и моков |
| `nacl-tl-verify-code` | Статический анализ корректности |
| `nacl-tl-verify` | Оркестратор: код + E2E + YouGile |
| `nacl-tl-qa` | E2E тестирование (Playwright) |

### Доставка

| Скилл | Описание |
|-------|----------|
| `nacl-tl-ship` | Коммит, пуш, PR |
| `nacl-tl-deploy` | Мониторинг CI/CD |
| `nacl-tl-deliver` | Полная доставка: push → CI → staging → verify |
| `nacl-tl-release` | Релиз: version bump, tag, changelog |

### Исправление и восстановление

| Скилл | Описание |
|-------|----------|
| `nacl-tl-fix` | Исправление бага (spec-first) |
| `nacl-tl-reopened` | Переоткрытые задачи (QA failures) |
| `nacl-tl-diagnose` | Диагностика здоровья проекта |
| `nacl-tl-reconcile` | Синхронизация доков с кодом |

### Документация и оркестрация

| Скилл | Описание |
|-------|----------|
| `nacl-tl-docs` | Обновление документации |
| `nacl-tl-full` | Полный цикл одного UC |
| `nacl-tl-conductor` | Пакетный workflow |

## Что дальше

- [Гайд по скиллам](skills-guide.ru.md) — какой скилл для чего
- [Сценарии](workflows.ru.md) — готовые end-to-end сценарии
