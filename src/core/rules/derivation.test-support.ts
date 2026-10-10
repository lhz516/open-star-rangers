/**
 * Independent expectations for the rules tests, from the P3-02/02 derivation
 * (docs/plan/p3/02/subtasks/02-placement-numeric-research.md, 完成证据, 交给 06 的独立推导). Float32 rounding works on
 * exact rationals with BigInt, bit by bit, without Math.fround, typed arrays or any code under test. R is R_n by
 * default, the derivation's column for Core: to nearest with ties to even (goal 执行记录, Q-11 revised); chop
 * ('toward-zero') stays available to show where the two directions differ.
 */

type Float32Rounding = 'toward-zero' | 'nearest';

const bitLength = (value: bigint): number => value.toString(2).length;

/**
 * The float32 of numerator ÷ denominator (denominator > 0), rounded toward zero or to nearest with ties to even. A
 * negative value that rounds to zero gives −0. Throws at 2^128 and above, and when round-to-nearest overflows.
 */
export function float32OfRational(numerator: bigint, denominator: bigint, rounding: Float32Rounding): number {
  if (denominator <= 0n) throw new Error('denominator must be positive');
  if (numerator === 0n) return 0;
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  // e = floor(log2(magnitude ÷ denominator)).
  let exponent = bitLength(magnitude) - bitLength(denominator);
  const below = exponent >= 0 ? magnitude < denominator << BigInt(exponent) : magnitude << BigInt(-exponent) < denominator;
  if (below) exponent -= 1;
  if (exponent > 127) throw new Error('beyond the float32 range');
  // 24 significant bits for normal values; subnormals share the smallest spacing 2^−149.
  const spacingExponent = Math.max(exponent, -126) - 23;
  const scaledNumerator = spacingExponent <= 0 ? magnitude << BigInt(-spacingExponent) : magnitude;
  const scaledDenominator = spacingExponent <= 0 ? denominator : denominator << BigInt(spacingExponent);
  let significand = scaledNumerator / scaledDenominator;
  if (rounding === 'nearest') {
    const twiceRemainder = 2n * (scaledNumerator % scaledDenominator);
    if (twiceRemainder > scaledDenominator || (twiceRemainder === scaledDenominator && significand % 2n === 1n)) significand += 1n;
    if (significand === 1n << 24n && exponent === 127) throw new Error('beyond the float32 range');
  }
  const value = Number(significand) * 2 ** spacingExponent;
  return negative ? -value : value;
}

/** The exact rational value of a finite double, as numerator ÷ 2^k. */
function rationalOfDouble(value: number): { readonly numerator: bigint; readonly denominator: bigint } {
  if (!Number.isFinite(value)) throw new Error('value must be finite');
  let scaled = value;
  let power = 0n;
  // Doubling is exact for a finite double until it is an integer.
  while (!Number.isInteger(scaled)) {
    scaled *= 2;
    power += 1n;
  }
  return { numerator: BigInt(scaled), denominator: 1n << power };
}

/** The float32 of a finite double under `rounding`, through its exact rational value. */
export function float32OfDouble(value: number, rounding: Float32Rounding): number {
  const { numerator, denominator } = rationalOfDouble(value);
  const result = float32OfRational(numerator, denominator, rounding);
  return result === 0 && Object.is(value, -0) ? -0 : result;
}

/** The IEEE 754 binary32 bit pattern of a float32 value, read through a DataView. */
export function float32Bits(value: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  return view.getUint32(0);
}

const TWO_30 = 1n << 30n;

/** Rectangle axis (item 2): R(N ÷ 2^30) with N = x0 × 2^30 + |x1 − x0| × r × 32769, for integer ends. */
export function expectedRectangle(from: number, to: number, rand: number, rounding: Float32Rounding = 'nearest'): number {
  const span = BigInt(Math.abs(to - from));
  return float32OfRational(BigInt(from) * TWO_30 + span * BigInt(rand) * 32769n, TWO_30, rounding);
}

/** World default axis (item 3): W = 15000 n, h = W ÷ 2, R((W × r × 32769 − h × 2^30) ÷ 2^30). */
export function expectedWorld(sectors: number, rand: number, rounding: Float32Rounding = 'nearest'): number {
  const extent = 15000n * BigInt(sectors);
  return float32OfRational(extent * BigInt(rand) * 32769n - (extent / 2n) * TWO_30, TWO_30, rounding);
}

/**
 * The world check's move (item 6) of a point outside the inset rectangle: L = √(x² + y²) and each double step rounded
 * to nearest as JavaScript does, then dx = R((x × (1 ÷ L)) × −300) and x' = R(x + dx), likewise y.
 */
export function expectedPull(x: number, y: number, rounding: Float32Rounding = 'nearest'): { readonly x: number; readonly y: number } {
  const inverse = 1 / Math.sqrt(x * x + y * y);
  const pull = (value: number): number => float32OfDouble(value + float32OfDouble(value * inverse * -300, rounding), rounding);
  return { x: pull(x), y: pull(y) };
}
