# WP-17 предварительно: symlink preservation и lock ownership

NaCl 20fe4c6; source-only, dependency WP-01 открыта; не выполнялись тесты и не готовился A/B. Стоимость/frequency и runtime UNKNOWN, DEFER.

`tests/codex-plugin/scripts/nacl-legacy-symlinks.test.mjs:378–416` описывает подмену запланированной ссылки на файл/каталог перед rename и проверку сохранения объекта и PARTIALLY_VERIFIED. `codex-plugin-src/package/runtime/workflow-cli/legacy-symlinks.mjs:572–599` проверяет тип/identity после rename до unlink; эта защита покрывает изменение после plan. Success test :179–225 описывает target hashes/sentinels и retry, но не все ошибки filesystem. Наличие теста не означает, что он выполнялся в этом исследовании.

Тест подмены и success retry не доказывают owner-safe cleanup lock: тот же модуль :557–561,653–655 допускает условное удаление чужого lock после EEXIST при определённых prerequisites. Потеря или параллельные writes не наблюдались. Альтернатива должна сохранить post-rename validation, non-destructive preservation, confirmation, lock ownership и partial recovery; один typed manifest или CI PASS этого не доказывает.

Proposed controls: объект меняется после plan; два competing apply и EEXIST; прерывание после rename; success с полным read-back и retry. Для практического запуска потребовался бы disposable sandbox; здесь controls не выполнялись.
