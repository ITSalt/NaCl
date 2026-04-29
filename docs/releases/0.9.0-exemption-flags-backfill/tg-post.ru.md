**NaCl 0.9.0: Backfill exemption-флагов для валидатора**

Новый orchestrator-скилл — `nacl-sa-flags` — даёт единую точку входа для записи validator-only метаданных: `has_ui` на `:UseCase`, `system_only` на `:SystemRole`, `shared` на `:DomainEntity`, `internal` на `:DomainAttribute`, `field_category` на `:FormField`. Эти свойства L4–L7 / XL8 ожидали и раньше, но до 0.9.0 канонического пути их проставить на уже наполненный граф в методологии не было.

Команды: `audit` (только чтение, отчёт по NULL-свойствам), `backfill-all` (идемпотентно, консервативные дефолты), `backfill-all --detect-internal` (regex-детект surrogate keys / таймстампов / секретов), per-node сеттеры, `set-batch <yaml>` для ручных оверрайдов.

Мигрированные проекты больше не получают «грязный первый validate»: `nacl-migrate-sa` Phase 7b автоматически (с подтверждением) вызывает `nacl-sa-flags backfill-all --detect-internal`, и проект проходит `nacl-sa-validate` чисто с первого раза вместо 50–150 NULL-property findings.

Сопутствующее: `nacl-sa-uc`, `nacl-sa-roles`, `nacl-sa-domain` теперь принимают exemption-флаги как опциональные параметры MERGE при создании узла. Если флаг проставлен сразу — это явный design intent; если забыт — потом подберёт `nacl-sa-flags`.

Полный апгрейд-гайд и справочник по командам: `docs/releases/0.9.0-exemption-flags-backfill/release-notes.md`
