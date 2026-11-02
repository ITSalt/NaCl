# WP-06 предварительно: per-AC review и формат evidence

NaCl 20fe4c6; source-only, dependency WP-01 открыта, стоимость/frequency UNKNOWN, DEFER.

`codex-plugin-src/workflow-overlays/nacl-tl-review/SKILL.md:30–58` требует для каждого AC отдельно implemented/reachable/tested и положительное evidence, без которого максимум PARTIAL; :67–75 описывает self-adversarial pass одного агента, не обязательного второго reviewer. `skills-for-codex/nacl-tl-verify-code/SKILL.md:48–59,117–137` описывает AC checklist и отдельные исходы отсутствующего runner или покрытия; отсутствие AC помечается skipped, не автоматическим fail.

Package `codex-plugin-src/package/runtime/graph-gateway/concurrency.mjs:132–141,156–160,253–285` проверяет формат test-GREEN и SHA token, требует parseable evidence в той же terminal mutation и test-GREEN либо no-test для done, при no-test — точную строку подтверждения; это не доказывает личность или полномочия оператора. Показанная функция не проверяет существование пути, смысл покрытия AC и актуальность SHA. Другие consumers/gates могут проверять больше; false PASS в runtime не доказан.

Альтернатива — единый SHA-bound CI attestation вместо per-AC review. Риски: потерять reachability, правильный runtime и соответствие AC при синтаксически корректном, но не относящемся к критерию test; нельзя терять обработку missing AC/no-test. Proposed controls: отсутствующий test path, тест другого сценария, недостижимый обработчик при зелёном suite, реализованное без покрытия и отсутствующий AC; positive — AC→reachable code→collected relevant test→revision evidence. Не выполнялись.
