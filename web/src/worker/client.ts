import { buildArtifacts } from './build';
import type { GenerateRequest, GenerateResponse } from './build';

type Pending = {
  request: GenerateRequest;
  resolve: (response: GenerateResponse | null) => void;
};

// Runs generations one at a time off the main thread. If several requests arrive while one is
// running, only the newest is run next; the ones it supersedes resolve to null. That keeps
// dragging a slider from queueing up dozens of stale generations.
export class GeneratorClient {
  private worker: Worker | null;
  private running: Pending | null = null;
  private queued: Pending | null = null;

  constructor(useWorker = typeof Worker !== 'undefined') {
    this.worker = useWorker
      ? new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' })
      : null;
    if (this.worker) {
      this.worker.onmessage = (event: MessageEvent<GenerateResponse>) => this.finish(event.data);
      this.worker.onerror = (event) => {
        if (this.running) {
          this.finish({ id: this.running.request.id, ok: false, error: event.message || 'Worker failed' });
        }
      };
    }
  }

  submit(request: GenerateRequest): Promise<GenerateResponse | null> {
    return new Promise((resolve) => {
      this.queued?.resolve(null);
      this.queued = { request, resolve };
      if (!this.running) this.startNext();
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.queued?.resolve(null);
    this.running?.resolve(null);
    this.queued = this.running = null;
  }

  private startNext(): void {
    this.running = this.queued;
    this.queued = null;
    if (!this.running) return;
    const { request } = this.running;
    if (this.worker) {
      this.worker.postMessage(request);
    } else {
      setTimeout(() => this.finish(buildArtifacts(request)), 0);
    }
  }

  private finish(response: GenerateResponse): void {
    const done = this.running;
    this.running = null;
    done?.resolve(this.queued ? null : response);
    this.startNext();
  }
}
