# WP-01: docs/ — инвентарь и предварительные связи

По git tree NaCl 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Все docs/ входят в общий read scope WP-01; тематические связи ниже являются предложениями, если не помечены как прямые. Инвентарь не означает чтение каждого документа и не доказывает claims/runtime.

| Область | Файлы в tree | Scope и граница |
|---|---:|---|
| docs/adr | 5 | WP-01; proposed WP-10 для исторических решений упаковки, напр. 005-codex-skills-only-bootstrap.md |
| docs/guides | 4 | WP-01; proposed WP-15 для goal proof и permissions, guide не доказывает CLI поведение |
| docs/methodology | 14 | WP-01; proposed cross-links BA/SA и WP-11; не подменять исходники и execution |
| docs/presentations | 69 | WP-01; слайды/PDF/сборки — предложенные кандидаты исключения как производные материалы, demo script может содержать указатели на уникальные claims, исключение ещё не принято |
| docs/releases | 128 | WP-01; proposed WP-07/10 для истории поставки и packaging; notes/drafts не доказывают deployment |
| docs/research | 50 | WP-01; proposed WP-16/17 и стыки WP-09/10; каждую дату, источник и claim проверять отдельно |
| docs/retrospectives | 9 | Прямой read scope WP-16/17; историческая причинность требует primary traces |
| docs/runbooks | 10 | Прямой read scope WP-07; proposed WP-09/10 по конкретным graph/Codex контурным источникам |
| docs/setup | 16 | WP-01; proposed WP-09/10 для graph setup и portability; не разрешение менять установку |
| docs/* root files | отдельно | WP-01; proposed WP-09 для graph schema, WP-07/09 handover, WP-10/15 Codex и adapters; возможные производные копии исключать лишь после смысловой сверки |

Counts — inventory Git tree, не число прочитанных или проанализированных документов. WP-01-nonpackage-scope-index.md фиксирует другие области, private meta остаётся вне pinned tree и не изучался.
