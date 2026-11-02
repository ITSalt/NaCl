# WP-10: отсутствующие Cypher references — source-level семантика

Установленный NaCl 0.2.2 ссылается на файлы, не найденные по имени в его package; точные пути и ограничения — [матрица](WP-10-installed-resource-matrix.md). Ниже анализ исходных шаблонов, не исполнение Cypher, graph, MCP, workflow или A/B. Source snapshot для новых правил — 20fe4c6; installed manifest указывает c291.

## Runtime contract

Installed `skills/nacl-sa/resources/workflows/nacl-sa-uc/SKILL.md:74–79,323–341,367–374` описывает пять условий обязательности и восемь измерений runtime contract, отдельно запрашивает подтверждение пользователя и ссылается на decision tree, write templates и read-back. Full-package `plugins/nacl/resources/nacl-sa-uc/references/runtime-contract.cypher:173–297,301–380` содержит эти **комментированные** templates; файл одинаков по Git blob в c291 и 20fe, но отсутствует по имени в установленном package.

Prose §7 описывает Q1–Q5; Q3 про async provider требует отдельного вопроса пользователю. Показанное выражение verdict вычисляет Q1/Q2/Q4/Q5 без Q3, а Q5 query фильтрует имя, хотя prose упоминает имя или description. Поэтому отрицательный verdict **самого шаблона** не исключает Q3 или dependency только в description; иная обработка не исключена. Это source-level предел, не доказанный false PASS.

## Reachability

Installed SA UI `skills/nacl-sa/resources/workflows/nacl-sa-ui/SKILL.md:63–67,173–180` требует `ui_reachability_blockers`; installed TL review :80–84,106–110 называет `nav_actions_consumer_check` и `$affected_uc_ids`. В full-package `plugins/nacl/resources/nacl-sa-ui/references/reachability.cypher` обеих версий c291 и 20fe два последних буквальных имени не найдены; отдельный adapter/запрос вне файла возможен. Формат файла — reference templates, не доказательство выполненного validator.

В snapshot 20fe query :161–176 исключает UC при наличии любого `HAS_SCREEN` с `formless=true` **до** optional match реальной Form. Условная аналитическая fixture: non-SYSTEM UC имеет один formless Screen и отдельную USES_FORM без inbound reachable action; этот конкретный query исключит UC до проверки Form, хотя комментарий :164–169 и SA UI SKILL :203–206 описывают реальную Form как blocking. Допустимость mixed модели, другие graph checks и wrapper не проверены; общий PASS или инцидент не доказаны. Такой фильтр добавлен относительно c291 и не должен приписываться установленному runtime.

Proposed controls: Q3 provider при отрицательном machine verdict; dependency только в description; отдельно only-formless, ordinary Form и mixed Screen+Form; сравнение validator/wrapper outcomes. Безопасная bundle-local closure и явный read-back остаются гипотезой для будущих исследований; стоимость и частота UNKNOWN, DEFER.
