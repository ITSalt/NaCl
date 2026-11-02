# WP-13 предварительно: повторное использование QA scenario

Pinned NaCl 20fe4c6; dependency WP-01 открыта, source-only, цена/frequency и runtime UNKNOWN, DEFER.

Root `nacl-tl-plan/SKILL.md:797–802,961–966` описывает acceptance/test-spec из graph requirements и slice IDs. `nacl-tl-qa/SKILL.md:270–281,299–306` читает актуальный acceptance и при наличии `.tl/scenarios/verify-UC###.md` использует существующий scenario; в показанной ветке нет сравнения его hash/revision с acceptance. Другие freshness checks вне неё не исключены.

Важная защита: root QA :354–358 требует каждый текущий criterion отобразить на stage/status, unmapped UI criterion → UNVERIFIED, provider/runtime-dependent нельзя просто исключать; :429–431,670–674 описывает ожидаемое/фактическое evidence, UI criteria и screenshots. Поэтому отсутствующее новое UI требование не должно дать VERIFIED при корректном выполнении этого требования; реальный false PASS не установлен. Если смысл AC изменился при прежнем ID, формально существующая строка mapping сама по себе не доказывает эквивалентность assertion, revision и environment — это гипотеза.

Root :358 допускает N/A лишь без browser visibility и provider/runtime dependency, а :711–713 более общо помечает non-browser-verifiable операции N/A: это текстовое противоречие для non-browser criteria с runtime/provider dependency, runtime трактовка UNKNOWN. При zero UI-testable Step 0 :289–295 задаёт HALTED UNVERIFIED, а таблица :667 — BLOCKED/NO_INFRA; приоритет этих текстов не установлен. Codex `skills-for-codex/nacl-tl-qa/SKILL.md:132–151` описывает отдельный AC→stage/status и non-PASS; root scenario reuse не переносится на него автоматически.

Альтернатива — привязать scenario к revision/hash acceptance и видимому expected/actual для каждого критерия. Риски: hash не доказывает смысл или актуальную среду, formatting даёт лишний review; сохранять human judgment и non-PASS. Proposed controls: изменение смысла AC с тем же ID при старом scenario; новый UI AC; positive — текущий AC, outcome и revision сопоставлены. Не выполнялись.
