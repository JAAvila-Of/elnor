"""Compare frozen Elnor cores serially under the existing Windows limits."""
import argparse
import json
from pathlib import Path
import shutil
import sys
import uuid

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(HERE.parent/'runtime'))
from windows_job import contained,atomic_json

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline',type=Path)
    parser.add_argument('candidate',type=Path)
    args=parser.parse_args()
    baseline=args.baseline.resolve(strict=True)
    candidate=args.candidate.resolve(strict=True)
    directory=ROOT/'elnor/.elnor/mvp/framework-comparison/core-studies'/('run-'+uuid.uuid4().hex)
    directory.mkdir(parents=True)
    shutil.copyfile(__file__,directory/'producer.py')
    report=dict(kind='elnor-paired-core-study-v1',passed=False,baseline=str(baseline),candidate=str(candidate),cases=[])
    print('Core study: '+str(directory),flush=True)
    plan=[dict(workload=w,group=g,order=o) for w in ['counter','form','composition','localized'] for g in ['aa','candidate'] for o in [['A','B'],['B','A']]]
    for index,config in enumerate(plan):
        file=directory/('plan-'+str(index)+'.json');atomic_json(file,config)
        output=directory/('case-'+str(index))
        result=contained([shutil.which('node'),'--max-old-space-size=192',str(HERE/'compare-core-worker.mjs'),str(baseline),str(candidate),str(file),str(output)],output,timeout=45,idle_timeout=12,cwd=ROOT)
        data=json.loads((output/'result.json').read_text()) if (output/'result.json').exists() else {}
        passed=result['passed'] and data.get('passed') is True
        report['cases'].append(dict(config=config,directory=str(output),passed=passed));atomic_json(directory/'study.json',report)
        print(str(index+1)+'/16 '+config['workload']+' '+config['group']+' '+''.join(config['order'])+' '+('passed' if passed else 'FAILED'),flush=True)
        if not passed:raise RuntimeError('Stopped; retained '+str(output))
    report['passed']=True;atomic_json(directory/'study.json',report)

if __name__=='__main__':main()
