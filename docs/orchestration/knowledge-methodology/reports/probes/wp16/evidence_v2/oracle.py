from copy import deepcopy
from candidate import evaluate
# Independent manually written experimental expected outcomes, not NaCl's policy.
unit={'stage':'unit','source':'mock','status':'PASS','project':'fc','revision':'r1','reviewer':'independent','proof_ok':True}
browser={'stage':'browser','source':'live','status':'PASS','project':'fc','revision':'r1','reviewer':'independent','proof_ok':True}
def changed(x,**kw): y=deepcopy(x);y.update(kw);return y
cases=[
('live+unit', [unit,browser], 'PASS'),
('doc-not-live',[unit,changed(browser,source='docs')],'BLOCKED'),
('mock-not-live',[unit,changed(browser,source='mock')],'BLOCKED'),
('failed+not-run',[changed(unit,status='FAILED'),changed(browser,status='NOT_RUN')],'BLOCKED'),
('stale-revision',[unit,changed(browser,revision='r0')],'BLOCKED'),
('wrong-project',[unit,changed(browser,project='other')],'BLOCKED'),
('author-review',[unit,changed(browser,reviewer='author')],'BLOCKED'),
('missing-stage',[unit],'BLOCKED'),
('matching-not-run-waiver',[unit,changed(browser,status='NOT_RUN',waiver=('browser','fc','r1'))],'PASS'),
('failed-with-waiver',[unit,changed(browser,status='FAILED',waiver=('browser','fc','r1'))],'BLOCKED'),
('pass-with-waiver',[unit,changed(browser,status='PASS',waiver=('browser','fc','r1'))],'BLOCKED'),
('waiver-wrong-project',[unit,changed(browser,status='NOT_RUN',waiver=('browser','other','r1'))],'BLOCKED'),
('waiver-wrong-revision',[unit,changed(browser,status='NOT_RUN',waiver=('browser','fc','r0'))],'BLOCKED'),
('missing-proof',[unit,changed(browser,proof_ok=False)],'BLOCKED'),
('duplicate-stage',[unit,browser,browser],'BLOCKED'),
('unit-waiver',[changed(unit,status='NOT_RUN',waiver=('unit','fc','r1')),browser],'BLOCKED')]
for name,rows,expected in cases:
    got=evaluate(rows,'fc','r1');print(f'{name}: expected={expected} actual={got}');assert got==expected,name
print('EVIDENCE SUMMARY 16/16')
print('LIMIT: reviewer/proof/waiver claims are trusted synthetic values, no authentication or evidence verification')
