/**
 * The radar's contacts (docs/original/formats/executable.md, T6 and T10; docs/plan/p3/02/spec.md, CR-11 and CR-12): what
 * the original's contact buffer holds, read from the world without changing it or drawing a random number. Where the
 * contacts appear on the screen, the damaged radar's noise and the rebuild cadence belong to the presentation (P3-13).
 *
 * The contacts are the entities of kinds `0x21fffff` (every craft, missiles and the map/Warp marker) that are not parked,
 * are in state 4 or 7 and above, have a movement block and are not the player, in walk order (the camera pass `0x21584`
 * and the build `0x40370`); there is no range or visibility test. After each contact the count goes up by one, and by one
 * more for the target box when the contact is the player's target and the count is still below 120. The build stops once
 * the count reaches 120, the target box included; Core does not reproduce the original's writes past its 120 entries
 * (CR-11, difference 7).
 *
 * The status is the player's subsystem field 12. At 2 there is no real contact. At 1 the real contacts stay and the
 * presentation adds the noise. The build tests the field only for 2 and 1 (`0x40399`, `0x4078a`, `0x408d1`), so the value
 * 3, which no damage writes, builds as 0 and reads as 0.
 *
 * Arithmetic (T10): the offset is each f32 difference of the positions; the Manhattan distance is (|dx| + |dy|) + |dz|
 * of the double differences, truncated to i32 (`0x74518`); a sum that does not fit is a fault, as the original's
 * unmasked invalid-operation exception is.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { RadarContact } from '../projections/projection.ts';
import { isActiveState, MISSILE_KIND_BIT, type Entity, type EntityId, type EntityTable } from '../world/entity-table.ts';
import { isFriendlyKind } from './targeting.ts';

/** The kinds the camera pass posts radar items for: bits 0–20 and 25. */
export const RADAR_KINDS = 0x21fffff;
/** The contact buffer's 120 entries, the target boxes included. */
export const RADAR_CAPACITY = 120;
/** A contact is near when its truncated Manhattan distance is below this (signed). */
export const NEAR_DISTANCE = 600;
/** The player's subsystem field the radar reads. */
const RADAR_SUBSYSTEM = 12;
/** The map/Warp marker (P3-09). */
const MARKER_KIND_BIT = 25;

export type RadarStatus = 0 | 1 | 2;

/** The radar's reading: its status and its contacts in build order, deeply frozen. */
export interface RadarReading {
  readonly status: RadarStatus;
  readonly contacts: readonly RadarContact[];
}

/**
 * A contact's class by the friendly class `0x6c87f`: a missile by its shooter's kind (null when the shooter no longer resolves, which is hostile), the
 * marker apart, every other kind by its own.
 */
export function contactClass(kindBit: number, shooterKindBit: number | null): RadarContact['class'] {
  if (kindBit === MISSILE_KIND_BIT) return shooterKindBit !== null && isFriendlyKind(shooterKindBit) ? 'friendly' : 'hostile';
  if (isFriendlyKind(kindBit)) return 'friendly';
  return kindBit === MARKER_KIND_BIT ? 'marker' : 'hostile';
}

/** Whether `to` is near `from`: the Manhattan distance truncated to i32 is below 600. */
export function isNear(from: Vec3, to: Vec3): boolean {
  const distance = Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + Math.abs(to.z - from.z);
  if (!(distance < 2 ** 31)) throw new CoreFaultError('invariant-violated', 'radar.distance');
  return Math.trunc(distance) < NEAR_DISTANCE;
}

/** Whether the camera pass and the build keep `entity` as a contact of `player`'s radar. */
function isContact(entity: Entity, player: Entity): boolean {
  return entity !== player && entity.activity !== 'parked' && entity.movement !== null
    && (entity.state === 'destroyed-source' || isActiveState(entity.state));
}

function shooterKindBit(entities: EntityTable, entity: Entity): number | null {
  if (entity.combat.type !== 'missile' || entity.combat.shooter === null) return null;
  return entities.get(entity.combat.shooter)?.kindBit ?? null;
}

/** The radar status of subsystem field 12; see the module comment. */
function radarStatus(player: Entity): RadarStatus {
  if (player.combat.type !== 'craft') throw new CoreFaultError('invariant-violated', 'radar.player');
  const field = player.combat.subsystems[RADAR_SUBSYSTEM];
  return field === 3 ? 0 : field;
}

/** The radar of `player`, whose target is `target`; reading it changes nothing. */
export function readRadar(entities: EntityTable, player: Entity, target: EntityId | null): RadarReading {
  const status = radarStatus(player);
  const contacts: RadarContact[] = [];
  if (status !== 2) {
    let count = 0;
    for (const entity of entities.walk(RADAR_KINDS)) {
      if (count >= RADAR_CAPACITY) break;
      if (!isContact(entity, player)) continue;
      count++;
      const boxed = entity.id === target && count < RADAR_CAPACITY;
      if (boxed) count++;
      const { position } = entity;
      contacts.push(Object.freeze({
        entityId: entity.id,
        offset: Object.freeze({
          x: Math.fround(position.x - player.position.x),
          y: Math.fround(position.y - player.position.y),
          z: Math.fround(position.z - player.position.z),
        }),
        class: contactClass(entity.kindBit, shooterKindBit(entities, entity)),
        missile: entity.kindBit === MISSILE_KIND_BIT,
        near: isNear(player.position, position),
        target: boxed,
      }));
    }
  }
  return Object.freeze({ status, contacts: Object.freeze(contacts) });
}
