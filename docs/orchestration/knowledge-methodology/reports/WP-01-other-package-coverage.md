# WP-01: прочие root и resource packages

Read-only package-level mapping на NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Групповой реестр — WP-01-mechanism-registry-tl-platform.md. Ниже отсутствие прямой строки не означает отсутствие косвенной связи или поведения; полные producer→consumer traces и runtime не проверены.

| Package | Источник и основная обязанность | Отражение / остаток |
|---|---|---|
| nacl-core | SKILL.md:4–6,9–16, общие Neo4j/schema/ID/Excalidraw conventions | 09.3 охватывает identity/claim, не всю общую обязанность; отдельная строка нужна |
| nacl-goal | SKILL.md:5–13, alias→GOAL_PROOF | 08.1; root и Codex не приравнивать |
| nacl-init | SKILL.md:5–16, root init и CLAUDE.md | 08.5 и samples описывают Codex bootstrap, root отдельно уточнить |
| nacl-migrate | SKILL.md:5–10, миграция с validation и report | 08.5 обобщает, не покрывает все этапы |
| nacl-migrate-ba | SKILL.md:5–12, deterministic parsing, unknown formats fail | отдельная package строка нужна |
| nacl-migrate-sa | SKILL.md:5–14, parse и graph/cross-layer links | отдельная package строка нужна |
| nacl-migrate-core | nacl_migrate_core/preflight.py:1–16 и adapters/detect.py:1–5,41–65 | resource package без root SKILL, scanner и adapter; execution неизвестно |
| nacl-postmortem | SKILL.md:5–11, анализ post-done bugs | 08.5; историческая причинность требует evidence |
| nacl-publish | SKILL.md:13–26, graph→Docmost и заявленные board routes | 07.5 и mechanism samples |
| nacl-render | SKILL.md:5–13, graph→Markdown/Mermaid | отдельная карточка в WP-01-additional-mechanisms.md:12 |

Root publish :24,32 ссылается на nacl-render excalidraw, тогда как render :8,13 сообщает перенос board rendering в analyst-tool. Это текстовое расхождение маршрутов, а не доказанная ошибка runtime. Пакет nacl-tl-core учтён в TL coverage как resource package без root SKILL.
