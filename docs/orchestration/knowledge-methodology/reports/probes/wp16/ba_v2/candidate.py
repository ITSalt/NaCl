"""Pure in-memory illustration, not a NaCl/graph implementation.

A trusted synthetic confirmation binds the exact scope/source/revision/display/facts.
No cryptographic identity, human signature, semantic inference or persistence is implemented.
"""
import copy
import hashlib
import json

def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def propose(snapshot, *, scope, writer_fence, source_id, expected_revision, new_facts, new_display, interrupt=False, semantic_confirmation=None):
    def rejected(status):
        return {'status':status, 'snapshot':copy.deepcopy(snapshot)}
    if scope != snapshot['scope']:
        return rejected('BLOCKED_SCOPE')
    if writer_fence != snapshot['fence']:
        return rejected('BLOCKED_FENCE')
    source = snapshot['sources'].get(source_id)
    if source is None or source['revision'] != expected_revision:
        return rejected('BLOCKED_REVISION')
    targets = snapshot['links'].get(source_id, [])
    if not targets:
        return rejected('UNKNOWN_UNMAPPED')
    if any(t not in snapshot['targets'] or snapshot['targets'][t]['scope'] != scope for t in targets):
        return rejected('BLOCKED_INVALID_TARGET')
    changed = digest(source['facts']) != digest(new_facts)
    any_changed = changed or source['display'] != new_display
    # Never infer semantic consistency from display. This simplified illustration
    # accepts a synthetic attestation as trusted; authenticating it is out of scope.
    if any_changed:
        expected={'scope':scope,'source_id':source_id,'expected_revision':expected_revision,
                  'display':new_display,'facts':new_facts,'confirmed':True}
        if semantic_confirmation != expected:
            return rejected('UNKNOWN_SEMANTICS')
    if interrupt:
        return rejected('INCOMPLETE')
    out=copy.deepcopy(snapshot)
    out['sources'][source_id]={'revision':expected_revision+1,'facts':copy.deepcopy(new_facts),'display':new_display}
    events=[{'target':t,'source':source_id,'old_revision':expected_revision,
             'new_revision':expected_revision+1,'kind':'REVIEW_REQUIRED'} for t in targets] if changed else []
    return {'status':'APPLIED','snapshot':out,'events':events,'semantic_changed':changed}
