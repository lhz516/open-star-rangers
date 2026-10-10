/**
 * Missile guidance rules (docs/original/formats/executable.md, H5 and W11; docs/plan/p3/02/spec.md, CR-02, CR-11): the
 * guidance block G and the homing controller of a missile's first callback (`0x2aa40`, `0x2ab00`), the phases of
 * `0x2ac10`, the fuse `0x2adac`, and the blast of `0x2b408` with its shake `0x2b628`. P3-07/20 calls them from the
 * missile's update and its expire request (systems/missiles.ts); the homing program is steering.ts's.
 *
 * In a state-7 callback a homing missile first runs its program when it is due (`0x5dcd4`, steering.ts) and then
 * advanceGuidance, whose interval choice reads the controller distance that update left. The fuse runs there, on the
 * positions the previous tick's movement left. The blast runs in request handling, after the explosion constructor.
 *
 * The rules change the missile's combat state and the victims' movement blocks in place, draw from the RandSource they
 * are given and read nothing else. Numbers follow the native instructions as in steering.ts: double arithmetic, f32
 * stores through `Math.fround`, a store that is not finite is a fault, and clock sums are plain (P3-02).
 */
import type { MissileRecord } from '../../content/rule-data/craft-info.ts';
import { isDue } from '../contracts/time.ts';
import { CoreFaultError } from '../errors.ts';
import type { ControlBlock } from '../systems/pipeline.ts';
import {
  isActiveState, ROTATION_AXES, type Entity, type EntityId, type EntityTable, type HomingState, type MissileCombat, type MissileGuidance,
  type SteeredMovementBlock,
} from '../world/entity-table.ts';
import { craftContainsPoint, type CollisionShape } from './collision-shapes.ts';
import { isFiniteFloat32 } from './float32.ts';
import { rowOf, speedOf } from './movement-builders.ts';
import { RAND_SCALE, type RandSource } from './original-random.ts';
import { toInt32 } from './record-defaults.ts';
import { installHoming, runHomingProgram, vectorDistance, type HomingCall, type SteeringProgram } from './steering.ts';
import { isFriendlyKind } from './targeting.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `guidance.${site}`);

/** An f32 store F(x): `Math.fround`, and a fault when the stored value is not finite. */
function store(value: number): number {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored)) throw fault('result');
  return stored;
}

const isClock = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

/** `clock + duration` as a clock; a sum past the safe integers is a fault, as is a negative one. */
function clockAfter(clock: number, duration: number): number {
  const due = clock + duration;
  if (!Number.isSafeInteger(due)) throw new CoreFaultError('budget-exhausted', 'guidance.clock');
  if (due < 0) throw fault('clock');
  return due;
}

/** A missile entity: kind bit 20 with its combat state (CR-02). */
export type MissileEntity = Entity & { readonly combat: MissileCombat };

/** The missile record fields of G (craft §3.4): +0x44 lifetime, +0x48 arming delay, +0x54 detonation delay, +0x58 check interval. */
export type GuidanceRecord = Pick<MissileRecord, 'at44' | 'at48' | 'at54' | 'at58'>;

/**
 * G as the first callback writes it, with relative times: lifetime +0x44, arming +0x48, the fuse radius squared +0x50
 * (`fuseRadiusSquared`, the load transform's (+0x4C)²), detonation +0x54, check interval +0x58; phase 0, next check 0.
 * A time that is no clock (negative) or an interval outside i32 is a fault.
 */
export function initialGuidance({ at44, at48, at54, at58 }: GuidanceRecord, fuseRadiusSquared: number): MissileGuidance {
  if (![at44, at48, at54].every(isClock) || toInt32(at58) !== at58 || !isFiniteFloat32(fuseRadiusSquared)) throw fault('record');
  return { phase: 0, lifetimeClock: at44, armClock: at48, fuseRadiusSquared, detonationClock: at54, checkInterval: at58, nextCheckClock: 0 };
}

/** The first callback's homing controller: the install `0x5dc0c`, whose handler call in mode 0 posts `controls`. */
export interface InitialHoming {
  readonly homing: HomingState;
  readonly controls: readonly ControlBlock[];
}

/**
 * The controller a homing or heat-seeking missile installs at its first callback (`0x2ab00`): installHoming, then the
 * program handler in mode 0, which posts nothing and leaves the controller untouched when the target no longer
 * resolves. `call` is that handler call without its mode.
 */
export function initialHoming(record: SteeringProgram, call: Omit<HomingCall, 'mode'>, rand: RandSource): InitialHoming {
  const homing = installHoming(record);
  const controls = runHomingProgram(homing, record, { ...call, mode: 0 }, rand);
  return Object.freeze({ homing, controls });
}

/**
 * Conflict 29 (CR-11): `0x2ac10` chooses an unguided missile's check interval by the f32 at linear address 0x2C, which
 * depends on the machine's interrupt vectors. 'full' is the value at or above 150 (the interval as stored), 'halved'
 * any other (half of it). P3-07/20 sets the production value from the runtime reading (P3-07/31).
 */
export type UnguidedCheckInterval = 'full' | 'halved';

/** f32 `0x170ef0`: at or above this controller distance a check waits the whole interval. */
const FULL_INTERVAL_DISTANCE = 150;

const UNCHANGED = Object.freeze({ clear: false, set: false, value: 0 });
/** The full-throttle, no-turn block `0x2ac10` passes straight to `0x21fd8` in an unguided missile's phase 0. */
const FULL_THROTTLE_CONTROL: ControlBlock = Object.freeze({ scale: 1, axes: Object.freeze([UNCHANGED, UNCHANGED, UNCHANGED] as const), speedFactor: 1 });

/** What a call of `0x2ac10` asks of its caller. */
export type GuidanceAction =
  /** Nothing further. */
  | { readonly type: 'none' }
  /** Phase 0 of an unguided missile: apply this block through P3-06's `0x21fd8` now, not through a request. */
  | { readonly type: 'control'; readonly control: ControlBlock }
  /** Post the missile's expire request (message 0x10000); `detonate` (mb +0xF8) tells detonation from fizzling. */
  | { readonly type: 'expire' };

const NONE: GuidanceAction = Object.freeze({ type: 'none' });

/** What the fuse reads besides the missile: the entity table it walks and the collision shape of each craft kind. */
export interface FuseScene {
  readonly entities: EntityTable;
  /** The shape of the craft record of `kindBit` (WorldRuleData.craft). */
  readonly shape: (kindBit: number) => CollisionShape;
}

function guidanceOf(combat: MissileCombat): MissileGuidance {
  if (combat.guidance === null) throw fault('guidance');
  return combat.guidance;
}

/** Whether the next check waits the whole interval: the controller distance for a homing program, conflict 29 otherwise. */
function fullInterval({ program, homing }: MissileCombat, unguided: UnguidedCheckInterval): boolean {
  if (program === 'unguided') return unguided === 'full';
  if (homing === null) throw fault('homing');
  return homing.targetDistance >= FULL_INTERVAL_DISTANCE;
}

/**
 * `0x2ac10` on a missile in state 7, by phase; every comparison is strict (the clock must be past the time):
 * - 0: the lifetime and arming times become clocks (+ clock); an unguided missile gets the full-throttle block → 1.
 * - 1: past the arming time → 2.
 * - 2: past the lifetime, it fizzles (`detonate` false, expire; the phase stays). Otherwise, past the next check, the
 *   fuse runs (checkFuse) and the next check becomes clock + interval, or clock + (interval SAR 1) when the interval
 *   choice is not full.
 * - 3: past the detonation time, it detonates (`detonate` true, expire) → 4.
 * - 4: nothing.
 */
export function advanceGuidance(missile: MissileEntity, scene: FuseScene, clock: number, unguided: UnguidedCheckInterval): GuidanceAction {
  const { combat } = missile;
  const guidance = guidanceOf(combat);
  switch (guidance.phase) {
    case 0:
      guidance.lifetimeClock = clockAfter(guidance.lifetimeClock, clock);
      guidance.armClock = clockAfter(guidance.armClock, clock);
      guidance.phase = 1;
      return combat.program === 'unguided' ? { type: 'control', control: FULL_THROTTLE_CONTROL } : NONE;
    case 1:
      if (isDue(clock, guidance.armClock)) guidance.phase = 2;
      return NONE;
    case 2:
      if (isDue(clock, guidance.lifetimeClock)) {
        combat.detonate = false;
        return { type: 'expire' };
      }
      if (isDue(clock, guidance.nextCheckClock)) {
        checkFuse(missile, scene, clock);
        const interval = fullInterval(combat, unguided) ? guidance.checkInterval : guidance.checkInterval >> 1;
        guidance.nextCheckClock = clockAfter(clock, interval);
      }
      return NONE;
    case 3:
      if (!isDue(clock, guidance.detonationClock)) return NONE;
      combat.detonate = true;
      guidance.phase = 4;
      return { type: 'expire' };
    case 4:
      return NONE;
  }
}

/** The kinds the fuse and the blast walk: every craft kind, bits 0–19. */
const CRAFT_KINDS = 0xfffff;
/** The craft of an owner's side: `0x6c07f` when the owner's kind is friendly (`0x6c87f`), otherwise `0x93f80`. */
const FRIENDLY_SIDE_KINDS = 0x6c07f;
const ENEMY_SIDE_KINDS = 0x93f80;

const hasKind = (mask: number, kindBit: number): boolean => ((mask >>> kindBit) & 1) === 1;

/** Whether `craftKindBit` is on the side of an owner of `ownerKindBit`, by the kind masks of `0x2adac`. */
export function isOwnerSide(ownerKindBit: number, craftKindBit: number): boolean {
  return hasKind(isFriendlyKind(ownerKindBit) ? FRIENDLY_SIDE_KINDS : ENEMY_SIDE_KINDS, craftKindBit);
}

/** What fired the fuse, and on which craft. */
export interface FuseTrigger {
  readonly type: 'contact' | 'proximity';
  readonly craft: EntityId;
}

/**
 * The fuse `0x2adac` of a missile in phase 2. It walks every craft (kinds 0–19, in walk order) without any activity,
 * state, destroyed or Warp filter and stops at the first trigger:
 * - contact, only for a shape with boxes: the f32 squared distance from the craft to the missile strictly below r²,
 *   and the missile's point in the craft's boxes (craftContainsPoint). It sets the phase to 3, the detonation time to 0
 *   (the next callback) and `contact` to the craft. The launcher is not excluded.
 * - proximity, for a craft without contact: skipped when the owner (mb +0xFC, while it resolves) is set, the craft is
 *   on its side (isOwnerSide) and is not the target (missile +0x8C, while it resolves); otherwise when the squared
 *   distance is strictly below G's fuse radius squared, the detonation time becomes clock + its delay and the phase 3.
 */
export function checkFuse(missile: MissileEntity, { entities, shape }: FuseScene, clock: number): FuseTrigger | null {
  const { combat } = missile;
  const guidance = guidanceOf(combat);
  if (guidance.phase !== 2) throw fault('fuse-phase');
  const owner = combat.shooter === null ? undefined : entities.get(combat.shooter);
  const target = combat.target !== null && entities.get(combat.target) !== undefined ? combat.target : null;
  for (const craft of entities.walk(CRAFT_KINDS)) {
    const craftShape = shape(craft.kindBit);
    const test = craftContainsPoint(craftShape, craft.position, craft.orientation, missile.position);
    if (craftShape.boxes.length > 0 && test.distanceSquared < craftShape.radiusSquared && test.hit) {
      guidance.phase = 3;
      guidance.detonationClock = 0;
      combat.contact = craft.id;
      return { type: 'contact', craft: craft.id };
    }
    if (owner !== undefined && isOwnerSide(owner.kindBit, craft.kindBit) && craft.id !== target) continue;
    if (test.distanceSquared < guidance.fuseRadiusSquared) {
      guidance.detonationClock = clockAfter(guidance.detonationClock, clock);
      guidance.phase = 3;
      return { type: 'proximity', craft: craft.id };
    }
  }
  return null;
}

/** The missile record fields of the blast (craft §3.4): +0x5C damage D, +0x60 full-damage radius r0, +0x64 zero-damage radius r1. */
export type BlastRecord = Pick<MissileRecord, 'at5C' | 'at60' | 'at64'>;

/**
 * The blast's victim filter `0x5c490`: not parked (docked craft included), in state 7 or 8, not destroyed, not in Warp.
 * The launcher, its side and the player are not excluded.
 */
export function isBlastVictim({ activity, state, destroyed, inWarp }: Entity): boolean {
  return activity !== 'parked' && isActiveState(state) && !destroyed && !inWarp;
}

/**
 * The blast damage of `0x2b408` at f32 `distance`: 0 beyond r1; D below r0 (an unordered compare too); otherwise
 * trunc(D × (1 − (d − r0) ÷ (r1 − r0))) in double. A result that is not finite (r0 = r1 = d) is a fault.
 */
export function blastDamage({ at5C: damage, at60: inner, at64: outer }: BlastRecord, distance: number): number {
  if (distance > outer) return 0;
  if (!(distance >= inner)) return damage;
  const scaled = damage * (1 - (distance - inner) / (outer - inner));
  if (!Number.isFinite(scaled)) throw fault('blast');
  return Math.trunc(scaled) + 0;
}

/** One victim the blast damages. */
export interface BlastHit {
  readonly victim: Entity;
  readonly damage: number;
}

/**
 * The blast walk of `0x2b408` (the craft kinds, in walk order): every victim (isBlastVictim) whose damage at its
 * distance from the missile (`0x56b14`; 0 for the `contact` craft) is positive. The walk is lazy: the caller applies
 * each hit (blastShake, then the damage entry) before the walk tests the next craft, as the original does.
 */
export function* blastHits(missile: MissileEntity, entities: EntityTable, record: BlastRecord): Generator<BlastHit, void, undefined> {
  const { contact } = missile.combat;
  for (const victim of entities.walk(CRAFT_KINDS)) {
    if (!isBlastVictim(victim)) continue;
    const distance = vectorDistance(missile.position, victim.position);
    const damage = blastDamage(record, victim.id === contact ? 0 : distance);
    if (damage > 0) yield { victim, damage };
  }
}

/** The kinds `0x2b628` leaves unshaken. */
const SHAKE_EXEMPT_KINDS = 0xf9c7c;
/** f64 `0x170f18`: the impulse magnitude per unit of the missile's speed. */
const IMPULSE_PER_SPEED = 0.0125;
/** f64 `0x170f20` and `0x170f28`: the upper rate bound per damage point, and the lower bound's fraction of it. */
const RATE_PER_DAMAGE = 0.0014285714285714286;
const LOWER_RATE_FRACTION = 0.7142857142857143;
/** f64 `0x170f30`: a lower bound below it is replaced by its f32 store (about 5°). */
const RATE_FLOOR = 0.0872664638888889;
/** f32 `0x3ec90fdb`, π/8: the decay of every timed rate, in rad/s², with the rate's sign. */
const RATE_DECAY = Math.fround(Math.PI / 8);
/** f64 `0x170f3c`: the margin in seconds added to each end. */
const END_MARGIN = -0.5;

/**
 * `0x2b628`, the shake of a blast victim with positive damage, on `block`, its movement block; `time` is the f32
 * mission time t of the tick (MotionStep.time). Victims of the kinds `0xf9c7c` are left alone and draw nothing.
 * Otherwise, with u = D × 1/700 in double, the upper bound A = f32(u) and the lower bound B = f32(u × 5/7), or f32(about
 * 5°) when u × 5/7 is below the floor (or unordered):
 * - impulse: direction the missile's row 3, magnitude f32(the missile's speed × 0.0125);
 * - per row 1, 2, 3, two draws: rate = f32(rand × C × (A − B) + B), decay π/8; when the second draw has bit 1 set both
 *   change sign;
 * - end = f32(rate ÷ decay + t − 0.5) per row, and the timed rotation is active only when its end is after t.
 */
export function blastShake(victim: Entity, block: SteeredMovementBlock, missile: MissileEntity, damage: number, time: number, rand: RandSource): void {
  if (hasKind(SHAKE_EXEMPT_KINDS, victim.kindBit)) return;
  const scaled = damage * RATE_PER_DAMAGE;
  const upper = store(scaled);
  const lowerValue = scaled * LOWER_RATE_FRACTION;
  const lower = lowerValue >= RATE_FLOOR ? store(lowerValue) : Math.fround(RATE_FLOOR);
  block.impulse = { direction: rowOf(missile.orientation, 2), magnitude: store(speedOf(missile) * IMPULSE_PER_SPEED) };
  for (const axis of ROTATION_AXES) {
    const magnitude = store(rand.next() * RAND_SCALE * (upper - lower) + lower);
    const sign = (rand.next() & 2) === 0 ? 1 : -1;
    const rate = sign * magnitude;
    const decay = sign * RATE_DECAY;
    const end = store(rate / decay + time + END_MARGIN);
    block.timedRotation[axis] = end > time ? { rate, decay, end } : null;
  }
}
