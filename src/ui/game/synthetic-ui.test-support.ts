import { ControlledHost } from '../../app/session/synthetic-session.test-support.ts';
import type { GameSessionError } from '../../app/session/session-errors.ts';
import {
  createSyntheticSession, type SessionCommandsCancelled, type SessionFrame, type SessionRun, type SyntheticSession,
} from '../../app/session/synthetic-session.ts';
import type { SyntheticRuntimeOptions } from '../../app/runtime/synthetic-runtime.ts';
import type { EventListener } from '../../app/runtime/synthetic-event-bus.ts';
import type { DomainEvent, MoveInput } from '../../core/synthetic/synthetic-scene.ts';
import {
  createSyntheticGameStore, type SyntheticGameState, type SyntheticGameStoreReader, type SyntheticGameStoreWriter,
} from './synthetic-game-store.ts';
import { createSyntheticCommandFeedback, type SyntheticCommandFeedback } from './synthetic-command-feedback.ts';
import { createSyntheticSessionBridge, type SyntheticRunConsumer } from './synthetic-session-bridge.ts';

/** Settable sampling clock; `failure` makes the next read throw. */
export class TestClock {
  now: unknown = 0;
  failure: unknown;
  readonly read = (): number => {
    if (this.failure !== undefined) throw this.failure;
    return this.now as number;
  };
}

/** Records the listeners the bridge registers, so tests can replay stale notifications. */
export interface RecordedListeners {
  readonly inputs: { readonly runId: number; readonly input: MoveInput }[];
  readonly frames: { readonly runId: number; readonly listener: (frame: SessionFrame) => undefined }[];
  readonly domain: { readonly runId: number; readonly listener: EventListener }[];
  readonly cancellations: { readonly runId: number; readonly listener: (notice: SessionCommandsCancelled) => undefined }[];
}

export function recordingSession(session: SyntheticSession): { session: SyntheticSession; recorded: RecordedListeners } {
  const recorded: RecordedListeners = { inputs: [], frames: [], domain: [], cancellations: [] };
  const wrappers = new WeakMap<SessionRun, SessionRun>();
  const wrap = (run: SessionRun): SessionRun => {
    const existing = wrappers.get(run);
    if (existing) return existing;
    const wrapper: SessionRun = Object.freeze({
      runId: run.runId,
      setInput: input => { recorded.inputs.push({ runId: run.runId, input }); run.setInput(input); },
      submitCommand: command => run.submitCommand(command),
      on<T extends DomainEvent['type']>(type: T, listener: EventListener<Extract<DomainEvent, { type: T }>>) { return run.on(type, listener); },
      onAny: listener => { recorded.domain.push({ runId: run.runId, listener }); return run.onAny(listener); },
      onFrame: listener => { recorded.frames.push({ runId: run.runId, listener }); return run.onFrame(listener); },
      onCommandsCancelled: listener => {
        recorded.cancellations.push({ runId: run.runId, listener });
        return run.onCommandsCancelled(listener);
      },
      ownCleanup: cleanup => run.ownCleanup(cleanup),
      renderFrame: () => run.renderFrame(),
      uiProjection: () => run.uiProjection(),
      exportRecording: () => run.exportRecording(),
    } satisfies SessionRun);
    wrappers.set(run, wrapper);
    return wrapper;
  };
  return {
    recorded,
    session: {
      control: control => session.control(control),
      status: () => session.status(),
      onStatus: listener => session.onStatus(listener),
      currentRun: () => {
        const run = session.currentRun();
        return run && wrap(run);
      },
    },
  };
}

export const SYNTHETIC_TEST_OPTIONS: SyntheticRuntimeOptions = { scene: { seed: 0, tickRateHz: 50 } };

/** A real session wired to a fresh store and bridge through a controlled host and clock. */
export function setupBridge(
  options: SyntheticRuntimeOptions = SYNTHETIC_TEST_OPTIONS,
  consumers: (writer: SyntheticGameStoreWriter) => readonly SyntheticRunConsumer[] = () => [],
) {
  const host = new ControlledHost(), clock = new TestClock(), writer = createSyntheticGameStore();
  const bridge = createSyntheticSessionBridge(writer, clock.read, consumers(writer));
  const errors: GameSessionError[] = [];
  const inner = createSyntheticSession(options, host, error => { errors.push(error); bridge.onError(error); });
  const { session, recorded } = recordingSession(inner);
  bridge.bind(session);
  const currentRun = () => {
    const run = inner.currentRun();
    if (!run) throw new Error('Expected a current run');
    return run;
  };
  return { host, clock, writer, reader: writer.reader, bridge, session: inner, observedSession: session, recorded, errors, currentRun };
}

/** Projection publications as `[tick, clock]`, in order. */
export function projectionLog(reader: SyntheticGameStoreReader, clock: TestClock): [number | null, unknown][] {
  const log: [number | null, unknown][] = [];
  reader.subscribe((state: SyntheticGameState, previous: SyntheticGameState) => {
    if (state.projection !== previous.projection) log.push([state.projection?.tick ?? null, clock.now]);
  });
  return log;
}

/** `setupBridge` with the command feedback consumer attached to every run. */
export function setupCommandFeedback(options: SyntheticRuntimeOptions = SYNTHETIC_TEST_OPTIONS) {
  let feedback: SyntheticCommandFeedback | undefined;
  const context = setupBridge(options, writer => [feedback = createSyntheticCommandFeedback(writer)]);
  if (!feedback) throw new Error('Expected command feedback');
  return { ...context, feedback };
}
