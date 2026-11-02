# WP-10: full package → Skills-only dependency closure

Источник pinned NaCl 20fe4c6, статическое чтение. Builder, checker, tests, graph, workflows и A/B не запускались.

Full builder `scripts/build-codex-plugin.mjs:345–369` копирует workflow leaf и затем всё codexSource дерево, включая `resources/workflows/references/*.md`; соответствующие файлы есть в pinned Git. Skills-only builder `scripts/build-codex-skills-only.mjs:240–257,267–282` начинает с Markdown links public entry и выбранных leaf SKILL, затем рекурсивно добавляет Markdown inline links и статические относительные JS imports. Путь в backticks сам по себе не является dependency edge; файл может попасть через другой seed/link, поэтому отсутствие одного ребра само по себе не доказывает отсутствие файла.

Пример BA: public `plugins/nacl/skills/nacl-ba/SKILL.md:8–10` ссылается Markdown-ссылкой на ba-codex-contract, который присутствует в установленной BA closure. BA full leaf :24–27 требует в backticks orchestration-model, migration-rules и verification-vocabulary; три нормализованных BA target отдельно проверены как отсутствующие в установленном bundle. Active skill runtime contract :32–37 не разрешает использовать соседний skill/checkout как локальную замену. Активный route и фактическое поведение неизвестны.

`scripts/check-skills-only-bundle.mjs:20–21,76–90` проверяет inline Markdown links, но не backticks. `tests/codex-plugin/scripts/nacl-submission-readiness.test.mjs:68–115` описывает два чистых build, сравнение digest и вызов checker; в указанном тесте нет negative fixture для отсутствующего backtick reference. Его успешный результат сам по себе не устанавливал бы наличие 22 ранее найденных bundle-local targets; этот тест здесь не выполнялся.

Альтернатива для будущего исследования — явный required/conditional dependency manifest и package-local проверка разрешения. Риски: включить лишние/private resources, смешать transports и приравнять наличие файла к работающему MCP или семантически достаточному контракту. Категория DEFER, цена и runtime UNKNOWN. Сводный [подсчёт references](WP-10-literal-references-checker.md).
