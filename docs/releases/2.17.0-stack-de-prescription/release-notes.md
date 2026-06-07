# Release 2.17.0 — `stack-de-prescription`

## Theme

A methodology framework must not have a favorite technology stack. A real
project's agent recorded an architecture decision overriding "Node 22.x — the
nacl-init template default" and a PM2 process manager it believed the
framework required. Neither was ever a framework decision — the pins leaked
from CI/CD workflow templates, and reads-as-law wording in the TL reference
docs turned one stack's conventions into apparent mandates. This release
removes every framework-supplied technology default and replaces silent
prescription with two explicit mechanisms: `config.yaml` as the single source
of truth for the project's stack, and clearly-labeled **stack profiles** for
the tech-specific guidance the framework ships.

## Versions are the project's decision

The project-facing infra templates no longer pin versions:

- `deploy-backend.yml` / `deploy-frontend.yml`: `node-version: '22'` →
  `${NODE_VERSION}` placeholder; both files open with a stack-profile header
  ("this is a Node/npm reference profile, not a NaCl mandate") and PM2 is
  marked as one example process manager.
- `docker-compose-dev-template.yml`: `postgres:16-alpine` / `redis:7-alpine`
  → `${POSTGRES_VERSION}` / `${REDIS_VERSION}` (settable in `.env`); the
  PostgreSQL/Redis/MinIO service set is framed as an example composition —
  include only what the project actually needs.

A new CI gate (`scripts/check-version-pins.sh`, wired into `lint-skills.yml`)
fails any future PR that pins a version in these templates without an
explicit `# version-pin-ok` marker. The graph stack
(`graph-docker-compose.yml`, `graph-infra/`) is NaCl's own infrastructure
with legitimately pinned versions — out of the gate's scope by design.

## Stack profiles, not silent law

The rich Node/TS/React guidance the TL suite ships is retained **in full** —
but it now says what it is. Seven reference docs (`code-style`,
`frontend-rules`, `fe-code-style`, `fe-review-checklist`, `review-checklist`
incl. the Codex copy, `dev-environment`, `tl-protocol`) open with an
"Applicability — Stack profile: Node.js/TypeScript" header: the document is a
reference profile for projects whose `config.yaml → modules.<m>.stack` is
Node/TS; other ecosystems apply the principles and adapt the tooling.
"All code produced by TL skills MUST follow" became "Code in a Node/TS
project SHOULD follow". A React project loses nothing; a non-React project
gets an honest "adapt to your stack" instead of silently-fed React rules.

The same treatment covers the FE task templates (`impl-brief-fe`,
`test-spec-fe`): `architecture_type` and the test tooling
(`test_framework`/`test_library`/`mock_server`) are now explicitly
project-chosen values, with the React/Next.js profile kept as the worked
example. The task-file *structure* (files-to-create, integration points, TDD
order, test-case categories) is stack-agnostic and unchanged.

## Config-first runner discovery

`nacl-tl-dev-be` / `nacl-tl-dev-fe` Step 3.0 DISCOVER RUNNER now resolves the
test command in declared order: `config.yaml → modules.<m>.test_cmd` first,
then ecosystem-native discovery (Node: nearest `package.json` →
`scripts.test`; other ecosystems plug in via the project's documented
command), then `NO_INFRA`. The honest-TDD core is verbatim-unchanged: run
exactly the discovered command at every test step, never invent a runner.
The FE skill's hardcoded "FE Technology Stack" table is gone — replaced by a
pointer to `config.yaml` and the profile reference docs.

## nacl-init never invents a stack

Stack detection in `/nacl-init` is now an explicit ordered probe over
manifest files across eight ecosystems (Node, Python, Go, Rust, JVM, .NET,
PHP, Ruby), with a hard rule: if detection is ambiguous or finds nothing, ask
the user — **never fill `{{TECH_STACK}}` or `modules.*.stack` from a built-in
default**. The `config-yaml-template.yaml` module examples (root + Codex) no
longer carry filled-in npm/Next.js/Fastify values — placeholder shape with
multi-stack hints. Smoke-verified: a scratch-directory init emits
`stack: "unspecified"` and zero named technologies.

## Docs

`README.ru` prerequisites no longer tie Node.js to "frontend development"
(it is needed only for NaCl's optional CLI tools, matching the EN README and
quickstart); the SA-layer methodology docs (EN+RU) describe form-domain code
generation as producing "UI form components in the project's stack" rather
than React components.

## Verification

Codex-sync gate VERIFIED (four sync-exemptions: the Codex skill variants
were already stack-agnostic); `check-version-pins.sh` and
`check-branch-literals.sh` clean; privacy canary on the full diff clean;
`nacl-init-project.sh` smoke test on a scratch directory produced a
config.yaml with `stack: "unspecified"` and no invented technologies.

## Files

`nacl-tl-core/templates/{deploy-backend,deploy-frontend,docker-compose-dev-template}.yml`,
`nacl-tl-core/templates/{impl-brief-fe,test-spec-fe}-template.md`,
`nacl-tl-core/templates/config-yaml-template.yaml` (+ Codex copy),
`nacl-tl-core/references/{code-style,frontend-rules,fe-code-style,fe-review-checklist,review-checklist,dev-environment,tl-protocol}.md`
(+ Codex review-checklist copy), `nacl-tl-dev-be`, `nacl-tl-dev-fe`,
`nacl-tl-deploy`, `nacl-init`, `.claude/agents/developer.md`,
`scripts/check-version-pins.sh` (new), `.github/workflows/lint-skills.yml`,
four sync-exemptions, `README.ru.md`, `docs/methodology/sa-layer{,.ru}.md`.
