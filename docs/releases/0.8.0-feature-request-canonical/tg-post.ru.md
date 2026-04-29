**NaCl 0.8.0: FeatureRequest становится графовым артефактом**

`nacl-sa-feature` теперь пишет узел `:FeatureRequest` в Neo4j рядом с markdown'ом, со связями `INCLUDES_UC` / `AFFECTS_MODULE` / `AFFECTS_ENTITY`. Markdown остаётся источником правды для прозы и acceptance-критериев; граф становится источником правды для scope. Downstream-скиллы (`nacl-tl-conductor`, `nacl-tl-plan --feature`, `nacl-tl-full --feature`) перестают откатываться к парсингу markdown.

Алгоритм аллокации FR-id теперь защищён от коллизий: он сканирует диск + граф + все лейблы узлов одновременно, уважает зарезервированные namespace `FR-LEG-*` / `FR-LEG-INTAKE-*` для tombstones, поддерживает sub-namespace через `--namespace=DOM`.

В `nacl-sa-validate` появился новый уровень — `L7 FeatureRequest Consistency` — с шестью проверками: соответствие markdown↔graph, целостность рёбер, дрейф значений `kind`, висячие ссылки, дубли markdown-файлов, использование одного FR-id под разными labels.

Также исправлен давний баг с терминологией: `nacl-sa-feature` ссылался на лейблы `Screen` / `NavigationRoute`, которых никогда не было в SA-схеме. Переписан в терминах канонической UI-модели `Form` + `Component(component_type='navigation')`.

Schema-delta (idempotent, один раз) и полный гайд по апгрейду: `docs/releases/0.8.0-feature-request-canonical/release-notes.md`
