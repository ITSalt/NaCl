# WP-01: дополнительные условия трёх составных gap

Pinned NaCl 20fe4c6; source-only. Проверки ниже предлагаются, не исполнялись. Все кандидаты наследуют DEFER; клиентские маршруты, историческая частота и цена UNKNOWN.

## BA-02: workflow

- Root `nacl-ba-workflow/SKILL.md:180–185,350–355,521–524` при более 12 шагах предлагает decomposition и CALLS_SUB. Legacy `skills-for-codex/nacl-ba-workflow/SKILL.md:63–73` тоже описывает предложение decomposition, но CALLS_SUB не перечислен в указанной фазе. Контроль: 12 и 13 шагов, сохранение порядка и root связи; автоматический CLOSED status для превышения не установлен.
- Root :301–309,358–363,537–542 задаёт максимум три исходящие ветви decision, convergence либо End/Exception и confirmation. Контроль: три и четыре ветви с сохранением семантики; заданный алгоритм и исход для четырёх не установлены. Число 3 в указанном legacy SKILL не найдено, другие resources не исключены.
- Root :260–293,529–535 различает READS/PRODUCES и `requires creation` для отсутствующей сущности, допускает pure action без документов. Контроль: missing entity, обратное направление, существующие input/output и pure action. Legacy :49–65 и :103–112 задаёт собственные write/readback и non-PASS, не отдельный статус для каждого отсутствующего документа.

## 07.1: ship

- Base guard `nacl-tl-ship/SKILL.md:62–73,183–194,220–234` и `nacl-core/scripts/branch.sh:40–50` различают feature-branch и direct strategy; helper получает branch строкой, сам актуальный HEAD не доказывает. Контроль: configured non-main base, direct strategy, смена branch между guard и commit. Root :65–69 и :190–194 содержат текстовую неоднозначность переключения; legacy `skills-for-codex/nacl-tl-ship/SKILL.md:18–23,40–43,74–77` не доказывает механический вызов helper.
- Root ship :134–170 требует upstream status, tests/build и остановку при FAIL тестов/build; upstream six-status рассматривается отдельно и имеет указанные ниже overrides. Legacy :18–25,82–97 ограничивает проверки применимостью и назначает BLOCKED при missing tooling, FAILED при failed checks, NOT_RUN при intentional skip. Контроли: failed или отсутствующий runner, green на другом HEAD, upstream UNVERIFIED при green local; точная связка runner→HEAD UNKNOWN.
- Root :139–147 допускает explicit operator override UNVERIFIED/BLOCKED как `SHIP APPLIED — UNVERIFIED` с запретом auto-deploy; отдельные NO_INFRA/RUNNER_BROKEN/REGRESSION останавливаются. Headline :23–24 уже самой процедуры, это текстовый конфликт. Package overlay :46–55 описывает identity/fence/heartbeat и release/handoff; runtime auth не доказана.
- Root :391–416 и legacy :23–26,50–51,84–97 описывают tracker updates при соответствующих условиях. Контроли: отсутствующий tracker, отказ после успешного push, подтверждённая запись и read-back; rollback push и точный status tracker failure не доказаны.

## 07.3: release

- Root `nacl-tl-release/SKILL.md:171,199–211`, legacy и package :91–105: skipped PR/CI direct strategy допускаются при prototype и действующем адресном signed exception для каждого пропущенного gate. Контроли: standard project, нет exception, покрыт только один из двух gates, expired; positive выполняет эти prerequisites, но не доказывает остальные gates. Root HALTED — UNVERIFIED, Codex/overlay BLOCKED.
- Root :216–246 и Codex/overlay :107–145 задают 8 полей W4, scope/expiry и renewal через новый ID. Контроли: wrong project/gate, expired, wildcard и silent expiry edit. Название signed не доказывает криптографический verifier.
- Root :168–174 и legacy :66–70 различают stale unbuilt→replan и shipped spec_drift→review/fix при превышении бюджета срока/count; warning в пределах бюджета не блокирует. Package overlay :70 в этом SKILL не раскрывает L8.1b, отсутствие другой реализации не доказано. Контроли: неверная remediation и потерянное evidence. Codex emergency :156–180 — отдельный режим, максимум PARTIALLY_VERIFIED, не разрешение на production в этой программе.

Эти cases уточняют [gap crosswalk](WP-01-gap-candidate-crosswalk.md); они не заменяют live execution, полную клиентскую equivalence или измерения.
