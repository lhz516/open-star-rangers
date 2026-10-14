/**
 * The strategic map's icon list and its pick (docs/plan/p3/02/spec.md, MW-02 and MW-07; docs/original/formats/
 * executable.md, cursor, destination and marker; map contacts, coverage and fog; zoom window, information window and
 * labels): the frame end of a tick in the map builds the list from the map contacts (`0x2b8ec`, whose predicate this
 * module holds), projects each to its main-map pixel (`0x4c524`) and de-overlaps coincident pixels (`0x4b3a8`); a select
 * in the next tick's request handling picks the nearest icon within 3 pixels (`0x4c310`) from that list. Core owns and
 * snapshots the list, so that a pick never depends on a renderer.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { frozenVec, type Entity } from '../world/entity-table.ts';
import type { MapPixel, MapPoint, MapRuleData } from '../world/map-rule-data.ts';
import type { MapIcon, WorldState } from '../world/world-state.ts';
import { mapPixelToWorld, worldToMapPixel, type ProjectedPixel } from './map-frame.ts';
import { PLAYER_KIND_BIT, WINGMAN_KIND_BIT } from './spawn-schedule.ts';
import { ENEMY_KINDS } from './targeting.ts';

/** The craft kinds, bits 0–19, that the contact walk visits. */
const CRAFT_KINDS = 0xfffff;
/** The player's and the wingman's kinds, kept wherever they are. */
const ALWAYS_KEPT_KINDS = (1 << PLAYER_KIND_BIT) | (1 << WINGMAN_KIND_BIT);

/**
 * Whether a craft is a map contact (`0x2b8ec`): a hostile kind (`0x93780`) must be map-visible, as friendly kinds are
 * not tested; none in Warp or waiting for removal; and in the world rectangle (inclusive) unless it is the player or a
 * wingman.
 */
export function isMapContact(map: MapRuleData, entity: Entity): boolean {
  const { kindBit } = entity;
  if (((ENEMY_KINDS >>> kindBit) & 1) === 1 && !entity.mapVisible) return false;
  if (entity.inWarp || entity.state === 'pending-removal') return false;
  return ((ALWAYS_KEPT_KINDS >>> kindBit) & 1) === 1 || worldToMapPixel(map, entity.position).inWorld;
}

/**
 * The cumulative offsets from an icon's own pixel for its de-overlap counter 0–7 (`0x4b384`); at 8 it returns to its
 * own pixel and stops.
 */
const DE_OVERLAP_STEPS: readonly (readonly [number, number])[] = Object.freeze([
  [3, 3], [-3, 3], [-3, -3], [3, -3], [3, 0], [0, 3], [-3, 0], [0, -3],
]);

const samePixel = (a: MapPoint, b: MapPoint): boolean => a.column === b.column && a.row === b.row;

/**
 * `0x4b3a8`: the first icon never moves; each later icon i, while its pixel equals that of another icon j in the world
 * (scanning j from 0, j ≠ i), moves to its own pixel plus the next cumulative offset and scans again from j = 0; the
 * ninth coincidence puts it back on its own pixel and ends its scan. The in-world flags are not recomputed.
 */
export function deOverlap(projected: readonly ProjectedPixel[]): readonly MapPoint[] {
  const result = projected.map(({ pixel }) => pixel);
  for (let i = 1; i < result.length; i++) {
    const own = result[i];
    let counter = 0;
    for (let j = 0; j < result.length; j++) {
      if (j === i || !projected[j].inWorld || !samePixel(result[i], result[j])) continue;
      if (counter === DE_OVERLAP_STEPS.length) {
        result[i] = own;
        break;
      }
      const [column, row] = DE_OVERLAP_STEPS[counter++];
      result[i] = { column: own.column + column, row: own.row + row };
      j = -1;
    }
  }
  return result;
}

/**
 * MW-07 steps 1 and 2: the icon list of the map contacts in kind-table order (ascending kind bit, then allocation),
 * each at its current position, projected and then de-overlapped; frozen, for `WorldState.mapIcons`.
 */
export function buildMapIcons(world: WorldState): readonly MapIcon[] {
  const { map } = world.ruleData;
  const contacts: Entity[] = [];
  for (const entity of world.entities.walk(CRAFT_KINDS)) if (isMapContact(map, entity)) contacts.push(entity);
  const projected = contacts.map(({ position }) => worldToMapPixel(map, position));
  const pixels = deOverlap(projected);
  return Object.freeze(contacts.map((entity, index): MapIcon => Object.freeze({
    entityId: entity.id,
    kindBit: entity.kindBit,
    position: frozenVec(entity.position),
    pixel: Object.freeze(pixels[index]),
    inWorld: projected[index].inWorld,
  })));
}

/** The pick's reach: ±3 pixels on each axis, inclusive. */
const PICK_REACH = 3;

/**
 * `0x4c310`: among the icons in the world other than the player's (kind bit 0) whose pixel lies within ±3 of `point`
 * on both axes, the one with the least d = Δcolumn² + Δrow², the earliest on a tie; null when there is none.
 */
export function pickMapIcon(icons: readonly MapIcon[], point: MapPixel): MapIcon | null {
  let best: MapIcon | null = null;
  let bestDistance = Infinity;
  for (const icon of icons) {
    if (!icon.inWorld || icon.kindBit === PLAYER_KIND_BIT) continue;
    const dx = icon.pixel.column - point.column;
    const dy = icon.pixel.row - point.row;
    if (Math.abs(dx) > PICK_REACH || Math.abs(dy) > PICK_REACH) continue;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = icon;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * A select's destination at `pixel` (`0x2b9bc`): the pixel's world point (`0x4c4c0`, z +0.0) with the z of the icon
 * the pick finds in `icons` (`0x4c310`, `0x2bd74`), or +0.0 without one.
 */
export function selectDestination(map: MapRuleData, icons: readonly MapIcon[], pixel: MapPixel): { readonly destination: Vec3; readonly icon: MapIcon | null } {
  const point = mapPixelToWorld(map, pixel);
  const icon = pickMapIcon(icons, pixel);
  return { destination: Object.freeze({ x: point.x, y: point.y, z: icon === null ? 0 : icon.position.z }), icon };
}
