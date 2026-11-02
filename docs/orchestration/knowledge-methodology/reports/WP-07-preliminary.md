# WP-07: предварительное исследование поставки и публикации

[CI run и revision](WP-07-ci-selection-trace.md) — source-level трасса; runtime UNKNOWN.

Предисследование до приёмки WP-01. NaCl SHA `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; фактические release/CI/deploy/Docmost не запускались. Цена и частота неизвестны, категории DEFER. D-2 исключает поставку NaCl в рамках этой программы.

Три различные цепочки: пользовательский проект `nacl-tl-ship/SKILL.md:51–73` → `nacl-tl-deliver/SKILL.md:87–102` → `nacl-tl-deploy/SKILL.md:12–29,45–76` → `nacl-tl-release/SKILL.md:143–174`; выпуск самого NaCl — `docs/runbooks/framework-release.md:8–21,87–111,117–125,165–182`; граф → render/preview/внешняя публикация — `nacl-publish/SKILL.md:14–26`, `codex-plugin-src/workflow-overlays/nacl-publish/SKILL.md:12–18,24–53`. Успешный render не является фактом внешней публикации.

| Механизм | Защищаемая гарантия / альтернатива |
|---|---|
| Clean checkout | `skills-for-codex/nacl-tl-deploy/SKILL.md:26–76`: свидетельство для exact SHA, CI/deploy/health отдельно. CI attestation может заменить повтор при совпадении SHA, окружения, assets и migration state; это ещё не доказано. |
| Release graph/QA | `nacl-tl-release/SKILL.md:143–174`: QA aggregate, graph snapshot, production golden path; health 200 = HEALTH_ONLY. Счётчики узлов и гистограммы не обнаруживают все изменения свойств или перестановки рёбер. Нужен semantic fingerprint и проверенная согласованность, цена unknown. |
| Docs | `nacl-tl-docs/SKILL.md:188–208,241–289,315–325`: checks и commit. Пример `git diff HEAD~1` до запланированного commit может пропустить текущие правки; нужен fixture staged/unstaged/untracked, live пропуска не наблюдалось. Root пример `git add .` может захватить чужое, без фактического выполнения. |
| External publish | `docmost-sync/src/index.ts:41–72,105–147,172–188`: dry-run/apply/init/rebuild и remote target. Проверить частичный отказ/readback, не выводить external success из generator. |

Negative cases: green health при сломанном user flow; path-filter skipped CI; tag на другом commit; одинаковые graph counts при изменённых свойствах; частичный Docmost publish. Отдельный вопрос `nacl-tl-qa/SKILL.md:47–54,99–104` и release :145–170: какой SHA подтверждает production golden path до promote? Возможны rollout/исключения; необходимость фактической SHA-привязки ещё проверить, не объявлять все релизы невозможными.

Root `nacl-publish/SKILL.md:14–26` упоминает `nacl-render excalidraw`, а `nacl-render/SKILL.md:7,11–13` говорит о переносе board rendering в analyst-tool; это текстовая несогласованность, не наблюдённый отказ. Проверить активный Codex consumer. Исторический framework runbook и Claude builder не доказывают текущую готовность Codex/Skills-only выпуска; остальные контуры проверяются отдельно.
