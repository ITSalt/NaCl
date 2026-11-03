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

Дополнительная матрица рассмотренных gates (цена каждого UNKNOWN):

| Gate / consumer | Защита и риск исключения | Условие пересмотра DEFER |
|---|---|---|
| Regression RED → dev/review | Не относящийся к дефекту зелёный тест может скрыть регрессию | Meaningful RED и релевантность теста, затем сравнение CI evidence. |
| Test-author seam → review | Самоподтверждение может не выявить неверный тест | Проверяемая lineage и исключения при одной identity; отсутствие поля не доказывает отсутствие субагента. |
| Per-AC review → reviewer | Утрата reachability и semantic relevance при зелёном suite | AC→reachable code→relevant test→revision controls. |
| Verify-code → verify | Пропуск dataflow или отсутствующего runner | Для reuse совпадение SHA, среды, набора tests и исходов. |
| QA stages → verify/release | Смешение fixture/browser/wire/live и пропуск обязательного AC | Revision/environment, mandatory set, exceptions и end-to-end controls. |
| Screenshots/scenario → QA | Потеря визуального evidence или stale scenario | Bundle/read-back и freshness; hash не доказывает смысл. |
| Gateway terminal evidence → Task | Неполный формат или несуществующий test evidence | Full-path проверка required stages и consumer; имеющийся engine probe использует mock. |
| Release QA gate → release | Пропуск обязательного golden path | Проверить writer/reader, revision и applicable exceptions; удаление не обосновано. |

Все кандидаты DEFER до отрицательных controls, проверки эквивалентности и потребителей. Совпадение названия проверок не доказывает дублирование: источник, revision, среда и время могут различаться. Регрессия, independence, per-AC review, verify-code, QA, evidence и release рассмотрены выборочно; полный реестр tests/workflows/панелей, риск удаления каждого gate и реальная стоимость не установлены. Описание скопированных screenshots не доказывает их потерю. [Независимый review](WP-06-independent-review.md) проверил пять прямых ссылок и чистый обычный NaCl status при указанном SHA, ignored files не охвачены. Исходные sanitize и первый engine probes ошибочно выполнялись в основном checkout; затем повторены во временном archive без OS network sandbox, mock graph/write не доказывает live outcome. Полный реестр tests/workflows/панелей и риск каждого gate остаются UNKNOWN; это частичная сдача, не полная приёмка charter.
