# WP-01: восемь overlay — package и legacy Codex

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Выборочные статические отличия SKILL; выбранный installed route, resources, gateway и runtime не проверены. DEFER; стоимость/частота UNKNOWN.

| Workflow | Package overlay относительно legacy Codex | Ограничение |
|---|---|---|
| goal | overlay :12–30,198–200 требует graph read-preflight, leaf mutation с fence и package-local proof; legacy :16–26 допускает confirmed legacy-only fallback | GOAL_PROOF/preview не доказывает выполнение /goal |
| init | overlay :18–24,49–75 описывает MCP lifecycle, approval tokens и create-only profiles; legacy :37–55 checkout runner после подтверждения | VERIFIED требует полного evidence; live tools/canary неизвестны |
| migrate-sa | overlay :12–22 требует doctor либо BLOCKED без shell в cache; legacy :16–26 допускает verified legacy-only helper. По сравнению двух SKILL это единственное обнаруженное отличие | Упакованность parser/resources и graph execution не доказаны |
| sa-validate | Overlay :73–74,84–87,183–185 не повторяет некоторые детали legacy :75–81,91–103,199–204: L3.8 coverage_exempt и L3.9 reason, L8 spec_drift budget, L13 overlap_accepted/reason. Overlay L3.7 при этом содержит другие exclusions | Отсутствие в SKILL не доказывает отсутствие в query resources/runtime |
| migrate | Overlay :12–19 ограничивает schema MIG-GATEWAY с backup/approval по окружающему контракту; domain materialization при отсутствии capability BLOCKED, file conversion после backup/approval | File conversion не является graph migration или проверенным restore |
| publish | Overlay :12–19 использует protected ReleaseEnvironment/named read, :72–77 project-relative reconciliation template; legacy :63–68 содержит абсолютный template path | Не доказано наличие template у проекта или live публикация |
| tl-full | Overlay :12–19,211–223 задаёт lease/fence/CAS и same-mutation evidence; legacy :200–209 описывает local claim script. Legacy :74–82 упоминает verify-GREEN infra evidence, overlay :85–93 в этом абзаце его не повторяет | Нельзя объявлять token глобально запрещённым без полной package closure; parseable не равно verified |
| tl-ship | Overlay :46–55 сохраняет remote graph authority и использует fence/heartbeat/idempotent release либо handoff; legacy :46–49 использует claim-lock script | Push не доказывает release, live identity и atomicity неизвестны |

Сокращённый overlay path: codex-plugin-src/workflow-overlays/nacl-<имя>/SKILL.md; legacy: skills-for-codex/nacl-<имя>/SKILL.md. Иные resources могут уточнять semantics; эти строки не являются proof их отсутствия.
