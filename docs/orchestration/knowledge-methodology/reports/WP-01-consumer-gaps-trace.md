# WP-01: уточнение трёх consumers

Source-only NaCl 20fe4c6; наблюдение реальных вызовов, чтения, цены и разрешений внешних действий отсутствует. Альтернативы и negatives предлагаются, не выполнялись; DEFER.

| Группа | Source consumer и граница | Альтернатива / риск |
|---|---|---|
| 05.5 reopened | `nacl-tl-reopened/SKILL.md:13–42` называет тестировщика-человека получателем rework report в YouGile и заявляет отсутствие automated downstream consumers. Missing `Status:` и отсутствие regression seam имеют отдельные HALTED UNVERIFIED headlines; seam gate для parseable status исключает NO_INFRA/RUNNER_BROKEN (:467–490); это root contract, не наблюдение. Legacy Codex occupied-item NOT_RUN — другой input | Typed report должен сохранять source status/review и контекст; иначе риск авто-shipping либо потери принятого BLOCKED |
| 07.2 deploy | `nacl-tl-deploy/SKILL.md:14–30,32–50,229–244` заявляет human/deliver/release/conductor/hotfix consumers. Однако `nacl-tl-deliver/SKILL.md:883–896` для Step 5 описывает curl и явно не deploy skill; `nacl-tl-hotfix/SKILL.md:632–641,682–688` предлагает команду пользователю, release :587–597 предлагает investigation. Parser и конкретное чтение таблицы не установлены | SHA/environment-bound attestation с read-back должна сохранять SHA и не подменять product QA health-ответом; иначе возможны stale CI и mismatch |
| 08.5c postmortem | `nacl-postmortem/SKILL.md:14–34,69–76,85–93` задаёт owner-facing retrospective; `docs/retrospectives/nacl-pilot-W11-report.md:148–150` и `nacl-tl-conductor/SKILL.md:909` используют конкретный предыдущий postmortem как историческое основание. Общий автоматический reader будущих отчётов не доказан | Trace-linked ledger и проверка цитат должны сохранить источник, контекст и owner attribution; иначе причинность и повторяемость теряются |

Для missing/incorrect evidence source-level условия и proposed controls следует различать; полномочия на публикацию YouGile, запуск deploy и текущие runtime маршруты этими источниками не устанавливаются.
