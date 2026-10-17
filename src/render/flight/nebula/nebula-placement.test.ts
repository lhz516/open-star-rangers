import { describe, expect, it } from 'vitest';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import { NEBULA_SLOTS, NEBULA_VISIBILITY, nebulaPlacement } from './nebula-placement.ts';
import { cameraRows, pitch, yaw, type Vec } from './nebula.test-support.ts';

// Synthetic camera rows only (NB1, NB3).

const IDENTITY = cameraRows([0, 1, 0], [0, 0, 1]);

const visible = (camera: Matrix3) => NEBULA_SLOTS.map((_, slot) => nebulaPlacement(camera, slot)).filter((placement) => placement !== null);

/** A seeded uniform rotation (unit quaternion) as rows. */
function randomRows(seed: number): Matrix3 {
  let state = seed;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const [u1, u2, u3] = [next(), next(), next()];
  const [x, y, z, w] = [
    Math.sqrt(1 - u1) * Math.sin(2 * Math.PI * u2), Math.sqrt(1 - u1) * Math.cos(2 * Math.PI * u2),
    Math.sqrt(u1) * Math.sin(2 * Math.PI * u3), Math.sqrt(u1) * Math.cos(2 * Math.PI * u3),
  ];
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ] as unknown as Matrix3;
}

describe('nebula slots', () => {
  it('hold the six world-fixed directions with B and C 0.05 to either side, as f32', () => {
    const offset = Math.fround(0.05);
    expect(NEBULA_SLOTS.map(({ a }) => a)).toEqual([[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]]);
    expect(NEBULA_SLOTS[0]).toEqual({ a: [0, 0, 1], b: [-offset, 0, 1], c: [offset, 0, 1] });
    expect(NEBULA_SLOTS[2]).toEqual({ a: [0, 1, 0], b: [offset, 1, 0], c: [-offset, 1, 0] });
    expect(NEBULA_SLOTS[5]).toEqual({ a: [-1, 0, 0], b: [-1, 0, offset], c: [-1, 0, -offset] });
  });
});

describe('nebula placement', () => {
  it('centres slot 0 on column 320 and row 240 under the identity, C → B pointing left (θ = π), and hides the others', () => {
    expect(nebulaPlacement(IDENTITY, 0)).toEqual({ slot: 0, sx: 320, sy: 240, angle: Math.fround(Math.PI) });
    expect(visible(IDENTITY)).toHaveLength(1);
  });

  it('centres each slot when the view axis points along its direction, with the screen direction of C → B of NB1', () => {
    // The world direction of C → B for each slot, and an up vector for the camera that looks along the slot.
    const cases: readonly [number, Vec, Vec][] = [
      [0, [0, 1, 0], [0, 0, 1]], [1, [0, 1, 0], [0, 0, -1]], [2, [0, 0, 1], [0, 1, 0]],
      [3, [0, 0, 1], [0, -1, 0]], [4, [0, 1, 0], [1, 0, 0]], [5, [0, 1, 0], [-1, 0, 0]],
    ];
    const towards: Readonly<Record<number, Vec>> = { 0: [-1, 0, 0], 1: [-1, 0, 0], 2: [1, 0, 0], 3: [-1, 0, 0], 4: [0, 0, -1], 5: [0, 0, 1] };
    for (const [slot, up, dir] of cases) {
      const camera = cameraRows(up, dir);
      const placement = nebulaPlacement(camera, slot)!;
      expect(placement).toMatchObject({ slot, sx: 320, sy: 240 });
      expect(visible(camera).map(({ slot: shown }) => shown)).toEqual([slot]);
      // θ is the screen direction (x right, y up) of the world direction C → B: R0 and R1 of it.
      const world = towards[slot];
      const screen = [0, 1].map((row) => camera[row * 3] * world[0] + camera[row * 3 + 1] * world[1] + camera[row * 3 + 2] * world[2]);
      expect(placement.angle).toBeCloseTo(Math.atan2(screen[1], screen[0]), 5);
    }
  });

  it('draws a slot while its direction is within about 37.57° of the view axis, equality included', () => {
    const limit = Math.acos(NEBULA_VISIBILITY);
    expect((limit * 180) / Math.PI).toBeCloseTo(37.57, 2);
    expect(nebulaPlacement(yaw(limit - 1e-6), 0)).not.toBeNull();
    expect(nebulaPlacement(yaw(limit + 1e-6), 0)).toBeNull();
    expect(nebulaPlacement(pitch(-(limit - 1e-6)), 0)).not.toBeNull();
    const side = Math.sqrt(1 - NEBULA_VISIBILITY ** 2);
    expect(nebulaPlacement(cameraRows([0, 1, 0], [side, 0, NEBULA_VISIBILITY]), 0)).not.toBeNull();
    const below = NEBULA_VISIBILITY - 2 ** -24;
    expect(nebulaPlacement(cameraRows([0, 1, 0], [Math.sqrt(1 - below ** 2), 0, below]), 0)).toBeNull();
  });

  it('places the centre at 320 + 567.155 · x/z and 240 − 567.155 · y/z, not by the 3D projection', () => {
    for (const angle of [0.05, 0.2, -0.3, 0.6]) {
      const turned = nebulaPlacement(yaw(angle), 0)!;
      // Camera-space A is (−sin, 0, cos): x/z = −tan.
      expect(Math.abs(turned.sx - (320 - 567.155 * Math.tan(angle)))).toBeLessThan(1);
      expect(turned.sy).toBe(240);
      const tilted = nebulaPlacement(pitch(angle), 0)!;
      expect(Math.abs(tilted.sy - (240 - 567.155 * Math.tan(angle)))).toBeLessThan(1);
      expect(tilted.sx).toBe(320);
    }
  });

  it('turns the image with the camera\'s roll', () => {
    const roll = (angle: number): Matrix3 => cameraRows([-Math.sin(angle), Math.cos(angle), 0], [0, 0, 1]);
    for (const angle of [0.1, 1, 2, -2.5]) {
      const { sx, sy, angle: theta } = nebulaPlacement(roll(angle), 0)!;
      expect([sx, sy]).toEqual([320, 240]);
      const expected = Math.atan2(Math.sin(Math.PI - angle), Math.cos(Math.PI - angle));
      expect(Math.abs(Math.atan2(Math.sin(theta - expected), Math.cos(theta - expected)))).toBeLessThan(1e-5);
    }
  });

  it('shows at most one slot for any orthonormal rows', () => {
    let shown = 0;
    for (let seed = 1; seed <= 4000; seed++) {
      const count = visible(randomRows(seed)).length;
      expect(count).toBeLessThanOrEqual(1);
      shown += count;
    }
    // Six cones of about 37.57° cover roughly 6 · (1 − cos) / 2 of the sphere, about 62 %.
    expect(shown / 4000).toBeGreaterThan(0.55);
    expect(shown / 4000).toBeLessThan(0.7);
  });
});
