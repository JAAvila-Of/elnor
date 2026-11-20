"""Versioned local task ledger; no authentication or production retention policy."""
from contextlib import closing, contextmanager
import json
from pathlib import Path
import re
import sqlite3
import time
import uuid

JS_TRIM = '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
RECEIPT_UNAVAILABLE = 'receipt-unavailable'
RECEIPT_RETENTION_NS = 30 * 24 * 60 * 60 * 1_000_000_000
RECEIPT_BATCH_LIMIT = 100


def js_length(text):
    return len(text.encode('utf-16-le', errors='surrogatepass')) // 2


def valid_title(text):
    return js_length(text.strip(JS_TRIM)) >= 3


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True)


def token(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,120}', value):
        raise ValueError('Invalid identity token')


def validate_task(task):
    fields = {'id', 'title', 'assignee', 'description', 'priority', 'status'}
    if not isinstance(task, dict) or set(task) != fields:
        raise ValueError('Invalid task fields')
    token(task['id'])
    for name, limit in [('title', 200), ('assignee', 120), ('description', 10000)]:
        # Proposed limits count UTF-16 code units, matching JS string.length.
        if not isinstance(task[name], str) or js_length(task[name]) > limit:
            raise ValueError('Invalid task text')
    if task['priority'] not in ('normal', 'high') or task['status'] not in ('open', 'in-progress', 'done'):
        raise ValueError('Invalid task enum')


def _validate_receipt_limit(limit):
    if type(limit) is not int or not 1 <= limit <= RECEIPT_BATCH_LIMIT:
        raise ValueError(f'Receipt batch size must be from 1 to {RECEIPT_BATCH_LIMIT}')


def _mark_unavailable(db, scope, epoch, keys):
    return db.executemany('''
        UPDATE results SET intent='', result=?, recorded_at_ns=NULL WHERE scope=? AND key=?
    ''', (
        (encode(dict(scope=scope, epoch=epoch, key=key, status=RECEIPT_UNAVAILABLE)), scope, key)
        for key in keys
    )).rowcount


def _eligible_receipt_keys(db, scope, cutoff, limit):
    return [row[0] for row in db.execute('''
        SELECT key FROM results
        WHERE scope=? AND recorded_at_ns <= ?
        ORDER BY recorded_at_ns, key
        LIMIT ?
    ''', (scope, cutoff, limit))]


@contextmanager
def _receipt_maintenance_db(filename, scope, epoch, limit, apply):
    token(scope)
    _validate_receipt_limit(limit)
    if apply and epoch is None:
        raise ValueError('Apply requires the ledger epoch from the preview')
    if epoch is not None:
        token(epoch)
    mode = 'rw' if apply else 'ro'
    uri = Path(filename).resolve().as_uri() + '?mode=' + mode
    with closing(sqlite3.connect(uri, uri=True, timeout=2, isolation_level=None)) as db, db:
        if apply:
            db.execute('PRAGMA synchronous=FULL')
        db.execute('BEGIN IMMEDIATE' if apply else 'BEGIN')
        if 'recorded_at_ns' not in {row[1] for row in db.execute('PRAGMA table_info(results)')}:
            raise ValueError('Receipt dates are unavailable. Start the current Task Desk provider to migrate the ledger.')
        row = db.execute("SELECT value FROM metadata WHERE name='epoch'").fetchone()
        if row is None:
            raise ValueError('The ledger has no epoch')
        actual_epoch = row[0]
        if epoch is not None and actual_epoch != epoch:
            raise ValueError('Ledger epoch mismatch. Preview the intended database before applying.')
        yield db, actual_epoch


def maintain_receipts(filename, scope, *, epoch=None, limit=RECEIPT_BATCH_LIMIT,
                      apply=False, clock=time.time_ns):
    """Inspect or retire one batch with exact counts for an operator."""
    with _receipt_maintenance_db(filename, scope, epoch, limit, apply) as (db, actual_epoch):
        cutoff = clock() - RECEIPT_RETENTION_NS
        eligible = db.execute('''
            SELECT count(*) FROM results WHERE scope=? AND recorded_at_ns <= ?
        ''', (scope, cutoff)).fetchone()[0]
        retired = 0
        if apply:
            keys = _eligible_receipt_keys(db, scope, cutoff, limit)
            retired = _mark_unavailable(db, scope, actual_epoch, keys)
        return dict(scope=scope, epoch=actual_epoch, eligible=eligible, retired=retired,
                    remainingEligible=eligible - retired, batchLimit=limit)


def maintain_scheduled_receipts(filename, scope, *, epoch, limit=RECEIPT_BATCH_LIMIT, clock=time.time_ns):
    """Retire one batch and use one extra eligible key to detect remaining work."""
    with _receipt_maintenance_db(filename, scope, epoch, limit, True) as (db, actual_epoch):
        cutoff = clock() - RECEIPT_RETENTION_NS
        keys = _eligible_receipt_keys(db, scope, cutoff, limit + 1)
        retired = _mark_unavailable(db, scope, actual_epoch, keys[:limit])
        return dict(scope=scope, epoch=actual_epoch, retired=retired,
                    hasMoreEligible=len(keys) > limit, batchLimit=limit)


class Ledger:
    def __init__(self, filename, *, clock=time.time_ns):
        self.filename = filename
        self.clock = clock
        with closing(self.connect()) as db:
            db.executescript('''
CREATE TABLE IF NOT EXISTS metadata(name TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks(scope TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),PRIMARY KEY(scope,id));
CREATE TABLE IF NOT EXISTS results(scope TEXT NOT NULL,key TEXT NOT NULL,intent TEXT NOT NULL,result TEXT NOT NULL,recorded_at_ns INTEGER,PRIMARY KEY(scope,key));
''')
            db.execute('BEGIN IMMEDIATE')
            try:
                if 'deleted' not in {row[1] for row in db.execute('PRAGMA table_info(tasks)')}:
                    db.execute('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))')
                if 'recorded_at_ns' not in {row[1] for row in db.execute('PRAGMA table_info(results)')}:
                    db.execute('ALTER TABLE results ADD COLUMN recorded_at_ns INTEGER')
                    # A legacy marker has no intent. Give full receipts a fresh window.
                    db.execute("UPDATE results SET recorded_at_ns=? WHERE intent <> ''", (self.clock(),))
                db.execute('''
                    CREATE INDEX IF NOT EXISTS results_receipt_age ON results(scope, recorded_at_ns, key)
                    WHERE recorded_at_ns IS NOT NULL
                ''')
                db.commit()
            except BaseException:
                db.rollback()
                raise
            db.execute('INSERT OR IGNORE INTO metadata VALUES(?,?)', ('epoch', uuid.uuid4().hex))
            self.epoch = db.execute('SELECT value FROM metadata WHERE name=?', ('epoch',)).fetchone()[0]
            assert db.execute('PRAGMA journal_mode').fetchone()[0] == 'delete'
            assert db.execute('PRAGMA synchronous').fetchone()[0] == 2

    def connect(self):
        db = sqlite3.connect(self.filename, timeout=2, isolation_level=None)
        db.execute('PRAGMA synchronous=FULL')
        db.execute('PRAGMA busy_timeout=2000')
        return db

    def guard(self, scope, epoch):
        token(scope)
        if epoch != self.epoch:
            raise ValueError('Ledger epoch mismatch')

    def seed(self, scope, tasks):
        """Explicit fixture initialization; never called by snapshot or recovery."""
        token(scope)
        for task in tasks:
            validate_task(task)
            if not valid_title(task['title']): raise ValueError('Invalid seed title')
        with closing(self.connect()) as db:
            try:
                db.execute('BEGIN IMMEDIATE')
                if db.execute('SELECT 1 FROM tasks WHERE scope=?', (scope,)).fetchone():
                    raise ValueError('Workspace already contains tasks')
                for task in tasks:
                    db.execute('INSERT INTO tasks(scope,id,revision,payload) VALUES(?,?,?,?)', (scope, task['id'], 1, encode(task)))
                db.commit()
            except BaseException:
                db.rollback()
                raise

    def snapshot(self, scope, epoch):
        self.guard(scope, epoch)
        with closing(self.connect()) as db:
            db.execute('BEGIN')
            rows = db.execute('SELECT payload,revision FROM tasks WHERE scope=? AND deleted=0 ORDER BY id', (scope,)).fetchall()
            tombstones = db.execute('SELECT id,revision FROM tasks WHERE scope=? AND deleted=1 ORDER BY id', (scope,)).fetchall()
            db.commit()
        return dict(scope=scope, epoch=self.epoch, tasks=[dict(json.loads(p), revision=r) for p, r in rows],
                    tombstones=[dict(id=i, revision=r) for i, r in tombstones])

    def status(self, scope, epoch, key):
        self.guard(scope, epoch)
        token(key)
        with closing(self.connect()) as db:
            row = db.execute('SELECT result FROM results WHERE scope=? AND key=?', (scope, key)).fetchone()
        return json.loads(row[0]) if row else dict(scope=scope, epoch=self.epoch, key=key, status='absent')

    def retire_receipt(self, scope, epoch, key):
        """Retain the key while replacing a saved receipt with an unavailable marker."""
        self.guard(scope, epoch)
        token(key)
        with closing(self.connect()) as db:
            # A single autocommitted update keeps the key occupied throughout retirement.
            return _mark_unavailable(db, scope, epoch, [key]) == 1

    def retire_expired_receipts(self, scope, epoch, *, limit=RECEIPT_BATCH_LIMIT):
        """Run one bounded, atomic pass for an explicit scope and ledger epoch."""
        self.guard(scope, epoch)
        _validate_receipt_limit(limit)
        with closing(self.connect()) as db:
            db.execute('BEGIN IMMEDIATE')
            try:
                cutoff = self.clock() - RECEIPT_RETENTION_NS
                keys = _eligible_receipt_keys(db, scope, cutoff, limit)
                count = _mark_unavailable(db, scope, epoch, keys)
                db.commit()
                return count
            except BaseException:
                db.rollback()
                raise

    def title_problem(self, db, scope, task):
        """Evaluate the title policy inside the caller's write transaction."""
        return None if valid_title(task['title']) else 'Use at least 3 characters for the title.'

    def apply(self, scope, epoch, key, intent, fault=False):
        self.guard(scope, epoch)
        token(key)
        if not isinstance(intent, dict) or intent.get('kind') not in ('create', 'replace', 'delete'):
            raise ValueError('Invalid command kind')
        kind = intent['kind']
        fields = {'kind', 'task'} if kind == 'create' else {'kind', 'taskId', 'expectedRevision'} | ({'task'} if kind == 'replace' else set())
        if set(intent) != fields: raise ValueError('Invalid command fields')
        if kind != 'create':
            token(intent['taskId'])
            if type(intent['expectedRevision']) is not int or not 1 <= intent['expectedRevision'] < 9007199254740991:
                raise ValueError('Invalid revision')
        if kind != 'delete':
            validate_task(intent['task'])
            if kind == 'replace' and intent['taskId'] != intent['task']['id']:
                raise ValueError('Task identity mismatch')
            if kind == 'create' and intent['task']['status'] != 'open': raise ValueError('New tasks start open')
        serialized = encode(intent)
        command = json.loads(serialized)
        task_id = command['task']['id'] if kind == 'create' else command['taskId']
        result = dict(scope=scope, epoch=self.epoch, key=key, intent=command)
        with closing(self.connect()) as db:
            try:
                db.execute('BEGIN IMMEDIATE')
                prior = db.execute('SELECT intent,result FROM results WHERE scope=? AND key=?', (scope, key)).fetchone()
                if prior:
                    retained = json.loads(prior[1])
                    db.commit()
                    if retained['status'] == RECEIPT_UNAVAILABLE or prior[0] == serialized:
                        return retained
                    return dict(result, status='key-conflict')
                row = db.execute('SELECT revision,deleted FROM tasks WHERE scope=? AND id=?', (scope, task_id)).fetchone()
                problem = self.title_problem(db, scope, command['task']) if kind != 'delete' else None
                if problem:
                    result.update(status='rejected', reason=problem, issues=[dict(path=['title'], message=problem)])
                elif kind == 'create' and row is not None:
                    result.update(status='conflict', currentRevision=row[0])
                elif kind != 'create' and (row is None or row[1]):
                    result.update(status='missing')
                elif kind != 'create' and row[0] != command['expectedRevision']:
                    result.update(status='conflict', currentRevision=row[0])
                else:
                    revision = 1 if kind == 'create' else row[0] + 1
                    if kind == 'create':
                        db.execute('INSERT INTO tasks(scope,id,revision,payload) VALUES(?,?,?,?)', (scope, task_id, 1, encode(command['task'])))
                    elif kind == 'delete':
                        db.execute('UPDATE tasks SET revision=?,deleted=1 WHERE scope=? AND id=?', (revision, scope, task_id))
                    else:
                        db.execute('UPDATE tasks SET revision=?,payload=? WHERE scope=? AND id=?', (revision, encode(command['task']), scope, task_id))
                    if fault: raise RuntimeError('Injected failure before result storage')
                    result.update(status='applied', revision=revision)
                    if kind == 'delete': result['deleted'] = True
                db.execute('''
                    INSERT INTO results(scope, key, intent, result, recorded_at_ns) VALUES(?,?,?,?,?)
                ''', (scope, key, serialized, encode(result), self.clock()))
                db.commit()
                return result
            except BaseException:
                db.rollback()
                raise
