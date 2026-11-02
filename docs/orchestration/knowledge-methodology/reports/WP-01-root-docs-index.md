# WP-01: корневые документы docs — индекс охвата

Основание: 29 Git-tracked файлов непосредственно в `docs/` pinned дерева NaCl 20fe4c6. Классификация по заголовкам и выборочным фрагментам; не свидетельствует о полном чтении или текущем runtime. Переводы не считаются самостоятельными механизмами.

| Группа | Файлы | Количество |
|---|---|---:|
| Технические справочники | HANDOVER.md, HANDOVER.ru.md, agents.md, agents.ru.md, analyst-tool.md, codex-plugin.md, codex-plugin.ru.md, configuration.md, configuration.ru.md, graph-schema.md, skill-modifiers.md, skill-modifiers.ru.md, writing-adapters.md | 13 |
| Методология и эксплуатация | architecture.md, architecture.ru.md, contributing.md, contributing.ru.md, faq.md, migration.md, quickstart.md, quickstart.ru.md, skills-guide.md, skills-guide.ru.md, skills-structure.md, workflows.md, workflows.ru.md | 13 |
| Каталоги и исторический снимок | skills-reference.md, skills-reference.ru.md, skills-structure-baseline.txt | 3 |

## Выборочные направления проверки

- `docs/HANDOVER.md:197–202`: описание snapshot/import и ограничений одновременной записи; не запускалось.
- `docs/configuration.md:407–427`: project MCP в Skills-only, новая задача и разграничение аутентификации сервера и области доступа — документальное описание, не проверка действующего транспорта.
- `docs/writing-adapters.md:30–54`: описан путь Markdown → IR; покрытие других адаптеров не следует из этого примера.
- `docs/skills-structure.md:7–12,27–38`: ориентиры размера; размер сам по себе не измерение производительности.
- `docs/analyst-tool.md:275–280`: документально заявлены условия доступа и однопользовательской работы; фактическая конфигурация не проверялась.
- `docs/codex-plugin.md:106–113`: исторические ограничения проверки Node 20/Keychain и каталога запросов; текущий статус не установлен.

Смежный обзор ADR и методологии: [WP-01-adr-methodology-inventory.md](WP-01-adr-methodology-inventory.md). Каталог документов: [WP-01-docs-scope-inventory.md](WP-01-docs-scope-inventory.md). Независимо сверены все 29 путей и подсчёт 13/13/3; содержательное распределение предложено для исследования, не доказывает идентичность переводов.
