# WP-01: исторические документы — выборка источников

Выборка из `docs/releases` (128 tracked), `docs/research` (50), `docs/presentations` (69), pinned NaCl 20fe4c6. Исторические утверждения документов не являются независимым воспроизведением, наблюдением текущего runtime или доказательством частоты.

| Источник | Значение и предел |
|---|---|
| `docs/releases/0.6.0-handover/release-notes.md:3–18,26–28` | Историческая мотивация изоляции и handover; S3 описан иначе, чем в текущих `graph-infra/scripts/handover-export.sh:23–25` и `docs/HANDOVER.md:193–195`. Требует учёта версии |
| `docs/releases/0.10.1-honor-fix-contract-downstream/release-notes.md:3–16,30–40` | Заявленный исторический contract drift fix→reopened/hotfix; не доказанная частота production incidents |
| `docs/releases/0.18.0-evidence-writer-contract/release-notes.md:3–10,25–38` | Исторически заявленный разрыв writer/reader. Старые allowed shapes не следует переносить на нынешнюю package taxonomy |
| `docs/research/B1-cross-file-trace-headtohead-UC033-BE.md:3,24–41,59–71` | Предыдущий опыт false PASS/cross-file с ограничениями; один случай не доказывает обобщённый эффект |
| `docs/research/phase0-change-propagation-benchmark-RU.md:3,24–34,38–65` | Исторический isolated Family Cinema clone и гипотезы drift; это не текущий graph baseline |
| `docs/research/codex-plugin-wave-5-concurrency-2026-07-14.md:1–18,112–133,188–252` | Контекст identity/fence; прошлый отчёт не доказывает установленный route и live atomicity |
| `docs/research/experiment-report-RU.md:118–145,188–202` | Исторический head-to-head с асимметрией доступа в итерации 2; результаты и цену нельзя переносить на другое сравнение без сопоставимого протокола и сырья |
| `docs/presentations/ba-sa-live-demo/README.md:3–23` | Слайды названы источниками, deck и PDF — производными кандидатами; исключение требует проверки соответствий |
| `docs/presentations/ba-sa-live-demo/demo-script.md:1–23,27–40` | Отдельные операторские ожидания и recovery-сценарий, не только копия слайдов; факт репетиции или restore не доказан |
| `docs/presentations/ba-sa-live-demo/slides/03a-economics.md:1–13` | Заявленное сравнение токенов требует сопоставимого набора требований, prompts и независимой проверки; не считать общей измеренной экономией |

Целиком исключать эти каталоги как производные нельзя: в выборке есть уникальные сценарии и обоснования. Остальные файлы, claims и проверка дублирования остаются UNKNOWN.
