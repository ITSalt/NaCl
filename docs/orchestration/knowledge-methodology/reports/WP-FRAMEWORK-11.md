# WP-11 — BA → SA: ограниченная статическая сдача

Снимок исходников `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; принятые по D-6 профильные входы частичны. Использованы накопленные отчёты; новые graph/tests не запускались. Проверяется не runtime, а описанные source-фрагменты.

| Тема | Наблюдение и ограничение |
|---|---|
| Producer → consumer | BA workflow описывает WorkflowStep с ID, function_name, stereotype и BusinessProcess→HAS_STEP; handoff/SA UC связывает подтверждённый WorkflowStep→AUTOMATES_AS→UC. Handoff также описывает BusinessEntity→DomainEntity, BusinessRole→SystemRole, BusinessRule→Requirement. SA UC читает unmapped automated steps; полнота минимальной схемы не доказана. [Static chain](WP-01-ba-sa-static-chain.md), [предварительный отчёт](WP-11-preliminary.md). |
| Round-trip | Условный пример: S1→UC1, затем смысл S1 меняется при неизменном ID/edge. Handoff описывает diff и сохранение подтверждённых SA edges; edge сам не доказывает актуальность смысла. Обязательный вызов SA feature или автоматическая invalidation не установлены. SA change отдельно описывает scoped impact/spec_version/directed stale/TL replan. Пользователь подтверждает смысловые изменения; полный runtime round-trip не выполнен. [Трасса](WP-11-step-uc-propagation.md). |
| Steps и coverage | Source selector «Автоматизируется» и validator с «Automated» различаются; runtime conflict не доказан. BA row numerator потенциально маскирует непокрытый source при нескольких targets, SA EXISTS считает иначе; XL1.1 может обнаружить некоторые пропуски. [Coverage](WP-01-handoff-coverage-trace.md). |
| Entities, roles, rules | BA writer business_type/required/comment и SA IMPORT_BA data_type/description различаются при интерактивном mapping; live loss не доказан. При remap старый ACTOR может иметь независимое основание. BA/SA проверки правил различают out_of_scope; общий исход неизвестен. [Атрибуты](WP-11-attribute-propagation-trace.md), [правила](WP-11-rule-requirement-trace.md). |

**Кандидаты — DEFER.** Versioned mapping и semantic diff могут выявлять stale semantics, но рискуют неверно затронуть чужие UC или человеческие решения. Требуются проверки stable-ID changed meaning, English stereotype, multi-edge, deleted BA, out_of_scope, role remap с независимым основанием, interruption/replay и read-back. Typed attribute diff и DISTINCT source-ID coverage требуют отдельных oracle, исключений и согласованного snapshot. Цена, частота и эффект UNKNOWN; подтверждения, provenance и validators сохраняются до доказательства альтернатив.

**Адресная коррекция.** Условные source-level этапы (не утверждается автоматический запуск каждого): подтверждённый WorkflowStep → handoff или альтернативный SA UC writer → UC consumer → BA XL1.1 → handoff rescan/diff с сохранением edges. SA XL6.1 отдельно учитывает `Automated`; вызываемый отдельно SA feature описывает impact/version/stale/replan. Автоматическая связь rescan→feature и recovery не установлены.

| Кандидат | Consumer / дефект | Цена и риск / предложенный контроль |
|---|---|---|
| DEFER versioned mapping | Handoff/SA change: устаревший смысл при прежнем ID | UNKNOWN; чужой UC и неверный stale; stable-ID changed meaning и human confirmation |
| DEFER typed attribute diff | SA domain/import: несовпадение BA/domain свойств | UNKNOWN; допустимые преобразования и 1→many; проверить writer, migration и read-back |
| DEFER distinct-ID coverage | Handoff/validator: искажённый numerator | UNKNOWN; неверный scope/denominator; два source и два targets у одного, пустой слой и exceptions |

[Первый независимый review](WP-11-independent-review.md) проверил шесть локальных ссылок; другие source checks отдельно ограничены.

**Остаток.** Полный минимальный контракт и consumers, стоимость подтверждений, архитектурный handoff, все modes и обратные конфликты, active client, runtime потери и выполненный round-trip UNKNOWN. Контроли предложены, но не выполнены. Независимый review и проверка протокола требуются для verdict.
