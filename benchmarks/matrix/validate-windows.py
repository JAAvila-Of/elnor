"""Fault-injection checks: bad assets/config must fail before browser launch."""
import argparse
import hashlib
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
    output = ROOT / 'elnor/.elnor/mvp/framework-comparison/matrix-validation' / ('run-' + uuid.uuid4().hex)
    output.mkdir(parents=True)
    shutil.copyfile(__file__, output / 'producer.py')
    broken = output / 'corrupted-fixture'
    broken.mkdir()
    for name in ['manifest.json', 'runtime-source.mjs', 'compiler-source.mjs']:
        shutil.copyfile(fixture / name, broken / name)
    shutil.copytree(fixture / 'site', broken / 'site')
    corrupt = broken / 'site' / manifest['files'][0]['name']
    with corrupt.open('ab') as file:
        file.write(b'\n// intentional checksum fault\n')
    result = dict(kind='elnor-expanded-matrix-rejection-validation-v1', passed=False, cases=[])
    atomic_json(output / 'result.json', result)
    print('Validation: ' + str(output), flush=True)
    for name, target, config, marker in [
        ('checksum', broken, dict(mode='preflight', workload='counter'), manifest['files'][0]['sha256']),
        ('workload', fixture, dict(mode='preflight', workload='not-defined'), 'manifest.workloads.includes'),
    ]:
        plan = output / (name + '.json')
        atomic_json(plan, config)
        directory = output / name
        supervisor = contained([shutil.which('node'), '--max-old-space-size=192', str(HERE / 'worker.mjs'), str(target), str(plan), str(directory)],
                               directory, timeout=45, idle_timeout=12, cwd=ROOT)
        raw = json.loads((directory / 'result.json').read_text(encoding='utf-8'))
        events = [json.loads(line) for line in (directory / 'progress.jsonl').read_text(encoding='utf-8').splitlines()]
        assert not supervisor['passed'] and supervisor['exitCode'] == 1 and supervisor['limitsVerified'] and supervisor['activeProcessesAfterCleanup'] == 0
        assert not raw['passed'] and marker in raw['error']
        if name == 'checksum':
            assert hashlib.sha256(corrupt.read_bytes()).hexdigest() in raw['error']
        assert not any(event['stage'] == 'launch' for event in events)
        result['cases'].append(dict(name=name, directory=str(directory), rejectedBeforeBrowserLaunch=True))
        atomic_json(output / 'result.json', result)
    result['passed'] = True
    atomic_json(output / 'result.json', result)
    print(json.dumps(result, indent=2), flush=True)


if __name__ == '__main__':
    main()
