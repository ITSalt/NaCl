# WP-10 — статическая сдача платформы и клиентов

WP-01 DONE по D-5. Pinned NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; источники: [WP-10 preliminary](WP-10-preliminary.md), [closure](WP-10-skill-closure-trace.md), [JS dependency](WP-10-js-dependency-trace.md), [auth/transport](WP-10-auth-transport-trace.md), [full provenance](WP-01-full-package-provenance.md). Ранее выполненные disposable builds/probes указаны в ссылках; в этом раунде tests, graph и A/B не запускались.

| Канал / consumer | Гарантия и возможная альтернатива |
|---|---|
| Canonical + overlay → generated full package → Skills-only closure | Provenance и отдельные package-local зависимости; единый manifest/resolver требует поддержать dynamic/conditional paths и клиентов. В synthetic fresh bundle checker VERIFIED, diagnose не стартовал без vendor; installed runtime не проверен. |
| Full gateway / Skills-only MCP / public HTTP | Identity, scope, authority и read-back различаются; project_scope нельзя считать ACL без доказанной реализации. Typed transport contract требует отдельно проверить principal, lease/fence и denial каждого канала. |
| Public HTTP audit/idempotency | Deployment injects adapters. Ранее fake-adapter probes показали final audit error после fake effect и replay в process-local ledger, а также условный BLOCKED object→VERIFIED; реальный adapter contract, HTTP и durable retry UNKNOWN. |
| Routers, hooks, agents, CLI и CI | Контракты и definitions не доказывают active route или successful run. Проверять требуемые checks/event/exact SHA; literal duplication сама по себе не означает ненужность closure. |
| Legacy installers / compatibility | Retire требует реальных consumers, версий, замены и отрицательных проверок; подтверждённого кандидата на удаление нет. |

Все альтернативы DEFER. Полная semantic/dynamic closure, реальные права/deployment, стоимость поддержки каждого канала и частота UNKNOWN; отсутствие данных не доказывает отсутствие consumers. Вложенный private `meta/` — отдельный репозиторий вне pinned tree. Не объявлять исходный charter полностью выполненным до независимого review и проверки покрытия/checkout.
