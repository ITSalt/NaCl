# WP-14 — управление, восстановление и состояние: ограниченная статическая сдача

Снимок `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; WP04/08/09/10 приняты лишь в границах D-6. Проверен обычный git status исходника: чистый; ignored files не проверялись. Новых graph/probes/A-B не проводилось.

**Условная модель authority.** Goal locked plan/atom state относится к conduct; graph Task/Wave — к TL full/next/status; `.tl/status.json` — cache в remote; Git/CI и внешние side effects имеют отдельные источники. JSON сам не доказывает фазу, CI или deploy. Для graph commit до JSON local root требует diagnose/rebuild; общей транзакции graph+FS не доказано. Remote root/overlay описывают graph-only authority и claim/fence, старый root conductor даёт другое guidance. Authority каждого свойства и active route UNKNOWN. [Предварительный отчёт](WP-14-preliminary.md), [graph→cache](WP-01-quality-recovery-static-chains.md), [graph](WP-FRAMEWORK-09.md).

**Ранее выполненные synthetic observations.** Root/Claude conduct в изолированной fixture при двух planned и одном verified atom выдал GOAL_OK 1/1; подмена одного atom также дала GOAL_OK 2/2 и повторена независимо. Это ограниченный false success проверенного handler, не доказательство реальной потери state; другие guards могли бы препятствовать состоянию, Codex conduct не проверен. Частота и стоимость UNKNOWN. [Evidence](WP-14-preliminary.md).

**Review и retry.** Repo checks привязаны к wave-tip=HEAD; gateway проверяет синтаксис SHA, но обязательная повторная сверка старого review token с новым PR HEAD в изученном фрагменте не установлена — не доказанный false PASS. Retry policy предписывает не повторять side effects после timeout вслепую, однако текст attempts и pseudocode расходятся; runtime UNKNOWN. [Revision trace](WP-14-review-revision-trace.md).

**Кандидаты.** KEEP точную identity plan/state: защищает от ложного завершения; proposed deterministic ID equality требует negative missing/extra/duplicate и сохранения guards. DEFER typed ledger до проверки client/mode authority и сохранения raw failures; DEFER retry adapter до external read-back, receipt, interruption и stale fence; DEFER revision-bound attestation до проверки A→B и dirty checkout, чтобы token не заменял содержательный review. Цена каждого UNKNOWN; кандидаты не внедрены.

**Адресная карта authority и механизмов.** Стоимость всех групп UNKNOWN; проверки ниже предложены, не исполнены.

| Контур / consumer | Основание, альтернатива и риск |
|---|---|
| Goal conduct/coordinator | Locked plan и state; KEEP обязанность идентичности, exact-ID сравнение DEFER до missing/extra/duplicate и проверки guards. Synthetic fixture не доказывает реальной потери. |
| Local full/diagnose | Graph→JSON; после graph commit предписан rebuild cache. DEFER typed ledger/read-back до interruption и проверки authority; общей транзакции не доказано. |
| Remote full и overlay | Graph-only authority и claim/fence, graph unavailable → HALT; legacy и gateway claims не признаны эквивалентными. DEFER до multi-writer и expiry controls; active route UNKNOWN. |
| Review/deliver | Синтаксис SHA не подтверждает checks; DEFER revision-bound evidence до A→B и dirty-checkout controls, сохраняя содержательное review. |
| Retry/coordinator | После неизвестного outcome сверять external state; DEFER receipt/idempotency до проверки provider, interruption и stale fence. |
| Goal proof/evaluator | Порядок proof в текстах неоднозначен; DEFER разделение промежуточного и финального доказательства до сверки версии; runtime loop не доказан. |

[Первый независимый review](WP-14-independent-review.md) подтвердил шесть ссылок, HEAD и обычный clean status; ignored не проверялись. Host session и migrate→spec→verify не подтверждены имеющимися traces.

**Остаток.** Полные трассы Goal→BA/SA/TL и migrate→spec→verify, исчерпывающая authority/conflict модель, live interruption, stale task, partial write, multi-writer и retry, все клиенты и active routes не доказаны. [GOAL sequence](WP-01-goal-proof-sequence.md). Исходные primary, coverage и mechanisms требуют независимой оценки; review обязателен.
