#!/usr/bin/env python3
"""Parse claude -p --output-format stream-json output into metrics.

Emits a single JSON object to stdout.

Event shapes covered (Claude Code, April 2026):
  - Top-level lines of form {"type": "stream_event", "event": { ... }, ...}
    where the inner event may be message_start, message_delta, message_stop,
    content_block_start, content_block_delta, content_block_stop.
  - System lines: {"type": "system", "subtype": "init"|"api_retry"|...}
  - Tool use blocks appear as content_block_start with block.type == "tool_use"
    and block.name / block.input.

We sum usage across every message_delta (assistant turn). Tool-use events
are counted and the Read ones are indexed by file_path so that
references/<foo>.md hits can be reported back.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

# Claude Opus 4.7 pricing (public list, USD per 1M tokens), April 2026.
# Input and output prices differ; cache reads are cheaper.
PRICE_INPUT = 15.0
PRICE_OUTPUT = 75.0
PRICE_CACHE_READ = 1.5


def iter_events(path: Path) -> Iterable[dict[str, Any]]:
    with path.open() as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def unwrap(envelope: dict[str, Any]) -> dict[str, Any]:
    """Return the inner API event whether or not the envelope was used."""
    if envelope.get("type") == "stream_event" and isinstance(envelope.get("event"), dict):
        return envelope["event"]
    return envelope


def compute_cost_usd(input_tokens: int, output_tokens: int, cache_read: int) -> float:
    billable_input = max(input_tokens - cache_read, 0)
    return (
        billable_input * PRICE_INPUT / 1_000_000
        + cache_read * PRICE_CACHE_READ / 1_000_000
        + output_tokens * PRICE_OUTPUT / 1_000_000
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stream", required=True, type=Path)
    ap.add_argument("--variant", required=True)
    ap.add_argument("--input", required=True)
    ap.add_argument("--run", required=True)
    ap.add_argument("--session", required=True)
    ap.add_argument("--commit", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--wall-ms", required=True, type=int)
    ap.add_argument("--exit-code", required=True, type=int)
    args = ap.parse_args()

    input_tokens = 0
    output_tokens = 0
    cache_read = 0
    cache_creation = 0
    tool_calls = 0
    tool_counts: Counter[str] = Counter()
    read_paths: list[str] = []
    stop_reason = None
    message_count = 0
    first_token_ns: int | None = None
    error_events: list[str] = []

    if not args.stream.exists():
        print(json.dumps({"error": f"stream file missing: {args.stream}"}))
        return 2

    for envelope in iter_events(args.stream):
        inner = unwrap(envelope)
        etype = inner.get("type") or envelope.get("type")

        # Aggregate usage — found on message_delta and sometimes on message_start.
        if etype in ("message_delta", "message_start"):
            usage = (
                inner.get("usage")
                or (inner.get("message") or {}).get("usage")
                or (inner.get("delta") or {}).get("usage")
                or {}
            )
            input_tokens += int(usage.get("input_tokens") or 0)
            output_tokens += int(usage.get("output_tokens") or 0)
            cache_read += int(usage.get("cache_read_input_tokens") or 0)
            cache_creation += int(usage.get("cache_creation_input_tokens") or 0)
            if etype == "message_delta":
                message_count += 1
                delta = inner.get("delta") or {}
                if delta.get("stop_reason"):
                    stop_reason = delta.get("stop_reason")

        # Tool_use arrives as content_block_start with block.type = tool_use.
        if etype == "content_block_start":
            block = inner.get("content_block") or inner.get("block") or {}
            if block.get("type") == "tool_use":
                tool_calls += 1
                name = block.get("name") or "?"
                tool_counts[name] += 1
                block_input = block.get("input") or {}
                if name == "Read":
                    fp = block_input.get("file_path") or block_input.get("path")
                    if fp:
                        read_paths.append(fp)

        if etype == "error" or (etype == "system" and inner.get("subtype") == "api_retry"):
            error_events.append(json.dumps(inner)[:400])

    # Derive reference hits: files matched under <skill>/references/.
    reference_hits = sorted(p for p in set(read_paths) if "/references/" in p)
    asset_reads = sorted(p for p in set(read_paths) if "/assets/" in p)

    metrics = {
        "variant": args.variant,
        "input": args.input,
        "run": args.run,
        "session_id": args.session,
        "commit": args.commit,
        "model": args.model,
        "wall_ms": args.wall_ms,
        "exit_code": args.exit_code,
        "input_tokens_total": input_tokens,
        "output_tokens_total": output_tokens,
        "cache_read_tokens": cache_read,
        "cache_creation_tokens": cache_creation,
        "cost_usd": round(compute_cost_usd(input_tokens, output_tokens, cache_read), 6),
        "message_count": message_count,
        "stop_reason": stop_reason,
        "tool_calls_count": tool_calls,
        "tool_counts": dict(sorted(tool_counts.items())),
        "files_read_count": len(set(read_paths)),
        "reference_hits": reference_hits,
        "asset_reads": asset_reads,
        "error_events": error_events,
    }
    print(json.dumps(metrics, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
