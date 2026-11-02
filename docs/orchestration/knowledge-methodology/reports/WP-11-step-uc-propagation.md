# WP-11 предварительно: WorkflowStep → UseCase и изменение шага

NaCl 20fe4c6; source-only, dependencies открыты, graph не запрашивался. Цена/frequency/runtime UNKNOWN, DEFER.

Root `nacl-sa-uc/SKILL.md:110–145,230–251` выбирает под BusinessProcess шаг без AUTOMATES_AS с точным stereotype `Автоматизируется` и требует confirmation создания UC; root `nacl-ba-handoff/SKILL.md:219–246` может после подтверждения связать существующий UC. Legacy Codex UC :44–52,268–277 имеет собственный confirmed path.

Root `nacl-sa-validate/SKILL.md:2233–2250` XL6.1 проверяет шаги под BP и с `Автоматизируется`, и с `Automated`, если нет AUTOMATES_AS→UseCase. Поэтому English `Automated` без edge может подпасть под этот validator query, но не под конкретный stories candidate query; другие queries и актуальный client route не исключены. Это не runtime conflict.

При изменении смысла шага с сохранёнными ID/edge `nacl-ba-handoff/SKILL.md:497–517` описывает diff и сохранение подтверждённых SA edges; existence edge не доказывает свежесть UC. `skills-for-codex/nacl-sa-feature/SKILL.md:19–42` описывает отдельный confirmed SA change и directed stale/replan, автоматический вызов из указанного handoff не установлен.

Альтернатива — versioned step→UC mapping с semantic-delta и confirmed directed impact; риск потерять человеческое решение, затронуть чужой UC/Task либо ошибочно признать edge актуальным. Proposed controls: изменённый смысл при стабильном ID, English stereotype, orphan step; positive — подтверждённый edge и актуальная версия. Graph/tests не выполнялись.
