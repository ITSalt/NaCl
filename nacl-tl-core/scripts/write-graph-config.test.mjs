// Pins for write-graph-config.mjs. Run: node --test nacl-tl-core/scripts/write-graph-config.test.mjs
// Verifies: block detection, fill-empty-only merge, canonical render, and that the rest of
// config.yaml is left untouched. Round-trips through parseGraphMode-style scans.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findGraphBlock, parseGraphBlock, mergeGraphValues, renderGraphBlock,
  spliceGraphBlock, patchGraphConfig,
} from './write-graph-config.mjs';
import { parseGraphMode } from './resolve-graph-mode.mjs';

const LOCAL = [
  'project:',
  '  name: Demo',
  'graph:',
  '  mode: "local"',
  '  neo4j_bolt_port: 3587',
  '  neo4j_password: "neo4j_graph_dev"',
  '  boards_dir: "graph-infra/boards"',
  'intake:',
  '  route_threshold: 0.7',
].join('\n') + '\n';

test('findGraphBlock locates the block span and stops at the next top-level key', () => {
  const span = findGraphBlock(LOCAL.split('\n'));
  assert.equal(LOCAL.split('\n')[span.startLine], 'graph:');
  assert.equal(LOCAL.split('\n')[span.endLine], 'intake:');
});

test('parseGraphBlock reads flat keys and remote subkeys', () => {
  const block = ['graph:', '  mode: "remote"', '  neo4j_uri: "bolt://localhost:3700"', '  remote:', '    host: "graph.acme.dev"', '    gateway_port: 7687'].join('\n');
  const { flat, remote } = parseGraphBlock(block);
  assert.equal(flat.mode, '"remote"');
  assert.equal(flat.neo4j_uri, '"bolt://localhost:3700"');
  assert.equal(remote.host, '"graph.acme.dev"');
  assert.equal(remote.gateway_port, '7687');
});

test('mergeGraphValues is FILL-EMPTY-ONLY by default', () => {
  const existing = { flat: { mode: '"local"', neo4j_password: '"keepme"' }, remote: {} };
  const next = { flat: { mode: '"remote"', neo4j_password: '"overwrite"', project_scope: 'acme' }, remote: {} };
  const merged = mergeGraphValues(existing, next);
  assert.equal(merged.flat.mode, '"local"');          // existing non-empty wins
  assert.equal(merged.flat.neo4j_password, '"keepme"');
  assert.equal(merged.flat.project_scope, 'acme');    // empty/absent filled
});

test('mergeGraphValues with force overwrites', () => {
  const merged = mergeGraphValues({ flat: { mode: '"local"' }, remote: {} }, { flat: { mode: '"remote"' }, remote: {} }, { force: true });
  assert.equal(merged.flat.mode, '"remote"');
});

test('renderGraphBlock emits canonical, stable order (boards_dir last)', () => {
  const block = renderGraphBlock({
    flat: { boards_dir: '"graph-infra/boards"', mode: '"remote"', neo4j_uri: '"bolt://localhost:3700"', project_scope: 'acme' },
    remote: { gateway_port: 7687, host: '"graph.acme.dev"' },
  });
  const lines = block.split('\n');
  assert.equal(lines[0], 'graph:');
  assert.equal(lines[1], '  mode: "remote"');
  assert.ok(lines.indexOf('  remote:') < lines.indexOf('  boards_dir: "graph-infra/boards"'));
  assert.ok(lines.includes('    host: "graph.acme.dev"'));
  assert.ok(lines.includes('    gateway_port: 7687'));
});

test('patchGraphConfig converts local→remote and leaves other sections untouched', () => {
  const next = {
    flat: { mode: '"remote"', neo4j_uri: '"bolt://localhost:3700"', project_scope: 'acme' },
    remote: { host: '"graph.acme.dev"', gateway_port: 7687, sidecar_port: 3700, tls: true },
  };
  const out = patchGraphConfig(LOCAL, next, { force: true });
  // project: and intake: sections preserved verbatim
  assert.match(out, /project:\n {2}name: Demo/);
  assert.match(out, /intake:\n {2}route_threshold: 0\.7/);
  // graph.mode is now remote and readable by the canonical scanner
  assert.equal(parseGraphMode(out), 'remote');
  assert.match(out, /neo4j_uri: "bolt:\/\/localhost:3700"/);
  assert.match(out, /\n {4}host: "graph\.acme\.dev"/);
});

test('patchGraphConfig fill-empty-only keeps a user-set password when converting', () => {
  const out = patchGraphConfig(LOCAL, { flat: { mode: '"remote"' }, remote: {} });
  assert.match(out, /neo4j_password: "neo4j_graph_dev"/);   // preserved
  assert.equal(parseGraphMode(out), 'local');               // mode not forced over existing
});

test('spliceGraphBlock appends a block when config has none', () => {
  const out = spliceGraphBlock('project:\n  name: X\n', 'graph:\n  mode: local');
  assert.match(out, /project:\n {2}name: X/);
  assert.equal(parseGraphMode(out), 'local');
});

test('idempotent: patching twice with same input is stable', () => {
  const next = { flat: { mode: '"remote"', project_scope: 'acme' }, remote: { host: '"h"' } };
  const once = patchGraphConfig(LOCAL, next, { force: true });
  const twice = patchGraphConfig(once, next, { force: true });
  assert.equal(once, twice);
});
