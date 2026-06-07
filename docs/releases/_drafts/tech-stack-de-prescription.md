# Draft fragment: tech-stack de-prescription

> Absorb into the next release's release-notes.md, then delete this file.

## Story

A client project's agent recorded an architecture decision overriding
"Node 22.x — the nacl-init template default" and a PM2 process manager it
believed the framework required. Neither was ever meant to be a framework
decision: NaCl is methodology, not a stack. The pins leaked from
`nacl-tl-core/templates/deploy-*.yml` and reads-as-law wording in the TL
reference docs.

## What shipped

- **Versions are the project's decision.** Deploy and docker-compose dev
  templates carry `${NODE_VERSION}` / `${POSTGRES_VERSION}` / `${REDIS_VERSION}`
  placeholders instead of pins; a CI gate (`scripts/check-version-pins.sh`,
  escape hatch `# version-pin-ok`) prevents the regression class. Graph-infra
  compose files (NaCl's own stack) are exempt.
- **Stack profiles, not silent law.** All Node/TS/React-specific reference
  docs now open with an "Applicability — Stack profile" header: full React/
  RTL/Zod/Tailwind guidance is retained for projects on that stack; other
  ecosystems are told to adapt the principles. `config.yaml → modules.*.stack`
  is the single source of truth.
- **Config-first runner discovery.** `nacl-tl-dev-be/-fe` DISCOVER RUNNER:
  `config.yaml modules.<m>.test_cmd` → ecosystem-native discovery → NO_INFRA.
  The "run exactly the discovered command" honesty rule is verbatim-unchanged.
- **nacl-init never invents a stack.** Multi-ecosystem manifest detection
  (package.json / pyproject.toml / go.mod / Cargo.toml / ...); ambiguity → ask
  the user; smoke-verified that a scratch init emits `stack: "unspecified"`
  and zero named technologies.

## TG-post angle (RU)

«Фреймворк перестал решать за вас, какой Node ставить»: история о том, как
дефолт из шаблона CI-workflow стал «архитектурным решением» в чужом проекте,
и почему у методологии не должно быть любимого стека. Механизм: stack-профили
вместо молчаливого закона + CI-гейт на пины версий.
