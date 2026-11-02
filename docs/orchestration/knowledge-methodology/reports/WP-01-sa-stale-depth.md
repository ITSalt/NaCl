# WP-01: глубина directed staleness SA → TL

Pinned NaCl 20fe4c6; независимо сверенное чтение root sources, graph/Cypher/tests не выполнялись. Runtime, частота и цена UNKNOWN, DEFER.

`nacl-sa-feature/SKILL.md:447–489` увеличивает `spec_version` и ставит UC stale только для `$affectedUcIds`; для Tasks непосредственно изменённых и транзитивно зависимых UC использует directed `DEPENDS_ON*1..5`. В условной цепи UC0 ← UC1 ← … ← UC6 из **шести рёбер**, при affected={UC0}, без короткого пути и иных изменений, Task UC6 не попадёт в этот query. Показанные auto-drift conditions `nacl-tl-plan/SKILL.md:195–218,231–237` выбирают version drift или explicit stale; если версия и флаги UC6 неизменны, эти два сигнала его не выберут.

Это аналитическое следствие конкретных запросов, не доказательство реальной потери или того, что UC6 семантически обязан измениться. Явный --feature, другой writer, дополнительный scope или validation могут изменить исход. `skills-for-codex/nacl-sa-feature/SKILL.md:29–41` описывает зависимых без такого численного предела; активный Codex query/runtime не установлен.

Root feature :467–468 называет stamp идентичным `nacl-tl-fix`, но root `nacl-tl-fix/SKILL.md:870–883` в показанном фрагменте маркирует Tasks непосредственно `$affectedUcIds` и различает shipped spec_drift/active stale без traversal. Иные шаги fix не исключены; различие snippets не доказывает различие всего runtime.

Альтернатива — направленный traversal с explicit visited/resource bounds и сохранением revision; риск — стоимость, циклы и ложный fan-out через shared entities. Proposed controls: глубина 5 и 6 рёбер, короткий альтернативный путь, цикл и большая ветвистость, явный scope и read-back; сравнивать только действительно затронутые UC. Ничего не выполнялось.
