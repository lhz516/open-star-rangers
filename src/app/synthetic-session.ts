import type { Command, DomainEvent, MoveInput, SyntheticUiProjection } from '../core/synthetic-scene.ts';
import type { SyntheticRecording } from '../core/synthetic-replay.ts';
import { GameSessionError, type SessionErrorListener, type SessionFailure, type SessionPhase } from './session-errors.ts';
import type { SessionCleanup, SessionHost, SessionLifecycleEvent } from './session-host.ts';
import { GameRuntimeError } from './runtime-errors.ts';
import { createSyntheticRuntime, type RenderFrame, type SyntheticRuntime, type SyntheticRuntimeOptions } from './synthetic-runtime.ts';
import type { EventListener } from './synthetic-event-bus.ts';

export type SessionControl = { readonly type: 'start' | 'pause' | 'resume' | 'restart' | 'exit' | 'dispose' };
export interface SessionStatus {
  readonly phase: SessionPhase;
  readonly runId: number | null;
  readonly environmentVisible: boolean;
  readonly pauseReason: 'user' | 'hidden' | null;
  readonly cleanupFailed: boolean;
  readonly error: GameSessionError | null;
}
export interface SessionFrame {
  readonly runId: number;
  readonly phase: 'running' | 'paused';
  readonly render: RenderFrame;
  readonly projection: SyntheticUiProjection;
  readonly report: Readonly<{ ticks: number; capped: boolean }> | null;
}
export interface SessionRun {
  readonly runId: number;
  setInput(input: MoveInput): void;
  submitCommand(command: Command): number;
  on<T extends DomainEvent['type']>(type: T, listener: EventListener<Extract<DomainEvent, { type: T }>>): SessionCleanup;
  onAny(listener: EventListener): SessionCleanup;
  onFrame(listener: (frame: SessionFrame) => undefined): SessionCleanup;
  renderFrame(): RenderFrame;
  uiProjection(): SyntheticUiProjection;
  exportRecording(): SyntheticRecording | null;
}
export interface SyntheticSession {
  control(control: SessionControl): void;
  status(): SessionStatus;
  currentRun(): SessionRun | null;
  onStatus(listener: (status: SessionStatus) => undefined): SessionCleanup;
}

function invalid(path: string, reason: string, cause?: unknown): never {
  throw new GameSessionError({ kind: 'invalid-argument', path, reason, cause });
}
function object(value: unknown, path: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(path, 'must be an object');
}
function listenerRequired(listener: unknown, path: string): void {
  if (typeof listener !== 'function') invalid(path, 'must be a synchronous function');
}
function runtimeArgument(cause: GameRuntimeError, path = cause.path ?? 'runtime'): GameSessionError {
  return new GameSessionError({
    kind: 'invalid-argument', path, reason: cause.reason ?? cause.message, cause,
  });
}
function copyOptions(options: SyntheticRuntimeOptions): SyntheticRuntimeOptions {
  object(options, 'runtimeOptions');
  try {
    const { scene, recording, ...rest } = options;
    object(scene, 'runtimeOptions.scene');
    if (recording !== undefined) object(recording, 'runtimeOptions.recording');
    const copy = {
      ...rest, scene: Object.freeze({ ...scene }),
      ...(recording === undefined ? {} : { recording: Object.freeze({ ...recording }) }),
    };
    createSyntheticRuntime(copy);
    return Object.freeze(copy);
  } catch (cause) {
    if (cause instanceof GameSessionError) throw cause;
    if (cause instanceof GameRuntimeError && cause.kind === 'invalid-argument') {
      throw runtimeArgument(cause, (cause.path ?? 'options').replace(/^options/, 'runtimeOptions'));
    }
    invalid('runtimeOptions', 'could not read or validate configuration', cause);
  }
}

class Subscribers<T> {
  readonly #listeners = new Map<symbol, (value: T) => undefined>();
  get empty(): boolean { return this.#listeners.size === 0; }
  add(listener: (value: T) => undefined): SessionCleanup {
    const id = Symbol();
    this.#listeners.set(id, listener);
    const remove = this.#listeners.delete.bind(this.#listeners, id);
    return () => { remove(); };
  }
  notify(value: T, cancelFailed = false): unknown[] {
    const errors: unknown[] = [];
    for (const [id, listener] of [...this.#listeners]) {
      if (!this.#listeners.has(id)) continue;
      try { listener(value); } catch (cause) {
        errors.push(cause);
        if (cancelFailed) this.#listeners.delete(id);
      }
    }
    return errors;
  }
  clear(): void { this.#listeners.clear(); }
}

class RunData {
  readonly id: number;
  runtime: SyntheticRuntime | null;
  readonly frames = new Subscribers<SessionFrame>();
  readonly handle: SessionRun;
  constructor(owner: Session, runtime: SyntheticRuntime, id: number) {
    this.id = id; this.runtime = runtime; this.handle = Object.freeze(new Run(owner, this));
  }
}
interface Request {
  readonly run: RunData;
  handle: number | null;
}

class Run implements SessionRun {
  readonly runId: number;
  readonly #owner: Session;
  readonly #data: RunData;
  constructor(owner: Session, data: RunData) { this.#owner = owner; this.#data = data; this.runId = data.id; }
  setInput(input: MoveInput): void { this.#owner.input(this.#data, runtime => runtime.setInput(input)); }
  submitCommand(command: Command): number { return this.#owner.input(this.#data, runtime => runtime.submitCommand(command)); }
  on<T extends DomainEvent['type']>(type: T, listener: EventListener<Extract<DomainEvent, { type: T }>>): SessionCleanup {
    const cancel = this.#owner.subscribe(this.#data, runtime => runtime.on(type, listener));
    return () => { cancel(); };
  }
  onAny(listener: EventListener): SessionCleanup {
    const cancel = this.#owner.subscribe(this.#data, runtime => runtime.onAny(listener));
    return () => { cancel(); };
  }
  onFrame(listener: (frame: SessionFrame) => undefined): SessionCleanup {
    this.#owner.requireRun(this.#data, 'onFrame', true);
    listenerRequired(listener, 'onFrame.listener');
    return this.#data.frames.add(listener);
  }
  renderFrame(): RenderFrame { return this.#owner.requireRun(this.#data, 'renderFrame').renderFrame(); }
  uiProjection(): SyntheticUiProjection { return this.#owner.requireRun(this.#data, 'uiProjection').uiProjection(); }
  exportRecording(): SyntheticRecording | null { return this.#owner.requireRun(this.#data, 'exportRecording').exportRecording(); }
}

class Session implements SyntheticSession {
  readonly #options: SyntheticRuntimeOptions;
  readonly #host: SessionHost;
  readonly #onError: SessionErrorListener;
  readonly #statuses = new Subscribers<SessionStatus>();
  #unsubscribe: SessionCleanup | null = null;
  #phase: SessionPhase = 'idle';
  #run: RunData | null = null;
  #nextId = 1;
  #visible = true;
  #pageHidden = false;
  #pauseReason: SessionStatus['pauseReason'] = null;
  #cleanupFailed = false;
  #error: GameSessionError | null = null;
  #request: Request | null = null;
  #busy = false;
  #errors: SessionFailure[] = [];
  #lastStatus: SessionStatus | null = null;

  constructor(options: SyntheticRuntimeOptions, host: SessionHost, onError: SessionErrorListener) {
    this.#options = options; this.#host = host; this.#onError = onError;
    try {
      this.#visible = this.#readVisibility();
      this.#unsubscribe = host.subscribeLifecycle(event => { this.#boundary(() => this.#lifecycle(event), true); });
      if (typeof this.#unsubscribe !== 'function') throw new TypeError('subscribeLifecycle must return a cancellation function');
    } catch (cause) {
      throw new GameSessionError({ kind: 'operation-failed', failures: [{ phase: 'scheduler', cause }] });
    }
    this.#lastStatus = this.status();
  }
  status(): SessionStatus {
    return Object.freeze({
      phase: this.#phase, runId: this.#run?.id ?? null, environmentVisible: this.#visible && !this.#pageHidden,
      pauseReason: this.#pauseReason, cleanupFailed: this.#cleanupFailed, error: this.#error,
    });
  }
  currentRun(): SessionRun | null { return this.#run?.handle ?? null; }
  onStatus(listener: (status: SessionStatus) => undefined): SessionCleanup {
    if (this.#phase === 'disposed') throw this.#stateError('onStatus', 'controller is disposed');
    listenerRequired(listener, 'onStatus.listener');
    return this.#statuses.add(listener);
  }
  control(control: SessionControl): void {
    object(control, 'control');
    const { type } = control;
    if (Object.keys(control).some(key => key !== 'type') || !['start', 'pause', 'resume', 'restart', 'exit', 'dispose'].includes(type)) {
      invalid('control', 'must contain only a known type');
    }
    if (this.#busy) throw this.#stateError(type, 'control during notification is not available');
    this.#boundary(() => this.#control(type), false);
  }
  requireRun(data: RunData, operation: string, registering = false): SyntheticRuntime {
    if (data !== this.#run || !data.runtime) throw this.#stateError(operation, 'run has ended');
    if (registering && this.#phase !== 'running' && this.#phase !== 'paused') throw this.#stateError(operation, 'run is not accepting consumers');
    return data.runtime;
  }
  input<T>(data: RunData, action: (runtime: SyntheticRuntime) => T): T {
    const runtime = this.requireRun(data, 'input');
    if (this.#phase !== 'running') throw this.#stateError('input', 'run is not running');
    try { return action(runtime); } catch (cause) {
      if (cause instanceof GameRuntimeError && cause.kind === 'invalid-argument') throw runtimeArgument(cause);
      this.#boundary(() => this.#fault('runtime', cause), false);
      throw cause;
    }
  }
  subscribe(data: RunData, action: (runtime: SyntheticRuntime) => () => void): () => void {
    const runtime = this.requireRun(data, 'subscribe', true);
    try { return action(runtime); } catch (cause) {
      if (cause instanceof GameRuntimeError && cause.kind === 'invalid-argument') throw runtimeArgument(cause);
      throw cause;
    }
  }
  #stateError(operation: string, reason: string): GameSessionError {
    return new GameSessionError({ kind: 'invalid-state', operation, phase: this.#phase, runId: this.#run?.id ?? null, reason });
  }
  #readVisibility(): boolean {
    const visibility = this.#host.readVisibility();
    if (visibility !== 'visible' && visibility !== 'hidden') throw new TypeError('readVisibility must return visible or hidden');
    return visibility === 'visible';
  }
  #boundary(action: () => void, asynchronous: boolean): void {
    this.#busy = true; this.#errors = [];
    try {
      action();
      this.#publishStatus();
      this.#ensureRequest();
      this.#publishStatus();
      if (this.#errors.length > 0) {
        const error = new GameSessionError({ kind: 'operation-failed', failures: this.#errors });
        this.#error = error;
        if (!asynchronous) throw error;
        try { this.#onError(error); } catch (cause) {
          throw new AggregateError([error, cause], 'Session error outlet failed', { cause });
        }
      }
    } finally { this.#busy = false; }
  }
  #control(type: SessionControl['type']): void {
    if (type === 'dispose') {
      if (this.#phase === 'disposed') return;
      this.#end();
      const cancel = this.#unsubscribe; this.#unsubscribe = null;
      if (cancel) this.#attemptCleanup(cancel);
      this.#phase = 'disposed'; this.#pauseReason = null;
      this.#publishStatus(); this.#statuses.clear();
      return;
    }
    if (this.#phase === 'disposed') throw this.#stateError(type, 'controller is disposed');
    if (type === 'start') {
      if (this.#phase === 'running' || this.#phase === 'paused') return;
      if (this.#phase !== 'idle') throw this.#stateError(type, 'start requires idle');
      this.#allocate(type); return;
    }
    if (type === 'exit') {
      if (this.#phase === 'idle') return;
      this.#end(); this.#run = null; this.#phase = 'idle'; this.#pauseReason = null; return;
    }
    if (type === 'restart') {
      if (!this.#run) throw this.#stateError(type, 'restart requires a run');
      this.#canAllocate(type);
      this.#end(false);
      if (this.#cleanupFailed) { this.#phase = 'faulted'; return; }
      this.#run.runtime = null;
      this.#run = null; this.#phase = 'idle'; this.#allocate(type); return;
    }
    if (type === 'pause') {
      if (this.#phase === 'paused') return;
      if (this.#phase !== 'running') throw this.#stateError(type, 'pause requires running');
      this.#pause('user'); return;
    }
    if (this.#phase === 'running') return;
    if (this.#phase !== 'paused') throw this.#stateError(type, 'resume requires a visible paused run');
    try { this.#visible = this.#readVisibility(); } catch (cause) { this.#fault('scheduler', cause); return; }
    if (!this.status().environmentVisible) throw this.#stateError(type, 'resume requires a visible paused run');
    this.#run?.runtime?.resetClock(); this.#phase = 'running'; this.#pauseReason = null;
  }
  #canAllocate(operation: string): void {
    if (this.#cleanupFailed) throw this.#stateError(operation, 'cleanup previously failed');
    if (this.#nextId === Number.MAX_SAFE_INTEGER) throw this.#stateError(operation, 'runId exhausted');
  }
  #allocate(operation: string): void {
    this.#canAllocate(operation);
    try { this.#visible = this.#readVisibility(); } catch (cause) { this.#fault('scheduler', cause); return; }
    let runtime: SyntheticRuntime;
    try { runtime = createSyntheticRuntime(this.#options); } catch (cause) { this.#fault('runtime', cause); return; }
    const data = new RunData(this, runtime, this.#nextId++);
    this.#run = data; this.#error = null;
    this.#phase = this.status().environmentVisible ? 'running' : 'paused';
    this.#pauseReason = this.#phase === 'paused' ? 'hidden' : null;
  }
  #pause(reason: 'user' | 'hidden'): void {
    this.#phase = 'paused'; this.#pauseReason = reason;
    this.#stopRequest();
    this.#run?.runtime?.clearIntent(); this.#run?.runtime?.foldRenderState();
    this.#notifyFrame(null);
  }
  #end(drop = true): void {
    this.#stopRequest();
    const run = this.#run;
    if (!run?.runtime) return;
    run.runtime.clearIntent(); run.runtime.foldRenderState(); run.runtime.clearSubscriptions(); run.frames.clear();
    if (drop) run.runtime = null;
  }
  #attemptCleanup(cleanup: () => void): void {
    try { cleanup(); } catch (cause) {
      this.#cleanupFailed = true; this.#errors.push({ phase: 'cleanup', cause });
      this.#error = new GameSessionError({ kind: 'operation-failed', failures: this.#errors });
    }
  }
  #stopRequest(): void {
    const request = this.#request; this.#request = null;
    const handle = request?.handle;
    if (handle !== null && handle !== undefined) this.#attemptCleanup(() => this.#host.cancelFrame(handle));
  }
  #ensureRequest(): void {
    if (this.#phase !== 'running' || this.#request || !this.#run) return;
    const request: Request = { run: this.#run, handle: null };
    this.#request = request;
    try {
      const handle = this.#host.requestFrame(now => { this.#frame(request, now); });
      if (!Number.isSafeInteger(handle) || handle < 0) throw new TypeError('requestFrame must return a nonnegative safe integer');
      request.handle = handle;
    } catch (cause) { this.#request = null; this.#fault('scheduler', cause); }
  }
  #frame(request: Request, nowMs: number): void {
    if (request !== this.#request || request.run !== this.#run || this.#phase !== 'running') return;
    this.#request = null;
    this.#boundary(() => {
      try { this.#visible = this.#readVisibility(); } catch (cause) { this.#fault('scheduler', cause); return; }
      if (!this.status().environmentVisible) { this.#pause('hidden'); return; }
      let report: SessionFrame['report'];
      try { report = request.run.runtime!.frame(nowMs); } catch (cause) {
        const phase = cause instanceof GameRuntimeError && cause.kind === 'listener-failed' ? 'consumer'
          : cause instanceof GameRuntimeError && cause.kind === 'invalid-argument' ? 'scheduler' : 'runtime';
        this.#fault(phase, cause); return;
      }
      this.#notifyFrame(report);
    }, true);
  }
  #notifyFrame(report: SessionFrame['report']): void {
    const run = this.#run;
    if (!run?.runtime || run.frames.empty || (this.#phase !== 'running' && this.#phase !== 'paused')) return;
    const frame: SessionFrame = Object.freeze({
      runId: run.id, phase: this.#phase, render: run.runtime.renderFrame(), projection: run.runtime.uiProjection(), report,
    });
    for (const cause of run.frames.notify(frame)) this.#fault('consumer', cause);
  }
  #publishStatus(): void {
    const status = this.status(), previous = this.#lastStatus;
    if (previous && Object.keys(status).every(key => status[key as keyof SessionStatus] === previous[key as keyof SessionStatus])) return;
    this.#lastStatus = status;
    for (const cause of this.#statuses.notify(status, true)) this.#fault('consumer', cause);
  }
  #fault(phase: SessionFailure['phase'], cause: unknown): void {
    this.#errors.push({ phase, cause });
    this.#error = new GameSessionError({ kind: 'operation-failed', failures: this.#errors });
    if (this.#run) {
      this.#phase = 'faulted'; this.#pauseReason = null; this.#end(false);
    }
  }
  #lifecycle(event: SessionLifecycleEvent): void {
    if (this.#phase === 'disposed') return;
    if (event.type === 'pagehide') this.#pageHidden = true;
    else if (event.type === 'pageshow') {
      this.#pageHidden = false;
      try { this.#visible = this.#readVisibility(); } catch (cause) { this.#fault('scheduler', cause); return; }
    } else this.#visible = event.visibility === 'visible';
    if (this.#phase === 'running' && !this.status().environmentVisible) this.#pause('hidden');
  }
}

export function createSyntheticSession(options: SyntheticRuntimeOptions, host: SessionHost, onError: SessionErrorListener): SyntheticSession {
  const copy = copyOptions(options);
  object(host, 'host');
  for (const method of ['requestFrame', 'cancelFrame', 'readVisibility', 'subscribeLifecycle'] as const) listenerRequired(host[method], `host.${method}`);
  listenerRequired(onError, 'onError');
  return new Session(copy, host, onError);
}
