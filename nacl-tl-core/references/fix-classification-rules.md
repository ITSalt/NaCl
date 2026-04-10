# Bugfix Classification: L0 / L1 / L2 / L3

Reference document for the **nacl-tl-fix** skill. Defines which level a fix belongs to and what actions are required beyond the code change itself.

---

## L0 — Environment

### When to apply

The problem is **not in the code or documentation** at all. It is an infrastructure, configuration, or environment issue.

### How to identify

1. Error message indicates missing DB column, relation, or migration.
2. Error message indicates missing environment variable or wrong config.
3. Build fails due to stale cache, wrong Node version, or missing dependency.
4. Tests fail because test DB is out of sync with migrations.

### Examples

- Test DB missing migrations (`column "input_mode" does not exist`).
- Environment variable not set in CI (`NEXT_PUBLIC_VK_CLIENT_ID` missing).
- Wrong Node version causing runtime errors.
- Stale build cache causing phantom failures.
- Docker container not running (DB, MinIO, Redis).

### Actions

1. Apply the infrastructure fix (run migrations, set env vars, clear cache, start containers).
2. Verify the problem is resolved.
3. **No code or documentation changes needed.**
4. If the fix reveals a gap in DEPLOY.md or DEVELOPMENT.md, note it as a recommendation.

---

## L1 — Code-only

### When to apply

The documentation (UCs, specs, domain model) **describes the correct behavior**, but the code does not match it. The problem lies exclusively in the implementation.

### How to identify

1. Find the relevant UC or specification in `docs/`.
2. Read the expected behavior description.
3. Confirm that the spec is **up-to-date and correct** — the code simply does not match it.

### Examples

- CSS bug (broken layout, wrong color/spacing).
- Typo in a variable name.
- Incorrect condition in an `if` expression.
- Missing `null` / `undefined` check.
- Wrong argument order in a function call.
- Off-by-one error in a loop.

### Actions

1. Fix the code.
2. Write or update a test covering the bug.
3. **Do not touch** the documentation — it is already correct.

---

## L2 — Spec-sync

### When to apply

Documentation **exists** but describes **outdated or incorrect** behavior. The code has evolved, but the spec has fallen behind.

### How to identify

1. Find the relevant UC or specification in `docs/`.
2. Read the description — it reflects the **old** behavior.
3. The code already works differently (or should work differently), and the spec does not reflect reality.

### Examples

- An API endpoint changed its response code (409 -> 200).
- A new status value was added to an enum but not described in the spec.
- A UI flow changed (step added/removed).
- Business validation logic changed.

### Actions

1. **First** update the documentation — capture the correct behavior.
2. **Then** fix the code so it matches the updated spec.
3. Write or update tests.

### Which SA documents to update

See the full matrix in [sa-doc-update-matrix.md](sa-doc-update-matrix.md). Quick summary:

| Code change | SA document | Update method | Level |
|---|---|---|---|
| Enum / status | `docs/12-domain/enumerations/` | `sa-domain --mode=MODIFY` | L2 |
| State-machine transitions | `session-status.md` | `sa-domain --mode=MODIFY` | L2 |
| API endpoint (contract) | `api-contract.md` + UC spec | manually in nacl-tl-fix | L2 |
| New endpoint | UC spec | `sa-uc --mode=update` | L2 |
| UC flow | `docs/14-usecases/` | `sa-uc --mode=update` | L2 |
| Screen / UI | `docs/15-interfaces/screens/` | manually in nacl-tl-fix | L2 |
| DB migration | `docs/12-domain/entities/` | `sa-domain --mode=MODIFY` | L2 |
| Deploy / CI | `docs/DEPLOY.md` | manually | L2 |
| CSS / layout | nothing | --- | L1 |

---

## L3 — Spec-create

### When to apply

There is **no documentation at all** for the affected area. The functionality is unspecified.

### How to identify

1. Search `docs/` for a relevant UC, specification, or domain description.
2. **Nothing found** — the area is not covered by documentation.

### Examples

- SSE streaming (protocol not documented).
- New authorization provider.
- Payment system.
- Integration with an external service that has no documentation.

### Actions

1. **First** create a minimal specification in Kiro-style bugfix spec format.
2. **Then** fix the code so it matches the created specification.
3. Write or update tests.

### Kiro-style bugfix spec format

```markdown
## Bug: <brief description>

### Current (actual behavior)
- What happens now (incorrect).

### Expected (desired behavior)
- What should happen (correct).

### Unchanged (not affected)
- What behavior MUST NOT change.
```

### What to create

- If the domain model is affected — `sa-domain` (create).
- If a user scenario is affected — `sa-uc` (create).
- If both are affected — both.

---

## Level determination algorithm

```
1. Find the bug / reproduce the issue
2. Is it an environment/infrastructure problem?
   +-- YES (missing migration, env var, cache) -> L0 (Environment)
   +-- NO  -> continue to step 3
3. Identify the affected code area
4. Search for documentation in docs/:
   +-- Documentation found and UP-TO-DATE  -> L1 (Code-only)
   +-- Documentation found but OUTDATED    -> L2 (Spec-sync)
   +-- Documentation NOT FOUND             -> L3 (Spec-create)
5. Execute actions according to the level
```
