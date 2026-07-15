# Wave 9: план безопасного согласования с актуальным `main`

Дата аудита: 2026-07-15
Статус: `PLAN / NO MERGE PERFORMED`
Область: подготовка нового main-based successor integration для Wave 9; этот
документ не разрешает merge, push, tag, публикацию, развёртывание production
инфраструктуры или мутацию портала OpenAI.

## 1. Решение

Прямой merge старой ветки `codex/desktop-plugin-integration` в `main` запрещён.
Она основана на старом общем предке и содержит снимки исходников, документации
и CI, которые уже изменились в `main`. Wave 9 должна выполняться в новой чистой
ветке и sibling-worktree, созданных от повторно проверенного `origin/main`.

Старая integration используется только как адресуемый по SHA источник
Codex-специфичных файлов и истории решений. Разрешён только поэтапный перенос
явно перечисленных путей и ручная композиция пересечений. Нельзя применять
whole-tree restore, merge/rebase старой integration, массовый cherry-pick её
истории или разрешать конфликт целым файлом через `ours`/`theirs`.

## 2. Зафиксированный граф и количественный аудит

| Роль | SHA |
|---|---|
| Общий предок | `d98f7399e7b9941341421321407ad27ee895d221` |
| Актуальный локальный `main` | `d828e54dc3329c5b2664df5e388badb83fc5d83e` |
| Проверенный `origin/main` | `d828e54dc3329c5b2664df5e388badb83fc5d83e` |
| Старая accepted Codex integration | `c959879c2b6270d41da0c5d4bc4eb0b00bf9bbc7` |
| Результирующее дерево пробного `git merge-tree --write-tree` | `01cc452cf96d3b1f6159fd64686944a2a56bdeb4` (с конфликтами, не кандидат) |

Непосредственно перед этим аудитом orchestrator выполнил `git fetch origin
main`; локальные `main` и `origin/main` совпали. Эта проверка имеет срок жизни
только до следующего изменения remote и обязательно повторяется перед любым
successor merge или открытием PR.

Точные результаты `d98f739..main` и `d98f739..c959879`:

| Метрика | Текущий `main` | Старая integration |
|---|---:|---:|
| Коммитов после общего предка | 31 | 96 |
| Изменённых путей | 295 | 457 |
| Краткая статистика | 295 files, 87,941 insertions, 580 deletions | 457 files, 142,842 insertions, 1,652 deletions |

Пересечение множеств изменённых путей равно **25**. Пробный `merge-tree`
завершился с кодом 1 и дал **24 реальных content conflicts**. Единственный
пересекающийся путь, который Git объединил автоматически, —
`docs/runbooks/upgrade-graph-extensions.md`; автоматическое объединение не
считается семантической верификацией.

Полный список 25 пересечений:

1. `.github/workflows/test-tools.yml`
2. `README.md`
3. `README.ru.md`
4. `docs/architecture.md`
5. `docs/architecture.ru.md`
6. `docs/configuration.md`
7. `docs/quickstart.md`
8. `docs/quickstart.ru.md`
9. `docs/runbooks/upgrade-graph-extensions.md` — auto-merge, отдельный аудит
10. `docs/setup/graph-setup.md`
11. `docs/setup/graph-setup.ru.md`
12. `docs/setup/install-linux.md`
13. `docs/setup/install-linux.ru.md`
14. `docs/setup/install-macos.md`
15. `docs/setup/install-macos.ru.md`
16. `docs/setup/install-skills.md`
17. `docs/setup/install-skills.ru.md`
18. `docs/setup/install-windows.md`
19. `docs/setup/install-windows.ru.md`
20. `docs/skills-guide.md`
21. `docs/skills-guide.ru.md`
22. `docs/skills-reference.md`
23. `docs/skills-reference.ru.md`
24. `docs/workflows.md`
25. `docs/workflows.ru.md`

### 2.1 Текущая зелёная точка `main`

На `d828e54` локально подтверждены:

- Node `v24.13.1`;
- `node scripts/build-plugin.mjs --check` — committed `plugin/` совпадает со
  сборкой;
- `node --test scripts/build-plugin.test.mjs` — 31/31;
- общий Node-набор с исключением `plugin/**` — 221/221;
- shell tests и `bash -n` с исключением `plugin/**` — `VERIFIED`;
- `sh skills-for-codex/scripts/check-root-codex-sync.sh d98f739... d828e54...`
  — `VERIFIED` для всех 13 изменённых root-skill exemptions;
- локальный `pwsh` отсутствует (`NOT_AVAILABLE`), поэтому PowerShell parser gate
  нельзя объявлять локально пройденным; он остаётся обязательным hosted-CI
  gate.

Эти результаты являются baseline, а не доказательством будущего successor.

## 3. Владение путями и source of truth

| Класс путей | Владелец/source of truth | Правило reconciliation |
|---|---|---|
| `.claude/**` | Текущий `main`, Claude Code runtime | Не переносить frozen-снимок старой integration. Claude-only agents и lock остаются из `main`; изменения для Codex реализуются вне `.claude/**`. |
| `.claude-plugin/**` | Текущий `main`, marketplace Claude Code | Сохранять без подмены на `.agents/**`. Проверять вместе с Claude build. |
| `plugin/**` | **Generated artifact** от root `nacl-*`, `.claude/agents`, `graph-infra` и `scripts/plugin-manifest.json` | Не редактировать вручную и не накладывать Codex-файлы. Любая смена source требует `node scripts/build-plugin.mjs`, затем byte-parity `--check`. |
| `scripts/build-plugin.mjs`, `scripts/build-plugin.test.mjs`, `scripts/plugin-manifest.json` | Текущий `main`, Claude build pipeline | Брать из `main`. Codex builder/validator получает отдельные имена; общие имена не переиспользовать. |
| Root `nacl-*/**`, `graph-infra/**` | Текущий `main`, framework source | Никогда не восстанавливать из `d98f739` или старой integration. Все package mirrors обновлять от этой версии с явными преобразованиями. |
| `skills-for-codex/**` | Текущий `main` для legacy Codex, включая sync exemptions | На него вручную повторно наложить только проверенные double-install/fallback изменения старой integration; не заменять каталог целиком. |
| Root `README*` и `docs/**` | Текущий `main` после полного v2.24 docs-sync | Main — смысловая база. Codex-разделы повторно интегрируются вручную, EN/RU парами, после актуализации package/runtime claims. |
| `plugins/nacl/**` | Codex package runtime/wrappers из accepted integration, но shared resources — производные от текущего main/`skills-for-codex` | Перенести Codex-only runtime как seed. Затем полностью пересчитать bundled workflows/docs/queries/schemas и hash-bound divergence ledger; старые зеркала не считать авторитетными. |
| `tests/codex-plugin/**` | Accepted Codex integration, обновлённая под successor | Перенести из точного SHA, затем обновить fixtures, hashes, counts и negative tests для v2.24/current-main. Тест не может сам быть источником ожидаемого snapshot. |
| `.agents/plugins/**` | Codex local marketplace metadata | Сохранять отдельно от `.claude-plugin/**`; version, paths и manifest должны ссылаться только на rebuilt `plugins/nacl/**`. |
| Codex scripts (`scripts/codex-plugin-*`, `check-plugin-*`, `validate-codex-*`) | Accepted Codex integration с повторным аудитом | Переносить по явному allowlist. Старый `check-claude-runtime-unchanged.sh` нельзя использовать с frozen base как доказательство неизменности: `main` законно изменил Claude source; guard нужно перепривязать к свежему base и generated parity. |
| `.github/workflows/build-plugin.yml` | Текущий `main`, Claude artifact CI | Сохранять целиком по смыслу; он единственный владелец Claude build parity. |
| `.github/workflows/test-codex-plugin.yml` | Codex dedicated CI | Перенести и обновить после разделения generic/Codex glob ownership. |
| `.github/workflows/test-tools.yml` | Совместный, разрешается только ручная композиция | Сохранить main exclusions и `pwsh-syntax`; Codex validator/Python вынести в dedicated job. |

## 4. Drift shared sources, который нельзя потерять

После исключения generated/operational `.claude/scheduled_tasks.lock` между
`d98f739` и `d828e54` изменились **24 root-source файла**:

- `.claude/agents/verifier.md`;
- `graph-infra/handover/README.md`;
- `graph-infra/scripts/install-sidecar.ps1`;
- `graph-infra/scripts/install-sidecar.sh`;
- `nacl-ba-{entities,from-board,glossary,process,roles,rules,sync}/SKILL.md`;
- `nacl-core/SKILL.md`;
- `nacl-core/scripts/graph-doctor.mjs`;
- `nacl-core/scripts/graph-doctor.test.mjs`;
- `nacl-init/SKILL.md`;
- `nacl-publish/SKILL.md`;
- `nacl-render/SKILL.md`;
- `nacl-sa-{uc,ui}/SKILL.md`;
- `nacl-tl-core/scripts/lib-neo4j-mcp.ps1`;
- `nacl-tl-core/scripts/lib-neo4j-mcp.sh`;
- `nacl-tl-core/scripts/neo4j-mcp.pin`;
- `nacl-tl-core/scripts/setup-graph.ps1`;
- `nacl-tl-core/scripts/setup-graph.sh`.

Из них **17 имеют прямые Codex bundled counterparts**: семь BA skills,
`nacl-core/SKILL.md`, `nacl-init`, `nacl-publish`, `nacl-render`, `nacl-sa-uc`,
`nacl-sa-ui` и четыре `nacl-tl-core` script-файла
(`lib-neo4j-mcp.{ps1,sh}`, `setup-graph.{ps1,sh}`). Каждый counterpart должен
быть пересобран/повторно адаптирован от текущего source и получить новый hash в
parity ledger. Старый hash не разрешает оставить старые bytes.

Оставшиеся **7 не имеют прямого Codex counterpart** и требуют явной
классификации, а не молчаливого пропуска:

1. `.claude/agents/verifier.md` — Claude-only; не auto-port в Codex TOML, но
   проверить, не изменился ли общий verifier contract.
2. `graph-infra/handover/README.md` — root documentation; решить, нужна ли
   package copy, по умолчанию оставить source-only.
3. `graph-infra/scripts/install-sidecar.ps1` — либо новый manifest-owned
   production resource с security review, либо документированно не поставлять.
4. `graph-infra/scripts/install-sidecar.sh` — то же решение, отдельно от PS1.
5. `nacl-core/scripts/graph-doctor.mjs` — сопоставить изменения с Codex
   graph-gateway/doctor capability; не копировать механически.
6. `nacl-core/scripts/graph-doctor.test.mjs` — перенести необходимые assertions
   в dedicated Codex tests либо записать доказанное отсутствие применимости.
7. `nacl-tl-core/scripts/neo4j-mcp.pin` — привязать production MCP dependency к
   проверенной версии или явно обосновать отдельный dependency mechanism.

Ни один из семи пунктов не может остаться со статусом «не заметили».

## 5. Ручное правило для каждого из 24 content conflicts

Во всех строках исходной основой служит `main=d828e54...` (или более новый
повторно проверенный `origin/main`), а не версия целого файла из integration.

| № | Конфликтный путь | Обязательное разрешение |
|---:|---|---|
| 1 | `.github/workflows/test-tools.yml` | Сохранить main `:!plugin/**` во всех Node/bash/PowerShell globs и весь `pwsh-syntax` job. Добавить `:!tests/codex-plugin/**` в generic job; Codex tests, pinned Python и official validator передать dedicated `test-codex-plugin.yml`. Не делать union старых globs. |
| 2 | `README.md` | Сохранить актуальные v2.24/Claude Code install, release и product facts из main; заново добавить отдельный Codex app-plus-skills раздел с production/public статусом Wave 9, без локального absolute-path share claim. |
| 3 | `README.ru.md` | То же решение на русском; проверить одинаковые версии, ссылки, ограничения и product choice с EN, а не переводить старый README. |
| 4 | `docs/architecture.md` | Сохранить текущую framework/Claude architecture; добавить Codex runtime, remote Streamable HTTP MCP, identity/isolation и packaging boundary как отдельный carrier, с актуальными diagrams/contracts. |
| 5 | `docs/architecture.ru.md` | Синхронизировать архитектурные сущности и статусы с EN; не сохранять устаревшую v2.23 схему из integration. |
| 6 | `docs/configuration.md` | Взять полный актуальный main config schema; вручную добавить только действующие Codex production MCP/auth/project settings. Local stdio/dev paths не должны стать normal install. Затем сгенерировать/проверить RU pair. |
| 7 | `docs/quickstart.md` | Сохранить main quickstart для framework/Claude; добавить самостоятельную Codex UI/public-install ветку, которая не требует clone, terminal, Git или локального marketplace path. |
| 8 | `docs/quickstart.ru.md` | Повторить ту же последовательность, expected outputs и rollback на русском; links/anchors должны пройти pair gate. |
| 9 | `docs/setup/graph-setup.md` | Сохранить v2.24 graph bootstrap, monitor/doctor и changed port/probe semantics из main; добавить Codex remote-by-default и явно отделённый optional local graph. |
| 10 | `docs/setup/graph-setup.ru.md` | Ручная RU-синхронизация предыдущего решения, включая security/secret wording и отсутствие raw-password fallback. |
| 11 | `docs/setup/install-linux.md` | Сохранить текущие Linux/Claude prerequisites и sidecar changes; добавить только проверенный Codex app install/permissions/restart path и production MCP prerequisites. |
| 12 | `docs/setup/install-linux.ru.md` | EN/RU semantic parity, те же команды только для admin/legacy раздела; обычный пользователь не получает terminal path. |
| 13 | `docs/setup/install-macos.md` | Сохранить main macOS/Claude installation and Keychain facts; добавить Codex UI lifecycle и production auth, без пути `/Users/...`. |
| 14 | `docs/setup/install-macos.ru.md` | Точный RU counterpart, включая full restart, permissions, revoke/uninstall и data persistence. |
| 15 | `docs/setup/install-skills.md` | Развести три режима: Claude plugin, legacy Codex skills и full Codex plugin. Сохранить main source/symlink reality; normal Codex path — app-plus-skills, не skills-only. |
| 16 | `docs/setup/install-skills.ru.md` | Синхронизировать режимы и warnings; не возвращать старую инструкцию, выдающую legacy symlinks за обычную установку. |
| 17 | `docs/setup/install-windows.md` | Сохранить main PowerShell/setup-graph corrections; добавить проверенный Codex UI/auth path и production remote graph, включая Windows-specific rollback. |
| 18 | `docs/setup/install-windows.ru.md` | То же на русском; обязательна hosted `pwsh` syntax evidence для упомянутых скриптов. |
| 19 | `docs/skills-guide.md` | Основываться на актуальном main roster/semantics; добавить Codex namespace и public-conductor model из rebuilt package inventory, а не старые вручную набранные counts. |
| 20 | `docs/skills-guide.ru.md` | Синхронизировать список, namespace, confirmations и ограничения с EN и generated inventory. |
| 21 | `docs/skills-reference.md` | Сохранить текущие skill contracts main; Codex public/internal таблицы генерировать из нового `package-index.json` и tool schemas. |
| 22 | `docs/skills-reference.ru.md` | Та же generated truth на русском; запретить независимое ручное расхождение counts/names. |
| 23 | `docs/workflows.md` | Сохранить v2.24 methodology/workflow changes; повторно наложить routing 10 public → internal workflows после package refresh, с production MCP boundaries. |
| 24 | `docs/workflows.ru.md` | Синхронизировать route map, vocabulary и refusal/confirmation semantics с EN и проверенными JSON maps. |

### 5.1 Автоматически объединённый 25-й путь

`docs/runbooks/upgrade-graph-extensions.md` изменён обеими сторонами
(`main`: +14/-7; integration: +25/-5). Получившийся auto-merge имеет SHA-256
`b4a9fa82a980e143c828b9d54694b98de0b46d00618076201efee821165f8d8a`,
но этот hash не является acceptance. Файл нужно прочитать как новый документ,
сохранить v2.24 main corrections, применить только безопасные Codex
plugin/legacy classifications и затем обеспечить byte parity с
`plugins/nacl/resources/docs/runbooks/upgrade-graph-extensions.md`. Любое
расхождение пары блокирует merge.

## 6. Защита исходного dirty checkout и untracked данных

Исходный `/Users/maxnikitin/projects/NaCl` нельзя использовать для checkout,
merge, rebase, pull, clean или генерации. На момент аудита там три untracked
объекта:

| Объект | Зафиксированное состояние |
|---|---|
| `.codex/` | 7 TOML-файлов, 13,755 bytes; SHA-256 хеш отсортированного hash-manifest: `927c01ea051446f362bae8c9afb71ba47263c49a3e76c1f8ee00af880657855e` |
| `docs/presentations/ba-sa-live-demo/client-brief.md` | 7,752 bytes; SHA-256 `0ff11f5b1bcf87fe81719536a2946bb764be497455bd22c5cdbfb6fb3f1e32ab` |
| `docs/runbooks/codex-desktop-plugin-orchestrator.md` | 1,490 lines, 51,364 bytes; SHA-256 `3ed49c33f90e252e7892b08630dd046a3304ad72fe5e4b759dd3d957d8023899` |

Tracked runbook из `c959879` имеет 1,725 lines и SHA-256
`134c6562ec5dfd944d142c49fd9334e5626231eed5ceb844fcf5e89fb5e8eec4`.
Он отличается от untracked файла на **339 changed lines** (`+52/-287`). Поэтому
нельзя просто добавить tracked-вариант поверх пользовательского файла.

Правила защиты:

1. Перед каждым этапом повторно снять `git status --short`, hashes и размеры в
   исходном checkout. Любое отличие от snapshot выше — `STOP`, сначала
   выясняется владелец изменения.
2. Все действия выполнять только в новых sibling-worktrees. Никакого
   `git clean`, `reset --hard`, `checkout --`, `stash -u` или автоматического
   перемещения пользовательских файлов.
3. Reconciled runbook создавать в successor worktree сравнением обеих версий;
   пользовательский untracked оригинал не является output path.
4. Если позднее merge в `main` сделает runbook tracked, обновление исходного
   dirty checkout будет отдельно заблокировано Git из-за untracked collision.
   До pull пользователь сам выбирает backup/rename/commit; Wave 9 ничего не
   перемещает.
5. `.codex/**` и `client-brief.md` не включать в PR и negative-deletion allowlist
   без отдельного явного решения пользователя.

## 7. Main-based successor integration: этапы

### Этап 0 — повторная свежесть и чистая база

1. `git fetch origin main`.
2. Записать `FRESH_MAIN=$(git rev-parse origin/main)` и сравнить с локальным
   `main`; не продолжать по symbolic ref.
3. Повторить `merge-base`, path counts, intersections и `merge-tree` между
   `FRESH_MAIN` и `c959879...`. Если SHA или множества изменились — обновить
   этот аудит до изменения кода.
4. Создать новую ветку, например `codex/plugin-09-mainline-integration`, и новый
   sibling-worktree **непосредственно от `FRESH_MAIN`**. Старую integration не
   переименовывать и не менять.
5. Подтвердить clean status нового worktree и неизменность трёх untracked
   объектов исходного checkout.

### Этап 1 — импорт Codex-only основы по allowlist

Отдельными reviewable commits перенести из точного `c959879...`:

- `.agents/plugins/**`;
- `plugins/nacl/**` как временный seed, не как готовый shared snapshot;
- `tests/codex-plugin/**`;
- dedicated Codex scripts и `.github/workflows/test-codex-plugin.yml`;
- Codex-only ADR, evidence, setup/doc files, которых нет в `main`;
- проверенные изменения legacy `skills-for-codex/**` вручную поверх current
  main.

Запрещены `git merge codex/desktop-plugin-integration`, full-tree `git restore`,
mass cherry-pick и перенос старого `.github/workflows/test-tools.yml`. Каждый
commit обязан указывать source SHA и path allowlist в evidence.

### Этап 2 — refresh Codex package от current main

1. Добавить/проверить детерминированный Codex package manifest/builder, который
   явно описывает source → bundled destination и допустимые преобразования.
2. Обработать все 24 root-source changes: 17 direct counterparts обновить, 7
   отсутствующих классифицировать по разделу 4.
3. Пересобрать `plugins/nacl/resources/workflows/**`, shared docs,
   graph schemas/queries/scripts и public skill wrappers от текущих источников.
4. Пересчитать `package-index.json`, workflow parity baseline, hash-bound
   deliberate divergences и inventory counts. Нельзя менять expected hash до
   независимого сравнения semantics.
5. `skills-for-codex` остаётся промежуточным source там, где есть намеренная
   Codex adaptation; цепочка должна быть `root -> mirror/exemption -> package`,
   а не `старый package -> root`.
6. Запустить package builder дважды в чистых временных каталогах и сравнить
   trees byte-for-byte.

### Этап 3 — сохранить Claude generated artifact byte parity

1. Не редактировать `plugin/**` вручную.
2. После любого изменения root source выполнить
   `node scripts/build-plugin.mjs`, просмотреть `.build-report.json` и
   закоммитить source + generated artifact одним логическим commit.
3. Обязательно выполнить `node scripts/build-plugin.mjs --check` и
   `node --test scripts/build-plugin.test.mjs`.
4. Сравнить manifest/version/marketplace и generated tree; unexpected deletion
   или pin-count drift блокирует этап.
5. Codex `plugins/nacl/**` и Claude `plugin/**` должны иметь отдельные builders,
   manifests и CI owners; совпадающее имя продукта не разрешает copy-over.

### Этап 4 — ручная композиция 24 конфликтов и auto-merge runbook

Каждый путь из раздела 5 редактировать поверх current main по указанному
правилу. EN/RU пары проходят semantic, link, anchor, generated-inventory и
render checks. `upgrade-graph-extensions.md` проверяется вручную и зеркалится
byte-for-byte в Codex package.

### Этап 5 — CI ownership без glob-регрессии

Принятое направление:

- main `.github/workflows/test-tools.yml` остаётся generic owner;
- во всех generic Node/bash/PowerShell выборках сохраняется `:!plugin/**`;
- добавить `:!tests/codex-plugin/**`, чтобы dedicated suite не запускалась без
  своих Python/vendor/runtime prerequisites;
- сохранить job `pwsh-syntax` без сокращения;
- `.github/workflows/build-plugin.yml` проверяет Claude generation;
- `.github/workflows/test-codex-plugin.yml` устанавливает pinned Python/Node и
  запускает Codex validators/contracts/package/closure/docs;
- `scripts/codex-plugin-ci.sh test:contracts` также обязан исключать Claude
  `plugin/**` и иметь явный набор Codex tests, а не repository-wide случайный
  glob;
- path triggers составить как объединение owners, но не объединять bodies
  jobs.

### Этап 6 — Wave 9 production implementation

Только после `RECONCILIATION_BASE_VERIFIED` продолжать собственно Wave 9:
production Streamable HTTP MCP, auth/identity/isolation, TLS/domain/CSP,
revoke/rotation/rate limits, two-user/two-machine checks, backup/restore,
publisher/legal/support assets, complete tool annotations, five positive и три
negative reviewer fixtures, hosted CI/security/SBOM/secret/privacy scans и
frozen submission bundle. Skills-only fallback запрещён.

Развёртывание, credentials, paid resources и external mutations требуют
отдельной авторизации; отсутствие этой авторизации — `BLOCKED`, а не повод
подменить full product локальным skills-only пакетом.

### Этап 7 — merge-ready PR, но не merge по умолчанию

1. Снова `git fetch origin main` непосредственно перед PR.
2. Если `origin/main` изменился, остановиться, повторить path/merge-tree/drift
   audit и интегрировать свежий main в successor отдельным reconciliation
   commit в чистом worktree. Не rebase старую integration.
3. Требовать `git merge-base --is-ancestor "$FRESH_MAIN" HEAD`.
4. Открывать PR только после всех локальных и hosted gates и отдельного
   разрешения на push/PR.
5. Merge в `main` — отдельное решение пользователя после Wave 9 acceptance.
   Использовать защищённый PR, без force-push и без локального merge в dirty
   checkout.
6. После разрешённого merge получить новый `origin/main`, проверить resulting
   tree, tags absence, package hashes и неизменность ранее не затронутых main
   путей. Tag/release/publication остаются отдельными действиями Wave 10.

## 8. Negative-deletion и preservation audit

На каждом candidate SHA строится machine-readable manifest относительно
зафиксированного `FRESH_MAIN`:

```bash
git diff --name-status "$FRESH_MAIN"...HEAD
git diff --diff-filter=D --name-status "$FRESH_MAIN"...HEAD
git diff --check "$FRESH_MAIN"...HEAD
git ls-tree -r --name-only "$FRESH_MAIN" | sort > before-main-paths.txt
git ls-tree -r --name-only HEAD | sort > candidate-paths.txt
comm -23 before-main-paths.txt candidate-paths.txt
```

Файлы manifest создаются только во временном evidence-каталоге вне repository
или как явно reviewable evidence, не в dirty checkout. Удаления main paths по
умолчанию запрещены. Если удаление действительно требуется, для каждого пути
нужны owner, причина, replacement, test и отдельное approval; пустое множество
удалений — ожидаемый результат reconciliation.

Дополнительно:

- сравнить `git diff --name-status d98f739..FRESH_MAIN` с candidate и доказать,
  что ни одно из 295 main changes не было откатано старым snapshot;
- проверить inventories root `nacl-*`, `skills-for-codex`, Claude `plugin/` и
  Codex `plugins/nacl/` независимо;
- искать удалённые CI jobs, triggers, exclusions и security annotations, а не
  только удалённые файлы;
- `README`/docs claims сравнивать с runtime manifests и generated inventories;
- проверить отсутствие `.codex/**`, `client-brief.md`, personal paths, secrets,
  temp worktree paths и candidate-only IDs в diff/archives.

## 9. Обязательные gates successor

### Repository и generation

- clean successor worktree; original snapshot неизменен;
- fresh-main ancestry и повторный merge-tree audit;
- `git diff --check` и negative-deletion audit;
- `node scripts/build-plugin.mjs --check` и Claude build tests;
- deterministic Codex package rebuild/check в двух clean directories;
- root↔legacy-Codex sync и все 24 drift dispositions;
- byte parity для generated Claude artifact и заявленных Codex mirrors;
- manifest, package closure, official skill/plugin validators и archive
  reproducibility.

### Test/CI

- Node 20 и текущий bundled/current Node/Codex matrix; локальный Node 24 не
  заменяет Node 20 gate;
- generic Node/shell tests без generated `plugin/**` и dedicated Codex tests;
- hosted PowerShell parser (`pwsh-syntax`) для всех tracked PS1;
- Codex contracts, package, closure, docs, CLI/cache/reinstall/uninstall;
- local graph, multi-project, multi-user/concurrency Docker suites в
  авторизованной disposable среде и нулевая утечка ресурсов;
- hosted CI на PR, SBOM/dependency/vulnerability, secret/privacy/license scans.

### Production Wave 9

- production MCP auth/TLS/domain/CSP and complete tool annotations;
- two-machine/two-user grant, revoke, stale-session, isolation and abuse/rate
  tests;
- encrypted offsite backup и внешний restore drill;
- legal/privacy/terms/support/publisher identity and supported-region review;
- clean reviewer fixtures: exactly five positive and three negative cases;
- independent security/privacy reviewer и independent release QA оба `ACCEPT`;
- exact source SHA, versions, skills bundle, MCP deployment revision, legal
  URLs и evidence digests связаны в frozen submission manifest.

## 10. Stop conditions

Немедленный `STOP/BLOCKED`, если выполняется хотя бы одно условие:

- `origin/main` изменился после freshness snapshot;
- original checkout status/hash/size изменился;
- появилась попытка merge/rebase старой integration или whole-file
  `ours`/`theirs` для 24 конфликтов;
- negative-deletion audit не пуст без path-specific approval;
- `plugin/**` не совпадает с Claude builder или был отредактирован вручную;
- хотя бы один из 24 root-source drifts не обновлён/классифицирован;
- Codex parity hashes обновлены без semantic diff review;
- generic CI снова захватывает generated `plugin/**`, потерян `pwsh-syntax` или
  dedicated Codex suite не имеет своих prerequisites;
- EN/RU документы, root/bundled runbook или inventory расходятся;
- архив содержит secret, personal/temporary absolute path или untracked
  пользовательский файл;
- mandatory test имеет `FAILED`, необоснованный `SKIPPED` или только локальный
  substitute вместо hosted/production proof;
- нет отдельной авторизации на infrastructure, credentials, paid resource,
  push/PR, merge, portal, tag или publication.

## 11. Rollback

До merge rollback ограничен successor worktree: откатывать только отдельный
этап новым revert commit или удалять disposable successor worktree после
сохранения evidence. Старую integration и исходный checkout не reset/clean.

Если дефект найден после разрешённого PR merge, применять обычный revert PR
точного successor merge и повторять generation/negative-deletion gates; не
force-push и не восстанавливать дерево старой integration. Production MCP
rollback использует заранее проверенные deployment revision, revoke и restore
процедуры; repository rollback не подменяет data/credential rollback.

## 12. Критерий завершения reconciliation

Статус `RECONCILIATION_BASE_VERIFIED` допустим только когда новый successor
основан на повторно свежем main, все 24 конфликта разрешены композиционно,
auto-merged runbook проверен и зеркалирован, 24 root-source drift получили
17 refresh + 7 dispositions, оба plugin trees воспроизводимы, CI ownership
сохранён, negative-deletion audit пуст и исходный dirty checkout byte-for-byte
не изменился. Только после этого Wave 9 может строить production artifact.
