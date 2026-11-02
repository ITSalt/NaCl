# WP-01: package-level сверка BA и SA

На снимке NaCl 20fe4c6a56482e85d3ea9a9ebaadb37206047e41 исследователи сопоставили 14 BA и 10 SA root packages с существующими групповыми реестрами и карточками. У каждого найдена хотя бы одна обязанность; это не полное покрытие всех modes, consumers и runtime. Источники путей — соответствующие nacl-*/SKILL.md. До этой сверки в package index 59 описаний ошибочно выводились как символ vertical bar; они заменены первой строкой description из root SKILL, два resource package без root SKILL сохранены как исключение.

| Package | Основной источник | Основная обязанность и остаток |
|---|---|---|
| ba-analyze | :5–15 | completeness, diff и graph comparison; деталь в BA-06 и board card |
| ba-context | :5–14 | scope, actors, dataflow; BA-01 |
| ba-entities | :5–13 | типы, атрибуты, lifecycle, CRUD; BA-03 и lifecycle card, отдельная детализация types/stereotypes нужна |
| ba-from-board | :5–17 | import/analyze/sync orchestration; BA-09, session state и создание board требуют детализации |
| ba-full | :5–14 | десять фаз и human gate; BA-09, точный отказ и parity Codex проверить |
| ba-glossary | :5–13 | термины и синонимы; BA-04 |
| ba-handoff | :5–14 | scope, матрица и подтверждённые связи; BA-08, semantic invalidation не доказана |
| ba-import-doc | :5–15 | документ→визуальная board без graph write; BA-06, provenance и границы проверить |
| ba-process | :5–14 | группы, процессы и triggers/results; BA-02 |
| ba-roles | :5–14 | роли и матрица; BA-03, As-Is/To-Be delta раскрыть |
| ba-rules | :5–13 | классификация и связи правил; BA-05 |
| ba-sync | :5–17 | board→graph и запись ID/status обратно; BA-07, crash recovery не доказан |
| ba-validate | :5–17 | L1–L8 и XL1–XL5; BA-08, детализация уровней и empty scope нужна |
| ba-workflow | :5–14 | шаги, исполнители и артефакты; BA-02 и workflow card |
| sa-architect | :14–16,514–525 | модули/NFR и external contracts; SA-01, полный producer→consumer trace нужен |
| sa-domain | :13–15,31–39 | entities, attributes и BA→SA; SA-02, modes и downstream нужны |
| sa-feature | :12–28,807–815 | impact/FR и Decision; SA-04 и provenance card, staleness и read-back уточнить |
| sa-finalize | :12–17,23–28 | aggregation и readiness; SA-07, root также допускает записи Decision/JUSTIFIES и legacy backfill, не считать чистым read-only |
| sa-flags | :14–20,37–40 | validator exemptions; SA-05, отдельные flags и consumers требуют сверки |
| sa-full | :19–33,37–39 | фазовая оркестрация; SA-08, перенос root Task agents на Codex не доказан |
| sa-roles | :13–15,31–35 | роли и N:M mappings; SA-02, отдельная role matrix необходима |
| sa-uc | :16–20 | UC, steps, forms, requirements; SA-03 и cards runtime/slices/errors |
| sa-ui | :13–17 | формы, навигация и FSM; SA-03 и FSM card, полная semantics неизвестна |
| sa-validate | :29–35 | проверка согласованности и покрытия; SA-06 и cards, scopes/exemptions остаются |

BA/SA registry — WP-01-mechanism-registry-ba-sa.md; карточки — WP-01-sa-gap-cards.md и WP-01-ba-more-gap-cards.md. Каждая сокращённая ссылка :line в таблице относится к файлу соответствующего root package. Это statically declared contract, не утверждение об исполнении.
