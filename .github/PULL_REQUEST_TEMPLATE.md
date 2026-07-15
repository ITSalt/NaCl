## Summary

<!-- Brief description of changes -->

## Type of Change

- [ ] New skill
- [ ] Skill improvement
- [ ] Bug fix
- [ ] Documentation
- [ ] CI/CD
- [ ] CLI tool change

## Related Issues

<!-- Link to related issues: Fixes #123, Related to #456 -->

## Checklist

- [ ] SKILL.md has YAML frontmatter with `name` field
- [ ] Directory name matches the `name` in frontmatter
- [ ] Tested locally with Claude Code
- [ ] No hardcoded paths (`~/projects/`, `/Users/`)
- [ ] No credentials or API keys in code
- [ ] Follows naming conventions (`nacl-{layer}-{action}`, e.g. `nacl-ba-context`)
- [ ] Documentation updated if needed
- [ ] If a root `nacl-*/SKILL.md` changed: mirrored the same change in `skills-for-codex/` (or the sync exemption applies) — see `skills-for-codex/scripts/check-root-codex-sync.sh`
- [ ] If `nacl-*/**`, `.claude/agents/**`, or `graph-infra/**` changed: rebuilt the committed `plugin/` artifact (`node scripts/build-plugin.mjs`) and committed the result
