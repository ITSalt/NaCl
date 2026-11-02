# WP-18: рабочий реестр для будущего синтеза

[Дополнительные кандидаты](WP-18-preliminary-candidates.md) упорядочены по исследовательскому риску, не по измеренному эффекту.

Не итоговая рекомендация и не передача на реализацию: WP-01, 02–17 не приняты, live comparison не проведено. На 2026-11-02 это инвентарь проверок, чтобы не потерять находки. Решения о продукте и изменениях NaCl не принимались.

| Кандидат | Основание | Что ещё доказать / риск |
|---|---|---|
| Проверить противоречие read canary при генерации Skills-only | [WP-01 canary](WP-01-skills-only-canary.md): установленный текст одновременно требует и запрещает read canary, исходный отрицательный doctor преобразован builder | Исполняемый путь и regression test; не объявлять live отказ или частоту без эксперимента. |
| Проверить конфликт L1/spec-update | [WP-05](WP-05-preliminary.md): L1 описан как кодовая ошибка при корректной spec, но L1+ gate требует spec update/исключение | Активный путь/negative fixture; не удалять защиту L2/L3, не утверждать, что сессия уже блокировалась. |
| Проверить корректность coverage при множественных рёбрах | [WP-11](WP-11-preliminary.md): numerator `count` edges и denominator source nodes | Изолированный Neo4j + независимый DISTINCT/NOT EXISTS oracle и реальный consumer; текущий graph не проверен. |
| Проверить привязку evidence к SHA/env и порядок QA/review/release | [WP-06](WP-06-preliminary.md), [WP-13](WP-13-preliminary.md): разные типы evidence и возможные циклы; [mock engine](WP-06-engine-mock-probe.md) | Full gateway/QA consumer, negative cases и актуальный deployment SHA; локальный mock не доказывает release PASS. |
| Уточнить и проверить происхождение количественных утверждений | [WP-16](WP-16-preliminary.md): не найден raw source 550/150000 и человеко-часов в доступной истории; wave-plan A/B неравен по входу | Внешние документы/данные владельца и воспроизводимый равный benchmark. Нельзя утверждать, что цифры ложны или что NaCl медленнее/быстрее. |
| Исследовать упрощение дублирующей координации | [WP-04](WP-04-preliminary.md), [WP-08](WP-08-preliminary.md), [WP-15](WP-15-preliminary.md) | Фактические trace, стоимость, независимые acceptance и негативные случаи; сохранить identity/fence/recovery, graph truth и human gates. DEFER. |

Основания и порядок будущей работы зависят от независимого WP-17, экспериментов и решений владельца. Ни одна строка не является разрешением изменить скиллы, инфраструктуру или опубликовать релиз. Ограничения графа и pilot — [baseline](WP-01-graph-baseline-risks.md), [план pilot](WP-16-pilot-plan-draft.md). Бюджет одной пары согласован D-4, но оставшийся бюджет, hard-stop, безопасный исторический graph и blind isolation ещё не доказаны.
