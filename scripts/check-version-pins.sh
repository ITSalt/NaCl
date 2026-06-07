#!/usr/bin/env sh
# check-version-pins.sh — fail if a project-facing template pins a technology
# version (Node, Docker image tags) without an explicit `# version-pin-ok`.
#
# Why: NaCl is technology-agnostic — versions are the PROJECT's decision,
# sourced from config.yaml / the detected toolchain. A pinned version in a
# template silently becomes "the framework default": a real project recorded
# a decision overriding "Node 22.x — the nacl-init template default" that the
# framework never intended to set. This gate prevents the regression class.
#
# Scope: ONLY the project-facing infra templates listed below. The graph
# stack (nacl-tl-core/templates/graph-docker-compose.yml, graph-infra/) is
# NaCl's own infrastructure with legitimately pinned versions — out of scope.
# Escape hatch: append `# version-pin-ok` to a line to whitelist it
# (placeholders like ${NODE_VERSION} still carry the marker for clarity).
set -eu

TEMPLATES="
nacl-tl-core/templates/deploy-backend.yml
nacl-tl-core/templates/deploy-frontend.yml
nacl-tl-core/templates/docker-compose-dev-template.yml
"

found=0
for f in $TEMPLATES; do
  [ -f "$f" ] || continue
  out=$(awk '
    {
      if ($0 ~ /version-pin-ok/) next
      # node-version: '\''22'\'' / node-version: 22
      if ($0 ~ /node-version:[[:space:]]*'\''?[0-9]/) { printf("%d: %s\n", NR, $0); next }
      # image: name:1.2 / name:16-alpine (a tag starting with a digit = a pin)
      if ($0 ~ /image:[[:space:]]*[A-Za-z0-9._\/-]+:[0-9]/) { printf("%d: %s\n", NR, $0); next }
    }
  ' "$f")
  if [ -n "$out" ]; then
    echo "ERROR: hardcoded version pin in a project-facing template — versions are the project's decision:"
    echo "$out" | sed "s|^|  $f:|"
    found=1
  fi
done

if [ "$found" -ne 0 ]; then
  echo ""
  echo "Fix: replace the pin with a placeholder (\${NODE_VERSION}, \${POSTGRES_VERSION}, ...)"
  echo "and a comment telling the project to set its own version."
  echo "If a pin is genuinely intentional, append '# version-pin-ok' to that line."
  exit 1
fi
echo "No framework-default version pins in project-facing templates."
