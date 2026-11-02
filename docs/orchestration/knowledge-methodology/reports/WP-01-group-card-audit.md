# WP-01: аудит полноты 55 групповых карточек

Основа: spec/research-protocol.md:9–11 и групповые WP-01-mechanism-registry-ba-sa.md, WP-01-mechanism-registry-tl-platform.md. Regex по строкам ID даёт 18 BA/SA + 37 TL/platform = 55 групп, не 55 независимых механизмов. Каждая наследует общий DEFER и UNKNOWN фактической частоты, числа операций и стоимости; отсутствие слова DEFER в строке не означает отсутствие категории. Тексты альтернатив и negative cases — предложения, не выполненные тесты. Ниже пробел конкретной строки, а не утверждение об отсутствии информации во всём репозитории. Потребитель в стрелке — заявленный, если не отмечено иное; фактический вызов неизвестен.

Для всех 55 ещё нужны явно применимость по mode, вызывающий, source of truth, подтверждённая или UNKNOWN связь с consumer, индивидуальные история/confidence, утрачиваемая гарантия и falsifier/условие DEFER. Историческую причинность и эффективность не подставлять из названия механизма.

## 18 BA/SA групп

| ID | Заявленный consumer / область | Существенный уточняемый пробел |
|---|---|---|
| BA-01 | context→process/BA→SA | caller, graph authority, фазы и факт потребления |
| BA-02 | process/workflow→SA candidates | SA consumer и phase-gate applicability |
| BA-03 | entities/roles→SA domain/roles | N:M связь, режим и актуальность |
| BA-04 | glossary→BA/SA | конкретный consumer и destructive full vs incremental |
| BA-05 | rules→SA Requirement/handoff | graph SoT и фактический consumer |
| BA-06 | import/analyze→sync | board vs graph authority и provenance |
| BA-07 | sync→metadata | downstream consumer, dual-write и recovery |
| BA-08 | validate/handoff→SA readiness | применимость каждого уровня и конкретный consumer |
| BA-09 | from-board/full→owner/specialists | session state, handoff и human gates |
| SA-01 | architecture→TL/sync | кто читает конкретный artifact и package gap scope |
| SA-02 | domain/roles→UC/UI | кто читает outputs и applicability modes |
| SA-03 | UC/UI→dev/review | конкретный artifact, caller и source of truth |
| SA-04 | feature→TL | какой consumer читает какие stale поля |
| SA-05 | flags→L5.1/checks | остальные exemptions и потребители |
| SA-06 | validation→finalize/TL | уровни, scope, empty layer и consumer evidence |
| SA-07 | finalize→owner/TL | конкретная актуальная версия и запись Decision |
| SA-08 | SA full→TL | фазовые human gates и подтверждение потребления |
| SA-09 | router→leaf | active installed route и canary contradiction |

## 22 группы TL 04–07

| ID | Заявленная область | Существенный уточняемый пробел |
|---|---|---|
| 04.1 | intake→SA/TL/fix/dev | caller, graph/file authority, ambiguous outcome |
| 04.2 | plan→исполнители/status | mode/authority, external contract и исключения |
| 04.3 | next→исполнитель | local/remote SoT, worker identity и fencing |
| 04.4 | full→conductor | graph/cache authority и downstream statuses |
| 04.5 | conductor→owner/release | source precedence и конфликт |
| 04.6 | TL core→workflows | per-operation caller/SoT и role binding |
| 05.1 | TECH dev→review | режим инфраструктуры и runner authority |
| 05.2 | BE/FE dev→review/sync | RED reason, result и conductor/ship consumers |
| 05.3 | fix→review | reopened/hotfix caller и authoritative spec |
| 05.4 | stubs→release | review consumer и empty/shape cases |
| 05.5 | reopened→tracker | tracker/graph authority и partial result |
| 05.6 | hotfix | consumer, branch policy и recovery |
| 06.1 | regression→dev/review | caller, независимость автора, причина RED |
| 06.2 | review→ship | reopened, stub gate и exact-SHA freshness |
| 06.3 | verify-code→verify | code/E2E applicability и SoT AC/commit |
| 06.4 | QA/verify→release | stage matrix, consumer fields и aggregate conflict |
| 06.5 | sanitizer probes | real consumer/graph и независимый downstream check |
| 07.1 | ship/deliver→deploy | per-UC status, authority и phased relation |
| 07.2 | deploy | concrete consumers, exact environment/SHA |
| 07.3 | release | caller, graph/version authority и status mapping |
| 07.4 | docs→commit | review approval, spec vs code и tracking |
| 07.5 | publish→remote docs | graph/SHA authority и фактический analyst-tool route |

## 15 групп control и platform

| ID | Заявленная область и источник | Существенный уточняемый пробел |
|---|---|---|
| 08.1 | goal: skills-for-codex/nacl-goal :48–66,159–181 | подтверждённый evaluator/caller; migrate canary — placeholder |
| 08.2 | diagnose/status: package nacl-diagnose :8–36, Codex status :13–40 | remote graph authority, local fallback и leaf routing |
| 08.3 | reconcile: Codex :14–44,55–59, root :94–164,511–522 | freshness и upstream status mapping, не считать code безусловной spec |
| 08.4 | sync: Codex :19–36,40–80 | действительный wire consumer, route pairing и W4 exception |
| 08.5 | migration/init/postmortem | это разные механизмы с разными SoT и consumers; разделить |
| 09.1 | remote coordination: remote-mode-coordination :3–19,50–61 | remote authority, graph/JSON split и replay |
| 09.2 | board sync: nacl-ba-sync :11–17,89–128,832–860 | graph write до board marker, partial sidecar и retry |
| 09.3 | developer ID/task claim: resolve-developer-id и claim-task | ID может совпадать, не authenticated principal и не project mutex |
| 09.4 | gateway concurrency: concurrency-cypher :136–165,279–295 | stale fence, auth, revision и live atomicity |
| 09.5 | backup/restore: handover-import :80–145, backup-contract :28–74 | destructive wipe, counts vs semantic state, отдельный restore |
| 09.6 | analyst queue: skill-runner :428–441, run-queue :102–115 | completed/nonzero vs event, UI/reconnect и batch semantics |
| 10.1 | builder: build-codex-plugin :332–369,426–473 | 60 SKILL matches не проверяют полный tree/installed |
| 10.2 | skills-only: builder :179–186,245–278 и checker :40–89 | dynamic closure, text rewrite и canary vs doctor |
| 10.3 | runtime: nacl-mcp README :3–16,27–45 и skills-only contract :106–132 | разные auth, scope, durability и фактический deployment |
| 10.4 | CI: test-codex-plugin.yml :38–56,70–97 | exact event/head, required checks и run result |

Источники с сокращёнными путями и ссылками в исходных групповых строках требуют развёртывания и проверки по pinned commit, не угадывать их. Последующий аудит: по каждому applicable mechanism явно EXPLICIT / INHERITED / UNKNOWN / MISSING / AMBIGUOUS для полей протокола и evidence; ручной review обязателен, один regex считает строки/метки и не доказывает semantic completeness.
