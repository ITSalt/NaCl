# WP-12 предварительно: BA states → SA enum → TL artifacts

NaCl 20fe4c6, source-only; WP-01 dependency не закрыта. Источники не доказывают runtime; цены и частота UNKNOWN, DEFER.

`nacl-sa-domain/SKILL.md:336–340,782–784` предписывает преобразовать BA state в uppercase English enum code (`Новый`→`NEW`), тогда как auto-create :376–380 пишет в value и label `$stateName`, а :394–398 показывает русские raw values. Это текстовое расхождение процедур, не наблюдённая порча. Guard :358–367 требует Enum attribute и отсутствия **любого** HAS_ENUM у той же DomainEntity: другая существующая Enumeration этой entity может подавить auto-create даже если не соответствует нужному attribute.

Root `nacl-tl-plan/SKILL.md:719–729` отдельно выбирает enums по UC→form→field→MAPS_TO→attribute←entity→HAS_ENUM→HAS_VALUE; :986–991 описывает output в API types, FE options и BE validation. Общий named context query сам EnumValue не возвращает, но отдельный query существует. Backend-only UC без формы, иные маршруты и Enumeration без HAS_VALUE не покрываются показанной цепью; дополнительный context и фактический output UNKNOWN.

Legacy Codex domain `skills-for-codex/nacl-sa-domain/SKILL.md:37–55` описывает подтверждённые values/readback, но приведённые строки не устанавливают root English-vs-raw правило. Клиентские пути не приравниваются.

Альтернатива: versioned enum table с wire code, локальным label и источником state с генерацией API/FE/BE cases. Риски: утратить provenance entity/attribute, переходы, обработку unknown values и directed replan. Proposed controls: `Новый`/`NEW`, два enum attributes одной entity, backend-only UC, одинаковые labels у разных codes; positive — подтверждённые code/label у всех потребителей. HTTP outcomes не выдумываются; graph/tests/A-B не запускались.
