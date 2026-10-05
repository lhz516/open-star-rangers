export type ListenerGroup = 'keyboard' | 'session' | 'render' | 'react' | 'vite' | 'worker' | 'test' | 'other';
export interface ProbeSnapshot {
  listeners: { id: number; target: number; type: string; capture: boolean; group: ListenerGroup; active: boolean; addedAt: number; removedAt: number | null }[];
  observers: { id: number; targets: number[] }[];
  canvases: { id: number; connected: boolean; extension: boolean; lost: boolean }[];
  frames: { pending: number; maximum: number; requested: number; delivered: number; cancelled: number };
  /**
   * Every Worker constructed: its script path (no origin or query), whether Vite's Worker transform built the URL, type,
   * name, and the number of `postMessage()` and `terminate()` calls. Message contents are never kept.
   */
  workers: { id: number; entry: string; viteWorker: boolean; type: string; name: string; posts: number; terminations: number }[];
  sequence: number;
}

interface BrowserProbe {
  snapshot(): ProbeSnapshot;
  resetFrames(): void;
  restore(): void;
}

declare global {
  interface Window { osrProbe: BrowserProbe }
}

/** Serialized before navigation; all bookkeeping belongs to the test, not the application. */
export function installBrowserProbes(): void {
  let sequence = 0;
  const ids = new WeakMap<object, number>();
  function id(value: object): number {
    let existing = ids.get(value);
    if (existing === undefined) { existing = ++sequence; ids.set(value, existing); }
    return existing;
  }
  const application = (): boolean => /\/(?:src|assets)\//.test(new Error().stack ?? '');
  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;
  const originalRequest = window.requestAnimationFrame;
  const originalCancel = window.cancelAnimationFrame;
  const originalObserve = ResizeObserver.prototype.observe;
  const originalUnobserve = ResizeObserver.prototype.unobserve;
  const originalDisconnect = ResizeObserver.prototype.disconnect;
  const originalContext = HTMLCanvasElement.prototype.getContext;
  const OriginalWorker = window.Worker;
  const originalTerminate = OriginalWorker.prototype.terminate;
  const originalPost = OriginalWorker.prototype.postMessage;
  type Listener = ProbeSnapshot['listeners'][number] & {
    callback: EventListenerOrEventListenerObject; nativeCallback: EventListenerOrEventListenerObject; object: EventTarget; signal?: AbortSignal;
  };
  const listeners: Listener[] = [];
  const observers = new Map<ResizeObserver, Set<Element>>();
  const canvases = new Map<HTMLCanvasElement, { gl: WebGL2RenderingContext; extension: boolean }>();
  const frames = new Map<number, boolean>();
  // Records hold no Worker reference, so a terminated Worker is not kept alive for the snapshot.
  const workerRecords: ProbeSnapshot['workers'] = [];
  const workers = new WeakMap<Worker, ProbeSnapshot['workers'][number]>();
  let maximum = 0;
  let requested = 0;
  let delivered = 0;
  let cancelled = 0;
  const pending = (): number => [...frames.values()].filter(Boolean).length;
  const capture = (options?: boolean | EventListenerOptions): boolean => typeof options === 'boolean' ? options : options?.capture ?? false;
  function group(target: EventTarget, type: string): ListenerGroup {
    if (target instanceof OriginalWorker) return 'worker';
    if (target === document.getElementById('root') || (target === document && type === 'selectionchange')) return 'react';
    if (/\/@(?:vite\/client|react-refresh)/.test(new Error().stack ?? '')) return 'vite';
    if (!application()) return 'test';
    if (target instanceof HTMLElement && target.dataset.testid === 'synthetic-view') return 'keyboard';
    if ((target === window && ['focus', 'blur'].includes(type))) return 'keyboard';
    if ((target === document && type === 'visibilitychange') || (target === window && ['pagehide', 'pageshow'].includes(type))) {
      // Session registers first; the input source registers the second distinct callback.
      return listeners.some(entry => entry.object === target && entry.type === type && entry.active && ['session', 'keyboard'].includes(entry.group))
        ? 'keyboard' : 'session';
    }
    if (target instanceof HTMLCanvasElement || (target instanceof MediaQueryList && target.media.includes('resolution'))) return 'render';
    return 'other';
  }
  EventTarget.prototype.addEventListener = function (type, callback, options): void {
    if (!callback) { originalAdd.call(this, type, callback, options); return; }
    const capturing = capture(options);
    const existing = listeners.find(entry => entry.object === this && entry.type === type && entry.callback === callback
      && entry.capture === capturing && entry.active && !entry.signal?.aborted);
    if (existing) { originalAdd.call(this, type, existing.nativeCallback, options); return; }
    const signal = typeof options === 'object' ? options.signal : undefined;
    const nativeCallback = typeof options === 'object' && options.once ? function (this: EventTarget, event: Event): void {
      entry.active = false;
      entry.removedAt = ++sequence;
      if (typeof callback === 'function') callback.call(this, event);
      else callback.handleEvent(event);
    } : callback;
    originalAdd.call(this, type, nativeCallback, options);
    if (signal?.aborted) return;
    const entry: Listener = {
      id: id(callback), target: id(this), object: this, type, callback, nativeCallback, capture: capturing,
      group: group(this, type), active: true, addedAt: ++sequence, removedAt: null, signal,
    };
    listeners.push(entry);
  };
  EventTarget.prototype.removeEventListener = function (type, callback, options): void {
    const found = listeners.find(entry => entry.object === this && entry.type === type && entry.callback === callback && entry.capture === capture(options) && entry.active);
    originalRemove.call(this, type, found?.nativeCallback ?? callback, options);
    if (found) { found.active = false; found.removedAt = ++sequence; }
  };
  window.requestAnimationFrame = function (callback): number {
    const owned = application();
    const handle = originalRequest.call(this, time => {
      frames.delete(handle);
      if (owned) delivered++;
      callback.call(window, time);
    });
    frames.set(handle, owned);
    if (owned) { requested++; maximum = Math.max(maximum, pending()); }
    return handle;
  };
  window.cancelAnimationFrame = function (handle): void {
    originalCancel.call(this, handle);
    if (frames.get(handle)) cancelled++;
    frames.delete(handle);
  };
  ResizeObserver.prototype.observe = function (target, options): void {
    originalObserve.call(this, target, options);
    const targets = observers.get(this) ?? new Set<Element>();
    targets.add(target);
    observers.set(this, targets);
    id(this);
  };
  ResizeObserver.prototype.unobserve = function (target): void {
    originalUnobserve.call(this, target);
    observers.get(this)?.delete(target);
  };
  ResizeObserver.prototype.disconnect = function (): void {
    originalDisconnect.call(this);
    observers.get(this)?.clear();
  };
  HTMLCanvasElement.prototype.getContext = new Proxy(originalContext, {
    apply(target, receiver: unknown, args: unknown[]): unknown {
      const result: unknown = Reflect.apply(target, receiver, args);
      if (receiver instanceof HTMLCanvasElement && result instanceof WebGL2RenderingContext) {
        if (!canvases.has(receiver)) canvases.set(receiver, { gl: result, extension: result.getExtension('WEBGL_lose_context') !== null });
        id(receiver);
      }
      return result;
    },
  });
  // A Proxy keeps `Worker.prototype` and `instanceof`; Vite's `new Worker(new URL(...))` resolves the global at call time.
  window.Worker = new Proxy(OriginalWorker, {
    construct(target, args: ConstructorParameters<typeof Worker>, newTarget: NewableFunction): object {
      const worker = Reflect.construct(target, args, newTarget) as Worker;
      const [url, options] = args;
      const parsed = new URL(String(url), location.href);
      const record = {
        id: id(worker), entry: parsed.pathname, viteWorker: parsed.searchParams.has('worker_file'), type: options?.type ?? 'classic',
        name: options?.name ?? '', posts: 0, terminations: 0,
      };
      workers.set(worker, record);
      workerRecords.push(record);
      return worker;
    },
  });
  OriginalWorker.prototype.postMessage = function (this: Worker, ...args: Parameters<Worker['postMessage']>): void {
    const record = workers.get(this);
    if (record) record.posts++;
    (originalPost as (...values: unknown[]) => void).apply(this, args);
  } as Worker['postMessage'];
  OriginalWorker.prototype.terminate = function (this: Worker): void {
    const record = workers.get(this);
    if (record) record.terminations++;
    originalTerminate.call(this);
  };
  window.osrProbe = {
    snapshot: () => ({
      listeners: listeners.map(({ id, target, type, capture, group, active, addedAt, removedAt, signal }) => ({
        id, target, type, capture, group, active: active && !signal?.aborted, addedAt, removedAt,
      })),
      observers: [...observers].map(([observer, targets]) => ({ id: id(observer), targets: [...targets].map(id) })),
      canvases: [...canvases].map(([canvas, { gl, extension }]) => ({
        id: id(canvas), connected: canvas.isConnected, extension, lost: gl.isContextLost(),
      })),
      frames: { pending: pending(), maximum, requested, delivered, cancelled },
      workers: workerRecords.map(record => ({ ...record })),
      sequence,
    }),
    resetFrames: () => { maximum = pending(); requested = 0; delivered = 0; cancelled = 0; },
    restore: () => {
      EventTarget.prototype.addEventListener = originalAdd;
      EventTarget.prototype.removeEventListener = originalRemove;
      window.requestAnimationFrame = originalRequest;
      window.cancelAnimationFrame = originalCancel;
      ResizeObserver.prototype.observe = originalObserve;
      ResizeObserver.prototype.unobserve = originalUnobserve;
      ResizeObserver.prototype.disconnect = originalDisconnect;
      HTMLCanvasElement.prototype.getContext = originalContext;
      window.Worker = OriginalWorker;
      OriginalWorker.prototype.terminate = originalTerminate;
      OriginalWorker.prototype.postMessage = originalPost;
    },
  };
}
