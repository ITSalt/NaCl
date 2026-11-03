import hashlib,json
# Synthetic model: no DB/network, no actual identity, permissions, fence or restore.
def digest(s):
    obj={'project':s['project'],'nodes':sorted(s['nodes'],key=lambda x:x['id']),'edges':sorted(s['edges'],key=lambda x:(x['source'],x['type'],x['target']))}
    return hashlib.sha256(json.dumps(obj,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def check(snapshot,*,expected_project,expected_fence,current_fence,approved_digest,partial=False):
    if not isinstance(expected_project,str) or not expected_project.strip() or snapshot.get('project') != expected_project: return 'BLOCKED_PROJECT'
    if type(expected_fence) is not int or expected_fence <= 0 or type(current_fence) is not int or current_fence <= 0 or current_fence != expected_fence: return 'BLOCKED_FENCE'
    if partial: return 'BLOCKED_PARTIAL'
    nodes=snapshot.get('nodes');edges=snapshot.get('edges')
    if not isinstance(nodes,list) or not isinstance(edges,list): return 'BLOCKED_SCOPE'
    if any(not isinstance(n,dict) or not isinstance(n.get('id'),str) or not n['id'].strip() or n.get('project')!=expected_project for n in nodes): return 'BLOCKED_SCOPE'
    ids=[n['id'] for n in nodes]
    if len(ids)!=len(set(ids)): return 'BLOCKED_DUPLICATE'
    if any(not isinstance(e,dict) or e.get('source') not in ids or e.get('target') not in ids or not isinstance(e.get('type'),str) or not e['type'].strip() for e in edges): return 'BLOCKED_SCOPE'
    if not isinstance(approved_digest,str) or len(approved_digest)!=64 or digest(snapshot)!=approved_digest: return 'BLOCKED_FINGERPRINT'
    return 'MODEL_MATCH'
