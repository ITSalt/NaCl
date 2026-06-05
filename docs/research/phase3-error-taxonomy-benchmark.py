#!/usr/bin/env python3
"""Publishable graph benchmark for NaCl Фаза 3 (domain error taxonomy).

Runs on an ISOLATED clone of the family-cinema graph (nacl-bench-neo4j, bolt 7798).

Hypotheses (falsifiable):
  H0. Vacuous pass, twice: (a) on a graph with ZERO DomainError nodes every
      L12 check returns zero findings; (b) on a graph with 31 screen machines
      AND 93 behavior slices and STILL zero errors, every L12 check returns
      zero findings — and the full L10+L11 matrix stays unchanged. The error
      overlay is opt-in; adopting the previous two extension layers alone
      never triggers L12.
  H1. Reachability: with the OLD (pre-Фаза-3) sa_impact_closure allow-list
      neither DomainError nor ErrorPresentation is reachable from the changed
      UC / APIEndpoint / DomainAttribute — ALL five Phase-3 edge names are new
      (first phase with no namespace sharing), so unlike Фаза 2 there is no
      "accidentally reachable" class. With the NEW allow-list the change
      reaches every error (UC: 2 hops; endpoint: 1 hop) and presentation
      (UC: 3 hops); from the DomainAttribute the Module-HAS_ERROR parent edge
      provides a 3-hop shortcut (measured, the screen-HANDLES path also
      exists at 5-6 hops — the *1..6 ceiling is not binding).
  H2. The staleness stamp stays TIGHT after error authoring: exactly the UC's
      generated tasks + transitive DEPENDS_ON dependents' tasks + the UC
      itself (stale_origin = the UC id). PLUS the one new Phase-3 semantic:
      modifying properties of a SHARED error stamps exactly the raiser UCs
      (+ their tasks) with stale_origin = the ERR id — directed, never the
      broad closure. The broad undirected walk over the Фаза-3-enlarged edge
      set would flag far more (trend 20x -> 49x -> 51x -> ?).
  H3. The L12 detectors actually detect: each of 21 injected defect classes
      fires exactly its expected checks across the FULL L10+L11+L12 matrix
      (32 checks) with zero cross-talk in both directions — garbage
      HANDLES/SHOWS edges never fire the L10 ScreenState checks, and L10/L11
      defects never fire L12 (no shared edge names this phase; the matrix
      proves the isolation anyway).

Each of the N real UCs (USES_FORM, has_ui, AND owned by a Module — the
producer guard refuses module-less UCs; the clone has 2 such, skipped
honestly) gets the canonical Фаза-1 machine + the three canonical Фаза-2
slices + two canonical domain errors EXACTLY as the `nacl-sa-uc errors`
command writes them (module-parented, MAY_RAISE on the provisional endpoint,
HANDLES from the Error state under the channel rule, presentations with
user-language messages, SHOWS closing the triangle). Full reset between
measurements; arms and iterations are independent.
"""
import subprocess, json, sys

C = ["docker", "exec", "nacl-bench-neo4j", "cypher-shell", "-u", "neo4j",
     "-p", "neo4j_graph_dev", "--format", "plain"]

OLD_ALLOW = ("HAS_ATTRIBUTE|MAPS_TO|HAS_FIELD|USES_FORM|HAS_STEP|HAS_REQUIREMENT"
             "|ACTOR|CONTAINS_UC|CONTAINS_ENTITY|HAS_ENUM|HAS_VALUE|EXPOSES|IMPLEMENTS"
             "|GENERATES|INCLUDES_UC|AFFECTS_ENTITY|AFFECTS_MODULE|DEPENDS_ON"
             "|HAS_SCREEN|RENDERS|HAS_STATE|HAS_EVENT|HAS_TRANSITION"
             "|FROM_STATE|TO_STATE|ON_EVENT|TRIGGERS|CALLS|NAVIGATES_TO|EMITS"
             "|HAS_SLICE|COVERS|VERIFIED_BY")
NEW_ALLOW = OLD_ALLOW + "|HAS_ERROR|MAY_RAISE|HANDLES|PRESENTED_AS|SHOWS"


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
    run("MATCH (n) WHERE n:DomainError OR n:ErrorPresentation DETACH DELETE n;")
    run("MATCH (sl:Slice) DETACH DELETE sl;")
    run("MATCH (n) WHERE n:Screen OR n:ScreenState OR n:ScreenEvent OR n:Transition "
        "OR n:ScreenEffect OR n:AnalyticsEvent DETACH DELETE n;")
    run("MATCH (api:APIEndpoint) WHERE coalesce(api.provisional,false)=true DETACH DELETE api;")
    run("MATCH (n) REMOVE n.review_status, n.stale_reason, n.stale_since, n.stale_origin;")
    run("MATCH (uc:UseCase) REMOVE uc.spec_version;")
    run("MATCH (:UseCase)-[:GENERATES]->(t:Task) SET t.planned_from_version = 0;")


def author_machine(uc, form):
    """The canonical Фаза-1 4-state machine, EXACTLY as nacl-sa-ui writes it.
    (Verbatim from the Фаза-2 harness.)"""
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
    """The 3 canonical Фаза-2 slices (verbatim from the Фаза-2 harness)."""
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
        run(f"""MATCH (uc:UseCase {{id:'{uc}'}})-[:GENERATES]->(t:Task)
        MATCH (sl:Slice {{id:'{slid}'}})
        MERGE (sl)-[:VERIFIED_BY]->(t);""")
    return ids


def author_errors(uc, name, api, module):
    """Two canonical domain errors EXACTLY as `nacl-sa-uc errors` writes them:
    module-parented, MAY_RAISE on the (provisional) endpoint, HANDLES from the
    Error state (channel rule holds: SCREF-001 CALLS the same endpoint),
    user-language presentations, SHOWS closing the triangle.
    Returns ([err ids], [presentation ids])."""
    nnn = uc.replace("UC-", "")
    e1 = f"ERR-BENCH{nnn}_NOT_FOUND"
    e2 = f"ERR-BENCH{nnn}_UPSTREAM_FAILED"
    p1 = f"ERRP-BENCH{nnn}_NOT_FOUND-Inline"
    p2 = f"ERRP-BENCH{nnn}_UPSTREAM_FAILED-Toast"
    run(f"""MATCH (m:Module {{id:'{module}'}})
    UNWIND [
      {{id:'{e1}', code:'BENCH{nnn}_NOT_FOUND', kind:'not_found', http:404, retry:false}},
      {{id:'{e2}', code:'BENCH{nnn}_UPSTREAM_FAILED', kind:'external', http:503, retry:true}}
    ] AS e
    MERGE (err:DomainError {{id:e.id}})
    SET err.code=e.code, err.name=e.code, err.error_kind=e.kind,
        err.http_status=e.http, err.retryable=e.retry, err.created_by='nacl-sa-uc',
        err.created_at=coalesce(err.created_at, datetime()), err.updated=datetime()
    MERGE (m)-[:HAS_ERROR]->(err);""")
    run(f"""MATCH (a:APIEndpoint {{id:'{api}'}})
    MATCH (err:DomainError) WHERE err.id IN ['{e1}','{e2}']
    MERGE (a)-[:MAY_RAISE]->(err);""")
    run(f"""MATCH (st:ScreenState {{id:'SCRST-{name}-Error'}})
    MATCH (err:DomainError) WHERE err.id IN ['{e1}','{e2}']
    MERGE (st)-[:HANDLES]->(err);""")
    run(f"""MATCH (st:ScreenState {{id:'SCRST-{name}-Error'}})
    UNWIND [
      {{pid:'{p1}', err:'{e1}', msg:'Запись не найдена.', kind:'inline', rec:'back'}},
      {{pid:'{p2}', err:'{e2}', msg:'Сервис временно недоступен. Повторите попытку.', kind:'toast', rec:'retry'}}
    ] AS row
    MATCH (err:DomainError {{id:row.err}})
    MERGE (p:ErrorPresentation {{id:row.pid}})
    SET p.message=row.msg, p.presentation_kind=row.kind, p.recovery_action=row.rec,
        p.created_by='nacl-sa-uc', p.created_at=coalesce(p.created_at, datetime()),
        p.updated=datetime()
    MERGE (err)-[:PRESENTED_AS]->(p)
    MERGE (st)-[:SHOWS]->(p);""")
    return [e1, e2], [p1, p2]


# ---------------------------------------------------------------- L12 checks
L12 = {
 "L12.0": """MATCH (n) WHERE (n:DomainError OR n:ErrorPresentation) AND NOT (n)--()
   RETURN count(n);""",
 "L12.1": """OPTIONAL MATCH (err:DomainError) WHERE NOT (:Module)-[:HAS_ERROR]->(err)
   WITH count(err) AS a
   OPTIONAL MATCH (p:ErrorPresentation) WHERE NOT (:DomainError)-[:PRESENTED_AS]->(p)
   WITH a, count(p) AS b RETURN a + b;""",
 "L12.2": """OPTIONAL MATCH (err:DomainError) WHERE NOT (:APIEndpoint)-[:MAY_RAISE]->(err)
   WITH count(err) AS a
   OPTIONAL MATCH (p:ErrorPresentation) WHERE NOT (:ScreenState)-[:SHOWS]->(p)
   WITH a, count(p) AS b RETURN a + b;""",
 # both halves as COUNT{} subqueries — a plain second MATCH whose WHERE filters
 # every row away would erase the carried count (the Фаза-1 cypher-shell gotcha).
 # The trailing AS alias is LOAD-BEARING: an unaliased multi-line expression
 # becomes a multi-line column header in cypher-shell plain format, and the
 # scalar parser reads a header line instead of the value (run-1 of this
 # harness silently returned 0 for L12.3/L12.4 because of exactly that).
 "L12.3": """RETURN
   COUNT { MATCH (s)-[:HANDLES]->(x) WHERE NOT s:ScreenState OR NOT x:DomainError } +
   COUNT { MATCH (st:ScreenState)-[:HANDLES]->(err:DomainError)
           MATCH (scr:Screen)-[:HAS_STATE]->(st)
           WHERE NOT EXISTS {
             MATCH (scr)-[:HAS_TRANSITION]->(:Transition)-[:TRIGGERS]->(:ScreenEffect)
                   -[:CALLS]->(:APIEndpoint)-[:MAY_RAISE]->(err) } } AS c;""",
 "L12.4": """RETURN
   COUNT { MATCH (a)-[:MAY_RAISE]->(b) WHERE NOT a:APIEndpoint OR NOT b:DomainError } +
   COUNT { MATCH (a)-[:PRESENTED_AS]->(b) WHERE NOT a:DomainError OR NOT b:ErrorPresentation } +
   COUNT { MATCH (a)-[:SHOWS]->(b) WHERE NOT a:ScreenState OR NOT b:ErrorPresentation } AS c;""",
 "L12.5": """MATCH (st:ScreenState)-[:SHOWS]->(p:ErrorPresentation)<-[:PRESENTED_AS]-(err:DomainError)
   WHERE NOT (st)-[:HANDLES]->(err)
   RETURN count(*);""",
 "L12.6a": """OPTIONAL MATCH (err:DomainError) WHERE err.code IS NULL OR trim(err.code) = ''
   WITH count(err) AS a
   OPTIONAL MATCH (p:ErrorPresentation) WHERE p.message IS NULL OR trim(p.message) = ''
   WITH a, count(p) AS b RETURN a + b;""",
 "L12.6b": """OPTIONAL MATCH (err:DomainError)
   WHERE NOT coalesce(err.error_kind,'') IN ['validation','not_found','conflict','permission','rate_limit','external','internal']
   WITH count(err) AS a
   OPTIONAL MATCH (p:ErrorPresentation)
   WHERE NOT coalesce(p.presentation_kind,'') IN ['toast','banner','inline','modal','fullscreen','silent']
   WITH a, count(p) AS b RETURN a + b;""",
 "L12.7": """MATCH (scr:Screen)-[:HAS_TRANSITION]->(:Transition)-[:TRIGGERS]->(:ScreenEffect)
   -[:CALLS]->(:APIEndpoint)-[:MAY_RAISE]->(err:DomainError)
   WHERE NOT EXISTS { MATCH (scr)-[:HAS_STATE]->(:ScreenState)-[:HANDLES]->(err) }
   RETURN count(DISTINCT [scr.id, err.id]);""",
 "L12.8": """MATCH (st:ScreenState)-[:HANDLES]->(err:DomainError)
   WHERE NOT EXISTS { MATCH (st)-[:SHOWS]->(:ErrorPresentation)<-[:PRESENTED_AS]-(err) }
   RETURN count(*);""",
 "L12.9": """MATCH (uc:UseCase)-[:HAS_SLICE]->(sl:Slice {slice_kind:'error'})
   WHERE (uc)-[:EXPOSES]->(:APIEndpoint)-[:MAY_RAISE]->(:DomainError)
   MATCH (sl)-[:COVERS]->(st:ScreenState {state_kind:'error'})
   WHERE NOT (st)-[:HANDLES]->(:DomainError)
   RETURN count(*);""",
}

# Full L11 + L10 matrices re-used verbatim from the Фаза-2 harness (cross-talk arms).
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


def l12_all():
    return {k: scalar(q) for k, q in L12.items()}


def all_checks():
    out = {k: scalar(q) for k, q in L12.items()}
    out.update({k: scalar(q) for k, q in L11.items()})
    out.update({k: scalar(q) for k, q in L10.items()})
    return out


def closure_count(start_id, allow, label):
    return scalar(f"""MATCH (changed {{id:'{start_id}'}})
    MATCH path = (changed)-[:{allow}*1..6]-(dep)
    WHERE dep <> changed AND dep:{label}
    RETURN count(DISTINCT dep);""")


def hops_to(start_id, target_id, allow):
    return scalar(f"""MATCH (changed {{id:'{start_id}'}}), (x {{id:'{target_id}'}})
    MATCH path = (changed)-[:{allow}*1..6]-(x)
    RETURN min(length(path));""", default=-1)


def stamp_tight(uc, reason):
    """Verbatim sa-feature 3g contract (two statements, origin = the UC id)."""
    run(f"""MATCH (uc:UseCase {{id:'{uc}'}})
    OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(uc)
    WITH collect(DISTINCT uc) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
    UNWIND affected AS a
    MATCH (a)-[:GENERATES]->(t:Task)
    SET t.review_status='stale', t.stale_reason='{reason}',
        t.stale_since=datetime(), t.stale_origin='{uc}';""")
    run(f"""MATCH (uc:UseCase {{id:'{uc}'}})
    SET uc.review_status='stale', uc.stale_reason='{reason}',
        uc.stale_since=datetime(), uc.stale_origin='{uc}';""")


def stamp_shared_raisers(uc, err_id):
    """The Фаза-3 shared-error extension, verbatim from `nacl-sa-uc errors`
    § 4.2 — two statements, exactly the 3g shape: tasks of raisers + their
    dependents first, then ONLY the raiser UC nodes (the first draft stamped
    every affected UC node including dependents — caught by harness review,
    fixed in skill + here before the reference run)."""
    run(f"""MATCH (err:DomainError) WHERE err.id IN ['{err_id}']
    MATCH (raiser:UseCase)-[:EXPOSES]->(:APIEndpoint)-[:MAY_RAISE]->(err)
    WHERE raiser.id <> '{uc}'
    WITH collect(DISTINCT raiser) AS raisers, collect(DISTINCT err.id) AS errIds
    UNWIND raisers AS r
    OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(r)
    WITH errIds, collect(DISTINCT r) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
    UNWIND affected AS a
    MATCH (a)-[:GENERATES]->(t:Task)
    SET t.review_status = 'stale',
        t.stale_reason = 'shared domain error ' + reduce(s='', e IN errIds | s + e + ' ') + 'modified via {uc}',
        t.stale_since = datetime(),
        t.stale_origin = errIds[0];""")
    run(f"""MATCH (err:DomainError) WHERE err.id IN ['{err_id}']
    MATCH (raiser:UseCase)-[:EXPOSES]->(:APIEndpoint)-[:MAY_RAISE]->(err)
    WHERE raiser.id <> '{uc}'
    SET raiser.review_status = 'stale',
        raiser.stale_reason = 'shared domain error modified via {uc}',
        raiser.stale_since = datetime(),
        raiser.stale_origin = err.id;""")


# ------------------------------------------------------------------- defects
def make_defects(uc, name, api, module, nameF, apiF):
    """21 defect classes; expected = exact non-zero counts across the full
    L10+L11+L12 matrix (32 checks). Double-detections that hold by
    construction are stated explicitly."""
    nnn = uc.replace("UC-", "")
    e1 = f"ERR-BENCH{nnn}_NOT_FOUND"
    e2 = f"ERR-BENCH{nnn}_UPSTREAM_FAILED"
    p1 = f"ERRP-BENCH{nnn}_NOT_FOUND-Inline"
    st_err = f"SCRST-{name}-Error"
    st_loading = f"SCRST-{name}-Loading"
    return [
      # ----- L12.0 / L12.1 / L12.2 -----
      ("orphan-error",
       """CREATE (:DomainError {id:'ERR-BENCH_ORPHAN', code:'BENCH_ORPHAN',
          error_kind:'internal'});""",
       {"L12.0": 1, "L12.1": 1, "L12.2": 1}),
      ("orphan-presentation",
       """CREATE (:ErrorPresentation {id:'ERRP-BENCH_ORPHAN-Toast',
          message:'x', presentation_kind:'toast'});""",
       {"L12.0": 1, "L12.1": 1, "L12.2": 1}),
      ("parentless-error",
       f"MATCH (:Module)-[r:HAS_ERROR]->(:DomainError {{id:'{e1}'}}) DELETE r;",
       {"L12.1": 1}),
      # deleting PRESENTED_AS also breaks the SHOWS triangle's PRESENTED_AS leg,
      # so the handling state no longer shows any presentation OF that error —
      # correct double-detection (run-1 expected only L12.1; the detector was right)
      ("parentless-presentation",
       f"MATCH (:DomainError)-[r:PRESENTED_AS]->(:ErrorPresentation {{id:'{p1}'}}) DELETE r;",
       {"L12.1": 1, "L12.8": 1}),
      # unraisable error ALSO breaks the channel of its HANDLES edge — correct
      # double-detection by construction (handling an unraisable error is fiction)
      ("unraisable-error",
       f"MATCH ()-[r:MAY_RAISE]->(:DomainError {{id:'{e1}'}}) DELETE r;",
       {"L12.2": 1, "L12.3": 1}),
      # unshown presentation ALSO leaves its handled error unpresented at the state
      ("unshown-presentation",
       f"MATCH ()-[r:SHOWS]->(:ErrorPresentation {{id:'{p1}'}}) DELETE r;",
       {"L12.2": 1, "L12.8": 1}),
      # ----- L12.3 (label half + channel half) -----
      ("handles-wrong-label",
       f"""MATCH (st:ScreenState {{id:'{st_err}'}}) MATCH (f:Form) WITH st, f LIMIT 1
       MERGE (st)-[:HANDLES]->(f);""",
       {"L12.3": 1}),
      # a FOREIGN screen's state handles our error: its effects never call the
      # raising endpoint (channel violation); it also shows no presentation of it
      ("handles-channel-violation",
       f"""MATCH (st:ScreenState {{id:'SCRST-{nameF}-Error'}})
       MATCH (err:DomainError {{id:'{e1}'}})
       MERGE (st)-[:HANDLES]->(err);""",
       {"L12.3": 1, "L12.8": 1}),
      # ----- L12.4 -----
      ("may-raise-wrong-label",
       f"""MATCH (a:APIEndpoint {{id:'{api}'}}) MATCH (f:Form) WITH a, f LIMIT 1
       MERGE (a)-[:MAY_RAISE]->(f);""",
       {"L12.4": 1}),
      ("presented-as-wrong-label",
       f"""MATCH (err:DomainError {{id:'{e1}'}}) MATCH (f:Form) WITH err, f LIMIT 1
       MERGE (err)-[:PRESENTED_AS]->(f);""",
       {"L12.4": 1}),
      ("shows-wrong-label",
       f"""MATCH (st:ScreenState {{id:'{st_err}'}}) MATCH (f:Form) WITH st, f LIMIT 1
       MERGE (st)-[:SHOWS]->(f);""",
       {"L12.4": 1}),
      # ----- L12.5 -----
      ("shows-triangle-break",
       f"""MATCH (st:ScreenState {{id:'{st_loading}'}})
       MATCH (p:ErrorPresentation {{id:'{p1}'}})
       MERGE (st)-[:SHOWS]->(p);""",
       {"L12.5": 1}),
      # ----- L12.6 -----
      ("blank-code",
       f"MATCH (err:DomainError {{id:'{e1}'}}) SET err.code='  ';",
       {"L12.6a": 1}),
      ("blank-message",
       f"MATCH (p:ErrorPresentation {{id:'{p1}'}}) SET p.message='';",
       {"L12.6a": 1}),
      ("bad-error-kind",
       f"MATCH (err:DomainError {{id:'{e1}'}}) SET err.error_kind='fatal';",
       {"L12.6b": 1}),
      ("bad-presentation-kind",
       f"MATCH (p:ErrorPresentation {{id:'{p1}'}}) SET p.presentation_kind='popup';",
       {"L12.6b": 1}),
      # ----- L12.7: a fully valid NEW error nobody handles -----
      ("handling-gap",
       f"""MATCH (m:Module {{id:'{module}'}}) MATCH (a:APIEndpoint {{id:'{api}'}})
       MERGE (err:DomainError {{id:'ERR-BENCH{nnn}_RATE_LIMITED'}})
       SET err.code='BENCH{nnn}_RATE_LIMITED', err.error_kind='rate_limit', err.http_status=429
       MERGE (m)-[:HAS_ERROR]->(err)
       MERGE (a)-[:MAY_RAISE]->(err);""",
       {"L12.7": 1}),
      # ----- L12.8: an extra HANDLES with no SHOWS (channel holds: same screen) -----
      ("handled-unpresented",
       f"""MATCH (st:ScreenState {{id:'{st_loading}'}})
       MATCH (err:DomainError {{id:'{e2}'}})
       MERGE (st)-[:HANDLES]->(err);""",
       {"L12.8": 1}),
      # ----- L12.9: taxonomy-only adoption (no HANDLES at all) -----
      # injected as a deletion of BOTH HANDLES+SHOWS of the Error state: the
      # error-kind slice now covers an error state that handles nothing while
      # the UC's endpoint still MAY_RAISEs — the two layers no longer meet.
      # Deleting SHOWS also unshows both presentations (L12.2 x2), deleting
      # HANDLES re-opens the handling gap (L12.7 x2). Stated double-detection.
      ("error-slices-unjoined",
       f"""MATCH (st:ScreenState {{id:'{st_err}'}})-[r:HANDLES|SHOWS]->() DELETE r;""",
       {"L12.9": 1, "L12.7": 2, "L12.2": 2}),
      # ----- reverse cross-talk arms -----
      # an L10-class defect on the FOREIGN screen (no errors attached there):
      # fires only the L10 checks, every L12 check stays silent
      ("effect-calls-wrong-label-foreign",
       f"""MATCH (eff:ScreenEffect {{id:'SCREF-{nameF}-001'}})-[r:CALLS]->() DELETE r
       WITH 1 AS _ MATCH (eff:ScreenEffect {{id:'SCREF-{nameF}-001'}}), (f:Form) WITH eff, f LIMIT 1
       MERGE (eff)-[:CALLS]->(f);""",
       {"L10.7a": 1, "L10.2": 1}),
      # an L11-class defect: junk (sl:Slice)-[:CALLS]-> fires only L11.5,
      # every L12 check stays silent
      ("slice-calls-wrong-label",
       f"""MATCH (sl:Slice {{id:'SLC-{nnn}-HappyPath'}}) MATCH (f:Form) WITH sl, f LIMIT 1
       MERGE (sl)-[:CALLS]->(f);""",
       {"L11.5": 1}),
    ]


# =================================================================== run
results = {}

# ---- H0a: vacuous pass on the untouched clone (zero DomainError nodes) ----
full_reset()
h0a = l12_all()
results["H0a_clean_graph"] = {"checks": h0a, "pass": all(v == 0 for v in h0a.values())}

# ---- discover N real UCs (USES_FORM, has_ui, module-owned) ----
ucs, skipped_no_module = [], []
out = run("""MATCH (uc:UseCase)-[:USES_FORM]->(f:Form)
WHERE coalesce(uc.has_ui, true) = true
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
WITH uc.id AS ucId, head(collect(f.id)) AS formId, head(collect(m.id)) AS modId
RETURN ucId + '|' + formId + '|' + coalesce(modId,'NONE') ORDER BY ucId;""")
for line in out.splitlines():
    s = line.strip().strip('"')
    if s.startswith("UC-"):
        uc, form, mod = s.split("|", 2)
        if mod == "NONE":
            skipped_no_module.append(uc)   # the producer guard refuses these
        else:
            ucs.append((uc, form, mod))

# ---- H0b: 31 machines + 93 slices authored, STILL zero errors ----
for uc, form, mod in ucs:
    _, name, api = author_machine(uc, form)
    author_slices(uc, name, api)
for uc in skipped_no_module:          # machines+slices exist even for module-less UCs
    form = first_value(f"MATCH (uc:UseCase {{id:'{uc}'}})-[:USES_FORM]->(f:Form) RETURN f.id LIMIT 1;")
    if form:
        _, name, api = author_machine(uc, form)
        author_slices(uc, name, api)
h0b_l12 = l12_all()
h0b_rest = all_checks()
results["H0b_machines_slices_no_errors"] = {
    "n_machines": len(ucs) + len(skipped_no_module),
    "n_slices": scalar("MATCH (sl:Slice) RETURN count(sl);"),
    "skipped_no_module": skipped_no_module,
    "l12_checks": h0b_l12,
    "full_matrix_zero": all(v == 0 for v in h0b_rest.values()),
    "pass": all(v == 0 for v in h0b_l12.values()) and all(v == 0 for v in h0b_rest.values())}
full_reset()

# ---- H1 + H2 per UC (full reset between iterations) ----
h1_rows, h2_rows = [], []
for uc, form, mod in ucs:
    full_reset()
    sid, name, api = author_machine(uc, form)
    author_slices(uc, name, api)
    errs, pres = author_errors(uc, name, api, mod)
    e1, p1 = errs[0], pres[0]
    da = first_value(f"""MATCH (:Form {{id:'{form}'}})-[:HAS_FIELD]->(:FormField)
      -[:MAPS_TO]->(da:DomainAttribute) RETURN da.id ORDER BY da.id LIMIT 1;""")
    task = first_value(f"""MATCH (uc:UseCase {{id:'{uc}'}})-[:GENERATES]->(t:Task)
      RETURN t.id ORDER BY t.id LIMIT 1;""")
    intact = l12_all()

    row = {"uc": uc, "module": mod, "errors": errs, "has_tasks": task is not None,
           "l12_intact_zero": all(v == 0 for v in intact.values()),
           "old_err_from_uc": closure_count(uc, OLD_ALLOW, "DomainError"),
           "new_err_from_uc": closure_count(uc, NEW_ALLOW, "DomainError"),
           "old_pres_from_uc": closure_count(uc, OLD_ALLOW, "ErrorPresentation"),
           "new_pres_from_uc": closure_count(uc, NEW_ALLOW, "ErrorPresentation"),
           "old_err_from_api": closure_count(api, OLD_ALLOW, "DomainError"),
           "new_err_from_api": closure_count(api, NEW_ALLOW, "DomainError"),
           "old_err_from_da": closure_count(da, OLD_ALLOW, "DomainError") if da else None,
           "new_err_from_da": closure_count(da, NEW_ALLOW, "DomainError") if da else None,
           "new_pres_from_da": closure_count(da, NEW_ALLOW, "ErrorPresentation") if da else None,
           "uc_to_err_hops": hops_to(uc, e1, NEW_ALLOW),
           "uc_to_pres_hops": hops_to(uc, p1, NEW_ALLOW),
           "api_to_err_hops": hops_to(api, e1, NEW_ALLOW),
           "da_to_err_hops": hops_to(da, e1, NEW_ALLOW) if da else None,
           "da_to_pres_hops": hops_to(da, p1, NEW_ALLOW) if da else None}
    row["h1_pass"] = (row["l12_intact_zero"]
                      and row["old_err_from_uc"] == 0 and row["old_pres_from_uc"] == 0
                      and row["old_err_from_api"] == 0
                      and (da is None or row["old_err_from_da"] == 0)
                      and row["new_err_from_uc"] == 2 and row["new_pres_from_uc"] == 2
                      and row["new_err_from_api"] == 2
                      and row["uc_to_err_hops"] == 2 and row["uc_to_pres_hops"] == 3
                      and row["api_to_err_hops"] == 1
                      and (da is None or (row["new_err_from_da"] == 2
                                          and row["new_pres_from_da"] == 2
                                          and 1 <= row["da_to_err_hops"] <= 6
                                          and 1 <= row["da_to_pres_hops"] <= 6)))
    h1_rows.append(row)

    # H2: tight stamp vs broad radius (origin = the changed UC)
    run(f"MATCH (uc:UseCase {{id:'{uc}'}}) SET uc.spec_version = coalesce(uc.spec_version,0) + 1;")
    stamp_tight(uc, f"domain errors created for {uc}")
    flagged_tasks = scalar("MATCH (t:Task) WHERE coalesce(t.review_status,'current')='stale' RETURN count(t);")
    flagged_total = scalar("MATCH (n) WHERE coalesce(n.review_status,'current')='stale' RETURN count(n);")
    expected_tasks = scalar(f"""MATCH (uc:UseCase {{id:'{uc}'}})
      OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(uc)
      WITH collect(DISTINCT uc) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
      UNWIND affected AS a MATCH (a)-[:GENERATES]->(t:Task) RETURN count(DISTINCT t);""")
    broad_uc = scalar(f"""MATCH (changed:UseCase {{id:'{uc}'}})
      MATCH (changed)-[:{NEW_ALLOW}*1..6]-(dep:Task) WHERE dep <> changed
      RETURN count(DISTINCT dep);""")
    broad_err = scalar(f"""MATCH (changed:DomainError {{id:'{e1}'}})
      MATCH (changed)-[:{NEW_ALLOW}*1..6]-(dep:Task) WHERE dep <> changed
      RETURN count(DISTINCT dep);""")
    h2_rows.append({"uc": uc, "tasks_flagged": flagged_tasks,
                    "tasks_expected": expected_tasks, "total_flagged": flagged_total,
                    "expected_total": expected_tasks + 1,
                    "broad_from_uc_tasks": broad_uc,
                    "broad_from_err_tasks": broad_err,
                    "h2_pass": flagged_tasks == expected_tasks
                               and flagged_total == expected_tasks + 1})

results["H1"] = {"n_ucs": len(h1_rows), "rows": h1_rows,
                 "pass": all(r["h1_pass"] for r in h1_rows)}
results["H2"] = {"n_ucs": len(h2_rows), "rows": h2_rows,
                 "tight_total": sum(r["total_flagged"] for r in h2_rows),
                 "broad_from_uc_total": sum(r["broad_from_uc_tasks"] for r in h2_rows),
                 "broad_from_err_total": sum(r["broad_from_err_tasks"] for r in h2_rows),
                 "pass": all(r["h2_pass"] for r in h2_rows)}

# ---- H2-shared: modifying a SHARED error stamps exactly the raiser UCs ----
by_id = {uc: (form, mod) for uc, form, mod in ucs}
task_bearing = [uc for uc, _, _ in ucs if scalar(
    f"MATCH (uc:UseCase {{id:'{uc}'}})-[:GENERATES]->(t:Task) RETURN count(t);") > 0]
ucA, ucB = task_bearing[0], task_bearing[1]
full_reset()
_, nameA, apiA = author_machine(ucA, by_id[ucA][0])
_, nameB, apiB = author_machine(ucB, by_id[ucB][0])
author_slices(ucA, nameA, apiA)
errsA, _ = author_errors(ucA, nameA, apiA, by_id[ucA][1])
shared = errsA[1]   # the UPSTREAM_FAILED error becomes shared
run(f"""MATCH (a:APIEndpoint {{id:'{apiB}'}}) MATCH (err:DomainError {{id:'{shared}'}})
MERGE (a)-[:MAY_RAISE]->(err);""")   # ucB's errors run merged the shared error
# now ucA's run MODIFIES the shared error's properties:
run(f"MATCH (err:DomainError {{id:'{shared}'}}) SET err.retryable=false, err.updated=datetime();")
run(f"MATCH (uc:UseCase {{id:'{ucA}'}}) SET uc.spec_version = coalesce(uc.spec_version,0) + 1;")
stamp_tight(ucA, f"domain errors modified for {ucA}")
stamp_shared_raisers(ucA, shared)
tasks_a = scalar(f"MATCH (uc:UseCase {{id:'{ucA}'}})-[:GENERATES]->(t:Task) RETURN count(DISTINCT t);")
exp_b = scalar(f"""MATCH (r:UseCase {{id:'{ucB}'}})
  OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(r)
  WITH collect(DISTINCT r) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
  UNWIND affected AS a MATCH (a)-[:GENERATES]->(t:Task) RETURN count(DISTINCT t);""")
exp_a = scalar(f"""MATCH (r:UseCase {{id:'{ucA}'}})
  OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(r)
  WITH collect(DISTINCT r) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
  UNWIND affected AS a MATCH (a)-[:GENERATES]->(t:Task) RETURN count(DISTINCT t);""")
flagged_tasks = scalar("MATCH (t:Task) WHERE coalesce(t.review_status,'current')='stale' RETURN count(t);")
flagged_ucs = scalar("MATCH (u:UseCase) WHERE coalesce(u.review_status,'current')='stale' RETURN count(u);")
origin_err_tasks = scalar(f"MATCH (t:Task) WHERE t.stale_origin='{shared}' RETURN count(t);")
origin_uc_tasks = scalar(f"MATCH (t:Task) WHERE t.stale_origin='{ucA}' RETURN count(t);")
b_stamped_origin = first_value(f"MATCH (u:UseCase {{id:'{ucB}'}}) RETURN u.stale_origin;")
# raiser stamps may overlap the invoked UC's stamp set when DEPENDS_ON chains
# intersect — totals are compared as sets, not sums
expected_task_set = scalar(f"""MATCH (r:UseCase) WHERE r.id IN ['{ucA}','{ucB}']
  OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(r)
  WITH collect(DISTINCT r) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
  UNWIND affected AS a MATCH (a)-[:GENERATES]->(t:Task) RETURN count(DISTINCT t);""")
results["H2_shared"] = {
    "uc_invoked": ucA, "uc_raiser": ucB, "shared_error": shared,
    "tasks_flagged": flagged_tasks, "tasks_expected_set": expected_task_set,
    "ucs_flagged": flagged_ucs,
    "raiser_uc_origin": b_stamped_origin,
    "tasks_with_err_origin": origin_err_tasks, "tasks_with_uc_origin": origin_uc_tasks,
    "tasks_a": tasks_a, "exp_a": exp_a, "exp_b": exp_b,
    "pass": flagged_tasks == expected_task_set and flagged_ucs == 2
            and b_stamped_origin == shared and origin_err_tasks > 0}
full_reset()

# ---- H3: defect injection (UC-006 if present, else first task-bearing UC) ----
uc0 = "UC-006" if "UC-006" in by_id else task_bearing[0]
form0, mod0 = by_id[uc0]
name0 = uc0.replace("UC-", "Scr")
api0 = f"api-bench-{uc0.lower()}"
ucF = next(u for u in task_bearing if u != uc0)
formF, modF = by_id[ucF]
nameF = ucF.replace("UC-", "Scr")
apiF = f"api-bench-{ucF.lower()}"

h3_rows = []
for defect, inject, expected in make_defects(uc0, name0, api0, mod0, nameF, apiF):
    full_reset()
    author_machine(uc0, form0)
    author_machine(ucF, formF)        # foreign machine: NO slices, NO errors
    author_slices(uc0, name0, api0)
    author_errors(uc0, name0, api0, mod0)
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
    "errors": scalar("MATCH (e:DomainError) RETURN count(e);"),
    "presentations": scalar("MATCH (p:ErrorPresentation) RETURN count(p);"),
    "slices": scalar("MATCH (sl:Slice) RETURN count(sl);"),
    "screens": scalar("MATCH (s:Screen) RETURN count(s);"),
    "stale": scalar("MATCH (n) WHERE coalesce(n.review_status,'current')='stale' RETURN count(n);"),
}
results["overall_pass"] = all(results[h]["pass"] for h in
                              ("H0a_clean_graph", "H0b_machines_slices_no_errors",
                               "H1", "H2", "H2_shared", "H3"))
print(json.dumps(results, indent=2, ensure_ascii=False))
