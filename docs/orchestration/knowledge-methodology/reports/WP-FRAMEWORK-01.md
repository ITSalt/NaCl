# WP-FRAMEWORK-01 — статическая карта NaCl

Сдача пересмотренного статического объёма по решению D-5 от 3 ноября 2026 года. Экспериментальные условия переданы WP-16. Решение о приёмке записывается после независимой проверки.

## Карта и источники

Снимок NaCl `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`. [Индекс](WP-01-package-index.md) содержит 61 root package. Области BA, SA, TL, разработка, QA, поставка, управление, graph и платформа сопоставлены с [исходным планом](../PLAN.md). [Проверка покрытия](WP-01-coverage-check.md), [BA/SA](WP-01-ba-sa-package-coverage.md), [TL](WP-01-tl-package-coverage.md) и [платформа](WP-01-platform-inventory.md) задают знаменатели и ограничения. Root, overlay, generated и установленный NaCl 0.2.2 учитываются раздельно. Частный meta исключён из снимка и этого исследования.

В BA изучены context→process→workflow→entities→roles→glossary→rules→validate→handoff. В SA — архитектура, domain, UC/UI, validate/finalize и BA→SA. В TL — intake/plan, разработка, review/QA, ship/verify/release и восстановление. В платформе — generator, Skills-only, MCP, analyst-tool и tracker. Это описание исходников, а не частот выполнения.

## Механизмы и решения

[BA/SA](WP-01-mechanism-registry-ba-sa.md) и [TL/platform](WP-01-mechanism-registry-tl-platform.md) дают 55 групповых ID. Consumer/falsifier matrices индексно покрывают 55/55 групп. Это не доказательство полного покрытия атомарных обязанностей. Непроверенные обязанности и runtime-поведение сохраняют UNKNOWN. Цена механизмов пока не измерена.

Приоритетные решения, альтернативы, риски и проверки сведены в [рекомендации](recommendations.md). Наиболее сильное имеющееся evidence — synthetic missing-atom GOAL_OK, отказ diagnose в disposable Skills-only сборке и synthetic render за project root. Source-level различия resume/coverage и QA aggregate имеют более слабый уровень доказательства. Массовое удаление защит не обосновано.

## Граница сдачи

В статический WP-01 входят карта областей, источники/исключения, уровни доказательств и передача следующих вопросов. Готовность корпуса, независимый oracle, graph baseline/restore и проверка бюджета относятся к WP-16. Изменение этой границы утверждено владельцем при принятии плана восстановления. [Матрица](WP-01-acceptance-matrix.md) содержит вердикты. [Рекомендации](recommendations.md) — первый пользовательский результат. Непринятые материалы WP-02–15 остаются источниками для профильного review и не получают автоматически DONE.
