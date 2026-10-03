/**
 * One owner of the P1 synthetic demo. It creates the UI store, session bridge, command feedback,
 * controls and session for a supplied host and sampling clock, and disposes them together. It is
 * DOM-free, does not start the session, and keeps no global registry: whoever holds an owner
 * disposes it before creating the next. Contract: docs/plan/p1/06/spec.md.
 */
import type { SyntheticRuntimeOptions } from '../runtime/synthetic-runtime.ts';
import type { SessionHost } from '../session/session-host.ts';
import { createSyntheticSession, type SyntheticSession } from '../session/synthetic-session.ts';
import { createSyntheticCommandFeedback } from '../../ui/game/synthetic-command-feedback.ts';
import {
  createSyntheticGameControls, createSyntheticPanelDispatcher, type SyntheticPanelAction,
} from '../../ui/game/synthetic-game-controls.ts';
import { createSyntheticGameStore, type SyntheticGameStoreReader } from '../../ui/game/synthetic-game-store.ts';
import { createSyntheticSessionBridge, type SamplingClock } from '../../ui/game/synthetic-session-bridge.ts';

/** Fixed seed and Core's default tick rate for the demo; invented values, not original-game rules. */
export const SYNTHETIC_DEMO_OPTIONS: SyntheticRuntimeOptions = Object.freeze({ scene: Object.freeze({ seed: 0 }) });

export interface SyntheticDemoOwner {
  readonly store: SyntheticGameStoreReader;
  /** Runs a panel action. Ignored after dispose or a failed initialization, which the store reports. */
  dispatch(action: SyntheticPanelAction): void;
  /**
   * Disposes the session, then releases the bridge; idempotent. Every cleanup is attempted; any
   * failure is gathered into one AggregateError, written as actionError and thrown.
   */
  dispose(): void;
}


export function createSyntheticDemoOwner(host: SessionHost, clock: SamplingClock): SyntheticDemoOwner {
  const writer = createSyntheticGameStore();
  const feedback = createSyntheticCommandFeedback(writer);
  const bridge = createSyntheticSessionBridge(writer, clock, [feedback]);
  /** Disposes the session (if any), then unbinds the bridge, attempting both; returns their failures. */
  const release = (session: SyntheticSession | null): unknown[] => {
    const errors: unknown[] = [];
    try { session?.control({ type: 'dispose' }); } catch (cause) { errors.push(cause); }
    try { bridge.unbind(); } catch (cause) { errors.push(cause); }
    return errors;
  };
  /** Null once disposed or when initialization failed; both make later actions no-ops. */
  let active: { readonly session: SyntheticSession; readonly dispatch: (action: SyntheticPanelAction) => void } | null = null;
  let session: SyntheticSession | null = null;
  try {
    session = createSyntheticSession(SYNTHETIC_DEMO_OPTIONS, host, bridge.onError);
    bridge.bind(session);
    active = { session, dispatch: createSyntheticPanelDispatcher(feedback, createSyntheticGameControls(writer, session)) };
  } catch (cause) {
    const errors = [cause, ...release(session)];
    const failure = errors.length === 1 ? cause : new AggregateError(errors, 'Synthetic demo initialization and rollback failed', { cause });
    // No controller remains, so the store shows no status rather than the rolled-back session's last one.
    writer.commit({ status: null, projection: null, clearRun: true, actionError: { operation: 'initialize', cause: failure } });
  }
  return Object.freeze({
    store: writer.reader,
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
      writer.commit({ actionError: { operation: 'cleanup', cause: failure } });
      throw failure;
    },
  });
}
