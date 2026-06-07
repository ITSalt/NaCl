NaCl 2.17.0 — stack-de-prescription

The framework stops deciding which Node version you run. A real project's agent recorded an architecture decision overriding "Node 22.x — the nacl-init template default" and a PM2 process manager it believed the framework required. Neither was ever a framework decision: NaCl is methodology, not a stack. The pins had leaked from CI/CD workflow templates, and reads-as-law wording in the TL reference docs had turned one stack's conventions into apparent mandates. A methodology framework must not have a favorite technology stack — this release removes every framework-supplied technology default.

What's inside:

— **Versions are the project's decision.** Deploy and docker-compose dev templates now carry `${NODE_VERSION}` / `${POSTGRES_VERSION}` / `${REDIS_VERSION}` placeholders instead of pins; PM2 is marked as one example process manager. A new CI gate (`scripts/check-version-pins.sh`, escape hatch `# version-pin-ok`) fails any future PR that re-introduces a pin into a project-facing template. NaCl's own graph infrastructure keeps its pins — that stack IS the framework's decision.

— **Stack profiles instead of silent law.** The rich Node/TS/React guidance (code style, frontend rules, review checklists, dev environment) is retained in full — but now opens with an explicit "Applicability — Stack profile: Node/TS" header: it applies when `config.yaml → modules.<m>.stack` says so, and other ecosystems adapt the principles. "MUST follow" became "SHOULD for Node/TS projects". A React project loses nothing; a Django project stops being silently fed React rules.

— **Config-first runner discovery.** `nacl-tl-dev-be/-fe` resolve the test command as: `config.yaml → modules.<m>.test_cmd` first, then ecosystem-native discovery (Node: `package.json scripts.test`), then NO_INFRA. The honest-TDD core is verbatim-unchanged: run exactly the discovered command, never invent a runner. The hardcoded "FE Technology Stack" table is gone.

— **nacl-init never invents a stack.** Detection is an ordered probe over manifest files across eight ecosystems (Node, Python, Go, Rust, JVM, .NET, PHP, Ruby); ambiguity means asking the user, never falling back to a built-in default. Smoke-verified: a scratch init emits `stack: "unspecified"` and zero named technologies.

The single source of truth for a project's stack is `config.yaml → modules.*` — never a template, never a reference doc, never a framework default.

Release notes: docs/releases/2.17.0-stack-de-prescription/release-notes.md
