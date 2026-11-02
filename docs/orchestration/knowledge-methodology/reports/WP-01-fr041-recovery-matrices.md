# WP-01: FR-041 и recovery — источник и границы сценариев

Только статическое чтение истории. Оба кандидата и критерии остаются draft; graph baseline, независимые fixture/oracle и воспроизводимость не подтверждены. Тесты не выполнялись.

## FR-041: public sharing

Baseline 27f81239d1a83104ff8d37c4cc10fb1f8a56548c. FR metadata называет spec-complete, тогда как W2-T1/W3-T1 task files в этом дереве имеют pending; это текстовые статусы, не проверка текущей реализации. .tl/tasks/FR-041/api-contract.md:3–6 обозначает часть endpoints как provisional/finalized owning task: учитывать конкретную версию.

| Требование source | Открыто для одинакового brief и fixture |
|---|---|
| Anonymous доступ по share token для двух типов результата, без auth redirect (:14–24,107–118,134–144) | Типы и публичная поверхность, отдельный anonymous context и корректный payload |
| publicAccess и revokedAt, готовый media (:112–118) | Private/revoked/unknown/not-ready/ready и одинаковое тело/формат 404 на оговорённой wire-границе; not-ready — искусственная или race fixture, поскольку ссылка создаётся для ready. Timing/headers дополнительно не предполагать |
| Rate limit 429 и media unavailable 503 с retry (:118–132,246–250) | Для 503 сначала подтвердить валидную открытую ссылку и временный сбой media; отдельная контролируемая 429 fixture. Неизвестный порог не выдумывать |
| Share после предупреждения, owner-only и повторный тот же token (:59–66,223–235) | Cancel до записи, confirm, повтор, чужой owner без side effects |
| Отдельные consent на video/review независимо от share (:68–82,223–235) | Матрица share×consent, подтверждение и отмена; не требовать approval для обычной share-ссылки без отдельного основания |
| Раздельная moderation и approved/consented/not-revoked showcase (:148–157,172–175) | Pending/approved/rejected каждого типа, consent/revoke, active/hidden tag |
| Revoke закрывает ссылку и снимает с витрины (:94–97) | Два владельца, admin и anonymous; observable срок и сохранность чужих данных |
| Privacy и owner-only mutation (:14–24,64–66) | Проверка ролей и token вместо внутренних IDs, без реальных персональных данных |

Полный FR также включает tags/autocomplete, кабинетный поиск и admin; узкий public-resolve slice не доказывает выполнение полного FR. Объём и согласованные исключения должны быть одинаковы в обеих arm.

## Recovery: синтетический случай stale и прерывания

Baseline 3efbf818d219bf1b0eb21e557d417ffe7e93eb83 содержит локальный .tl/status.json о другом fix; он не подтверждает graph state. Документ EXC-stale-downstream-dec044-20260608.yaml отсутствует в этом commit и впервые встречается в 1c9ddcdaf6c8b99c3b3c83fd068bfd4bcab5263b. Поздний документ :1–35 сообщает о трёх чужих stale tasks и истёкшем 2026-06-15 staging исключении; это утверждение автора, не текущее graph read или наблюдавшийся нами crash. Файл не содержит ряда полей текущей W4 schema и не доказывает валидного signed exception; он не является действующим разрешением. Для synthetic positive нужен полный валидный scoped fixture.

nacl-tl-conductor/SKILL.md:807–824 описывает P-S6 по stale в UC closure, scope/expiry/gates исключения и HALT при fail; spec_drift обрабатывается отдельно. Он не доказывает обнаружение произвольного unrelated stale. Предлагаемая синтетическая fixture: own FR-X и unrelated DEC-X tasks, typed properties, связи и соседняя граница, run ID, версии schema, seed/hash и отдельные действующее/истёкшее synthetic exceptions. Историческое описание отделить от созданных фактов; timestamp и ожидаемые допуски зафиксировать.

Предлагаемый oracle: собственные изменения только с подтверждённым evidence; unrelated stale/properties/edges сохраняются; unresolved stale без действительного scoped exception не превращается в PASS; interrupted и uninterrupted при одинаковом исходном состоянии дают эквивалентный по заранее заданным правилам итог без дублирования. Negative: crash до commit и после graph write до receipt, concurrent соседний writer, неверный/истёкший gate exception, потерянный origin, различие graph/local status, неполная fixture, тот же ID с другим смыслом. Это план проверки, а не наблюдение успешного recovery или исторической точки прерывания.
