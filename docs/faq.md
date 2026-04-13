[Home](../README.md) > FAQ

# FAQ

---

**Can I use NaCl without Neo4j?**

Partially. The TL layer skills (`nacl-tl-*`) work standalone — they read from task files in `.tl/tasks/` and operate entirely on the local filesystem. The BA and SA layers require a running Neo4j instance because all analysis artifacts are stored as graph nodes. If you only need planning, TDD development, code review, QA, and deployment, you can skip Neo4j entirely.

---

**Does it work with the Claude Code Desktop app and IDE extensions?**

Yes. Skills are installed into `~/.claude/skills/` and are shared across all local Claude Code interfaces: the CLI, the Desktop app (Mac/Windows), and IDE extensions (VS Code, JetBrains). Install once, use everywhere. The one exception is the claude.ai web app — it runs in a sandbox without local filesystem access, so slash commands that invoke skills are not available there.

---

**Can I use just the TL skills without BA or SA?**

Yes. The TL layer is fully independent. You can write task files in `.tl/tasks/` manually (or have any skill generate them) and then run `/nacl-tl-dev-be`, `/nacl-tl-dev-fe`, `/nacl-tl-review`, `/nacl-tl-qa`, `/nacl-tl-ship`, and `/nacl-tl-deploy` without ever touching the graph. This is the recommended starting point for teams that want TDD discipline before committing to the full pipeline.

---

**BA and SA skills output Russian text. What if I need English?**

This is intentional. BA and SA skill prompts are written in Russian because those artifacts (process maps, entity models, use case specs) are consumed by Russian-speaking business stakeholders and analysts. TL layer prompts and outputs are in English because code, commit messages, and PRs are consumed by developers. If your team needs English BA/SA output, community-contributed English skill variants are welcome — see [docs/contributing.md](contributing.md).

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

Yes, in two ways. For a project with no prior analysis docs, run `/nacl-init "My Project"` in your project directory — it scaffolds `config.yaml`, `.tl/`, and the Docker infrastructure config. For a project that already has Markdown-based requirements, specs, or architecture docs, run `/nacl-migrate` — it reads your existing documents and imports them into the graph as properly typed nodes, so you can use BA/SA query and validation skills from that point forward.
