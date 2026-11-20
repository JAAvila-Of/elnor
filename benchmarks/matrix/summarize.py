"""Strict read-only evidence validation, then one-time summary/report creation."""
import argparse
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ACTIONS = {'counter':['mount','increment','unmount'], 'form':['mount','edit-one','edit-all','invalid','recover','unmount'],
           'composition':['mount','relay','unmount'], 'localized':['mount','local-update','unmount']}


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stats(values):
    assert values and all(math.isfinite(value) and value >= 0 for value in values)
    return dict(n=len(values), min=min(values), median=median(values), max=max(values))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('study', type=Path)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--stdout-only', action='store_true')
    args = parser.parse_args()
    if args.stdout_only and args.report:
        parser.error('--stdout-only does not write a report')
    directory = args.study.resolve(strict=True)
    study = read(directory / 'study.json')
    assert study['kind'] == 'elnor-expanded-matrix-study-v1' and study['passed'] and study['diagnosticOnly']
    fixture = Path(study['fixture'])
    manifest = read(fixture / 'manifest.json')
    assert manifest['kind'] == 'elnor-expanded-matrix-v1' and manifest['actions'] == ACTIONS
    assert manifest['workloads'] == list(ACTIONS)
    assert manifest['methodology']['warmups'] == 2 and manifest['methodology']['rounds'] == 7 and manifest['methodology']['cycles'] == 8
    assert sha(fixture / 'runtime-source.mjs') == manifest['runtime']['sha256']
    assert sha(fixture / 'compiler-source.mjs') == manifest['compiler']['sha256']
    for name, expected in manifest['sourceHashes'].items():
        assert sha(fixture / 'sources' / name) == expected
    for file in manifest['files']:
        assert sha(fixture / 'site' / file['name']) == file['sha256']
    plan = [dict(mode='preflight', workload=name) for name in ACTIONS]
    plan += [dict(mode='runtime', workload=name, group=group, order=order) for name in ACTIONS
             for group in ['aa','react','svelte'] for order in [['A','B'],['B','A']]]
    plan += [dict(mode='lifecycle', workload=name, framework=framework) for name in ACTIONS for framework in ['elnor','react','svelte']]
    assert study['plan'] == plan and len(study['cases']) == len(plan) == 40
    result = dict(kind='elnor-expanded-matrix-summary-v1', passed=False, diagnosticOnly=True, study=str(directory), fixture=str(fixture),
                  manifestSha256=sha(fixture / 'manifest.json'), runtime=[], startup=[], memory=[], tooling=manifest['tooling'],
                  delivery=[file for file in manifest['files'] if any(file['name'] == name+'-'+framework+'.mjs' for name in ACTIONS for framework in ['elnor','react','svelte'])],
                  schemas={}, sourceHashes={}, preflightChecks=0, actionSamples=0, startupSamples=0, memoryCycles=0, cases=[])
    for config, item in zip(plan, study['cases']):
        output = Path(item['directory'])
        supervisor, raw = read(output / 'supervisor.json'), read(output / 'result.json')
        assert item['passed'] and supervisor['passed'] and supervisor['limitsVerified'] and raw['passed'] and raw['diagnosticOnly']
        assert raw['kind'] == 'elnor-expanded-matrix-case-v1' and raw['config'] == config
        assert supervisor['activeProcessesAfterCleanup'] == 0
        limits = supervisor['limits']
        assert limits['cpuPercent'] == 10 and limits['jobCommitBytes'] == 768 * 1024**2
        assert limits['maxProcesses'] == 24 and limits['timeoutSeconds'] == 45 and limits['idleTimeoutSeconds'] == 12
        assert limits['minHostFreeMiB'] == 4096 and limits['killOnOwnerClose']
        assert raw['manifestSha256'] == result['manifestSha256'] and raw['frameworkVersions'] == manifest['versions']
        if 'browser' not in result:
            result['browser'] = raw['browserVersion']
        assert raw['browserVersion'] == result['browser']
        for name, expected in raw['sourceHashes'].items():
            assert sha(output / name) == expected == manifest['sourceHashes'][name]
        if not result['sourceHashes']:
            result['sourceHashes'] = raw['sourceHashes']
        assert result['sourceHashes'] == raw['sourceHashes']
        workload = config['workload']
        if config['mode'] == 'preflight':
            assert len(raw['samples']) == len(ACTIONS[workload])*3
            assert [(sample['framework'],sample['action']) for sample in raw['samples']] == [(framework,action) for framework in ['elnor','react','svelte'] for action in ACTIONS[workload]]
            for sample in raw['samples']:
                assert sample['schemaSha256'] == raw['schemas'][sample['action']]
                assert sample['mounted'] == (sample['action'] != 'unmount')
                if sample['mounted']:
                    assert sample['identity']
            result['schemas'][workload] = raw['schemas']
            result['preflightChecks'] += len(raw['samples'])
        elif config['mode'] == 'runtime':
            assert not raw['samples']
            pair = dict(workload=workload, group=config['group'], order=config['order'], variants={}, afterTiming={})
            for label in ['A','B']:
                samples = raw['variants'][label]
                assert len(samples) == 7*len(ACTIONS[workload])
                assert [(sample['round'],sample['action']) for sample in samples] == [(round_number,action) for round_number in range(7) for action in ACTIONS[workload]]
                framework = 'elnor' if label == 'A' or config['group'] == 'aa' else config['group']
                for sample in samples:
                    action = sample['action']
                    order = list(reversed(config['order'])) if (sample['round']+ACTIONS[workload].index(action)) & 1 else config['order']
                    assert sample['framework'] == framework and sample['position'] == order.index(label) and sample['visibility'] == 'visible'
                    assert datetime.fromisoformat(sample['ended']) >= datetime.fromisoformat(sample['began'])
                    assert sample['mounted'] == (action != 'unmount')
                    if sample['mounted']:
                        assert sample['identity']
                pair['variants'][label] = {action:{metric:stats([sample[metric] for sample in samples if sample['action'] == action])
                    for metric in ['TaskDurationMs','ScriptDurationMs','LayoutDurationMs','RecalcStyleDurationMs','ThreadTimeMs','frameWindowMs']} for action in ACTIONS[workload]}
                observed = raw['afterTiming'][label]
                assert observed['action'] == ACTIONS[workload][1] and 0 < observed['traceBytes'] <= 8*1024*1024
                assert observed['schemaSha256'] == result['schemas'][workload][observed['action']]
                events = observed['trace']['traceEvents']
                mains = {str(event['pid'])+':'+str(event['tid']) for event in events if event['name'] == 'thread_name' and event.get('args',{}).get('name') == 'CrRendererMain'}
                active = {str(event['pid'])+':'+str(event['tid']) for event in events if event['name'] == 'FunctionCall' and event.get('args',{}).get('data',{}).get('url','').endswith('/'+workload+'-'+framework+'.mjs')} & mains
                assert len(active) == 1
                ax = [event for event in events if event.get('ph') == 'X' and event['name'] == 'LocalFrameView::RunAccessibilitySteps' and str(event['pid'])+':'+str(event['tid']) in active]
                assert len(ax) == observed['accessibilityEvents']
                assert sum(event.get('tdur',0) for event in ax)/1000 == observed['accessibilityThreadMs']
                pair['afterTiming'][label] = {key:value for key,value in observed.items() if key != 'trace'}
                result['actionSamples'] += len(samples)
            assert pair['afterTiming']['A']['schemaSha256'] == pair['afterTiming']['B']['schemaSha256']
            result['runtime'].append(pair)
        else:
            assert len(raw['startup']) == 3 and [sample['repetition'] for sample in raw['startup']] == [0,1,2]
            row = dict(workload=workload, framework=config['framework'])
            result['startup'].append({**row, 'samples':raw['startup'], 'metrics':{metric:stats([sample[metric] for sample in raw['startup']]) for metric in ['wallMs','TaskDurationMs','ScriptDurationMs','ThreadTimeMs']}})
            memory = raw['memory']
            assert len(memory['cycles']) == 8 and [sample['cycle'] for sample in memory['cycles']] == list(range(8))
            for sample in [memory['baselineUnmounted'],memory['mounted'],*memory['cycles']]:
                assert all(isinstance(sample[key],int) and sample[key] >= 0 for key in ['heapUsedBytes','domNodes','documents','listeners'])
            result['memory'].append({**row,**memory})
            result['startupSamples'] += 3
            result['memoryCycles'] += 8
        result['cases'].append(dict(directory=str(output),resultSha256=sha(output / 'result.json'),supervisorSha256=sha(output / 'supervisor.json')))
    assert result['preflightChecks'] == 45 and result['actionSamples'] == 1260 and result['startupSamples'] == 36 and result['memoryCycles'] == 96
    assert len(result['tooling']) == 12 and len(result['delivery']) == 12
    for name in ACTIONS:
        assert [row['repetition'] for row in result['tooling'] if row['workload'] == name] == [0,1,2]
    result['passed'] = True
    result['readerSha256'] = sha(Path(__file__))
    if not args.stdout_only:
        if (directory / 'summary.json').exists():
            raise RuntimeError('Summary already exists; use --stdout-only')
        (directory / 'summary-reader.py').write_bytes(Path(__file__).read_bytes())
        (directory / 'summary.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    if args.report:
        lines = ['# Expanded performance baseline', '', '**Measured: 2026-11-12.** Four new synthetic workload families complement the',
            'existing 100/1000-row list studies. This is broader coverage, not a',
            'representative product application, universal ranking or parity verdict.', '',
            f'Frozen fixture: `{fixture.name}`. Complete study: `{directory.name}` under',
            '`elnor/.elnor/mvp/framework-comparison/matrix-studies/`.', '',
            '## Coverage and decision boundary', '',
            '| Family | Workload |', '|---|---|',
            '| Small | One counter with local state |',
            '| Form | Six fields, derived summary/validity, conditional validation and recovery |',
            '| Composition | Six prop/event relay layers plus named/default slots |',
            '| Localized | 24 independent child states; update the middle one, preserve other values/identities |', '',
            'Each family compares Elnor with itself (A/A), React and Svelte in both',
            'initial orders, alternating active isolated contexts per action/round.',
            'Two warmups precede seven samples per action. Mount, updates and unmount',
            'are distinct operations. Every operation starts from a prepared fixture.',
            'The shared driver, expected-state and schema/identity checks are retained.',
            'Input value attributes are normalized to the real value property; this',
            'is the sole reflected-attribute exception; other structure and actual',
            'input values must match.', '',
            'Evaluate future changes across these families **and** the existing list',
            'matrix, delivery, lifecycle, tooling and DX/correctness. No weighted',
            'aggregate score or numeric tolerance is invented here. Winning one list',
            'operation is insufficient evidence for a global core optimization.', '',
            '## Paired runtime CPU', '',
            'Renderer TaskDuration medians in ms, threadTicks. Each table value is',
            'a seven-sample median. A is Elnor; B is the named framework (also Elnor',
            'for A/A). Positive delta means B used more CPU. Compare within a pair;',
            'different control groups run in different owned browsers.', '']
        for group in ['aa','react','svelte']:
            lines += ['### ' + group, '', '| Family | Action | AB: A | AB: B | Delta | BA: A | BA: B | Delta |', '|---|---|---:|---:|---:|---:|---:|---:|']
            for name in ACTIONS:
                ab,ba = [row for row in result['runtime'] if row['group'] == group and row['workload'] == name]
                for action in ACTIONS[name]:
                    a,b,c,d = [row['variants'][label][action]['TaskDurationMs']['median'] for row,label in [(ab,'A'),(ab,'B'),(ba,'A'),(ba,'B')]]
                    assert a > 0 and c > 0
                    lines.append(f'| {name} | {action} | {a:.3f} | {b:.3f} | {100*(b/a-1):+.2f}% | {c:.3f} | {d:.3f} | {100*(d/c-1):+.2f}% |')
            lines.append('')
        lines += ['## Startup and lifecycle observations', '',
            'Three fresh-context local navigations per entry, in a fresh owned',
            'browser per lifecycle case. Includes local HTTP, scripts, mount and',
            'readiness; browser/OS caches are not claimed cold. Wall and renderer CPU',
            'are separate; neither is independent human input-to-pixel latency.', '',
            '| Family | Framework | Startup wall median ms | Startup CPU median ms |', '|---|---|---:|---:|']
        for row in result['startup']:
            lines.append(f'| {row["workload"]} | {row["framework"]} | {row["metrics"]["wallMs"]["median"]:.3f} | {row["metrics"]["TaskDurationMs"]["median"]:.3f} |')
        lines += ['', 'Post-GC memory in a separate context. Baseline is modules loaded and',
            'initial app unmounted; final follows eight interacted mount/unmount',
            'cycles. Driver references are released. Counts include framework/browser',
            'resources: deltas are not peak memory or general leak proof.', '',
            '| Family | Framework | Heap baseline / mounted / final bytes | DOM baseline / final | Listeners baseline / final |',
            '|---|---|---|---|---|']
        for row in result['memory']:
            a,m,b = row['baselineUnmounted'],row['mounted'],row['cycles'][-1]
            lines.append(f'| {row["workload"]} | {row["framework"]} | {a["heapUsedBytes"]} / {m["heapUsedBytes"]} / {b["heapUsedBytes"]} | {a["domNodes"]} / {b["domNodes"]} | {a["listeners"]} / {b["listeners"]} |')
        lines += ['', '## Application delivery', '', 'Production entry bundles; shared driver/CSS are separate. Not standalone',
            'runtime package sizes or general application download budgets.', '', '| Entry | Raw bytes | Gzip bytes | Brotli bytes |', '|---|---:|---:|---:|']
        for row in result['delivery']:
            lines.append(f'| {row["name"]} | {row["rawBytes"]} | {row["gzipBytes"]} | {row["brotliBytes"]} |')
        lines += ['', '## Tooling, separately', '',
            'Checked Surface project build plus owned publication, three calls per',
            'family in one sequential shared Node process. First-per-fixture is not',
            'cold CLI startup; repeated builds are not incremental HMR. CPU is Node',
            'process CPU, not renderer threadTicks. No competitor tooling comparison',
            'is inferred. Saved-error recovery and editor/human DX still need their',
            'separate evidence; the historical [development measurements](DEVELOPMENT-MEASUREMENTS.md)',
            'remain labeled as such.', '', '| Family | Call | Wall ms | Process CPU ms |', '|---|---:|---:|---:|']
        for row in result['tooling']:
            lines.append(f'| {row["workload"]} | {row["repetition"]} | {row["wallMs"]:.3f} | {row["cpuMs"]:.3f} |')
        lines += ['', '## Verification and limits', '',
            'The complete study passes **40 browser phases**, **45 preflight checks**,',
            '**1260 timed action samples**, **36 startup samples** and **96 memory',
            'cycles**. Sources/assets, versions, schemas, action order/visibility,',
            'clock fields, traces and cleanup are independently checked by the summary',
            'reader. Frame-window distributions and separate post-timing AX traces',
            'remain in raw/summary JSON. AX duration is inclusive and not subtracted',
            'from total CPU; a later trace cannot certify every earlier sample.', '',
            'All heavy work is serial, with CPU 10%, 768 MiB job commit, 24 processes,',
            '4 GiB minimum free host memory, owned-tree cleanup and sandboxed headless',
            'Edge with GPU disabled. Browser limits remain 45 seconds wall/12 seconds',
            'progress; build has 60 seconds. Every completed phase reports zero owned',
            'processes. Host load is not isolated or attributed to a single cause.', '',
            'Small sample counts and A/A variation limit small-change claims. These',
            'synthetic synchronous workloads do not cover network data, large apps,',
            'general async error recovery, all Surface syntax, device/browser matrices,',
            'full editor latency or independent human DX. No core source optimization',
            'or Rust migration is made by expanding the suite.', '',
            'Protocol and commands: [expanded harness](../../benchmarks/matrix/README.md).',
            'Existing [current list comparison](CURRENT-CORE-COMPARISON.md) and',
            '[performance target](PERFORMANCE-TARGET.md) remain separate evidence.', '']
        args.report.write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps({key:result[key] for key in ['passed','preflightChecks','actionSamples','startupSamples','memoryCycles']},indent=2))


if __name__ == '__main__':
    main()
