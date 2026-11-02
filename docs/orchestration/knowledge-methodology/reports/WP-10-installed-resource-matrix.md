# WP-10: установленный NaCl 0.2.2 — источники и ресурсы

Read-only filesystem observation в `/Users/maxnikitin/.codex/plugins/cache/openai-curated-remote/nacl/0.2.2/skills`. Не новая сборка pinned SHA; actual active route, alternate official resolution и runtime исход UNKNOWN. Builder, MCP и workflows не запускались.

| Ресурс | Пример leaf и условие | Файловая проверка |
|---|---|---|
| verification-vocabulary.md | BA entities :16–18, SA UI :17–18, TL dev-fe :16–17 предписывают чтение | Нормализованные `resources/workflows/references/` в BA/SA/TL не содержат файл; поиск по имени во всём installed package пуст |
| migration-rules.md | BA entities и TL dev-fe требуют перед workflow | Соответствующие targets BA/TL отсутствуют; copies есть в других skills SA/migrate, не в этих active bundles |
| reachability.cypher | SA UI :63–67,173–174 и TL review :80–110 ссылаются на query; у review есть перечисленные exemptions | Не указан однозначный resolution root; обе проверенные естественные locations SA/TL и поиск по имени во всём package пусты |
| runtime-contract.cypher | SA UC :74–77,339–341 требует §7 decision tree для UC; templates :367–374 зависят от характеристик UC | Обе проверенные естественные locations SA и поиск по имени во всём package пусты |
| verification-evidence.md | TL stubs :17–19 требует перед выполнением | Нормализованный TL target отсутствует, copies в других skills не являются TL-local ресурсом |

Установленный `skills/nacl-ba/resources/references/skills-only-runtime-contract.md:32–37` и соответствующие active bundle contracts запрещают поиск в другом installed skill или checkout. Отсутствие файла не является наблюдённым BLOCKED/false PASS и не исключает иной официальный эквивалент. Источник и исследуемые builder paths: [closure trace](WP-10-skill-closure-trace.md).
