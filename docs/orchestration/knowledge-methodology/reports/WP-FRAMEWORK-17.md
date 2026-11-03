# WP-17: независимый challenge плана модернизации NaCl

Проверен [проект M0–M5](implementation-handoff.md) по D-11, [девяти историческим ситуациям](WP-FRAMEWORK-19.md) и partial материалам [WP-13](WP-FRAMEWORK-13.md), [WP-16](WP-FRAMEWORK-16.md). Дополнительных исследований, live graph и тестов при challenge не выполнялось. GO ниже означает только возможность сформировать конкретное задание, а не разрешение реализации, релиза или доказанную безопасность.

| Кандидат | Сильнейшее возражение и сохраняемая обязанность | Контроль и решение |
|---|---|---|
| M0 — baseline | Одинаковые counts и наличие snapshot не доказывают идентичности graph, authority и восстановимость; legacy claim и gateway fence могут различаться. CTRL-3 подтверждает файл и manifest, не restore. | Different relations при одинаковых counts, чужой project и неподлинный digest; GO на спецификацию и read-only baseline, DEFER миграцию до проверки identity/restore. |
| M1 — BA→SA | Неизменный ID может скрыть изменение смысла; автоматический diff не должен затереть 1→many и человеческие исключения. BA-2 — историческое расхождение текстов, не доказанная потеря. Synthetic BA v2 принимает неподписанное подтверждение и оба пустые fence. | Same-ID changed meaning, 1→many, stale writer и чужой scope; GO на постановку, DEFER внедрение до provenance, semantic oracle и реальных прав/fence. |
| M2 — evidence | Типизированный ledger сам не доказывает подлинность proof/reviewer; объединение gates может потерять FAILED/NOT_RUN или scope waiver. DEV-1/3 показывают типы исторического evidence, не live отказ. | Fake reviewer/proof, stale HEAD, FAILED+waiver в конкретной policy; GO на проектирование contract, DEFER автоматическое принятие до проверки identity/provenance. Synthetic policy не приписывать NaCl. |
| M3 — graph/cache | Cache может устареть после graph commit; равенство counts и синтетический digest не доказывают сохранение отношений и graph authority. CTRL-1 содержит запись и локальный diff, не независимый graph snapshot. | Прерывание graph→cache, stale fence, foreign scope, same counts/different relations; GO на проектирование, DEFER graph mutation до проверенного baseline/restore и rollback. |
| M4a/b/c — completion, closure, path | Три разных класса нельзя принимать одним общим тестом: ложный GOAL success, отсутствующая runtime dependency и выход за границу пути. Свидетельства ограничены synthetic/root Claude или disposable package, не всеми клиентами. | Missing/extra/duplicate planned IDs; отсутствующий vendor из распакованного пакета; traversal/symlink/разрешённый внешний путь. GO отдельно ставить задачи после M0, DEFER включение до client-specific tests и rollback. |
| M5 — интеграция | Локальные успехи не доказывают совместимость старых graph data и client overlays. Откат только кода может оставить новые связи и claims. | Прервать между schema migration и релизом; старый клиент, stale evidence/fence; GO на план, DEFER rollout до совместимости и восстановимого состояния. |

## Владельцы обязанностей и категории

Категория — исследовательская рекомендация, а не утверждение, что механизм внедрён, полностью проверен или готов к удалению.

| Направление | Потребитель / категория | Условие и граница |
|---|---|---|
| M0 authority и baseline | graph readers/writers и migration; KEEP authority, DEFER изменение baseline | Идентичность, scope, семантика и restore до миграции; фактический restore UNKNOWN. |
| M1 смысл BA→SA | BA handoff, SA domain/UC и владелец подтверждения; SIMPLIFY как гипотеза, DEFER внедрение | Независимый semantic oracle, достоверное подтверждение, fence и сохранение 1→many. |
| M2 evidence | QA reviewer, verification/release и владелец исключения; SIMPLIFY как гипотеза, DEFER объединение gates | Provenance и проверка claim/revision/env; policy waiver не выведена из синтетики. |
| M3 graph/cache | TL full/diagnose и graph recovery; KEEP graph authority, DEFER замена | Проверить authority, scoped restore и конфликт writers. |
| M4a completion | GOAL conduct и координатор; KEEP обязанность, SIMPLIFY проверку как гипотеза | Связать каждый плановый ID с допустимым state; negative missing/extra/duplicate. |
| M4b closure | Generator, doctor и потребитель пакета; SIMPLIFY как гипотеза, DEFER unified resolver | Проверить зависимости из распакованного пакета, обе проекции и missing vendor. |
| M4c path | Render handler и владелец проекта; KEEP boundary, SIMPLIFY resolver как гипотеза | Traversal, symlink, допустимые внешние пути и rollback для каждого клиента. |
| M5 внедрение | Владелец migration, QA и release; KEEP staged independent acceptance, DEFER rollout | Проверить graph data, client compatibility, остановку и scoped restore. |

## Исправления по результатам challenge

В handoff зависимость M2 уточнена: проектирование ожидает согласованный contract идентичности требований, но не автоматически полное внедрение M1; безопасность параллельного внедрения не доказана. M4 разделён на самостоятельные M4a/b/c с отдельными критериями приёмки и отката. Приоритеты качественные; количество часов и экономия UNKNOWN.

Во всех кандидатах сохраняются graph identity, scoped authority, семантические связи, provenance, независимое принятие и безопасное восстановление. Имеющиеся source-срезы, historical records и synthetic prototypes не доказывают runtime NaCl, выполнение миграций или универсальную безопасность удаления защит. Исходные WP-13/16 остаются PARTIAL. Этот challenge — ограниченная основа задания реализации и независимой проверки, а не внедрение или release. Независимый review самого challenge обязателен.
