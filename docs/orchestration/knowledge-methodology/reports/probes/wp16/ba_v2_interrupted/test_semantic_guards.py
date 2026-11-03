"""Acceptance cases frozen before candidate v2 implementation.

Confirmation is a trusted, synthetic input, not authenticated human evidence.
"""
import copy
import unittest
from candidate import propose
from test_candidate import graph

def confirmation(display, facts, **changes):
    item={'scope':'project-A','source_id':'OBJ-001','expected_revision':3,
          'display':display,'facts':copy.deepcopy(facts), 'confirmed':True}
    item.update(changes)
    return item

def attempt(g, *, display, facts, attestation=None, scope='project-A'):
    kwargs={'scope':scope,'writer_fence':7,'source_id':'OBJ-001','expected_revision':3,
            'new_facts':facts,'new_display':display}
    if attestation is not None: kwargs['semantic_confirmation']=attestation
    return propose(g, **kwargs)

class SemanticAndOwnershipChecks(unittest.TestCase):
    def test_drift_in_text_without_confirmation_is_unknown(self):
        g=graph(); original=copy.deepcopy(g)
        r=attempt(g,display='Storage is now PostgreSQL, not Supabase', facts={'store':'Supabase','screen':True})
        self.assertEqual('UNKNOWN_SEMANTICS',r['status']);self.assertEqual(original,g);self.assertEqual(original,r['snapshot'])

    def test_same_facts_and_confirmed_formatting_need_no_review(self):
        g=graph(); facts={'screen':True,'store':'Supabase'}; display='  old, formatted  '
        r=attempt(g,display=display,facts=facts,attestation=confirmation(display,facts))
        self.assertEqual('APPLIED',r['status']);self.assertFalse(r['semantic_changed']);self.assertEqual([],r['events'])

    def test_external_mutation_does_not_mutate_committed_snapshot(self):
        g=graph();facts={'store':'PostgreSQL','nested':{'mode':['private']}};display='storage changed'
        att=confirmation(display,facts); r=attempt(g,display=display,facts=facts,attestation=att)
        self.assertEqual('APPLIED',r['status']); facts['nested']['mode'].append('external')
        self.assertEqual(['private'],r['snapshot']['sources']['OBJ-001']['facts']['nested']['mode'])
        r['snapshot']['targets']['SA-1']['value']='modified'
        self.assertEqual('keep',g['targets']['SA-1']['value'])

    def test_confirmation_for_another_display_does_not_authorize(self):
        g=graph();facts={'store':'PostgreSQL'};display='storage changed'
        r=attempt(g,display=display,facts=facts,attestation=confirmation('unrelated text',facts))
        self.assertEqual('UNKNOWN_SEMANTICS',r['status']);self.assertEqual(g,r['snapshot'])

    def test_blocked_result_does_not_alias_input(self):
        g=graph();r=attempt(g,display='anything',facts={'store':'Supabase'},scope='project-B')
        self.assertEqual('BLOCKED_SCOPE',r['status']);r['snapshot']['targets']['SA-1']['value']='mutated'
        self.assertEqual('keep',g['targets']['SA-1']['value'])

if __name__=='__main__': unittest.main(verbosity=2)
