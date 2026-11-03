# WP-04 — статическая сдача управления разработкой

WP-01 завершён по D-5. Pinned NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; источники: [предварительный отчёт](WP-04-preliminary.md), [intake](WP-04-intake-decision-trace.md), [TL consumers](WP-01-tl-consumer-trace-part1.md) и [реестр](WP-01-mechanism-registry-tl-platform.md). Это синтез накопленных source-срезов, не наблюдение рабочих процессов. Root, legacy Codex и overlay отличаются; active route UNKNOWN. Graph, A/B и tests в этой сдаче не запускались.

Заявленный типовой путь: запрос → intake (классификация и scope) → plan (SA, dependencies, waves/tasks/API) → next (кандидат и claim) → full (UC фазы) → conductor (сверка и handoff). Возможны прямые вызовы, conductor как вход и goal как отдельная wrapper-ветка; TL-core — общий контракт, не дополнительная обязательная фаза. Это схема зависимостей, не измеренный временной критический путь.

| Механизм | Задача и consumer | Защита, альтернатива и риск |
|---|---|---|
| Intake | Запрос + evidence → scope/маршрут → SA/fix/dev | Предотвращает неверный маршрут; typed decision log может упростить, но обязан сохранить отказ при unknown и границу scope. Проверить mixed request и недоступный graph. |
| Plan | SA и зависимости → waves/tasks/API → исполнители | Trace и read-back ограничивают drift; versioned snapshot требует корректной invalidation и сохранения evidence выполненных задач. |
| Next/claim | Task/Wave и зависимости → кандидат → worker | Conditional claim и TTL ограничивают конфликты; упрощение выбора должно сохранить fence и отказ stale cache. Null dependency — условный source-case в WP-04 preliminary, не подтверждённый dispatch. |
| Full | UC scope и evidence → фазы → conductor | Порядок и gate помогают recovery; объединение исполнителей может утратить независимую проверку и состояние прерывания. |
| Conductor | Graph/.tl/changelog и результаты → reconciliation → владелец | Сверка ограничивает конфликт источников; единый event log не должен скрыть external CI и partial failure. |
| Core | Статусы, authority, read-back → TL workflows | Защищает от stale cache; общий adapter обязан сохранить authority и partial-failure semantics. |

Все предложения DEFER до проверки применимости и отрицательных случаев. Реальная частота, число запусков/повторных чтений, цена и экономия UNKNOWN. Waves/tasks/UC, dependencies и делегирование представлены на source-level; L0–L2, детальные retry/compaction и повторные решения goal/conductor не покрыты достаточным evidence и не исключены из scope. Полный граф ветвей, фактический критический путь и атомарная полнота механизмов не доказаны; это частичная сдача, не полное выполнение charter. Контрпримеры предложены, не исполнялись. Независимый review и проверка checkout требуются до решения о статусе.
