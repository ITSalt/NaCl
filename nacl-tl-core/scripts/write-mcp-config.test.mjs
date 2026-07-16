// Pins for write-mcp-config.mjs. Run: node --test nacl-tl-core/scripts/write-mcp-config.test.mjs
// The merge must match the prior setup-graph.sh python behaviour: neo4j server shape,
// other servers preserved, 2-space + trailing newline, BOM-tolerant read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeMcpConfig, readMcpDoc, serializeMcpDoc } from './write-mcp-config.mjs';

const CONN = { command: '/home/u/.neo4j-mcp-bin/neo4j-mcp', uri: 'bolt://localhost:3700', password: 'sekret' };

test('fresh doc gets the canonical neo4j server', () => {
  const doc = mergeMcpConfig({}, CONN);
  assert.deepEqual(doc.mcpServers.neo4j, {
    type: 'stdio',
    command: CONN.command,
    args: [],
    env: {
      NEO4J_URI: 'bolt://localhost:3700',
      NEO4J_USERNAME: 'neo4j',
      NEO4J_PASSWORD: 'sekret',
      NEO4J_DATABASE: 'neo4j',
      NEO4J_TELEMETRY: 'false',
    },
  });
});

test('other servers are preserved (never clobbered)', () => {
  const existing = { mcpServers: { github: { type: 'stdio', command: 'gh-mcp' } } };
  const doc = mergeMcpConfig(existing, CONN);
  assert.ok(doc.mcpServers.github, 'github server preserved');
  assert.equal(doc.mcpServers.github.command, 'gh-mcp');
  assert.ok(doc.mcpServers.neo4j, 'neo4j server added');
});

test('existing neo4j server is replaced with new connection', () => {
  const existing = { mcpServers: { neo4j: { type: 'stdio', command: 'old', env: { NEO4J_URI: 'bolt://localhost:3587' } } } };
  const doc = mergeMcpConfig(existing, CONN);
  assert.equal(doc.mcpServers.neo4j.env.NEO4J_URI, 'bolt://localhost:3700');
  assert.equal(doc.mcpServers.neo4j.command, CONN.command);
});

test('does not mutate the input document', () => {
  const existing = { mcpServers: { github: { command: 'gh' } } };
  const snapshot = JSON.stringify(existing);
  mergeMcpConfig(existing, CONN);
  assert.equal(JSON.stringify(existing), snapshot);
});

test('username/database overridable, default to neo4j', () => {
  const doc = mergeMcpConfig({}, { ...CONN, username: 'svc', database: 'billing' });
  assert.equal(doc.mcpServers.neo4j.env.NEO4J_USERNAME, 'svc');
  assert.equal(doc.mcpServers.neo4j.env.NEO4J_DATABASE, 'billing');
});

test('remote secret source is inherited and never serialized as plaintext', () => {
  const doc = mergeMcpConfig({}, { ...CONN, password: undefined, secretSource: 'env:NEO4J_PASSWORD' });
  assert.equal(Object.hasOwn(doc.mcpServers.neo4j.env, 'NEO4J_PASSWORD'), false);
  assert.equal(JSON.stringify(doc).includes('sekret'), false);
});

test('missing required args throw', () => {
  assert.throws(() => mergeMcpConfig({}, { uri: 'bolt://x' }), /--command/);
  assert.throws(() => mergeMcpConfig({}, { command: 'x' }), /--uri/);
});

test('readMcpDoc strips BOM and tolerates garbage', () => {
  assert.deepEqual(readMcpDoc('﻿{"mcpServers":{}}'), { mcpServers: {} });
  assert.deepEqual(readMcpDoc('not json'), {});
  assert.deepEqual(readMcpDoc(''), {});
  assert.deepEqual(readMcpDoc(null), {});
});

test('serialize is 2-space indented with a trailing newline', () => {
  const out = serializeMcpDoc(mergeMcpConfig({}, CONN));
  assert.ok(out.endsWith('\n'));
  assert.match(out, /\n {2}"mcpServers"/);
  assert.equal(readMcpDoc(out).mcpServers.neo4j.env.NEO4J_URI, 'bolt://localhost:3700');
});
