# Runbook: подключение к существующему удалённому графу проекта

**Для кого.** Для разработчика, который присоединяется к проекту с уже работающим на доступном VPS
отдельным контейнером Neo4j 5 Community. Не создавайте локальную Docker-инфраструктуру и не загружайте
схему повторно.

**Результат.** NaCl подключается к контейнеру проекта через локальный mTLS-sidecar. Закоммиченный
маршрут не содержит секрета. Получение секрета в runtime обязательно и работает fail closed.

## Предварительные требования

- Персональный bundle от владельца сервера: `client.crt`, `client.key` и `ca.crt`. Храните его вне
  репозитория, например в `~/.nacl/certs/<project_scope>/`.
- Установленные `ghostunnel` и `node`, а также клонированный репозиторий проекта.
- Закоммиченный маршрут `graph.mode: remote` с endpoint проекта и путями к сертификатам.
- Обязательный `graph.remote.secret_source` с одной из двух точных непрозрачных ссылок:
  `env:NEO4J_PASSWORD` или `server-route:<id>`.

`env:NEO4J_PASSWORD` требует наличия `NEO4J_PASSWORD` в окружении runtime, запускающего secret
launcher. `server-route:<id>` требует внешнего провайдера из `NACL_SERVER_ROUTE_SECRET_PROVIDER`.
Если выбранная переменная или провайдер отсутствует, пуст или невалиден, остановитесь и исправьте
его: fallback на сырой, общий, demo или default пароль отсутствует.

## Запуск sidecar

1. Установите и запустите tunnel один раз на машине:

   ```sh
   sh <NaCl>/graph-infra/scripts/install-sidecar.sh \
     --project-scope acme-billing --host graph.example.com --gateway-port 7687 \
     --sidecar-port 3700 \
     --cert ~/.nacl/certs/acme-billing/client.crt \
     --key ~/.nacl/certs/acme-billing/client.key \
     --cacert ~/.nacl/certs/acme-billing/ca.crt --start
   ```

   Команда открывает `bolt://localhost:3700` и передаёт трафик в gateway проекта по mTLS.
   Installer включает системный autostart, если не передан `--no-autostart` или `-NoAutostart`.

2. Проверьте sidecar:

   ```sh
   # macOS
   launchctl print gui/$UID/com.nacl.sidecar.acme-billing | grep state
   ```

   ```powershell
   # Windows
   Get-ScheduledTask -TaskName "NaCl Sidecar acme-billing"
   ```

## Сохранение непрозрачного маршрута секрета

Remote-блок графа должен содержать выбранную ссылку. Например:

```yaml
graph:
  mode: remote
  neo4j_uri: "bolt://localhost:3700"
  project_scope: "acme-billing"
  remote:
    route_mode: "connect"
    secret_source: "server-route:acme-billing"
```

Транзакция remote-route записывает `graph.remote.secret_source` в `config.yaml`. В `.mcp.json`
попадают только та же непрозрачная ссылка и метаданные launcher/маршрута; сырой, общий, demo или
default пароль Neo4j никогда не сериализуется. Не заменяйте ссылку паролем. Перед успешным результатом
оба файла читаются обратно и валидируются.

## Подключение и проверка

1. Выполните команду своего канала и не смешивайте каналы установки:

   - CLI symlink channel: `/nacl-init --scale=connect` или `/nacl-init --from .`.
   - Плагин Claude Code Desktop: `/nacl:init --scale=connect` или `/nacl:init --from=.`.
   - Плагин Codex: попросите установленный скилл `nacl-init` подключить маршрут текущего проекта.

   Операция транзакционно записывает remote-маршрут, регистрирует проект и выполняет read-only gate.
   Legacy-каналы завершаются `NACL_GRAPH_RESULT: status=CONNECTED|FAILED`; Codex возвращает
   соответствующий verified или blocked lifecycle-результат.

2. Если read-only gate сообщает `project-missing`, проверьте endpoint и project scope. Собственный
   граф проекта мог быть не инициализирован. Владелец должен выполнить create-путь этого проекта;
   project marker относится к lifecycle/provenance, а не выдаёт доступ.

3. Перезапустите клиентское приложение, чтобы его runtime получил настроенное окружение/провайдер и
   перечитал `.mcp.json`.

## Критерии готовности

- [ ] Sidecar работает и открыл настроенный loopback Bolt-порт.
- [ ] `graph.remote.secret_source` точно равен `env:NEO4J_PASSWORD` или `server-route:<id>`.
- [ ] `.mcp.json` содержит непрозрачную ссылку и метаданные route/launcher без пароля.
- [ ] Connect-результат проверен, локальный контейнер Neo4j для проекта не создан.
- [ ] Read-only операция health/status NaCl возвращает данные этого проекта.
