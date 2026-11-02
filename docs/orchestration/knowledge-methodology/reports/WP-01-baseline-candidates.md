# WP-01: манифест кандидатов baseline

2026-11-02. Это фиксирует идентичность текущих **кандидатов**, не замороженный пригодный корпус и не подтверждённый baseline графа. Все шесть коммитов проверены как предки локального Family Cinema HEAD `4f3ecb812e7014dc4875084b0c1d72fe717a453e`; дерево получено `git rev-parse <commit>^{tree}`. На момент создания манифеста окружения, acceptance harness и тесты не выполнялись. Позднее проверена часть FR-014 на временной копии; см. WP-16-fr014-env-check.md и WP-16-fr014-draft-test-check.md. Это не подтверждает воспроизводимость остальных случаев или graph baseline.

| Кейс | Коммит | Git tree | Готовность |
|---|---|---|---|
| FR-014 | `8d449ab652568d6f1cd69d9c2b9bdae829a6bb79` | `ba97fb7ee0b2ccbded3096f75e2d2a64ce4ba3e2` | candidate; NOT_VERIFIED |
| FR-029 | `a54778ce23cf0f1d09bb2a13c5bbfe1f5e3120c7` | `097da81e27623b3af1b1dd8d310abdb9f0930356` | candidate; NOT_VERIFIED |
| BUG-1 | `7a842ecad9e65e03c6aeb48fc7589bac75d4d655` | `0f15871a161b7712793362120e356eaa3df94981` | candidate; NOT_VERIFIED |
| FR-030 | `43bbf101090cf4439484cd02ce88fe3f285a90d6` | `aeb70c0e273a2daefe41f65101bc654d7990131c` | candidate; NOT_VERIFIED |
| FR-041 | `27f81239d1a83104ff8d37c4cc10fb1f8a56548c` | `953c94117888c8f946ddc21642bb0ea1d85d1df0` | candidate; NOT_VERIFIED |
| recovery | `3efbf818d219bf1b0eb21e557d417ffe7e93eb83` | `a95b254a17a11b271437219eeff604c3866e3f9c` | candidate; NOT_VERIFIED |

| Документ | SHA-256 при создании манифеста | Статус |
|---|---|---|
| `reports/WP-01-briefs-draft.md` | `de8e89b16a8603044ad94e77260e4c45831e383c67932db086d4e2baa1645038` | draft |
| `reports/WP-01-measurement-rubric-draft.md` | `9a08d473c7c402ea76fceed6f2b61d2247b82fea46df42f1c9fb752dcfa3be8f` | draft |
| `reports/WP-01-corpus-conflicts.md` | `d43187e5eea625cfc1dd6983943bf95cc9449df2cc0a77a249e62bcc5a40c50b` | draft |

После создания манифеста уточнена устаревшая фраза о непроведённых тестах в briefs: текущий SHA-256 briefs `9a2759545739d9a5bbc03fb3d99029dc40f25d30d440bb14bcd33d608f9f4eca`. Исторический hash в таблице выше сохранён; затем в brief добавлены исторический AC-11 и уточнение UTC: новый текущий SHA-256 `e498afcd30efc20d9c07e8d792b55db09b7855d053879c3d80d25659d12548b9`. Корпус по-прежнему не заморожен.

FR-030: новый brief выводится из post-baseline требований и должен быть одинаково предоставлен A/B; recovery основан на послесобытийном описании и синтетической фикстуре. FR-029 и BUG-1 имеют расхождения первоисточников; варианты нейтрального среза описаны отдельно. Перед заморозкой нужны проверенные независимые criteria, инструменты и зависимости для каждого snapshot, контроль доступа к post-change истории и hash закрытого harness.

Graph baseline: NOT_VERIFIED; фактический scope, writers, locks, export/restore и semantic fingerprint неизвестны. `graph.itsalt.ru` разрешился в `82.202.156.157`, TCP 443 connect timeout 4s; MCP initialize ранее timeout 12s. Это не доказывает причину или отказ сервера. Recovery и live A/B остаются заблокированы до подтверждённого воспроизводимого состояния и восстановления. См. `WP-01-graph-baseline-risks.md`.
