# WP-01: платформенные подобласти — source crosswalk

Pinned NaCl 20fe4c6. Source показывает заявленные обязанности и условные пути, не живые результаты, стоимость или закрытие всех подпутей.

| Подобласть / основной WP | Конкретное source evidence | Значимый остаток |
|---|---|---|
| Graph-infra / WP-09 | `graph-infra/schema/ba-schema.cypher:15–34` ID uniqueness; handover export :49–65 и import :80–101,106–145; [backup/restore](WP-01-graph095-atomic-sample.md) | Применение schema, consistency при writers, restore semantics и binding backup к проекту UNKNOWN |
| Analyst-tool / WP-09 | `analyst-tool/server/src/routes/skills.ts:31–49` enqueue и runId; [queue/consumer cards](WP-01-analyst-tracker-cards.md), [publish/render](WP-01-publish-render-trace.md) | Reconnect/order событий, несохранённые edits в разных путях, область output и реальный UI outcome; runId не означает completion |
| YouGile CLI / WP-10 | `yougile-setup/src/index.ts:153–175,204–221,317–325,333–363,403–421`; [cards](WP-01-analyst-tracker-cards.md) | При построении указанного config-блока обе ветви project_id дают пустое значение, реальный consumer/последствие UNKNOWN; conditional partial state не является наблюдённым сбоем |
| Docmost / WP-07 | `docmost-sync/src/index.ts:39–67,102–110,123–146` разделяет init/apply/dry-run/rebuild и auth; [platform](WP-01-platform-inventory.md), [sync trace](WP-01-docmost-sync-trace.md) | Diff/delete, partial failure/read-back и полный publisher→CLI маршрут не проверены; публикации не было |
| CI / WP-10 | `.github/workflows/build-cli.yml:3–16,43–60` задаёт path filters и jobs; [CI/package cards](WP-01-ci-package-cards.md) | Required-check policy, конкретный event/head и skipped jobs UNKNOWN; YAML не означает CI PASS |

Связь WP проверяется по work-package read scope; cross-cutting ссылки не расширяют разрешения. Источники перечитаны, graph, CI и внешние интеграции не вызывались.
