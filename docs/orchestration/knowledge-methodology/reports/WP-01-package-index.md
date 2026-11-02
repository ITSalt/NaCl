# WP-01: индекс root packages

Снимок NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; источник множества: `scripts/codex-plugin-manifest.json:6–68`. Назначение рассчитано по разрешённым путям WP-02…10 с помощью glob. Описания — первые строки поля description root SKILL, заявленные обязанности, не подтверждение работы и не исчерпывающая инвентаризация механизмов. Ресурсные пакеты без root SKILL отмечены отдельно. Стыковые WP-11…14 и overlays здесь не повторяются.

Независимая сверка по git show pinned SHA: 59/59 первых строк совпали; набор 61 строки совпал с manifest, два resource package не имеют root SKILL. Полное содержимое и runtime эта проверка не подтверждает.

| Root path | Тематический WP | Заявленное описание |
|---|---|---|
| `nacl-ba-analyze/` | WP-02 | Анализ Excalidraw-доски бизнес-процесса: полнота, diff со snapshot, сравнение с Neo4j-графом. |
| `nacl-ba-context/` | WP-02 | Define system boundaries in Neo4j graph: scope, stakeholders, external entities, data flows.— all data stored as graph nodes and edges. |
| `nacl-ba-entities/` | WP-02 | Catalog business entities in Neo4j: stereotypes, attributes, states, CRUD matrix.Use when: model entities with graph, create entity catalog, or the user says "/nacl-ba-entities". |
| `nacl-ba-from-board/` | WP-02 | Orchestrator skill: unified BA-board workflow combining import_doc + analyze + sync. |
| `nacl-ba-full/` | WP-02 | Full BA model creation in Neo4j via 10-phase orchestration. |
| `nacl-ba-glossary/` | WP-02 | Build ubiquitous language glossary in Neo4j: terms, definitions, synonyms, links.Use when: create glossary with graph, define terms, or the user says "/nacl-ba-glossary". |
| `nacl-ba-handoff/` | WP-02 | Generate BA→SA handoff package from Neo4j: traceability matrix, automation scope, |
| `nacl-ba-import-doc/` | WP-02 | Parse a client document (DOCX/PDF/XLSX/text) and place extracted business-process |
| `nacl-ba-process/` | WP-02 | Build business process map in Neo4j: process groups, processes, links, roles.— all data stored as graph nodes and edges. |
| `nacl-ba-roles/` | WP-02 | Identify and describe business roles in Neo4j: departments, responsibilities, |
| `nacl-ba-rules/` | WP-02 | Catalog business rules in Neo4j: constraints, calculations, invariants, authorization.Use when: extract business rules with graph, classify rules, or the user says "/nacl-ba-rules". |
| `nacl-ba-sync/` | WP-02 | Синхронизация Excalidraw-доски с Neo4j графом: элементы доски становятся узлами и рёбрами. |
| `nacl-ba-validate/` | WP-02 | Validate BA model consistency via Cypher: L1-L8 internal checks, |
| `nacl-ba-workflow/` | WP-02 | Build activity diagrams for business processes in Neo4j: workflow steps, |
| `nacl-core/` | WP-02, WP-03, WP-09 | Shared references, templates, and utilities for all nacl-* skills. |
| `nacl-goal/` | WP-08 | Safety-first wrapper around Anthropic's /goal command. Resolves a high-level |
| `nacl-init/` | WP-08 | Initialize a new project with CLAUDE.md containing development rules, |
| `nacl-migrate/` | WP-08 | Orchestrator: migrate an OLD-methodology project (Markdown BA/SA docs) into |
| `nacl-migrate-ba/` | WP-08 | Migrate an OLD-methodology BA layer from Markdown to Neo4j. Parses |
| `nacl-migrate-core/` | WP-08 | resource package; root SKILL отсутствует |
| `nacl-migrate-sa/` | WP-08 | Migrate an OLD-methodology SA layer from Markdown to Neo4j. Parses |
| `nacl-postmortem/` | WP-08 | Post-mortem of a project built end-to-end via nacl-* skills: for each |
| `nacl-publish/` | WP-07 | Публикация графа в Docmost и генерация Excalidraw-бордов. |
| `nacl-render/` | WP-07 | Convert Neo4j graph data into Markdown documents with Mermaid diagrams. |
| `nacl-sa-architect/` | WP-03 | Декомпозиция системы на модули (Bounded Contexts), построение Context Map и определение NFR. |
| `nacl-sa-domain/` | WP-03 | Domain Model through Neo4j graph: DomainEntity, DomainAttribute, Enumeration, relationships. |
| `nacl-sa-feature/` | WP-03 | Incremental feature specification via Neo4j graph. Impact analysis through |
| `nacl-sa-finalize/` | WP-03 | Finalize specification via Neo4j: statistics, glossary, ADR, traceability matrix, |
| `nacl-sa-flags/` | WP-03 | Backfill validation-exemption properties on SA-layer nodes (has_ui, system_only, |
| `nacl-sa-full/` | WP-03 | Full SA specification in Neo4j via 10-phase orchestration. |
| `nacl-sa-roles/` | WP-03 | System roles and permission matrix through Neo4j graph: SystemRole, HAS_PERMISSION, MAPPED_TO. |
| `nacl-sa-uc/` | WP-03 | Реестр Use Cases из BA automation scope + детализация UC (Activity, формы, требования) |
| `nacl-sa-ui/` | WP-03 | UI architecture through Neo4j graph: navigation, components, form-domain mapping verification, |
| `nacl-sa-validate/` | WP-03 | Validate specification consistency through Neo4j Cypher queries. |
| `nacl-tl-conductor/` | WP-04 | Graph-aware batch process manager: intake to staging. |
| `nacl-tl-core/` | WP-04, WP-09 | resource package; root SKILL отсутствует |
| `nacl-tl-deliver/` | WP-07 | Delivery orchestrator: push feature branch, wait for CI, verify on staging, health check. |
| `nacl-tl-deploy/` | WP-07 | Monitor CI/CD deployment (GitHub Actions), run health checks, update YouGile. |
| `nacl-tl-dev/` | WP-05 | Infrastructure and TECH task development using TDD workflow. |
| `nacl-tl-dev-be/` | WP-05 | Backend TDD development from task specifications. |
| `nacl-tl-dev-fe/` | WP-05 | Frontend TDD development from task specifications. |
| `nacl-tl-diagnose/` | WP-08 | Project health diagnostic — analyzes git history, documentation drift, |
| `nacl-tl-docs/` | WP-07 | Documentation updates for approved tasks. |
| `nacl-tl-fix/` | WP-05 | Spec-first bug fixing with automatic documentation sync. |
| `nacl-tl-full/` | WP-04 | Graph-aware full lifecycle orchestrator. Reads waves/tasks from Neo4j, |
| `nacl-tl-hotfix/` | WP-05 | Emergency hotfix to main: stash/cherry-pick changes, create hotfix branch |
| `nacl-tl-intake/` | WP-04 | Graph-aware request triage: queries Neo4j to disambiguate features vs bugs. |
| `nacl-tl-next/` | WP-04 | Graph-aware next task recommendation with SA context enrichment. |
| `nacl-tl-plan/` | WP-04 | Graph-based development planning from SA specifications in Neo4j. |
| `nacl-tl-qa/` | WP-06 | E2E QA testing for UC tasks using MCP Playwright. |
| `nacl-tl-reconcile/` | WP-08 | Emergency documentation-code reconciliation. |
| `nacl-tl-regression-test/` | WP-06 | Writes a test authored by a separate sub-agent (test-author isolation seam). |
| `nacl-tl-release/` | WP-07 | Full release pipeline: merge verified PRs to main, wait for production CI, |
| `nacl-tl-reopened/` | WP-05 | Process tasks from YouGile Reopened column (failed verification/QA). |
| `nacl-tl-review/` | WP-06 | Code review for completed tasks (BE, FE, or TECH). |
| `nacl-tl-ship/` | WP-07 | Commit, push, create PR, and update YouGile after development. |
| `nacl-tl-status/` | WP-08 | Graph-aware project status with SA coverage metrics. |
| `nacl-tl-stubs/` | WP-05 | Scans codebase for stubs, mocks, and placeholder code. |
| `nacl-tl-sync/` | WP-08 | Verifies BE/FE synchronization for a UC task. |
| `nacl-tl-verify/` | WP-06 | Verification orchestrator: code analysis + E2E testing + YouGile reporting. |
| `nacl-tl-verify-code/` | WP-06, WP-08 | Static code analysis to verify implementation correctness. |
