/**
 * Control rules of P3-06 (docs/plan/p3/06/spec.md, 操纵 and 速度与油门; docs/original/formats/executable.md, flight
 * controls and rotation and throttle, maximum speed and speed matching, P3-06/02 and 03): the project axes as a digital
 * stick, the Medium sensitivity table, the throttle readback `0x21ca8` and the throttle keys, and the two control paths:
 * the integer path `0x21dd0` (message 0x20000, the player's) and the float path `0x21fd8` (message 0x40000, AI
 * steering; P3-07's missiles and kind 0x4000 call it directly). The lowering of the commanded speed after a recomputed
 * maximum (`0x21d88`) is applyRecomputedMaximum in flight-state.ts.
 *
 * Both control paths change the movement block they are given in place, draw from the RandSource they are given and
 * read nothing else; the callers (systems/flight-control.ts, P3-07, P3-08) own the request and the world's RNG. The
 * table and the scalar constants are code rules (spec 技术决定 11). Numbers follow the original's write-back points:
 * every arithmetic step is a JavaScript double operation, every f32 store is `Math.fround`, and a store that is not
 * finite is a fault, as the original unmasks the overflow exception.
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { CoreFaultError } from '../errors.ts';
import { ROTATION_AXES, type Disturbance, type RotationAxis, type SteeredMovementBlock } from '../world/entity-table.ts';
import { isFiniteFloat32 } from './float32.ts';
import { FULL_THROTTLE, throttleSpeed } from './flight-state.ts';
import { RAND_SCALE, type RandSource } from './original-random.ts';
import { randomDirection } from './random-direction.ts';
import { toInt32 } from './record-defaults.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `flight-control.${site}`);

/** An f32 store F(x): `Math.fround`, and a fault when the stored value is not finite. */
function store(value: number): number {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored)) throw fault('result');
  return stored;
}

/** The full deflection of the device path: a calibrated two-way axis spans −128…128 with an exact zero. */
export const FULL_DEFLECTION = 128;

const TABLE_MIDDLE = 64;
/** The step the sensitivity builder `0x57c24` accumulates for Medium, f64 1/64 (every partial sum is exact). */
const SENSITIVITY_STEP = 1 / 64;

/**
 * The sensitivity table `[0x1761e0]` at Medium, the level the slice fixes (G-10): `0x57c24(1)` builds 129 f32 entries,
 * the quadratic x² for x = k/64 outward from the middle and odd about it. It stores each +x² before its −x², so the
 * middle entry ends as −0. A change of level changes the rules version.
 */
export const SENSITIVITY_TABLE: readonly number[] = (() => {
  const table = new Array<number>(2 * TABLE_MIDDLE + 1);
  let x = 0;
  for (let step = 0; step <= TABLE_MIDDLE; step++) {
    const value = Math.fround(x * x);
    table[TABLE_MIDDLE + step] = value;
    table[TABLE_MIDDLE - step] = -value;
    x += SENSITIVITY_STEP;
  }
  return Object.freeze(table);
})();

/**
 * A project axis value (−1…1) as an integer deflection of the original's digital stick (checkpoint A): truncated
 * toward zero from value × 128 in double precision, so ±1 is full deflection, 0 switches the axis off, and a non-zero
 * value below one step also gives 0. The result is symmetric in sign and never −0.
 */
export function axisDeflection(value: number): number {
  return Math.trunc(value * FULL_DEFLECTION) + 0;
}

/** The f32 constant `0x17005c` the readback scales the commanded-speed ratio by. */
const READBACK_SCALE = 128;

/**
 * The throttle readback `0x21ca8` that `+` and `−` step from: trunc(commanded speed ÷ maximum speed × 128), the quotient
 * in double precision; 0 without a block (`commandedSpeed` null) or unless the maximum is positive. After a match the
 * commanded speed is arbitrary, so the readback is the matched ratio. A result beyond i32 is a fault, as the original's
 * conversion raises its unmasked invalid-operation exception there.
 */
export function throttleReadback(commandedSpeed: number | null, maximumSpeed: number): number {
  if (commandedSpeed === null || !(maximumSpeed > 0)) return 0;
  const throttle = Math.trunc((commandedSpeed / maximumSpeed) * READBACK_SCALE) + 0;
  if (toInt32(throttle) !== throttle) throw fault('readback');
  return throttle;
}

/** The fixed step of `+` and `−`. */
export const THROTTLE_STEP = 12;
/** The step between the presets Shift+1 … Shift+9. */
const PRESET_STEP = 14;

/** `+` (or `=`): the readback plus the step, at most full throttle. */
export function increasedThrottle(readback: number): number {
  return Math.min(readback + THROTTLE_STEP, FULL_THROTTLE);
}

/** `−`: the readback minus the step, at least 0; a readback above full throttle stays above it (the table clamps it). */
export function decreasedThrottle(readback: number): number {
  return Math.max(readback - THROTTLE_STEP, 0);
}

/** `select-number` n, the original's Shift+n preset: 14 × (n − 1), so 1 is zero and 9 is 112 (Shift+0 is `maximum`). */
export function presetThrottle(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 9) throw fault('preset');
  return PRESET_STEP * (value - 1);
}

/** The record fields the control paths read: the craft's turn rates, which the axes scale. */
export type ControlRecord = Pick<CraftRecord, 'atAC' | 'atB0' | 'atB4'>;

/** The craft rate of each axis: +0xAC about row 1 (pitch), +0xB4 about row 2 (yaw), +0xB0 about row 3 (roll). */
const craftRate = (record: ControlRecord, axis: RotationAxis): number =>
  axis === 'pitch' ? record.atAC : axis === 'yaw' ? record.atB4 : record.atB0;

/**
 * The gate both control paths share: a block, a craft record and no lock. Otherwise the message changes nothing and
 * draws nothing.
 */
export function controlApplies(block: SteeredMovementBlock | null, record: ControlRecord | undefined): block is SteeredMovementBlock {
  return block !== null && record !== undefined && !block.locked;
}

/** Per axis: null leaves it unchanged, 0 switches it off, any other value is a deflection within ±128. */
export type AxisDeflections = { readonly [Axis in RotationAxis]: number | null };

/** The payload of message 0x20000 (`0x21dd0`): a throttle, null for unchanged, and the three axes. */
export interface IntegerControl {
  /** A safe integer; its table index is clamped into the throttle table (checkpoint A, a known difference). */
  readonly throttle: number | null;
  readonly axes: AxisDeflections;
}

/** The disturbance offset bounds of the integer path: rand % 129 − 64, so −64…64. */
const INTEGER_OFFSET_RANGE = 129;
const INTEGER_OFFSET_BIAS = 64;

/** Three draws, one offset per axis in axis order, plus the block's integer biases at level 2. */
function integerOffsets(disturbance: Disturbance, rand: RandSource): readonly [number, number, number] {
  const offsets: [number, number, number] = [0, 0, 0];
  for (let index = 0; index < offsets.length; index++) offsets[index] = (rand.next() % INTEGER_OFFSET_RANGE) - INTEGER_OFFSET_BIAS;
  if (disturbance.level === 2) for (let index = 0; index < offsets.length; index++) offsets[index] += disturbance.biases[index];
  return offsets;
}

/**
 * The integer control path `0x21dd0` on `block`, the entity's own: behind the gate (controlApplies), the disturbance's
 * three draws come first, for every accepted message (throttle-only ones included). A throttle sets the commanded speed
 * to f32(throttle-table entry × `maximumSpeed`) and clears the arrival flag. An axis at 0 clears its enable flag and
 * keeps its rate; a deflection a sets the rate f32(sensitivity entry × craft rate) at index 64 + (v >> 1), with v = −a,
 * or under a disturbance d − a clamped to ±128, and sets the flag. The arithmetic shift floors, so a = −1 gives the
 * middle entry: rate −0 with the flag set.
 */
export function applyIntegerControl(
  block: SteeredMovementBlock | null,
  record: ControlRecord | undefined,
  maximumSpeed: number,
  { throttle, axes }: IntegerControl,
  rand: RandSource,
): void {
  if (record === undefined || !controlApplies(block, record)) return;
  const offsets = block.disturbance === null ? null : integerOffsets(block.disturbance, rand);
  if (throttle !== null) {
    block.commandedSpeed = throttleSpeed(throttle, maximumSpeed);
    block.atCommandedSpeed = false;
  }
  for (let index = 0; index < ROTATION_AXES.length; index++) {
    const axis = ROTATION_AXES[index];
    const deflection = axes[axis];
    if (deflection === null) continue;
    if (!Number.isInteger(deflection) || Math.abs(deflection) > FULL_DEFLECTION) throw fault('deflection');
    const steering = block.steering[axis];
    if (deflection === 0) {
      steering.enabled = false;
      continue;
    }
    const value = offsets === null ? -deflection : Math.min(Math.max(offsets[index] - deflection, -FULL_DEFLECTION), FULL_DEFLECTION);
    steering.rate = Math.fround(SENSITIVITY_TABLE[TABLE_MIDDLE + (value >> 1)] * craftRate(record, axis));
    steering.enabled = true;
  }
}

/** Per axis of the float path: null leaves it, `'clear'` clears it, a number sets its rate from that value. */
export type FloatAxisControl = number | 'clear' | null;

/** The payload of message 0x40000 (`0x21fd8`), every number an f32. */
export interface FloatControl {
  /** s: a set rate is craft rate × (−s) × value, and a disturbed value is clamped to ±s. */
  readonly scale: number;
  readonly axes: { readonly [Axis in RotationAxis]: FloatAxisControl };
  /** Sets the commanded speed to f32(maximum speed × factor) and clears the arrival flag; null leaves it. */
  readonly speedFactor: number | null;
}

/** The f64 constants `0x170064` and `0x17006c` of the float offsets, and `0x170054` of the float biases. */
const FLOAT_OFFSET_SPAN = 0.8;
const FLOAT_OFFSET_SHIFT = -0.4;
const FLOAT_BIAS_SCALE = 1 / 127;

/**
 * The disturbance offsets of the float path, five draws: a random direction u (`0x56b8c`, two), then per axis
 * p = f32((rand × C × 0.8 − 0.4) × u_i) in double precision; at level 2 each adds the float copy of its integer bias,
 * f32(bias × 1/127), the value `0x21bd4` stores beside it.
 */
function floatOffsets(disturbance: Disturbance, rand: RandSource): readonly [number, number, number] {
  const { x, y, z } = randomDirection(rand);
  const offsets: [number, number, number] = [x, y, z];
  for (let index = 0; index < offsets.length; index++) {
    offsets[index] = Math.fround((rand.next() * RAND_SCALE * FLOAT_OFFSET_SPAN + FLOAT_OFFSET_SHIFT) * offsets[index]);
  }
  if (disturbance.level === 2) {
    for (let index = 0; index < offsets.length; index++) offsets[index] = Math.fround(offsets[index] + Math.fround(disturbance.biases[index] * FLOAT_BIAS_SCALE));
  }
  return offsets;
}

/**
 * The clamp `0x22b68`: the sum value + offset in double precision is stored as f32 first; the sum itself is compared
 * with the upper bound, the stored value with the lower one.
 */
function clampedValue(value: number, offset: number, low: number, high: number): number {
  const sum = value + offset;
  const stored = store(sum);
  if (sum > high) return high;
  return stored >= low ? stored : low;
}

const isFloat32OrNull = (value: number | 'clear' | null): boolean => value === null || value === 'clear' || isFiniteFloat32(value);

/**
 * The float control path `0x21fd8` on `block`, behind the same gate as the integer path. With a disturbance it draws
 * its five values first. Per axis, a set value writes rate = f32(craft rate × (−s) × value), or under a disturbance
 * f32(f32(craft rate × (−s)) × the value plus its offset clamped to [−s, s]), and sets the flag; the rate is linear in
 * the value, with no sensitivity table. A clear switches pitch and roll off, but clears the yaw rate instead and leaves
 * the yaw flag. A non-finite f32 result is a fault.
 */
export function applyFloatControl(
  block: SteeredMovementBlock | null,
  record: ControlRecord | undefined,
  maximumSpeed: number,
  control: FloatControl,
  rand: RandSource,
): void {
  const { scale, axes, speedFactor } = control;
  if (!isFiniteFloat32(scale) || !ROTATION_AXES.every((axis) => isFloat32OrNull(axes[axis])) || !(speedFactor === null || isFiniteFloat32(speedFactor))) {
    throw fault('float-control');
  }
  if (record === undefined || !controlApplies(block, record)) return;
  const offsets = block.disturbance === null ? null : floatOffsets(block.disturbance, rand);
  const negativeScale = -scale;
  for (let index = 0; index < ROTATION_AXES.length; index++) {
    const axis = ROTATION_AXES[index];
    const axisControl = axes[axis];
    if (axisControl === null) continue;
    const steering = block.steering[axis];
    if (axisControl === 'clear') {
      if (axis === 'yaw') steering.rate = 0;
      else steering.enabled = false;
      continue;
    }
    const rate = craftRate(record, axis);
    steering.rate = offsets === null
      ? store(rate * negativeScale * axisControl)
      : store(Math.fround(rate * negativeScale) * clampedValue(axisControl, offsets[index], negativeScale, scale));
    steering.enabled = true;
  }
  if (speedFactor !== null) {
    block.commandedSpeed = store(maximumSpeed * speedFactor);
    block.atCommandedSpeed = false;
  }
}
