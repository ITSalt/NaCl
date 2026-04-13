---
title: "ExclusionList"
type: entity
module: demand-planning
status: draft
created: 2026-03-20
updated: 2026-03-20
ba_source: OBJ-021
tags: [entity, demand-planning]
---

# ExclusionList

**Модуль:** demand-planning
**BA-источник:** OBJ-021 Файл исключения позиций
**Описание:** Сессия загрузки файла с артикулами для исключения из отчёта о потребностях. Загружается Аналитиком / РТН в ходе проверки отчёта (BP-003). После применения — указанные артикулы убираются из расчёта заявок.

## Атрибуты

| Атрибут | Тип | Обязательность | Ограничения | Описание |
|---------|-----|----------------|-------------|----------|
| id | UUID | Required | PK, auto | — |
| calculationId | Reference → DailyOrderCalculation | Required | FK | Расчёт, к которому относится исключение |
| fileName | String | Required | max 255 | Исходное имя файла |
| uploadedBy | Reference → User | Required | FK | Кто загрузил |
| uploadedAt | DateTime | Required | auto | Дата и время загрузки |
| status | Enum (ImportStatus) | Required | Default: PENDING | Статус обработки файла |
| rowCount | Number | Required | ≥ 0 | Количество артикулов для исключения |

## Связи

- **DailyOrderCalculation** (M:1) — привязана к одному расчёту
- **ExclusionRow** (1:M) — содержит строки с артикулами

## Жизненный цикл

Статусы: `ImportStatus`. См. `enumerations/import-status.md`.

## Бизнес-правила

- BRQ-026: исключение позиций возможно только через загрузку файла, ручное удаление строк не допускается
