# WP-01: индексация областей вне 61 root package

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Назначение означает read-scope и пример источника, не доказательство полной инвентаризации или runtime. Work packages находятся в workspace NaCl-orch; источники ниже — NaCl.

| Область / source example | Исследовательский WP | Граница |
|---|---|---|
| .github/workflows/test-codex-plugin.yml:3–10,38–56,70–97 и build-cli.yml | WP-10 | YAML определяет jobs, не фактический run/head; это не дополнительные skills |
| graph-infra/schema, queries, scripts; handover-export.sh:49–65, import:80–145 | WP-09 | Legacy full import и local snapshot — разные контуры, restore не доказан |
| analyst-tool/server/src/routes/skills.ts:31–49, services, web | WP-09; build integration WP-10 | runId не означает completion, event/ring не доказывают UI false PASS |
| yougile-setup/src/index.ts:153–175,204–221,293–310 | WP-10 | Tracker API не вызывался; downstream эффект generated config unknown |
| docmost-sync/src/index.ts:39–72,102–110 | WP-07 | dry-run и внешняя запись разные; автоматическая связь с каждым publisher path не доказана |
| codex-plugin-src, skills-for-codex, scripts, services/nacl-mcp; generated plugin/ и plugins/nacl | WP-10, mapping в WP-01-workflow-source-map.md | Source/overlay/generated — provenance, не независимые механизмы; installed/runtime отдельно |
| docs/methodology, напр. validation.md:35 и sa-layer.md:266–268 | WP-01 общий read scope, docs/runbooks — WP-07, retrospectives — WP-16/17 | Документы — claims, не runtime; прочие подразделы требуют отдельного назначения или обоснованного исключения |
| tests/fixtures, bench, historical traces | WP-16 и независимый challenge WP-17 | Fixture не подтверждает live state, bench может быть специфичен для Excalidraw |
| вложенный private meta/ | Исключён по WP-FRAMEWORK-10-platform.md:38 | Отдельный private repo, не в pinned NaCl tree; содержимое не изучалось, это не утверждение об отсутствии на диске |

Пути WP и boundaries основаны на work-packages WP-FRAMEWORK-01/07/09/10/16/17 и WP-01-platform-inventory.md; cross-cutting consumer не означает автоматического исполнения WP. Это индекс, не полный аудит каждого файла.
