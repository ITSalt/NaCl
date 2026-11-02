# WP-01: проверка пробелов реестров

Read-only сверка двух исследователей со снимком NaCl 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Это дополнительные кандидаты для инвентаризации, не полный аудит и не измеренное runtime-поведение. Координатор отдельно сверил runtime contract, behavior slices, QA stages и external-contract gate по указанным источникам. Частота и цена неизвестны; альтернативы требуют отрицательных и положительных тестов.

## BA и SA: root contracts

- Runtime contract очередей и долгих операций: FSM, границы транзакций, блокировки, retry, races, recovery и идемпотентность. Возможные downstream потребители TL требуют отдельной проверки; тестировать crash/restart и cancel-vs-fail. Heuristic Q1–Q5 требует подтверждения. Источник nacl-sa-uc/SKILL.md:803–850.
- UI state-machine: состояния, переходы и эффекты, scoped validation и признак устаревания; потребитель SA validation и TL replan. Проверять dead-end и неоднозначные переходы. Источники nacl-sa-ui/SKILL.md:824–850,1133–1162; nacl-sa-validate/SKILL.md:1330–1336,1462–1496.
- Behavior slices и impact links: статическая связность не доказывает исполнение тестов. Проверять существующую связь при неисполненном тесте и opt-in пустой слой. Источники nacl-sa-uc/SKILL.md:1116–1124; nacl-sa-validate/SKILL.md:1587–1595,1659–1662.
- Error taxonomy и resilience: разделение общих и UC-scoped объектов, владельцы и cache policy; проверять stale cache и fallback. Пустой opt-in слой не доказывает покрытие. Источники nacl-sa-uc/SKILL.md:1374–1402,1625–1633; nacl-sa-validate/SKILL.md:1757–1765,1963–1971.
- Provenance структурных FR: Decision и rationale, потребитель L9/audit. Проверять orphan FR и применимые исключения. Источники nacl-sa-feature/SKILL.md:807–817; nacl-sa-validate/SKILL.md:1247–1292.
- Board snapshot/diff и idempotent sync: удалённые и изменённые элементы, повтор записи и crash после записи; для проверки recovery предложены стабильные идентификаторы и before/after; фактическое восстановление не подтверждено. Источники nacl-ba-analyze/SKILL.md:230–250,287–318; nacl-ba-sync/SKILL.md:832–864.
- Lifecycle и CRUD: подтверждённые переходы и сохранение SA-связей при обновлении handoff; предлагаемый negative test: изменение смысла без смены ID; автоматическая semantic invalidation не подтверждена. Источники nacl-ba-entities/SKILL.md:442–474,527–535; nacl-ba-handoff/SKILL.md:497–517.

Workflow задаёт ограничения числа шагов и ветвей, одного исполнителя и документооборота; проверять семантическую эквивалентность разбиения и стоимость. Эти пределы не являются измеренным оптимумом. Источник nacl-ba-workflow/SKILL.md:513–555.

## TL и platform: root и Codex projections

- TL plan должен учитывать external-contract artifact от SA architect и отказ при отсутствующих или пустых разделах; graph-complete и file-only различаются. Источник codex-plugin-src/workflow-overlays/nacl-tl-plan/SKILL.md:21–30,35–40,52–59.
- BE/FE development передаёт downstream result и evidence о baseline/RED, проверке ожидаемой причины RED и regression test; одно свидетельство общего теста не эквивалентно контракту. Источники skills-for-codex/nacl-tl-dev-be/SKILL.md:21–39,58–77,84–92; skills-for-codex/nacl-tl-dev-fe/SKILL.md:21–41,57–73,96–110.
- QA имеет шесть стадий, отдельные статусы и матрицу criterion→stage→status; неохваченный тестируемый через UI criterion влечёт UNVERIFIED. Источник skills-for-codex/nacl-tl-qa/SKILL.md:17–31,33–61,132–152. Отдельно проверять влияние mandatory NOT_RUN на агрегат.
- Sync требует сопоставления FE call-site с BE route, определённых форм evidence и условий исключений. Источник skills-for-codex/nacl-tl-sync/SKILL.md:19–30,40–85.
- Ship включает branch/base guard, tests до push и downstream tracker; exact-SHA attestation само по себе не замещает эти обязанности. Источник nacl-tl-ship/SKILL.md:47–73.
- Release имеет strict-only exceptions и разные блокировки skipped PR/CI и drift/repair. Источник nacl-tl-release/SKILL.md:143–153,162–174.

Дополнительная сверка QA: буквальная формула root nacl-tl-qa/SKILL.md:73–85 и repo Codex skills-for-codex/nacl-tl-qa/SKILL.md:36–48 одинакова: обязательный NOT_RUN без исключения присваивает aggregate UNVERIFIED даже при FAILED или BLOCKED другой стадии. Таблица root :654–668 одновременно описывает FAILED при наличии любой FAILED стадии; это текстовое противоречие, не установленное runtime-поведение. Индивидуальные статусы сохраняются по контракту.

Дополнительная сверка runtime contract: root nacl-sa-uc/SKILL.md:812–850 и repo Codex skills-for-codex/nacl-sa-uc/SKILL.md:333–366 описывают те же пять эвристик и требуют подтверждения перед блокировкой. В Q5 root учитывает имя или описание зависимого UC, projection упоминает имя; root явно записывает not_required при необязательности, в projection SKILL эта строка не найдена. Ссылочный Cypher, установленная сборка и runtime не проверены.

Root, overlay и установленная проекция не взаимозаменяемы; соответствие остальных ссылок, поведение и альтернативы нужно проверить до решения об изменении методологии. Реестры остаются предварительными, WP-01 не принят.
