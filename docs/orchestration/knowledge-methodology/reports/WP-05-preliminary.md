# WP-05: предварительное исследование разработки и исправлений

[BE baseline и классификация](WP-05-be-baseline-trace.md) — отдельная source-level таблица, без runtime результатов.

[FE baseline и RED handoff](WP-05-fe-red-handoff.md) — отдельная source-level трасса, без runtime вывода.

Предисследование до приёмки WP-01. Снимок NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; источники описывают правила, а не зафиксированный runtime. Фактические частота, counts, время и стоимость unknown; кандидаты предварительно DEFER.

| Механизм | Доказательство и потребитель | Возможная альтернатива / утрачиваемая гарантия |
|---|---|---|
| TECH | `skills-for-codex/nacl-tl-dev/SKILL.md:20–28,59–101`: self-contained task, baseline/RED/GREEN или команда до/после и verification.md; review/conductor | Краткий task и CI attestation; риск потери baseline и привязки к ресурсу. |
| BE/FE | `skills-for-codex/nacl-tl-dev-be/SKILL.md:19–39,48–92`, `nacl-tl-dev-fe/SKILL.md:19–35,43–73,96–114`: contract, failure-set baseline, RED/GREEN, report | Один исполнитель для малого среза + независимый API test; риск самоподтверждения и расхождения типов. |
| Fix | `codex-plugin-src/package/skills/nacl-fix/SKILL.md:8–18`, `codex-plugin-src/workflow-overlays/nacl-tl-fix/SKILL.md:41–59,78–108,142–149,218–226`: классификация L0–L3, spec-first и evidence | Typed fix contract и test delta; риск drift для L2/L3, если убрать проверку спецификации. |
| Stubs | `nacl-tl-stubs/SKILL.md:13–28,86–105`: registry, severity, scan и UNVERIFIED | Consumer contract tests с recorded payload; риск непокрытых путей и неэквивалентного провайдера. |
| Reopened | `nacl-tl-reopened/SKILL.md:13–38`, Codex overlay :57–96: authoritative status, исправление, review/stub | Типизированный результат вместо разбора текста, с версионированием всех потребителей. |
| Hotfix | `nacl-tl-hotfix/SKILL.md:38–40,62–70`, `skills-for-codex/nacl-tl-hotfix/SKILL.md:20–31,66–105`: urgent triage, dirty-tree защита, baseline и полномочия | Общий incident workflow с risk-based gates; риск потери восстановления и owner consent. Root допускает auto-merge, Codex требует подтверждения; D-2 запрещает внедрение/поставку в этой программе. |

Статические negative cases: root `nacl-tl-dev-fe/SKILL.md:93–103` требует остановиться без API contract, но :114–120 говорит продолжить после предупреждения; `skills-for-codex/nacl-tl-dev-fe/SKILL.md:43–55` требует BLOCKED. Код/сессия не запускались.

В Codex overlay `nacl-tl-fix/SKILL.md:83–88,142–149,218–226` L1 описан как кодовый дефект при правильной спецификации, но одновременно для L1+ требуется предшествующий spec-update либо исключение. Текст установленного Skills-only 0.2.2 воспроизводит это расхождение; реальный отказ не наблюдался. Испытать L1 с корректной спецификацией, затем L2/L3 с реальным drift; не удалять защиту до проверки. Формулировки live graph и export evidence также требуют сверки на активном пути. Все оценки остаются предварительными, WP-01 и WP-05 не приняты.
