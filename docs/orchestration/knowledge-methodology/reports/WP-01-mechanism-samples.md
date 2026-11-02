# WP-01: первые карточки механизмов

Предварительное статическое чтение NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`. Эти примеры не являются полным реестром, подтверждением runtime или итоговыми рекомендациями. Для всех измеренная цена, частота и фактическое исполнение неизвестны; категория пока DEFER.

| Механизм и источник | Заявленный контракт и защищаемый риск | Альтернатива для исследования и риск |
|---|---|---|
| BA write и board, `codex-plugin-src/package/resources/workflows/references/ba-codex-contract.md:58–78,86–113` | Candidate → подтверждение → запись → read-back; сохранение identity при roundtrip. Защищает от неподтверждённой записи и ложного утверждения синхронизации. | Групповое подтверждение фаз; риск устаревшего согласия или неверного scope. |
| Task evidence, `codex-plugin-src/package/resources/workflows/references/verification-evidence.md:1–8,18–32,34–56,101–116` | Evidence привязано к terminal Task; отсутствие обязательной проверки даёт UNVERIFIED. Защищает от закрытия без фактов. | CI attestation или структурированный артефакт; проверить сохранение identity, стадии и атомарности. |
| Skills-only bootstrap, `codex-plugin-src/package/skills/nacl-init/SKILL.md:13–27,35–49,73–98` | Read-only план и подтверждение хеша, применение, затем discovery и canary/read-back; защита от stale plan и ложной инициализации. | Объединение этапов при сохранении identity/CAS; безопасность и цена неизвестны. Не переносить вывод на full plugin. |
| Diagnose, `codex-plugin-src/package/skills/nacl-diagnose/SKILL.md:8–36` | Локальная диагностика не доказывает состояние графа; отсутствие фактов не является PASS. | Единый preflight; риск принять устаревший локальный кэш за graph truth. |
| Publish, `codex-plugin-src/package/skills/nacl-publish/SKILL.md:11–19` | Графовое evidence и отдельные полномочия на внешнюю запись. | Ограниченная делегация на срок/область; риск чрезмерных или устаревших прав. |

Исторические случаи false PASS и drift описаны в `docs/retrospectives/nacl-postmortems-synthesis.md:11,68–89`; связь конкретного современного правила с конкретным дефектом ещё не установлена.

Контур Skills-only (`codex-plugin-src/package/resources/references/skills-only-runtime-contract.md:3–5,7–26`) объявляет старые MCP preflight переопределёнными. `codex-plugin-src/package/resources/workflows/README.md:3–7,14–17` содержит отличающиеся условия. Это расхождение документации или контуров продукта, не доказанный дефект runtime; WP-10 должен проверить сборку и установленный bundle.

Manifest содержит 61 root package, из них 59 с root SKILL; 60 каталогов `skills-for-codex` и 10 публичных входов. Builder `scripts/build-codex-plugin.mjs:332–369` собирает workflow деревья и overlays. Это единицы упаковки, не количество независимых механизмов. Полные потребители, частота, исторические основания и опровержение каждой карточки остаются для продолжения WP-01.

Кандидат negative case для WP-06/17: `codex-plugin-src/package/resources/workflows/references/verification-evidence.md:41–49`, `nacl-tl-qa/SKILL.md:73–85,588–594` и `skills-for-codex/nacl-tl-qa/SKILL.md:39–48` формулируют безусловный переход в UNVERIFIED при обязательном NOT_RUN после выбора слабейшего статуса. При буквальном прочтении комбинация FAILED + NOT_RUN может потерять различение FAILED; UNVERIFIED остаётся non-success. Фактическое исполнение и ложное принятие не наблюдались; проверить читателей и тесты.
