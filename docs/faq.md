[Home](../README.md) > FAQ

# FAQ

---

**Can I use NaCl without Neo4j?**

Partially. Some TL layer skills — `nacl-tl-dev-be`, `nacl-tl-dev-fe`, `nacl-tl-review`, `nacl-tl-qa`, `nacl-tl-ship`, `nacl-tl-deploy` — work standalone: they read from task files in `.tl/tasks/` and operate entirely on the local filesystem. `nacl-tl-plan` is not one of them: it is graph-based and hard-stops without SA data in Neo4j, and several other TL skills (`nacl-tl-status`, `nacl-tl-next`, `nacl-tl-intake`, `nacl-tl-conductor`, `nacl-tl-full`) are graph-aware too. The BA and SA layers require a running Neo4j instance because all analysis artifacts are stored as graph nodes. If you only need TDD development, code review, QA, and deployment on tasks someone else already planned, you can skip Neo4j for that subset — but planning itself needs the graph.

---

**Does it work with the Claude Code Desktop app and IDE extensions?**

Yes, but Claude Code Desktop has its own install channel since v2.24.0: the `nacl` plugin, installed from the in-app marketplace (`/plugin marketplace add ITSalt/NaCl` then `/plugin install nacl@nacl`), with skills namespaced as `/nacl:<name>`. The Claude Code CLI and IDE extensions use the symlinked-skills channel (`~/.claude/skills/`) instead. Pick **one** channel per machine — do not install both; the plugin's SessionStart hook detects a symlinked install and warns if it finds one. See [Skill Installation](setup/install-skills.md) for the full channel matrix. The one unsupported surface is the claude.ai web app — it runs in a sandbox without local filesystem access, so slash commands that invoke skills are not available there.

---

**Can I use just the TL skills without BA or SA?**

Yes. The TL layer is fully independent. You can write task files in `.tl/tasks/` manually (or have any skill generate them) and then run `/nacl-tl-dev-be`, `/nacl-tl-dev-fe`, `/nacl-tl-review`, `/nacl-tl-qa`, `/nacl-tl-ship`, and `/nacl-tl-deploy` without ever touching the graph. This is the recommended starting point for teams that want TDD discipline before committing to the full pipeline.

---

**BA and SA skills output Russian text. What if I need English?**

This is the default, not a hardcoded behavior. BA and SA artifacts (process maps, entity models, use case specs) default to Russian because they are typically consumed by Russian-speaking business stakeholders and analysts; TL layer prompts and outputs default to English because code, commit messages, and PRs are consumed by developers. The actual output language is resolved per invocation — an explicit `--lang=en`/`--lang=ru` flag wins, then `project.lang` in `config.yaml`, then the layer default (see `nacl-core/lang-directive.md`) — so you don't need an English skill variant: pass `--lang=en` or set `project.lang: en` in `config.yaml`.

---

**How do I add a new skill?**

See [docs/contributing.md](contributing.md) for the full process. In short: create a directory named `nacl-{layer}-{action}/`, add a `SKILL.md` with YAML frontmatter (`name`, `model`, `effort`, `description`) and the skill prompt body, then test it by linking the directory into `~/.claude/skills/`.

---

**What Claude model does NaCl require?**

NaCl works with any Claude model available in Claude Code. Each skill declares its preferred model tier in SKILL.md frontmatter (`opus`, `sonnet`, or `haiku`), and Claude Code's agent routing matches the task complexity to the appropriate tier. Strategist-level orchestrators (BA/SA full runs, conductor) use higher-capability models; routine tasks like commit/push use lighter models. You can override model selection per session if needed.

---

**How much does it cost to run?**

Cost depends entirely on model usage and task volume. Scout/Haiku-tier skills (deploy monitoring, ship, formatting) are cheapest. Strategist/Opus-tier skills (BA full analysis, SA architecture) are most expensive because they involve long reasoning chains over large context. A typical full pipeline run for a medium-sized feature — BA analysis through shipping — costs roughly the same as 30-60 minutes of solo Claude Code usage. Running only TL skills for an already-specified project is significantly cheaper.

---

**Can I use NaCl with an existing project?**

Yes, in two ways. For a project with no prior analysis docs, run `/nacl-init "My Project"` in your project directory — it creates `CLAUDE.md`, `config.yaml`, and the Docker infrastructure config (`.tl/` and `docs/` are created later, on demand, by `sa-full`, `ba-full`, and `nacl-tl-plan` when you actually invoke them). For a project that already has Markdown-based requirements, specs, or architecture docs, run `/nacl-migrate` — it reads your existing documents and imports them into the graph as properly typed nodes, so you can use BA/SA query and validation skills from that point forward.
