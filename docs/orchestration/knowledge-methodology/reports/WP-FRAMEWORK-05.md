# WP-05 — статическая сдача dev и fix

Pinned NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; исходные материалы: [WP-05 предварительно](WP-05-preliminary.md), [BE baseline](WP-05-be-baseline-trace.md), [FE RED handoff](WP-05-fe-red-handoff.md), [TL реестр](WP-01-mechanism-registry-tl-platform.md). Source contracts не доказывают runtime; root Claude и Codex не тождественны. Фактическая частота, число вызовов, длительность и цена UNKNOWN.

| Класс | Цель → consumer и защита | Альтернатива, риск и контроль |
|---|---|---|
| TECH | Самодостаточная задача и before/after verification → review/conductor; baseline связывает вывод с ресурсом (`skills-for-codex/nacl-tl-dev/SKILL.md:20–28,59–101`) | Краткий task + CI attestation рискует потерять baseline; сравнить команды и ресурс. |
| BE | Task/API contract, baseline и RED/GREEN → review/sync (`skills-for-codex/nacl-tl-dev-be/SKILL.md:19–39,48–92`) | Typed failure-set ledger должен сохранять test identity; проверить baseline→postfix и unrelated failures. |
| FE | FE task/API contract, baseline и RED handoff → review/sync (`skills-for-codex/nacl-tl-dev-fe/SKILL.md:19–35,43–73,96–114`) | Структурированный RED report рискует потерять независимость при общих fixtures; сохранить author lineage и baseline. |
| Fix | Классификация L0–L3, spec-first и evidence → review (`codex-plugin-src/workflow-overlays/nacl-tl-fix/SKILL.md:41–59,78–108`) | Typed fix contract может пропустить spec drift; проверить L1/L2 и отсутствие test infrastructure. |
| Hotfix | Ограниченный fix и verification → владелец/delivery (`nacl-tl-hotfix/SKILL.md:38–40,62–70`, Codex hotfix :20–31,66–105) | Общий incident workflow рискует потерять rollback и полномочия; root и Codex delivery различаются. |
| Reopened | Authoritative status → повторный fix/review → tracker/conductor (`nacl-tl-reopened/SKILL.md:13–38`, Codex overlay :57–96) | Typed result может не принять допустимое infra evidence или повторить partial side effect; сохранить reconciliation. |
| Stubs | Registry и shape validation → review/release (`nacl-tl-stubs/SKILL.md:13–28,86–105`) | Consumer contract tests должны покрыть missing sample, fake IDs и реальную форму provider. |

**Сравнение контекста.** Для малого fix source предписывает классификацию L0–L3 и spec-first при drift; кандидат для подтверждённого L1 — затронутое поведение, актуальный контракт, failure baseline и независимый regression case. Размер diff не доказывает класс L1. Для большой BE+FE feature исходные workflows передают отдельные task/test briefs, общие acceptance и API contract; кандидат упрощения — versioned срез UC и единый API contract с отдельными evidence. Общий документ не доказывает wire compatibility или сохранения независимости. Это гипотезы, не установленный универсальный минимум.

| Класс DEFER | Условие дальнейшего рассмотрения |
|---|---|
| TECH | Сравнить testable/non-testable infra path, baseline и идентичность команд. |
| BE | Сопоставить failure-set delta и несвязанные failures; разрешить приоритет root PASS/BLOCKED. |
| FE | Проверить передачу baseline и RED, включая unrelated failures. |
| Fix | Проверить L1 с актуальной spec, L2/L3 drift и Path C без test runner. |
| Hotfix | Проверить interruption/recovery и полномочия отдельно для root и Codex. |
| Reopened | Проверить partial side effect и Path C через downstream rerun gate. |
| Stubs | Проверить missing sample, fake IDs, происхождение sample и обязательные поля/типы. |

Все альтернативы DEFER; предлагаемые negative/positive controls не выполнены. Root Path C использует verification record, отдельно поясняя отсутствие тестового RED→GREEN; downstream reopened имеет собственный test rerun gate. Формальное сходство строк не доказывает runtime pass или merge. Root FE при отсутствии API contract содержит противоречивые инструкции, Codex FE требует BLOCKED; фактический outcome root неизвестен.

Исходный charter дополнительно требует минимальный достаточный контекст малого фикса и большой фичи, цену возврата к спецификации, совместимости и ожидания provider fixtures. Универсальный минимум, эти цены и полнота отдельных modes/consumers UNKNOWN; групповой срез не доказывает выполнения полного charter. В этом ограниченном раунде внешние действия, graph, tests и A/B не запускались. [Независимый review](WP-05-independent-review.md) проверил четыре прямых ссылки и чистый обычный статус NaCl при указанном SHA; ignored files и все первоисточники не охвачены. Категории и выводы нуждаются в повторном review после адресной коррекции.
