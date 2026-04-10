[Главная](../README.ru.md) > Гайд по скиллам

🇬🇧 [English version](skills-guide.md)

# Гайд по скиллам

Не знаете, какой скилл использовать? Следуйте дереву решений.

## Быстрое дерево решений

```
Что вам нужно?
│
├── Начать новый проект?
│   └── /project-init "Имя" → /graph_ba_full → /graph_sa_full → /graph_tl_conductor
│
├── Есть документ клиента для анализа?
│   └── /graph_ba_from_board import /path/to/doc.docx
│
├── Добавить фичу?
│   └── /graph_sa_feature "описание"
│       └── /graph_tl_conductor --items FR-001
│
├── Что-то сломалось?
│   └── /tl-fix "что сломалось"
│
├── Несколько запросов (фичи + баги + задачи)?
│   └── /graph_tl_intake → /graph_tl_conductor --items ...
│
├── Нужно отправить код?
│   └── /tl-ship (коммит + пуш + PR)
│       └── /tl-deliver (CI + staging + health check)
│           └── /tl-release (production)
│
├── Всё сломано / доки устарели?
│   └── /tl-diagnose → /tl-reconcile
│
├── Проверить статус проекта?
│   └── /graph_tl_status
│
└── Что делать дальше?
    └── /graph_tl_next
```

## По фазам

### Бизнес-анализ

| Ситуация | Скилл |
|----------|-------|
| Полный BA с нуля | `/graph_ba_full` |
| Импорт документа клиента | `/graph_ba_from_board import doc.docx` |
| Определить границы системы | `/graph_ba_context` |
| Карта бизнес-процессов | `/graph_ba_process` |
| Декомпозиция процесса | `/graph_ba_workflow` |
| Каталог сущностей | `/graph_ba_entities` |
| Бизнес-роли | `/graph_ba_roles` |
| Глоссарий | `/graph_ba_glossary` |
| Бизнес-правила | `/graph_ba_rules` |
| Валидация BA-модели | `/graph_ba_validate` |
| Передача в SA | `/graph_ba_handoff` |

### Системный анализ

| Ситуация | Скилл |
|----------|-------|
| Полный SA с нуля | `/graph_sa_full` |
| Добавить фичу | `/graph_sa_feature` |
| Модули (bounded contexts) | `/graph_sa_architect` |
| Доменная модель | `/graph_sa_domain` |
| Use Cases | `/graph_sa_uc` |
| Системные роли | `/graph_sa_roles` |
| UI-архитектура | `/graph_sa_ui` |
| Валидация спецификации | `/graph_sa_validate` |
| Финализация | `/graph_sa_finalize` |

### Разработка

| Ситуация | Скилл |
|----------|-------|
| Полный цикл (BE+FE+QA+docs) | `/tl-full --task UC001` |
| Бэкенд TDD | `/tl-dev-be UC001` |
| Фронтенд TDD | `/tl-dev-fe UC001` |
| TECH/инфра-задача | `/tl-dev TECH001` |
| Код-ревью | `/tl-review UC001 --be` или `--fe` |
| E2E тестирование | `/tl-qa UC001` |
| Синхронизация BE/FE | `/tl-sync UC001` |
| Проверка стабов | `/tl-stubs` |

### Деплой

| Ситуация | Скилл |
|----------|-------|
| Коммит + пуш + PR | `/tl-ship` |
| Полная доставка на staging | `/tl-deliver` |
| Мониторинг CI/CD | `/tl-deploy` |
| Релиз в production | `/tl-release` |

### Исправление и восстановление

| Ситуация | Скилл |
|----------|-------|
| Исправить баг (spec-first) | `/tl-fix "описание"` |
| Переоткрытые задачи | `/tl-reopened` |
| Диагностика проекта | `/tl-diagnose` |
| Синхронизация доков с кодом | `/tl-reconcile` |

## Что дальше

- [Каталог скиллов](skills-reference.ru.md) — полный справочник
- [Сценарии](workflows.ru.md) — end-to-end сценарии
