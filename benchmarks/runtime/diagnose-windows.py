"""Run ONE browser case with kernel-enforced limits and external observation."""
import argparse
import json
import os
from pathlib import Path
import shutil
import sys
import uuid

from windows_job import contained


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--fixture", type=Path)
    source.add_argument("--build", action="store_true")
    parser.add_argument("--runtime-source", type=Path)
    parser.add_argument("--mode", choices=["runtime", "calibration", "trace", "mutations", "preflight", "profile", "memory", "allocations", "domallocations"], default="runtime")
    parser.add_argument('--time-domain',choices=['timeTicks','threadTicks'],default='timeTicks')
    parser.add_argument("--framework", choices=["elnor", "react", "svelte"], default="elnor")
    parser.add_argument("--size", type=int, choices=[100, 1000], default=100)
    parser.add_argument("--rounds", type=int, choices=[1, 7], default=1)
    parser.add_argument("--playwright", type=Path, default=Path(os.environ["APPDATA"]) / "npm/node_modules/@playwright/cli/node_modules/playwright")
    args = parser.parse_args()
    here = Path(__file__).resolve().parent
    fixture = args.fixture.resolve(strict=True) if args.fixture else None
    node = shutil.which("node")
    if not node or not (args.playwright / "package.json").is_file():
        raise RuntimeError("Existing Node/Playwright installation is required; nothing was launched")
    runs = here.parents[2] / "elnor/.elnor/mvp/framework-comparison/diagnostics"
    runs.mkdir(parents=True, exist_ok=True)
    directory = runs / ("run-" + uuid.uuid4().hex)
    command = [node, "--max-old-space-size=192", str(here / "diagnostic-worker.mjs"),
               str(fixture), str(directory), args.framework, str(args.size), str(args.rounds), str(args.playwright.resolve()), args.mode, args.time_domain]
    if args.runtime_source and not args.build:
        parser.error('--runtime-source requires --build')
    if args.build:
        command = [node, '--max-old-space-size=192', str(here / 'build.mjs'), '--build-only']
        if args.runtime_source:
            command += ['--runtime-source', str(args.runtime_source.resolve(strict=True))]
    print("Diagnostic: " + str(directory), flush=True)
    report = contained(command, directory)
    successful = report["passed"]
    if args.build:
        if successful:
            built = json.loads((directory / 'worker.log').read_text(encoding='utf-8').strip().splitlines()[-1])
            print('Fixture: ' + built['directory'], flush=True)
        print(json.dumps({'passed': successful, 'supervisor': report}, indent=2), flush=True)
        return 0 if successful else 1
    try:
        result = json.loads((directory / "result.json").read_text(encoding="utf-8"))
        successful = successful and result.get("passed") is True and result.get("diagnosticOnly") is True
    except (OSError, ValueError):
        successful = False
    print(json.dumps({"passed": successful, "supervisor": report}, indent=2), flush=True)
    return 0 if successful else 1


if __name__ == "__main__":
    sys.exit(main())
