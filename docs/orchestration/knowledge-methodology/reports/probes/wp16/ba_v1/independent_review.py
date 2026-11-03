import copy
from test_candidate import graph, call
from evidence_probe import Record, replace, candidate
original=graph()
r=call(copy.deepcopy(original),new_facts=original['sources']['OBJ-001']['facts'],new_display='Storage is now PostgreSQL not Supabase')
print('semantic_display_change',r['status'],r['semantic_changed'],len(r['events']))
u=Record(stage='unit',source='mock')
v=replace(Record(),status='FAILED',waiver='signed:browser:family-cinema:abc123')
print('failed_plus_waiver',candidate([u,v],'abc123','family-cinema'))
facts={'store':'PostgreSQL','screen':True}
r=call(graph(),new_facts=facts)
facts['store']='UNAPPROVED_MUTATION'
print('mutable_input_alias',r['status'],r['snapshot']['sources']['OBJ-001']['facts']['store'])
