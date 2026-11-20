"""Build and run the expanded matrix serially with unchanged containment limits."""
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
    parser.add_argument('--fixture', type=Path, help='Use a previously built immutable fixture')
    parser.add_argument('--preflight-only', action='store_true')
    args = parser.parse_args()
    directory = ROOT / 'elnor/.elnor/mvp/framework-comparison/matrix-studies' / ('run-' + uuid.uuid4().hex)
    directory.mkdir(parents=True)
    shutil.copyfile(__file__, directory / 'producer.py')
    node = shutil.which('node')
    print('Matrix study: ' + str(directory), flush=True)
    if args.fixture:
        fixture = args.fixture.resolve(strict=True)
    else:
        build = directory / 'build'
        supervisor = contained([node, '--max-old-space-size=192', str(HERE / 'build.mjs')], build, timeout=60, idle_timeout=60, cwd=ROOT)
        if not supervisor['passed']:
            raise RuntimeError('Build failed; retained ' + str(build))
        fixture = Path(json.loads((build / 'worker.log').read_text(encoding='utf-8').strip().splitlines()[-1])['directory'])
    print('Fixture: ' + str(fixture), flush=True)
    manifest = json.loads((fixture / 'manifest.json').read_text(encoding='utf-8'))
    plan = [dict(mode='preflight', workload=name) for name in manifest['workloads']]
    if not args.preflight_only:
        plan += [dict(mode='runtime', workload=name, group=group, order=order)
                 for name in manifest['workloads'] for group in ['aa','react','svelte'] for order in [['A','B'],['B','A']]]
        plan += [dict(mode='lifecycle', workload=name, framework=framework)
                 for name in manifest['workloads'] for framework in ['elnor','react','svelte']]
    study = dict(kind='elnor-expanded-matrix-study-v1', passed=False, diagnosticOnly=True, fixture=str(fixture), plan=plan, cases=[])
    atomic_json(directory / 'study.json', study)
    for index, config in enumerate(plan):
        file = directory / ('plan-' + str(index) + '.json')
        atomic_json(file, config)
        output = directory / ('case-' + str(index))
        supervisor = contained([node, '--max-old-space-size=192', str(HERE / 'worker.mjs'), str(fixture), str(file), str(output)],
                               output, timeout=45, idle_timeout=12, cwd=ROOT)
        result_file = output / 'result.json'
        result = json.loads(result_file.read_text(encoding='utf-8')) if result_file.exists() else {}
        passed = supervisor['passed'] and result.get('passed') is True
        study['cases'].append(dict(directory=str(output), passed=passed))
        atomic_json(directory / 'study.json', study)
        print(f'{index+1}/{len(plan)} {config["mode"]} {config["workload"]} ' + ('passed' if passed else 'FAILED'), flush=True)
        if not passed:
            raise RuntimeError('Matrix stopped; failed evidence retained')
    study['passed'] = True
    atomic_json(directory / 'study.json', study)


if __name__ == '__main__':
    main()
