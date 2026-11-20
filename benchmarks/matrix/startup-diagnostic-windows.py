"""Collect separate bounded startup phase diagnostics for the whole matrix."""
import argparse
import json
from pathlib import Path
import shutil
import sys
import uuid

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0,str(HERE.parent / 'runtime'))
from windows_job import contained, atomic_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('fixture',type=Path)
    parser.add_argument('--smoke',action='store_true',help='One declared A/A counter case before the full diagnostic')
    args = parser.parse_args()
    fixture = args.fixture.resolve(strict=True)
    manifest = json.loads((fixture / 'manifest.json').read_text(encoding='utf-8'))
    output = ROOT / 'elnor/.elnor/mvp/framework-comparison/startup-diagnostics' / ('run-'+uuid.uuid4().hex)
    output.mkdir(parents=True)
    shutil.copyfile(__file__,output / 'producer.py')
    plan = [dict(workload=workload,group=group,order=order,rounds=3) for workload in manifest['workloads']
            for group in ['aa','react','svelte'] for order in [['A','B'],['B','A']]]
    if args.smoke:
        plan = plan[:1]
    study = dict(kind='elnor-startup-phase-diagnostic-study-v1',protocol='instrumented-startup-phases-v1',instrumented=True,
                 passed=False,diagnosticOnly=True,smoke=args.smoke,fixture=str(fixture),plan=plan,cases=[])
    atomic_json(output / 'study.json',study)
    print('Startup diagnostic: '+str(output),flush=True)
    for index,config in enumerate(plan):
        file = output / ('plan-'+str(index)+'.json')
        atomic_json(file,config)
        directory = output / ('case-'+str(index))
        supervisor = contained([shutil.which('node'),'--max-old-space-size=192',str(HERE / 'startup-diagnostic-worker.mjs'),str(fixture),str(file),str(directory)],
                               directory,timeout=45,idle_timeout=12,cwd=ROOT)
        result_file = directory / 'result.json'
        raw = json.loads(result_file.read_text(encoding='utf-8')) if result_file.exists() else {}
        passed = supervisor['passed'] and raw.get('passed') is True
        study['cases'].append(dict(directory=str(directory),passed=passed))
        atomic_json(output / 'study.json',study)
        print(f'{index+1}/{len(plan)} {config["workload"]} {config["group"]} '+('passed' if passed else 'FAILED'),flush=True)
        if not passed:
            raise RuntimeError('Diagnostic stopped; failed evidence retained')
    study['passed'] = True
    atomic_json(output / 'study.json',study)


if __name__ == '__main__':
    main()
