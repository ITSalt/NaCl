# Актуализация знаний и упрощение методологии — статус

Единственный источник состояния программы `knowledge-methodology`. Пишет только оркестратор —
через `orch.py` и точечные правки, после каждого изменения состояния.

## Волны

| Волна | Цель | Гейт | Статус |
|-------|------|------|--------|
| 0 | Карта и протокол | WP-01 | PLANNED |
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
