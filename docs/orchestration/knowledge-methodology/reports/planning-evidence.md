# Предварительная разведка для plan — 2026-11-02

Это не итоговый аудит и не benchmark. Проверен чистый локальный checkout NaCl, main, SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Два scoped read-only scout исследовали области и платформенные слои; координатор выборочно сверил первичные источники. Исходники и инфраструктура не менялись.

| Источник (от корня NaCl) | Наблюдение | Следующая проверка |
|---|---|---|
| codex-plugin-src/README.md:3–16; scripts/codex-plugin-manifest.json:6–67 | Исходники/overlays проецируются в plugins/nacl; Claude builder независим | 01,10: считать обязанности, не копии |
| nacl-tl-full/SKILL.md:107–143 | Документирован L0/L1/L2, пример 10 UC × 8 фаз = 80 L2 агентов | 04,16: фактическая частота и стоимость; число в тексте не замер |
| nacl-tl-full/SKILL.md:912–939 | Graph+JSON dual-write и обязательный diagnose после outage | 09,14: модель частичного отказа и recovery; не считать заявленную атомарность реализованной |
| nacl-ba-handoff/SKILL.md:68–91 | Отдельные фазы и подтверждения handoff | 11: смысл каждого подтверждения |
| nacl-goal/SKILL.md:337,770 | Intake и conduct образуют отдельные процедуры управления | 08,14: дубли планирования и статуса |
| docs/retrospectives/nacl-postmortems-synthesis.md:11–25,68–89 | Исторические false PASS, неполнота спецификаций и drift | 06,17: привязать полезные защиты к дефектам |
| docs/retrospectives/nacl-pilot-W11-report.md:3–7 | VERIFIED относится к analytical replay, не live agent execution | 16,17: не выдавать за доказательство эффективности |
| bench/README.md:3–5,43–73,96–102 | Существующий benchmark измеряет tokens/time и artifact equivalence | 01,16: требует отдельного протокола для software delivery |
| .claude/workflows/README.md:3–32 | Review/postmortem panels отдельно добавляют fanout и synthesis | 06,08,16: стоимость независимого judgment |
| services/nacl-mcp/README.md:3–16 | HTTP carrier использует существующие authorizer/registry | 10,15: различать транспорт и самостоятельную обязанность |

Корневых/родительских AGENTS.md и CLAUDE.md при проверке не найдено; в analyst-tool есть CLAUDE.md. При расширении чтения повторно проверить nested rules. Числа публичных routers/workflows из документации и исторические метрики не принимаются за актуальные без инвентаризации 01. Возможности Harness на этапе plan не проверялись; это задача 15, поэтому готовых утверждений о заменяемости нет.
