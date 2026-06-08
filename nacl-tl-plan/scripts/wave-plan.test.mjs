// Pins for wave-plan.mjs. Run: node --test nacl-tl-plan/scripts/wave-plan.test.mjs
// Asserts the exact scheme on a realistic fixture AND the documented Phase-2
// constraints as invariants (so a future scheme change can't silently break them).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWaves } from './wave-plan.mjs';

// Realistic shape: 2 TECH + a diamond (UC004 ⟵ UC002,UC003 ⟵ UC001) across two
// modules, plus a backend-only independent UC005. Mirrors a Step-1.3 query result.
const FIXTURE = {
  tech: ['TECH-001', 'TECH-002'],
  ucs: [
    { id: 'UC001', module: 'auth',    priority: 'high',   depends_on: [] },
    { id: 'UC002', module: 'auth',    priority: 'medium', depends_on: ['UC001'] },
    { id: 'UC003', module: 'billing', priority: 'low',    depends_on: ['UC001'] },
    { id: 'UC004', module: 'billing', priority: 'high',   depends_on: ['UC002', 'UC003'] },
    { id: 'UC005', module: 'reports', priority: 'medium', depends_on: [], tasks: ['BE'] },
  ],
};

const waveOf = (plan, id) => plan.tasks.find((t) => t.task_id === id)?.wave;

test('exact wave numbers for the fixture', () => {
  const p = planWaves(FIXTURE);
  assert.equal(waveOf(p, 'TECH-001'), 0);
  assert.equal(waveOf(p, 'TECH-002'), 0);
  assert.equal(waveOf(p, 'UC001-BE'), 1);
  assert.equal(waveOf(p, 'UC001-FE'), 2);
  assert.equal(waveOf(p, 'UC002-BE'), 3);
  assert.equal(waveOf(p, 'UC002-FE'), 4);
  assert.equal(waveOf(p, 'UC003-BE'), 3); // same depth as UC002 → shares wave
  assert.equal(waveOf(p, 'UC004-BE'), 5); // depth 2
  assert.equal(waveOf(p, 'UC004-FE'), 6);
  assert.equal(waveOf(p, 'UC005-BE'), 1); // independent root
  assert.equal(p.tasks.find((t) => t.task_id === 'UC005-FE'), undefined); // backend-only
});

test('invariant: wave 0 contains only TECH', () => {
  const p = planWaves(FIXTURE);
  for (const t of p.tasks) if (t.wave === 0) assert.equal(t.type, 'TECH');
  for (const t of p.tasks) if (t.type === 'TECH') assert.equal(t.wave, 0);
});

test('invariant: BE strictly before FE for every UC', () => {
  const p = planWaves(FIXTURE);
  for (const uc of FIXTURE.ucs) {
    const be = waveOf(p, `${uc.id}-BE`);
    const fe = waveOf(p, `${uc.id}-FE`);
    if (be !== undefined && fe !== undefined) assert.ok(be < fe, `${uc.id}: BE ${be} !< FE ${fe}`);
  }
});

test('invariant: dependency chain — BE(dependent) > BE(dependency)', () => {
  const p = planWaves(FIXTURE);
  for (const d of p.task_deps) {
    assert.ok(waveOf(p, d.from) > waveOf(p, d.to), `${d.from} must be after ${d.to}`);
  }
});

test('task_deps capture the diamond (BE→BE)', () => {
  const p = planWaves(FIXTURE);
  const set = new Set(p.task_deps.map((d) => `${d.from}->${d.to}`));
  assert.ok(set.has('UC002-BE->UC001-BE'));
  assert.ok(set.has('UC003-BE->UC001-BE'));
  assert.ok(set.has('UC004-BE->UC002-BE'));
  assert.ok(set.has('UC004-BE->UC003-BE'));
});

test('determinism: same input → byte-identical output', () => {
  const a = JSON.stringify(planWaves(FIXTURE));
  const b = JSON.stringify(planWaves(structuredClone(FIXTURE)));
  assert.equal(a, b);
});

test('priority orders tasks within a shared wave (high before low)', () => {
  const p = planWaves({
    ucs: [
      { id: 'UCb', priority: 'low', depends_on: [] },
      { id: 'UCa', priority: 'high', depends_on: [] },
    ],
  });
  const wave1 = p.tasks.filter((t) => t.wave === 1).map((t) => t.task_id);
  assert.deepEqual(wave1, ['UCa-BE', 'UCb-BE']); // high first despite id order
});

test('no TECH → no wave 0', () => {
  const p = planWaves({ ucs: [{ id: 'UC001', depends_on: [] }] });
  assert.ok(!p.waves.some((w) => w.number === 0));
  assert.equal(p.waves[0].number, 1);
});

test('cycle detection throws', () => {
  assert.throws(() => planWaves({ ucs: [
    { id: 'A', depends_on: ['B'] },
    { id: 'B', depends_on: ['A'] },
  ] }), /cycle/);
});

test('undefined dependency throws', () => {
  assert.throws(() => planWaves({ ucs: [{ id: 'A', depends_on: ['GHOST'] }] }), /not defined/);
});
