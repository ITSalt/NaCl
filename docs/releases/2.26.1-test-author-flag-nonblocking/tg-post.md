NaCl 2.26.1 — test-author-flag-nonblocking

Флаг test-author-independence теперь однозначно non-blocking, а скилл ревью больше не противоречит сам себе на его счёт.

Живое ревью UC (плагин 2.26.0) захолтилось на трёхстороннем противоречии внутри nacl-tl-review: Step 6b объявлял MAJOR-флаг author-overlap неблокирующим («does NOT block approval… does not prevent REVIEW COMPLETE or APPROVED»), строка headline-таблицы Step 8b давала за тот же флаг `REVIEW APPLIED — UNVERIFIED` с запретом APPROVED, а worked example семнадцатью строками ниже правила P4 соединял этот UNVERIFIED-headline с APPROVED — нарушая P4 в лоб. Файл формулировал блокирующее правило и тут же демонстрировал неблокирующее поведение.

Почему победило non-blocking:

— Headline по собственной преамбуле 8b отражает ПОЛНОТУ верификации. Author-overlap не делает верификацию неполной — тесты бежали, прошли, RED→GREEN есть. Это сигнал независимости, а не пробел верификации.

— У блокирующего прочтения не было терминального пути: headline не читает ни один другой скилл (оркестраторы потребляют вердикт approved/rejected и шестистатусную строку dev-отчёта), так что флаг просто загонял бы задачу в retry-цикл — три перезапуска того же dev-агента и FAILED. Author-overlap — факт git-истории; перезапуск агента может его только усугубить, а предписанный remedy (ретроактивный регресс-тест отдельным скиллом) цикл никогда не вызывает.

— На одно-identity репозитории (все коммиты под одним git-пользователем — нормальный случай агентной разработки) overlap тривиально равен 100%: блокирующее прочтение отказывало бы в VERIFIED каждому UC каждого такого проекта, навсегда.

Что внутри:

— Строка флага удалена из headline-таблицы 8b. **P4 не тронут**: non-`REVIEW COMPLETE` headline всё так же запрещает APPROVED — лазейка «proceed but flag» остаётся закрытой. Поверхность флага — ревью-артефакт (MAJOR-блок + обязательная Recommend-строка) и заявленные гейты ship/deliver.

— 6b теперь явно описывает связь с headline, чтобы шаги нельзя было прочитать друг против друга.

— P4-нарушающий пример заменён корректной парой: настоящий UNVERIFIED-кейс (CHANGES REQUESTED) и зелёный-с-флагом (`REVIEW COMPLETE` + `APPROVED` + рекомендация ретроактивного теста).

— **Новый single-identity pre-check**: когда весь репозиторий делит одну author-identity, метрика overlap записывается как «uninformative (single-identity repo)» вместо MAJOR, а ревьюер проверяет структурный шов — dev-результат должен показывать, что регресс-тест написан отдельным test-author sub-agent'ом (настоящая гарантия независимости в NaCl, которую git-email не видит). Отсутствие seam-evidence на solo-репо — вот это MAJOR.

Совместимость: аддитивно/уточняюще, wire-формат не менялся. Ревью на solo-репо перестают шуметь бессмысленным вечным MAJOR и начинают проверять шов, который действительно важен.

Обновление:

| Канал | Как |
|---|---|
| Claude Code CLI (симлинки) | `git pull` в checkout NaCl |
| Claude Code Desktop (плагин) | Settings → Plugins → маркетплейс `nacl` → Sync → Update; или `claude plugin marketplace update nacl && claude plugin update nacl@nacl` + перезапуск |

https://github.com/ITSalt/NaCl/releases/tag/v2.26.1
