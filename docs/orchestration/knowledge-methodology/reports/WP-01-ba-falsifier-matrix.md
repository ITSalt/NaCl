# WP-01: BA-01–09 и SA-01 — alternatives и falsifiers

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Сценарии — предложения, не выполненные tests; source outcome — заявленный контракт, не runtime proof. Все группы DEFER, фактическая цена, частота, причинность и installed parity UNKNOWN.

| ID | Negative input / заявленный или предлагаемый исход | Потеря гарантии и условие пересмотра DEFER |
|---|---|---|
| BA-01 | Ответы подтверждены, graph write не разрешён или read-back недоступен; Codex nacl-ba-context/SKILL.md:20–32,107–112 не выдаёт неподтверждённую запись за persisted | Typed context может потерять approval и graph trace; проверить actor/partial write и process consumer |
| BA-02 | Нет исходного BP или step без/с двумя performers; Codex nacl-ba-workflow/SKILL.md:19–30,47–59 требует исходный BP и одного performer | Таблица может потерять traversal и bindings; сравнить длинные/ветвящиеся процессы и BA→SA |
| BA-03 | Одна BA роль сопоставляется двум SA ролям, либо меняется lifecycle при том же ID; Codex entities/roles и root nacl-sa-roles/SKILL.md:31–37 | Общий каталог рискует схлопнуть N:M и provenance; проверить confirmed mappings и semantic drift |
| BA-04 | Existing term/alias и неподтверждённый full rebuild; Codex nacl-ba-glossary/SKILL.md:20–30,41–52 требует warning/confirmation/read-back | Incremental catalog может потерять aliases или graph reachability; проверить destructive/partial recovery и SA finalize |
| BA-05 | Правило меняет смысл при прежнем ID/SA edge; Codex rules :19–28,46–60 и root handoff :497–517 подтверждают edits/сохранение связей, но не auto invalidation | Typed table должна показывать semantic delta и сохранять provenance; проверить актуальность downstream и recovery |
| BA-06 | Нечитаемый документ, shape без customData или unavailable graph; Codex import-doc :20–30,51–62 и analyze :19–29,33–45 требуют различать BLOCKED/partial | Typed extraction может потерять provenance/визуальные ветви; сравнить форматы и дальнейший sync, не требовать недоступную source-page как факт |
| BA-07 | Crash после graph write до board marker или частичная ошибка; Codex sync :19–29,53–63 требует read-back, root :897–902 допускает partial sidecar ok | Delta ledger может потерять per-element outcome и двуххранилищную идентичность; проверить изолированный replay без дублей |
| BA-08 | BA есть, SA пуст; два edges от одного BA source и ни одного от другого; changed meaning при прежнем ID | Typed spec должна не принимать vacuous coverage/semantic drift за PASS; проверить independent distinct oracle и confirmed edge recovery |
| BA-09 | Specialist BLOCKED/incomplete либо недоступный package BA domain resource; overlay nacl-ba-full :12–19 задаёт capability gap | Risk-based orchestration может обойти human gate или принять план за persisted state; проверить phase/recovery и client-specific scope |
| SA-01 | Provider известен, но graph relationship capability unavailable; overlay nacl-sa-architect :23–34,249–256 задаёт BLOCKED после confirmed artifact. Envelope mismatch — дополнительный proposed negative | Provider table может потерять BA provenance, link/capability и различие fixture/live; проверить architect→planner/sync и trusted artifact |

Сокращённые Codex пути относятся к skills-for-codex/..., root — к корню NaCl, overlay — к codex-plugin-src/workflow-overlays/...; полные source/consumer цепочки — WP-01-ba-consumer-trace.md и WP-01-sa-consumer-trace.md. Условия равнозначности и ожидаемые outcomes альтернатив остаются гипотезами до проверки.
