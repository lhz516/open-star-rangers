/**
 * The mission flow (docs/plan/p3/04/spec.md: 应用流程, 任务开始配置, 衔接占位, 任务菜单、暂停与退出, 终局与救援衔接): where a mission
 * owner is between the G-02/1 introduction and the end of its runs, the wingman selection its start page shows, the last
 * start failure and the current run. Pure and DOM-free; the mission owner drives it with the session's outcomes, and
 * React reads it from the owner's snapshot.
 */
import type { MissionFailure } from '../resources/mission-diagnostics.ts';
import type { GameSessionPhase } from '../session/session-errors.ts';

/**
 * `intro` is the G-02/1 placeholder, `config` the start page (G-04, G-07), `departure` the G-02/2 placeholder over the
 * held run, `flight` the running or paused run, `transition` the G-02/3 to G-02/6 placeholders over a run held after a
 * transition tick (P3-10, P3-11), `menu` the pausing mission menu (G-07), `ending` the G-02/7 to G-02/9 placeholders of
 * a completed run, `result` its result page (G-06), and `ended` a run that faulted or stopped, or a restart whose
 * cleanup failed.
 */
export type MissionFlowPosition = 'intro' | 'config' | 'departure' | 'flight' | 'transition' | 'menu' | 'ending' | 'result' | 'ended';

/**
 * Why `ended`: the session faulted or stopped, or exiting the run for a restart failed to clean up (latched). A
 * completion is no abnormal end: it leads to `ending` and `result`.
 */
export type MissionEndReason = 'faulted' | 'stopped' | 'cleanup-failed';

/** Why confirming the start page created no run; the page stays and a retry may follow unless a cleanup failure latched. */
export type MissionStartFailure =
  /** The holder no longer holds the package the owner bound, by object, generation or content identity. */
  | { readonly kind: 'package-changed' }
  /** A cleanup failure is latched, so no new run may start. */
  | { readonly kind: 'cleanup-failed' }
  /** The seed source threw or returned something other than a uint32; nothing falls back to another seed. */
  | { readonly kind: 'seed'; readonly cause: unknown }
  /** World creation refused the content or run (`CoreInputError` or `ContentContractError`); the session stayed idle. */
  | { readonly kind: 'rejected'; readonly failure: MissionFailure }
  /**
   * Starting the session, wiring a run consumer or registering the leave guard failed, and what was acquired was
   * released; `rolledBack` is false when that release failed too, which latched.
   */
  | { readonly kind: 'assembly'; readonly stage: 'session' | 'consumer' | 'leave-guard'; readonly cause: unknown; readonly rolledBack: boolean };

export interface MissionFlowState {
  readonly position: MissionFlowPosition;
  /** The start page's wingman: null for none, otherwise a roster option index; set on entering the page, then edited. */
  readonly selection: number | null;
  /** The last failed confirmation of the current start page; cleared on entering it and by a run that started. */
  readonly startFailure: MissionStartFailure | null;
  /** The session's runId from the start until the next restart. */
  readonly runId: number | null;
  /** Set only in `ended`. */
  readonly ended: MissionEndReason | null;
}

export type MissionFlowInput =
  /** G-02/1 ended; `preselection` is what the start page shows first (see `preselectWingman`). */
  | { readonly type: 'intro-ended'; readonly preselection: number | null }
  | { readonly type: 'select'; readonly wingman: number | null }
  | { readonly type: 'start-failed'; readonly failure: MissionStartFailure }
  | { readonly type: 'started'; readonly runId: number }
  | { readonly type: 'departure-ended' }
  /** The running run entered a hold at a transition tick. */
  | { readonly type: 'transition-held' }
  /** The hold's last item ended; the run runs or waits paused. */
  | { readonly type: 'transition-ended' }
  /** The run completed: its ending placeholders follow. */
  | { readonly type: 'run-completed' }
  /** The last ending placeholder ended: the result page follows. */
  | { readonly type: 'ending-ended' }
  | { readonly type: 'menu-opened' }
  | { readonly type: 'menu-closed' }
  | { readonly type: 'run-ended'; readonly reason: MissionEndReason }
  /** The run exited and its cleanup succeeded: a new G-02/1 follows. */
  | { readonly type: 'restarted' };

export const INITIAL_MISSION_FLOW: MissionFlowState = Object.freeze({
  position: 'intro', selection: null, startFailure: null, runId: null, ended: null,
});

/** The session phases each position runs beside; the mission owner keeps them in step. */
export const FLOW_SESSION_PHASES: Readonly<Record<MissionFlowPosition, readonly GameSessionPhase[]>> = Object.freeze({
  intro: Object.freeze(['idle']),
  config: Object.freeze(['idle']),
  departure: Object.freeze(['transition']),
  flight: Object.freeze(['running', 'paused']),
  transition: Object.freeze(['transition']),
  menu: Object.freeze(['paused']),
  ending: Object.freeze(['completed']),
  result: Object.freeze(['completed']),
  ended: Object.freeze(['faulted', 'stopped', 'idle']),
} satisfies Record<MissionFlowPosition, readonly GameSessionPhase[]>);

const RUN_POSITIONS: ReadonlySet<MissionFlowPosition> = new Set(['departure', 'flight', 'transition', 'menu', 'ending', 'result']);
const RESTART_POSITIONS: ReadonlySet<MissionFlowPosition> = new Set(['flight', 'menu', 'result', 'ended']);

/** Returns the next state, or the same object when the input does not apply where the flow is. */
export function nextMissionFlow(state: MissionFlowState, input: MissionFlowInput): MissionFlowState {
  const { position } = state;
  switch (input.type) {
    case 'intro-ended':
      if (position !== 'intro') return state;
      return Object.freeze({ ...state, position: 'config', selection: input.preselection, startFailure: null });
    case 'select':
      if (position !== 'config' || input.wingman === state.selection) return state;
      return Object.freeze({ ...state, selection: input.wingman });
    case 'start-failed':
      if (position !== 'config') return state;
      return Object.freeze({ ...state, startFailure: input.failure });
    case 'started':
      if (position !== 'config') return state;
      return Object.freeze({ ...state, position: 'departure', startFailure: null, runId: input.runId });
    case 'departure-ended':
      if (position !== 'departure') return state;
      return Object.freeze({ ...state, position: 'flight' });
    case 'transition-held':
      if (position !== 'flight') return state;
      return Object.freeze({ ...state, position: 'transition' });
    case 'transition-ended':
      if (position !== 'transition') return state;
      return Object.freeze({ ...state, position: 'flight' });
    case 'run-completed':
      if (position !== 'flight') return state;
      return Object.freeze({ ...state, position: 'ending' });
    case 'ending-ended':
      if (position !== 'ending') return state;
      return Object.freeze({ ...state, position: 'result' });
    case 'menu-opened':
      if (position !== 'flight') return state;
      return Object.freeze({ ...state, position: 'menu' });
    case 'menu-closed':
      if (position !== 'menu') return state;
      return Object.freeze({ ...state, position: 'flight' });
    case 'run-ended':
      if (!RUN_POSITIONS.has(position) && !(position === 'ended' && input.reason === 'cleanup-failed')) return state;
      if (state.ended === input.reason) return state;
      return Object.freeze({ ...state, position: 'ended', ended: input.reason });
    case 'restarted':
      if (!RESTART_POSITIONS.has(position) || state.ended === 'cleanup-failed') return state;
      return Object.freeze({ ...state, position: 'intro', startFailure: null, runId: null, ended: null });
  }
}

/** The last wingman selection a run started with in one app instance, under the content identity key it applied to. */
export interface ConfirmedSelection {
  readonly identity: string;
  readonly wingman: number | null;
}

/**
 * The start page's first selection: the selection last confirmed for the same content identity (no wingman included),
 * otherwise the roster's first option, or none without options. A remembered index the roster lacks gives the default.
 */
export function preselectWingman(confirmed: ConfirmedSelection | null, identity: string, optionCount: number): number | null {
  const fallback = optionCount > 0 ? 0 : null;
  if (confirmed === null || confirmed.identity !== identity) return fallback;
  const { wingman } = confirmed;
  return wingman === null || wingman < optionCount ? wingman : fallback;
}
