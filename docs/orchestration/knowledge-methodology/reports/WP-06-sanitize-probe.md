# WP-06: локальный отрицательный probe sanitizeChanges

Снимок NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; выполнено 2026-11-02 локально в памяти через Node import `codex-plugin-src/package/runtime/graph-gateway/concurrency.mjs`, без файловых записей, графа или gateway-сервера. Координатор повторил probe исследователя.

Для `sanitizeChanges('Task', {status:'done', verification_evidence:'test-GREEN:tests/task.test.mjs qa-stage:component:<stage>'})`:

```text
FAILED: accepted {"status":"done","verification_evidence":"test-GREEN:tests/task.test.mjs qa-stage:component:FAILED"}
BLOCKED: accepted {"status":"done","verification_evidence":"test-GREEN:tests/task.test.mjs qa-stage:component:BLOCKED"}
NOT_RUN: accepted {"status":"done","verification_evidence":"test-GREEN:tests/task.test.mjs qa-stage:component:NOT_RUN"}
```

`concurrency.mjs:173–190,235–298` валидирует QA-токены по синтаксису, а ограничение done проверяет test-GREEN/no-test. Это факт поведения конкретной функции, не доказательство того, что весь gateway, методологический workflow или release примет задачу при красном QA: другие гейты и обязательность конкретной стадии не проверялись. Skills-only project MCP не исследован этим probe. Следующий шаг WP-06/13: проследить consumer и aggregate, required stage, атомарную запись и реальные отрицательные случаи.
