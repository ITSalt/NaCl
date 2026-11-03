from copy import deepcopy
from candidate import check,digest
base={'project':'fc','nodes':[{'id':'A','project':'fc','state':'ready'},{'id':'B','project':'fc','state':'done'}],'edges':[{'source':'A','type':'DEPENDS_ON','target':'B'}]}
kw={'expected_project':'fc','expected_fence':7,'current_fence':7,'approved_digest':digest(base)}
print('previous_missing_fences',check(base,**{**kw,'expected_fence':None,'current_fence':None}))
print('previous_missing_project',check(base,**{**kw,'expected_project':None}))
f=deepcopy(base);f['nodes'][1]['project']='other';print('previous_foreign_node',check(f,**{**kw,'approved_digest':digest(f)}))
f=deepcopy(base);f['edges'][0]['project']='other';print('foreign_edge_property_if_required',check(f,**{**kw,'approved_digest':digest(f)}))
f=deepcopy(base);f['nodes'][1]['state']='tampered';print('untrusted_recomputed_approved_digest',check(f,**{**kw,'approved_digest':digest(f)}))
