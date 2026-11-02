# WP-17: предварительный challenge, не приёмка

**Challenge enum → TL.** Root `nacl-tl-plan/SKILL.md:719–728` ищет enum через путь USES_FORM→field→attribute→entity; если у UC нет USES_FORM, именно этот OPTIONAL path их не возвращает. Но другие запросы и контекст могут содержать enum, поэтому полная потеря в API contract не доказана. Query возвращает отдельные collections Enumeration и EnumValue без явно возвращённых пар; node IDs могут позволять частичную реконструкцию, а `nacl-sa-domain/SKILL.md:297–333` хранит entity→enum→value edges. Для двух enum одной entity предложенная таблица должна подтверждать соответствия отдельным источником, не приписывать все values каждому полю. Graph, runtime и test не запускались; DEFER.

[Symlink preservation и lock challenge](WP-17-symlink-challenge-trace.md) исследован по источникам без запуска.

[Свежий Skills-only build и независимый challenge diagnose](WP-10-js-dependency-trace.md): checker выдал VERIFIED, но runner в двух disposable-средах завершился MODULE_NOT_FOUND; отдельные модифицированные positive controls с vendor дошли до NOT_RUN пустого проекта. Это подтверждённый дефект проверенной сборки и Node-окружения, а не факт запуска установленного skill или MCP.

[Локальные references](WP-10-literal-references-checker.md) и [installed integrity](WP-10-installed-integrity-trace.md) показывают, что совпадение closure и hashes присутствующих файлов не доказывает полноту backtick-зависимостей; installed 0.2.2 относится к c291, pinned исследование к 20fe. [Navigation queries](WP-10-cypher-reference-semantics.md) различают root TL inline affected-UC query и SA reachable-component template. В 20fe mixed UC с formless Screen и Form аналитически исключается до проверки Form; допустимость модели и общий verdict UNKNOWN. Proposed controls: missing bundle reference, inbound от недостижимого Component, mixed UC и отдельные expected contracts для c291/20fe с учётом QA Condition 2. Ни один не выполнен.

Зависимости и WP-01 не завершены; итоговое независимое оспаривание ещё не выполнено. Здесь peer-review предварительных отчётов и самокритика. Один исследователь участвовал в частях WP-01/06/10/14, другой — WP-03/05/07/09/13/15; их проверка собственных результатов не независима. Полный независимый reviewer нужен после завершения зависимостей.

Исправлены: неверная ссылка клиента на QA prerequisite в WP-06, пропущенное условие HAS_STEP в аналитическом replay WP-03, некорректная формулировка про файловые записи BA analyze, неуниверсальный порядок dev/review/QA в WP-13, граница локального runtime probe в WP-10. WP-16: oracle wave-plan не проверяет UC005-BE и лишние задачи; независимый пересчёт 45 сохранённых true результатов обнаружил у всех точное ожидаемое множество задач, поэтому нельзя заявлять фактическую ошибку сохранённых процентов по этому признаку. При этом разный вход OLD/NEW подтверждён исходником.

Сильнейшие контраргументы против поспешного упрощения:

- Исторические ситуации `docs/retrospectives/nacl-postmortems-synthesis.md:11–25,68–89` описывают зелёные mocks/типы при сбое provider wire, отсутствующую навигацию и stale state. Это ретроспективное evidence, не установленная причинность каждой современной защиты. Меньше файлов не доказывает сохранение этих гарантий.
- Native worktrees и tasks не доказывают изоляцию графа, а role-файл сабагента не доказывает отдельный sandbox; нужны проверенные identity/fence/CAS и reconciliation неизвестного outcome.
- Sanitizer probe доказывает поведение одной функции, 16/16 — mock model, не live graph/release. Никакой false PASS всего процесса не наблюдался.
- Различать root, Codex source/overlay, installed source commit и host cache; metadata mismatch не является доказательством компрометации, а описательная policy — runtime acceptance.
- Сохранить raw failures, expected/actual, токены, wall time и качество; имеющиеся данные не доказывают, что NaCl быстрее или медленнее, ни что любая защита безопасна к удалению.

Набор будущих отрицательных сценариев: semantic BA change без изменения edges и сохранение чужого stale; совместимые типы с неверным URL/body; CI на старом SHA и зелёные mocks при provider 404; два writer и stale fence; crash после graph write и до JSON; timeout после внешнего create без blind retry; недоступный MCP и hook failure; корректный input как контроль false block. Для каждого заранее определить invariant, scope, контрольный дефект, oracle и источники evidence. Не все сценарии реализованы и ни один новый live challenge не запускался.

Исправление противоречий инструкций, например read canary и L1, можно рекомендовать исследовать отдельно с регрессионными случаями; это не разрешение менять NaCl в рамках D-2 и не доказательство частоты ложных блокировок. Полноценный WP-17, итоговые рекомендации и решение об удалении gates остаются открыты.
