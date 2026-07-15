[Главная](../README.ru.md) > Справочник плагина Codex

🇬🇧 [English version](codex-plugin.md)

# Плагин NaCl для Codex

NaCl упаковывает ограниченный workflow layer и project-scoped graph gateway для Codex Desktop и CLI. Эта страница описывает установленный продукт; UI-путь приведён в [инструкции по установке](setup/install-codex-plugin.ru.md).

<!-- doc-key: product-summary -->
## Краткое описание

Плагин направляет запросы бизнес-анализа, системного анализа, разработки, диагностики, верификации, миграции и публикации через десять публичных входов. Эти conductors загружают только нужный из 60 внутренних workflows. Локальный MCP-сервер пакета предоставляет 25 ограниченных схемами инструментов; он не принимает произвольные graph statements или значения секретов.

Обычный пользователь получает карточку плагина или share/install-ссылку от владельца, устанавливает через Codex, выдаёт только показанные разрешения, полностью перезапускает приложение, открывает новую задачу и запускает installation doctor. Приватный share предполагается, но пока не верифицирован для NaCl. Публичная карточка относится к будущей Wave 10.

<!-- doc-key: public-skills -->
## Публичные скиллы

Точный публичный состав:

1. `nacl-ba`
2. `nacl-diagnose`
3. `nacl-fix`
4. `nacl-goal`
5. `nacl-init`
6. `nacl-migrate`
7. `nacl-publish`
8. `nacl-sa`
9. `nacl-tl`
10. `nacl-verify`

Это маршрутизирующие входы, а не десять изолированных реализаций. Они сохраняют gates и evidence vocabulary выбранного внутреннего workflow.

<!-- doc-key: mcp-tools -->
## MCP-инструменты

Точный состав из 25 инструментов сгруппирован ниже.

**Установка (1):** `nacl_installation_doctor`.

**Разрешение проекта (3):** `nacl_project_resolve`, `nacl_project_migrate_identity`, `nacl_project_register_root`.

**Совместимость, жизненный цикл графа и профили (7):** `nacl_legacy_symlinks_plan`, `nacl_legacy_symlinks_apply`, `nacl_graph_local_init`, `nacl_graph_local_start`, `nacl_graph_local_doctor`, `nacl_agent_profiles_plan`, `nacl_agent_profiles_apply`.

**Graph gateway (14):** `nacl_graph_health`, `nacl_graph_schema_status`, `nacl_graph_read`, `nacl_graph_apply_migrations`, `nacl_graph_write_canary`, `nacl_graph_derive_worker_identity`, `nacl_graph_claim_resource`, `nacl_graph_heartbeat_resource`, `nacl_graph_release_resource`, `nacl_graph_handoff_resource`, `nacl_graph_mutate_resource`, `nacl_graph_allocate_id`, `nacl_graph_bootstrap_admin`, `nacl_graph_set_membership`.

Tool schemas отклоняют неизвестные поля, небезопасный project scope, произвольные запросы и отсутствующие подтверждения. Installation doctor и compatibility plan доступны для восстановления; project и graph tools требуют верифицированного режима установки.

<!-- doc-key: data-flow -->
## Поток и сохранность данных

Codex обнаруживает десять входных скиллов и запускает пакетный Node.js MCP-процесс. Installation preflight отклоняет отсутствующий, некорректный или неоднозначный режим plugin/legacy. Project operations разрешают явную identity проекта и канонический корень; fallback на последний использованный проект отсутствует.

Для опционального графа gateway разрешает project-scoped lifecycle state, получает непрозрачную ссылку Keychain, подключается только к loopback Neo4j endpoint этого проекта и выполняет пакетные параметризованные операции. Попытки и результаты пишутся в санитизированный аудит проекта. Значения секретов не попадают в аргументы, результаты, аудит и установленный пакет.

Установленный bundle заменяем. Конфигурация проекта, registry, audit, Docker-тома, резервные копии, состояние Keychain и опциональные профили агентов — долговременное внешнее состояние, которое переживает отключение, обновление, откат, переустановку и удаление.

<!-- doc-key: permissions -->
## Разрешения

Текущая карточка объявляет **Read** и **Write**. Read поддерживает проверку проекта, планы, graph health и evidence. Write поддерживает только одобренное пользователем действие workflow, например явно подтверждённое обновление проекта или ограниченную мутацию графа. Запросы разрешений Codex остаются источником истины; confirmations NaCl добавляют второй gate для конкретной операции.

Не выдавайте разрешение шире карточки или не связанное с запрошенным workflow. Внешняя публикация, deployment, messaging и другие сторонние записи требуют отдельного разрешения пользователя; установка плагина не даёт общего одобрения.

<!-- doc-key: confirmation-model -->
## Модель подтверждений

NaCl следует цепочке plan, inspect, confirm, apply и read-back. Для plan/apply операций копируйте только свежий token и точное confirmation, возвращённые этим планом. Никогда не создавайте и не фиксируйте эти значения самостоятельно. Изменение плана или состояния требует нового плана и нового подтверждения.

Миграция закрывается при недостатке evidence. Сначала покажите migration и backup/validation plan. Schema recovery также требует текущих прав администратора, живых migration lease и fence и approval/confirmation, возвращённых для этой операции. После apply потребуйте schema, health и read-back evidence. Не повторяйте частичный результат до проверки ledger и текущего состояния.

<!-- doc-key: first-project -->
## Первый проект и dry run

1. Вызовите `nacl_installation_doctor` без аргументов и потребуйте `VERIFIED/plugin-only`.
2. Явно разрешите проект. Если предлагается identity migration или регистрация корня, проверьте предложение и остановитесь до мутации.
3. Запросите у `nacl-init` dry run, запрещающий записи проекта, профилей, миграций и графа.
4. При необходимости запросите план профилей агентов. Профили опциональны и create-only; конфликты никогда не перезаписываются.
5. Подключайте граф только после отдельного graph plan и confirmation.
6. До объявления graph path верифицированным потребуйте local graph doctor, graph health, schema status, ограниченный write canary и отдельный read-back.

Полный prompt приведён в [быстром старте](quickstart.ru.md#первый-dry-run).

<!-- doc-key: operations -->
## Обновление, отключение, удаление и откат

Используйте установленную карточку NaCl в **Plugins**. Codex поддерживает enable/disable и **Uninstall plugin**; используйте **Update**, когда карточка показывает это действие. После каждого update, reinstall, re-enable или rollback нужен полный перезапуск, новая задача и doctor request. Сравнивайте возвращённую версию с выбранной карточкой, а не со значением из документации.

Uninstall удаляет bundle, но не долговременное состояние NaCl. Connectors управляются Codex отдельно. Для rollback нужна предыдущая доверенная карточка или share/install-ссылка владельца; угаданный URL или путь пакета не поддерживается.

<!-- doc-key: starter-prompts -->
## Стартовые запросы

- `Use nacl-ba to describe the business roles and processes for this project.`
- `Use nacl-diagnose to inspect project drift and recommend the next safe work. Keep it read-only.`
- `Use nacl-fix to diagnose this bounded defect and propose the regression test before implementation.`
- `Use nacl-goal to preview a resumable multi-step objective and its checks. Do not start mutations.`
- `Use nacl-init to resolve this project and perform a dry run only. Stop before every mutation.`
- `Use nacl-migrate to plan this migration, including backup and validation. Do not apply it.`
- `Use nacl-publish to render the approved artifacts locally. Do not publish externally.`
- `Use nacl-sa to design the use cases and system architecture.`
- `Use nacl-tl to plan the next feature wave without starting delivery.`
- `Use nacl-verify to verify code, tests, and QA evidence without making changes.`

<!-- doc-key: known-limits -->
## Известные ограничения

- Требуется Node.js 20+. Node.js 24 проверен; точный Node.js 20 имеет статус `NOT_RUN`.
- Docker и macOS Keychain — опциональные зависимости графа. Живой bootstrap графа через Keychain имеет статус `NOT_RUN`.
- Распространение NaCl через Private Share предполагается, но не верифицировано.
- Отправка и публикация в публичном каталоге отложены до Wave 10; публичная ссылка установки не заявляется.
- Опциональное обнаружение custom agents и hosted CI остаются `NOT_RUN`.
- Текущий graph gateway предоставляет только фиксированный каталог ресурсов и запросов. Отсутствующая domain capability возвращает `BLOCKED`; она не заменяется произвольным запросом или устаревшим файловым результатом.

<!-- doc-key: support -->
## Поддержка и evidence

При проблемах установки соберите имя/версию/state/permissions карточки, поля doctor, точный prompt, возвращённые `status` и `code` и информацию о полном перезапуске и новой задаче. Для проблем графа добавьте коды lifecycle doctor, health и schema status.

Не включайте credentials, значения Keychain, содержимое проекта, бизнес-данные, персональные пути, graph rows или широкие логи. См. [чек-лист поддержки](setup/install-codex-plugin.ru.md#evidence-для-поддержки).
