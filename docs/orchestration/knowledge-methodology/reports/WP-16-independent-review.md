# Независимый review WP-16 — первый раунд

Reviewer воспроизвёл в отдельных временных копиях под `sandbox-exec` с запретом сети исходные 10/10 BA, 12/12 evidence и 9/9 + 2 recovery; проверка синтетических прототипов не является проверкой NaCl/Neo4j. Координатор независимо повторил их из сохранённых копий с тем же ограничением сети. Выполнены дополнительные negative controls; исторический сбор WP-19 не повторялся.

| Критерий | Статус | Основание |
|---|---|---|
| ba_sa | blocked | Semantic text drift не отслеживается при прежних facts; mutable alias изменяет snapshot после APPLIED. Authority/fence и graph runtime не проверены. |
| evidence | blocked | FAILED + waiver даёт PASS против принятой политики synthetic эксперимента; реальная политика NaCl не установлена, claims об identity/proof доверенные. |
| recovery | blocked | Отсутствующие project/fence дают MODEL_MATCH; пообъектная область не определена; настоящий graph/restore не проверен. |
| synthesis | blocked | Карта соответствия текущих гарантий NaCl и моделей не завершена; цена UNKNOWN. |
| verification | blocked | Reviewer выполнил воспроизведение и независимые negative controls, но обнаружены false successes самих прототипов. |

Ровно одна адресная коррекция может устранить дефекты synthetic моделей, сохранить прежнюю версию и зафиксировать вторую; она не закроет реальные graph/runtime гарантии и не даёт права на внедрение.
