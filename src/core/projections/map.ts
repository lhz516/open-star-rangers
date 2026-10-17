/**
 * The strategic map partition `map` (docs/plan/p3/02/spec.md, MW-11; docs/plan/p3/09/spec.md, 地图 projection;
 * docs/original/formats/executable.md, cursor, destination and marker; map contacts, coverage and fog; zoom window,
 * information window and labels; Warp cost and Warp start): everything P3-13 draws the map view from, read from the
 * world without changing it or drawing a random number, deeply frozen and detached from it.
 *
 * The partition is ready; its player is null without a player entity. While the committed view mode is not 8 the map is
 * closed and gives only the destination, the marker and the Warp gate, never contacts or coverage. Open, it reads the
 * icon list the tick's frame end built (`WorldState.mapIcons`, map-icons.ts): the list holds exactly the map contacts
 * (`0x2b8ec`), so a craft outside that predicate is in no contact, zoom member, information row, label or pick, while
 * the radar, the target and Render State keep their own rules (P3-07). Every other field derives from the list, the
 * player state and the static map rule data, as the original's map draw `0x49f8c` recomputes it every frame:
 *
 * - **Cursor:** its pixel, its world point (`0x4c4c0`) and the zoom bounds (`0x2bc30`).
 * - **Contacts:** one per icon in list order, at the icon's position and de-overlapped pixel, with its class and its
 *   coverage disc or ring (map-visibility.ts).
 * - **Zoom members** (`0x4c5ec`): the icons strictly inside the zoom bounds on x and y, at trunc((x − left) × zppX)
 *   (the i32's low 16 bits as i16); their selection box (all three axes |trunc(D(position − destination))| < 1000) and
 *   `0x4b98c`'s number, the truncated 3-D distance from the player's icon (null for the player's own icon, and for
 *   every member when the player has no icon). The zoom-window de-overlap `0x4b56c` positions icons by the HUD icon
 *   records' sizes, which no rule reads and Core has no input for; it is P3-13's drawing (MW-11).
 * - **Information rows** (`0x4ba80`): see informationRows.
 * - **Labels** (`0x4af78`): the in-world icons of the friendly and player kinds except 0x4000, one per unit.
 * - **Line** (`0x4c674`): from the player's icon pixel to the cursor's pixel; no line, label or range goes to the
 *   player's target or the destination.
 * - **Readouts:** the Warp cost from the player's icon position to the cursor's world point and to the stored
 *   destination (warp-energy.ts); the destination's pixel (`0x4c524`, not de-overlapped).
 * - **Warp gate:** `request-warp` judged on the committed view, destination and clock (warp.ts's judgeWarpRequest).
 *
 * The original always has the player's icon in an open map (kinds 0 and 1 are kept wherever they are). A player that
 * is no contact (in Warp after an abandoned Warp, or waiting for removal) has none: the line and the readouts then
 * start from its live position instead and the zoom numbers are null (MW-11, a project rule unreachable before P3-11).
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { mapPixelToWorld, worldToMapPixel, zoomBounds, type ZoomBounds } from '../rules/map-frame.ts';
import { mapContactClass, mapCoverage } from '../rules/map-visibility.ts';
import { toInt32 } from '../rules/record-defaults.ts';
import { PLAYER_KIND_BIT, WINGMAN_KIND_BIT } from '../rules/spawn-schedule.ts';
import { isFriendlyKind } from '../rules/targeting.ts';
import { warpCostReading } from '../rules/warp-energy.ts';
import { committedView } from '../systems/pipeline.ts';
import { MAP_VIEW_MODE, BASE_VIEW_MODE } from '../systems/view-switch.ts';
import { judgeWarpRequest } from '../systems/warp.ts';
import { frozenVec, MARKER_KIND_BIT, type Entity, type EntityId } from '../world/entity-table.ts';
import type { MapPoint, MapRuleData } from '../world/map-rule-data.ts';
import type { MapIcon, WorldState } from '../world/world-state.ts';
import type {
  MapContact, MapCostReading, MapInformationRow, MapLabel, MapOpen, MapPlayer, MapReady, MapZoomMember, WarpRequestReading,
} from './projection.ts';
import { craftRecord, reading } from './combat.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `map.${site}`);

const NO_PLAYER: MapReady = Object.freeze({ readiness: 'ready', player: null });

/** The kind 0x4000 (bit 14): in the friendly class, yet counted, not listed, and given no label. */
const COUNTED_FRIENDLY_KIND_BIT = 14;
/** The information window's count rows, in the original's order (`0x4ba80`). */
const COUNT_ORDER = Object.freeze([7, 8, 9, 10, 19, 13, 14, 16, 12] as const);
/** `0x1864a8`: the selection box's reach on each axis, strict. */
const BOX_REACH = 1000;
const AXES = Object.freeze(['x', 'y', 'z'] as const);
const ACCEPTED: WarpRequestReading = Object.freeze({ accepted: true });

/** A frozen shallow copy of flat data (a pixel, a rectangle, a pair). */
const frozen = <Value extends object>(value: Value): Value => Object.freeze({ ...value });

function craftCombat({ combat }: Entity) {
  if (combat.type !== 'craft') throw fault('combat');
  return combat;
}

/** The first entity of the marker's kind (`0x5261c`'s first visit), whatever its state. */
function markerEntityId(world: WorldState): EntityId | null {
  for (const marker of world.entities.walk(1 << MARKER_KIND_BIT)) return marker.id;
  return null;
}

/** MW-04's gate on the committed state at the world clock; reading it changes nothing. */
function warpRequest(world: WorldState): WarpRequestReading {
  const judgement = judgeWarpRequest(world, committedView(world), world.clock);
  return typeof judgement === 'string' ? Object.freeze({ accepted: false, reason: judgement }) : ACCEPTED;
}

/** An x87 truncation stored by `FISTP` to a dword and kept as its low 16 bits, signed (integer indefinite beyond i32). */
function int16OfTruncation(value: number): number {
  const truncated = Math.trunc(value);
  return truncated >= -0x80000000 && truncated <= 0x7fffffff ? (truncated << 16) >> 16 : 0;
}

/** `0x4c5ec`: the zoom pixel of an icon strictly inside the zoom bounds on x and y (z untested), else null. */
function zoomPixel(map: MapRuleData, bounds: ZoomBounds, { x, y }: Vec3): MapPoint | null {
  if (!(bounds.left < x && x < bounds.right && bounds.top < y && y < bounds.bottom)) return null;
  return Object.freeze({
    column: int16OfTruncation((x - bounds.left) * map.zoomPixelsPerUnit.x),
    row: int16OfTruncation((y - bounds.top) * map.zoomPixelsPerUnit.y),
  });
}

/** The zoom window's selection box: on each axis |trunc(D(position − destination))| < 1000. */
function isBoxed(position: Vec3, destination: Vec3 | null): boolean {
  if (destination === null) return false;
  return AXES.every((axis) => Math.abs(Math.trunc(position[axis] - destination[axis])) < BOX_REACH);
}

/** `0x4b98c`'s number: trunc(√((dx² + dy²) + dz²)) of the icons' positions, the i64's low 32 bits. */
function zoomDistance(from: Vec3, to: Vec3): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return toInt32(Math.trunc(Math.sqrt(dx * dx + dy * dy + dz * dz)));
}

/** A craft listed in the information window and labelled: a friendly-class kind (`0x6c87f`) other than 0x4000. */
const isListedKind = (kindBit: number): boolean => isFriendlyKind(kindBit) && kindBit !== COUNTED_FRIENDLY_KIND_BIT;

/**
 * `0x4ba80`: with n rows written so far and capacity C, each zoom member in list order while n < C gives, for a listed
 * kind, a name row and, if then still n < C, a value row (shield ÷ c5C, hull ÷ c9C, energy ÷ c54 as raw readings), or
 * otherwise counts its kind; members after the capacity is reached are neither listed nor counted. Then, only if
 * n < C, one count row per non-zero counter in the fixed order, which the capacity does not limit.
 */
function informationRows(world: WorldState, members: readonly Entity[]): readonly MapInformationRow[] {
  const capacity = world.ruleData.map.informationCapacity;
  const rows: MapInformationRow[] = [];
  const counts = new Map<number, number>();
  for (const entity of members) {
    if (rows.length >= capacity) break;
    const { id: entityId, kindBit } = entity;
    if (!isListedKind(kindBit)) {
      counts.set(kindBit, (counts.get(kindBit) ?? 0) + 1);
      continue;
    }
    rows.push(Object.freeze({ type: 'unit-name', entityId, kindBit, name: entity.name }));
    if (rows.length >= capacity) break;
    const combat = craftCombat(entity);
    const record = craftRecord(world, kindBit);
    rows.push(Object.freeze({
      type: 'unit-values',
      entityId,
      shield: reading(combat.shield, record.at5C),
      hull: reading(combat.hull, record.at9C),
      energy: reading(combat.energy, record.at54),
    }));
  }
  if (rows.length < capacity) {
    for (const kindBit of COUNT_ORDER) {
      const count = counts.get(kindBit) ?? 0;
      if (count > 0) rows.push(Object.freeze({ type: 'count', kindBit, count }));
    }
  }
  return Object.freeze(rows);
}

/** The destination's mark: its pixel (`0x4c524`, not de-overlapped) and its cost readout. */
function destinationReading(map: MapRuleData, destination: Vec3, cost: MapCostReading): MapOpen['destination'] {
  const { pixel, inWorld } = worldToMapPixel(map, destination);
  return Object.freeze({ position: frozenVec(destination), pixel: frozen(pixel), inWorld, cost });
}

/** The open map (MW-11); `player` is the player entity. */
function openMap(world: WorldState, player: Entity): MapOpen {
  const { map } = world.ruleData;
  const { player: state } = world;
  const { destination } = state.map;
  const cursorPixel = frozen(state.map.cursor);
  const cursorWorld = mapPixelToWorld(map, cursorPixel);
  const bounds = zoomBounds(map, cursorWorld);
  // The frame end built the list after every stage that removes entities.
  const entityOf = (icon: MapIcon): Entity => {
    const entity = world.entities.get(icon.entityId);
    if (entity === undefined) throw fault('icon');
    return entity;
  };
  const playerIcon = world.mapIcons.find(({ entityId }) => entityId === player.id) ?? null;

  const contacts: MapContact[] = [];
  const labels: MapLabel[] = [];
  const zoomMembers: MapZoomMember[] = [];
  const memberEntities: Entity[] = [];
  for (const icon of world.mapIcons) {
    const entity = entityOf(icon);
    const { entityId, kindBit, inWorld } = icon;
    const pixel = frozen(icon.pixel);
    const position = frozenVec(icon.position);
    contacts.push(Object.freeze({
      entityId,
      kindBit,
      name: entity.name,
      position,
      pixel,
      inWorld,
      class: mapContactClass(kindBit),
      target: entityId === state.target,
      coverage: mapCoverage(map, kindBit, craftRecord(world, kindBit).at0C),
    }));
    if (inWorld && isListedKind(kindBit)) {
      labels.push(Object.freeze({ entityId, name: entity.name, pixel, playerOrWingman: kindBit === PLAYER_KIND_BIT || kindBit === WINGMAN_KIND_BIT }));
    }
    const zoom = zoomPixel(map, bounds, icon.position);
    if (zoom === null) continue;
    memberEntities.push(entity);
    zoomMembers.push(Object.freeze({
      entityId,
      pixel: zoom,
      boxed: isBoxed(icon.position, destination),
      distance: playerIcon === null || icon === playerIcon ? null : zoomDistance(playerIcon.position, icon.position),
    }));
  }

  const origin = playerIcon?.position ?? player.position;
  const from = playerIcon?.pixel ?? worldToMapPixel(map, player.position).pixel;
  const { pairs } = craftRecord(world, player.kindBit);
  const { energy } = craftCombat(player);
  const cost = (point: Vec3): MapCostReading => Object.freeze(warpCostReading(pairs, origin, point, energy));

  return Object.freeze({
    state: 'open',
    openedFromBase: state.previousViewMode === BASE_VIEW_MODE,
    geometry: Object.freeze({
      main: frozen(map.main),
      information: frozen(map.information),
      zoom: frozen(map.zoom),
      pixelsPerUnit: frozen(map.pixelsPerUnit),
      unitsPerPixel: frozen(map.unitsPerPixel),
      zoomPixelsPerUnit: frozen(map.zoomPixelsPerUnit),
      world: frozen(map.world),
    }),
    cursor: Object.freeze({ pixel: cursorPixel, world: frozenVec(cursorWorld), zoomBounds: frozen(bounds) }),
    contacts: Object.freeze(contacts),
    zoomMembers: Object.freeze(zoomMembers),
    information: Object.freeze({ capacity: map.informationCapacity, rows: informationRows(world, memberEntities) }),
    labels: Object.freeze(labels),
    line: Object.freeze({ from: frozen(from), to: cursorPixel }),
    destination: destination === null ? null : destinationReading(map, destination, cost(destination)),
    cursorCost: cost(cursorWorld),
    markerEntityId: markerEntityId(world),
    warpRequest: warpRequest(world),
  });
}

/** The map partition (MW-11): ready, with the player's map, or null without a player entity. */
export function projectMap(world: WorldState): MapReady {
  const { player: state } = world;
  if (state.entityId === null) return NO_PLAYER;
  const player = world.entities.get(state.entityId);
  if (player === undefined) throw fault('player');
  const reading: MapPlayer = state.viewMode === MAP_VIEW_MODE
    ? openMap(world, player)
    : Object.freeze({
      state: 'closed',
      destination: state.map.destination === null ? null : frozenVec(state.map.destination),
      markerEntityId: markerEntityId(world),
      warpRequest: warpRequest(world),
    });
  return Object.freeze({ readiness: 'ready', player: reading });
}
