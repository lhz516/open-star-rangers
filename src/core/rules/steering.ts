/**
 * The shared steering module (docs/plan/p3/02/spec.md, CR-09; docs/original/formats/executable.md, H5): the part of
 * the original's AI steering library that homing missiles reach, and the two missile programs built on it. P3-08
 * extends this module for AI craft (other lead modes, roll matching, the noise routines, the interpreter) instead of
 * building another one.
 *
 * The library keeps a controller C with a steering block S = C+4. Core keeps only the fields that outlive a call
 * (HomingState, CR-02) and recomputes the rest from the program record and the two bodies:
 * - installHoming: the install `0x5dc0c` with `0x5c530` and `0x5c768`(1, 1, 0);
 * - steeringLimits: the limits `0x5dc0c` derives from the program record;
 * - leadTargetPoint: the target point `0x5c8b0` in lead mode 3 with lead constant 0, which `0x5c878`(S, 3, 0) selects;
 * - steeringFractions and steeringControl: the two clamped atan2 fractions of `0x5cd1c` and its control block, which
 *   `0x5d014` posts unchanged (its noise routines `0x5d490` and `0x5d6a8` are off for missiles, H5, Likely);
 * - throttleControl and rateControl: the blocks `0x5d41c` and `0x5d0ec` post;
 * - isHomingUpdateDue and homingDeadline: the schedule of `0x5dcd4` and the deadline of the handler `0x60b84`;
 * - runHomingProgram: the handlers `0x60b84` (program record 2) and `0x60aa0` (record 1, the heat seeker).
 * The once-per-sample cache of `0x5c8b0` (S+0x14) is not kept: Core's clock is past 0 at every callback and differs
 * between any two calls of one missile's program.
 *
 * Numbers follow the native instructions (53-bit precision, round to nearest): every arithmetic step is a JavaScript
 * double operation and every f32 store `Math.fround`; FPATAN and FSQRT are Math.atan2 and Math.sqrt, the continuous
 * values of which P3-02 does not require to match bit for bit. The original unmasks the overflow, invalid-operation
 * and divide-by-zero exceptions, so an f32 store that is not finite is a fault. Clock sums are plain, as Core's clock
 * never wraps (P3-02); the halving and quartering shifts of the deadline floor the exact sum.
 */
import type { BuiltInProgram } from '../../content/rule-data/ai-programs.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { isDue } from '../contracts/time.ts';
import { CoreFaultError } from '../errors.ts';
import type { AxisControl, ControlBlock } from '../systems/pipeline.ts';
import type { Entity, HomingState, MissileProgram } from '../world/entity-table.ts';
import { pointInFrame } from './collision-shapes.ts';
import { rowOf, speedOf } from './movement-builders.ts';
import type { RandSource } from './original-random.ts';
import { squaredDistance } from './speed-match.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `steering.${site}`);

/** An f32 store F(x): `Math.fround`, and a fault when the stored value is not finite. */
function store(value: number): number {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored)) throw fault('result');
  return stored;
}

/** `clock + duration` as a clock; a sum past the safe integers is a fault, as is a negative one. */
function clockAfter(clock: number, duration: number): number {
  const due = clock + duration;
  if (!Number.isSafeInteger(due)) throw new CoreFaultError('budget-exhausted', 'steering.clock');
  if (due < 0) throw fault('clock');
  return due;
}

/**
 * The fields of a built-in program record (ai.md §3.1) the missile path reads: +0x14 the update period in clock units,
 * +0x24 the angle limit in degrees and +0x2C the saturation of the fractions.
 */
export type SteeringProgram = Pick<BuiltInProgram, 'at14' | 'at24' | 'at2C'>;

/** The built-in program record `0x2ab00` installs: 1 for the heat seeker (missile record +0x18 = 1), otherwise 2. */
export function programRecord(program: Exclude<MissileProgram, 'unguided'>): 1 | 2 {
  return program === 'heat-seeker' ? 1 : 2;
}

/** `0x56b14`: the f32 square root of the squared distance `0x56b50` (speed-match.ts) between `a` and `b`. */
export function vectorDistance(a: Vec3, b: Vec3): number {
  return store(Math.sqrt(squaredDistance(a, b)));
}

/** The f64 constants `0x17232c` and `0x172334` by which `0x5dc0c` turns degrees into radians; not exactly π and 1/180. */
const PI = 3.1415927;
const PER_DEGREE = 0.005555555555555555;

/** The controller limits the fractions read (C+0x100, C+0x104, C+0x110, C+0x114), every one an f32. */
export interface SteeringLimits {
  /** −a, a: the angle limit in radians. */
  readonly lower: number;
  readonly upper: number;
  /** −s, s: the saturation. */
  readonly low: number;
  readonly high: number;
}

/**
 * The limits `0x5dc0c` stores: a = f32((+0x24 × π) × 1/180) with the constants above and −a its negation, s = +0x2C
 * (a bit copy) and −s its negation. The limits from +0x28 and +0x30 feed only parts the missile path skips.
 */
export function steeringLimits({ at24, at2C }: SteeringProgram): SteeringLimits {
  const angle = at24 * PI * PER_DEGREE;
  return Object.freeze({ lower: store(-angle), upper: store(angle), low: store(-at2C), high: store(at2C) });
}

/**
 * The controller `0x5dc0c` installs before its handler's first call: everything zeroed except the period (record
 * +0x14) and the fractions `0x5c768`(1.0, 1.0, 0) sets. A negative period cannot be a clock and is a fault.
 */
export function installHoming({ at14 }: SteeringProgram): HomingState {
  if (!Number.isSafeInteger(at14) || at14 < 0) throw fault('period');
  return { period: at14, nextUpdateClock: 0, turnFraction: 1, speedFraction: 1, targetValid: false, targetDistance: 0 };
}

/** The lead constant S+0x64 that `0x5c878`(S, 3, 0) stores. */
const LEAD_CONSTANT = 0;

/** What `0x5c8b0` leaves in S for the steering. */
export interface TargetSolution {
  /** S+0x1C: the target's position moved along its row 3 by the lead, f32. */
  readonly point: Vec3;
  /** S+0x28: the distance from the missile to the target's position, before the lead. */
  readonly distance: number;
  /** S+0x6C: the point in the missile's frame (`0x56dc0`). */
  readonly local: Vec3;
}

/**
 * `0x5c8b0` in lead mode 3 for `missile` and `target`: the distance d to the target's position; with v the missile's
 * speed and w the target's (`0x21c78`), the lead = f32((d ÷ v + 0) × w), or 0 when v is ±0; the point = f32(P + f32(R3 ×
 * lead)) per component, with P and R3 the target's position and row 3; and that point in the missile's frame.
 */
export function leadTargetPoint(missile: Entity, target: Entity): TargetSolution {
  const distance = vectorDistance(missile.position, target.position);
  const speed = speedOf(missile);
  const lead = speed === 0 ? 0 : store((distance / speed + LEAD_CONSTANT) * speedOf(target));
  const row = rowOf(target.orientation, 2);
  const { x, y, z } = target.position;
  const point: Vec3 = Object.freeze({ x: store(x + store(row.x * lead)), y: store(y + store(row.y * lead)), z: store(z + store(row.z * lead)) });
  return Object.freeze({ point, distance, local: pointInFrame(missile.orientation, missile.position, point) });
}

/** Bit 2 of the flags `0x5c8b0` sets at S+0x68: the point lies ahead (local z > 0; an unordered compare sets it too). */
export const isAhead = (local: Vec3): boolean => !(local.z <= 0);

/**
 * One fraction of `0x5cd1c` for an angle in double precision: −s when the angle is below −a (an unordered compare
 * too); +s when its f32 store is above a; otherwise f32(f32(angle) ÷ (a − (−a))).
 */
function fraction(angle: number, { lower, upper, low, high }: SteeringLimits): number {
  if (!(angle >= lower)) return low;
  const stored = Math.fround(angle);
  if (stored > upper) return high;
  return store(stored / (upper - lower));
}

/**
 * The two fractions of `0x5cd1c` for the point's local vector L: for row 1 from atan2(L.y, L.z), for row 2 from
 * atan2(L.x, L.z) (`0x85a8b` swaps the FPATAN operands). When L.z is ±0 they are +s and −s.
 */
export function steeringFractions(local: Vec3, limits: SteeringLimits): readonly [number, number] {
  if (local.z === 0) return Object.freeze([limits.high, limits.low] as const);
  return Object.freeze([fraction(Math.atan2(local.y, local.z), limits), fraction(Math.atan2(local.x, local.z), limits)] as const);
}

const axis = (clear: boolean, set: boolean, value: number): AxisControl => Object.freeze({ clear, set, value });
/** An axis word triple left zero: neither cleared nor set. */
const UNCHANGED = axis(false, false, 0);

function controlBlock(scale: number, axes: readonly [AxisControl, AxisControl, AxisControl], speedFactor: number | null): ControlBlock {
  return Object.freeze({ scale, axes: Object.freeze(axes), speedFactor });
}

/**
 * The control block `0x5cd1c` builds and `0x5d014` posts (message 0x40000): scale = the turn fraction S+0xCC; rows 1 and
 * 2 cleared and set to their fractions; row 3 cleared only; the speed flag clear. The unwritten words are 0.
 */
export function steeringControl(turnFraction: number, [pitch, yaw]: readonly [number, number]): ControlBlock {
  return controlBlock(turnFraction, [axis(true, true, pitch), axis(true, true, yaw), axis(true, false, 0)], null);
}

/** `0x5d41c`(S, throttle): a zeroed block with only the speed flag and factor f32(throttle × the speed fraction S+0xC8). */
export function throttleControl(throttle: number, speedFraction: number): ControlBlock {
  return controlBlock(0, [UNCHANGED, UNCHANGED, UNCHANGED], store(throttle * speedFraction));
}

/**
 * `0x5d0ec`(S, a, b, c, throttle): scale = the turn fraction, the three rows set (not cleared) to a, b and c, and the
 * speed factor f32(throttle × the speed fraction) unless the throttle is below 0.
 */
export function rateControl(turnFraction: number, speedFraction: number, [a, b, c]: readonly [number, number, number], throttle: number): ControlBlock {
  const speedFactor = throttle < 0 ? null : store(throttle * speedFraction);
  return controlBlock(turnFraction, [axis(false, true, a), axis(false, true, b), axis(false, true, c)], speedFactor);
}

/** `0x5dcd4`: a missile's program runs again (mode 1) once the clock is strictly past its deadline C+0xF0. */
export function isHomingUpdateDue({ nextUpdateClock }: HomingState, clock: number): boolean {
  return isDue(clock, nextUpdateClock);
}

/** The f32 distances `0x60b84` compares the controller distance C+0x2C with. */
const NEAR_DISTANCE = 150;
const MIDDLE_DISTANCE = 250;

/**
 * The deadline `0x60b84` stores after every update: clock + period at distance 250 or more; below it (clock + period)
 * shifted right by 1, and below 150 (an unordered compare too) by 2. The shift applies to the sum, so the deadline
 * falls behind the clock and a near missile updates at every callback.
 */
export function homingDeadline(clock: number, period: number, distance: number): number {
  const due = clockAfter(clock, period);
  if (!(distance >= NEAR_DISTANCE)) return Math.floor(due / 4);
  return distance < MIDDLE_DISTANCE ? Math.floor(due / 2) : due;
}

/** The call modes of a program handler: 0 at install, 1 for a due update (`0x5dcd4`), 2 at release in state 6 (`0x5ddd4`). */
export type HomingMode = 0 | 1 | 2;

/** One call of a missile's program handler. */
export interface HomingCall {
  readonly program: Exclude<MissileProgram, 'unguided'>;
  /** mb +0x100. */
  readonly launchByte: 0 | 1 | 2 | 3 | 4;
  readonly mode: HomingMode;
  readonly missile: Entity;
  /** The entity missile +0x8C names, or null when it is null or no longer resolves. */
  readonly target: Entity | null;
  readonly clock: number;
}

/** The turn fraction (f32) and the period factor `0x60b84` gives launch bytes 4, 3 and the others in mode 0. */
function launchProfile(launchByte: HomingCall['launchByte']): { readonly turnFraction: number; readonly periodFactor: number } {
  if (launchByte === 4) return { turnFraction: 1, periodFactor: 1 };
  return launchByte === 3 ? { turnFraction: Math.fround(0.65), periodFactor: 2 } : { turnFraction: Math.fround(0.2), periodFactor: 5 };
}

/** f32 `0x172464`: the heat seeker breaks its lock only beyond this controller distance. */
const LOCK_BREAK_DISTANCE = 120;
/** The deadline after a lock break: the clock plus 4 periods. */
const LOCK_BREAK_PERIODS = 4;
/** The rates (rows 1, 2, 3) and the throttle of the lock break's `0x5d0ec` call. */
const LOCK_BREAK_RATES = Object.freeze([0.5, 0, 0.5] as const);
const LOCK_BREAK_THROTTLE = 1;

/** The dot product of two row-3 vectors as `0x60aa0` forms it: (y·y′ + z·z′) + x·x′ in double. */
function forwardDot(a: Entity, b: Entity): number {
  const p = rowOf(a.orientation, 2);
  const q = rowOf(b.orientation, 2);
  return p.y * q.y + p.z * q.z + p.x * q.x;
}

/**
 * One call of the missile program handler `0x60b84`, and for the heat seeker `0x60aa0` around it, on `state`. Returns
 * the control blocks posted, in order, for P3-07/20 to send as `steer` requests.
 *
 * - Without a target the handler returns at once: nothing is posted and the deadline does not move.
 * - Mode 0 (`0x5c584`): the target is valid, the controller distance is the distance to it, and by launch byte 4, 3 or
 *   other the turn fraction becomes 1, 0.65 or 0.2 and the period is multiplied by 1, 2 or 5; it posts the throttle-only
 *   block (`0x5d41c`, throttle 1).
 * - Every mode then runs the update: the target point, the controller distance from it, the steering block, and the
 *   deadline from that distance (homingDeadline).
 * - The heat seeker, in modes 0 and 1, then breaks its lock when the controller distance is above 120 and the two row
 *   3 vectors point apart (dot < 0) or the point is not ahead: one draw, and when it is even it posts the lock-break
 *   block (rows 0.5, 0, 0.5 at throttle 1) and sets the deadline to the clock plus 4 periods.
 *
 * A later mode with no valid target after install cannot occur, as entity IDs are never reused; it is a fault.
 */
export function runHomingProgram(state: HomingState, record: SteeringProgram, call: HomingCall, rand: RandSource): readonly ControlBlock[] {
  const { program, launchByte, mode, missile, target, clock } = call;
  if (target === null) return [];
  const controls: ControlBlock[] = [];
  if (mode === 0) {
    // 0x5c584 also stores the distance to the target, which the update below stores again unchanged.
    const { turnFraction, periodFactor } = launchProfile(launchByte);
    state.targetValid = true;
    state.speedFraction = 1;
    state.turnFraction = turnFraction;
    state.period = clockAfter(0, state.period * periodFactor);
    controls.push(throttleControl(1, state.speedFraction));
  } else if (!state.targetValid) {
    throw fault('target');
  }
  const solution = leadTargetPoint(missile, target);
  state.targetDistance = solution.distance;
  controls.push(steeringControl(state.turnFraction, steeringFractions(solution.local, steeringLimits(record))));
  state.nextUpdateClock = homingDeadline(clock, state.period, state.targetDistance);
  if (program === 'heat-seeker' && mode !== 2 && state.targetDistance > LOCK_BREAK_DISTANCE
    && (forwardDot(missile, target) < 0 || !isAhead(solution.local)) && rand.next() % 2 === 0) {
    controls.push(rateControl(state.turnFraction, state.speedFraction, LOCK_BREAK_RATES, LOCK_BREAK_THROTTLE));
    state.nextUpdateClock = clockAfter(clock, LOCK_BREAK_PERIODS * state.period);
  }
  return Object.freeze(controls);
}
