"""HTTP/SQLite reference provider for durable intents: a test fixture, not a server.

It binds 127.0.0.1 only, does not check the Host header and authenticates nobody.

PUT /notes.save/{key} with Intent-Scope, Intent-Epoch and {"input": {"text", "revision"}}.
The X-Fixture-Account header stands in for the session account.
Stdin commands: "retire" replaces every retained answer with a marker; "stop" exits.
"""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from socketserver import TCPServer
from urllib.parse import urlsplit, unquote
import argparse,json,re,socket,sqlite3,sys,threading,uuid
from contextlib import closing

TOKEN=re.compile(r'^[A-Za-z0-9_-]{1,120}$')
OPERATION='notes.save'

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)

class Ledger:
    def __init__(self,filename):
        self.filename=filename
        with closing(self.connect()) as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS metadata(name TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS documents(scope TEXT PRIMARY KEY,text TEXT NOT NULL,revision INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS intents(scope TEXT NOT NULL,key TEXT NOT NULL,input TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('applied','rejected','retired')),answer TEXT,PRIMARY KEY(scope,key));
CREATE TABLE IF NOT EXISTS effects(receipt INTEGER PRIMARY KEY AUTOINCREMENT,scope TEXT NOT NULL,key TEXT NOT NULL,UNIQUE(scope,key));''')
            db.execute('INSERT OR IGNORE INTO metadata VALUES(?,?)',('epoch',uuid.uuid4().hex))
        with closing(self.connect()) as db:
            self.epoch=db.execute('SELECT value FROM metadata WHERE name=?',('epoch',)).fetchone()[0]
            self.settings={'journalMode':db.execute('PRAGMA journal_mode').fetchone()[0],'synchronous':db.execute('PRAGMA synchronous').fetchone()[0]}
        assert self.settings=={'journalMode':'delete','synchronous':2}

    def connect(self):
        db=sqlite3.connect(self.filename,timeout=2,isolation_level=None)
        db.row_factory=sqlite3.Row
        db.execute('PRAGMA synchronous=FULL')
        db.execute('PRAGMA busy_timeout=2000')
        return db

    def answer(self,scope,key,row):
        base={'scope':scope,'key':key,'epoch':self.epoch}
        if row['state']=='retired':return 200,dict(base,status='unavailable')
        if row['state']=='applied':return 200,dict(base,status='applied',result=json.loads(row['answer']))
        return 422,dict(base,status='rejected',reason=json.loads(row['answer']))

    def put(self,scope,key,value,rollback=False):
        text=canonical(value)
        db=self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            prior=db.execute('SELECT * FROM intents WHERE scope=? AND key=?',(scope,key)).fetchone()
            if prior:
                db.commit()
                if prior['input']!=text:return 409,{'scope':scope,'key':key,'epoch':self.epoch,'status':'key-conflict'}
                return self.answer(scope,key,prior)
            document=db.execute('SELECT text,revision FROM documents WHERE scope=?',(scope,)).fetchone()
            current={'text':document['text'],'revision':document['revision']} if document else {'text':'','revision':0}
            if len(value['text'].strip())<3:
                state,answer='rejected',{'kind':'invalid','message':'Use at least 3 characters'}
            elif value['revision']!=current['revision']:
                state,answer='rejected',{'kind':'conflict','current':current}
            else:
                revision=current['revision']+1
                db.execute('INSERT INTO documents VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET text=excluded.text,revision=excluded.revision',(scope,value['text'],revision))
                db.execute('INSERT INTO effects(scope,key) VALUES(?,?)',(scope,key))
                if rollback:raise RuntimeError('Injected transaction rollback')
                state,answer='applied',{'revision':revision}
            db.execute('INSERT INTO intents VALUES(?,?,?,?,?)',(scope,key,text,state,canonical(answer)))
            row=db.execute('SELECT * FROM intents WHERE scope=? AND key=?',(scope,key)).fetchone()
            db.commit()
            return self.answer(scope,key,row)
        except BaseException:
            db.rollback()
            raise
        finally:db.close()

    def retire(self):
        with closing(self.connect()) as db:db.execute("UPDATE intents SET state='retired',answer=NULL")

    def stats(self):
        with closing(self.connect()) as db:return {'epoch':self.epoch,'effects':db.execute('SELECT count(*) FROM effects').fetchone()[0],'intents':db.execute('SELECT count(*) FROM intents').fetchone()[0]}

def valid_input(value):
    return isinstance(value,dict) and set(value)=={'text','revision'} and isinstance(value['text'],str) and len(value['text'])<=200 and type(value['revision']) is int and value['revision']>=0

def serve(filename,port=0,faults=False):
    ledger=Ledger(filename)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def send_json(self,status,value):
            data=json.dumps(value,separators=(',',':')).encode()
            self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(data)));self.end_headers()
            try:self.wfile.write(data)
            except (BrokenPipeError,ConnectionResetError):pass
        def drop(self):
            self.close_connection=True
            try:self.connection.shutdown(socket.SHUT_RDWR)
            except OSError:pass
            self.connection.close()
        def do_GET(self):
            parts=[unquote(p) for p in urlsplit(self.path).path.split('/') if p]
            self.send_json(*((200,ledger.stats()) if parts==['stats'] else (404,{'error':'Unknown route'})))
        def do_PUT(self):
            parts=[unquote(p) for p in urlsplit(self.path).path.split('/') if p]
            if len(parts)!=2 or parts[0]!=OPERATION or not TOKEN.fullmatch(parts[1]):return self.send_json(404,{'error':'Unknown route'})
            key=parts[1];scope=self.headers.get('Intent-Scope','')
            base={'scope':scope,'key':key,'epoch':ledger.epoch}
            # The session decides first: a scope that is not the account's is refused whatever its epoch.
            if not TOKEN.fullmatch(scope) or self.headers.get('X-Fixture-Account')!=scope:return self.send_json(403,dict(base,status='scope-refused'))
            if self.headers.get('Intent-Epoch')!=ledger.epoch:return self.send_json(412,dict(base,status='epoch-mismatch'))
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=4096:raise ValueError('Invalid body size')
                body=json.loads(self.rfile.read(length))
                if not isinstance(body,dict) or not valid_input(body.get('input')):raise ValueError('Invalid intent')
            except (ValueError,UnicodeError):return self.send_json(400,{'error':'Invalid intent'})
            fault=self.headers.get('X-Fixture-Fault') if faults else None
            if fault=='before':return self.drop()
            try:status,value=ledger.put(scope,key,body['input'],rollback=fault=='rollback')
            except RuntimeError:return self.send_json(503,{'error':'Injected rollback'})
            if fault=='after':return self.drop()
            self.send_json(status,value)
    class Server(ThreadingHTTPServer):
        # Admit the bursts used by concurrent replay tests while the accept loop runs.
        request_queue_size = max(16, ThreadingHTTPServer.request_queue_size)

        def server_bind(self):
            # A numeric loopback address needs no reverse DNS during startup.
            TCPServer.server_bind(self)
            self.server_name, self.server_port = self.server_address[:2]

    server=Server(('127.0.0.1',port),Handler);server.daemon_threads=True
    print(json.dumps({'port':server.server_port,'epoch':ledger.epoch,'sqlite':sqlite3.sqlite_version,'settings':ledger.settings}),flush=True)
    def commands():
        for line in sys.stdin:
            command=line.strip()
            if command=='retire':ledger.retire()
            elif command=='stop':break
        server.shutdown()
    thread=threading.Thread(target=commands,daemon=True);thread.start()
    try:server.serve_forever(poll_interval=.05)
    finally:server.server_close()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--db',required=True);parser.add_argument('--port',type=int,default=0);parser.add_argument('--faults',action='store_true');args=parser.parse_args()
    path=Path(args.db).resolve();path.parent.mkdir(parents=True,exist_ok=True);serve(str(path),args.port,args.faults)
