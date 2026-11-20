"""Serial paired studies with a declared A/A control; no runtime modifications."""
import argparse
import json
from pathlib import Path
import shutil
import uuid
from windows_job import contained, atomic_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--controls', action='store_true', help='Also pair current Elnor with React and Svelte')
    parser.add_argument('--interleaved', action='store_true', help='Alternate active isolated pages per action')
    args = parser.parse_args()
    here = Path(__file__).resolve().parent
    family = 'interleaved-studies' if args.interleaved else 'paired-studies'
    directory = here.parents[2] / 'elnor/.elnor/mvp/framework-comparison' / family / ('run-' + uuid.uuid4().hex)
    directory.mkdir(parents=True)
    (directory / 'producer.py').write_bytes(Path(__file__).read_bytes())
    baseline, candidate = str(args.baseline.resolve(strict=True)), str(args.candidate.resolve(strict=True))
    plan = []
    comparisons = [('aa', candidate, 'elnor'), ('change', baseline, 'elnor')]
    if args.controls:
        comparisons += [('react', candidate, 'react'), ('svelte', candidate, 'svelte')]
    for group, first, framework in comparisons:
        for size in [100, 1000]:
            for repetition in [0, 1]:
                plan.append(dict(group=group, size=size, repetition=repetition,
                    order=['A','B'] if repetition == 0 else ['B','A'], interleaved=args.interleaved,
                    A=dict(fixture=first, framework='elnor'),
                    B=dict(fixture=candidate, framework=framework)))
    study = dict(kind='elnor-paired-study-v1', passed=False, diagnosticOnly=True, plan=plan, cases=[],
        protocol=('Alternate active isolated pages per action; AB/BA seed reversed in second pair. ' if args.interleaved else 'Consecutive isolated context blocks, AB/BA. ') + 'One fresh sandboxed headless Edge per pair, 2 warmups + 7 samples/action. AX trace after timing in same context. Job CPU10%, commit768MiB, processes24, wall45s, idle12s. No AX subtraction or acceptance threshold.')
    atomic_json(directory / 'study.json', study)
    print('Paired study: ' + str(directory), flush=True)
    for index, config in enumerate(plan):
        plan_file = directory / f'plan-{index}.json'
        atomic_json(plan_file, config)
        output = directory / f'case-{index}-{config["group"]}-{config["size"]}'
        supervisor = contained([shutil.which('node'), '--max-old-space-size=192', str(here/'paired-worker.mjs'), str(plan_file), str(output)], output)
        result = json.loads((output/'result.json').read_text(encoding='utf-8')) if (output/'result.json').exists() else {}
        passed = supervisor['passed'] and result.get('passed') is True
        study['cases'].append(dict(directory=str(output), passed=passed))
        atomic_json(directory/'study.json', study)
        print(f'{index+1}/{len(plan)} {config["group"]} {config["size"]} ' + ''.join(config['order']) + (' passed' if passed else ' FAILED'), flush=True)
        if not passed:
            raise RuntimeError('Paired study stopped; failed evidence retained.')
    study['passed'] = True
    atomic_json(directory/'study.json', study)


if __name__ == '__main__':
    main()
