# WP-10: содержательные обязанности отсутствующих references

Сверка pinned NaCl 20fe4c6, источник — `plugins/nacl/resources/workflows/references/`, без запуска graph, checker, workflow или A/B. Отсутствие файла в установленной closure не доказывает, что агент нарушил его условия: часть правил может повторяться в других доступных источниках.

| Reference | Source-level назначение и граница |
|---|---|
| `verification-vocabulary.md:3–20,37–40` | Шесть closed outcome statuses и разница между непроверенным, намеренно не запущенным, заблокированным и выполненным неуспешно. Одно название статуса не задаёт наличие evidence |
| `verification-evidence.md:14–32,34–56,101–116,118–155,191–216` | Отдельное Task evidence: test, repo-checks, wire, QA stages, shape; правила aggregate, запись terminal status + evidence в одной операции и заявленные writers/readers. Текст не доказывает фактическую передачу |
| `migration-rules.md:5–20,34–35,55–83` | Pilot адаптации методологии к Codex: язык/модель, доступность capabilities, честный non-PASS и confirmation patterns. Эти исследуемые правила сами не отменяют полученные полномочия владельца в текущей программе |
| `orchestration-model.md:3–12,16–45` | Pilot модель разграничивает Task/subagent, доступность инструментов, handoff input/output/status/consumer и non-PASS. Не доказывает изоляцию или фактическое исполнение |

`migration-rules` и `orchestration-model` в `skills-for-codex/references/` и полном package различаются только завершающей пустой строкой; обе package-копии и два verification-документа не изменялись между c291 и 20fe. Это source comparison, не installed closure.

Для full package `codex-plugin-src/package/runtime/graph-gateway/concurrency.mjs:118–190,253–292` отдельно проверяет синтаксис evidence и same-mutation требования для успешных terminal Task statuses; это не подтверждение фактического прохождения тестов, личности подтверждающего или работы того же parser в Skills-only project MCP.

Альтернатива для будущего исследования — bundle-local required/conditional dependencies и проверка разрешения, с сохранением client-specific contracts. Риски: drift версий, ложное доверие к наличию файла, потеря human decisions и перенос гарантий между transports. Категория DEFER; реальный runtime outcome и стоимость UNKNOWN. [Подсчёт ссылок](WP-10-literal-references-checker.md).
