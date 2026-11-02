# WP-01: ADR и methodology — исторические источники

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Read-only обзор, не независимое подтверждение исторической причинности, текущего runtime, опубликованного продукта или семантики переводов.

## Пять ADR

| ADR | Дата и статус источника | Тема и связь, которую ещё нельзя переоценивать |
|---|---|---|
| docs/adr/001-configurable-ir-schema.md:1–4,9–23,77–94 | 2026-04-13, Proposed | schema-as-YAML/GenericIR vs текущие BA IR patterns; предложенная реализация не доказана |
| docs/adr/002-intake-scoring-rubric.md:1–4,11–37,73–82 | 2026-06-07, Accepted | deterministic intake scoring; overlay nacl-tl-intake :43–59 описывает rubric, не доказывает calibration и причинность инцидента |
| docs/adr/003-codex-plugin-pilot-decision-set.md:1–4,32–47,49–62 | 2026-07-14, Accepted in part | local pilot packaging/identity/lease; исторические acceptance claims не являются текущей проверкой |
| docs/adr/004-codex-production-app.md:1–8,12–30 | 2026-07-15, Superseded by ADR-005 | app-plus-skills/public HTTP OAuth — историческое решение. services/nacl-mcp остаётся отдельным исходным контуром, deployment неизвестен |
| docs/adr/005-codex-skills-only-bootstrap.md:1–7,19–33,77–105 | 2026-07-20, Accepted for implementation, supersedes ADR-004 | Skills-only/project-local MCP/bootstrap; не доказывает публикацию, active routing или installed runtime |

Статус ADR не доказывает непосредственного происхождения каждой строки кода. Historical official-doc snapshots в ADR датированы и не являются свежей проверкой внешней документации.

## docs/methodology: обзор и точечные расхождения

docs/methodology/README.md:7–24 и 14 файлов области описывают why/механики BA, SA, handoff, validation и graph. Оглавления EN/RU просмотрены, полная эквивалентность переводов и все claims не проверены.

- overview.md:29–57,92–124 описывает слои, graph SoT и human gates; :70 содержит 550 vs 150k/99.6% claim без установленного в этом исследовании provenance и сопоставимости.
- ba-layer.md:13–46,182–206,210–253 описывает process, CRUD и board sync; конкретный downstream change_marker требует отдельной сверки. :214–216 обобщает DOCX/PDF/XLSX на извлечение steps, тогда как root nacl-ba-import-doc/SKILL.md:87–93 и Codex skills-for-codex/nacl-ba-import-doc/SKILL.md:54–55 исключают workflow steps из XLSX. Это расхождение текстов, не runtime failure.
- sa-layer.md:11–39,99–200,229–268 и validation.md:25–35,39–150 описывают SA и уровни проверок. sa-layer :268 одновременно называет validation read-only и output graph ValidationReport; validator root :29–48 запрещает запись, writer не найден в проверенной области. См. WP-01-sa-validation-report-trace.md.
- handoff.md:13–36,85–123,155–169 описывает четыре BA→SA edges и rescan; :149 упрощает XL6–XL9 как reverse checks, тогда как validation.md:123–134 и nacl-sa-validate/SKILL.md:2237–2256,2360–2374 различают forward CRITICAL и reverse WARNING с exemptions. 95% target :143 и его consumer требуют отдельной сверки.
- graph-philosophy.md:13–33,79–105 обосновывает graph и board sync; :97 обещает выравнивание после graph edits/re-sync. Направление graph→board и conflict/deletion recovery не доказаны проверенной цепью.

Полный аудит 14 файлов, локалей, исторических claims и каждого downstream consumer остаётся открытым; все наблюдения выше — статические.
