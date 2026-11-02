# WP-12 предварительно: SA Requirement → TL acceptance

Pinned NaCl 20fe4c6; dependency WP-01 открыта. Source-only: graph/tests не выполнялись, стоимость и частота UNKNOWN, DEFER.

Root `nacl-sa-uc/SKILL.md:661–744` описывает Requirement с canonical `rq_type`, UC→HAS_REQUIREMENT и RQ→REALIZED_BY к ActivityStep/FormField/Form/Screen с `anchor_kind` и provenance. Codex `skills-for-codex/nacl-sa-uc/SKILL.md:66–73,276–282` описывает authored contract. Root validator `nacl-sa-validate/SKILL.md:734–781` определяет class через `coalesce(rq_type,req_type,type,unknown)` и проверяет наличие и target label с разной severity; показанный WHERE не проверяет равенство edge `anchor_kind` и class.

Root `nacl-tl-plan/SKILL.md:684–706,961–968,1053–1064` и named `graph-infra/queries/sa-queries.cypher:9–29` возвращают целые Requirement nodes: `rq_type` может присутствовать среди node properties. Но в показанном результате отдельно не возвращаются REALIZED_BY edges или пары RQ→anchor; карта planner описывает `type` как FR/NFR, что не следует автоматически приравнивать к `rq_type`. Это ограничение конкретного query/map; дополнительные чтения и фактические output files не проверены, потеря данных не доказана.

Codex planner `skills-for-codex/nacl-tl-plan/SKILL.md:162–181` описывает slice `covers` и VERIFIED_BY, что не доказывает сохранение RQ→REALIZED_BY. Альтернатива — ID/class/anchor-aware snapshot с явной нормализацией и human exceptions; риск — смешать разные class axes или излишне связать источники. Proposed controls: два RQ с одинаковым текстом, разными class/target, legacy req_type и reserved type; positive — сохранённые source IDs/class/anchor и мотивированные исключения. Не выполнялись.
