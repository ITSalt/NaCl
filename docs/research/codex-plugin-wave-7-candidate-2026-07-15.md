# Codex plugin Wave 7 local candidate evidence — 2026-07-15

Статус: `VERIFIED`. Первый live Desktop user journey кандидата w7c1 дал
`FAILED/CORRECT`: установка и cached MCP работали, но миграционный план
заблокировал четыре легитимных старых symlink target. Ограниченный дефект
совместимости исправлен в w7c2. Затем пользователь выполнил UI Upgrade,
подтверждённую миграцию, полный restart и проверку в новой Desktop задаче;
отдельная model-backed CLI задача подтвердила тот же exact cached candidate.
Обязательный live-гейт этого evidence-документа выполнен. Это evidence
реализующего агента, а не независимое решение `ACCEPT`. Документ не разрешает
merge, push, tag, публикацию, изменение `main` или публичного marketplace.

## Зафиксированный кандидат

- Integration base: `a10194b17cb5cb20c8aaa3027d7d980f2622246f` на
  `codex/desktop-plugin-integration`.
- Candidate branch: `codex/plugin-07-candidate`.
- Исходная заморозка w7c1: `866e0aacf012cdc18c82ad080875ad5328e1589c`.
- Correction code commit:
  `73443c3f5b726574d9598c9f834a724b5fe35187`.
- Проверяемая cachebuster freeze:
  `5ef6f72ae011f5fdab0b701304887969179907a9`.
- Plugin version/cachebuster:
  `0.1.0+codex.w7c2-20260715063015-73443c3`.
- Совместимая framework baseline: NaCl `v2.23.0`; packaged graph schema v3.
- Marketplace name / selector: `nacl-local` / `nacl@nacl-local`.
- Marketplace descriptor:
  `/Users/maxnikitin/projects/NaCl-worker-plugin-07-candidate/.agents/plugins/marketplace.json`.
- Plugin tree id: `f17f8d008c57e049e5397bab4fdd46a19a3752a6`.
- Plugin content digest из clean-home candidate gate:
  `c5272e319252955fd54a3a0f2865ae531c7fceba3bc2938204c35e6fcc7e9319`;
  357 файлов.
- Детерминированный marketplace bundle:
  `/tmp/nacl-wave7-w7c2-5ef6f72-marketplace.tar.gz`;
  SHA-256 `c662a53e3d3874040cbb2f25e7df8e72d9b837ebd6d62f8c6c01ec160cea65d0`;
  358 файлов без symlink-объектов. Повторная сборка из того же commit дала
  побайтно идентичный архив и тот же SHA-256.

Архив является переносимой фиксацией, но простой локальный UI-путь использует
marketplace descriptor прямо из worktree. Ни candidate, ни archive не были
merged, pushed, tagged или published.

Archive можно побайтно восстановить из commit без mutable worktree:

```bash
git archive --format=tar --prefix=nacl-wave7-w7c2/ --output=/tmp/nacl-wave7-w7c2-5ef6f72-marketplace.tar 5ef6f72 .agents/plugins/marketplace.json plugins/nacl
gzip -n -f /tmp/nacl-wave7-w7c2-5ef6f72-marketplace.tar
shasum -a 256 /tmp/nacl-wave7-w7c2-5ef6f72-marketplace.tar.gz
```

## Live w7c1 failure и решение `CORRECT`

Пользователь установил w7c1 через UI, выдал права, полностью перезапустил
Desktop и в новой задаче выполнил doctor → read-only migration plan. Скриншот
зафиксировал `mode=both`, 55 принятых записей и `BLOCKED /
LEGACY_SYMLINK_PLAN_BLOCKED` ровно для:

- `nacl-core` — `target-hash-unrecognized`;
- `nacl-goal` — `target-hash-unrecognized`;
- `nacl-migrate-sa` — `target-hash-unrecognized`;
- `nacl-tl-core` — `target-hash-unrecognized`.

Confirmation в заблокированном плане отсутствовал, ничего не было изменено.
Read-only сверка показала фактические 59 symlink из каталога 60; отсутствует
только `nacl-postmortem`. Четыре target имеют exact SHA-256:

- `nacl-core`: `2e4d35d3414d4483de4ff3430344f4a711d1fe99da78b906fcabcae251f766b2`;
- `nacl-goal`: `ff953ce107f15ee16553afc8fa2a32a44d4096a83dd46403f2a840d78d90158a`;
- `nacl-migrate-sa`: `1af1f87724ac5a2298578959ffa26d8d028eacf47bfa1bc612afb31fae4cfe65`;
- `nacl-tl-core`: `faab6033e052c4702e5a89b86b2e66893eb40a7522a9278c2b26fa89db632bdb`.

Все они побайтно совпадают с `skills-for-codex/<name>/SKILL.md` в
аудированном base commit
`d98f7399e7b9941341421321407ad27ee895d221`. Wave 2 изменил только более новую
Codex-root генерацию, а w7c1 разрешал для deliberate divergence лишь её один
текущий hash. Поэтому это ограниченный compatibility code defect, а не
повреждение пользовательских skills и не ошибка установки.

RED test материализовал исторические bytes только через `git show d98...` в
repo QA fixture: 55 current + четыре exact audited-base + один отсутствующий.
До исправления test получил 55 entries и ровно четыре blocker; после исправления
тот же fixture даёт `foundCount=59`, `acceptedCount=59`, `missingCount=1`, zero
blockers и ready confirmation. Runtime не обращается к Git/source checkout:
доверенные старые SHA записаны явно вместе с generation, full source commit,
source path и reason. Plan token связывает фактический target hash, принятую
generation и symlink identity. Любое однобайтовое отклонение остаётся
`BLOCKED`.

Исполняемое доказательство RED → GREEN:

```text
node --test --test-name-pattern='actual 59-link audited-base installation' tests/codex-plugin/scripts/nacl-legacy-symlinks.test.mjs
RED: exit 1; expected VERIFIED, actual BLOCKED; предварительные assertions подтвердили entries=55 и exact four blockers.
GREEN: exit 0; 1/1.

node --test --test-name-pattern='actual 59-link audited-base installation|one-byte drift' tests/codex-plugin/scripts/nacl-legacy-symlinks.test.mjs
GREEN: exit 0; 2/2.
```

## Что исправлено для перехода со старой установки

Реальная пользовательская последовательность отличается от чистой установки:
после UI-uninstall старого `nacl@personal` установленные ранее user-level
`~/.agents/skills/nacl-*` symlink остаются. Старый doctor поэтому корректно
возвращает конфликт `mode=both` после установки нового плагина.

Кандидат добавляет ровно два recovery tool:

- `nacl_legacy_symlinks_plan` — read-only план для точного каталога из 60
  имён; отсутствующие записи разрешены;
- `nacl_legacy_symlinks_apply` — только после точного
  `REMOVE_LEGACY_NACL_SYMLINKS:<plan-token>`.

Политика parity остаётся 39 byte-identical + 21 deliberate divergence. Для
четырёх из этих 21 записей дополнительно разрешена ровно одна аудированная
legacy generation из `d98f7399…`; это четыре explicit exact SHA с provenance,
а не маска и не принятие произвольной Git history. Unknown `nacl-*`, broken
link, real file/directory, symlinked skills root, неверный frontmatter,
неизвестный target/hash drift и unsafe migration state блокируют операцию до
удаления.
Apply переносит запись в приватный quarantine, повторно проверяет тип,
link identity и target hash и удаляет только подтверждённый symlink. Объект,
подменённый конкурентным writer, сохраняется в quarantine с
`PARTIALLY_VERIFIED`. Source target, graph state, project profiles и реальные
файлы не изменяются. Receipt и audit имеют mode `0600`; symlink на audit или
receipt не открывается и не изменяет свой target. Повтор с тем же receipt
идемпотентен.

Только эти два инструмента могут работать при installation conflict. Все 23
остальных MCP tools продолжают fail-closed с `INSTALLATION_CONFLICT`. После
apply публичный `nacl-init` обязан отдельно прочитать doctor и продолжает лишь
при `status=VERIFIED`, `mode=plugin-only`.

## Ручной UI Upgrade w7c1 → w7c2 — воспроизводимый путь

На момент этого handoff w7c1 был установлен из `nacl-local`, а 59 legacy
symlink оставались неизменёнными после корректно заблокированного read-only
плана. Во время correction QA live marketplace, installed cache, `~/.agents`
и `~/.codex` не изменялись.

1. Нажать deeplink ниже. В карточке `NaCl Local Candidate` нажать **Upgrade** и
   подтвердить bundled MCP. Если кнопки **Upgrade** нет, открыть
   **Settings → Plugins → Plugins**, удалить только установленный `nacl` из
   `nacl-local`, снова открыть deeplink и нажать **Install**. User skills
   вручную не удалять.

   `codex://plugins/nacl?marketplacePath=%2FUsers%2Fmaxnikitin%2Fprojects%2FNaCl-worker-plugin-07-candidate%2F.agents%2Fplugins%2Fmarketplace.json`

2. Полностью завершить приложение (`⌘Q`),
   открыть его снова и создать **новую** задачу. Старую задачу не использовать
   для discovery-доказательства.
3. Отправить в новой задаче:

   ```text
   Используй $nacl-init только для проверки установки. Вызови nacl_installation_doctor один раз. Проверь exact pluginVersion 0.1.0+codex.w7c2-20260715063015-73443c3 и executionLocation=installed-cache. Если mode=both, вызови только nacl_legacy_symlinks_plan, покажи foundCount, acceptedCount, missingCount, все blockers и точную строку confirmation, затем остановись. Ничего не изменяй.
   ```

4. Ожидается `foundCount=59`, `acceptedCount=59`, `missingCount=1`, zero
   blockers и одна строка confirmation. При любом другом результате не
   подтверждать план.
5. При точном результате отправить
   ровно показанную строку `REMOVE_LEGACY_NACL_SYMLINKS:<plan-token>`, попросив
   вызвать `nacl_legacy_symlinks_apply`, затем один раз doctor. Ожидается
   `status=VERIFIED`, `mode=plugin-only`, exact candidate version и
   `executionLocation=installed-cache`. При `PARTIALLY_VERIFIED` ничего не
   удалять из показанного quarantine; сохранить путь для ручного разбора.
6. Для non-mutating discovery отправить:

   ```text
   Сообщи точные pluginVersion, executionLocation и mode; перечисли 10 public NaCl skills и 25 NaCl MCP tools. Ничего не изменяй.
   ```

Это единственный обязательный live Desktop гейт перед решением о принятии
кандидата. UI-сценарий не требует Terminal. Apps здесь не заменяют plugin:
проверяемый продукт объединяет local skills и bundled MCP; App нужен прежде
всего для отдельного connector/remote-service контракта.

## Финальный live W7C2 user journey — `VERIFIED`

Пользователь прошёл описанный UI-путь без Terminal: нажал **Upgrade**, выдал
запрошенные bundled MCP permissions, полностью завершил приложение и открыл
его снова. В новой Desktop задаче первый вызов `nacl_installation_doctor`
вернул `mode=both`, exact
`pluginVersion=0.1.0+codex.w7c2-20260715063015-73443c3` и
`executionLocation=installed-cache`. Read-only
`nacl_legacy_symlinks_plan` вернул `foundCount=59`, `acceptedCount=59`,
`missingCount=1`, `blockers=[]` и одну hash-bound confirmation. Эти значения
зафиксированы пользовательским скриншотом «W7C2 migration plan»; никаких
изменений до отдельного подтверждения не выполнялось.

Пользователь передал обратно ровно выданную confirmation. Единственный
`nacl_legacy_symlinks_apply` завершился так:

- `status=VERIFIED`;
- `code=LEGACY_SYMLINKS_REMOVED`;
- удалено 59 legacy symlink;
- `receiptVerified=true`;
- `readback=plugin-only-ready`.

Следующий doctor вернул `status=VERIFIED`, `mode=plugin-only`, exact W7C2 и
`executionLocation=installed-cache`. Эти результаты зафиксированы
пользовательским скриншотом «W7C2 migration apply and doctor». Read-only
проверка хоста после apply отдельно подтвердила
`legacy_nacl_symlinks=0` и наличие exact W7C2 в plugin cache.

После ещё одного полного `Quit`/restart пользователь создал **новую** Desktop
задачу. Doctor был вызван ровно один раз и снова вернул
`VERIFIED/plugin-only/exact W7C2/installed-cache`. Ответ перечислил все 10
public skills:

```text
nacl:nacl-ba
nacl:nacl-diagnose
nacl:nacl-fix
nacl:nacl-goal
nacl:nacl-init
nacl:nacl-migrate
nacl:nacl-publish
nacl:nacl-sa
nacl:nacl-tl
nacl:nacl-verify
```

Тот же ответ показал frozen inventory из 25 NaCl MCP tools:

```text
nacl_installation_doctor
nacl_project_resolve
nacl_project_migrate_identity
nacl_project_register_root
nacl_legacy_symlinks_plan
nacl_legacy_symlinks_apply
nacl_graph_local_init
nacl_graph_local_start
nacl_graph_local_doctor
nacl_agent_profiles_plan
nacl_agent_profiles_apply
nacl_graph_health
nacl_graph_schema_status
nacl_graph_read
nacl_graph_apply_migrations
nacl_graph_write_canary
nacl_graph_derive_worker_identity
nacl_graph_claim_resource
nacl_graph_heartbeat_resource
nacl_graph_release_resource
nacl_graph_handoff_resource
nacl_graph_mutate_resource
nacl_graph_allocate_id
nacl_graph_bootstrap_admin
nacl_graph_set_membership
```

Post-restart discovery зафиксирован пользовательским скриншотом «W7C2 new
Desktop task». Он доказывает, что результат не был состоянием старой задачи и
что Desktop загружает пакет после restart из installed cache.

Для CLI тот же local marketplace был явно зарегистрирован, а
`codex plugin list` показал `nacl@nacl-local` как enabled с exact W7C2.
Bundled Codex CLI `0.144.2` запустил model-backed ephemeral **новую** задачу,
которая вызвала `nacl_installation_doctor` ровно один раз. Tool вернул
`status=VERIFIED`, `mode=plugin-only`, exact W7C2 и
`executionLocation=installed-cache`; процесс завершился с exit code 0.
Установленный shell CLI `0.142.0` не смог использовать настроенную модель
`gpt-5.6-sol`; это несовместимость версии host client, возникшая до plugin
call, а не дефект NaCl plugin. Предупреждение об отсутствующей авторизации
GitHub Copilot MCP также не связано с NaCl и не помешало успешному вызову.

Таким образом, обязательный live Desktop/CLI candidate gate этого документа
выполнен: exact пакет обнаруживается после restart в новой задаче, migration
имеет подтверждение и read-back, legacy-конфликт устранён, а plugin работает
из cache. Формальное aggregate-решение по Waves 6–7 остаётся за независимым
верификатором и Execution Ledger.

## Опциональный live graph и workflow trial

Prerequisites: macOS arm64, Codex CLI/Desktop с plugin UI (на QA-машине
`codex-cli 0.142.0`), Node.js 20+ (проверено на 24.13.1), а для graph trial —
запущенный Docker Desktop (проверено с engine 29.6.1) и разрешённый доступ к
macOS Keychain. Секрет нельзя вставлять в чат, CLI args или config; gateway
создаёт и читает opaque Keychain reference.

В отдельной новой задаче открыть тестовый Git-проект и отправить:

```text
Запусти $nacl-init для текущего проекта. Сначала выполни только read-only проверки. Перед каждым изменением покажи точную confirmation и остановись. Не устанавливай agent profiles.
```

Подтверждать по одному только те токены, которые вернул gateway:
`INIT_LOCAL_GRAPH:<project-id>`, `START_LOCAL_GRAPH:<project-id>`, затем
applicable project/schema/bootstrap/write approvals. Итог `VERIFIED` допустим
только после lifecycle doctor, schema status, named read, write canary и
отдельного read-back. Для двух проектов повторить в двух разных Git roots и
убедиться, что у них разные project id, container, volume, Keychain reference
и данные. Не использовать два worktree одного repo как два разных проекта:
они намеренно разделяют один project identity.

Agent profiles — отдельная опция. Сначала вызвать
`nacl_agent_profiles_plan`, показать пять destinations/actions и остановиться;
apply разрешён только с новым `INSTALL_AGENT_PROFILES:<plan-token>`. Любой
`AGENT_PROFILE_CONFLICT` блокирует overwrite: пользователь сам перемещает свой
файл, затем нужен свежий plan.

## CLI install/reinstall/recovery/rollback

CLI — диагностический и recovery-путь, а не обязательная часть UI trial.

```bash
codex plugin marketplace add /Users/maxnikitin/projects/NaCl-worker-plugin-07-candidate --json
codex plugin add nacl@nacl-local --json
```

В текущем CLI отдельной команды update plugin нет; точный reinstall:

```bash
codex plugin remove nacl@nacl-local --json
codex plugin add nacl@nacl-local --json
```

Удаление candidate не удаляет project graph data, Docker volume, project
profiles или Keychain item:

```bash
codex plugin remove nacl@nacl-local --json
codex plugin marketplace remove nacl-local
```

Rollback на старый локальный plugin возможен, пока сохранён `personal`:

```bash
codex plugin remove nacl@nacl-local --json
codex plugin add nacl@personal --json
```

Legacy user-symlink migration не меняет source skills, поэтому отдельный
legacy-only rollback технически возможен старым installer, но не является
частью простого UI-пути. Для rollback на старый plugin эти symlink не нужны.

## Проверки

| Gate | Результат |
|---|---|
| clean-home candidate baseline → candidate → rollback → reinstall | `VERIFIED`; source unavailable; отдельные cache paths; exact live shape 59/60; 59 removed only after confirmation; source/graph/profile sentinels preserved; doctor read-back plugin-only |
| candidate discovery | 10 public skills; 25 MCP tools; version exact; installed-cache execution |
| live Desktop W7C2 migration | `VERIFIED`; plan 59 found / 59 accepted / 1 missing / 0 blockers; apply removed 59 exact symlink; verified receipt and plugin-only read-back |
| live Desktop restart/new task | `VERIFIED`; doctor exactly once; exact W7C2 from installed cache; 10 public skills and 25 MCP tools discovered |
| model-backed bundled CLI 0.144.2 | `VERIFIED`; new ephemeral task; doctor exactly once; exact W7C2/plugin-only/installed-cache; exit 0 |
| live-failure RED → GREEN | RED reproduced 55 accepted + exact four blockers; corrected 59/59 accepted; one-byte historical drift remains `BLOCKED` |
| `test:contracts` | 325 total; 320 passed; 5 authorized Docker skips; 0 failed; all tracked shell suites green |
| `test:plugin-package` | 83/83 passed |
| `test:workflow-integration` | 38/38 passed |
| `test:graph-unit` | 89/89 passed |
| manifest and official plugin-creator validator | `VERIFIED` |
| strict closure | `VERIFIED`; 357 files, 10 public, 60 internal, 301 inline paths, 0 active command paths |
| Codex legacy skills | 60/60 valid; isolated installer 60 created + 60 idempotent; source hashes unchanged |
| CLI plugin/source unavailable | `VERIFIED`; cached MCP and profiles contract work without marketplace source |
| Claude isolation | `VERIFIED`; 62 frozen roots; base and candidate manifest hash `cb85ebb130277286b5e0fbb7efd240575544c490` |
| root/Codex sync from `a10194b...` | `VERIFIED` |
| graph lifecycle Docker | 1/1 (~34.1 s) plus gateway/restart/cache/backup/restore/uninstall 1/1 (~66.8 s) |
| multi-project | 11/11 unit plus Docker 1/1 (~47.6 s) |
| multi-user/concurrency | 29/29 unit plus Docker 2/2 (~28.9 s and ~22.6 s), including 1,000 allocations and real v2→v3 recovery |
| Docker cleanup | zero candidate `nacl-graph-*` containers and `nacl_graph_*` volumes/networks after every gate; unrelated resources untouched |
| secret scan | strict closure secret/private-key patterns and explicit Git token/key pattern scan: no findings |
| dependency inventory | no npm/third-party Node package manifest in plugin; runtime imports Node built-ins/local modules; Neo4j pin `5.24.2-community` and schema v3 checksum `a0f6a5925eae88ae59e00baf056b1a29750ec40d97cfef7bdfd018f993bb40b2` |
| external SBOM/vulnerability scanners | `NOT_RUN`: `syft`, CycloneDX and `osv-scanner` unavailable locally; `gitleaks` and `trufflehog` also unavailable |
| `git diff --check` | passed before code freeze |

## Не выполнено и ограничения

- Опциональная установка и discovery project custom-agent/profile:
  `NOT_RUN`; базовые public skills и MCP работают без profiles, а
  plan/apply/idempotency/conflict покрыты deterministic tests.
- Live macOS Keychain graph bootstrap: `NOT_RUN`; тесты используют инъекцию и
  не раскрывают секрет.
- Node.js 20 runtime: `NOT_RUN`; Node.js 24.13.1 проверен, код требует Node 20+.
- Hosted CI, clean second machine, remote identity provider, two physical
  principals and hostile same-account attacker: `NOT_RUN`.
- External SBOM/vulnerability scanners: `NOT_RUN`; локально недоступны.
- Remote/private production gateway и public marketplace: Wave 8, `NOT_RUN`
  и не авторизованы.
- Shell Codex CLI 0.142.0 несовместим с настроенной моделью `gpt-5.6-sol`;
  bundled CLI 0.144.2 успешно выполнил model-backed plugin smoke. Это
  ограничение host client, не candidate package.
- Неавторизованный GitHub Copilot MCP выдаёт отдельное startup/shutdown
  предупреждение; успешный NaCl tool call и exit 0 оно не блокирует.
- Docker administrator остаётся локальной root-equivalent trust boundary;
  Neo4j DDL/SHOW имеет задокументированную non-atomic pre/post-check границу и
  при неоднозначности возвращает `PARTIALLY_VERIFIED`.

Итог implementing worker: exact W7C2, локальный candidate matrix и
обязательный live Desktop/CLI trial имеют статус `VERIFIED`; кандидат готов к
финальной независимой приёмке. Перечисленные `NOT_RUN` относятся к
необязательным platform/deferred проверкам и не превращаются в доказанные
возможности.
