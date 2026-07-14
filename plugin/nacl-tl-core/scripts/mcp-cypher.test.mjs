// Pins for mcp-cypher.mjs pure helpers. Run: node --test nacl-tl-core/scripts/mcp-cypher.test.mjs
// The spawn path needs a real neo4j-mcp binary (exercised by the connect/create gates);
// here we pin tool discovery, request building, and row/param parsing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickCypherTool, buildToolsCall, parseRows, parseParams } from './mcp-cypher.mjs';

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
