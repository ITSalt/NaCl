# WP-01: TL/platform 07.3–10.4 — alternatives и falsifiers

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. DEFER по каждой группе, цена/частота/runtime UNKNOWN. Ни один предлагаемый negative/positive не исполнялся. Заявленный source outcome не является proof runtime; proposed — критерий независимой проверки, не действующий gate.

| ID | Negative input и source/proposed outcome | Риск альтернативы / условие проверки DEFER |
|---|---|---|
| 07.3 | Health 200 без mandatory PROD_GOLDEN_PATH; root nacl-tl-release/SKILL.md:164–170 задаёт non-success. Те же counts с другим edge — proposed semantic negative | Fingerprint/ledger может потерять отдельные QA/sync/exception gates; проверить exact SHA/env и expiry |
| 07.4 | Нет approved review либо чужой staged file; skills-for-codex/nacl-tl-docs/SKILL.md:18–39 описывает non-success при недостающем review | Scoped diff должен сохранять authority/scope/read-back; поведение staged case предложено, не доказано |
| 07.5 | Live graph недоступен, export есть; skills-for-codex/nacl-publish/SKILL.md:17–44 задаёт BLOCKED без export fallback | Remote read-back дополняет, но не заменяет publish; проверить identity/confirmation и partial page/board |
| 08.1 | Goal runtime отсутствует; skills-for-codex/nacl-goal/SKILL.md:48–66 — BLOCKED, preview NOT_RUN | Registry alias не доказывает execution/evaluator; проверить runtime capability и proof |
| 08.2 | Remote graph down при local cache; remote-mode-coordination.md:8–19 запрещает считать cache shared truth | Freshness view не должен утверждать пустой/здоровый graph; проверить partial collectors и source authority |
| 08.3 | Старый report или graph/file divergence; Codex reconcile :19–44 требует freshness/approval/read-back | Semantic diff может принять drifted code за spec; age checks root эвристические, не абсолютный stop |
| 08.4 | Non-SYSTEM с mock-only или missing/stale wire без exception; Codex sync :68–85 задаёт UNVERIFIED | SHA/env attestation должен сохранять wire/exception semantics; fixture не live provider |
| 08.5a | Неизвестный ID format; Codex migrate :29–42,54–58 требует user direction | Общий registry не заменяет deterministic parser/partial graph recovery; сравнить IDs/topology |
| 08.5b | Stale plan hash; package nacl-init :35–49 задаёт BLOCKED/PLAN_TOKEN_STALE | Нельзя потерять project identity/receipt или считать restart verified; проверка по клиентам |
| 08.5c | Исторический случай не сопоставляется gate; Codex postmortem :24–42 требует unmapped | Нельзя выдавать forced attribution за причинность; независимый provenance challenge |
| 09.1 | Remote graph timeout при local cache; remote-mode-coordination.md:13–19 задаёт HALT без stale authority | Versioned file view может потерять graph freshness; проверить все consumers/recovery |
| 09.2 | Graph write произошёл до crash/board marker; Codex ba-sync :19–29,53–63 требует read-back, root :897–902 допускает partial sidecar ok | Snapshot+delta может потерять идентичность/failure metadata; проверить isolated replay |
| 09.3 | Два процесса с одинаковым dev ID; claim-task.mjs:24–32 разрешает тот же claimed_by | Fenced identity должна различать workers и сохранить TTL; Task claim не project mutex |
| 09.4 | Stale fence/revision, иной payload/principal, повтор completed/pending; concurrency-cypher.mjs:54–68,85–120,265–295 задаёт соответствующие исходы модели | Общий transport может потерять auth/scope/atomicity; local model 16/16 не live Neo4j |
| 09.5 | Writer между export и counts, изменённый graph с теми же totals, crash до cleanup; handover-export.sh:49–65,88–97 и import:119–145 | Semantic snapshot требует scoped restore и fingerprint, EXIT trap не доказывает cleanup при SIGKILL; importer опасен для общего graph |
| 09.6 | Resolved nonzero summary, потерянный WS/reconnect; skill-runner.ts:428–441 и run-queue.ts:102–115 задают failed event и completed+exit | Typed terminal state должен сохранять exit/event ordering; UI false PASS не доказан |
| 10.1 | Те же SKILL bytes при иных resources/transforms либо отсутствующий overlay; build-codex-plugin.mjs:345–366 | Shared closure обязана сохранять конкретные paths/semantics; 60 matches не проверяют весь bundle |
| 10.2 | Rewrite doctor и project-read canary; build-codex-skills-only.mjs:179–186, WP-01-skills-only-canary.md:3–5 | Typed transform должен отделять запрет package doctor и разрешённое project read; runtime refusal не доказан |
| 10.3 | Wrong audience/expired token, другой principal, stale fence, missing read-back; services/nacl-mcp/README.md:3–16,27–39 и skills-only contract :106–132 | Общий adapter должен отдельно доказать auth/scope/durability каждого transport, live deployment UNKNOWN |
| 10.4 | Другой SHA, skipped/path-filtered job, непроверенная numeric claim; test-codex-plugin.yml:3–10,38–97 и nacl-interface-metadata.test.mjs:19–22 | Exact-head evidence не заменяет конкретные jobs и raw measurements; CI run не проверен |

Сокращённые имена файлов разворачиваются в соответствующие paths в WP-01-platform-consumer-trace.md и WP-01-group-card-audit.md. Для каждой замены нужны explicit positive и negative controls, authority/identity по клиентам и проверка recovery.
