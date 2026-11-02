# WP-01: SA-01–09 — заявленные callers, authority и consumers

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Caller и consumer — договорные текстовые связи, не наблюдённые вызовы; live graph, installed route, counts и цена UNKNOWN. Все группы наследуют DEFER. Сокращённые root пути — nacl-sa-<workflow>/SKILL.md, Codex — skills-for-codex/nacl-sa-<workflow>/SKILL.md, overlay — codex-plugin-src/workflow-overlays/nacl-sa-<workflow>/SKILL.md.

| ID | Вход/применимость и заявленный caller | Source of truth и текстовый consumer |
|---|---|---|
| SA-01 architect | User или root full :62–72, initial full/module, graph preflight и confirmation | Graph Module/dependencies/NFR и external-contracts file; overlay architect :23–47,249–265,278–297. Overlay TL plan :19–27,35–39,52–59 описывает file-only consumer path по подтверждённому списку при недоступности named graph discovery; graph-complete не доказан. Architect заявляет sync consumer, но прямое чтение файла sync не подтверждено |
| SA-02 domain/roles | Root full :62–72 или direct; IMPORT_BA при существующем BA, CREATE/MODIFY/FULL отдельно | Graph DomainEntity/attributes/relations и SystemRole/permission/mapping; root domain :31–39, roles :31–37, ui :15–17,90–96. Прямое потребление каждого role field требует проверки |
| SA-03 UC/UI | Root full :76–95 или user; stories/detail/UI по scope | Graph UC/Activity/Form/Requirement/UI; Codex uc :23–42 и ui :20–33. Root TL plan :14–20 читает SA context и формирует задачи; прямое чтение graph каждым dev/review не доказано |
| SA-04 feature | User, возможен wrapper goal intake; confirmed scope | Graph SA/spec_version/stale плюс FR file, Codex feature :20–35,39–51,61–65; Codex tl-plan :141–152 читает stamps для replan. Live consistency и полный impact closure неизвестны |
| SA-05 flags | User/workflow audit/backfill/set; Codex flags :19–37,55–70 | Graph metadata и подтверждённые overrides, только metadata; Codex validate :53–60,68–75 потребляет flags. Отсутствие USES_FORM само не доказывает отсутствие UI |
| SA-06 validate | User/router или root full Phase 7 :466–468; internal/cross/full | Live graph reads/schema introspection, overlay validate :32–56; consumers user, full→finalize, release gate root tl-release :164–174. Empty BA не доказывает cross coverage |
| SA-07 finalize | User или root full Phase 8 :504–506; full/module/stats-only | Graph statistics/readiness/traceability; Codex finalize :18–34,42–68. Root допускает Decision/legacy backfill; stats-only read-only. Consumers human/TL и optional views |
| SA-08 full | User/router, полная SA с human phase approvals | BA/user facts, SA graph и phase evidence; Codex full :19–55, root full :466–468,504–506,522–524,545–567 описывают validate→finalize→optional publish/TL. Overlay full :12–18 имеет отдельные fenced capabilities/gaps, не переносить на Skills-only |
| SA-09 router | User system-analysis request; codex-plugin-src/package/skills/nacl-sa/SKILL.md:1–22 | Project-local MCP + read canary и project graph; consumer выбранный leaf и пользователь. Skills-only transport не равен package gateway; canary contradiction и фактическое исполнение неизвестны |

Независимый review выявил дополнительное текстовое противоречие: root nacl-sa-full/SKILL.md:493–494 говорит о создании graph ValidationReport в Phase 7 и :551–553 требует его перед TL handoff, тогда как nacl-sa-validate/SKILL.md:48,2670 описывает validator graph-read-only. Нужен установленный отдельный writer или разрешение разрыва; реальное исполнение не проверено.

Контрактные links не доказывают доступность tools, полный consumer closure, корректную semantic invalidation или успешный write/recovery.
