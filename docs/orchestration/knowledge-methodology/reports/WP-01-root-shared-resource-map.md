# WP-01: root/shared resources → full package

Read-only сравнение Git blobs pinned NaCl `20fe4c6` с `plugins/nacl/resources/` по manifest и правилам `scripts/build-codex-plugin.mjs:138–146,332–335`. В этой сверке builder, tests и graph не запускались; позднейший full-package --check описан в [матрице](WP-01-acceptance-matrix.md); секреты и содержимое конфигурации не выводились.

| Источник | Результат |
|---|---|
| 61 root package, tracked regular files после test-resource filter | 196 файлов: 182 совпадают по Git blob, 14 отличаются; все 14 точно совпали с результатом объявленного manifest transform, вычисленного независимым исследователем в памяти. Пропущенных целей и необъявленных отличий нет |
| Три shared trees (`graph-infra/queries`, `schema`, `vps`) | 16/16 идентичны по Git blob |
| Shared files | 18/18 идентичны, включая одно объявленное преобразование без изменения содержимого |

Пересечений target paths между тремя группами не найдено; отдельная сверка с 114 tracked paths `codex-plugin-src/package` также не нашла совпадений. Это не проверка symlinks/untracked, пересечений с workflow group, лишних package targets, свежей сборки, Skills-only closure или runtime. Преобразования проверялись отдельно в памяти, без выполнения main builder.
