NaCl 2.26.0 — stack-aware-gate-and-infra-rework

Убраны два тупика кондуктора: repo-wide гейт ревью работает на любом пакет-менеджере, а отклонённая ревью инфраструктурная задача получила санкционированный путь назад к PASS.

Оба дефекта найдены правильным способом — живой прогон кондуктора на проекте с 2.25.0 захолтился и показал точные противоречия (файл, строки, оба конфликтующих значения) по протоколу framework-defect, вместо того чтобы импровизировать.

Проблема 1: гейт ревью был pnpm-only. Repo-wide Check Gate требовал литеральные `pnpm -r lint / typecheck / test`, прямым текстом запрещал подставлять npm, и не имел операторского обхода. Но фреймворк ещё в stack-de-prescription перестал предписывать стек: config.yaml — источник истины для команд, а tl-fix сам находит раннер в `scripts.test`. На npm-workspaces-проекте каждое ревью каждой задачи навсегда получало `repo-checks-UNRUNNABLE` и отказ в VERIFIED. Гейт был мёртв для любого не-pnpm проекта.

Проблема 2: отклонённую инфра-задачу нельзя было переделать. Retry-цикл Wave 0 гонит rejected TECH через `tl-dev --continue` → полная делегация в `tl-fix` → а тот для слоя без `scripts.test` детерминированно давал `NO_INFRA` (tl-dev сам это предсказывал прямым текстом) → кондуктор шлёт NO_INFRA в failed. 2.25.0 закрыл first-pass, но Workflow-B задача, отклонённая в ревью (реальный кейс: инертный `.dockerignore` вне build context, захардкоженный порт healthcheck), не имела пути назад к PASS.

Что внутри:

— **Stack-aware гейт.** Тройка команд резолвится по цепочке приоритетов: `config.yaml repo_checks.{lint,typecheck,test}` (дословно, покрывает turbo/nx/make-обёртки) → автодетект пакет-менеджера (`packageManager`, иначе lockfile: pnpm → `pnpm -r`, npm → `npm run <stage> --workspaces`, yarn → `yarn workspaces run`; никаких `--if-present`) → `unrunnable`. Строгость не тронута: цепочка выбирает КАКИЕ команды бегут, но не БЕГУТ ЛИ. Отсутствующий скрипт всё так же валит стадию, красное всё так же отказывает в VERIFIED, инлайн-обхода всё так же нет. Новый блок `repo_checks:` сеется nacl-init из детектированного пакет-менеджера.

— **Path C в tl-fix.** Рядом с Path A (новый RED-first тест) и Path B (существующее покрытие) появился Path C — инфраструктурная верификация: когда у слоя нет `scripts.test`, но у TECH-задачи есть задокументированная команда верификации. Поток зеркалит Workflow B: baseline → фикс → чистый re-run → секция «Fix re-verification» в коммитимом `.tl/tasks/<ID>/verification.md` → `PASS` с `Regression test: verification: <path>`. Оркестраторы уже с 2.25.0 мапят это в `verify-GREEN` — кондуктор и tl-full не менялись вообще. `NO_INFRA` теперь означает ровно то, что говорит: нет ни тестов, ни команды верификации.

Что НЕ изменилось: TDD-дисциплина Path A/B, шесть статусов, refusal-семантика гейта, W4 signed exceptions, emergency mode, spec-first протокол фикса (L-классификация, docs before code, Decision) — Path C работает внутри него.

Совместимость: аддитивно. pnpm-проекты работают без конфига (автодетект даёт те же команды, что гейт раньше хардкодил); npm/yarn-проекты начинают проходить гейт сразу после обновления.

Обновление:

| Канал | Как |
|---|---|
| Claude Code CLI (симлинки) | `git pull` в checkout NaCl |
| Claude Code Desktop (плагин) | Settings → Plugins → маркетплейс `nacl` → Sync → Update; или `claude plugin marketplace update nacl && claude plugin update nacl@nacl` + перезапуск |

https://github.com/ITSalt/NaCl/releases/tag/v2.26.0
