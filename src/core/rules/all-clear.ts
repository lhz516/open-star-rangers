/**
 * The all-clear test `0x69a70` (docs/plan/p3/02/spec.md, ME-08; docs/original/formats/executable.md, all-clear and
 * summary selection, P3-11/01) and the kind sets around it. Kinds come from an entity's `kindBit` (the content's
 * `craftType`), never from its `side`, which is coarser than the entry set.
 */
import type { MissionSetup } from '../mission/load-mission.ts';
import type { Entity, EntityTable } from '../world/entity-table.ts';
import type { SpawnEntry } from '../world/spawn-state.ts';
import { hasKind } from './radio.ts';

/** `0x93780`, kind bits 7–10, 12, 13, 16 and 19: an object event of these kinds runs the all-clear test. */
export const ENEMY_ENTRY_KINDS = 0x93780;
/** `0x91780`: the entry set without bit 13; the objects and queued sources the test counts. */
export const ALL_CLEAR_KINDS = 0x91780;

const inAllClearSet = (craftType: number | null): boolean => craftType !== null && hasKind(ALL_CLEAR_KINDS, craftType);

/** Whether a queued entry will instantiate a kind of the all-clear set: a record's own kind, any member of a group. */
function queuesEnemy({ declarations, groups }: Pick<MissionSetup, 'declarations' | 'groups'>, { source, index }: SpawnEntry): boolean {
  switch (source) {
    case 'record':
      return inAllClearSet(declarations[index].craftType);
    case 'group':
      return groups[index].members.some((member) => inAllClearSet(declarations[member].craftType));
    case 'wingman':
      return false;
  }
}

/**
 * `0x69a70(exclude)`: whether any of these is left, in this order:
 * 1. an entity of the all-clear set other than `exclude` that is neither flagged destroyed nor pending removal, whatever
 *    its activity (parked, active, docked), Warp or other state (`new` and `area-switch` included);
 * 2. a spawn queue entry, due or not, whose record or any group member has a kind of the set; the wingman's never.
 * A spawn request already taken off the queue and not yet handled is neither (ME-17 decision 1). The original's third
 * case, a trigger's spawn pair word, does not exist in supported content.
 */
export function hasRemainingEnemies(
  entities: EntityTable, queue: readonly SpawnEntry[], setup: Pick<MissionSetup, 'declarations' | 'groups'>, exclude: Entity | null,
): boolean {
  // for…of ends the walk on the return.
  for (const entity of entities.walk(ALL_CLEAR_KINDS)) {
    if (entity !== exclude && !entity.destroyed && entity.state !== 'pending-removal') return true;
  }
  return queue.some((entry) => queuesEnemy(setup, entry));
}
