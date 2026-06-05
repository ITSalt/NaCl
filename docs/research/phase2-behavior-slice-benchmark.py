#!/usr/bin/env python3
"""Publishable graph benchmark for NaCl Фаза 2 (behavior slices).

Runs on an ISOLATED clone of the family-cinema graph (nacl-bench-neo4j, bolt 7798).

Hypotheses (falsifiable):
  H0. Vacuous pass, twice: (a) on a graph with ZERO Slice nodes every L11 check
      returns zero findings; (b) on a graph with 31 screen machines and STILL
      zero slices, every L11 check returns zero findings — the overlay is
      opt-in, machine adoption alone never triggers L11.
  H1. Reachability, split by anchor class: with the OLD (pre-Фаза-2)
      sa_impact_closure allow-list a COVERS-only slice is unreachable from the
      changed UC (CALLS was already registered in Фаза 1, so CALLS-bearing
      slices are "accidentally" reachable old — measured honestly, 2 of 3
      canonical slices); with the NEW allow-list the change reaches ALL slices
      from the UC (1 hop), the DomainAttribute, the APIEndpoint (1 hop), and
      the Task (1 hop via VERIFIED_BY).
  H2. The staleness stamp stays TIGHT after slice authoring: exactly the UC's
      generated tasks + transitive DEPENDS_ON dependents' tasks + the UC itself
      are flagged (stale_origin = the UC id); the broad undirected walk over
      the Фаза-2-enlarged edge set would flag far more.
  H3. The L11 detectors actually detect: each of 14 injected defect classes
      fires exactly its expected checks across the FULL L10+L11 matrix (21
      checks) with zero cross-talk — in particular a wrong-label
      (sl:Slice)-[:CALLS]-> never fires the ScreenEffect-CALLS checks
      (L10.2/L10.7a) and vice versa, the namespace-sharing guarantee.

Each of the N real UCs (all UCs in the clone that USES_FORM and are not
backend-only) gets the canonical Фаза-1 4-state machine plus the three
canonical data-loading slices EXACTLY as the `nacl-sa-uc slices` command
writes them (HappyPath / EmptyResult / LoadFailureRetry; VERIFIED_BY by the
default all-tasks rule — fc task ids are non-canonical); every measurement
starts from a full reset so arms and iterations are independent.
"""
import subprocess, json, sys

C = ["docker", "exec", "nacl-bench-neo4j", "cypher-shell", "-u", "neo4j",
     "-p", "neo4j_graph_dev", "--format", "plain"]

OLD_ALLOW = ("HAS_ATTRIBUTE|MAPS_TO|HAS_FIELD|USES_FORM|HAS_STEP|HAS_REQUIREMENT"
             "|ACTOR|CONTAINS_UC|CONTAINS_ENTITY|HAS_ENUM|HAS_VALUE|EXPOSES|IMPLEMENTS"
             "|GENERATES|INCLUDES_UC|AFFECTS_ENTITY|AFFECTS_MODULE|DEPENDS_ON"
             "|HAS_SCREEN|RENDERS|HAS_STATE|HAS_EVENT|HAS_TRANSITION"
             "|FROM_STATE|TO_STATE|ON_EVENT|TRIGGERS|CALLS|NAVIGATES_TO|EMITS")
NEW_ALLOW = OLD_ALLOW + "|HAS_SLICE|COVERS|VERIFIED_BY"


def run(cy):
    r = subprocess.run(C + [cy], capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(f"CYPHER ERR for {cy[:120]}...\n{r.stderr}\n")
    return r.stdout


def scalar(cy, default=0):
    out = [l for l in run(cy).splitlines() if l.strip() != ""]
    try:
        return int(out[1])
    except Exception:
        return default


def first_value(cy):
    out = [l for l in run(cy).splitlines() if l.strip() != ""]
    return out[1].strip().strip('"') if len(out) > 1 else None


def full_reset():
    run("MATCH (sl:Slice) DETACH DELETE sl;")
    run("MATCH (n) WHERE n:Screen OR n:ScreenState OR n:ScreenEvent OR n:Transition "
        "OR n:ScreenEffect OR n:AnalyticsEvent DETACH DELETE n;")
    run("MATCH (api:APIEndpoint) WHERE coalesce(api.provisional,false)=true DETACH DELETE api;")
    run("MATCH (n) REMOVE n.review_status, n.stale_reason, n.stale_since, n.stale_origin;")
    run("MATCH (uc:UseCase) REMOVE uc.spec_version;")
    run("MATCH (:UseCase)-[:GENERATES]->(t:Task) SET t.planned_from_version = 0;")


def author_machine(uc, form):
    """The canonical Фаза-1 4-state machine, EXACTLY as nacl-sa-ui writes it."""
    name = uc.replace("UC-", "Scr")
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


def author_slices(uc, name, api):
    """The 3 canonical data-loading slices EXACTLY as nacl-sa-uc `slices` writes them.
    Returns ids in order [HappyPath, EmptyResult, LoadFailureRetry]."""
    nnn = uc.replace("UC-", "")
    spec = [
        ("HappyPath", "happy", "result exists and is non-empty",
         "user opens the screen", "the data is displayed",
         [f"SCRST-{name}-Loading", f"SCRST-{name}-Loaded", f"SCRTR-{name}-001"], [api]),
        ("EmptyResult", "alternate", "result is empty",
         "user opens the screen", "the empty-state affordance is shown",
         [f"SCRST-{name}-Empty", f"SCRTR-{name}-002"], []),
        ("LoadFailureRetry", "error", "backend is unavailable",
         "load fails and the user taps Retry", "error shown; retry re-fetches",
         [f"SCRST-{name}-Error", f"SCRTR-{name}-003", f"SCRTR-{name}-004"], [api]),
    ]
    ids = []
    for pid, kind, given, when, then, covers, calls in spec:
        slid = f"SLC-{nnn}-{pid}"
        ids.append(slid)
        run(f"""MATCH (uc:UseCase {{id:'{uc}'}})
        MERGE (sl:Slice {{id:'{slid}'}})
        SET sl.name='{pid}', sl.slice_kind='{kind}',
            sl.given='{given}', sl.when='{when}', sl.then='{then}',
            sl.created_by='nacl-sa-uc',
            sl.created_at=coalesce(sl.created_at, datetime()), sl.updated=datetime()
        MERGE (uc)-[:HAS_SLICE]->(sl);""")
        for cov in covers:
            run(f"""MATCH (sl:Slice {{id:'{slid}'}})
            MATCH (x {{id:'{cov}'}}) WHERE x:ScreenState OR x:Transition
            MERGE (sl)-[:COVERS]->(x);""")
        for a in calls:
            run(f"""MATCH (sl:Slice {{id:'{slid}'}}) MATCH (a:APIEndpoint {{id:'{a}'}})
            MERGE (sl)-[:CALLS]->(a);""")
        # VERIFIED_BY: default rule — all GENERATES tasks (fc ids are non-canonical)
        run(f"""MATCH (uc:UseCase {{id:'{uc}'}})-[:GENERATES]->(t:Task)
        MATCH (sl:Slice {{id:'{slid}'}})
        MERGE (sl)-[:VERIFIED_BY]->(t);""")
    return ids


# ---------------------------------------------------------------- L11 checks
L11 = {
 "L11.0": """MATCH (sl:Slice) WHERE NOT (sl)--() RETURN count(sl);""",
 "L11.1": """MATCH (sl:Slice) WHERE NOT (:UseCase)-[:HAS_SLICE]->(sl) RETURN count(sl);""",
 "L11.2": """MATCH (sl:Slice)
   WHERE NOT EXISTS { MATCH (sl)-[:COVERS]->(x) WHERE x:ScreenState OR x:Transition }
     AND NOT (sl)-[:CALLS]->(:APIEndpoint)
   RETURN count(sl);""",
 "L11.3": """OPTIONAL MATCH (sl1:Slice)-[:COVERS]->(x1) WHERE NOT x1:ScreenState AND NOT x1:Transition
   WITH count(x1) AS a
   OPTIONAL MATCH (uc:UseCase)-[:HAS_SLICE]->(sl2:Slice)-[:COVERS]->(x2)
   WHERE (x2:ScreenState OR x2:Transition)
     AND NOT EXISTS { MATCH (uc)-[:HAS_SCREEN]->(scr:Screen)
                      WHERE (scr)-[:HAS_STATE]->(x2) OR (scr)-[:HAS_TRANSITION]->(x2) }
   WITH a, count(x2) AS b
   RETURN a + b;""",
 "L11.4": """MATCH (uc:UseCase)-[:HAS_SLICE]->(sl:Slice)
   WHERE (uc)-[:GENERATES]->(:Task) AND NOT (sl)-[:VERIFIED_BY]->(:Task)
   RETURN count(sl);""",
 "L11.5": """OPTIONAL MATCH (sl1:Slice)-[:VERIFIED_BY]->(x1) WHERE NOT x1:Task
   WITH count(x1) AS a
   OPTIONAL MATCH (uc:UseCase)-[:HAS_SLICE]->(sl2:Slice)-[:VERIFIED_BY]->(t:Task)
   WHERE NOT (uc)-[:GENERATES]->(t)
   WITH a, count(t) AS b
   OPTIONAL MATCH (sl3:Slice)-[:CALLS]->(x3) WHERE NOT x3:APIEndpoint
   WITH a, b, count(x3) AS c
   RETURN a + b + c;""",
 "L11.6a": """MATCH (sl:Slice) WHERE sl.then IS NULL OR trim(sl.then) = '' RETURN count(sl);""",
 "L11.6b": """MATCH (sl:Slice)
   WHERE NOT coalesce(sl.slice_kind,'') IN ['happy','alternate','error','edge']
   RETURN count(sl);""",
 "L11.7": """MATCH (uc:UseCase)-[:HAS_SCREEN]->(scr:Screen)
   WHERE (uc)-[:HAS_SLICE]->(:Slice)
   MATCH (scr)-[:HAS_STATE|HAS_TRANSITION]->(x)
   WHERE NOT (x)<-[:COVERS]-(:Slice)
   RETURN count(x);""",
 "L11.8": """MATCH (uc:UseCase)-[:HAS_SLICE]->(:Slice)
   WITH DISTINCT uc
   WHERE NOT EXISTS { MATCH (uc)-[:HAS_SLICE]->(h:Slice) WHERE h.slice_kind='happy' }
   RETURN count(uc);""",
}

# Full L10 matrix re-used verbatim from the Фаза-1 harness (cross-talk arm).
L10 = {
 "L10.0": """MATCH (n) WHERE (n:Screen OR n:ScreenState OR n:ScreenEvent OR n:Transition
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


def l11_all():
    return {k: scalar(q) for k, q in L11.items()}


def all_checks():
    out = {k: scalar(q) for k, q in L11.items()}
    out.update({k: scalar(q) for k, q in L10.items()})
    return out


def closure_slices(start_id, allow):
    return scalar(f"""MATCH (changed {{id:'{start_id}'}})
    MATCH path = (changed)-[:{allow}*1..6]-(dep)
    WHERE dep <> changed AND dep:Slice
    RETURN count(DISTINCT dep);""")


def hops_to(start_id, target_id, allow):
    """min hops, or -1 when unreachable within *1..6."""
    return scalar(f"""MATCH (changed {{id:'{start_id}'}}), (sl:Slice {{id:'{target_id}'}})
    MATCH path = (changed)-[:{allow}*1..6]-(sl)
    RETURN min(length(path));""", default=-1)


def stamp_tight(uc):
    """Verbatim sa-feature 3g contract; stale_origin = the UC id (slice batch)."""
    run(f"""MATCH (uc:UseCase {{id:'{uc}'}})
    OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(uc)
    WITH collect(DISTINCT uc) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
    UNWIND affected AS a
    MATCH (a)-[:GENERATES]->(t:Task)
    SET t.review_status='stale', t.stale_reason='behavior slices created for {uc}',
        t.stale_since=datetime(), t.stale_origin='{uc}';""")
    run(f"""MATCH (uc:UseCase {{id:'{uc}'}})
    SET uc.review_status='stale', uc.stale_reason='behavior slices created for {uc}',
        uc.stale_since=datetime(), uc.stale_origin='{uc}';""")


# ------------------------------------------------------------------- defects
def make_defects(uc, name, api, foreign_state, foreign_task):
    """14 defect classes; expected = exact non-zero counts across the L10+L11 matrix."""
    nnn = uc.replace("UC-", "")
    happy = f"SLC-{nnn}-HappyPath"
    empty = f"SLC-{nnn}-EmptyResult"
    return [
      ("orphan-slice",
       f"CREATE (:Slice {{id:'SLC-{nnn}-Orphan', name:'Orphan', slice_kind:'happy', then:'x'}});",
       {"L11.0": 1, "L11.1": 1, "L11.2": 1}),
      ("parentless-slice",
       f"""CREATE (sl:Slice {{id:'SLC-{nnn}-NoParent', name:'NoParent', slice_kind:'edge', then:'x'}})
       WITH sl MATCH (st:ScreenState {{id:'SCRST-{name}-Loading'}})
       MERGE (sl)-[:COVERS]->(st);""",
       {"L11.1": 1}),
      # EmptyResult loses its only anchors -> anchorless; its Empty state and
      # guarded transition lose their only cover -> 2 coverage gaps.
      ("anchorless-slice",
       f"MATCH (sl:Slice {{id:'{empty}'}})-[r:COVERS]->() DELETE r;",
       {"L11.2": 1, "L11.7": 2}),
      ("foreign-covers",
       f"""MATCH (sl:Slice {{id:'{happy}'}}), (st:ScreenState {{id:'{foreign_state}'}})
       MERGE (sl)-[:COVERS]->(st);""",
       {"L11.3": 1}),
      ("wrong-label-covers",
       f"""MATCH (sl:Slice {{id:'{happy}'}}) MATCH (f:Form) WITH sl, f LIMIT 1
       MERGE (sl)-[:COVERS]->(f);""",
       {"L11.3": 1}),
      ("unverified-slice",
       f"MATCH (sl:Slice {{id:'{happy}'}})-[r:VERIFIED_BY]->() DELETE r;",
       {"L11.4": 1}),
      ("foreign-task-verifies",
       f"""MATCH (sl:Slice {{id:'{happy}'}}), (t:Task {{id:'{foreign_task}'}})
       MERGE (sl)-[:VERIFIED_BY]->(t);""",
       {"L11.5": 1}),
      ("wrong-label-verified-by",
       f"""MATCH (sl:Slice {{id:'{happy}'}}) MATCH (f:Form) WITH sl, f LIMIT 1
       MERGE (sl)-[:VERIFIED_BY]->(f);""",
       {"L11.5": 1}),
      # THE namespace-sharing guarantee: a junk (sl:Slice)-[:CALLS]-> must fire
      # ONLY L11.5 — never the ScreenEffect-CALLS checks L10.2 / L10.7a.
      ("wrong-label-slice-calls",
       f"""MATCH (sl:Slice {{id:'{happy}'}}) MATCH (f:Form) WITH sl, f LIMIT 1
       MERGE (sl)-[:CALLS]->(f);""",
       {"L11.5": 1}),
      ("empty-then",
       f"MATCH (sl:Slice {{id:'{happy}'}}) SET sl.then='';",
       {"L11.6a": 1}),
      # 'smoke' is junk vocabulary (L11.6b) AND robs the UC of its only
      # happy-kind slice (L11.8) — correct double-detection by construction.
      # (First run of this harness expected only L11.6b — author's wrong
      # mental model, the detectors were right; same class as the two wrong
      # H3 expectations in the Фаза-1 first run.)
      ("bad-kind",
       f"MATCH (sl:Slice {{id:'{happy}'}}) SET sl.slice_kind='smoke';",
       {"L11.6b": 1, "L11.8": 1}),
      # Loading loses its only cover; HappyPath keeps Loaded + transition + CALLS.
      ("coverage-gap",
       f"""MATCH (sl:Slice {{id:'{happy}'}})-[r:COVERS]->(x {{id:'SCRST-{name}-Loading'}}) DELETE r;""",
       {"L11.7": 1}),
      ("no-happy-slice",
       f"MATCH (sl:Slice {{id:'{happy}'}}) SET sl.slice_kind='alternate';",
       {"L11.8": 1}),
      # Reverse cross-talk: a ScreenEffect-CALLS defect (Фаза-1 class) must fire
      # the L10 checks and leave EVERY L11 check at zero.
      ("effect-calls-wrong-label",
       f"""MATCH (eff:ScreenEffect {{id:'SCREF-{name}-001'}})-[r:CALLS]->() DELETE r
       WITH 1 AS _ MATCH (eff:ScreenEffect {{id:'SCREF-{name}-001'}}), (f:Form) WITH eff, f LIMIT 1
       MERGE (eff)-[:CALLS]->(f);""",
       {"L10.7a": 1, "L10.2": 1}),
    ]


# =================================================================== run
results = {}

# ---- H0a: vacuous pass on the untouched clone (zero Slice nodes) ----
full_reset()
h0a = l11_all()
results["H0a_clean_graph"] = {"checks": h0a, "pass": all(v == 0 for v in h0a.values())}

# ---- discover N real UCs (USES_FORM, not backend-only) ----
ucs = []
out = run("""MATCH (uc:UseCase)-[:USES_FORM]->(f:Form)
WHERE coalesce(uc.has_ui, true) = true
WITH uc.id AS ucId, head(collect(f.id)) AS formId
RETURN ucId + '|' + formId ORDER BY ucId;""")
for line in out.splitlines():
    s = line.strip().strip('"')
    if s.startswith("UC-"):
        uc, form = s.split("|", 1)
        ucs.append((uc, form))

# ---- H0b: 31 machines authored, STILL zero slices -> L11 stays silent ----
for uc, form in ucs:
    author_machine(uc, form)
h0b = l11_all()
results["H0b_machines_no_slices"] = {"n_machines": len(ucs), "checks": h0b,
                                     "pass": all(v == 0 for v in h0b.values())}
full_reset()

# ---- H1 + H2 per UC (full reset between iterations) ----
h1_rows, h2_rows = [], []
for uc, form in ucs:
    full_reset()
    sid, name, api = author_machine(uc, form)
    slice_ids = author_slices(uc, name, api)   # [Happy, Empty(COVERS-only), Failure]
    happy, empty_sl = slice_ids[0], slice_ids[1]
    da = first_value(f"""MATCH (:Form {{id:'{form}'}})-[:HAS_FIELD]->(:FormField)
      -[:MAPS_TO]->(da:DomainAttribute) RETURN da.id ORDER BY da.id LIMIT 1;""")
    task = first_value(f"""MATCH (uc:UseCase {{id:'{uc}'}})-[:GENERATES]->(t:Task)
      RETURN t.id ORDER BY t.id LIMIT 1;""")
    intact = l11_all()

    row = {"uc": uc, "slices": slice_ids, "has_tasks": task is not None,
           "l11_intact_zero": all(v == 0 for v in intact.values()),
           "old_from_uc": closure_slices(uc, OLD_ALLOW),
           "new_from_uc": closure_slices(uc, NEW_ALLOW),
           "old_from_api": closure_slices(api, OLD_ALLOW),
           "new_from_api": closure_slices(api, NEW_ALLOW),
           "old_from_da": closure_slices(da, OLD_ALLOW) if da else None,
           "new_from_da": closure_slices(da, NEW_ALLOW) if da else None,
           "old_from_task": closure_slices(task, OLD_ALLOW) if task else None,
           "new_from_task": closure_slices(task, NEW_ALLOW) if task else None,
           "old_uc_to_covers_only": hops_to(uc, empty_sl, OLD_ALLOW),
           "new_uc_to_covers_only": hops_to(uc, empty_sl, NEW_ALLOW),
           "new_uc_to_happy_hops": hops_to(uc, happy, NEW_ALLOW)}
    # COVERS-only slice: old-unreachable (-1); CALLS-bearing (2 of 3): old finds exactly 2.
    row["h1_pass"] = (row["l11_intact_zero"]
                      and row["old_from_uc"] == 2 and row["new_from_uc"] == 3
                      and row["old_uc_to_covers_only"] == -1
                      and row["new_uc_to_covers_only"] >= 1
                      and row["new_uc_to_happy_hops"] == 1
                      and row["new_from_api"] == 3
                      and (da is None or row["new_from_da"] == 3)
                      and (task is None or row["new_from_task"] == 3))
    h1_rows.append(row)

    # H2: tight stamp vs broad radius (anchor = the changed UC; origin = UC id)
    run(f"MATCH (uc:UseCase {{id:'{uc}'}}) SET uc.spec_version = coalesce(uc.spec_version,0) + 1;")
    stamp_tight(uc)
    flagged_tasks = scalar("MATCH (t:Task) WHERE coalesce(t.review_status,'current')='stale' RETURN count(t);")
    flagged_total = scalar("MATCH (n) WHERE coalesce(n.review_status,'current')='stale' RETURN count(n);")
    expected_tasks = scalar(f"""MATCH (uc:UseCase {{id:'{uc}'}})
      OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(uc)
      WITH collect(DISTINCT uc) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
      UNWIND affected AS a MATCH (a)-[:GENERATES]->(t:Task) RETURN count(DISTINCT t);""")
    broad_uc = scalar(f"""MATCH (changed:UseCase {{id:'{uc}'}})
      MATCH (changed)-[:{NEW_ALLOW}*1..6]-(dep:Task) WHERE dep <> changed
      RETURN count(DISTINCT dep);""")
    broad_slice = scalar(f"""MATCH (changed:Slice {{id:'{happy}'}})
      MATCH (changed)-[:{NEW_ALLOW}*1..6]-(dep:Task) WHERE dep <> changed
      RETURN count(DISTINCT dep);""")
    h2_rows.append({"uc": uc, "tasks_flagged": flagged_tasks,
                    "tasks_expected": expected_tasks, "total_flagged": flagged_total,
                    "expected_total": expected_tasks + 1,
                    "broad_from_uc_tasks": broad_uc,
                    "broad_from_slice_tasks": broad_slice,
                    "h2_pass": flagged_tasks == expected_tasks
                               and flagged_total == expected_tasks + 1})

results["H1"] = {"n_ucs": len(h1_rows), "rows": h1_rows,
                 "pass": all(r["h1_pass"] for r in h1_rows)}
results["H2"] = {"n_ucs": len(h2_rows), "rows": h2_rows,
                 "tight_total": sum(r["total_flagged"] for r in h2_rows),
                 "broad_from_uc_total": sum(r["broad_from_uc_tasks"] for r in h2_rows),
                 "broad_from_slice_total": sum(r["broad_from_slice_tasks"] for r in h2_rows),
                 "pass": all(r["h2_pass"] for r in h2_rows)}

# ---- H3: defect injection (UC-006 if present, else first UC with tasks) ----
by_id = dict(ucs)
uc0 = "UC-006" if "UC-006" in by_id else next(
    uc for uc, _ in ucs
    if scalar(f"MATCH (uc:UseCase {{id:'{uc}'}})-[:GENERATES]->(t:Task) RETURN count(t);") > 0)
form0 = by_id[uc0]
name0 = uc0.replace("UC-", "Scr")
api0 = f"api-bench-{uc0.lower()}"
# foreign fixtures: another UC with tasks, exclusive task not owned by uc0
ucF = next(uc for uc, _ in ucs if uc != uc0 and scalar(
    f"""MATCH (uc:UseCase {{id:'{uc}'}})-[:GENERATES]->(t:Task)
    WHERE NOT (:UseCase {{id:'{uc0}'}})-[:GENERATES]->(t) RETURN count(t);""") > 0)
formF = by_id[ucF]
nameF = ucF.replace("UC-", "Scr")
foreign_state = f"SCRST-{nameF}-Loading"

h3_rows = []
for defect, inject, expected in make_defects(uc0, name0, api0, foreign_state, "PLACEHOLDER"):
    full_reset()
    author_machine(uc0, form0)
    author_machine(ucF, formF)          # foreign machine exists, NO slices (opt-in stays clean)
    author_slices(uc0, name0, api0)
    foreign_task = first_value(f"""MATCH (uc:UseCase {{id:'{ucF}'}})-[:GENERATES]->(t:Task)
      WHERE NOT (:UseCase {{id:'{uc0}'}})-[:GENERATES]->(t) RETURN t.id ORDER BY t.id LIMIT 1;""")
    inject = inject.replace("PLACEHOLDER", foreign_task or "")
    clean = all_checks()
    run(inject)
    after = all_checks()
    fired = {k: v for k, v in after.items() if v != 0}
    crosstalk = {k: v for k, v in fired.items() if k not in expected}
    h3_rows.append({"defect": defect, "expected": expected, "fired": fired,
                    "clean_before": all(v == 0 for v in clean.values()),
                    "h3_pass": all(v == 0 for v in clean.values())
                               and all(after.get(k) == v for k, v in expected.items())
                               and not crosstalk})
results["H3"] = {"n_defects": len(h3_rows), "uc": uc0, "foreign_uc": ucF, "rows": h3_rows,
                 "pass": all(r["h3_pass"] for r in h3_rows)}

# ---- leave the clone clean ----
full_reset()
results["clone_clean"] = {
    "nodes": scalar("MATCH (n) RETURN count(n);"),
    "rels": scalar("MATCH ()-[r]->() RETURN count(r);"),
    "slices": scalar("MATCH (sl:Slice) RETURN count(sl);"),
    "screens": scalar("MATCH (s:Screen) RETURN count(s);"),
    "stale": scalar("MATCH (n) WHERE coalesce(n.review_status,'current')='stale' RETURN count(n);"),
}
results["overall_pass"] = all(results[h]["pass"] for h in
                              ("H0a_clean_graph", "H0b_machines_no_slices", "H1", "H2", "H3"))
print(json.dumps(results, indent=2, ensure_ascii=False))
