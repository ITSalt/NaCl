# Post-Mortem: sample-project
**Generated:** 2026-05-30T11:02:57Z
**Boundary commit:** 2aa7c76 (2026-03-01) — `docs(UC001): QA report (staging) — declared done`
**Post-done fix commits analysed:** 3

---

## 1. TL;DR

All three post-done defects in the sample-project UC001 checkout slice were preventable at the existing gate layer. No defect required a new architectural capability; each one fell through a gap in an existing skill's verification logic.

| Bucket | Count | % |
|---|---|---|
| domain-logic (AC drift) | 1 | 33 % |
| stub-leak (fake provider shipped) | 1 | 33 % |
| api-contract (wire ambiguity) | 1 | 33 % |

**Headline finding:** Every fix commit maps to a distinct owning skill (nacl-tl-review, nacl-tl-qa, nacl-tl-sync) with zero overlap, indicating three independent single-point-of-failure gates rather than a systemic cross-cutting gap. The highest-severity miss — a fake payment client declared done with LIVE_PROVIDER_SMOKE NOT_RUN — was a qa_stage_missing failure; the provider-key skip was treated as non-blocking despite being a mandatory AC-2 verification step.

---

## 2. Fix-Commit Table

| SHA | Description | Bucket | Owning Skill | Why Missed |
|---|---|---|---|---|
| `8adc254` | Reject empty cart with 400 (AC-1 was unguarded) | domain-logic | nacl-tl-review | Route shipped without the AC-1 guard; even carried `// NOTE: no empty-cart guard`; review/repo-checks did not trace POST /api/orders against acceptance row AC-1 |
| `9ed9117` | Charge real Stripe provider (was a fake client; AC-2 never live-smoked) | stub-leak | nacl-tl-qa | LIVE_PROVIDER_SMOKE recorded NOT_RUN in qa-report.md; project declared done anyway; fake client header made the stub explicit yet QA treated the skip as non-blocking |
| `bf4f8db` | Surface payment failure as HTTP 402 (contract was ambiguous/wrong) | api-contract | nacl-tl-sync | api-contract.md listed `402 payment-failed` without binding it to a wire behaviour; service returned HTTP 200 ok:false; sync wire-evidence check had no assertion to fire against |

---

## 3. Per-Case Sections

### Case 8adc254 — Empty-cart guard (domain-logic / SPEC_RIGHT_DEV_DRIFTED)

**Trichotomy:** SPEC_RIGHT_DEV_DRIFTED — the spec was correct; the dev shipped without the required guard.

**Owning gate:** G1 (repo-checks RED on wave-tip: lint/typecheck/test) — nacl-tl-review

**Verbatim spec quote** (`.tl/tasks/UC001/acceptance.md`):

```
| AC-1 | Empty cart rejected with 400 | service test |
```

**Verbatim code at boundary** (`src/routes/orders.ts`):

```typescript
  return await createOrder(req.body.items); // NOTE: no empty-cart guard
```

**Why missed:** nacl-tl-review (and verify-code's data-flow trace) should have traced POST /api/orders against AC-1 "Empty cart rejected with 400". The boundary route `src/routes/orders.ts` even carried a self-incriminating comment `// NOTE: no empty-cart guard`, yet review/repo-checks did not cross-reference the route handler against the acceptance row, so the unguarded path passed as done. The spec text existed verbatim; this is a review_repo_checks miss (an acceptance->route reachability check), not a spec defect.

---

### Case 9ed9117 — Fake PaymentClient shipped (stub-leak / SPEC_MISSING + qa_stage_missing)

**Trichotomy:** SPEC_MISSING — no spec artifact ever stated the client must call a real provider; the fake was spec-conformant on the letter of task-be.md.

**Owning gate:** G3 (a mandatory QA stage was NOT_RUN) — nacl-tl-qa

**Verbatim spec quote** (`.tl/tasks/UC001/task-be.md`):

```
Implement POST /api/orders: validate cart, charge payment via PaymentClient, persist order.
```

**Verbatim code introduced by fix** (`src/services/payment.client.ts`):

```typescript
    const pi = await this.stripe.paymentIntents.create({ amount: amountCents, currency: 'usd', confirm: true });
    return { ok: pi.status === 'succeeded', id: pi.id };
```

**Verbatim QA evidence** (`qa-report.md` at boundary):

```
LIVE_PROVIDER_SMOKE: NOT_RUN — no STRIPE_API_KEY in QA environment
```

**Verbatim fake-client header** (`src/services/payment.client.ts` at boundary):

```
WARNING: this is a fake/sandbox client; charge() always returns success
```

**Why missed:** Two-fold. (1) task-be.md is silent on the external provider contract: it says only "charge payment via PaymentClient" and never states the client must hit a real provider, so a fake satisfying that text was spec-conformant — SPEC_MISSING (external provider contract belongs in nacl-sa-architect / api-contract). (2) acceptance.md AC-2 correctly demands LIVE_PROVIDER_SMOKE, but qa-report.md records "LIVE_PROVIDER_SMOKE: NOT_RUN — no STRIPE_API_KEY in QA environment" while still declaring done. The missing-provider-key QA skip is the root cause: nacl-tl-qa (G3 / qa_stage_missing) treated a NOT_RUN live smoke as non-blocking and let the project be declared done on a fake client. Related secondary gap: external_contract_missing for the absent provider spec.

---

### Case bf4f8db — HTTP 402 wire mismatch (api-contract / SPEC_WRONG)

**Trichotomy:** SPEC_WRONG — the contract itself was ambiguous/wrong; the fix amended the contract, not just the code.

**Owning gate:** G2 (BE/FE wire mismatch passed on TS types alone) — nacl-tl-sync

**Verbatim spec quote** (`.tl/tasks/UC001/api-contract.md` at boundary):

```
Errors: 400 empty-cart, 402 payment-failed
```

**Verbatim contract amendment introduced by fix** (`api-contract.md`):

```
Errors: 400 empty-cart, 402 payment-failed (MUST surface as HTTP 402, not 200 ok:false)
```

**Verbatim code introduced by fix** (`src/services/order.service.ts`):

```typescript
  if (!res.ok) { const e:any = new Error('payment-failed'); e.status = 402; throw e; }
```

**Why missed:** The api-contract.md error line "Errors: 400 empty-cart, 402 payment-failed" lists 402 as a code but does not bind it to a behaviour/wire mapping, so it was satisfiable on paper while the service returned HTTP 200 with ok:false on a failed charge. nacl-tl-sync / nacl-tl-review wire-evidence checking should have compared the declared 402 against the actual returned status and flagged the divergence, but with no behavioural binding there was nothing to assert against. That this is SPEC_WRONG (ambiguous, not merely silent) is proven by the fix amending the contract itself to "MUST surface as HTTP 402, not 200 ok:false" — the spec had to change, not just the code. Gap is sync_wire_evidence (a 402-status wire assertion was missing).

---

## 4. Per-Skill Diagnosis

### nacl-tl-review (G1) — 1 case: 8adc254

**Cases:** 8adc254 (domain-logic / SPEC_RIGHT_DEV_DRIFTED)

**Systemic gap:** The review pass lacked an acceptance-row-to-route-handler reachability check. AC-1 existed verbatim in acceptance.md; the route handler omitted the guard and even annotated the omission with `// NOTE: no empty-cart guard`. A mechanical diff of acceptance rows against route handlers would have caught this at review time without any spec inference.

**Recommendation:** Add a review step that, for each AC row in acceptance.md, locates the corresponding route handler and asserts that the AC's guard condition (status code + trigger) is reachable. Flag any handler that carries a `NOTE:` or `TODO:` comment referencing a spec obligation as a blocking finding.

---

### nacl-tl-qa (G3) — 1 case: 9ed9117

**Cases:** 9ed9117 (stub-leak / SPEC_MISSING + qa_stage_missing)

**Systemic gap:** nacl-tl-qa accepted a NOT_RUN mandatory stage (LIVE_PROVIDER_SMOKE) as a non-blocking condition and still emitted a done signal. Additionally, the QA pass did not inspect the implementation for stub/fake markers (e.g. a class-level `WARNING:` header, `always returns success` language) that would have flagged the fake client even without a live smoke.

**Recommendation:** (1) Treat any QA stage recorded as NOT_RUN where the reason is a missing secret/key as a blocking gate failure — emit a BLOCKED verdict, not done. (2) Add a stub-detection heuristic: scan imported service classes for warning comments, hardcoded-return patterns, or `always returns` prose before marking any payment/provider AC as verified.

---

### nacl-tl-sync (G2) — 1 case: bf4f8db

**Cases:** bf4f8db (api-contract / SPEC_WRONG)

**Systemic gap:** The wire-evidence sync pass compared TypeScript types (which were consistent) but did not assert HTTP status codes against api-contract.md error entries. An error entry of the form `NNN reason-phrase` with no behavioural binding is unverifiable on types alone; the sync pass needed to check that each declared error code was actually thrown/returned as that HTTP status at runtime.

**Recommendation:** Extend sync's contract-checking logic to require that each `NNN code` in the Errors section of api-contract.md has a corresponding throw/response.status assignment in the owning service file. If a declared error code has no wire binding in code, flag it as AMBIGUOUS_CONTRACT and block the done signal.

---

## 5. Cross-Cutting Patterns

**No cross-UC connectivity gap.** The project contains exactly one use case (UC001 — order checkout). A cross-UC gap requires UC-X to produce an entry that UC-Y has no route/handler/button to consume; there is no second UC anywhere in the repo. All three post-done fix commits are scoped entirely inside UC001 and are intra-UC defects owned by per-UC auditors. Verified: `grep -rn "UC[0-9]"` across the tree returns only `UC001` matches; `grep -rni "route|button|navigate|handler|link|href|onClick|menu"` over `src/` returns zero lines.

**Pattern A — Single-point gate failures with no overlap.** Each of the three owning skills (nacl-tl-review, nacl-tl-qa, nacl-tl-sync) owns exactly one miss. There is no defect that two gates both should have caught; each gate had a unique, non-redundant responsibility. This means adding cross-check redundancy between these skills would not have helped — the fix is to deepen each gate, not to add overlapping coverage.

**Pattern B — Provider-key skip as a top root cause.** The most severe defect (stub-leak, 9ed9117) traces directly to a missing secret in the QA environment. The project was declared done on a fake payment client solely because `STRIPE_API_KEY` was absent. Provider-key skips are a recurring top-3 root cause pattern: when infrastructure secrets are missing, mandatory live-smoke stages are silently skipped and stubs persist into production. This is a process gap, not a code gap.

**Pattern C — Self-documenting spec drift ignored.** The empty-cart miss (8adc254) is notable because the code itself advertised the defect via `// NOTE: no empty-cart guard`. A review pass that scanned for self-incriminating comments referencing spec obligations would have caught this with zero spec inference required.

**Pattern D — Ambiguous contract language.** The wire-mismatch miss (bf4f8db) arose because `402 payment-failed` in api-contract.md expressed intent as a label, not as a behavioural contract. The pattern of listing status codes without binding clauses (`MUST surface as HTTP NNN`) is a recurring api-contract ambiguity source that defeats automated sync checks.

---

## 6. Recommended Next Steps

- **nacl-tl-review:** Add an AC-to-handler reachability check: for each AC row, locate the owning route handler and assert the guard condition is present; treat `// NOTE:` or `// TODO:` comments referencing spec obligations as blocking findings.
- **nacl-tl-qa:** Block done on any NOT_RUN mandatory QA stage where the reason is a missing environment secret/key; emit BLOCKED rather than done.
- **nacl-tl-qa:** Add stub-detection heuristic: scan payment/provider service classes for warning comments, hardcoded-return patterns, or `always returns` language before marking provider ACs as verified.
- **nacl-tl-sync:** Require each `NNN code` in the Errors section of api-contract.md to have a corresponding throw/response.status assignment in the owning service; flag entries with no wire binding as AMBIGUOUS_CONTRACT and block done.
- **nacl-sa-architect / api-contract authoring:** Mandate behavioural binding clauses (`MUST surface as HTTP NNN, not NNN ok:false`) for every error entry at spec-authoring time to prevent sync_wire_evidence ambiguity at the gate layer.
