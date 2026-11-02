# WP-01: package-level сверка TL

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Исследователи сопоставили 26 root TL packages с WP-01-mechanism-registry-tl-platform.md и gap cards. Основные обязанности 25 отражены хотя бы группой, nacl-tl-diagnose явно не назван в реестре. Это не полное покрытие behaviors, consumers или runtime. Ссылки в таблице — nacl-tl-<имя>/SKILL.md, если не указан другой путь.

| Пакет | Источник и назначенная группа | Остаток |
|---|---|---|
| conductor | :5–26; 04.5 | terminal evidence и reconciliation по фазам/expiry |
| full | :5–16; 04.4 | per-phase status, resume/failure |
| intake | :5–18; 04.1 | insufficient/stale graph и recommendation vs call |
| next | :5–17; 04.3 | freshness и local fallback vs remote claim |
| plan | :5–11; 04.2 | downstream артефакты и повторный plan; external gate выделен отдельно |
| dev | :5–9,16–25; 05.1 | testable и non-testable infrastructure evidence |
| dev-be | :5–8,15–24; 05.2 | root auto-ship только по условиям, Codex parity не доказана |
| dev-fe | :5–9,16–26; 05.2 | FE evidence и отличие UI от wire |
| fix | :5–10; 05.3 | seam status и reopened/hotfix consumers |
| hotfix | :5–16,70–78; 05.6 | cleanup/restore и прерванный run, только заявленный контракт |
| reopened | :5–10,13–18; 05.5 | canonical status и non-PASS outcomes |
| qa | :13–15,73–85,358; 06.4 | агрегат и coverage; текстовая коллизия описана в TL cards |
| review | :12–30; 06.2 | stub gate, reopened и overlap rules |
| regression-test | :21–46,89–112; 06.1 | причина RED, независимость автора, downstream |
| verify | :13–35; 06.4 | code/E2E rationale, fallback и release consumers |
| verify-code | :14–34,48–52; 06.3 | findings, asserts и связь с verify |
| stubs | :13–32; 05.4 | review consumer и empty/shape-unvalidated |
| sync | :135,233–251,287–291,513; 08.4 | реальный enforcement и consumer chain, fixture не live |
| deliver | :12–27,41–45; 07.1 | per-UC и aggregate status; фазово развернуть связь с deploy |
| deploy | :12–30; 07.2 | потребители, SHA и halt при health failure |
| docs | :11–15,44; 07.4 | staged diff, spec и tracking |
| release | :143–174; 07.3 | исключения и runtime consumers; gap cards |
| ship | :13–32,51–73; 07.1 | root/Codex policy, remote claim и tracker read-back |
| status | skills-for-codex/nacl-tl-status/SKILL.md:15–40; 08.2 | remote graph запрещает local fallback, local режим отдельно |
| diagnose | skills-for-codex/nacl-tl-diagnose/SKILL.md:16–38 и root :12–16 | отдельная строка отсутствует: 08.2 называет nacl-diagnose, dimensions/подтверждение записи/downstream reconcile уточнить |
| reconcile | :13–31,45–49; 08.3 | non-PASS, recent fixes и возможное расхождение с утверждённой spec |

Группа означает назначение по одной обязанности, не принятие исследовательского WP и не гарантию полного механизма. Остатки — кандидаты исследования, а не утверждение об отсутствии поведения в skill.
