# WP-09 — статическая сдача graph и синхронизации

WP-01 DONE по D-5; NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`. Основание: [предварительно](WP-09-preliminary.md), [lease](WP-09-null-project-lease-trace.md), [модель concurrency](WP-09-concurrency-model-test.md), [baseline](WP-01-graph-baseline-risks.md), [backup/restore](WP-01-graph095-atomic-sample.md). В этом раунде graph, tests и A/B не запускались.

| Источник / обязанность | Authority, consumer и отказ | Альтернатива / риск |
|---|---|---|
| Remote Task/Wave | Graph — заявленная authority; `.tl/status.json` — cache; full/next/status/ship должны различать freshness. Graph→JSON не доказан общей транзакцией. | Versioned snapshot/outbox с read-back; риск replay чужого или stale state. |
| BA board / graph | Board несёт визуальный ввод, graph — структурные связи; partial write требует reconciliation. | Typed extraction без board может потерять user edits и layout. |
| Claim / lease | Legacy developer ID не session authentication или project mutex; gateway отдельно описывает principal, fence/CAS и membership. | Session identity + fence требует expiry/recovery и не переносится автоматически на Skills-only MCP. |
| Backup/restore | Legacy import стирает весь graph перед replay; totals не равны семантике. Package graph-cli отдельно проверяет dump/checksum и representative snapshot. | Изолированное восстановление или scoped набор требует границ writers и semantic fingerprint; task claim не project mutex. |
| Analyst/editor | Enqueue runId не completion; discovery может вернуть partial без метки, fallback имеет отдельные исходы. | Typed complete/partial/error + read-back должны сохранять полезный fallback. |

Ранее модель concurrency дала 16/16, но это mock/unit, не Neo4j. Первоначальный запуск в основном checkout нарушил disposable protocol; повтор в temp archive также 16/16, OS network sandbox не применялся. Graph runtime и recovery не доказаны. Markdown/JSON + atomic Git и ID validators — гипотеза для малого/однопользовательского scope; многопользовательская запись, referential integrity, freshness и recovery требуют отдельных решений. Нет доказанного победителя или измеренного порога опциональности graph.

**Authority и восстановление.** Remote Task/Wave — graph; локальный JSON — best-effort cache. Board — визуальный ввод, graph — структурные связи; authority каждого свойства не установлена. Task Markdown/JSON могут быть контекстом или производными, не универсальной authority. Legacy claim/TTL и gateway principal/fence/CAS — разные контуры; backup не подтверждает текущий graph, а enqueue runId — не завершение. При graph→JSON или graph→board отсутствует доказанная общая транзакция. Git фиксирует выбранные файлы в ревизии, но сам не обеспечивает согласованность с graph/board, concurrent writers или recovery.

Покрытие: BA uniqueness schema, выбранные validators и claim/status/membership/canary queries, а также editor enqueue/discovery/fallback рассмотрены выборочно; полный каталог validators/queries/editor modes и фактическое применение schema UNKNOWN. [Первое независимое review](WP-09-independent-review.md) подтвердило пять ссылок и чистый обычный NaCl status при указанном SHA; ignored, graph и runtime не проверялись. Полный реестр и failure/recovery остаются открытыми.

Все кандидаты DEFER до отрицательных controls. Стоимость setup/восстановления, частота и фактические writers UNKNOWN. Полный каталог validators/queries/editor modes и семантическая равнозначность не установлены; independent review и checkout требуются до приёмки.
