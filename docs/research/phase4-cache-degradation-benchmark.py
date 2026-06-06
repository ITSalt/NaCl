#!/usr/bin/env python3
"""Publishable graph benchmark for NaCl Фаза 4 (cache & degradation policies).

Runs on an ISOLATED clone of the family-cinema graph (nacl-bench-neo4j, bolt 7798).

Hypotheses (falsifiable):
  H0. Vacuous pass, twice: (a) on a graph with ZERO CachePolicy/DegradationRule
      nodes every L13 check returns zero findings; (b) on a graph with the full
      THREE previous extension layers adopted — 31 screen machines, 93 behavior
      slices AND 58 domain errors — and STILL zero cache/degradation, every L13
      check returns zero findings, and the full L10+L11+L12 matrix stays all-zero.
      The resilience overlay is opt-in; adopting machines+slices+errors alone
      never triggers L13.
  H1. Reachability: with the OLD (pre-Фаза-4) sa_impact_closure allow-list
      neither CachePolicy nor DegradationRule is reachable from the changed
      UC / APIEndpoint / DomainAttribute / DomainError — ALL five Phase-4 edge
      names are new (second phase in a row with no namespace sharing), so H1 is
      binary again. With the NEW allow-list the change reaches the policy
      (UC: 2 hops; endpoint: 1 hop) and the rules (UC: 1 hop; error: 1 hop);
      from the DomainAttribute the Module-HAS_CACHE parent edge provides a
      3-hop catalog shortcut when the attribute's entity shares the module
      (the USES_FORM path serves the rest at 4-5 hops — the *1..6 ceiling is
      not binding).
  H2. The staleness stamp stays TIGHT after resilience authoring: exactly the
      UC's generated tasks + transitive DEPENDS_ON dependents' tasks + the UC
      itself (stale_origin = the UC id). PLUS the one new Phase-4 semantic:
      modifying contract properties of a SHARED cache policy stamps exactly
      the consumer UCs (+ their tasks) with stale_origin = the CACHE id —
      directed, never the broad closure. The broad undirected walk over the
      Фаза-4-enlarged edge set would flag far more (trend 20x -> 49x -> 51x
      -> 52x -> ?  — the fifth data point).
  H3. The L13 detectors actually detect: each of 27 injected defect classes
      fires exactly its expected checks across the FULL L10+L11+L12+L13 matrix
      (42 checks) with zero cross-talk in both directions — garbage
      ON_ERROR/DEGRADES_TO/CACHES edges never fire the L10/L12 checks, and
      L10/L11/L12 defects never fire L13 (no shared edge names this phase
      either; the matrix proves the isolation anyway).

Each of the N real UCs (USES_FORM, has_ui, AND owned by a Module — the
producer guard refuses cache authoring for module-less UCs; the clone has 2
such, skipped honestly) gets the canonical Фаза-1 machine + the three
canonical Фаза-2 slices + the two canonical Фаза-3 domain errors + the
canonical Фаза-4 resilience layer EXACTLY as the `nacl-sa-uc resilience`
command writes it (module-parented CachePolicy CACHES-ing the provisional
endpoint; an offline/cached_data rule degrading into the content state; an
error/static_content rule ON_ERROR the retryable external error, channel rule
held). Full reset between measurements; arms and iterations are independent.
"""
import subprocess, json, sys

C = ["docker", "exec", "nacl-bench-neo4j", "cypher-shell", "-u", "neo4j",
     "-p", "neo4j_graph_dev", "--format", "plain"]

OLD_ALLOW = ("HAS_ATTRIBUTE|MAPS_TO|HAS_FIELD|USES_FORM|HAS_STEP|HAS_REQUIREMENT"
             "|ACTOR|CONTAINS_UC|CONTAINS_ENTITY|HAS_ENUM|HAS_VALUE|EXPOSES|IMPLEMENTS"
             "|GENERATES|INCLUDES_UC|AFFECTS_ENTITY|AFFECTS_MODULE|DEPENDS_ON"
             "|HAS_SCREEN|RENDERS|HAS_STATE|HAS_EVENT|HAS_TRANSITION"
             "|FROM_STATE|TO_STATE|ON_EVENT|TRIGGERS|CALLS|NAVIGATES_TO|EMITS"
             "|HAS_SLICE|COVERS|VERIFIED_BY"
             "|HAS_ERROR|MAY_RAISE|HANDLES|PRESENTED_AS|SHOWS")
NEW_ALLOW = OLD_ALLOW + "|HAS_CACHE|CACHES|HAS_DEGRADATION|ON_ERROR|DEGRADES_TO"


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
    run("MATCH (n) WHERE n:CachePolicy OR n:DegradationRule DETACH DELETE n;")
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
    (Verbatim from the Фаза-2/Фаза-3 harnesses.)"""
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
    """The 3 canonical Фаза-2 slices (verbatim from the earlier harnesses)."""
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
    """Two canonical Фаза-3 domain errors EXACTLY as `nacl-sa-uc errors`
    writes them (verbatim from the Фаза-3 harness).
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


def author_resilience(uc, name, api, module):
    """The canonical Фаза-4 resilience layer EXACTLY as `nacl-sa-uc resilience`
    writes it: one module-parented CachePolicy CACHES-ing the (provisional)
    endpoint; one offline/cached_data rule degrading INTO the content state
    (serving stale data is the point); one error/static_content rule ON_ERROR
    the retryable external error, degrading to the Error state (channel rule
    holds: SCREF-001 CALLS the same endpoint that MAY_RAISEs it).
    Returns (cache id, [rule ids])."""
    nnn = uc.replace("UC-", "")
    cp = f"CACHE-Bench{nnn}IndexedDb"
    r1 = f"DEG-{nnn}-OfflineCache"
    r2 = f"DEG-{nnn}-UpstreamFallback"
    e2 = f"ERR-BENCH{nnn}_UPSTREAM_FAILED"
    run(f"""MATCH (m:Module {{id:'{module}'}})
    MERGE (cp:CachePolicy {{id:'{cp}'}})
    SET cp.name='Bench cache {nnn} (IndexedDB)',
        cp.description='canonical bench cache of the {uc} data surface',
        cp.storage_kind='indexed_db', cp.invalidation_kind='manual',
        cp.serves_stale=true, cp.created_by='nacl-sa-uc',
        cp.created_at=coalesce(cp.created_at, datetime()), cp.updated=datetime()
    MERGE (m)-[:HAS_CACHE]->(cp);""")
    run(f"""MATCH (cp:CachePolicy {{id:'{cp}'}}) MATCH (a:APIEndpoint {{id:'{api}'}})
    MERGE (cp)-[:CACHES]->(a);""")
    run(f"""MATCH (uc:UseCase {{id:'{uc}'}})
    UNWIND [
      {{id:'{r1}', name:'Offline cache restore', trigger:'offline',
        behavior:'Оффлайн/перезагрузка: данные восстанавливаются из локального кэша, пользователь остаётся на том же экране',
        fallback:'cached_data'}},
      {{id:'{r2}', name:'Upstream fallback', trigger:'error',
        behavior:'При отказе провайдера показывается заглушка с возможностью повторить; пользователь не видит сырую ошибку',
        fallback:'static_content'}}
    ] AS r
    MERGE (dr:DegradationRule {{id:r.id}})
    SET dr.name=r.name, dr.trigger_kind=r.trigger, dr.behavior=r.behavior,
        dr.fallback_kind=r.fallback, dr.created_by='nacl-sa-uc',
        dr.created_at=coalesce(dr.created_at, datetime()), dr.updated=datetime()
    MERGE (uc)-[:HAS_DEGRADATION]->(dr);""")
    run(f"""MATCH (dr:DegradationRule {{id:'{r1}'}})
    MATCH (st:ScreenState {{id:'SCRST-{name}-Loaded'}})
    MERGE (dr)-[:DEGRADES_TO]->(st);""")
    run(f"""MATCH (dr:DegradationRule {{id:'{r2}'}})
    MATCH (err:DomainError {{id:'{e2}'}})
    MERGE (dr)-[:ON_ERROR]->(err);""")
    run(f"""MATCH (dr:DegradationRule {{id:'{r2}'}})
    MATCH (st:ScreenState {{id:'SCRST-{name}-Error'}})
    MERGE (dr)-[:DEGRADES_TO]->(st);""")
    return cp, [r1, r2]


# ---------------------------------------------------------------- L13 checks
# Every multi-half check uses COUNT{} subqueries with a trailing AS alias —
# both cypher-shell plain-format gotchas (carried-count erasure; multi-line
# unaliased column header) are documented in the Фаза-1/Фаза-3 reports.
L13 = {
 "L13.0": """MATCH (n) WHERE (n:CachePolicy OR n:DegradationRule) AND NOT (n)--()
   RETURN count(n);""",
 "L13.1": """RETURN
   COUNT { MATCH (cp:CachePolicy) WHERE NOT (:Module)-[:HAS_CACHE]->(cp) } +
   COUNT { MATCH (dr:DegradationRule) WHERE NOT (:UseCase)-[:HAS_DEGRADATION]->(dr) } AS c;""",
 "L13.2": """RETURN
   COUNT { MATCH (cp:CachePolicy) WHERE NOT (cp)-[:CACHES]->(:APIEndpoint) } +
   COUNT { MATCH (dr:DegradationRule)
           WHERE NOT (dr)-[:ON_ERROR]->(:DomainError)
             AND NOT (dr)-[:DEGRADES_TO]->(:ScreenState) } +
   COUNT { MATCH (dr:DegradationRule)
           WHERE dr.trigger_kind = 'error'
             AND NOT (dr)-[:ON_ERROR]->(:DomainError) } AS c;""",
 "L13.3": """RETURN
   COUNT { MATCH (uc:UseCase)-[:HAS_DEGRADATION]->(dr:DegradationRule)-[:DEGRADES_TO]->(st:ScreenState)
           WHERE NOT EXISTS { MATCH (uc)-[:HAS_SCREEN]->(:Screen)-[:HAS_STATE]->(st) } } +
   COUNT { MATCH (dr:DegradationRule)-[:DEGRADES_TO]->(st:ScreenState)
           MATCH (scr:Screen)-[:HAS_STATE]->(st)
           WHERE dr.trigger_kind = 'error'
             AND NOT EXISTS {
               MATCH (dr)-[:ON_ERROR]->(err:DomainError),
                     (scr)-[:HAS_TRANSITION]->(:Transition)-[:TRIGGERS]->(:ScreenEffect)
                     -[:CALLS]->(:APIEndpoint)-[:MAY_RAISE]->(err) } } AS c;""",
 "L13.4": """RETURN
   COUNT { MATCH (a)-[:HAS_CACHE]->(b) WHERE NOT a:Module OR NOT b:CachePolicy } +
   COUNT { MATCH (a)-[:CACHES]->(b) WHERE NOT a:CachePolicy OR NOT b:APIEndpoint } +
   COUNT { MATCH (a)-[:HAS_DEGRADATION]->(b) WHERE NOT a:UseCase OR NOT b:DegradationRule } +
   COUNT { MATCH (a)-[:ON_ERROR]->(b) WHERE NOT a:DegradationRule OR NOT b:DomainError } +
   COUNT { MATCH (a)-[:DEGRADES_TO]->(b) WHERE NOT a:DegradationRule OR NOT b:ScreenState } AS c;""",
 "L13.5a": """RETURN
   COUNT { MATCH (cp:CachePolicy) WHERE cp.invalidation_kind IS NULL OR trim(cp.invalidation_kind) = '' } +
   COUNT { MATCH (cp:CachePolicy) WHERE cp.invalidation_kind = 'ttl' AND cp.ttl_seconds IS NULL } +
   COUNT { MATCH (dr:DegradationRule) WHERE dr.behavior IS NULL OR trim(dr.behavior) = '' } AS c;""",
 "L13.5b": """RETURN
   COUNT { MATCH (cp:CachePolicy)
           WHERE NOT coalesce(cp.storage_kind,'') IN ['memory','local_storage','indexed_db','cache_api','http','server','cdn'] } +
   COUNT { MATCH (cp:CachePolicy)
           WHERE cp.invalidation_kind IS NOT NULL AND trim(cp.invalidation_kind) <> ''
             AND NOT cp.invalidation_kind IN ['ttl','event','manual','session','never'] } +
   COUNT { MATCH (dr:DegradationRule)
           WHERE NOT coalesce(dr.trigger_kind,'') IN ['error','offline','capability'] } +
   COUNT { MATCH (dr:DegradationRule)
           WHERE NOT coalesce(dr.fallback_kind,'') IN ['cached_data','static_content','alternate_provider','alternate_ui','skip_unit','backoff'] } AS c;""",
 "L13.6": """MATCH (dr:DegradationRule)-[:ON_ERROR]->(err:DomainError)
   WHERE dr.fallback_kind = 'backoff' AND err.retryable = false
   RETURN count(*);""",
 "L13.7": """MATCH (cp:CachePolicy)-[:CACHES]->(api:APIEndpoint)-[:MAY_RAISE]->(err:DomainError)
   WHERE (err.retryable = true OR err.error_kind = 'external')
     AND NOT EXISTS { MATCH (:DegradationRule)-[:ON_ERROR]->(err) }
   RETURN count(DISTINCT [api.id, err.id]);""",
 "L13.8": """MATCH (dr:DegradationRule)
   WHERE dr.fallback_kind = 'cached_data'
     AND NOT EXISTS {
       MATCH (dr)-[:ON_ERROR]->(:DomainError)<-[:MAY_RAISE]-(:APIEndpoint)<-[:CACHES]-(:CachePolicy) }
     AND NOT EXISTS {
       MATCH (dr)-[:DEGRADES_TO]->(:ScreenState)<-[:HAS_STATE]-(:Screen)
             -[:HAS_TRANSITION]->(:Transition)-[:TRIGGERS]->(:ScreenEffect)
             -[:CALLS]->(:APIEndpoint)<-[:CACHES]-(:CachePolicy) }
   RETURN count(dr);""",
 "L13.9": """MATCH (cp1:CachePolicy)-[:CACHES]->(api:APIEndpoint)<-[:CACHES]-(cp2:CachePolicy)
   WHERE cp1.id < cp2.id AND coalesce(cp1.storage_kind,'') = coalesce(cp2.storage_kind,'')
   RETURN count(DISTINCT [api.id, cp1.id, cp2.id]);""",
}

# Full L12 + L11 + L10 matrices re-used verbatim from the Фаза-3 harness
# (cross-talk arms in both directions).
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


def l13_all():
    return {k: scalar(q) for k, q in L13.items()}


def all_checks():
    out = {k: scalar(q) for k, q in L13.items()}
    out.update({k: scalar(q) for k, q in L12.items()})
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


def stamp_shared_consumers(uc, cache_id):
    """The Фаза-4 shared-cache extension, verbatim from `nacl-sa-uc resilience`
    § 4.2 — two statements, exactly the 3g shape: tasks of consumers + their
    dependents first, then ONLY the consumer UC nodes."""
    run(f"""MATCH (cp:CachePolicy) WHERE cp.id IN ['{cache_id}']
    MATCH (consumer:UseCase)-[:EXPOSES]->(:APIEndpoint)<-[:CACHES]-(cp)
    WHERE consumer.id <> '{uc}'
    WITH collect(DISTINCT consumer) AS consumers, collect(DISTINCT cp.id) AS cacheIds
    UNWIND consumers AS c
    OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(c)
    WITH cacheIds, collect(DISTINCT c) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
    UNWIND affected AS a
    MATCH (a)-[:GENERATES]->(t:Task)
    SET t.review_status = 'stale',
        t.stale_reason = 'shared cache policy ' + reduce(s='', x IN cacheIds | s + x + ' ') + 'modified via {uc}',
        t.stale_since = datetime(),
        t.stale_origin = cacheIds[0];""")
    run(f"""MATCH (cp:CachePolicy) WHERE cp.id IN ['{cache_id}']
    MATCH (consumer:UseCase)-[:EXPOSES]->(:APIEndpoint)<-[:CACHES]-(cp)
    WHERE consumer.id <> '{uc}'
    SET consumer.review_status = 'stale',
        consumer.stale_reason = 'shared cache policy modified via {uc}',
        consumer.stale_since = datetime(),
        consumer.stale_origin = cp.id;""")


# ------------------------------------------------------------------- defects
def make_defects(uc, name, api, module, nameF, apiF):
    """27 defect classes; expected = exact non-zero counts across the full
    L10+L11+L12+L13 matrix (42 checks). Multi-detections that hold by
    construction are stated explicitly."""
    nnn = uc.replace("UC-", "")
    nnnF = nameF.replace("Scr", "")
    cp = f"CACHE-Bench{nnn}IndexedDb"
    r1 = f"DEG-{nnn}-OfflineCache"
    r2 = f"DEG-{nnn}-UpstreamFallback"
    e1 = f"ERR-BENCH{nnn}_NOT_FOUND"
    e2 = f"ERR-BENCH{nnn}_UPSTREAM_FAILED"
    st_err = f"SCRST-{name}-Error"
    st_loaded = f"SCRST-{name}-Loaded"
    return [
      # ----- L13.0 / L13.1 / L13.2 -----
      # orphans carry valid contract fields so 13.5a/13.5b stay silent —
      # only the connectivity checks fire (same recipe as the Фаза-3 orphans)
      ("orphan-policy",
       """CREATE (:CachePolicy {id:'CACHE-BenchOrphan', name:'orphan',
          storage_kind:'memory', invalidation_kind:'manual'});""",
       {"L13.0": 1, "L13.1": 1, "L13.2": 1}),
      # the orphan rule uses static_content, NOT cached_data — a cached_data
      # orphan would also fire the L13.8 join check
      ("orphan-rule",
       """CREATE (:DegradationRule {id:'DEG-000-Orphan', name:'orphan',
          trigger_kind:'offline', behavior:'x', fallback_kind:'static_content'});""",
       {"L13.0": 1, "L13.1": 1, "L13.2": 1}),
      ("parentless-policy",
       f"MATCH (:Module)-[r:HAS_CACHE]->(:CachePolicy {{id:'{cp}'}}) DELETE r;",
       {"L13.1": 1}),
      ("parentless-rule",
       f"MATCH (:UseCase)-[r:HAS_DEGRADATION]->(:DegradationRule {{id:'{r1}'}}) DELETE r;",
       {"L13.1": 1}),
      # deleting CACHES also unjoins the offline cached_data rule from its
      # policy (the screen-path join ran through this very edge) — correct
      # double-detection by construction
      ("surfaceless-policy",
       f"MATCH (:CachePolicy {{id:'{cp}'}})-[r:CACHES]->() DELETE r;",
       {"L13.2": 1, "L13.8": 1}),
      # the offline rule's ONLY anchor is DEGRADES_TO; removing it makes the
      # rule anchorless AND unjoins its cached_data fallback — stated double
      ("anchorless-rule",
       f"MATCH (:DegradationRule {{id:'{r1}'}})-[r:DEGRADES_TO]->() DELETE r;",
       {"L13.2": 1, "L13.8": 1}),
      # an error rule without ON_ERROR: (a) kind-required anchor missing,
      # (b) its DEGRADES_TO channel can no longer be proven (degrading from
      # nothing), (c) the cached surface's retryable error lost its only
      # degradation answer — stated triple-detection by construction
      ("error-rule-no-on-error",
       f"MATCH (:DegradationRule {{id:'{r2}'}})-[r:ON_ERROR]->() DELETE r;",
       {"L13.2": 1, "L13.3": 1, "L13.7": 1}),
      # ----- L13.3 (same-UC half + channel half) -----
      ("degrades-to-foreign-uc",
       f"""MATCH (dr:DegradationRule {{id:'{r1}'}})
       MATCH (st:ScreenState {{id:'SCRST-{nameF}-Loaded'}})
       MERGE (dr)-[:DEGRADES_TO]->(st);""",
       {"L13.3": 1}),
      # a fresh error raised ONLY by an endpoint this UC's screen never calls:
      # same-UC holds (own state), the channel does not
      ("channel-violation",
       f"""MATCH (m:Module {{id:'{module}'}}) MATCH (ucF:UseCase {{id:'UC-{nnnF}'}})
       MERGE (x:APIEndpoint {{id:'api-bench-extra'}})
       ON CREATE SET x.path='GET /api/bench/extra', x.provisional=true
       MERGE (ucF)-[:EXPOSES]->(x)
       MERGE (err:DomainError {{id:'ERR-BENCH_EXTRA'}})
       SET err.code='BENCH_EXTRA', err.error_kind='external', err.retryable=true
       MERGE (m)-[:HAS_ERROR]->(err)
       MERGE (x)-[:MAY_RAISE]->(err)
       WITH err
       MATCH (uc:UseCase {{id:'{uc}'}}) MATCH (st:ScreenState {{id:'{st_loaded}'}})
       MERGE (dr:DegradationRule {{id:'DEG-{nnn}-ChannelViolation'}})
       SET dr.name='channel violation', dr.trigger_kind='error',
           dr.behavior='x', dr.fallback_kind='static_content'
       MERGE (uc)-[:HAS_DEGRADATION]->(dr)
       MERGE (dr)-[:ON_ERROR]->(err)
       MERGE (dr)-[:DEGRADES_TO]->(st);""",
       {"L13.3": 1}),
      # ----- L13.4 -----
      ("has-cache-wrong-label",
       f"""MATCH (uc:UseCase {{id:'{uc}'}}) MATCH (cp:CachePolicy {{id:'{cp}'}})
       MERGE (uc)-[:HAS_CACHE]->(cp);""",
       {"L13.4": 1}),
      ("caches-wrong-label",
       f"""MATCH (cp:CachePolicy {{id:'{cp}'}}) MATCH (f:Form) WITH cp, f LIMIT 1
       MERGE (cp)-[:CACHES]->(f);""",
       {"L13.4": 1}),
      ("has-degradation-wrong-label",
       f"""MATCH (m:Module {{id:'{module}'}}) MATCH (dr:DegradationRule {{id:'{r1}'}})
       MERGE (m)-[:HAS_DEGRADATION]->(dr);""",
       {"L13.4": 1}),
      ("on-error-wrong-label",
       f"""MATCH (dr:DegradationRule {{id:'{r2}'}}) MATCH (f:Form) WITH dr, f LIMIT 1
       MERGE (dr)-[:ON_ERROR]->(f);""",
       {"L13.4": 1}),
      ("degrades-to-wrong-label",
       f"""MATCH (dr:DegradationRule {{id:'{r1}'}}) MATCH (f:Form) WITH dr, f LIMIT 1
       MERGE (dr)-[:DEGRADES_TO]->(f);""",
       {"L13.4": 1}),
      # ----- L13.5 -----
      ("blank-invalidation",
       f"MATCH (cp:CachePolicy {{id:'{cp}'}}) SET cp.invalidation_kind='  ';",
       {"L13.5a": 1}),
      ("ttl-without-seconds",
       f"MATCH (cp:CachePolicy {{id:'{cp}'}}) SET cp.invalidation_kind='ttl';",
       {"L13.5a": 1}),
      ("blank-behavior",
       f"MATCH (dr:DegradationRule {{id:'{r1}'}}) SET dr.behavior='';",
       {"L13.5a": 1}),
      ("bad-storage-kind",
       f"MATCH (cp:CachePolicy {{id:'{cp}'}}) SET cp.storage_kind='redis';",
       {"L13.5b": 1}),
      ("bad-trigger-kind",
       f"MATCH (dr:DegradationRule {{id:'{r1}'}}) SET dr.trigger_kind='network';",
       {"L13.5b": 1}),
      ("bad-fallback-kind",
       f"MATCH (dr:DegradationRule {{id:'{r1}'}}) SET dr.fallback_kind='cache';",
       {"L13.5b": 1}),
      # ----- L13.6: backoff on a retryable=false error (channel held: e1
      # is raised by the endpoint this UC's screen calls) -----
      ("backoff-on-nonretryable",
       f"""MATCH (uc:UseCase {{id:'{uc}'}})
       MATCH (err:DomainError {{id:'{e1}'}})
       MATCH (st:ScreenState {{id:'{st_err}'}})
       MERGE (dr:DegradationRule {{id:'DEG-{nnn}-BadBackoff'}})
       SET dr.name='bad backoff', dr.trigger_kind='error',
           dr.behavior='x', dr.fallback_kind='backoff'
       MERGE (uc)-[:HAS_DEGRADATION]->(dr)
       MERGE (dr)-[:ON_ERROR]->(err)
       MERGE (dr)-[:DEGRADES_TO]->(st);""",
       {"L13.6": 1}),
      # ----- L13.7: a new retryable error on the CACHED surface, fully
      # handled at L12 (triangle closed) so only the degradation gap fires -----
      ("uncovered-cached-surface",
       f"""MATCH (m:Module {{id:'{module}'}}) MATCH (a:APIEndpoint {{id:'{api}'}})
       MATCH (st:ScreenState {{id:'{st_err}'}})
       MERGE (err:DomainError {{id:'ERR-BENCH{nnn}_TIMEOUT'}})
       SET err.code='BENCH{nnn}_TIMEOUT', err.error_kind='external',
           err.http_status=504, err.retryable=true
       MERGE (m)-[:HAS_ERROR]->(err)
       MERGE (a)-[:MAY_RAISE]->(err)
       MERGE (st)-[:HANDLES]->(err)
       MERGE (p:ErrorPresentation {{id:'ERRP-BENCH{nnn}_TIMEOUT-Toast'}})
       SET p.message='Долгий ответ. Повторите попытку.', p.presentation_kind='toast'
       MERGE (err)-[:PRESENTED_AS]->(p)
       MERGE (st)-[:SHOWS]->(p);""",
       {"L13.7": 1}),
      # ----- L13.8: the policy disappears entirely; the offline cached_data
      # rule now promises a cache that does not exist -----
      ("cached-data-unjoined",
       f"MATCH (cp:CachePolicy {{id:'{cp}'}}) DETACH DELETE cp;",
       {"L13.8": 1}),
      # ----- L13.9 -----
      ("overlapping-policies",
       f"""MATCH (m:Module {{id:'{module}'}}) MATCH (a:APIEndpoint {{id:'{api}'}})
       MERGE (cp2:CachePolicy {{id:'CACHE-Bench{nnn}Second'}})
       SET cp2.name='second', cp2.storage_kind='indexed_db', cp2.invalidation_kind='manual'
       MERGE (m)-[:HAS_CACHE]->(cp2)
       MERGE (cp2)-[:CACHES]->(a);""",
       {"L13.9": 1}),
      # ----- reverse cross-talk arms: L10/L11/L12 defects, every L13 silent -----
      ("effect-calls-wrong-label-foreign",
       f"""MATCH (eff:ScreenEffect {{id:'SCREF-{nameF}-001'}})-[r:CALLS]->() DELETE r
       WITH 1 AS _ MATCH (eff:ScreenEffect {{id:'SCREF-{nameF}-001'}}), (f:Form) WITH eff, f LIMIT 1
       MERGE (eff)-[:CALLS]->(f);""",
       {"L10.7a": 1, "L10.2": 1}),
      ("slice-calls-wrong-label",
       f"""MATCH (sl:Slice {{id:'SLC-{nnn}-HappyPath'}}) MATCH (f:Form) WITH sl, f LIMIT 1
       MERGE (sl)-[:CALLS]->(f);""",
       {"L11.5": 1}),
      ("handles-wrong-label",
       f"""MATCH (st:ScreenState {{id:'{st_err}'}}) MATCH (f:Form) WITH st, f LIMIT 1
       MERGE (st)-[:HANDLES]->(f);""",
       {"L12.3": 1}),
    ]


# =================================================================== run
results = {}

# ---- H0a: vacuous pass on the untouched clone (zero Phase-4 nodes) ----
full_reset()
h0a = l13_all()
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

# ---- H0b: machines + slices + ERRORS authored, STILL zero cache/degradation ----
for uc, form, mod in ucs:
    _, name, api = author_machine(uc, form)
    author_slices(uc, name, api)
    author_errors(uc, name, api, mod)
for uc in skipped_no_module:   # machines+slices exist even for module-less UCs
    form = first_value(f"MATCH (uc:UseCase {{id:'{uc}'}})-[:USES_FORM]->(f:Form) RETURN f.id LIMIT 1;")
    if form:
        _, name, api = author_machine(uc, form)
        author_slices(uc, name, api)
h0b_l13 = l13_all()
h0b_rest = all_checks()
results["H0b_machines_slices_errors_no_cache"] = {
    "n_machines": len(ucs) + len(skipped_no_module),
    "n_slices": scalar("MATCH (sl:Slice) RETURN count(sl);"),
    "n_errors": scalar("MATCH (e:DomainError) RETURN count(e);"),
    "skipped_no_module": skipped_no_module,
    "l13_checks": h0b_l13,
    "full_matrix_zero": all(v == 0 for v in h0b_rest.values()),
    "pass": all(v == 0 for v in h0b_l13.values()) and all(v == 0 for v in h0b_rest.values())}
full_reset()

# ---- H1 + H2 per UC (full reset between iterations) ----
h1_rows, h2_rows = [], []
for uc, form, mod in ucs:
    full_reset()
    sid, name, api = author_machine(uc, form)
    author_slices(uc, name, api)
    errs, _ = author_errors(uc, name, api, mod)
    cp, rules = author_resilience(uc, name, api, mod)
    e2 = errs[1]
    r1, r2 = rules
    da = first_value(f"""MATCH (:Form {{id:'{form}'}})-[:HAS_FIELD]->(:FormField)
      -[:MAPS_TO]->(da:DomainAttribute) RETURN da.id ORDER BY da.id LIMIT 1;""")
    task = first_value(f"""MATCH (uc:UseCase {{id:'{uc}'}})-[:GENERATES]->(t:Task)
      RETURN t.id ORDER BY t.id LIMIT 1;""")
    intact = l13_all()

    row = {"uc": uc, "module": mod, "cache": cp, "rules": rules,
           "has_tasks": task is not None,
           "l13_intact_zero": all(v == 0 for v in intact.values()),
           "old_cp_from_uc": closure_count(uc, OLD_ALLOW, "CachePolicy"),
           "new_cp_from_uc": closure_count(uc, NEW_ALLOW, "CachePolicy"),
           "old_deg_from_uc": closure_count(uc, OLD_ALLOW, "DegradationRule"),
           "new_deg_from_uc": closure_count(uc, NEW_ALLOW, "DegradationRule"),
           "old_cp_from_api": closure_count(api, OLD_ALLOW, "CachePolicy"),
           "new_cp_from_api": closure_count(api, NEW_ALLOW, "CachePolicy"),
           "old_deg_from_err": closure_count(e2, OLD_ALLOW, "DegradationRule"),
           "new_deg_from_err": closure_count(e2, NEW_ALLOW, "DegradationRule"),
           "old_cp_from_da": closure_count(da, OLD_ALLOW, "CachePolicy") if da else None,
           "new_cp_from_da": closure_count(da, NEW_ALLOW, "CachePolicy") if da else None,
           "new_deg_from_da": closure_count(da, NEW_ALLOW, "DegradationRule") if da else None,
           "uc_to_cp_hops": hops_to(uc, cp, NEW_ALLOW),
           "uc_to_deg_hops": hops_to(uc, r1, NEW_ALLOW),
           "api_to_cp_hops": hops_to(api, cp, NEW_ALLOW),
           "err_to_deg_hops": hops_to(e2, r2, NEW_ALLOW),
           "da_to_cp_hops": hops_to(da, cp, NEW_ALLOW) if da else None,
           "da_to_deg_hops": hops_to(da, r1, NEW_ALLOW) if da else None}
    row["h1_pass"] = (row["l13_intact_zero"]
                      and row["old_cp_from_uc"] == 0 and row["old_deg_from_uc"] == 0
                      and row["old_cp_from_api"] == 0 and row["old_deg_from_err"] == 0
                      and (da is None or row["old_cp_from_da"] == 0)
                      and row["new_cp_from_uc"] == 1 and row["new_deg_from_uc"] == 2
                      and row["new_cp_from_api"] == 1 and row["new_deg_from_err"] == 2
                      and row["uc_to_cp_hops"] == 2 and row["uc_to_deg_hops"] == 1
                      and row["api_to_cp_hops"] == 1 and row["err_to_deg_hops"] == 1
                      and (da is None or (row["new_cp_from_da"] == 1
                                          and row["new_deg_from_da"] == 2
                                          and 1 <= row["da_to_cp_hops"] <= 6
                                          and 1 <= row["da_to_deg_hops"] <= 6)))
    h1_rows.append(row)

    # H2: tight stamp vs broad radius (origin = the changed UC)
    run(f"MATCH (uc:UseCase {{id:'{uc}'}}) SET uc.spec_version = coalesce(uc.spec_version,0) + 1;")
    stamp_tight(uc, f"cache/degradation policies created for {uc}")
    flagged_tasks = scalar("MATCH (t:Task) WHERE coalesce(t.review_status,'current')='stale' RETURN count(t);")
    flagged_total = scalar("MATCH (n) WHERE coalesce(n.review_status,'current')='stale' RETURN count(n);")
    expected_tasks = scalar(f"""MATCH (uc:UseCase {{id:'{uc}'}})
      OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(uc)
      WITH collect(DISTINCT uc) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
      UNWIND affected AS a MATCH (a)-[:GENERATES]->(t:Task) RETURN count(DISTINCT t);""")
    broad_uc = scalar(f"""MATCH (changed:UseCase {{id:'{uc}'}})
      MATCH (changed)-[:{NEW_ALLOW}*1..6]-(dep:Task) WHERE dep <> changed
      RETURN count(DISTINCT dep);""")
    broad_cp = scalar(f"""MATCH (changed:CachePolicy {{id:'{cp}'}})
      MATCH (changed)-[:{NEW_ALLOW}*1..6]-(dep:Task) WHERE dep <> changed
      RETURN count(DISTINCT dep);""")
    h2_rows.append({"uc": uc, "tasks_flagged": flagged_tasks,
                    "tasks_expected": expected_tasks, "total_flagged": flagged_total,
                    "expected_total": expected_tasks + 1,
                    "broad_from_uc_tasks": broad_uc,
                    "broad_from_cp_tasks": broad_cp,
                    "h2_pass": flagged_tasks == expected_tasks
                               and flagged_total == expected_tasks + 1})

results["H1"] = {"n_ucs": len(h1_rows), "rows": h1_rows,
                 "pass": all(r["h1_pass"] for r in h1_rows)}
results["H2"] = {"n_ucs": len(h2_rows), "rows": h2_rows,
                 "tight_total": sum(r["total_flagged"] for r in h2_rows),
                 "broad_from_uc_total": sum(r["broad_from_uc_tasks"] for r in h2_rows),
                 "broad_from_cp_total": sum(r["broad_from_cp_tasks"] for r in h2_rows),
                 "pass": all(r["h2_pass"] for r in h2_rows)}

# ---- H2-shared: modifying a SHARED cache policy stamps exactly the consumers ----
by_id = {uc: (form, mod) for uc, form, mod in ucs}
task_bearing = [uc for uc, _, _ in ucs if scalar(
    f"MATCH (uc:UseCase {{id:'{uc}'}})-[:GENERATES]->(t:Task) RETURN count(t);") > 0]
ucA, ucB = task_bearing[0], task_bearing[1]
full_reset()
_, nameA, apiA = author_machine(ucA, by_id[ucA][0])
_, nameB, apiB = author_machine(ucB, by_id[ucB][0])
author_slices(ucA, nameA, apiA)
author_errors(ucA, nameA, apiA, by_id[ucA][1])
shared_cp, _ = author_resilience(ucA, nameA, apiA, by_id[ucA][1])
# ucB's resilience run shares the policy: MERGE by id picks the node up and
# adds a CACHES edge to ucB's own surface — never a duplicate node
run(f"""MATCH (cp:CachePolicy {{id:'{shared_cp}'}}) MATCH (a:APIEndpoint {{id:'{apiB}'}})
MERGE (cp)-[:CACHES]->(a);""")
# now ucA's run MODIFIES the shared policy's contract properties
# (mechanical trigger: serves_stale changed vs the before-image; the
# bookkeeping `updated` touch alone would NOT count):
run(f"MATCH (cp:CachePolicy {{id:'{shared_cp}'}}) SET cp.serves_stale=false, cp.updated=datetime();")
run(f"MATCH (uc:UseCase {{id:'{ucA}'}}) SET uc.spec_version = coalesce(uc.spec_version,0) + 1;")
stamp_tight(ucA, f"cache/degradation policies modified for {ucA}")
stamp_shared_consumers(ucA, shared_cp)
exp_set = scalar(f"""MATCH (r:UseCase) WHERE r.id IN ['{ucA}','{ucB}']
  OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(r)
  WITH collect(DISTINCT r) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
  UNWIND affected AS a MATCH (a)-[:GENERATES]->(t:Task) RETURN count(DISTINCT t);""")
flagged_tasks = scalar("MATCH (t:Task) WHERE coalesce(t.review_status,'current')='stale' RETURN count(t);")
flagged_ucs = scalar("MATCH (u:UseCase) WHERE coalesce(u.review_status,'current')='stale' RETURN count(u);")
origin_cp_tasks = scalar(f"MATCH (t:Task) WHERE t.stale_origin='{shared_cp}' RETURN count(t);")
origin_uc_tasks = scalar(f"MATCH (t:Task) WHERE t.stale_origin='{ucA}' RETURN count(t);")
b_stamped_origin = first_value(f"MATCH (u:UseCase {{id:'{ucB}'}}) RETURN u.stale_origin;")
results["H2_shared"] = {
    "uc_invoked": ucA, "uc_consumer": ucB, "shared_cache": shared_cp,
    "tasks_flagged": flagged_tasks, "tasks_expected_set": exp_set,
    "ucs_flagged": flagged_ucs,
    "consumer_uc_origin": b_stamped_origin,
    "tasks_with_cp_origin": origin_cp_tasks, "tasks_with_uc_origin": origin_uc_tasks,
    "pass": flagged_tasks == exp_set and flagged_ucs == 2
            and b_stamped_origin == shared_cp and origin_cp_tasks > 0}
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
    author_machine(ucF, formF)        # foreign machine: NO slices/errors/resilience
    author_slices(uc0, name0, api0)
    author_errors(uc0, name0, api0, mod0)
    author_resilience(uc0, name0, api0, mod0)
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
run("MATCH (x:APIEndpoint {id:'api-bench-extra'}) DETACH DELETE x;")
results["clone_clean"] = {
    "nodes": scalar("MATCH (n) RETURN count(n);"),
    "rels": scalar("MATCH ()-[r]->() RETURN count(r);"),
    "cache_policies": scalar("MATCH (cp:CachePolicy) RETURN count(cp);"),
    "degradation_rules": scalar("MATCH (dr:DegradationRule) RETURN count(dr);"),
    "errors": scalar("MATCH (e:DomainError) RETURN count(e);"),
    "slices": scalar("MATCH (sl:Slice) RETURN count(sl);"),
    "screens": scalar("MATCH (s:Screen) RETURN count(s);"),
    "stale": scalar("MATCH (n) WHERE coalesce(n.review_status,'current')='stale' RETURN count(n);"),
}
results["overall_pass"] = all(results[h]["pass"] for h in
                              ("H0a_clean_graph", "H0b_machines_slices_errors_no_cache",
                               "H1", "H2", "H2_shared", "H3"))
print(json.dumps(results, indent=2, ensure_ascii=False))
