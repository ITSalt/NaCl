import copy
import unittest
from candidate import propose

def graph():
    return {'scope': 'project-A', 'fence': 7,
      'sources': {'OBJ-001': {'revision': 3, 'facts': {'store':'Supabase','screen':True}, 'display':'old'}},
      'targets': {'SA-1': {'scope':'project-A','value':'keep'}, 'SA-2': {'scope':'project-A','value':'keep'},
                  'OTHER': {'scope':'project-A','value':'keep'}, 'FOREIGN': {'scope':'project-B','value':'keep'}},
      'links': {'OBJ-001':['SA-1','SA-2']}}

def call(g, **kw):
    args={'scope':'project-A','writer_fence':7,'source_id':'OBJ-001','expected_revision':3,
          'new_facts':{'store':'PostgreSQL','screen':True},'new_display':'new'}
    args.update(kw)
    return propose(g, **args)

class TestContract(unittest.TestCase):
    def test_same_id_semantic_change_targets_both_not_unrelated(self):
        g=graph(); before=copy.deepcopy(g);r=call(g)
        self.assertEqual('APPLIED',r['status']);self.assertTrue(r['semantic_changed'])
        self.assertEqual({'SA-1','SA-2'},{e['target'] for e in r['events']})
        self.assertTrue(all((e['source'],e['old_revision'],e['new_revision'])==('OBJ-001',3,4) for e in r['events']))
        self.assertEqual(before['targets'],r['snapshot']['targets']);self.assertEqual(before,g)
    def test_format_only_same_supplied_semantic_facts(self):
        g=graph();r=call(g,new_facts={'screen':True,'store':'Supabase'},new_display='  OLD   formatted  ')
        self.assertFalse(r['semantic_changed']);self.assertEqual([],r['events']);self.assertEqual(4,r['snapshot']['sources']['OBJ-001']['revision'])
    def test_foreign_project_rejected_without_mutation(self):
        g=graph();before=copy.deepcopy(g);r=call(g,scope='project-B')
        self.assertEqual('BLOCKED_SCOPE',r['status']);self.assertEqual(before,g)
    def test_stale_fence_rejected_without_mutation(self):
        g=graph();before=copy.deepcopy(g);r=call(g,writer_fence=6)
        self.assertEqual('BLOCKED_FENCE',r['status']);self.assertEqual(before,g)
    def test_stale_revision_rejected_without_mutation(self):
        g=graph();before=copy.deepcopy(g);r=call(g,expected_revision=2)
        self.assertEqual('BLOCKED_REVISION',r['status']);self.assertEqual(before,g)
    def test_interruption_does_not_claim_success_or_modify_snapshot(self):
        g=graph();before=copy.deepcopy(g);r=call(g,interrupt=True)
        self.assertEqual('INCOMPLETE',r['status']);self.assertEqual(before,g);self.assertEqual(before,r['snapshot'])
    def test_unmapped_source_not_accepted_as_current(self):
        g=graph();g['links']['OBJ-001']=[];before=copy.deepcopy(g);r=call(g)
        self.assertEqual('UNKNOWN_UNMAPPED',r['status']);self.assertEqual(before,g)
    def test_mixed_scope_target_fails_closed(self):
        g=graph();g['links']['OBJ-001'].append('FOREIGN');before=copy.deepcopy(g);r=call(g)
        self.assertEqual('BLOCKED_INVALID_TARGET',r['status']);self.assertEqual(before,g)
    def test_unknown_target_fails_closed(self):
        g=graph();g['links']['OBJ-001'].append('MISSING');r=call(g)
        self.assertEqual('BLOCKED_INVALID_TARGET',r['status'])
    def test_fact_deletion_requires_review(self):
        g=graph();r=call(g,new_facts={'store':'Supabase'})
        self.assertTrue(r['semantic_changed']);self.assertEqual(2,len(r['events']))

if __name__=='__main__': unittest.main(verbosity=2)
