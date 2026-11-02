# WP-10: предварительное исследование упаковки, клиентов и runtime

[Authorization границы transports](WP-10-auth-transport-trace.md) разделяют package gateway и project MCP без предположений о текущей конфигурации.

[Skills-only resource closure](WP-10-skill-closure-trace.md) — анализ исходников и установленного дерева; свежая сборка и probes описаны отдельно.

Предисследование до принятия WP-01, NaCl SHA `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`. Full-package --check позднее прошёл в disposable sandbox ([матрица](WP-01-acceptance-matrix.md)); gateway server/MCP, live runtime, CI и release не запускались; отдельная свежая Skills-only сборка и checker выполнены в disposable sandbox, отдельная локальная функция runtime проверена в WP-06-sanitize-probe, а [Node probes](WP-10-js-dependency-trace.md) выполнены в disposable-копиях, включая sandboxed запуск копии diagnose runner; установленный skill не запускался.  цена/частота unknown; выводы DEFER.

## Public HTTP MCP и durability adapters

`services/nacl-mcp/src/service.mjs:62–76` требует capability-функции и строковые markers durable/shared у внедрённых adapters; один marker не доказывает сохранение после restart или межпроцессную атомарность. `src/idempotency.mjs:12–46` использует process-local Map и прямо маркируется как такой. В opt-in Docker topology fixture `test/topology-docker-e2e.test.mjs:32–34,178–179,205–222` маркеры in-memory adapters заменяются на durable/shared, а graph mutate/schema/backup/restore заглушены; реальные disposable Neo4j containers там предусмотрены для других проверок. Такой тест не доказывает durable ledger, restart/multi-instance recovery или production deployment. README :32–45 требует deployment-owned adapters; фактический adapter UNKNOWN.

Отдельный исход audit: `services/nacl-mcp/src/application.mjs:72–125,145–159` до mutation ждёт audit reservation, а после вызова graph/ledger ожидает final audit в finally. Если первая запись и mutation прошли, а final audit отклонился, исключение вытеснит подготовленный success; rollback из этих строк не следует. Тест `test/topology-auth.test.mjs:530–552` проверяет отказ первой audit-записи и отсутствие graph calls, не второй отказ после side effect. Повтор с тем же key может быть безопасно воспроизведён корректным ledger, но реальный adapter и response boundary UNKNOWN; duplicate или production incident не доказаны. Proposed fake control: first audit success, graph effect, second audit fail и retry того же key; отдельно first audit fail.

Два независимых disposable sandbox probe напрямую вызвали pinned application с synthetic adapters: при успешной reservation и fake graph effect финальный audit отказал, caller получил исключение после одного вызова; повтор с тем же key/payload в том же process-local ledger вернул VERIFIED/replayed без второго graph call. Canaries запретили write вне temp и loopback connect. Это не проверка SDK/HTTP, схем входа, реального graph, durable storage или retry после restart.

В тех же двух synthetic probes fake read adapter вернул `{status:"BLOCKED",code:"LOCKED"}`, а application вернул VERIFIED/OPERATION_COMPLETED с пустым data: `safeData` не копирует эти поля. Это условный integration-contract риск, а не доказанный false PASS deployed сервиса: не установлено, допускает ли реальный adapter отказ как return value вместо exception; иные поля могут приводить к ошибке. Отдельно нужна проверка фактического adapter contract и транспортного слоя.

Предлагаемые controls: два instance с одним idempotency key, restart и прерывание после side effect до сохранения результата; positive — проверенный durable adapter и явный recovery contract. Возможны другие безопасные реализации и reconciliation, повтор side effect в реальной системе не установлен. Это public HTTP service, не local package gateway; тесты здесь не запускались, DEFER.

## Упаковка и фактическая установленная версия

`codex-plugin-src/README.md:3–16`, `scripts/build-codex-plugin.mjs:332–369` показывают source→overlay→generated; `scripts/build-codex-skills-only.mjs:245–278,309–320` формирует отдельные closure. Установленный Skills-only NaCl 0.2.2 имеет 10 публичных roots, 154 файла внутри skills, 1 157 359 bytes; по SHA256 119 уникальных содержимых и 298 565 bytes буквальных повторов. Это storage на момент наблюдения, не токены и не доказательство лишней сложности: отдельные closure могут требовать копии.

Installed `release-manifest.json` указывает source `c291c798fcfda697dd8d93f23ffc6d7e68528a5a` — предок 20fe4c6, не тот же commit. Из 159 перечисленных payload файлов все найдены, у 158 совпадают SHA-256/размер; `.codex-plugin/plugin.json` отличается: manifest 2805 bytes / `81de08593a81e092f17b4fc52bd0bcaaa4a77c15837f3072851db4d2857f8307`, installed 2880 / `830115c29ba90fcc5c77c0d83f98764b71b238ae3fd5f7aa6f9a62b8de621514`. Координатор повторил вычисление. Причина неизвестна; проверка не установила подпись, права, tree hash или отсутствие незаявленных файлов и не доказывает компрометацию. Все перечисленные файлы skills совпали по hash. Read-only инвентаризация нашла сверх перечисленного payload и release-manifest три `.codex-plugin/assets/` изображения; symlink не найдено. Причина этих дополнительных файлов не установлена и сама по себе не доказывает нарушение.

Builder и исходный runtime contract одинаковы по Git blob в c291 и 20fe; installed contract содержит воспроизведённое противоречие read canary ([детали](WP-01-skills-only-canary.md)). Negative test должен одновременно сохранить допустимость project read canary и запрет doctor/package gateway. Полную идентичность всех installed bytes текущему checkout утверждать нельзя.

## Границы transport

Full local package MCP (`codex-plugin-src/package/.codex-plugin/plugin.json:46`), Skills-only project-local Neo4j MCP (`codex-plugin-src/package/resources/references/skills-only-runtime-contract.md:106–132`) и public HTTP service (`services/nacl-mcp/README.md:3–16,27–45`) различаются по identity, authorization и операциям. Public deployment требует внешнего verifier/durable state; его работа не проверена. Альтернатива одному общему транспорту должна подтвердить identity, scope, concurrency/fence, read-back и idempotency отдельно на каждом маршруте.

## Качество доказательств и измерения

`.github/workflows/test-codex-plugin.yml:38–56,70–97` содержит deterministic и Docker jobs; их определение не доказывает конкретный CI run. Negative tests: уникальность generated destinations; одинаковые роли source/overlay; closure containment; wrong audience и stale fence; idempotency replay; запрет raw Cypher на public HTTP.

`codex-plugin-src/package/.codex-plugin/plugin.json:22` называет оценки 550/150000 tokens и 5831/1480 человеко-часов измеренными; `tests/codex-plugin/scripts/nacl-interface-metadata.test.mjs:22` фиксирует текст строки. Raw traces и метод равнозначного сравнения ещё не найдены; точный metadata test подтверждает только наличие утверждения. WP-16 должен искать исходные данные и отдельно помечать estimate/runtime measurement. Нельзя считать эти числа доказанными или ложными без изучения источников.
