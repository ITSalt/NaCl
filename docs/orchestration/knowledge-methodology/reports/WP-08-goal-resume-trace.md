# WP-08 предварительно: goal fingerprint и resume

Pinned NaCl 20fe4c6, source-only, dependency WP-01 открыта. Реальная частота, side effects и runtime UNKNOWN, DEFER.

`nacl-goal/run-artifacts.md:88–115,147–160,173–190` описывает fingerprint нормализованного goal, image hashes, realpath, remote URL, target и ветки, а также index под flock с atomic rename. HEAD SHA не указан в этой формуле; это не доказывает отсутствия других drift checks. `nacl-goal/SKILL.md:457–460,532–551` фиксирует atom ID при LOCK и допускает retype с сохранением ID.

`run-artifacts.md:247–270` описывает resume с первого state != verified и переход к drift check при goal-final-sha; root SKILL :523–526 отдельно пропускает verified и unsupported. Буквальные формулировки не полностью совпадают, но реальное зависание не доказано.

Root SKILL :523–527,563–574 описывает implementing → inner workflow → shipped/commit → verify. При прерывании после внешнего side effect до записи shipped может остаться implementing; `retry-policy.md:158–173` запрещает автоматический retry side-effecting operations, однако конкретная сверка remote/local в показанном resume не описана. Это предлагаемый recovery gap, не факт дублирования PR/commit. Отдельно `retry-policy.md:15–20,69–77` содержит prose о трёх attempts и pseudocode с `len(BACKOFFS)+1`; runtime число UNKNOWN.

Root SKILL :71–79 ограничивает crash/resume в версии 2.10.0; Codex `skills-for-codex/nacl-goal/SKILL.md:48–66,159–161` имеет иные runtime/preview условия. Альтернатива — persisted intent/operation key, внешний read-back и idempotent recovery, с сохранением human gates и non-resumable отказов; риск — сложность и ложное обещание exactly-once. Proposed controls: crash после PR и до checkpoint, unsupported перед pending, изменённый HEAD при той же ветке. Не выполнялись.
