# WP-06 — статическая сдача review и QA

WP-01 DONE по D-5. Pinned NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; источники: [QA preliminary](WP-06-preliminary.md), [per-AC](WP-06-per-ac-review-trace.md), [sanitize probe](WP-06-sanitize-probe.md), [engine mock](WP-06-engine-mock-probe.md), [QA→release](WP-01-qa-release-contract-trace.md). Root, legacy Codex и overlay не равнозначны. Ни graph, ни live QA/A-B в этом раунде не запускались; стоимость/частота UNKNOWN.

| Дефект → проверка → свидетельство/consumer | Альтернатива и сохраняемая гарантия |
|---|---|
| Регрессия или бессмысленный тест → содержательный RED/GREEN → test path/result для dev и review | CI attestation требует сохранить причинность RED, иначе защищённость не доказана. |
| AC недостижим или не протестирован → per-AC review / verify-code → findings и partial status | Revision-bound AC ledger не заменяет semantic relevance и проверку отсутствующего runner. |
| Один Git identity → независимый test-author и seam evidence → review | Lineage должна подтверждать независимость, а не лишь самоотчёт; root MAJOR сам по себе не блокирует APPROVED. |
| UI/provider/среда → QA stages и screenshots → verify/release | Fixture, wire, browser и live подтверждают разные свойства; единый ledger должен сохранять environment и exception scope. |
| Недостающий mandatory stage → aggregate/status → release | При FAILED + NOT_RUN описан UNVERIFIED, не false PASS; сохранять per-stage причину и обязательность. |
| Terminal status + evidence → gateway → Task | Ранее выполненные локальные sanitize и mock engine probes описаны в ссылках; mock не доказывает реальную graph write или release PASS. |

Все кандидаты DEFER до отрицательных controls, проверки эквивалентности и потребителей. Совпадение названия проверок не доказывает дублирование: источник, revision, среда и время могут различаться. Регрессия, independence, per-AC review, verify-code, QA, evidence и release рассмотрены выборочно; полный реестр tests/workflows/панелей, риск удаления каждого gate и реальная стоимость не установлены. Описание скопированных screenshots не доказывает их потерю. Независимый review, ссылки и исходный checkout требуют проверки; это частичная сдача, не полная приёмка charter.
