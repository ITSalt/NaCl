# WP-01: новые находки в существующих кандидатах

Source-only NaCl 20fe4c6, обе находки наследуют DEFER из [TL/platform registry](WP-01-mechanism-registry-tl-platform.md). Ни alternatives, ни controls не реализованы и не запускались.

| Поле | Docmost 07.5 | Legacy symlink lock 10.1 / пересечение 08.5b |
|---|---|---|
| Задача | Scan/manifest diff и публикация страниц с summary; [trace](WP-01-docmost-sync-trace.md) | PlanToken, quarantine, receipt и readback при удалении legacy links; [trace](WP-01-guides-setup-trace.md) |
| Output / потребитель | CLI summary/exit — output; конкретный upstream reader и invocation UNKNOWN | Оператор result/status/removed/preserved; автоматический discovery/repair reader UNKNOWN, receiptPath не гарантирован при partial |
| Цена | UNKNOWN | UNKNOWN |
| Предотвращаемый дефект и наблюдение | По замыслу актуальность и полнота публикации; условный source-path success вместе с per-file error, не наблюдённый incident | По замыслу взаимное исключение; условный EEXIST/finally interleaving может удалить чужой lock, не наблюдённая гонка |
| Альтернатива | Per-page ledger, явный PARTIAL и remote content/identity readback | Owner-bound lock с unlock только владельцем и recoverable journal/receipt |
| Риск альтернативы и условия | Сохранить retry/idempotency, warning-only delete и scope; проверить mixed outcomes, unknown create и manifest failure | Сохранить plan token/refusal, ownership, partial results и recovery; проверить EEXIST, interleaving, ошибки после rename и корректные последовательные runs |

Эти соответствия тематические: local filesystem lock не является graph lease/Task claim, а частичный Docmost apply не тождественен stale graph. Реальные readers, частота, restore и external outcomes UNKNOWN.
