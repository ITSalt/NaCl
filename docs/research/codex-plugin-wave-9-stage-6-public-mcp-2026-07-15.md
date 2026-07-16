# Wave 9 Stage 6 — локальная реализация public MCP

Дата: 2026-07-15

Stage 5 implementation SHA: `6d108d4124992b1f5e0e68836fe3492515c6622d`

Stage 6 base SHA: `145c4ec7d633b97d739e27b2393c83f335cc2065`

Принятый Stage 6 implementation SHA: `f81fe95a7cf3ba0dc69fd0baa5986e1a1641af2d`

Ветка: `codex/plugin-09-stage3-fresh-main`

Статус: `VERIFIED` только для локального объёма Stage 6

Независимый security reviewer вернул для точного SHA
`f81fe95a7cf3ba0dc69fd0baa5986e1a1641af2d` явный вердикт:

> ACCEPT. No Stage6 blocking defects.

Это не aggregate-приёмка Wave 9 и не статус
`LOCAL_IMPLEMENTATION_VERIFIED`. Stage 6 не создавал и не изменял реальный VPS,
DNS/TLS, OAuth provider, сертификаты или credentials, deployment, OpenAI portal,
`main`, remote branch, tag или release.

## Реализованная граница

- Добавлен отдельный provider-neutral сервис `services/nacl-mcp` на официальном
  MCP SDK `1.29.0` и Streamable HTTP protocol `2025-11-25`. Локальный
  cache-contained `stdio` MCP остаётся отдельным каналом и не заменён.
- Публичный каталог закрыт семью инструментами: list, summary, named read,
  bounded project mutation, reviewed schema migration, backup и isolated
  restore request. Инструменты не принимают raw Cypher, URI/host/URL, путь,
  пароль, certificate path, issuer, subject, server ID или provenance как
  основание для маршрутизации или авторизации.
- OAuth bearer verifier является deployment adapter, а не самописным
  authorization server. На каждом вызове проверяются canonical issuer,
  audience/resource, time bounds, exact scope, token epoch и session state.
  Identity, session, audit pseudonyms и rate-limit keys разделены по issuer.
- Авторизация сохраняет ADR-004: route разрешается по server-side registry как
  `(authorized_server_id, project_scope)`, а grant действует на все проекты
  разрешённого сервера и не распространяется на другой сервер. Grant, rotate и
  revoke используют CAS intent, authoritative projection read-back и
  reconciliation; неоднозначный результат не объявляется успешным.
- Production composition требует внешние shared/durable rate limiter,
  idempotency ledger, session registry, authorization-state registry и audit
  sink. Process-local реализации разрешены только как тестовые helpers и
  отвергаются production service composition.
- Release-only builder создаёт `.mcp.json` с точным remote HTTP binding и
  `.app.json` только при валидных HTTPS `/mcp` URL и внешне выданном app ID.
  В committed `plugins/nacl` нет активного `.app.json`, и его `.mcp.json`
  остаётся локальным `stdio` binding.
- Добавлены deterministic source bundle и tar archive, normalized CycloneDX
  dependency/bundle SBOM, pinned rootless container и локальные CI entry points.
  Container base закреплён digest, runtime проверен как Node `v20.20.0`, процесс
  запускается не от root; health check использует configured resource host.

Официальные OpenAI build/submission/auth/security contracts были обновлены в
ADR-004 2026-07-15. Этот checkpoint реализует provider-neutral source contract,
но не утверждает наличие portal-issued app ID или публичного endpoint.

## История корректировок

Диапазон `145c4ec7..f81fe95a` содержит 17 изолированных implementation/fix/test
коммитов. Среди обязательных исправлений:

- `94e743b29a996135d4b74e8b022a4c79cd46883f` — отдельный CI registration gate
  для production container smoke; после него generic contracts снова прошли
  как `241 passed / 0 failed / 5 allowed Docker skips`;
- `7d2d647bbff6efe37ea3e8b5ce7f3dd1f2812cc3` — binding container artifact
  provenance к source/archive/VCS digests;
- `d09b157539414d7b5e5437982f82e521e1da0abe` — сериализация identity transitions;
- `ed8716b0f186575ccb5c51180faef2227a6ab55d`,
  `7040b1b660529c062c4822c7233aa41847a5bfd7` и
  `f7736e05b56afd7df91879b76eea9e8e1b247de1` — durable intents,
  authoritative projection read-back и сохранение ambiguous intent;
- `f81fe95a7cf3ba0dc69fd0baa5986e1a1641af2d` — единая canonical OAuth issuer
  identity во всех identity/session/control-plane границах.

## Точные локальные доказательства

| Gate | Результат на accepted implementation SHA |
|---|---|
| Independent security review | `ACCEPT`; blocking defects: 0 |
| `test:production-mcp` | 54 passed, 0 failed, 1 opt-in Docker skip; release/bundle 3/3; `npm audit --omit=dev`: 0 vulnerabilities; deterministic SBOM generation/check passed |
| `test:production-mcp-container` с opt-in Docker | 1/1; Node `v20.20.0`, rootless process, digest/provenance/health checks passed; invalid source/archive bindings rejected |
| `test:production-mcp-docker` с opt-in Docker | 1/1; same-server A1/A2 positive, cross-server B1 fail-closed, forged route rejected, rotate/revoke stale-session checks passed |
| Full Codex contracts | 246 total: 241 passed, 0 failed, 5 allowed Docker skips |
| Package / graph / workflow | 83/83, 89/89, 38/38 |
| Claude isolation / builder | immutable Claude namespaces and generated parity `VERIFIED`; builder 31/31 |
| Plugin docs / closure / manifest | 40 documents; closure 382 files; 10 public skills; 60 workflows; manifest `VERIFIED` |
| Release-shaped plugin fixture | system validator exit 0 for generated HTTPS HTTP binding plus synthetic non-placeholder app ID |
| Source isolation | `git diff 145c4ec..f81fe95 -- plugin .github/workflows/build-plugin.yml --exit-code` passed |
| Secret/path check | exact personal-path and common-secret scan passed |
| Cleanup | zero Stage 6 containers, labeled volumes and container-smoke images remained |

Deterministic artifact identities:

- source digest:
  `765beec94341e6bbf93f7c039fe9e08a93947c7f2078c00f65efec1925d3aaec`;
- archive SHA-256:
  `2c54197f67c3ee2cf3048b8046b417a07b24a73405940f447b79c62e960c32fc`.

## Точная граница Docker-доказательства

Docker topology test действительно поднял три независимых Neo4j Community
`5.24.2` контейнера и три volume: два проекта на server A и один на server B.
Каждый контейнер получил уникальный ephemeral loopback HTTP port и собственный
marker; public MCP вызовы дошли до соответствующих физических контейнеров.

Но этот тест подключался к Neo4j напрямую по локальному HTTP и одному
сгенерированному fixture-паролю. Он не поднимал ghostunnel gateway, private CA,
mTLS client certificates или разные production secret sources. Server registry
в fixture использует process-local `Set`, а memory session/authorization/audit/
rate-limit/idempotency helpers лишь снабжены contract markers `durable`/
`shared`, чтобы проверить production composition guard. Поэтому тест доказывает
route isolation и public authorization behavior, но не реальный gateway/mTLS,
не password separation и не restart/shared-state semantics.

## Непроверенные обязательные ворота

Остаются `NOT_RUN` и не могут быть выведены из локального Stage 6:

- реальные durable/shared adapters и проверка restart/failover semantics;
- реальная gateway/mTLS projection, private CA, issue/rotation/revoke и
  per-project secret sources;
- внешний OAuth/OIDC provider, PKCE/CIMD flow и provider revocation;
- публичный TLS endpoint, DNS/domain verification, CSP и external reachability;
- clean-machine/two-user installation и полная user journey после будущего
  отдельно разрешённого merge/release;
- container-image SBOM, SAST, secret, privacy, container, IaC и exposed-endpoint
  scans; multi-arch image verification;
- hosted CI, production deployment, legal/support/public metadata и настоящий
  app ID;
- реальные backup/external-restore drills через public boundary.

SBOM manifest перечисляет отсутствующие scanner gates в поле `notRun`; наличие
двух reproducible CycloneDX документов не подменяет эти сканы.

## Disposition

Stage 6 локально принят на точном implementation SHA
`f81fe95a7cf3ba0dc69fd0baa5986e1a1641af2d`. Wave 9 остаётся `IN_PROGRESS` и
не получает `LOCAL_IMPLEMENTATION_VERIFIED`, пока перечисленные обязательные
локальные security/privacy/restart и интеграционные ворота не будут реализованы
и независимо приняты. Stage 7 этим evidence не запущен.
