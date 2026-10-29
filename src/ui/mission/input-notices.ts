/**
 * Decisions behind the mission shell's game input zone, its notices and its full screen controls (docs/plan/p3/05/spec.md:
 * 输入区与焦点, 暂缺标注, 全屏与 Keyboard Lock, Alt+F4 风险提示; docs/plan/p3/04/spec.md: 任务开始配置, 用户激活与焦点). DOM-free,
 * so Node tests read it; GameInputZone.tsx, InputNotices.tsx and use-input-focus.ts apply them.
 */
import type { MissionFlowPosition } from '../../app/mission/mission-flow.ts';
import type { GameSessionPhase } from '../../app/session/session-errors.ts';
import type { PlatformFamily } from '../../platform/browser/platform-family.ts';

/**
 * The flow changes after which focus may move to the input zone: the departure ended, a running hold's last placeholder
 * ended (P3-10), or Continue resumed the run.
 */
export type InputFocusEntry = 'departure-ended' | 'transition-ended' | 'menu-continued';

const FOCUS_ENTRIES: Partial<Readonly<Record<MissionFlowPosition, InputFocusEntry>>> = Object.freeze({
  departure: 'departure-ended', transition: 'transition-ended', menu: 'menu-continued',
});

/** The entry a change of flow position makes; null for every other change, and for no change. */
export function inputFocusEntry(previous: MissionFlowPosition, next: MissionFlowPosition): InputFocusEntry | null {
  return next === 'flight' ? FOCUS_ENTRIES[previous] ?? null : null;
}

export interface ShellFocusFacts {
  /** The flow change that showed the shell; null when it mounted for any other reason. */
  readonly entry: InputFocusEntry | null;
  /** The shell has a game input zone. */
  readonly zone: boolean;
  /** The session is running. */
  readonly running: boolean;
  readonly visible: boolean;
  readonly windowFocused: boolean;
  /** Focus rests on a control the user chose outside the page that just ended, such as the diagnostics panel. */
  readonly focusElsewhere: boolean;
}

/**
 * Where the shell puts focus as it mounts. The heading, as on every mission page, except after one of the two entries
 * into a shell with an input zone: the zone when the run is running, the page visible and the window focused; nowhere
 * when the user put focus on another control, which keeps it. Otherwise (a hidden page, an unfocused window, a paused
 * run) the heading: focusing it takes no system focus from the user and is where focus waits for their return. Nothing
 * moves focus later, when the page becomes visible or the window focused.
 */
export function shellFocusTarget({ entry, zone, running, visible, windowFocused, focusElsewhere }: ShellFocusFacts): 'zone' | 'heading' | 'none' {
  if (entry === null || !zone) return 'heading';
  if (focusElsewhere) return 'none';
  return zoneFocusable({ running, visible, windowFocused }) ? 'zone' : 'heading';
}

/** Whether focus may move into the input zone now: the run is running, the page visible and the window focused. */
export const zoneFocusable = ({ running, visible, windowFocused }: Pick<ShellFocusFacts, 'running' | 'visible' | 'windowFocused'>): boolean =>
  running && visible && windowFocused;

/** The "click the game view" hint: the run is running or paused and the input zone does not have focus. */
export const focusHintShown = (phase: GameSessionPhase, zoneFocused: boolean): boolean =>
  (phase === 'running' || phase === 'paused') && !zoneFocused;

/** How long a G-item notice stays after its latest press: a project choice (P3-05 暂缺标注), about 3 seconds. */
export const GAP_NOTICE_MS = 3000;

/** A G-item press as the shell shows it; the copy comes from `SLICE_GAPS` through the assembly. */
export interface GapNotice {
  readonly id: string;
  /** Changes with every press, so pressing the same item again restarts its time. */
  readonly serial: number;
  readonly title: string;
  readonly text: string;
}

/**
 * The notice to show: the latest press until the timer of that very press ran out. Each press starts its own timer of
 * `GAP_NOTICE_MS`; `expiredSerial` is the serial whose timer ran out last, so an earlier press's timer never hides a
 * later press of the same or another item.
 */
export const visibleGapNotice = (latest: GapNotice | null, expiredSerial: number | null): GapNotice | null =>
  latest !== null && latest.serial !== expiredSerial ? latest : null;

/** A capability's state as the input owner tracks it (P3-05 能力与反馈); a promise or an API alone is not `active`. */
export type CapabilityStatus = 'unsupported' | 'idle' | 'pending' | 'active' | 'failed';

/** The shell's full screen button: hidden while unsupported or already fullscreen, disabled while a request is pending. */
export function fullscreenButtonState(status: CapabilityStatus): 'hidden' | 'enabled' | 'disabled' {
  if (status === 'unsupported' || status === 'active') return 'hidden';
  return status === 'pending' ? 'disabled' : 'enabled';
}

/**
 * The Start click: the injected full screen request runs first and synchronously, so the click's user activation still
 * applies to it; the start follows even when that request throws, whose error then propagates.
 */
export function startWithGesture(requestFullscreen: (() => void) | undefined, start: () => void): void {
  try {
    requestFullscreen?.();
  } finally {
    start();
  }
}

export interface AltF4TipFacts {
  readonly family: PlatformFamily;
  /** The run is running in flight. */
  readonly running: boolean;
  /** The document's API fullscreen: anything but `active`, a pending request included, is outside it. */
  readonly fullscreen: CapabilityStatus;
  /** The tip already showed during this page load. */
  readonly shown: boolean;
}

/**
 * Whether the Alt+F4 tip shows now: once per page load, the first time a running flight is outside API fullscreen on
 * Windows, Linux or an undetermined platform, including after fullscreen was left or its request failed; never on macOS.
 */
export const altF4TipDue = ({ family, running, fullscreen, shown }: AltF4TipFacts): boolean =>
  family !== 'mac' && running && fullscreen !== 'active' && !shown;

/** Remembers that a notice showed, for one page load; nothing is persisted. */
export interface NoticeLatch {
  shown(): boolean;
  markShown(): void;
}

export function createNoticeLatch(): NoticeLatch {
  let shown = false;
  return Object.freeze({ shown: () => shown, markShown: () => { shown = true; } });
}
