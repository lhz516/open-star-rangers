/**
 * The full repair `0x39820` (docs/plan/p3/02/spec.md, CB-10; docs/original/formats/executable.md, BS9 and D7): one pure
 * rule that docking (the wingman), the wingman's arrival at a base, P3-11's rescue and P3-08's `0x61bd0` share. In
 * order: fields 0–18 := 0; every damaged mount of lists 1 and 0 intact (`0x2e1fc`, `0x2e3c8` with flag 1); hull := c9C
 * and energy := c54 of the entity's own record; the missile walk below; the disturbance reset `0x21bd4`(h, 0). Nothing
 * else is written: fields 19 on, list 2, shield, charge, levels, spare power, maximum speed, cooldowns, the control
 * lock, the commanded speed, the energy-update clocks, the project's `depleted` latch (the next energy update clears it
 * once the energy is above 0, so a later depletion is a new fact), the main-flow sub-state, counters, target and dead flag.
 *
 * The walk takes list 0, then list 1: from the list's current mount it refills each head's missile chain, advances the
 * selection with `0x2d6dc` and comes back to its first head, so both lists end where they started, with no early stop
 * and no extra list-1 advance (BS6's service walk has both). Each list-1 advance clears the lock level. A list without
 * a current mount ends the whole walk.
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { CoreFaultError } from '../errors.ts';
import { SUBSYSTEM_COUNT, type MovementBlock, type SubsystemState, type WeaponBlock } from '../world/entity-table.ts';
import type { CraftEntity } from './combat-init.ts';
import { alternateLink, isMissileMount, mountState, repairListMounts, selectMount, type Selection } from './mounts.ts';

/** Fields 0–18 all intact. */
const INTACT_SUBSYSTEMS: readonly SubsystemState[] = Object.freeze(Array.from({ length: SUBSYSTEM_COUNT }, () => 0 as const));

/** `0x21bd4(object, 0)`: only a mode-0 block takes it; level 0 draws nothing. */
export function resetDisturbance(movement: MovementBlock | null): void {
  if (movement !== null && movement.mode === 'craft') movement.disturbance = null;
}

/**
 * The refill of a head's chain in both missile walks: when the head carries a missile, every state on its alternate
 * chain, the head included, whose ammunition is below its mount's +0x0C (signed) gets that ammunition. Returns whether
 * the state so refilled was the end of the chain, which ends BS6's walk.
 */
export function refillMissileChain(weapons: WeaponBlock, craft: CraftRecord, head: number): boolean {
  if (!isMissileMount(craft.mounts[head])) return false;
  let refilledEnd = false;
  for (let index: number | null = head; index !== null; index = alternateLink(craft.mounts[index])) {
    const state = mountState(weapons, index);
    const maximum = craft.mounts[index].at0C;
    if (state.ammunition >= maximum) continue;
    state.ammunition = maximum;
    if (alternateLink(craft.mounts[index]) === null) refilledEnd = true;
  }
  return refilledEnd;
}

/**
 * `0x2d6dc(h, list)`: one advance of a walk, which the stored selection always matches; a walk longer than the lists
 * allow means the selection names no mount of its list.
 */
export function advanceWalk(weapons: WeaponBlock, craft: CraftRecord, list: 0 | 1, steps: number): Selection {
  const selection = selectMount(weapons, craft, list, 1);
  if (selection === null || steps > craft.mountLists[0].length + craft.mountLists[1].length + 1) {
    throw new CoreFaultError('invariant-violated', 'full-repair.walk');
  }
  return selection;
}

/** `0x39820` on `entity`, whose own record is `craft`; `onAdvance` gets every selection advance (module comment). */
export function repairFully(entity: CraftEntity, craft: CraftRecord, onAdvance: (list: 0 | 1, selection: Selection) => void): void {
  const { combat } = entity;
  const { weapons } = combat;
  combat.subsystems = INTACT_SUBSYSTEMS;
  repairListMounts(weapons, craft, 1, true);
  repairListMounts(weapons, craft, 0, true);
  combat.hull = craft.at9C;
  combat.energy = craft.at54;
  let steps = 0;
  walk: for (const list of [0, 1] as const) {
    let first: number | null = null;
    for (;;) {
      const head = weapons.selections[list].mount;
      if (head === null) break walk;
      refillMissileChain(weapons, craft, head);
      if (head === first) break;
      first ??= head;
      onAdvance(list, advanceWalk(weapons, craft, list, ++steps));
    }
  }
  resetDisturbance(entity.movement);
}
