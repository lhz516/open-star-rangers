/**
 * The base service's pure rules (docs/plan/p3/02/spec.md, CB-11; docs/original/formats/executable.md, BS3–BS8, BS10):
 * the base keys (sub-commands 1–3) and the three steps of the per-frame service `0x398ec`. The set-up `0x39664` and the
 * state query `0x39cb4` are rules/docking.ts's; systems/base-interior.ts applies these to a world.
 *
 * `rows` is one array, both the service queue and the display order (BS5): Enter moves a row to the top and a finished
 * head goes to the bottom; the cursor is a row. Every step runs when the sample is strictly past its due (u32 in the
 * original, plain integers in Core) and first re-arms that due from the sample, so a late step is not caught up (BS8).
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { CoreFaultError } from '../errors.ts';
import type { MovementBlock, SubsystemState } from '../world/entity-table.ts';
import type { BaseService } from '../world/world-state.ts';
import type { CraftEntity } from './combat-init.ts';
import { serviceState } from './docking.ts';
import { advanceWalk, refillMissileChain, resetDisturbance } from './full-repair.ts';
import { listStatus, repairListMounts } from './mounts.ts';
import type { RandSource } from './original-random.ts';

/** The periods the service steps re-arm with, in clock units (BS1); rules/docking.ts arms the first dues with the same. */
const PERIODS = Object.freeze({ repair: 0x200, hull: 0x40, energy: 4 });
/** The hull step adds rand % 100 to its rate (BS6). */
const HULL_SPREAD = 100;
/** The fields the group selectors 33 (0x21) and 34 (0x22) clear (BS6), those rules/docking.ts's state query folds. */
const GROUP_FIELDS: ReadonlyMap<number, readonly number[]> = new Map([
  [0x21, [15, 16, 17, 18]],
  [0x22, [10, 11, 12, 13, 14]],
]);
/** The selectors with their own repair: list-1 mounts (5), the steering (7) and list-0 mounts (8). */
const MISSILE_MOUNTS = 5;
const STEERING = 7;
const GUN_MOUNTS = 8;

/** Sub-commands 1 and 2: the cursor one row up or down, clamped at the ends. Returns whether it moved. */
export function navigateCursor(service: BaseService, direction: 'previous' | 'next'): boolean {
  const before = service.cursor;
  service.cursor = direction === 'previous' ? Math.max(before - 1, 0) : Math.min(before + 1, service.rows.length - 1);
  return service.cursor !== before;
}

/**
 * Sub-command 3: the row under the cursor moves to the top when its record still needs service, the rows above it
 * moving down one; the cursor value stays, so it now marks the record one row higher. Returns that record and whether
 * a row moved; no due changes.
 */
export function confirmRow(service: BaseService, selectors: readonly number[], subsystems: readonly number[]): { readonly record: number; readonly moved: boolean } {
  const { rows, cursor } = service;
  const record = rows[cursor];
  if (serviceState(subsystems, selectors[record]) === 0 || cursor === 0) return { record, moved: false };
  rows.splice(cursor, 1);
  rows.unshift(record);
  return { record, moved: true };
}

/** `sample` + `period`, a re-armed due; past the safe integer range a budget fault at `site`. */
export function rearm(sample: number, period: number, site = 'base-service.due'): number {
  const due = sample + period;
  if (!Number.isSafeInteger(due)) throw new CoreFaultError('budget-exhausted', site);
  return due;
}

/** `0x21bd4`(h, 0) and `0x21ba0`(h, 0): a mode-0 block's disturbance and control lock released; the commanded speed stays. */
function releaseSteering(movement: MovementBlock | null): void {
  if (movement === null || movement.mode !== 'craft') return;
  resetDisturbance(movement);
  movement.locked = false;
}

/** `subsystems` with `fields` set to `value`, as a new frozen array. */
function withFields(subsystems: readonly SubsystemState[], fields: readonly number[], value: SubsystemState): readonly SubsystemState[] {
  const written = [...subsystems];
  for (const field of fields) written[field] = value;
  return Object.freeze(written);
}

/**
 * Step 1, the repair, on the head's selector v: 5 and 8 repair one mount of list 1 or 0 (W4's "one" repair, no
 * ammunition) and store that list's status in the field; 7 clears the field and resets the disturbance and the control
 * lock (`0x21bd4`, `0x21ba0` with 0, mode-0 blocks only); the groups clear their fields; any other v clears field v.
 * A head that needs no service sets `repairsComplete` and nothing else; one that needs none after its repair goes to
 * the bottom.
 */
export function repairStep(service: BaseService, sample: number, player: CraftEntity, craft: CraftRecord, selectors: readonly number[]): void {
  if (!(sample > service.dues.repair)) return;
  service.dues.repair = rearm(sample, PERIODS.repair);
  const { combat } = player;
  const { rows } = service;
  const selector = selectors[rows[0]];
  if (serviceState(combat.subsystems, selector) === 0) {
    service.flags.repairsComplete = true;
    return;
  }
  if (selector === MISSILE_MOUNTS || selector === GUN_MOUNTS) {
    const list = selector === MISSILE_MOUNTS ? 1 : 0;
    repairListMounts(combat.weapons, craft, list, false);
    combat.subsystems = withFields(combat.subsystems, [selector], listStatus(combat.weapons, craft, list));
  } else {
    combat.subsystems = withFields(combat.subsystems, GROUP_FIELDS.get(selector) ?? [selector], 0);
    if (selector === STEERING) releaseSteering(player.movement);
  }
  if (serviceState(combat.subsystems, selector) === 0) rows.push(rows.shift()!);
}

/** Step 2, the hull: one draw whatever the hull; hull := min(hull + rate + rand % 100, c9C) (i32), `hullFull` at c9C. */
export function hullStep(service: BaseService, sample: number, player: CraftEntity, craft: CraftRecord, rand: RandSource): void {
  if (!(sample > service.dues.hull)) return;
  service.dues.hull = rearm(sample, PERIODS.hull);
  const { combat } = player;
  combat.hull = Math.min((combat.hull + service.rates.hull + (rand.next() % HULL_SPREAD)) | 0, craft.at9C);
  if (combat.hull === craft.at9C) service.flags.hullFull = true;
}

/**
 * Step 3, the energy and missiles: a full energy sets `energyAndMissilesFull`, otherwise the energy rises by its rate up
 * to c54 and the flag clears. Then the missile walk over list 0, then list 1, from each list's current mount: refill the
 * head's chain; a refilled chain end clears the flag and stops the walk at the next head; back at its first head, list 0
 * passes to list 1 without advancing and list 1 advances once more and stops; otherwise the list advances (`0x2d6dc`,
 * which clears the lock level on list 1). The original's selection sounds of this walk are never handled (BS7).
 */
export function energyStep(service: BaseService, sample: number, player: CraftEntity, craft: CraftRecord): void {
  if (!(sample > service.dues.energy)) return;
  service.dues.energy = rearm(sample, PERIODS.energy);
  const { combat } = player;
  const { weapons } = combat;
  const full = combat.energy === craft.at54;
  if (!full) combat.energy = Math.min((combat.energy + service.rates.energy) | 0, craft.at54);
  service.flags.energyAndMissilesFull = full;
  let list: 0 | 1 = 0;
  let first: number | null = null;
  let stop = false;
  let steps = 0;
  for (;;) {
    const head = weapons.selections[list].mount;
    if (head === null || stop) return;
    if (refillMissileChain(weapons, craft, head)) {
      stop = true;
      service.flags.energyAndMissilesFull = false;
    }
    if (head === first) {
      if (list === 0) {
        list = 1;
        first = null;
        continue;
      }
      stop = true;
    }
    first ??= head;
    advanceWalk(weapons, craft, list, ++steps);
  }
}
