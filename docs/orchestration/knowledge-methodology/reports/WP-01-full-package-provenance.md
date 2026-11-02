# WP-01: full package — полная карта Git provenance

Закреплённый NaCl `20fe4c6`; read-only сопоставление tracked regular Git files с входами и правилами `scripts/build-codex-plugin.mjs` и manifest. При этой статической сверке builder/main, tests и graph не запускались; позднейший full-package --check описан в [матрице](WP-01-acceptance-matrix.md); содержимое конфигураций и секреты не выводились.

Карта builder-input → target: 196 root + 16 shared trees + 18 shared files + 60 workflow SKILL + 9 workflow non-SKILL + 114 codexSource = 413 копируемых targets, плюс 2 генерируемых JSON. Ожидаемых и фактически tracked путей по 415; missing, extraneous и коллизий — 0.

Из копируемых файлов 397 не имеют transform и идентичны источникам; для 16 targets manifest задаёт transform. Независимый исследователь применил чистые transform-функции в памяти: 16/16 совпали с целями; один transform не меняет байты. По фактическим bytes это 398 unchanged и 15 changed.

Оба generated JSON побайтно совпали с in-memory реконструкцией: package-index содержит 10 public skills и 60 workflows; parity baseline — 39 identical legacy SKILL и 21 overlay divergence. Независимая сверка подтвердила все 102 ссылки package-index, 21 overlay hash/reason и 39/21 по Git blobs. Исторические legacy targets сопоставлены с manifest, но существование исторических commits не проверено.

Независимая сверка Git modes: все 415 targets имеют 100644, включая generated JSON; 14 исходных executable files (13 shell и 1 Python) стали 100644 согласно `scripts/build-codex-plugin.mjs:315–318`. Некоторые consumers явно используют `bash`/`python3`; docs goal содержат и прямые `./...` примеры относительно project cwd, но они не доказывают direct exec package copies. Package goal leaf разрешает packaged checks, не предписывая interpreter; в ограниченном поиске активная команда, гарантированно напрямую запускающая 0644 package copy, не найдена. `scripts/build-codex-plugin.test.mjs:151–167` намеренно проверяет mode 0644 и MCP через node, но не direct exec всех скриптов; tests не запускались. EACCES не наблюдался.

Граница этой сверки: Git tree, не fresh build; позднейший full-package --check описан в [матрице](WP-01-acceptance-matrix.md). Source symlinks, untracked/ignored files, фактические physical modes результата, Skills-only closure и runtime не проверены. `sourceChain` описывает происхождение и не доказывает семантическую эквивалентность root, legacy и overlay.
