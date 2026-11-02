# Актуализация знаний и упрощение методологии — план

> Пишется один раз, правится редко. Текущее состояние — в `status.md`.

## Цель и условие завершения

Провести глубокий аудит сложности и устаревших конструкций NaCl: объяснить, где методология замедляет разработку, какую дополнительную проверяемую пользу даёт относительно Markdown-спецификации и что можно упростить либо передать Harness. Итог — доказательное исследование и методические рекомендации для другой программы реализации. Утверждение «всё стало тяжёлым» — исходный сигнал владельца, а не заранее принятый вывод по каждому механизму.

Программа завершена, когда: покрыта карта всех канонических областей/подобластей и стыков; приняты 18 исследовательских пакетов; представлен разбор стоимости/пользы и сравнения с явными ограничениями; рекомендации прошли независимое оспаривание; передан исполнимый backlog будущей программы. Отсутствующие live-замеры явно обозначены, без заявления о доказанном ускорении. Изменения скиллов, релизы и внедрение не являются условиями завершения.

## Объём

1. BA, SA, TL, разработка, review/QA/verification, поставка/публикация.
2. Управленческие надстройки: Goals, conductor/full, восстановление по коду (migrate), diagnose/reconcile/status/sync/verify-code, postmortem/init.
3. Граф/схемы/Markdown/JSON, редактор, CLI/MCP/hooks, клиентские адаптеры, генерация/упаковка, legacy и тестовая база.
4. Отдельные стыки BA→SA, SA→TL→dev, dev→QA→release, management→lifecycle и state recovery.
5. Сквозное сравнение с Markdown+Harness, актуальность native возможностей и стоимость самой координации.

### Не входит

Изменение исходных/установленных скиллов, кода, тестов, конфигураций NaCl и проектов; внедрение новой методологии; merge/deploy/release фреймворка; запись в рабочие БД. D-2 уточняет D-1, trusted delivery поставлен на hold. Изменяются только исследовательские документы в отдельном workspace.

## Модули

Технический модуль `framework` оставлен единым read-only источником. Исследовательские потоки делятся пакетами и подобластями ниже, а не writable paths в NaCl. Это позволяет изучать реальные пересечения без выдуманных кодовых границ. Read-only scout сдаёт результат координатору; только координатор пишет workspace. Стандартные code-dispatch/PR/merge стадии не применяются.

| WP | Область / подобласти | Зависимости |
|---|---|---|
| [WP-FRAMEWORK-01](work-packages/WP-FRAMEWORK-01-inventory.md) | Карта фреймворка и протокол измерений | — |
| [WP-FRAMEWORK-02](work-packages/WP-FRAMEWORK-02-ba.md) | Бизнес-анализ | WP-FRAMEWORK-01 |
| [WP-FRAMEWORK-03](work-packages/WP-FRAMEWORK-03-sa.md) | Системный анализ | WP-FRAMEWORK-01 |
| [WP-FRAMEWORK-04](work-packages/WP-FRAMEWORK-04-tl.md) | Планирование и управление разработкой | WP-FRAMEWORK-01 |
| [WP-FRAMEWORK-05](work-packages/WP-FRAMEWORK-05-development.md) | Разработка и исправления | WP-FRAMEWORK-01 |
| [WP-FRAMEWORK-06](work-packages/WP-FRAMEWORK-06-quality.md) | Review, QA и верификация | WP-FRAMEWORK-01 |
| [WP-FRAMEWORK-07](work-packages/WP-FRAMEWORK-07-delivery.md) | Поставка, публикация и эксплуатационная документация | WP-FRAMEWORK-01 |
| [WP-FRAMEWORK-08](work-packages/WP-FRAMEWORK-08-management.md) | Цели и восстановление фактического состояния | WP-FRAMEWORK-01 |
| [WP-FRAMEWORK-09](work-packages/WP-FRAMEWORK-09-graph.md) | Данные, граф и синхронизация | WP-FRAMEWORK-01 |
| [WP-FRAMEWORK-10](work-packages/WP-FRAMEWORK-10-platform.md) | Адаптеры, runtime и каналы поставки | WP-FRAMEWORK-01 |
| [WP-FRAMEWORK-11](work-packages/WP-FRAMEWORK-11-interface-ba-sa.md) | Стык BA → SA | WP-FRAMEWORK-02, WP-FRAMEWORK-03 |
| [WP-FRAMEWORK-12](work-packages/WP-FRAMEWORK-12-interface-sa-dev.md) | Стык SA → TL → разработка | WP-FRAMEWORK-03, WP-FRAMEWORK-04, WP-FRAMEWORK-05 |
| [WP-FRAMEWORK-13](work-packages/WP-FRAMEWORK-13-interface-dev-qa.md) | Стык разработка → review/QA → release | WP-FRAMEWORK-05, WP-FRAMEWORK-06, WP-FRAMEWORK-07 |
| [WP-FRAMEWORK-14](work-packages/WP-FRAMEWORK-14-interface-control.md) | Стык управления, восстановления и состояния | WP-FRAMEWORK-04, WP-FRAMEWORK-08, WP-FRAMEWORK-09, WP-FRAMEWORK-10 |
| [WP-FRAMEWORK-15](work-packages/WP-FRAMEWORK-15-harness.md) | Что можно передать Harness | WP-FRAMEWORK-01 |
| [WP-FRAMEWORK-16](work-packages/WP-FRAMEWORK-16-measurement.md) | Цена методологии и сравнение с Markdown | WP-FRAMEWORK-02, WP-FRAMEWORK-03, WP-FRAMEWORK-04, WP-FRAMEWORK-05, WP-FRAMEWORK-06, WP-FRAMEWORK-07, WP-FRAMEWORK-08, WP-FRAMEWORK-09, WP-FRAMEWORK-10, WP-FRAMEWORK-15 |
| [WP-FRAMEWORK-17](work-packages/WP-FRAMEWORK-17-challenge.md) | Независимая проверка рекомендаций | WP-FRAMEWORK-11, WP-FRAMEWORK-12, WP-FRAMEWORK-13, WP-FRAMEWORK-14, WP-FRAMEWORK-16 |
| [WP-FRAMEWORK-18](work-packages/WP-FRAMEWORK-18-recommendations.md) | Методические рекомендации и передача следующей программе | WP-FRAMEWORK-17 |

## Факты

Снимок источников: локальный NaCl main `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`, чистый checkout. Workspace: `/Users/maxnikitin/projects/NaCl-orch/docs/orchestration/knowledge-methodology`, ветка `orch/knowledge-methodology`. Внешний upstream в этом plan не обновлялся.

Первичная разведка и точные указатели — [planning-evidence](reports/planning-evidence.md). Есть реальные гипотезы о стоимости fanout, dual-write и handoff, но нет проведённого измерения ускорения. Исторические защиты появились в том числе из-за false PASS; их удаление требует проверки отрицательных сценариев. Два клиента и сгенерированные копии учитываются раздельно.

## Волны и гейты

| Волна | Пакеты | Гейт |
|---|---|---|
| 0 — основания | 01 | Каноническая карта, покрытие, корпус и rubric зафиксированы до экспериментов |
| 1 — области | 02–10,15 | По каждой подобласти есть механизм/цена/польза/альтернатива; возможности Harness имеют источники |
| 2 — стыки и измерения | 11–14,16 | Сквозные трассы, обратные петли, сравнение с Markdown, границы достоверности |
| 3 — оспаривание | 17 | Проверены исторические дефекты и сильные аргументы против упрощения |
| 4 — синтез | 18 | Приняты методические рекомендации и передача следующей программе |

Не более трёх исследователей одновременно; зависимости уточняются по evidence, а не по календарю. 01–17 создают исследовательские материалы, 18 объединяет их; это не 18 последовательных реализаций. Все пакеты сейчас DRAFT: plan завершает подготовку, не запускает исследования. Полный протокол, критерии качества и ресурсные ограничения — [research-protocol](spec/research-protocol.md).

Итоговые артефакты программы: `reports/final-audit.md` (объяснение и evidence), `reports/recommendations.md` (реестр действий), `reports/target-methodology.md` (варианты минимального процесса и границы), `reports/implementation-handoff.md` (зависимости, совместимость, проверки, rollback для другой программы). Их ещё предстоит создать в WP-18.

## Риски

| Риск | Как учитываем |
|---|---|
| Подтвердить исходную гипотезу вместо исследования | KEEP допустим; независимый challenge; контраргумент для каждого удаления |
| Удалить полезный gate | Исторический дефект, negative case и альтернативная гарантия обязательны |
| Принять объём копий за сложность | Карта source→overlay→generated, единица анализа — обязанность |
| Объявить Harness заменой по названию | Проверка конкретной версии, гарантии и probe; неизвестное остаётся неизвестным |
| Измерить только успешные прогоны | Сохранять failed/blocked/timeouts, одинаковый rubric, сравнение качества |
| Не получить реальные трассы или бюджет | Static/replay и live результаты разделены; ограничения входят в итог |
| Сам аудит станет тяжёлым | Один отчёт на WP, без NaCl lifecycle/графа/PR на исследование; мерить накладные расходы координатора |
| Scope creep в реализацию | D-2, delivery hold, исходники read-only, отдельная программа внедрения |

## Вопросы владельцу

Блокирующих вопросов для подготовки плана нет. Запрошены 1–3 реальные задачи/проекта для измерений; до ответа корпус строится на доступных ретроспективах и fixtures, ограничения явно отмечаются. Подбор кейсов не требует доступа к чужим данным или инфраструктуре.

Лимит платных/длительных прогонов определяется перед экспериментом по конкретному числу запусков и стоимости, не задерживает картирование и статический анализ. Продуктовые развилки (обязателен ли graph, какие tiers сохранить, отказ от совместимости) выносятся после исследования с вариантами, а не решаются этим планом.

