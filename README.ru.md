[English version](README.md)

# NaCl

**56 скиллов для Claude Code**, реализующих полный цикл разработки ПО -- от бизнес-анализа до релиза в продакшен.

Каждый скилл -- это слэш-команда (`/nacl-ba-full`, `/nacl-tl-dev-be`, `/nacl-tl-ship`, ...), которая превращает Claude Code в специализированного агента с жёстким процессом, артефактами и критериями качества. Все BA/SA артефакты хранятся в графе Neo4j, визуализируются через Excalidraw и публикуются в Docmost.

## Как это работает

```
 Клиентский документ
        |
        v
 /nacl-init "Мой проект"        Инициализация репозитория
        |
        v
 /nacl-ba-full                     Бизнес-анализ --> Neo4j граф
        |                           (процессы, сущности, роли,
        |                            правила, глоссарий)
        v
 /nacl-sa-full                     Системная спецификация --> Neo4j граф
        |                           (архитектура, домен, UC, UI,
        |                            роли, валидация)
        v
 /nacl-tl-conductor                Планирование + оркестрация
        |
        +-- /nacl-tl-plan          Задачи из графа (волны, BE+FE пары)
        +-- /nacl-tl-dev-be              Бэкенд TDD
        +-- /nacl-tl-dev-fe              Фронтенд TDD
        +-- /nacl-tl-review              Код-ревью
        +-- /nacl-tl-qa                  E2E тестирование (Playwright)
        +-- /nacl-tl-ship                Коммит, пуш, PR
        |
        v
 /nacl-tl-deliver --> /nacl-tl-release        Staging --> Production
```

## Что внутри

Все скиллы следуют конвенции `nacl-{слой}-{действие}`: **BA** = Business Analysis, **SA** = System Analysis, **TL** = TeamLead.

| Категория | Префикс | Кол-во | Описание |
|-----------|---------|--------|----------|
| **Бизнес-анализ** | `nacl-ba-*` | 14 | Процессы, сущности, роли, правила, глоссарий, импорт документов, валидация |
| **Системный анализ** | `nacl-sa-*` | 9 | Архитектура, доменная модель, Use Cases, UI, роли, валидация |
| **TeamLead** | `nacl-tl-*` | 24 | Разработка: TDD (BE/FE), ревью, QA, деплой, релиз, диагностика |
| **Утилиты** | `nacl-*` | 4 | `nacl-core`, `nacl-render`, `nacl-publish`, `nacl-init` |
| | | **51** | |

### Язык скиллов

Графовые BA и SA скиллы работают **на русском** -- язык SKILL.md определяет язык общения Claude с пользователем. TL-скиллы работают **на английском**, потому что код и коммиты пишутся на английском.

## Предварительные требования

| Компонент | Назначение |
|-----------|------------|
| [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) | Среда выполнения скиллов |
| [Docker](https://www.docker.com/) | Neo4j (граф) + Excalidraw (визуализация) |
| [git](https://git-scm.com/) | Управление версиями |
| Node.js 18+ | Для фронтенд-разработки |

### Опционально

| Компонент | Назначение |
|-----------|------------|
| [Docmost](https://docmost.com/) | Публикация wiki-документации из графа |
| [YouGile](https://yougile.com/) | Управление проектом, доска задач |

## Быстрый старт

**1. Клонируйте репозиторий**

```bash
git clone https://github.com/user/NaCl.git
```

**2. Запустите инфраструктуру**

```bash
cd NaCl/graph-infra
docker compose up -d
```

Neo4j будет доступен на `localhost:7474`, Excalidraw -- на `localhost:3050`.

**3. Установите скиллы в Claude Code**

```bash
cd ваш-проект
claude install-skill /путь/к/NaCl/nacl-init
claude install-skill /путь/к/NaCl/nacl-ba-full
# ... остальные скиллы по необходимости
```

**4. Инициализируйте проект**

```bash
claude
> /nacl-init "Название проекта"
```

**5. Запустите бизнес-анализ**

```bash
> /nacl-ba-full
```

Далее следуйте пайплайну: `nacl-sa-full` --> `nacl-tl-conductor` --> `nacl-tl-deliver` --> `nacl-tl-release`.

Подробная инструкция: [docs/quickstart.ru.md](docs/quickstart.ru.md)

## Архитектура

```
NaCl/
  nacl-ba-*/ (14)      Бизнес-анализ (SKILL.md на русском)
  nacl-sa-*/ (9)       Системная спецификация (SKILL.md на русском)
  nacl-tl-*/ (24)      Разработка, ревью, QA, деплой, релиз
  nacl-core/           Общие Cypher-запросы и константы
  nacl-render/         Рендеринг графа в Markdown / Excalidraw
  nacl-publish/        Публикация графа в Docmost
  nacl-init/           Инициализация проекта
  nacl-tl-core/        Общие шаблоны TL-скиллов
  graph-infra/         Docker Compose для Neo4j + Excalidraw
  docmost-sync/         Синхронизация с Docmost
  yougile-setup/        Настройка интеграции с YouGile
```

Каждый скилл -- это директория с файлом `SKILL.md`, который Claude Code загружает при вызове слэш-команды. SKILL.md содержит роль агента, входные/выходные артефакты, алгоритм работы, критерии качества и примеры.

## Документация

| Документ | Описание |
|----------|----------|
| [Быстрый старт](docs/quickstart.ru.md) | Пошаговая настройка и первый запуск |
| [Архитектура графа](docs/graph-architecture.ru.md) | Neo4j-схема, узлы, связи, слои |
| [Создание скиллов](docs/creating-skills.ru.md) | Как писать свои SKILL.md |
| [Интеграции](docs/integrations.ru.md) | Docmost, YouGile, CI/CD |
| [FAQ](docs/faq.ru.md) | Частые вопросы |

## Участие в проекте

Мы рады вкладу в проект. Ознакомьтесь с [руководством для контрибьюторов](docs/contributing.ru.md) перед отправкой pull request.

Основные правила:
- Каждый скилл автономен и содержит полный SKILL.md
- BA/SA скиллы пишутся на русском, TL -- на английском
- Все данные хранятся в графе, файлы -- только для кеша

## Лицензия

[MIT](LICENSE) -- ITSalt, 2026
