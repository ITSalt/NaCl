[English version](README.md)

# NaCl

NaCl — graph-first-фреймворк для разработки ПО с Claude Code и Codex. Бизнес-анализ, системные спецификации, свидетельства поставки и трассируемость хранятся в графе знаний Neo4j, а не в наборе разрозненных документов.

<!-- doc-key: runtime-channels -->
## Выбор канала выполнения

| Среда | Обычная установка | Статус |
|---|---|---|
| Codex Desktop | Полный плагин NaCl через **Plugins** | Локальный candidate проверен; публичный HTTP/OAuth-сервис, карточка и релиз — `NOT_RUN` |
| Claude Code Desktop | Marketplace-плагин NaCl | Поддерживается текущим пакетом 2.24.0 |
| Claude Code CLI | Скиллы Claude, связанные с репозиторием | Поддерживаемый канал совместимости |

Для Codex полный плагин — нормальный путь: одна UI-установка даёт интерфейс, десять публичных скиллов, шестьдесят внутренних скиллов и двадцать пять ограниченных MCP-инструментов. Старая Codex-схема только со скиллами остаётся только для совместимости. См. [Установку скиллов](docs/setup/install-skills.ru.md).

<!-- doc-key: codex-installation -->
## Установка в Codex Desktop

Откройте **Plugins**, выберите доверенную карточку NaCl, предоставленную для вашего workspace, установите её, выдайте только показанные Codex права, полностью перезапустите приложение и откройте новую задачу. Не используйте сохранённый путь к пакету с другого компьютера.

Локальный candidate проверен из installed cache Codex. Переносимой публичной карточки или URL пока нет: публичный Streamable HTTP MCP, OAuth, релиз и подача в marketplace остаются `NOT_RUN`. Текущая проверенная граница описана в [инструкции Codex](docs/setup/install-codex-plugin.ru.md).

<!-- doc-key: first-check -->
## Проверка до работы с проектом

В новой задаче Codex попросите NaCl вызвать `nacl_installation_doctor` ровно один раз. Продолжайте, только если он сообщил:

- `status=VERIFIED`;
- `mode=plugin-only`;
- версию из установленной карточки;
- `executionLocation=installed-cache`.

Затем перейдите к [быстрому старту](docs/quickstart.ru.md), dry run и инициализации проекта.

<!-- doc-key: graph-model -->
## Модель графа

Каждый проект получает свой контейнер Neo4j 5 Community и постоянные volumes. `/nacl-init` может создать их локально, подключиться к контейнеру проекта на доступном VPS или зарегистрировать существующее подключение. Локальный Docker — вариант по умолчанию.

Текущая граница авторизации — сервер: считается, что разработчик с доступом к Neo4j-серверу имеет доступ ко всем базам проектов на нём. `project_scope` выбирает логический проект и фиксирует provenance; это маршрутизация, а не контроль доступа. Будущий публичный сервис Codex должен аутентифицировать пользователя через OAuth, сопоставлять principal с разрешённым сервером и отклонять cross-server routing. NaCl не предоставляет managed graph service.

<!-- doc-key: key-concepts -->
## Ключевые принципы

- **Graph-first-анализ.** Процессы, сущности, роли, правила и use cases хранятся как узлы и связи Neo4j, поэтому impact analysis и трассируемость вычисляются запросами.
- **Настраиваемый язык.** Сначала действует `--lang=en` или `--lang=ru`, затем `project.lang` в `config.yaml`, затем дефолт слоя. BA и SA по умолчанию выдают русский, TL — английский.
- **Атомарная поставка.** Каждый use case разрабатывается, тестируется, ревьюится и поставляется как одна ограниченная единица.
- **Два уровня QA.** Локальная проверка кода предшествует staging E2E-проверке.
- **Конфигурируемая работа.** `config.yaml` управляет Git-стратегией, графом, идентичностью проекта и опциональными интеграциями.

<!-- doc-key: release-and-strict-mode -->
## Релизная основа и strict mode

В 2.10.0 goal-protocol-foundation появились `nacl-goal`, формат `GOAL_PROOF`, алиасы `wave`, `fix`, `validate` и `reopened-drain`, структурированные отказы и permissions denylist. См. [гайд по goal-команде](docs/guides/goal-command.md).

С 2.8.0 NaCl использует evidence-blocking gates и не превращает отсутствующие свидетельства в объяснительный текст. Закрытие отклоняет состояния из `{UNVERIFIED, BLOCKED, FAILED, NOT_RUN}`. Удалённые skip-флаги не обходят это правило; сохранённый `--skip-e2e` имеет явные границы. Старые проекты начинают с [`project-gap-closure.md`](nacl-tl-core/references/project-gap-closure.md) и используют только подписанные исключения или ограниченную аварийную процедуру.

<!-- doc-key: root-inventory -->
## Что входит во фреймворк

Корневые скиллы следуют схеме `nacl-{layer}-{action}`:

| Категория | Префикс | Количество | Ответственность |
|---|---|---:|---|
| Бизнес-анализ | `nacl-ba-*` | 14 | Процессы, сущности, роли, правила, глоссарий и валидация |
| Системный анализ | `nacl-sa-*` | 10 | Архитектура, домен, use cases, UI, роли и валидация |
| TeamLead | `nacl-tl-*` | 26 | Планирование, TDD, ревью, QA, деплой, релиз и восстановление |
| Утилиты | `nacl-*` | 6 | Общие helpers, рендеринг, публикация, инициализация, goals и postmortems |
| Миграция | `nacl-migrate-*` | 3 | Детерминированная миграция Markdown в граф |
| **Итого** |  | **59** | Корневой Claude/repository inventory |

Host-пакеты намеренно показывают разные поверхности: Claude Desktop имеет 53 вызываемых скилла, а Codex — 10 публичных дирижёров над сгенерированным внутренним каталогом из 60 скиллов.

<!-- doc-key: workflow -->
## Рабочий процесс

Десять публичных Codex-скиллов: `nacl-ba`, `nacl-diagnose`, `nacl-fix`, `nacl-goal`, `nacl-init`, `nacl-migrate`, `nacl-publish`, `nacl-sa`, `nacl-tl` и `nacl-verify`. Они маршрутизируют работу во внутренний каталог, а не выносят листовые реализации в основной UI.

```text
nacl-init → nacl-ba → nacl-sa → nacl-tl → nacl-verify
```

Строгий режим блокирует закрытие при `BLOCKED`, `FAILED`, `NOT_RUN` и `UNVERIFIED`. Допустимы только подписанные исключения проекта и ограниченная аварийная процедура из strict-mode references.

<!-- doc-key: claude-channel -->
## Claude Code 2.24.0

Текущий пакет Claude полностью поддерживается. Claude Code Desktop устанавливает marketplace-плагин из UI приложения или командами Claude; Claude Code CLI может использовать канал совместимости, связанный с репозиторием. На одной машине нужно выбрать один Claude-канал, чтобы дубли скиллов не затеняли друг друга. SessionStart-проверка 2.24.0 предупреждает о двойной установке.

Claude Desktop поставляет 53 вызываемых скилла и семь профилей агентов. Канал Claude Code, связанный с репозиторием, сохраняет все 59 корневых скиллов. Обёртка `/goal` и репозиторные migration/postmortem-утилиты остаются вне Desktop-бандла, где их host-допущения неприменимы.

<!-- doc-key: optional-integrations -->
## Опциональные интеграции

- **Docmost** публикует артефакты анализа и спецификации через `nacl-publish`.
- **YouGile** даёт опциональную доску управления проектом и интеграцию с задачами.

Ни одна интеграция не заменяет Neo4j-граф как source of truth для анализа.

<!-- doc-key: architecture -->
## Архитектура и пакеты

NaCl отделяет host-specific packaging от методологии:

- корневые исходники `nacl-*` и `plugin/` формируют Claude-пакет;
- `plugins/nacl/` — сгенерированный Codex-бандл;
- `plugins/nacl/resources/package-index.json` — inventory-контракт Codex;
- `graph-infra/` копируется в каждый проект при инициализации;
- `docs/` хранит общий операционный контракт.

См. [Архитектуру](docs/architecture.ru.md), [Конфигурацию](docs/configuration.md) и [Сценарии](docs/workflows.ru.md).

<!-- doc-key: agent-architecture -->
## Архитектура агентов

Claude-пакет маршрутизирует работу между шестью когнитивными профилями и одним diagnostic-сабагентом:

| Агент | Модель | Ответственность |
|---|---|---|
| strategist | Opus | Архитектура, валидация и глубокое ревью |
| analyst | Sonnet | Доменное моделирование и структурированный контент |
| developer | Sonnet | TDD-генерация кода и исправления |
| verifier | Sonnet | Тестирование и проверка контрактов |
| operator | Sonnet | Git, CI/CD, публикация и оркестрация миграции |
| scout | Haiku | Быстрые поиски и статусные запросы |
| diagnostician | Opus | Diagnose-and-spec-фаза ограниченных исправлений |

Codex-пакет не обещает имена Claude-моделей; его публичные дирижёры сохраняют те же границы ответственности. См. [Архитектуру агентов](docs/agents.ru.md).

<!-- doc-key: markdown-migration -->
## Миграция из Markdown

Существующие BA/SA-документы Markdown можно перенести в граф через публичный дирижёр `nacl-migrate`. Внутренняя миграция использует детерминированный парсинг и адаптеры для поддержанных форматов; она не просит LLM выдумывать факты графа. См. [Миграцию](docs/migration.md).

<!-- doc-key: graph-handover -->
## Передача графа

Перенос графа проекта на другую машину — одноразовая зашифрованная операция export/import. Она отделена от установки плагина и сохраняет границу графа проекта. См. [Handover](docs/HANDOVER.ru.md).

<!-- doc-key: analyst-tool -->
## NaCl Analyst Tool

Analyst Tool — локальное веб-приложение для досок из `graph-infra/boards/`. Оно показывает статус синхронизации с графом и даёт действия **Regenerate**, **Sync** и **Analyze** через `itsalt-pinch`. Старые отдельные контейнеры `excalidraw` и `excalidraw-room` больше не требуются.

Один демон может обслуживать несколько инициализированных проектов из реестра NaCl; переключатель в UI меняет активный проект без перезапуска демона. См. [Analyst Tool](docs/analyst-tool.md) и [multi-project setup](docs/analyst-tool.md#multi-project-setup).

<!-- doc-key: project-structure -->
## Структура проекта

```text
NaCl/
  .claude/agents/       когнитивные Claude-профили
  nacl-ba-*/            14 корневых BA-скиллов
  nacl-sa-*/            10 корневых SA-скиллов
  nacl-tl-*/            26 корневых TL-скиллов
  nacl-migrate-*/       3 детерминированных migration-скилла
  nacl-core/            общие graph и language helpers
  nacl-render/          рендеринг Markdown и Mermaid
  nacl-publish/         публикация в Docmost
  nacl-init/            инициализация проекта
  graph-infra/          шаблон Neo4j, копируемый в проект
  plugin/               сгенерированный Claude Desktop artifact
  .claude-plugin/       Claude marketplace manifest
  plugins/nacl/         сгенерированный Codex plugin artifact
  analyst-tool/         локальный UI досок и графа
  docs/                 общая документация
```

<!-- doc-key: inventory -->
## Состав

В репозитории есть 59 корневых NaCl-скиллов. Codex-пакет показывает 10 публичных дирижёров, содержит 60 внутренних скиллов, включая `nacl-tl-core`, и предоставляет 25 ограниченных MCP-инструментов. Сгенерированный inventory проверяется по package index; см. [Каталог скиллов](docs/skills-reference.ru.md).

<!-- doc-key: requirements -->
## Требования

- Codex Desktop или Claude Code;
- Docker и Docker Compose для локального графа;
- доступ к отдельно администрируемому VPS для удалённого графа;
- Git 2.30+ и Node.js 18+ для разработки и инструментов из репозитория.

Обычная установка Codex-плагина выполняется в UI. Пользователю не нужны исходный checkout, терминал, локальная папка marketplace или путь, зависящий от конкретной машины.

<!-- doc-key: documentation -->
## Документация

| Документ | Назначение |
|---|---|
| [Быстрый старт](docs/quickstart.ru.md) | Выбор установки, dry run и первый проект |
| [Codex-плагин](docs/codex-plugin.ru.md) | Публичная поверхность, права и ограничения |
| [Настройка графа](docs/setup/graph-setup.ru.md) | Локальный и VPS-режимы Neo4j |
| [Гайд по скиллам](docs/skills-guide.ru.md) | Выбор публичного дирижёра |
| [Каталог скиллов](docs/skills-reference.ru.md) | Точный публичный и внутренний inventory |
| [Конфигурация](docs/configuration.md) | `config.yaml`, маршрутизация и секреты |
| [Миграция](docs/migration.md) | Детерминированная миграция Markdown в граф |
| [Передача](docs/HANDOVER.ru.md) | Зашифрованный перенос графа между машинами |

<!-- doc-key: contributing -->
## Участие и лицензия

Перед pull request прочитайте [руководство для контрибьюторов](docs/contributing.ru.md). NaCl распространяется по [лицензии MIT](LICENSE), copyright ITSalt 2026.
