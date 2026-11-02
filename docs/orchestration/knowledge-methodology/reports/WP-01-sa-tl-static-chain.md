# WP-01: SA→TL→frontend — конкретная статическая цепь

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. UC-101 и FE Task — условные ID. Это source-level contracts, в основном skills-for-codex; packaged route и реальное выполнение не предполагаются.

1. Producer: skills-for-codex/nacl-sa-uc/SKILL.md:44–73,276–281 описывает подтверждённые UC, ActivityStep, Form/FormField/MAPS_TO и Requirement/REALIZED_BY; graph write/read-back не наблюдались.
2. Формат: skills-for-codex/nacl-tl-plan/SKILL.md:19–33,131–137 описывает чтение SA context, согласованные .tl task/test/acceptance/API files и UseCase→GENERATES→Task при graph write в scope. Root nacl-tl-plan/SKILL.md:905–966,977–982 дополнительно показывает mapping в файлы; побайтовое равенство клиентов не доказано.
3. Consumer: skills-for-codex/nacl-tl-dev-fe/SKILL.md:19–28,37–48 перечисляет task-fe, test-spec-fe, impl-brief-fe, acceptance и api-contract, outputs и downstream review/sync/conductor. Это не доказывает фактическое чтение каждого AC.
4. Check: FE :57–73 требует baseline и RED по правильной причине, :96–110 result-fe и evidence; skills-for-codex/nacl-tl-sync/SKILL.md:19–36 — call-site/routes и wire gate. Ни test, ни wire не выполнялись.
5. Изменение: skills-for-codex/nacl-sa-feature/SKILL.md:20–42 после подтверждённого SA change описывает version и directed stale для затронутых UC/tasks. Само изменение кода/provider не показано как trigger SA update; вызов из BA handoff не доказан.
6. Recovery/replan: skills-for-codex/nacl-tl-plan/SKILL.md:138–157 описывает сравнение planned_from_version/stale, регенерацию затронутых файлов и стабильных IDs; активные stale tasks и ранее завершённые обрабатываются различно. Это план, не доказательство atomic graph+file, restart или повторной QA.

Не наблюдалась одна воспроизводимая трасса requirement→UC/version→task file→FE commit/test→change→повторная QA. Предлагаемые negatives: два одинаково названных requirements разных UC, прерывание между file и graph stamp, повтор replan, stale shipped vs active, повторная QA после смены scope. Не исполнены; влияние на unrelated/shipped work и CAS/rollback неизвестны.
