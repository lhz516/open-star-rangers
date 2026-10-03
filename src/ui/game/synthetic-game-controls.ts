/**
 * Session controls for the synthetic dev panel. Availability follows the latest session status;
 * the session remains the only judge, so a stale click reports its own synchronous error. The UI
 * never relaxes or rewrites session decisions. Contract: docs/plan/p1/06/spec.md.
 */
import type { Command } from '../../core/synthetic/synthetic-scene.ts';
import type { SessionControl, SessionStatus, SyntheticSession } from '../../app/session/synthetic-session.ts';
import type { SyntheticGameStoreWriter } from './synthetic-game-store.ts';

/** Controls the panel offers; dispose belongs to the owner, not to a button. */
export type SyntheticPanelControl = Exclude<SessionControl['type'], 'dispose'>;

/** Every panel action, keyed by the identifier its dispatcher receives. */
export type SyntheticPanelAction = SyntheticPanelControl | Command['type'];

/** Marker commands stay enabled whether or not a marker exists; Core decides the outcome. */
export type SyntheticControlAvailability = Readonly<Record<SyntheticPanelAction, boolean>>;

const PANEL_ACTIONS: readonly SyntheticPanelAction[] = ['start', 'pause', 'resume', 'restart', 'exit', 'add-marker', 'remove-marker'];

/** One frozen object per distinct set of enabled actions, keyed by bitmask. */
const availabilityCache = new Map<number, SyntheticControlAvailability>();

/**
 * Returns the same frozen object whenever the enabled actions are the same, whatever status
 * produced them, so React selectors re-render only when a button actually changes.
 */
export function syntheticControlAvailability(status: SessionStatus | null): SyntheticControlAvailability {
  const phase = status?.phase ?? null;
  const cleanupFailed = status?.cleanupFailed ?? false;
  const hasRun = phase === 'running' || phase === 'paused' || phase === 'faulted';
  const enabled: Record<SyntheticPanelAction, boolean> = {
    start: phase === 'idle' && !cleanupFailed,
    pause: phase === 'running',
    resume: phase === 'paused' && (status?.environmentVisible ?? false),
    restart: hasRun && !cleanupFailed,
    exit: hasRun,
    'add-marker': phase === 'running',
    'remove-marker': phase === 'running',
  };
  const key = PANEL_ACTIONS.reduce((bits, action, index) => (enabled[action] ? bits | (1 << index) : bits), 0);
  let availability = availabilityCache.get(key);
  if (!availability) {
    availability = Object.freeze(enabled);
    availabilityCache.set(key, availability);
  }
  return availability;
}

export interface SyntheticGameControls {
  /** Applies a session control; a synchronous failure becomes actionError with its original cause. */
  control(type: SyntheticPanelControl): void;
}

export function createSyntheticGameControls(store: SyntheticGameStoreWriter, session: SyntheticSession): SyntheticGameControls {
  return Object.freeze({
    control(type: SyntheticPanelControl): void {
      // Clear first so no status published by this attempt appears next to an older error.
      store.commit({ actionError: null });
      try {
        session.control({ type });
      } catch (cause) {
        store.commit({ actionError: { operation: type, cause } });
      }
    },
  });
}

/**
 * Routes a panel action: marker commands go to command feedback, everything else to the session
 * controls. Keeps the action taxonomy inside the UI layer.
 */
export function createSyntheticPanelDispatcher(
  commands: { submit(type: Command['type']): void }, controls: SyntheticGameControls,
): (action: SyntheticPanelAction) => void {
  return action => {
    if (action === 'add-marker' || action === 'remove-marker') commands.submit(action);
    else controls.control(action);
  };
}
