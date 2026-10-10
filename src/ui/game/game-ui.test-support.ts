import type { GameEventListener } from '../../app/runtime/game-event-bus.ts';
import { TICK_MS } from '../../app/runtime/game-runtime.test-support.ts';
import { createGameSession, type GameCommandsCancelled, type GameSession, type GameSessionFrame, type GameSessionRun } from '../../app/session/game-session.ts';
import type { GameSessionError } from '../../app/session/session-errors.ts';
import { current, runSpec, type RunSpecParts } from '../../app/session/game-session.test-support.ts';
import { ControlledHost } from '../../app/session/session-host.test-support.ts';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import type { Projection } from '../../core/projections/projection.ts';
import { createGameCommandFeedback, type GameCommandFeedback } from './game-command-feedback.ts';
import { createGameSessionBridge, type GameRunConsumer } from './game-session-bridge.ts';
import { createGameStore, type GameStoreReader, type GameStoreWriter, type GameUiState } from './game-store.ts';

// Formal UI fixtures for Node tests: a real Session on a ControlledHost, a settable sampling clock, and a Session
// wrapper that records the listeners run consumers register, so tests can replay late notifications or deliver typed
// doubles of results Core does not produce yet.

/** Settable sampling clock; `failure` makes the next read throw. */
export class TestClock {
  now: unknown = 0;
  failure: unknown;
  reads = 0;
  readonly read = (): number => {
    this.reads++;
    if (this.failure !== undefined) throw this.failure;
    return this.now as number;
  };
}

export interface RecordedListeners {
  readonly frames: { readonly runId: number; readonly listener: (frame: GameSessionFrame) => undefined }[];
  readonly results: { readonly runId: number; readonly listener: GameEventListener }[];
  readonly cancellations: { readonly runId: number; readonly listener: (notice: GameCommandsCancelled) => undefined }[];
}

/** A view of `session` whose run handles record what consumers register through them. */
export function recordingSession(session: GameSession): { session: GameSession; recorded: RecordedListeners } {
  const recorded: RecordedListeners = { frames: [], results: [], cancellations: [] };
  const wrappers = new WeakMap<GameSessionRun, GameSessionRun>();
  const wrap = (run: GameSessionRun): GameSessionRun => {
    const existing = wrappers.get(run);
    if (existing) return existing;
    const { runId } = run;
    const wrapper: GameSessionRun = Object.freeze({
      runId,
      setIntent: (intent) => { run.setIntent(intent); },
      submitCommand: (command) => run.submitCommand(command),
      on<T extends DomainEvent['type']>(type: T, listener: GameEventListener<Extract<DomainEvent, { type: T }>>) {
        if (type === 'command-result') recorded.results.push({ runId, listener: listener as GameEventListener });
        return run.on(type, listener);
      },
      onAny: (listener) => run.onAny(listener),
      onFrame: (listener) => { recorded.frames.push({ runId, listener }); return run.onFrame(listener); },
      onCommandsCancelled: (listener) => { recorded.cancellations.push({ runId, listener }); return run.onCommandsCancelled(listener); },
      ownCleanup: (cleanup) => run.ownCleanup(cleanup),
      projection: () => run.projection(),
      renderFrame: () => run.renderFrame(),
      snapshot: () => run.snapshot(),
      exportRecording: () => run.exportRecording(),
    } satisfies GameSessionRun);
    wrappers.set(run, wrapper);
    return wrapper;
  };
  return {
    recorded,
    session: {
      control: (control) => { session.control(control); },
      status: () => session.status(),
      onStatus: (listener) => session.onStatus(listener),
      currentRun: () => {
        const run = session.currentRun();
        return run && wrap(run);
      },
    },
  };
}

export interface BridgeSetupOptions {
  readonly ownerId?: number;
  readonly consumers?: (store: GameStoreWriter) => readonly GameRunConsumer[];
  readonly host?: ControlledHost;
}

/** A real idle Session wired to a fresh store and bound bridge through a controlled host and clock. */
export function setupBridge({ ownerId = 1, consumers = () => [], host = new ControlledHost() }: BridgeSetupOptions = {}) {
  const clock = new TestClock(), store = createGameStore(ownerId);
  const bridge = createGameSessionBridge({ store, clock: clock.read, consumers: consumers(store) });
  const errors: GameSessionError[] = [];
  const inner = createGameSession(host, (error) => { errors.push(error); bridge.onError(error); });
  const { session, recorded } = recordingSession(inner);
  bridge.bind(session);
  return { host, clock, store, reader: store.reader, bridge, session: inner, recorded, errors, currentRun: () => current(inner) };
}

/** `setupBridge` with the command feedback attached to every run. */
export function setupFeedback(options: Omit<BridgeSetupOptions, 'consumers'> = {}) {
  let feedback!: GameCommandFeedback;
  const context = setupBridge({ ...options, consumers: (store) => [feedback = createGameCommandFeedback(store)] });
  return { ...context, feedback };
}

/**
 * `setupFeedback` with a run started from `parts` and its first frame anchored at host time and clock 0. `frame`
 * delivers the next frame `ticks` later, read at sampling clock `clockMs` (by default not yet due).
 */
export function startedFeedback(options: Omit<BridgeSetupOptions, 'consumers'> = {}, parts: RunSpecParts = {}) {
  const context = setupFeedback(options);
  context.session.control({ type: 'start', spec: runSpec(parts) });
  context.host.deliver(0);
  let hostMs = 0;
  const frame = (ticks = 1, clockMs = 1) => {
    hostMs += ticks * TICK_MS;
    context.clock.now = clockMs;
    context.host.deliver(hostMs);
  };
  return { ...context, frame };
}

/** Projection publications as `[tick, clock]`, in order. */
export function projectionLog(reader: GameStoreReader, clock: TestClock): [number | null, unknown][] {
  const log: [number | null, unknown][] = [];
  reader.subscribe((state: GameUiState, previous: GameUiState) => {
    if (state.projection !== previous.projection) log.push([state.projection?.clock.tick ?? null, clock.now]);
  });
  return log;
}

/** Every state written from now on. */
export function history(reader: GameStoreReader): GameUiState[] {
  const states: GameUiState[] = [];
  reader.subscribe((state) => { states.push(state); });
  return states;
}

/** A frozen copy of `projection` at `tick`, with partitions replaced; a typed double of a later Core read model. */
export function projectionDouble(projection: Projection, tick: number, parts: Partial<Omit<Projection, 'clock'>> = {}): Projection {
  return Object.freeze({ ...projection, ...parts, clock: Object.freeze({ ...projection.clock, tick }) });
}

/** A frozen running frame of `run` showing `projection`. */
export function frameDouble(run: GameSessionRun, projection: Projection, report: GameSessionFrame['report'] = Object.freeze({ ticks: 1, capped: false, stop: null })): GameSessionFrame {
  return Object.freeze({ runId: run.runId, phase: 'running', render: run.renderFrame(), projection, report });
}
