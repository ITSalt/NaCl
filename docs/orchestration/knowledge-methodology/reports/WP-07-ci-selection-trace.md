# WP-07 предварительно: CI run и revision

Pinned NaCl 20fe4c6, source-only; зависимости WP-01 открыты. Внешние CI/PR не запрашивались; цена и частота UNKNOWN, DEFER.

Root `nacl-tl-deliver/SKILL.md:257–263` и `nacl-tl-release/SKILL.md:549–558` обращаются к `nacl-core/scripts/wait-for-ci.sh`. Helper :20–26,47–77 выбирает последний по createdAt из до пяти полученных runs по branch (опционально since), запрашивает databaseId/status/conclusion/createdAt и оценивает один run без head SHA, workflow ID, PR или required checks. Следовательно source допускает риск выбора зелёного run другой ревизии/workflow; наличие других gates не исключается, false PASS не наблюдался.

Helper :60–69 возвращает exit 0 при NO_CI/NO_RUN отдельно от CI_OK; release :551–558 описывает NO_RUN warn-and-continue, а :164–171,912–918 отдельно требует prototype и адресное W4 исключение для skipped PR/CI. NO_RUN не обязательно означает skipped CI, поэтому фактическое сопоставление consumer и exception UNKNOWN. Ошибки `gh` подавляются в показанном пути; live outage не проверен.

Deliver :408–427 фиксирует HEAD и clean checkout, deploy :128–139 проверяет соответствие artifact SHA; это отдельный канал и сам не связывает выбранный run helper с этим SHA. Legacy Codex `skills-for-codex/nacl-tl-deliver/SKILL.md:18–29,31–43,140–164` задаёт свои условия CI/verify/deploy, exact mapping run→head в этих фрагментах не установлен.

Альтернатива — attestation repo/PR/exact SHA/workflow/event/conclusion/required-set с повторной сверкой; риски: потерять исключения, post-merge semantics, отдельный checkout и product QA. Proposed controls: два зелёных run разных SHA/workflow, NO_RUN при недоступном gh, missing required check и head change. Ничего не исполнялось.
