# WP-09 предварительно: legacy node без project_id и lease

Pinned NaCl 20fe4c6; package gateway source-only, граф не запрашивался, dependency WP-01 открыта. Цена, фактические nodes и execution UNKNOWN, DEFER.

`codex-plugin-src/package/runtime/graph-gateway/concurrency-engine.mjs:159–196` проверяет trusted principal/role policy перед named statement. `concurrency-cypher.mjs:3–14` требует active ProjectMembership разрешённой роли, но допускает resource нужного ID/label при `project_id IS NULL` либо совпадении проекта; mutation :254–290 также допускает NULL. Lease MERGE использует project_id/resource_type/resource_id (:33–53,136–165), idempotency также привязана к project, с проверками worker/principal/fence/expiry/revision.

Аналитическая negative fixture: одна physical DB, один legacy Task без project_id, действующие memberships двух проектов, отдельные project-scoped leases к тому же resource ID. Текст допускает риск разных lease keys на один node; revision CAS и другие guards остаются, поэтому два успешных конфликтующих writes или утечка не доказаны. Отдельно проверить node с чужим project_id.

Это full-package gateway, не доказательство работы Skills-only: `codex-plugin-src/package/resources/references/skills-only-runtime-contract.md:106–132` описывает другой transport, а `docs/configuration.md:420–427` — server-level auth и project_scope как routing/provenance. Альтернатива — явное adoption/migration legacy node перед доступом; риск исключить легитимные данные или сломать recovery. Proposed controls требуют disposable graph, memberships и точного read-back; не выполнялись.
