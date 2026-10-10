import { describe, expect, it } from 'vitest';
import type { DeclarationOrigin, MissionCoordinates, StrategicMapFrame, Vector3 } from '../../content/logic/logic-content.ts';
import { CoreInputError } from '../errors.ts';
import { COORDINATE_LIMIT, MAX_WORLD_SECTORS, runtimeFrame, runtimePosition, runtimeRegion, runtimeVector } from './coordinates.ts';
import { float32OfRational } from './derivation.test-support.ts';

// Expectations follow the Q-03 derivation (02 完成证据, item 1): q = R(15000 ÷ s), p' = R(p × q), v' = trunc(v × q),
// X = 7500 × n with n = 2 × halfExtent ÷ s; R is R_n, to nearest with ties to even (goal 执行记录, Q-11 revised).

const coordinates = (referenceScale: number): MissionCoordinates => ({ unit: 'scen-reference', referenceScale, layoutUnit: 'scen-runtime' });
const sliceFrame = (halfExtent: number): StrategicMapFrame => ({ rightAxis: '+x', upAxis: '-y', center: { right: 0, up: 0 }, halfExtent });
const frameOf = (referenceScale: number, halfExtent: number) => runtimeFrame({ coordinates: coordinates(referenceScale), mapFrame: sliceFrame(halfExtent) }, 'mission');

function inputError(run: () => unknown): CoreInputError {
  try {
    run();
  } catch (error) {
    if (error instanceof CoreInputError) return error;
    throw error;
  }
  throw new Error('expected a CoreInputError');
}

describe('runtime frame (Q-03 scale, world rectangle)', () => {
  it('derives q and the world from the slice reference scale 8000', () => {
    // Six sectors of 8000 reference units: halfExtent 24000; q = 15000 ÷ 8000 = 1.875 exactly.
    const frame = frameOf(8000, 24000);
    expect(frame).toEqual({ sectors: 6, scaleFactor: 1.875 });
    expect(Object.isFrozen(frame)).toBe(true);
    // The synthetic logic content: 1250 per sector, halfExtent 3750 → 6 sectors, q = 12.
    expect(frameOf(1250, 3750)).toEqual({ sectors: 6, scaleFactor: 12 });
    expect(frameOf(8000, 4000)).toEqual({ sectors: 1, scaleFactor: 1.875 });
    expect(frameOf(8000, 559 * 4000)).toEqual({ sectors: 559, scaleFactor: 1.875 });
  });

  it('rounds the factor to nearest where chop would stay below', () => {
    // 15000 ÷ 11000 = 15/11 = 11439010.909… × 2^-23: nearest takes 11439011, chop would keep 11439010.
    const nearest = float32OfRational(15n, 11n, 'nearest');
    expect(nearest).toBe(11439011 * 2 ** -23);
    expect(frameOf(11000, 11000).scaleFactor).toBe(nearest);
    expect(nearest).not.toBe(float32OfRational(15n, 11n, 'toward-zero'));
    // 15000 ÷ 7000 = 15/7: both directions agree.
    expect(frameOf(7000, 7000).scaleFactor).toBe(float32OfRational(15n, 7n, 'nearest'));
    expect(float32OfRational(15n, 7n, 'toward-zero')).toBe(float32OfRational(15n, 7n, 'nearest'));
  });

  it.each([
    ['a non-float32 scale', 0.1],
    ['a zero scale', 0],
    ['a negative scale', -8000],
    ['an infinite scale', Number.POSITIVE_INFINITY],
    ['NaN', Number.NaN],
    ['a scale whose factor exceeds float32', 2 ** -116],
  ])('rejects %s', (_, referenceScale) => {
    const error = inputError(() => frameOf(referenceScale, 24000));
    expect(error.path).toBe('mission.coordinates.referenceScale');
    expect(error.reason).toBe('must be a positive float32 whose runtime factor is a finite float32');
  });

  it.each([
    ['rightAxis', { ...sliceFrame(24000), rightAxis: '-x' }, 'must be +x'],
    ['upAxis', { ...sliceFrame(24000), upAxis: '+y' }, 'must be -y'],
    ['center', { ...sliceFrame(24000), center: { right: 1, up: 0 } }, 'must be the origin'],
    ['center', { ...sliceFrame(24000), center: { right: 0, up: -8000 } }, 'must be the origin'],
    ['halfExtent', sliceFrame(25000), 'must span a whole number of sectors from 1 to 559'],
    ['halfExtent', sliceFrame(2000), 'must span a whole number of sectors from 1 to 559'],
    ['halfExtent', sliceFrame((MAX_WORLD_SECTORS + 1) * 4000), 'must span a whole number of sectors from 1 to 559'],
  ] as const)('accepts only the slice map frame: rejects %s', (field, mapFrame, reason) => {
    const error = inputError(() => runtimeFrame({ coordinates: coordinates(8000), mapFrame: mapFrame as StrategicMapFrame }, 'mission'));
    expect(error.path).toBe(`mission.mapFrame.${field}`);
    expect(error.reason).toBe(reason);
    expect(error.message).not.toMatch(/8000|25000|2000/);
  });
});

describe('runtime positions (Q-03: object records once, others never)', () => {
  const declaration = (origins: readonly DeclarationOrigin[], position: Vector3) => ({ origins, position });

  it('converts a record with origin object once, also when groups reference it', () => {
    const position = { x: 1000, y: -2000, z: 0.5 };
    const converted = { x: 1875, y: -3750, z: 0.9375 };
    expect(runtimePosition(declaration(['object'], position), 1.875, 'd')).toEqual(converted);
    expect(runtimePosition(declaration(['object', 'group-template', 'group-member'], position), 1.875, 'd')).toEqual(converted);
    expect(Object.isFrozen(runtimePosition(declaration(['object'], position), 1.875, 'd'))).toBe(true);
  });

  it.each([[['group-template']], [['group-member']], [['group-template', 'group-member']], [['wingman-option']]] as const)(
    'keeps the runtime units of a %j record',
    (origins) => {
      const position = { x: 1000, y: -2000.5, z: 0.5 };
      expect(runtimePosition(declaration(origins, position), 1.875, 'd')).toEqual(position);
    },
  );

  it('rounds the product to nearest, ties to even', () => {
    // (1 + 2^-23) × 15/8 = 15/8 + 15 × 2^-26 = 15/8 + 1.875 ulp: nearest adds two ulps, chop would add one.
    const p = 1 + 2 ** -23;
    const expected = float32OfRational(15n * ((1n << 23n) + 1n), 8n << 23n, 'nearest');
    expect(expected).toBe(1.875 + 2 ** -22);
    expect(float32OfRational(15n * ((1n << 23n) + 1n), 8n << 23n, 'toward-zero')).toBe(1.875 + 2 ** -23);
    expect(runtimePosition(declaration(['object'], { x: p, y: -p, z: 0 }), 1.875, 'd')).toEqual({ x: expected, y: -expected, z: 0 });
    // (1 + 2^-23) × 3/2 = 3/2 + 1.5 ulp, a tie between the odd 3/2 + 1 ulp and the even 3/2 + 2 ulps.
    const tie = float32OfRational(3n * ((1n << 23n) + 1n), 1n << 24n, 'nearest');
    expect(tie).toBe(1.5 + 2 ** -22);
    expect(runtimePosition(declaration(['object'], { x: -p, y: 0, z: p }), 1.5, 'd')).toEqual({ x: -tie, y: 0, z: tie });
  });

  it('checks the coordinate range after rounding to nearest', () => {
    // (2^22 − 0.5) × (1 + 2^-23) = 2^22 − 2^-24 rounds up to 2^22, outside the range; chop would keep 2^22 − 0.25.
    const q = 1 + 2 ** -23;
    expect(float32OfRational((1n << 46n) - 1n, 1n << 24n, 'nearest')).toBe(COORDINATE_LIMIT);
    expect(float32OfRational((1n << 46n) - 1n, 1n << 24n, 'toward-zero')).toBe(COORDINATE_LIMIT - 0.25);
    expect(inputError(() => runtimePosition(declaration(['object'], { x: 0, y: COORDINATE_LIMIT - 0.5, z: 0 }), q, 'd'))).toMatchObject({
      path: 'd.position.y',
      reason: 'is outside the supported coordinate range in runtime units',
    });
    // (2^22 − 0.75) × (1 + 2^-23) = 2^22 − 0.25 − 0.75 × 2^-23 rounds to 2^22 − 0.25, inside.
    expect(float32OfRational(((1n << 24n) - 3n) * ((1n << 23n) + 1n), 1n << 25n, 'nearest')).toBe(COORDINATE_LIMIT - 0.25);
    expect(runtimePosition(declaration(['object'], { x: 0, y: COORDINATE_LIMIT - 0.75, z: 0 }), q, 'd').y).toBe(COORDINATE_LIMIT - 0.25);
  });

  it('rejects positions outside the float32 domain or the coordinate range', () => {
    expect(inputError(() => runtimePosition(declaration(['object'], { x: 0, y: 0.1, z: 0 }), 1.875, 'd[2]'))).toMatchObject({
      path: 'd[2].position.y',
      reason: 'must be a float32 value',
    });
    // 2^21 × 1.875 = 3,932,160 is inside; 2^22 ÷ 1.875 rounded up to a float32 is not.
    expect(runtimePosition(declaration(['object'], { x: 2 ** 21, y: 0, z: 0 }), 1.875, 'd').x).toBe(3_932_160);
    expect(inputError(() => runtimePosition(declaration(['object'], { x: 0, y: 0, z: -2_300_000 }), 1.875, 'd'))).toMatchObject({
      path: 'd.position.z',
      reason: 'is outside the supported coordinate range in runtime units',
    });
    expect(inputError(() => runtimePosition(declaration(['wingman-option'], { x: COORDINATE_LIMIT, y: 0, z: 0 }), 1.875, 'w'))).toMatchObject({
      path: 'w.position.x',
    });
    expect(inputError(() => runtimePosition(declaration(['group-member'], { x: 0, y: 0, z: 0.1 }), 1.875, 'm')).path).toBe('m.position.z');
  });
});

describe('runtime regions (Q-03: i32 truncation toward zero)', () => {
  it('truncates each value toward zero', () => {
    // 15v ÷ 8: 1 → 1.875 → 1; −1 → −1.875 → −1; 3 → 5.625 → 5; multiples of 8 are exact.
    expect(runtimeRegion({ x0: 1, y0: -1, x1: 3, y1: -3 }, 1.875, 'r')).toEqual({ x0: 1, y0: -1, x1: 5, y1: -5 });
    expect(runtimeRegion({ x0: -24000, y0: -8000, x1: 24000, y1: 0 }, 1.875, 'r')).toEqual({ x0: -45000, y0: -15000, x1: 45000, y1: 0 });
    // q = 0.5: −1 → −0.5 truncates to −0, stored as the integer 0.
    const half = runtimeRegion({ x0: -1, y0: 1, x1: 0, y1: 0 }, 0.5, 'r');
    expect(Object.is(half.x0, 0)).toBe(true);
    expect(half.y0).toBe(0);
    expect(Object.isFrozen(half)).toBe(true);
  });

  it('rejects values whose product is not exact or whose result leaves the coordinate range', () => {
    expect(inputError(() => runtimeRegion({ x0: 2 ** 29, y0: 0, x1: 0, y1: 0 }, 2 ** -10, 'r'))).toMatchObject({
      path: 'r.x0',
      reason: 'is outside the supported coordinate range in runtime units',
    });
    expect(runtimeRegion({ x0: 2 ** 29 - 1, y0: 0, x1: 0, y1: 0 }, 2 ** -10, 'r').x0).toBe(2 ** 19 - 1);
    expect(inputError(() => runtimeRegion({ x0: 0, y0: 0, x1: 0, y1: 2_236_963 }, 1.875, 'r')).path).toBe('r.y1');
    expect(runtimeRegion({ x0: 0, y0: 0, x1: 0, y1: 2_236_962 }, 1.875, 'r').y1).toBe(4_194_303);
  });

  it('rejects reversed ends whose span from x0 (y0) leaves the coordinate range', () => {
    // The span runs from x0 upwards by |x1 − x0|: 2^21 + 2^21 reaches 2^22, one less stays inside.
    expect(inputError(() => runtimeRegion({ x0: 2 ** 21, y0: 0, x1: 0, y1: 0 }, 1, 'r'))).toMatchObject({
      path: 'r.x1',
      reason: 'is outside the supported coordinate range in runtime units',
    });
    expect(runtimeRegion({ x0: 2 ** 21, y0: 0, x1: 1, y1: 0 }, 1, 'r').x1).toBe(1);
    expect(inputError(() => runtimeRegion({ x0: 0, y0: 4_194_303, x1: 0, y1: -3_276_782 }, 1, 'r')).path).toBe('r.y1');
    expect(runtimeRegion({ x0: 100, y0: 0, x1: -100, y1: 0 }, 1, 'r')).toEqual({ x0: 100, y0: 0, x1: -100, y1: 0 });
  });
});

describe('runtime vectors (layout offsets are not transformed)', () => {
  it('returns float32 runtime vectors unchanged and rejects others', () => {
    expect(runtimeVector({ x: 0, y: 5, z: -5 }, 'layout[0]')).toEqual({ x: 0, y: 5, z: -5 });
    expect(runtimeVector({ x: -4194303.5, y: 0, z: 0 }, 'l').x).toBe(-4194303.5);
    expect(inputError(() => runtimeVector({ x: 0, y: 0, z: 1 / 3 }, 'layout[1]'))).toMatchObject({ path: 'layout[1].z', reason: 'must be a float32 value' });
    expect(inputError(() => runtimeVector({ x: 0, y: -COORDINATE_LIMIT, z: 0 }, 'l')).path).toBe('l.y');
  });
});
