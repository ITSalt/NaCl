# WP-FRAMEWORK-01 — карта и протокол: промежуточная сдача

**Не принято.** Исследование на снимке NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; текущий код Family Cinema `4f3ecb812e7014dc4875084b0c1d72fe717a453e`. Root и клиентские проекции различаются; графовые операции и эксперименты не выполнены. Источники, подтверждающие заявленный контракт, не доказывают runtime, частоту вызовов и цену.

## Покрытие и источники

[Индекс 61 root package](WP-01-package-index.md) даёт source path → тематический WP и описание; [проверка покрытия](WP-01-coverage-check.md) отмечает пересечения и границы. 61 — знаменатель упаковки, не количество независимых обязанностей. Дополнительные области CI, graph-infra, analyst-tool и tracker CLI — [платформа](WP-01-platform-inventory.md); source/overlay/generated следует сопоставлять, а не суммировать. Вложенный частный `meta/` исключён из SHA NaCl; отдельное исследование не выполнялось.

Заявленные рёбра, требующие сверки активных Codex leaf и реальных вызовов: BA context→process→workflow→entities/roles/glossary/rules→validate→handoff (root `nacl-ba-full/SKILL.md:74–99`); SA validate→finalize→optional publish→optional TL plan (`nacl-sa-full/SKILL.md:99–117`); запрос→TL plan→TL full→staging (`nacl-tl-conductor/SKILL.md:54–75`); pre-ship QA отдельно от post-ship verification (`nacl-tl-verify/SKILL.md:50–76`). Их нельзя выдавать за наблюдение runtime.

## Механизмы и отрицательные случаи

[Первые карточки](WP-01-mechanism-samples.md) и [дополнительные механизмы](WP-01-additional-mechanisms.md) охватывают BA write/read-back, evidence, bootstrap, diagnose, publication, lease, validation, handoff, board sync и render. Предварительная категория DEFER: реальная частота и цена unknown, а альтернативы и потери гарантий должны проверяться на отрицательных случаях. Полный реестр каждой обязанности и поля consumer, историческое основание, confidence/опровержение ещё не собраны: это открытый критерий, а не доказанное покрытие.

Проверенное текстовое противоречие установленного Skills-only read canary описано [здесь](WP-01-skills-only-canary.md); runtime-поведение не проверено. Кандидат расхождения QA FAILED + обязательный NOT_RUN может терять градацию отказа, оставаясь non-success; нужен отдельный negative test. Analyst Tool имеет статически различные статусы события и очереди при nonzero; UI outcome не проверен. Ничего из этого не является измеренным false PASS.

## Корпус и rubric

Шесть предложенных сценариев, brief и black-box criteria: [черновики](WP-01-briefs-draft.md), [расхождения источников](WP-01-corpus-conflicts.md). [Манифест кандидатов](WP-01-baseline-candidates.md) фиксирует Git commit/tree и hashes черновиков, а не воспроизводимый baseline. FR-030 получает post-baseline новое требование; recovery — синтетическую фикстуру. Исторические версии используют разные toolchain. Исходные документы и post-change тесты могут раскрывать решения, поэтому одинаковые закрытые входы и изоляция ещё должны проверяться.

[Рубрика сравнения](WP-01-measurement-rubric-draft.md) описывает одинаковые условия, метрики, сохранение failed/blocked/timeout и предварительный порог; она не утверждена как окончательная. Ни pilot, ни A/B, ни цена не измерялись.

## Неподтверждённые гейты

Graph scope, writers, locks, export/restore, schema и semantic fingerprint = NOT_VERIFIED. DNS `graph.itsalt.ru` разрешился, TCP 443 connect истёк через 4 секунды, ранее MCP initialize истёк через 12 секунд; причина неизвестна. Исторический graph snapshot не подтверждён. [Ограничения восстановления](WP-01-graph-baseline-risks.md) показывают, что полный import в общий граф и Task claim не являются доказанным безопасным reset/project mutex. Live A/B и recovery блокируются до фактической проверки состояния и восстановления, без выдуманного baseline.

До полного ACCEPTED необходимы: завершить реестр обязанностей и проверку источников; зафиксировать согласованный корпус и независимый harness/criteria с проверкой воспроизводимости; подтвердить graph baseline и механизм восстановления либо явно изменить требования гейта по решению владельца. WP-02/03 и другие доступные read-only исследования могут готовиться, но закрывать их зависимость от WP-01 нельзя. При недоступности источника протокол допускает частичный отчёт, не превращая его в полный PASS.
