# WP-16: предварительное исследование измерений и происхождения цифр

Предисследование; WP-02…15 и corpus/baseline не приняты. NaCl SHA `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`. Платные прогоны, A/B delivery и графовые эксперименты не запускались.

## Опубликованные оценки

`nacl-tl-plan/SKILL.md` получил строку `150K (read all docs)` в commit `76aaeadf1cfbf31e81707ea84965193455853e34` 2026-04-10; `docs/methodology/overview.md:19,70` и `handoff.md:89–101` содержат 550/150000. В просмотренных tracked файлах не найдены исходный транскрипт, точный корпус или tokenizer; это граница поиска, не доказательство отсутствия данных вне репозитория. `overview.md:70` описывает 50 query + 500 ответа, а `handoff.md:101` — 550 как ответ; определения различаются.

`codex-plugin-src/package/.codex-plugin/plugin.json:22` и `tests/codex-plugin/scripts/nacl-interface-metadata.test.mjs:22` получили формулировку `measured effect` и 5831/1480 человеко-часов в `a658e24` 2026-07-21. Тест фиксирует текст listing, не происхождение чисел; timesheets/калькуляция не найдены в ограниченном поиске. Арифметика даёт 99.633% и около 3.94×, но не подтверждает исходные замеры, сопоставимость scope или снижение денежной стоимости на 60%. Один retrieval не равен полному workflow планирования (`nacl-tl-plan/SKILL.md:100–110,115–175`).

## Существующий bench

`bench/inputs/README.md:3–11` описывает synthetic DOCX, но в Git доступны только README, локальных входов и `bench/outputs` не обнаружено. `bench/run-variant.sh:19,34–47` ориентирован на BA import/Excalidraw и включает опасное ослабление permissions; не запускался и не является готовым delivery A/B. `bench/parse-stream.py:28–32,54–59,96–107` содержит исторический тариф и обработку usage; корректность расчёта требует raw stream и сверки event/cache.

Отдельный `bench/skill-tools/ab/results/tierA-n20.json` содержит 240 строк и 12 summary для двух моделей, трёх задач и двух arms. Это задачи slug/wave-plan/classify, не NaCl vs Markdown delivery и не доказанный источник опубликованных чисел. Runner `bench/skill-tools/ab/ab.mjs:192–199,232–235` сохраняет нормализованный ответ/usage/cost, а не полный tool-call transcript; tool invocation нельзя доказать только этим JSON.

**Несопоставимость wave-plan:** `ab.mjs:32–40` задаёт пять UC и зависимости. NEW получает полный `WAVE_INPUT` через :104–105; OLD в :103 получает `WAVE_RULES` (:58–63), где конкретные UC001–UC004 и рёбра зависимостей не перечислены, хотя evaluator :73–82 их требует. Координатор проверил исходник. Поэтому проценты OLD wave-plan нельзя трактовать как результат при одинаковом входе. Дополнительно `waveInvariantsOk` (:73–82,113) проверяет TECH и зависимости UC001–004, но не проверяет обязательный UC005-BE, отсутствие UC005-FE или лишние task IDs. Поэтому даже план NEW может получить `correct=true` при неполном или лишнем составе; read-only пересчёт нашёл 45 принятых wave-plan строк (40 NEW и 5 OLD), все они содержат ровно ожидаемые 11 task IDs; фактическая ошибка этих сохранённых результатов по множеству задач не обнаружена. Это остаётся пробелом проверки для других входов. Чтобы повторить эксперимент, до прогона обоим arms дать одинаковый input, зафиксировать независимый oracle с точным множеством задач и всеми зависимостями, полный trace, model/version, permissions и budget; исходные результаты не переписывать.

Для нового сравнения действует [черновая rubric](WP-01-measurement-rubric-draft.md): одинаковые brief/requirements/acceptance, фиксированные baseline, separate cold/steady state, сохранение failed/blocked/timeout и отличий качества. Graph baseline и безопасный restore остаются NOT_VERIFIED, см. [риски](WP-01-graph-baseline-risks.md). Ни одно численное ускорение методологии в этом исследовании не доказано.
