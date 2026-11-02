# WP-01: руководства, legacy recovery и graph doctor

Статическая выборка pinned дерева NaCl 20fe4c6; действия по миграции, запуск doctor и доступ к графу не выполнялись. Это не полный аудит 4 guides и 16 setup файлов.

`docs/setup/codex-legacy-compatibility.md:10–14,31–55` задаёт заявленный каталог из 60 legacy links, planToken, подтверждение плана и осторожное обращение с PARTIALLY_VERIFIED. Это отдельный контур полного Git/plugin package; его доступность в Skills-only не установлена.

В `codex-plugin-src/package/runtime/workflow-cli/legacy-symlinks.mjs:572–611` ссылки последовательно перемещаются в quarantine и удаляются; success receipt формируется после цикла и final read-back. При исключении :631–656 возвращаются детали removed/preserved и ошибки, а не гарантированно доступные receiptPath и quarantineRoot; аудит best effort. Receipt :428–436 описывает имена, но сам по себе не доказывает сохранение target mappings. Следовательно, инструкция сохранить полученные quarantine и receipt не доказывает их доступность и автоматическое восстановление при каждом partial. Не утверждаем произошедшую потерю данных. Injection callback после rename :577–581 задаёт отдельный предлагаемый тест crash/recovery, а не доказанный production trigger; детали статусов требуют отдельной проверки. Tool definitions :30–55 показывают plan/apply, но не доказывают наличие отдельной публичной rollback operation.

`nacl-core/scripts/graph-doctor.mjs:410–418,577–585` использует TCP probes и уведомляет при переходах; текст UP :392–397 говорит о безопасном использовании MCP, хотя один TCP probe не подтверждает handshake/auth/scope. :599–606 обрабатывает ошибку watcher с exit 0, поэтому отсутствие сообщений не подтверждает здоровье наблюдения. `docs/setup/graph-setup.ru.md:160–164` отдельно отмечает отсутствие наблюдения Desktop-уведомлений в указанной проверке. `--fix` может менять среду (:206–217); он не запускался.

`docs/guides/goal-permissions.md:18–21,95–99` описывает ограничения hooks/lock и detector; `nacl-goal/SKILL.md:71–79` оговаривает неактивность detector/lock в 2.10.0. Это граница версий и деклараций, а не доказательство обхода. Отдельная последовательность proof: [WP-01-goal-proof-sequence.md](WP-01-goal-proof-sequence.md).

Открытые проверки: безопасная изолированная модель ошибок до/после rename и receipt, точные возвращаемые поля и условия rollback, отдельно TCP/MCP authentication и фактическая доставка уведомлений. Ничего из этого не выполнено.
