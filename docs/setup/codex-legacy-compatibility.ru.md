[Главная](../../README.ru.md) > [Плагин Codex](install-codex-plugin.ru.md) > Legacy-совместимость

🇬🇧 [English version](codex-legacy-compatibility.md)

# Совместимость с legacy-ссылками скиллов Codex

Это приложение нужно только существующей установке Codex, которая использовала пользовательские ссылки на скиллы NaCl. Новым и обычным пользователям Codex Desktop нужен [путь установки плагина через UI](install-codex-plugin.ru.md).

<!-- doc-key: scope -->
## Scope и границы безопасности

Режим плагина и режим legacy skill links не должны сосуществовать. Installation doctor сообщает `mode=both` как `FAILED`, а все project и graph workflows останавливаются, пока не останется один режим.

Ограниченная миграция распознаёт фиксированный каталог из 60 legacy-ссылок `nacl-*`. Она никогда не удаляет targets ссылок, реальные файлы, реальные директории, неизвестные артефакты, данные проекта, состояние графа, профили агентов или состояние Keychain. Broken links, изменившиеся hashes, небезопасные корни и неизвестные `nacl-*` entries блокируют автоматический apply.

<!-- doc-key: detect -->
## Определение текущего режима

После установки или включения плагина полностью перезапустите Codex, создайте новую задачу и отправьте:

```text
Call nacl_installation_doctor exactly once with no arguments. Report status, mode, pluginVersion, and executionLocation. Stop if mode is not plugin-only.
```

- `plugin-only` с `VERIFIED` не требует legacy migration.
- `both` требует ограниченный план ниже; workflows запускать нельзя.
- `legacy-only` означает, что плагин не активен; используйте этот compatibility mode или намеренно переключитесь на плагин.
- `invalid-legacy-artifacts` требует ручной проверки только перечисленных entries.

<!-- doc-key: migrate-plan -->
## План миграции в plugin-only

Попросите Codex:

```text
Run nacl_legacy_symlinks_plan only. Show every recognized entry, its target, parity class, blockers, accepted and missing counts against the fixed 60-name catalog, planToken, and returned confirmation. Do not apply.
```

Проверьте каждый entry. Apply разрешён только когда план актуален, не содержит blocker и распознаёт только symlinks из фиксированного каталога. Реальный файл, директория, broken link, неизвестный артефакт, target mismatch или hash drift остаётся `BLOCKED`; не переименовывайте и не удаляйте его автоматически.

<!-- doc-key: migrate-apply -->
## Применение только возвращённого плана

Только если план имеет статус `VERIFIED` и готов к применению, разрешите Codex:

```text
Apply the latest verified legacy symlink removal plan once. Use the returned planToken value as plan_token and the returned confirmation value as confirmation; do not construct, shorten, substitute, or reuse either value. Show the receipt and read-back, then call nacl_installation_doctor again.
```

Ожидаемый итог — верифицированный receipt, а затем `VERIFIED/plugin-only` при свежем read-back doctor. Если apply имеет статус `PARTIALLY_VERIFIED`, точно сохраните возвращённые quarantine и receipt, остановите все workflows и получите recovery guidance. Никогда не повторяйте вслепую старый план.

<!-- doc-key: migration-rollback -->
## Откат и восстановление миграции

Apply помещает проверенные ссылки в quarantine до завершения удаления и возвращает recovery evidence. Rollback должен использовать именно этот receipt и состояние quarantine; безопасной общей команды восстановления нет. Если результат не верифицирован полностью, не переустанавливайте, не перемещайте, не удаляйте и не перезаписывайте ничего до проверки receipt maintainer.

Чтобы намеренно вернуться из здорового plugin-only режима в legacy, сначала удалите плагин NaCl с его карточки и полностью перезапустите Codex. Только затем используйте compatibility installer ниже. Запустите doctor в новой задаче и потребуйте `VERIFIED/legacy-only`. Никогда не переустанавливайте legacy-ссылки при активном плагине.

<!-- doc-key: legacy-install -->
## Установка legacy-ссылок только при необходимости

Эти команды предназначены только для совместимости. Они не входят в обычный путь плагина.

**macOS, Linux или WSL2:**

```sh
git clone https://github.com/ITSalt/NaCl.git "$HOME/NaCl"
sh "$HOME/NaCl/skills-for-codex/scripts/install-user-symlinks.sh"
```

Если доверенный checkout уже существует, обновите его перед запуском installer:

```sh
cd "$HOME/NaCl"
git pull --ff-only
sh skills-for-codex/scripts/install-user-symlinks.sh
```

**Windows PowerShell:**

```powershell
git clone https://github.com/ITSalt/NaCl.git "$HOME\NaCl"
& "$HOME\NaCl\skills-for-codex\scripts\install-user-symlinks.ps1"
```

Для directory links Windows может потребовать Developer Mode или повышенные права; где поддерживается, installer может использовать directory junctions.

<!-- doc-key: legacy-update -->
## Обновление или удаление legacy-ссылок

Обновите доверенный checkout и повторно запустите тот же legacy installer, чтобы добавить новые имена или восстановить отсутствующие распознанные ссылки. Проверьте, что каждый установленный `nacl-*` entry разрешается в директорию с читаемым `SKILL.md`, а имя frontmatter совпадает с entry.

Для удаления во время миграции плагина используйте только `nacl_legacy_symlinks_plan` и `nacl_legacy_symlinks_apply`. Не применяйте широкие команды удаления к `$HOME/.agents/skills`: там могут находиться другие пользовательские скиллы.

<!-- doc-key: persistence -->
## Сохранённые данные

Миграция меняет только проверенные пользовательские symlink entries. Их source targets остаются нетронутыми. Файлы проекта, registry и audit графа, Docker-тома и backups, элементы Keychain и опциональные профили `.codex/agents/` остаются нетронутыми. Удаление плагина также сохраняет эти assets.

<!-- doc-key: support -->
## Evidence для поддержки

Соберите `status` и `mode` doctor, полную сводку плана и blockers, accepted/missing/unknown counts, receipt плана и финальный read-back doctor. При частичном apply сохраните указанный quarantine location, но удалите персональные сегменты пути перед передачей.

Никогда не передавайте credentials, значения Keychain, содержимое проекта, содержимое targets ссылок или широкие listings домашней директории.
