"""Negative checks for diagnostic phases, trace integrity and timing isolation."""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import uuid

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0,str(HERE.parent / 'runtime'))
from windows_job import contained, atomic_json


def load(name,file):
    spec = importlib.util.spec_from_file_location(name,file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def refuses(callback):
    try:
        callback()
    except AssertionError:
        return True
    raise AssertionError('Invalid diagnostic evidence was accepted')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('study',type=Path)
    parser.add_argument('--normal-study',type=Path,required=True)
    parser.add_argument('--matrix-study',type=Path,required=True)
    args = parser.parse_args()
    read = lambda path: json.loads(path.read_text(encoding='utf-8'))
    study,normal,matrix = read(args.study / 'study.json'),read(args.normal_study / 'study.json'),read(args.matrix_study / 'summary.json')
    assert study['passed'] and normal['passed'] and matrix['passed']
    fixture = Path(study['fixture'])
    manifest = read(fixture / 'manifest.json')
    output = ROOT / 'elnor/.elnor/mvp/framework-comparison/startup-diagnostic-validation' / ('run-'+uuid.uuid4().hex)
    output.mkdir(parents=True)
    shutil.copyfile(__file__,output / 'producer.py')
    for file in ['startup-diagnostic-summarize.py','startup-summarize.py']:
        shutil.copyfile(HERE / file,output / file)
    diagnostic = load('diagnostic_reader',HERE / 'startup-diagnostic-summarize.py')
    timing = load('timing_reader',HERE / 'startup-summarize.py')
    directory = Path(study['cases'][0]['directory'])
    raw = read(directory / 'result.json')
    sample = raw['samples'][0]
    diagnostic.phases(sample)
    diagnostic.trace_summary(directory,sample)
    checks = []
    def duplicate_driver(value):
        resources = value['observed']['resources']
        resources.append(copy.deepcopy(next(item for item in resources if item['name'].endswith('/driver.mjs'))))
    mutations = [
        ('hidden',lambda value:value['observed'].update(readyVisibility='hidden')),
        ('root-after-ready',lambda value:value['observed'].update(rootObservedAt=value['observed']['readyObservedAt']+1)),
        ('reversed-frame',lambda value:value['observed']['frames'][0].update(requestedAt=value['observed']['frames'][0]['firedAt']+1)),
        ('missing-navigation',lambda value:value['observed'].update(navigation=[])),
        ('duplicate-driver',duplicate_driver),
        ('frame-stack-budget',lambda value:value['observed']['frames'][0].update(source='x'*2049)),
    ]
    for name,mutate in mutations:
        value = copy.deepcopy(sample)
        mutate(value)
        assert refuses(lambda:diagnostic.phases(value))
        checks.append(name)
    trace_dir = output / 'trace-copy'
    trace_dir.mkdir()
    source = (directory / sample['trace']['file']).read_bytes()
    changed = bytes([source[0]^1])+source[1:]
    (trace_dir / sample['trace']['file']).write_bytes(changed)
    assert refuses(lambda:diagnostic.trace_summary(trace_dir,sample))
    checks.append('trace-checksum')
    value = copy.deepcopy(sample)
    value['trace']['bytes'] = 8*1024**2+1
    assert refuses(lambda:diagnostic.trace_summary(directory,value))
    checks.append('trace-budget')
    normal_raw = read(Path(normal['cases'][0]['directory']) / 'result.json')
    normal_config = normal['plan'][0]
    expected = matrix['schemas'][normal_config['workload']]['mount']
    timing.verify_raw(normal_raw,normal_config,manifest,expected)
    assert refuses(lambda:timing.verify_raw(raw,normal_config,manifest,expected))
    checks.append('instrumented-diagnostic-rejected-by-normal-reader')
    result = dict(kind='elnor-startup-diagnostic-validation-v1',passed=False,rejections=checks,nativeRejections=[])
    atomic_json(output / 'result.json',result)
    print('Diagnostic validation: '+str(output),flush=True)
    broken = output / 'corrupted-fixture'
    broken.mkdir()
    for file in ['manifest.json','runtime-source.mjs','compiler-source.mjs']:
        shutil.copyfile(fixture / file,broken / file)
    shutil.copytree(fixture / 'site',broken / 'site')
    asset = broken / 'site' / manifest['files'][0]['name']
    with asset.open('ab') as file:
        file.write(b'\n// intentional diagnostic checksum fault\n')
    for name,target,config in [('checksum',broken,study['plan'][0]),('workload',fixture,{**study['plan'][0],'workload':'not-defined'})]:
        plan = output / (name+'.json')
        atomic_json(plan,config)
        case = output / name
        supervisor = contained([shutil.which('node'),'--max-old-space-size=192',str(HERE / 'startup-diagnostic-worker.mjs'),str(target),str(plan),str(case)],
                               case,timeout=45,idle_timeout=12,cwd=ROOT)
        rejected = read(case / 'result.json')
        assert not supervisor['passed'] and supervisor['exitCode'] == 1 and supervisor['limitsVerified'] and supervisor['activeProcessesAfterCleanup'] == 0 and not rejected['passed']
        if name == 'checksum':
            assert manifest['files'][0]['sha256'] in rejected['error'] and hashlib.sha256(asset.read_bytes()).hexdigest() in rejected['error']
        else:
            assert 'manifest.workloads.includes' in rejected['error']
        assert not any(json.loads(line)['stage'] == 'launch' for line in (case / 'progress.jsonl').read_text(encoding='utf-8').splitlines())
        result['nativeRejections'].append(dict(name=name,directory=str(case),rejectedBeforeBrowserLaunch=True))
        atomic_json(output / 'result.json',result)
    result['passed'] = True
    atomic_json(output / 'result.json',result)
    print(json.dumps(result,indent=2),flush=True)


if __name__ == '__main__':
    main()
