// Pins for check-cypher-comments.mjs. Run: node --test scripts/check-cypher-comments.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSqlComments } from './check-cypher-comments.mjs';

const fence = (body, lang = 'cypher') => `text\n\`\`\`${lang}\n${body}\n\`\`\`\nafter -- prose is fine\n`;

test('trailing -- annotation inside a cypher fence is flagged', () => {
  const hits = findSqlComments(fence("MATCH (n)\nWHERE n.a = 1  -- REQUIRED FILTER: x\nRETURN n"));
  assert.deepEqual(hits.map((h) => h.line), [4]);
});

test('whole-line -- comment is flagged', () => {
  assert.equal(findSqlComments(fence('-- candidates\nMATCH (n) RETURN n')).length, 1);
});

test('// comments, relationship patterns and string literals are not flagged', () => {
  const body = [
    '// L3.7 -- Severity: CRITICAL',           // -- inside a // comment
    'MATCH (a)--(b), (c)-->(d)',                // undirected / directed patterns
    "WHERE d IN ['', '-', '--', '—']",          // '--' string literal
    '  AND x = 1  // REQUIRED FILTER: fine',
    'RETURN a',
  ].join('\n');
  assert.deepEqual(findSqlComments(fence(body)), []);
});

test('only cypher fences are scanned', () => {
  assert.deepEqual(findSqlComments(fence('SELECT 1 -- sql comment', 'sql')), []);
  assert.deepEqual(findSqlComments('prose -- with dashes\n'), []);
});

test('one finding per line even with several -- on it', () => {
  assert.equal(findSqlComments(fence('RETURN 1  -- a -- b')).length, 1);
});
