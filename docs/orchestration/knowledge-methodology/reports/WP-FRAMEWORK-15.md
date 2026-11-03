# WP-15 — статическая сдача Harness

WP-01 DONE по D-5. Дата просмотра источников в накопленных материалах: 2 ноября 2026; local `codex-cli 0.166.0`, Claude Code `2.1.316` наблюдались ранее, в этом раунде не перепроверялись. Источники: [Harness preliminary](WP-15-preliminary.md), [независимость oracle](WP-15-oracle-independence-trace.md). Native capability, внешняя интеграция и неподтверждённая гарантия различаются.

| Обязанность | Оценка / источники | Остаточная ответственность и контроль |
|---|---|---|
| Subagents | Частично: [Codex](https://learn.chatgpt.com/docs/agent-configuration/subagents), [Claude teams](https://code.claude.com/docs/en/agent-teams) | Scoped authority и независимая приёмка; отдельный read-only sandbox не следует из названия роли. |
| Checkout | Частично: [Codex worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees) | Graph/service/port locks и shared paths остаются; проверить concurrent writers. |
| Resume/compaction | Частично: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Claude checkpointing](https://code.claude.com/docs/en/checkpointing) | ACK не завершение compaction; нужны read-back и reconciliation внешних side effects. |
| Permissions/tools | Эквивалентность scoped authorization не подтверждена: [Codex approvals](https://learn.chatgpt.com/docs/agent-approvals-security), [Claude MCP](https://code.claude.com/docs/en/mcp) | Проверить identity, scope, denied/missing tool и fail-closed. |
| Hooks/Git/CI | Частично: [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Claude hooks](https://code.claude.com/docs/en/hooks), [GitHub Action](https://learn.chatgpt.com/docs/github-action) | Required checks/exact SHA и semantic acceptance — отдельные обязанности, не автоматически native. |
| Независимый oracle, требования, решения владельца | Обязанность сохранить; конкретная реализация NaCl не признана единственной. | Проверить пропущенный AC и независимое evidence; capability сама не доказывает содержательное принятие. |
| Graph identity/lease/fence/idempotency | Эквивалентность Harness не подтверждена. | Проектный scope, актуальный fence, restart и recovery требуют отдельных проверок. |

Полностью подтверждённых замен нет; это отсутствие evidence, не доказательство невозможности. Все кандидаты DEFER до отрицательных controls и client/version-specific verification. Первичные ссылки датированы в сохранённом материале, но reproducible native probes лишь предложены; фактическая стоимость и ускорение UNKNOWN. Независимый review и проверка checkout нужны до приёмки.
