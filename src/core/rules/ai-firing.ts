/**
 * AI firing (docs/plan/p3/08/spec.md, S-08; docs/original/formats/executable.md, A12–A14, W9, W10): the trigger presses
 * `0x5df20` and releases `0x5df84`, the range test `0x5dfa4`, the trigger loop of the AI step `0x5dcd4`, the steadiness
 * `0x5e15c`, the AI missile lock `0x5dfec` with its switches `0x5e1b0`/`0x5e1d4`, and the base's built-in handler
 * `0x62c10` with its install half `0x62b60`.
 *
 * A press records the channel in the controller; the AI step fires it through P3-07's trigger routine `0x2d578`
 * (systems/weapons.ts, fireAiChannel) before the handler runs, so a handler's press fires in the next step. The AI lock
 * writes the same lock level +0x118 as the player's machine, and P3-07's launch `0x2e86c` posts that level for every
 * shooter, so an AI's guided missile normally carries 4 (P3-08 spec revision ⑦).
 *
 * The functions change the controller and the shooter's weapon block in place and draw from the RandSource they are
 * given; clock comparisons are plain, since Core's clock never wraps (P3-02).
 */
import { isDue } from '../contracts/time.ts';
import { CoreFaultError } from '../errors.ts';
import type { AiControllerCommon, BuiltInController, Entity, EntityId } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { aiPilot, postAxes, type AiPilot } from './ai-piloting.ts';
import { chooseAutomaticTarget, isRetargetDue, nextIdleAutomaticMount } from './ai-targeting.ts';
import type { CraftEntity } from './combat-init.ts';
import { acquireAutomaticTarget, type FiringData } from './firing.ts';
import { chainAmmunition, isMissileMount, type MountList } from './mounts.ts';
import type { RandSource } from './original-random.ts';
import { hasKind } from './radio.ts';
import { setSteeringFractions } from './steering.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `ai-firing.${site}`);

/** `clock + duration` as a clock; a sum Core cannot represent is a budget fault (P3-02). */
function clockAfter(clock: number, duration: number): number {
  const due = clock + duration;
  if (!Number.isSafeInteger(due) || due < 0) throw new CoreFaultError('budget-exhausted', 'ai-firing.clock');
  return due;
}

/** The three trigger channels in the order of the AI step. */
export const AI_CHANNELS: readonly MountList[] = Object.freeze([0, 1, 2]);

/** The deadline a negative hold gives, 0x7D00 units after the press. */
const LONG_HOLD = 0x7d00;

/**
 * `0x5df20`(C, channel, hold): only a released channel is pressed; its deadline is 0 for a hold of 0, the clock plus
 * 0x7D00 for a negative hold, the clock plus the hold otherwise (an i32). A pressed channel keeps its deadline.
 */
export function pressChannel(controller: AiControllerCommon, channel: MountList, hold: number, clock: number): void {
  if (!Number.isSafeInteger(hold) || hold < -0x8000_0000 || hold > 0x7fff_ffff) throw fault('hold');
  const trigger = controller.triggers[channel];
  if (trigger.pressed) return;
  trigger.pressed = true;
  trigger.holdDeadline = hold === 0 ? 0 : clockAfter(clock, hold < 0 ? LONG_HOLD : hold);
}

/**
 * `0x5df84`(C, channel) (opcode 403, the wingman): the channel is released. Its call `0x2d578`(subject, channel, 0)
 * only stores the 0 that Core does not keep (P3-07), and the deadline stays.
 */
export function releaseChannel(controller: AiControllerCommon, channel: MountList): void {
  controller.triggers[channel].pressed = false;
}

/**
 * The trigger loop of the AI step `0x5dcd4` for an active or docked subject: channels 0, 1 and 2 in turn; a pressed one
 * fires (`fire`, `0x2d578` with its value), and on channel 1 that attempt clears the missile-ready flag C+0x13C; then
 * channel 1 is always released, and channels 0 and 2 once the clock is past their deadline. So a channel-1 press fires
 * exactly once, and a channel-0 or 2 press with hold 0 once.
 */
export function runTriggerLoop(controller: AiControllerCommon, clock: number, fire: (channel: MountList) => void): void {
  for (const channel of AI_CHANNELS) {
    const trigger = controller.triggers[channel];
    if (trigger.pressed) {
      fire(channel);
      if (channel === 1) controller.missileReady = false;
    }
    if (channel === 1 || isDue(clock, trigger.holdDeadline)) releaseChannel(controller, channel);
  }
}

/** The world's static data that firing reads (CR-01). */
export const firingDataOf = ({ craftInfo, ruleData }: WorldState): FiringData => ({ info: craftInfo.content, rules: ruleData });

/**
 * `0x2dd54`(subject, channel): the range +0x0C of the weapon of the list's current mount; null without one, or for a
 * missile mount whose alternate chain has no ammunition (`0x2dd04` ≤ 0).
 */
export function channelRange(data: FiringData, shooter: CraftEntity, channel: MountList): number | null {
  const { weapons } = shooter.combat;
  const index = weapons.selections[channel].mount;
  if (index === null) return null;
  const craft = data.info.craft[shooter.kindBit];
  const mount = craft.mounts[index];
  const missile = isMissileMount(mount);
  if (missile && !(chainAmmunition(weapons, craft, index) > 0)) return null;
  const rules = missile ? data.rules.missiles[mount.weapon] : data.rules.guns[mount.weapon];
  if (rules === null || rules === undefined) throw fault('weapon-rules');
  return rules.range;
}

/**
 * `0x5dfa4`(C, channel): `0x2dd54` succeeds and the distance C+0x2C (S+0x28) is below its range (an unordered compare
 * counts as below).
 */
export function isChannelInRange(data: FiringData, shooter: CraftEntity, controller: AiControllerCommon, channel: MountList): boolean {
  const range = channelRange(data, shooter, channel);
  return range !== null && !(controller.steering.distance >= range);
}

/** f64 `0x17233c` and `0x172344`: the largest steady pitch and yaw rates. */
const STEADY_PITCH_RATE = 0.1745329277777778;
const STEADY_YAW_RATE = 0.2094395133333333;

/**
 * `0x5e15c`(C): false without a movement block; otherwise true unless an enabled steady pitch rate (+0x60, +0x7C)
 * exceeds 0.1745…, or an enabled yaw rate (+0x64, +0x80) 0.2094…, in magnitude (equality and NaN pass).
 */
export function isSteady(subject: Entity): boolean {
  const { movement } = subject;
  if (movement === null) return false;
  if (movement.mode !== 'craft' && movement.mode !== 'warp') throw fault('movement');
  const { pitch, yaw } = movement.steering;
  return !(pitch.enabled && Math.abs(pitch.rate) > STEADY_PITCH_RATE) && !(yaw.enabled && Math.abs(yaw.rate) > STEADY_YAW_RATE);
}

/** `0x5e1b0`(C) (opcode 303 true, the table install with record +0x38, the wingman install): the next lock update and level 0, the AI lock on. */
export function enableAiLock(controller: AiControllerCommon, shooter: CraftEntity): void {
  const { lock } = shooter.combat.weapons;
  lock.nextUpdateClock = 0;
  lock.level = 0;
  controller.aiLock = true;
}

/** `0x5e1d4`(C) (opcode 303 false): level 0, the AI lock off. */
export function disableAiLock(controller: AiControllerCommon, shooter: CraftEntity): void {
  shooter.combat.weapons.lock.level = 0;
  controller.aiLock = false;
}

/** The interval of the AI lock's updates, 0x40 units. */
const AI_LOCK_INTERVAL = 0x40;

/** The lock half-angle of a missile record, +0x2C at load: the arc cosine of +0x28 as `0x7558a` forms it, stored f32. */
const lockAngle = (cosine: number): number => Math.fround(Math.PI / 2 - Math.atan2(cosine, Math.sqrt(1 - cosine * cosine)));

/**
 * The AI lock `0x5dfec`(C) (A13), whose result the AI step stores as the missile-ready flag. Without a current list-1
 * mount the AI lock turns off (false). An unguided missile there is ready at once (true), and nothing is written. A
 * +0x8C that does not resolve or is not active, or no ammunition on the mount's chain, drops the level to 0 (false).
 * Before the next update clock the level stands. Otherwise the geometry decides: the distance C+0x2C below the
 * missile's range and both steering angles within its lock angle (an unordered angle passes); a failure drops the level
 * to 0, a success steps 0 → 2 at once, 2 → 3 and 3 → 4 each once the stage deadline (+0x34 SAR 1 after the step before)
 * has come, and leaves 1 and 4; the next update is 0x40 units later. Returns whether the level is 4.
 *
 * A gun as the current list-1 mount reads the gun record as a missile's: only its +0x18 byte of 0 (ready at once) is
 * within the record; any other value faults, as its stage times lie past the record's end.
 */
export function updateAiLock(data: FiringData, shooter: CraftEntity, controller: AiControllerCommon, resolve: (id: EntityId) => Entity | undefined, clock: number): boolean {
  const { weapons } = shooter.combat;
  const { lock } = weapons;
  const index = weapons.selections[1].mount;
  if (index === null) {
    controller.aiLock = false;
    return false;
  }
  const craft = data.info.craft[shooter.kindBit];
  const mount = craft.mounts[index];
  if (!isMissileMount(mount)) {
    if ((data.info.guns[mount.weapon].at18 & 0xff) === 0) return true;
    throw fault('lock-gun');
  }
  const missile = data.info.missiles[mount.weapon];
  if (missile.at18 === 0) return true;
  const target = shooter.ai.objectTarget === null ? undefined : resolve(shooter.ai.objectTarget);
  if (target === undefined || target.activity !== 'active' || chainAmmunition(weapons, craft, index) === 0) {
    lock.level = 0;
    return false;
  }
  if (clock < lock.nextUpdateClock) return lock.level === 4;
  const rules = data.rules.missiles[mount.weapon];
  if (rules === null || rules === undefined) throw fault('missile-rules');
  const angle = lockAngle(missile.at28);
  const { distance, angles: [a, b] } = controller.steering;
  if (!(rules.range > distance) || Math.abs(a) > angle || Math.abs(b) > angle) {
    lock.level = 0;
  } else if (lock.level === 0) {
    lock.level = 2;
    lock.stageDueClock = clockAfter(clock, missile.at34 >> 1);
  } else if (lock.level === 2 && clock >= lock.stageDueClock) {
    lock.level = 3;
    lock.stageDueClock = clockAfter(clock, missile.at34 >> 1);
  } else if (lock.level === 3 && clock >= lock.stageDueClock) {
    lock.level = 4;
  }
  lock.nextUpdateClock = clockAfter(clock, AI_LOCK_INTERVAL);
  return lock.level === 4;
}

/**
 * CR-16's read-only query for the tail check's attacker test `0x4ef9c` (docs/plan/p3/02/spec.md, CR-16, FA-01): a craft
 * whose missile lock level (weapon block +0x24, object +0x118) is 3 or 4, which for an AI craft only updateAiLock's
 * stages 2 → 3 → 4 write. The caller filters the kinds, activity, state and object target; nothing changes or draws.
 */
export function isClosingMissileLock(entity: Entity): boolean {
  const { combat } = entity;
  return combat.type === 'craft' && (combat.weapons.lock.level === 3 || combat.weapons.lock.level === 4);
}

/** The base's kind mask for a subject outside the enemy kinds, `0x93780`, and for one inside them, `0x6c87f`. */
const ENEMY_KINDS = 0x93780;
const OTHER_KINDS = 0x6c87f;
/** The hold of the base update's choices, 0x140. */
const BASE_HOLD = 0x140;

/** The base's installed controller. */
export type BaseController = Extract<BuiltInController, { readonly handler: 'base' }>;

/** One idle-mount pass of `0x2d72c` over `shooter`: `visit` sees each mount still idle when the pass reaches it. */
function forEachIdleMount(data: FiringData, shooter: CraftEntity, visit: (index: number) => void): void {
  for (let index = nextIdleAutomaticMount(data, shooter, null); index !== null; index = nextIdleAutomaticMount(data, shooter, index)) visit(index);
}

/**
 * The base's update `0x62c10` in mode 0 or 1 (A14): for each idle automatic mount in turn, a new target choice with the
 * hold 0x140 whenever its hold has passed (always: isRetargetDue), then the acquisition `0x2da58`; then the next update
 * at clock + C+0xF4. No draw.
 */
export function updateBase(world: WorldState, shooter: CraftEntity, controller: BaseController): void {
  const data = firingDataOf(world);
  const { entities, clock } = world;
  forEachIdleMount(data, shooter, (index) => {
    if (isRetargetDue(shooter.combat.weapons.mounts[index])) chooseAutomaticTarget(data, entities, shooter, index, controller.base.targetMask, BASE_HOLD);
    acquireAutomaticTarget(data, shooter, index, (id) => entities.get(id));
  });
  controller.nextUpdateClock = clockAfter(clock, controller.period);
}

/**
 * The base's install (`0x62c10` in mode 0, A14), the handler's mode 0 on the common controller `common` that `0x5dc0c`
 * installed: `0x62b60` turns the automatic mounts on (`0x5e1f4`), sets the steering fractions to 1 without roll
 * matching (`0x5c768`), posts yaw set to 1.0 with pitch and roll cleared (`0x5d1ac`: the base turns about its row 2 at
 * its craft yaw rate), keeps the kind mask (`0x93780` for a subject outside it) and, for each idle automatic mount in
 * turn, draws once for a hold (rand & 7) << 6 and chooses a target with it; then the update body runs in the same call
 * (updateBase). Returns the installed controller.
 */
export function installBase(world: WorldState, shooter: CraftEntity, common: AiControllerCommon, rand: RandSource, post: AiPilot['post']): BaseController {
  const data = firingDataOf(world);
  common.automaticMounts = true;
  setSteeringFractions(common.steering, data.info.craft[shooter.kindBit], 1, 1, false);
  postAxes(aiPilot(world, shooter, common, rand, post), [null, 1, null]);
  const targetMask = hasKind(ENEMY_KINDS, shooter.kindBit) ? OTHER_KINDS : ENEMY_KINDS;
  forEachIdleMount(data, shooter, (index) => {
    chooseAutomaticTarget(data, world.entities, shooter, index, targetMask, (rand.next() & 7) << 6);
  });
  const controller = { ...common, handler: 'base' as const, base: Object.freeze({ targetMask }) };
  updateBase(world, shooter, controller);
  return controller;
}
