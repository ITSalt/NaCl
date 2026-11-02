# WP-10: Skills-only closure — сравнение двух Git-снимков

Сравнены installed manifest source `c291c798fcfda697dd8d93f23ffc6d7e68528a5a` и pinned NaCl `20fe4c6`. Две независимые read-only модели воспроизвели в памяти правила Markdown-link/allowlist/recursive JS-import/init seeds из `scripts/build-codex-skills-only.mjs:217–284`; builder/main, tests, graph и A/B не запускались.

Оба снимка дали одинаковые множества: 10 public SKILL и 144 resource paths, 0 added/removed и 0 unresolved по моделям. Это **равенство путей**, не semantic completeness: ссылки в backticks алгоритм не отслеживает, поэтому ранее [найденные отсутствующие ресурсы](WP-10-installed-resource-matrix.md) этим не опровергаются.

Из 154 output paths у 145 исходные Git blobs одинаковы, у 9 различаются. Две независимые in-memory проверки rewrite показали, что все 9 outputs остаются различными после преобразования. Это 8 уникальных source paths: `nacl-tl-fix/SKILL.md` входит в два bundles, остальные — TL review, SA domain/flags/UC/UI и init SA/TL schema. Совпадение путей не означает одинакового содержимого версий.

Граница: модели могут отличаться от JS builder на краевых URI и regex; fresh build, фактические modes, symlinks/untracked, semantic diff и активный runtime не проверены. Никаких изменений исходных файлов не выполнялось.
