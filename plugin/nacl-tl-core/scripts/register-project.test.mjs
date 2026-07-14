// Pins for register-project.mjs. Run: node --test nacl-tl-core/scripts/register-project.test.mjs
// Characterization tests: the merge must reproduce exactly what nacl-init Step 2d / the
// analyst-tool project-registry.ts module would write.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRegistry, parseRegistry, EMPTY_REGISTRY } from './register-project.mjs';

const NOW = '2026-06-27T12:00:00.000Z';

test('append a new project into an empty registry; set it active', () => {
  const { registry, action } = mergeRegistry(structuredClone(EMPTY_REGISTRY), {
    id: 'my-acme-project', name: 'My Acme Project', root: '/abs/proj', now: NOW,
  });
  assert.equal(action, 'created');
  assert.equal(registry.version, 1);
  assert.equal(registry.activeProjectId, 'my-acme-project');
  assert.deepEqual(registry.projects, [
    { id: 'my-acme-project', name: 'My Acme Project', root: '/abs/proj', createdAt: NOW, lastUsed: NOW },
  ]);
});

test('update existing record: keep createdAt, refresh name/root/lastUsed', () => {
  const start = {
    version: 1,
    activeProjectId: 'other',
    projects: [
      { id: 'other', name: 'Other', root: '/o', createdAt: '2020-01-01T00:00:00.000Z', lastUsed: '2020-01-01T00:00:00.000Z' },
      { id: 'p', name: 'Old Name', root: '/old', createdAt: '2021-05-05T00:00:00.000Z', lastUsed: '2021-05-05T00:00:00.000Z' },
    ],
  };
  const { registry, action } = mergeRegistry(start, { id: 'p', name: 'New Name', root: '/new', now: NOW });
  assert.equal(action, 'updated');
  const rec = registry.projects.find((x) => x.id === 'p');
  assert.equal(rec.createdAt, '2021-05-05T00:00:00.000Z');   // preserved
  assert.equal(rec.name, 'New Name');
  assert.equal(rec.root, '/new');
  assert.equal(rec.lastUsed, NOW);
  assert.equal(registry.activeProjectId, 'p');                // now active
  assert.equal(registry.projects.length, 2);                  // no duplicate
});

test('idempotency: re-running with same args is a stable no-op-ish update', () => {
  const start = structuredClone(EMPTY_REGISTRY);
  const first = mergeRegistry(start, { id: 'p', name: 'P', root: '/p', now: NOW }).registry;
  const second = mergeRegistry(first, { id: 'p', name: 'P', root: '/p', now: NOW }).registry;
  assert.deepEqual(first, second);
  assert.equal(second.projects.length, 1);
});

test('invalid project id is rejected (matches PROJECT_ID_RE)', () => {
  assert.throws(() => mergeRegistry(structuredClone(EMPTY_REGISTRY), { id: 'Bad Id', name: 'x', root: '/x', now: NOW }), /Invalid project id/);
  assert.throws(() => mergeRegistry(structuredClone(EMPTY_REGISTRY), { id: '', name: 'x', root: '/x', now: NOW }), /Invalid project id/);
  assert.throws(() => mergeRegistry(structuredClone(EMPTY_REGISTRY), { id: 'a'.repeat(65), name: 'x', root: '/x', now: NOW }), /Invalid project id/);
});

test('relative root is rejected', () => {
  assert.throws(() => mergeRegistry(structuredClone(EMPTY_REGISTRY), { id: 'p', name: 'x', root: 'rel/path', now: NOW }), /absolute path/);
});

test('non-version-1 registry aborts (never silently overwrite)', () => {
  assert.throws(() => mergeRegistry({ version: 2, activeProjectId: null, projects: [] }, { id: 'p', name: 'x', root: '/x', now: NOW }), /Unsupported registry version/);
});

test('output serializes to canonical 2-space JSON (matches project-registry.ts)', () => {
  const { registry } = mergeRegistry(structuredClone(EMPTY_REGISTRY), { id: 'p', name: 'P', root: '/p', now: NOW });
  const text = JSON.stringify(registry, null, 2);
  // round-trips through the same BOM-tolerant reader the TS module uses
  assert.deepEqual(parseRegistry('﻿' + text), registry);
  assert.match(text, /\n {2}"version": 1/);
});
