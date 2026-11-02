# WP-01: legacy workflow non-SKILL resources → full package

Для закреплённого NaCl `20fe4c6` выполнена read-only сверка Git blobs всех отслеживаемых non-SKILL файлов в `skills-for-codex/nacl-*/`, входящих в копирование после test-resource filter. Правила: `scripts/build-codex-plugin.mjs:138–146,301–317,349–363`, `scripts/codex-plugin-manifest.json:141`.

Из 9 исходных файлов все 9 имеют соответствующую цель в `plugins/nacl/resources/workflows/`: 8 совпадают побайтно, девятый (`nacl-tl-core/templates/config-yaml-template.yaml`) точно соответствует предусмотренному manifest transform `package-doc-secret-placeholder`. Отсутствующих файлов и необъяснённых различий в этой выборке нет. Независимый исследователь повторил сверку. Значения конфигурации в отчёт не включены.

Это проверка Git blobs, а не запуск сборки. Root package/shared trees, Skills-only transforms, установленная версия и runtime сюда не входят. NaCl `git status --short` при независимой проверке был пуст; ignored files им не охватываются.
