#!/usr/bin/env bash
# Run one bench trial of a skill variant.
#
# Usage: bench/run-variant.sh <variant> <input> <run_n> [skill_invocation]
#
#   variant: label for output directory (e.g. "baseline", "refactor-a")
#   input:   basename from bench/inputs/ (e.g. "small" → bench/inputs/small.docx)
#   run_n:   run number (integer, used to seed output path)
#   skill_invocation: override prompt (default: "/nacl-ba-import-doc bench/inputs/<input>.docx")
#
# The caller is responsible for checking out the right git ref BEFORE invoking.
# This script does not switch branches — it runs what's in the working tree.

set -euo pipefail

VARIANT="${1:?usage: variant input run_n [prompt]}"
INPUT="${2:?usage: variant input run_n [prompt]}"
RUN_N="${3:?usage: variant input run_n [prompt]}"
PROMPT="${4:-/nacl-ba-import-doc bench/inputs/${INPUT}.docx}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${REPO_ROOT}/bench/outputs/${VARIANT}/${INPUT}/run-${RUN_N}"
mkdir -p "$OUT_DIR"

SESSION_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
COMMIT="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
MODEL="${CLAUDE_MODEL:-opus}"

echo "[run-variant] variant=$VARIANT input=$INPUT run=$RUN_N session=$SESSION_ID commit=$COMMIT" >&2

START_TS="$(date +%s)"
START_NS="$(date +%s%N 2>/dev/null || python3 -c 'import time;print(int(time.time()*1e9))')"

# --no-session-persistence keeps the session file off disk; fresh context each run.
# --include-partial-messages lets us see tool_use in real time (handy for stream demos).
# --allow-dangerously-skip-permissions so the skill can Read/Write unattended.
set +e
claude \
  --print \
  --output-format stream-json \
  --include-partial-messages \
  --verbose \
  --no-session-persistence \
  --session-id "$SESSION_ID" \
  --model "$MODEL" \
  --allow-dangerously-skip-permissions \
  "$PROMPT" \
  > "$OUT_DIR/stream.jsonl" \
  2> "$OUT_DIR/stderr.log"
EXIT_CODE=$?
set -e

END_TS="$(date +%s)"
END_NS="$(date +%s%N 2>/dev/null || python3 -c 'import time;print(int(time.time()*1e9))')"
WALL_MS=$(( (END_NS - START_NS) / 1000000 ))

# Collect any .excalidraw written under common board dirs during the run.
# Callers can customise via ARTIFACT_GLOB env var.
ARTIFACT_GLOB="${ARTIFACT_GLOB:-.ba-docs/boards/*${INPUT}*-board.excalidraw}"
shopt -s nullglob
for f in $ARTIFACT_GLOB; do
  cp "$f" "$OUT_DIR/$(basename "$f")"
done
shopt -u nullglob

# Parse metrics.
python3 "${REPO_ROOT}/bench/parse-stream.py" \
  --stream "$OUT_DIR/stream.jsonl" \
  --variant "$VARIANT" \
  --input "$INPUT" \
  --run "$RUN_N" \
  --session "$SESSION_ID" \
  --commit "$COMMIT" \
  --model "$MODEL" \
  --wall-ms "$WALL_MS" \
  --exit-code "$EXIT_CODE" \
  > "$OUT_DIR/metrics.json"

# Echo one-line summary to stderr so the stream viewer sees it.
python3 -c "
import json, sys
m = json.load(open('$OUT_DIR/metrics.json'))
print(f\"[done] variant=$VARIANT input=$INPUT run=$RUN_N  in={m['input_tokens_total']}  out={m['output_tokens_total']}  cache_r={m['cache_read_tokens']}  tools={m['tool_calls_count']}  wall={m['wall_ms']}ms  exit={m['exit_code']}\")
" >&2

exit "$EXIT_CODE"
