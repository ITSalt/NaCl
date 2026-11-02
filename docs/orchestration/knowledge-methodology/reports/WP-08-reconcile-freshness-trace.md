# WP-08 предварительно: свежесть diagnose → reconcile

Pinned NaCl 20fe4c6; только source, dependency WP-01 открыта. Стоимость/frequency/runtime UNKNOWN, DEFER.

`nacl-tl-diagnose/SKILL.md:390,486` описывает diagnostic report с commit/date; root `nacl-tl-reconcile/SKILL.md:90–136` сравнивает дату header либо mtime отчёта с `git log -1 --format="%ai" -- {file_path}` и при более позднем commit пропускает discrepancy как `SKIPPED (already-fixed)`. Сам факт изменения файла не доказывает устранение конкретного расхождения; uncommitted изменения git log не видит, author date не гарантирует фактический порядок. Это аналитический риск, не runtime incident. Отдельный запрет :136 не следует без контекста переносить на mtime самого отчёта.

Явный report старше 24 часов предупреждает, default старше часа предлагает rerun (:90–108). Root :474–498,511–522 допускает итог COMPLETE при остальных условиях и validation; :138–164 ограниченно ищет non-PASS и сохраняет UNVERIFIED. `nacl-tl-status/SKILL.md:69–99,781–788,838` graph-first, удалённая недоступность HALT; warning по самому свежему Task.updated не доказывает свежесть каждого Task. Codex `skills-for-codex/nacl-tl-reconcile/SKILL.md:19–44` описывает freshness и read-back, но указанный timestamp algorithm там не установлен.

Альтернатива — report snapshot commit и content hashes с recheck actual discrepancy при изменении; риски — стоимость и ложные остановки, hash не доказывает correctness. Proposed controls: commit меняет только комментарий, dirty fix, один свежий Task при другом старом, graph unavailable. Ни workflow, ни graph не запускались.
