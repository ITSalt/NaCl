# WP-01: core, init, migration и render — карточки

Снимок NaCl 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Все категории DEFER; частота, число вызовов/чтений/записей/подтверждений, время, цена и реальные эффекты UNKNOWN. Это статическое описание контрактов; предложенные проверки не запускались, installed/runtime не доказаны.

## BA migration → context flow

`nacl-migrate-ba/scripts/generate_ba_cypher.py:141–156,330–339` генерирует `SystemContext-[:HAS_FLOW]->DataFlow`, где direction/description — свойства node. Root context reader `nacl-ba-context/SKILL.md:304–320` и `graph-infra/queries/ba-queries.cypher:83–95` ищут `ExternalEntity-[:HAS_FLOW]->SystemContext` и свойства edge; интерактивный context writer также создаёт этот второй вид связи. На fixture только с migration edges указанный reader не получит из DataFlow эти поля; OPTIONAL MATCH может вернуть null-поля, не обязательно пустой список. Другие writers могут добавить искомый edge. Global count по типу HAS_FLOW и audit IR counts не различают endpoints/properties, если остальные counts совпадают. Source-only, graph, diagram и audit не запускались. Proposed controls: один system/external/flow в IR, сравнить оба patterns и reader, отдельно interactive edge; DEFER.

## BA migration audit: IR и исходные документы

Root `nacl-migrate-ba/scripts/audit_ba.py:35–58,95–145` сравнивает supplied graph counts с ожидаемыми counts из уже сформированного BA IR; исходные Markdown он не перечитывает. Поэтому одинаковый пропуск source-элемента в IR и graph не обнаруживается этой проверкой, равно как counts сами не доказывают совпадение IDs, свойств и topology. Root workflow `nacl-migrate-ba/SKILL.md:211–252` ориентируется на process exit и при mismatch требует расследование.

При валидных входах audit JSON может содержать `status:ok` вместе с ненулевым blockers и exit 1 (`audit_ba.py:60–78,88–92`); это не false PASS штатного workflow, который проверяет exit. Другой consumer, игнорирующий exit/blockers, не установлен. Missing input даёт отдельный error/exit 3. Proposed controls: under-extracted IR при совпадающих counts, различающиеся IDs при равных counts, mismatch JSON/exit; независимая сверка source inventory как positive. Global counts иные project scope не исключают; root only, script/graph не запускались, частота UNKNOWN, DEFER.

## CORE-SHARED-01

nacl-core/SKILL.md:3–21,29–55,62–81 задаёт общую project config, schema, ID, MCP и различение main checkout/worktree. Project config — источник контекста, конкретный текстовый consumer nacl-publish/SKILL.md:29–34; фактический вызов и MCP неизвестны. Риск — неверный проект, root или ID, ложный успех при недоступном graph. Альтернатива: typed project-context adapter с проверкой identity/capabilities; нельзя терять общий schema и честный graph-down status. Negative: linked worktree и две конфигурации, недоступный MCP с валидным cache, ID collision; positive: согласованное разрешение root и подтверждённое чтение. Repo Codex skills-for-codex/nacl-core/SKILL.md:13–27, overlay codex-plugin-src/workflow-overlays/nacl-core/SKILL.md:13–23 и skills-only contract codex-plugin-src/package/resources/references/skills-only-runtime-contract.md:20–30 задают разные fallback/doctor контуры; их гарантии не переносить друг на друга. Для замены нужны независимые проверки identity в каждом клиенте.

## INIT-ROOT-01

nacl-init/SKILL.md:12–18,49–55,67–83 описывает инициализацию CLAUDE.md и config.yaml с сохранением существующего и подтверждением неизвестного stack; потребители — проектный Claude и graph skills через core, фактическая загрузка не проверена. Строки :92–125 предписывают auto-migrate legacy инфраструктуры при каждом запуске, тогда как :39–45,385 обещают dry-run без изменений: это текстовая неясность без доказанной мутации. Альтернатива: read-only plan, additive patch, подтверждённая запись и read-back; риск потери существующего content, среды и partial recovery. Negative: custom instructions, неизвестный stack, missing config, stale plan, legacy container и dry-run с side effects; positive: корректные файлы и повторная идемпотентность. Codex public init codex-plugin-src/package/skills/nacl-init/SKILL.md:13–27,35–49,73–99 задаёт AGENTS.md и отдельный контур подтверждений; runtime не проверен.

## MIGRATE-BA

nacl-migrate-ba/SKILL.md:5–12,17–27,35–45,113–125,149–207: legacy Markdown → adapter/BA IR → validation/Cypher → graph и audit; Codex skills-for-codex/nacl-migrate-ba/SKILL.md:12–26,38–62 отдельно описывает подтверждение write и non-PASS. Dry-run пропускает graph write/audit, но создаёт локальные файлы IR/validation/Cypher; он не является полностью read-only и не доказывает восстановление. Root :77–84 называет direct preflight non-blocking, а :93–100 говорит stop без force: текстовая неоднозначность, не доказанное исполнение; shell с || true также маскирует код scanner, а force не указан в таблице параметров. Риск: неизвестный формат, конфликт ID, partial import и loss. Альтернатива: versioned IR и deterministic importer с dry-run diff и semantic audit; риск потери adapter и batch semantics. Negative: ambiguous adapter, duplicate IDs, missing refs, сбой после batch и counts без семантического равенства; positive: изолированный import с semantic read-back и повтором без дублей.

## MIGRATE-SA

nacl-migrate-sa/SKILL.md:5–14,19–32,101–106,120–164,177–200,223–233: SA IR и handoff → validation → graph/audit; Без no-ba при отсутствии BA nodes и наличии BA docs tree source требует остановку; для отсутствующих nodes без BA docs столь же безусловный stop не указан. no-ba явно меняет scope. Coverage SC1–SC7 advisory по умолчанию, strict/min-coverage opt-in: exit 0 не доказывает полноту. Codex skills-for-codex/nacl-migrate-sa/SKILL.md:12–26,31–40,52–75 добавляет preflight и confirmation. Риск: потеря handoff, частичная миграция и пустая детализация. Альтернатива typed IR с semantic importer; риск потери ID и cross-layer edges. Negative: нет BA, unresolved ref, 1/50 заполненных UC, failure mid-batch, загрязнённые counts; positive: применимая fixture, semantic read-back и корректные cross-layer связи либо явно SA-only.

## MIGRATE-CORE

nacl-migrate-core/README.md:1–5,12–26,38–46,55–58 описывает библиотеку IR/parsing/adapter detection и планы для BA/SA; генерация IR/Cypher не означает подключение к Neo4j, graph operations выполняют skills. Фактическую closure и runtime нужно проверить. Риск: частичный парсинг и semantic loss. Альтернатива versioned schema/parser с golden fixtures; риск потери диалектов и детерминизма. Negative: ambiguous dialect, malformed frontmatter, ID collision, потеря поля при правильном синтаксисе; positive: fixture с сохранёнными ID, значениями и topology.

## PUBLISH→RENDER

Root nacl-publish/SKILL.md:16–32,61,805–809,861–888 ссылается на nacl-render excalidraw и четыре команды, тогда как nacl-render/SKILL.md:11–13,751–758 говорит об их удалении и переносе в analyst-tool. Это конфликт текстов; иная внутренняя логика publish и runtime не проверены. Codex skills-for-codex/nacl-render/SKILL.md:12–23 направляет board render к analyst-tool; nacl-publish/SKILL.md:17–27,29–67,74–84 описывает available tooling, reconciliation и confirmation, но не называет тот же backend явно. Альтернатива versioned interface с capability probe и read-back; риск partial pages/boards, stale artifacts и непроверенной внешней записи. Negative: недоступный analyst-tool, устаревшая команда, mismatch manifest, partial publish, drift; positive: согласованные markdown/board из одного snapshot и read-back по каждому target. Render OK не доказывает publish OK.

Условия для изменения DEFER: проверенный producer→consumer→failure/recovery в каждом клиенте, изолированные positive/negative и измеренная стоимость. Реальные migration, публикация и graph writes не запускались.
