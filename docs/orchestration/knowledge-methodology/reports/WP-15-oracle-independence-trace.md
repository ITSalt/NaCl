# WP-15 предварительно: независимый автор теста и oracle требований

Source-only NaCl 20fe4c6; dependency WP-01 открыта. Это исследование существующих контрактов, не подготовка или запуск пилота; частота, стоимость и фактические результаты UNKNOWN, DEFER.

`nacl-tl-regression-test/SKILL.md:21–39` отделяет test author от implementer; feature workflow :168–174,180–210 получает task test-spec/acceptance и проверяет RED выбранных test cases. Если test-spec упустил существенный AC, отдельный автор может корректно следовать заданному scope и унаследовать этот пропуск. Это логическая граница источника, не свидетельство конкретного false PASS.

`codex-plugin-src/package/runtime/graph-gateway/concurrency.mjs:118–141,253–285` проверяет формат test-GREEN и terminal evidence, не семантическую связь с каждым AC; другие review/gates могут проверять больше. `spec/research-protocol.md:21–29` требует одинаковых независимых acceptance tests и review; отдельный автор реализации сам по себе не доказывает независимость oracle.

Альтернатива для последующего исследования — отдельно трассируемый AC→наблюдение oracle с одинаковыми критериями и происхождением evidence. Риск: неполнота даже независимого теста и подмена требований предположениями harness. Proposed negative — AC пропущен из test-spec при корректном RED→GREEN; positive — внешняя AC matrix обнаруживает пропуск. Никакие controls не подготовлены или выполнены.
