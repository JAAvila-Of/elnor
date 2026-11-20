"""Loopback-only HTTP/SQLite test provider; not an authenticated application server."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from socketserver import TCPServer
from urllib.parse import urlsplit, unquote
import argparse,json,re,socket,sqlite3,sys,threading,uuid
from contextlib import closing

TOKEN=re.compile(r'^[A-Za-z0-9_-]{1,120}$')

class Ledger:
    def __init__(self,filename):
        self.filename=filename
        with closing(self.connect()) as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS metadata(name TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS intents(scope TEXT NOT NULL,key TEXT NOT NULL,text TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('applied','rejected')),reason TEXT,receipt INTEGER,PRIMARY KEY(scope,key));
CREATE TABLE IF NOT EXISTS effects(receipt INTEGER PRIMARY KEY AUTOINCREMENT,scope TEXT NOT NULL,key TEXT NOT NULL,text TEXT NOT NULL,UNIQUE(scope,key));''')
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

    def result(self,scope,key,row=None):
        base={'epoch':self.epoch,'scope':scope,'key':key}
        if row is None:return dict(base,status='absent')
        value=dict(base,status=row['state'],text=row['text'])
        if row['state']=='applied':value['receipt']=row['receipt']
        else:value['reason']=row['reason']
        return value

    def status(self,scope,key):
        with closing(self.connect()) as db:return self.result(scope,key,db.execute('SELECT * FROM intents WHERE scope=? AND key=?',(scope,key)).fetchone())

    def put(self,scope,key,text,rollback=False):
        db=self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            prior=db.execute('SELECT * FROM intents WHERE scope=? AND key=?',(scope,key)).fetchone()
            if prior:
                db.commit()
                if prior['text']!=text:return 409,dict(self.result(scope,key,prior),status='conflict')
                return (200 if prior['state']=='applied' else 422),self.result(scope,key,prior)
            if len(text.strip())<3:
                db.execute('INSERT INTO intents VALUES(?,?,?,?,?,?)',(scope,key,text,'rejected','Use at least 3 characters',None))
            else:
                cursor=db.execute('INSERT INTO effects(scope,key,text) VALUES(?,?,?)',(scope,key,text))
                if rollback:raise RuntimeError('Injected transaction rollback')
                db.execute('INSERT INTO intents VALUES(?,?,?,?,?,?)',(scope,key,text,'applied',None,cursor.lastrowid))
            row=db.execute('SELECT * FROM intents WHERE scope=? AND key=?',(scope,key)).fetchone()
            db.commit()
            return (200 if row['state']=='applied' else 422),self.result(scope,key,row)
        except BaseException:
            db.rollback()
            raise
        finally:db.close()

    def stats(self):
        with closing(self.connect()) as db:return {'epoch':self.epoch,'effects':db.execute('SELECT count(*) FROM effects').fetchone()[0],'intents':db.execute('SELECT count(*) FROM intents').fetchone()[0]}

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
        def route(self,write):
            parts=[unquote(p) for p in urlsplit(self.path).path.split('/') if p]
            if parts==['stats'] and not write:return self.send_json(200,ledger.stats())
            if len(parts)!=4 or parts[0]!='scopes' or parts[2]!='intents' or not TOKEN.fullmatch(parts[1]) or not TOKEN.fullmatch(parts[3]):return self.send_json(404,{'error':'Unknown route'})
            scope,key=parts[1],parts[3]
            if self.headers.get('X-Provider-Epoch')!=ledger.epoch:return self.send_json(412,{'epoch':ledger.epoch,'scope':scope,'key':key,'status':'epoch_mismatch'})
            if not write:return self.send_json(200,ledger.status(scope,key))
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=4096:raise ValueError('Invalid body size')
                body=json.loads(self.rfile.read(length))
                if not isinstance(body,dict) or body.get('key')!=key or not isinstance(body.get('text'),str) or len(body['text'])>200:raise ValueError('Invalid intent')
            except (ValueError,UnicodeError):return self.send_json(400,{'error':'Invalid intent'})
            fault=self.headers.get('X-Fixture-Fault') if faults else None
            if fault=='before':return self.drop()
            try:status,value=ledger.put(scope,key,body['text'],rollback=fault=='rollback')
            except RuntimeError:return self.send_json(503,{'error':'Injected rollback'})
            if fault=='after':return self.drop()
            self.send_json(status,value)
        def do_GET(self):self.route(False)
        def do_PUT(self):self.route(True)
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
            if line.strip()=='stop':break
        server.shutdown()
    thread=threading.Thread(target=commands,daemon=True);thread.start()
    try:server.serve_forever(poll_interval=.05)
    finally:server.server_close()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--db',required=True);parser.add_argument('--port',type=int,default=0);parser.add_argument('--faults',action='store_true');args=parser.parse_args()
    path=Path(args.db).resolve();path.parent.mkdir(parents=True,exist_ok=True);serve(str(path),args.port,args.faults)
