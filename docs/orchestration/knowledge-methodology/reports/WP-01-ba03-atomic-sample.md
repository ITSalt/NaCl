# WP-01: BA-03 — выборка атомарных обязанностей

Legacy Codex sources NaCl 20fe4c6; root SA consumer обозначен отдельно. Это выборка, не полное покрытие. Source contract не подтверждает реальное исполнение; proposed случаи не запускались; частота/цена/recovery UNKNOWN, DEFER.

| Обязанность и source | Consumer и proposed falsifier |
|---|---|
| Entity input/authority: `skills-for-codex/nacl-ba-entities/SKILL.md:20–31` читает существующий контекст, требует confirmation/read-back; нет tools/source → BLOCKED | Отказ write или read-back не выдавать за persisted VERIFIED; positive — подтверждённые операции и read-back |
| Collect/stereotypes: :33–48,52–55,100–105 читает usage, согласует типы, запрещает придумывать свойства и переиспользовать retired ID | Одно имя при разных смыслах, missing usage; алгоритм dedup и статус отдельного пробела UNKNOWN |
| Attributes/relations: :52–58,77–85 — business types, подтверждение cardinality, stable ID и связи | `nacl-sa-domain/SKILL.md:31–39` импортирует кандидаты; системный PK в BA либо изменённая cardinality без согласования. Автоинвалидация SA не доказана |
| Lifecycle/CRUD: :54–64,77–83 — confirmed states/transitions и матрица по usage | Проверить неверное направление transition и отсутствующее usage; алгоритм полной validation и непосредственное чтение каждого transition SA не установлены |
| MODIFY impact: :71–75 — чтение usages/rules/glossary/traceability, confirmation/read-back | Смена смысла при стабильном ID и SA edge; предлагается отдельно проверить downstream. Auto-stale и rollback между batches не доказаны |
| Roles/matrix: `skills-for-codex/nacl-ba-roles/SKILL.md:19–29,38–53` читает процессы/шаги/роли и связи, требует confirmation/read-back; нет tools/process → BLOCKED | `nacl-sa-roles/SKILL.md:31–37` импортирует кандидаты и N:M mapping. Пропущенная роль или отказ read-back; severity отдельного пропуска UNKNOWN |
| Role semantics: roles :44–62,75–88 различает бизнес- и системную роль, запрещает автоматизированной системе владение BP, To-Be требует user evidence | System как BP owner; одна BusinessRole→две SA roles; неподтверждённое To-Be. Передача каждой permission не установлена |
| Non-PASS: entities :114–122 и roles :90–97 различают BLOCKED/PARTIALLY_VERIFIED/UNVERIFIED/FAILED | Частичную запись или отказ не выдавать за полный каталог; конкретные статусы определяются обстоятельствами source |

Package full overlay `codex-plugin-src/workflow-overlays/nacl-ba-full/SKILL.md:12–19` имеет собственные ограничения resources; переносить их на прямые leaf и другие клиенты без route evidence нельзя.
