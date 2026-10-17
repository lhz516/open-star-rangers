import { describe, expect, it } from 'vitest';
import { blitNebula, NEBULA_IMAGE_SIZE, NEBULA_REACH, normaliseNebulaAngle, ROTATION_TABLE } from './nebula-blit.ts';

// Pure tests of the blit's arithmetic (NB4); the source is addressed by offset, so no image is needed.

interface Write {
  readonly x: number;
  readonly y: number;
  readonly row: number;
  readonly column: number;
}

function writes(theta: number, sx = 320, sy = 240, bottom = 479): Write[] {
  const out: Write[] = [];
  blitNebula(theta, sx, sy, bottom, (x, y, source) => out.push({ x, y, row: source >> 7, column: source & 127 }));
  return out;
}

/** Angles over a whole turn, as the f32 values the placement gives, with the exact quadrant boundaries. */
const ANGLES = [
  ...Array.from({ length: 721 }, (_, step) => Math.fround(-Math.PI + (step * Math.PI) / 360)),
  0, -Math.PI / 2, Math.PI / 2, Math.PI, -Math.PI, Math.fround(Math.PI), 4, -4,
];

const tableRow = (row: number): number[] => [...ROTATION_TABLE.subarray(row * NEBULA_IMAGE_SIZE, (row + 1) * NEBULA_IMAGE_SIZE)];

describe('nebula rotation table', () => {
  it('maps each row\'s steps from 0 up to 127 at its edge length, which grows from 90 (row 0) to 127 (rows 43–44)', () => {
    expect(ROTATION_TABLE).toHaveLength(45 * 128);
    const lengths = Array.from({ length: 45 }, (_, row) => tableRow(row).indexOf(127));
    expect(lengths[0]).toBe(90);
    expect(lengths[43]).toBe(127);
    expect(lengths[44]).toBe(127);
    for (let row = 0; row < 45; row++) {
      const values = tableRow(row);
      expect(values[0]).toBe(0);
      expect(values.every((value, step) => step === 0 || value >= values[step - 1])).toBe(true);
      expect(values.slice(lengths[row]).every((value) => value === 127)).toBe(true);
      if (row > 0) expect(lengths[row]).toBeGreaterThanOrEqual(lengths[row - 1]);
    }
    expect(tableRow(0).slice(0, 4)).toEqual([0, 1, 2, 4]);
    expect(tableRow(44).slice(125)).toEqual([125, 126, 127]);
  });
});

describe('nebula angle normalisation', () => {
  it('folds each quadrant into [−π/2, 0] with its flip and transpose flags', () => {
    const f = Math.fround;
    expect(normaliseNebulaAngle(-0.5)).toEqual({ angle: f(-0.5), flipOuter: false, flipInner: false, transpose: false });
    expect(normaliseNebulaAngle(-2)).toEqual({ angle: f(f(-2) + 1.57079635), flipOuter: false, flipInner: true, transpose: true });
    expect(normaliseNebulaAngle(0.5)).toEqual({ angle: f(f(0.5) - 1.57079635), flipOuter: true, flipInner: false, transpose: true });
    expect(normaliseNebulaAngle(2)).toEqual({ angle: f(f(2) - 3.1415927), flipOuter: true, flipInner: true, transpose: false });
    // Beyond ±π the clamps store the f32 π.
    expect(normaliseNebulaAngle(-4)).toEqual(normaliseNebulaAngle(-f(Math.PI)));
    expect(normaliseNebulaAngle(4)).toEqual(normaliseNebulaAngle(f(Math.PI)));
    // f32(−π/2) lies below the executable's −1.57079635: it takes the second quadrant's branch.
    expect(normaliseNebulaAngle(-Math.PI / 2)).toMatchObject({ flipOuter: false, flipInner: true, transpose: true });
    for (const theta of ANGLES) {
      const { angle } = normaliseNebulaAngle(theta);
      expect(angle).toBeGreaterThanOrEqual(-Math.PI / 2 - 1e-6);
      expect(angle).toBeLessThanOrEqual(1e-6);
    }
  });
});

describe('nebula blit', () => {
  it('rotates the stored image properly at every angle: its row axis along θ (y up), its column axis along θ + 90°', () => {
    for (const theta of ANGLES) {
      // Beyond ±π the blit draws at ±π (the clamps).
      const clamped = Math.min(Math.PI, Math.max(-Math.PI, theta));
      const [cos, sin] = [Math.cos(clamped), Math.sin(clamped)];
      let rotated = 0;
      let mirrored = 0;
      for (const { x, y, row, column } of writes(theta)) {
        const [dx, dy] = [x - 320, y - 240];
        const along = dx * cos - dy * sin;
        const across = -dx * sin - dy * cos;
        rotated = Math.max(rotated, Math.abs(row - 63.5 - along), Math.abs(column - 63.5 - across));
        mirrored = Math.max(mirrored, Math.abs(column - 63.5 - along), Math.abs(row - 63.5 - across));
      }
      expect(rotated, `θ = ${theta}`).toBeLessThan(4);
      expect(mirrored, `θ = ${theta}`).toBeGreaterThan(60);
    }
  });

  it('shows the image as stored at θ = −π/2 and turned a quarter left at θ = 0', () => {
    for (const { x, y, row, column } of writes(Math.fround(-Math.PI / 2))) {
      expect(Math.abs(row - 63.5 - (y - 240))).toBeLessThan(2);
      expect(Math.abs(column - 63.5 - (x - 320))).toBeLessThan(2);
    }
    // θ = 0: rows run right, columns up, so the stored top-left corner is at the bottom-left.
    const corner = writes(0).find(({ row, column }) => row === 0 && column === 0)!;
    expect(corner.x).toBeLessThan(320 - 60);
    expect(corner.y).toBeGreaterThan(240 + 60);
  });

  it('reads every source pixel when axis-aligned and about 91 × 91 of them at 45°', () => {
    const sources = (theta: number) => new Set(writes(theta).map(({ row, column }) => row * NEBULA_IMAGE_SIZE + column)).size;
    expect(sources(0)).toBe(128 * 128);
    expect(sources(Math.fround(Math.PI))).toBe(128 * 128);
    expect(sources(Math.fround(Math.PI / 4))).toBe(91 * 91);
    expect(sources(Math.fround(-Math.PI / 4))).toBe(91 * 91);
  });

  it('writes the same source pixel at both positions of a diagonal step, leaving no hole', () => {
    // A flag per screen pixel; writes about (320, 240) stay within ±91, so every index is on screen.
    const written = new Uint8Array(640 * 480);
    for (const theta of ANGLES) {
      written.fill(0);
      blitNebula(theta, 320, 240, 479, (x, y) => { written[y * 640 + x] = 1; });
      for (let dy = -60; dy <= 60; dy++) {
        for (let dx = -60; dx <= 60; dx++) {
          if (dx * dx + dy * dy <= 60 * 60 && written[(240 + dy) * 640 + 320 + dx] === 0) throw new Error(`hole at ${dx}, ${dy} for θ = ${theta}`);
        }
      }
    }
  });

  it('stays within ±91 of the centre, inside the erase\'s ±100 square of the next frame', () => {
    let reach = 0;
    for (const theta of ANGLES) {
      for (const { x, y } of writes(theta)) reach = Math.max(reach, Math.abs(x - 320), Math.abs(y - 240));
    }
    expect(reach).toBe(NEBULA_REACH);
    expect(reach).toBeLessThan(100);
  });

  it('writes only 0 ≤ x < 640 and 1 ≤ y ≤ the viewport bottom: never row 0, the bottom row included', () => {
    for (const theta of ANGLES) {
      const corner = writes(theta, 20, 10, 315);
      expect(corner.every(({ x, y }) => x >= 0 && x < 640 && y >= 1 && y <= 315)).toBe(true);
      expect(corner.some(({ y }) => y === 1)).toBe(true);
      expect(corner.some(({ x }) => x === 0)).toBe(true);
      const low = writes(theta, 620, 300, 315);
      expect(low.every(({ x, y }) => x < 640 && y <= 315)).toBe(true);
      expect(low.some(({ y }) => y === 315)).toBe(true);
      expect(low.some(({ x }) => x === 639)).toBe(true);
    }
    expect(writes(0, 320, -100, 479)).toEqual([]);
    expect(writes(0, 320, 600, 479)).toEqual([]);
  });

  it('gives the same pixels and sources wherever the centre lies, shifted', () => {
    const shifted = (theta: number, sx: number, sy: number) => writes(theta, sx, sy).map(({ x, y, row, column }) => [x - sx, y - sy, row, column]);
    for (const theta of [0.3, -1, 2.5, -2.9]) expect(shifted(theta, 200, 150)).toEqual(shifted(theta, 400, 300));
  });
});
