# WP-16: ограниченный probe чтения скрытых файлов

2026-11-02. Синтетический временный marker и два временных alias, никаких проектных секретов или user files. Проверка `/usr/bin/sandbox-exec` с `(allow default)` и `(deny file-read* (subpath <private>))`; это частичный тест политики, не запуск Codex/Claude агента и не доказательство blind isolation.

- Первый запуск использовал неканонический путь `/var/...` и все три чтения прошли: этот профиль не применился к фактическому `/private/var/...` объекту. Следовательно, отображаемый путь нельзя использовать без canonicalization.
- С canonical `Path.resolve()` прямой marker и symlink на него получили `PermissionError errno 1`, но **заранее созданный hardlink вне запрещённой директории читался**. Path-only deny не защищает от уже существующих альтернативных имён/inode aliases.
- В отдельном запуске sandboxed child пытался создать новый hardlink из запрещённого пути и получил `PermissionError errno 1`; это не отменяет риск ранее существующего hardlink или другой копии содержимого.

Временные синтетические данные удалены через Python TemporaryDirectory. Этот пробник не контролировал доступ к копиям post-change Git history, другим локальным хранилищам, App Server/инструментам или сетевым вызовам, не доказывал наследование ограничений сессией исполнителя. Перед blind pilot нужны полный allowlist доступного actor scope, учёт canonical paths/aliases/hardlinks/копий, технический negative test из **реального runtime** каждой arm и подтверждённый скрытый evaluator. При отсутствии доказательства результат остаётся non-blind/UNRESOLVED; менять права проекта или ослаблять sandbox ради теста нельзя.
