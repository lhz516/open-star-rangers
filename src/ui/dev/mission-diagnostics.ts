/**
 * The development diagnostics of one mission owner (docs/plan/p3/04/spec.md: S-07, 开发诊断; AC-22). An owner-level
 * resource at the `ui` stage: connected when the owner is created, it keeps a DOM-free state that the development panel
 * reads and that every new run clears:
 * - the event log of every domain event the run delivers (event-log.ts);
 * - frame statistics from the frame timing that wraps the owner's session host (frame-stats.ts, dev-frame-timing.ts);
 * - an entity and mission state view, read from a Core snapshot only when refreshed (entity-inspection.ts);
 * - the recording export: the run's Recording, taken synchronously outside the Session's notifications and saved as
 *   compact JSON through the owner's file save (recording-export.ts). A failed save keeps that copy for a retry.
 * It reads only through the public run handle and submits nothing itself: commands go through the command feedback.
 * A faulted run gives no new snapshot or export, while copies taken before stay valid; a stopped run still exports.
 * Changes are published at the UI's sampling interval, by the frame timing's own clock readings, and at once for status
 * changes, stops, timing failures and user actions. The run's recording, its Core state and its RNG never see it.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { FrameTiming, FrameTimingNotice } from '../../app/mission/dev-frame-timing.ts';
import type { MissionConsumerConnection, MissionOwnerConsumer, MissionOwnerContext, MissionRunContext } from '../../app/mission/mission-owner.ts';
import type { FileSave } from '../../app/mission/mission-ports.ts';
import type { GameSessionRun, GameSessionStatus } from '../../app/session/game-session.ts';
import { RollbackError } from '../../app/session/rollback-error.ts';
import type { GameSessionPhase } from '../../app/session/session-errors.ts';
import type { Recording } from '../../core/replay/recording.ts';
import { attemptAll, runCleanup } from '../../render/scene/cleanup.ts';
import { PROJECTION_SAMPLE_INTERVAL_MS } from '../game/game-session-bridge.ts';
import { inspectSnapshot, type InspectionView } from './entity-inspection.ts';
import { EventLog, type EventLogView } from './event-log.ts';
import { FrameStats, type FrameStatsView } from './frame-stats.ts';
import { recordingFile, type RecordingFile } from './recording-export.ts';

export interface InspectionState {
  /** The last snapshot view of the current run; a failed later read keeps it. */
  readonly view: InspectionView | null;
  /** Why the last read failed; null after a successful one. */
  readonly error: { readonly cause: unknown } | null;
}

/** How the last export or save ended. `requested` means the browser accepted a download request, not a written file. */
export type RecordingSaveStatus =
  | { readonly status: 'none' }
  | { readonly status: 'requested'; readonly name: string; readonly finalTick: number }
  | { readonly status: 'no-recording' }
  /** `export`: the run refused or failed the read; `file`: the name could not be built; `save`: the file save failed. */
  | { readonly status: 'failed'; readonly stage: 'export' | 'file' | 'save'; readonly cause: unknown };

export interface RecordingExportState {
  readonly last: RecordingSaveStatus;
  /** The copy a failed save kept for a retry; dropped when a save succeeds or the run ends. */
  readonly retained: { readonly name: string; readonly finalTick: number } | null;
}

export interface MissionDiagnosticsState {
  /** The run the diagnostics show; null without one. */
  readonly runId: number | null;
  readonly phase: GameSessionPhase | null;
  readonly log: EventLogView;
  readonly frames: FrameStatsView;
  readonly inspection: InspectionState;
  readonly recording: RecordingExportState;
}

export type MissionDiagnosticsReader = Pick<StoreApi<MissionDiagnosticsState>, 'getState' | 'getInitialState' | 'subscribe'>;

/** User actions, for event handlers rather than Session notifications; each is ignored where it does not apply. */
export interface MissionDiagnosticsActions {
  clearLog(): void;
  /** Reads one snapshot of the current run; ignored without a run and once it faulted. */
  refreshSnapshot(): void;
  /** Takes the recording so far and saves it; ignored without a run and once it faulted. */
  exportRecording(): void;
  /** Saves the copy a failed save kept again, also once the run faulted. */
  retrySave(): void;
}

export interface MissionDiagnostics extends MissionDiagnosticsActions {
  /** The owner consumer, stage `ui`; one owner connects it, once. */
  readonly consumer: MissionOwnerConsumer;
  readonly reader: MissionDiagnosticsReader;
}

export interface MissionDiagnosticsOptions {
  /** The timing whose host the owner's session uses. */
  readonly timing: Pick<FrameTiming, 'subscribe'>;
  /** Creates the owner's file save on connection; the release disposes it. */
  readonly fileSave: () => FileSave;
}

/** Snapshots and exports need a run that has not faulted. */
export const selectCanRead = (state: MissionDiagnosticsState): boolean => state.runId !== null && state.phase !== 'faulted';
export const selectCanRetry = (state: MissionDiagnosticsState): boolean => state.recording.retained !== null;

const NO_INSPECTION: InspectionState = Object.freeze({ view: null, error: null });
const NO_EXPORT: RecordingExportState = Object.freeze({ last: Object.freeze({ status: 'none' }), retained: null });

class Diagnostics implements MissionDiagnostics {
  readonly consumer: MissionOwnerConsumer;
  readonly reader: MissionDiagnosticsReader;
  readonly #store: StoreApi<MissionDiagnosticsState>;
  readonly #options: MissionDiagnosticsOptions;
  #state: 'unconnected' | 'connected' | 'released' = 'unconnected';
  #context: MissionOwnerContext | null = null;
  #fileSave: FileSave | null = null;
  #cleanups: (() => unknown)[] = [];
  #runId: number | null = null;
  #phase: GameSessionPhase | null = null;
  readonly #log = new EventLog();
  readonly #frames = new FrameStats();
  #inspection: InspectionState = NO_INSPECTION;
  #recording: RecordingExportState = NO_EXPORT;
  #retained: RecordingFile | null = null;
  #lastPublishMs: number | null = null;

  constructor(options: MissionDiagnosticsOptions) {
    this.#options = options;
    this.#store = createStore<MissionDiagnosticsState>()(() => this.#build(null));
    const { getState, getInitialState, subscribe } = this.#store;
    this.reader = Object.freeze({ getState, getInitialState, subscribe });
    this.consumer = Object.freeze({ stage: 'ui', connect: (context: MissionOwnerContext) => this.#connect(context) });
  }

  clearLog(): void {
    if (this.#state !== 'connected') return;
    this.#log.clear();
    this.#publish();
  }

  refreshSnapshot(): void {
    const run = this.#readableRun();
    if (!run) return;
    try {
      this.#inspection = Object.freeze({ view: inspectSnapshot(run.snapshot(), run.runId), error: null });
    } catch (cause) {
      this.#inspection = Object.freeze({ view: this.#inspection.view, error: Object.freeze({ cause }) });
    }
    this.#publish();
  }

  exportRecording(): void {
    const run = this.#readableRun();
    if (!run) return;
    let recording: Recording | null;
    try {
      recording = run.exportRecording();
    } catch (cause) {
      return this.#settle({ status: 'failed', stage: 'export', cause }, this.#retained);
    }
    if (recording === null) return this.#settle({ status: 'no-recording' }, this.#retained);
    let file: RecordingFile;
    try {
      file = recordingFile(recording);
    } catch (cause) {
      return this.#settle({ status: 'failed', stage: 'file', cause }, this.#retained);
    }
    this.#save(file);
  }

  retrySave(): void {
    if (this.#state === 'connected' && this.#retained) this.#save(this.#retained);
  }

  #connect(context: MissionOwnerContext): MissionConsumerConnection {
    if (this.#state !== 'unconnected') throw new Error('Mission diagnostics serve one owner');
    const fileSave = this.#options.fileSave();
    const cleanups: (() => unknown)[] = [() => fileSave.dispose()];
    try {
      cleanups.push(context.session.onStatus((status) => { this.#onStatus(status); }));
      cleanups.push(this.#options.timing.subscribe((notice) => { this.#onTiming(notice); }));
    } catch (cause) {
      const errors = attemptAll(cleanups.reverse());
      if (errors.length > 0) throw new RollbackError(cause, errors, 'Mission diagnostics connection and rollback failed');
      throw cause;
    }
    this.#state = 'connected';
    this.#context = context;
    this.#fileSave = fileSave;
    this.#cleanups = cleanups;
    this.#sync(context.session.status());
    this.#publish();
    return {
      release: () => { this.#release(); },
      attachRun: (run: GameSessionRun, { runId }: MissionRunContext) => { this.#attachRun(run, runId); },
    };
  }

  #attachRun(run: GameSessionRun, runId: number): void {
    if (this.#state !== 'connected') return;
    this.#enter(runId);
    run.ownCleanup(run.onAny((event, delivery) => {
      if (this.#runId === runId) this.#log.append(event, delivery);
      return undefined;
    }));
    this.#publish();
  }

  #release(): void {
    if (this.#state !== 'connected') return;
    this.#state = 'released';
    const cleanups = this.#cleanups.reverse();
    this.#cleanups = [];
    this.#context = null;
    this.#fileSave = null;
    this.#retained = null;
    runCleanup(cleanups, 'Mission diagnostics release failed');
  }

  /** A status notification: never controls the session. */
  #onStatus(status: GameSessionStatus): void {
    if (this.#state !== 'connected') return;
    this.#sync(status);
    this.#publish();
  }

  #sync({ phase, runId }: GameSessionStatus): void {
    this.#phase = phase;
    if (runId !== null) {
      this.#enter(runId);
    } else if (this.#runId !== null) {
      // The run ended: its snapshot and recording copies go with it; the log and frames stay until the next run.
      this.#runId = null;
      this.#inspection = NO_INSPECTION;
      this.#recording = NO_EXPORT;
      this.#retained = null;
    }
  }

  /** Begins showing `runId`, clearing what belonged to an earlier run. */
  #enter(runId: number): void {
    if (this.#runId === runId) return;
    this.#runId = runId;
    this.#log.clear();
    this.#frames.clear();
    this.#inspection = NO_INSPECTION;
    this.#recording = NO_EXPORT;
    this.#retained = null;
    this.#lastPublishMs = null;
  }

  #onTiming(notice: FrameTimingNotice): void {
    if (this.#state !== 'connected' || notice.runId !== this.#runId) return;
    if (notice.type === 'clock-failed') {
      this.#frames.fail(notice.cause);
      this.#publish();
      return;
    }
    this.#frames.add(notice.sample);
    const last = this.#lastPublishMs;
    if (last === null || notice.endMs - last >= PROJECTION_SAMPLE_INTERVAL_MS || notice.stop !== null) {
      this.#lastPublishMs = notice.endMs;
      this.#publish();
    }
  }

  /** The current run, unless there is none or it faulted. */
  #readableRun(): GameSessionRun | null {
    const session = this.#state === 'connected' ? this.#context?.session : null;
    if (!session || session.status().phase === 'faulted') return null;
    return session.currentRun();
  }

  #save(file: RecordingFile): void {
    let failure: { readonly cause: unknown } | null = null;
    try {
      const result = this.#fileSave!.save(file.name, file.text);
      if (result.status !== 'requested') failure = { cause: 'error' in result ? result.error : new Error(`The file save was ${result.reason}`) };
    } catch (cause) {
      failure = { cause };
    }
    if (failure) this.#settle({ status: 'failed', stage: 'save', cause: failure.cause }, file);
    else this.#settle({ status: 'requested', name: file.name, finalTick: file.finalTick }, null);
  }

  #settle(last: RecordingSaveStatus, retained: RecordingFile | null): void {
    this.#retained = retained;
    this.#recording = Object.freeze({
      last: Object.freeze(last),
      retained: retained && Object.freeze({ name: retained.name, finalTick: retained.finalTick }),
    });
    this.#publish();
  }

  #build(previous: MissionDiagnosticsState | null): MissionDiagnosticsState {
    const next = {
      runId: this.#runId,
      phase: this.#phase,
      log: this.#log.view(),
      frames: this.#frames.view(),
      inspection: this.#inspection,
      recording: this.#recording,
    };
    if (previous && (Object.keys(next) as (keyof MissionDiagnosticsState)[]).every((key) => next[key] === previous[key])) return previous;
    return Object.freeze(next);
  }

  #publish(): void {
    const previous = this.#store.getState();
    const next = this.#build(previous);
    if (next !== previous) this.#store.setState(next, true);
  }
}

/**
 * Creates the diagnostics of one owner. Pass `consumer` to the owner setup together with the timing's consumer, and
 * give `reader` and the actions to the development panel.
 */
export function createMissionDiagnostics(options: MissionDiagnosticsOptions): MissionDiagnostics {
  if (typeof options?.timing?.subscribe !== 'function') throw new TypeError('Mission diagnostics need a frame timing');
  if (typeof options.fileSave !== 'function') throw new TypeError('Mission diagnostics need a file save factory');
  return new Diagnostics(options);
}
