/**
 * The shared steering module (docs/plan/p3/02/spec.md, CR-09, CR-16, CR-21; docs/original/formats/executable.md, H5 and
 * A1–A7): the original's AI steering library, which homing missiles and AI craft share.
 *
 * The library keeps a controller C with a steering block S = C+4. A missile keeps only the fields that outlive a call
 * (HomingState, CR-02) and recomputes the rest from the program record and the two bodies:
 * - installHoming: the install `0x5dc0c` with `0x5c530` and `0x5c768`(1.0, 1.0, 0);
 * - steeringLimits: the limits `0x5dc0c` derives from the program record;
 * - leadTargetPoint: the target point `0x5c8b0` in lead mode 3 with lead constant 0, which `0x5c878`(S, 3, 0) selects;
 * - steeringFractions and steeringControl: the two clamped atan2 fractions of `0x5cd1c` and its control block, which
 *   `0x5d014` posts unchanged (its noise routines `0x5d490` and `0x5d6a8` are off for missiles, A6);
 * - throttleControl and rateControl: the blocks `0x5d41c` and `0x5d0ec` post;
 * - isHomingUpdateDue and homingDeadline: the schedule of `0x5dcd4` and the deadline of the handler `0x60b84`;
 * - runHomingProgram: the handlers `0x60b84` (program record 2) and `0x60aa0` (record 1, the heat seeker).
 * The missile path does not keep the once-per-sample cache of `0x5c8b0` (S+0x14): Core's clock is past 0 at every
 * callback and differs between any two calls of one missile's program.
 *
 * An AI craft keeps the whole block in its controller (SteeringBlock, CR-16), and the functions below change it in
 * place as the original's do, with what else they read in an AiSteeringScene (P3-08/17):
 * - the setters `0x5c768` (setSteeringFractions), `0x5c7e8` (setSteeringNoise), `0x5c878` (setLeadMode), `0x5c73c`
 *   with `0x5dab0` (setSizeClass, approachRadius), `0x5c6d4`/`0x5c6fc`/`0x5c72c` (setTargetOffset, clearTargetOffset),
 *   `0x5c584` (steerAtTarget) and `0x5c658` (steerAtPoint);
 * - `0x5c8b0` (updateTargetPoint) with every lead mode, the offsets and the once-per-sample cache;
 * - `0x5cd1c` (computeSteering) with the cone bits and roll matching against C+0x118;
 * - the noise routines `0x5d490` (steeringNoise) and `0x5d6a8` (throttleNoise).
 * ai-piloting.ts builds the scene and posts the blocks. `0x5cc6c` (opcodes 203–205) is not reachable in the slice
 * (ai §10.2) and is not implemented.
 *
 * Numbers follow the native instructions (53-bit precision, round to nearest): every arithmetic step is a JavaScript
 * double operation and every f32 store `Math.fround`; FPATAN and FSQRT are Math.atan2 and Math.sqrt, the continuous
 * values of which P3-02 does not require to match bit for bit. The original unmasks the overflow, invalid-operation
 * and divide-by-zero exceptions, so an f32 store that is not finite is a fault. Clock sums are plain, as Core's clock
 * never wraps (P3-02); the halving and quartering shifts of the deadline floor the exact sum.
 */
import type { BuiltInProgram } from '../../content/rule-data/ai-programs.ts';
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { isDue } from '../contracts/time.ts';
import { CoreFaultError } from '../errors.ts';
import type { AxisControl, ControlBlock } from '../systems/pipeline.ts';
import type { ControllerLimits, Entity, EntityId, HomingState, MissileProgram, NoiseSettings, SteeringBlock } from '../world/entity-table.ts';
import { pointInFrame } from './collision-shapes.ts';
import { rowOf, speedOf } from './movement-builders.ts';
import { RAND_SCALE, type RandSource } from './original-random.ts';
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

/** One row's words of a control block (clear, set, value), frozen. */
export const axis = (clear: boolean, set: boolean, value: number): AxisControl => Object.freeze({ clear, set, value });
/** An axis word triple left zero: neither cleared nor set. */
const UNCHANGED = axis(false, false, 0);

/** A frozen control block (message 0x40000's words). */
export function controlBlock(scale: number, axes: readonly [AxisControl, AxisControl, AxisControl], speedFactor: number | null): ControlBlock {
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

// The AI steering library (P3-08/17; executable A1–A6). The functions change the controller's steering block in place.

/** The craft record fields the AI library reads through S+0x08: the turn rates and the maximum speed. */
export type SteeringCraft = Pick<CraftRecord, 'atAC' | 'atB0' | 'atB4' | 'atB8'>;

/**
 * What the AI library reads besides its block: the subject (S+0x00, a craft), its craft record (S+0x08), the
 * controller limits (S+0x04 → C+0x100–C+0x118) and the sample (`0x186414`, the mission clock), and from the world the
 * handle check `0x52680` (an ID that still resolves), `0x5dab0`'s record +0x10 of a target and the speed of the
 * subject's current list-0 weapon that lead mode 5 reads (`0x2dd38`(`0x2d704`(subject, 0))).
 */
export interface AiSteeringScene {
  readonly subject: Entity;
  readonly craft: SteeringCraft;
  readonly limits: ControllerLimits;
  readonly clock: number;
  resolve(id: EntityId): Entity | undefined;
  targetRadius(target: Entity): number;
  mainWeaponSpeed(): number;
}

/** A finite f32 argument of a library routine; anything else is a caller's fault. */
export function float32Argument(value: number): number {
  if (!Number.isFinite(value) || Math.fround(value) !== value) throw fault('argument');
  return value;
}

const frozenVector = ({ x, y, z }: Vec3): Vec3 => Object.freeze({ x, y, z });

/** A vector argument of f32 components, frozen. */
const float32Vector = ({ x, y, z }: Vec3): Vec3 => frozenVector({ x: float32Argument(x), y: float32Argument(y), z: float32Argument(z) });

/**
 * `0x5c768`(S, speedFraction, turnFraction, rollFlag): S+0xC8, S+0xCC and roll matching (S+0xD0 = 0, on with a non-zero
 * flag); the speed limit F(craft +0xB8 × speedFraction) and its half F(D(that product) × 0.5); the turn rates F(+0xAC ×
 * turnFraction), F(+0xB4 × …), F(+0xB0 × …).
 */
export function setSteeringFractions(block: SteeringBlock, craft: SteeringCraft, speedFraction: number, turnFraction: number, rollMatch: boolean): void {
  block.speedFraction = float32Argument(speedFraction);
  block.turnFraction = float32Argument(turnFraction);
  block.rollMatch = rollMatch;
  const speed = craft.atB8 * speedFraction;
  block.speedLimit = store(speed);
  block.halfSpeedLimit = store(speed * 0.5);
  block.turnRates = Object.freeze([store(craft.atAC * turnFraction), store(craft.atB4 * turnFraction), store(craft.atB0 * turnFraction)] as const);
}

/** One argument of `0x5c7e8`: above 0 enables the routine with bounds −v and v; otherwise disables it, leaving the bounds. */
function setNoise(settings: NoiseSettings, value: number): void {
  if (float32Argument(value) > 0) {
    settings.enabled = true;
    settings.low = -value;
    settings.high = value;
  } else {
    settings.enabled = false;
  }
}

/** `0x5c7e8`(S, throttleNoise, steerNoise): the throttle noise S+0xD4–+0xDC and the steering noise S+0xE0–+0xE8. */
export function setSteeringNoise(block: SteeringBlock, throttle: number, steer: number): void {
  setNoise(block.throttleNoise, throttle);
  setNoise(block.steeringNoise, steer);
}

/** The f32 1/64 by which `0x5c878` turns its integer argument into a lead constant. */
const LEAD_PERIOD_SCALE = 1 / 64;

/**
 * `0x5c878`(S, mode, constant, period): the lead mode S+0x60 (a byte); modes 1 and 3 take `constant` (f32) as the
 * lead constant S+0x64, modes 2 and 5 F(period × 1/64) (period an i32); the other modes leave S+0x64.
 */
export function setLeadMode(block: SteeringBlock, mode: number, constant: number, period: number): void {
  if (!Number.isInteger(mode) || mode < 0 || mode > 0xff || !Number.isInteger(period) || period < -0x8000_0000 || period > 0x7fff_ffff) {
    throw fault('lead-mode');
  }
  block.leadMode = mode;
  if (mode === 1 || mode === 3) block.leadConstant = float32Argument(constant);
  else if (mode === 2 || mode === 5) block.leadConstant = store(period * LEAD_PERIOD_SCALE);
}

/** `0x5dab0`'s radii without a target, by size class (0, 1, 2, 3, 4; 3 is also the default for classes above 4), f32. */
const POINT_RADII = Object.freeze([1, 10, 30, 60, 375] as const);
/** Its f64 margins over the target's record +0x10, by the same classes. */
const TARGET_MARGINS = Object.freeze([10, 30, 80, 150, 275] as const);

/**
 * `0x5dab0`: the approach radius S+0x48 for `sizeClass`: without a target a fixed radius; with one, F(the target
 * record's +0x10 + the class's f64 margin). Class 3 and every class above 4 share one entry.
 */
export function approachRadius(sizeClass: number, targetRadius: number | null): number {
  const index = sizeClass <= 4 ? sizeClass : 3;
  return targetRadius === null ? POINT_RADII[index] : store(targetRadius + TARGET_MARGINS[index]);
}

/** The target `0x5dab0` reads: S+0x10 while it is a valid handle. */
function radiusTarget(block: SteeringBlock, scene: AiSteeringScene): number | null {
  const target = block.target === null ? undefined : scene.resolve(block.target);
  return target === undefined ? null : scene.targetRadius(target);
}

/** `0x5c73c`(S, sizeClass): the size class S+0x44 (a byte), then the approach radius for S+0x10 while it is valid. */
export function setSizeClass(block: SteeringBlock, scene: AiSteeringScene, sizeClass: number): void {
  if (!Number.isInteger(sizeClass) || sizeClass < 0 || sizeClass > 0xff) throw fault('size-class');
  block.sizeClass = sizeClass;
  block.approachRadius = approachRadius(sizeClass, radiusTarget(block, scene));
}

/**
 * `0x5c6d4` (frame 0: along the target's rows) and `0x5c6fc` (frame 1: world axes at the target): the offset on, with
 * `vector` (f32).
 */
export function setTargetOffset(block: SteeringBlock, frame: 0 | 1, vector: Vec3): void {
  block.offset = Object.freeze({ enabled: true, frame, vector: float32Vector(vector) });
}

/** `0x5c72c` and the other writers that switch the offset off: the frame and vector stay. */
export function clearTargetOffset(block: SteeringBlock): void {
  block.offset = Object.freeze({ ...block.offset, enabled: false });
}

/**
 * `0x5c584`(target, S, −1.0), the form every AI caller uses. Null: the subject's +0x8C := null and S+0x0C := 0 (S+0x10
 * stays); true. The handle S+0x10 already holds: nothing; true. Otherwise S+0x0C := whether it resolves; an invalid one
 * returns false with no other write. A valid one becomes S+0x10 and the subject's +0x8C, the point its position, the
 * offset off, the distance F(√(squared distance)) from the subject, the approach radius for it, and the subject's
 * missile lock level +0x118 := 0.
 */
export function steerAtTarget(block: SteeringBlock, scene: AiSteeringScene, target: EntityId | null): boolean {
  const { subject } = scene;
  if (target === null) {
    subject.ai.objectTarget = null;
    block.targetValid = false;
    return true;
  }
  if (target === block.target) return true;
  const entity = scene.resolve(target);
  block.targetValid = entity !== undefined;
  if (entity === undefined) return false;
  block.target = target;
  subject.ai.objectTarget = target;
  block.point = frozenVector(entity.position);
  clearTargetOffset(block);
  block.distance = vectorDistance(subject.position, block.point);
  block.approachRadius = approachRadius(block.sizeClass, scene.targetRadius(entity));
  if (subject.combat.type === 'craft') subject.combat.weapons.lock.level = 0;
  return true;
}

/**
 * `0x5c658`(point, S), point steering: S+0x0C := 1, no target (S+0x10 and the subject's +0x8C null), the point and its
 * distance from the subject, the offset off and the approach radius without a target.
 */
export function steerAtPoint(block: SteeringBlock, scene: AiSteeringScene, point: Vec3): void {
  block.targetValid = true;
  block.target = null;
  scene.subject.ai.objectTarget = null;
  block.point = float32Vector(point);
  block.distance = vectorDistance(scene.subject.position, block.point);
  clearTargetOffset(block);
  block.approachRadius = approachRadius(block.sizeClass, null);
}

/** `point` moved by F(row × factor) per component, each sum stored f32: the lead and frame-0 offset steps of `0x5c8b0`. */
const movedAlong = (point: Vec3, row: Vec3, factor: number): Vec3 =>
  frozenVector({ x: store(point.x + store(row.x * factor)), y: store(point.y + store(row.y * factor)), z: store(point.z + store(row.z * factor)) });

/**
 * The lead of `0x5c8b0` along the target's row 3: modes 1 and 2 F(D(target speed × S+0x64)); the others (3, 4, 5 and
 * any above) with v = own speed (3), the speed of the current list-0 weapon (5) or own craft maximum +0xB8 (4 and above):
 * S+0x2C := the target's speed and lead = F(((d ÷ v) + S+0x64) × S+0x2C) with d the distance to the target's position,
 * or 0 when v is ±0.
 */
function leadOf(block: SteeringBlock, scene: AiSteeringScene, target: Entity): number {
  const { leadMode, leadConstant } = block;
  if (leadMode === 1 || leadMode === 2) return store(speedOf(target) * leadConstant);
  const own = leadMode === 3 ? speedOf(scene.subject) : leadMode === 5 ? scene.mainWeaponSpeed() : scene.craft.atB8;
  block.targetSpeed = speedOf(target);
  const distance = vectorDistance(scene.subject.position, target.position);
  return own === 0 ? 0 : store((distance / own + leadConstant) * block.targetSpeed);
}

/** The flags `0x5c8b0` and `0x5cc6c` set for a vector: bit 0 x > 0, bit 1 y > 0, bit 2 z > 0 (an unordered compare sets them too). */
const positiveFlags = ({ x, y, z }: Vec3): number => (x <= 0 ? 0 : 1) | (y <= 0 ? 0 : 2) | (z <= 0 ? 0 : 4);

/**
 * `0x5c8b0`: the target point and its view from the subject, once per sample. When S+0x14 already holds the sample it
 * returns true at once, changing nothing. Otherwise S+0x14 := the sample; with a target, S+0x10 is read again from the
 * subject's +0x8C (any writer of +0x8C redirects the steering) and S+0x0C := whether it resolves. Without a valid target
 * S+0x10 and the subject's +0x8C become null and it returns false.
 *
 * With a target the point is its position (the distance S+0x28 recomputed while the offset is off), moved by the lead
 * (leadOf) unless the lead mode is 0; point steering keeps its point. With the offset on, the vector is added in world
 * axes without a target or in frame 1, and along the target's rows 1, 2 and 3 in frame 0 (so point steering adds it
 * again at every sample), and S+0x28 is the distance to the moved point. Last, the point in the subject's frame
 * (`0x56dc0`) and its flags.
 */
export function updateTargetPoint(block: SteeringBlock, scene: AiSteeringScene): boolean {
  const { subject, clock } = scene;
  if (block.targetSample === clock) return true;
  block.targetSample = clock;
  let target: Entity | undefined;
  if (block.targetValid && block.target !== null) {
    block.target = subject.ai.objectTarget;
    target = block.target === null ? undefined : scene.resolve(block.target);
    block.targetValid = target !== undefined;
  }
  if (!block.targetValid) {
    block.target = null;
    subject.ai.objectTarget = null;
    return false;
  }
  let point = block.point;
  if (target !== undefined) {
    point = frozenVector(target.position);
    if (!block.offset.enabled) block.distance = vectorDistance(subject.position, point);
    if (block.leadMode !== 0) point = movedAlong(point, rowOf(target.orientation, 2), leadOf(block, scene, target));
  }
  const { offset } = block;
  if (offset.enabled) {
    const { x, y, z } = offset.vector;
    if (target === undefined || offset.frame === 1) {
      point = frozenVector({ x: store(x + point.x), y: store(y + point.y), z: store(z + point.z) });
    } else {
      point = movedAlong(point, rowOf(target.orientation, 0), x);
      point = movedAlong(point, rowOf(target.orientation, 1), y);
      point = movedAlong(point, rowOf(target.orientation, 2), z);
    }
    block.distance = vectorDistance(subject.position, point);
  }
  block.point = point;
  block.relative = pointInFrame(subject.orientation, subject.position, point);
  block.relativeFlags = positiveFlags(block.relative);
  return true;
}

/** The f32 π/2 `0x5cd1c` stores as both angles when L.z is ±0. */
const HALF_PI = Math.fround(Math.PI / 2);
/** The f32 distance below which an offset approach matches the roll (`0x172270`). */
const ROLL_MATCH_DISTANCE = 100;

/** The words `0x5cd1c` writes first: every row cleared and none set (values kept), the speed flag off. */
const resetAxis = ({ value }: AxisControl): AxisControl => axis(true, false, value);

/** The roll-match value F(((t × o)·f) with t, o the rows 2 and f the subject's row 3, in the native order (y, z, then x). */
function rollValue(own: Entity, target: Entity): number {
  const o = rowOf(own.orientation, 1);
  const t = rowOf(target.orientation, 1);
  const f = rowOf(own.orientation, 2);
  const crossX = t.y * o.z - t.z * o.y;
  const crossY = t.z * o.x - t.x * o.z;
  const crossZ = t.x * o.y - t.y * o.x;
  return store(crossY * f.y + crossZ * f.z + crossX * f.x);
}

/**
 * `0x5cd1c` on the block: nothing without S+0x0C. Otherwise the control block CB is reset (scale := S+0xCC; rows
 * cleared, not set, their values kept; speed flag off) and the cone bits S+0xC0 := 0; rows 1 and 2 are set to the
 * fractions of the angles A = atan2(L.y, L.z) and B = atan2(L.x, L.z) (S+0x88, S+0x8C, f32) against the turn limit a and
 * the saturation (as steeringFractions), with cone bit 0 (A) or 1 (B) when the angle passed both limit tests and −b ≤
 * F(angle) ≤ b for the cone limit b (C+0x10C); L.z = ±0 sets both angles to π/2 and the rows to +sat and −sat.
 *
 * Roll matching follows with a target handle, S+0xD0 enabled and either both cone bits or the offset on with S+0x28 <
 * 100 (strict): when the dot (o.y·t.y + o.z·t.z) + o.x·t.x of the two rows 2 is below C+0x118 (an unordered compare too),
 * row 3 is set to rollValue, unsaturated.
 */
export function computeSteering(block: SteeringBlock, scene: AiSteeringScene): void {
  if (!block.targetValid) return;
  const { turn, speed: cone, saturation, rollMatchThreshold } = scene.limits;
  const limits: SteeringLimits = { lower: -turn, upper: turn, low: -saturation, high: saturation };
  // The cone bit of an angle that passed both limit tests and lies within ±b, compared as its f32 store.
  const inCone = (angle: number, stored: number): 0 | 1 => (angle >= -turn && stored <= turn && stored >= -cone && stored <= cone ? 1 : 0);
  const [, , roll] = block.control.axes;
  const local = block.relative;
  let coneBits: SteeringBlock['coneBits'] = 0;
  let rows: readonly [AxisControl, AxisControl];
  if (local.z === 0) {
    block.angles = Object.freeze([HALF_PI, HALF_PI] as const);
    rows = [axis(true, true, saturation), axis(true, true, -saturation)];
  } else {
    const pitch = Math.atan2(local.y, local.z);
    const yaw = Math.atan2(local.x, local.z);
    block.angles = Object.freeze([store(pitch), store(yaw)] as const);
    coneBits = (inCone(pitch, block.angles[0]) | (inCone(yaw, block.angles[1]) << 1)) as SteeringBlock['coneBits'];
    rows = [axis(true, true, fraction(pitch, limits)), axis(true, true, fraction(yaw, limits))];
  }
  block.coneBits = coneBits;
  let rollAxis = resetAxis(roll);
  if (block.target !== null && block.rollMatch && (coneBits === 3 || (block.offset.enabled && block.distance < ROLL_MATCH_DISTANCE))) {
    const target = scene.resolve(block.target);
    if (target === undefined) throw fault('roll-target');
    const o = rowOf(scene.subject.orientation, 1);
    const t = rowOf(target.orientation, 1);
    if (!(o.y * t.y + o.z * t.z + o.x * t.x >= rollMatchThreshold)) rollAxis = axis(true, true, rollValue(scene.subject, target));
  }
  block.control = controlBlock(block.turnFraction, [rows[0], rows[1], rollAxis], null);
}

/** A noisy value clamped to [low, 1.0]: above 1.0 it is 1.0, below `low` it is `low`. */
const clamped = (value: number, low: number): number => (value > 1 ? 1 : value < low ? low : value);

/** One draw of the noise routines: D(D(D(rand × f32 1/32767) × F(high − low)) + low). */
const noiseDraw = (rand: RandSource, { low, high }: NoiseSettings): number => rand.next() * RAND_SCALE * store(high - low) + low;

/**
 * `0x5d490`(S, CB), the steering noise, when enabled: for rows 1, 2 and 3 in order, a set row with value ≤ 1.0 gets one
 * draw added (F, then clamped to [−1.0, 1.0]); an unset row gets one draw as its value and becomes set (its clear word
 * stays); a set row above 1.0 is left without a draw. Returns the block the routine leaves.
 */
export function steeringNoise(settings: NoiseSettings, control: ControlBlock, rand: RandSource): ControlBlock {
  if (!settings.enabled) return control;
  const noisy = ({ clear, set, value }: AxisControl): AxisControl => {
    if (!set) return axis(clear, true, store(noiseDraw(rand, settings)));
    if (value > 1) return axis(clear, set, value);
    return axis(clear, set, clamped(store(noiseDraw(rand, settings) + value), -1));
  };
  // Rows 1, 2 and 3 in this order: the draws follow it.
  const [pitch, yaw, roll] = control.axes;
  const first = noisy(pitch);
  const second = noisy(yaw);
  return controlBlock(control.scale, [first, second, noisy(roll)], control.speedFactor);
}

/**
 * `0x5d6a8`(S, CB), the throttle noise, when enabled and CB has the speed flag with a factor ≤ 1.0: one draw added to
 * the factor (F, then clamped to [0, 1.0]). Returns the block the routine leaves.
 */
export function throttleNoise(settings: NoiseSettings, control: ControlBlock, rand: RandSource): ControlBlock {
  const { speedFactor } = control;
  if (!settings.enabled || speedFactor === null || speedFactor > 1) return control;
  return controlBlock(control.scale, control.axes, clamped(store(noiseDraw(rand, settings) + speedFactor), 0));
}
