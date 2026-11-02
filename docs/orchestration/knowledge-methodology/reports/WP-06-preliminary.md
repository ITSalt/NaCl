# WP-06: предварительное исследование review и QA

[Per-AC review и evidence](WP-06-per-ac-review-trace.md) — отдельная source-level трасса, без runtime вывода.

Предисследование до приёмки WP-01. NaCl SHA `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`. Источники показывают заявленные проверки, не их выполнение; цена, частота и реальная эквивалентность сред unknown, классификация DEFER.

| Механизм | Контракт и потребитель | Альтернатива и риск |
|---|---|---|
| Regression test | `nacl-tl-regression-test/SKILL.md:21–46,89–112`, Codex `skills-for-codex/nacl-tl-regression-test/SKILL.md:17–47`: ожидаемое поведение, RED, evidence | Независимый автор теста/CI contract; необходимо сохранить meaningful RED. Root отдельного автора нельзя автоматически считать гарантией Codex. |
| Review | `codex-plugin-src/workflow-overlays/nacl-tl-review/SKILL.md:14–46,146–179`: reachability/criteria, repo checks, stubs, архитектура | Перенос в CI требует binding exact SHA, required check и доказанного coverage; риск false PASS. |
| Test-author → review (root) | `nacl-tl-dev-be/SKILL.md:171–199,256–260` требует отдельного regression-test субагента и result-be по шаблону; `nacl-tl-core/templates/result-template.md:53–74` фиксирует test path и RED, но не содержит явного поля автора/seam. При одной Git identity `nacl-tl-review/SKILL.md:591–613,622–642` требует подтверждение seam в dev result и при отсутствии ставит MAJOR; этот MAJOR на review layer не блокирует APPROVED при остальных выполненных gates. | Явный provenance и независимо проверяемая lineage; риск принять самоописание за доказательство или требовать недоступную identity. Отсутствие записи не доказывает отсутствия субагента; runtime review и отдельный ship gate UNKNOWN. Proposed negative/positive controls не выполнены; Codex версии требуют отдельной сверки. |
| Verify code | `nacl-tl-verify-code/SKILL.md:54–80,332–353,408–424`, Codex `skills-for-codex/nacl-tl-verify-code/SKILL.md:112–150`: dataflow, baseline/postfix и coverage | Повторное использование CI evidence допустимо исследовать только при совпадении среды, версии и набора тестов; Codex partial с иными условиями не равен root PASS. |
| QA/verify | `skills-for-codex/nacl-tl-qa/SKILL.md:17–31,36–61`, `nacl-tl-verify/SKILL.md:54–65,128–155`, Codex `skills-for-codex/nacl-tl-verify/SKILL.md:17–39` | Fixture, local runtime, wire, provider и live — разные классы; повтор не доказан. Сравнить integrity gate active bundle и условия повторного использования evidence. |

Отрицательные сценарии для последующей проверки:

1. `codex-plugin-src/workflow-overlays/nacl-tl-full/SKILL.md:174–182` ставит review до QA, а Codex `codex-plugin-src/workflow-overlays/nacl-tl-review/SKILL.md:89–96,118–127` требует QA evidence для не-exempt UC. Возможен цикл при новом UI без evidence; проверить активный packaged путь и возможные исключения, не заявлять live deadlock.
2. Root review `nacl-tl-review/SKILL.md:103–127` выбирает package manager/config; Codex overlay `:146–179` жёстко описывает pnpm workspace. Проверить npm baseline с валидными repo_checks и одинаковыми требованиями; не выдавать статическую формулировку за наблюдённый отказ.
3. Root `nacl-tl-verify-code/SKILL.md:347–353,413–424` имеет общую инструкцию UNVERIFIED без baseline, но отдельная таблица явно рассматривает no-baseline при наличии postfix failures. Проверить no-baseline + zero failures; это неоднозначность, не доказанный ложный PASS.
4. FAILED + обязательный NOT_RUN: проверить приоритет aggregation по `codex-plugin-src/package/resources/workflows/references/verification-evidence.md:41–49`; потенциальная потеря градации FAILED остаётся non-success.

Исторический класс false PASS описан в `docs/retrospectives/nacl-postmortems-synthesis.md:11,21–25,68–75`; причинную связь каждого текущего gate и реальную цену предстоит подтвердить. Тесты, граф и live QA не запускались.
