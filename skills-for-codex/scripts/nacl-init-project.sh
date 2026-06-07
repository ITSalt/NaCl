#!/bin/sh

set -eu

usage() {
  cat <<'USAGE'
Usage: nacl-init-project.sh [options]

Options:
  --project-root PATH      Target project root. Default: current directory.
  --project-name NAME      Human-readable project name. Default: root basename.
  --stack TEXT             Project tech stack. Default: unspecified.
  --description TEXT       Short project description. Default: empty.
  --with-graph             Create graph-infra scaffolding.
  --no-registry            Do not update ${NACL_HOME:-$HOME/.nacl}/projects.json.
  --dry-run                Print planned actions without writing files.
  -h, --help               Show this help.
USAGE
}

script_path=$0
case $script_path in
  */*) script_dir=$(CDPATH= cd "$(dirname "$script_path")" && pwd -P) ;;
  *) script_dir=$(CDPATH= cd "." && pwd -P) ;;
esac

repo_root=$(CDPATH= cd "$script_dir/../.." && pwd -P)
project_root=$(pwd -P)
project_name=
project_stack=unspecified
project_description=
with_graph=0
write_registry=1
dry_run=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-root)
      [ "$#" -ge 2 ] || { echo "ERROR: --project-root requires a path" >&2; exit 2; }
      project_root=$2
      shift 2
      ;;
    --project-name)
      [ "$#" -ge 2 ] || { echo "ERROR: --project-name requires a value" >&2; exit 2; }
      project_name=$2
      shift 2
      ;;
    --stack)
      [ "$#" -ge 2 ] || { echo "ERROR: --stack requires a value" >&2; exit 2; }
      project_stack=$2
      shift 2
      ;;
    --description)
      [ "$#" -ge 2 ] || { echo "ERROR: --description requires a value" >&2; exit 2; }
      project_description=$2
      shift 2
      ;;
    --with-graph)
      with_graph=1
      shift
      ;;
    --no-registry)
      write_registry=0
      shift
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

project_root=$(CDPATH= cd "$project_root" && pwd -P)
if [ -z "$project_name" ]; then
  project_name=$(basename "$project_root")
fi

slug=$(printf '%s' "$project_name" \
  | tr '[:upper:]' '[:lower:]' \
  | sed 's/[[:space:]][[:space:]]*/-/g; s/[^a-z0-9_-]//g; s/^-*//; s/-*$//' \
  | cut -c 1-64)
if [ -z "$slug" ]; then
  slug=project
fi

config_template="$repo_root/nacl-tl-core/templates/config-yaml-template.yaml"
graph_compose_template="$repo_root/nacl-tl-core/templates/graph-docker-compose.yml"
schema_source="$repo_root/graph-infra/schema"
queries_source="$repo_root/graph-infra/queries"
config_path="$project_root/config.yaml"
registry_path="${NACL_HOME:-$HOME/.nacl}/projects.json"

for required in "$config_template" "$graph_compose_template" "$schema_source" "$queries_source"; do
  if [ ! -e "$required" ]; then
    echo "ERROR: required NaCl source artifact is missing: $required" >&2
    exit 1
  fi
done

planned="config.yaml"
if [ "$with_graph" -eq 1 ]; then
  planned="$planned graph-infra"
fi
if [ "$write_registry" -eq 1 ]; then
  planned="$planned registry"
fi

echo "Project root: $project_root"
echo "Project id: $slug"
echo "Planned artifacts: $planned"

if [ "$dry_run" -eq 1 ]; then
  echo "DRY_RUN: no files written"
  exit 0
fi

create_config() {
  if [ ! -f "$config_path" ]; then
    python3 - "$config_template" "$config_path" "$slug" "$project_name" "$project_stack" "$project_description" <<'PY'
import sys
template, out, project_id, name, stack, desc = sys.argv[1:]
text = open(template, encoding="utf-8").read()
text = text.replace("{{PROJECT_NAME}}", name)
text = text.replace("{{TECH_STACK}}", stack)
text = text.replace("{{PROJECT_DESCRIPTION}}", desc)
if "project:\n  id:" not in text:
    text = text.replace("project:\n", f'project:\n  id: "{project_id}"\n', 1)
open(out, "w", encoding="utf-8").write(text)
PY
    echo "CREATED config.yaml"
    return
  fi

  python3 - "$config_path" "$slug" "$project_name" <<'PY'
import re
import sys
path, project_id, project_name = sys.argv[1:]
text = open(path, encoding="utf-8").read()
changed = False
if re.search(r"(?m)^project:\s*$", text):
    block_start = re.search(r"(?m)^project:\s*$", text).end()
    following = text[block_start:]
    next_top = re.search(r"(?m)^[A-Za-z0-9_-]+:\s*$", following)
    project_block = following[: next_top.start() if next_top else len(following)]
    insert = ""
    if not re.search(r"(?m)^\s+id:\s*", project_block):
        insert += f'  id: "{project_id}"\n'
    if not re.search(r"(?m)^\s+name:\s*", project_block):
        insert += f'  name: "{project_name}"\n'
    if insert:
        text = text[:block_start] + "\n" + insert + text[block_start:]
        changed = True
elif "project:" not in text:
    text = f'project:\n  id: "{project_id}"\n  name: "{project_name}"\n\n' + text
    changed = True
# Add-only: seed intake self-diagnosis scoring defaults when the section is
# absent (mirror of nacl-init Migration check G). Never touches an existing
# intake: section, so user-tuned values are preserved.
if not re.search(r"(?m)^intake:\s*$", text) and not re.search(r"(?m)^intake:\s", text):
    intake_block = (
        "\n"
        "# Intake self-diagnosis scoring\n"
        "# Used by: nacl-tl-intake Step 2a.5 PROBE (hypothesis verification before any\n"
        "# routing question) and /nacl-goal intake. Tune per project; when a key is\n"
        "# absent, skills use the built-in defaults.\n"
        "# Semantics, rubric and tuning guidance: nacl-tl-core/references/intake-scoring.md\n"
        "intake:\n"
        "  route_threshold: 0.7        # score >= this -> auto-route on the leading hypothesis\n"
        "  high_confidence: 0.9        # score >= this -> HIGH confidence (no tracked alternative)\n"
        "  scores:                     # rubric row values (verdict pattern -> score)\n"
        "    leader_confirmed_all_refuted: 0.95\n"
        "    leader_confirmed_some_inconclusive: 0.8\n"
        "    leader_indirect_all_refuted: 0.75\n"
        "    leader_indirect_inconclusive: 0.55\n"
        "    contradictory: 0.4\n"
        "    all_inconclusive: 0.2\n"
    )
    if not text.endswith("\n"):
        text += "\n"
    text += intake_block
    changed = True
if changed:
    open(path, "w", encoding="utf-8").write(text)
    print("UPDATED config.yaml")
else:
    print("SKIPPED config.yaml: already present")
PY
}

create_graph() {
  mkdir -p "$project_root/graph-infra/schema" "$project_root/graph-infra/queries" "$project_root/graph-infra/boards"

  if [ ! -f "$project_root/graph-infra/docker-compose.yml" ]; then
    cp "$graph_compose_template" "$project_root/graph-infra/docker-compose.yml"
    echo "CREATED graph-infra/docker-compose.yml"
  else
    echo "SKIPPED graph-infra/docker-compose.yml: already present"
  fi

  for schema in "$schema_source"/*.cypher; do
    target="$project_root/graph-infra/schema/$(basename "$schema")"
    if [ ! -f "$target" ]; then
      cp "$schema" "$target"
      echo "CREATED graph-infra/schema/$(basename "$schema")"
    fi
  done

  for query in "$queries_source"/*.cypher; do
    target="$project_root/graph-infra/queries/$(basename "$query")"
    if [ ! -f "$target" ]; then
      cp "$query" "$target"
      echo "CREATED graph-infra/queries/$(basename "$query")"
    fi
  done

  env_text="COMPOSE_PROJECT_NAME=$slug-graph
CONTAINER_PREFIX=$slug
NEO4J_PASSWORD=neo4j_graph_dev
NEO4J_HTTP_PORT=3574
NEO4J_BOLT_PORT=3587
"
  for env_file in "$project_root/graph-infra/.env" "$project_root/graph-infra/.env.example"; do
    if [ ! -f "$env_file" ]; then
      printf '%s' "$env_text" > "$env_file"
      echo "CREATED graph-infra/$(basename "$env_file")"
    else
      echo "SKIPPED graph-infra/$(basename "$env_file"): already present"
    fi
  done
}

update_registry() {
  python3 - "$registry_path" "$slug" "$project_name" "$project_root" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

path, project_id, name, root = sys.argv[1:]
now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
if os.path.exists(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
else:
    data = {"version": 1, "activeProjectId": None, "projects": []}
if data.get("version") != 1:
    raise SystemExit(f"ERROR: {path} has version {data.get('version')}, expected 1")
projects = data.setdefault("projects", [])
for record in projects:
    if record.get("id") == project_id:
        record["name"] = name
        record["root"] = root
        record["lastUsed"] = now
        action = "UPDATED"
        break
else:
    projects.append({
        "id": project_id,
        "name": name,
        "root": root,
        "createdAt": now,
        "lastUsed": now,
    })
    action = "CREATED"
data["activeProjectId"] = project_id
tmp = f"{path}.tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
os.chmod(tmp, 0o600)
os.replace(tmp, path)
print(f"{action} registry entry: {project_id} in {path}")
PY
}

create_config
if [ "$with_graph" -eq 1 ]; then
  create_graph
fi
if [ "$write_registry" -eq 1 ]; then
  update_registry
else
  echo "SKIPPED registry: --no-registry"
fi

echo "Status: VERIFIED"
