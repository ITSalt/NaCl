from copy import deepcopy
from candidate import propose
from test_candidate import graph

g = graph()
g["fence"] = None
facts = {"store": "PostgreSQL", "screen": True}
display = "storage changed"
confirmation = {"scope": "project-A", "source_id": "OBJ-001", "expected_revision": 3,
                "display": display, "facts": deepcopy(facts), "confirmed": True}
r = propose(g, scope="project-A", writer_fence=None, source_id="OBJ-001", expected_revision=3,
            new_facts=facts, new_display=display, semantic_confirmation=confirmation)
print("missing_both_fences", r["status"], "events", len(r.get("events", [])))
