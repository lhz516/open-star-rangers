/**
 * An independent reference for one frame of the steered movement modes, for flight-motion and movement tests. It
 * follows the operation order and rounding points of docs/original/formats/executable.md (movement stage and
 * integration, numbers on the movement path, P3-06/01) and evaluates them on exact rationals with BigInt: every
 * double-precision step rounds the exact result to 53 significant bits, every f32 store to f32 (float32OfRational),
 * and FSIN/FCOS of an f32 angle round a 320-bit Taylor sum to 64 bits before the f32 store, as x87 does. It uses no
 * JavaScript floating-point arithmetic, Math.fround or code under test; JavaScript numbers only carry the rounded values
 * between steps. Zero results take their IEEE sign (round to nearest), so the outputs compare bit for bit.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import type { Matrix3, RotationAxis, SteeredMovementBlock, TimedRotation } from '../world/entity-table.ts';
import { float32OfRational, rationalOfDouble } from './derivation.test-support.ts';
import type { MotionRecord, MotionStep, SteeredMotion } from './flight-motion.ts';

/** An exact value: n ÷ d with d > 0; `negative` gives the sign of a zero. */
interface Exact {
  readonly n: bigint;
  readonly d: bigint;
  readonly negative: boolean;
}

const isNegative = (value: number): boolean => value < 0 || Object.is(value, -0);

function exact(value: number): Exact {
  const { numerator, denominator } = rationalOfDouble(value);
  return { n: numerator, d: denominator, negative: isNegative(value) };
}

const sign = (value: Exact): boolean => (value.n === 0n ? value.negative : value.n < 0n);

function product(left: number, right: number): Exact {
  const a = exact(left);
  const b = exact(right);
  return { n: a.n * b.n, d: a.d * b.d, negative: sign(a) !== sign(b) };
}

function quotient(left: number, right: number): Exact {
  const a = exact(left);
  const b = exact(right);
  if (b.n === 0n) throw new Error('division by zero');
  const n = a.n * b.d;
  const d = a.d * b.n;
  return d < 0n ? { n: -n, d: -d, negative: sign(a) !== sign(b) } : { n, d, negative: sign(a) !== sign(b) };
}

/** left + right, or left − right; an exact zero is −0 only when both terms are −0 (round to nearest). */
function sum(left: number, right: number, subtract = false): Exact {
  const a = exact(left);
  const b = exact(right);
  const bNegative = subtract ? !sign(b) : sign(b);
  return { n: subtract ? a.n * b.d - b.n * a.d : a.n * b.d + b.n * a.d, d: a.d * b.d, negative: sign(a) && bNegative };
}

const bitLength = (value: bigint): number => value.toString(2).length;

/** The value rounded to nearest, ties to even, at `bits` significant bits without exponent limits: m × 2^e. */
function roundSignificand({ n, d }: Exact, bits: number): { readonly significand: bigint; readonly exponent: number } {
  const magnitude = n < 0n ? -n : n;
  let exponent = bitLength(magnitude) - bitLength(d);
  const below = exponent >= 0 ? magnitude < d << BigInt(exponent) : magnitude << BigInt(-exponent) < d;
  if (below) exponent -= 1;
  const spacing = exponent - bits + 1;
  const numerator = spacing <= 0 ? magnitude << BigInt(-spacing) : magnitude;
  const denominator = spacing <= 0 ? d : d << BigInt(spacing);
  let significand = numerator / denominator;
  const twiceRemainder = 2n * (numerator % denominator);
  if (twiceRemainder > denominator || (twiceRemainder === denominator && significand % 2n === 1n)) significand += 1n;
  return { significand: n < 0n ? -significand : significand, exponent: spacing };
}

/** D(x): the x87 result at the double precision control. */
function D(value: Exact): number {
  if (value.n === 0n) return value.negative ? -0 : 0;
  const { significand, exponent } = roundSignificand(value, 53);
  return Number(significand) * 2 ** exponent;
}

/** F(x): an f32 store. */
function F(value: Exact | number): number {
  const rational = typeof value === 'number' ? exact(value) : value;
  if (rational.n === 0n) return rational.negative ? -0 : 0;
  return float32OfRational(rational.n, rational.d, 'nearest');
}

/** X(x): an FSIN or FCOS result, 64 significant bits, as an exact value. */
function X(value: Exact): Exact {
  if (value.n === 0n) return value;
  const { significand, exponent } = roundSignificand(value, 64);
  return exponent >= 0
    ? { n: significand << BigInt(exponent), d: 1n, negative: significand < 0n }
    : { n: significand, d: 1n << BigInt(-exponent), negative: significand < 0n };
}

const SCALE_BITS = 320n;
const SCALE = 1n << SCALE_BITS;

/** sin and cos of a dyadic angle (|θ| ≤ 4) by their Taylor series in 320-bit fixed point. */
function sinCos(angle: number): { readonly sin: Exact; readonly cos: Exact } {
  if (Math.abs(angle) > 4) throw new Error('angle outside the reference domain');
  const { numerator, denominator } = rationalOfDouble(angle);
  const x = (numerator * SCALE) / denominator;
  let sinSum = 0n;
  let cosSum = 0n;
  let sinTerm = x;
  let cosTerm = SCALE;
  for (let k = 0n; sinTerm !== 0n || cosTerm !== 0n; k++) {
    sinSum += sinTerm;
    cosSum += cosTerm;
    sinTerm = (-sinTerm * x * x) / ((2n * k + 2n) * (2n * k + 3n) * SCALE * SCALE);
    cosTerm = (-cosTerm * x * x) / ((2n * k + 1n) * (2n * k + 2n) * SCALE * SCALE);
  }
  return { sin: { n: sinSum, d: SCALE, negative: isNegative(angle) }, cos: { n: cosSum, d: SCALE, negative: false } };
}

const ROWS: Readonly<Record<RotationAxis, readonly [number, number]>> = { pitch: [1, 2], yaw: [0, 2], roll: [0, 1] };

/** The rotation helper about `axis`: c = F(X(cos θ)), s = F(X(sin θ)); a′ = F(D(D(a·c) + D(b·s))), b′ = F(D(D(b·c) − D(a·s))). */
export function referenceRotation(rows: readonly number[], axis: RotationAxis, angle: number): number[] {
  const { sin, cos } = sinCos(angle);
  const c = F(X(cos));
  const s = F(X(sin));
  const [a, b] = ROWS[axis];
  const result = [...rows];
  for (let i = 0; i < 3; i++) {
    const first = rows[3 * a + i];
    const second = rows[3 * b + i];
    result[3 * a + i] = F(sum(D(product(first, c)), D(product(second, s))));
    result[3 * b + i] = F(sum(D(product(second, c)), D(product(first, s)), true));
  }
  return result;
}

/**
 * One frame of `0x222f0` (mode 0, a `craft` block) or `0x22600` (mode 3, a `warp` block) from `motion`, in the
 * documented order; it does not check domains. The result has the shape of the integrators' so that it compares with
 * toEqual.
 */
export function referenceFrame(motion: SteeredMotion, record: MotionRecord, { seconds: dt, time: t }: MotionStep): SteeredMotion {
  const { block } = motion;
  const mode = block.mode === 'craft' ? 0 : 3;
  let position = [motion.position.x, motion.position.y, motion.position.z];
  let rows = [...motion.orientation];
  let impulse = block.impulse && { direction: block.impulse.direction, magnitude: block.impulse.magnitude };
  if (mode === 0 && impulse !== null) {
    const { direction, magnitude } = impulse;
    const a = D(product(magnitude, dt));
    const components = [direction.x, direction.y, direction.z].map((component) => F(D(product(component, a))));
    const decayed = F(sum(magnitude, D(product(dt, 30)), true));
    impulse = decayed < 0 ? null : { direction, magnitude: decayed };
    position = position.map((value, i) => F(sum(value, components[i])));
  }
  if (mode === 0) {
    const s = D(product(block.speed, dt));
    const components = [rows[6], rows[7], rows[8]].map((component) => F(D(product(component, s))));
    position = position.map((value, i) => F(sum(value, components[i])));
  }
  let { speed, atCommandedSpeed: arrived, speedRatio: ratio } = block;
  const target = block.commandedSpeed;
  if (!arrived) {
    const difference = D(sum(target, speed, true));
    if (difference > 0) {
      const v = D(sum(D(product(record.atBC, dt)), speed));
      speed = F(v);
      if (v > target) [arrived, speed] = [true, target];
    } else if (mode === 0) {
      const v = D(sum(speed, D(product(record.atC0, dt)), true));
      speed = F(v);
      if (v < target) [arrived, speed] = [true, target];
    }
    if (mode === 3) ratio = F(D(quotient(speed, target)));
    else if (record.atB8 > 0) ratio = F(D(quotient(speed, record.atB8)));
  }
  const f = record.atC8 !== 0 ? dt : F(D(product(ratio, dt)));
  const timedRotation: Record<RotationAxis, TimedRotation | null> = { pitch: null, yaw: null, roll: null };
  for (const axis of ['pitch', 'yaw', 'roll'] as const) {
    const timed = block.timedRotation[axis];
    const steady = block.steering[axis];
    if (timed !== null) {
      const rate = steady.enabled ? F(sum(timed.rate, steady.rate)) : timed.rate;
      rows = referenceRotation(rows, axis, F(D(product(rate, f))));
      const decayedRate = F(sum(timed.rate, D(product(timed.decay, dt)), true));
      timedRotation[axis] = t > timed.end ? null : { rate: decayedRate, decay: timed.decay, end: timed.end };
    } else if (axis === 'roll' && record.atC4 !== 0 && block.steering.yaw.enabled) {
      const yawTimesRatio = D(product(block.steering.yaw.rate, ratio));
      const base = steady.enabled ? F(sum(yawTimesRatio, steady.rate)) : F(yawTimesRatio);
      rows = referenceRotation(rows, axis, F(D(product(base, f))));
    } else if (steady.enabled) {
      rows = referenceRotation(rows, axis, F(D(product(steady.rate, f))));
    }
  }
  const [x, y, z] = position;
  const nextBlock: SteeredMovementBlock = { ...block, speed, atCommandedSpeed: arrived, speedRatio: ratio, timedRotation, impulse };
  return { position: { x, y, z } satisfies Vec3, orientation: rows as unknown as Matrix3, block: nextBlock };
}
