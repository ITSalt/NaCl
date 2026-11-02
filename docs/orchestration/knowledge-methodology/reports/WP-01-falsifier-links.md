# WP-01: семь групп — связи с предложенными falsifiers

Идентификаторы из WP-01-group-card-audit.md; это связь с имеющимися источниками и ожидаемыми проверками, не новые execution evidence. DEFER сохраняется; цены/runtime UNKNOWN.

| ID | Evidence и отрицательный вход | Ожидаемое / граница |
|---|---|---|
| 06.5 | WP-06-sanitize-probe.md:3–13, WP-06-engine-mock-probe.md:3–15: done + qa-stage FAILED/BLOCKED/NOT_RUN, если стадия обязательна по заранее заданному scope | Предлагаемый downstream policy gate не должен принимать обязательный failed/unrun за success. Сам sanitizer синтаксически принимает tokens; mock MUTATION_ACCEPTED подставлен. Отказ конкретно sanitizer не установлен |
| 08.2 | WP-01-tl-diagnose-card.md:5,9,13–15: недоступный remote graph или частичный collector | Недоступный graph не считать пустым/здоровым; при not_assessable обязательном компоненте composite не вычислять. Недоступность graph сама по себе не всегда запрещает composite; точный non-success зависит от клиента. Сценарий не выполнен |
| 08.4 | WP-01-tl-platform-more-cards.md:5–11 и skills-for-codex/nacl-tl-sync/SKILL.md:68–85: non-SYSTEM с одним typed mock и без wire evidence/exception | По Codex contract mock-only без evidence даёт UNVERIFIED/missing, а отсутствующий или неисполняемый заявленный artifact — stale; SYSTEM — отдельный n/a control. Live provider не подтверждён |
| 09.4 | WP-01-graph-extra-cards.md:13–15, concurrency-cypher.mjs:54–68,85–120: completed key с другим payload | В указанном lease operation при выполненных prerequisites заявлен IDEMPOTENCY_CONFLICT; одинаковый payload возвращает saved outcome/replay, pending — INCOMPLETE. 16/16 local model не доказывает конкретный live outcome |
| 09.5 | WP-01-graph-baseline-risks.md:6–11 и WP-01-graph-extra-cards.md:17–19: те же counts, другое свойство/ребро | Предложенный semantic acceptance должен выявить отличие; legacy count-based importer не доказан как отвергающий такой случай. Fingerprint/restore не проверены |
| 10.3 | WP-10-preliminary.md:13–19, services/nacl-mcp/src/token-context.mjs:56–63: verified claims с неверным resource audience | Source-level invalidToken при выполненных остальных prerequisites; HTTP status, реальный verifier/deployment и Skills-only поведение UNKNOWN |
| 10.4 | WP-01-ci-package-cards.md:13–15, .github/workflows/build-cli.yml:3–10: PR вне path filter или skipped/другой SHA | Предлагаемая acceptance matrix не засчитывает отсутствующий/чужой job как PASS; другие jobs и actual CI не проверены |

Для 06.5, 09.5 и 10.4 ожидаемое non-PASS относится к предлагаемой независимой оценке, не к доказанному enforcement действующего кода. До пересмотра DEFER требуются согласованный scope, positive/negative control и evidence соответствующего клиента.
