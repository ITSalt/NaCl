# WP-FRAMEWORK-01 — промежуточные результаты

Статус: исследование продолжается, это не финальный отчёт и не замороженный корпус. 2026-11-02.

## Снимки

NaCl: `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`, checkout чистый. Family Cinema: `4f3ecb812e7014dc4875084b0c1d72fe717a453e`, checkout чистый. Граф, его writers, экспорт и baseline не проверены. Эти SHA — наблюдения локальных checkout, не подтверждение upstream или готовности экспериментального baseline.

## Карта источников

`scripts/codex-plugin-manifest.json:6–68` перечисляет 61 root package: 14 BA, 10 SA, 27 TL, 4 migrate и 6 других; `:94–117` задаёт 21 overlay. Это знаменатель пакетов, не число механизмов. `codex-plugin-src/README.md:3–16` различает источники и генерацию; копии нельзя считать независимой сложностью.

| Область | Направление | Следующий анализ |
|---|---|---|
| BA: context, process, workflow, entities, roles, rules, glossary, import-doc, from-board, analyze, sync, full, validate, handoff | источники и доски → граф BA и handoff | WP-02, 09, 11 |
| SA: architect, domain, roles, uc, ui, feature, flags, full, validate, finalize | потребности и BA → архитектура, модель, UC и проверки | WP-03, 11, 12 |
| TL: intake, plan, next, full, conductor, core | запрос и спецификация → задачи, волны и управление | WP-04, 12, 14 |
| TL: dev, dev-be, dev-fe, fix, hotfix, reopened, stubs | задача или дефект → изменения и учёт дефектов | WP-05, 12, 13 |
| TL: regression-test, review, qa, verify, verify-code, sync | тесты, review и проверка контрактов | WP-06, 12–14 |
| TL: docs, ship, deliver, deploy, release; publish, render | документация, доставка и представления графа | WP-07, 13 |
| goal, init, migrate, migrate-ba, migrate-sa, migrate-core, postmortem, tl-diagnose, tl-status, tl-reconcile | цели, миграция и восстановление состояния | WP-08, 14 |
| core, tl-core, graph-infra, analyst-tool | общие контракты и графовая инфраструктура | WP-09, 10, 14, 15 |
| codex-plugin-src, skills-for-codex, services/nacl-mcp, builders и manifests | адаптация, runtime и упаковка | WP-10 |
| bench, tests, исторические документы | измерения и исторические основания | WP-16–18 |

Codex routers BA/SA/TL: `codex-plugin-src/package/skills/nacl-ba/SKILL.md:8–23`, `nacl-sa/SKILL.md:8–22`, `nacl-tl/SKILL.md:8–19`. Root-описания — заявленное поведение, не доказательство runtime. Подключение отдельных leaf и полный граф вызовов ещё не проверены. `bench/README.md:3–5,63–75` описывает benchmark Excalidraw, а не готовый delivery A/B.

## Кандидаты корпуса Family Cinema

Исторические документы содержат решения и могут загрязнить вход. Названия ниже — кандидаты; brief и критерии необходимо независимо зафиксировать до эксперимента, затем подтвердить pre-change commits, fixtures и эквивалентный графовый baseline.

| Класс | Кандидат | Черновое направление проверки |
|---|---|---|
| Малая фича | `.tl/feature-requests/FR-014-photo-lightbox.md:11–14,31–32,62–63` | открытие, закрытие и масштабирование изображения, запрет открытия при обработке |
| BE + UI | `.tl/feature-requests/FR-029-cabinet-hub-redesign.md:15–21,43–54` | ограниченный вертикальный срез общей квоты и её отображения |
| Баг | `.tl/fix-plans/BUG-1.md:23–48` | ошибка провайдера OTP не маскируется успехом; проверить с fixtures |
| Внешняя интеграция | `.tl/feature-requests/FR-030-llm-providers-kie-first.md:13–17,40–50,78–82` | primary и fallback под флагом; без реальных вызовов |
| Изменение требований | `.tl/feature-requests/FR-041-public-sharing-publication-reviews-tags.md:12–24,44–48` | публичный доступ, отдельные согласия и модерация |
| Восстановление | `.tl/exceptions/EXC-stale-downstream-dec044-20260608.yaml:1–28` | различать собственный и чужой stale signal; пригодность для runtime replay не доказана |

## Открытая работа

Проверить полный граф вызовов и источники каждого механизма, историю защит и карточки по протоколу; уточнить сценарии и независимые acceptance tests, исходные версии и загрязнение решений; проверить доступ к графу, scope, writers и безопасный baseline. Стоимость и эффективность не измерялись. До ресурсного плана платные серии не запускались. Исходники NaCl и Family Cinema, граф и внешние сервисы не изменялись.

Автономное продолжение: прежнее утверждение о необходимости отдельного private-owner runtime было необоснованным: это другой режим. Для обычного режима `session capabilities` сообщил available=true, queue=true, app_server=true, version=0.166.0; `session discover` завершился `App Server timeout: initialize`. Привязка координатора не подтверждена, claim/enable не выполнены, автономия выключена. Timeout — граница наблюдения, не доказательство общей недоступности автономии. Исследование выполняется в текущей сессии.
