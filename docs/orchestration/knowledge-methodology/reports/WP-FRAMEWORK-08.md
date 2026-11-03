# WP-08 — статическая сдача управления и восстановления

WP-01 DONE по D-5. Pinned NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`. Использованы [WP-08 предварительно](WP-08-preliminary.md), [goal/resume](WP-08-goal-resume-trace.md), [reconcile freshness](WP-08-reconcile-freshness-trace.md), [migration](WP-01-core-migration-cards.md), [platform consumers](WP-01-platform-consumer-trace.md). Это заявленные полномочия и source-level traces, не запущенные workflows. Цена, частота, active route и runtime UNKNOWN.

| Надстройка | Полномочие / результат | Возможное объединение и потеря гарантии |
|---|---|---|
| Goal intake/conduct | Подтверждённые atoms/locked plan → выполнение/verify/resume; root /goal и Codex preview различаются. | Typed route и persisted intent требуют identity, stop и reconciliation после side effect. |
| Diagnose/reconcile | Diagnose собирает факты и report; reconcile отдельно предлагает согласуемый patch/read-back. | Общий collector не должен смешивать наблюдение с нормативным решением или stale graph. |
| Verify-code | Task/AC, diff и test evidence → findings для verification; не полный статус проекта. | Общий reader не заменяет независимый test и semantic relevance. |
| Status | Graph-first Task/Wave; local cache с отдельными ограничениями, remote unavailable → HALT. | Единая панель должна показывать authority/freshness/UNKNOWN. |
| Sync | FE↔BE routes/DTO и runnable wire evidence → full/QA. | CI attestation требует SHA/environment и non-success при неизвестном. |
| Migrate | Legacy docs → IR/validation → подтверждённая graph write/audit; не diagnose. | Typed migration должен сохранять dialect, IDs, topology и partial recovery; counts IR не доказывают полноту source. |
| Postmortem/init | History → owner retrospective; init → config/bootstrap и read-back. | Общий ledger/init не должен терять client-specific confirmation, user config и recovery. |

Адресные условия пересмотра DEFER (стоимость, частота и историческая причинность UNKNOWN):

| Контур | Что сохранить / условие проверки |
|---|---|
| Goal | Identity и scope; interruption после side effect и внешний read-back; root и Codex preview различаются. |
| Diagnose/reconcile | Источник фактов и подтверждение patch; dirty file, unrelated commit и non-PASS. |
| Verify-code | Связь AC→код→test и независимость; code-without-test и отрицательный контроль. |
| Status | Graph/cache authority и freshness; remote unavailable и отдельный owner/TTL read. |
| Sync | Wire, SHA/environment, actor exceptions; fixture failure и неверный wire при совпадающих типах. |
| Migrate | Dialect, IDs и topology; source→IR→isolated graph, interruption и partial recovery. |
| Postmortem | Подтверждаемые citations без ложной причинности; автоматическое принятие не считать доказанным. |
| Init | User config, клиент и graph capability; existing config, dry-run, restart/read-back и partial rollback. |

Local graph→JSON и remote graph-only — разные authority; при остановке между write и cache общая транзакция не доказана. Goal state после внешнего side effect требует reconciliation до повтора, не blind retry. Подробности — [recovery chains](WP-01-quality-recovery-static-chains.md). Все кандидаты DEFER до указанных проверок. Схема authority частична: полный producer→failure→recovery и отсутствие второго плана/самоподдерживающегося цикла не доказаны. Все названные направления отражены на source-level, но полнота отдельных modes и consumers UNKNOWN. Данный раунд graph/tests/A-B не запускал. [Независимый review первого раунда](WP-08-independent-review.md) зафиксировал пять ссылок и чистый обычный NaCl status при указанном SHA; ignored files, graph и runtime не проверялись. Второй раунд опирался на накопленные отчёты и не перечитывал все первичные источники; финальный verdict необходим до приёмки.
