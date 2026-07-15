// Pins for mcp-cypher.mjs pure helpers. Run: node --test nacl-tl-core/scripts/mcp-cypher.test.mjs
// The spawn path needs a real neo4j-mcp binary (exercised by the connect/create gates);
// here we pin tool discovery, request building, and row/param parsing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickCypherTool, buildToolsCall, parseRows, parseParams, parseStringParams } from './mcp-cypher.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const TOOLS = {
  tools: [
    { name: 'get-schema', inputSchema: { properties: {} } },
    { name: 'read-cypher', inputSchema: { properties: { query: { type: 'string' }, params: { type: 'object' } }, required: ['query'] } },
    { name: 'write-cypher', inputSchema: { properties: { query: { type: 'string' } }, required: ['query'] } },
  ],
};

test('pickCypherTool selects read tool for reads', () => {
  assert.deepEqual(pickCypherTool(TOOLS, { write: false }), { name: 'read-cypher', argKey: 'query' });
});

test('pickCypherTool selects write tool for writes', () => {
  assert.deepEqual(pickCypherTool(TOOLS, { write: true }), { name: 'write-cypher', argKey: 'query' });
});

test('pickCypherTool falls back to a cypher tool when no read/write qualifier', () => {
  const t = { tools: [{ name: 'cypher', inputSchema: { properties: { cypher: {} } } }] };
  assert.deepEqual(pickCypherTool(t, { write: false }), { name: 'cypher', argKey: 'cypher' });
});

test('pickCypherTool returns null when no cypher tool present', () => {
  assert.equal(pickCypherTool({ tools: [{ name: 'get-schema' }] }, {}), null);
  assert.equal(pickCypherTool({ tools: [] }, {}), null);
});

test('pickCypherTool infers arg key from required when no query/cypher prop', () => {
  const t = { tools: [{ name: 'read-cypher', inputSchema: { properties: { statement: {} }, required: ['statement'] } }] };
  assert.equal(pickCypherTool(t, {}).argKey, 'statement');
});

test('buildToolsCall shapes a valid JSON-RPC request', () => {
  const req = buildToolsCall(3, 'read-cypher', 'query', 'MATCH (n) RETURN n', { id: 'x' });
  assert.equal(req.method, 'tools/call');
  assert.equal(req.params.name, 'read-cypher');
  assert.equal(req.params.arguments.query, 'MATCH (n) RETURN n');
  assert.deepEqual(req.params.arguments.params, { id: 'x' });
});

test('buildToolsCall omits params when empty', () => {
  const req = buildToolsCall(3, 'read-cypher', 'query', 'RETURN 1', {});
  assert.ok(!('params' in req.params.arguments));
});

test('parseRows reads JSON array from content text', () => {
  const result = { content: [{ type: 'text', text: JSON.stringify([{ c: 5 }]) }] };
  assert.deepEqual(parseRows(result), [{ c: 5 }]);
});

test('parseRows reads structuredContent.rows when present', () => {
  assert.deepEqual(parseRows({ structuredContent: { rows: [{ a: 1 }] } }), [{ a: 1 }]);
});

test('parseRows tolerates non-JSON text and empty', () => {
  assert.deepEqual(parseRows({ content: [{ type: 'text', text: 'hello' }] }), [{ text: 'hello' }]);
  assert.deepEqual(parseRows(null), []);
  assert.deepEqual(parseRows({}), []);
});

test('parseParams JSON-parses values, falls back to string', () => {
  assert.deepEqual(parseParams(['n=5', 'name=acme', 'flag=true']), { n: 5, name: 'acme', flag: true });
});

test('parseStringParams preserves JSON-looking identifiers as strings on every OS', () => {
  assert.deepEqual(parseStringParams(['number=123', 'bool=true', 'nil=null', 'scientific=1e3']), {
    number: '123', bool: 'true', nil: 'null', scientific: '1e3',
  });
});

test('POSIX helper passes the password only through the bounded child environment', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nacl-mcp-secret-argv-'));
  const skills = path.join(root, 'skills');
  const fakeDir = path.join(skills, 'nacl-tl-core', 'scripts');
  const fixtureSecret = 'sensitive-fixture-value';
  try {
    await mkdir(fakeDir, { recursive: true });
    await writeFile(path.join(fakeDir, 'mcp-cypher.mjs'), [
      "import { createHash } from 'node:crypto';",
      "const password = process.env.NEO4J_PASSWORD ?? '';",
      "process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), secretDigest: createHash('sha256').update(password).digest('hex') }));",
      '',
    ].join('\n'));
    const shell = [
      'set -eu',
      'SKILLS_DIR="$1"',
      '. "$2"',
      'STABLE_BIN=/not-executed/fake-neo4j-mcp',
      `mcp_cypher_read "$SKILLS_DIR" bolt://localhost:3700 neo4j ${JSON.stringify(fixtureSecret)} neo4j 'RETURN 1'`,
    ].join('\n');
    const result = spawnSync('sh', ['-c', shell, 'sh', skills, path.join(scriptDir, 'lib-neo4j-mcp.sh')], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(fixtureSecret));
    const observed = JSON.parse(result.stdout);
    assert.equal(observed.secretDigest, createHash('sha256').update(fixtureSecret).digest('hex'));
    assert.equal(observed.argv.includes('--password'), false);
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const file = path.join(entry.parentPath, entry.name);
      assert.doesNotMatch(await readFile(file, 'utf8'), new RegExp(fixtureSecret), `${file} persisted the secret`);
    }
    assert.doesNotMatch(await readFile(path.join(scriptDir, 'lib-neo4j-mcp.ps1'), 'utf8'), /"--password"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
