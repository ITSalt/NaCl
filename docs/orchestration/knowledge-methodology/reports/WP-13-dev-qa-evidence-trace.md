# WP-13 предварительно: dev → acceptance → QA

Pinned NaCl 20fe4c6; WP dependencies открыты, execution и graph не наблюдались. Стоимость/frequency UNKNOWN, DEFER.

`skills-for-codex/nacl-tl-dev-fe/SKILL.md:19–35,57–73,96–110` использует acceptance/test-spec/API contract, baseline и содержательный RED и описывает result-fe; это ещё не матрица каждого AC. `skills-for-codex/nacl-tl-review/SKILL.md:30–46` требует отдельно подтвердить implemented/reachable/tested каждого AC, а `skills-for-codex/nacl-tl-sync/SKILL.md:19–36,68–85` различает буквальный FE→BE call site и wire evidence; mock/type alignment не доказывает live provider.

Root `nacl-tl-qa/SKILL.md:270–281,354–358,429–435` использует acceptance как checklist и описывает AC→stage→status, report и screenshots; Codex QA :132–152 требует mapping и UNVERIFIED при UI-testable unmapped. Точная проверка привязки каждого dev test path к AC, revision и environment по этим строкам не доказана. Root :289–295 при отсутствии browser-verifiable criteria останавливает QA с HALTED UNVERIFIED до Playwright, тогда как :354–358 запрещает N/A для provider/runtime-dependent criteria и направляет provider-dependent к live stages. Это напряжение порядка для UC, где ни один criterion не наблюдаем браузером; provider-dependent criterion может быть и browser-verifiable, а routing прочих runtime-dependent случаев здесь не установлен.

Codex QA :39–48,132–140 при mandatory NOT_RUN без signed exception или unmapped UI AC может перезаписать aggregate на UNVERIFIED даже при FAILED/BLOCKED стадии; это non-PASS, per-stage status сохраняется, false PASS не доказан. Root :735–741 описывает re-run failed steps и navigation sanity; автоматическая invalidation всех затронутых AC при новом HEAD/provider config из этих строк не установлена.

Альтернатива — versioned AC→test/stage ledger с revision/env/evidence и scoped invalidation. Риски: потерять manual judgment, смешать mocks с browser/wire/live и понизить severity. Proposed negatives: unmapped UI AC, FAILED+mandatory NOT_RUN, provider-only AC, stale test path на новом HEAD, mock-only wire; positive — каждый applicable AC и точный scope подтверждены. Ни одна проверка не выполнялась.
