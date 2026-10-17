/**
 * The active area and the parked objects (docs/plan/p3/06/spec.md, 活动区域、停放与世界边界; D-02, D-06, D-08;
 * docs/original/formats/executable.md, world boundary, active area, parking and autopilot, P3-06/04):
 * - stage 17, the area check (`0x3a468`/`0x3a4b0`), only writes object states, through object-state.ts's retire;
 * - message 0x20's parking switch (`0x21060`–`0x2112b`), which request handling's `leave` tries first, releases or
 *   builds the movement block;
 * - stage 13, the parked update (`0x2f1b0`): its cadence, the Warp transit (`0x2f298`, which also holds the generic
 *   part of an entity's own update) and the parked travel (`0x2f314`) with the parked Warp jump, the formation snap and
 *   the world exit, the one true exit, which emits `object-left-world`.
 *
 * None of them bounds an active object: it may fly anywhere, and only parking hands it to the parked update. Until
 * P3-08 the parked travel follows the AI state instantiation wrote; the parked combat (P3-07) follows the travel. A
 * hostile's position write inside the active area ends with P3-10's report `0x3c3b0` (comm-reactions.ts) and the
 * wingman's arrival at a base starts with P3-10's full repair (base-interior.ts). The area centre, the Warp destination
 * while the player is in Warp (P3-09), comes from rules/active-area.ts's activeAreaCentre.
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { activeAreaCentre, isOutsideExitBounds, isRemovedOnLeaving, isWithinActiveArea } from '../rules/active-area.ts';
import { rearm } from '../rules/base-service.ts';
import { BASE_KINDS, HOSTILE_KINDS } from '../rules/comm-reactions.ts';
import { initialMovementBlock } from '../rules/flight-state.ts';
import { RandStream, type RandSource } from '../rules/original-random.ts';
import {
  advanced,
  formationPosition,
  goalDistance,
  hasArrived,
  headingTowards,
  isInWarpTransit,
  isParkedUpdateDue,
  isWarpAllowed,
  isWarpJumpDistance,
  jittered,
  offsetGoal,
  randomTargetOffset,
  TRAVEL_JITTER,
  travelLength,
  WARP_JUMP_JITTER,
  warpJumpLength,
} from '../rules/parked-travel.ts';
import { areaPoint } from '../rules/placement.ts';
import { hasKind } from '../rules/radio.ts';
import { PLAYER_KIND_BIT, WINGMAN_KIND_BIT } from '../rules/spawn-schedule.ts';
import { isActiveState, setActivity, ZERO_VECTOR, type Entity, type ObjectState } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { fullRepair } from './base-interior.ts';
import { reportParkedEnemy } from './comm-reactions.ts';
import { retire } from './object-state.ts';
import { emit, type TickContext } from './pipeline.ts';

/** Kinds the area check walks: every kind but the player's, `0x1fffffe`. */
const AREA_CHECK_KINDS = 0x1fffffe;
/** Kinds the parked update walks: every craft kind, `0xfffff`. */
const PARKED_UPDATE_KINDS = 0xfffff;

/** The wingman's arrival repair waits 0x780 clock units before it repeats (RX6). */
const WINGMAN_ARRIVAL_REPAIR_INTERVAL = 0x780;

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `area.${site}`);

/** The craft record at object +0x1C; world creation binds every instantiable kind to one (D-01). */
function craftRecord(world: WorldState, entity: Entity): CraftRecord {
  const record = world.craftInfo.content.craft[entity.kindBit];
  if (record === undefined) throw fault('record');
  return record;
}

/**
 * `0x2f298`: whether an entity is in Warp transit, in Warp with its timer set and the transit, timed by the valid
 * formation leader's record or its own, not over. Once it is over the entity is no longer in Warp.
 */
export function checkWarpTransit(world: WorldState, entity: Entity): boolean {
  if (!entity.inWarp || entity.warpClock === 0) return false;
  const leader = entity.formation === null ? undefined : world.entities.get(entity.formation.leader);
  if (isInWarpTransit(entity.warpClock, craftRecord(world, leader ?? entity), world.clock)) return true;
  entity.inWarp = false;
  return false;
}

/** The states 0–3 in which the generic callback `0x20c18` asks `0x2f298`. */
const TRANSIT_HELD_STATES: ReadonlySet<ObjectState> = new Set(['new', 'presentation-ready', 'awaiting-presentation']);

/**
 * Whether the generic part of an entity's own update stops for a Warp transit: in states 0–3, as the generic callback
 * `0x20c18` asks `0x2f298`. The player's own callback `0x25f90` does not ask.
 */
export function isHeldInWarpTransit(world: WorldState, entity: Entity): boolean {
  return entity.kindBit !== PLAYER_KIND_BIT && TRANSIT_HELD_STATES.has(entity.state) && checkWarpTransit(world, entity);
}

/**
 * Message 0x20's parking switch, for an entity in area-switch whose kind parks; returns false, changing nothing, for
 * any other entity, which the message removes. A parked entity resumes with a new block at full throttle (`0x2c3b0`,
 * at its current position and pose); an active or docked one parks, releasing its block, and only when the player's
 * target is exactly this entity is that target cleared. Other holders of its ID (AI targets, formation leaders, the
 * speed assist) keep it, and no timer changes.
 */
export function switchParking(world: WorldState, entity: Entity): boolean {
  if (entity.state !== 'area-switch' || isRemovedOnLeaving(entity.kindBit)) return false;
  if (entity.activity === 'parked') {
    setActivity(entity, 'active', initialMovementBlock(entity.maximumSpeed, craftRecord(world, entity).atB8));
    return true;
  }
  setActivity(entity, 'parked', null);
  if (world.player.target === entity.id) world.player.target = null;
  return true;
}

/**
 * Stage 17 (`0x3a468`): every entity but the player in state 7 or above. One outside the active area that is active
 * goes to area-switch, or to pending removal for the kinds removed on leaving, each with its `object-retired` (FA-07);
 * one inside that is parked and not in Warp goes to area-switch. Everything else stays, and nothing is released here.
 */
export function checkActiveArea(context: TickContext): void {
  const { world } = context;
  // The player does not move during the walk, so one centre serves as the original's cached one.
  const centre = activeAreaCentre(world);
  for (const entity of world.entities.walk(AREA_CHECK_KINDS)) {
    if (!isActiveState(entity.state)) continue;
    if (!isWithinActiveArea(centre, entity.position)) {
      if (entity.activity === 'active') retire(context, entity, isRemovedOnLeaving(entity.kindBit) ? 'pending-removal' : 'area-switch');
    } else if (entity.activity === 'parked' && !entity.inWarp) {
      retire(context, entity, 'area-switch');
    }
  }
}

/**
 * Writes a parked entity's new position through `0x6a2f8`: a discontinuous move, so its placement serial counts it.
 * The per-sector resource test of `0x6a2f8` always passes in Core (P3-02), so the write always happens.
 */
function commit(entity: Entity, position: Vec3): void {
  entity.position = position;
  entity.placementSerial++;
}

/** The formation snap: the leader's pose and the leader's position plus the entity's offset along the leader's rows. */
function snapToLeader(entity: Entity, leader: Entity, offset: Vec3): void {
  entity.orientation = leader.orientation;
  commit(entity, formationPosition(leader.orientation, leader.position, offset));
}

/**
 * `0x68598` for an arrival in AI mode 4: a new goal from the entity's source record, or from its group's template when
 * the record is a group member (+0x3C), by that record's rectangle or the whole-world default.
 */
function recordGoal(world: WorldState, { source }: Entity, rand: RandSource): Vec3 {
  if (source === null) throw fault('goal-record');
  let record = world.spawn.wingman;
  if (source.collection === 'mission') {
    const { memberOf } = world.setup.declarations[source.index];
    record = world.spawn.records[memberOf === null ? source.index : world.setup.groups[memberOf].template];
  }
  if (record === null) throw fault('goal-record');
  return areaPoint(record.region, world.spawn.frame, rand);
}

/**
 * The first step of the arrival branch (RX6, CB-12): the wingman (kind exactly 2) arriving at a travel target of the
 * base kinds is fully repaired when the sample is strictly past the one limit all kind-2 objects share, which is then
 * re-armed 0x780 later. No message and no draw; the repair runs after the message loop, so it announces nothing.
 */
function repairArrivingWingman(context: TickContext, entity: Entity, target: Entity | null): void {
  const { limits } = context.world.communications;
  const { clock } = context.time;
  if (entity.kindBit !== WINGMAN_KIND_BIT || target === null || !hasKind(BASE_KINDS, target.kindBit) || !(clock > limits.wingmanArrivalRepair)) return;
  limits.wingmanArrivalRepair = rearm(clock, WINGMAN_ARRIVAL_REPAIR_INTERVAL, 'area.wingman-arrival-repair');
  fullRepair(context, entity, false);
}

/**
 * The arrival branch of `0x2f314`, which writes no position: the wingman's arrival repair first; then the entity's own
 * target offset is cleared when there is a target, an entity without a leader in AI mode 4 takes a new goal, it is no
 * longer in Warp, and an entity other than the wingman whose subject stands outside the inset world rectangle leaves the
 * world: pending removal at once and one `object-left-world`; its own update asks for the removal at the next tick.
 */
function arrive(context: TickContext, entity: Entity, subject: Entity, leader: Entity | null, target: Entity | null, rand: RandSource): void {
  const { world } = context;
  repairArrivingWingman(context, entity, target);
  if (target !== null) entity.ai.targetOffset = ZERO_VECTOR;
  if (leader === null && entity.ai.mode === 4) entity.ai.goal = recordGoal(world, entity, rand);
  entity.inWarp = false;
  if (entity.kindBit === WINGMAN_KIND_BIT || !isOutsideExitBounds(world.spawn.frame, subject.position)) return;
  retire(context, entity, 'pending-removal');
  emit(context, { type: 'object-left-world', tick: world.tick, entityId: entity.id, kindBit: entity.kindBit, source: entity.source });
}

/**
 * `0x2f314`, the parked travel of `entity` after `elapsed` clock units. A formation leader that no longer resolves is
 * cleared and nothing moves. The subject is the valid leader, otherwise the entity; its AI state chooses the goal: in
 * mode 2 a valid object target, otherwise the AI target, plus the subject's offset (a zero one first replaced by a
 * random one, stored in the subject), or without a target the subject's goal point. Modes 1 and 5, a target that no
 * longer resolves and a target in Warp give no motion. Then, by the distance from the subject: the arrival, the Warp
 * jump, the travel step, or the follower's formation snap. Returns whether it wrote the entity's position.
 */
function travelParked(context: TickContext, entity: Entity, elapsed: number, rand: RandSource): boolean {
  const { world } = context;
  const { formation } = entity;
  const leader = formation === null ? null : (world.entities.get(formation.leader) ?? null);
  if (formation !== null && leader === null) {
    entity.formation = null;
    return false;
  }
  const subject = leader ?? entity;
  const { ai } = subject;
  if (ai.mode === 1 || ai.mode === 5) return false;
  const objectTarget = ai.mode === 2 && ai.objectTarget !== null ? world.entities.get(ai.objectTarget) : undefined;
  let target: Entity | null = objectTarget ?? null;
  if (target === null && ai.target !== null) {
    target = world.entities.get(ai.target) ?? null;
    if (target === null) return false;
  }
  if (target?.inWarp) return false;
  let goal = ai.goal;
  if (target !== null) {
    let offset = ai.targetOffset;
    if (offset.x === 0 && offset.y === 0 && offset.z === 0) {
      offset = randomTargetOffset(ai.mode === 2 && objectTarget === undefined ? craftRecord(world, target) : null, rand);
      ai.targetOffset = offset;
    }
    goal = offsetGoal(target.position, offset);
  }
  const position = subject.position;
  const distance = goalDistance(goal, position);
  if (hasArrived(distance)) {
    arrive(context, entity, subject, leader, target, rand);
    return false;
  }
  const record = craftRecord(world, subject);
  const warpOutRequested = entity.inWarp && entity.warpClock === 0;
  const jumps = leader === null
    ? (isWarpJumpDistance(record, distance) && isWarpAllowed(entity.warpClock, record, world.clock)) || warpOutRequested
    : leader.inWarp || warpOutRequested;
  if (formation !== null && leader !== null) {
    if (jumps) {
      entity.inWarp = true;
      entity.warpClock = leader.warpClock;
    }
    snapToLeader(entity, leader, formation.offset);
    return true;
  }
  const heading = headingTowards(distance);
  if (jumps) {
    entity.inWarp = true;
    entity.warpClock = world.clock;
  }
  const length = jumps ? warpJumpLength(record, heading.distance) : travelLength(elapsed, record, heading.distance);
  entity.orientation = heading.orientation;
  commit(entity, jittered(advanced(position, heading.forward, length), jumps ? WARP_JUMP_JITTER : TRAVEL_JITTER, rand));
  return true;
}

/**
 * The parked combat that follows an entity's parked travel (P3-07's engageParked, `0x2ffec` in AI mode 1 and `0x30150`
 * otherwise; docs/plan/p3/02/spec.md, CR-09): it draws from the world RNG itself.
 */
export type ParkedEngagement = (entity: Entity, elapsed: number) => void;

/**
 * Stage 13 (`0x2f1b0`): every parked craft in state 7 or above and not destroyed draws once from the world RNG, every
 * tick, for its due check. A due one first takes the elapsed time and the clock as its last parked update; then one in
 * Warp transit is done, and any other travels and then engages (`engage`), even when its travel has just made it leave
 * the world (E1). The engagement's draws follow the entity's own and precede the next entity's (E4), and an entity it
 * destroys later in the walk is no longer selected. A hostile whose travel wrote its position inside the active area
 * reports it (`0x3c3b0`) before the engagement, its draws in between.
 */
export function updateParked(context: TickContext, engage: ParkedEngagement): void {
  const { world } = context;
  let rand = new RandStream(world.rngState);
  for (const entity of world.entities.walk(PARKED_UPDATE_KINDS)) {
    if (entity.activity !== 'parked' || !isActiveState(entity.state) || entity.destroyed) continue;
    if (!isParkedUpdateDue(world.clock, entity.lastParkedUpdateClock, rand.next())) continue;
    const elapsed = world.clock - entity.lastParkedUpdateClock;
    entity.lastParkedUpdateClock = world.clock;
    if (checkWarpTransit(world, entity)) continue;
    const moved = travelParked(context, entity, elapsed, rand);
    world.rngState = rand.state;
    if (moved && hasKind(HOSTILE_KINDS, entity.kindBit) && isWithinActiveArea(activeAreaCentre(world), entity.position)) reportParkedEnemy(context, entity);
    engage(entity, elapsed);
    rand = new RandStream(world.rngState);
  }
  world.rngState = rand.state;
}
