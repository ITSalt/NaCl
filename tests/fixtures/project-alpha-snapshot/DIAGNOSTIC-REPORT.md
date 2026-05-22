# Diagnostic Report — Project Alpha

**Дата:** 2026-05-18
**Период анализа:** 2026-05-11 — 2026-05-18 (7 дней)
**Полнота данных:** complete (все 3 агента вернули валидные JSON)
**Health Score:** **66 / 100 — требует внимания** (точечные исправления + дисциплина процесса)

---

## 1. Метрики

| Метрика | Значение |
|---|---|
| Период анализа | 2026-05-11 → 2026-05-18 |
| Всего коммитов | **60** |
| Fix-коммитов | **23 (38.3%)** |
| Feat-коммитов | 18 (30.0%) |
| Chore-коммитов | 18 (30.0%) |
| Docs-коммитов | 1 |
| Fix-to-Feature ratio | **1.28** (фиксов больше, чем фич) |
| Fix-to-Doc Ratio | **43.5%** (10/23 fix-коммитов обновили `.tl/` или `docs/`) |
| Code-only fixes (нарушение Rule 1) | **9 коммитов** |
| Hot files (≥3 правок) | **27 файлов** |
| Regression chains | **13 цепочек** |
| Doc placeholders | 0 |
| Build status | ✓ pass (backend, frontend, packages/shared) |
| Typecheck status | ✓ pass (все модули) |
| Test status | **✓ 1627 passed / 0 failed** (95 backend + 52 frontend + 5 shared) |
| Stub markers | 1 TODO, 12 `as any`, 11 `console.log` в backend prod |
| Frontend bundle | ⚠ 695 KB (превышает порог 500 KB) |

### Per-component Health Score breakdown

| Компонент | Сырое значение | Балл | Из |
|---|---|---|---|
| fix_ratio_score | fix_ratio=0.383 | 15.42 | 25 |
| doc_sync_score | fix_to_doc_ratio=0.435 | 10.88 | 25 |
| regression_score | ~52% fix-коммитов в цепочках | 9.6 | 20 |
| build_score | все билды pass | 15 | 15 |
| test_score | 100% tests pass | 15 | 15 |
| **Итого** | | **65.9** | **100** |

> Server health (Agent 4) не запускался — `config.yaml.deploy` ещё не заполнен (нет production/staging URL).

---

## 2. Regression Chains (13 цепочек)

Цепочки 3+ коммитов в файле подряд (в окне ≤5 коммитов):

| Файл | Цепочка коммитов | Длина |
|---|---|---|
| `backend/src/modules/queue/worker.ts` | 3acb2fd → 6ed12ac → 135b14b | **3** |
| `frontend/src/routes/admin/prompt-templates.test.tsx` | 8522d1d → 43fc84d → 311635f | **3** |
| `frontend/src/routes/admin/workflows.test.tsx` | 8522d1d → 43fc84d → 311635f | **3** |
| `frontend/src/routes/admin/categories.test.tsx` | 43fc84d → 311635f | 2 |
| `frontend/src/routes/admin/model-profiles.test.tsx` | 43fc84d → 311635f | 2 |
| `frontend/src/routes/admin/providers.test.tsx` | 43fc84d → 311635f | 2 |
| `frontend/src/routes/admin/users.test.tsx` | 43fc84d → 311635f | 2 |
| `frontend/src/features/admin/CategoryMappingForm.test.tsx` | 8522d1d → 43fc84d | 2 |
| `backend/src/modules/content/task.routes.ts` | 67663ed → 65e2a85 | 2 |
| `backend/src/modules/content/task.service.ts` | 67663ed → 65e2a85 | 2 |
| `frontend/src/features/sessions/SessionDetailPage.tsx` | 65e2a85 → e72204d | 2 |
| `backend/tests/content/engine.lifecycle-sse.test.ts` | c83e84f → 01f2fcb | 2 |
| `.tl/changelog.md` | 1f8efa7 → 67663ed | 2 |

**Средняя длина:** 2.2, **максимум:** 3.

---

## 3. Проблемные кластеры

### Кластер A — Admin tests (фронтенд, регрессионный)
**Файлы:** `frontend/src/routes/admin/{prompt-templates,workflows,categories,model-profiles,providers,users}.test.tsx`, `frontend/src/features/admin/CategoryMappingForm.test.tsx`, `frontend/src/features/admin/ModelProfileForm.test.tsx`
**Fix-коммитов в кластере:** ~8 (8522d1d, 43fc84d, 311635f, 17f71a3)
**Regression chains:** 5 цепочек
**Doc coverage:** SA-спеки MOD-ADMIN (UC-301..303) живут в Neo4j; на диске их нет.
**Сигнал:** Все 6 admin test-файлов правились синхронно — вероятно ломается общий setup (mock роутинга / QueryClient / shadcn dialog) при каждом изменении в форме.

### Кластер B — Queue worker (бэкенд, регрессионный)
**Файлы:** `backend/src/modules/queue/worker.ts` (5 правок), `backend/tests/content/engine.lifecycle-sse.test.ts` (5 правок)
**Fix-коммитов:** 3 (3acb2fd → 6ed12ac → 135b14b)
**Regression chains:** 2 цепочки
**Doc coverage:** UC-201..204 в Neo4j; нет on-disk спек.
**Сигнал:** Worker и его SSE-тесты — самые горячие production-файлы. 3 последовательных fix в worker.ts указывает на тонкие гонки (cancel/fail/heartbeat). Заслуживает архитектурного review.

### Кластер C — Content task layer (бэкенд + фронтенд)
**Файлы:** `task.routes.ts`, `task.service.ts`, `task.service` тесты, `TaskDetailPage.tsx`, `SessionDetailPage.tsx`, `CreateTaskPage.tsx`
**Fix-коммитов:** ~4
**Regression chains:** 3 цепочки
**Doc coverage:** UC-104..108 в Neo4j; на диске нет.
**Сигнал:** Layer задач (центральный для MVP) активно дорабатывается — нормально для текущей фазы, но без on-disk спек источника правды нет.

### Кластер D — Документация/процесс (нарушение Rule 1)
**Файлы:** `.tl/changelog.md`, `.tl/status.json`, `.tl/conductor-state.json`
**Сигнал (не файловый, а процессный):**
- 9 fix-коммитов из 23 не обновили ни `docs/`, ни `.tl/` (нарушение Rule 1 из CLAUDE.md).
- В changelog 5-дневная пауза 2026-05-13 → 2026-05-18 — при этом 17+ git-коммитов в этом окне (FR-003 целиком, UC-150-BE, UC-151-BE, серия admin-фиксов). Записей DEV/REVIEW/SHIP нет.
- `.tl/status.json` summary рассинхронизирован с tasks array: summary.done=53 vs реальное 52; summary.ready_for_dev=7 vs 9; verified-pending=2 отсутствует в summary.

---

## 4. Расхождения docs ↔ code

> **WARNING:** Per-UC спецификации (`docs/SA/use-cases/`, `docs/BA/`, ADR-001..010) **отсутствуют на диске** — все живут в Neo4j-графе согласно методологии (CLAUDE.md Rule 1). Полноценный gap-analysis "doc says X / code does Y" по файлам невозможен без подключения к Neo4j (`bolt://localhost:3587`).

Что удалось зафиксировать без графа:

| # | Расхождение | Severity |
|---|---|---|
| 1 | **CLAUDE.md** заявляет статус "SA Phase Complete — ADR-001…010, 4 модуля drafted", но в `docs/` есть только 2 handoff-файла (доcs/SA/handoff/), обновлённые 2026-05-07. ADR-файлы на диске отсутствуют. | high |
| 2 | **FR-003** (api.kie.example.invalid text-LLM) и **UC-303-FE-FR003** были смержены (коммит 17f71a3) **без записи в `.tl/changelog.md`** о DEV/SHIP-фазах. Changelog содержит только `[2026-05-18] SA-FEATURE: FR-003 …`. | high |
| 3 | **.tl/status.json.summary** рассинхронизирован с `.tasks[]`: summary.done=53, по факту done=52; summary не упоминает `verified-pending=2` (UC-150-BE, UC-151-BE). | medium |
| 4 | **9 fix-коммитов** изменили только `src/` без `docs/` или `.tl/` (нарушение Rule 1): 17f71a3, 818dec1, 2cdb42e, 135b14b, 92da5c7, c83e84f, 14f3000, 01f2fcb, 07c11fe. | medium |
| 5 | **Backend prod-код** содержит 11 `console.log` — должен использоваться `pino`-логгер. | low |
| 6 | **Frontend main chunk 695 KB** > порога 500 KB — нет code-splitting для админки/контента. | low |

---

## 5. Root Cause Analysis (гипотезы)

### H1. Регрессионная фрагильность admin-форм (КОНФИРМИРОВАНО)
**Гипотеза:** Изменения в одной admin-форме (FR-003 → ModelProfileForm) ломают тесты всех соседних admin-страниц из-за общего mock-setup.
**Доказательство:** Цепочка `8522d1d → 43fc84d → 311635f` правит **одни и те же 6 admin test-файлов одновременно**, плюс свежий fix 17f71a3 в `ModelProfileForm` (read `details.issues[].path`) — индикатор повторяющегося класса ошибок валидации.
**Severity:** high.

### H2. Тонкие гонки в queue worker (КОНФИРМИРОВАНО)
**Гипотеза:** Worker имеет нестабильную FSM/heartbeat-логику, чинимую инкрементально.
**Доказательство:** 3-коммитная цепочка в `backend/src/modules/queue/worker.ts` (3acb2fd → 6ed12ac → 135b14b) — все три это fix-коммиты. Тесты `engine.lifecycle-sse.test.ts` правились 5 раз за период (самый горячий тест-файл).
**Severity:** high (это центральный модуль durable-очереди — MOD-QUEUE).

### H3. Дисциплина «Spec First» проседает (КОНФИРМИРОВАНО)
**Гипотеза:** 39% fix-коммитов (9/23) идут без обновления документации/тасков — Rule 1 CLAUDE.md нарушается.
**Доказательство:** 9 code-only fix-коммитов в окне (см. Раздел 4, пункт 4). Plus 5-дневная пауза в changelog при 17+ коммитах.
**Severity:** medium (накапливающийся долг; пока не вызвал реальных багов, но снизит точность ИИ-агента в следующих циклах).

### H4. Документация на диске рассинхронизирована с графом (КАНДИДАТНАЯ — НЕВЕРИФИЦИРОВАННАЯ)
**Гипотеза:** Neo4j-граф содержит актуальные SA-спеки, но on-disk-рендеры (`docs/SA/`) не сгенерированы за весь период.
**Доказательство:** Только 2 файла в `docs/`, обновлены 2026-05-07; код жил до 2026-05-18.
**Что нужно для верификации:** Запрос к Neo4j (`MATCH (uc:UseCase) RETURN uc.id, uc.updated_at ORDER BY uc.updated_at DESC LIMIT 10`) и сравнение с датами кода. Из этой диагностики проверить нельзя.
**Severity:** medium.

### H5. Bundle-size и логгирование (КОНФИРМИРОВАНО)
**Гипотеза:** Технический долг — `console.log` в prod и отсутствие code-splitting накапливаются.
**Доказательство:** 11 `console.log` в `backend/src` (вне тестов); главный JS-чанк фронта 695.75 KB.
**Severity:** low.

---

## 6. Рекомендации

Health Score 66 → **зона "точечные исправления + дисциплина"** (60-79).

### Срочные (Wave 7 — до старта новых фич)

1. `/nacl-tl-reconcile --scope=admin-forms`
   — синхронизировать SA-спеки UC-301..303 в Neo4j с реальным кодом ModelProfileForm/CategoryMappingForm. Регрессионная цепочка из 3 коммитов на admin-тестах требует общего fix setup.

2. `/nacl-tl-fix "queue worker FSM — 3 последовательных fix в worker.ts (3acb2fd, 6ed12ac, 135b14b), требуется L2-классификация + ревизия API_CONTRACT MOD-QUEUE"`
   — формальный fix-цикл с обновлением SA-доменa MOD-QUEUE перед следующим патчем.

3. `/nacl-tl-sync FR-003 UC-303-FE-FR003`
   — записать в `.tl/changelog.md` пропущенные DEV/REVIEW/SHIP-фазы за 2026-05-13..2026-05-18 (закрыть гэп процесса).

### Дисциплина (постоянно)

4. **Починить `.tl/status.json.summary`** вручную или скриптом: summary.done=53→52, добавить verified-pending=2, ready_for_dev=7→9. Можно через `/nacl-tl-status --rebuild`.

5. **9 code-only fix-коммитов** (17f71a3 и др.) — пройти через `/nacl-tl-fix` ретроспективно, чтобы обновить спеки в Neo4j. Иначе ИИ-агент в Wave 6+ будет работать со стейл-моделью.

6. **Запустить `/nacl-tl-status` или Cypher-запрос к Neo4j** для верификации H4: насколько граф актуален относительно кода. Если граф тоже стейл — приоритет на полный `/nacl-tl-reconcile`.

### Технический долг (можно отложить до Wave 6 finalization)

7. Backend: заменить 11 `console.log` на `pino` (TECH-mini-task, L0).
8. Frontend: добавить `manualChunks` в `vite.config.ts` для admin/content разделения — снять предупреждение про 695 KB.
9. Wave 6: 9 ready_for_dev задач (UC-109, UC-110, UC-204, UC-402, UC-410) висят с планирования 2026-05-06 — решить, продолжаем или откладываем.

### Что НЕ нужно делать сейчас

- Полный `/nacl-tl-reconcile` (нет признаков критической архитектурной рассинхронизации; build/tests/typecheck чистые)
- `/nacl-tl-stubs --final` (только 1 TODO и 12 `as any` — недостаточно для финальной чистки)
- `/nacl-tl-qa` (1627 тестов проходят — текущий QA-сигнал зелёный)

---

**Следующий шаг:** запустить пункты 1–3 в указанном порядке. После этого повторный `/nacl-tl-diagnose --since=3d` должен показать снижение regression_ratio и закрытие changelog-гэпа.
