#!/usr/bin/env sh
# check-branch-literals.sh — fail if any tracked .md hardcodes a git branch name
# (main / master / develop) inside a shell code fence, instead of resolving it
# from config.yaml ({main_branch} / <git_base_branch>).
#
# Why: skills resolve the base branch from
#   `config.yaml -> git.main_branch > modules.[name].git_base_branch > "main"`.
# A literal branch in a git/gh command silently breaks on any project whose base
# branch is not the hardcoded value — exactly how a stale `develop` / `main`
# slips through (see nacl-tl-core/references/config-schema.md "Branch-name
# discipline" and tl-protocol.md "Skill / framework defects").
#
# Scope: only lines INSIDE ```bash / ```sh / ```shell / ```zsh / ```console
# fences are scanned. Prose, output/display blocks (plain ``` fences), and
# prohibition rules are NOT scanned — so the few intentional documentation
# mentions (e.g. nacl-tl-ship's "No git checkout main" rule) do not trip.
# Escape hatch: append `# branch-literal-ok` to a line to whitelist it.
#
# This is a CI backstop for NaCl-repo authoring; it does not constrain any
# agent's freedom to inspect files. The primary prevention is the runtime
# behavioral rule in tl-protocol.md (surface a skill contradiction and wait).
set -eu

found=0
for f in $(git ls-files '*.md'); do
  out=$(awk '
    BEGIN { infence = 0 }
    /^[[:space:]]*```/ {
      if (infence == 0) {
        info = $0
        sub(/^[[:space:]]*```/, "", info)
        gsub(/[[:space:]]/, "", info)
        if (info == "bash" || info == "sh" || info == "shell" || info == "zsh" || info == "console")
          infence = 1
        else
          infence = 2
      } else {
        infence = 0
      }
      next
    }
    infence == 1 {
      if ($0 ~ /branch-literal-ok/) next
      has_cmd = ($0 ~ /git[[:space:]]+(checkout|switch|fetch|pull|merge|rebase|rev-parse|log|diff)/) \
             || ($0 ~ /--base[[:space:]]/) \
             || ($0 ~ /gh[[:space:]]+pr/)
      has_lit = ($0 ~ /[[:space:]](main|master|develop)([[:space:].:~^"]|$)/)
      if (has_cmd && has_lit) printf("%d: %s\n", NR, $0)
    }
  ' "$f")
  if [ -n "$out" ]; then
    echo "ERROR: hardcoded branch name in a git command — resolve from config ({main_branch}) instead:"
    echo "$out" | sed "s|^|  $f:|"
    found=1
  fi
done

if [ "$found" -ne 0 ]; then
  echo ""
  echo "Fix: replace the literal branch with the resolved variable (e.g. {main_branch})."
  echo "If a literal is genuinely intentional, append '# branch-literal-ok' to that line."
  exit 1
fi
echo "No hardcoded branch literals in shell fences."
