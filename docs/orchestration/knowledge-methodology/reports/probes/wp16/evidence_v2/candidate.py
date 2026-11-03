# Synthetic policy only. reviewer/proof_ok/waiver are TRUSTED inputs, not authenticated.
def evaluate(records, expected_project, expected_rev):
    if not expected_project or not expected_rev: return 'BLOCKED'
    seen=set()
    for r in records:
        if r.get('project') != expected_project or r.get('revision') != expected_rev: return 'BLOCKED'
        if r.get('reviewer') != 'independent' or r.get('proof_ok') is not True: return 'BLOCKED'
        stage=r.get('stage'); status=r.get('status'); source=r.get('source'); waiver=r.get('waiver')
        if stage not in ('browser','unit') or stage in seen: return 'BLOCKED'
        seen.add(stage)
        # Chosen experimental policy: FAILED is never waived; only explicitly NOT_RUN browser may have waiver.
        if status == 'FAILED': return 'BLOCKED'
        if waiver is not None:
            if stage != 'browser' or status != 'NOT_RUN' or waiver != ('browser',expected_project,expected_rev): return 'BLOCKED'
        elif status != 'PASS' or source not in ({'live'} if stage=='browser' else {'mock','live'}): return 'BLOCKED'
    return 'PASS' if seen=={'browser','unit'} else 'BLOCKED'
