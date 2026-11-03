from copy import deepcopy
from test_candidate import graph
from candidate import propose

g=graph(); facts={'store':'Supabase','screen':True}; display='Storage is now PostgreSQL, not Supabase'
k={'scope':'project-A','writer_fence':7,'source_id':'OBJ-001','expected_revision':3,'new_facts':facts,'new_display':display}
r=propose(g,**k)
print('text_facts_without_confirmation',r['status'], 'events',len(r.get('events',[])))
att={'scope':'project-A','source_id':'OBJ-001','expected_revision':3,'display':display,'facts':deepcopy(facts),'confirmed':True}
r=propose(g,**k,semantic_confirmation=att)
print('text_facts_with_unsigned_claim',r['status'],'semantic_changed',r.get('semantic_changed'),'events',len(r.get('events',[])))
g=graph();facts={'store':'PostgreSQL','nested':{'mode':['private']}}; display='storage changed';att={'scope':'project-A','source_id':'OBJ-001','expected_revision':3,'display':display,'facts':deepcopy(facts),'confirmed':True}
r=propose(g,scope='project-A',writer_fence=7,source_id='OBJ-001',expected_revision=3,new_facts=facts,new_display=display,semantic_confirmation=att)
facts['nested']['mode'].append('external')
print('mutable_alias_after_external_change',r['status'],r['snapshot']['sources']['OBJ-001']['facts']['nested']['mode'])
