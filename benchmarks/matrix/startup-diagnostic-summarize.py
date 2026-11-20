"""Verify bounded instrumented startup traces; never create a timing ranking."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from urllib.parse import urlsplit

WORKLOADS = ['counter','form','composition','localized']
read = lambda path: json.loads(path.read_text(encoding='utf-8'))
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def union_ms(intervals):
    merged = []
    for start,end in sorted(intervals):
        assert math.isfinite(start) and math.isfinite(end) and end >= start
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1],end)
        else:
            merged.append([start,end])
    return sum(end-start for start,end in merged)


def phases(sample):
    value = sample['observed']
    assert value['initialVisibility'] == value['readyVisibility'] == 'visible'
    assert all(event['state'] == 'visible' and 0 <= event['at'] <= value['readyObservedAt'] for event in value['visibilityEvents'])
    for name in ['initialAt','installedAt','rootObservedAt','readyResolvedAt','readyObservedAt','domContentLoadedAt','loadAt']:
        assert isinstance(value[name],(int,float)) and math.isfinite(value[name]) and 0 <= value[name] <= value['readyObservedAt']
    assert value['initialAt'] <= value['installedAt'] <= value['readyResolvedAt'] <= value['readyObservedAt']
    assert value['rootObservedAt'] <= value['readyResolvedAt']
    assert len(value['navigation']) == 1
    navigation = value['navigation'][0]
    assert navigation['entryType'] == 'navigation' and navigation['startTime'] == 0
    assert 0 <= navigation['fetchStart'] <= navigation['requestStart'] <= navigation['responseStart'] <= navigation['responseEnd'] <= value['installedAt']
    assert len(value['frames']) <= 128
    frames = []
    for frame in value['frames']:
        assert math.isfinite(frame['requestedAt']) and 0 <= frame['requestedAt'] <= value['readyObservedAt']
        assert isinstance(frame['rootPresent'],bool) and len(frame['source']) <= 2048
        if frame['firedAt'] is not None:
            assert frame['requestedAt'] <= frame['firedAt'] <= frame['finishedAt'] <= value['readyObservedAt']
        if frame['cancelledAt'] is not None:
            assert frame['requestedAt'] <= frame['cancelledAt'] <= value['readyObservedAt']
        if '/driver.mjs' in frame['source'] and frame['firedAt'] is not None:
            frames.append(frame)
    assert frames, 'No driver frame observation'
    resources = value['resources']
    driver = [entry for entry in resources if urlsplit(entry['name']).path == '/driver.mjs']
    application = [entry for entry in resources if urlsplit(entry['name']).path.endswith('-'+sample['framework']+'.mjs') and not entry['name'].endswith('/driver.mjs')]
    assert len(driver) == len(application) == 1
    for entry in driver+application:
        assert entry['entryType'] == 'resource' and entry['initiatorType'] == 'script'
        assert 0 <= entry['startTime'] <= entry['responseEnd'] <= value['installedAt']
    return dict(htmlPreRequestMs=navigation['requestStart']-navigation['fetchStart'],htmlRequestToEndMs=navigation['responseEnd']-navigation['requestStart'],
        htmlResponseEndMs=navigation['responseEnd'],applicationResponseEndMs=application[0]['responseEnd'],driverRequestStartMs=driver[0]['startTime'],driverResponseEndMs=driver[0]['responseEnd'],
        dependencyGapMs=driver[0]['startTime']-application[0]['responseEnd'],installedAtMs=value['installedAt'],rootObservedAtMs=value['rootObservedAt'],readyAtMs=value['readyObservedAt'],
        afterModulesToInstalledMs=value['installedAt']-max(application[0]['responseEnd'],driver[0]['responseEnd']),
        driverFrameCount=len(frames),driverFrameWaitUnionMs=union_ms([(frame['requestedAt'],frame['firedAt']) for frame in frames]),
        rootMissingFrameWaitUnionMs=union_ms([(frame['requestedAt'],frame['firedAt']) for frame in frames if not frame['rootPresent']]),
        rootPresentFrameWaitUnionMs=union_ms([(frame['requestedAt'],frame['firedAt']) for frame in frames if frame['rootPresent']]),
        longestDriverFrameWaitMs=max(frame['firedAt']-frame['requestedAt'] for frame in frames))


def trace_summary(directory,sample):
    witness = sample['trace']
    file = directory / witness['file']
    assert Path(witness['file']).name == witness['file'] and 0 < witness['bytes'] <= 8*1024**2
    assert file.stat().st_size == witness['bytes'] and sha(file) == witness['sha256']
    events = read(file)['traceEvents']
    mains = {str(event['pid'])+':'+str(event['tid']) for event in events if event.get('name') == 'thread_name' and event.get('args',{}).get('name') == 'CrRendererMain'}
    key = witness['renderer']
    assert key in mains
    scoped = [event for event in events if str(event.get('pid'))+':'+str(event.get('tid')) == key]
    marks = {}
    for name in ['init','installed','root-observed','ready-resolved','ready-observed']:
        selected = [event for event in scoped if event.get('name') == 'elnor:startup-diag:'+name]
        assert len(selected) == 1
        marks[name] = selected[0]['ts']
    assert marks['init'] == witness['initTs'] and marks['ready-observed'] == witness['readyTs']
    assert marks['init'] <= marks['installed'] <= marks['ready-resolved'] <= marks['ready-observed']
    assert marks['root-observed'] <= marks['ready-resolved']
    target = sample['observed']['navigation'][0]['name']
    navigation = [event for event in scoped if event.get('name') == 'navigationStart' and event.get('args',{}).get('data',{}).get('documentLoaderURL') == target]
    assert len(navigation) <= 1
    begin = navigation[0]['ts'] if navigation else marks['init']
    assert begin <= marks['init']
    spans = [event for event in scoped if event.get('ph') == 'X' and event.get('ts',0) >= begin and event['ts']+event.get('dur',0) <= marks['ready-observed']]
    def longest(rows):
        if not rows:
            return None
        event = max(rows,key=lambda value:value.get('dur',0))
        assert event.get('dur',0) >= 0
        if 'tdur' in event:
            assert math.isfinite(event['tdur']) and event['tdur'] >= 0
        return dict(name=event['name'],wallMs=event.get('dur',0)/1000,threadCpuMs=event['tdur']/1000 if 'tdur' in event else None,
                    atAfterTraceAnchorMs=(event['ts']-begin)/1000,beforeInstalled=event['ts']+event.get('dur',0) <= marks['installed'])
    return dict(navigationAnchorFound=bool(navigation),anchor='navigationStart' if navigation else 'document-init',
        marks=marks,longestMainSpan=longest(spans),
        longestAccessibility=longest([event for event in spans if event['name'] == 'LocalFrameView::RunAccessibilitySteps']),
        longestSerializeLoading=longest([event for event in spans if event['name'] == 'SerializeLifecycleStageLoading']),
        traceWindowMs=(marks['ready-observed']-begin)/1000,
        note='Complete enclosed spans only; nested wall/CPU durations are inclusive and are not summed')


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
    assert study['kind'] == 'elnor-startup-phase-diagnostic-study-v1' and study['passed'] and study['instrumented'] and not study['smoke']
    assert study['protocol'] == 'instrumented-startup-phases-v1' and study['diagnosticOnly']
    matrix = read(args.matrix_study / 'summary.json')
    assert matrix['passed'] and matrix['preflightChecks'] == 45
    fixture = Path(study['fixture'])
    manifest = read(fixture / 'manifest.json')
    assert sha(fixture / 'manifest.json') == matrix['manifestSha256'] and fixture.resolve() == Path(matrix['fixture']).resolve()
    for name in ['runtime','compiler']:
        assert sha(fixture / (name+'-source.mjs')) == manifest[name]['sha256']
    for file in manifest['files']:
        assert sha(fixture / 'site' / file['name']) == file['sha256']
    plan = [dict(workload=workload,group=group,order=order,rounds=3) for workload in WORKLOADS for group in ['aa','react','svelte'] for order in [['A','B'],['B','A']]]
    assert study['plan'] == plan and len(study['cases']) == 24
    result = dict(kind='elnor-startup-phase-diagnostic-summary-v1',protocol=study['protocol'],instrumented=True,passed=False,diagnosticOnly=True,
                  study=str(directory),manifestSha256=matrix['manifestSha256'],samples=[],cases=[],sourceHashes={})
    for index,(config,item) in enumerate(zip(plan,study['cases'])):
        output = Path(item['directory'])
        supervisor,raw = read(output / 'supervisor.json'),read(output / 'result.json')
        assert item['passed'] and supervisor['passed'] and supervisor['limitsVerified'] and supervisor['activeProcessesAfterCleanup'] == 0
        limits = supervisor['limits']
        assert limits['cpuPercent'] == 10 and limits['jobCommitBytes'] == 768*1024**2 and limits['maxProcesses'] == 24
        assert limits['timeoutSeconds'] == 45 and limits['idleTimeoutSeconds'] == 12 and limits['minHostFreeMiB'] == 4096 and limits['killOnOwnerClose']
        assert raw['kind'] == 'elnor-startup-phase-diagnostic-case-v1' and raw['instrumented'] and raw['passed'] and raw['diagnosticOnly']
        assert raw['protocol'] == result['protocol'] and raw['config'] == config and raw['manifestSha256'] == result['manifestSha256'] and raw['frameworkVersions'] == manifest['versions']
        if 'browser' not in result:
            result['browser'] = raw['browserVersion']
        assert raw['browserVersion'] == result['browser']
        for name,digest in raw['sourceHashes'].items():
            assert sha(output / name) == digest
        if not result['sourceHashes']:
            result['sourceHashes'] = raw['sourceHashes']
        assert raw['sourceHashes'] == result['sourceHashes'] and len(raw['samples']) == 6
        expected = []
        for repetition in range(3):
            order = list(reversed(config['order'])) if repetition & 1 else config['order']
            expected += [(repetition,label,position) for position,label in enumerate(order)]
        assert [(sample['repetition'],sample['label'],sample['position']) for sample in raw['samples']] == expected
        for sample in raw['samples']:
            framework = 'elnor' if sample['label'] == 'A' or config['group'] == 'aa' else config['group']
            assert sample['framework'] == framework and sample['unmounted'] and sample['schemaSha256'] == matrix['schemas'][config['workload']]['mount']
            assert all(math.isfinite(sample[key]) and sample[key] >= 0 for key in ['wallMs','TaskDurationMs','ScriptDurationMs','LayoutDurationMs','RecalcStyleDurationMs','ThreadTimeMs'])
            result['samples'].append(dict(case=index,workload=config['workload'],group=config['group'],order=config['order'],label=sample['label'],repetition=sample['repetition'],framework=framework,
                instrumentedWallMs=sample['wallMs'],instrumentedTaskCpuMs=sample['TaskDurationMs'],phases=phases(sample),trace=trace_summary(output,sample),
                traceFile=str(output / sample['trace']['file']),traceSha256=sample['trace']['sha256']))
        result['cases'].append(dict(directory=str(output),resultSha256=sha(output / 'result.json'),supervisorSha256=sha(output / 'supervisor.json')))
        print(f'Validated {index+1}/24 diagnostic cases',flush=True)
    assert len(result['samples']) == 144
    result['passed'] = True
    result['readerSha256'] = sha(Path(__file__))
    if not args.stdout_only:
        if (directory / 'summary.json').exists():
            raise RuntimeError('Summary already exists; use --stdout-only')
        (directory / 'summary-reader.py').write_bytes(Path(__file__).read_bytes())
        (directory / 'summary.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    if args.report:
        selected = [max([sample for sample in result['samples'] if sample['case'] == index],key=lambda value:value['instrumentedWallMs']) for index in range(24)]
        lines = ['# Startup phase diagnostics', '',
            '**Investigated: 2026-11-12.** This instrumented diagnostic decomposes',
            'startup observations across all four expanded workloads. Application,',
            'driver, runtime and compiler bytes are unchanged. It is not a normal',
            'timing cohort, a framework ranking or a new core optimization.', '',
            f'Study `{directory.name}` under `startup-diagnostics/` in',
            '`elnor/.elnor/mvp/framework-comparison/`. It completes 24 browser',
            'cases and **144 instrumented fresh-context navigations/traces**, with',
            'A/A, React and Svelte, both orders, three starts per label, no dropped',
            'first samples. The separate [normal startup cohort](CONTROLLED-STARTUP.md)',
            'and [expanded matrix](EXPANDED-PERFORMANCE-MATRIX.md) retain their own',
            'timings; none of those values are replaced or pooled with this study.', '',
            '## What is observed', '',
            '- Navigation/Resource Timing landmarks for HTML and the module graph.',
            '- An installation accessor observes the shared driver interface; it',
            '  does not timestamp only framework compilation or rendering.',
            '- A MutationObserver records first root observation, an upper-bound',
            '  observation rather than an exact DOM insertion or paint timestamp.',
            '- Wrapped request/cancelAnimationFrame preserve callbacks/receiver/IDs',
            '  while recording request/fire/end times and caller stacks. Driver',
            '  wait intervals are merged as a union, never blindly summed when',
            '  overlapping. Root presence is sampled at request time.',
            '- Separate user-timing marks identify the active renderer and phase',
            '  boundaries in bounded Chrome traces. Readiness, DOM/schema, visible',
            '  states and unmount checks stay in force.', '',
            'The wrappers, observers, stack capture and tracing perturb execution.',
            'The standard APIs define observations, not a cause for every delay:',
            '[Navigation Timing](https://www.w3.org/TR/navigation-timing-2/),',
            '[animation frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames).', '',
            '## Phase landmarks: largest wall observation in each declared case', '',
            'Selection is explicit: one of six instrumented starts per case, chosen',
            'by maximum host wall. All 144 raw samples and traces remain retained.',
            'These are examples for localization, not performance scores. Page',
            'landmarks are ms on that document clock; they are not disjoint phases',
            'to add together or direct host-wall equivalents.', '',
            '| Case | Family / group / seed | Label:rep | Host wall | HTML pre-request | HTML end | App module end | Driver request | Installed | Root observed | Ready | Driver frame wait union |',
            '|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
        for sample in selected:
            p = sample['phases']
            lines.append(f'| {sample["case"]} | {sample["workload"]} / {sample["group"]} / {"".join(sample["order"])} | {sample["label"]}:{sample["repetition"]} | {sample["instrumentedWallMs"]:.3f} | {p["htmlPreRequestMs"]:.3f} | {p["htmlResponseEndMs"]:.3f} | {p["applicationResponseEndMs"]:.3f} | {p["driverRequestStartMs"]:.3f} | {p["installedAtMs"]:.3f} | {p["rootObservedAtMs"]:.3f} | {p["readyAtMs"]:.3f} | {p["driverFrameWaitUnionMs"]:.3f} |')
        lines += ['', 'HTML pre-request is requestStart − fetchStart, not server execution',
            'time. Driver request is the Resource Timing startTime of the shared',
            'module fetch; its gap after the app response can be signed if fetches',
            'overlap. Installation includes the sync startup path; it is not a pure',
            'module compile metric. Frame wait is wall wait, not callback CPU.', '',
            '## Trace witnesses for the same selected starts', '',
            'AX is LocalFrameView::RunAccessibilitySteps; Serialize is',
            'SerializeLifecycleStageLoading. Each cell describes its longest single',
            'complete enclosed span, wall / thread CPU ms. Missing thread duration',
            'is not treated as zero. Nested inclusive durations must not be added.',
            'Before-installed is determined using trace marks on the same clock.', '',
            '| Case | AX wall / CPU | AX before installed | Serialize wall / CPU | Longest complete main-thread span |',
            '|---:|---|---|---|---|']
        def cell(value):
            if value is None:
                return 'not observed'
            cpu = 'unavailable' if value['threadCpuMs'] is None else f'{value["threadCpuMs"]:.3f}'
            return f'{value["wallMs"]:.3f} / {cpu}'
        for sample in selected:
            t = sample['trace'];ax=t['longestAccessibility'];longest=t['longestMainSpan']
            lines.append(f'| {sample["case"]} | {cell(ax)} | {ax["beforeInstalled"] if ax else "n/a"} | {cell(t["longestSerializeLoading"])} | {longest["name"] if longest else "not observed"}: {cell(longest)} |')
        lines += ['', 'Trace scope uses the matching navigationStart when available, otherwise',
            'the document-init mark; that choice is recorded per sample. Only fully',
            'enclosed complete spans are summarized. Events before document init',
            'cannot be assigned to application JS merely from their wall duration.',
            'Long wall with short thread CPU does not identify whether a thread',
            'waited, was descheduled or was blocked by another component.', '',
            '## Verification and limits', '',
            'The reader reopens every raw trace, verifies its checksum/8 MiB bound,',
            'renderer and marks, and validates all sources/assets/versions, schemas,',
            'sample order, page timelines, frame histories and cleanup. No cause is',
            'inferred solely from a named span. These traces cannot retroactively',
            'explain every delay in an earlier uninstrumented navigation.', '',
            'Every heavy case remains serial, CPU 10%, 768 MiB job commit, at most',
            '24 processes, 45-second wall/12-second progress deadlines, 4 GiB minimum',
            'host free memory, sandboxed headless Edge, GPU disabled and owned-tree',
            'cleanup. All cases report zero remaining owned processes. No accessibility',
            'feature, network policy or resource limit is disabled to improve numbers.', '',
            'Reproduce from the workspace root with the existing Python environment:', '',
            '```powershell',
            f"python elnor/benchmarks/matrix/startup-diagnostic-windows.py elnor/.elnor/mvp/framework-comparison/{fixture.name}",
            f"python elnor/benchmarks/matrix/startup-diagnostic-summarize.py elnor/.elnor/mvp/framework-comparison/startup-diagnostics/{directory.name} --matrix-study {args.matrix_study.as_posix()} --report elnor/docs/mvp/STARTUP-PHASE-DIAGNOSTICS.md",
            '```', '',
            'Fresh runs receive new IDs. Summary creation refuses overwrite;',
            '`--stdout-only` revalidates without replacing retained evidence.', '']
        args.report.write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps(dict(passed=result['passed'],cases=24,instrumentedNavigations=len(result['samples']),instrumented=True),indent=2))


if __name__ == '__main__':
    main()
