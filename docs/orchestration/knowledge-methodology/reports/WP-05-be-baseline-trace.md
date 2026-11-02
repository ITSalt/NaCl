# WP-05 предварительно: BE baseline и классификация результатов

Pinned NaCl 20fe4c6, source-only, dependency WP-01 открыта. Runtime, частота и стоимость UNKNOWN, DEFER.

Root `nacl-tl-dev-be/SKILL.md:145–169,175–200` описывает runner и baseline до теста, независимый test-author и RED. :221–233 задаёт PASS при новом зелёном тесте, postfix subset baseline и отсутствии new failures; equality с unrelated baseline failures отдельно обозначает BLOCKED. Эти условия текстово пересекаются. Strict superset также не покрывает очевидно случай baseline {A,B} и postfix {B,C}, где исчез A и появился C. Приоритет и иные processing steps не установлены; ложный PASS не наблюдался.

BE :233–237 разрешает commit при PASS или BLOCKED с rationale; :264–274 требует explicit operator acceptance для ready_for_review при BLOCKED. Commit не равен verified/auto-ship. Root FE `nacl-tl-dev-fe/SKILL.md:276–282` содержит ту же таблицу, но FE :232–238 дополнительно требует определённую no-regression строку от test-author. Legacy Codex BE `skills-for-codex/nacl-tl-dev-be/SKILL.md:48–82` отдельно относит любой новый failure к FAILED; не приравнивать клиентов.

Альтернатива — typed baseline ledger с test identities, runner/SHA и явным `postfix − baseline`; сохранить старые failures и operator acceptance. Proposed controls: одинаковый unrelated baseline, одна старая ошибка исчезла и другая появилась, runner crash/zero collected, ожидаемый RED→GREEN. Тесты не запускались.
