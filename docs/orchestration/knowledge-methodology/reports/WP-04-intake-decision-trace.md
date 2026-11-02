# WP-04 предварительно: intake → решение и план

NaCl 20fe4c6; source-only, dependency WP-01 открыта. Стоимость, частота и runtime UNKNOWN, DEFER.

Legacy `skills-for-codex/nacl-tl-intake/SKILL.md:19–54` делит запрос, выбирает context и понижает confidence при недоступном graph; неоднозначность исследуется ограниченными read-only probes и scoring, hard-refuse оценкой не отменяется. :55–74 различает route, SPEC_GAP и residual; текст auto-routing и «ship without a prompt» соседствует с confirmation gate :36–42. Это текстовое напряжение, а не доказательство разрешения graph mutation или leaf execution. Interactive middle-band Codex требует prompt, root auto-route ≥0.7 описан для wrapper-only `--autonomous`.

Root `nacl-tl-intake/SKILL.md:72–76,79–102,115–137` описывает `--autonomous` только под goal-wrapper и JSON atoms с evidence, score, risk, dependencies, hard-refuse и residual. `nacl-tl-core/references/intake-scoring.md:51–55,70–76` задаёт defaults 0.7/0.9 и независимость hard-refuse от score: это декларативная шкала, не измеренная вероятность корректности. При неизвестной зависимости root intake допускает empty list, что не доказывает независимость.

Root `nacl-goal/SKILL.md:406–414,457–462` описывает фиксирование плана и topological ordering/cycle BLOCKED; package overlay `codex-plugin-src/workflow-overlays/nacl-tl-intake/SKILL.md:76–84` не разрешает Claude `--autonomous` в Codex. Реальная обработка residual, изменение authorization и selected route UNKNOWN.

Альтернатива — versioned typed decision log с evidence, explicit unknown dependency и human decision. Риски: обойти hard-refuse, потерять residual, scope или стабильный ID при resume. Proposed controls: смешанный atom с auth hard-refuse, graph unavailable, неизвестная dependency, invalid thresholds и resume после изменения текста; positive — подтверждённый безопасный маршрут. Не выполнялись.
