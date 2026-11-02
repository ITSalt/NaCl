# Актуализация знаний и упрощение методологии — статус

Единственный источник состояния программы `knowledge-methodology`. Пишет только оркестратор —
через `orch.py` и точечные правки, после каждого изменения состояния.

## Волны

| Волна | Цель | Гейт | Статус |
|-------|------|------|--------|
| 0 | Карта и протокол | WP-01 | IN_PROGRESS |
| 1 | Области и Harness | WP-02–10,15 | PLANNED |
| 2 | Стыки и измерения | WP-11–14,16 | PLANNED |
| 3 | Оспаривание | WP-17 | PLANNED |
| 4 | Рекомендации | WP-18 | PLANNED |

## Пакеты работ

Статусы: DRAFT, READY, DISPATCHING, IN_PROGRESS, REVIEW, REVISE, ACCEPTED, MERGED,
TEST-APPLIED / DEPLOYED_TEST, VERIFYING, PROD, DONE, BLOCKED (причина),
CANCELLED (причина).

<!-- orch:wp -->
| WP | Модуль | Название | Статус | Сессия | PR | Обновлено |
|----|--------|----------|--------|--------|----|-----------|
| [WP-FRAMEWORK-01](work-packages/WP-FRAMEWORK-01-inventory.md) | framework | Карта фреймворка и протокол измерений | IN_PROGRESS | knowledge-methodology-framework | — | 2026-11-02 |
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
| [WP-FRAMEWORK-18](work-packages/WP-FRAMEWORK-18-recommendations.md) | framework | Методические рекомендации и передача следующей программе | DRAFT | knowledge-methodology-framework | — | 2026-11-02 |

## Ждёт владельца

R-n — действие: точная команда одной строкой и ожидаемый вывод. P-n — вопрос:
варианты с последствиями и рекомендация. Строка закрывается только после сверки
оркестратором по факту; закрытые строки зачёркиваются с датой и фактом.

<!-- orch:owner -->
| ID | Что (команда ; ожидание) | Где описано | Открыто | Закрыто |
|----|--------------------------|-------------|---------|---------|
| ~~P-1~~ | ~~Repository nacl: add `.worktreeinclude` in its root (a change of the project, made by a package there) so that every new worktree gets the gitignored files it needs: .env, .env.local (gitignore syntax, one pattern per line; directories as dir/**). Recommend (a) yes: sessions then never copy secrets or settings themselves~~ | orch.py init | 2026-11-02 | 2026-11-02 dropped: Автопредложение .worktreeinclude относится к Claude Code. Программа использует Codex; необходимость gitignored-файлов не установлена. Вернуться к этому только в пакете, которому действительно нужны такие файлы. |
| P-2 | Уточнить границу D-4: какие выполненные агентские работы относить к подготовке одной A/B-пары, чтобы оценить расход и сохранить лимит; текущие session totals и отсутствие подтверждённого общего hard cap описаны в evidence. | reports/WP-16-budget-observation.md | 2026-11-02 |  |

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
| 2026-11-02 15:33Z | WP-FRAMEWORK-01 | Сопоставлена Skills-only closure двух snapshots: пути совпадают, 9 output файлов различаются после rewrite | reports/WP-10-skills-only-snapshot-delta.md |
| 2026-11-02 15:30Z | WP-FRAMEWORK-01 | Уточнены вызовы packaged scripts и покрытие mode тестами; прямой runtime отказ не установлен | reports/WP-01-full-package-provenance.md |
| 2026-11-02 15:28Z | WP-FRAMEWORK-01 | Уточнены Git modes package и состав изменений installed plugin.json; runtime причины не установлены | reports/WP-10-installed-integrity-trace.md |
| 2026-11-02 15:26Z | WP-FRAMEWORK-01 | Проверены 415 путей full package, 16 transformations и два generated index по pinned Git tree | reports/WP-01-full-package-provenance.md |
| 2026-11-02 15:23Z | WP-FRAMEWORK-01 | Проверены installed Skills-only manifest, 154 transformed файла и in-memory модели closure; plugin.json отличается от manifest | reports/WP-10-installed-integrity-trace.md |
| 2026-11-02 15:21Z | WP-FRAMEWORK-01 | Сверены 196 root resources и 34 shared files, включая 14 transformations в памяти | reports/WP-01-root-shared-resource-map.md |
| 2026-11-02 15:19Z | WP-FRAMEWORK-01 | Независимо сверены legacy workflow non-SKILL resources и manifest transform на закреплённом снимке | reports/WP-01-legacy-resource-map.md |
| 2026-11-02 15:16Z | WP-FRAMEWORK-01 | Зафиксирован вопрос об атрибуции D-4; пилот не запущен, общее исследование продолжалось | reports/WP-16-budget-observation.md |
| 2026-11-02 15:16Z | — | P-2 opened for owner | reports/WP-16-budget-observation.md |
| 2026-11-02 15:16Z | WP-FRAMEWORK-01 | Проверены ограничения предварительных рекомендаций и уточнены обязательные installed resources; граница бюджета D-4 остаётся неустановленной | reports/WP-16-budget-observation.md |
| 2026-11-02 15:15Z | WP-FRAMEWORK-01 | Сведены установленная resource closure и независимая проверка ограничений итоговых source claims | reports/WP-10-installed-resource-matrix.md |
| 2026-11-02 15:13Z | WP-FRAMEWORK-01 | Дополнен предварительный список кандидатов и проверены installed TL/goal resources | reports/WP-18-preliminary-candidates.md |
| 2026-11-02 15:11Z | WP-FRAMEWORK-01 | Проверены installed TL resource paths и source-level deploy monitoring/WorkflowStep handoff | reports/WP-07-deploy-monitor-trace.md |
| 2026-11-02 15:10Z | WP-FRAMEWORK-01 | Сверены installed BA resources и QA screenshot evidence, без запуска workflows | reports/WP-13-qa-screenshot-evidence.md |
| 2026-11-02 15:09Z | WP-FRAMEWORK-01 | Уточнена локальная телеметрия D-4: условный parent output выше лимита при полной атрибуции, реальная атрибуция UNKNOWN | reports/WP-16-budget-observation.md |
| 2026-11-02 15:07Z | WP-FRAMEWORK-01 | Подтверждена структура установленных SA/TL ресурсов и уточнена трасса Requirement anchors в TL | reports/WP-12-requirement-anchor-trace.md |
| 2026-11-02 15:05Z | WP-FRAMEWORK-01 | Уточнён installed SA resource, критерии source-level инвентаризации и актуальность QA scenario | reports/WP-10-skill-closure-trace.md |
| 2026-11-02 15:03Z | WP-FRAMEWORK-01 | Дополнены source-level goal resume, BE baseline и независимый challenge symlink tests | reports/WP-17-symlink-challenge-trace.md |
| 2026-11-02 15:00Z | WP-FRAMEWORK-01 | Сверены authorization границы transports и поля BA→SA attribute mapping | reports/WP-11-attribute-propagation-trace.md |
| 2026-11-02 14:59Z | WP-FRAMEWORK-01 | Исследованы Skills-only resource closure и отличие отдельного автора теста от независимого oracle | reports/WP-10-skill-closure-trace.md |
| 2026-11-02 14:57Z | WP-FRAMEWORK-01 | Уточнены source-level выбор CI run, freshness reconcile и project-scoped lease legacy node | reports/WP-09-null-project-lease-trace.md |
| 2026-11-02 14:55Z | WP-FRAMEWORK-01 | Предварительно исследованы intake decisions, FE RED handoff и per-AC review; результаты независимо сверены | reports/WP-05-fe-red-handoff.md |
| 2026-11-02 14:53Z | WP-FRAMEWORK-01 | Уточнены source-level передача acceptance в QA и контроль review evidence по ревизии | reports/WP-14-review-revision-trace.md |
| 2026-11-02 14:51Z | WP-FRAMEWORK-01 | Уточнены стыки BusinessRule→Requirement и BA states→SA enum→TL без вызова графа | reports/WP-11-rule-requirement-trace.md |
| 2026-11-02 14:49Z | WP-FRAMEWORK-01 | Продолжены предварительные BA и SA исследования без закрытия зависимости WP-01 | reports/WP-03-permission-planning-trace.md |
| 2026-11-02 14:48Z | WP-FRAMEWORK-01 | Согласованы source-level границы подобластей и сопоставлены новые находки с критериями механизмов | reports/WP-01-subarea-scope-decisions.md |
| 2026-11-02 14:46Z | WP-FRAMEWORK-01 | Добавлены и независимо сверены отдельные условия workflow, ship и release для gap crosswalk | reports/WP-01-gap-controls.md |
| 2026-11-02 14:44Z | WP-FRAMEWORK-01 | Сопоставлены дополнительные кандидаты с DEFER и независимо проверены контуры Docmost sync | reports/WP-01-docmost-sync-trace.md |
| 2026-11-02 14:41Z | WP-FRAMEWORK-01 | Уточнены потребители reopened/deploy/postmortem и состав tests/bench; correction reopened source outcome | reports/WP-01-consumer-gaps-trace.md |
| 2026-11-02 14:39Z | WP-FRAMEWORK-01 | Сверены покрытие подобластей и шесть полей 55 групп; уточнены исторические документы и риски альтернатив | reports/WP-01-mechanism-fields-audit.md |
| 2026-11-02 14:35Z | WP-FRAMEWORK-01 | Исследован путь подтверждения backup для migration и дополнительные атомы SA validation; независимая source-сверка выполнена | reports/WP-01-migration-backup-contract.md |
| 2026-11-02 14:33Z | WP-FRAMEWORK-01 | Разложены выборочные обязанности SA validation и graph backup/restore; независимые замечания учтены | reports/WP-01-graph095-atomic-sample.md |
| 2026-11-02 14:31Z | WP-FRAMEWORK-01 | Уточнены source-level recovery lock и QA-to-release evidence с независимой проверкой | reports/WP-01-qa-release-contract-trace.md |
| 2026-11-02 14:29Z | WP-FRAMEWORK-01 | Уточнены falsifier-матрицы и исследованы корневые документы, последовательность GOAL proof и recovery legacy migration | reports/WP-01-guides-setup-trace.md |
| 2026-11-02 14:25Z | WP-FRAMEWORK-01 | WP-01: независимый review уточнил evidence и recovery четырёх source-level стыков; positive/negative cases предложены без исполнения | reports/WP-01-ba-sa-static-chain.md; reports/WP-01-sa-tl-static-chain.md; reports/WP-01-quality-recovery-static-chains.md |
| 2026-11-02 14:25Z | WP-FRAMEWORK-01 | WP-01: подготовлены source-level примеры всех четырёх стыков с явными разрывами и неподтверждённым recovery | reports/WP-01-ba-sa-static-chain.md; reports/WP-01-sa-tl-static-chain.md; reports/WP-01-quality-recovery-static-chains.md |
| 2026-11-02 14:24Z | WP-FRAMEWORK-01 | WP-01: завершена выборочная парная сверка 21 overlay, добавлены условные BA→SA и SA→TL сквозные трассы | reports/WP-01-ba-sa-overlay-capabilities.md; reports/WP-01-ba-sa-static-chain.md; reports/WP-01-sa-tl-static-chain.md |
| 2026-11-02 14:20Z | WP-FRAMEWORK-01 | WP-01: выборочно сопоставлены девять TL overlay с root/Codex, client runtime и costs не установлены | reports/WP-01-tl-overlay-client-samples.md |
| 2026-11-02 14:19Z | WP-FRAMEWORK-01 | WP-01: уточнены 95% source consumers и BA/SA/core overlay границы; статические claims не приравнены к runtime | reports/WP-01-handoff-coverage-trace.md; reports/WP-01-ba-sa-overlay-capabilities.md; reports/WP-01-core-client-contracts.md |
| 2026-11-02 14:18Z | WP-FRAMEWORK-01 | WP-01: coverage arithmetic и board direction уточнены по независимому review, сводка ссылается на ограничения | reports/WP-01-handoff-coverage-trace.md; reports/WP-01-board-direction-trace.md; reports/WP-FRAMEWORK-01.md |
| 2026-11-02 14:17Z | WP-FRAMEWORK-01 | WP-01: прослежены graph↔board маршруты и BA→SA coverage формулы; математические случаи статические, graph не исполнялся | reports/WP-01-board-direction-trace.md; reports/WP-01-handoff-coverage-trace.md |
| 2026-11-02 14:15Z | WP-FRAMEWORK-01 | WP-01: проиндексированы ADR и methodology; отмечены исторические claims и source-level расхождения без runtime выводов | reports/WP-01-adr-methodology-inventory.md; reports/WP-01-docs-scope-inventory.md |
| 2026-11-02 14:14Z | WP-FRAMEWORK-01 | WP-01: независимый challenge сохранил статус PARTIAL; добавлен scope inventory docs и ссылка на 6-критериальную матрицу | reports/WP-FRAMEWORK-01.md; reports/WP-01-docs-scope-inventory.md; reports/WP-01-acceptance-matrix.md |
| 2026-11-02 14:13Z | WP-FRAMEWORK-01 | WP-01: обновлена сводка и исправлены source vs proposed outcomes в стыках и falsifiers; graph baseline отнесён к экспериментальным гейтам | reports/WP-FRAMEWORK-01.md; reports/WP-01-interface-chain-audit.md; reports/WP-01-acceptance-matrix.md |
| 2026-11-02 14:11Z | WP-FRAMEWORK-01 | WP-01: 57 falsifier строк нормализуются к 55/55 group IDs; источник/предложение и неисполненные проверки сохранены отдельно | reports/WP-01-acceptance-matrix.md; reports/WP-01-ba-falsifier-matrix.md; reports/WP-01-sa-falsifier-matrix.md; reports/WP-01-tl-falsifier-matrix-part1.md; reports/WP-01-tl-falsifier-matrix-part2.md |
| 2026-11-02 14:10Z | WP-FRAMEWORK-01 | WP-01: предложены falsifiers и условия DEFER для SA-02–09; BA матрица исправлена по независимому review | reports/WP-01-sa-falsifier-matrix.md; reports/WP-01-ba-falsifier-matrix.md |
| 2026-11-02 14:10Z | WP-FRAMEWORK-01 | WP-01: уточнены по review 07–10 и добавлены BA-01–09/SA-01 falsifiers; никакие negative cases не запускались | reports/WP-01-tl-falsifier-matrix-part2.md; reports/WP-01-ba-falsifier-matrix.md |
| 2026-11-02 14:08Z | WP-FRAMEWORK-01 | WP-01: добавлены falsifiers 07.3–10.4, включая отдельные migration/init/postmortem; ранее найдены source outcome уточнения | reports/WP-01-tl-falsifier-matrix-part1.md; reports/WP-01-tl-falsifier-matrix-part2.md |
| 2026-11-02 14:07Z | WP-FRAMEWORK-01 | WP-01: для групп TL 04.1–07.2 зафиксированы proposed falsifiers и границы source outcome; review продолжается | reports/WP-01-tl-falsifier-matrix-part1.md |
| 2026-11-02 14:05Z | WP-FRAMEWORK-01 | WP-01: уточнены scope falsifiers и независимая проверка non-package index; статус дерева и hashes сверены | reports/WP-01-falsifier-links.md; reports/WP-01-nonpackage-scope-index.md; reports/WP-01-baseline-candidates.md |
| 2026-11-02 14:05Z | WP-FRAMEWORK-01 | WP-01: индексированы области вне manifest, семь falsifiers связаны с evidence; проверены hashes draft и чистота Git-деревьев | reports/WP-01-nonpackage-scope-index.md; reports/WP-01-falsifier-links.md; reports/WP-01-baseline-candidates.md |
| 2026-11-02 14:03Z | WP-FRAMEWORK-01 | WP-01: independently checked 122 explicit source paths/ranges; уточнены XL и aliases, полная семантическая сверка не заявлена | reports/WP-01-mechanism-registry-ba-sa.md; reports/WP-01-platform-consumer-trace.md |
| 2026-11-02 14:02Z | WP-FRAMEWORK-01 | WP-01: развёрнуты пути root/Codex/package, исправлены scope QA и sidecar после проверки источников | reports/WP-01-mechanism-registry-ba-sa.md; reports/WP-01-mechanism-registry-tl-platform.md; reports/WP-01-platform-consumer-trace.md |
| 2026-11-02 14:00Z | WP-FRAMEWORK-01 | WP-01: подтверждена index-сверка 55 ID, уточнена трасса SA ValidationReport и исправлены неоднозначные source paths в реестрах | reports/WP-01-acceptance-matrix.md; reports/WP-01-sa-validation-report-trace.md; reports/WP-01-mechanism-registry-ba-sa.md; reports/WP-01-mechanism-registry-tl-platform.md |
| 2026-11-02 13:58Z | WP-FRAMEWORK-01 | WP-01: трассировка caller/authority/consumer дополнена группами 08.4–10.4; quality/delivery уточнены по независимой проверке | reports/WP-01-tl-consumer-trace-part2.md; reports/WP-01-platform-consumer-trace.md |
| 2026-11-02 13:57Z | WP-FRAMEWORK-01 | WP-01: продолжена трассировка TL 06.3–08.3; часть 04–06 уточнена по независимому challenge | reports/WP-01-tl-consumer-trace-part1.md; reports/WP-01-tl-consumer-trace-part2.md |
| 2026-11-02 13:56Z | WP-FRAMEWORK-01 | WP-01: уточнены source-level маршруты TL 04.1–06.2, SA trace дополнен расхождением ValidationReport | reports/WP-01-tl-consumer-trace-part1.md; reports/WP-01-sa-consumer-trace.md |
| 2026-11-02 13:55Z | WP-FRAMEWORK-01 | WP-01: уточнены заявленные callers, источники и consumers SA-01–09; BA trace скорректирован по независимому review | reports/WP-01-sa-consumer-trace.md; reports/WP-01-ba-consumer-trace.md |
| 2026-11-02 13:53Z | WP-FRAMEWORK-01 | WP-01: независимо проверены 55 групп и заполнены source-level caller/authority/consumer для BA-01–09 | reports/WP-01-group-card-audit.md; reports/WP-01-ba-consumer-trace.md |
| 2026-11-02 13:52Z | WP-FRAMEWORK-01 | WP-01: составлен семантический аудит 55 групп по обязательным полям; сохранены общие inherited DEFER и UNKNOWN | reports/WP-01-group-card-audit.md; spec/research-protocol.md |
| 2026-11-02 13:51Z | WP-FRAMEWORK-01 | WP-01: проверены границы четырёх стыковых цепочек и уточнён same-mutation evidence после независимого review | reports/WP-01-interface-chain-audit.md; reports/WP-01-risky-overlay-trace.md |
| 2026-11-02 13:50Z | WP-FRAMEWORK-01 | WP-01: завершена и частично перепроверена выборка 39 workflow; добавлен анализ трёх рискованных overlay | reports/WP-01-tl-other-root-codex-samples.md; reports/WP-01-risky-overlay-trace.md |
| 2026-11-02 13:49Z | WP-FRAMEWORK-01 | WP-01: завершена первая точечная source-level сверка всех 39 non-overlay workflows; полная semantic closure не заявлена | reports/WP-01-ba-root-codex-samples.md; reports/WP-01-sa-tl-root-codex-samples.md; reports/WP-01-tl-other-root-codex-samples.md |
| 2026-11-02 13:48Z | WP-FRAMEWORK-01 | WP-01: после независимой проверки уточнены BA контракты и добавлена выборка 7 SA и 8 TL root/Codex workflow | reports/WP-01-ba-root-codex-samples.md; reports/WP-01-sa-tl-root-codex-samples.md |
| 2026-11-02 13:47Z | WP-FRAMEWORK-01 | WP-01: 39 root/Codex hash пар независимо проверены; начата выборочная смысловая сверка 13 BA workflows | reports/WP-01-root-codex-hash-map.md; reports/WP-01-ba-root-codex-samples.md |
| 2026-11-02 13:46Z | WP-FRAMEWORK-01 | WP-01: исправлена интерпретация partial discovery после независимого review; дополнена карта 39 root/Codex hash | reports/WP-01-publish-render-trace.md; reports/WP-01-root-codex-hash-map.md; reports/WP-01-overlay-reasons.md |
| 2026-11-02 13:45Z | WP-FRAMEWORK-01 | WP-01: независимая проверка подтвердила 60/60 workflow SHA и 21 overlay; прослежен source-level маршрут publish/render | reports/WP-01-workflow-source-map.md; reports/WP-01-overlay-reasons.md; reports/WP-01-publish-render-trace.md |
| 2026-11-02 13:44Z | WP-FRAMEWORK-01 | WP-01: составлена source→generated карта 60 workflow и 21 overlay; уточнён oracle после независимого review | reports/WP-01-workflow-source-map.md; reports/WP-01-fr014-oracle-design.md |
| 2026-11-02 13:43Z | WP-FRAMEWORK-01 | WP-01: rubric уточнена после challenge без изменения D-4; подготовлен незамороженный oracle FR-014 | reports/WP-01-measurement-rubric-draft.md; reports/WP-01-fr014-oracle-design.md; reports/WP-01-baseline-candidates.md |
| 2026-11-02 13:41Z | WP-FRAMEWORK-01 | WP-01: уточнены draft criteria и rubric после challenge; единая пара D-4 не приравнивается к повторной серии, hashes обновлены | reports/WP-01-measurement-rubric-draft.md; reports/WP-01-briefs-draft.md; reports/WP-01-baseline-candidates.md |
| 2026-11-02 13:40Z | WP-FRAMEWORK-01 | WP-01: подготовлены матрицы всех шести кейсов; исправлен исторический hash recovery, уточнены границы 5xx и mock API | reports/WP-01-other-case-matrices.md; reports/WP-01-fr041-recovery-matrices.md; reports/WP-01-corpus-candidates.md |
| 2026-11-02 13:39Z | WP-FRAMEWORK-01 | WP-01: в общий draft FR-014 добавлен исторический AC-11, уточнены FR-029/BUG-1/FR-030; новый hash briefs зафиксирован | reports/WP-01-fr014-acceptance-matrix.md; reports/WP-01-other-case-matrices.md; reports/WP-01-baseline-candidates.md |
| 2026-11-02 13:37Z | WP-FRAMEWORK-01 | WP-01: уточнена готовность корпуса и подготовлена матрица 11 AC FR-014; hash изменённого черновика briefs сохранён отдельно | reports/WP-01-corpus-readiness.md; reports/WP-01-fr014-acceptance-matrix.md; reports/WP-01-baseline-candidates.md |
| 2026-11-02 13:36Z | WP-FRAMEWORK-01 | WP-01: независимая сверка уточнила ограничения CI; составлена матрица готовности шести кейсов без запуска A/B | reports/WP-01-ci-package-cards.md; reports/WP-01-corpus-readiness.md |
| 2026-11-02 13:35Z | WP-FRAMEWORK-01 | WP-01: уточнены graph backup/status и tracker по независимому review; добавлена карта CI и сборки | reports/WP-01-graph-extra-cards.md; reports/WP-01-analyst-tracker-cards.md; reports/WP-01-ci-package-cards.md |
| 2026-11-02 13:33Z | WP-FRAMEWORK-01 | WP-01: расширены graph-infra и analyst-tool/tracker карточки; уточнены migration контракты после независимой проверки | reports/WP-01-graph-extra-cards.md; reports/WP-01-analyst-tracker-cards.md; reports/WP-01-core-migration-cards.md |
| 2026-11-02 13:32Z | WP-FRAMEWORK-01 | WP-01: подготовлены карточки core/init/migration/publish и уточнён reconcile после challenge; graph 22/443 повторно timeout | reports/WP-01-core-migration-cards.md; reports/WP-01-tl-diagnose-card.md; TCP connect 4s |
| 2026-11-02 13:31Z | WP-FRAMEWORK-01 | WP-01: исследован TL diagnose/reconcile и остальные root/resource packages; оценка TL coverage исправлена после независимого review | reports/WP-01-tl-diagnose-card.md; reports/WP-01-tl-package-coverage.md; reports/WP-01-other-package-coverage.md |
| 2026-11-02 13:30Z | WP-FRAMEWORK-01 | WP-01: независимая сверка подтвердила 59 описаний index, выполнена package-level карта BA/SA/TL, выявлен отдельный пробел TL diagnose | reports/WP-01-package-index.md; reports/WP-01-ba-sa-package-coverage.md; reports/WP-01-tl-package-coverage.md |
| 2026-11-02 13:29Z | WP-FRAMEWORK-01 | WP-01: исправлены 59 отсутствовавших описаний package index; составлена package-level сверка BA/SA и сохранены ограничения покрытия | reports/WP-01-package-index.md; reports/WP-01-ba-sa-package-coverage.md; reports/WP-01-sa-projection-provenance.md |
| 2026-11-02 13:27Z | WP-FRAMEWORK-01 | WP-01: независимый review уточнил branch/exception условия и подготовлена матрица приёмки и provenance трёх SA файлов | reports/WP-01-acceptance-matrix.md; reports/WP-01-sa-projection-provenance.md; reports/WP-01-tl-platform-more-cards.md |
| 2026-11-02 13:25Z | WP-FRAMEWORK-01 | WP-01: подготовлены и частично перекрёстно проверены новые карточки, исследованы локальные кандидаты graph snapshot; ни pilot, ни restore не выполнялись | reports/WP-01-sa-gap-cards.md; reports/WP-01-tl-gap-cards.md; reports/WP-01-ba-more-gap-cards.md; reports/WP-01-local-graph-snapshots.md |
| 2026-11-02 13:23Z | WP-FRAMEWORK-01 | Переход на исправленный skill d778e85: явный research metadata для 18 WP; выбран auto, текущий coordinator привязан, watcher запущен и next вернул WP-01 | session discover; autonomy claim/enable/status; next --json; lint |
| 2026-11-02 13:22Z | — | continuation: auto | Владелец явно поручил автономное продолжение программы и подтвердил его в текущем чате |
| 2026-11-02 13:21Z | WP-FRAMEWORK-01 | WP-01: сверены root/Codex тексты QA aggregate и runtime contract; найдены текстовые расхождения без вывода о runtime | reports/WP-01-registry-gap-review.md |
| 2026-11-02 13:20Z | WP-FRAMEWORK-01 | WP-01: read-only сверка выявила дополнительные обязанности BA/SA и TL; часть источников проверена координатором | reports/WP-01-registry-gap-review.md |
| 2026-11-02 13:19Z | — | Независимый review уточнил ограничения synthetic pinch и риска ложных FAIL | reports/WP-16-fr014-browser-draft-check.md |
| 2026-11-02 13:18Z | — | Browser draft: повторный pinch различил синтетические control с ошибкой и без; физическое устройство и blind isolation не проверены | reports/WP-16-fr014-browser-draft-check.md |
| 2026-11-02 13:14Z | — | Browser draft: синтетический CDP pinch различил control без touch и control с touch; физическое устройство и full pinch не проверены | reports/WP-16-fr014-browser-draft-check.md |
| 2026-11-02 13:12Z | WP-FRAMEWORK-01 | WP-01: сводка обновлена фактическими локальными проверками и бюджетом D-4, без заявлений об A/B | reports/WP-FRAMEWORK-01.md; WP-16 и WP-09 evidence |
| 2026-11-02 13:12Z | — | WP-16: отмечена наблюдаемая модель и условный расчёт Standard credits по официальной таблице; billing route неизвестен | reports/WP-16-budget-observation.md; thread/read; OpenAI Docs |
| 2026-11-02 13:11Z | — | Browser draft: synthetic визуальный negative control непрозрачного overlay получил UNRESOLVED; покрытие ограничено fixture | reports/WP-16-fr014-browser-draft-check.md |
| 2026-11-02 13:10Z | — | Волна 0 отражает начатый WP-01; гейт остаётся открытым | status.md: WP-FRAMEWORK-01 IN_PROGRESS |
| 2026-11-02 13:10Z | — | Browser draft: 8/8 на synthetic control v8 при сетевом sandbox frontend и Chromium; A/B не запущен | reports/WP-16-fr014-browser-draft-check.md; control-browser-network-sandbox.log |
| 2026-11-02 13:09Z | — | FR-014: историческая frontend suite 16 файлов/109 тестов прошла в изолированной копии с запрещённой исходящей сетью | reports/WP-16-fr014-env-check.md; sandboxed Vitest run |
| 2026-11-02 13:09Z | — | FR-014: отдельный frontend type-check на baseline+shared и черновых тестах прошёл; build не проверялся | reports/WP-16-fr014-env-check.md; npm run type-check -- --pretty false --incremental false |
| 2026-11-02 13:08Z | — | Browser draft: negative control не восстановленного scroll lock корректно дал FAIL | reports/WP-16-fr014-browser-draft-check.md |
| 2026-11-02 13:08Z | — | WP-16: локальный API вернул threadUsage null; суммарный остаток и hard-stop для пилота не подтверждены | reports/WP-16-budget-observation.md; local app-server schema/account usage |
| 2026-11-02 13:07Z | — | Browser draft: negative controls сломанного изображения и прозрачного overlay, полная матрица ещё не выполнена | reports/WP-16-fr014-browser-draft-check.md |
| 2026-11-02 13:06Z | — | Review: enhancing hit target уточнён; текущий runtime не скрывает evaluator; полный blind pilot не готов | reports/WP-16-fr014-browser-draft-check.md; independent reviewer |
| 2026-11-02 13:04Z | — | WP-16: synthetic path-isolation probe выявил canonical-path и pre-existing hardlink обход; blind isolation не доказана | reports/WP-16-file-isolation-probe.md |
| 2026-11-02 13:04Z | — | WP-16: проверена дополнительная OS network policy на loopback redirect и временном Next/Chromium; blind isolation не доказана | reports/WP-16-network-sandbox-probe.md |
| 2026-11-02 13:02Z | — | Browser draft: проверены eight cases на baseline и synthetic v8, ограничения oracle и redirect сохранены | reports/WP-16-fr014-browser-draft-check.md |
| 2026-11-02 13:00Z | — | Проверен redirect escape локально: Playwright route увидел только исходный запрос; egress guard не принят | reports/WP-16-fr014-browser-preflight.md; две loopback HTTP службы, destinationHits=1 |
| 2026-11-02 12:59Z | — | Browser draft: background/scroll и synthetic portal control; один затянувшийся run остановлен и не засчитан | reports/WP-16-fr014-browser-draft-check.md |
| 2026-11-02 12:55Z | — | Browser draft: wheel zoom negative/positive synthetic controls, выявлена зависимость от scroll lock; touch не проверялся | reports/WP-16-fr014-browser-draft-check.md |
| 2026-11-02 12:53Z | — | Browser draft v5: проверены delayed close/src и status precondition на baseline/control; полный oracle не готов | reports/WP-16-fr014-browser-draft-check.md |
| 2026-11-02 12:51Z | — | Создан рабочий реестр кандидатов синтеза; WP-18 не принят и реализация не разрешена | reports/WP-18-synthesis-in-progress.md |
| 2026-11-02 12:51Z | — | Browser draft v4: неоднозначные setup/network/pageerror классифицируются UNRESOLVED; injected case проверен | reports/WP-16-fr014-browser-draft-check.md |
| 2026-11-02 12:50Z | — | Browser draft v3: injected чужой origin даёт INVALID_HARNESS; оставлены открытыми timing и проверка состояния enhancing | reports/WP-16-fr014-browser-draft-check.md |
| 2026-11-02 12:49Z | — | FR-014: 5 browser draft cases проверены на историческом baseline и synthetic v4 control; полный harness не готов | reports/WP-16-fr014-browser-draft-check.md |
| 2026-11-02 12:45Z | — | FR-014: черновой v3 из 6 jsdom проверок показал частичный baseline RED и synthetic stub 6/6; полноценная приёмка не готова | reports/WP-16-fr014-draft-test-check.md |
| 2026-11-02 12:43Z | — | Challenge пилота: добавлены контроль порядка и caches; один pair не оценивает эффект порядка | reports/WP-16-pilot-plan-draft.md |
| 2026-11-02 12:43Z | — | Browser preflight: исправлен origin routing, блокированы service workers, проверены пять отрицательных URL; окно и server egress ограничены | reports/WP-16-fr014-browser-preflight.md |
| 2026-11-02 12:42Z | — | Обновлена хронология blind design после появления предварительных fixtures и узких тестов | reports/WP-16-fr014-blind-design.md |
| 2026-11-02 12:41Z | — | FR-014: browser preflight повторён из захэшированного временного runner; сервер остановлен | reports/WP-16-fr014-browser-preflight.md |
| 2026-11-02 12:40Z | — | FR-014: v2 draft oracle отклоняет пустой dialog и проходит на stub с изображением; полный harness не готов | reports/WP-16-fr014-draft-test-check.md |
| 2026-11-02 12:40Z | — | Challenge пилота: уточнена классификация при недоказанной blind isolation | reports/WP-16-pilot-plan-draft.md |
| 2026-11-02 12:39Z | — | Challenge бюджета D-4: исходное распределение не оставляло резерва, требуется учёт подготовки и подтверждённый остаток | reports/WP-16-pilot-plan-draft.md |
| 2026-11-02 12:39Z | — | Challenge пилота: нынешний graph не принят как исторический baseline без доказанной реконструкции | reports/WP-16-pilot-plan-draft.md; baseline CLAUDE.md; historical Git |
| 2026-11-02 12:39Z | — | Исправлены две правки challenge после первой попытки safe_edit: уточнены smoke и пустой dialog как контрпример | reports/WP-16-pilot-plan-draft.md; reports/WP-16-fr014-draft-test-check.md |
| 2026-11-02 12:39Z | — | Challenge пилота: уточнена проверенная часть окружения; пустой dialog доказал неполноту чернового oracle | reports/WP-16-pilot-plan-draft.md; reports/WP-16-fr014-draft-test-check.md |
| 2026-11-02 12:38Z | — | FR-014: browser preflight upload route с синтетическими API прошёл; A/B и user acceptance не выполнялись | reports/WP-16-fr014-browser-preflight.md |
| 2026-11-02 12:37Z | — | FR-014: временный Next server и headless Chromium открыли стартовую страницу; сервер остановлен | reports/WP-16-fr014-env-check.md; loopback HTTP 200 |
| 2026-11-02 12:36Z | — | FR-014: черновой jsdom тест дал baseline RED и прошёл на минимальном контрольном stub; полный harness и A/B не выполнены | reports/WP-16-fr014-draft-test-check.md |
| 2026-11-02 12:35Z | — | FR-014: установлены зависимости в отдельной временной frontend копии, smoke unit test 6/6; A/B не запускался | reports/WP-16-fr014-env-check.md; npm ci --ignore-scripts; npm test -- src/test/tokens.test.ts |
| 2026-11-02 12:33Z | — | Уточнена точка входа FR-014 и необходимость browser harness; RED/GREEN не выполнялись | reports/WP-16-fr014-blind-design.md; ограниченное чтение baseline |
| 2026-11-02 12:33Z | WP-FRAMEWORK-01 | WP-01: реестры групп механизмов включены в сводный отчёт; полнота не заявлена | reports/WP-FRAMEWORK-01.md; mechanism registries |
| 2026-11-02 12:32Z | WP-FRAMEWORK-01 | WP-01: подготовлен реестр групп TL/platform с источниками, альтернативами и отрицательными случаями | reports/WP-01-mechanism-registry-tl-platform.md |
| 2026-11-02 12:32Z | — | D-4 recorded | Прямое подтверждение владельца в чате 2026-11-02 |
| 2026-11-02 12:31Z | — | Подготовлен независимый blind design критериев FR-014, без исполнения и без доступа автора к истории | reports/WP-16-fr014-blind-design.md; brief-only subagent |
| 2026-11-02 12:30Z | WP-FRAMEWORK-01 | WP-01: подготовлен реестр групп механизмов BA и SA с отрицательными случаями | reports/WP-01-mechanism-registry-ba-sa.md |
| 2026-11-02 12:29Z | — | WP-06: engine mock path повторён на временной копии; первая попытка исследователя вне disposable отмечена | reports/WP-06-engine-mock-probe.md |
| 2026-11-02 12:29Z | WP-FRAMEWORK-01 | Проверена среда: текущий Docker socket отсутствует; graph TCP 22/443 timeout, причины неизвестны | reports/WP-01-test-environment.md; docker version; TCP connect |
| 2026-11-02 12:27Z | — | Challenge BA→SA: добавлен negative case дублированных edges и пустых категорий | reports/WP-11-preliminary.md; graph-infra/queries/handoff-queries.cypher:55–79 |
| 2026-11-02 12:27Z | — | Предварительный peer challenge зафиксирован; независимая приёмка WP-17 не выполнена | reports/WP-17-challenge-in-progress.md |
| 2026-11-02 12:27Z | — | Challenge Harness: роль сабагента не доказывает отдельную sandbox границу | reports/WP-15-preliminary.md; официальная документация Codex subagents |
| 2026-11-02 12:27Z | — | WP-16: подготовлен конкретный план одного парного пилота, лимит владельца запрошен | reports/WP-16-pilot-plan-draft.md |
| 2026-11-02 12:26Z | — | Challenge: уточнены порядок Codex lifecycle и границы выполненного runtime probe | reports/WP-10-preliminary.md; reports/WP-13-preliminary.md |
| 2026-11-02 12:26Z | — | Challenge BA: уточнено различие отсутствия graph writes и допуска записи snapshot/report | reports/WP-02-preliminary.md; ba-codex-contract и analyze SKILL |
| 2026-11-02 12:26Z | — | Challenge oracle: пересчитаны 45 принятых wave-plan, нарушений набора задач в сохранённых строках нет | reports/WP-16-preliminary.md; tierA-n20.json read-only recount |
| 2026-11-02 12:26Z | — | Challenge WP-16: проверены неполные инварианты oracle wave-plan; сохранённые результаты не пересчитывались | reports/WP-16-preliminary.md; ab.mjs:73–82,113 |
| 2026-11-02 12:25Z | — | Предварительное challenge: исправлены ссылка Codex review и условие HAS_STEP в SA replay | reports/WP-06-preliminary.md; reports/WP-03-preliminary.md |
| 2026-11-02 12:25Z | — | Подготовлена матрица официальных возможностей Harness с границами гарантий | reports/WP-15-preliminary.md; официальная документация Codex и Claude Code, 2026-11-02 |
| 2026-11-02 12:24Z | — | WP-16: исследовано происхождение оценок и обнаружена несопоставимость входов wave-plan A/B | reports/WP-16-preliminary.md; bench/skill-tools/ab/ab.mjs:32–40,58–63,101–106 |
| 2026-11-02 12:24Z | — | Два probe повторены на отдельном временном Git archive: 16/16 model tests и тот же sanitizer result; отдельного network sandbox не было | reports/WP-06-sanitize-probe.md; reports/WP-09-concurrency-model-test.md |
| 2026-11-02 12:23Z | — | Зафиксировано нарушение исследовательского протокола: два локальных probe выполнены из основного checkout, требуется повтор в disposable sandbox | reports/WP-06-sanitize-probe.md; reports/WP-09-concurrency-model-test.md |
| 2026-11-02 12:23Z | — | WP-09: 16/16 локальных model tests конкурентности; live graph не проверялся | reports/WP-09-concurrency-model-test.md; node --test tests/codex-plugin/scripts/nacl-concurrency-model.test.mjs |
| 2026-11-02 12:23Z | — | Подготовлено исследование стыка состояния и восстановления | reports/WP-14-preliminary.md |
| 2026-11-02 12:22Z | — | Подготовлено исследование стыка SA→TL→dev; зависимости открыты | reports/WP-12-preliminary.md |
| 2026-11-02 12:22Z | — | WP-10: проверены дополнительные файлы в installed cache; происхождение неизвестно | reports/WP-10-preliminary.md; read-only inventory |
| 2026-11-02 12:22Z | — | Подготовлены сквозные исследования BA→SA и dev→QA→release; зависимости открыты | reports/WP-11-preliminary.md; reports/WP-13-preliminary.md |
| 2026-11-02 12:21Z | — | Подготовлено исследование упаковки, provenance и границ transport; зафиксировано расхождение 1 payload файла | reports/WP-10-preliminary.md; installed release-manifest и SHA-256 |
| 2026-11-02 12:20Z | — | Уточнён source commit установленного Skills-only и совпадение relevant builder/contract blobs | reports/WP-01-skills-only-canary.md; installed release-manifest; git ancestry |
| 2026-11-02 12:20Z | — | Подготовлено read-only исследование graph identity, dual-write и backup | reports/WP-09-preliminary.md |
| 2026-11-02 12:19Z | WP-FRAMEWORK-01 | Исправлен путь backup-contract в оценке graph baseline | reports/WP-01-graph-baseline-risks.md |
| 2026-11-02 12:19Z | — | Подготовлено read-only исследование управления и восстановления | reports/WP-08-preliminary.md |
| 2026-11-02 12:19Z | — | Подготовлено read-only исследование delivery и publication; WP-01 открыт | reports/WP-07-preliminary.md |
| 2026-11-02 12:18Z | — | Предварительный WP-06: повторён in-memory probe sanitizeChanges; full gateway/release не проверялся | reports/WP-06-sanitize-probe.md |
| 2026-11-02 12:18Z | — | Подготовлено read-only исследование TL planning и управления; WP-01 открыт | reports/WP-04-preliminary.md |
| 2026-11-02 12:18Z | — | Подготовлено read-only исследование review и QA; WP-01 не закрыт | reports/WP-06-preliminary.md |
| 2026-11-02 12:17Z | — | Подготовлено read-only исследование разработки и фиксов; dependency WP-01 открыта | reports/WP-05-preliminary.md |
| 2026-11-02 12:17Z | WP-FRAMEWORK-01 | WP-01: собран сводный частичный отчёт; графовый baseline и часть критериев остаются открытыми | reports/WP-FRAMEWORK-01.md |
| 2026-11-02 12:16Z | — | Подготовлены предварительные read-only отчёты BA и SA; зависимость WP-01 не закрыта | reports/WP-02-preliminary.md; reports/WP-03-preliminary.md |
| 2026-11-02 12:16Z | WP-FRAMEWORK-01 | WP-01: создан манифест Git-кандидатов и hash черновиков; graph baseline NOT_VERIFIED | reports/WP-01-baseline-candidates.md; git ancestry/tree; TCP timeout |
| 2026-11-02 12:15Z | WP-FRAMEWORK-01 | WP-01: построен проверяемый индекс 61 package и назначений по путям | reports/WP-01-package-index.md; scripts/codex-plugin-manifest.json |
| 2026-11-02 12:15Z | WP-FRAMEWORK-01 | WP-01: убрана преждевременная формулировка о дневном периоде общей квоты | reports/WP-01-briefs-draft.md; independent review |
| 2026-11-02 12:15Z | WP-FRAMEWORK-01 | WP-01: уточнено различие локального import и непроверенной серверной копии; DNS графа отвечает, TCP 443 timeout | reports/WP-01-graph-baseline-risks.md; socket connect timeout 4s |
| 2026-11-02 12:14Z | WP-FRAMEWORK-01 | WP-01: инвентаризированы CI, graph-infra, analyst-tool и tracker CLI; отмечены кандидаты negative cases | reports/WP-01-platform-inventory.md |
| 2026-11-02 12:13Z | WP-FRAMEWORK-01 | WP-01: подготовлен проект семантического graph fingerprint и определены его ограничения | reports/WP-01-graph-baseline-risks.md |
| 2026-11-02 12:13Z | WP-FRAMEWORK-01 | WP-01: выявлены ограничения полного graph import, согласованности snapshot и области task lock | reports/WP-01-graph-baseline-risks.md |
| 2026-11-02 12:12Z | WP-FRAMEWORK-01 | WP-01: уточнён scope WP-10: CI и tracker CLI включены; вложенный приватный meta исключён из SHA NaCl | WP-10; git ls-files meta; reports/WP-01-coverage-check.md |
| 2026-11-02 12:12Z | WP-FRAMEWORK-01 | WP-01: описаны нейтральные варианты сравнения при расхождении OTP и тарифов | reports/WP-01-corpus-conflicts.md |
| 2026-11-02 12:12Z | WP-FRAMEWORK-01 | WP-01: уточнены пути runtime для WP-14 и ответственность за sync evidence в WP-08 | reports/WP-01-coverage-check.md; WP-08 и WP-14 |
| 2026-11-02 12:12Z | WP-FRAMEWORK-01 | WP-01: проверено назначение 61 package и выделен вопрос владельца sync evidence внутри плана | reports/WP-01-coverage-check.md |
| 2026-11-02 12:11Z | WP-FRAMEWORK-01 | WP-01: проверено происхождение требований FR-030/041 и recovery fixture | reports/WP-01-briefs-draft.md; historical git snapshots |
| 2026-11-02 12:11Z | WP-FRAMEWORK-01 | WP-01: уточнены исходные UC и конфликты требований по OTP и квотам; критерии не заморожены | reports/WP-01-briefs-draft.md; baseline UC020, UC030, subscription.service.ts |
| 2026-11-02 12:11Z | WP-FRAMEWORK-01 | WP-01: подтверждено текстовое противоречие read canary в установленном Skills-only; live поведение не проверено | reports/WP-01-skills-only-canary.md |
| 2026-11-02 12:10Z | WP-FRAMEWORK-01 | Уточнено наблюдение обычной автономии: websocket доступен; cwd текущего потока не соответствует координатору; claim не выполнялся | reports/autonomy-observation-2026-11-02.md |
| 2026-11-02 12:10Z | WP-FRAMEWORK-01 | WP-01: черновые одинаковые brief и acceptance для шести кейсов; уточнено преобразование Skills-only | reports/WP-01-briefs-draft.md; scripts/build-codex-skills-only.mjs:179–186 |
| 2026-11-02 12:09Z | WP-FRAMEWORK-01 | WP-01: дополнены механизмы графовой координации и проверяемая гипотеза по Skills-only | reports/WP-01-additional-mechanisms.md |
| 2026-11-02 12:09Z | WP-FRAMEWORK-01 | WP-01: подготовлен черновик rubric; graph MCP initialize завершился timeout | reports/WP-01-measurement-rubric-draft.md; read-only MCP initialize timeout 12s |
| 2026-11-02 12:02Z | WP-FRAMEWORK-01 | WP-01: зафиксированы первые карточки механизмов и различие продуктовых контуров | reports/WP-01-mechanism-samples.md |
| 2026-11-02 12:01Z | WP-FRAMEWORK-01 | WP-01: определены кандидаты pre-change и post-change тестов; корпус не заморожен | reports/WP-01-corpus-candidates.md; read-only git history |
| 2026-11-02 12:01Z | WP-FRAMEWORK-01 | Коррекция: прежний вывод о недоступности обычной автономии не был подтверждён. session discover: App Server timeout: initialize; capabilities сообщает наличие queue и app_server. Проверка подключения остаётся открытой. | orch.py session discover; orch.py session capabilities |
| 2026-11-02 11:50Z | WP-FRAMEWORK-01 | WP-01: промежуточная карта и кандидаты корпуса; автономия недоступна в текущем runtime | reports/WP-FRAMEWORK-01-progress.md; autonomy status; private-owner.md |
| 2026-11-02 11:48Z | WP-FRAMEWORK-01 | WP-FRAMEWORK-01: DRAFT -> IN_PROGRESS | Владелец поручил начать исследование; запущен read-only исследователь inventory. |
| 2026-11-02 11:45Z | — | D-3: family-cinema выбран тестовым полигоном; разрешены необходимые операции с его графом. Обновлены PLAN, WP-01/16 и протокол baseline/reset. Проверены локальные инструкции/config; runtime-доступ и эксперименты не запускались. | decisions.md; spec/family-cinema-testbed.md |
| 2026-11-02 11:43Z | — | D-3 recorded | Прямое указание владельца: использовать family-cinema и выполнять необходимые операции с его графом, 2026-11-02 |
| 2026-11-02 11:39Z | — | План прошёл независимый review; уточнены BE/FE, recovery, зависимости и изоляция экспериментов. | reports/plan-review.md |
| 2026-11-02 11:37Z | — | Plan: подготовлены 18 DRAFT исследовательских пакетов, протокол, карта волн и критерии; исходники NaCl не изменены; dispatch не выполнялся. | PLAN.md; spec/research-protocol.md; reports/planning-evidence.md; work-packages/ |
| 2026-11-02 11:37Z | WP-FRAMEWORK-18 | WP-FRAMEWORK-18 created (DRAFT) | work-packages/WP-FRAMEWORK-18-recommendations.md |
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
