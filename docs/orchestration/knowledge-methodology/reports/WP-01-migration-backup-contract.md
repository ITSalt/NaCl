# WP-01: как migration получает подтверждение backup

Статический поиск в `codex-plugin-src services scripts tests` на pinned NaCl 20fe4c6; migrations и graph не запускались. Динамические или внешние callers вне этого scope не исключены.

`codex-plugin-src/package/runtime/graph-gateway/migrations.mjs:145–157,181–186` для ещё не применённой migration с `backupRequired` требует `options.backupVerified === true`, иначе BACKUP_REQUIRED/BLOCKED. Already-applied с совпадающим checksum проходит ранее; несовпадение checksum — отдельный исход. Сам guard не связывает boolean с manifest, project, digest или restore.

В найденных package calls `graph-gateway/gateway.mjs:273–283,388–401` и `resources/bootstrap/apply-project-schema.mjs:38–45` `backupVerified` не передаётся. Следовательно в этих указанных путях будущее достижение guard для неприменённой backup-required migration с отсутствующей опцией даст BLOCKED, если ранее не возникнет иной исход. Это не доказывает отсутствие внешних callers. `graph-gateway/tool-schemas.mjs:144–160` не описывает backup ID/manifest/boolean; `validation.mjs:22–27` отклоняет неизвестные аргументы.

`graph-gateway/catalog.mjs:42–55` требует backup для risky migration; все три pinned `graph/migrations/001-gateway-foundation.json`, `002-concurrency-foundation.json`, `003-schema-resource-identity.json` имеют `backupRequired:false`. Отсюда нельзя заключать, что текущая миграция заблокирована.

`graph-cli/lifecycle.mjs:820–830,905–925,953–968,1122–1129` описывает отдельные backup и restore-verify, `graph-cli/cli.mjs:146–167` — их вызовы. В найденных callers результат этих операций в guard не передаётся. При нескольких миграциях более ранние могут уже обрабатываться до последующего отказа; после начала DDL дальнейшая ошибка может приводить к `MIGRATION_PARTIALLY_APPLIED` (`migrations.mjs:188–220`). Bootstrap helper применяет schemaStatements до migration guard и может свести ошибку к generic статусу (`resources/bootstrap/apply-project-schema.mjs:38–55`).

Proposed проверки DEFER: сопоставить конкретный manifest и восстановление с project/snapshot и migration revision, протестировать уже применённый checksum, unknown input и частичный цикл. Это не действующие gates и не наблюдение live поведения.
