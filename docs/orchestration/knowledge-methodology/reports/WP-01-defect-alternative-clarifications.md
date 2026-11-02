# WP-01: назначение механизмов и риск альтернатив — выборка

NaCl 20fe4c6. Назначение ниже заявлено источником; историческая причинность, частота и фактически предотвращённые инциденты UNKNOWN. Риски альтернатив — гипотезы, а не результаты выполненных проверок.

| Группа и назначение | Предлагаемая альтернатива и риск |
|---|---|
| 04.1 intake: `codex-plugin-src/workflow-overlays/nacl-tl-intake/SKILL.md:19–54,55–84` классифицирует запрос и graph context, маркирует fallback и задаёт границы confirmation/auto-routing; цель — снизить неверную маршрутизацию и неподтверждённую мутацию | Typed intake может потерять provenance/uncertainty и различие рекомендации от санкции на выполнение. Auto-route не следует объявлять полностью запрещённым |
| 04.3 next: `codex-plugin-src/workflow-overlays/nacl-tl-next/SKILL.md:17–25,29–51` выбирает actionable по dependencies, remote authority, claim/lease/fence; цель — не назначать недоступную или чужую задачу по stale cache | Ranking без authority/freshness и claim может терять эти гарантии; local read-only и remote mutation — разные ветви |
| 05.4 stubs: `nacl-tl-stubs/SKILL.md:15–32` сканирует production/tests и registry, различает непроверенное/неработающий runner/regression; цель — не считать незавершённое или пустую test scope чистым результатом | Одни contract tests могут пропустить placeholder вне проверенного пути или отсутствие файлов; достаточно полные дополнительные checks могут эту потерю закрыть |
| 07.4 docs: `skills-for-codex/nacl-tl-docs/SKILL.md:18–39,50–54` связывает docs с approved review и implementation evidence, требует confirmation/read-back | Scoped diff может пропустить основание разрешения, нужные consumer docs или подтверждение записи; фактический downstream commit UNKNOWN |
| 09.3 legacy claim: `nacl-core/scripts/resolve-developer-id.mjs:1–16,60–64`, `nacl-core/scripts/claim-task.mjs:19–42,45–52` задают ID из env/config с machine-derived fallback, TTL claim и release владельцем; цель — снизить двойное назначение Task | Замена fenced identity должна сохранить TTL/recovery и ownership; одинаковый dev ID допускает повторный claim, это не уникальный worker principal или project-wide mutex. Реальное stale-worker refusal не доказано |

Исходные candidate/контрпримеры: [TL часть 1](WP-01-tl-falsifier-matrix-part1.md), [TL часть 2](WP-01-tl-falsifier-matrix-part2.md). Альтернативы не заявлены реализованными, предложенные проверки не запускались.
