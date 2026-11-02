# WP-13 предварительно: QA screenshots и сохранность evidence

NaCl 20fe4c6; source-only, dependency WP-01 открыта. QA/browser не запускались, цена/frequency UNKNOWN, DEFER.

`nacl-tl-qa/SKILL.md:216–225,238–257,364–385` описывает выбор FE/BE URL и screenshot каждого шага; отсутствующий/пустой PNG помечает step FAIL. `nacl-tl-core/templates/qa-report-template.md:25–35,60–70,177–189,238–247` записывает время, окружение/browser/URLs, expected/actual и links, но в показанных разделах не требует commit SHA, версию браузера, fixture или image hash. Иные логи вне scope не исключены.

QA :433–435,477–482,493–518 создаёт HTML в `.tl/tasks/UC###/qa-report.html` с `screenshots/{filename}`, а копирует HTML/PNG в timestamped `REPORT_DIR/screenshots/`. При успешном copy относительная ссылка соответствует скопированному HTML; исходный HTML ищет `.tl/tasks/UC###/screenshots/`, но копирования туда в проверенном SKILL не найдено. Другой producer и фактическое отображение не проверены.

:259–263,735–741 очищает общий каталог screenshots UC при повторном прогоне и обновляет старый report. Это может удалить источник старого evidence, если предыдущей копии нет; успешно сохранённый timestamped REPORT_DIR является отдельной копией, поэтому потеря не неизбежна. :364–385 описывает missing PNG как step FAIL, :662–668,679–686 отдельно обсуждает UNVERIFIED и FAIL criterion→REGRESSION; преобразование этих уровней для конкретного случая не доказано.

Альтернатива — per-run immutable evidence bundle с revision/environment и read-back ссылок. Риски: чувствительные данные, retention/доступ и цена, hash не доказывает наблюдение. Proposed controls: оригинальный и скопированный HTML, отсутствие prior archive перед rerun, empty PNG, ошибка copy; positive — полный timestamped archive с проверенными links. Ничего не запускалось.
