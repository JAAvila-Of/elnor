"""Reject malformed observations and bad startup inputs without false greens."""
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('study',type=Path)
    parser.add_argument('--matrix-study',type=Path,required=True)
    args = parser.parse_args()
    read = lambda path: json.loads(path.read_text(encoding='utf-8'))
    study,matrix = read(args.study / 'study.json'),read(args.matrix_study / 'summary.json')
    assert study['passed'] and len(study['cases']) == 24 and matrix['passed']
    fixture = Path(study['fixture'])
    manifest = read(fixture / 'manifest.json')
    first = read(Path(study['cases'][0]['directory']) / 'result.json')
    config = study['plan'][0]
    schema = matrix['schemas'][config['workload']]['mount']
    spec = importlib.util.spec_from_file_location('startup_summary',HERE / 'startup-summarize.py')
    reader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reader)
    reader.verify_raw(first,config,manifest,schema)
    mutations = [
        ('hidden-before',lambda value:value['samples'][0].update(beforeNavigationVisibility='hidden')),
        ('hidden-initial',lambda value:value['samples'][0].update(initialVisibility='hidden')),
        ('hidden-during',lambda value:value['samples'][0].update(visibilityEvents=[dict(state='hidden',at=value['samples'][0]['readyAt']/2)])),
        ('hidden-ready',lambda value:value['samples'][0].update(readyVisibility='hidden')),
        ('wrong-clock',lambda value:value.update(metricTimeDomain='timeTicks')),
        ('missing-sample',lambda value:value['samples'].pop()),
        ('wrong-order',lambda value:value['samples'][0].update(position=1)),
        ('negative-wall',lambda value:value['samples'][0].update(wallMs=-1)),
        ('wrong-schema',lambda value:value['samples'][0].update(schemaSha256='0'*64)),
    ]
    output = ROOT / 'elnor/.elnor/mvp/framework-comparison/startup-validation' / ('run-'+uuid.uuid4().hex)
    output.mkdir(parents=True)
    shutil.copyfile(__file__,output / 'producer.py')
    shutil.copyfile(HERE / 'startup-summarize.py',output / 'reader.py')
    result = dict(kind='elnor-foreground-startup-validation-v2',passed=False,metadataRejections=[],nativeRejections=[])
    print('Startup validation: '+str(output),flush=True)
    for name,mutate in mutations:
        value = copy.deepcopy(first)
        mutate(value)
        try:
            reader.verify_raw(value,config,manifest,schema)
        except AssertionError:
            result['metadataRejections'].append(name)
        else:
            raise AssertionError('Malformed record was accepted: '+name)
    atomic_json(output / 'result.json',result)
    broken = output / 'corrupted-fixture'
    broken.mkdir()
    for name in ['manifest.json','runtime-source.mjs','compiler-source.mjs']:
        shutil.copyfile(fixture / name,broken / name)
    shutil.copytree(fixture / 'site',broken / 'site')
    asset = broken / 'site' / manifest['files'][0]['name']
    with asset.open('ab') as file:
        file.write(b'\n// intentional startup checksum fault\n')
    for name,target,plan in [('checksum',broken,config),('workload',fixture,{**config,'workload':'not-defined'})]:
        plan_file = output / (name+'.json')
        atomic_json(plan_file,plan)
        directory = output / name
        supervisor = contained([shutil.which('node'),'--max-old-space-size=192',str(HERE / 'startup-worker.mjs'),str(target),str(plan_file),str(directory)],
                               directory,timeout=45,idle_timeout=12,cwd=ROOT)
        raw = read(directory / 'result.json')
        assert not supervisor['passed'] and supervisor['exitCode'] == 1 and supervisor['limitsVerified'] and supervisor['activeProcessesAfterCleanup'] == 0
        assert not raw['passed']
        if name == 'checksum':
            assert manifest['files'][0]['sha256'] in raw['error'] and hashlib.sha256(asset.read_bytes()).hexdigest() in raw['error']
        else:
            assert 'manifest.workloads.includes' in raw['error']
        assert not any(json.loads(line)['stage'] == 'launch' for line in (directory / 'progress.jsonl').read_text(encoding='utf-8').splitlines())
        result['nativeRejections'].append(dict(name=name,directory=str(directory),rejectedBeforeBrowserLaunch=True))
        atomic_json(output / 'result.json',result)
    result['passed'] = True
    atomic_json(output / 'result.json',result)
    print(json.dumps(result,indent=2),flush=True)


if __name__ == '__main__':
    main()
