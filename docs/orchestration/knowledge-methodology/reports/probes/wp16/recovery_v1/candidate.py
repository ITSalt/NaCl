import hashlib, json

def digest(snapshot):
    data={"project":snapshot["project"],"nodes":sorted(snapshot["nodes"],key=lambda n:n["id"]),"edges":sorted(snapshot["edges"],key=lambda e:(e["source"],e["type"],e["target"]))}
    return hashlib.sha256(json.dumps(data,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()

def check(snapshot, *, expected_project, expected_fence, current_fence, approved_digest, partial=False):
    # Synthetic model only; no authentication, transactions, graph access or filesystem writes.
    if snapshot.get("project") != expected_project: return "BLOCKED_PROJECT"
    if expected_fence != current_fence: return "BLOCKED_FENCE"
    if partial: return "BLOCKED_PARTIAL"
    ids=[n["id"] for n in snapshot["nodes"]]
    if len(ids)!=len(set(ids)): return "BLOCKED_DUPLICATE"
    if any(e["source"] not in ids or e["target"] not in ids for e in snapshot["edges"]): return "BLOCKED_SCOPE"
    if digest(snapshot)!=approved_digest: return "BLOCKED_FINGERPRINT"
    return "MODEL_MATCH"
