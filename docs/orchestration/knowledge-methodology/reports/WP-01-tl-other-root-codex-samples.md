# WP-01: остальные TL и shared workflows — выборка root/Codex

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Статическая выборка текстов, не полный diff и не runtime/installed test. Ссылки TL относятся к nacl-tl-<имя>/SKILL.md и skills-for-codex/nacl-tl-<имя>/SKILL.md.

| Workflow | Общий контракт | Точечное различие |
|---|---|---|
| qa | Root :49–54,73–85; Codex :17–31,36–48: шесть стадий и формула | Root вступление :5–15 предполагает Playwright MCP, Codex :218–229 делает capability условной; текстовая коллизия FAILED/NOT_RUN описана отдельно |
| reconcile | Root :5–10; Codex :17–32: диагностировать drift и синхронизировать docs | Codex :19–25,90–101 оговаривает доступность diagnosis и остановку перед записью; полнота root confirmation не проверена |
| regression-test | Root :5–13; Codex :17–26,30–40: RED до реализации, без production code | Root :354 требует subagent при определённых skill вызовах, прямой вызов пользователя допускает main; Codex в приведённом срезе не требует отдельного subagent |
| status | Root :5–16; Codex :17–24: graph Task/Wave и локальный fallback при допустимости | Codex :28–34 запрещает вывод SA coverage из одного .tl/status.json, :86–97 задаёт closed vocabulary; root целиком не сопоставлен |
| stubs | Root :5–10,96–104,166; Codex :34–46,293–304: scan/shape | Codex формализует partial/unverified для no-test scopes; root также обсуждает empty-test, отсутствие защиты не утверждается |
| sync | Root :5–10; Codex :17–33: BE/FE API и типы | Codex :203–214 явно делает runner/tracker/graph условными; wire gate нельзя приписывать только одной версии |
| verify | Root :5–10; Codex :17–34: code и conditional E2E | Codex :88–99 требует доступного evidence; root 60%+ — утверждение источника без проверенного измерения |
| verify-code | Root :5–11; Codex :19–33: data-flow и contracts | Root перечисляет legacy headlines, Codex :222–233 closed statuses; equivalence и потребители требуют проверки |

## Прочие три workflow

- **nacl-migrate-ba:** root :17–27,149–207 и Codex :12–26 описывают parser→IR→validation и dry-run без graph writes. Root :77–84 и :93–100 неоднозначно описывает preflight warn/stop, Codex :46–62 говорит may stop и отдельные статусы. Ни одна миграция не запускалась.
- **nacl-postmortem:** root :14–34,85–93 и Codex :15–18,24–42,59–65 описывают анализ post-done bugs и отчёт без правки skills. Root :36–50,78–83 предпочитает Claude dynamic panel, Codex :20–22,29–42 portable prose и conditional parallel. Независимость, качество и цена не измерены.
- **nacl-render:** root :11–13,29–40 и Codex :12–23,29–38 описывают Markdown/Mermaid; root :751–758 переносит board generation в analyst-tool, Codex :20–23,43–57 делает backend условным и даёт non-PASS. Publish→render trace и его ограничения — WP-01-publish-render-trace.md.

Эти выборки по одной проверенной обязанности для всех 39 non-overlay workflow не заменяют полную inventory каждого механизма, client closure или наблюдение фактического выполнения.
