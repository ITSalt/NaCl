# WP-01: graph-infra дополнительные механизмы

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. DEFER; статическое чтение, фактические операции, частота, цена и effect UNKNOWN. Предлагаемые тесты не выполнялись; graph не использовался.

## Schema ID constraints

graph-infra/schema/ba-schema.cypher:15–34, sa-schema.cypher:12–41 и tl-schema.cypher:16–23 задают уникальность id на конкретных labels; заявленные consumers — graph writers и lookups. Это не доказывает наличие id у всех узлов, глобальную уникальность разных labels, изоляцию проектов или применённую live schema. Риск — коллизии и ошибочная адресация. Альтернатива: namespace-bound validated IDs с constraint read-back; риск потери точной semantics и совместимости writers. Negative: одинаковый ID на той же метке, отсутствующий ID, одинаковый ID на разных метках; UNIQUE само по себе не обязано отклонять отсутствие ID; positive: constraints и допустимые cases проверены на изолированном graph.

## Migration catalog и schema gate

codex-plugin-src/package/runtime/graph-gateway/migrations.mjs:3–15,26–41,46–72,97–105 связывает ledger с наличием имён constraints и задаёт BLOCKED при отсутствующем имени constraint и FAILED при ledger mismatch; post-boundary hook error даёт PARTIALLY_VERIFIED даже после чтения и сам по себе не доказывает запись; graph-cli/README.md:78–89 описывает pin/checksum и handoff при stale schema. Consumer — gateway operation; проверка имени не доказывает семантического равенства definition. Риск: ledger актуален, а schema не соответствует, либо запись частично выполнена. Альтернатива typed migration ledger с проверкой definition и фазовых receipts; риск неверно считать partial write rollback. Negative: актуальный ledger без constraint, неверный checksum, потеря fence после boundary; positive: проверка ожидаемого определения и отражение результата каждого этапа.

## Idempotency outcomes

graph-gateway/concurrency-cypher.mjs:54–68,85–120 связывает (project_id,key_hash) и payload_hash, включающий identity и operation: изменённый payload → IDEMPOTENCY_CONFLICT, завершённый повтор → сохранённый outcome с replay=true, pending → IDEMPOTENCY_INCOMPLETE. Consumer — вызывающая gateway lease операция. Риск: дубли и неопределённый partial outcome. Альтернатива versioned idempotency ledger с привязкой payload и principal; риск утраты разных outcomes и fencing. Negative: тот же key с другим payload, потерянный ответ после complete, прерванный pending, повтор иным principal; positive: подтверждённый replay идентичного вызова. Эти тексты не доказывают live Neo4j atomicity или Skills-only поведение.

## Export и manifest

graph-infra/scripts/handover-export.sh:49–56,62–97 делает полный graph export, затем отдельно counts/manifest и gzip+age с plaintext промежуточными файлами; consumer — handover-import.sh:106–145. Риск: writers меняют данные между export и counts, plaintext остаётся при прерывании, равные counts скрывают семантический drift. Альтернатива изолированный consistent snapshot с semantic fingerprint и проверяемым восстановлением; риск потери актуальной схемы и безопасности промежуточных файлов. Trap старается удалить plaintext при обычном выходе, но не доказывает cleanup после SIGKILL/crash или secure erasure. Import выводит различия label histogram, но FAILED задаёт по total counts, а rel-type histogram в этом блоке не сравнивает; совпадающие counts не подтверждают семантику. Import очищает узлы и schema: не применять к общему graph. Negative: writer между этапами, те же counts с иной label histogram, interrupted export; positive: отдельное восстановление, сверка семантики и отсутствие plaintext остатка. graph-cli/README.md:135–142 описывает другой stopped-container contour; его гарантии нельзя переносить на legacy handover.
