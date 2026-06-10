// Pins for classify-findings.mjs. Run: node --test nacl-core/scripts/classify-findings.test.mjs
// Each case maps a finding set to the exact overall token / exemption decision the
// SKILL.md Severity table + exemption-property table prescribe.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFindings } from './classify-findings.mjs';

test('any non-exempt CRITICAL → FAIL', () => {
  const r = classifyFindings({ findings: [
    { check: 'L1.1', severity: 'CRITICAL' },
    { check: 'L2.2', severity: 'WARNING' },
  ] });
  assert.equal(r.overall, 'FAIL');
  assert.equal(r.counts.critical, 1);
});

test('5+ non-exempt WARNINGs → WARN; 4 → PASS', () => {
  const four = { findings: Array.from({ length: 4 }, (_, i) => ({ check: `L2.${i}`, severity: 'WARNING' })) };
  const five = { findings: Array.from({ length: 5 }, (_, i) => ({ check: `L2.${i}`, severity: 'WARNING' })) };
  assert.equal(classifyFindings(four).overall, 'PASS');
  assert.equal(classifyFindings(five).overall, 'WARN');
});

test('INFO never affects overall', () => {
  const r = classifyFindings({ findings: Array.from({ length: 9 }, (_, i) => ({ check: `L1.5`, severity: 'INFO' })) });
  assert.equal(r.overall, 'PASS');
  assert.equal(r.counts.info, 9);
});

test('empty → PASS', () => {
  assert.equal(classifyFindings({ findings: [] }).overall, 'PASS');
});

test('L4.1 display field is exempt (does not count toward FAIL)', () => {
  const r = classifyFindings({ findings: [
    { check: 'L4.1', severity: 'CRITICAL', flags: { field_category: 'display' } },
  ] });
  assert.equal(r.findings[0].exempt, true);
  assert.equal(r.counts.critical, 0);
  assert.equal(r.overall, 'PASS');
});

test('L4.1 input field (default) is NOT exempt', () => {
  const r = classifyFindings({ findings: [{ check: 'L4.1', severity: 'CRITICAL', flags: {} }] });
  assert.equal(r.findings[0].exempt, false);
  assert.equal(r.overall, 'FAIL');
});

test('exemption predicates per check', () => {
  const ex = (check, flags) => classifyFindings({ findings: [{ check, severity: 'CRITICAL', flags }] }).findings[0].exempt;
  assert.equal(ex('L5.1', { has_ui: false }), true);
  assert.equal(ex('L5.1', { has_ui: true }), false);
  assert.equal(ex('L5.1', {}), false);                 // default has_ui=true → not exempt
  assert.equal(ex('L6.1', { shared: true }), true);
  assert.equal(ex('L6.1', {}), false);                 // default shared=false
  assert.equal(ex('L9.1', { decision_exempt: true }), true);
  assert.equal(ex('L10.2', { formless: true }), true);
  assert.equal(ex('L10.6', { terminal: true }), true);
  assert.equal(ex('XL8.2', { system_only: true }), true);
});

test('checks without an exemption rule are never exempt', () => {
  const r = classifyFindings({ findings: [{ check: 'L11.2', severity: 'CRITICAL', flags: { shared: true } }] });
  assert.equal(r.findings[0].exempt, false);
  assert.equal(r.overall, 'FAIL');
});

test('determinism: same input → byte-identical', () => {
  const inp = { findings: [
    { check: 'L4.1', severity: 'CRITICAL', flags: { field_category: 'display' } },
    { check: 'L2.1', severity: 'WARNING' },
  ] };
  assert.equal(JSON.stringify(classifyFindings(inp)), JSON.stringify(classifyFindings(structuredClone(inp))));
});

test('unknown severity throws', () => {
  assert.throws(() => classifyFindings({ findings: [{ check: 'L1.1', severity: 'BLOCKER' }] }), /unknown severity/);
});

test('layer=ba: SA exemption ids (L4.1/L5.1/L6.1) do NOT apply — no collision', () => {
  // BA's L4.1 is a different check with no exemption; even with SA-shaped flags it must count.
  const r = classifyFindings({ layer: 'ba', findings: [
    { check: 'L4.1', severity: 'CRITICAL', flags: { field_category: 'display' } },
    { check: 'L6.1', severity: 'CRITICAL', flags: { shared: true } },
  ] });
  assert.equal(r.counts.exempt, 0);
  assert.equal(r.counts.critical, 2);
  assert.equal(r.overall, 'FAIL');
});

test('layer defaults to sa (back-compat) and unknown layer throws', () => {
  assert.equal(classifyFindings({ findings: [{ check: 'L4.1', severity: 'CRITICAL', flags: { field_category: 'display' } }] }).overall, 'PASS');
  assert.throws(() => classifyFindings({ layer: 'xx', findings: [] }), /unknown layer/);
});
