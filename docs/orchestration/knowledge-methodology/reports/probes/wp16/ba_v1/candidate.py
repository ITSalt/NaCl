"""In-memory candidate: typed semantic payload supplied by caller; no semantic inference."""
import copy
import hashlib
import json

def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def propose(snapshot, *, scope, writer_fence, source_id, expected_revision, new_facts, new_display, interrupt=False):
    # Explicit outcomes are not NaCl's current runtime contract.
    if scope != snapshot['scope']:
        return {'status': 'BLOCKED_SCOPE', 'snapshot': snapshot}
    if writer_fence != snapshot['fence']:
        return {'status': 'BLOCKED_FENCE', 'snapshot': snapshot}
    source = snapshot['sources'].get(source_id)
    if source is None or source['revision'] != expected_revision:
        return {'status': 'BLOCKED_REVISION', 'snapshot': snapshot}
    targets = snapshot['links'].get(source_id, [])
    if not targets:
        return {'status': 'UNKNOWN_UNMAPPED', 'snapshot': snapshot}
    if any(t not in snapshot['targets'] or snapshot['targets'][t]['scope'] != scope for t in targets):
        return {'status': 'BLOCKED_INVALID_TARGET', 'snapshot': snapshot}
    changed = digest(source['facts']) != digest(new_facts)
    if interrupt:
        return {'status': 'INCOMPLETE', 'snapshot': snapshot}
    out = copy.deepcopy(snapshot)
    out['sources'][source_id] = {'revision': expected_revision + 1, 'facts': new_facts, 'display': new_display}
    events = [{'target': t, 'source': source_id, 'old_revision': expected_revision,
               'new_revision': expected_revision + 1, 'kind': 'REVIEW_REQUIRED'} for t in targets] if changed else []
    return {'status': 'APPLIED', 'snapshot': out, 'events': events, 'semantic_changed': changed}
