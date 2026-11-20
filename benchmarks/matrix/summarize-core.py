"""Validate a complete paired core study and print descriptive CPU medians."""
import hashlib
import json
import math
from pathlib import Path
import statistics
import sys

def read(path):return json.loads(path.read_text(encoding='utf-8'))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def summarize(directory):
    study=read(directory/'study.json')
    assert study['kind']=='elnor-paired-core-study-v1' and study['passed'] is True
    assert len(study['cases'])==16
    rows=[];seen=set();memory=[];browser=None
    for item in study['cases']:
        assert item['passed'] is True
        case=Path(item['directory']);data=read(case/'result.json');supervisor=read(case/'supervisor.json')
        assert data['kind']=='elnor-paired-core-v1' and data['passed'] is True
        assert data['config']==item['config']
        assert supervisor['passed'] is True and supervisor['limitsVerified'] is True and supervisor['activeProcessesAfterCleanup']==0
        limits=supervisor['limits']
        for key,value in [('cpuPercent',10),('jobCommitBytes',768*1024**2),('maxProcesses',24),('timeoutSeconds',45),('idleTimeoutSeconds',12),('minHostFreeMiB',4096),('killOnOwnerClose',True)]:assert limits[key]==value
        assert sha(case/'worker.mjs')==data['workerSha256']
        config=data['config'];key=(config['workload'],config['group'],''.join(config['order']))
        assert key not in seen;seen.add(key)
        assert browser in (None,data['browserVersion']);browser=data['browserVersion']
        actions=None
        for label,fixture in zip(['A','B'],data['fixtures']):
            expected=study['baseline'] if label=='A' or config['group']=='aa' else study['candidate']
            assert fixture['directory']==expected
            root=Path(expected);assert sha(root/'manifest.json')==fixture['manifestSha256']
            manifest=read(root/'manifest.json')
            for name in ['runtime','compiler']:assert sha(root/(name+'-source.mjs'))==fixture[name]['sha256']==manifest[name]['sha256']
            for file in manifest['files']:assert sha(root/'site'/file['name'])==file['sha256']
            assert actions in (None,manifest['actions'][config['workload']]);actions=manifest['actions'][config['workload']]
        assert len(data['samples'])==len(actions)*14
        for action in actions:
            values={}
            for label in ['A','B']:
                samples=[s for s in data['samples'] if s['action']==action and s['label']==label]
                assert sorted(s['round'] for s in samples)==list(range(7))
                for sample in samples:
                    assert sample['visibility']=='visible'
                    assert sample['mounted']==(action!='unmount')
                    for metric in ['ThreadTimeMs','TaskDurationMs','ScriptDurationMs','frameWindowMs']:
                        assert isinstance(sample[metric],(int,float)) and math.isfinite(sample[metric]) and sample[metric]>=0
                values[label]=statistics.median(s['ThreadTimeMs'] for s in samples)
            rows.append(dict(workload=key[0],group=key[1],order=key[2],action=action,baselineMs=values['A'],otherMs=values['B'],changePercent=(values['B']/values['A']-1)*100 if values['A'] else None))
        expected_memory=2 if config['group']=='candidate' and config['order']==['A','B'] else 0
        assert len(data['memory'])==expected_memory
        for row in data['memory']:
            assert len(row['cycles'])==8
            for sample in [row['baseline'],row['mounted'],*row['cycles']]:assert math.isfinite(sample['heapUsedBytes']) and sample['heapUsedBytes']>0
            for sample in row['cycles']:
                for field in ['nodes','jsEventListeners']:assert sample[field]==row['baseline'][field]
            memory.append(dict(workload=key[0],**row))
    assert seen=={(w,g,o) for w in ['counter','form','composition','localized'] for g in ['aa','candidate'] for o in ['AB','BA']}
    return dict(kind='elnor-paired-core-summary-v1',passed=True,study=str(directory),browser=browser,runtime=rows,memory=memory,
                limitations=['Descriptive paired medians; no accepted margin or statistical significance','Frame windows include rendering waits; CPU is renderer thread time','GC heap includes the driver/browser and is not allocated bytes or proof of no leak','Separate startup measurements are not supplied'])

if __name__=='__main__':
    print(json.dumps(summarize(Path(sys.argv[1]).resolve()),indent=2))
