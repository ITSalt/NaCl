# WP-01: решение по границам подобластей

Решение координатора по source-level инвентаризации WP-01; detailed evidence и отмеченные UNKNOWN — в [матрице покрытия](WP-01-subarea-coverage-matrix.md) и [platform crosswalk](WP-01-platform-scope-crosswalk.md). Covered означает наличие карты типов обязанностей и проверяемых источников, не полноту каждого runtime outcome, всех файлов или доказанную взаимозаменяемость. Неподтверждённые связи остаются открытыми для последующих WP.

| Подобласть | Решение и источник границы |
|---|---|
| BA, SA, TL, shared `nacl-*/` | Covered source-level по package index, реестрам, выборкам и gap crosswalk; сохраняются UNKNOWN потребители и recovery. Каждую строку Cypher отдельно не считаем самостоятельной подобластью |
| `skills-for-codex/`, `codex-plugin-src/` | Covered source-level по картам SKILL, overlay samples и классам gateway/CLI/bootstrap/schema/references/catalog. Resource transforms сопоставлены для full-package в [provenance](WP-01-full-package-provenance.md); installed routing остаётся UNKNOWN |
| `scripts/*manifest*` | Включены оба pinned источника `scripts/codex-plugin-manifest.json` и `scripts/plugin-manifest.json`; другие scripts — исследованные зависимости соответствующих направлений, не расширение санкции на изменение |
| `docs/` | Covered source-level: root, ADR, guides, methodology, setup, research, releases, presentations включены в источник решений и claims. Группировка и количество tracked docs — в [docs index](WP-01-docs-scope-inventory.md); конкретные непросмотренные claims UNKNOWN; уникальные demo и economics не исключаются |
| Повторные presentation artifacts и переводы | Дедупликация лишь в подсчёте независимых механизмов при подтверждённом происхождении; PDF/deck и переводы не исключаются целиком из чтения, различающиеся claims сохраняются |
| `tests/` и `bench/` | Covered source-level по [карте tests/bench](WP-01-tests-bench-scope.md), с отдельными mock/skip/live границами. Выполнение для пилота и дальнейший challenge — соответствующие следующие WP; это не исключение источников |
| BA→SA, SA→TL, dev→QA→release, recovery | Covered по четырём статическим примерам и зафиксированным незакрытым links; фактические routes/recovery UNKNOWN, детальные исследования WP-11–14 |
| Graph-infra, analyst-tool, tracker, Docmost, CI | Covered как смежные source-level области по platform crosswalk; runtime, внешние действия и дальнейшие условия остаются в соответствующих WP |
| Family Cinema и remote graph | Остаются обязательным полигоном D-3. Candidate Git/snapshots не доказывают graph baseline; графозависимые проверки и серия не признаны выполненными |
| Private `meta/` | Исключён как отдельный приватный репозиторий вне pinned NaCl tree; никаких выводов о его содержимом |
| Изменения NaCl, production, release и внешняя публикация | Исключены как операции WP-01 по D-2; исходники, описывающие эти процессы, остаются в исследовании |

Разграничение областей не устраняет открытые вопросы по корпусу/rubric и не означает принятия WP в целом. Неизвестное остаётся UNKNOWN, а не исключением из области.
