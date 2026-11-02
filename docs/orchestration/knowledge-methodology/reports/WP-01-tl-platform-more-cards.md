# WP-01: дополнительные карточки sync, ship и release

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Категория DEFER: фактическая частота, количество операций/подтверждений, время и стоимость UNKNOWN. Это контракты из текста; runtime, installed behavior и эффективность не проверены. Все negative/positive случаи предложены, но не исполнены. Независимая проверка и полная трасса producer→consumer→recovery необходимы.

## SYNC-01: call-site binding

Вход FE/BE результаты и API contract; producer sync сверяет фактические FE URL/method/body с BE routes, не только декларации. Источники nacl-tl-sync/SKILL.md:135,372,513; skills-for-codex/nacl-tl-sync/SKILL.md:19–30. QA/docs и release — заявленные downstream; фактическое чтение отдельных полей требует проверки. Риск: DTO совпадает, но endpoint не вызывается. Альтернатива: runnable CI contract с route pairing и версией; риск пропуска orphan route. Negative: неверный FE URL при совпавшем DTO, BE route без потребителя; positive: пара и проверенный request/response. Сравнить обнаружение и traceability на одном pinned коде.

## SYNC-02: wire gate

Вход actor и evidence, выход sync report и evidence или UNVERIFIED; root nacl-tl-sync/SKILL.md:233–251,287–291,513; Codex skills-for-codex/nacl-tl-sync/SKILL.md:33–36,40–85. Для actor != SYSTEM typed mock недостаточен; допускаются перечисленные fixture, contract-test или live-smoke, SYSTEM может быть n/a, W4 допускает указанное signed exception. Fixture должна исполняться и проверять wire envelope без mocking; она не доказывает live provider. Contract-test и live-smoke имеют отдельные требования источника. Альтернатива SHA/env-bound runnable attestation; риск потери действительной wire формы и exception semantics. Negative: mock-only, missing/stale evidence, SYSTEM applicability, просроченное exception; positive: допустимое runnable evidence и выполненные прочие gates.

## SHIP-01: branch и evidence

Вход configuration, branch, staged paths и upstream review/verify; выход scoped commit/push/PR и отчёт. Источники nacl-tl-ship/SKILL.md:6–33,51–73,136–143 и skills-for-codex/nacl-tl-ship/SKILL.md:18–31,35–51. В graph.mode: remote Codex описывает graph Task как authority и освобождение claim после push; локальный режим иной; root содержит условные operator overrides UNVERIFIED/BLOCKED, дающие SHIP APPLIED — UNVERIFIED, не PASS; детальная таблица запрещает auto-deploy, тогда как краткое описание содержит противоречащую формулировку. Полная эквивалентность policy не доказана. Риск: base branch, чужие файлы, устаревший успех, claim. Альтернатива SHA-bound delivery attestation с scoped guard; риск потери branch/tracker/claim semantics. Negative: base branch, чужой staged файл, upstream UNVERIFIED при зелёном local тесте, чужой/expired claim; positive: подтверждённые условия и read-back. Внешние сообщения и операции не выполнялись.

## RELEASE-01: gates и маршрутизация

Вход graph baseline, QA/sync/SA evidence, golden path, PR/CI и drift; выход release verdict и разрешённые последующие действия. Источники nacl-tl-release/SKILL.md:143–174 и skills-for-codex/nacl-tl-release/SKILL.md:19–47,60–70. Для семи названных blocking gates root описывает отказ headline UNVERIFIED, Codex закрытый Status BLOCKED с workflow detail; иные исходы имеют отдельные состояния. Runtime не проверен. Описанные graph counts и histograms сами не являются semantic fingerprint. Альтернатива semantic fingerprint и typed ledger; риск потери отдельных gate/repair условий. Negative: одинаковые counts при изменённых свойствах, health 200 без golden path, upstream unverified, пропуск CI без prototype и действующего signed exception с точным именем skipped-ci, L8.1b CRITICAL; positive: все условия и evidence точного scope. Это кандидаты проверки, не утверждения что действующий gate ловит каждый случай.

## RELEASE-02: exceptions и audit

Источник skills-for-codex/nacl-tl-release/SKILL.md:32–43,107–144,158–180 описывает signed exception с gate/scope/expiry или отдельную emergency процедуру с обязательными env vars и audit, terminal максимум PARTIALLY_VERIFIED; inline prompt не заменяет strict gate. Потребители заявлены как release notes/status и conductor-state. Альтернатива — typed signed ledger с теми же ограничениями. Negative: истёкшее, изменённое, blanket или не покрывающее gate exception; positive: адресное действующее исключение и отражение в требуемых артефактах. Термин signed в skill не доказывает криптографическую подпись или runtime enforcement.
