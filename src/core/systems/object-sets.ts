/**
 * The `object-sets` stage (`0x2ede0`; docs/plan/p3/02/spec.md, MW-06; docs/original/formats/executable.md, map
 * contacts, coverage and fog, and T9): every tick, in any view, the rebuild `0x2f028`, then in the map (committed view
 * 8) the reveal (map-visibility.ts). The original's rate-limited branch runs on the program's first pass only, so Core
 * rebuilds every tick and keeps no refresh history. The sets and the flags persist to the next tick, where P3-08's
 * wingman AI reads them before this stage rebuilds them; targeting, the radar, collisions, damage, the parked update,
 * energy and the area check never read them.
 */
import type { EntityId } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { revealMapVisibility } from '../rules/map-visibility.ts';
import { ENEMY_KINDS } from '../rules/targeting.ts';
import type { TickContext } from './pipeline.ts';
import { MAP_VIEW_MODE } from './view-switch.ts';

/** The craft kinds, bits 0–19, the rebuild walks. */
const CRAFT_KINDS = 0xfffff;

/**
 * `0x2f028`: walks the craft kinds in kind-table order (ascending kind bit, then allocation), whatever their state,
 * activity, destroyed flag or Warp; each craft's map visibility flag takes its base value, false (MW-01: the source
 * record's "always on the map" +0x7C is never imported), and its ID joins the hostile set (kind in `0x93780`) or the
 * friendly set, in walk order; the player is the friendly set's first member.
 */
export function rebuildObjectSets(world: WorldState): void {
  const friendly: EntityId[] = [];
  const hostile: EntityId[] = [];
  for (const entity of world.entities.walk(CRAFT_KINDS)) {
    entity.mapVisible = false;
    (((ENEMY_KINDS >>> entity.kindBit) & 1) === 1 ? hostile : friendly).push(entity.id);
  }
  world.objectSets = Object.freeze({ friendly: Object.freeze(friendly), hostile: Object.freeze(hostile) });
}

/** Stage `object-sets`: the rebuild, then the reveal in view 8, with positions after movement and collisions. */
export function updateObjectSets({ world }: TickContext): void {
  rebuildObjectSets(world);
  if (world.player.viewMode === MAP_VIEW_MODE) revealMapVisibility(world);
}
