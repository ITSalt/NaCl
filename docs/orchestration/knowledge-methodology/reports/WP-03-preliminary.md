# WP-03: предварительное исследование SA

Статус: предисследование; WP-01 остаётся открытым, приёмка WP-03 не проводилась. NaCl SHA `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`. Цена, counts и реальная частота неизвестны, классификация DEFER до проверки. Root/packaged/installed версии не тождественны.

| Механизм | Источник | Вход → выход; возможное упрощение и риск |
|---|---|---|
| Architect и внешние контракты | `codex-plugin-src/workflow-overlays/nacl-sa-architect/SKILL.md:23–47,52–64,249–256` | BA контекст → modules, dependencies, NFR и provider/protocol contracts. Группировать утверждения можно исследовать при сохранении scope и read-back; packaged отсутствие ресурса блокирует запись, не разрешает обход. |
| Domain/roles | `nacl-sa-domain/SKILL.md:31–63,79–91`, `nacl-sa-roles/SKILL.md:31–79` | BA → domain entities/relations, system roles и CRUD. Единая текстовая матрица требует проверяемых ID/связей и защиты от drift. |
| UC/UI | `nacl-sa-uc/SKILL.md:79–105,230–252`, `nacl-sa-ui/SKILL.md:90–108,495–542` | UC/steps/forms/requirements и navigation. Упрощение сценариями и таблицей affordances должно сохранить проверки достижимости и ролей. Историческое упоминание отсутствующего CTA — текстовое свидетельство, не replay. |
| Feature impact/staleness | `skills-for-codex/nacl-sa-feature/SKILL.md:20–51`, root `nacl-sa-feature/SKILL.md:440–468` | Запрос → impact → согласованный scope → направленный stale stamp. Semantic diff может быть альтернативой при сохранении направленности; shared actor не должен устаревать весь граф. |
| Flags/validation | `skills-for-codex/nacl-sa-flags/SKILL.md:19–53`, root `nacl-sa-validate/SKILL.md:945–956`, `nacl-sa-uc/SKILL.md:237–252` | `has_ui` может выводиться из наличия формы; если интерактивный UC ошибочно не имеет связи, это может исключить предупреждение L5.1. Нужен negative fixture с независимым intended UI; live PASS не наблюдался. |
| Full/finalize | `nacl-sa-full/SKILL.md:62–117`, `codex-plugin-src/workflow-overlays/nacl-sa-full/SKILL.md:12–18,27–39`, `nacl-sa-finalize/SKILL.md:33–51,160–162` | Последовательные этапы и gates; пустые opt-in проверки не равны принятию. Условные gates должны сохранять содержательный review. |

Analytical replay прочитанных условий (без Neo4j): interactive с хотя бы одним `HAS_STEP`, но без формы → derived `has_ui=false` и нет L5.1 finding по этому правилу; это не общий PASS остальных проверок; interactive с формой и backend-only должны сравниваться отдельно. Это следствие логики, а не реальный запуск validator. Root `nacl-sa-feature/SKILL.md:534–542` имеет иной fallback; активный Codex путь требует отдельной проверки.

Installed NaCl 0.2.2 `nacl-sa/resources/workflows/nacl-sa-validate/SKILL.md:73–85` отличается от `skills-for-codex/nacl-sa-validate/SKILL.md:75–79,91–103` на закреплённом checkout по описаниям L3.8/L3.9 и drift/exempt. Без проверки provenance/сборки нельзя приписывать новые проверки установленному bundle или заявлять runtime-дефект. WP-10 должен сверить проекции, WP-11/12 — стыки, WP-16 — измерение, WP-17 — negative cases.
