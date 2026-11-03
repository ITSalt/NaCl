from copy import deepcopy
from candidate import evaluate
unit={'stage':'unit','source':'mock','status':'PASS','project':'fc','revision':'r1','reviewer':'independent','proof_ok':True}
browser={'stage':'browser','source':'live','status':'PASS','project':'fc','revision':'r1','reviewer':'independent','proof_ok':True}
def check(name,rows,project='fc',rev='r1'):
 print(name, evaluate(rows,project,rev))
f=deepcopy(browser);f.update(status='FAILED',waiver=('browser','fc','r1'));check('previous_failed_waiver', [unit,f])
f=deepcopy(browser);f.pop('proof_ok');check('missing_proof_claim',[unit,f])
f=deepcopy(browser);f['reviewer']='independent';f['proof_ok']=True;f['source']='live';check('fabricated_trusted_claims',[unit,f])
f=deepcopy(browser);f.update(status='NOT_RUN',waiver=('browser','fc','r1'));check('fabricated_waiver_tuple',[unit,f])
