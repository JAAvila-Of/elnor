"""Separate text, cleanup and insertion changes before accepting a candidate."""
import argparse
import json
import os
from pathlib import Path
import shutil
import uuid
from windows_job import contained, atomic_json


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline',type=Path,required=True)
    parser.add_argument('--trial',type=Path,required=True)
    args=parser.parse_args()
    here=Path(__file__).resolve().parent
    directory=here.parents[2]/'elnor/.elnor/mvp/framework-comparison/ablations'/('run-'+uuid.uuid4().hex)
    directory.mkdir(parents=True)
    (directory/'producer.py').write_bytes(Path(__file__).read_bytes())
    node=shutil.which('node')
    playwright=Path(os.environ['APPDATA'])/'npm/node_modules/@playwright/cli/node_modules/playwright'
    baseline=(args.baseline/'runtime-source.mjs').read_text(encoding='utf-8')
    trial=(args.trial/'runtime-source.mjs').read_text(encoding='utf-8')
    original_text="effect(()=>{node.textContent=String(read() ?? '');},owner);"
    guarded_text="effect(()=>{const value=String(read() ?? '');if(node.textContent!==value)node.textContent=value;},owner);"
    assert baseline.count(original_text)==2 and trial.count(guarded_text)==2
    batch_start='      if(row.index<0){\n        let first=i;'
    batch_end='      }else if(stable&&!stable.has(i)){'
    assert trial.count(batch_start)==1 and trial.count(batch_end)==1
    start=trial.index(batch_start)
    end=trial.index(batch_end,start)+len(batch_end)
    combined=trial[:start]+'      if(row.index<0||(stable&&!stable.has(i))){'+trial[end:]
    variants={'text-only':baseline.replace(original_text,guarded_text),
              'cleanup-only':combined.replace(guarded_text,original_text),
              'combined-no-batch':combined}
    report=dict(kind='elnor-runtime-ablation-v1',passed=False,diagnosticOnly=True,fixtures={'baseline':str(args.baseline.resolve()),'react':str(args.baseline.resolve()),'svelte':str(args.baseline.resolve())},cases=[],
                protocol='Exploratory ablation, 1000 rows, 2 independent processes/variant, reverse order on second pass; 2 warmups and 7 measured rounds, identical kernel limits; not confirmation evidence')
    atomic_json(directory/'ablation.json',report)
    print('Ablation: '+str(directory),flush=True)
    for label,source in variants.items():
        file=directory/(label+'.mjs');file.write_text(source,encoding='utf-8')
        output=directory/('build-'+label)
        supervisor=contained([node,'--max-old-space-size=192',str(here/'build.mjs'),'--build-only','--runtime-source',str(file)],output)
        if not supervisor['passed']: raise RuntimeError('Variant build failed: '+str(output))
        built=json.loads((output/'worker.log').read_text(encoding='utf-8').strip().splitlines()[-1])
        report['fixtures'][label]=built['directory']
        atomic_json(directory/'ablation.json',report)
        print('Built '+label,flush=True)
    order=['baseline','text-only','cleanup-only','combined-no-batch','react','svelte']
    for repetition in range(2):
        for label in order if repetition==0 else list(reversed(order)):
            output=directory/('case-'+str(repetition)+'-'+label)
            framework=label if label in ['react','svelte'] else 'elnor'
            supervisor=contained([node,'--max-old-space-size=192',str(here/'diagnostic-worker.mjs'),report['fixtures'][label],str(output),framework,'1000','7',str(playwright),'runtime'],output)
            result=json.loads((output/'result.json').read_text(encoding='utf-8')) if (output/'result.json').exists() else {}
            passed=supervisor['passed'] and result.get('passed') is True
            report['cases'].append(dict(label=label,repeat=repetition,directory=str(output),passed=passed))
            atomic_json(directory/'ablation.json',report)
            print(label+' repeat='+str(repetition)+' '+('passed' if passed else 'FAILED'),flush=True)
            if not passed: raise RuntimeError('Ablation stopped at '+str(output))
    report['passed']=True;atomic_json(directory/'ablation.json',report)


if __name__=='__main__': main()
