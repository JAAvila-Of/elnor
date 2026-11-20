"""Validate foreground-ready-v2 without pooling it with provisional startup."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
from statistics import median

WORKLOADS = ['counter','form','composition','localized']
METRICS = ['wallMs','TaskDurationMs','ScriptDurationMs','LayoutDurationMs','RecalcStyleDurationMs','ThreadTimeMs']
read = lambda path: json.loads(path.read_text(encoding='utf-8'))
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def stats(values):
    assert len(values) == 7 and all(math.isfinite(value) and value >= 0 for value in values)
    return dict(n=7,min=min(values),median=median(values),max=max(values))


def verify_raw(raw, config, manifest, expected_schema):
    """Shared real-record validation used by the negative metadata checks."""
    assert raw['kind'] == 'elnor-foreground-startup-case-v2' and raw['passed'] and raw['diagnosticOnly']
    assert raw['protocol'] == 'foreground-ready-v2' and raw['metricTimeDomain'] == 'threadTicks'
    assert raw['config'] == config and raw['frameworkVersions'] == manifest['versions']
    assert config['rounds'] == 7 and len(raw['samples']) == 14
    assert config['workload'] in WORKLOADS and config['group'] in ['aa','react','svelte'] and config['order'] in [['A','B'],['B','A']]
    expected_order = []
    for repetition in range(7):
        order = list(reversed(config['order'])) if repetition & 1 else config['order']
        expected_order += [(repetition,label,position) for position,label in enumerate(order)]
    assert [(sample['repetition'],sample['label'],sample['position']) for sample in raw['samples']] == expected_order
    for sample in raw['samples']:
        framework = 'elnor' if sample['label'] == 'A' or config['group'] == 'aa' else config['group']
        assert sample['framework'] == framework and sample['unmounted']
        assert sample['beforeNavigationVisibility'] == sample['initialVisibility'] == sample['readyVisibility'] == 'visible'
        assert math.isfinite(sample['readyAt']) and sample['readyAt'] >= 0
        assert all(event['state'] == 'visible' and math.isfinite(event['at']) and 0 <= event['at'] <= sample['readyAt'] for event in sample['visibilityEvents'])
        assert [event['at'] for event in sample['visibilityEvents']] == sorted(event['at'] for event in sample['visibilityEvents'])
        assert sample['schemaSha256'] == expected_schema
        assert datetime.fromisoformat(sample['ended']) >= datetime.fromisoformat(sample['began'])
        assert all(math.isfinite(sample[key]) and sample[key] >= 0 for key in METRICS)
    return {label:{metric:stats([sample[metric] for sample in raw['samples'] if sample['label'] == label]) for metric in METRICS} for label in ['A','B']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('study',type=Path)
    parser.add_argument('--matrix-study',type=Path,required=True)
    parser.add_argument('--report',type=Path)
    parser.add_argument('--stdout-only',action='store_true')
    args = parser.parse_args()
    if args.stdout_only and args.report:
        parser.error('--stdout-only does not write a report')
    directory = args.study.resolve(strict=True)
    study = read(directory / 'study.json')
    assert study['kind'] == 'elnor-foreground-startup-study-v2' and study['protocol'] == 'foreground-ready-v2' and study['passed'] and study['diagnosticOnly']
    matrix = read(args.matrix_study / 'summary.json')
    assert matrix['passed'] and matrix['kind'] == 'elnor-expanded-matrix-summary-v1' and matrix['preflightChecks'] == 45
    fixture = Path(study['fixture'])
    assert fixture.resolve() == Path(matrix['fixture']).resolve()
    manifest = read(fixture / 'manifest.json')
    assert manifest['kind'] == 'elnor-expanded-matrix-v1' and manifest['workloads'] == WORKLOADS
    assert sha(fixture / 'manifest.json') == matrix['manifestSha256']
    for name in ['runtime','compiler']:
        assert sha(fixture / (name+'-source.mjs')) == manifest[name]['sha256']
    for file in manifest['files']:
        assert Path(file['name']).name == file['name'] and sha(fixture / 'site' / file['name']) == file['sha256']
    plan = [dict(workload=workload,group=group,order=order,rounds=7) for workload in WORKLOADS for group in ['aa','react','svelte'] for order in [['A','B'],['B','A']]]
    assert study['plan'] == plan and len(study['cases']) == 24
    result = dict(kind='elnor-foreground-startup-summary-v2',protocol='foreground-ready-v2',passed=False,diagnosticOnly=True,
                  study=str(directory),fixture=str(fixture),manifestSha256=matrix['manifestSha256'],
                  matrixSummarySha256=sha(args.matrix_study / 'summary.json'),pairs=[],samples=0,cases=[],sourceHashes={})
    for config,item in zip(plan,study['cases']):
        output = Path(item['directory'])
        supervisor,raw = read(output / 'supervisor.json'),read(output / 'result.json')
        assert item['passed'] and supervisor['passed'] and supervisor['limitsVerified'] and supervisor['activeProcessesAfterCleanup'] == 0
        limits = supervisor['limits']
        assert limits['cpuPercent'] == 10 and limits['jobCommitBytes'] == 768*1024**2 and limits['maxProcesses'] == 24
        assert limits['timeoutSeconds'] == 45 and limits['idleTimeoutSeconds'] == 12 and limits['minHostFreeMiB'] == 4096 and limits['killOnOwnerClose']
        assert raw['manifestSha256'] == result['manifestSha256']
        if 'browser' not in result:
            result['browser'] = raw['browserVersion']
            result['dateUTC'] = datetime.fromtimestamp(supervisor['startedAt'],timezone.utc).date().isoformat()
        assert raw['browserVersion'] == result['browser']
        for name,digest in raw['sourceHashes'].items():
            assert sha(output / name) == digest
        if not result['sourceHashes']:
            result['sourceHashes'] = raw['sourceHashes']
        assert raw['sourceHashes'] == result['sourceHashes']
        values = verify_raw(raw,config,manifest,matrix['schemas'][config['workload']]['mount'])
        result['pairs'].append({**config,'variants':values,'firstPerLabel':{label:next(sample for sample in raw['samples'] if sample['label'] == label) for label in ['A','B']}})
        result['samples'] += len(raw['samples'])
        result['cases'].append(dict(directory=str(output),resultSha256=sha(output / 'result.json'),supervisorSha256=sha(output / 'supervisor.json')))
    assert result['samples'] == 336
    result['passed'] = True
    result['readerSha256'] = sha(Path(__file__))
    if not args.stdout_only:
        if (directory / 'summary.json').exists():
            raise RuntimeError('Summary already exists; use --stdout-only')
        (directory / 'summary-reader.py').write_bytes(Path(__file__).read_bytes())
        (directory / 'summary.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    if args.report:
        lines = ['# Controlled startup across the expanded matrix', '',
            f'**Measured (UTC): {result["dateUTC"]}.** Protocol `foreground-ready-v2`',
            'uses the exact application/driver bundles from the',
            '[expanded matrix](EXPANDED-PERFORMANCE-MATRIX.md). The compiler/runtime',
            'remain unchanged. Earlier startup observations are preserved as',
            'provisional; they are not pooled with this cohort or rewritten.', '',
            f'Study `{directory.name}` under `startup-studies/`; frozen fixture',
            f'`{fixture.name}` under `elnor/.elnor/mvp/framework-comparison/`.',
            f'Controls: React {manifest["versions"]["react"]}, Svelte {manifest["versions"]["svelte"]},',
            f'headless Edge {result["browser"]}.', '',
            '## Protocol and boundaries', '',
            'Four workloads (counter, six-field form, six-layer props/events/slots,',
            '24 independent child states), three pair groups (Elnor A/A, React,',
            'Svelte), and two initial orders produce **24 fresh browser cases**.',
            'Every label performs seven fresh-context navigations; initial label',
            'order alternates per repetition. All **336 startups** are retained,',
            'including each first navigation. No warmup sample is discarded.', '',
            'Before each navigation, the tab is activated inside the headless',
            'browser and its visibility is checked. An initialization observer',
            'records the new document\'s initial visibility and visibility changes.',
            'Initial, intermediate and ready states must remain visible. A hidden',
            'observation fails the case rather than being filtered from its samples.',
            'This is browser active-page control, not an OS foreground/display test.', '',
            'After module load, the collector directly awaits the frozen driver\'s',
            'ready promise, without the earlier additional rAF polling gate. Host',
            'wall ends when that result arrives, before reading post-ready CPU',
            'metrics. Renderer CPU uses a separate Performance metrics bracket',
            'with threadTicks and includes its protocol-boundary work. The ready',
            'promise waits for the application root and two animation frames; this',
            'is not first contentful paint, input-to-pixel or presented-pixel latency.', '',
            'Visibility observation, readiness waiting and the wall stop boundary',
            'all change from the provisional collector. A difference between the',
            'two cohorts cannot be attributed solely to visibility or to faster',
            'framework code. The application bytes did not change.', '',
            'Requests use the same local loopback server, CSP and raw production',
            'assets with no-store headers. Driver/CSS are shared. Fresh contexts are',
            'not cold OS/filesystem/browser caches; later contexts may benefit from',
            'process-level caches. Both orders and A/A remain visible. Successful',
            'initial DOM/value schema and unmount cleanup are checked outside timing.', '',
            '## Paired startup observations', '',
            'Seven-sample medians in ms. A is Elnor, B is the named framework (also',
            'Elnor for A/A). Positive delta means B uses more time. Compare within',
            'each pair; control groups use different browser processes. Total CPU',
            'includes browser work and no accessibility cost is subtracted.', '']
        aa_deltas = {metric:[] for metric in ['wallMs','TaskDurationMs']}
        for group in ['aa','react','svelte']:
            lines += ['### '+group, '', '| Family | Metric | AB: A | AB: B | Delta | BA: A | BA: B | Delta |', '|---|---|---:|---:|---:|---:|---:|---:|']
            for workload in WORKLOADS:
                ab,ba = [pair for pair in result['pairs'] if pair['group'] == group and pair['workload'] == workload]
                for metric in ['wallMs','TaskDurationMs']:
                    a,b,c,d = [pair['variants'][label][metric]['median'] for pair,label in [(ab,'A'),(ab,'B'),(ba,'A'),(ba,'B')]]
                    assert a > 0 and c > 0
                    if group == 'aa':
                        aa_deltas[metric] += [100*(b/a-1),100*(d/c-1)]
                    lines.append(f'| {workload} | {"wall" if metric == "wallMs" else "renderer CPU"} | {a:.3f} | {b:.3f} | {100*(b/a-1):+.2f}% | {c:.3f} | {d:.3f} | {100*(d/c-1):+.2f}% |')
            lines.append('')
        lines += ['## Interpretation and limits', '',
            f'Identical-code A/A differences span {min(aa_deltas["wallMs"]):+.2f}% to {max(aa_deltas["wallMs"]):+.2f}%',
            f'in wall medians and {min(aa_deltas["TaskDurationMs"]):+.2f}% to {max(aa_deltas["TaskDurationMs"]):+.2f}%',
            'in CPU medians. These are observed variations, not acceptance bands,',
            'significance tests or proof that every larger gap is causal. No global',
            'framework score or product-parity verdict is supplied. Keep per-family',
            'differences, conflicting orders, sample ranges and first samples visible.', '',
            'This fixes a documented observation/control gap in the startup collector.',
            'It is not a framework speedup. Host load, capped CPU and GPU-disabled',
            'headless operation still constrain conclusions; no old delay is assigned',
            'a cause. Real applications, devices, browser versions, production network',
            'delivery and independent human DX need their separate evidence.', '',
            '## Verification and reproduction', '',
            'The reader checks all 24 declared cases, hashes of every served asset',
            'and frozen collector, the original matrix schema, versions, sample',
            'order/count, visibility histories, clock fields, timestamps and cleanup.',
            'All heavy cases preserve CPU 10%, 768 MiB job commit, 24 processes,',
            '45-second wall/12-second progress deadlines, 4 GiB minimum free host',
            'memory, sandboxed headless Edge and owned-tree cleanup. Every case',
            'reports zero remaining owned processes.', '',
            'From the workspace root using the existing Python environment:', '',
            '```powershell',
            f"python elnor/benchmarks/matrix/startup-windows.py elnor/.elnor/mvp/framework-comparison/{fixture.name}",
            f"python elnor/benchmarks/matrix/startup-summarize.py elnor/.elnor/mvp/framework-comparison/startup-studies/{directory.name} --matrix-study {args.matrix_study.as_posix()} --report elnor/docs/mvp/CONTROLLED-STARTUP.md",
            '```', '',
            'The runner creates new study directories; the displayed IDs retain this',
            'cohort. Summary creation refuses overwrite; `--stdout-only` revalidates',
            'without writing. The old expanded matrix and 550-test functional core',
            'gate remain separate evidence; no full application suite is rerun for',
            'this collector-only change.', '']
        args.report.write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps(dict(passed=result['passed'],cases=24,startupSamples=result['samples'],protocol=result['protocol']),indent=2))


if __name__ == '__main__':
    main()
