# WP-06: предварительный engine-path probe с mock

2026-11-02, pinned NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`. Исследователь впервые выполнил in-memory probe из основного checkout, нарушив требование WP-01 о disposable среде; graph, реальные сеть и файлы не вызывались. Координатор повторил probe на отдельном временном `git archive` того же commit с mock transport; копия удалена после проверки. Отдельный network sandbox ОС не включался, probe содержит только mock transport.

Вход: `nacl_graph_mutate_resource`, Task, `status=done`, `verification_evidence='test-GREEN:tests/task.test.mjs qa-stage:component:FAILED'`, синтетические identity, lease/fence и revision. После tool argument validation и `runConcurrencyOperation` mock получил параметр changes без удаления QA FAILED:

```text
argument-validation: accepted
mock-transport changes: {"status":"done","verification_evidence":"test-GREEN:tests/task.test.mjs qa-stage:component:FAILED"}
mock-result: MUTATION_ACCEPTED
```

Последняя строка является подставленным ответом mock, не ответом Neo4j. Статический путь: `gateway.mjs:258–260,304–311` → `validation.mjs:172–180` → `concurrency-engine.mjs:159–196` → `concurrency-cypher.mjs:254–295`. Сформированный query применяет changes после membership/lease/fence/revision/idempotency, но в указанных строках нет проверки QA-status. Это не доказывает фактическую graph запись или release PASS.

Отдельный downstream контракт `verification-evidence.md:34–56` требует QA aggregate, а Codex `nacl-tl-release/SKILL.md:30–45,60–70` описывает блокировку FAILED/BLOCKED/UNVERIFIED с исключениями. Реальные consumer/release не запускались. Для приёмки нужны изолированная Neo4j, точный full gateway и QA/release consumer, отдельно Skills-only project MCP, с проверкой required stage и absence of external side effects. Текущий Docker socket не доступен, см. WP-01-test-environment.md.
