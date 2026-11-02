# WP-10: Skills-only closure — сравнение двух Git-снимков

Сравнены installed manifest source `c291c798fcfda697dd8d93f23ffc6d7e68528a5a` и pinned NaCl `20fe4c6`. Две независимые read-only модели воспроизвели в памяти правила Markdown-link/allowlist/recursive JS-import/init seeds из `scripts/build-codex-skills-only.mjs:217–284`; в этой source-сверке builder/main, tests, graph и A/B не запускались; позднейший [disposable build и probe](WP-10-js-dependency-trace.md) описаны отдельно.

Оба снимка дали одинаковые множества: 10 public SKILL и 144 resource paths, 0 added/removed и 0 unresolved по моделям. Это **равенство путей**, не semantic completeness: ссылки в backticks алгоритм не отслеживает, поэтому ранее [найденные отсутствующие ресурсы](WP-10-installed-resource-matrix.md) этим не опровергаются.

Из 154 output paths у 145 исходные Git blobs одинаковы, у 9 различаются. Две независимые in-memory проверки rewrite показали, что все 9 outputs остаются различными после преобразования. Это 8 уникальных source paths: `nacl-tl-fix/SKILL.md` входит в два bundles, остальные — TL review, SA domain/flags/UC/UI и init SA/TL schema. Совпадение путей не означает одинакового содержимого версий.

Независимо сверено содержание восьми уникальных source diffs c291→20fe:

- SA domain добавляет Screen как authored REALIZED_BY для interface requirement formless screen (`plugins/nacl/resources/workflows/nacl-sa-domain/SKILL.md:72–76`). SA UI :201–207 уточняет исключение HAS_SCREEN с formless=true, при этом реальная Form без inbound action остаётся blocking.
- SA flags :32–38,48–61 добавляет read-only suggest и отдельно подтверждаемый set `coverage_exempt` для ActivityStep с обязательной непустой причиной; default backfill этот flag не создаёт. SA UC :218–227,281–287 описывает согласованный overlap cache policies и coverage exemption с условиями/причиной; business/security/external действия не исключаются автоматически.
- TL review :105–109 добавляет formless screen exemption и token `nav-actions-EXEMPT`, сохраняя проверку screen route. TL fix :96–105,469–477 для самостоятельно синхронизированных L2/L3 задач после PASS описывает одну graph write для снятия stale и продвижения planned_from_version; остальные случаи сохраняют stale/deferral.
- Изменения `resources/graph-infra/schema/{sa-schema,tl-schema}.cypher` в этом diff — только комментарии; изменённых DDL-строк не найдено. Комментарии не доказывают применение schema или enforcement.

Указанные строки относятся к `plugins/nacl/resources/workflows/` snapshot 20fe. Эти различия — source-level, не проверка поведения установленного агента или completeness других ресурсов. Граница: модели могут отличаться от JS builder на краевых URI и regex; эта модель сама не проверяла fresh build, фактические modes, symlinks/untracked и активный runtime; позднейший отдельный build не подтверждает все эти свойства. Никаких изменений исходных файлов не выполнялось.
