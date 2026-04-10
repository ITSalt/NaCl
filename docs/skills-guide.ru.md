[Главная](../README.ru.md) > Гайд по скиллам

🇬🇧 [English version](skills-guide.md)

# Гайд по скиллам

Не знаете, какой скилл использовать? Следуйте дереву решений.

## Быстрое дерево решений

```
Что вам нужно?
│
├── Начать новый проект?
│   └── /nacl-init "Имя" → /nacl-ba-full → /nacl-sa-full → /nacl-tl-conductor
│
├── Есть документ клиента для анализа?
│   └── /nacl-ba-from-board import /path/to/doc.docx
│
├── Добавить фичу?
│   └── /nacl-sa-feature "описание"
│       └── /nacl-tl-conductor --items FR-001
│
├── Что-то сломалось?
│   ├── Обычный фикс → /nacl-tl-fix "что сломалось"
│   └── Критичный баг в проде? → /nacl-tl-fix → /nacl-tl-hotfix --apply
│
├── Несколько запросов (фичи + баги + задачи)?
│   └── /nacl-tl-intake → /nacl-tl-conductor --items ...
│
├── Нужно отправить код?
│   └── /nacl-tl-ship (коммит + пуш + PR)
│       └── /nacl-tl-deliver (CI + staging + health check)
│           └── /nacl-tl-release (production)
│
├── Всё сломано / доки устарели?
│   └── /nacl-tl-diagnose → /nacl-tl-reconcile
│
├── Проверить статус проекта?
│   └── /nacl-tl-status
│
└── Что делать дальше?
    └── /nacl-tl-next
```

## По фазам

### Бизнес-анализ

| Ситуация | Скилл |
|----------|-------|
| Полный BA с нуля | `/nacl-ba-full` |
| Импорт документа клиента | `/nacl-ba-from-board import doc.docx` |
| Определить границы системы | `/nacl-ba-context` |
| Карта бизнес-процессов | `/nacl-ba-process` |
| Декомпозиция процесса | `/nacl-ba-workflow` |
| Каталог сущностей | `/nacl-ba-entities` |
| Бизнес-роли | `/nacl-ba-roles` |
| Глоссарий | `/nacl-ba-glossary` |
| Бизнес-правила | `/nacl-ba-rules` |
| Валидация BA-модели | `/nacl-ba-validate` |
| Передача в SA | `/nacl-ba-handoff` |

### Системный анализ

| Ситуация | Скилл |
|----------|-------|
| Полный SA с нуля | `/nacl-sa-full` |
| Добавить фичу | `/nacl-sa-feature` |
| Модули (bounded contexts) | `/nacl-sa-architect` |
| Доменная модель | `/nacl-sa-domain` |
| Use Cases | `/nacl-sa-uc` |
| Системные роли | `/nacl-sa-roles` |
| UI-архитектура | `/nacl-sa-ui` |
| Валидация спецификации | `/nacl-sa-validate` |
| Финализация | `/nacl-sa-finalize` |

### Разработка

| Ситуация | Скилл |
|----------|-------|
| Полный цикл (BE+FE+QA+docs) | `/nacl-tl-full --task UC001` |
| Бэкенд TDD | `/nacl-tl-dev-be UC001` |
| Фронтенд TDD | `/nacl-tl-dev-fe UC001` |
| TECH/инфра-задача | `/nacl-tl-dev TECH001` |
| Код-ревью | `/nacl-tl-review UC001 --be` или `--fe` |
| E2E тестирование | `/nacl-tl-qa UC001` |
| Синхронизация BE/FE | `/nacl-tl-sync UC001` |
| Проверка стабов | `/nacl-tl-stubs` |

### Деплой

| Ситуация | Скилл |
|----------|-------|
| Коммит + пуш + PR | `/nacl-tl-ship` |
| Экстренный хотфикс в production | `/nacl-tl-hotfix --apply` |
| Полная доставка на staging | `/nacl-tl-deliver` |
| Мониторинг CI/CD | `/nacl-tl-deploy` |
| Релиз в production | `/nacl-tl-release` |

### Исправление и восстановление

| Ситуация | Скилл |
|----------|-------|
| Исправить баг (spec-first) | `/nacl-tl-fix "описание"` |
| Экстренный хотфикс (в обход фича-ветки) | `/nacl-tl-hotfix` |
| Переоткрытые задачи | `/nacl-tl-reopened` |
| Диагностика проекта | `/nacl-tl-diagnose` |
| Синхронизация доков с кодом | `/nacl-tl-reconcile` |

## Что дальше

- [Каталог скиллов](skills-reference.ru.md) — полный справочник
- [Сценарии](workflows.ru.md) — end-to-end сценарии
