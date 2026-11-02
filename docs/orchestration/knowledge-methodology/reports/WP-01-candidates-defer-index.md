# WP-01: категории и условия кандидатов

Все 55 групповых ID наследуют DEFER из вводных [BA/SA registry](WP-01-mechanism-registry-ba-sa.md) и [TL/platform registry](WP-01-mechanism-registry-tl-platform.md). Условия — предлагаемые проверки для пересмотра, не доказанное равенство альтернатив и не результаты исполнения. Цена/частота UNKNOWN.

| Группы | Условия пересмотра по порядку ID |
|---|---|
| BA-01–09 | Scope/failed write; performer/orphan; lifecycle/N:M; identity/rebuild recovery; rule semantic drift; provenance/graph-down; readback/retry; DISTINCT/handoff; partial specialist/human gate |
| SA-01–09 | External contract/wire; domain-role mapping; UI/navigation exemptions; invalidation/recovery; UI intent; internal/cross validation; snapshot freshness; phase gate; client route/canary |
| 04.1–04.6 | Intake uncertainty; contract closure/drift; remote lease; phase evidence; reconciliation; adapter authority/readback |
| 05.1–05.6 | TECH baseline; BE/FE contract; spec-first fix; stub identity/shape; reopened partial/retry; hotfix dirty tree/authority |
| 06.1–06.5 | Meaningful RED; review gate / exact SHA / evidence независимости; acceptance trace; QA FAILED/NOT_RUN; syntactic parser versus semantic/live gate |
| 07.1–07.5 | PR/CI SHA; checkout/environment; product QA versus health; docs authority; external publish partial/read-back |
| 08.1–08.5 | Goal capability/proof; status freshness; reconciliation; wire; migration/init/postmortem boundaries. 08.5a/b/c — части одного исходного ID |
| 09.1–09.6 | Graph authority/cache; board retry; identity/TTL; fence/CAS/idempotency; snapshot/semantic restore; event/queue/UI |
| 10.1–10.4 | Source/projection closure; Skills-only transform/closure + project MCP/canary; transport identity/isolation; CI head versus metadata |

Подробные условия и cases: [BA](WP-01-ba-falsifier-matrix.md), [SA](WP-01-sa-falsifier-matrix.md), [TL часть 1](WP-01-tl-falsifier-matrix-part1.md), [часть 2](WP-01-tl-falsifier-matrix-part2.md). В реестрах и matrices нет группового ID без наследуемой категории. Это не доказывает полноту ещё не выявленных атомов: [gap review](WP-01-registry-gap-review.md) и [crosswalk](WP-01-gap-candidate-crosswalk.md) содержат дополнительные обязанности, соответствие каждой отдельной карточке и условию пока не проверено. Typed alternatives не означают принятую рекомендацию SIMPLIFY/MERGE.
