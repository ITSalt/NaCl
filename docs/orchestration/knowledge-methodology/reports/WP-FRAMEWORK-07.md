# WP-07 — статическая сдача поставки и публикации

WP-01 DONE по D-5. Pinned NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; источники: [WP-07 preliminary](WP-07-preliminary.md), [CI selection](WP-07-ci-selection-trace.md), [deploy/monitor](WP-07-deploy-monitor-trace.md), [Docmost](WP-01-docmost-sync-trace.md). Данный раунд не запускал CI, release, deploy, graph, Docmost или A/B. Фактическая стоимость ручных шагов и частота UNKNOWN.

| Цепочка / consumer | Сохраняемые гарантии | Альтернатива и риск |
|---|---|---|
| Пользовательский продукт: ship → deliver → deploy → release | Upstream/test, clean-checkout exact commit, CI/health/QA, scoped exceptions; push может уже запустить deploy до мониторинга. | Attestation exact SHA/required checks/environment плюс served revision; риск потерять scope исключений и post-merge QA. У helper выбора CI нет доказанной проверки exact head из упомянутых строк; live outcome UNKNOWN. |
| Выпуск самого NaCl: framework runbook / отдельный Skills-only build | Версия, source/payload provenance и проверка client-specific output. | Source-bound attestation должна учитывать сборку из архива без .git; предоставленный SHA в builder сам не связывает дерево, но другой release gate возможен. Local build не является публикацией. |
| Graph → render/preview → внешняя публикация документации | Проверка scope, preview, page identity, per-page result и recovery. | Per-page ledger с content/read-back может изменить warning-only delete; ambiguous create нельзя слепо повторять. Ранее найденные локальные manifest и title условия — source-level, не наблюдённый remote failure. |

**Ручные точки и остаток покрытия.** Для продукта оператор готовит изменения → ship/push → ожидание CI → deploy health и release; push может начать поставку до проверки монитором. Для NaCl оператор выбирает версию и tree, затем следует отдельному историческому runbook; Skills-only archive и внешний выпуск — разные стадии. Для спецификации graph → render → ручной preview/scope → согласованная публикация → per-page результат. Точная стоимость/частота ручных действий UNKNOWN.

Docs workflow предполагает сверку и commit; показанные `git diff HEAD~1` и `git add .` имеют условные ограничения для ещё не committed и посторонних файлов, реального захвата не наблюдалось. Rollback после push не следует из одного monitor HALT; Docmost local manifest не доказывает состояние remote. Области docs, rollback, stale и runbooks отражены источниками, но полные active routes и проверенное восстановление UNKNOWN.

| Кандидат DEFER | Условие и сохраняемый риск |
|---|---|
| CI exact-head attestation | Wrong SHA, missing run, смена HEAD; сохранить PR/post-merge и scoped exceptions. |
| Health + served revision | Проверить mismatch, environment и реплики; не заменять QA или rollback одним health. |
| Skills-only provenance | Связать проверенный snapshot/payload и неверный SHA/dirty source, включая archive без .git; иные release gates возможны. |
| Docmost per-page ledger | Partial failure, ambiguous create и title collision; сохранить текущую no-delete semantics и предотвращение дубликатов. |

Все варианты DEFER до controls: другой CI SHA, missing run, смена HEAD, mixed publication failure, ambiguous create и title collision. Показанная карта не доказывает актуальный active route, весь runbook или цену каждого шага; live deployment и внешний service не проверены. Source различия root/Codex/Skills-only нельзя смешивать. [Первое независимое review](WP-07-independent-review.md) подтвердило четыре прямые ссылки и чистый статус NaCl при указанном SHA; ignored files и все источники не проверены. После адресной коррекции требуется заключительный verdict.
