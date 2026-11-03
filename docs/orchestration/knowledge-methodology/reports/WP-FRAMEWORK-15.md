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

**Версии и fallback.** По материалам от 2 ноября: Codex CLI 0.166.0 и Claude Code 2.1.316, актуальность runtime и конфигурации не перепроверялась. У subagents остаются scope, shared-resource coordination и независимый oracle; fallback — последовательная работа с reconcile. Desktop worktrees изолируют checkout, но не graph/services. Для resume подтверждать completion и читать durable state; при неопределённом side effect не повторять вслепую. Checkpoint не является полным backup. Denied/missing tool даёт UNKNOWN/BLOCKED. Hooks и CI не заменяют проверку exact SHA и независимую приёмку.

**Предлагаемые проверки, не выполнены.** (1) Два synthetic writer и stale claim: подтверждать только одного owner. (2) Synthetic session с прерыванием: ACK без completion не считать завершением. (3) Fake tool и две identity: denied не создаёт side effect и не даёт PASS. (4) Mock CI: failure/skipped/старый SHA не дают приёмку. (5) Независимая матрица требований: выявлять тест, пропустивший один AC. Для каждого потребуются точные команды, versions, fixtures и независимый oracle; готовых воспроизводимых probes пока нет. Эксперименты и внешние ресурсы в этом раунде не запускались.

Первый [независимый review](WP-15-independent-review.md) отметил недостающие воспроизводимые probes и полное покрытие.

Полностью подтверждённых замен нет; это отсутствие evidence, не доказательство невозможности. Все кандидаты DEFER до отрицательных controls и client/version-specific verification. Первичные ссылки датированы в сохранённом материале, но reproducible native probes лишь предложены; фактическая стоимость и ускорение UNKNOWN. Независимый review и проверка checkout нужны до приёмки.
