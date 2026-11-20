"""Compare first row creation after initial mount; not page/network startup."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import statistics
import uuid

from windows_job import contained, atomic_json


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline',type=Path,required=True)
    parser.add_argument('--candidate',type=Path,required=True)
    args=parser.parse_args()
    here=Path(__file__).resolve().parent
    fixtures={name:getattr(args,name).resolve(strict=True) for name in ['baseline','candidate']}
    manifests={name:json.loads((fixture/'manifest.json').read_text(encoding='utf-8')) for name,fixture in fixtures.items()}
    for name in ['driver.mjs','style.css','react.mjs','svelte.mjs']:
        hashes=[next(file['sha256'] for file in manifest['files'] if file['name']==name) for manifest in manifests.values()]
        assert len(set(hashes))==1,'Shared/control asset changed: '+name
    directory=here.parents[2]/'elnor/.elnor/mvp/framework-comparison/cold-studies'/('run-'+uuid.uuid4().hex)
    directory.mkdir(parents=True)
    (directory/'producer.py').write_bytes(Path(__file__).read_bytes())
    plan=[dict(label=label,repeat=repeat) for repeat in range(4)
          for label in (['baseline','candidate'] if repeat%2==0 else ['candidate','baseline'])]
    report=dict(kind='elnor-contained-first-row-creation-v1',passed=False,diagnosticOnly=True,
                fixtures={name:str(fixture) for name,fixture in fixtures.items()},plan=plan,cases=[],
                protocol='1000 rows, first create after initial empty mount, zero warmups, one sample per fresh process, four processes per variant, alternating order, threadTicks; existing sandboxed headless Edge and Job limits; not page/network startup')
    atomic_json(directory/'summary.json',report)
    print('Cold study: '+str(directory),flush=True)
    node=shutil.which('node')
    playwright=Path(os.environ['APPDATA'])/'npm/node_modules/@playwright/cli/node_modules/playwright'
    browser=None
    sources=None
    for index,case in enumerate(plan):
        fixture=fixtures[case['label']]
        output=directory/('case-'+str(index)+'-'+case['label'])
        command=[node,'--max-old-space-size=192',str(here/'diagnostic-worker.mjs'),str(fixture),str(output),
                 'elnor','1000','1',str(playwright),'runtime','threadTicks']
        supervisor=contained(command,output)
        assert supervisor['passed'] and supervisor['limitsVerified'] and supervisor['activeProcessesAfterCleanup']==0,'Supervisor failed: '+str(output)
        limits=supervisor['limits']
        assert (limits['cpuPercent'],limits['jobCommitBytes'],limits['maxProcesses'],limits['timeoutSeconds'])==(10,768*1024**2,24,45)
        result=json.loads((output/'result.json').read_text(encoding='utf-8'))
        assert result['passed'] and result['diagnosticOnly'] and result['warmupRounds']==0
        assert (result['mode'],result['framework'],result['size'],result['measuredRounds'])==('runtime','elnor',1000,1)
        assert result['manifestSha256']==hashlib.sha256((fixture/'manifest.json').read_bytes()).hexdigest()
        if browser is None: browser=result['browserVersion']; sources=result['sourceHashes']
        assert result['browserVersion']==browser and result['sourceHashes']==sources
        observation=result['observation']
        assert observation['passed'] and observation['metricTimeDomain']=='threadTicks'
        samples=observation['samples']
        assert len(samples)==7 and samples[0]['action']=='create' and all(sample['keyedIdentity'] for sample in samples)
        report['cases'].append(dict(**case,directory=str(output),create=samples[0],passed=True))
        atomic_json(directory/'summary.json',report)
        print(str(index+1)+'/8 '+case['label']+' create CPU '+str(round(samples[0]['TaskDurationMs'],3))+' ms',flush=True)
    report['browser']=browser
    report['variants']={label:{metric:dict(values=[case['create'][metric] for case in report['cases'] if case['label']==label],
                          median=statistics.median(case['create'][metric] for case in report['cases'] if case['label']==label))
                          for metric in ['TaskDurationMs','ScriptDurationMs','LayoutDurationMs','RecalcStyleDurationMs','ThreadTimeMs','frameWindowMs']}
                        for label in fixtures}
    report['passed']=True
    atomic_json(directory/'summary.json',report)


if __name__=='__main__':
    main()
