# WP-13: разработка → review/QA → release

Статическая сдача по NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; обычный Git status чист, ignored не проверялись. Использованы [принятые исторические примеры](WP-FRAMEWORK-19.md) и накопленные трассы. Новые runtime/graph/QA/CI не запускались.

## Evidence и свежесть

FE dev описывает acceptance/test-spec/API, baseline/RED/GREEN и result; reviewer проверяет каждый AC; sync отдельно сверяет FE URL/method/body и BE route, а также wire. Non-SYSTEM missing/stale в просмотренном описании — UNVERIFIED, SYSTEM n/a и W4 рассматриваются отдельно. QA требует отображения AC→stage→status и non-PASS для unmapped UI AC. Это source-level контракты: полная фактическая передача sync wire в QA, связь каждого test с AC/SHA/env и runtime handoff не установлены. [Трасса](WP-13-dev-qa-evidence-trace.md), [per-AC review](WP-06-per-ac-review-trace.md).

Root QA в изученной ветке использует существующий scenario без видимого сравнения hash/revision с acceptance; отдельно требует mapping текущего AC. Отсутствие проверки в выбранном фрагменте не доказывает её отсутствия везде или false PASS. Существующие test-path/qa-stage tokens сами не содержат полного head/env/fixture контекста, repo-checks-GREEN содержит SHA; другой consumer может добавлять сведения. При изменении AC с тем же ID, head, окружения или provider следует проверить применимость старого evidence; автоматическая invalidation всех зависимостей не установлена. [Freshness](WP-13-qa-scenario-freshness.md).

QA aggregate FAILED вместе с обязательным NOT_RUN может стать UNVERIFIED — non-success, не доказанный false PASS. Release требует prod-golden-path VERIFIED либо применимое signed exception и HALT для missing/not-run; фактический serializer QA→Task token→release не прослежен. Deploy требует совпадающий deployed SHA и отдельно health; успех CI не доказывает деплой или пользовательский сценарий. Один рассмотренный helper выбирает recent branch run без SHA/workflow metadata, но иные gates возможны и wrong-run PASS не наблюдался. [QA→release](WP-01-qa-release-contract-trace.md), [выбор CI](WP-07-ci-selection-trace.md).

QA описывает возврат regression и повтор, reopened — repro либо UNVERIFIED, spec-first fix, regression, baseline/post-change и review. Полная invalidation затронутых AC и фактические reruns не наблюдались. Стоимость и частота повторов UNKNOWN. Случаи UC030, FR041 и FR030 в WP19 показывают границу text-test, inject/mock и document GREEN; их наличие не доказывает исполнения или полного покрытия charter.

## Уточнение передачи и восстановления

| Producer → consumer | Формат и ограничение invalidation |
|---|---|
| FE dev → review | Acceptance/test-spec/API и baseline/RED/GREEN; точная привязка каждого теста к AC/SHA/среде не установлена. |
| FE+BE → sync → QA | URL/method/body/route и wire fixture/contract-test/live-smoke; передача и чтение wire в QA не установлены, строка сама не доказывает head/env/provider. SYSTEM n/a и W4 имеют отдельную source-level область. |
| QA → release | Per-AC/stage/status и Task qa-stage token; serializer и runtime consumer не прослежены, FAILED+NOT_RUN остаётся non-success. |
| Review/CI → deploy | Repo-checks-GREEN:SHA и deployed SHA/health; выбор helper по branch сам по себе не доказывает wrong-run acceptance. |
| Reopened → fix → QA | Repro или UNVERIFIED, spec-first, regression и независимый review; граф affected AC и автоматическая invalidation не установлены. |

Отдельные гарантии: sync wire защищает от несовпадения реального route при совпавших DTO; unified запись DEFER из-за возможной путаницы fixture и provider. QA aggregate/token должен сохранять non-PASS и per-stage/W4; унификация DEFER до проверки сериализации. Reopen требует repro и независимого review; selective rerun DEFER до установления зависимостей. Цена всех групп UNKNOWN; proposed negative cases — wrong URL, FAILED+NOT_RUN и изменённый общий API. [Первый независимый review](WP-13-independent-review.md) проверил семь ссылок и обычный HEAD/status, не первичные строки или runtime.

## Кандидаты и проверки

| Кандидат | Consumer / задача | Цена, риск и предложенные controls |
|---|---|---|
| KEEP per-AC semantic review и применимый sync wire | QA/reviewer; разные свойства требований и интерфейса | UNKNOWN; нельзя считать fixture live; сохранять отдельные требования к evidence |
| DEFER versioned AC→test/stage и selective rerun | QA/release; исключить устаревшее evidence | UNKNOWN; пропущенный provider/env; changed AC при том же ID, новый HEAD, удалённый test и positive same-head/env |
| DEFER evidence bundle screenshots | QA reviewer; связать screenshot с revision/env | UNKNOWN; утечки, недоступные ссылки; empty PNG, interrupted copy, предыдущий архив и read-back |
| DEFER CI attestation + deployed revision | deliver/release; точный repo/PR/head/workflow/checks | UNKNOWN; потеря exception/post-merge scope; два зелёных SHA/workflow, missing required check, health 200 при failure пользователя |
| DEFER typed provider/no-op evidence | stubs/QA; различать docs/mock/fixture/live | UNKNOWN; неверно приравнять fixture к live; отрицательные n/a vs provider и stale dependency |

Все controls предложены, не выполнены. Наличие fixture не доказывает live provider и не делает live вызов обязательным без его собственного требования и разрешения. [Screenshots](WP-13-qa-screenshot-evidence.md).

## Оставшиеся вопросы

Полный охват adapters/modes и каждого механизма, serializer QA→token→release, граф зависимостей для invalidation, реальная стоимость повторов и гарантии объединения gates не доказаны. Независимое review по исходному charter обязательно; никаких ускорений не заявлено.
