/**
 * Page copy of the mission flow that is not a slice gap (docs/plan/p3/04/spec.md: 开始资格, 任务开始配置, 任务菜单、暂停与
 * 退出; docs/plan/p3/05/spec.md: 输入区与焦点, 全屏与 Keyboard Lock, Alt+F4 风险提示): the build's honest status, why the
 * mission cannot start, start failures, the game input zone and its notices, and structural error descriptions that
 * carry no imported content. DOM-free, so Node tests read it.
 */
import type { MissionEligibility } from '../../app/mission/mission-eligibility.ts';
import type { MissionStartFailure } from '../../app/mission/mission-flow.ts';
import type { MissionWingmanOption } from '../../app/mission/mission-owner.ts';
import type { MissionFailure } from '../../app/resources/mission-diagnostics.ts';
import type { GameSessionStatus } from '../../app/session/game-session.ts';
import type { FlightRendererStatus } from '../../render/flight/renderer/flight-renderer.ts';
import { GraphicsDeviceError } from '../../render/scene/render-surface.ts';

/** What this build is, wherever the mission is offered or shown. */
export const MISSION_SKELETON =
  'This is the formal runtime skeleton, not yet a playable slice: Core runs the mission\'s world and the rules implemented '
  + 'so far, the mission result included, and the flight view is in progress, but there is no cockpit, HUD or audio yet.';

const CATEGORY: Readonly<Record<MissionFailure['kind'], string>> = Object.freeze({ 'core-input': 'Core input', content: 'content contract' });

/** A Core or content refusal: its category, path and reason. */
export const describeMissionFailure = ({ kind, path, reason }: MissionFailure): string =>
  `${CATEGORY[kind]} error at ${path}: ${reason}`;

/** Why the main menu's mission entry is disabled; null when it is eligible. */
export function eligibilityReason(eligibility: MissionEligibility): string | null {
  switch (eligibility.status) {
    case 'eligible':
      return null;
    case 'cleanup-failed':
      return 'An earlier mission cleanup failed, so no mission can be started until the page is reloaded.';
    case 'no-package':
      return 'No resource package is held. Import your original game data or open saved resources first.';
    case 'package-incomplete': {
      const groups = eligibility.groups.map(({ group, status }) => `${group} ${status}`);
      const diagnostics = eligibility.diagnostics.map(({ code, path }) => `${code} at ${path}`);
      const detail = groups.length > 0 ? groups.join(', ') : diagnostics.join('; ');
      return `The resource package is incomplete${detail ? ` (${detail})` : ''}.`;
    }
    case 'mission-not-attempted':
      return 'The mission has not been loaded from the resource package.';
    case 'mission-failed':
      return `The mission does not load: ${describeMissionFailure(eligibility.failure)}.`;
  }
}

/** A wingman option's label: plain text of the imported candidates, never markup. */
export function wingmanLabel({ index, nameCandidates }: MissionWingmanOption): string {
  if (nameCandidates.length === 0) return `Wingman option ${index + 1} (no name in the roster)`;
  if (nameCandidates.length === 1) return nameCandidates[0];
  // Core draws one name when the run starts; the page lists the candidates instead of drawing one itself.
  return `Wingman option ${index + 1}: one of ${nameCandidates.map(name => `“${name}”`).join(', ')}`;
}

/** Whether the start page may try again after `failure`: not once the package changed or a cleanup failure latched. */
export function startRetryable(failure: MissionStartFailure): boolean {
  if (failure.kind === 'assembly') return failure.rolledBack;
  return failure.kind === 'seed' || failure.kind === 'rejected';
}

const STAGE: Readonly<Record<Extract<MissionStartFailure, { kind: 'assembly' }>['stage'], string>> = Object.freeze({
  session: 'starting the session', consumer: 'connecting the run\'s consumers', 'leave-guard': 'registering the leave-page confirmation',
});

/** The start page's alert for a confirmation that created no run; `detail` describes its cause structurally. */
export function startFailureText(failure: MissionStartFailure): { readonly text: string; readonly detail: string | null } {
  switch (failure.kind) {
    case 'package-changed':
      return { text: 'The resource package changed after this page opened, so no run was started. Return to the main menu.', detail: null };
    case 'cleanup-failed':
      return { text: 'An earlier cleanup failed, so no run can be started. Return to the main menu.', detail: null };
    case 'seed':
      return { text: 'No seed could be drawn for the run, so no run was started.', detail: describeStructure(failure.cause) };
    case 'rejected':
      return {
        text: `World creation refused the mission: ${describeMissionFailure(failure.failure)}. Change the selection and try again, or return to the main menu.`,
        detail: null,
      };
    case 'assembly':
      return {
        text: `Starting the run failed while ${STAGE[failure.stage]}. ${failure.rolledBack
          ? 'Everything acquired was released; you can try again.'
          : 'Releasing what was acquired failed too, so only returning to the main menu remains.'}`,
        detail: describeStructure(failure.cause),
      };
  }
}

const PHASE: Readonly<Record<GameSessionStatus['phase'], string>> = Object.freeze({
  idle: 'No run', transition: 'Departure hold', running: 'Running', paused: 'Paused', stopped: 'Stopped', completed: 'Completed', faulted: 'Faulted', disposed: 'Closed',
});

/** The status bar's phase text. */
export const phaseText = (phase: GameSessionStatus['phase']): string => PHASE[phase];

/** Why the run is paused, for the status bar; null unless paused. */
export function pauseText({ pauseReason }: GameSessionStatus): string | null {
  if (pauseReason === 'user') return 'Paused by you';
  if (pauseReason === 'hidden') return 'Paused because the page was hidden; resume when you are ready';
  return null;
}

/** Why the paused run cannot resume now; null when it can or is not paused. */
export function resumeBlockedText({ phase, environmentVisible }: GameSessionStatus): string | null {
  if (phase !== 'paused' || environmentVisible) return null;
  return 'Resume is unavailable while the page is hidden or being left.';
}

/** The game view's note until P3-13 draws the cockpit and HUD (docs/plan/p3/12/spec.md, 画面合成与 P3-13 接口). */
export const FLIGHT_IN_PROGRESS = 'Flight rendering is connected; the cockpit and HUD are not implemented yet (P3-13).';

const WITHOUT_PICTURE = 'The mission continues without the picture; you can pause it or exit through the mission menu.';

/**
 * Why the flight picture is missing (docs/plan/p3/12/spec.md, 行为与边界): null while it draws. `alert` for a state that
 * will not end by itself; `detail` describes the error structurally.
 */
export function flightNotice({ state, error }: FlightRendererStatus): { readonly alert: boolean; readonly text: string; readonly detail: string | null } | null {
  switch (state) {
    case 'ready':
    case 'disposed':
      return null;
    case 'context-lost':
      return { alert: false, text: `The flight picture's graphics context was lost until the browser restores it. ${WITHOUT_PICTURE}`, detail: null };
    case 'unavailable':
      return { alert: true, text: `The flight picture is unavailable: this browser provides no WebGL 2. ${WITHOUT_PICTURE}`, detail: describeStructure(error) };
    case 'failed':
      return error instanceof GraphicsDeviceError
        ? { alert: true, text: `The flight picture stopped: the graphics device failed. ${WITHOUT_PICTURE}`, detail: describeStructure(error) }
        : { alert: true, text: 'The flight picture failed, so the run cannot continue.', detail: describeStructure(error) };
  }
}

/** The game input zone's accessible name. */
export const INPUT_ZONE_LABEL = 'Game controls';

/** Shown while the run is running or paused and the input zone does not have focus; Tab may still leave the zone. */
export const INPUT_FOCUS_HINT = 'Click the game view to control the craft: game keys work only while it has focus.';

/** The shell's explicit full screen button; the whole page goes full screen, not only the game view. */
export const FULLSCREEN_BUTTON = 'Full screen';

/** The Alt+F4 tip: a project warning, not a promise that any key is intercepted. */
export const ALT_F4_TIP = Object.freeze({
  title: 'Alt+F4 may close this window.',
  text: 'Pressing Alt+F4 can close the browser window and end the mission. Full screen and the key lock do not stop the '
    + 'system from handling such keys, and the browser may close the page without showing the leave-page confirmation.',
  dismiss: 'Dismiss',
});

/** Structural error fields that name a category or a fixed detection site; messages are left out. */
const FIELDS = ['kind', 'code', 'site', 'stage', 'operation', 'phase', 'path', 'reason'] as const;
const DEPTH = 4;

/**
 * An error as its class and structural fields, with its session failures, aggregated errors and causes, without any
 * message text: messages may quote values, and this text stays free of imported content.
 */
export function describeStructure(cause: unknown, depth = 0): string {
  const indent = '  '.repeat(depth);
  if (!(cause instanceof Error)) return `${indent}${cause === null ? 'null' : typeof cause} value`;
  const record = cause as unknown as Record<string, unknown>;
  const fields = FIELDS.flatMap(field => (typeof record[field] === 'string' || typeof record[field] === 'number' ? [`${field} ${String(record[field])}`] : []));
  const lines = [`${indent}${cause.name}${fields.length > 0 ? ` (${fields.join(', ')})` : ''}`];
  if (depth >= DEPTH) return lines.join('\n');
  const failures = Array.isArray(record.failures) ? record.failures as readonly { readonly phase?: unknown; readonly cause?: unknown }[] : [];
  for (const failure of failures) lines.push(`${indent}  ${String(failure.phase)} failure:`, describeStructure(failure.cause, depth + 2));
  const errors: readonly unknown[] = cause instanceof AggregateError ? cause.errors : [];
  for (const error of errors) lines.push(describeStructure(error, depth + 1));
  // A RollbackError's cause is also its first error.
  if (cause.cause !== undefined && !errors.includes(cause.cause)) lines.push(`${indent}  caused by:`, describeStructure(cause.cause, depth + 2));
  return lines.join('\n');
}
