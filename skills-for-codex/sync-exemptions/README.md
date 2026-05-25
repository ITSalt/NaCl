# Codex Sync Exemptions

Use this directory only when a root `nacl-*/SKILL.md` change intentionally does
not need a matching `skills-for-codex/<skill>/SKILL.md` change.

Each exemption file must be named `<skill>.md` and contain these lines:

```text
Source root: <commit-or-pr>
Intentional divergence: <short reason>
Next review: <date-or-release>
```

Do not use exemptions as permanent bypasses. Re-check them during each release
that touches the related root skill.
