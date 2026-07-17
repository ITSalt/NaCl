# NaCl 2.26.1 — test-author-flag-nonblocking

**The test-author-independence flag is now unambiguously non-blocking, and the review skill
no longer contradicts itself about it.**

## The problem

A live UC review (plugin 2.26.0) halted on a three-way contradiction inside
`nacl-tl-review/SKILL.md`:

1. **Step 6b** declared the MAJOR test-author-overlap flag non-blocking: "does NOT block
   approval… does not prevent REVIEW COMPLETE or APPROVED", with enforcement delegated to
   downstream ship/deliver gates.
2. **Step 8b's headline table** mapped the same flag to `REVIEW APPLIED — UNVERIFIED` with
   "APPROVED allowed? no" — and rule P4 forbids `APPROVED` under any non-`REVIEW COMPLETE`
   headline.
3. **The worked example** seventeen lines below P4 paired `REVIEW APPLIED — UNVERIFIED
   (test author overlap 80%)` with `Code judgment: APPROVED` — violating P4 outright.

The file stated the blocking rule, then demonstrated the non-blocking behavior.

## Why non-blocking wins

- The headline, per 8b's own preamble, reflects the **completeness of the verification**.
  An author-overlap flag does not make verification incomplete — the tests ran, passed, and
  carry RED→GREEN evidence. It is an independence signal, not a verification gap.
- The blocking reading had **no terminating path**: no other skill reads the review headline
  (orchestrators consume the approved/rejected verdict and the dev six-status line), so the
  flag would force CHANGES REQUESTED into the retry loops — which re-run the same dev agent
  up to three times and then mark the task FAILED. Author overlap is a git-history fact;
  re-running the dev agent can only extend it, and the prescribed remedy (a retroactive
  regression test by the separate test-author skill) is never invoked by the loop.
- On a **single-identity repository** — every commit under one git user, the normal
  agent-driven case — the overlap metric is trivially 100%, so the blocking reading would
  refuse VERIFIED on every UC of every such project, forever.

## What changed

- The 8b headline-table row for the flag is **removed**. **P4 is untouched**: a
  non-`REVIEW COMPLETE` headline still forbids `APPROVED` — the "proceed but flag" loophole
  stays closed. The flag's enforcement surface is the review artifact (the MAJOR block plus
  the mandatory `Recommend: retroactive regression test` line) and the declared ship/deliver
  gates.
- 6b now states the headline relation explicitly, so the two steps cannot be read against
  each other again.
- The P4-violating example is replaced with a compliant pair: a genuine UNVERIFIED case
  (`CHANGES REQUESTED`) and a green-with-flag case (`REVIEW COMPLETE` + `APPROVED` +
  recommended retroactive test).
- **New single-identity pre-check**: when the whole repository shares one author identity,
  the overlap metric is recorded as "uninformative (single-identity repo)" instead of MAJOR,
  and the reviewer verifies the structural seam instead — the dev result must show the
  regression test was authored through the separate test-author sub-agent (the actual
  independence guarantee in NaCl, which git email addresses cannot see). Missing seam
  evidence on a single-identity repo IS the MAJOR finding.

## Compatibility

Additive/clarifying; no wire-format changes. Reviews on single-identity repos stop emitting
a meaningless always-on MAJOR flag and start checking the seam that actually matters.

## Upgrade

- **CLI (symlinks):** `git pull` in the NaCl checkout.
- **Claude Code Desktop (plugin):** Settings → Customize → Plugins → `nacl` marketplace →
  Sync, then Update; or `claude plugin marketplace update nacl && claude plugin update
  nacl@nacl`, restart Desktop. Verify version 2.26.1.
