# WP-01: SA-06 — дополнительные root queries

Выборка источника `nacl-sa-validate/SKILL.md`, pinned NaCl 20fe4c6; consumer по заявленному маршруту `nacl-sa-full/SKILL.md:466–500` и `nacl-tl-release/SKILL.md:162–170`, фактические вызовы UNKNOWN. Все контрпримеры предлагаются; не запускались. Это не исчерпывающий список queries, цена и частота UNKNOWN, DEFER.

| Проверка и ожидаемый исход по source | Proposed negative / positive и граница |
|---|---|
| L1.1 :471–485: null id/name для шести labels → CRITICAL; L1.2 :487–497: DomainAttribute через HAS_ATTRIBUTE от DomainEntity без data_type → CRITICAL | Module с null id / заполненные свойства; пустые строки и другие labels данным query не доказаны |
| L2.1 :561–577: zero relationships у перечисленных SA labels → CRITICAL; L2.2 :579–587: DomainEntity без Module CONTAINS_ENTITY → WARNING | Узел без связей / одна связь; наличие связи ещё не доказывает правильный тип |
| L6.1 :1004–1016: >1 match Module–CONTAINS_ENTITY→DomainEntity при shared=false/missing → WARNING (count без DISTINCT); L6.2 :1019–1029: UC DEPENDS_ON cycle длиной ≤10 → CRITICAL | Два owner matches, включая параллельные edges одного Module / shared=true; двухузловой цикл / ацикличный граф; циклы >10 этот query не доказывает |
| L7.1 :1058–1082: FR из дискового списка без FeatureRequest → CRITICAL; L7.2 :1085–1097: FeatureRequest без INCLUDES_UC → CRITICAL кроме legacy_origin | Отсутствующий graph FR / точный node; отсутствие UC / ссылка либо допустимый tombstone; качество edges нужно проверять отдельно |
| L9.2–9.3 :1275–1298: несуперседённый Decision без JUSTIFIES → CRITICAL; null/blank rationale любого Decision → CRITICAL | Отсутствующая связь и отдельно пустой rationale / заполненные оба; grandfather decision_exempt относится к L9.1 для FR, не к L9.2–9.3 (:1313–1325) |
| XL6.1–2 :2233–2263: автоматизируемый BA WorkflowStep без AUTOMATES_AS→UC → CRITICAL; UC без BA source при system_uc=false → WARNING | Пропущенное ребро / корректный edge; orphan step вне первого query; system_uc=true исключает второй finding |
| XL7.1 :2297–2312: BusinessEntity без REALIZED_AS→DomainEntity → CRITICAL, кроме точного entity_type `Внешний документ` | Нет edge / edge либо точно указанное исключение; переводы значений автоматически не равнозначны |
| XL8.1–2 :2356–2382: BusinessRole без MAPPED_TO → CRITICAL; SystemRole без incoming BusinessRole и system_only=false → WARNING | Пропущенные связи / edge либо system_only=true для второго условия |
| XL9.1–2 :2413–2437: BusinessRule без IMPLEMENTED_BY и out_of_scope=false → CRITICAL; out_of_scope=true попадает в INFO | Нет link / корректный link; INFO не доказывает обоснованность исключения |

Package overlay `codex-plugin-src/workflow-overlays/nacl-sa-validate/SKILL.md:60–97,189–207` и legacy projection могут различаться с root; переносить exact query/outcome без проверки соответствующих ресурсов и route нельзя. Нулевой результат query не равен полноте покрытия. Соседняя выборка: [WP-01-sa06-atomic-sample.md](WP-01-sa06-atomic-sample.md).
