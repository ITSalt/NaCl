# WP-01: gap review → кандидаты

Сверены 14 основных элементов [gap review](WP-01-registry-gap-review.md): 7 BA/SA bullets, один абзац workflow и 6 TL bullets. В каждом найдено хотя бы тематическое соответствие DEFER; По узкому критерию тематического ядра 11 из 14 имеют отдельную карточку или групповой контрпример, 3 сопоставлены только частично; более строгий критерий может увеличить число частичных, в частности для lifecycle/handoff. Это не полная проверка каждой гарантии, и не утверждение, что недостающие случаи отсутствуют во всём workspace.

| Gap | Соответствие и существенная граница |
|---|---|
| Runtime contract | SA-GAP-01, projection provenance: model/race/recovery; installed route и TL consumer UNKNOWN |
| UI state machine | SA-GAP-02, SA-06/L10: reachability/determinism; equivalence всех queries UNKNOWN |
| Behavior slices | SA-GAP-03, SA-06/L11: anchors и evidence; VERIFIED_BY не доказывает исполнение |
| Error/resilience | SA-GAP-04, SA-06/L12–13: ownership/channel/cache/fallback; empty opt-in не coverage |
| FR provenance | SA-06/L9: rationale/JUSTIFIES/exemptions; связь конкретного writer с L9 отдельно UNKNOWN |
| Board snapshot/diff/sync | BA-06/07, 09.2: provenance, ID/readback и crash/replay; один случай не покрывает все удалённые shapes |
| Lifecycle/CRUD и handoff | BA-03, BA-05/08: состояния, usage и stable-ID change; перенос правил BA-05 на все сущности и semantic invalidation UNKNOWN |
| Workflow limits | BA-02: performer и ветви. **Частично:** отдельные limits количества шагов/ветвей и документооборот ещё не разложены |
| External contract | TL-EXT-PLAN, 04.2: missing/stub, signed exception и named-query boundary |
| Baseline/RED | TL-RED-EVIDENCE, 05.2/06.1: причина RED и независимое before/after |
| QA stages | TL-QA-6, 06.4: stage/AC coverage и FAILED+NOT_RUN |
| FE–BE sync | 08.4: route/call-site, wire evidence и exception |
| Ship guards | 07.1: branch/claim/upstream/exact head. **Частично:** отдельные проверки base guard, tests-before-push и tracker |
| Release/exception | 07.3: QA/health/drift. **Частично:** отдельные falsifiers skipped PR/CI, exception и repair по версиям |

Карточки SA/TL наследуют DEFER из вводных соответствующих файлов; групповые ID — из реестров. Дополнительные абзацы gap review о QA и runtime уточняют соответствующие элементы выше. Для трёх ранее отмеченных частичных групп добавлены отдельные source conditions в [gap controls](WP-01-gap-controls.md); записи таблицы сохраняют историю первоначального обнаружения. Это устраняет конкретный пробел описания controls, но не доказывает полную equivalence или выполнение. Остатки помечены UNKNOWN или предложены как проверки, не результаты запуска.
