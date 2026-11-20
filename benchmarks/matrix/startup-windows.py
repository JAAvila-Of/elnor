"""Serial controlled startup for every expanded workload and both controls."""
import argparse
import json
from pathlib import Path
import shutil
import sys
import uuid

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / 'runtime'))
from windows_job import contained, atomic_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('fixture', type=Path)
    args = parser.parse_args()
    fixture = args.fixture.resolve(strict=True)
    manifest = json.loads((fixture / 'manifest.json').read_text(encoding='utf-8'))
    assert manifest['kind'] == 'elnor-expanded-matrix-v1'
    directory = ROOT / 'elnor/.elnor/mvp/framework-comparison/startup-studies' / ('run-' + uuid.uuid4().hex)
    directory.mkdir(parents=True)
    shutil.copyfile(__file__, directory / 'producer.py')
    plan = [dict(workload=workload, group=group, order=order, rounds=7)
            for workload in manifest['workloads'] for group in ['aa','react','svelte'] for order in [['A','B'],['B','A']]]
    study = dict(kind='elnor-foreground-startup-study-v2',protocol='foreground-ready-v2',passed=False,diagnosticOnly=True,
                 fixture=str(fixture),plan=plan,cases=[])
    atomic_json(directory / 'study.json', study)
    print('Startup study: ' + str(directory), flush=True)
    for index, config in enumerate(plan):
        file = directory / ('plan-' + str(index) + '.json')
        atomic_json(file, config)
        output = directory / ('case-' + str(index))
        supervisor = contained([shutil.which('node'), '--max-old-space-size=192', str(HERE / 'startup-worker.mjs'), str(fixture), str(file), str(output)],
                               output, timeout=45, idle_timeout=12,cwd=ROOT)
        result_file = output / 'result.json'
        raw = json.loads(result_file.read_text(encoding='utf-8')) if result_file.exists() else {}
        passed = supervisor['passed'] and raw.get('passed') is True
        study['cases'].append(dict(directory=str(output),passed=passed))
        atomic_json(directory / 'study.json', study)
        print(f'{index+1}/{len(plan)} {config["workload"]} {config["group"]} ' + ('passed' if passed else 'FAILED'),flush=True)
        if not passed:
            raise RuntimeError('Controlled startup stopped; failed evidence retained')
    study['passed'] = True
    atomic_json(directory / 'study.json', study)


if __name__ == '__main__':
    main()
