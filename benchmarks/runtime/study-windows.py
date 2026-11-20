"""Serial before/after/control study; every build/browser remains job-contained."""
import argparse
import json
from pathlib import Path
import os
import shutil
import uuid

from windows_job import contained, atomic_json


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--repeats', type=int, choices=[2,4], default=2)
    parser.add_argument('--time-domain',choices=['timeTicks','threadTicks'],default='timeTicks')
    args=parser.parse_args()
    here=Path(__file__).resolve().parent
    runs=here.parents[2]/'elnor/.elnor/mvp/framework-comparison/studies'
    runs.mkdir(parents=True,exist_ok=True)
    directory=runs/('run-'+uuid.uuid4().hex)
    directory.mkdir()
    node=shutil.which('node')
    playwright=Path(os.environ['APPDATA'])/'npm/node_modules/@playwright/cli/node_modules/playwright'
    plan=[]
    for label in ['baseline','candidate','react','svelte']:
        plan.append(dict(label=label,size=1000,mode='mutations',repeat=0))
    for repetition in range(args.repeats):
        for size in [100,1000]:
            if args.repeats==4:
                variants=['baseline','react','candidate','svelte']
                order=variants[repetition:]+variants[:repetition]
                if size==1000: order=list(reversed(order))
            else:
                order=['baseline','react','svelte','candidate'] if repetition==0 else ['candidate','svelte','react','baseline']
            for label in order:
                plan.append(dict(label=label,size=size,mode='runtime',repeat=repetition))
    study=dict(kind='elnor-contained-reconciliation-study-v1',passed=False,diagnosticOnly=True,
               baseline=str(args.baseline.resolve()),candidate=str(args.candidate.resolve()),plan=plan,cases=[],repeats=args.repeats,metricTimeDomain=args.time_domain,
               protocol='Fresh sandboxed headless Edge, GPU disabled, CPU 10%, job commit 768 MiB, 45s per case; 2 warmups + 7 samples, '+str(args.repeats)+' runs per size; '+('balanced four-position rotation' if args.repeats==4 else 'reverse order on second run')+'; counters separate from timings; duration clock='+args.time_domain)
    (directory/'study-producer.py').write_bytes(Path(__file__).read_bytes())
    atomic_json(directory/'study.json',study)
    print('Study: '+str(directory),flush=True)
    for index,case in enumerate(plan):
        label=case['label']
        fixture=(args.baseline if label=='baseline' else args.candidate).resolve()
        framework='elnor' if label in ['baseline','candidate'] else label
        output=directory/('case-'+str(index)+'-'+label+'-'+str(case['size'])+'-'+case['mode'])
        command=[node,'--max-old-space-size=192',str(here/'diagnostic-worker.mjs'),str(fixture),str(output),framework,str(case['size']),'7',str(playwright),case['mode'],args.time_domain]
        supervisor=contained(command,output)
        result=json.loads((output/'result.json').read_text(encoding='utf-8')) if (output/'result.json').exists() else {}
        passed=supervisor['passed'] and result.get('passed') is True
        study['cases'].append(dict(**case,directory=str(output),passed=passed))
        atomic_json(directory/'study.json',study)
        print(str(index+1)+'/'+str(len(plan))+' '+label+' '+str(case['size'])+' '+case['mode']+' '+('passed' if passed else 'FAILED'),flush=True)
        if not passed:
            raise RuntimeError('Study stopped; failed case retained at '+str(output))
    study['passed']=True
    atomic_json(directory/'study.json',study)


if __name__=='__main__':
    main()
