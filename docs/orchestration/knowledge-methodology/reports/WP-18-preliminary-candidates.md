# WP-18 предварительно: кандидаты для дальнейшей проверки

Это разведка по предварительным, не принятым отчётам; не принятые рекомендации и не закрытие WP-01–17. Порядок отражает экспертный риск для дальнейшего исследования, а не измеренную severity или частоту. Все кандидаты DEFER; цена, эффект и runtime UNKNOWN. Root snapshot 20fe4c6 и установленная версия 0.2.2 различаются.

| Кандидат | Источник / риск изменения |
|---|---|
| Ownership lock и recovery legacy links | [source trace](WP-01-guides-setup-trace.md), [challenge](WP-17-symlink-challenge-trace.md): EEXIST может привести к удалению чужого lock при заданных preconditions. Owner-bound lock и journal требуют доказать сохранение confirmation, partial recovery, post-rename identity и чужих объектов; инцидент не наблюдался |
| Отдельный ledger QA stages и evidence | [QA→release](WP-01-qa-release-contract-trace.md): FAILED + mandatory NOT_RUN может дать aggregate UNVERIFIED, не VERIFIED. Нужно сохранять per-stage статус/причину, обязательность, scoped W4 и consumers; serializer/read-back UNKNOWN. Изменение status contract требует проверки; false PASS не доказан |
| Частичные результаты публикации | [Docmost](WP-01-docmost-sync-trace.md): условный success вместе с errors и особенность hash. Per-page evidence должен обеспечивать recovery и различать безопасный retry от неизвестного результата create с reconciliation; warning-only delete — текущая семантика, а не обязательно будущая policy. Live outcome UNKNOWN |
| Coverage BA→SA | [handoff coverage](WP-01-handoff-coverage-trace.md): matching rows без DISTINCT аналитически могут завысить показатель при выполненных прочих условиях. Distinct source metric требует отдельно учесть пустой denominator, разные BA/SA формулы, исключения и семантику edge; он может изменить пороги. Cypher не выполнялся |
| Self-contained Skills-only closure | [resource trace](WP-10-skill-closure-trace.md): в installed bundle отсутствуют некоторые именованные файлы. Машиночитаемый resource manifest должен учесть active skill paths, динамические ресурсы, transport и provenance; одно наличие файла или hash не доказывает semantic resolution и MCP; runtime outcome UNKNOWN |

Окончательные предложения минимальной/standard/regulated методики, оценка выгоды и порядок внедрения требуют принятия зависимостей и независимого challenge. Изменение NaCl, A/B и release не выполнялись.
