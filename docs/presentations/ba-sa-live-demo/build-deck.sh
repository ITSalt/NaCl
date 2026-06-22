#!/usr/bin/env bash
# Build deck.md (Marp) from slides/*.md.
# If @mermaid-js/mermaid-cli (mmdc) is installed, pre-renders mermaid blocks
# into assets/*.svg and substitutes image refs in deck.md (slide sources keep
# the mermaid code). Without mmdc the code blocks are left as-is.
#
# Usage:
#   bash build-deck.sh
#   npx @marp-team/marp-cli deck.md -o deck.html
set -euo pipefail
cd "$(dirname "$0")"

OUT=deck.md

{
  cat <<'FRONTMATTER'
---
marp: true
theme: default
paginate: true
style: |
  section { font-size: 23px; }
  section h1 { font-size: 36px; }
  table { font-size: 18px; }
  pre, code { font-size: 0.85em; }
  blockquote { font-size: 1.05em; font-style: italic; }
---
FRONTMATTER
  first=1
  for f in slides/*.md; do
    if [ "$first" -eq 0 ]; then
      printf '\n---\n\n'
    fi
    first=0
    cat "$f"
    printf '\n'
  done
} > "$OUT"

SLIDE_COUNT=$(ls slides/*.md | wc -l | tr -d ' ')
echo "deck.md assembled from ${SLIDE_COUNT} slides."

# --- optional: pre-render mermaid blocks ------------------------------------
if command -v mmdc >/dev/null 2>&1; then
  mkdir -p assets
  python3 - <<'PYEOF'
import pathlib, re, subprocess, tempfile

deck = pathlib.Path("deck.md")
text = deck.read_text(encoding="utf-8")
pattern = re.compile(r"```mermaid\n(.*?)```\n?", re.DOTALL)
counter = 0

def render(match):
    global counter
    counter += 1
    svg = pathlib.Path("assets") / f"diag-{counter:02d}.svg"
    with tempfile.NamedTemporaryFile("w", suffix=".mmd", delete=False) as tmp:
        tmp.write(match.group(1))
        tmp_path = tmp.name
    subprocess.run(["mmdc", "-i", tmp_path, "-o", str(svg)],
                   check=True, capture_output=True)
    return f"![diagram]({svg})\n"

text = pattern.sub(render, text)
deck.write_text(text, encoding="utf-8")
print(f"mermaid: {counter} diagram(s) pre-rendered to assets/")
PYEOF
else
  echo "mmdc not found — mermaid blocks left as code (install: npm i -g @mermaid-js/mermaid-cli)."
fi
