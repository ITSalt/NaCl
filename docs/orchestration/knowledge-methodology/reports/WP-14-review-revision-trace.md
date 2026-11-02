# WP-14 предварительно: review evidence и изменение ревизии

Pinned NaCl 20fe4c6; WP dependencies открыты. Source-only, цена/frequency и реальные callers UNKNOWN; DEFER.

Root `nacl-tl-review/SKILL.md:92–107,137–168,695–697` требует lint/typecheck/test на wave-tip=HEAD и записывает `repo-checks-GREEN:<commit-sha>`; непроверенное/failed ведёт к BLOCKED с отдельным signed exception. Code judgment и runnable checks различны. Legacy Codex :145–186 допускает configured/autodetected commands; package overlay `codex-plugin-src/workflow-overlays/nacl-tl-review/SKILL.md:145–179` описывает конкретные pnpm команды. Клиентские контуры не приравниваются.

`codex-plugin-src/package/runtime/graph-gateway/concurrency.mjs:150–160` проверяет синтаксис SHA token (7–64 lowercase hex, один token), не доказывая существование commit, исполнение команд или совпадение с текущим HEAD. Root `nacl-tl-deliver/SKILL.md:408–427` фиксирует HEAD и clean checkout, deploy :128–139 требует artifact; в проверенных фрагментах обязательная автоматическая сверка старого review token с новым PR HEAD после push не установлена. Иные readers не исключены, false PASS не доказан.

Proposed negative: review/checks на A, затем B с изменённым кодом, тестом или lockfile до ship; сверить revision каждого gate и актуальность при B. Positive — тот же неизменённый revision; dirty state и provider environment отдельно. Альтернатива — typed revision-bound per-gate attestation; риск свести содержательный review к синтаксису SHA, не охватить untracked или stale environment и ошибочно обработать exceptions. Граф, CI, review и tests не запускались.
