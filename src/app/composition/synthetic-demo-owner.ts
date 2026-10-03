/**
 * One owner of the P1 synthetic demo. It creates the UI store, session bridge, command feedback,
 * controls, renderer and session for a supplied host and sampling clock, and disposes them together.
 * It is DOM-free, does not start the session, and keeps no global registry: whoever holds an owner
 * disposes it before creating the next. Contracts: docs/plan/p1/06/spec.md, docs/plan/p1/07/spec.md.
 */
import type { SyntheticRuntimeOptions } from '../runtime/synthetic-runtime.ts';
import { RollbackError } from '../session/rollback-error.ts';
import type { SessionCleanup, SessionHost } from '../session/session-host.ts';
import { createSyntheticSession, type SyntheticSession } from '../session/synthetic-session.ts';
import { attemptAll } from '../../render/scene/cleanup.ts';
import {
  createSyntheticRenderer, type SyntheticRenderer, type SyntheticRendererOptions, type SyntheticRendererReader,
} from '../../render/synthetic/synthetic-renderer.ts';
import { createSyntheticCommandFeedback } from '../../ui/game/synthetic-command-feedback.ts';
import {
  createSyntheticGameControls, createSyntheticPanelDispatcher, type SyntheticPanelAction,
} from '../../ui/game/synthetic-game-controls.ts';
import { createSyntheticGameStore, type SyntheticGameStoreReader } from '../../ui/game/synthetic-game-store.ts';
import { createSyntheticSessionBridge, type SamplingClock } from '../../ui/game/synthetic-session-bridge.ts';

/** Fixed seed and Core's default tick rate for the demo; invented values, not original-game rules. */
export const SYNTHETIC_DEMO_OPTIONS: SyntheticRuntimeOptions = Object.freeze({ scene: Object.freeze({ seed: 0 }) });

/** The owner's first cleanup failure; the record is frozen, its cause is not. */
export type SyntheticDemoCleanupFailure = Readonly<{ cause: unknown }>;

export interface SyntheticDemoOwner {
  readonly store: SyntheticGameStoreReader;
  /** The renderer's read-only state and diagnostics. */
  readonly renderer: SyntheticRendererReader;
  /** Runs a panel action. Ignored after dispose or a failed initialization, which the store reports. */
  dispatch(action: SyntheticPanelAction): void;
  /**
   * Disposes the session, then releases the bridge, then the renderer; idempotent. Every cleanup is
   * attempted; any failure is gathered into one AggregateError, written as actionError and thrown.
   */
  dispose(): void;
  /**
   * The first error that included a cleanup failure: a failed initialization rollback (a
   * RollbackError), the session's error when its status first reported cleanupFailed or a
   * RollbackError from a run consumer, or the error a failed dispose threw. Never replaced or cleared, and still readable after dispose. Null
   * while every cleanup has succeeded, whatever else failed.
   */
  cleanupFailure(): SyntheticDemoCleanupFailure | null;
}

/**
 * Creates the owner. A supplied render surface passes to the owner at once, before the session
 * exists: if the surface cannot be connected the renderer is unavailable, if initialization fails
 * the owner releases it, and otherwise disposal does. A surface that could not be released, here
 * or by its factory (an `unavailable` RollbackError), fails initialization: no session runs beside it.
 */
export function createSyntheticDemoOwner(host: SessionHost, clock: SamplingClock, render: SyntheticRendererOptions): SyntheticDemoOwner {
  const writer = createSyntheticGameStore();
  const feedback = createSyntheticCommandFeedback(writer);
  let cleanupFailure: SyntheticDemoCleanupFailure | null = null;
  const recordCleanupFailure = (cause: unknown): void => { cleanupFailure ??= Object.freeze({ cause }); };
  let renderer: SyntheticRenderer;
  /** A surface whose creation or connection could not be rolled back; no session may run beside it. */
  let unreleased = 'unavailable' in render && render.unavailable instanceof RollbackError ? render.unavailable : null;
  try {
    renderer = createSyntheticRenderer(render);
  } catch (cause) {
    // A surface that could not connect was released, and the demo runs without a picture.
    if (cause instanceof RollbackError) unreleased = cause;
    renderer = createSyntheticRenderer({ unavailable: cause, reportError: render.reportError });
  }
  // The renderer attaches to every run the bridge observes, after the command feedback.
  const bridge = createSyntheticSessionBridge(writer, clock, [feedback, { attach: binding => { renderer.attach(binding); } }]);
  let stopStatus: SessionCleanup | null = null;
  /**
   * Stops watching status, so a failure here is recorded as the error it makes, then disposes the
   * session (if any), unbinds the bridge and disposes the renderer, attempting all; returns their failures.
   */
  const release = (session: SyntheticSession | null): unknown[] => attemptAll([
    () => { stopStatus?.(); },
    () => { session?.control({ type: 'dispose' }); },
    () => { bridge.unbind(); },
    () => { renderer.dispose(); },
  ]);
  /** Null once disposed or when initialization failed; both make later actions no-ops. */
  let active: { readonly session: SyntheticSession; readonly dispatch: (action: SyntheticPanelAction) => void } | null = null;
  let session: SyntheticSession | null = null;
  try {
    if (unreleased) throw unreleased;
    session = createSyntheticSession(SYNTHETIC_DEMO_OPTIONS, host, bridge.onError);
    stopStatus = session.onStatus(status => {
      // A consumer's own cancellation may fail without the session knowing; its RollbackError says so.
      if (cleanupFailure) return;
      if (status.cleanupFailed || status.error?.failures?.some(failure => failure.cause instanceof RollbackError)) {
        recordCleanupFailure(status.error);
      }
    });
    bridge.bind(session);
    active = { session, dispatch: createSyntheticPanelDispatcher(feedback, createSyntheticGameControls(writer, session)) };
  } catch (cause) {
    const rollback = release(session);
    const failure = rollback.length === 0 ? cause : new RollbackError(cause, rollback, 'Synthetic demo initialization and rollback failed');
    if (failure instanceof RollbackError) recordCleanupFailure(failure);
    // No controller remains, so the store shows no status rather than the rolled-back session's last one.
    writer.commit({ status: null, projection: null, clearRun: true, actionError: { operation: 'initialize', cause: failure } });
  }
  return Object.freeze({
    store: writer.reader,
    renderer,
    dispatch(action: SyntheticPanelAction): void {
      active?.dispatch(action);
    },
    dispose(): void {
      const current = active;
      if (!current) return;
      active = null;
      const errors = release(current.session);
      if (errors.length === 0) return;
      const failure = new AggregateError(errors, 'Synthetic demo cleanup failed', { cause: errors[0] });
      recordCleanupFailure(failure);
      writer.commit({ actionError: { operation: 'cleanup', cause: failure } });
      throw failure;
    },
    cleanupFailure: () => cleanupFailure,
  });
}
