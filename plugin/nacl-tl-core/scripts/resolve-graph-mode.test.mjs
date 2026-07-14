// Pins for resolve-graph-mode.mjs. Run: node --test nacl-tl-core/scripts/resolve-graph-mode.test.mjs
// Covers the routing truth-table (flag vs committed config) and the scoped graph.mode scan.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGraphMode, parseGraphMode } from './resolve-graph-mode.mjs';

test('explicit --scale flag wins over everything', () => {
  assert.equal(resolveGraphMode({ scaleFlag: 'create', configMode: null }).mode, 'create');
  assert.equal(resolveGraphMode({ scaleFlag: 'connect', configMode: null }).mode, 'connect');
  // flag beats a contradicting config
  assert.equal(resolveGraphMode({ scaleFlag: 'create', configMode: 'remote' }).mode, 'create');
  assert.equal(resolveGraphMode({ scaleFlag: 'connect', configMode: 'local' }).mode, 'connect');
});

test('no flag + committed graph.mode=remote → auto-connect (joiner signal)', () => {
  const r = resolveGraphMode({ scaleFlag: null, configMode: 'remote' });
  assert.equal(r.mode, 'connect');
  assert.match(r.reason, /auto-join/);
});

test('no flag + local/absent config → local (backward compatible default)', () => {
  assert.equal(resolveGraphMode({ scaleFlag: null, configMode: 'local' }).mode, 'local');
  assert.equal(resolveGraphMode({ scaleFlag: null, configMode: null }).mode, 'local');
  assert.equal(resolveGraphMode({ scaleFlag: undefined, configMode: undefined }).mode, 'local');
});

test('invalid inputs throw (no silent mis-route)', () => {
  assert.throws(() => resolveGraphMode({ scaleFlag: 'join' }), /--scale must be/);
  assert.throws(() => resolveGraphMode({ configMode: 'cloud' }), /graph\.mode must be/);
});

test('determinism: same inputs → identical decision', () => {
  const a = resolveGraphMode({ scaleFlag: null, configMode: 'remote' });
  const b = resolveGraphMode({ scaleFlag: null, configMode: 'remote' });
  assert.deepEqual(a, b);
});

// ---- parseGraphMode: scoped scan of the graph: block ----

test('parseGraphMode reads mode inside graph block', () => {
  const yaml = ['project:', '  name: x', 'graph:', '  mode: "remote"', '  neo4j_uri: "bolt://localhost:3700"'].join('\n');
  assert.equal(parseGraphMode(yaml), 'remote');
});

test('parseGraphMode accepts unquoted and local', () => {
  assert.equal(parseGraphMode('graph:\n  mode: local\n'), 'local');
});

test('parseGraphMode returns null when graph block has no mode (legacy local config)', () => {
  const legacy = ['graph:', '  neo4j_bolt_port: 3587', '  neo4j_password: "x"'].join('\n');
  assert.equal(parseGraphMode(legacy), null);
});

test('parseGraphMode does NOT pick up an unrelated mode: key outside the graph block', () => {
  const yaml = ['reports:', '  mode: "remote"', 'graph:', '  neo4j_bolt_port: 3587'].join('\n');
  assert.equal(parseGraphMode(yaml), null);            // graph block has no mode → local
});

test('parseGraphMode stops at dedent (next top-level key ends the block)', () => {
  const yaml = ['graph:', '  neo4j_bolt_port: 3587', 'intake:', '  mode: "remote"'].join('\n');
  assert.equal(parseGraphMode(yaml), null);
});

test('parseGraphMode ignores commented mode lines', () => {
  const yaml = ['graph:', '  # mode: "remote"', '  neo4j_bolt_port: 3587'].join('\n');
  assert.equal(parseGraphMode(yaml), null);
});

test('parseGraphMode tolerates missing/garbage input', () => {
  assert.equal(parseGraphMode(''), null);
  assert.equal(parseGraphMode(null), null);
  assert.equal(parseGraphMode(undefined), null);
});
