export type ListenerGroup = 'keyboard' | 'fullscreen' | 'pointer-lock' | 'session' | 'render' | 'react' | 'vite' | 'worker' | 'test' | 'other';
/**
 * One message a Worker sent to the page: its `type` and `stage` when they are protocol tokens, its `jobId` when a safe
 * integer, otherwise null; `at` is the probe sequence when it arrived. Nothing else of the message is kept.
 */
export interface WorkerMessageRecord { type: string | null; stage: string | null; jobId: number | null; at: number }
export interface ProbeSnapshot {
  /** A random identity of the document the probe was installed in, so a reload is never mistaken for a release. */
  document: string;
  /**
   * Beyond its group, a listener records `element`: whether React DOM registered it on that one element (its
   * non-delegated events, such as `invalid` or `toggle`, which React never removes), and `detached`: whether its target
   * is a node no longer in the document.
   */
  listeners: {
    id: number; target: number; type: string; capture: boolean; group: ListenerGroup; active: boolean; addedAt: number; removedAt: number | null;
    element: 'react' | null; detached: boolean;
  }[];
  observers: { id: number; targets: number[] }[];
  canvases: { id: number; connected: boolean; extension: boolean; lost: boolean }[];
  frames: { pending: number; maximum: number; requested: number; delivered: number; cancelled: number };
  /**
   * One-shot timers the application scheduled with `setTimeout`, each by its ID, the probe sequence when it was
   * scheduled: those still pending, neither fired nor cleared with `clearTimeout`, with their numeric delay (null when
   * it was not a number); how many were scheduled; and the IDs of those that fired and of those that were cleared, in
   * that order. Timers of the test, its tooling or the dev server's client, and string handlers, are passed through
   * unrecorded.
   */
  timers: { pending: { id: number; delay: number | null }[]; scheduled: number; fired: number[]; cleared: number[] };
  /**
   * Every Worker constructed: its script path (no origin or query), whether Vite's Worker transform built the URL, type,
   * name, and the number of `postMessage()` and `terminate()` calls. Message contents are never kept: `jobs` holds the
   * `jobId` of each import `start` message the page posted, `messages` what the Worker sent, and `terminatedAt` the
   * probe sequence of the first `terminate()`.
   */
  workers: {
    id: number; entry: string; viteWorker: boolean; type: string; name: string; posts: number; terminations: number;
    jobs: number[]; messages: WorkerMessageRecord[]; terminatedAt: number | null;
  }[];
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
  // `getRandomValues`, unlike `randomUUID`, also exists outside secure contexts.
  const documentId = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join('');
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
  const originalSetTimeout = window.setTimeout;
  const originalClearTimeout = window.clearTimeout;
  const OriginalWorker = window.Worker;
  const originalTerminate = OriginalWorker.prototype.terminate;
  const originalPost = OriginalWorker.prototype.postMessage;
  type Listener = Omit<ProbeSnapshot['listeners'][number], 'detached'> & {
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
  // Keyed by the native handle, which `setTimeout` still returns unchanged.
  const timers = new Map<number, ProbeSnapshot['timers']['pending'][number]>();
  const firedTimers: number[] = [];
  const clearedTimers: number[] = [];
  const pending = (): number => [...frames.values()].filter(Boolean).length;
  const capture = (options?: boolean | EventListenerOptions): boolean => typeof options === 'boolean' ? options : options?.capture ?? false;
  /** React DOM's per-instance name of its element event set, once an element shows it. */
  let reactEvents: string | undefined;
  function group(target: EventTarget, type: string): ListenerGroup {
    if (target instanceof OriginalWorker) return 'worker';
    if (target === document.getElementById('root') || (target === document && type === 'selectionchange')) return 'react';
    if (/\/@(?:vite\/client|react-refresh)/.test(new Error().stack ?? '')) return 'vite';
    if (!application()) return 'test';
    if (['fullscreenchange', 'fullscreenerror'].includes(type)) return 'fullscreen';
    // The Pointer Lock port (P3-05): its lock events on the document and pointer events on its target.
    if (['pointerlockchange', 'pointerlockerror', 'mousemove', 'mousedown', 'mouseup'].includes(type)) return 'pointer-lock';
    // The mission screen's input area (P3-05), or the input zone of a test entry without one, is the keyboard's; React
    // DOM registers its own element listeners before the element joins the document, so they never match.
    if (target instanceof Element && target.closest('[data-testid="mission-screen"], [data-testid="game-input-zone"]')) return 'keyboard';
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
      group: group(this, type), active: true, addedAt: ++sequence, removedAt: null, signal, element: null,
    };
    listeners.push(entry);
    // React DOM adds `<type>__bubble` to the element's own `__reactEvents$…` set right after registering its listener,
    // so only a registration that the marker follows is React's; a later one of the same type is not.
    if (this instanceof Element && !capturing) {
      const element = this as Element & Record<string, unknown>;
      const marked = (): boolean => {
        reactEvents ??= Object.keys(element).find(key => key.startsWith('__reactEvents$'));
        const set = reactEvents === undefined ? undefined : element[reactEvents];
        return set instanceof Set && set.has(`${type}__bubble`);
      };
      if (!marked()) queueMicrotask(() => { if (marked()) entry.element = 'react'; });
    }
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
  // Only the callback is wrapped, to clear its record as it fires; `this`, the delay, the arguments and the handle are
  // the native ones. `clearInterval` is not wrapped: a timeout it cleared would stay pending here.
  window.setTimeout = function (this: unknown, handler: TimerHandler, timeout?: number, ...args: unknown[]): number {
    if (typeof handler !== 'function' || !application()) return Reflect.apply(originalSetTimeout, this, [handler, timeout, ...args]) as number;
    const record = { id: ++sequence, delay: typeof timeout === 'number' ? timeout : null };
    const handle = Reflect.apply(originalSetTimeout, this, [function (this: unknown, ...values: unknown[]): unknown {
      if (timers.get(handle) === record) {
        timers.delete(handle);
        firedTimers.push(record.id);
      }
      return Reflect.apply(handler, this, values);
    }, timeout, ...args]) as number;
    timers.set(handle, record);
    return handle;
  } as typeof window.setTimeout;
  window.clearTimeout = function (this: unknown, handle?: unknown): void {
    Reflect.apply(originalClearTimeout, this, [handle]);
    const record = typeof handle === 'number' ? timers.get(handle) : undefined;
    if (record) {
      timers.delete(handle as number);
      clearedTimers.push(record.id);
    }
  } as typeof window.clearTimeout;
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
  const token = (value: unknown): string | null => typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64 ? value : null;
  const integer = (value: unknown): number | null => (Number.isSafeInteger(value) ? value as number : null);
  const field = (value: unknown, name: string): unknown => (typeof value === 'object' && value !== null ? Object.getOwnPropertyDescriptor(value, name)?.value : undefined);
  window.Worker = new Proxy(OriginalWorker, {
    construct(target, args: ConstructorParameters<typeof Worker>, newTarget: NewableFunction): object {
      const worker = Reflect.construct(target, args, newTarget) as Worker;
      const [url, options] = args;
      const parsed = new URL(String(url), location.href);
      const record: ProbeSnapshot['workers'][number] = {
        id: id(worker), entry: parsed.pathname, viteWorker: parsed.searchParams.has('worker_file'), type: options?.type ?? 'classic',
        name: options?.name ?? '', posts: 0, terminations: 0, jobs: [], messages: [], terminatedAt: null,
      };
      workers.set(worker, record);
      workerRecords.push(record);
      // Added natively before any application listener and never recorded; it reads only own data properties.
      originalAdd.call(worker, 'message', (event: Event) => {
        const { data } = event as MessageEvent;
        record.messages.push({ type: token(field(data, 'type')), stage: token(field(data, 'stage')), jobId: integer(field(data, 'jobId')), at: ++sequence });
      });
      return worker;
    },
  });
  OriginalWorker.prototype.postMessage = function (this: Worker, ...args: Parameters<Worker['postMessage']>): void {
    const record = workers.get(this);
    if (record) {
      record.posts++;
      const job = integer(field(args[0], 'jobId'));
      if (field(args[0], 'type') === 'start' && job !== null) record.jobs.push(job);
    }
    (originalPost as (...values: unknown[]) => void).apply(this, args);
  } as Worker['postMessage'];
  OriginalWorker.prototype.terminate = function (this: Worker): void {
    const record = workers.get(this);
    if (record) {
      record.terminations++;
      record.terminatedAt ??= ++sequence;
    }
    originalTerminate.call(this);
  };
  window.osrProbe = {
    snapshot: () => ({
      document: documentId,
      listeners: listeners.map(({ id, target, type, capture, group, active, addedAt, removedAt, signal, element, object }) => ({
        id, target, type, capture, group, active: active && !signal?.aborted, addedAt, removedAt, element,
        detached: object instanceof Node && !object.isConnected,
      })),
      observers: [...observers].map(([observer, targets]) => ({ id: id(observer), targets: [...targets].map(id) })),
      canvases: [...canvases].map(([canvas, { gl, extension }]) => ({
        id: id(canvas), connected: canvas.isConnected, extension, lost: gl.isContextLost(),
      })),
      frames: { pending: pending(), maximum, requested, delivered, cancelled },
      timers: { pending: [...timers.values()].map(timer => ({ ...timer })), scheduled: timers.size + firedTimers.length + clearedTimers.length, fired: [...firedTimers], cleared: [...clearedTimers] },
      workers: workerRecords.map(record => ({ ...record, jobs: [...record.jobs], messages: record.messages.map(message => ({ ...message })) })),
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
      window.setTimeout = originalSetTimeout;
      window.clearTimeout = originalClearTimeout;
      window.Worker = OriginalWorker;
      OriginalWorker.prototype.terminate = originalTerminate;
      OriginalWorker.prototype.postMessage = originalPost;
    },
  };
}
