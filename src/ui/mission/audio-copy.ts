/**
 * The mission's sound status as the project pages show it (docs/plan/p3/14/spec.md, 声音状态与开发诊断, S-09; P3-04
 * spec, 任务音频接线（P3-14 的修订）): one English line per `MissionSoundStatus`, when the enable-sound control is
 * offered, and where focus goes once a click on it settled. DOM-free, so Node tests read it.
 */
import type { MissionSoundStatus } from '../../app/mission/mission-owner.ts';
import type { GameSessionPhase } from '../../app/session/session-errors.ts';

export const ENABLE_SOUND = 'Enable sound';

const STATUS_TEXT: Readonly<Record<MissionSoundStatus, string>> = Object.freeze({
  'waiting-close': 'Sound: waiting for the previous mission\'s audio to close.',
  'needs-activation': 'Sound: off until you enable it.',
  available: 'Sound: on.',
  paused: 'Sound: paused with the game.',
  'host-suspended': 'Sound: suspended by the browser.',
  unavailable: 'Sound: unavailable in this browser; the mission continues without sound.',
  failed: 'Sound: failed; the mission continues without sound.',
});

/** The status line; a running audio context alone never reads as sound playing, only `available` does. */
export const soundStatusText = (status: MissionSoundStatus): string => STATUS_TEXT[status];

/** The session phases in which the owner's `enableSound` applies. */
const ENABLE_PHASES: ReadonlySet<GameSessionPhase> = new Set(['transition', 'running', 'paused', 'stopped']);

/**
 * Whether the enable-sound control shows: the owner takes a trusted click now and it can change the sound. A locked or
 * idle controller can be unlocked in any of those phases, a paused game included, where the click only takes the
 * capability. One the browser suspended resumes only with the pause gate open: while the game is paused, its own
 * resume does that.
 */
export function enableSoundOffered(status: MissionSoundStatus, phase: GameSessionPhase): boolean {
  if (!ENABLE_PHASES.has(phase)) return false;
  return status === 'needs-activation' || (status === 'host-suspended' && phase !== 'paused');
}

export interface EnableSoundFocusFacts {
  /** The status after the click's latest change. */
  readonly status: MissionSoundStatus;
  /** Whether the control still shows with that status. */
  readonly offered: boolean;
  /** Whether focus is still on the control: otherwise the user moved it. */
  readonly controlFocused: boolean;
  /** Whether the page is visible: a hidden page ends the wait, and focus is not moved. */
  readonly visible: boolean;
  /** The P3-05 conditions for the input zone: a flight shell with a zone, running, the page visible and the window focused. */
  readonly zoneReady: boolean;
}

/**
 * Where focus goes after a click on the enable-sound control changed the status (P3-14 S-09): `none` when the user moved
 * focus or the page is hidden, which ends the wait; `stay` while the control still shows, so a refused or pending unlock
 * keeps the focus on it; the input zone when the sound became available and the P3-05 conditions hold; otherwise, as the
 * control disappears (enabled in the menu or a paused game, unavailable or failed), the page's first enabled action, so
 * focus stays on an operable control rather than falling to the document.
 */
export function enableSoundFocus({ status, offered, controlFocused, visible, zoneReady }: EnableSoundFocusFacts): 'none' | 'stay' | 'zone' | 'action' {
  if (!controlFocused || !visible) return 'none';
  if (offered) return 'stay';
  return status === 'available' && zoneReady ? 'zone' : 'action';
}
