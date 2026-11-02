# WP-10: installed Skills-only JS dependency и Markdown links

Read-only проверка `/Users/maxnikitin/.codex/plugins/cache/openai-curated-remote/nacl/0.2.2/skills`. Установленная версия относится к source c291, pinned анализ к 20fe; active route и runtime outcome UNKNOWN. Node, builder, checker, workflows, graph и A/B не запускались.

`skills/nacl-diagnose/SKILL.md:8–13` предписывает локальный `resources/bootstrap/plan-project-graph.mjs --diagnose-only`. Installed runner :8 импортирует `codex-config-contract.mjs`, а оба файла (:11–12 runner и :1–4 contract) используют `createRequire(import.meta.url)` и top-level `require('./vendor/smol-toml-1.7.0.cjs')`. Локального `resources/bootstrap/vendor/smol-toml-1.7.0.cjs` в diagnose bundle нет; в соседнем nacl-init он есть, но это не тот относительный путь. Независимый исследователь подтвердил пути. При обычном Node resolution и неизменном дереве такой относительный require не найдёт файл до обработки аргументов; реальный `MODULE_NOT_FOUND` не наблюдался, runtime hooks и изменения окружения не проверялись. LICENSE/PROVENANCE vendor также отсутствуют в diagnose, но не утверждается, что они вызывают тот же ранний исход.

Pinned `scripts/build-codex-skills-only.mjs:240–257,260–264,267–282` отслеживает Markdown links и статические `import`/`from`, но не literal CommonJS `require`; отдельный bootstrap directory seed задан для nacl-init. Это возможный механизм различия closure, не воспроизведённая сборка. Checker `scripts/check-skills-only-bundle.mjs:76–90` проверяет Markdown links, не JS dependencies.

Ограниченный regex scan 20 installed JS/MJS/CJS: 17 относительных static `import`/`from` вхождений имеют существующие targets; среди 4 literal `require` два отсутствующих вхождения указывают на один и тот же vendor в diagnose, два в init разрешаются. Динамические импорты и все возможные синтаксические формы scan не покрывает.

Отдельный независимый scan тех же installed skill trees обнаружил 56 локальных inline Markdown ссылок на 105 Markdown файлов: targets всех 56 существуют внутри соответствующего skill, missing/outside/symlink 0. Это не запуск checker и не доказательство semantics, anchors, backtick paths или JS dependencies.

Proposed будущие controls: explicit dependency manifest/recursive CommonJS dependency closure, missing vendor и package-local resolution до выполнения runner, положительный контроль без cross-skill доступа. Риски: динамические requires и неверные интерпретаторы; цена/runtime UNKNOWN, DEFER.
