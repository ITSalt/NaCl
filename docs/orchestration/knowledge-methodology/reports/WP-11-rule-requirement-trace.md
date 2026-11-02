# WP-11 предварительно: BusinessRule → Requirement

Pinned NaCl 20fe4c6; WP-01 dependency открыта. Source и аналитические примеры, не результат Cypher или runtime; цена и частота UNKNOWN, DEFER.

Root `nacl-ba-rules/SKILL.md:72–94,280–320` описывает BusinessRule и четыре вида bindings; :259–260 формулирует более узко entity OR process. Codex `skills-for-codex/nacl-ba-rules/SKILL.md:19–28,46–73` требует source evidence, confirmation и read-back. Это текстовое различие не доказывает execution error.

Root handoff `nacl-ba-handoff/SKILL.md:178–188,219–246,267–273` ищет unmapped rules, предлагает подтверждение и связывает существующие узлы; автоматическое создание Requirement или проверка их смысла не доказаны. Codex `skills-for-codex/nacl-sa-uc/SKILL.md:54–73,276–282` описывает BRQ→Requirement, UC→HAS_REQUIREMENT и REALIZED_BY anchor. Для validation-type там указан FormField, а BRQ-sourced requirement связывается с enforcing System step; приоритет для BRQ validation требует отдельной сверки, runtime outcome UNKNOWN.

Root BA validator `nacl-ba-validate/SKILL.md:565–578` XL3.1 выдаёт CRITICAL для любой BusinessRule без IMPLEMENTED_BY→Requirement без фильтра out_of_scope; root SA validator `nacl-sa-validate/SKILL.md:2413–2427` XL9.1 исключает out_of_scope=true. При применимых cross-level prerequisites одна rule=true без edge даст различающиеся строки этих отдельных queries, но это не итоговый verdict программ. Root SA L3.7 :734–778 проверяет anchor для отдельных классов/flags, а неверный label отдельно WARNING; само наличие IMPLEMENTED_BY не доказывает смысл или правильный UC. Legacy Codex BA :50–55 говорит where applicable, не раскрывая здесь exact root query; не переносить его автоматически между клиентами.

`nacl-ba-handoff/SKILL.md:497–517` предлагает обновлять BA и сохранять подтверждённые SA edges. При изменении формулировки с прежним ID/edge existence checks не доказывают актуальность смысла; автоматический directed SA stale из BA handoff не установлен.

Альтернатива: typed provenance/version/semantic diff rule→requirement с подтверждённым исключением и scoped validation. Риск — ложная актуальность по ID/hash, потеря anchor или человеческого решения. Proposed controls: out_of_scope rule без edge в обоих validators; in-scope без edge; linked requirement без anchor при применимых flags; wrong anchor label; смена формулировки с тем же edge. Positive — подтверждённое правило и корректный Requirement/UC/anchor. Graph и tests не запускались.
