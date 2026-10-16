/**
 * The wingman's built-in handler `0x610c8` (docs/plan/p3/08/spec.md, 僚机, S-09, AC-07; docs/plan/p3/02/spec.md,
 * CR-16, CR-17, CR-27; docs/original/formats/executable.md, WA1–WA10, WB2, WB6) for built-in records 4 and 5: the
 * install half `0x60f80`, the initial behaviour `0x61d64`, applying a behaviour `0x61740` with its mirror `0x61dfc`, the
 * periodic behaviour `0x61a88`, the update order and flight branches of `0x610c8`, and the friendly-fire reader
 * `0x38fd8`. The attack pass `0x63c00` is ai-attack-pass.ts's; piloting, firing and targeting are the primitives of
 * ai-piloting.ts, steering.ts, ai-firing.ts and targeting.ts.
 *
 * The private block B (WingmanState) holds the behaviour b: 0 attack B+8, 1 engage a hostile, 2 formation, 3 return to
 * a base, 4 go to the player's destination, 5 attack the player (the anger, revision ⑥: b, not the object's AI mode
 * +0xC4, which the mirror then sets to 0). The removal discards B, so a reinstall rebuilds b from +0xC4 and +0x90.
 *
 * The friendly-fire accumulator is written by P3-10's `0x38f20` at the damage call site (CR-27); this module only reads
 * it: `accumulated` > AICO +0x28 (signed, equality does not block) makes b 5 at every periodic update while it holds,
 * and b stays 5 after the accumulator falls until a command changes it. The active command consumer `0x614a8` (step 2)
 * is P3-08/20's, through WingmanCall.consumeCommand.
 *
 * Clock comparisons are plain (Core's clock never wraps, P3-02); a window the original compares unsigned is taken as
 * its u32 value. f32 values are `Math.fround` stores; the chopped distance is FISTP dword under the chop mode.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { AiControllerCommon, BuiltInController, Entity, EntityId, WingmanState } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { activeAreaCentre, isWithinActiveArea } from './active-area.ts';
import { attackPass, isInFront } from './ai-attack-pass.ts';
import { enableAiLock, firingDataOf, isChannelInRange, isSteady, pressChannel, releaseChannel } from './ai-firing.ts';
import {
  aiPilot, evade, postRates, postSpeedMatch, postSteering, postTargetSpeedMatch, postThrottle, type AiPilot,
} from './ai-piloting.ts';
import { proximityClearance } from './ai-targeting.ts';
import type { CraftEntity } from './combat-init.ts';
import { repairFully } from './full-repair.ts';
import { chainAmmunition, selectMount } from './mounts.ts';
import { speedOf } from './movement-builders.ts';
import type { RandSource } from './original-random.ts';
import { hasKind } from './radio.ts';
import { toInt32 } from './record-defaults.ts';
import {
  clearTargetOffset, computeSteering, setLeadMode, setSteeringFractions, setSteeringNoise, setTargetOffset, steerAtPoint, steerAtTarget,
  updateTargetPoint,
} from './steering.ts';
import { fartherCandidate, targetDistance } from './targeting.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `ai-wingman.${site}`);

/** `clock + duration` as a clock; a sum Core cannot represent is a budget fault (P3-02). */
function clockAfter(clock: number, duration: number): number {
  const due = clock + duration;
  if (!Number.isSafeInteger(due) || due < 0) throw new CoreFaultError('budget-exhausted', 'ai-wingman.clock');
  return due;
}

/** The wingman's installed controller. */
export type WingmanController = Extract<BuiltInController, { readonly handler: 'wingman' }>;

/** One handler call on the wingman in its object update. */
export interface WingmanCall {
  readonly world: WorldState;
  readonly subject: CraftEntity;
  /** The call's draws, from the world's RNG. */
  readonly rand: RandSource;
  /** Posts a piloting request (`steer`, `ai-match-speed`) for the request handling of this tick. */
  readonly post: AiPilot['post'];
  /** `0x5e6cc`: the wingman's Warp departure request; whether it was posted. */
  depart(): boolean;
  /**
   * `0x614a8`, the active command consumer (WB3), step 2 of every mode 0 and mode 1 call (P3-08/20). Without one a
   * pending command stays in its slot.
   */
  readonly consumeCommand?: (call: WingmanCall, controller: WingmanController) => void;
}

/** Kinds `0x93780`, the hostiles b 1 engages. */
const HOSTILE_KINDS = 0x93780;
/** Kinds `0x2380`, the hostiles the formation's search finds near the player. */
const FORMATION_SEARCH_KINDS = 0x2380;
/** Kinds `0x68000`, the bases b 3 returns to. */
const BASE_KINDS = 0x68000;
/** Kinds `0x6c07f` and `0x6c07e` (the player no longer counts in the anger) the victim avoidance turns away from. */
const FRIENDLY_VICTIMS = 0x6c07f;
const ANGRY_FRIENDLY_VICTIMS = 0x6c07e;
/** The formation offset along the player's rows 1, 2 and 3 (f32 125, 3, 25). */
const FORMATION_OFFSET: Vec3 = Object.freeze({ x: 125, y: 3, z: 25 });
/** The lead mode of b 0, 1 and 5: the speed of the current list-0 weapon, with constant F(C+0xF4 × 1/64). */
const PURSUIT_LEAD_MODE = 5;
/** The cadences of the formation's search and the main-gun switch check. */
const ENGAGE_SEARCH_PERIOD = 0x140;
const GUN_SWITCH_PERIOD = 0x780;
/** b 4 turns to b 1 within 100 (f32 0x1724a4). */
const ARRIVAL_DISTANCE = 100;
/** The pursuit's speed bands (f32 250, 550) and its speed match (f32 −0.15, 0.2, 1.0). */
const PURSUIT_NEAR = 250;
const PURSUIT_FAR = 550;
const PURSUIT_MATCH = Object.freeze([Math.fround(-0.15), Math.fround(0.2), 1] as const);
/** The formation's stop (within 60 of a target slower than 5) and its bands (16, 32, 120; matches −0.1 and 0.15). */
const FORMATION_STOP_DISTANCE = 60;
const FORMATION_STOP_SPEED = 5;
const FORMATION_CLOSE = 16;
const FORMATION_NEAR = 32;
const FORMATION_FAR = 120;
const FORMATION_CLOSE_MATCH = Object.freeze([Math.fround(-0.1), 0, 1] as const);
const FORMATION_FAR_MATCH = Object.freeze([Math.fround(0.15), 0, 1] as const);
/** The pursuit's presses: channel 0 with hold 0x60, channel 1 held (−1). */
const GUN_HOLD = 0x60;
const MISSILE_HOLD = -1;
/** The main-gun switch draw: (rand & 0xFF) < 0x40. */
const GUN_SWITCH_CHANCE = 0x40;

/** `0x38fd8`, the friendly-fire reader: the accumulator above AICO +0x28 (i32, signed; equality does not block). */
export function isFriendlyFireBlocking(world: WorldState): boolean {
  return world.ai.friendlyFire.accumulated > world.ruleData.inputs.aiPrograms.content.globals.at28;
}

/** The wingman call's view of the world: the handle check `0x52680` and the player handle ps +0x8C (P). */
const resolve = ({ world }: WingmanCall, id: EntityId | null): Entity | undefined => (id === null ? undefined : world.entities.get(id));
const playerOf = ({ world }: WingmanCall): EntityId | null => world.player.entityId;

/** `0x62144`: B+8 while it resolves; otherwise B+8 is cleared and null returned. */
function attackTargetOf(call: WingmanCall, wingman: WingmanState): EntityId | null {
  if (resolve(call, wingman.attackTarget) === undefined) wingman.attackTarget = null;
  return wingman.attackTarget;
}

/** `0x62194`: B+4 likewise. */
function doNotAttackOf(call: WingmanCall, wingman: WingmanState): EntityId | null {
  if (resolve(call, wingman.doNotAttack) === undefined) wingman.doNotAttack = null;
  return wingman.doNotAttack;
}

/** The b 0, 1 and 5 that fly the pursuit (and the attack pass for 0 and 1), with channel 0 kept. */
const isPursuit = (behaviour: number): boolean => behaviour === 0 || behaviour === 1 || behaviour === 5;

/** `0x5e6cc`(C) and +0x8C := 0, as b 3 and b 4 leave for a parked base or a point outside the active area. */
function departAndClear(call: WingmanCall): void {
  call.depart();
  call.subject.ai.objectTarget = null;
}

/** FISTP dword under the chop mode `0x74518` sets: truncation, and −2³¹ (integer indefinite) beyond i32. */
function chop32(value: number): number {
  const chopped = Math.trunc(value);
  return chopped >= -0x8000_0000 && chopped <= 0x7fff_ffff ? chopped + 0 : -0x8000_0000;
}

/**
 * `0x63858`(subject, after, mask, &d) (WA8): targeting.ts's farther search from `subject` past `after` (any, when it
 * does not resolve) and d = F(√best), 0 without a result.
 */
function nearest(call: WingmanCall, subject: Entity, after: EntityId | null, mask: number): { readonly entity: Entity | null; readonly distance: number } {
  const entity = fartherCandidate(call.world.entities, subject, resolve(call, after) ?? null, mask);
  const distance = entity === null ? 0 : Math.fround(Math.sqrt(Math.fround(targetDistance(subject.position, entity.position))));
  return { entity, distance };
}

/**
 * The formation `0x61740` falls back to: `0x5c584`(P), offset (125, 3, 25) along the player's rows, no lead; b := 2.
 * Its result is 1 only when b already was 2.
 */
function formation(controller: WingmanController, pilot: AiPilot, player: EntityId): boolean {
  const { steering, wingman } = controller;
  steerAtTarget(steering, pilot.scene, player);
  setTargetOffset(steering, 0, FORMATION_OFFSET);
  setLeadMode(steering, 0, 0, 0);
  const result = wingman.behaviour === 2;
  wingman.behaviour = 2;
  return result;
}

/** The player's destination ps +0x10–+0x18, which a b 4 holding the mirror requires. */
function destinationOf(call: WingmanCall): Vec3 {
  const { destination } = call.world.player.map;
  if (destination === null) throw fault('destination');
  return destination;
}

/**
 * `0x61dfc`, the mirror into the AI target +0x90 and mode +0xC4 (which the parked travel and `0x61d64` read): b 0 or 5
 * B+8 and 0; b 1 own +0x8C and 0; b 2 P and 2 (nothing without P); b 3 mode 2; b 4 no target, mode 2, the goal the
 * player's destination.
 */
function mirror(call: WingmanCall, controller: WingmanController): void {
  const { ai } = call.subject;
  const { wingman } = controller;
  switch (wingman.behaviour) {
    case 0:
    case 5:
      ai.target = attackTargetOf(call, wingman);
      ai.mode = 0;
      return;
    case 1:
      ai.mode = 0;
      ai.target = ai.objectTarget;
      return;
    case 2: {
      const player = playerOf(call);
      if (player === null) return;
      ai.target = player;
      ai.mode = 2;
      return;
    }
    case 3:
      ai.mode = 2;
      return;
    case 4:
      ai.mode = 2;
      ai.target = null;
      ai.goal = destinationOf(call);
      return;
  }
}

/** b 3: the first base in walk order (no state filter) as the AI target; steer at it while active, else depart. */
function returnToBase(call: WingmanCall, controller: WingmanController, pilot: AiPilot): boolean {
  const { subject } = call;
  let base: Entity | undefined;
  for (const entity of call.world.entities.walk(BASE_KINDS)) {
    base = entity;
    break;
  }
  if (base === undefined) return false;
  subject.ai.target = base.id;
  subject.ai.mode = 2;
  if (base.activity === 'active') {
    clearTargetOffset(controller.steering);
    steerAtTarget(controller.steering, pilot.scene, base.id);
  } else {
    departAndClear(call);
  }
  return true;
}

/** b 4: the player's destination as the goal; point steering inside the active area, else depart. */
function goToDestination(call: WingmanCall, controller: WingmanController, pilot: AiPilot): boolean {
  const { world, subject } = call;
  const { destination } = world.player.map;
  if (destination === null) return false;
  subject.ai.goal = destination;
  subject.ai.target = null;
  subject.ai.mode = 2;
  clearTargetOffset(controller.steering);
  if (isWithinActiveArea(activeAreaCentre(world), destination)) {
    steerAtPoint(controller.steering, pilot.scene, destination);
  } else {
    departAndClear(call);
  }
  return true;
}

/**
 * `0x61740`, applying b (WA4): nothing without P (false). b 0 attacks B+8 unless it is gone or B+4; b 1 attacks the
 * nearest hostile (`0x93780`) at least as far as the player's target PT, passing B+4, unless none or B+4 or PT; b 3
 * returns to the first base; b 4 goes to the player's destination; b 5 attacks the player. Each of b 0–4 that cannot
 * falls back to the formation; b 2 is the formation. Then b 0 and 1 take lead mode 5 with the constant from C+0xF4,
 * and the mirror. Returns 1 for b 0, 3, 4 and 5 applied, `0x5c584`'s result for b 1, and the formation's otherwise.
 */
export function applyBehaviour(call: WingmanCall, controller: WingmanController): boolean {
  const player = playerOf(call);
  if (player === null) return false;
  const { subject, world } = call;
  const { steering, wingman } = controller;
  const pilot = aiPilot(world, subject, controller, call.rand, call.post);
  let result = false;
  switch (wingman.behaviour) {
    case 0: {
      const target = attackTargetOf(call, wingman);
      if (target !== null && doNotAttackOf(call, wingman) !== target) {
        clearTargetOffset(steering);
        steerAtTarget(steering, pilot.scene, target);
        result = true;
      }
      break;
    }
    case 1: {
      const passed = doNotAttackOf(call, wingman);
      const playerTarget = resolve(call, world.player.target) === undefined ? null : world.player.target;
      clearTargetOffset(steering);
      let found = nearest(call, subject, playerTarget, HOSTILE_KINDS).entity?.id ?? null;
      if (found === passed) found = nearest(call, subject, passed, HOSTILE_KINDS).entity?.id ?? null;
      if (found !== null && found !== passed && found !== playerTarget) result = steerAtTarget(steering, pilot.scene, found);
      break;
    }
    case 2:
      break;
    case 3:
      result = returnToBase(call, controller, pilot);
      break;
    case 4:
      result = goToDestination(call, controller, pilot);
      break;
    case 5:
      clearTargetOffset(steering);
      steerAtTarget(steering, pilot.scene, player);
      result = true;
      break;
  }
  if (!result) result = formation(controller, pilot, player);
  if (isPursuit(wingman.behaviour)) setLeadMode(steering, PURSUIT_LEAD_MODE, 0, controller.period);
  mirror(call, controller);
  return result;
}

/**
 * The formation's search of `0x61a88` when due: the hostile of `0x2380` nearest the player (past B+4 when that is it),
 * other than PT, within the engage radius AICO +0x2C − object +0xE4 × AICO +0x30 (i32, the distance chopped, strict)
 * becomes B+8 and b 0, applied (its result); otherwise null.
 */
function engageNearPlayer(call: WingmanCall, controller: WingmanController, player: EntityId): boolean | null {
  const { world, subject } = call;
  const { wingman } = controller;
  const centre = resolve(call, player);
  if (centre === undefined) throw fault('player');
  let found = nearest(call, centre, null, FORMATION_SEARCH_KINDS);
  if (found.entity === null) return null;
  if (doNotAttackOf(call, wingman) === found.entity.id) found = nearest(call, centre, found.entity.id, FORMATION_SEARCH_KINDS);
  if (found.entity === null || found.entity.id === world.player.target) return null;
  const { globals } = world.ruleData.inputs.aiPrograms.content;
  const radius = toInt32(globals.at2C - Math.imul(subject.ruleInputs.aiValueC, globals.at30));
  if (!(chop32(found.distance) < radius)) return null;
  wingman.attackTarget = found.entity.id;
  wingman.behaviour = 0;
  return applyBehaviour(call, controller);
}

/**
 * `0x61a88`, the periodic behaviour (WA5): nothing without P. The anger first: above the friendly-fire threshold b := 5,
 * applied. Then by b: 0 drops B+8 when the steering target is gone or is B+4; 1 picks again when it is gone or is PT;
 * 2 re-forms when the player is gone, and every 0x140 searches near the player (engageNearPlayer); 3 departs while the
 * base is parked or missing, and within the approach radius of an active one repairs fully and turns to b 1; 4 departs
 * while there is no active +0x8C (always, in point mode) and within 100 of one turns to b 1; 5 stays. A result of 0
 * re-forms. The arrival distances compare strictly, an unordered one counting as arrived.
 */
function periodicBehaviour(call: WingmanCall, controller: WingmanController): void {
  const player = playerOf(call);
  if (player === null) return;
  const { world, subject } = call;
  const { steering, wingman } = controller;
  let result = true;
  if (isFriendlyFireBlocking(world)) {
    wingman.behaviour = 5;
    result = applyBehaviour(call, controller);
  }
  const target = steering.target;
  switch (wingman.behaviour) {
    case 0:
      if (resolve(call, target) === undefined || doNotAttackOf(call, wingman) === target) {
        wingman.attackTarget = null;
        result = false;
      }
      break;
    case 1:
      if (resolve(call, target) === undefined || target === world.player.target) result = applyBehaviour(call, controller);
      break;
    case 2:
      if (resolve(call, target) === undefined) {
        result = false;
      } else if (world.clock > wingman.nextEngageSearchClock) {
        result = engageNearPlayer(call, controller, player) ?? result;
        wingman.nextEngageSearchClock = clockAfter(world.clock, ENGAGE_SEARCH_PERIOD);
      }
      break;
    case 3: {
      const { objectTarget } = subject.ai;
      const base = resolve(call, objectTarget);
      if (objectTarget !== null && base === undefined) {
        result = false;
      } else if (base === undefined || base.activity === 'parked') {
        departAndClear(call);
        result = true;
      } else if (!(steering.distance >= steering.approachRadius)) {
        repairFully(subject, world.craftInfo.content.craft[subject.kindBit], () => {});
        wingman.behaviour = 1;
        result = applyBehaviour(call, controller);
      }
      break;
    }
    case 4: {
      const { objectTarget } = subject.ai;
      const goal = resolve(call, objectTarget);
      // The original reads +0x8C's object without the handle check; no b 4 path leaves +0x8C set (WA5).
      if (objectTarget !== null && goal === undefined) throw fault('destination-target');
      if (goal === undefined || goal.activity === 'parked') {
        departAndClear(call);
        result = true;
      } else if (!(steering.distance >= ARRIVAL_DISTANCE)) {
        wingman.behaviour = 1;
        result = applyBehaviour(call, controller);
      }
      break;
    }
  }
  if (!result) {
    wingman.behaviour = 2;
    applyBehaviour(call, controller);
  }
}

/**
 * The pursuit of b 0, 1 and 5 (WA6): `0x5c8b0`, `0x5cd1c`, `0x5d014`; within 250 the speed match (−0.15, 0.2, 1.0),
 * within 550 the player's match, else full throttle; channel 0 with hold 0x60 when aimed and in range, channel 1 held
 * when ready and steady; the next list-1 mount when the current one's chain has no ammunition; every 0x780 one draw,
 * (rand & 0xFF) < 0x40 the next list-0 mount.
 */
function pursue(call: WingmanCall, controller: WingmanController, pilot: AiPilot): void {
  const { world, subject, rand } = call;
  const { steering, wingman } = controller;
  const { clock } = world;
  updateTargetPoint(steering, pilot.scene);
  computeSteering(steering, pilot.scene);
  postSteering(pilot);
  const { distance } = steering;
  if (!(distance >= PURSUIT_NEAR)) postSpeedMatch(pilot, ...PURSUIT_MATCH);
  else if (!(distance >= PURSUIT_FAR)) postTargetSpeedMatch(pilot);
  else postThrottle(pilot, 1);
  if (steering.coneBits === 3 && isChannelInRange(firingDataOf(world), subject, controller, 0)) pressChannel(controller, 0, GUN_HOLD, clock);
  if (controller.missileReady && isSteady(subject)) pressChannel(controller, 1, MISSILE_HOLD, clock);
  const { weapons } = subject.combat;
  const craft = world.craftInfo.content.craft[subject.kindBit];
  const missiles = weapons.selections[1].mount;
  if ((missiles === null ? -1 : chainAmmunition(weapons, craft, missiles)) < 1) selectMount(weapons, craft, 1, 1);
  if (clock > wingman.nextGunSwitchClock) {
    if ((rand.next() & 0xff) < GUN_SWITCH_CHANCE) selectMount(weapons, craft, 0, 1);
    wingman.nextGunSwitchClock = clockAfter(clock, GUN_SWITCH_PERIOD);
  }
}

/**
 * The formation flight of b 2 (WA6): `0x5c8b0`; within 60 of a target slower than 5, all rates and the throttle 0
 * (`0x5d0ec`); otherwise `0x5cd1c`, `0x5d014` and by the distance the match (−0.1, 0, 1.0) within 16, the player's
 * match within 32, (0.15, 0, 1.0) within 120, else full throttle. Unordered distances take the near branch.
 */
function holdFormation(call: WingmanCall, controller: WingmanController, pilot: AiPilot): void {
  const { steering } = controller;
  updateTargetPoint(steering, pilot.scene);
  // `0x21c78` reads S+0x10 without the handle check; a target that is gone (the player's loss) has speed 0 (P3-02 CR-24
  // decision 17, an approved difference).
  const target = resolve(call, steering.target);
  const { distance } = steering;
  if (!(distance >= FORMATION_STOP_DISTANCE) && !((target === undefined ? 0 : speedOf(target)) >= FORMATION_STOP_SPEED)) {
    postRates(pilot, [0, 0, 0], 0);
    return;
  }
  computeSteering(steering, pilot.scene);
  postSteering(pilot);
  if (!(distance >= FORMATION_CLOSE)) postSpeedMatch(pilot, ...FORMATION_CLOSE_MATCH);
  else if (!(distance >= FORMATION_NEAR)) postTargetSpeedMatch(pilot);
  else if (!(distance >= FORMATION_FAR)) postSpeedMatch(pilot, ...FORMATION_FAR_MATCH);
  else postThrottle(pilot, 1);
}

/**
 * The update of `0x610c8` after `0x60f80` in modes 0 and 1 (WA3), in the install's call and in mode 1 from the AI step
 * when the controller is due: the commands (P3-08/20), the periodic behaviour;
 * docked, channel 0 released and everything stopped; the proximity evade (only the other's radius, AICO +0x20, strict,
 * the other ahead) with half the period; channel 0 released for b 2–4; the victim avoidance (the last victim of
 * `0x6c07f`, or `0x6c07e` angry, within AICO +0x24); the attack pass for b 0 and 1; the flight by b. Each exit sets
 * the next update.
 */
export function updateWingman(call: WingmanCall, controller: WingmanController): void {
  call.consumeCommand?.(call, controller);
  periodicBehaviour(call, controller);
  const { world, subject } = call;
  const { clock } = world;
  const pilot = aiPilot(world, subject, controller, call.rand, call.post);
  if (subject.activity === 'docked') {
    releaseChannel(controller, 0);
    postRates(pilot, [0, 0, 0], 0);
    controller.nextUpdateClock = clockAfter(clock, controller.period);
    return;
  }
  const { globals } = world.ruleData.inputs.aiPrograms.content;
  const { proximity, lastVictim } = subject.combat;
  const near = proximity === null ? undefined : resolve(call, proximity.entity);
  if (proximity !== null && near !== undefined
    && !(proximityClearance(world.ruleData, null, proximity.distanceSquared, near.kindBit) >= globals.at20) && isInFront(subject, near)) {
    evade(pilot, near.id);
    controller.nextUpdateClock = clockAfter(clock, controller.period >> 1);
    return;
  }
  const { behaviour } = controller.wingman;
  if (!isPursuit(behaviour)) releaseChannel(controller, 0);
  const victim = lastVictim === null ? undefined : resolve(call, lastVictim.entity);
  if (lastVictim !== null && victim !== undefined && ((clock - lastVictim.clock) >>> 0) < globals.at24
    && hasKind(behaviour === 5 ? ANGRY_FRIENDLY_VICTIMS : FRIENDLY_VICTIMS, victim.kindBit)) {
    releaseChannel(controller, 0);
    evade(pilot, victim.id);
    controller.nextUpdateClock = clockAfter(clock, controller.period);
    return;
  }
  if ((behaviour === 0 || behaviour === 1) && attackPass(call, controller)) return;
  if (isPursuit(behaviour)) pursue(call, controller, pilot);
  else if (behaviour === 2) holdFormation(call, controller, pilot);
  else {
    updateTargetPoint(controller.steering, pilot.scene);
    computeSteering(controller.steering, pilot.scene);
    postSteering(pilot);
  }
  controller.nextUpdateClock = clockAfter(clock, controller.period);
}

/**
 * `0x61d64`, the initial b from the object's AI mode +0xC4: 0 → b 0 against +0x90 (null when it does not resolve); 2 →
 * b 3 when +0x90 is a base (`0x68000`), else 2; any other → 2.
 */
function initialBehaviour(call: WingmanCall, wingman: WingmanState): void {
  const { ai } = call.subject;
  if (ai.mode === 0) {
    wingman.behaviour = 0;
    wingman.attackTarget = resolve(call, ai.target) === undefined ? null : ai.target;
    return;
  }
  const target = ai.mode === 2 ? resolve(call, ai.target) : undefined;
  wingman.behaviour = target !== undefined && hasKind(BASE_KINDS, target.kindBit) ? 3 : 2;
}

/**
 * The wingman's install (`0x610c8` in mode 0) on the common controller `common` that `0x5dc0c` installed: `0x60f80`
 * takes AICO element object +0xDC − 1 for the steering fractions with roll matching (`0x5c768`) and the throttle and
 * steering noise (`0x5c7e8`), turns the AI lock on, sets the next update at clock + C+0xF4, clears B and runs
 * `0x61d64` and `0x61740`; then the update runs in the same call (updateWingman). Returns the installed controller.
 */
export function installWingman(call: WingmanCall, common: AiControllerCommon): WingmanController {
  const { world, subject } = call;
  const element = world.ruleData.inputs.aiPrograms.content.globals.elements[subject.ruleInputs.aiValueA - 1];
  if (element === undefined) throw fault('element');
  const [speedFraction, turnFraction, throttleNoise, steerNoise] = element;
  setSteeringFractions(common.steering, world.craftInfo.content.craft[subject.kindBit], speedFraction, turnFraction, true);
  setSteeringNoise(common.steering, throttleNoise, steerNoise);
  enableAiLock(common, subject);
  common.nextUpdateClock = clockAfter(world.clock, common.period);
  const wingman: WingmanState = { behaviour: 0, doNotAttack: null, attackTarget: null, nextGunSwitchClock: 0, nextEngageSearchClock: 0 };
  const controller: WingmanController = { ...common, handler: 'wingman', wingman };
  initialBehaviour(call, wingman);
  applyBehaviour(call, controller);
  updateWingman(call, controller);
  return controller;
}
