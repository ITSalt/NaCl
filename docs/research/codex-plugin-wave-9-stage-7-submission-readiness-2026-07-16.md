# Wave 9 Stage 7 — metadata, reviewer package и pre-freeze binding

Дата: 2026-07-16

Stage 6 evidence SHA: `22bfd22a8b1a587a983779773dffcddc6dff08ae`

Принятый Stage 7 implementation SHA:
`fac5087230579d029bc6aa612f7dbdef386031a0`

Ветка: `codex/plugin-09-stage3-fresh-main`

Статус: `LOCAL_ACCEPTED` только для ограниченного объёма Stage 7.

Wave 9 остаётся `IN_PROGRESS` и не получает
`LOCAL_IMPLEMENTATION_VERIFIED`. Этот checkpoint не является submission-ready,
не создаёт portal draft и не разрешает Stage 8, final QA, deployment, merge,
push, tag, release или publication.

## Принятый локальный объём

- Стабильная interface metadata: категория, capabilities, три starter prompt,
  repository/license/keywords и детерминированные PNG assets. Неподтверждённые
  website/privacy/terms URL намеренно отсутствуют из plugin manifest.
- Ровно пять positive и три negative reviewer fixtures с закрытыми input/output
  schemas и реальным HTTP/SDK/application execution path. N1 разделяет
  transport `401` от MCP reauthorization result, N2 не выдаёт внутренний `403`
  за wire HTTP status, N3 не вызывает tool.
- Machine-readable и human-readable disclosure описывают OAuth identity,
  содержимое project graph, цели обработки, audit, backup/restore и текущую
  server-level authorization boundary. Нерешённые production decisions имеют
  явные `NOT_VERIFIED` или `NOT_SELECTED` значения.
- Committed metadata остаётся pre-freeze: source SHA не записан внутрь package,
  portal/app/endpoint/container/legal state не объявлены готовыми.
- Внешний release-binding generator требует clean Git HEAD, дважды проверяет
  неизменность HEAD, строит два независимых Codex package outputs и сравнивает
  полный file/mode manifest и install tar побайтно. Binding и sidecars пишутся
  только вне repository, без overwrite; при частичном отказе созданные этим
  запуском sidecars удаляются.
- Full plugin tree и install archive связаны отдельно как
  `plugin.packageTree` и `plugin.installArchive`; public MCP source bundle и
  archive имеют отдельные поля. Наличие этих локальных digest bindings не
  подменяет production endpoint, image, legal или signature gates.

## Кумулятивная история Stage 7

Stage 7 начинается после Stage 6 evidence commit
`22bfd22a8b1a587a983779773dffcddc6dff08ae` и содержит:

| Commit | Назначение |
|---|---|
| `3aea0d3bb3c9306e5d39954df01adb06668035e4` | Детерминированная interface metadata и production-shaped assets |
| `6ed4d42403750230c39c738e403b3dac7eb57b34` | Ограниченный reviewer fixture package P1–P5/N1–N3 |
| `dc7bbe896974578f1d18860910f8df433044ef64` | Binding fixtures к runtime outputs |
| `25e2452e989c9e4b200a42c268e52b92d9e88a07` | MCP wire semantics для negative denials |
| `19db522efb36bc857fee2415d4f1859b06fc7fe4` | Reauthorization fixtures, связанные с real server control/session state |
| `c5d13420df63e22becbda5b0b681281e0fd8214e` | Data-flow/security disclosure и pre-freeze release binding |
| `fac5087230579d029bc6aa612f7dbdef386031a0` | Полный generated-plugin tree/install archive binding и корректная repository-root privacy reference |

Коммиты коррекции не переписывались и остаются видимыми в истории.

## Независимые ACCEPT

### Reviewer fixtures

Независимый reviewer вернул `ACCEPT` для точного SHA
`19db522efb36bc857fee2415d4f1859b06fc7fe4`:

- reviewer tests: 5/5;
- topology authorization: 29/29;
- AJV 2020 schema validation: PASS;
- source/package parity и exact hashes: PASS;
- N1 stale/revoked sessions получены через реальные server-control и session
  registry transitions; graph adapter calls: 0 для negative cases.

### Final binding

После отдельного root review, обнаружившего неполный package binding и
ошибочную package-relative privacy reference, correction commit `fac5087...`
закрыл оба blocker. Независимый reviewer вернул `ACCEPT` для точного SHA
`fac5087230579d029bc6aa612f7dbdef386031a0` без блокирующих замечаний:

- 392 manifest files равны 392 tar entries под корнем `nacl/`;
- все path, mode, size и SHA-256 совпали; все 392 mode равны `0644`;
- external generation связал exact clean HEAD и сохранил
  `NOT_READY_FOR_SUBMISSION` / `NOT_SIGNED`;
- overwrite, repository-local output и partial-write race отклонены без удаления
  чужого файла;
- repository privacy notice имеет `repositoryPath: "PRIVACY.md"`,
  `pathBase: "repository-root"`, `includedInPackage: false`; package-relative
  `PRIVACY.md` отсутствует;
- source/package parity, OpenAI validator и Claude frozen bytes: PASS.

## Точные digest bindings

Все значения ниже получены для accepted implementation
`fac5087230579d029bc6aa612f7dbdef386031a0`. Пути repository-relative; временные
host paths не являются evidence.

### Plugin metadata и assets

| Artifact | SHA-256 |
|---|---|
| `.codex-plugin/plugin.json` | `b0ddc11d90ec67b8eb1967f26d34204a73b4a423af0c1cd9f46deb689b521608` |
| `assets/composer-icon.png` | `a09b04c2d1214db9cb751a6148a7fac04446949df0f65d0431b0cb3b21a43398` |
| `assets/logo.png` | `8fdccd60a31902a2c83cdcbe8bdd9c37e64d8a8941b8f830d15679c0bdc3325e` |
| `assets/logo-dark.png` | `3186784ecdb0f3acc1441f6e8edf7a01841d131ffd152486baa6223148e379a8` |
| Data-flow JSON | `7491981881265072998cb8168a27bed7842ee29d2f830b37e36012dfa9c8e0ed` |
| Data-flow Markdown | `b23e03a108133eb8c6a3c3f497bbc74ac5e676205ce398bbe6cdd1820d0895b2` |
| Repository license | `af85fae2341fa52c01509a2c9b0f2db8499750c255c32573da56bf18c754708e` |
| Public MCP lockfile | `2bbaa76ece22dfbf6a7d7353927c49b207ef5371ab0e7b32d9a1bb1199e67e57` |

### Reviewer package

| Artifact | SHA-256 |
|---|---|
| Reviewer fixtures | `848f76c9ddb59af55c8bc52e14fe8bd9657b5b07d22fa84925b0fdbf25c67c15` |
| Reviewer fixture schema | `0b48a73f9e4df903716d497128b038becf79ba4e36cd3d22d18377e015481f24` |

### Full plugin release artifacts

| Binding | Значение |
|---|---|
| Package file count | `392` |
| Package tree SHA-256 | `77471df6f083ad79de5c6e815500ea63020818e2d1f936d3f29dad69c3051c66` |
| Package tree manifest SHA-256 | `9edc1e73e929e440b03561c055e0f5aa6ac36fe4882c5060c1c54695205492c2` |
| Install tar SHA-256 | `b9582acdcbaee40f88bc1082f7c728373dc672c1a726840627324d219c5399bc` |
| Install tar size | `6084608` bytes |
| Release binding SHA-256 | `c19732e5ad299e28be5366246781aa7b9d97ecbcf53f186d02a2fb44e103f487` |
| Public tools metadata SHA-256 | `d2fe4250950b27df999ca8fc40174c8bb01d2fddc44b2f8417d69c67f93f3119` |
| Server instructions SHA-256 | `7b80ac50a22fa441f0340bcc9d6ef250afc09f09223eb4da90512ec7574a1cd6` |

Две независимые генерации дали byte-identical binding, manifest и install tar.
После проверки внешние verification artifacts были удалены; их digest остаётся
evidence, а временный путь намеренно не записывается.

### Public MCP bundle и SBOM

| Artifact | SHA-256 / digest |
|---|---|
| Public MCP source digest | `661f91347f56a5e20e8266bc1bb8ff54558277408d92819d49fad7c1c6de7736` |
| Bundle manifest file | `476d1a509e27cb45b881ddc8a0df8af5f96bb28a3804dfd0f69da1093b885955` |
| Public MCP tar archive | `dc2e739742674f88907e0fb894f3077a8bd41275007ddcce9994a2121543a6a4` |
| SBOM manifest | `5fab1df200d89632ff3d9d1ee5ef5e69ee4b6d8d417720b01de40b80f859ce1c` |
| CycloneDX dependency SBOM | `1d6f482aefad9676a453396f59766ea5263566dc8a3574f5c5cffafe069e7a5a` |
| CycloneDX bundle SBOM | `04cc70034b4f88cba5e137c344e0554a3f09927f1ed7ff9570fa476db2589a19` |

SBOM source/archive bindings совпадают с public MCP bundle. Это локально
воспроизводимые SBOM documents, а не evidence внешних scanner gates.

## Локальные проверки

| Gate | Результат |
|---|---|
| Final focused interface/reviewer/submission suite | 13/13 PASS |
| Reviewer fixture suite на accepted fixture SHA | 5/5 PASS |
| Reviewer topology authorization | 29/29 PASS |
| Full Codex contracts после correction | 259 total: 254 passed, 0 failed, 5 expected Docker skips |
| Production MCP service | 55 total: 54 passed, 0 failed, 1 expected Docker skip |
| Release binding / public bundle | 3/3 PASS |
| Independent generated-plugin builder | 7/7 PASS |
| Independent Claude guard adversarial suite | 10/10 PASS |
| Independent plugin validator adversarial suite | 4/4 PASS |
| Independent MCP transport/topology selection | 42/42 PASS |
| OpenAI plugin validator | `VERIFIED` |
| Generated Codex package | 392 files; 10 public skills; 60 workflows; current |
| Claude isolation | frozen manifest hash `026fdf5aa1a62c41af8e61748ba50678020cc2bd`; generated parity `VERIFIED` |

Пять full-contract skips являются ранее определёнными opt-in Docker gates и не
были переименованы в PASS. Stage 7 не выполнял новый real production deploy.

## Обязательные незакрытые gates

| Gate | Точный статус |
|---|---|
| Branding owner approval | `NOT_VERIFIED` |
| Reviewer/lifecycle screenshots | `NOT_RUN` |
| Publisher identity | `NOT_VERIFIED` |
| Public website | `NOT_VERIFIED` |
| Public privacy policy | `NOT_VERIFIED` |
| Public terms of service | `NOT_VERIFIED` |
| Support owner/contact/response commitment | `NOT_VERIFIED` |
| Security owner/contact/vulnerability and incident process | `NOT_VERIFIED` |
| Hosting regions | `NOT_VERIFIED` |
| Primary, audit and backup retention | `NOT_VERIFIED` |
| Subprocessors | `NOT_SELECTED` |
| Deletion and export process | `NOT_VERIFIED` |
| Production model-training/secondary-use commitment | `NOT_VERIFIED` |
| Immutable production container image digest | `NOT_BOUND` |
| Real public HTTPS MCP endpoint | `NOT_VERIFIED` |
| Real OAuth/OIDC provider and integration | `NOT_SELECTED` / `NOT_RUN` |
| Portal-issued app ID | `NOT_BOUND` |
| Reviewer credentials | `NOT_BOUND` |
| Live reviewer fixtures against public deployment | `NOT_RUN` |
| Hosted CI | `NOT_RUN` |
| Container-image SBOM | `NOT_RUN` |
| External SAST, secret, privacy, container, IaC and exposed-endpoint scans | `NOT_RUN` |
| Multi-architecture image verification | `NOT_RUN` |
| Artifact signatures | `NOT_SIGNED` |
| Portal draft, submission and publication | `NOT_RUN` / `NOT_AUTHORIZED` |
| Clean second-machine Git-release installation | `NOT_RUN` |

Local JSON/MCP tests и synthetic release binding не повышают ни один из этих
статусов. В частности, repository-root `PRIVACY.md` остаётся local-framework
notice и не является public MCP privacy policy.

## Evidence-commit gates

После изменения только этого evidence-файла и Execution Ledger выполнены:

- plugin docs: `VERIFIED`, 40 Wave 8 Markdown files, 10 public skills,
  60 internal workflows и 25 local MCP tools;
- plugin closure: `VERIFIED`, 392 files, 301 Markdown inline paths,
  59 descriptive source paths;
- plugin manifest: `VERIFIED`;
- generated package current check: 392 files, 10 public skills, 60 workflows;
- `git diff --check`: exit 0.

Эти проверки подтверждают docs-only ledger change и отсутствие package drift;
они не изменяют production `NOT_*` statuses.

## Disposition

Stage 7 получает `LOCAL_ACCEPTED` только на exact implementation SHA
`fac5087230579d029bc6aa612f7dbdef386031a0` для metadata/assets, reviewer
package, disclosure и deterministic pre-freeze binding. Wave 9 остаётся
`IN_PROGRESS / STAGES_1_7_LOCALLY_ACCEPTED / LOCAL_IMPLEMENTATION_AUTHORIZED`,
но явно не `LOCAL_IMPLEMENTATION_VERIFIED`.

Stage 8 и final QA не запускались этим checkpoint. Любая production mutation,
merge/push/tag/release, portal action или publication остаётся за отдельным
явным разрешением пользователя.
