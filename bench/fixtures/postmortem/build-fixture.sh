#!/usr/bin/env bash
# Build the hermetic post-mortem fixture (A-Val-1) — a tiny finished "nacl-built"
# project with a clear dev→fix boundary and 3 fix-wave commits whose spec-fault
# class is LABELED ground truth (see GROUND-TRUTH.md). Built in a target dir
# (default /tmp/pm-fixture) so the NaCl repo carries no nested .git.
#
# Usage: bench/fixtures/postmortem/build-fixture.sh [target-dir]
set -euo pipefail
DST="${1:-/tmp/pm-fixture}"
rm -rf "$DST"; mkdir -p "$DST"; cd "$DST"
git init -q; git config user.email fixture@nacl.local; git config user.name "NaCl Fixture"
git symbolic-ref HEAD refs/heads/main 2>/dev/null || true

mkdir -p .tl/tasks/UC001 src/services src/routes

# ---- task specs (frozen at build time) ----
cat > .tl/tasks/UC001/task-be.md <<'EOF'
# UC001-BE — Order checkout
Implement POST /api/orders: validate cart, charge payment via PaymentClient, persist order.
Steps: 1) validate cart non-empty 2) charge 3) persist 4) return {orderId}.
Files: src/services/order.service.ts, src/routes/orders.ts, src/services/payment.client.ts
EOF
cat > .tl/tasks/UC001/acceptance.md <<'EOF'
# Acceptance — UC001-BE
| ID | Criterion | Verify |
|----|-----------|--------|
| AC-1 | Empty cart rejected with 400 | service test |
| AC-2 | Payment charged via live provider (Stripe) | LIVE_PROVIDER_SMOKE |
| AC-3 | Order persisted and orderId returned | service test |
EOF
cat > .tl/tasks/UC001/api-contract.md <<'EOF'
# api-contract — UC001
POST /api/orders  req: { items: [{sku,qty}] }  res 200: { orderId: string }
Errors: 400 empty-cart, 402 payment-failed
EOF

# ---- feature build (the "done" wave) ----
cat > src/services/payment.client.ts <<'EOF'
// PaymentClient — WARNING: this is a fake/sandbox client; charge() always returns success.
export class PaymentClient {
  async charge(amountCents: number): Promise<{ ok: boolean; id: string }> {
    return { ok: true, id: 'fake_' + amountCents }; // never calls a real provider
  }
}
EOF
cat > src/services/order.service.ts <<'EOF'
import { PaymentClient } from './payment.client.js';
export async function createOrder(items: {sku:string;qty:number}[]) {
  const pay = new PaymentClient();
  const total = items.reduce((s,i)=>s+i.qty*100,0);
  const res = await pay.charge(total);
  return { orderId: 'ord_' + res.id };
}
EOF
cat > src/routes/orders.ts <<'EOF'
import { createOrder } from '../services/order.service.js';
export async function postOrders(req:{body:{items:any[]}}) {
  return await createOrder(req.body.items); // NOTE: no empty-cart guard
}
EOF
git add -A; GIT_COMMITTER_DATE="2026-03-01T10:00:00" git commit -q --date "2026-03-01T10:00:00" -m "feat(UC001): order checkout pipeline (service+route+payment client)"

cat > .tl/tasks/UC001/qa-report.md <<'EOF'
# QA — UC001
COMPONENT_QA: VERIFIED
LOCAL_RUNTIME_QA: VERIFIED
LIVE_PROVIDER_SMOKE: NOT_RUN — no STRIPE_API_KEY in QA environment
PROD_GOLDEN_PATH: VERIFIED
EOF
git add -A; GIT_COMMITTER_DATE="2026-03-01T12:00:00" git commit -q --date "2026-03-01T12:00:00" -m "docs(UC001): QA report (staging) — declared done"

# ===== dev→fix boundary is the next commit =====

# Fix 1 — SPEC_RIGHT_DEV_DRIFTED: spec/acceptance AC-1 required empty-cart 400; dev omitted the guard.
cat > src/routes/orders.ts <<'EOF'
import { createOrder } from '../services/order.service.js';
export async function postOrders(req:{body:{items:any[]}}) {
  if (!req.body.items || req.body.items.length === 0) {
    const e:any = new Error('empty-cart'); e.status = 400; throw e; // AC-1
  }
  return await createOrder(req.body.items);
}
EOF
git add -A; GIT_COMMITTER_DATE="2026-03-20T09:00:00" git commit -q --date "2026-03-20T09:00:00" -m "fix(UC001): reject empty cart with 400 (AC-1 was unguarded)"

# Fix 2 — SPEC_MISSING + qa_stage_missing: payment never hit a real provider (AC-2 untested because
# LIVE_PROVIDER_SMOKE was NOT_RUN for a missing key). Fix wires the real Stripe client.
cat > src/services/payment.client.ts <<'EOF'
import Stripe from 'stripe';
export class PaymentClient {
  private stripe = new Stripe(process.env.STRIPE_API_KEY || '');
  async charge(amountCents: number): Promise<{ ok: boolean; id: string }> {
    const pi = await this.stripe.paymentIntents.create({ amount: amountCents, currency: 'usd', confirm: true });
    return { ok: pi.status === 'succeeded', id: pi.id };
  }
}
EOF
git add -A; GIT_COMMITTER_DATE="2026-03-21T09:00:00" git commit -q --date "2026-03-21T09:00:00" -m "fix(UC001): charge real Stripe provider (was a fake client; AC-2 never live-smoked)"

# Fix 3 — SPEC_WRONG: api-contract said error 402 payment-failed but route returned 200 with ok:false.
cat > .tl/tasks/UC001/api-contract.md <<'EOF'
# api-contract — UC001
POST /api/orders  req: { items: [{sku,qty}] }  res 200: { orderId: string }
Errors: 400 empty-cart, 402 payment-failed (MUST surface as HTTP 402, not 200 ok:false)
EOF
cat > src/services/order.service.ts <<'EOF'
import { PaymentClient } from './payment.client.js';
export async function createOrder(items: {sku:string;qty:number}[]) {
  const pay = new PaymentClient();
  const total = items.reduce((s,i)=>s+i.qty*100,0);
  const res = await pay.charge(total);
  if (!res.ok) { const e:any = new Error('payment-failed'); e.status = 402; throw e; }
  return { orderId: 'ord_' + res.id };
}
EOF
git add -A; GIT_COMMITTER_DATE="2026-03-22T09:00:00" git commit -q --date "2026-03-22T09:00:00" -m "fix(UC001): surface payment failure as HTTP 402 (contract was ambiguous/wrong)"

echo "built fixture at $DST"
git -C "$DST" log --oneline
