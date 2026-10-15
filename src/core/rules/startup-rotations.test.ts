import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { RandSource } from './original-random.ts';
import { scriptedRand } from './rand.test-support.ts';
import { DIRECTION_TABLE, randomDirection } from './random-direction.ts';
import { buildStartupRotations, DefaultSeedRand, drawStartupRotation, STARTUP_ROTATIONS } from './startup-rotations.ts';

// docs/plan/p3/02/spec.md, MW-12 R-A; P3-09/28 (local/research/p3-09/warp-path/findings.md, to be written into
// executable.md by P3-09/29): the table is built from draws 1001–1128 of the Watcom rand() at the default seed 1, through
// the direction table. Its values are never committed: the table is pinned by the SHA-256 prefix 28's independent x87
// model (tools/verify.py, repeated in V8) computed over 64 × 9 little-endian f32 in row order.

const tableHash = (table: readonly (readonly number[])[]): string => {
  const bytes = new DataView(new ArrayBuffer(table.length * 9 * 4));
  table.flat().forEach((value, index) => bytes.setFloat32(index * 4, value, true));
  return createHash('sha256').update(new Uint8Array(bytes.buffer)).digest('hex');
};

/** Counts the draws it passes on. */
function counted(source: RandSource): RandSource & { readonly used: number } {
  let used = 0;
  return {
    next: () => {
      used++;
      return source.next();
    },
    get used() {
      return used;
    },
  };
}

describe('DefaultSeedRand', () => {
  it('is the C standard example generator from seed 1, bits 16–30 of the state', () => {
    // ISO C's portable rand() (next × 1103515245 + 12345, (next ÷ 65536) % 32768) from srand(1).
    const rand = new DefaultSeedRand();
    expect([rand.next(), rand.next(), rand.next(), rand.next(), rand.next()]).toEqual([16838, 5758, 10113, 17515, 31051]);
  });
});

describe('STARTUP_ROTATIONS (0x568b0, 0x1b0a10)', () => {
  it('matches the independent model of the original table', () => {
    expect(STARTUP_ROTATIONS).toHaveLength(64);
    expect(tableHash(STARTUP_ROTATIONS).slice(0, 16)).toBe('20ece07b36ca54c4');
  });

  it('takes exactly 128 draws after the 1000 of init entry 15, and needs them', () => {
    const rand = new DefaultSeedRand();
    for (let draw = 0; draw < 1000; draw++) rand.next();
    const source = counted(rand);
    expect(tableHash(buildStartupRotations(source))).toBe(tableHash(STARTUP_ROTATIONS));
    expect(source.used).toBe(128);
    expect(tableHash(buildStartupRotations(new DefaultSeedRand()))).not.toBe(tableHash(STARTUP_ROTATIONS));
  });

  it('has the forward row from the direction rule and the other rows in closed form, all f32', () => {
    const rand = new DefaultSeedRand();
    for (let draw = 0; draw < 1000; draw++) rand.next();
    for (const rows of STARTUP_ROTATIONS) {
      const { x, y, z } = randomDirection(rand);
      expect(rows.slice(6)).toEqual([x, y, z]);
      expect(rows.every((value) => Math.fround(value) === value)).toBe(true);
      // R1's x is the integer store of 0: +0.
      expect(Object.is(rows[3], 0)).toBe(true);
      const row = (index: number) => rows.slice(3 * index, 3 * index + 3);
      const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) expect(Math.abs(dot(row(i), row(j)) - (i === j ? 1 : 0))).toBeLessThan(5e-7);
      }
      // R0 = R1 × R2.
      const [a, b] = [row(1), row(2)];
      const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      row(0).forEach((value, index) => expect(Math.abs(value - cross[index])).toBeLessThan(5e-7));
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(STARTUP_ROTATIONS)).toBe(true);
    expect(STARTUP_ROTATIONS.every(Object.isFrozen)).toBe(true);
  });

  it('never needs the redraw: no direction has both y and z zero', () => {
    expect(DIRECTION_TABLE.some(({ y, z }) => y === 0 && z === 0)).toBe(false);
  });
});

describe('drawStartupRotation (0x56cd4)', () => {
  it('takes one draw and copies entry rand % 64', () => {
    const rand = scriptedRand([64 * 3 + 5]);
    expect(drawStartupRotation(STARTUP_ROTATIONS, rand)).toBe(STARTUP_ROTATIONS[5]);
    expect(rand.used).toBe(1);
    expect(drawStartupRotation(STARTUP_ROTATIONS, scriptedRand([32767]))).toBe(STARTUP_ROTATIONS[63]);
  });
});
