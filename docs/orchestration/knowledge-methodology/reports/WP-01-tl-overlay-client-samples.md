# WP-01: девять TL overlay — выборочные client contracts

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Root, skills-for-codex и package overlay — отдельные тексты; source-level diff не доказывает выбранный installed route, runtime, цену или эффективность. Категории DEFER.

| Workflow | Выборочное сравнение | Ограничение |
|---|---|---|
| tl-core | Root resource references remote-mode-coordination.md:3–19 задают remote graph authority; Codex tl-core :13–27 допускает verified legacy-only fallback при недоступном doctor; overlay :13–22 требует package doctor или BLOCKED | Skills-only project MCP не приравнивать package gateway |
| tl-intake | Root :75,212–214 допускает autonomous только из Claude wrapper; Codex/overlay :76–84 требуют interactive calibration. Package diff меняет путь scoring reference | Overlay :36–42 о confirmation и :55–64 о high-confidence routing требуют scope clarification; фактический downstream call неизвестен |
| tl-review | Codex :152–177 выбирает config/runner; package overlay :152–177 требует pnpm -r и BLOCKED при отсутствии pnpm/workspace | Источник не доказывает реальный запуск или effect; author-overlap guidance в вариантах отличается |
| tl-release | Root и Codex :63–71 используют FAIL, package overlay :64–70 — FAILED как его validator; root headline UNVERIFIED, package blocking status BLOCKED | Codex подробнее различает graph.status и L8.1/L8.1b; отсутствие деталей в overlay SKILL не доказывает их отсутствия во всей closure |
| tl-reopened | Root :13–38 использует Status и human report; Codex/overlay :21–33 ограничивают goal alias, overlay :67–107 требует evidence и не продвигает unverified | Proof reference не является выполненным project-cwd command; actual parser и retry неизвестны |
| tl-conductor | Root :58,265 задаёт Task agents; Codex :38–65 условную delegation; overlay :12–22,120–122 добавляет fenced gateway и отказ при missing named read | Режим gateway и фактическая аутентификация не доказаны |
| tl-next | Root :119–129 и Codex :33–40 описывают remote claim-first; Codex :43–46 также называет skill read-only; overlay :33–50 разделяет local read и remote claim, но :107 сохраняет обобщение read-only | Это текстовое напряжение, не доказательство выполняемой мутации без approval |
| tl-plan | Root :311–318,346–358 и Codex :23–37,75–90 описывают external-contract gate; overlay :51–59 сообщает unavailable named discovery и ограниченный file-only путь | File-only не доказывает graph-complete; live gateway не проверен |
| tl-fix | Root :144–151 допускает inline fallback; Codex :88–91,476–487 допускает documented test command без scripts.test; overlay :89–91,424–455 задаёт NO_INFRA при отсутствии scripts.test и :290–295 блокирует unavailable graph triage | Заявленные policy различаются; фактическое исполнение и применение entrypoint не доказаны |

Сокращённые root paths — nacl-tl-<имя>/SKILL.md, Codex — skills-for-codex/nacl-tl-<имя>/SKILL.md, overlay — codex-plugin-src/workflow-overlays/nacl-tl-<имя>/SKILL.md; tl-core root — ресурсная папка без root SKILL. Сравнения выборочные, не полный diff или доказательство semantic equivalence.
