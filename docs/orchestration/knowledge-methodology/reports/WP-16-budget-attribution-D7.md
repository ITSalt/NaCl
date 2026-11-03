# Атрибуция подготовки A/B-пары по D-7

Владелец выбрал учитывать непосредственно подготовку конкретной пары, выполнение и независимое review. Лимит D-4 не изменён. Подготовительные работы до решения D-4 не исключаются автоматически.

К конкретной FR-014 паре относятся: [blind design и baseline](WP-16-fr014-blind-design.md), [draft oracle и controls](WP-16-fr014-draft-test-check.md), [настройка среды](WP-16-fr014-env-check.md), [browser preflight](WP-16-fr014-browser-preflight.md), [browser/control проверки](WP-16-fr014-browser-draft-check.md), [изоляция сети](WP-16-network-sandbox-probe.md) и [файлов](WP-16-file-isolation-probe.md), [план и challenge](WP-16-pilot-plan-draft.md), [acceptance matrix](WP-01-fr014-acceptance-matrix.md) и [oracle design](WP-01-fr014-oracle-design.md). Для общего corpus/rubric, учёта бюджета, graph snapshot и координации относится только подтверждённая часть подготовки пары. Общую инвентаризацию BA/SA/TL не относить автоматически.

Записи status.md 12:27–13:19Z и 13:37–13:44Z указывают время фиксации, но не длительность работ; они могут пересекаться. Зафиксированный [parent delta](WP-16-budget-observation.md) смешивает общую работу и пилот, исключает дочерние сессии и не устанавливает billing или расход пары. `threadUsage: null` не означает ноль, общий hard cap для группы не подтверждён. Поэтому затраты и остаток D-4 **UNKNOWN**, даже приблизительно; A/B arms не запускались.

До пилота остаются надёжный учёт остатка и способ остановки, готовый независимый harness и blind isolation, допустимый baseline/restore либо обоснование отсутствия graph и остальные гейты протокола. Решение D-7 не отменяет этих условий и не выделяет нового бюджета.
