# WP-01: BA-01–09 — заявленные callers, authority и consumers

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Caller означает текстовую точку входа, не наблюдённый вызов; graph persistence, installed routing, реальная частота и цена UNKNOWN. Все группы наследуют DEFER, альтернативы и negative cases находятся в групповых реестрах и gap cards.

| ID | Вход/применимость и заявленный caller | Source of truth и текстовый consumer |
|---|---|---|
| BA-01 context | User или фаза 1 root full nacl-ba-full/SKILL.md:62–69,99; Codex nacl-ba-context/SKILL.md:20–32 требует подтверждение | Подтверждённые SystemContext/Stakeholder/ExternalEntity/DataFlow в graph; Codex nacl-ba-process/SKILL.md:21–26,40–43 читает SystemContext. Полный набор BA→SA consumers не установлен |
| BA-02 process/workflow | User или фазы root full :62–69; Codex process :19–38 и workflow :19–59 требуют исходные процессы и подтверждение | Graph process map/WorkflowStep; root process :14 направляет в workflow, Codex entities :22–25,35–38 читает usage. Прямые SA edges проверить отдельно |
| BA-03 entities/roles | User или root full :74–78; Codex entities :20–40 и roles :19–36 определяют modes и confirmation | Neo4j BusinessEntity/BusinessRole и связи; root nacl-sa-domain/SKILL.md:31–39 и nacl-sa-roles/SKILL.md:31–37 описывают импорт. Actual invocation неизвестен |
| BA-04 glossary | User или root full :74–78; Codex glossary :20–37 разделяет full и incremental | Graph GlossaryTerm/ALIAS_OF/DEFINES; root nacl-sa-finalize/SKILL.md:225–240 ссылается на BA glossary при наличии BA слоя. Полный validator consumer требует проверки |
| BA-05 rules | User или from-board enrich и root full :83–99; Codex rules :19–28,46–60 | Graph entities/steps и подтверждённые формулировки → BusinessRule; handoff root :37–46 описывает связи к SA. Автообновление семантики SA неизвестно |
| BA-06 import/analyze | From-board Codex :55–63 делегирует import и analyze; возможен прямой user call | Client document и provenance → board без graph write; analyze сравнивает board/snapshot/graph и может писать snapshot. Consumer user/orchestrator, sync отдельно |
| BA-07 sync | User или from-board Codex :59–63 на существующем board | Board visual input и graph structured data; Codex sync :19–29,32–47 требует read-back до marker. Consumers board/meta и graph enrichment/validation; atomic crash recovery неизвестен |
| BA-08 validate/handoff | User/from-board или root full :83–99; modes internal/cross/full и full/update | BA graph и опционально SA; Codex validate :19–35 и handoff :19–31,40–54; BA-only cross отмечается неполным. Связь edge не доказывает актуальность смысла |
| BA-09 orchestration | User запускает from-board/full; Codex from-board :19–51 выбирает board, затем specialists | Board — визуальный вход, graph — подтверждённая BA, плюс phase results; Codex full :20–30,32–55 описывает human/SA и readiness. Packaged overlay nacl-ba-full :12–19 имеет отдельный domain capability gap; другие клиенты не приравнивать |

Сокращённые Codex пути в строках относятся к skills-for-codex/nacl-ba-<workflow>/SKILL.md. Потребители и triggers подтверждены на уровне заявленного текста; фактические routing, доступность MCP, atomicity и стоимость остаются UNKNOWN.
