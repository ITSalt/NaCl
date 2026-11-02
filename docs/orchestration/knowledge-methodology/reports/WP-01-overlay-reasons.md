# WP-01: назначение 21 overlay по manifest

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41, scripts/codex-plugin-manifest.json:94–117. Категории пересекаются и отражают заявленные причины, не построчный diff или runtime гарантии.

- Graph capability и gap: nacl-ba-full, nacl-sa-architect, nacl-sa-full, nacl-tl-plan, nacl-tl-fix. Например BA pilot сообщает BA_DOMAIN_RESOURCE_UNAVAILABLE для доменного gap, TL plan — TL_NAMED_QUERY_UNAVAILABLE; см. workflow-overlays/nacl-ba-full/SKILL.md:12–19 и nacl-tl-plan/SKILL.md:52–59. Нельзя переносить на другие transports.
- Project identity/preflight и lifecycle: nacl-core, nacl-tl-core, nacl-init, nacl-migrate-sa. Overlay core предписывает package doctor или BLOCKED, legacy Codex допускает иные fallback, skills-only contract запрещает package doctor; см. workflow-overlays/nacl-core/SKILL.md:13–23, skills-for-codex/nacl-core/SKILL.md:13–27 и codex-plugin-src/package/resources/references/skills-only-runtime-contract.md:20–30. Это разные контуры.
- Fenced writes, lease/CAS и подтверждение evidence: nacl-migrate, nacl-publish, nacl-tl-conductor, nacl-tl-full, nacl-tl-next, nacl-tl-ship. Root не доказывает live atomicity, идентификацию агентов одного OS uid или stale-worker refusal; примеры workflow-overlays/nacl-tl-full/SKILL.md:12–19 и nacl-tl-next/SKILL.md:27–51.
- Goal/proof и relocatable references: nacl-goal, nacl-sa-validate, nacl-tl-fix, nacl-tl-reopened. Доступность файла не подтверждает runtime или корректность evaluator.
- Пакетный routing/check и closed status: nacl-tl-intake, nacl-tl-review, nacl-tl-release. Наличие локального scorer или exact FAILED не доказывает актуальность данных и downstream обработку.

Builder scripts/build-codex-plugin.mjs:345–364 выбирает overlay SKILL либо Codex source; WP-01-workflow-source-map.md проверяет 60/60 bytes на закреплённом снимке. Остальные ресурсы/transforms, installed routing и MCP execution остаются неизвестными. Для 39 copied workflow семантическое соответствие root также не следует из совпадения с generated.
