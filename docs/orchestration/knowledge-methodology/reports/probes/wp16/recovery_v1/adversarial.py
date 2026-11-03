from candidate import check,digest
s={"project":"family-cinema-test","nodes":[],"edges":[]}
observed=check(s,expected_project="family-cinema-test",expected_fence=None,current_fence=None,approved_digest=digest(s))
print("missing fences: expected=BLOCKED observed="+observed)
s["project"]=None
observed2=check(s,expected_project=None,expected_fence=7,current_fence=7,approved_digest=digest(s))
print("missing project: expected=BLOCKED observed="+observed2)
raise SystemExit(1 if observed=="MODEL_MATCH" or observed2=="MODEL_MATCH" else 0)
