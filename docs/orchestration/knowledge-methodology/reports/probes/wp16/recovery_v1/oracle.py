from copy import deepcopy
from candidate import check,digest

# Expected outcomes are fixed here before invocation; project and fence are synthetic.
base={"project":"family-cinema-test","nodes":[{"id":"A","state":"ready"},{"id":"B","state":"done"},{"id":"C","state":"open"}],"edges":[{"source":"A","type":"DEPENDS_ON","target":"B"}]}
approved=digest(base)
kw={"expected_project":"family-cinema-test","expected_fence":7,"current_fence":7,"approved_digest":approved}
cases=[]
cases.append(("positive matching baseline",base,kw,"MODEL_MATCH"))
different=deepcopy(base);different["edges"][0]["target"]="C"
cases.append(("same counts different relation",different,kw,"BLOCKED_FINGERPRINT"))
foreign=deepcopy(base);foreign["project"]="another-project"
cases.append(("foreign project",foreign,kw,"BLOCKED_PROJECT"))
cases.append(("stale fence",base,{**kw,"current_fence":8},"BLOCKED_FENCE"))
cases.append(("partial write",base,{**kw,"partial":True},"BLOCKED_PARTIAL"))
dup=deepcopy(base);dup["nodes"].append(deepcopy(dup["nodes"][0]))
cases.append(("duplicate ID",dup,kw,"BLOCKED_DUPLICATE"))
outside=deepcopy(base);outside["edges"][0]["target"]="OUTSIDE"
cases.append(("cross-scope edge",outside,kw,"BLOCKED_SCOPE"))
changed=deepcopy(base);changed["nodes"][1]["state"]="open"
cases.append(("same topology changed node state",changed,kw,"BLOCKED_FINGERPRINT"))
# Simulated scoped recovery: replacement in an in-memory copy, with foreign project preserved.
world={"target":deepcopy(changed),"foreign":{"project":"another-project","nodes":[],"edges":[]}}
foreign_before=deepcopy(world["foreign"]);world["target"]=deepcopy(base)
cases.append(("simulated restore/read-back",world["target"],kw,"MODEL_MATCH"))
failed=0
for name,snapshot,inputs,expected in cases:
    got=check(snapshot,**inputs);ok=got==expected;failed+=not ok
    print(("PASS" if ok else "FAIL"),name,"expected="+expected,"observed="+got)
assert world["foreign"]==foreign_before
print("PASS foreign in-memory object unchanged")
assert len(base["nodes"])==len(different["nodes"]) and len(base["edges"])==len(different["edges"])
print("PASS counts-only cannot distinguish changed relation")
print(f"SUMMARY {len(cases)-failed}/{len(cases)} plus 2 invariants")
raise SystemExit(1 if failed else 0)
