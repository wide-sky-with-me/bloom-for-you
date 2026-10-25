import { prepareCooperatively, transferBuffers, abortError } from './prepare-data.js?v=7';

// One active job, at most four immutable targets. No orphan worker CPU or worker cache.
export class BouquetPreparation {
  constructor(options, {workerFactory, limit = 4, schedule, onSlice} = {}) {
    this.options = options;
    this.workerFactory = workerFactory ?? (() => new Worker(new URL('./prepare-worker.js?v=7', import.meta.url), {type: 'module'}));
    this.limit = limit;
    this.schedule = schedule;
    this.onSlice = onSlice;
    this.cache = new Map();
  }
  cancel() {
    this.active?.abort();
    this.active = null;
  }
  async prepare(key, input) {
    this.cancel();
    if (this.disposed) throw abortError();
    const cached = this.cache.get(key);
    if (cached?.input === input) {
      this.cache.delete(key); this.cache.set(key, cached);
      return cached.prepared;
    }
    const controller = new AbortController();
    const job = {abort: () => controller.abort()};
    this.active = job;
    try {
      let prepared;
      if (!this.workerFailed) {
        try { prepared = await this.runWorker(input, controller.signal); }
        catch (error) {
          if (error.name === 'AbortError' || error.validation) throw error;
          // Unsupported modules/CSP/startup/message errors permanently choose cooperative mode.
          this.workerFailed = true;
        }
      }
      if (!prepared) prepared = await prepareCooperatively(input, this.options, {
        signal: controller.signal, schedule: this.schedule, onSlice: this.onSlice,
      });
      if (controller.signal.aborted || this.disposed) throw abortError();
      this.cache.set(key, {input, prepared});
      while (this.cache.size > this.limit) this.cache.delete(this.cache.keys().next().value);
      return prepared;
    } finally {
      if (this.active === job) this.active = null;
    }
  }
  runWorker(input, signal) {
    return new Promise((resolve, reject) => {
      let worker, timer, settled = false;
      const finish = (error, prepared) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        worker?.terminate();
        if (error) reject(error); else resolve(prepared);
      };
      const abort = () => finish(abortError());
      if (signal.aborted) return abort();
      signal.addEventListener('abort', abort, {once: true});
      try {
        worker = this.workerFactory();
        worker.onmessage = ({data}) => {
          if (data.error) { const error = new Error(data.error); error.validation = true; finish(error); }
          else if (!data.prepared) finish(new Error('Invalid preparation reply'));
          else finish(null, data.prepared);
        };
        worker.onerror = event => { event.preventDefault?.(); finish(new Error('Preparation worker unavailable')); };
        worker.onmessageerror = () => finish(new Error('Preparation message unavailable'));
        // Retain the fetch/decoded input for startup-failure fallback; transfer the private copy.
        const copy = structuredClone(input);
        timer = setTimeout(() => finish(new Error('Preparation worker timeout')), 30000);
        worker.postMessage({input: copy, options: this.options}, transferBuffers(copy));
      } catch (error) { finish(error); }
    });
  }
  dispose() { this.disposed = true; this.cancel(); this.cache.clear(); }
}
