/**
 * The strategic map's visibility and coverage (docs/plan/p3/02/spec.md, MW-06 and MW-11; docs/original/formats/
 * executable.md, map contacts, coverage and fog): the reveal `0x2ee60`, which sets the map visibility flag (+0xD4) of
 * every hostile strictly within some friendly set member's craft +0x0C on the plane, and the coverage each map contact
 * draws (`0x49f8c`, `0x4ad1c`). The `object-sets` stage (object-sets.ts) calls the reveal in the map after its rebuild;
 * P3-08's wingman AI calls the same function in any view with the sets of the last rebuild. Nothing here keeps an
 * exploration history: coverage comes only from the current contacts.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { EntityId } from '../world/entity-table.ts';
import type { MapRuleData } from '../world/map-rule-data.ts';
import type { WorldState } from '../world/world-state.ts';
import { PLAYER_KIND_BIT } from './spawn-schedule.ts';
import { isFriendlyKind } from './targeting.ts';

/**
 * Whether `target` lies within the reveal range of `source`: D(D(dx²) + D(dy²)) < `rangeSquared`, dx and dy the double
 * differences of the f32 coordinates, z ignored; strict, an unordered compare counting as within. `rangeSquared` is
 * D(F(r) × F(r)) of the source's craft +0x0C.
 */
export function isWithinRevealRange(source: Vec3, target: Vec3, rangeSquared: number): boolean {
  const dx = source.x - target.x;
  const dy = source.y - target.y;
  return !(dx * dx + dy * dy >= rangeSquared);
}

/**
 * `0x2ee60`: for each friendly set member in order, a stale ID is dropped (order kept); otherwise the member becomes
 * map-visible, and each hostile set member not yet map-visible (stale IDs dropped as met) becomes map-visible within
 * the member's craft +0x0C (isWithinRevealRange). Once the hostiles this call revealed number as many as the hostile
 * set holds, it returns at once, leaving later members unvisited and their stale IDs in place.
 */
export function revealMapVisibility(world: WorldState): void {
  const { entities, objectSets } = world;
  const friendly: EntityId[] = [...objectSets.friendly];
  const hostile: EntityId[] = [...objectSets.hostile];
  let revealed = 0;
  sources: for (let i = 0; i < friendly.length; i++) {
    const source = entities.get(friendly[i]);
    if (source === undefined) {
      friendly.splice(i--, 1);
      continue;
    }
    source.mapVisible = true;
    const range = world.craftInfo.content.craft[source.kindBit]?.at0C;
    if (range === undefined) throw new CoreFaultError('invariant-violated', 'map-visibility.record');
    const rangeSquared = range * range;
    for (let j = 0; j < hostile.length; j++) {
      const target = entities.get(hostile[j]);
      if (target === undefined) {
        hostile.splice(j--, 1);
        continue;
      }
      if (target.mapVisible || !isWithinRevealRange(source.position, target.position, rangeSquared)) continue;
      target.mapVisible = true;
      if (++revealed === hostile.length) break sources;
    }
  }
  if (friendly.length !== objectSets.friendly.length || hostile.length !== objectSets.hostile.length) {
    world.objectSets = Object.freeze({ friendly: Object.freeze(friendly), hostile: Object.freeze(hostile) });
  }
}

/** A map contact's class: the player (kind bit 0), a friendly kind (`0x6c87f`) or, otherwise, a hostile one (`0x93780`). */
export type MapContactClass = 'player' | 'friendly' | 'hostile';

export function mapContactClass(kindBit: number): MapContactClass {
  if (kindBit === PLAYER_KIND_BIT) return 'player';
  return isFriendlyKind(kindBit) ? 'friendly' : 'hostile';
}

/** What a map contact draws around itself: a filled coverage disc (player, friendly) or a one-pixel range ring (hostile). */
export interface MapCoverage {
  /** Main-map pixels, > 0. */
  readonly radius: number;
  readonly style: 'disc' | 'ring';
}

/**
 * The coverage of a contact of `kindBit` whose craft +0x0C is `range` (`0x49f8c` entry +0x18, drawn by `0x4ad1c`):
 * radius trunc(D(F(+0x0C) × F(ppX))) stored as an i32, a disc unless the kind is hostile, a ring for it; null when the
 * radius is not positive (beyond i32 the store is the integer indefinite, negative), which draws nothing. The disc
 * ignores the in-world flag; the ring is the hostile's own range, not coverage.
 */
export function mapCoverage(map: MapRuleData, kindBit: number, range: number): MapCoverage | null {
  const radius = Math.trunc(range * map.pixelsPerUnit.x);
  if (!(radius > 0 && radius <= 0x7fffffff)) return null;
  return Object.freeze({ radius, style: mapContactClass(kindBit) === 'hostile' ? 'ring' : 'disc' });
}
