// Pins for resolve-developer-id.mjs. Run: node --test nacl-core/scripts/resolve-developer-id.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveDeveloperId, machineKey, parseDeveloperId } from './resolve-developer-id.mjs';

test('precedence: env > config > auto', () => {
  const base = { gitEmail: 'a@b.com', user: 'u', machineRaw: 'M' };
  assert.equal(deriveDeveloperId({ ...base, envId: 'ci-runner', configId: 'cfg' }), 'ci-runner');
  assert.equal(deriveDeveloperId({ ...base, configId: 'cfg' }), 'cfg');
  assert.equal(deriveDeveloperId(base), `a@b.com/${machineKey('M')}`);
});

test('env/config blanks fall through (whitespace-only ignored)', () => {
  assert.equal(deriveDeveloperId({ envId: '   ', configId: '', gitEmail: 'x@y.z', machineRaw: 'M' }), `x@y.z/${machineKey('M')}`);
});

test('identity fallback: gitEmail -> user -> dev', () => {
  assert.equal(deriveDeveloperId({ gitEmail: 'e@x', machineRaw: 'M' }), `e@x/${machineKey('M')}`);
  assert.equal(deriveDeveloperId({ user: 'alice', machineRaw: 'M' }), `alice/${machineKey('M')}`);
  assert.equal(deriveDeveloperId({ machineRaw: 'M' }), `dev/${machineKey('M')}`);
});

test('THE property: same human, different machines => different ids (no claim-lock collision)', () => {
  const a = deriveDeveloperId({ gitEmail: 'same@dev.com', machineRaw: 'machine-A-uuid' });
  const b = deriveDeveloperId({ gitEmail: 'same@dev.com', machineRaw: 'machine-B-uuid' });
  assert.notEqual(a, b);
  assert.ok(a.startsWith('same@dev.com/') && b.startsWith('same@dev.com/'));
});

test('machineKey is stable and 8 hex chars', () => {
  assert.equal(machineKey('x'), machineKey('x'));
  assert.match(machineKey('x'), /^[0-9a-f]{8}$/);
  assert.notEqual(machineKey('x'), machineKey('y'));
  assert.equal(machineKey(undefined), machineKey('unknown'));   // empty → stable sentinel
});

test('parseDeveloperId reads the developer block only (not project.id)', () => {
  const yaml = [
    'project:',
    '  id: "acme-billing"',
    '  name: "X"',
    'developer:',
    '  id: "magz@laptop"',
    'graph:',
    '  mode: remote',
  ].join('\n');
  assert.equal(parseDeveloperId(yaml), 'magz@laptop');
});

test('parseDeveloperId: absent block, comments, unquoted', () => {
  assert.equal(parseDeveloperId('project:\n  id: "p"\n'), null);
  assert.equal(parseDeveloperId('developer:\n  # id: "commented"\n  id: bare-id\n'), 'bare-id');
  assert.equal(parseDeveloperId(''), null);
  assert.equal(parseDeveloperId(null), null);
});
