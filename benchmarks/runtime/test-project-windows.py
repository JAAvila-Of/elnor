"""Run the existing project checks and all Node test files serially under limits."""
from pathlib import Path
import json
import re
import shutil
import uuid

from windows_job import contained, atomic_json


def main():
    here=Path(__file__).resolve().parent
    root=here.parents[1]
    directory=here.parents[2]/'elnor/.elnor/mvp/framework-comparison/test-runs'/('run-'+uuid.uuid4().hex)
    directory.mkdir(parents=True)
    node=shutil.which('node')
    tests=sorted((root/'tests').glob('*.test.mjs'))
    phases=[('check',[node,'--max-old-space-size=192',str(root/'src/cli.mjs'),'check']),
            ('build',[node,'--max-old-space-size=192',str(root/'src/cli.mjs'),'build'])]
    phases += [(file.stem,[node,'--max-old-space-size=192','--test','--test-concurrency=1',str(file)]) for file in tests]
    report=dict(kind='elnor-contained-node-verification-v1',passed=False,steps=[],tests=0)
    atomic_json(directory/'result.json',report)
    print('Verification: '+str(directory),flush=True)
    for index,(name,command) in enumerate(phases):
        output=directory/str(index)
        supervisor=contained(command,output,timeout=60,idle_timeout=60,cwd=root)
        log=(output/'worker.log').read_text(encoding='utf-8',errors='replace') if (output/'worker.log').exists() else ''
        count=re.search(r'^(?:#|\u2139) tests (\d+)\s*$',log,re.MULTILINE)
        if count: report['tests']+=int(count.group(1))
        report['steps'].append(dict(name=name,passed=supervisor['passed'],directory=str(output)))
        atomic_json(directory/'result.json',report)
        print(str(index+1)+'/'+str(len(phases))+' '+name+' '+('passed' if supervisor['passed'] else 'FAILED'),flush=True)
        if not supervisor['passed']:
            raise RuntimeError('Verification failed; see '+str(output))
    report['passed']=True
    atomic_json(directory/'result.json',report)


if __name__=='__main__':
    main()
