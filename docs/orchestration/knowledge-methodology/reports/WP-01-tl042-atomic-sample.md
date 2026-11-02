# WP-01: TL 04.2 — выборка обязанностей planning

NaCl 20fe4c6, source-only. Root, legacy Codex и package overlay различаются; фактический route/read-back, частота и цена UNKNOWN. Все controls предлагаются и не исполнялись; DEFER.

| Обязанность и source | Consumer и proposed falsifier |
|---|---|
| Scope: `skills-for-codex/nacl-tl-plan/SKILL.md:19–22,29–33` читает UC/module/form/deps, показывает план и требует confirmation записи | FE `skills-for-codex/nacl-tl-dev-fe/SKILL.md:19–27`; отсутствующий UC или отказ confirmation не выдавать за verified write; точный status отдельных полей UNKNOWN |
| External contract closure: legacy :23–27,54–90 требует direct UC и module provider contracts, их файлы и заполненные секции; missing/stub → BLOCKED при отсутствии применимого signed W4 exception для каждой пары (UC, contract) | Missing module contract или Section 9=TBD для provider; positive — обе closure заполнены. Package overlay `codex-plugin-src/workflow-overlays/nacl-tl-plan/SKILL.md:52–59` при недоступном named closure read задаёт BLOCKED/TL_NAMED_QUERY_UNAVAILABLE |
| Wave order: `nacl-tl-plan/SKILL.md:458–466` описывает deterministic planner, waves/tasks/deps, cycle/undefined dependency → nonzero | Цикл двух UC или неизвестная dependency; positive DAG BE→FE. Сам planner не запускался |
| SA→developer: root plan :905–917,977–983 маппит UC/API в task и contract files | Изменение method/path/body в SA при старом FE task — proposed mismatch, а не установленный автоисход; positive — согласованность полей |
| Incremental drift: legacy :138–153 выбирает version increase при ненулевом baseline или stale stamp, сохраняет ID и терминальные status/phase/commit/evidence | Sticky modified без version drift, version bump и unrelated task; crash между graph/file не доказан атомарным |
| Null baseline/authority: root :277–290 описывает one-time upgrade, когда Tasks существуют и ни у одной нет planned_from_version; query заполняет только null в UC→GENERATES→Task без регенерации, legacy :153–157 оговаривает отдельную границу; `--overwrite` — отдельный режим root :59–60, удаляющий Task/Wave nodes и создающий их заново; rollback не доказан | Upgraded project с null baseline и in-progress; повтор не должен молча переобнулять. Исходная версия baseline и реальный recovery UNKNOWN |
