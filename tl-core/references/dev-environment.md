# Dev Environment -- настройка локальной среды разработки

> Справочный документ для навыка Team Lead (Claude Code).
> Описывает стандартный подход к конфигурации локального окружения.

---

## 1. Философия

**Docker для инфраструктуры, нативный запуск для приложений.**

| Слой | Подход | Обоснование |
|------|--------|-------------|
| Инфраструктура (БД, кэш, хранилище) | Docker Compose | Воспроизводимая среда, одинаковая у всех разработчиков. Тяжёлые компоненты изолированы и не засоряют хост-систему. |
| Приложения (backend, frontend) | Нативный запуск | Максимальная скорость hot-reload, полный доступ к дебаггеру, бесшовная интеграция с IDE (breakpoints, source maps). |

Такой подход совмещает надёжность контейнеризации с удобством нативной разработки.

---

## 2. Инфраструктура в Docker Compose

| Компонент | Образ | Порт | Назначение |
|-----------|-------|------|------------|
| PostgreSQL | `postgres:16-alpine` | 5432 | Основная БД |
| Redis | `redis:7-alpine` | 6379 | Кэш и очереди |
| MinIO | `minio/minio` | 9000 / 9001 | S3-совместимое хранилище |
| pgAdmin | `dpage/pgadmin4` | 5050 | UI для PostgreSQL (опц.) |
| Mailhog | `mailhog/mailhog` | 8025 / 1025 | Mock email сервер (опц.) |

Все образы используют alpine-варианты где возможно для минимизации размера.

---

## 3. docker-compose.dev.yml -- структура

Ключевые принципы конфигурации:

- **Версия**: поле `version` не указывается (deprecated в Compose v2+).
- **services**: `db`, `redis`, `minio`, `pgadmin` (optional), `mailhog` (optional).
- **volumes**: persistent data для `db` и `minio` -- данные сохраняются между перезапусками.
- **healthchecks**:
  - PostgreSQL: `pg_isready -U postgres`
  - Redis: `redis-cli ping`
- **networks**: `app-network` (bridge) -- единая сеть для всех сервисов.
- **environment**: переменные подставляются через `.env` файл (`DATABASE_URL`, `REDIS_URL` и т.д.).

Пример минимальной структуры:

```yaml
services:
  db:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
      POSTGRES_DB: ${DB_NAME:-appdb}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD:-minioadmin}
    volumes:
      - minio-data:/data
    command: server /data --console-address ":9001"

volumes:
  pgdata:
  minio-data:

networks:
  default:
    name: app-network
```

---

## 4. Backend (Node.js / NestJS) -- нативный запуск

```bash
# Terminal 1: Backend
cd backend/
npm run dev    # или npm run start:dev для NestJS
```

| Аспект | Детали |
|--------|--------|
| Hot-reload | `nodemon` / `ts-node-dev` / NestJS встроенный watcher (`start:dev`) |
| Environment | `.env` файл с `DATABASE_URL=postgresql://user:pass@localhost:5432/dbname` |
| Порт | `3001` (API) |
| Debugger | Флаг `--inspect` для Node.js, VS Code attach через launch.json |

Пример `launch.json` для дебага NestJS:

```json
{
  "type": "node",
  "request": "attach",
  "name": "Attach to NestJS",
  "port": 9229,
  "restart": true,
  "sourceMaps": true
}
```

---

## 5. Frontend (Next.js) -- нативный запуск

```bash
# Terminal 2: Frontend
cd frontend/
npm run dev
```

| Аспект | Детали |
|--------|--------|
| Hot-reload | Next.js Fast Refresh (встроенный, работает из коробки) |
| Environment | `.env.local` с `NEXT_PUBLIC_API_URL=http://localhost:3001` |
| Порт | `3000` (UI) |
| Turbopack | `next dev --turbopack` для ускоренной разработки (экспериментально) |

---

## 6. Запуск полной среды

Последовательность шагов для запуска всего окружения с нуля:

```bash
# Step 1: Поднять инфраструктуру
docker compose -f docker-compose.dev.yml up -d

# Step 2: Дождаться готовности всех сервисов
docker compose -f docker-compose.dev.yml ps   # все должны быть healthy

# Step 3: Накатить миграции БД
cd backend && npm run migration:run

# Step 4: Запустить Backend
cd backend && npm run dev

# Step 5: Запустить Frontend (в другом терминале)
cd frontend && npm run dev
```

После выполнения всех шагов:
- UI доступен на `http://localhost:3000`
- API доступен на `http://localhost:3001`
- pgAdmin доступен на `http://localhost:5050` (если включён)
- MinIO Console на `http://localhost:9001`

---

## 7. Файлы окружения

| Файл | Назначение | В git? |
|------|------------|--------|
| `.env` | Общие переменные (DB_HOST, DB_PORT, REDIS_URL) | Нет |
| `.env.example` | Шаблон без реальных значений | Да |
| `backend/.env` | BE-специфичные (JWT_SECRET, API_PORT) | Нет |
| `frontend/.env.local` | FE-специфичные (NEXT_PUBLIC_API_URL) | Нет |

**НИКОГДА не коммитить `.env` файлы с реальными credentials.**

`.gitignore` должен содержать:

```gitignore
.env
.env.local
.env.*.local
!.env.example
```

---

## 8. Health Checks и готовность

Команды для проверки доступности каждого компонента:

| Компонент | Команда проверки |
|-----------|-----------------|
| PostgreSQL | `pg_isready -U postgres` |
| Redis | `redis-cli ping` |
| MinIO | `curl -f http://localhost:9000/minio/health/live` |
| Backend | `curl -f http://localhost:3001/health` |
| Frontend | `curl -f http://localhost:3000` |

Для автоматизации можно объединить проверки в скрипт `scripts/check-health.sh`:

```bash
#!/usr/bin/env bash
set -e

echo "Checking PostgreSQL..." && pg_isready -h localhost -U postgres
echo "Checking Redis..."      && redis-cli ping
echo "Checking MinIO..."      && curl -sf http://localhost:9000/minio/health/live > /dev/null
echo "Checking Backend..."    && curl -sf http://localhost:3001/health > /dev/null
echo "Checking Frontend..."   && curl -sf http://localhost:3000 > /dev/null

echo "All services are healthy."
```

---

## 9. Типичные проблемы и решения

| Проблема | Причина | Решение |
|----------|---------|---------|
| Port conflict (порт уже занят) | Другой процесс слушает тот же порт | Изменить маппинг портов в `docker-compose.dev.yml` (`"5433:5432"`) или остановить конфликтующий процесс |
| Docker volume permissions | Несовпадение UID/GID между контейнером и хостом | Выполнить `chown` на mounted volumes или задать `user:` в compose |
| Node modules sync | `node_modules` конфликтуют при монтировании в Docker | Не монтировать `node_modules` в Docker; использовать named volume или `.dockerignore` |
| Database reset | Нужно начать с чистой БД | `docker compose -f docker-compose.dev.yml down -v` (удаляет volumes) |
| Медленный Docker на macOS | Файловая система VirtioFS / gRPC FUSE | Использовать `mutagen` для синхронизации или перейти на OrbStack |
| Hot-reload не срабатывает | Файлы монтируются через Docker volume | Запускать приложение нативно (без Docker), как описано в разделах 4--5 |

---

## 10. TECH-задачи при инициализации

Навык `tl-plan` при инициализации проекта должен создать следующие TECH-задачи:

| ID | Название | Описание |
|----|----------|----------|
| TECH-001 | Создать docker-compose.dev.yml | Конфигурация PostgreSQL, Redis, MinIO с healthchecks, volumes, networks |
| TECH-002 | Настроить BE dev server | NestJS scaffold, `.env`, health endpoint `/health`, debugger config |
| TECH-003 | Настроить FE dev server | Next.js scaffold, `.env.local`, API client, proxy config |
| TECH-004 | Настроить миграции БД | Начальная schema, seed data, скрипты `migration:run` / `migration:generate` |

Эти задачи являются prerequisite для всех остальных задач проекта и должны быть выполнены в первую очередь.

---

*Справочный документ навыка Team Lead для Claude Code.*
