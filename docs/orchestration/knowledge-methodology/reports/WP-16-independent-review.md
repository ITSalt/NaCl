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

## Финальный независимый review — PARTIAL

Независимый reviewer в отдельных disposable copies с запретом сети повторил BA v2 15/15 и 6/6 mutations, evidence v2 16/16 и recovery v2 15/15. Прежние конкретные controls исправлены в пределах synthetic policies. Дополнительные controls выявили: BA unsigned противоречащее подтверждение и оба отсутствующих fence дают APPLIED; evidence доверяет fabricated proof/reviewer/waiver; recovery доверяет подменяемому digest и не определяет edge-level scope. Это ограничения synthetic моделей, не установленные дефекты NaCl. Реальный graph, настоящие права/fence и restore не проверялись.

| Критерий | Статус | Причина |
|---|---|---|
| ba_sa | blocked | Не доказаны подлинность подтверждений, semantic consistency и реальный graph/fence. |
| evidence | blocked | Trusted claims не доказывают identity/proof; реальная policy waiver UNKNOWN. |
| recovery | blocked | Trusted digest и edge scope не подтверждены; реальная authority/restore UNKNOWN. |
| synthesis | blocked | Полная карта действующих гарантий и применимости к исходным charter не установлена; цена/эффект UNKNOWN. |
| verification | blocked | Независимые controls выполнены, но в synthetic моделях остаются случаи ложного успеха при неподтверждённых входах. |

Два раунда завершены, третья коррекция не проводится. Три прототипа и результаты пригодны как ограниченный вход в план модернизации при сохранении исходного PARTIAL и всех UNKNOWN; не считать их безопасной реализацией или подтверждением ускорения.

