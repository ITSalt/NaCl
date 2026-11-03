from copy import deepcopy
import hashlib,json
from candidate import check
# Independent expected fingerprint using manually fixed canonical JSON, not candidate.digest().
base={'project':'fc','nodes':[{'id':'A','project':'fc','state':'ready'},{'id':'B','project':'fc','state':'done'},{'id':'C','project':'fc','state':'open'}],'edges':[{'source':'A','type':'DEPENDS_ON','target':'B'}]}
canonical='{"edges":[{"source":"A","target":"B","type":"DEPENDS_ON"}],"nodes":[{"id":"A","project":"fc","state":"ready"},{"id":"B","project":"fc","state":"done"},{"id":"C","project":"fc","state":"open"}],"project":"fc"}'
approved=hashlib.sha256(canonical.encode()).hexdigest()
kw={'expected_project':'fc','expected_fence':7,'current_fence':7,'approved_digest':approved}
def change(fn): s=deepcopy(base);fn(s);return s
cases=[
('positive',base,kw,'MODEL_MATCH'),
('missing-project',base,{**kw,'expected_project':None},'BLOCKED_PROJECT'),
('empty-project',base,{**kw,'expected_project':''},'BLOCKED_PROJECT'),
('missing-both-fences',base,{**kw,'expected_fence':None,'current_fence':None},'BLOCKED_FENCE'),
('zero-fence',base,{**kw,'expected_fence':0,'current_fence':0},'BLOCKED_FENCE'),
('bool-fence',base,{**kw,'expected_fence':True,'current_fence':True},'BLOCKED_FENCE'),
('stale-fence',base,{**kw,'current_fence':8},'BLOCKED_FENCE'),
('partial',base,{**kw,'partial':True},'BLOCKED_PARTIAL'),
('foreign-node',change(lambda s:s['nodes'][1].update(project='other')),kw,'BLOCKED_SCOPE'),
('missing-node-scope',change(lambda s:s['nodes'][1].pop('project')),kw,'BLOCKED_SCOPE'),
('foreign-edge-endpoint',change(lambda s:s['edges'][0].update(target='X')),kw,'BLOCKED_SCOPE'),
('duplicate-id',change(lambda s:s['nodes'].append(deepcopy(s['nodes'][0]))),kw,'BLOCKED_DUPLICATE'),
('same-counts-different-edge',change(lambda s:s['edges'][0].update(target='C')),kw,'BLOCKED_FINGERPRINT'),
('same-topology-changed-state',change(lambda s:s['nodes'][1].update(state='open')),kw,'BLOCKED_FINGERPRINT'),
('missing-digest',base,{**kw,'approved_digest':None},'BLOCKED_FINGERPRINT')]
for name,s,inputs,expected in cases:
    got=check(s,**inputs);print(f'{name}: expected={expected} actual={got}');assert got==expected,name
print('RECOVERY SUMMARY 15/15')
print('LIMIT: in-memory synthetic model only; no authentic fence, graph transaction, restore, or concurrent writer test')
