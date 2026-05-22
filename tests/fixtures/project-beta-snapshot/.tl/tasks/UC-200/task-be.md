# UC-200 — Transcoding queue (BE)

**Wave:** 2
**Module:** MOD-WORKER
**Actor:** SYSTEM (worker dequeues from BullMQ)
**UC traits:** queue, long-running, recoverable, async-provider

## Source

Reconstructed from project-beta-postmortem.md § 3.8 ("UC-200 ffmpeg
input — SPEC WRONG") and commit `5eb7e18 fix(UC-200): feed ffmpeg a
presigned S3 URL instead of a stdin Buffer`.

## Symptom

First real upload (65 MB MP4) silently stalls at `TRANSCRIBING` forever;
worker crashes unhandled. Root: piping an unbuffered Readable stream
into ffmpeg via stdin is non-seekable. MP4 demuxing needs to seek to
the moov atom (usually at EOF); ffmpeg times out silently on stdin
streams.

## Spec gap (what this fixture demonstrates)

The on-disk spec said "use `getObjectStream` — but ffmpeg needs seekable
input for MP4 demux". No constraint annotation on the stream type. No
RuntimeContract documenting the worker FSM (queued → IN_PROGRESS →
TRANSCRIBING → … → COMPLETED/FAILED), the retry semantics on ffmpeg
crash, the cancel-while-transcoding race, or the recovery procedure
after worker restart mid-job.

## RuntimeContract status: **MISSING**

W8 decision tree fires "mandatory" on UC-200:

1. queue (BullMQ-backed dequeue)
2. long-running (ffmpeg transcoding minutes/hours)
3. recoverable (job-level retry via BullMQ)
4. async-provider (chained to Deepgram ASR after extract)

No `RuntimeContract` node exists in the live graph for UC-200; the W0
graph snapshot shows `UCStub` for UC-200 but no full `UseCase` node
with the RuntimeContract sub-graph.

## Expected W11-pilot fire point

`nacl-sa-uc/SKILL.md` Phase 4.5: `BLOCKED — runtime_contract_missing`.

## QA decomposition (post-W3)

| Stage | Pre-W3 | Post-W3 expected |
|---|---|---|
| COMPONENT_QA | — | VERIFIED (worker pipeline unit-test passes against synthetic input) |
| LOCAL_RUNTIME_QA | — | NOT_RUN (no ffmpeg fixture exercise — the silent-stall would surface here) |
| WIRE_CONTRACT_QA | — | NOT_RUN (no Deepgram contract test) |
| PROVIDER_FIXTURE_QA | — | NOT_RUN (no recorded Deepgram fixture) |
| LIVE_PROVIDER_SMOKE | "skipped → PASS" | NOT_RUN (mandatory; floor forces aggregate UNVERIFIED) |
| PROD_GOLDEN_PATH | "skipped" | NOT_RUN (mandatory for upload-pipeline UCs) |
| **Aggregate** | **PASS-equivalent** | **UNVERIFIED** |
