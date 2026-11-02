# WP-10: буквальные ссылки installed bundle и границы checker

Read-only проверка installed NaCl 0.2.2; выполнение workflow, builder, checker и MCP не проводилось. Active route и runtime outcome UNKNOWN.

Два независимых подсчёта по `skills/*/resources/workflows/*/SKILL.md` и буквальному backtick pattern `../references/<имя>.md`: **129 вхождений в 44 leaf**, 122 уникальные пары leaf→нормализованный target, 26 bundle-local targets, из них 22 отсутствуют и 4 существуют. На отсутствующие targets указывают 101 вхождение и 95 пар. Это не 22 различных имени и не 101 сбой: часть ссылок условная. Скан не охватывает другие формы путей, Markdown anchors, динамическое разрешение или эквивалентные инструменты. Symlinks внутри installed skills не найдены.

Две независимые in-memory модели применили ту же ограниченную проверку к ожидаемой closure Git-снимка `20fe4c6` и source `c291c798`: результаты идентичны установленному подсчёту — 129 вхождений, 26 targets, 22 отсутствуют в рассчитанной closure; наборы совпадают при игнорировании номеров строк. Для `20fe` это предсказание по моделям, а не проверка новой сборки; краевые отличия Python-модели от JS и динамическое разрешение не исключены.

Разбивка 101 отсутствующего вхождения (проверена независимо):

| Имя | Вхождения | Уникальные leaf→target | Bundle-local targets |
|---|---:|---:|---:|
| verification-vocabulary.md | 41 | 41 | 7 |
| migration-rules.md | 27 | 27 | 4 |
| verification-evidence.md | 15 | 12 | 3 |
| goal-codex-contract.md | 11 | 11 | 5 |
| orchestration-model.md | 7 | 4 | 3 |

По воспроизводимой классификации текста 71 вхождение находится в явно предписанном предварительном или условно предварительном чтении, 11 — в Goal Compatibility/Boundary, 19 — в других контекстах. Это классификация **вхождений**, не безусловных запусков: например goal preview и применение TL core имеют собственные условия, а «другой контекст» может быть обязательным при terminal Task write или завершении batch. Фактический route и failure не проверены.

Например BA full `skills/nacl-ba/resources/workflows/nacl-ba-full/SKILL.md:24–27` предписывает прочитать orchestration-model, migration-rules и verification-vocabulary; три нормализованных BA target отсутствуют, тогда как BA contract в списке присутствует. TL conductor :28–32 требует четыре файла references, и все четыре нормализованных TL target отсутствуют. Ссылки Goal Compatibility имеют отдельные условия и не должны автоматически считаться preflight каждого запуска. Наличие текста и отсутствие файлов не доказывают фактический отказ агента.

Pinned checker `scripts/check-skills-only-bundle.mjs:20–21,76–90` проверяет inline Markdown links в `.md`, границу active skill и существование target; backticks, reference-style links, HTML и JS imports не входят в этот scan. Рекурсивный walk :28–37,61–64 запрещает symlinks внутри обнаруженных skill roots, но не доказывает отсутствие symlinks по всему bundle. :43–45 подавляет любые исключения optional проверки `.mcp.json`/`.app.json`; отдельные реальные read/readdir/parse failures могут завершить процесс исключением без гарантированного структурированного `Status: FAILED`. Это следствие source, не воспроизведённая ошибка.

[Содержательные обязанности четырёх references](WP-10-missing-reference-semantics.md) отдельно показывают возможную потерю контекста статусов, evidence и orchestration без утверждения runtime сбоя.

Checker не проверяет hashes/release manifest, execute modes, содержание/anchors всех ссылок или работу MCP. `VERIFIED` по этому исходнику подтверждало бы только его перечисленные gates, не семантическую полноту bundle. Модель regex не является полноценным Markdown parser. Отдельная [матрица конкретных ресурсов](WP-10-installed-resource-matrix.md) и [сверка manifest](WP-10-installed-integrity-trace.md) сохраняют provenance и ограничения.
