from dataclasses import dataclass, replace
@dataclass(frozen=True)
class Record:
    source: str = 'live'
    revision: str = 'abc123'
    stage: str = 'browser'
    status: str = 'PASS'
    reviewer: str = 'independent'
    project: str = 'family-cinema'
    waiver: str = ''
    proof_verified: bool = True

def candidate(records, expected_revision, expected_project):
    seen = set()
    for r in records:
        if r.project != expected_project or r.revision != expected_revision:
            return 'BLOCKED'
        if r.reviewer != 'independent' or not r.proof_verified:
            return 'BLOCKED'
        if r.stage == 'browser':
            if r.waiver:
                if r.waiver != 'signed:browser:family-cinema:abc123':
                    return 'BLOCKED'
                seen.add('browser')
            elif r.status != 'PASS' or r.source != 'live':
                return 'BLOCKED'
            else:
                seen.add('browser')
        elif r.stage == 'unit':
            if r.status != 'PASS' or r.source not in ('mock','live'):
                return 'BLOCKED'
            seen.add('unit')
        else:
            return 'BLOCKED'
    return 'PASS' if seen == {'browser', 'unit'} else 'BLOCKED'

u=Record(stage='unit',source='mock')
v=Record()
cases = [
 ('positive_scoped_live_and_unit',[u,v],'PASS'),
 ('docs_green_cannot_supply_live',[u,replace(v,source='docs')],'BLOCKED'),
 ('mock_cannot_supply_live',[u,replace(v,source='mock')],'BLOCKED'),
 ('failed_plus_not_run',[replace(u,status='FAILED'),replace(v,status='NOT_RUN')],'BLOCKED'),
 ('stale_revision',[u,replace(v,revision='old')],'BLOCKED'),
 ('wrong_project',[u,replace(v,project='other')],'BLOCKED'),
 ('missing_independent_review',[u,replace(v,reviewer='author')],'BLOCKED'),
 ('missing_mandatory_stage',[u],'BLOCKED'),
 ('matching_explicit_waiver',[u,replace(v,status='NOT_RUN',waiver='signed:browser:family-cinema:abc123')],'PASS'),
 ('wrong_scope_waiver',[u,replace(v,status='NOT_RUN',waiver='signed:browser:other:abc123')],'BLOCKED'),
 ('unsigned_waiver',[u,replace(v,status='NOT_RUN',waiver='unsigned:browser:family-cinema:abc123')],'BLOCKED'),
 ('invalid_artifact_proof',[u,replace(v,proof_verified=False)],'BLOCKED'),
]
for name, records, expected in cases:
    actual=candidate(records,'abc123','family-cinema')
    print(f'{name}: expected={expected} actual={actual} {"OK" if actual==expected else "FAIL"}')
    assert actual == expected, name
print(f'RESULT {len(cases)}/{len(cases)} controls matched')
# Adversarial model boundary: any untrusted caller may assert proof_verified=True.
# This schema-level prototype cannot distinguish a forged claim from real evidence.
print('LIMIT: proof_verified and reviewer are trusted fixture inputs; no real proof or identity verified')
