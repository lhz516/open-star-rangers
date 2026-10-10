import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { Matrix3, MovementBlock, SteeredMovementBlock } from '../world/entity-table.ts';
import { rotateRows } from './flight-motion.ts';
import { craftMovementBlock } from './flight-state.ts';
import {
  applyGuidedLaunchSpeed, linearBlock, linearItem, offsetPosition, orthonormalFrame, scatteredRows,
} from './movement-builders.ts';
import { RAND_SCALE } from './original-random.ts';
import { scriptedRand } from './rand.test-support.ts';

// Expectations follow docs/original/formats/executable.md W7, W11 and H1 and docs/plan/p3/02/spec.md CR-03 and CR-09:
// each is worked out by hand from the stated arithmetic (f32 stores at the original's write-back points).

const f = Math.fround;
const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const matrix = (...rows: number[]) => rows as unknown as Matrix3;
const IDENTITY = matrix(1, 0, 0, 0, 1, 0, 0, 0, 1);
/** Row 1 along +y, row 2 along −x, row 3 along +z. */
const TURNED = matrix(0, 1, 0, -1, 0, 0, 0, 0, 1);

describe('the offset position of the launch constructors and the aim (W11)', () => {
  it('moves the position along rows 1, 2 and 3 by x, y and k', () => {
    expect(offsetPosition(vec(1, 2, 3), IDENTITY, 0.5, -1, 2)).toEqual(vec(1.5, 1, 5));
    // Row 1 is +y, row 2 −x: x = 0.5 moves +y, y = −1 moves +x.
    expect(offsetPosition(vec(1, 2, 3), TURNED, 0.5, -1, 2)).toEqual(vec(2, 2.5, 5));
  });

  it('stores every partial sum, so two half-ulp steps are both lost', () => {
    // 1 + 2^-24 is a tie that rounds to 1 at each store; one rounding of the sum would give 1 + 2^-23.
    const half = 2 ** -24;
    expect(offsetPosition(vec(1, 0, 0), matrix(1, 0, 0, 1, 0, 0, 0, 0, 1), half, half, 0)).toEqual(vec(1, 0, 0));
    expect(f(1 + half + half)).toBe(1 + 2 ** -23);
  });

  it('takes k in double precision: the constructors add the shooter speed times the step before the product', () => {
    // k = 0.1 (f32) + 2^-30 is not an f32; the product with row 3 is rounded once.
    const z = f(0.1);
    const k = z + 2 ** -30;
    expect(offsetPosition(vec(0, 0, 0), IDENTITY, 0, 0, k).z).toBe(f(k));
    expect(offsetPosition(vec(0, 0, 4), IDENTITY, 0, 0, k).z).toBe(f(4 + f(k)));
  });
});

describe('the frame completion 0x56d18', () => {
  it('normalises row 3, makes row 1 = row 2 × row 3 normalised and row 2 = row 3 × row 1', () => {
    expect(orthonormalFrame(matrix(9, 9, 9, 0, 1, 0, 0, 0, 2))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    // Row 3 (3, 0, 4) becomes (f(0.6), 0, f(0.8)) (length 5); row 1 = (0, 1, 0) × row 3 = (f(0.8), 0, −f(0.6)), whose f32
    // length rounds to 1; row 2 = row 3 × row 1 has y = f(0.8)² + f(0.6)², which rounds to 1.
    const [x1, y1, z1, x2, y2, z2, x3, y3, z3] = orthonormalFrame(matrix(5, 5, 5, 0, 1, 0, 3, 0, 4));
    expect([x1, y1, z1, x2, y2, z2, x3, y3, z3].map((value) => value + 0)).toEqual([f(0.8), 0, -f(0.6), 0, 1, 0, f(0.6), 0, f(0.8)]);
  });

  it('builds row 1 from the old row 2, not from row 1', () => {
    // Row 2 (0, 0, 1) and row 3 (1, 0, 0): row 1 = (0, 1, 0) whatever the old row 1; row 2 = (1, 0, 0) × (0, 1, 0).
    expect(orthonormalFrame(matrix(1, 0, 0, 0, 0, 1, 1, 0, 0)).map((value) => value + 0)).toEqual([0, 1, 0, 0, 0, 1, 1, 0, 0]);
  });
});

describe('0x218e8 mode 1 and 0x21794 mode 1 (CR-03)', () => {
  const steered = craftMovementBlock(0x80, 48, 96);

  it('makes the item of a source from its pose and its block\'s speed', () => {
    expect(linearItem(vec(1, 2, 3), TURNED, steered)).toEqual({ position: vec(1, 2, 3), orientation: TURNED, speed: 48 });
    const linear: MovementBlock = { mode: 'linear', speed: 7, velocity: vec(0, 0, 7), previousPosition: vec(0, 0, 0), hitTest: false };
    expect(linearItem(vec(0, 0, 0), IDENTITY, linear).speed).toBe(7);
  });

  it('takes a spinning source\'s velocity as row 3 and completes the frame from its row 2', () => {
    const spinning: MovementBlock = { mode: 'spinning', speed: 5, velocity: vec(0, 0, 5), spin: 0.1, spinAxis: 1 };
    const item = linearItem(vec(1, 1, 1), matrix(0, 0, 1, 0, 1, 0, -1, 0, 0), spinning);
    expect(item.orientation).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(item.speed).toBe(5);
  });

  it('builds a linear block whose velocity is F(row 3 × speed) and whose last position is the item\'s', () => {
    const position = vec(4, 5, 6);
    expect(linearBlock({ position, orientation: matrix(1, 0, 0, 0, 1, 0, f(0.6), 0, f(0.8)), speed: 3 }, true)).toEqual({
      mode: 'linear', speed: 3, velocity: vec(f(f(0.6) * 3), 0, f(f(0.8) * 3)), previousPosition: position, hitTest: true,
    });
    expect(linearBlock({ position, orientation: TURNED, speed: 2 }, false)).toMatchObject({ velocity: vec(0, 0, 2), hitTest: false });
  });
});

describe('the guided launch speed 0x21a3c (W11, CR-09)', () => {
  const guided = (): SteeredMovementBlock => craftMovementBlock(0, 40, 80);

  it.each([
    ['below the shooter\'s speed: the missile\'s maximum', 40, 50, 40],
    ['equal: the shooter\'s', 40, 40, 40],
    ['above the shooter\'s speed: the shooter\'s', 40, 30, 30],
  ])('sets speed and commanded speed from the smaller, %s', (_, maximum, shooter, speed) => {
    const block = guided();
    expect(block.speed).toBe(0);
    applyGuidedLaunchSpeed(block, maximum, shooter, 80);
    expect(block).toMatchObject({ speed, commandedSpeed: speed, atCommandedSpeed: true, speedRatio: f(speed / 80) });
  });

  it('copies the shooter\'s speed without rounding and gives a ratio of 0 without a positive base', () => {
    const block = guided();
    applyGuidedLaunchSpeed(block, 40, f(1 / 3), 0);
    expect(block).toMatchObject({ speed: f(1 / 3), commandedSpeed: f(1 / 3), speedRatio: 0 });
  });
});

describe('the scatter of a missile with +0x20 ≠ 0 (W11, W12)', () => {
  const roll = (rand: number) => f(rand * RAND_SCALE * 1.57079635 - 0.785398175);
  const turn = (rand: number) => f(rand * RAND_SCALE * 0.03490658555555556 - 0.01745329277777778);

  it('rolls, then turns about row 2 on an odd coin and about row 1 on an even one, three draws', () => {
    for (const [coin, axis] of [[1, 'yaw'], [2, 'pitch']] as const) {
      const rand = scriptedRand([0, coin, 32767]);
      const rows = scatteredRows(TURNED, rand);
      expect(rand.used).toBe(3);
      expect(rows).toEqual(rotateRows(rotateRows(TURNED, 'roll', roll(0)), axis, turn(32767)));
    }
  });

  it('spans about ±45° of roll and ±1° of turn', () => {
    expect(roll(0)).toBe(f(-0.785398175));
    expect(roll(32767)).toBeCloseTo(0.785398, 6);
    expect(turn(0)).toBe(f(-0.01745329277777778));
    expect(turn(32767)).toBeCloseTo(0.0174533, 6);
  });
});
