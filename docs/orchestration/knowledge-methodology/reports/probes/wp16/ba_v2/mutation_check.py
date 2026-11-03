"""Check guards with intentionally broken disposable mutant copies."""
from pathlib import Path
import shutil
import subprocess
import tempfile

base=Path(__file__).resolve().parent
source=(base/'candidate.py').read_text()
changes={
 'bypass_confirmation':('if any_changed:', 'if False:'),
 'alias_input_facts':("'facts':copy.deepcopy(new_facts)", "'facts':new_facts"),
 'alias_blocked_snapshot':("'snapshot':copy.deepcopy(snapshot)", "'snapshot':snapshot"),
 'drop_one_target':('for t in targets] if changed else []','for t in targets[:1]] if changed else []'),
 'ignore_fence':("if writer_fence != snapshot['fence']:", 'if False:'),
 'ignore_interrupt':('if interrupt:', 'if False:'),
}
for name,(old,new) in changes.items():
    if source.count(old)!=1:
        raise SystemExit('invalid mutation pattern: '+name)
    with tempfile.TemporaryDirectory(prefix='nacl-ba-v2-mut-') as tmp:
        d=Path(tmp)
        (d/'candidate.py').write_text(source.replace(old,new))
        for filename in ('test_candidate.py','test_semantic_guards.py'):
            shutil.copyfile(base/filename,d/filename)
        result=subprocess.run(['python3','-m','unittest','-q','test_candidate','test_semantic_guards'],cwd=d,capture_output=True,text=True)
        print(f'{name}: exit={result.returncode}; '+('REJECTED' if result.returncode else 'NOT_REJECTED'))
        if result.returncode==0:
            raise SystemExit('unsafe mutant survived')
