# WP-01: tests и bench — карта источников

`git ls-tree` pinned NaCl 20fe4c6: tests/codex-plugin 50 tracked files, tests/desktop 1, tests/graph 6, tests/fixtures 330; bench root 7 + fixtures 9 + inputs 1 + skill-tools 16. Числа — файлы, не тест-кейсы. Тематическая связь с WP ниже предложена для исследования, не изменение read scope. Наличие теста не означает его запуск, PASS, отсутствие SKIP или полноту покрытия.

| Область | Source-level назначение / граница |
|---|---|
| tests/codex-plugin | `README.md:1–18,41–75` описывает entrypoints, model-backed routing NOT_RUN. `scripts/nacl-legacy-symlinks.test.mjs:179–246,378–408` задаёт успешный путь и подмену, но не найден тест EEXIST lock ownership; concurrency-model :335–363 — модель, не live Neo4j; local-graph-lifecycle :795–863 — изолированный test harness. Docker E2E имена не доказывают запуск |
| tests/graph | 5 shell regression и seed. `regression-staleness-stamp-polarity.sh:2–27` задаёт исторический invariant; `regression-nav-actions-intake.sh:2–27` описывает manual disposable Docker Neo4j, не CI. Остальные файлы не изучены полностью |
| tests/desktop | `tests/desktop/graph-smoke.sh:2–14,22–27` описывает manual disposable Docker/Neo4j smoke и PASS/FAIL/SKIP; не свидетельствует о запуске или Desktop notifications |
| tests/fixtures | 18 тематических каталогов, включая graph-snapshots 207 файлов. Имена включают evidence, QA/release gates, spec refusal, external contract, UI reachability и drift; test→fixture→реальная функция и полный corpus не проверены |
| bench | `bench/README.md:1–5,9–19,63–71` описывает harness и Excalidraw artifact diff, `bench/skill-tools/README.md:3–17,54–66` — детерминизм утилит и estimate. Исторические results не являются приёмкой этой программы; inputs и fixtures не равны согласованным шести классам |

Пути входят в read scope WP-01. Карта и выборочные contracts — частичное покрытие; live/CI outcomes и обоснование для каждого неохваченного механизма UNKNOWN. При повторном исследовании отдельно сверять positive/negative, client route и фактическую связь test с fixture.
