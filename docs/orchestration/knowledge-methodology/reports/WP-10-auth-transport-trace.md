# WP-10 предварительно: authorization boundary разных transports

Source-only NaCl 20fe4c6; dependency WP-01 открыта. Активный route, реальные права и mTLS UNKNOWN; стоимость/frequency UNKNOWN, DEFER.

Full package `codex-plugin-src/package/runtime/graph-gateway/gateway.mjs:131–152,313–320,388–400` описывает trusted principal resolver, разрешённые роли capability и schema lease guard. `rbac-cypher.mjs:3–16` задаёт active project/principal membership и role predicate; проверка membership находится в graph statements, а не только в сборке параметров. Это не proof работающего сервера или изоляции всех операций.

`codex-plugin-src/package/resources/references/skills-only-runtime-contract.md:20–30,106–132` требует project Neo4j MCP, schema/named read, подтверждённый write/readback и при применимости leases/fencing/revision; package gateway tools не используются. Текст требований не доказывает, что любой Neo4j MCP реализует именно package principal/role enforcement.

`docs/configuration.md:233–238,420–427` для описанного прямого server path обозначает server как authorization boundary, а project_scope — routing/provenance, не project ACL; remote документирует личные mTLS certificates. Это разные routes, не доказательство фактической конфигурации или отсутствия RBAC во всех клиентах.

Альтернатива — typed transport-neutral contract с source/scope/identity/revision/fence и честным BLOCKED при недоступной гарантии. Риски: принять project_scope за ACL или имя principal за доверенную аутентификацию и потерять server-wide authority. Proposed controls: два project на одном сервере, неправильный principal, revoked membership, stale fence, write/readback; ни graph, ни сеть не вызывались.
