[Главная](../README.ru.md) > Конфигурация

[English version](configuration.md)

# Справочник по конфигурации

Каждый целевой проект хранит `config.yaml` в корне. NaCl читает его в runtime и настраивает Git-стратегию, тесты, Neo4j, деплой и интеграции.

## Расположение и поиск

Скиллы ищут `config.yaml` от текущей папки вверх. Файл должен быть в корне проекта рядом с верхнеуровневым `package.json` или `src/`. Если файла нет, применяются безопасные дефолты; поля без дефолта дают ошибку конфигурации.

## Повторный `/nacl-init` в существующем проекте

Повторный запуск идемпотентен. Он обновляет `CLAUDE.md` и `config.yaml`, удаляет legacy-сервисы `excalidraw`/`excalidraw-room` и их порты, создаёт `graph-infra/boards/`, добавляет отсутствующие `project.id`, `project.name` и секцию `intake:`. Существующая пользовательская `intake:` не перезаписывается. При миграции печатается одна итоговая строка; для свежего проекта лишнего вывода нет.

## Полный пример

```yaml
project:
  id: "my-project"
  name: "My Project"
  stack: "Next.js + Fastify + PostgreSQL"

git:
  strategy: "feature-branch"
  main_branch: "main"
  branch_prefix: "feature/"
  merge_method: "squash"

modules:
  frontend:
    path: "frontend"
    test_cmd: "npm test"
    build_cmd: "npm run build"
  backend:
    path: "backend"
    test_cmd: "npm test"
    build_cmd: "npm run build"

graph:
  mode: "local"
  neo4j_bolt_port: 3587
  neo4j_http_port: 3574
  neo4j_password: "${NEO4J_PASSWORD}"
  container_prefix: "my-project"
  boards_dir: "graph-infra/boards"

yougile:
  api_base: "https://yougile.com/api-v2"
  project_id: "project-id"
  board_id: "board-id"
  columns:
    dev_done: "dev-done-column"
    done: "done-column"

deploy:
  ci_platform: "github-actions"
  staging:
    method: "github-actions"
    url: "https://staging.example.com"
    health_endpoint: "/api/health"
    skip_ci: false
  production:
    url: "https://example.com"
    health_endpoint: "/api/health"

vps:
  staging:
    ip: "1.2.3.4"
    user: "deploy"
    ssh_key: "~/.ssh/id_rsa"
```

## Справочник по секциям

### `project` (обязательно)

- `id` — стабильный slug; при отсутствии выводится из `name`.
- `name` — читаемое имя; обязательно.
- `stack`, `description` — контекст для dev-скиллов.

### `git` (обязательно для ship/deploy)

- `strategy`: `feature-branch` (по умолчанию) или `direct`.
- `main_branch`: по умолчанию `main`.
- `branch_prefix`: по умолчанию `feature/`.
- `merge_method`: `squash`, `merge` или `rebase`.

Legacy-проекты могут иметь `modules.[name].git_strategy` и `git_base_branch`; top-level `git.*` имеет приоритет.

### `modules` (обязательно для dev/ship)

Ключ модуля произвольный. Поля: `[name].path` (обязательно), `test_cmd` (`npm test`), `build_cmd` (`npm run build`), legacy-переопределения `git_strategy` и `git_base_branch`.

### `credentials` (опционально)

Для QA и диагностики: `db.host`, `db.port`, `db.user`, `db.database`, а также `[role].email`, `phone`, `password`, `role`. Пароль БД поступает из `DB_PASSWORD`, а не из коммита.

### `graph` (обязательно для graph-aware-скиллов)

Общие поля: `mode` (`local` по умолчанию или `remote`) и `boards_dir` (`graph-infra/boards`). В
`remote` каждый проект получает отдельный контейнер Neo4j 5 Community с независимыми постоянными
volumes на доступном VPS; отсутствие `mode` по-прежнему означает `local`.

Для local: `neo4j_bolt_port`, `neo4j_http_port`, runtime-секрет `neo4j_password`, `container_prefix`.

Для remote: `neo4j_uri` (локальный sidecar socket), `neo4j_username` (`neo4j`),
`neo4j_database` (`neo4j`), `project_scope`, `remote.route_mode` (`create` или `connect`),
`remote.host`, `remote.gateway_port`, `remote.sidecar_port`, `remote.client_cert`,
`remote.client_key`, `remote.ca_cert`, `remote.tls` (`true`) и обязательный
`remote.secret_source`. `project_scope` — идентификатор маршрутизации и provenance отдельного
контейнера/маршрута проекта, а не разрешение доступа и не маркер `(:Project)` в общем графе.

`developer.id` штампуется в claim locks и provenance. Приоритет: `NACL_DEVELOPER_ID` > `developer.id` > автовывод из Git/user и machine key.

#### Режим графа: local и remote

Каждый проект по умолчанию получает свой local-контейнер Neo4j 5 Community. Remote выбирается явно:
первый участник выполняет `nacl-init` в create-режиме и создаёт отдельные контейнер, volumes и маршрут
проекта на VPS; следующие участники подключаются к этому же маршруту в connect-режиме. Несекретные
endpoint-поля коммитятся и автоматически выбирают connect для команды.

Remote-доступ идёт через личный отзываемый mTLS-сертификат и sidecar tunnel. Секреты не коммитятся:
`graph.remote.secret_source` обязателен и содержит только точную ссылку `env:NEO4J_PASSWORD` или
`server-route:<id>`. Первый вариант читает `NEO4J_PASSWORD` только из окружения текущего runtime,
второй передаётся внешнему провайдеру из `NACL_SERVER_ROUTE_SECRET_PROVIDER`. `.mcp.json` хранит
непрозрачную ссылку и метаданные launcher/маршрута, но никогда не сырой или общий пароль. Если env
или провайдер недоступен, инициализация и подключение завершаются fail closed без demo/default fallback.

Текущая граница авторизации — сервер: если разработчик имеет к нему доступ, он считается имеющим
доступ ко всем базам проектов на нём. `project_scope` выбирает маршрут проекта и фиксирует provenance;
это не auth-граница и не grant через маркер `(:Project)` в общем графе.

### `yougile` (опционально)

Поля: `api_base`, `project_id`, `board_id`, `columns.user_requests`, `backlog`, `in_work`, `dev_done`, `ready_to_test`, `testing`, `to_release`, `reopened`, `done`; stickers `task_type`, `module`, `source`; флаги `auto_create_bugs.critical`, `major`, `minor`. API-токен поступает из `YOUGILE_API_KEY`, а не из config.

### `deploy` (опционально)

Поля: `ci_platform`; `staging.method`, `url`, `health_endpoint`, `skip_ci`, `env_file`, `script`; `production.url`, `production.health_endpoint`. Метод staging: `github-actions` или `direct`.

### `vps` (опционально)

Для `staging` и `production`: `ip`, `user`, `ssh_key`. Секция нужна `nacl-tl-deploy` для SSH-диагностики после неудачного health check.

### `reports` (опционально)

`mode` (`local`/`remote`), `local_path` (`.tl/reports`), `ssh_host`, `remote_path` (`/srv/reports`), `domain`, `retention_days` (`30`). Читается `nacl-tl-qa`.

### `docmost` (опционально)

`api_url`, `spaces.sa.space_id`, `spaces.sa.root_page_id`, `spaces.ba.space_id`, `spaces.ba.root_page_id`. Credentials поступают из `DOCMOST_EMAIL` и `DOCMOST_PASSWORD`.

### `intake` (опционально, self-diagnosis scoring)

`route_threshold` (0.7), `high_confidence` (0.9) и `scores.*` настраивают PROBE-этап `nacl-tl-intake`. Каждый ключ имеет независимый дефолт. Значения вне `(0,1]` или `route_threshold > high_confidence` дают warning и fallback. Billing, auth, schema migration, destructive ops и product decisions никогда не автомаршрутизируются одним score.

## Как скиллы разрешают конфигурацию

| Значение | Приоритет |
|---|---|
| Git strategy | `git.strategy` > module legacy > `feature-branch` |
| Base branch | `git.main_branch` > module legacy > `main` |
| Branch prefix | `git.branch_prefix` > `feature/` |
| Test/build | module command > `npm test` / `npm run build` |
| Module path | module `path` > автоопределение |
| Deploy | `deploy.staging.method` > legacy `deploy.method` > `github-actions` |
| Health | environment endpoint > `/api/health` |
| Intake | ключ config > встроенный per-key default |

### Дисциплина имён веток (для авторов скиллов)

`config.yaml` — единственный source of truth для base branch. Не зашивайте имя ветки в Git/команды и не дублируйте config в convenience-таблицах. CI отклоняет literal branch names в shell-блоках; редкое намеренное исключение помечается `# branch-literal-ok`.

## Codex-плагин и публичный сервис

### Локальный installed candidate

Полный Codex-плагин читает тот же `config.yaml`; второй схемы проекта нет. Проверенный локальный candidate разрешает проект, затем вызывает именованные gateway-операции и разрешает credentials в runtime. Local stdio — transport для installed candidate и разработки. Обычный пользователь ставит полный плагин из UI; skills-only-схема — только совместимость.

### Production-граница

Действующих public-only Codex-полей пока нет. Streamable HTTP endpoint, OAuth deployment, домен, релиз и marketplace submission имеют статус `NOT_RUN`, поэтому этот справочник не выдумывает для них config. Production gateway должен аутентифицировать OAuth principal, сопоставить его с разрешённым Neo4j-сервером, разрешить same-server project selection и отклонить cross-server routing. Секреты остаются в runtime secret stores или env, а не в пакете или коммите.

## Минимальные конфиги

TL-only-проекту достаточно `project`, `git` и `modules`. Полный graph-проект добавляет `graph`:

```yaml
project:
  name: "My Project"
git:
  strategy: "feature-branch"
  main_branch: "main"
modules:
  backend:
    path: "backend"
    test_cmd: "npm test"
graph:
  mode: "local"
  neo4j_bolt_port: 3587
  neo4j_http_port: 3574
  neo4j_password: "${NEO4J_PASSWORD}"
  container_prefix: "my-project"
```

`nacl-init` создаёт starter config для нового проекта.

## Переменные окружения

### `NACL_HOME`

Каталог per-user-реестра `projects.json`; по умолчанию `~/.nacl/`. Читается `nacl-init` и Analyst Tool.

### `NEO4J_MCP_VERSION`

Версия официального `neo4j-mcp`; по умолчанию берётся из pin-файла. `latest` отключает checksum verification и печатает warning.

### `NACL_DEVELOPER_ID`

Высший приоритет для identity в remote claim locks и provenance. При отсутствии применяется `developer.id`, затем автовывод.

### `NACL_ALLOW_DUAL`

При `1` отключает предупреждение 2.24.0 о совместной установке Claude Desktop-плагина и repository-backed Claude-скиллов. По умолчанию warning активен.
