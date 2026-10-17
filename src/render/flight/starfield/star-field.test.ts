import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import { cameraRows, pitch, yaw } from '../nebula/nebula.test-support.ts';
import { IDENTITY_ROWS as IDENTITY } from '../scene/drawn-pose.ts';
import { drawStars, STAR_COUNT, STAR_K, STAR_S, starScreen, starTable, WatcomRand, type StarDirection } from './star-field.ts';

// Independent expectations from P3-12/30 (docs/plan/p3/12/subtasks/30-stars-speed-dust-research.md, 给 31 的计算步骤):
// the table's hash under the host libm and V8, S, K, and the identity camera's star counts and extents. Code-generated
// inputs only; never original data.

const TABLE_SHA256 = '1aa3406e2531b043cf246ee7d547de7c5cea45679fd721092b9ab4bb45622754';

function tableBytes(table: readonly StarDirection[]): Buffer {
  const bytes = Buffer.alloc(table.length * 16);
  table.forEach(({ x, y, z, colour }, index) => {
    bytes.writeFloatLE(x, index * 16);
    bytes.writeFloatLE(y, index * 16 + 4);
    bytes.writeFloatLE(z, index * 16 + 8);
    bytes.writeInt32LE(colour, index * 16 + 12);
  });
  return bytes;
}

/** SD3 transcribed step by step, apart from the module: the stars `rows` show, [sx, sy, colour] in table order. */
function expectedStars(rows: Matrix3, bottom: number): number[][] {
  const f = Math.fround;
  const [r0x, r0y, r0z, r1x, r1y, r1z, r2x, r2y, r2z] = rows;
  const out: number[][] = [];
  for (const { x, y, z, colour } of starTable()) {
    const zPrime = (y * r2y + x * r2x) + z * r2z;
    if (!(zPrime >= STAR_K)) continue;
    const r = STAR_K / f(zPrime);
    const xPrime = f(((y * r0y + x * r0x) + z * r0z) * r);
    const yPrime = f(((y * r1y + x * r1x) + z * r1z) * r);
    if (!(xPrime > -STAR_S && xPrime < STAR_S)) continue;
    const inverse = 1 / STAR_S;
    const sxf = f((320 * inverse) * xPrime + 320);
    const syf = f((-320 * inverse) * yPrime + 320);
    if (!(syf >= 81 && syf < bottom + 81)) continue;
    out.push([Math.trunc(sxf + 0.5), Math.trunc(syf + 0.5) - 81, colour]);
  }
  return out;
}

function drawn(rows: Matrix3, bottom: number): number[][] {
  const out: number[][] = [];
  drawStars(rows, bottom, (sx, sy, colour) => out.push([sx, sy, colour]));
  return out;
}

/** The largest f32 below `value` (a positive f32). */
function f32Below(value: number): number {
  const bits = new Float32Array([value]);
  new Uint32Array(bits.buffer)[0] -= 1;
  return bits[0];
}

describe('star table 0x3fbc0 (AC-23)', () => {
  it('reproduces the C library\'s unseeded default sequence', () => {
    const rand = new WatcomRand();
    expect(Array.from({ length: 4 }, () => rand.next())).toEqual([16838, 5758, 10113, 17515]);
  });

  it('is the original\'s table: draws 1–1000, its hash, colours i % 6 + 1, S and K', () => {
    const table = starTable();
    expect(table).toHaveLength(STAR_COUNT);
    expect(createHash('sha256').update(tableBytes(table)).digest('hex')).toBe(TABLE_SHA256);
    expect(table.map(({ colour }) => colour).slice(0, 7)).toEqual([1, 2, 3, 4, 5, 6, 1]);
    expect(STAR_S).toBe(0.4472135901451111);
    expect(STAR_K).toBe(0.7926233410835266);
  });

  it('is one frozen table, built without any random source, so the same in every run and seed', () => {
    expect(starTable()).toBe(starTable());
    expect(Object.isFrozen(starTable())).toBe(true);
    expect(Object.isFrozen(starTable()[0])).toBe(true);
    expect(drawStars.length).toBe(3);
  });
});

describe('star projection 0x3fd60 (AC-23)', () => {
  it('draws 57 stars in F1 and 68 in the destruction view with the identity rows, as 30 predicted', () => {
    const f1 = drawn(IDENTITY, 315);
    expect(f1).toHaveLength(57);
    expect([Math.min(...f1.map(([sx]) => sx)), Math.max(...f1.map(([sx]) => sx))]).toEqual([37, 605]);
    expect([Math.min(...f1.map(([, sy]) => sy)), Math.max(...f1.map(([, sy]) => sy))]).toEqual([12, 311]);
    expect(drawn(IDENTITY, 479)).toHaveLength(68);
  });

  it('matches the independent transcription for turned cameras and both viewport bottoms', () => {
    const cameras: Matrix3[] = [IDENTITY, yaw(0.3), yaw(-2.1), pitch(0.7), pitch(-1.2), cameraRows([0.6, 0.8, 0], [0, 0, 1]), cameraRows([0, 0.6, -0.8], [0, 0.8, 0.6])];
    for (const rows of cameras) {
      for (const bottom of [315, 479]) {
        const expected = expectedStars(rows, bottom);
        expect(expected.length).toBeGreaterThan(0);
        expect(drawn(rows, bottom)).toEqual(expected);
      }
    }
  });

  it('accepts rows 0 to bottom inclusive and keeps sx = 640 for the largest x′ below S', () => {
    const below = f32Below(STAR_S);
    expect(starScreen(below, 0, 315)).toEqual({ sx: 640, sy: 239 });
    expect(starScreen(-below, 0, 315)?.sx).toBe(0);
    expect(starScreen(0, 0, 315)).toEqual({ sx: 320, sy: 239 });
    // y′ for syf just below bottom + 81 rounds to row `bottom`; at bottom + 81 it is skipped.
    const scale = 320 * (1 / STAR_S);
    const yAt = (syf: number): number => Math.fround((320 - syf) / scale);
    expect(starScreen(0, yAt(315 + 81 - 0.25), 315)?.sy).toBe(315);
    expect(starScreen(0, yAt(315 + 81 + 0.25), 315)).toBeNull();
    expect(starScreen(0, yAt(81 - 0.25), 315)).toBeNull();
  });
});
