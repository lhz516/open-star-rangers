/**
 * Integration of the steered movement modes (docs/plan/p3/06/spec.md, 运动阶段与积分;
 * docs/original/formats/executable.md, movement stage and integration and numbers on the movement path, P3-06/01): the
 * craft integrator `0x222f0` (mode 0), the Warp integrator `0x22600` (mode 3) and the three rotation helpers. They are
 * pure: each returns new values and leaves its arguments alone. The movement stage (systems/movement.ts) dispatches to
 * them by mode; P3-07 reuses them for missiles and the rotation helpers for its own writers.
 *
 * Numbers follow the original's write-back points one by one. Every arithmetic step is a JavaScript double operation,
 * which rounds as the original's double precision control does (a product of two f32 values is exact, so the first
 * rounding usually falls at a sum), and every f32 store is `Math.fround`. sin and cos are Math.sin and Math.cos stored
 * as f32 (spec, 数值). Nothing renormalises the rows, as in the original. The original unmasks the overflow,
 * invalid-operation and divide-by-zero exceptions, so every f32 store that is not finite is a fault here, even one whose
 * value the step then discards; a caller never receives a partial result.
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { CLOCK_UNITS_PER_SECOND } from '../contracts/time.ts';
import { CoreFaultError } from '../errors.ts';
import { copyMovement, ROTATION_AXES, type Matrix3, type RotationAxis, type SteeredMovementBlock, type TimedRotation } from '../world/entity-table.ts';
import { isFiniteFloat32 } from './float32.ts';

/**
 * The fields modes 0 and 3 read from the record at object +0x1C: a craft record, or a missile's body record (P3-07).
 * +0xB8 is the reference maximum speed the original copies into block +0x70, +0xBC and +0xC0 the acceleration and the
 * deceleration in units/s², +0xC4 the coupling of the yaw turn into the roll and +0xC8 the turn factor's selector.
 */
export type MotionRecord = Pick<CraftRecord, 'atB8' | 'atBC' | 'atC0' | 'atC4' | 'atC8'>;

/** One step of the integrators: the original's dt `0x186424` and t `0x18641c`, both f32 seconds. */
export interface MotionStep {
  /** The step, a non-negative f32. */
  readonly seconds: number;
  /** The f32 mission time in seconds that timed rotations expire against: the clock ÷ 64, rounded. */
  readonly time: number;
}

/** What modes 0 and 3 change: the entity's pose, which they update in place in the original, and its block. */
export interface SteeredMotion {
  readonly position: Vec3;
  readonly orientation: Matrix3;
  readonly block: SteeredMovementBlock;
}

/** The impulse decay, f64 `0x170094`, in units/s². */
const IMPULSE_DECAY = 30;

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `flight-motion.${site}`);

/** An f32 store F(x): `Math.fround`, and a fault when the stored value is not finite. */
function store(value: number): number {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored)) throw fault('result');
  return stored;
}

/**
 * The step of `clockUnits` at mission clock `clock`: dt = units ÷ 64 seconds, which must be an f32 (every step up to
 * 2^25 units is), and t = f32(clock ÷ 64). The production stage passes the world's fixed positive step; the internal
 * rule tests and the calibration of P3-06/18 may pass 0 and the original's recorded steps. Anything else is a fault.
 */
export function motionStep(clockUnits: number, clock: number): MotionStep {
  if (!Number.isSafeInteger(clockUnits) || clockUnits < 0 || !Number.isSafeInteger(clock) || clock < 0) throw fault('step');
  return checkedStep({ seconds: clockUnits / CLOCK_UNITS_PER_SECOND, time: Math.fround(clock / CLOCK_UNITS_PER_SECOND) });
}

function checkedStep(step: MotionStep): MotionStep {
  const { seconds, time } = step;
  if (!isFiniteFloat32(seconds) || seconds < 0 || Object.is(seconds, -0) || !isFiniteFloat32(time) || time < 0) throw fault('step');
  return step;
}

/** The rows each rotation helper changes, as row indices (a, b): about row 1 (pitch), row 2 (yaw) and row 3 (roll). */
const ROTATED_ROWS: Readonly<Record<RotationAxis, readonly [number, number]>> = Object.freeze({ pitch: [1, 2], yaw: [0, 2], roll: [0, 1] });

/**
 * The rotation helpers `0x228cc` (pitch), `0x22a50` (yaw) and `0x22990` (roll) by the f32 `angle`: with c and s the f32
 * cosine and sine, every component of the two other rows becomes a′ = f32(a·c + b·s) and b′ = f32(b·c − a·s) of the old
 * values. The rotated rows are not renormalised.
 */
export function rotateRows(orientation: Matrix3, axis: RotationAxis, angle: number): Matrix3 {
  const cos = store(Math.cos(angle));
  const sin = store(Math.sin(angle));
  const [a, b] = ROTATED_ROWS[axis];
  const rows = [...orientation];
  for (let component = 0; component < 3; component++) {
    const first = orientation[3 * a + component];
    const second = orientation[3 * b + component];
    rows[3 * a + component] = store(first * cos + second * sin);
    rows[3 * b + component] = store(second * cos - first * sin);
  }
  return Object.freeze(rows) as unknown as Matrix3;
}

/** The speed and the arrival flag after step 3 of `0x222f0` (`decelerates`) or its accelerating half in `0x22600`. */
interface SpeedUpdate {
  readonly speed: number;
  readonly atCommandedSpeed: boolean;
}

/**
 * Moves the speed toward the commanded speed at +0xBC or +0xC0 per second. The original stores f32(v) first; then the
 * double v, not that store, decides whether it passed the commanded speed, and if so the speed takes the commanded value
 * bit for bit. Reaching it exactly does not count. Without `decelerates` (mode 3) a commanded speed at or below the speed
 * leaves it.
 */
function updateSpeed(block: SteeredMovementBlock, record: MotionRecord, dt: number, decelerates: boolean): SpeedUpdate {
  const { speed, commandedSpeed } = block;
  if (commandedSpeed - speed > 0) {
    const v = record.atBC * dt + speed;
    const stored = store(v);
    return v > commandedSpeed ? { speed: commandedSpeed, atCommandedSpeed: true } : { speed: stored, atCommandedSpeed: false };
  }
  if (!decelerates) return { speed, atCommandedSpeed: false };
  const v = speed - record.atC0 * dt;
  const stored = store(v);
  return v < commandedSpeed ? { speed: commandedSpeed, atCommandedSpeed: true } : { speed: stored, atCommandedSpeed: false };
}

/**
 * Steps 4–7 of `0x222f0`, shared by `0x22600`: the turn factor, then the rotations about rows 1, 2 and 3 in that order,
 * each about the rows the previous one left. A timed rotation adds the enabled steady rate, rotates with its rate before
 * this step's decay, decays and ends once t is past its end; without one, row 3 takes the coupled yaw turn when +0xC4
 * and the yaw are on, and otherwise each axis its enabled steady rate.
 */
function rotate(
  orientation: Matrix3,
  block: SteeredMovementBlock,
  speedRatio: number,
  record: MotionRecord,
  { seconds: dt, time }: MotionStep,
): { readonly orientation: Matrix3; readonly timedRotation: SteeredMovementBlock['timedRotation'] } {
  const { steering } = block;
  const factor = record.atC8 !== 0 ? dt : store(speedRatio * dt);
  const timedRotation: { [Axis in RotationAxis]: TimedRotation | null } = { pitch: null, yaw: null, roll: null };
  let rows = orientation;
  for (const axis of ROTATION_AXES) {
    const timed = block.timedRotation[axis];
    const steady = steering[axis];
    if (timed !== null) {
      const rate = steady.enabled ? store(timed.rate + steady.rate) : timed.rate;
      rows = rotateRows(rows, axis, store(rate * factor));
      const decayed = { rate: store(timed.rate - timed.decay * dt), decay: timed.decay, end: timed.end };
      timedRotation[axis] = time > timed.end ? null : decayed;
    } else if (axis === 'roll' && record.atC4 !== 0 && steering.yaw.enabled) {
      const coupled = steering.yaw.rate * speedRatio;
      const base = store(steady.enabled ? coupled + steady.rate : coupled);
      rows = rotateRows(rows, axis, store(base * factor));
    } else if (steady.enabled) {
      rows = rotateRows(rows, axis, store(steady.rate * factor));
    }
  }
  return { orientation: rows, timedRotation };
}

/** The position moved along `direction` by `length`: each component F(D(position + F(D(direction × length)))). */
function displace({ x, y, z }: Vec3, direction: Vec3, length: number): Vec3 {
  return Object.freeze({ x: store(x + store(direction.x * length)), y: store(y + store(direction.y * length)), z: store(z + store(direction.z * length)) });
}

/**
 * The integrators `0x222f0` (`craft`, mode 0) and `0x22600` (`warp`, mode 3), which differ only in what mode 3 leaves
 * out: the impulse, the translation and the deceleration, and in the ratio's divisor.
 */
function integrate(motion: SteeredMotion, record: MotionRecord, step: MotionStep, craft: boolean): SteeredMotion {
  const { seconds: dt } = checkedStep(step);
  const { block, orientation } = motion;
  let position = motion.position;
  let impulse = block.impulse;
  if (craft && impulse !== null) {
    const { direction, magnitude } = impulse;
    const decayed = store(magnitude - dt * IMPULSE_DECAY);
    position = displace(position, direction, magnitude * dt);
    impulse = decayed < 0 ? null : { direction, magnitude: decayed };
  }
  if (craft) position = displace(position, { x: orientation[6], y: orientation[7], z: orientation[8] }, block.speed * dt);
  let { speed, atCommandedSpeed, speedRatio } = block;
  if (!atCommandedSpeed) {
    ({ speed, atCommandedSpeed } = updateSpeed(block, record, dt, craft));
    if (!craft) speedRatio = store(speed / block.commandedSpeed);
    else if (record.atB8 > 0) speedRatio = store(speed / record.atB8);
  }
  const rotated = rotate(orientation, block, speedRatio, record, step);
  return {
    position,
    orientation: rotated.orientation,
    block: { ...copyMovement(block), speed, atCommandedSpeed, speedRatio, timedRotation: rotated.timedRotation, impulse: impulse && { ...impulse } },
  };
}

/**
 * The craft integrator `0x222f0` (mode 0), in the original's order: the impulse displaces along its direction by its
 * magnitude before this step's decay and ends once the decayed magnitude is below 0; the position advances along row 3
 * by the speed before this step's update (explicit Euler); unless the commanded speed was reached, the speed moves
 * toward it and, when the record's +0xB8 is positive, the ratio follows; then the rotations. The maximum speed is never
 * read: a speed above it falls at +0xC0 like any other.
 */
export function integrateCraft(motion: SteeredMotion, record: MotionRecord, step: MotionStep): SteeredMotion {
  return integrate(motion, record, step, true);
}

/**
 * The Warp integrator `0x22600` (mode 3): no translation and no impulse, which stays as it is; unless the commanded
 * speed was reached, only the accelerating half of the speed update, and the ratio is f32(speed ÷ commanded speed)
 * without a positivity test, so a zero commanded speed is a fault (the original's unmasked divide by zero); then the
 * rotations of mode 0.
 */
export function integrateWarp(motion: SteeredMotion, record: MotionRecord, step: MotionStep): SteeredMotion {
  return integrate(motion, record, step, false);
}
