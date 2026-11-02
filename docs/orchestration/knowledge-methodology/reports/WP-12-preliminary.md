# WP-12: предварительное исследование SA → TL → разработка

[Requirement anchors → TL](WP-12-requirement-anchor-trace.md) различает полные nodes и отсутствующие в указанном query edges.

[Контур BA states → enum → TL artifacts](WP-12-enum-interface-trace.md) описывает неоднозначности и границы query без утверждения runtime-дефекта.

Предисследование до приёмки WP-03/04/05. NaCl SHA `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; workflow, граф и тесты не запускались. Цена и частота unknown, категория DEFER.

Заявленная цепочка: SA graph UC/Requirement/slices → readiness (`skills-for-codex/nacl-sa-finalize/SKILL.md:23–36,42–59`) → TL planner, Task/Wave и `UseCase-[:GENERATES]->Task`, self-contained task-be/task-fe/acceptance/api-contract/test-spec (`nacl-tl-plan/SKILL.md:905–982,1028–1042`) → BE/FE dev → sync и wire evidence (`skills-for-codex/nacl-tl-sync/SKILL.md:19–80`). Slice→Task `VERIFIED_BY` — traceability, не доказательство выполнения теста. Graph write требует подтверждения и read-back.

Root планер описывает `Requirement` через `type` (`nacl-tl-plan/SKILL.md:961–968`), тогда как SA contract использует `rq_type` и `REALIZED_BY` (`skills-for-codex/nacl-sa-uc/SKILL.md:65–73,276–282`). Отсутствие этих слов в карте TL не доказывает потерю данных. Negative fixture: два требования с одинаковым текстом и разными class/anchor; сравнить graph→acceptance→test-spec→проверка, включая legacy.

Планер создаёт API contract до FE; root BE `nacl-tl-dev-be/SKILL.md:100–114,503–509` допускает warn+proceed по brief при отсутствии, Codex FE `skills-for-codex/nacl-tl-dev-fe/SKILL.md:43–55` требует BLOCKED. Это разные роли и клиенты, не корректное доказательство симметричного client drift. Проверить явную policy при отсутствии общего контракта, фактические URL/method/body и отсутствие ложного VERIFIED.

Fixture `tests/fixtures/project-alpha-snapshot/.tl/tasks/UC-112/task-be.md:8–12,14–50` реконструирована после исправления no-op retry и содержит решение; использовать как отрицательный кейс переноса runtime contract/recovery, не как независимое исходное задание. Проверять state transitions/idempotency и конкретные тесты, а не только наличие функции.

В обратном направлении изменение спецификации должно привести к точечному stale/provenance, replan и повторной проверке потребителей; это сквозной тест WP-14. Гипотеза DEFER: versioned snapshot + структурированный delta и один API artifact; риск stale snapshot, потери anchors и ложной равнозначности fixture и live provider. Потребители и инвалидация требуют исполнения до рекомендаций.
