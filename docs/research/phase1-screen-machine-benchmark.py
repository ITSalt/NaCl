#!/usr/bin/env python3
"""Publishable graph benchmark for NaCl Фаза 1 (screen state machines).

Runs on an ISOLATED clone of the family-cinema graph (nacl-bench-neo4j, bolt 7798).

Hypotheses (falsifiable):
  H0. Vacuous pass: on a graph with ZERO Screen nodes every L10 check returns
      zero findings — projects that have not adopted screen machines are
      unaffected by the new validator level.
  H1. Reachability: with the OLD (pre-Фаза-1) sa_impact_closure allow-list a
      change to the UC / its DomainAttribute / its APIEndpoint reaches ZERO
      screen-machine nodes; with the NEW allow-list the same change reaches the
      Screen and (from the UC) its full machine subtree.
  H2. The staleness stamp stays TIGHT after machine authoring: exactly the UC's
      generated tasks + transitive DEPENDS_ON dependents' tasks + the UC itself
      are flagged; the broad undirected walk over the enlarged edge set would
      flag far more.
  H3. The L10 detectors actually detect: each of 8 injected machine defects
      fires exactly its own check (expected counts), with zero cross-talk on
      the other checks, and a repaired machine returns every check to zero.

Each of the N real UCs (all UCs in the clone that USES_FORM and are not
backend-only) gets a canonical 4-state machine authored EXACTLY as the
nacl-sa-ui `state-machine` command writes it; every measurement starts from a
full reset (no screen-machine nodes, no staleness flags) so arms and
iterations are independent.
"""
import subprocess, json, sys

C = ["docker", "exec", "nacl-bench-neo4j", "cypher-shell", "-u", "neo4j",
     "-p", "neo4j_graph_dev", "--format", "plain"]

OLD_ALLOW = ("HAS_ATTRIBUTE|MAPS_TO|HAS_FIELD|USES_FORM|HAS_STEP|HAS_REQUIREMENT"
             "|ACTOR|CONTAINS_UC|CONTAINS_ENTITY|HAS_ENUM|HAS_VALUE|EXPOSES|IMPLEMENTS"
             "|GENERATES|INCLUDES_UC|AFFECTS_ENTITY|AFFECTS_MODULE|DEPENDS_ON")
NEW_ALLOW = (OLD_ALLOW + "|HAS_SCREEN|RENDERS|HAS_STATE|HAS_EVENT|HAS_TRANSITION"
             "|FROM_STATE|TO_STATE|ON_EVENT|TRIGGERS|CALLS|NAVIGATES_TO|EMITS")
SCREEN_LABELS = "dep:Screen OR dep:ScreenState OR dep:ScreenEvent OR dep:Transition OR dep:ScreenEffect"


def run(cy):
    r = subprocess.run(C + [cy], capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(f"CYPHER ERR for {cy[:100]}...\n{r.stderr}\n")
    return r.stdout


def scalar(cy, default=0):
    out = [l for l in run(cy).splitlines() if l.strip() != ""]
    try:
        return int(out[1])
    except Exception:
        return default


def reset_machines():
    """Remove every screen-machine node + provisional endpoints created by the bench."""
    run("MATCH (n) WHERE n:Screen OR n:ScreenState OR n:ScreenEvent OR n:Transition "
        "OR n:ScreenEffect OR n:AnalyticsEvent DETACH DELETE n;")
    run("MATCH (api:APIEndpoint) WHERE coalesce(api.provisional,false)=true DETACH DELETE api;")


def reset_staleness():
    run("MATCH (n) REMOVE n.review_status, n.stale_reason, n.stale_since, n.stale_origin;")
    run("MATCH (uc:UseCase) REMOVE uc.spec_version;")
    run("MATCH (:UseCase)-[:GENERATES]->(t:Task) SET t.planned_from_version = 0;")


def full_reset():
    reset_machines()
    reset_staleness()


def author_machine(uc, form):
    """Author the canonical 4-state machine EXACTLY as nacl-sa-ui state-machine does."""
    name = uc.replace("UC-", "Scr")          # unique PascalName per UC, e.g. Scr006
    sid = f"SCR-{name}"
    api = f"api-bench-{uc.lower()}"
    run(f"""MATCH (uc:UseCase {{id:'{uc}'}})
    MERGE (scr:Screen {{id:'{sid}'}})
    SET scr.name='{name}', scr.formless=false, scr.created_by='nacl-sa-ui',
        scr.created_at=coalesce(scr.created_at, datetime()), scr.updated=datetime()
    MERGE (uc)-[:HAS_SCREEN]->(scr);""")
    run(f"""MATCH (scr:Screen {{id:'{sid}'}}) MATCH (f:Form {{id:'{form}'}})
    MERGE (scr)-[:RENDERS]->(f);""")
    run(f"""MATCH (scr:Screen {{id:'{sid}'}})
    UNWIND [
      {{id:'SCRST-{name}-Loading', name:'Loading', kind:'loading', init:true,  term:false}},
      {{id:'SCRST-{name}-Loaded',  name:'Loaded',  kind:'content', init:false, term:false}},
      {{id:'SCRST-{name}-Empty',   name:'Empty',   kind:'empty',   init:false, term:false}},
      {{id:'SCRST-{name}-Error',   name:'Error',   kind:'error',   init:false, term:false}}
    ] AS s
    MERGE (st:ScreenState {{id:s.id}})
    SET st.name=s.name, st.state_kind=s.kind, st.is_initial=s.init, st.terminal=s.term
    MERGE (scr)-[:HAS_STATE]->(st);""")
    run(f"""MATCH (scr:Screen {{id:'{sid}'}})
    UNWIND [
      {{id:'SCREV-{name}-OnLoaded',     name:'OnLoaded',     kind:'system'}},
      {{id:'SCREV-{name}-OnLoadFailed', name:'OnLoadFailed', kind:'system'}},
      {{id:'SCREV-{name}-OnRetry',      name:'OnRetry',      kind:'user'}}
    ] AS e
    MERGE (ev:ScreenEvent {{id:e.id}}) SET ev.name=e.name, ev.event_kind=e.kind
    MERGE (scr)-[:HAS_EVENT]->(ev);""")
    run(f"""MATCH (scr:Screen {{id:'{sid}'}})
    UNWIND [
      {{id:'SCRTR-{name}-001', f:'SCRST-{name}-Loading', t:'SCRST-{name}-Loaded',  e:'SCREV-{name}-OnLoaded',     g:'items.length > 0'}},
      {{id:'SCRTR-{name}-002', f:'SCRST-{name}-Loading', t:'SCRST-{name}-Empty',   e:'SCREV-{name}-OnLoaded',     g:'items.length == 0'}},
      {{id:'SCRTR-{name}-003', f:'SCRST-{name}-Loading', t:'SCRST-{name}-Error',   e:'SCREV-{name}-OnLoadFailed', g:null}},
      {{id:'SCRTR-{name}-004', f:'SCRST-{name}-Error',   t:'SCRST-{name}-Loading', e:'SCREV-{name}-OnRetry',      g:null}}
    ] AS t
    MATCH (fs:ScreenState {{id:t.f}}), (ts:ScreenState {{id:t.t}}), (ev:ScreenEvent {{id:t.e}})
    MERGE (tr:Transition {{id:t.id}}) SET tr.guard=t.g
    MERGE (scr)-[:HAS_TRANSITION]->(tr)
    MERGE (tr)-[:FROM_STATE]->(fs) MERGE (tr)-[:TO_STATE]->(ts) MERGE (tr)-[:ON_EVENT]->(ev);""")
    # endpoint: reuse the UC's EXPOSES endpoint when present, else MERGE provisional
    run(f"""MATCH (uc:UseCase {{id:'{uc}'}})
    MERGE (a:APIEndpoint {{id:'{api}'}})
    ON CREATE SET a.path='GET /api/bench/{uc.lower()}', a.provisional=true,
                  a.created_by='nacl-sa-ui', a.created_at=datetime()
    MERGE (uc)-[:EXPOSES]->(a);""")
    run(f"""MATCH (tr:Transition {{id:'SCRTR-{name}-004'}}) MATCH (a:APIEndpoint {{id:'{api}'}})
    MERGE (eff:ScreenEffect {{id:'SCREF-{name}-001'}})
    SET eff.effect_kind='load', eff.description='reload on retry'
    MERGE (tr)-[:TRIGGERS]->(eff) MERGE (eff)-[:CALLS]->(a);""")
    return sid, name, api


def closure_screen_nodes(start_id, allow):
    return scalar(f"""MATCH (changed {{id:'{start_id}'}})
    MATCH path = (changed)-[:{allow}*1..6]-(dep)
    WHERE dep <> changed AND ({SCREEN_LABELS})
    RETURN count(DISTINCT dep);""")


def stamp_tight(uc, sid):
    run(f"""MATCH (uc:UseCase {{id:'{uc}'}})
    OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(uc)
    WITH collect(DISTINCT uc) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
    UNWIND affected AS a
    MATCH (a)-[:GENERATES]->(t:Task)
    SET t.review_status='stale', t.stale_origin='{sid}', t.stale_since=datetime();""")
    run(f"MATCH (uc:UseCase {{id:'{uc}'}}) SET uc.review_status='stale', uc.stale_origin='{sid}';")


# ---------------------------------------------------------------- L10 checks
L10 = {
 "L10.0": f"""MATCH (n) WHERE (n:Screen OR n:ScreenState OR n:ScreenEvent OR n:Transition
   OR n:ScreenEffect OR n:AnalyticsEvent) AND NOT (n)--() RETURN count(n);""",
 "L10.1": """MATCH (n) WHERE
   (n:Screen AND NOT (:UseCase)-[:HAS_SCREEN]->(n)) OR
   (n:ScreenState AND NOT (:Screen)-[:HAS_STATE]->(n)) OR
   (n:ScreenEvent AND NOT (:Screen)-[:HAS_EVENT]->(n)) OR
   (n:Transition AND NOT (:Screen)-[:HAS_TRANSITION]->(n)) OR
   (n:ScreenEffect AND NOT (:Transition)-[:TRIGGERS]->(n)) OR
   (n:AnalyticsEvent AND NOT (:ScreenEffect)-[:EMITS]->(n))
   RETURN count(n);""",
 "L10.2": """OPTIONAL MATCH (scr:Screen) WHERE NOT (scr)-[:RENDERS]->(:Form) AND coalesce(scr.formless,false)=false
   WITH count(scr) AS a
   OPTIONAL MATCH (e1:ScreenEffect) WHERE e1.effect_kind IN ['load','mutate'] AND NOT (e1)-[:CALLS]->(:APIEndpoint)
   WITH a, count(e1) AS b
   OPTIONAL MATCH (e2:ScreenEffect) WHERE e2.effect_kind='navigate' AND NOT (e2)-[:NAVIGATES_TO]->(:Screen)
   WITH a, b, count(e2) AS c
   OPTIONAL MATCH (e3:ScreenEffect) WHERE e3.effect_kind='analytics' AND NOT (e3)-[:EMITS]->(:AnalyticsEvent)
   WITH a, b, c, count(e3) AS d
   RETURN a + b + c + d;""",
 "L10.3": """MATCH (scr:Screen)-[:HAS_TRANSITION]->(tr:Transition)
   OPTIONAL MATCH (tr)-[:FROM_STATE]->(fs:ScreenState)
   OPTIONAL MATCH (tr)-[:TO_STATE]->(ts:ScreenState)
   OPTIONAL MATCH (tr)-[:ON_EVENT]->(ev:ScreenEvent)
   WITH scr, tr, count(DISTINCT fs) AS fc, count(DISTINCT ts) AS tc, count(DISTINCT ev) AS ec,
     [x IN collect(DISTINCT fs) WHERE NOT (scr)-[:HAS_STATE]->(x) | x.id]
       + [x IN collect(DISTINCT ts) WHERE NOT (scr)-[:HAS_STATE]->(x) | x.id] AS fstates,
     [x IN collect(DISTINCT ev) WHERE NOT (scr)-[:HAS_EVENT]->(x) | x.id] AS fevents
   WHERE fc <> 1 OR tc <> 1 OR ec <> 1 OR size(fstates) > 0 OR size(fevents) > 0
   RETURN count(tr);""",
 "L10.4": """MATCH (scr:Screen)-[:HAS_TRANSITION]->(tr:Transition),
     (tr)-[:FROM_STATE]->(fs:ScreenState), (tr)-[:ON_EVENT]->(ev:ScreenEvent)
   WITH scr, fs, ev, sum(CASE WHEN tr.guard IS NULL OR trim(tr.guard)='' THEN 1 ELSE 0 END) AS ug, count(tr) AS tot
   WHERE ug > 1 OR (ug >= 1 AND tot > ug)
   RETURN count(*);""",
 "L10.5a": """MATCH (scr:Screen)
   OPTIONAL MATCH (scr)-[:HAS_STATE]->(st:ScreenState) WHERE coalesce(st.is_initial,false)=true
   WITH scr, count(st) AS ic WHERE ic <> 1
   RETURN count(scr);""",
 "L10.5b": """MATCH (scr:Screen)-[:HAS_STATE]->(init:ScreenState), (scr)-[:HAS_STATE]->(st:ScreenState)
   WHERE coalesce(init.is_initial,false)=true AND st <> init
     AND NOT EXISTS {
       MATCH (init) ((:ScreenState)<-[:FROM_STATE]-(:Transition)-[:TO_STATE]->(:ScreenState)){1,12} (st)
     }
   RETURN count(st);""",
 "L10.6a": """MATCH (scr:Screen)-[:HAS_STATE]->(st:ScreenState)
   WHERE st.state_kind='error' AND coalesce(st.terminal,false)=false AND NOT (st)<-[:FROM_STATE]-(:Transition)
   RETURN count(st);""",
 "L10.6b": """MATCH (scr:Screen)-[:HAS_STATE]->(st:ScreenState)
   WHERE st.state_kind='error' AND coalesce(st.terminal,false)=false AND (st)<-[:FROM_STATE]-(:Transition)
     AND NOT EXISTS { MATCH (st)<-[:FROM_STATE]-(t2:Transition)-[:ON_EVENT]->(ev:ScreenEvent) WHERE ev.event_kind='user' }
   RETURN count(st);""",
 "L10.7a": """OPTIONAL MATCH (e1:ScreenEffect)-[:CALLS]->(x1) WHERE NOT x1:APIEndpoint OR x1.id IS NULL
   WITH count(x1) AS a
   OPTIONAL MATCH (e2:ScreenEffect)-[:NAVIGATES_TO]->(x2) WHERE NOT x2:Screen
   WITH a, count(x2) AS b
   OPTIONAL MATCH (e3:ScreenEffect)-[:EMITS]->(x3) WHERE NOT x3:AnalyticsEvent
   WITH a, b, count(x3) AS c
   RETURN a + b + c;""",
 "L10.8": """OPTIONAL MATCH (st:ScreenState) WHERE NOT coalesce(st.state_kind,'') IN ['initial','loading','busy','content','empty','error']
   WITH count(st) AS a
   OPTIONAL MATCH (ev:ScreenEvent) WHERE NOT coalesce(ev.event_kind,'') IN ['user','system','lifecycle']
   WITH a, count(ev) AS b
   OPTIONAL MATCH (ef:ScreenEffect) WHERE NOT coalesce(ef.effect_kind,'') IN ['load','mutate','navigate','analytics']
   WITH a, b, count(ef) AS c
   RETURN a + b + c;""",
}


def l10_all():
    return {k: scalar(q) for k, q in L10.items()}


# ------------------------------------------------------------------- defects
# Each injector returns {check: expected_count}; the repair is a full re-author.
def make_defects(uc, sid, name, api):
    return [
      ("orphan-effect",          f"CREATE (:ScreenEffect {{id:'SCREF-{name}-ZZZ', effect_kind:'load'}});",
        {"L10.0": 1, "L10.1": 1, "L10.2": 1}),   # orphan node: zero rels + no parent + load w/o CALLS
      ("missing-renders",        f"MATCH (scr:Screen {{id:'{sid}'}})-[r:RENDERS]->() DELETE r;",
        {"L10.2": 1}),
      ("foreign-state",          f"""MATCH (tr:Transition {{id:'SCRTR-{name}-004'}})-[r:TO_STATE]->() DELETE r
        WITH 1 AS _ MATCH (tr:Transition {{id:'SCRTR-{name}-004'}}), (other:ScreenState)
        WHERE NOT other.id STARTS WITH 'SCRST-{name}-' WITH tr, other LIMIT 1
        MERGE (tr)-[:TO_STATE]->(other);""",
        {"L10.3": 1}),
      ("nondeterminism",         f"""MATCH (scr:Screen {{id:'{sid}'}}),
        (fs:ScreenState {{id:'SCRST-{name}-Loading'}}), (ts:ScreenState {{id:'SCRST-{name}-Error'}}),
        (ev:ScreenEvent {{id:'SCREV-{name}-OnLoadFailed'}})
        CREATE (tr:Transition {{id:'SCRTR-{name}-005'}})
        MERGE (scr)-[:HAS_TRANSITION]->(tr)
        MERGE (tr)-[:FROM_STATE]->(fs) MERGE (tr)-[:TO_STATE]->(ts) MERGE (tr)-[:ON_EVENT]->(ev);""",
        {"L10.4": 1}),   # two unguarded on (Loading, OnLoadFailed)
      ("double-initial",         f"MATCH (st:ScreenState {{id:'SCRST-{name}-Error'}}) SET st.is_initial=true;",
        {"L10.5a": 1}),
      ("unreachable-state",      f"""MATCH (scr:Screen {{id:'{sid}'}})
        CREATE (st:ScreenState {{id:'SCRST-{name}-Ghost', name:'Ghost', state_kind:'content', is_initial:false}})
        MERGE (scr)-[:HAS_STATE]->(st);""",
        {"L10.5b": 1}),
      # retry transition gone -> error state trapped (L10.6a); its load effect loses its
      # TRIGGERS parent (L10.1) but KEEPS its CALLS edge, so L10.2 must NOT fire.
      # (First run of this harness expected L10.2 here — wrong mental model, detectors were right.)
      ("deadend-error",          f"MATCH (tr:Transition {{id:'SCRTR-{name}-004'}}) DETACH DELETE tr;",
        {"L10.6a": 1, "L10.1": 1}),
      # CALLS re-pointed at a Form: wrong-label target (L10.7a) AND the label-qualified
      # "load effect has no CALLS->APIEndpoint" (L10.2) both fire — correct double-detection.
      ("wrong-call-target",      f"""MATCH (eff:ScreenEffect {{id:'SCREF-{name}-001'}})-[r:CALLS]->() DELETE r
        WITH 1 AS _ MATCH (eff:ScreenEffect {{id:'SCREF-{name}-001'}}), (f:Form) WITH eff, f LIMIT 1
        MERGE (eff)-[:CALLS]->(f);""",
        {"L10.7a": 1, "L10.2": 1}),
    ]


# =================================================================== run
results = {}

# ---- H0: vacuous pass on the untouched clone ----
full_reset()
h0 = l10_all()
results["H0"] = {"checks": h0, "pass": all(v == 0 for v in h0.values())}

# ---- discover N real UCs (USES_FORM, not backend-only) ----
ucs = []
out = run("""MATCH (uc:UseCase)-[:USES_FORM]->(f:Form)
WHERE coalesce(uc.has_ui, true) = true
WITH uc.id AS ucId, min(f.id) AS formId
RETURN ucId + '|' + formId ORDER BY ucId;""")
# min(f.id), not head(collect(f.id)): multi-form UCs must pick the same form on
# every clone instance — collect() order follows storage order and is not stable
# across re-clones, which breaks byte-for-byte reproducibility of this report.
for line in out.splitlines():
    s = line.strip().strip('"')
    if s.startswith("UC-"):
        uc, form = s.split("|", 1)
        ucs.append((uc, form))

# ---- H1 + H2 per UC ----
h1_rows, h2_rows = [], []
for uc, form in ucs:
    full_reset()
    # probes BEFORE machine: old & new closures see zero screen nodes (sanity)
    pre_old = closure_screen_nodes(uc, OLD_ALLOW)
    sid, name, api = author_machine(uc, form)
    # first mapped DomainAttribute of the form (may be absent)
    da_out = run(f"""MATCH (:Form {{id:'{form}'}})-[:HAS_FIELD]->(:FormField)-[:MAPS_TO]->(da:DomainAttribute)
      RETURN da.id ORDER BY da.id LIMIT 1;""").splitlines()
    da = da_out[1].strip().strip('"') if len(da_out) > 1 else None

    row = {"uc": uc, "form": form, "screen": sid,
           "old_from_uc": closure_screen_nodes(uc, OLD_ALLOW),
           "new_from_uc": closure_screen_nodes(uc, NEW_ALLOW),
           "old_from_api": closure_screen_nodes(api, OLD_ALLOW),
           "new_from_api": closure_screen_nodes(api, NEW_ALLOW),
           "old_from_da": closure_screen_nodes(da, OLD_ALLOW) if da else None,
           "new_from_da": closure_screen_nodes(da, NEW_ALLOW) if da else None,
           "pre_machine_old_from_uc": pre_old}
    # expected machine subtree from UC: 1 screen + 4 states + 3 events + 4 transitions + 1 effect = 13
    row["h1_pass"] = (row["old_from_uc"] == 0 and row["new_from_uc"] == 13
                      and row["old_from_api"] == 0 and row["new_from_api"] >= 1
                      and (da is None or (row["old_from_da"] == 0 and row["new_from_da"] >= 1)))
    h1_rows.append(row)

    # H2: stamp after authoring; tight vs broad
    run(f"MATCH (uc:UseCase {{id:'{uc}'}}) SET uc.spec_version = coalesce(uc.spec_version,0) + 1;")
    stamp_tight(uc, sid)
    flagged_tasks = scalar("MATCH (t:Task) WHERE coalesce(t.review_status,'current')='stale' RETURN count(t);")
    flagged_total = scalar("MATCH (n) WHERE coalesce(n.review_status,'current')='stale' RETURN count(n);")
    expected_tasks = scalar(f"""MATCH (uc:UseCase {{id:'{uc}'}})
      OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(uc)
      WITH collect(DISTINCT uc) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
      UNWIND affected AS a MATCH (a)-[:GENERATES]->(t:Task) RETURN count(DISTINCT t);""")
    broad = scalar(f"""MATCH (changed:Screen {{id:'{sid}'}})
      MATCH (changed)-[:{NEW_ALLOW}*1..6]-(dep:Task) WHERE dep <> changed
      RETURN count(DISTINCT dep);""")
    h2_rows.append({"uc": uc, "screen": sid, "tasks_flagged": flagged_tasks,
                    "tasks_expected": expected_tasks, "total_flagged": flagged_total,
                    "expected_total": expected_tasks + 1,  # + the UC itself
                    "broad_radius_tasks": broad,
                    "h2_pass": flagged_tasks == expected_tasks and flagged_total == expected_tasks + 1})

results["H1"] = {"n_ucs": len(h1_rows), "rows": h1_rows,
                 "pass": all(r["h1_pass"] for r in h1_rows)}
results["H2"] = {"n_ucs": len(h2_rows), "rows": h2_rows,
                 "tight_total": sum(r["total_flagged"] for r in h2_rows),
                 "broad_total": sum(r["broad_radius_tasks"] for r in h2_rows),
                 "pass": all(r["h2_pass"] for r in h2_rows)}

# ---- H3: defect injection on one machine (first UC), full reset between ----
h3_rows = []
uc0, form0 = ucs[0]
for defect, inject, expected in make_defects(uc0, f"SCR-{uc0.replace('UC-','Scr')}",
                                             uc0.replace("UC-", "Scr"),
                                             f"api-bench-{uc0.lower()}"):
    full_reset()
    author_machine(uc0, form0)
    clean = l10_all()
    run(inject)
    after = l10_all()
    fired = {k: after[k] for k in after if after[k] != 0}
    crosstalk = {k: v for k, v in fired.items() if k not in expected}
    h3_rows.append({"defect": defect, "expected": expected, "fired": fired,
                    "clean_before": all(v == 0 for v in clean.values()),
                    "h3_pass": all(v == 0 for v in clean.values())
                               and all(after.get(k) == v for k, v in expected.items())
                               and not crosstalk})
results["H3"] = {"n_defects": len(h3_rows), "rows": h3_rows,
                 "pass": all(r["h3_pass"] for r in h3_rows)}

# ---- leave the clone clean ----
full_reset()
results["clone_clean"] = {
    "nodes": scalar("MATCH (n) RETURN count(n);"),
    "rels": scalar("MATCH ()-[r]->() RETURN count(r);"),
    "screens": scalar("MATCH (s:Screen) RETURN count(s);"),
    "stale": scalar("MATCH (n) WHERE coalesce(n.review_status,'current')='stale' RETURN count(n);"),
}
results["overall_pass"] = all(results[h]["pass"] for h in ("H0", "H1", "H2", "H3"))
print(json.dumps(results, indent=2, ensure_ascii=False))
