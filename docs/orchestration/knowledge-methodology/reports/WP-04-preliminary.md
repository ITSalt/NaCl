# WP-04: предварительное исследование управления разработкой

Предисследование до приёмки WP-01. NaCl SHA `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; все выводы из статического чтения. Реальные counts, задержки и стоимость неизвестны, рекомендации DEFER до проверки.

| Механизм | Контракт | Вариант упрощения / риск |
|---|---|---|
| Intake | `codex-plugin-src/workflow-overlays/nacl-tl-intake/SKILL.md:14–50`: классификация атомов, граф/код, подтверждённый scope | Один typed intake с bounded probe; риск незаметно расширить объём или неверно маршрутизировать дефект. |
| Plan | `codex-plugin-src/workflow-overlays/nacl-tl-plan/SKILL.md:19–33,121–148`: SA scope→waves/tasks/API и read-back; version drift/stale | Общий версионированный snapshot и выборочная инвалидация; риск устаревших зависимостей и потери evidence done задач. Root `nacl-tl-plan/SKILL.md:100–110` описывает per-UC context, но фактические вызовы не измерены. |
| Next | `codex-plugin-src/workflow-overlays/nacl-tl-next/SKILL.md:15–50`: выбор по dependency/wave, remote claim-first, lease/fence | Упростить UI выбора можно только сохранив атомарность и недоступность stale cache; Skills-only преобразование и возможный пробел операций требуют WP-10. |
| Full | `codex-plugin-src/workflow-overlays/nacl-tl-full/SKILL.md:73–83,134–209,319–345`: UC фазы и проверка результата перед продвижением | Объединить исполнительские слои при наличии доказанной isolation/idempotency; риск потери recoverability и независимой проверки. Root иллюстрация `nacl-tl-full/SKILL.md:107–141` про 80 агентов не является замером или обязательной структурой Codex. |
| Conductor | `codex-plugin-src/workflow-overlays/nacl-tl-conductor/SKILL.md:79–165`: сверка graph/status/conductor/changelog/release/exceptions | Один typed event log мог бы сократить ручную reconciliation, но требует проверки независимых источников фактов и частичного отказа. |
| TL contract | `skills-for-codex/nacl-tl-core/references/tl-codex-contract.md:7–28,30–81`: закрытые статусы, graph priority, mutation/read-back | Нельзя превращать локальный fallback в доказательство graph state. |

Negative case: `nacl-tl-conductor` overlay :156–165 задаёт P-S4/P-S5 по статусам локальных файлов и Task, тогда как пример :177–180 утверждает обнаружение красного CI. `tests/fixtures/drift-broken/README.md:18–19,31,44–45` вызывает FAIL через несовпадающие статусы, а не чтение CI. Проверить согласованные terminal statuses + failing CI; это различие текста и предикатов, не доказанный дефект всего pipeline.

Installed Skills-only 0.2.2 plan/conductor содержат формулировки о BLOCKED при отсутствии pilot named reads, в то время как runtime описывает project-local MCP. Эквивалентность query и приоритет не проверены. Убирать external-contract/evidence gates без проверки нельзя. Для WP-12/15/16 нужны trace, фактические Harness capabilities, version/freshness и negative cases; WP-01 и WP-04 не приняты.
