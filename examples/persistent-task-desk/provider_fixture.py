"""Loopback task provider for the local pilot; no authentication or deployment contract."""
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
import argparse, json, socket, sqlite3, sys, threading, time
from ledger import Ledger, RECEIPT_UNAVAILABLE, maintain_scheduled_receipts, token


def run_receipt_maintenance(ledger, interval, stop, emit, *, clock_anchor, monotonic=time.monotonic_ns):
    """Retire one batch per interval using a conservative clock for this process."""
    event = dict(event='receipt-maintenance', scope='alice', epoch=ledger.epoch)
    while not stop.wait(interval):
        anchor = clock_anchor()
        if anchor is None:
            continue
        verified_utc, verified_tick = anchor

        def cutoff_clock():
            return min(ledger.clock(), verified_utc + monotonic() - verified_tick)

        try:
            report = maintain_scheduled_receipts(ledger.filename, event['scope'], epoch=ledger.epoch,
                                                 clock=cutoff_clock)
        except (OSError, ValueError, sqlite3.Error) as error:
            emit(dict(event, status='failed', error=str(error)))
        else:
            emit(dict(event, status='completed', **report))


def serve(ledger, port, faults, *, check_title=None, receipt_interval_seconds=None):
    class Server(ThreadingHTTPServer):
        # The concurrent replay test opens eight connections in one burst.
        request_queue_size = max(16, ThreadingHTTPServer.request_queue_size)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass
        def reply(self, code, value):
            data=json.dumps(value, ensure_ascii=True).encode()
            self.send_response(code);self.send_header('Content-Type','application/json')
            self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)))
            self.end_headers();self.wfile.write(data)
        def drop(self):
            self.close_connection=True
            try:self.connection.shutdown(socket.SHUT_RDWR)
            except OSError:pass
            self.connection.close()
        def handle_request(self):
            try:
                parts=[unquote(x) for x in urlsplit(self.path).path.strip('/').split('/')]
                if len(parts) not in (3,4) or parts[0]!='scopes':
                    return self.reply(404,{'error':'Unknown route'})
                scope=parts[1];token(scope)
                epoch=self.headers.get('X-Provider-Epoch')
                if epoch!=ledger.epoch:return self.reply(412,{'epoch':ledger.epoch,'error':'Epoch mismatch'})
                if self.command == 'POST':
                    if len(parts) != 3 or parts[2] != 'title-check':
                        return self.reply(404, {'error': 'Unknown route'})
                    size = int(self.headers.get('Content-Length', '-1'))
                    if not 0 < size <= 4096:
                        return self.reply(413, {'error': 'Invalid body size'})
                    payload = json.loads(self.rfile.read(size))
                    if not isinstance(payload, dict) or set(payload) != {'title'}:
                        raise ValueError('Invalid title check')
                    message = check_title(scope, epoch, payload['title'])
                    return self.reply(200, {'scope': scope, 'epoch': epoch, 'message': message})
                if len(parts)==3 and parts[2]=='tasks' and self.command=='GET':
                    return self.reply(200,ledger.snapshot(scope,epoch))
                if len(parts)!=4 or parts[2]!='commands':return self.reply(404,{'error':'Unknown route'})
                key=parts[3];token(key)
                fault=self.headers.get('X-Fixture-Fault') if faults else None
                if self.command == 'GET':
                    result = ledger.status(scope, epoch, key)
                    if fault == 'receipt-unavailable' and result['status'] != 'absent':
                        # Simulate the read contract without deleting the receipt.
                        return self.reply(410, dict(scope=scope, epoch=epoch, key=key, status=RECEIPT_UNAVAILABLE))
                    return self.reply(410 if result['status'] == RECEIPT_UNAVAILABLE else 200, result)
                size=int(self.headers.get('Content-Length','-1'))
                if not 0<size<=131072:return self.reply(413,{'error':'Invalid body size'})
                command=json.loads(self.rfile.read(size))
                if fault=='before':return self.drop()
                result=ledger.apply(scope,epoch,key,command,fault=fault=='rollback')
                if fault=='after':return self.drop()
                return self.reply({'rejected':422,'conflict':409,'missing':409,'key-conflict':409,
                                   RECEIPT_UNAVAILABLE:410}.get(result['status'],200),result)
            except (ValueError,TypeError,UnicodeError):self.reply(400,{'error':'Invalid request'})
            except Exception:self.reply(503,{'error':'Result unavailable'})
        do_GET=handle_request
        do_PUT=handle_request
        if check_title is not None:
            do_POST=handle_request
    server=Server(('127.0.0.1',port),Handler)
    stopping = threading.Event()
    clock_anchor = None
    report_lock = threading.Lock()

    def emit_maintenance(event):
        with report_lock:
            print(json.dumps(event), file=sys.stderr, flush=True)

    def stop():
        nonlocal clock_anchor
        for line in sys.stdin:
            command, _, argument = line.strip().partition(' ')
            if command == 'stop' and not argument:
                break
            if command != 'receipt-clock' or receipt_interval_seconds is None:
                continue
            event = dict(event='receipt-maintenance', scope='alice', epoch=ledger.epoch)
            if clock_anchor is not None:
                emit_maintenance(dict(event, status='clock-rejected', error='Clock already confirmed for this process'))
                continue
            try:
                verified = datetime.strptime(argument, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
                if verified.strftime('%Y-%m-%dT%H:%M:%SZ') != argument or not 1970 <= verified.year <= 2261:
                    raise ValueError('Invalid UTC sample')
            except ValueError:
                emit_maintenance(dict(event, status='clock-rejected', error='Use receipt-clock YYYY-MM-DDTHH:MM:SSZ'))
                continue
            clock_anchor = (int(verified.timestamp()) * 1_000_000_000, time.monotonic_ns())
            emit_maintenance(dict(event, status='clock-confirmed', utc=argument))
        stopping.set()
        server.shutdown()

    maintenance = None
    if receipt_interval_seconds is not None:
        maintenance = threading.Thread(target=run_receipt_maintenance,
                                       args=(ledger, receipt_interval_seconds, stopping, emit_maintenance),
                                       kwargs={'clock_anchor': lambda: clock_anchor})
        emit_maintenance(dict(event='receipt-maintenance', scope='alice', epoch=ledger.epoch,
                              status='waiting-for-clock',
                              message='Enter receipt-clock YYYY-MM-DDTHH:MM:SSZ after checking UTC independently.'))
        maintenance.start()
    threading.Thread(target=stop,daemon=True).start()
    try:
        print(json.dumps({'port':server.server_port,'epoch':ledger.epoch}),flush=True)
        server.serve_forever(poll_interval=.05)
    finally:
        stopping.set()
        if maintenance is not None:
            maintenance.join()
        server.server_close()

if __name__=='__main__':
    parser=argparse.ArgumentParser(allow_abbrev=False);parser.add_argument('--db',required=True);parser.add_argument('--port',type=int,default=0)
    parser.add_argument('--faults',action='store_true');parser.add_argument('--seed',action='store_true')
    parser.add_argument('--receipt-maintenance-seconds', type=int)
    args=parser.parse_args()
    interval = args.receipt_maintenance_seconds
    if interval is not None and not 1 <= interval <= 2_147_483:
        parser.error('Receipt maintenance interval must be from 1 to 2147483 seconds')
    ledger=Ledger(Path(args.db))
    if args.seed:ledger.seed('alice',[dict(id='TASK-1',title='Review persistence',assignee='Ada',description='A persistent task.',priority='normal',status='open'),dict(id='TASK-2',title='Verify recovery',assignee='',description='',priority='high',status='open')])
    serve(ledger,args.port,args.faults,receipt_interval_seconds=interval)
