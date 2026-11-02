# WP-01: дополнительные механизмы и проверяемые гипотезы

Статическое исследование NaCl SHA `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; категории предварительно DEFER, стоимость и фактическая частота неизвестны. Это не доказательство live-поведения.

| Механизм | Источник и контракт | Защита и возможное упрощение |
|---|---|---|
| Remote coordination | `nacl-tl-core/references/remote-mode-coordination.md:3–36`: граф — источник истины, локальный статус — кэш; claim с TTL | Снижает риск конкурирующих исполнителей и stale cache. Альтернатива требует сохранить атомарность захвата и истечение; фактическая атомарность не проверена. |
| Codex TL write | `skills-for-codex/nacl-tl-core/references/tl-codex-contract.md:7–28,60–81`: preflight, подтверждение класса, write, read-back | Защищает от неверной области записи и ложного подтверждения; batching требует проверки identity и scope. |
| SA validation | `nacl-sa-validate/SKILL.md:40–48,60–68`: L1–L13/XL, в т.ч. intra-UC и module | Выявляет неполные требования и трассировку. Инкрементальный CI возможен только при сохранении покрытия; active Codex overlay отдельно сверить. |
| BA→SA handoff | `nacl-ba-handoff/SKILL.md:37–46,68–81,114–126`: четыре типа связей и подтверждаемые фазы, неполная SA допускает отложенные связи | Защита от неправильного сопоставления. Сравнить semantic diff+batch и отрицательные случаи. |
| Board sync | `nacl-ba-sync/SKILL.md:80–110,117–127` и `ba-codex-contract.md:86–101`: new/unchanged/dirty, идентичность и метаданные | Проверять roundtrip, пропущенные фигуры и удалённые связи; не выводить runtime-гарантию только из документа. |
| Render | `nacl-render/SKILL.md:11–13,29–50`: чтение графа и вывод Markdown/Mermaid | Представление не является независимым источником требований; общий snapshot может снизить повторные чтения, но несёт риск stale IDs. |

Код полного локального gateway (`codex-plugin-src/package/runtime/graph-gateway/concurrency-engine.mjs:11–20,44–55,67–97,123–137` и `concurrency-cypher.mjs:142–146,175–176,288–295`) реализует механизмы lease/fence/revision/idempotency. Skills-only контракт запрещает gateway tools (`codex-plugin-src/package/resources/references/skills-only-runtime-contract.md:20–30,128–132`); наличие кода само по себе не доказывает равную защиту project-local MCP.

Кандидат расхождения требует проверки сборки: source overlay `codex-plugin-src/workflow-overlays/nacl-tl-next/SKILL.md:33–51` называет gateway-инструменты, тогда как Skills-only контракт их исключает. Однако `scripts/build-codex-skills-only.mjs:179–186` преобразует эти имена в описания project MCP операций. Поэтому утверждать, что собранный Skills-only требует буквальные запрещённые инструменты, нельзя. Проверить доступность и атомарность эквивалентных операций в собранной поставке и отрицательные случаи в WP-09/10/15.
