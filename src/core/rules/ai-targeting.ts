/**
 * AI targeting (docs/plan/p3/08/spec.md, S-07; docs/original/formats/executable.md, A8–A11, A15, W9): the engagement
 * share `0x632a4` with its timer `0x63250`/`0x63600`/`0x63744`, the automatic mounts' target choice (`0x2d72c`,
 * `0x2d7cc`, `0x5e444` with `0x2daa0`, `0x2dabc`) and the AI's reads of P3-07's hit and proximity records.
 *
 * The object target +0x8C changes only through the steering library's `0x5c584` (steerAtTarget, P3-08/17), as every
 * AI writer of it does; the AI target +0x90 is written only by its original writers (the wingman, the parked handler,
 * the leave order and instantiation, A8), none of which is here. The functions read the world they are given and draw
 * from the RandSource they are given; nothing here posts a request except through the departure the caller supplies.
 *
 * Integers are i32 with the original's wrap where it can occur; clock comparisons are plain, since Core's clock never
 * wraps (P3-02); a window the original compares unsigned is taken as its u32 value.
 */
import { CoreFaultError } from '../errors.ts';
import { isActiveState, type AiControllerCommon, type Entity, type EntityId, type EntityTable, type MountState } from '../world/entity-table.ts';
import type { WorldRuleData } from '../world/rule-data.ts';
import type { WorldState } from '../world/world-state.ts';
import type { CraftEntity } from './combat-init.ts';
import { inHemisphere, type FiringData } from './firing.ts';
import { AUTOMATIC_GUN } from './load-transforms.ts';
import { isMissileMount, mountState } from './mounts.ts';
import type { RandSource } from './original-random.ts';
import { hasKind } from './radio.ts';
import { WINGMAN_KIND_BIT } from './spawn-schedule.ts';
import { steerAtTarget, type AiSteeringScene } from './steering.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `ai-targeting.${site}`);

/** `clock + duration` as a clock; a sum Core cannot represent is a budget fault (P3-02). */
function clockAfter(clock: number, duration: number): number {
  const due = clock + duration;
  if (!Number.isSafeInteger(due) || due < 0) throw new CoreFaultError('budget-exhausted', 'ai-targeting.clock');
  return due;
}

/** The kinds on the player's side, `0x6c87f`, which choose between the two masks of the side test. */
const FRIENDLY_SIDE = 0x6c87f;
/** The kinds a subject on the player's side counts as its own, `0x6c07f`. */
const FRIENDLY_ALLIES = 0x6c07f;
/** The kinds any other subject counts as its own, `0x93f80`. */
const ENEMY_ALLIES = 0x93f80;

/**
 * The side test of the share and the state machine (ai §11.3): `other` is on `subject`'s side when its kind is in
 * `0x6c07f` for a subject of the kinds `0x6c87f`, otherwise in `0x93f80`.
 */
export function isSameSide(subject: Entity, other: Entity): boolean {
  return hasKind(hasKind(FRIENDLY_SIDE, subject.kindBit) ? FRIENDLY_ALLIES : ENEMY_ALLIES, other.kindBit);
}

/** Whether `clock − since` is within `window`, compared unsigned: strictly below it, or up to it when `inclusive`. */
function isWithin(clock: number, since: number, window: number, inclusive: boolean): boolean {
  const elapsed = clock - since;
  if (!Number.isSafeInteger(elapsed) || elapsed < 0) throw fault('record-clock');
  const limit = window >>> 0;
  return inclusive ? elapsed <= limit : elapsed < limit;
}

/**
 * The last attacker +0xA4 of `subject` while it still resolves and its hit at +0xA8 lies within `window` (A15): the share
 * and the weave compare strictly (C+0x148, AICO +0x38), opcode 109 and the state machine inclusively (the argument,
 * DFPG +0x24). A record of frame N − 1's movement stage, since the AI runs before it.
 */
export function recentAttacker(subject: Entity, resolve: (id: EntityId) => Entity | undefined, clock: number, window: number, inclusive: boolean): Entity | undefined {
  if (subject.combat.type !== 'craft') throw fault('subject');
  const record = subject.combat.lastAttacker;
  if (record === null) return undefined;
  const attacker = resolve(record.entity);
  return attacker !== undefined && isWithin(clock, record.clock, window, inclusive) ? attacker : undefined;
}

/**
 * `0x2d37c`(own, d², other), the clearance of a proximity record +0x98 (A15): F(d² − r²(other)) with `own` null (opcode
 * 108, the wingman's evade), F((d² − r²(own)) − r²(other)) otherwise (the state machine, the attack pass); r² is shape
 * +0x14 of the kind's craft record after the load.
 */
export function proximityClearance(rules: WorldRuleData, ownKindBit: number | null, distanceSquared: number, otherKindBit: number): number {
  const radiusSquared = (kindBit: number): number => {
    const craft = rules.craft[kindBit];
    if (craft === null || craft === undefined) throw fault('clearance-kind');
    return craft.shape.radiusSquared;
  };
  const own = ownKindBit === null ? distanceSquared : distanceSquared - radiusSquared(ownKindBit);
  return Math.fround(own - radiusSquared(otherKindBit));
}

/** The kinds the share counts, `0x380`. */
const SHARE_KINDS = 0x380;
/** The modulus of the share's draw, 96. */
const SHARE_DRAW_MODULUS = 96;

/** The engagement share's world: the subject's steering block and scene, the update's draws and `0x5e6cc`. */
export interface EngagementCall {
  readonly world: WorldState;
  readonly controller: AiControllerCommon;
  readonly scene: AiSteeringScene;
  readonly rand: RandSource;
  /** `0x5e6cc`(C): the subject's Warp departure request (P3-08/21); whether it was posted. */
  depart(): boolean;
}

/** `0x38bb0`'s W: the first wingman (kind 2), when it is active and in state 7 or above; null when it is in Warp. */
function readyWingman(entities: EntityTable): Entity | null {
  for (const wingman of entities.walk(2 ** WINGMAN_KIND_BIT)) {
    return wingman.activity === 'active' && isActiveState(wingman.state) && !wingman.inWarp ? wingman : null;
  }
  return null;
}

/** Whether a share counts `other` (step 4): active, in state 7 or above, not dead, its +0x8C null or still resolving. */
function isCounted(entities: EntityTable, other: Entity): boolean {
  const target = other.ai.objectTarget;
  return other.activity === 'active' && isActiveState(other.state) && !other.destroyed && (target === null || entities.get(target) !== undefined);
}

/**
 * The engagement share `0x632a4` (A9; difficulty path 5): which target the subject's +0x8C takes, through `0x5c584`.
 * No player: nothing (false). The SCEN wave mode is 0 in Core (P3-02 CR-26), so its branch is not taken. A player in
 * Warp: nothing. Then a recent attacker of the other side within C+0x148; otherwise the counts of the active enemies
 * (kinds 0x380) targeting the player and the wingman against AICO's group-0 triple decide: when the third share is
 * below its term and the subject's +0x90 resolves, either half the term or one draw (rand % 96 < +0xE4) sends it at an
 * active +0x90 of the other side, or asks a non-active one to leave by Warp; otherwise the wingman or the player.
 * Returns what `0x5c584` returned, or whether the departure was posted.
 */
export function engagementShare(call: EngagementCall): boolean {
  const { world, controller, scene, rand } = call;
  const { entities } = world;
  const { subject } = scene;
  const target = (entity: Entity): boolean => steerAtTarget(controller.steering, scene, entity.id);
  if (world.player.entityId === null) return false;
  const player = entities.get(world.player.entityId);
  if (player === undefined) throw fault('player');
  if (player.inWarp) return false;
  const wingman = readyWingman(entities);
  const attacker = recentAttacker(subject, (id) => scene.resolve(id), scene.clock, controller.engagement.period, false);
  if (attacker !== undefined && !isSameSide(subject, attacker)) return target(attacker);
  let counted = 0;
  let atPlayer = 0;
  let atWingman = 0;
  for (const other of entities.walk(SHARE_KINDS)) {
    if (other === subject || !isCounted(entities, other)) continue;
    counted++;
    if (other.ai.objectTarget === player.id) atPlayer++;
    if (wingman !== null && other.ai.objectTarget === wingman.id) atWingman++;
  }
  if (counted === 0 || atPlayer === 0) return target(player);
  const percent = (count: number): number => Math.trunc((count * 100) / counted);
  const [t0, t1, t2] = world.ruleData.inputs.aiPrograms.content.groupTriple;
  const a = (t0 - percent(atPlayer)) | 0;
  const b = (t1 - percent(atWingman)) | 0;
  const c = (t2 - percent(counted - atWingman)) | 0;
  const aiTarget = subject.ai.target === null ? undefined : entities.get(subject.ai.target);
  if (c > 0 && aiTarget !== undefined && (c > t2 >> 1 || rand.next() % SHARE_DRAW_MODULUS < subject.ruleInputs.aiValueC)) {
    if (aiTarget.activity !== 'active') {
      if (call.depart()) return true;
    } else if (!isSameSide(subject, aiTarget)) {
      return target(aiTarget);
    }
  }
  return target(wingman !== null && a <= t0 >> 1 && (t1 >> 1 < b || a < b) ? wingman : player);
}

/** The engagement timer's default mask, written for a mask of 0. */
export const DEFAULT_ENGAGEMENT_MASK = 0xfbfff;

/**
 * `0x63250`(C, period, mask) (the install with DFPG +0x04, opcode 500): C+0x148 := period; C+0x144 := 0 for a period of
 * 0, otherwise the clock plus one draw rand % period; C+0x14C := the mask, `0xfbfff` for 0.
 */
export function armEngagement(controller: AiControllerCommon, period: number, mask: number, clock: number, rand: RandSource): void {
  if (!Number.isSafeInteger(period) || period < 0 || period > 0x7fff_ffff) throw fault('engagement-period');
  const { engagement } = controller;
  engagement.period = period;
  engagement.dueClock = period === 0 ? 0 : clockAfter(clock, rand.next() % period);
  engagement.mask = mask === 0 ? DEFAULT_ENGAGEMENT_MASK : mask >>> 0;
}

/**
 * `0x63600`(C) (opcode 502, the state machine's rule 2): with a +0x8C that no longer resolves, it is cleared and the
 * share runs; with one that does, the share runs only once the timer is on and due (clock ≥ C+0x144), which re-arms it
 * at clock + C+0x148 without a draw. Returns whether +0x8C changed from what it was after the clearing.
 */
export function refreshEngagement(call: EngagementCall): boolean {
  const { controller, scene } = call;
  const { subject } = scene;
  const { engagement } = controller;
  const entry = subject.ai.objectTarget;
  let before: EntityId | null = null;
  if (entry === null || scene.resolve(entry) === undefined) {
    subject.ai.objectTarget = null;
  } else {
    if (engagement.dueClock === 0 || scene.clock < engagement.dueClock) return false;
    engagement.dueClock = clockAfter(scene.clock, engagement.period);
    before = entry;
  }
  engagementShare(call);
  return subject.ai.objectTarget !== before;
}

/**
 * `0x63744`(C, handle) (the state machine's rule 4): `0x5c584` at `target`; when that succeeds with the timer on, the
 * timer re-arms at clock + C+0x148. Returns what `0x5c584` returned.
 */
export function engageTarget(controller: AiControllerCommon, scene: AiSteeringScene, target: EntityId | null): boolean {
  const steered = steerAtTarget(controller.steering, scene, target);
  if (steered && controller.engagement.dueClock !== 0) controller.engagement.dueClock = clockAfter(scene.clock, controller.engagement.period);
  return steered;
}

/** Whether mount `index` of `shooter` is an automatic gun that is not destroyed (gun +0x28 = 2, level ≠ 2). */
function isAutomaticMount(data: FiringData, shooter: CraftEntity, index: number): boolean {
  const mount = data.info.craft[shooter.kindBit].mounts[index];
  return !isMissileMount(mount) && data.info.guns[mount.weapon].at28 === AUTOMATIC_GUN && mountState(shooter.combat.weapons, index).damage !== 2;
}

/**
 * `0x2d72c`: the indexes of the idle automatic mounts of `shooter` after `after` (from 0 without one): automatic guns
 * not destroyed whose burst is 0, the next one found when asked, so a mount that an earlier step loaded is passed over.
 */
export function nextIdleAutomaticMount(data: FiringData, shooter: CraftEntity, after: number | null): number | null {
  const count = shooter.combat.weapons.mounts.length;
  for (let index = after === null ? 0 : after + 1; index < count; index++) {
    if (isAutomaticMount(data, shooter, index) && mountState(shooter.combat.weapons, index).burst === 0) return index;
  }
  return null;
}

/**
 * `0x2d7cc`: the automatic mount before `index`, searching downward with wrap-around, so mount `index` itself when it
 * is the only one; null when there is none.
 */
export function previousAutomaticMount(data: FiringData, shooter: CraftEntity, index: number): number | null {
  const count = shooter.combat.weapons.mounts.length;
  for (let step = 1; step <= count; step++) {
    const at = (((index - step) % count) + count) % count;
    if (isAutomaticMount(data, shooter, at)) return at;
  }
  return null;
}

/** `0x527d8` on a mount's target: the entity while it resolves; one that no longer does is dropped (written null). */
function heldTarget(state: MountState, entities: EntityTable): Entity | undefined {
  if (state.autoTarget === null) return undefined;
  const target = entities.get(state.autoTarget);
  if (target === undefined) state.autoTarget = null;
  return target;
}

/**
 * `0x5e444`(subject, mount, mask, hold) with `0x2daa0`: walks the kinds of `mask` in walk order, with no state filter
 * (parked, destroyed, dead and Warping entities included; the subject only through the mask). The target the previous
 * automatic mount holds (`0x2d7cc`) is passed over and kept as the fallback; the first other entity that passes
 * `0x2d894` (range and hemisphere) is chosen, otherwise the fallback when it passes. Mount `index` takes the choice, or
 * none, and the hold exactly as given (+0x4C). Reading the previous mount's target drops it when it no longer resolves,
 * once some entity of the mask is walked. No draw. Returns whether a target was chosen.
 */
export function chooseAutomaticTarget(data: FiringData, entities: EntityTable, shooter: CraftEntity, index: number, mask: number, hold: number): boolean {
  if (!Number.isSafeInteger(hold) || hold < 0) throw fault('hold');
  const { weapons } = shooter.combat;
  let held: Entity | undefined | null = null;
  let fallback: Entity | undefined;
  let chosen: Entity | undefined;
  for (const candidate of entities.walk(mask)) {
    if (held === null) {
      const previous = previousAutomaticMount(data, shooter, index);
      if (previous === null) throw fault('previous-mount');
      held = heldTarget(mountState(weapons, previous), entities);
    }
    if (candidate === held) {
      fallback = candidate;
    } else if (inHemisphere(data, shooter, candidate, index)) {
      chosen = candidate;
      break;
    }
  }
  if (chosen === undefined && fallback !== undefined && inHemisphere(data, shooter, fallback, index)) chosen = fallback;
  const state = mountState(weapons, index);
  state.autoTarget = chosen?.id ?? null;
  state.retargetClock = hold;
  return chosen !== undefined;
}

/** The largest hold any reachable writer stores: (rand & 7) << 6 is at most 0x1C0, the other holds 0x140 and 0xC0. */
const LARGEST_RETARGET_HOLD = 0x1c0;

/**
 * `0x2dabc`: sample > +0x4C (unsigned, strict). The holds are absolute samples of at most 0x1C0, which the original's
 * sample always exceeds by the time a mission runs, so every hold has passed: Core treats them so rather than compare
 * them with its own clock from 0 (P3-02 CR-24 decision 3, an approved difference).
 */
export function isRetargetDue(state: MountState): boolean {
  if (state.retargetClock > LARGEST_RETARGET_HOLD) throw fault('retarget-hold');
  return true;
}
