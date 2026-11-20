import {spawn} from 'node:child_process';

async function waitAtMost(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([promise, new Promise(resolve => {
      timer = setTimeout(resolve, milliseconds);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

export function launchLocalProcess(executable, args, {
  label = 'Local process',
  startupTimeout = 20000,
  stopTimeout = 5000,
  onStderr
} = {}) {
  const child = spawn(executable, args, {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
  let stdout = '', stderr = '', spawnError, announce, closing;
  const firstLine = new Promise(resolve => { announce = resolve; });
  const done = new Promise(resolve => {
    child.once('close', (code, signal) => resolve({code, signal}));
  });
  child.once('error', error => { spawnError = error; });
  child.stdin.on('error', () => {
    // The child can close its end of stdin while a stop command is in flight.
    // Its close status is the result of the shutdown.
  });
  child.stdout.setEncoding('utf8').on('data', chunk => {
    if (!announce) return;
    stdout += chunk;
    const newline = stdout.indexOf('\n');
    if (newline < 0 && stdout.length <= 65536) return;
    announce(newline < 0 || newline > 65536
      ? new Error('readiness line exceeded 65536 characters')
      : stdout.slice(0, newline));
    announce = undefined;
    stdout = '';
  });
  child.stderr.setEncoding('utf8').on('data', chunk => {
    stderr = (stderr + chunk).slice(-65536);
    onStderr?.(chunk);
  });

  function shutdown(command) {
    return closing ??= (async () => {
      if (!child.stdin.destroyed) child.stdin.end(command);
      const closed = await waitAtMost(done, stopTimeout);
      if (closed) return closed;
      if (child.exitCode === null && child.signalCode === null) child.kill();
      const killed = await waitAtMost(done, stopTimeout);
      if (killed) return killed;
      throw new Error(`${label} did not close: ${stderr}`);
    })();
  }

  async function ready() {
    try {
      const result = await waitAtMost(Promise.race([firstLine, done]), startupTimeout);
      if (result === undefined) throw new Error(`startup timed out after ${startupTimeout} ms`);
      if (result instanceof Error) throw result;
      if (typeof result !== 'string') {
        throw spawnError ?? new Error(`exited with ${result.signal ?? result.code} before announcing readiness`);
      }
      const metadata = JSON.parse(result);
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        throw new Error('expected a JSON readiness object');
      }
      return metadata;
    } catch (error) {
      let cleanupError;
      try { await shutdown('stop\n'); }
      catch (failure) { cleanupError = failure; }
      const context = [`${label}: ${error.message}`, stderr.trim(), cleanupError?.message].filter(Boolean).join('\n');
      throw new Error(context, {cause: error});
    }
  }

  async function stop(command = 'stop\n') {
    const {code, signal} = await shutdown(command);
    if (code !== 0) throw new Error(`${label} stopped with ${signal ?? code}: ${stderr}`);
  }

  return {child, ready, stop, done, get error() { return stderr; }};
}
