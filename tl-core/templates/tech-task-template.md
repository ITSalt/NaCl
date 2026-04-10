# Tech Task File Template

## File Name

`task.md`

Located in: `.tl/tasks/TECH-###/task.md`

Example: `.tl/tasks/TECH-001/task.md`

## Purpose

Файл описания инфраструктурной / технической задачи. Содержит ВСЮ информацию, необходимую для понимания ЧТО нужно реализовать на уровне инфраструктуры: настройка БД, Docker, CI/CD, аутентификация, мониторинг и т.д. Файл должен быть **самодостаточным** -- агент разработки читает ТОЛЬКО этот файл и `impl-brief.md`, никогда не обращаясь к оригинальным артефактам SA.

В отличие от UC-задач (task-be, task-fe), TECH-задачи не привязаны к конкретному use case и не имеют акторов, потоков или входных/выходных данных API.

## Created By

`tl-plan` skill

## Read By

`tl-dev` skill

## Contents

```markdown
---
task_id: {{task_id}}
title: "{{title}}"
status: pending
priority: {{high|medium|low}}
category: {{infra|database|cicd|auth|monitoring|other}}
created: {{YYYY-MM-DD}}
updated: {{YYYY-MM-DD}}
depends_on: [{{dependency_task_ids}}]
blocks: [{{blocked_task_ids}}]
tags: [{{category}}, {{priority}}, tech]
---

# {{task_id}}. {{Title}}

## Description

{{Краткое описание задачи: что именно нужно настроить / создать / сконфигурировать.}}
{{Одно-два предложения, дающих полную картину без необходимости читать другие документы.}}

## Motivation

{{Зачем это нужно. Какую проблему решает. Какие задачи зависят от выполнения этой.}}
{{Без этой работы невозможно: ...}}

## Scope

### Включено

- {{Что входит в scope задачи 1}}
- {{Что входит в scope задачи 2}}
- {{Что входит в scope задачи 3}}

### Исключено

- {{Что НЕ входит в scope и будет сделано отдельно 1}}
- {{Что НЕ входит в scope и будет сделано отдельно 2}}

## Requirements

1. {{Требование 1: конкретное, проверяемое}}
2. {{Требование 2: конкретное, проверяемое}}
3. {{Требование 3: конкретное, проверяемое}}
4. {{Требование N}}

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `{{ENV_VAR_1}}` | {{Yes/No}} | `{{default_value}}` | {{Описание}} |
| `{{ENV_VAR_2}}` | {{Yes/No}} | `{{default_value}}` | {{Описание}} |

### Ports

| Service | Port | Description |
|---------|------|-------------|
| {{service_name}} | {{port}} | {{Описание}} |

### Settings

{{Дополнительные настройки, конфигурационные файлы, параметры запуска.}}

```
{{Пример конфигурации если необходимо}}
```

## Files to Create

| File | Purpose |
|------|---------|
| `{{path/to/new-file}}` | {{Назначение файла}} |
| `{{path/to/another-file}}` | {{Назначение файла}} |

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `{{path/to/existing-file}}` | {{add/modify/extend}} | {{Что меняется}} |
| `{{path/to/another-existing}}` | {{add/modify}} | {{Что меняется}} |

## Verification

Как убедиться, что задача выполнена корректно:

1. {{Шаг проверки 1: команда или действие}}
2. {{Шаг проверки 2: ожидаемый результат}}
3. {{Шаг проверки 3: ...}}

```bash
# Команды для проверки
{{verification_command_1}}
{{verification_command_2}}
```

## Rollback Plan

Как откатить изменения, если что-то пошло не так:

1. {{Шаг отката 1}}
2. {{Шаг отката 2}}
3. {{Шаг отката 3}}

```bash
# Команды для отката
{{rollback_command_1}}
{{rollback_command_2}}
```

## SA References (For Human Review Only)

- Architecture: {{path_to_architecture_doc}}
- Requirements: {{path_to_requirements}}
- Related: {{path_to_related_docs}}
```

## Category Values Reference

| Category | Description | Examples |
|----------|-------------|----------|
| `infra` | Инфраструктура и DevOps | Docker, docker-compose, networking, volumes |
| `database` | Работа с базами данных | Миграции, seed data, индексы, бэкапы |
| `cicd` | CI/CD пайплайны | GitHub Actions, linting, тесты в CI, деплой |
| `auth` | Аутентификация и авторизация | JWT, RBAC, OAuth, session management |
| `monitoring` | Мониторинг и логирование | Health checks, logging, metrics, alerting |
| `other` | Прочие технические задачи | Code style, tooling, documentation setup |

## Status Values Reference

| Status | Meaning |
|--------|---------|
| `pending` | Задача создана, не начата |
| `in_progress` | Разработка в процессе |
| `ready_for_review` | Разработка завершена |
| `in_review` | Код-ревью в процессе |
| `review_rejected` | Ревью не пройдено, нужна доработка |
| `approved` | Ревью пройдено |
| `done` | Задача полностью завершена |
| `blocked` | Ожидание зависимости |

## Status Transitions

```
pending -> in_progress -> ready_for_review -> in_review
                                                 |
                              approved <---------+
                                 |               |
                               done    review_rejected -> in_progress
```

## Quality Checklist

Before committing a task.md file for TECH task, verify:

- [ ] Frontmatter complete (task_id, title, status, priority, category)
- [ ] Description clear and self-contained
- [ ] Motivation explains WHY this task is needed
- [ ] Scope clearly defines what is included and excluded
- [ ] Requirements are numbered and verifiable
- [ ] Configuration section lists all env vars, ports, settings
- [ ] Files to create/modify listed
- [ ] Verification steps provided with commands
- [ ] Rollback plan documented
- [ ] NO external references for dev agent (SA refs for humans only)
