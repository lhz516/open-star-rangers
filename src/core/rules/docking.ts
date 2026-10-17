/**
 * The pure rules of the docking wait, docking and launch (docs/plan/p3/02/spec.md, CB-02, CB-10, CB-11 set-up;
 * docs/original/formats/executable.md, DK1–DK3, DK5, BS1–BS3). systems/docking.ts applies them to a world.
 *
 * - The docking object is valid while it resolves in state 7 or above; activity, the dead flag, distance and kind are
 *   not read (DK1).
 * - Sub-states 3 and 4 end at the previous tick's sample reaching their clock, unsigned and non-strict (DK5).
 * - The execution search `0x3959c` returns the first base-kind object in walk order, active and strictly within range
 *   of the player, not the nearest; the menu's gate (comm-menus.ts) lets the range itself pass, this one does not.
 * - The service set-up `0x39664` orders the 11 records by their service state `0x39cb4`, descending, ties in record
 *   order, record 0 included.
 * - The launch restores the previous view, at least 0xC, and places the player from the saved pose (the base's): 1000
 *   units along its row 1, facing along it, a quarter turn about row 2 (DK3).
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { isActiveState, type Entity, type EntityTable } from '../world/entity-table.ts';
import type { Pose } from '../world/player-state.ts';
import type { BaseService, MissionSubState } from '../world/world-state.ts';
import { WINGMAN_KIND_BIT } from './spawn-schedule.ts';
import { squaredDistance } from './speed-match.ts';

/** The base kinds `0x68000`: bits 15, 17 and 18. */
const BASE_KINDS = 0x68000;
/** The execution search's and the wingman's squared range, the f32 constants `0x17146c` and `0x171464`. */
const DOCKING_RANGE_SQUARED = 1_000_000;

/** The base view. */
export const BASE_VIEW_MODE = 6;

/** The lowest view a launch restores: 0xC, the cockpit (DK3 step 4). */
const LAUNCH_VIEW_FLOOR = 0xc;
/** How far along the saved row 1 the launch places the player, the f64 constant `0x17145c` (DK3 step 7). */
const LAUNCH_DISTANCE = 1000;

/**
 * The base service's periods in clock units: repair 0x200, hull 0x40, energy and missiles 4 (BS1). The set-up arms
 * the first dues with them and rules/base-service.ts's steps re-arm with them.
 */
export const SERVICE_PERIODS = Object.freeze({ repair: 0x200, hull: 0x40, energy: 4 });
/**
 * The group selectors' fields: 33 (0x21) is fields 15–18, 34 (0x22) fields 10–14. The state query folds them (BS3);
 * the repair step clears them (BS6).
 */
export const SERVICE_GROUPS: ReadonlyMap<number, readonly number[]> = new Map([
  [0x21, [15, 16, 17, 18]],
  [0x22, [10, 11, 12, 13, 14]],
]);

/**
 * `FCOMP` then `JNC`: within range while the squared distance is not at least the constant, so the constant itself
 * fails and an unordered sum passes (DK5).
 */
export function withinDockingRange(from: Vec3, to: Vec3): boolean {
  return !(squaredDistance(from, to) >= DOCKING_RANGE_SQUARED);
}

/** The docking object test of `0x3266c` (DK1): it resolves in state 7 or above. */
export function isValidDockingObject(entity: Entity | undefined): boolean {
  return entity !== undefined && isActiveState(entity.state);
}

/** The sub-states of the docking wait, the branches of `0x3266c`'s jump table this module owns. */
export type DockingSubState = 3 | 4 | 5;

/** Whether `subState` is one of the docking wait's; P3-11's sub-states are not. */
export const isDockingSubState = (subState: MissionSubState): subState is DockingSubState => subState === 3 || subState === 4 || subState === 5;

/** What the per-tick check of sub-states 3–5 does (DK1). */
export type DockingWaitStep = 'none' | 'release' | 'time-out' | 'dock' | 'launch';

/**
 * `0x3266c`'s docking branches, given whether the docking object is valid and the previous tick's sample: an invalid
 * object releases the wait in sub-states 3 and 4 and launches automatically in 5; a valid one times out in 3 and docks
 * in 4 once the sample reaches the deadline.
 */
export function dockingWaitStep(subState: DockingSubState, valid: boolean, previousClock: number, deadline: number): DockingWaitStep {
  if (subState === 5) return valid ? 'none' : 'launch';
  if (!valid) return 'release';
  if (previousClock < deadline) return 'none';
  return subState === 3 ? 'time-out' : 'dock';
}

/**
 * `0x3959c(player)`: none in the Warp views; otherwise the first object of the base kinds, in walk order, whose
 * activity is exactly active and which is within the strict range of `position`. State, dead flag and Warp are not read.
 */
export function findDockingBase(entities: EntityTable, position: Vec3, viewMode: number): Entity | null {
  // The Warp views 0 and 1.
  if (viewMode === 0 || viewMode === 1) return null;
  for (const entity of entities.walk(BASE_KINDS)) {
    if (entity.activity === 'active' && withinDockingRange(position, entity.position)) return entity;
  }
  return null;
}

/**
 * DK2 step 5: the head of the wingman's list, when it is active and within the strict range of the saved position (the
 * base's). State, dead flag, Warp and its command are not read.
 */
export function findDockingWingman(entities: EntityTable, savedPosition: Vec3): Entity | null {
  const head = wingmanHead(entities);
  return head?.activity === 'active' && withinDockingRange(savedPosition, head.position) ? head : null;
}

/** The head of the wingman's list (`0x5261c(2, 0)`), the only wingman docking and the launch read; null without one. */
export function wingmanHead(entities: EntityTable): Entity | null {
  // for…of ends the walk on the return.
  for (const entity of entities.walk(1 << WINGMAN_KIND_BIT)) return entity;
  return null;
}

/**
 * `0x39cb4(v)`: the player's stored field v; for a group, a count that rises by one at each of its fields above the
 * running count, which is not the maximum (BS3).
 */
export function serviceState(subsystems: readonly number[], selector: number): number {
  const group = SERVICE_GROUPS.get(selector);
  if (group === undefined) return subsystems[selector];
  let count = 0;
  for (const field of group) if (subsystems[field] > count) count++;
  return count;
}

/** `0x39664`'s rows: record 0 first, then each record i inserted before the first row whose state is strictly lower. */
export function serviceRows(selectors: readonly number[], subsystems: readonly number[]): number[] {
  const states = selectors.map((selector) => serviceState(subsystems, selector));
  const rows = [0];
  for (let record = 1; record < selectors.length; record++) {
    const row = rows.findIndex((other) => states[other] < states[record]);
    rows.splice(row === -1 ? rows.length : row, 0, record);
  }
  return rows;
}

/**
 * The base service `0x39664` sets up at docking, at `sample`: its rows, the cursor on row 0, the three dues, the rates
 * from the player's craft record (unsigned divisions of non-negative fields, CB-01 check 4) and no flag set. No draw.
 * A due past the safe integer range is a budget fault.
 */
export function setUpBaseService(sample: number, craft: Pick<CraftRecord, 'at54' | 'at9C'>, selectors: readonly number[], subsystems: readonly number[]): BaseService {
  const dues = { repair: sample + SERVICE_PERIODS.repair, hull: sample + SERVICE_PERIODS.hull, energy: sample + SERVICE_PERIODS.energy };
  if (!Object.values(dues).every(Number.isSafeInteger)) throw new CoreFaultError('budget-exhausted', 'docking.service-dues');
  return {
    rows: serviceRows(selectors, subsystems),
    cursor: 0,
    dues,
    rates: { hull: Math.trunc(craft.at9C / 60), energy: Math.trunc(craft.at54 / 240) },
    flags: { repairsComplete: false, energyAndMissilesFull: false, hullFull: false },
  };
}

/** DK3 step 4: the view a launch restores from the previous view, raised to 0xC when below it (`JGE` on the byte). */
export function launchViewMode(previousViewMode: number): number {
  return Math.max(previousViewMode, LAUNCH_VIEW_FLOOR);
}

/**
 * DK3 step 7 on the saved pose, rows r1, r2, r3 and position p: row 1 := −r3, row 2 := r2, row 3 := r1, and each axis
 * of the position F(pᵢ + F(r1ᵢ × 1000.0)), the products and sums in double and each stored to f32. The rows are copies
 * or sign changes, so exact.
 */
export function launchPose({ position, orientation }: Pose): Pose {
  const [r11, r12, r13, r21, r22, r23, r31, r32, r33] = orientation;
  const along = (p: number, r: number): number => Math.fround(p + Math.fround(r * LAUNCH_DISTANCE));
  return Object.freeze({
    position: Object.freeze({ x: along(position.x, r11), y: along(position.y, r12), z: along(position.z, r13) }),
    orientation: Object.freeze([-r31, -r32, -r33, r21, r22, r23, r11, r12, r13]) as unknown as Pose['orientation'],
  });
}
