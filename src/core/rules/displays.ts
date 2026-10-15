/**
 * Rules of the left display and the status display (docs/plan/p3/02/spec.md, CR-04, CR-05 and CR-10;
 * docs/original/formats/executable.md, D9 and D15; docs/original/formats/cockpit.md, instrument types per slot): the
 * page changes of the `energy` open and `damage-report` commands, the views whose cockpit gauges write rule state, the
 * status display's blink and subsystem fields 1, 5 and 8, and the menu pages 2–4 (P3-10, CB-07 and CB-09). The frame-end step and the commands are
 * systems/displays.ts's and systems/energy.ts's.
 */
import { CoreFaultError } from '../errors.ts';
import type { SubsystemState } from '../world/entity-table.ts';
import type { LeftPage, PlayerState } from '../world/player-state.ts';
import { quotient } from './energy.ts';

/**
 * The view modes whose cockpit layout holds the left and right displays (instrument types 6 and 7): 0xC and 1 (layout
 * 0), 6 (layout 0 of the base interior's set) and 0xD (layout 5). Only there do their gauges run (CR-10).
 */
export const COCKPIT_DISPLAY_VIEW_MODES: ReadonlySet<number> = new Set([0x0c, 0x0d, 1, 6]);

/** The status page and the energy page (D15). */
const STATUS_PAGE = 0;
export const ENERGY_PAGE = 1;

/** A page command's outcome: the new page, or why it changes nothing. */
export type PageChange = LeftPage | 'no-change' | 'wrong-context';

/**
 * `e` (energy open) goes from the status page to the energy page and `d` (damage report) back (`0x26fd5`, `0x2700a`):
 * at the target page already `no-change`; on pages 2–6, which belong to communications, messages and Warp,
 * `wrong-context`.
 */
export function pageChange(page: LeftPage, command: 'open' | 'damage-report'): PageChange {
  const [from, to]: readonly [LeftPage, LeftPage] = command === 'open' ? [STATUS_PAGE, ENERGY_PAGE] : [ENERGY_PAGE, STATUS_PAGE];
  if (page === from) return to;
  return page === to ? 'no-change' : 'wrong-context';
}

/** Field 13, the communications subsystem: its state 2 refuses `c` and stops the handlers of pages 2–5 (D15). */
export const COMMUNICATIONS_FIELD = 13;

/** Pages 2, 3 and 4: the category menu, the object list and the command menu, each page its menu's level (comm §7.2). */
export const isMenuPage = (page: LeftPage): page is 2 | 3 | 4 => page >= 2 && page <= 4;

/**
 * Whether the handler of pages 2–4 (`0x4da28`) sets page 0 directly (comm §7.5): the left display shows a menu page,
 * field 13 is not 2 and no menu is built, which a flush or the end of an incoming message can leave behind. It never
 * rebuilds a menu.
 */
export function clearsMenuPage(page: LeftPage, hasMenu: boolean, subsystems: readonly SubsystemState[]): boolean {
  return isMenuPage(page) && !hasMenu && subsystems[COMMUNICATIONS_FIELD] !== 2;
}

/** Field 10, whose state 2 replaces the status page by its interference animation (D15). */
const STATUS_PAGE_FIELD = 10;

/**
 * Whether the status page's handler `0x4d0e0` runs: the left display shows page 0 and field 10 is not 2. At field 10 =
 * 1 the original pauses it in random flashes, which Core does not reproduce (CR-11, difference 4).
 */
export function showsStatusPage(page: LeftPage, subsystems: readonly SubsystemState[]): boolean {
  return page === STATUS_PAGE && subsystems[STATUS_PAGE_FIELD] !== 2;
}

/** Clock units between two blink phase changes of the status display. */
const BLINK_INTERVAL = 0x20;

/**
 * `0x4d0e0`'s blink timer: once the clock is strictly past its due clock, the phase flips and is due again
 * BLINK_INTERVAL units after this clock. Returns whether it flipped.
 */
export function advanceBlink(display: PlayerState['statusDisplay'], clock: number): boolean {
  if (!(clock > display.blinkDueClock)) return false;
  const due = clock + BLINK_INTERVAL;
  if (!Number.isSafeInteger(due)) throw new CoreFaultError('budget-exhausted', 'displays.blink-clock');
  display.blink = display.blink === 0 ? 1 : 0;
  display.blinkDueClock = due;
  return true;
}

/** q = (hull << 8) ÷ c9C at which field 1 is 0 (≥) and at which it blinks (≥, below the first). */
const HULL_INTACT = 0xc0;
const HULL_BLINKING = 0x4c;

/** Field 1 as `0x4d50c` writes it from the hull and its capacity c9C: 0 from 0xC0/256 up, the blink phase from 0x4C/256 up, else 2. */
export function hullField(hull: number, capacity: number, blink: 0 | 1): SubsystemState {
  const ratio = quotient(hull << 8, capacity, 'displays.hull-capacity');
  if (ratio >= HULL_INTACT) return 0;
  return ratio >= HULL_BLINKING ? blink : 2;
}

/** The two-bit fields the status display writes: 1 (hull), 5 (list-1 mounts) and 8 (list-0 mounts). */
const HULL_FIELD = 1;
const MISSILE_MOUNTS_FIELD = 5;
const GUN_MOUNTS_FIELD = 8;

/** What `0x4d50c` writes into the player's fields 1, 5 and 8. */
export interface StatusFields {
  readonly hull: SubsystemState;
  /** List 1's mount status (`0x2e264`). */
  readonly missileMounts: SubsystemState;
  /** List 0's mount status (`0x2e438`). */
  readonly gunMounts: SubsystemState;
}

/** `subsystems` with fields 1, 5 and 8 written: the same array when none changes, otherwise a new frozen one. */
export function withStatusFields(subsystems: readonly SubsystemState[], { hull, missileMounts, gunMounts }: StatusFields): readonly SubsystemState[] {
  if (subsystems[HULL_FIELD] === hull && subsystems[MISSILE_MOUNTS_FIELD] === missileMounts && subsystems[GUN_MOUNTS_FIELD] === gunMounts) return subsystems;
  const written = [...subsystems];
  written[HULL_FIELD] = hull;
  written[MISSILE_MOUNTS_FIELD] = missileMounts;
  written[GUN_MOUNTS_FIELD] = gunMounts;
  return Object.freeze(written);
}
