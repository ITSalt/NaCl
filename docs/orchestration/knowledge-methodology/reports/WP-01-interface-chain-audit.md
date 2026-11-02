# WP-01: стыковые цепочки WP-11–14 — аудит звеньев

Снимок NaCl 20fe4c6a56482e85d3ea9a9ebaadb37206047e41; сверка предварительных отчётов по producer→format→consumer→check→обратное изменение→recovery. Подтверждённые ссылки означают текстовый контракт, не выполненный end-to-end. Все стыки остаются DEFER/UNKNOWN до проверки по протоколу.

| Стык | Найденная текстовая цепочка | Не подтверждено |
|---|---|---|
| BA→SA, WP-11 | nacl-ba-handoff/SKILL.md:37–46 связывает BA entities/steps/roles/rules с SA; skills-for-codex/nacl-sa-uc/SKILL.md:23–33,268–282 читает автоматизируемые шаги; handoff update nacl-ba-handoff/SKILL.md:497–517 описывает diff и сохранение связей | BA semantic change→stale SA→TL replan, восстановление partial write, сохранение чужого состояния; labels и coverage DISTINCT — кандидаты negative, не выполненные false PASS |
| SA→TL→dev, WP-12 | nacl-tl-plan/SKILL.md:905–982,1028–1042 описывает Task/Wave/файлы; skills-for-codex/nacl-tl-sync/SKILL.md:19–36 сопоставляет реальные call sites | Сквозное сохранение одинаково названных разных требований, error/repair/recovery, missing contract по клиентам; VERIFIED_BY — структурное ребро, не выполненный тест |
| dev→QA→release, WP-13 | skills-for-codex/nacl-tl-dev-fe/SKILL.md:57–73,96–110 задаёт evidence; overlay nacl-tl-full/SKILL.md:174–183 задаёт lifecycle; reopened :71–105 описывает обратный fix | Evidence chain на одном SHA/env, invalidation после code/test/provider change, повторная QA после fix/restart и реальный wire; sanitizer probe не проверяет release |
| state/recovery, WP-14 | nacl-tl-full/SKILL.md:912–936 описывает graph→JSON и repair, overlay :211–220 — remote graph authority и best-effort cache; nacl-goal/retry-policy.md:11–19,67–78,158–173 — retry и запрет повтора side effects | Crash между graph commit и JSON, fencing, external unknown outcome, scope claim и восстановление; общий атомарный graph+JSON transaction не показан |

Ни одна строка не демонстрирует все шесть звеньев на одном воспроизводимом run. Предложенные negative cases и textual contracts не являются сквозным PASS; источники и ограничения каждого предварительного WP сохраняются.
