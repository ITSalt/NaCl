#!/usr/bin/env python3
"""Publishable change-scenario benchmark for NaCl Фаза 0.

Runs on an ISOLATED clone of the family-cinema graph (nacl-bench-neo4j, bolt 7798).
Hypothesis:
  H1. BEFORE Фаза 0, changing a UC leaves its dependent task-snapshots silently
      out-of-date and the release gate (L8) passes blind to the drift.
  H2. AFTER Фаза 0, the same change flags every dependent, the gate BLOCKS, and a
      re-plan clears it to zero — no silent drift.
  H3. The stamp is tight: a single-UC change flags only true downstream tasks, not
      a project-wide blast radius (the broad sa_impact_closure is display-only).

Each of N real UCs (all UCs in the clone that have >=1 generated Task) is run
through both arms, with a full reset to baseline between every measurement so the
arms and iterations are independent.
"""
import subprocess, json, sys

C = ["docker", "exec", "nacl-bench-neo4j", "cypher-shell", "-u", "neo4j",
     "-p", "neo4j_graph_dev", "--format", "plain"]

def run(cy):
    r = subprocess.run(C + [cy], capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(f"CYPHER ERR for {cy[:80]}...\n{r.stderr}\n")
    return r.stdout

def scalar(cy):
    out = [l for l in run(cy).splitlines() if l.strip() != ""]
    # line 0 = header, line 1 = value
    try:
        return int(out[1])
    except Exception:
        return None

def reset():
    run("MATCH (n) REMOVE n.review_status, n.stale_reason, n.stale_since, n.stale_origin;")
    run("MATCH (uc:UseCase) REMOVE uc.spec_version;")
    run("MATCH (:UseCase)-[:GENERATES]->(t:Task) SET t.planned_from_version = 0;")

def stamp_tight(uc):
    # mirrors nacl-sa-feature step 3g (post-fix): affected UCs' tasks + dependents' tasks + UCs
    run(f"""
    MATCH (uc:UseCase) WHERE uc.id IN ['{uc}']
    OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(uc)
    WITH collect(DISTINCT uc) + collect(DISTINCT dependent) AS affected
    UNWIND affected AS a WITH DISTINCT a WHERE a IS NOT NULL
    OPTIONAL MATCH (a)-[:GENERATES]->(t:Task)
    SET t.review_status='stale', t.stale_origin='{uc}', t.stale_since=datetime();""")
    run(f"MATCH (uc:UseCase) WHERE uc.id IN ['{uc}'] SET uc.review_status='stale', uc.stale_origin='{uc}';")

def broad_task_radius(uc):
    # what the OLD undirected stamp WOULD have flagged (Tasks only), for the H3 comparison
    return scalar(f"""
    MATCH (changed:UseCase {{id:'{uc}'}})
    MATCH (changed)-[:HAS_ATTRIBUTE|MAPS_TO|HAS_FIELD|USES_FORM|HAS_STEP|HAS_REQUIREMENT
          |ACTOR|GENERATES|EXPOSES|IMPLEMENTS|DEPENDS_ON*1..6]-(dep:Task)
    WHERE dep <> changed RETURN count(DISTINCT dep);""")

def replan_clear():
    # mirrors nacl-tl-plan incremental regen clear
    run("""MATCH (t:Task) WHERE coalesce(t.review_status,'current')='stale'
    OPTIONAL MATCH (uc:UseCase)-[:GENERATES]->(t)
    SET t.planned_from_version = coalesce(uc.spec_version,0)
    REMOVE t.review_status, t.stale_origin, t.stale_since;""")
    run("MATCH (uc:UseCase) WHERE coalesce(uc.review_status,'current')='stale' REMOVE uc.review_status, uc.stale_origin;")

# --- discover the N UCs (all with >=1 generated Task) ---
ucs = []
for line in run("MATCH (uc:UseCase)-[:GENERATES]->(:Task) RETURN DISTINCT uc.id ORDER BY uc.id;").splitlines():
    s = line.strip().strip('"')
    if s.startswith("UC-"):
        ucs.append(s)

rows, agg = [], {"baseline_silent_drift": 0, "baseline_blind_pass": 0,
                 "treatment_flagged": 0, "treatment_blocked": 0, "treatment_cleared": 0,
                 "treatment_silent_drift": 0, "broad_radius_total": 0, "tight_radius_total": 0}

for uc in ucs:
    # ---- BASELINE arm: change without Фаза 0 (no stamp) ----
    reset()
    run(f"MATCH (uc:UseCase {{id:'{uc}'}}) SET uc.spec_version = 1;")
    drifted = scalar(f"MATCH (uc:UseCase {{id:'{uc}'}})-[:GENERATES]->(t:Task) "
                     f"WHERE coalesce(t.planned_from_version,0) < coalesce(uc.spec_version,0) RETURN count(t);")
    signal = scalar("MATCH (n) WHERE coalesce(n.review_status,'current')='stale' RETURN count(n);")
    base_closure = "PASS(blind)" if signal == 0 else "BLOCKED"
    base_silent = drifted - signal

    # ---- TREATMENT arm: change WITH Фаза 0 stamp -> block -> re-plan -> clear ----
    reset()
    broad = broad_task_radius(uc)               # H3: what broad closure would have hit
    run(f"MATCH (uc:UseCase {{id:'{uc}'}}) SET uc.spec_version = 1;")
    stamp_tight(uc)
    flagged_tasks = scalar("MATCH (t:Task) WHERE coalesce(t.review_status,'current')='stale' RETURN count(t);")
    l8 = scalar("MATCH (n) WHERE coalesce(n.review_status,'current')='stale' RETURN count(n);")
    treat_closure_before = "BLOCKED" if l8 > 0 else "PASS"
    replan_clear()
    l8_after = scalar("MATCH (n) WHERE coalesce(n.review_status,'current')='stale' RETURN count(n);")
    treat_closure_after = "PASS(clean)" if l8_after == 0 else "STILL-STALE"
    treat_silent = drifted - flagged_tasks if drifted > flagged_tasks else 0

    rows.append({"uc": uc, "dependent_tasks": drifted,
                 "baseline_silent_drift": base_silent, "baseline_closure": base_closure,
                 "treatment_flagged_tasks": flagged_tasks, "treatment_closure_before": treat_closure_before,
                 "treatment_closure_after": treat_closure_after, "treatment_silent_drift": treat_silent,
                 "stamp_radius_tight": flagged_tasks, "stamp_radius_broad": broad})
    agg["baseline_silent_drift"] += base_silent
    agg["baseline_blind_pass"] += 1 if (base_closure == "PASS(blind)" and drifted > 0) else 0
    agg["treatment_flagged"] += flagged_tasks
    agg["treatment_blocked"] += 1 if treat_closure_before == "BLOCKED" else 0
    agg["treatment_cleared"] += 1 if treat_closure_after == "PASS(clean)" else 0
    agg["treatment_silent_drift"] += treat_silent
    agg["broad_radius_total"] += broad
    agg["tight_radius_total"] += flagged_tasks

reset()  # leave clone clean
print(json.dumps({"n_ucs": len(ucs), "aggregate": agg, "per_uc": rows}, indent=2))
