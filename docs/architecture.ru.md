[Главная](../README.ru.md) > Архитектура

🇬🇧 [English version](architecture.md)

# Архитектура

NaCl реализует трёхуровневый конвейер, где каждый уровень трансформирует артефакты предыдущего. Neo4j-граф обеспечивает сквозную трассировку и анализ влияния изменений.

## Конвейер

```
Graph BA (Бизнес-анализ)          Graph SA (Системный анализ)     TL (Разработка)
──────────────────────────        ──────────────────────────      ─────────────────
Стейкхолдеры, процессы,           Модули, доменная модель,        Задачи, волны,
сущности, роли, глоссарий,        use cases, формы, роли,         TDD-код, ревью,
правила, workflows                API-контракты, UI               QA, деплой
        │                                │                              │
        ▼                                ▼                              ▼
   Neo4j-граф                       Neo4j-граф                    Файлы + Git
   (BA-узлы)                        (SA-узлы)                     (src/, docs/, .tl/)
```

На каждом уровне есть:
- **Оркестратор** — запускает все шаги автоматически (`nacl-ba-full`, `nacl-sa-full`, `nacl-tl-conductor`)
- **Отдельные скиллы** — можно запускать вручную для конкретных задач

## Neo4j как граф знаний

Все данные бизнес- и системного анализа хранятся в Neo4j как типизированные узлы и связи:

```
(:BusinessProcess)-[:HAS_STEP]->(:WorkflowStep)
(:WorkflowStep)-[:PRODUCES]->(:BusinessEntity)
(:BusinessEntity)-[:MAPPED_TO]->(:DomainEntity)
(:DomainEntity)-[:USED_IN]->(:UseCase)
(:UseCase)-[:HAS_FORM]->(:Form)
```

Это даёт:
- **Сквозную трассировку**: от UI-формы до бизнес-процесса, который её требует
- **Анализ влияния**: изменили бизнес-сущность — мгновенно видны все затронутые UC, формы и модули
- **Валидацию консистентности**: Cypher-запросы находят осиротевшие узлы, пропущенные связи, конфликты имён

## Иерархия оркестрации

```
Уровень 4: nacl-tl-conductor          (весь пайплайн: заявки → разработка → staging)
Уровень 3: nacl-ba-full / nacl-sa-full / nacl-tl-full   (оркестраторы уровня)
Уровень 2: nacl-ba-context / nacl-tl-dev-be / nacl-tl-qa      (отдельные скиллы)
Уровень 1: nacl-core / tl-core                       (общие справочники)
```

**Уровень 4** управляет полным workflow — от запросов пользователя до задеплоенного кода.
**Уровень 3** оркестраторы последовательно запускают все скиллы своего уровня.
**Уровень 2** скиллы выполняют конкретные задачи (создать доменную модель, запустить тесты и т.д.).
**Уровень 1** предоставляет общие шаблоны, конвенции и утилиты.

## Поток артефактов

```
Входные данные (интервью, документы)
    ↓
nacl-ba-* → Neo4j BA-узлы (процессы, сущности, роли, правила)
    ↓
nacl-sa-* → Neo4j SA-узлы (модули, домен, UC, формы, API-контракты)
    ↓
nacl-tl-plan → .tl/tasks/ (файлы задач со спецификациями из графа)
    ↓
nacl-tl-dev-be → src/ бэкенд-код (TDD: сначала тест, потом реализация)
nacl-tl-dev-fe → src/ фронтенд-код (TDD: тот же подход)
    ↓
nacl-tl-ship → git commit + push + PR
nacl-tl-deploy → CI/CD → staging
nacl-tl-release → production
```

## Анатомия скилла

Каждый скилл — директория с файлом `SKILL.md`:

```
nacl-ba-context/
└── SKILL.md          # YAML frontmatter + инструкции
```

SKILL.md содержит:
1. **YAML frontmatter** — `name` и `description` (для обнаружения скилла)
2. **Декларация роли** — кем притворяется AI-агент
3. **Фазы workflow** — пронумерованные шаги с точками согласования
4. **Шаблоны и правила** — спецификации формата вывода
5. **Ссылки** — на общие ресурсы в `nacl-core/` или `nacl-tl-core/`

## config.yaml

Каждый целевой проект имеет `config.yaml` в корне с настройками:

```yaml
project:
  name: "Мой проект"
  stack: "Next.js + Fastify + PostgreSQL"

git:
  strategy: "feature-branch"    # или "direct"
  main_branch: "main"

modules:
  frontend:
    path: "frontend"
    test_cmd: "npm test"
  backend:
    path: "backend"
    test_cmd: "npm test"

graph:                          # только для графовых скиллов
  neo4j_bolt_port: 3587
  neo4j_http_port: 3574
  neo4j_password: "neo4j_graph_dev"
  excalidraw_port: 3580
  container_prefix: "my-project"
  boards_dir: "graph-infra/boards"
```

Скиллы читают `config.yaml` при запуске и адаптируют поведение под проект.

## Что дальше

- [Каталог скиллов](skills-reference.ru.md) — все 56 скиллов
- [Сценарии](workflows.ru.md) — end-to-end сценарии
- [Быстрый старт](quickstart.ru.md) — начните за 10 минут
