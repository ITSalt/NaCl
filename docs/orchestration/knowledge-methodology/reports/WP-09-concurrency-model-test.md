# WP-09: локальная модель конкурентности

2026-11-02, NaCl checkout `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`, Node local. Команда из корня репозитория:

```text
node --test tests/codex-plugin/scripts/nacl-concurrency-model.test.mjs
```

Результат: 16 tests, 16 pass, 0 fail, 0 skipped; около 54 ms. Среди проверок — различие worker sessions, OS principal spoof, сериализация 10 claims, lease expiry/fence, CAS и idempotency, 1000 model allocations, незавершённый ledger. Тест использует `SerializableModel` и код `plugins/nacl/runtime/graph-gateway`; это model/unit результаты на локальных файлах, не Neo4j/Docker, не Skills-only project MCP, не подтверждение текущего графа Family Cinema или устойчивости к crash между graph и JSON. Graph не вызывался. Нарушение протокола WP-01: команда была запущена из основного checkout, а не в disposable sandbox. Тест проверен по коду как model-only, после запуска checkout чист. Повтор на отдельном временном Git archive закреплённого commit: 16/16 PASS, 0 skipped; копия удалена после проверки. Отдельного ограничения сети на уровне ОС не применялось, model transport использует mock, live graph не вызывался.

Отдельный [sanitizer probe](WP-06-sanitize-probe.md) описывает другой аспект — синтаксис QA evidence и НЕ опровергает успешность этих 16 тестов. Связь функций с полной политикой downstream ещё требует отдельной проверки.
