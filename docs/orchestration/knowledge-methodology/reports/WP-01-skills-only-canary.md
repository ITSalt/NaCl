# WP-01: текстовое противоречие read canary в установленном Skills-only

Наблюдение, 2026-11-02. Установленный пакет NaCl 0.2.2, `skills/nacl-tl/resources/references/skills-only-runtime-contract.md:28`, запрещает `project MCP read canary`. Одновременно `skills/nacl-tl/SKILL.md:11–12` требует verified read canary, а `resources/references/workflow-gateway-contract.md:9–11` описывает его вызов. Речь о read canary; отдельный write canary в runtime contract :23–25 — другая операция.

Происхождение: исходный `plugins/nacl/resources/references/skills-only-runtime-contract.md:28` запрещает `nacl_installation_doctor`. `scripts/build-codex-skills-only.mjs:179–186` заменяет имя на `project MCP read canary` без учёта контекста. Применение текстовых замен в памяти к исходнику полностью совпало с установленным файлом SHA256 `1b8c8c07396eb63e8619ea0659433b6ad86913cc4332a98421cf13f5d46adf3d`.

Это воспроизведённое противоречие текста установленного пакета, не доказательство отказа работающего агента или потери данных. Связь установленной сборки с точным Git SHA отдельно не подтверждена. Проверить исполнение и negative cases в WP-10; устранение и обновление NaCl исключены из этой исследовательской программы.
