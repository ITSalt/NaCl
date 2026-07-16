# Wave 9 — финальная локальная security/privacy/release QA

Дата: 2026-07-16

QA target SHA:
`9fea16e2cbd47dabe97cd47bf1fba329844d866c`

Принятый implementation SHA Stage 7:
`fac5087230579d029bc6aa612f7dbdef386031a0`

Статус: `ACCEPT LOCAL CHECKPOINT / PARTIALLY_VERIFIED`.

Это ограниченный локальный checkpoint. Он подтверждает проверенный
provider-neutral source, generated package, disposable Docker fixtures,
воспроизводимость и локальные security/privacy проверки, но не присваивает
Wave 9 статус `LOCAL_IMPLEMENTATION_VERIFIED` или `VERIFIED` и не означает
submission-ready.

## Независимый вердикт

Независимый read-only security/release QA не нашёл блокирующих дефектов на
точном QA target SHA. Проверены кумулятивные изменения Stages 6-7, package,
production MCP, Docker entry points, release binding, disclosure, reviewer
fixtures, Claude isolation и cleanup.

Вердикт: `ACCEPT LOCAL CHECKPOINT / PARTIALLY_VERIFIED`.

Hosted workflow не запускает Docker entry points. Это честно сохраняется как
`NOT_RUN` для hosted CI и не подменяется локальным Docker-прогоном.

## Локальные проверки

- `bash scripts/codex-plugin-ci.sh test:contracts`:
  259 total, 254 passed, 0 failed, 5 ожидаемых opt-in Docker skips.
- production MCP non-Docker:
  55 total, 54 passed, 0 failed, 1 ожидаемый opt-in Docker skip.
- focused production MCP/reviewer/binding: 13/13.
- package: 83/83.
- graph: 89/89.
- workflow: 38/38.
- `NACL_RUN_DOCKER_SMOKE=1 bash scripts/codex-plugin-ci.sh test:production-mcp-docker`:
  1/1, реальная disposable topology.
- `NACL_RUN_DOCKER_SMOKE=1 bash scripts/codex-plugin-ci.sh test:production-mcp-container`:
  1/1, rootless Node 20 container.
- Docker cleanup: ноль тестовых контейнеров, volumes и локальных smoke images.
- manifest, docs, 392-file closure, source/package parity, Claude isolation,
  builder и текущий системный OpenAI plugin validator: `VERIFIED`.
- `npm --prefix services/nacl-mcp audit --omit=dev`:
  0 vulnerabilities.
- ограниченный локальный secret/privacy scan по реальным source/package/service
  roots: `PASS`; private-key headers, распространённые token prefixes,
  длинные bearer tokens и персональные absolute home paths не найдены.
- `git diff --check`: `PASS`.

Production MCP bundle остался воспроизводимым:

- source digest:
  `661f91347f56a5e20e8266bc1bb8ff54558277408d92819d49fad7c1c6de7736`;
- archive digest:
  `dc2e739742674f88907e0fb894f3077a8bd41275007ddcce9994a2121543a6a4`;
- package tree manifest digest:
  `9edc1e73e929e440b03561c055e0f5aa6ac36fe4882c5060c1c54695205492c2`;
- install tar digest:
  `b9582acdcbaee40f88bc1082f7c728373dc672c1a726840627324d219c5399bc`.

Повторная external pre-freeze binding-проверка на QA target SHA сформировала
status `NOT_READY_FOR_SUBMISSION`, точно связала source с
`9fea16e2cbd47dabe97cd47bf1fba329844d866c` и сохранила ожидаемые состояния:
production container `NOT_BOUND`, endpoint `NOT_VERIFIED`, app ID
`NOT_PROVIDED`, signatures `NOT_SIGNED`. Временный output удалён.

## Незакрытые обязательные гейты

Следующее не выполнялось и не разрешалось этим checkpoint:

- отдельно разрешённые merge в `main`, push, tag и immutable Git release;
- clean second-machine install из выпущенного Git artifact и полный novice
  lifecycle Wave 8;
- production image digest, публичный Streamable HTTP endpoint, реальный
  gateway/mTLS/OAuth path, VPS, DNS, TLS, credentials и deploy;
- реальные durable/shared adapters, restart, backup и external restore drills;
- publisher identity, public website, privacy/terms/support/security URLs,
  regions, retention, subprocessors, availability и release notes;
- CSP/domain verification, production App ID и Apps Management portal state;
- reviewer credentials и live 5 positive + 3 negative runs;
- hosted CI Docker gates, внешние SAST/secret/privacy/container/IaC/endpoint
  scanners, multi-architecture image и signatures;
- portal draft, submission, review и publication.

Поэтому Wave 8 остаётся `PARTIALLY_VERIFIED`, Wave 9 —
`PARTIALLY_VERIFIED / LOCAL_CHECKPOINT_ACCEPTED`, а Wave 10 — `NOT_RUN`.

## Workspace safety

Fresh-main worktree после проверок чист. `origin/main` и исходный checkout
остались на `19dd5e263024a2e43e456e9f37efcfc8c8a3bc73`. В исходном checkout сохранены
ровно исходные untracked paths `.codex/`,
`docs/presentations/ba-sa-live-demo/client-brief.md` и
`docs/runbooks/codex-desktop-plugin-orchestrator.md`; их контрольные суммы не
изменились.

Никаких push, PR, merge в `main`, tag, release, deploy, portal draft,
submission или publication не выполнялось.
