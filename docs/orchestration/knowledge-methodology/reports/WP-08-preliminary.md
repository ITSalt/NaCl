# WP-08: предварительное исследование целей и восстановления

[Goal fingerprint и resume](WP-08-goal-resume-trace.md) — source-level границы checkpoint и recovery.

[Свежесть diagnose → reconcile](WP-08-reconcile-freshness-trace.md) — source-level трасса; runtime UNKNOWN.

Предисследование до приёмки WP-01; NaCl SHA `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`. Live graph, тесты и workflow не запускались; цена и частота неизвестны, классификация DEFER.

| Обязанность | Источник и граница | Альтернатива / риск |
|---|---|---|
| Goal | root `nacl-goal/SKILL.md:6–13,50–58,93–108`; Codex `skills-for-codex/nacl-goal/SKILL.md:48–66,122–125,159–181,197–201` | Root оборачивает Anthropic /goal; Codex описывает preview и не доказывает запуск другого runtime. Общий route registry возможен при сохранении identity/resume/полномочий и честного отказа. |
| Diagnose/status | `skills-for-codex/nacl-tl-diagnose/SKILL.md:14–38,43–56`, `nacl-tl-status/SKILL.md:13–40`, public `codex-plugin-src/package/skills/nacl-diagnose/SKILL.md:8–36` | File-only диагностирует файлы, не подтверждает graph truth; remote stale fallback нельзя превращать в PASS. Общий read-only сборщик не должен смешивать наблюдения и изменять состояние. |
| Reconcile | `skills-for-codex/nacl-tl-reconcile/SKILL.md:14–44`: exception workflow docs→observed code, план/подтверждение/read-back, atomic version+stale clear | Negative case: код противоречит утверждённому требованию; факт поведения не должен незаметно стать новым решением продукта. Фактический пропуск согласия не наблюдался. |
| Verify code | `skills-for-codex/nacl-tl-verify-code/SKILL.md:19–32,41–137`: dataflow, contract и tests | Отличается от project status; тестировать AC с работающим кодом, но отсутствующим тестом. Формулировка gap «neither implemented nor covered» неоднозначна, не доказан ложный PASS. |
| Sync | `skills-for-codex/nacl-tl-sync/SKILL.md:19–36,40–80,100–115`: FE↔BE routes/DTO и runnable wire evidence, SYSTEM exception | CI contract attestation должен сохранить точные версии, среду, actor и UNVERIFIED при пропуске; fixture и production acceptance не одно и то же. Root `nacl-tl-sync/SKILL.md:233–251,256–291` уже описывает похожий gate, хотя Codex :197–201 называет его добавлением Codex; равенство всех деталей не установлено. |
| Migration/status | `skills-for-codex/nacl-migrate/SKILL.md`, `nacl-tl-status/SKILL.md`; точные entry и legacy path требуют WP-09 | Сведение отчётов не должно превращать черновой/мигрированный graph в проверенный. |

Сравнение количества надстроек само по себе не измеряет дублирования. Для WP-14 нужны сквозные примеры конфликтующих истин, перезапуска, stale state и частичной записи; для WP-16 — фактическая стоимость и одинаковые independent criteria. WP-08 не принят.
