# WP-07 — статическая сдача поставки и публикации

WP-01 DONE по D-5. Pinned NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; источники: [WP-07 preliminary](WP-07-preliminary.md), [CI selection](WP-07-ci-selection-trace.md), [deploy/monitor](WP-07-deploy-monitor-trace.md), [Docmost](WP-01-docmost-sync-trace.md). Данный раунд не запускал CI, release, deploy, graph, Docmost или A/B. Фактическая стоимость ручных шагов и частота UNKNOWN.

| Цепочка / consumer | Сохраняемые гарантии | Альтернатива и риск |
|---|---|---|
| Пользовательский продукт: ship → deliver → deploy → release | Upstream/test, clean-checkout exact commit, CI/health/QA, scoped exceptions; push может уже запустить deploy до мониторинга. | Attestation exact SHA/required checks/environment плюс served revision; риск потерять scope исключений и post-merge QA. У helper выбора CI нет доказанной проверки exact head из упомянутых строк; live outcome UNKNOWN. |
| Выпуск самого NaCl: framework runbook / отдельный Skills-only build | Версия, source/payload provenance и проверка client-specific output. | Source-bound attestation должна учитывать сборку из архива без .git; предоставленный SHA в builder сам не связывает дерево, но другой release gate возможен. Local build не является публикацией. |
| Graph → render/preview → внешняя публикация документации | Проверка scope, preview, page identity, per-page result и recovery. | Per-page ledger с content/read-back может изменить warning-only delete; ambiguous create нельзя слепо повторять. Ранее найденные локальные manifest и title условия — source-level, не наблюдённый remote failure. |

Все варианты DEFER до controls: другой CI SHA, missing run, смена HEAD, mixed publication failure, ambiguous create и title collision. Показанная карта не доказывает актуальный active route, весь runbook или цену каждого шага; live deployment и внешний service не проверены. Source различия root/Codex/Skills-only нельзя смешивать. Независимый review и проверка источников/checkout необходимы до решения о приёмке.
