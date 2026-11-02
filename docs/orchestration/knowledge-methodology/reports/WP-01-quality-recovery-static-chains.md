# WP-01: dev→QA→release и graph→cache recovery — статические примеры

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Все ID ниже условные; это тексты контрактов, не фактические вызовы, graph operations, A/B или доказанные runtime outcomes.

## Dev → QA → release

- Producer: root nacl-tl-dev-be/SKILL.md:15–30,180–200,256–274,550–576 описывает task/API, RED и result-be со Status, regression path и baseline/postfix.
- Graph handoff: root nacl-tl-conductor/SKILL.md:485–508 описывает PASS + regression path → test-GREEN либо PASS + infrastructure verification path → verify-GREEN; отсутствие требуемой строки/none ведёт к HALT. Parser/write в runtime не проверены.
- Check: root nacl-tl-verify/SKILL.md:128–155 проверяет runner/integrity и вызывает QA условно при PASS_NEEDS_E2E; root QA :43–70,364–385 разделяет stage evidence. Code-only PASS и E2E разные случаи.
- Consumer: root nacl-tl-release/SKILL.md:432–446,975–987 описывает чтение Task status/evidence для FEATURE PR; :162–170,186–194 требует QA aggregate и prod-golden-path evidence при mandatory stage. Health 200 и test-GREEN не равны этой QA проверке.
- Rework/recovery: root verify :265–290 и nacl-tl-reopened/SKILL.md:5–10,13–38 описывают обработку non-PASS, при BLOCKED предусмотрен выбор пользователя между ToRelease с advisory и Reopened; это изменение tracker, не автоматический fix/re-run; root release :880–895 описывает resume через .tl/release-status.json. Это не доказательство повторной валидации после crash.

QA source структурирует qa_aggregate_status (root qa :568–584), release требует qa-stage:prod-golden-path:VERIFIED; этот точный literal в QA SKILL не найден при поиске. Преобразование/transport и parser неизвестны. Root verify использует QA PASS/FAIL, QA также описывает expanded statuses; mapping не доказан. Реальный один SHA/env, persistence, consumer и retry не наблюдались.

## Graph Task → local status → resume

Условный случай: graph commit Task UC-101-FE завершился, процесс прерван до записи .tl/status.json.

- **Local root:** nacl-tl-full/SKILL.md:912–936 предписывает graph first→JSON и одновременно требует both-or-neither; последовательные операции сами не доказывают атомарность graph+файл. :925–936,1180–1185 предписывают оператору diagnose и восстановление JSON из graph перед resume; конкретный автоматический writer diagnose этими ссылками не доказан. При graph-write failure :1157–1163 допускает forensic in-flight result в JSON, не завершение фазы.
- **Remote root:** full :941–960 и nacl-tl-core/references/remote-mode-coordination.md:8–19,50–58 делают graph sole authority, cache per-clone best-effort, graph-unavailable→HALT. Разница cache может быть ожидаемой; root tl-diagnose :417–423 и Codex tl-diagnose :53–57 различают её с stale graph signals.
- **Package overlay:** codex-plugin-src/workflow-overlays/nacl-tl-full/SKILL.md:198–220 различает local divergence UNVERIFIED и remote graph-only resume, claim/fence/CAS. Legacy skills-for-codex/nacl-tl-full/SKILL.md:187–208 использует другой claim contour; не приравнивать их.

Предлагаемый контроль: injected interruption после graph commit, exact Task/phase/revision/evidence и pre/post JSON; local требует reconciliation/read-back, remote — graph authority при валидном claim. Отдельные negatives: graph unavailable, потерянный lease, unknown outcome, stale worker, unrelated tasks. Positive proposed: local JSON восстановлен с graph read-back, remote resume из graph при валидном claim с допустимо stale cache. Negative: interruption до durable JSON flush и unknown graph-write outcome; внешнее действие не повторять без проверенного receipt. Atomicity, safe retry, внешние side effects и восстановление не доказаны; ни один test не исполнен.
