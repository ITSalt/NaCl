# WP-01: SA и TL — выборочные root/Codex контракты

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Точечная сверка текста, не полный semantic diff, не измерение эффекта и не installed/runtime. Root path nacl-<package>/SKILL.md, Codex — skills-for-codex/nacl-<package>/SKILL.md. Неприсутствие фразы в одном фрагменте не доказывает её отсутствия во всём workflow.

## SA: семь non-overlay

| Package | Общий контракт | Выборочное различие |
|---|---|---|
| sa-domain | Root :5–15; Codex :20–27: BA import и domain | Root :25–27 именует MCP; Codex :31–35,107–110 задаёт BLOCKED/partial при недоступности |
| sa-feature | Root :5–16; Codex :20–35: impact и FR | Root :128 описывает goal intake и auto-ship; Codex :29–31,139–150 задаёт иной маршрут, равенство гарантий не установлено |
| sa-finalize | Root :5–16; Codex :20–38: statistics/decision/traceability | Codex :23–24,107–110 делает tooling условием и различает BLOCKED/partial |
| sa-flags | Root :5–11,60–62; Codex :21–30: audit и defaults только отсутствующих metadata | Codex явно требует confirmation backfill; полную root-процедуру отдельно сверять |
| sa-roles | Root :5–15,79; Codex :21–37: roles, CRUD и BA↔SA mappings | Codex :94–97,119–124 условен по graph и partial verification |
| sa-uc | Root :812–850; Codex :333–366: runtime contract и восемь полей | Root Q5 учитывает имя или описание, Codex текст — имя; root явно записывает not_required, references/runtime требуют проверки |
| sa-ui | Root :824–830,874–875; Codex :69–73,87–94: UI FSM и backend-only scope | Root явно уточняет отсутствие Form у пользователя; в приведённом Codex flow этот вопрос не сформулирован, closure неизвестна |

## TL: первая группа восьми non-overlay

| Package | Общий контракт | Выборочное различие |
|---|---|---|
| tl-deliver | Root :12–27,339–353; Codex :14–40: ship/verify/deploy с evidence | Root :345–349 требует verify через Task agent, Codex :150–154 не требует именно такой механизм |
| tl-deploy | Root :12–28,122–140; Codex :16–59: CI/health и SHA | Root :161–167 описывает legacy non-PASS override; Codex :65–76,104–110 использует closed vocabulary, полный mapping не доказан |
| tl-dev | Root :24–37,150–156; Codex :20–42: TECH TDD | Root требует отдельного автора RED; Codex :190–203 допускает прямое выполнение, влияние на качество не измерено |
| tl-dev-be | Root :54–79,171–176; Codex :19–39,58–67: baseline и RED-first | Root запрещает dev самому писать RED tests; Codex :140–150 не требует внешнего автора |
| tl-dev-fe | Root :39–64,198–211; Codex :19–41,57–73: FE TDD | Root делегирует tests/MSW, Codex :166–178 допускает прямое TDD |
| tl-diagnose | Root :14–18,42–48; Codex :14–38: diagnosis без исправления | Root требует трёх Task agents, Codex допускает прямой сбор при недоступности subagents |
| tl-docs | Root :11–21,188–197; Codex :16–38: documentation после review | Codex описывает классы проверок и non-success, идентичное правило скриптов/исключений в указанном срезе не установлено |
| tl-hotfix | Root :38–42,50–64; Codex :20–31,79–86,114–120: экстренный workflow с safeguards | Root описывает direct-main flag и двойное подтверждение; в приведённом Codex срезе точный эквивалент не установлен |

Отсутствие обязательного делегирования в Codex не означает запрета независимого автора. Фактические права, инструменты, эффекты и клиентская closure требуют отдельной проверки.
