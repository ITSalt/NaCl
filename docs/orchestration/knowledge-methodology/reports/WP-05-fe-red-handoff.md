# WP-05 предварительно: FE baseline и RED-author handoff

Pinned NaCl 20fe4c6; зависимости WP открыты, source-only, цена/частота UNKNOWN, DEFER.

Root `nacl-tl-dev-fe/SKILL.md:187–209` сохраняет full runner baseline до новых тестов, но показанный вызов regression sub-agent не передаёт baseline path/set. `nacl-tl-regression-test/SKILL.md:164–176,203–240` не перечисляет baseline во inputs, запускает новые тесты изолированно и требует RED snippet и путь, но шаблон не требует полного сравнения failure set. При этом FE :232–238 требует от автора явную строку об отсутствии новых регрессий и при её отсутствии HALT UNVERIFIED. Это текстовое расхождение показанных producer/consumer contract; агент может получать baseline иным образом, фактическая блокировка не наблюдалась.

FE :274–282 после GREEN задаёт PASS при subset baseline и отсутствии новых failures, и BLOCKED при равенстве baseline/postfix и оставшихся unrelated failures. Условия могут пересекаться; при исчезнувшей старой и появившейся новой failure множества несравнимы, а strict superset само по себе такого случая не покрывает. Дополнительные шаги могут разрешать оба случая; общий runtime outcome UNKNOWN.

FE :206,211 передаёт API contract и описывает владение fixtures/MSW, тогда как regression author :41–45 ограничивает запись test files и описывает nearest package.json runner; FE :172–177 допускает другие конфигурации. Это граница текстов, не доказанный отказ для non-Node. Legacy Codex `skills-for-codex/nacl-tl-dev-fe/SKILL.md:43–73,96–110` описывает иной порядок написания RED и его evidence.

Альтернатива — структурированный RED report с baseline ID, expected new failures, отдельно новыми unrelated failures, причиной и test path; после GREEN — подтверждённый полный delta. Риски: цена дополнительного suite и потеря независимости при общих fixtures. Proposed controls: baseline {A}→postfix {B}; одинаковый unrelated baseline/postfix при GREEN новом тесте; isolated RED report без no-regression line; positive — подтверждённая baseline и разделённые expected RED. Тесты не запускались.
