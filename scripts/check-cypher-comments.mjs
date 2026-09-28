#!/usr/bin/env node
// Flags SQL-style `--` comments inside ```cypher fences of tracked Markdown.
//
// Why this exists: validator and authoring fences were annotated
// `AND ...  -- REQUIRED FILTER: ...`. `--` is not a Cypher comment (the line
// comment is `//`), so Neo4j 5 rejects the whole query ("Invalid input
// 'FILTER'") — and nacl-sa-validate tells agents to copy every query
// character-for-character. One precedent spread the pattern to 27 lines in 8
// files. Parse proof for the fixed fences: tests/graph/regression-cypher-fence-parse.sh.
//
// Only comment-shaped `--` is flagged: preceded by line start or whitespace,
// followed by whitespace or line end, outside string literals, and not already
// inside a `//` comment. So `(n)--(m)` relationship patterns, `'--'` string
// literals, and `// L3.7 -- Severity` headers are all fine.
//
// Usage: node scripts/check-cypher-comments.mjs   (exit 1 on any finding)

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FENCE_OPEN = /^\s*```\s*cypher\b/i;
const FENCE_CLOSE = /^\s*```\s*$/;
const COMMENT_DASHES = /(^|\s)--(?=\s|$)/g;

// True when position `idx` of `line` is outside any '...' / "..." literal.
function outsideQuotes(line, idx) {
  let quote = null;
  for (let i = 0; i < idx; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') quote = ch;
  }
  return quote === null;
}

function insideLineComment(line, idx) {
  for (let i = 0; i + 1 < idx; i += 1) {
    if (line[i] === '/' && line[i + 1] === '/' && outsideQuotes(line, i)) return true;
  }
  return false;
}

/** @returns {Array<{line:number, text:string}>} SQL-style comments inside cypher fences. */
export function findSqlComments(markdown) {
  const out = [];
  let inFence = false;
  markdown.split('\n').forEach((text, i) => {
    if (!inFence && FENCE_OPEN.test(text)) { inFence = true; return; }
    if (inFence && FENCE_CLOSE.test(text)) { inFence = false; return; }
    if (!inFence) return;
    for (const m of text.matchAll(COMMENT_DASHES)) {
      const pos = m.index + m[1].length;
      if (outsideQuotes(text, pos) && !insideLineComment(text, pos)) {
        out.push({ line: i + 1, text: text.trimEnd() });
        break;
      }
    }
  });
  return out;
}

function trackedMarkdown() {
  // plugin/ and plugins/ are generated from the root sources and checked by
  // their own drift gates.
  return execFileSync('git', ['ls-files', '*.md', ':!plugin/**', ':!plugins/**'], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let findings = 0;
  for (const file of trackedMarkdown()) {
    for (const hit of findSqlComments(readFileSync(file, 'utf8'))) {
      console.log(`${file}:${hit.line}: ${hit.text}`);
      findings += 1;
    }
  }
  if (findings > 0) {
    console.log(`ERROR: ${findings} SQL-style '--' comment(s) inside cypher fences — Cypher line comments are '//'.`);
    process.exit(1);
  }
  console.log("No SQL-style '--' comments inside cypher fences.");
}
