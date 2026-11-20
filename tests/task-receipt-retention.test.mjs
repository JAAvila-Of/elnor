import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import test from 'node:test';

const source = fileURLToPath(new URL('../examples/persistent-task-desk/', import.meta.url));
const python = process.env.ELNOR_TEST_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');

function run(script) {
  return promisify(execFile)(python, ['-B', '-c', script], {cwd: source, windowsHide: true});
}

test('receipt batches honor the exact cutoff and roll back atomically', async () => {
  await run(`
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
from ledger import Ledger, RECEIPT_RETENTION_NS, RECEIPT_UNAVAILABLE

now = start = 1_800_000_000_000_000_000
scope = 'alice'
task = dict(id='TASK-1', title='Review retention', assignee='', description='',
            priority='normal', status='open')
create = dict(kind='create', task=task)
missing = dict(kind='delete', taskId='missing', expectedRevision=1)
rejected = dict(kind='create', task=dict(task, title='x'))

with TemporaryDirectory(prefix='elnor-receipt-batch-') as directory:
    filename = Path(directory) / 'ledger.sqlite'
    ledger = Ledger(filename, clock=lambda: now)
    epoch = ledger.epoch
    applied = ledger.apply(scope, epoch, 'a', create)
    assert applied['status'] == 'applied'
    assert ledger.apply(scope, epoch, 'b', rejected)['status'] == 'rejected'
    assert ledger.apply('bob', epoch, 'a', create)['status'] == 'applied'
    assert ledger.apply('bob', epoch, 'b', missing)['status'] == 'missing'
    now += 1
    assert ledger.apply(scope, epoch, 'later', missing)['status'] == 'missing'
    assert ledger.apply(scope, epoch, 'early-marker', missing)['status'] == 'missing'
    assert ledger.retire_receipt(scope, epoch, 'early-marker')

    now = start + RECEIPT_RETENTION_NS - 1
    assert ledger.status(scope, epoch, 'a') == applied
    assert ledger.apply(scope, epoch, 'a', create) == applied
    assert ledger.retire_expired_receipts(scope, epoch) == 0
    now += 1
    ledger = Ledger(filename, clock=lambda: now)
    assert ledger.epoch == epoch

    with closing(ledger.connect()) as db:
        db.execute("""CREATE TRIGGER fail_second BEFORE UPDATE ON results
            WHEN OLD.key = 'b' BEGIN SELECT RAISE(ABORT, 'injected failure'); END""")
    try:
        ledger.retire_expired_receipts(scope, epoch, limit=2)
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError('Expected the second update to fail')
    assert ledger.status(scope, epoch, 'a') == applied
    assert ledger.status(scope, epoch, 'b')['status'] == 'rejected'
    with closing(ledger.connect()) as db:
        db.execute('DROP TRIGGER fail_second')

    assert ledger.retire_expired_receipts(scope, epoch, limit=1) == 1
    assert ledger.status(scope, epoch, 'a')['status'] == RECEIPT_UNAVAILABLE
    assert ledger.status(scope, epoch, 'b')['status'] == 'rejected'
    ledger = Ledger(filename, clock=lambda: now)
    assert ledger.retire_expired_receipts(scope, epoch, limit=1) == 1
    assert ledger.retire_expired_receipts(scope, epoch) == 0
    assert ledger.status(scope, epoch, 'later')['status'] == 'missing'
    assert ledger.status('bob', epoch, 'a')['status'] == 'applied'
    assert ledger.status(scope, epoch, 'never-submitted')['status'] == 'absent'
    assert ledger.apply(scope, epoch, 'a', create)['status'] == RECEIPT_UNAVAILABLE
    changed = dict(create, task=dict(task, id='TASK-2'))
    assert ledger.apply(scope, epoch, 'a', changed)['status'] == RECEIPT_UNAVAILABLE
    assert ledger.snapshot(scope, epoch)['tasks'] == [dict(task, revision=1)]
    now += 1
    assert ledger.retire_expired_receipts(scope, epoch) == 1
    assert ledger.status(scope, epoch, 'later')['status'] == RECEIPT_UNAVAILABLE
    with ThreadPoolExecutor(max_workers=2) as workers:
        batches = [workers.submit(ledger.retire_expired_receipts, 'bob', epoch, limit=1)
                   for _ in range(2)]
        assert [batch.result() for batch in batches] == [1, 1]
    assert ledger.retire_expired_receipts('bob', epoch) == 0
    for batch_limit in (0, 101, True):
        try:
            ledger.retire_expired_receipts(scope, epoch, limit=batch_limit)
        except ValueError:
            pass
        else:
            raise AssertionError('Expected an invalid batch limit to be refused')
    try:
        ledger.retire_expired_receipts(scope, 'wrong-epoch')
    except ValueError:
        pass
    else:
        raise AssertionError('Expected the wrong epoch to be refused')
`);
});

test('legacy full receipts start their window at migration and legacy markers stay reserved', async () => {
  await run(`
from contextlib import closing
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
from ledger import Ledger, RECEIPT_RETENTION_NS, RECEIPT_UNAVAILABLE, encode

now = migration = 1_800_000_000_000_000_000
scope, epoch = 'alice', 'old-epoch'
command = dict(kind='delete', taskId='missing', expectedRevision=1)
full = dict(scope=scope, epoch=epoch, key='full', status='missing', intent=command)
marker = dict(scope=scope, epoch=epoch, key='retired', status=RECEIPT_UNAVAILABLE)

with TemporaryDirectory(prefix='elnor-receipt-migration-') as directory:
    filename = Path(directory) / 'ledger.sqlite'
    with closing(sqlite3.connect(filename)) as db:
        db.executescript("""
            CREATE TABLE metadata(name TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE results(scope TEXT, key TEXT, intent TEXT, result TEXT, PRIMARY KEY(scope,key));
        """)
        db.execute('INSERT INTO metadata VALUES(?,?)', ('epoch', epoch))
        db.executemany('INSERT INTO results VALUES(?,?,?,?)', [
            (scope, 'full', encode(command), encode(full)),
            (scope, 'retired', '', encode(marker)),
        ])
        db.commit()

    ledger = Ledger(filename, clock=lambda: now)
    assert ledger.epoch == epoch
    assert ledger.status(scope, epoch, 'full') == full
    assert ledger.apply(scope, epoch, 'full', command) == full
    assert ledger.status(scope, epoch, 'retired') == marker
    with closing(ledger.connect()) as db:
        assert db.execute('SELECT recorded_at_ns FROM results ORDER BY key').fetchall() == [(migration,), (None,)]
    now = migration + RECEIPT_RETENTION_NS - 1
    ledger = Ledger(filename, clock=lambda: now)
    assert ledger.retire_expired_receipts(scope, epoch) == 0
    now += 1
    assert ledger.retire_expired_receipts(scope, epoch) == 1
    assert ledger.status(scope, epoch, 'full')['status'] == RECEIPT_UNAVAILABLE
    assert ledger.status(scope, epoch, 'retired') == marker
`);
});

test('scheduled receipt maintenance handles clock jumps, reports failures, and stops between batches', async () => {
  await run(`
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
from ledger import Ledger, RECEIPT_RETENTION_NS, RECEIPT_UNAVAILABLE
from provider_fixture import run_receipt_maintenance

second = 1_000_000_000
started = 1_800_000_000_000_000_000
utc = started - RECEIPT_RETENTION_NS + 2 * second
elapsed = 0
delete_missing = dict(kind='delete', taskId='missing', expectedRevision=1)

with TemporaryDirectory(prefix='elnor-receipt-schedule-') as directory:
    ledger = Ledger(Path(directory) / 'ledger.sqlite', clock=lambda: utc)
    epoch = ledger.epoch
    assert ledger.apply('alice', epoch, 'old', delete_missing)['status'] == 'missing'
    utc = started
    assert ledger.apply('alice', epoch, 'fresh', delete_missing)['status'] == 'missing'
    with closing(ledger.connect()) as db:
        db.execute("""CREATE TRIGGER fail_batch BEFORE UPDATE ON results
            WHEN OLD.key = 'old' BEGIN SELECT RAISE(ABORT, 'injected failure'); END""")

    reports = []
    times = iter([
        (1 * second, started + RECEIPT_RETENTION_NS),
        (2 * second, started - second),
        (3 * second, started + 3 * second),
        (4 * second, started + 4 * second),
        (5 * second, started + 5 * second),
    ])

    class StopAfterTicks:
        def wait(self, interval):
            global utc, elapsed
            assert interval == 1
            tick = next(times, None)
            if tick is None:
                return True
            elapsed, utc = tick
            if len(reports) == 3:
                assert ledger.status('alice', epoch, 'old')['status'] == 'missing'
                with closing(ledger.connect()) as db:
                    db.execute('DROP TRIGGER fail_batch')
            return False

    run_receipt_maintenance(ledger, 1, StopAfterTicks(), reports.append,
                            clock_anchor=lambda: (started, 0), monotonic=lambda: elapsed)
    assert all(event['epoch'] == epoch and event['scope'] == 'alice' for event in reports)
    assert [(event['status'], event.get('retired')) for event in reports] == [
        ('completed', 0), ('completed', 0), ('failed', None), ('completed', 1), ('completed', 0)
    ]
    assert reports[2]['error'] == 'injected failure'
    assert not reports[3]['hasMoreEligible']
    assert ledger.status('alice', epoch, 'old')['status'] == RECEIPT_UNAVAILABLE
    assert ledger.status('alice', epoch, 'fresh')['status'] == 'missing'
`);
});

test('scheduled batches report remaining work and preserve exact counts for manual maintenance', async () => {
  await run(`
from pathlib import Path
from tempfile import TemporaryDirectory
from ledger import (Ledger, RECEIPT_RETENTION_NS, RECEIPT_UNAVAILABLE,
                    maintain_receipts, maintain_scheduled_receipts)

now = 1_800_000_000_000_000_000
command = dict(kind='delete', taskId='missing', expectedRevision=1)
with TemporaryDirectory(prefix='elnor-receipt-lookahead-') as directory:
    filename = Path(directory) / 'ledger.sqlite'
    ledger = Ledger(filename, clock=lambda: now)
    epoch = ledger.epoch
    keys = [f'old-{i:03}' for i in range(101)]
    for key in reversed(keys):
        assert ledger.apply('alice', epoch, key, command)['status'] == 'missing'
    assert ledger.apply('bob', epoch, keys[0], command)['status'] == 'missing'
    now += 1
    assert ledger.apply('alice', epoch, 'recent', command)['status'] == 'missing'
    now += RECEIPT_RETENTION_NS - 1

    preview = maintain_receipts(filename, 'alice', clock=lambda: now)
    assert preview['eligible'] == preview['remainingEligible'] == 101 and preview['retired'] == 0
    first = maintain_scheduled_receipts(filename, 'alice', epoch=epoch, clock=lambda: now)
    assert first == dict(scope='alice', epoch=epoch, batchLimit=100, retired=100, hasMoreEligible=True)
    assert all(ledger.status('alice', epoch, key)['status'] == RECEIPT_UNAVAILABLE for key in keys[:-1])
    assert ledger.status('alice', epoch, keys[-1])['status'] == 'missing'

    exact = maintain_receipts(filename, 'alice', clock=lambda: now)
    assert exact['eligible'] == exact['remainingEligible'] == 1
    last = maintain_scheduled_receipts(filename, 'alice', epoch=epoch, limit=1, clock=lambda: now)
    assert last['retired'] == 1 and not last['hasMoreEligible']
    empty = maintain_scheduled_receipts(filename, 'alice', epoch=epoch, clock=lambda: now)
    assert empty['retired'] == 0 and not empty['hasMoreEligible']
    assert ledger.status('alice', epoch, 'recent')['status'] == 'missing'
    assert ledger.status('bob', epoch, keys[0])['status'] == 'missing'
`);
});
