import {createSurfaceLanguageService} from './language-service.mjs';

// One worker owns the synchronous engine. No source or plugin is evaluated.
// beforeQuery is a deterministic barrier used by a separate test entrypoint.
export async function startLanguageWorker({port, root, beforeQuery = () => {}}) {
  let service = createSurfaceLanguageService({root});
  let epoch = 0, generation = 0;
  const jobs = new Map();
  const methods = new Set(['diagnostics', 'definitions', 'completions', 'rename', 'format']);
  port.on('message', message => {
    try {
      if (message.type === 'reset') {
        jobs.clear(); service.dispose(); service = createSurfaceLanguageService({root});
        for (const doc of message.documents) service.open(doc.file, doc.source);
        epoch = message.epoch; generation = message.generation;
        port.postMessage({type: 'replayed', epoch, generation});
      } else if (message.type === 'open') {
        service.open(message.file, message.source); epoch = message.epoch;
      } else if (message.type === 'close') {
        service.close(message.file); epoch = message.epoch;
      } else if (message.type === 'disk') {
        service.invalidateDisk(message.file); epoch = message.epoch;
      } else if (message.type === 'cancel') {
        jobs.delete(message.id);
      } else if (message.type === 'query') {
        if (!methods.has(message.method)) throw Error('Unsupported language query');
        jobs.set(message.id, message);
        // Give already-queued edits/cancellations a chance to invalidate a job.
        setImmediate(() => {
          const job = jobs.get(message.id);
          jobs.delete(message.id);
          if (!job) return;
          const response = {type: 'result', id: job.id, epoch: job.epoch, generation};
          try {
            if (job.epoch !== epoch || job.generation !== generation) {
              port.postMessage({...response, error: {name: 'StaleResponseError', message: 'Workspace changed before analysis'}});
              return;
            }
            beforeQuery(job);
            port.postMessage({...response, value: service[job.method](...job.args)});
          } catch (error) { port.postMessage({...response, error: {name: error.name, message: error.message}}); }
        });
      } else throw Error('Unsupported worker message');
    } catch (error) { port.postMessage({type: 'fatal', error: error.message}); }
  });
  port.on('close', () => service.dispose());
  port.postMessage({type: 'ready'});
}
