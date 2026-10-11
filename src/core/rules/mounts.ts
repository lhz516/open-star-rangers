/**
 * Mount lists of a craft's weapon block (docs/plan/p3/02/spec.md, CR-02 and CR-05; docs/original/formats/executable.md,
 * W1–W4 and W8): the three lists' selection `0x2e4ec`, the mount damage of subsystems 8 and 5 (`0x2e310`, `0x2e150`),
 * the repairs `0x2e3c8`/`0x2e1fc` and the statuses `0x2e438`/`0x2e264`, which P3-07/15, P3-10 and the cockpit display
 * step call, and the ammunition of a missile entry `0x2dd04`.
 *
 * A mount's links are the craft record's: +0x18 names the mount it fires together with (the state's +0x14) and +0x1C
 * the mount it alternates with (the state's +0x18). Each mount state is the weapon block's entry of the same index, as
 * `0x2d400` builds it. Walks over list 0 follow the fire-together link when there is one and the alternate link
 * otherwise; walks over list 1 follow only the alternate link. World creation proves both links acyclic (CR-01).
 *
 * Integers are i32 as in the original (W13); `rand % n` takes rand values 0–32767, so it is never negative.
 */
import type { CraftRecord, Mount } from '../../content/rule-data/craft-info.ts';
import { CoreFaultError } from '../errors.ts';
import type { MountState, WeaponBlock } from '../world/entity-table.ts';
import type { RandSource } from './original-random.ts';

/** The three mount lists: 0 main weapons (primary), 1 missiles (secondary), 2 the AI's third channel. */
export type MountList = 0 | 1 | 2;

/** The mount a mount fires together with (its state's +0x14), or null. */
export const togetherLink = (mount: Mount): number | null => mount.at18;

/** The mount a mount alternates with (its state's +0x18), or null. */
export const alternateLink = (mount: Mount): number | null => mount.at1C;

/** Whether a mount carries a missile (mount +0x10 = 1) rather than a gun. */
export const isMissileMount = (mount: Mount): boolean => mount.at10 === 1;

/** The state of mount `index` in `weapons`; a missing one is a broken invariant. */
export function mountState(weapons: WeaponBlock, index: number): MountState {
  const state = weapons.mounts[index];
  if (state === undefined) throw new CoreFaultError('invariant-violated', 'mounts.state');
  return state;
}

/** The mount of entry `entry` of list `list` (`0x2e990`). */
function listMount(craft: CraftRecord, list: MountList, entry: number): number {
  const mount = craft.mountLists[list][entry];
  if (mount === undefined) throw new CoreFaultError('invariant-violated', 'mounts.entry');
  return mount;
}

/** The next mount of a walk from `index`: the fire-together link, then the alternate link for list 0; only the latter for list 1. */
function nextInWalk(craft: CraftRecord, list: 0 | 1, index: number): number | null {
  const mount = craft.mounts[index];
  return list === 0 ? (togetherLink(mount) ?? alternateLink(mount)) : alternateLink(mount);
}

/** The mounts of a walk from `start`, in order. */
function* walk(craft: CraftRecord, list: 0 | 1, start: number): Generator<number> {
  for (let index: number | null = start; index !== null; index = nextInWalk(craft, list, index)) yield index;
}

/** The outcome of a selection: the list's new index and current mount, and whether the current mount changed. */
export interface Selection {
  readonly index: number;
  readonly mount: number | null;
  readonly changed: boolean;
}

/**
 * `0x2e4ec(object, list, delta)`: null without a change for a craft without mounts (the original has no state array).
 * Otherwise it adds `delta` to the list's index (i32), wrapping below 0 to count − 1 and from count on to 0, and makes
 * entry `index` the current mount, none for an empty list (whose index may become −1). List 1 clears the lock level.
 * All of this happens whether or not the selection changes; unusable mounts are not skipped (W3).
 */
export function selectMount(weapons: WeaponBlock, craft: CraftRecord, list: MountList, delta: number): Selection | null {
  if (weapons.mounts.length === 0) return null;
  const count = craft.mountLists[list].length;
  const selection = weapons.selections[list];
  const before = selection.mount;
  const index = (selection.index + delta) | 0;
  selection.index = index < 0 ? count - 1 : index >= count ? 0 : index;
  selection.mount = count === 0 ? null : listMount(craft, list, selection.index);
  if (list === 1) weapons.lock.level = 0;
  return { index: selection.index, mount: selection.mount, changed: selection.mount !== before };
}

/**
 * The mount damage of subsystem 8 (`0x2e310`, list 0) and 5 (`0x2e150`, list 1): for a non-empty list, one draw picks
 * an entry, rand % count; the walk from it takes the first mount not destroyed, or changes nothing when every one is.
 * Its damage level goes up by one; a mount just damaged (level 1) with ammunition left keeps rand % ammunition (a second
 * draw), any other loses it all. Lists 2 and the automatic mounts are never damaged.
 */
export function damageListMount(weapons: WeaponBlock, craft: CraftRecord, list: 0 | 1, rand: RandSource): void {
  const count = craft.mountLists[list].length;
  if (count === 0 || weapons.mounts.length === 0) return;
  const start = listMount(craft, list, rand.next() % count);
  for (const index of walk(craft, list, start)) {
    const state = mountState(weapons, index);
    if (state.damage === 2) continue;
    state.damage = state.damage === 0 ? 1 : 2;
    state.ammunition = state.damage === 1 && state.ammunition > 0 ? rand.next() % state.ammunition : 0;
    return;
  }
}

/**
 * The repair of list 0 (`0x2e3c8`) or list 1 (`0x2e1fc`) for P3-10's base interior: in list order, then walk order,
 * `all` false resets the first damaged mount to intact and returns 0; `all` true resets every damaged mount and returns
 * 1; with nothing damaged it returns 1. Ammunition is not restored.
 */
export function repairListMounts(weapons: WeaponBlock, craft: CraftRecord, list: 0 | 1, all: boolean): 0 | 1 {
  if (weapons.mounts.length === 0) return 1;
  for (const head of craft.mountLists[list]) {
    for (const index of walk(craft, list, head)) {
      const state = mountState(weapons, index);
      if (state.damage === 0) continue;
      state.damage = 0;
      if (!all) return 0;
    }
  }
  return 1;
}

/**
 * The status of list 0 (`0x2e438`, subsystem 8's display) or list 1 (`0x2e264`, subsystem 5's) over every entry's walk:
 * 0 when no mount is damaged or destroyed, 2 when every mount is destroyed, 1 otherwise.
 */
export function listStatus(weapons: WeaponBlock, craft: CraftRecord, list: 0 | 1): 0 | 1 | 2 {
  let damaged = false;
  let usable = false;
  for (const head of craft.mountLists[list]) {
    for (const index of walk(craft, list, head)) {
      const { damage } = mountState(weapons, index);
      damaged ||= damage !== 0;
      usable ||= damage !== 2;
    }
  }
  if (!damaged) return 0;
  return usable ? 1 : 2;
}

/**
 * `0x2dd04`: the ammunition on the alternate chain from mount `index`, summed over its missile mounts (i32); −1 when
 * the mount carries a gun.
 */
export function chainAmmunition(weapons: WeaponBlock, craft: CraftRecord, index: number): number {
  if (!isMissileMount(craft.mounts[index])) return -1;
  let sum = 0;
  for (let at: number | null = index; at !== null; at = alternateLink(craft.mounts[at])) {
    if (isMissileMount(craft.mounts[at])) sum = (sum + mountState(weapons, at).ammunition) | 0;
  }
  return sum;
}
