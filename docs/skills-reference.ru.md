[Главная](../README.ru.md) > Каталог скиллов

🇬🇧 [English version](skills-reference.md)

# Каталог скиллов

59 скиллов, организованных по уровням и функциям. Все скиллы следуют конвенции `nacl-{слой}-{действие}`: **BA** = Business Analysis, **SA** = System Analysis, **TL** = TeamLead.

## Оркестраторы

| Скилл | Описание |
|-------|----------|
| `/nacl-ba-full` | Полный цикл бизнес-анализа (10 фаз) |
| `/nacl-sa-full` | Полная системная спецификация (10 фаз) |
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

## SA — Системный анализ (10 скиллов)

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
| `nacl-sa-flags` | Аудит и заполнение exemption-флагов SA | `/nacl-sa-flags` |
| `nacl-sa-full` | Оркестратор: все фазы SA | `/nacl-sa-full` |

## Утилиты (4 скилла)

| Скилл | Описание |
|-------|----------|
| `nacl-core` | Общие ссылки для всех nacl-* скиллов (не вызывается напрямую) |
| `nacl-render` | Рендер графа в Markdown (генерация Excalidraw-досок перенесена в analyst-tool) | 
| `nacl-publish` | Публикация графа в Docmost |
| `nacl-init` | Создание CLAUDE.md + config.yaml для нового проекта |

## TL — TeamLead (26 скиллов)

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
| `nacl-tl-fix` | Исправление бага (spec-first). Регрессионный тест пишется ДО фикса (через `nacl-tl-regression-test`); статус честный (`PASS` / `BLOCKED` / `UNVERIFIED` / `NO_INFRA` / `RUNNER_BROKEN` / `REGRESSION`), а не всегда `FIX COMPLETE` |
| `nacl-tl-regression-test` | Независимый автор регрессионных тестов. Пишет один тест против сломанного кода — тест обязан быть RED. Трогает только тестовые файлы, не продакшен. На `NO_INFRA` отказывается. Вызывается из `nacl-tl-fix` Step 6d или напрямую |
| `nacl-tl-reopened` | Переоткрытые задачи (QA failures) |
| `nacl-tl-diagnose` | Диагностика здоровья проекта |
| `nacl-tl-reconcile` | Синхронизация доков с кодом |
| `nacl-tl-hotfix` | Экстренный hotfix в production/main |

### Документация и оркестрация

| Скилл | Описание |
|-------|----------|
| `nacl-tl-docs` | Обновление документации |
| `nacl-tl-full` | Полный цикл одного UC |
| `nacl-tl-conductor` | Пакетный workflow |


## Миграция (3 скилла)

| Скилл | Описание |
|-------|----------|
| `nacl-migrate` | Оркестратор миграции существующих markdown-спецификаций проекта в граф Neo4j |
| `nacl-migrate-ba` | Извлечение и импорт BA-артефактов (процессы, сущности, роли, правила) из markdown |
| `nacl-migrate-sa` | Извлечение и импорт SA-артефактов (модули, use cases, доменная модель, формы) из markdown |

## Диагностика (1 скилл)

| Скилл | Описание |
|-------|----------|
| `nacl-postmortem` | Постмортем проекта, построенного через nacl-* скиллы: для каждого пост-«done» бага находит, какие ворота скилла его пропустили. Read-only |

---

## Оркестрация целей (1)

Оборачивает команду `/goal` от Anthropic методологией NaCl.

| Скилл | Описание | Пример |
|-------|----------|--------|
| `nacl-goal` | Разрешает NaCl-алиас в условие завершения для `/goal`, которое может проверить transcript-only эвалюатор через протокол GOAL_PROOF. По умолчанию работает в режиме предпросмотра для алиасов 2.10.0 (`wave`, `fix`, `validate`, `resume` и др.); `--start` запускает реальный `/goal`. Алиасы `intake` (2.10.1) и `conduct` (2.18.0) — исключение: они autonomy-by-default (отказ через `--plan-only`). Отказывает при попытке пройти через Tier-C ворота (BA-SA handoff, подтверждение фаз SA, hotfix). Документация: `docs/guides/goal-command.md`. | `/nacl-goal wave:5` |

## Что дальше

- [Гайд по скиллам](skills-guide.ru.md) — какой скилл для чего
- [Сценарии](workflows.ru.md) — готовые end-to-end сценарии
