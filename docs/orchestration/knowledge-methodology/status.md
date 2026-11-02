# Актуализация знаний и упрощение методологии — статус

Единственный источник состояния программы `knowledge-methodology`. Пишет только оркестратор —
через `orch.py` и точечные правки, после каждого изменения состояния.

## Волны

| Волна | Цель | Гейт | Статус |
|-------|------|------|--------|

## Пакеты работ

Статусы: DRAFT, READY, DISPATCHING, IN_PROGRESS, REVIEW, REVISE, ACCEPTED, MERGED,
TEST-APPLIED / DEPLOYED_TEST, VERIFYING, PROD, DONE, BLOCKED (причина),
CANCELLED (причина).

<!-- orch:wp -->
| WP | Модуль | Название | Статус | Сессия | PR | Обновлено |
|----|--------|----------|--------|--------|----|-----------|
| [WP-FRAMEWORK-01](work-packages/WP-FRAMEWORK-01-inventory.md) | framework | Карта фреймворка и протокол измерений | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-02](work-packages/WP-FRAMEWORK-02-ba.md) | framework | Бизнес-анализ | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-03](work-packages/WP-FRAMEWORK-03-sa.md) | framework | Системный анализ | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-04](work-packages/WP-FRAMEWORK-04-tl.md) | framework | Планирование и управление разработкой | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-05](work-packages/WP-FRAMEWORK-05-development.md) | framework | Разработка и исправления | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-06](work-packages/WP-FRAMEWORK-06-quality.md) | framework | Review, QA и верификация | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-07](work-packages/WP-FRAMEWORK-07-delivery.md) | framework | Поставка, публикация и эксплуатационная документация | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-08](work-packages/WP-FRAMEWORK-08-management.md) | framework | Цели и восстановление фактического состояния | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-09](work-packages/WP-FRAMEWORK-09-graph.md) | framework | Данные, граф и синхронизация | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-10](work-packages/WP-FRAMEWORK-10-platform.md) | framework | Адаптеры, runtime и каналы поставки | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-11](work-packages/WP-FRAMEWORK-11-interface-ba-sa.md) | framework | Стык BA → SA | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-12](work-packages/WP-FRAMEWORK-12-interface-sa-dev.md) | framework | Стык SA → TL → разработка | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-13](work-packages/WP-FRAMEWORK-13-interface-dev-qa.md) | framework | Стык разработка → review/QA → release | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-14](work-packages/WP-FRAMEWORK-14-interface-control.md) | framework | Стык управления, восстановления и состояния | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-15](work-packages/WP-FRAMEWORK-15-harness.md) | framework | Что можно передать Harness | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-16](work-packages/WP-FRAMEWORK-16-measurement.md) | framework | Цена методологии и сравнение с Markdown | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |
| [WP-FRAMEWORK-17](work-packages/WP-FRAMEWORK-17-challenge.md) | framework | Независимая проверка рекомендаций | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |

## Ждёт владельца

R-n — действие: точная команда одной строкой и ожидаемый вывод. P-n — вопрос:
варианты с последствиями и рекомендация. Строка закрывается только после сверки
оркестратором по факту; закрытые строки зачёркиваются с датой и фактом.

<!-- orch:owner -->
| ID | Что (команда ; ожидание) | Где описано | Открыто | Закрыто |
|----|--------------------------|-------------|---------|---------|
| ~~P-1~~ | ~~Repository nacl: add `.worktreeinclude` in its root (a change of the project, made by a package there) so that every new worktree gets the gitignored files it needs: .env, .env.local (gitignore syntax, one pattern per line; directories as dir/**). Recommend (a) yes: sessions then never copy secrets or settings themselves~~ | orch.py init | 2026-11-02 | 2026-11-02 dropped: Автопредложение .worktreeinclude относится к Claude Code. Программа использует Codex; необходимость gitignored-файлов не установлена. Вернуться к этому только в пакете, которому действительно нужны такие файлы. |

## Замки

Общие пути и ресурсы репозитория; только держатель правит общий путь, пушит миграцию,
проверяет на стенде, запускает dev-стек на фиксированных портах. Держатель отдаёт замок
после merge или проверки. «Ждут» — пакеты в очереди на замок.

<!-- orch:locks -->
| Замок | Репозиторий | Держатель | С | Ждут | Примечание |
|-------|-------------|-----------|---|------|------------|

## Очередь слияний

При `merge_policy: sequential`: по одному; после каждого merge — зелёный деплой
стенда и health-check, затем rebase следующего пакета.

<!-- orch:merge -->
| # | Репозиторий | WP | PR | Rebase после | Статус |
|---|-------------|----|----|--------------|--------|

## Журнал

Новые сверху. Одна строка на событие: время (UTC), WP, что произошло, чем подтверждено.

<!-- orch:journal -->
| Дата | WP | Событие | Подтверждение |
|------|----|---------|---------------|
| 2026-11-02 11:37Z | WP-FRAMEWORK-17 | WP-FRAMEWORK-17 created (DRAFT) | work-packages/WP-FRAMEWORK-17-challenge.md |
| 2026-11-02 11:37Z | WP-FRAMEWORK-16 | WP-FRAMEWORK-16 created (DRAFT) | work-packages/WP-FRAMEWORK-16-measurement.md |
| 2026-11-02 11:37Z | WP-FRAMEWORK-15 | WP-FRAMEWORK-15 created (DRAFT) | work-packages/WP-FRAMEWORK-15-harness.md |
| 2026-11-02 11:37Z | WP-FRAMEWORK-14 | WP-FRAMEWORK-14 created (DRAFT) | work-packages/WP-FRAMEWORK-14-interface-control.md |
| 2026-11-02 11:37Z | WP-FRAMEWORK-13 | WP-FRAMEWORK-13 created (DRAFT) | work-packages/WP-FRAMEWORK-13-interface-dev-qa.md |
| 2026-11-02 11:37Z | WP-FRAMEWORK-12 | WP-FRAMEWORK-12 created (DRAFT) | work-packages/WP-FRAMEWORK-12-interface-sa-dev.md |
| 2026-11-02 11:37Z | WP-FRAMEWORK-11 | WP-FRAMEWORK-11 created (DRAFT) | work-packages/WP-FRAMEWORK-11-interface-ba-sa.md |
| 2026-11-02 11:37Z | WP-FRAMEWORK-10 | WP-FRAMEWORK-10 created (DRAFT) | work-packages/WP-FRAMEWORK-10-platform.md |
| 2026-11-02 11:37Z | WP-FRAMEWORK-09 | WP-FRAMEWORK-09 created (DRAFT) | work-packages/WP-FRAMEWORK-09-graph.md |
| 2026-11-02 11:37Z | WP-FRAMEWORK-08 | WP-FRAMEWORK-08 created (DRAFT) | work-packages/WP-FRAMEWORK-08-management.md |
| 2026-11-02 11:37Z | WP-FRAMEWORK-07 | WP-FRAMEWORK-07 created (DRAFT) | work-packages/WP-FRAMEWORK-07-delivery.md |
| 2026-11-02 11:37Z | WP-FRAMEWORK-06 | WP-FRAMEWORK-06 created (DRAFT) | work-packages/WP-FRAMEWORK-06-quality.md |
| 2026-11-02 11:37Z | WP-FRAMEWORK-05 | WP-FRAMEWORK-05 created (DRAFT) | work-packages/WP-FRAMEWORK-05-development.md |
| 2026-11-02 11:37Z | WP-FRAMEWORK-04 | WP-FRAMEWORK-04 created (DRAFT) | work-packages/WP-FRAMEWORK-04-tl.md |
| 2026-11-02 11:36Z | WP-FRAMEWORK-03 | WP-FRAMEWORK-03 created (DRAFT) | work-packages/WP-FRAMEWORK-03-sa.md |
| 2026-11-02 11:36Z | WP-FRAMEWORK-02 | WP-FRAMEWORK-02 created (DRAFT) | work-packages/WP-FRAMEWORK-02-ba.md |
| 2026-11-02 11:31Z | WP-FRAMEWORK-01 | WP-FRAMEWORK-01 created (DRAFT) | work-packages/WP-FRAMEWORK-01-inventory.md |
| 2026-11-02 11:31Z | — | delivery on hold: D-2: исследовательская программа, поставка и выпуск изменений NaCl вне объёма | orch.py hold |
| 2026-11-02 11:31Z | — | D-2 recorded | Прямое указание владельца в запросе plan от 2026-11-02 |
| 2026-11-02 11:16Z | — | Инициализация завершена: русский язык, локальный Codex, один модуль framework; полномочия поставки D-1. Команды приёмки и выпуска уточняются на этапе plan. Локальные launch descriptors исключены из Git; замечания к шаблонам сохранены локально. | orch.yaml; decisions.md; PLAN.md; bugs/PLUGIN-BUG-1.md |
| 2026-11-02 11:16Z | — | plugin defect PLUGIN-BUG-1 recorded (anonymized): Codex init: bootstrap protocol path and generated owner guidance need adjustment | bugs/PLUGIN-BUG-1.md |
| 2026-11-02 11:16Z | — | A-1 recorded | Техническая конфигурация init; проверить при plan |
| 2026-11-02 11:16Z | — | P-1 dropped | Автопредложение .worktreeinclude относится к Claude Code. Программа использует Codex; необходимость gitignored-файлов не установлена. Вернуться к этому только в пакете, которому действительно нужны такие файлы. |
| 2026-11-02 11:14Z | — | delivery prod: orchestrator by D-1 | D-1 |
| 2026-11-02 11:14Z | — | delivery stand: orchestrator by D-1 | D-1 |
| 2026-11-02 11:14Z | — | delivery merge: orchestrator by D-1 | D-1 |
| 2026-11-02 11:14Z | — | D-1 recorded | Прямое указание владельца при init, 2026-11-02 |
| 2026-11-02 11:14Z | — | P-1 opened for owner | orch.py init |
| 2026-11-02 11:14Z | — | client Codex; local launch policy defaults in orch.yaml | orch.py init --client codex |
| 2026-11-02 11:14Z | — | session kind: local, confirmed by the owner | orch.py init |
| 2026-11-02 11:14Z | — | workspace created (ru) | orch.py init |
