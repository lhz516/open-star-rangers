import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../core/contracts/domain-events.ts';
import { RAND_SCALE } from '../../../../core/rules/original-random.ts';
import { DIRECTION_TABLE } from '../../../../core/rules/random-direction.ts';
import { scriptedRand } from '../../../../core/rules/rand.test-support.ts';
import { STARTUP_ROTATIONS } from '../../../../core/rules/startup-rotations.ts';
import type { Matrix3 } from '../../../../core/world/entity-table.ts';
import { presentationViewport } from '../presentation-camera.ts';
import type { CameraPose } from '../presentation-contract.ts';
import {
  explosionSpeed, extraActivationDelay, extraExplosionPositions, flashChecks, fragmentEventCount, fragmentInit, fragmentLifetime, isOnScreen,
  keptFragmentEvents,
} from './effect-rules.ts';
import { IDENTITY, vec } from './effects.test-support.ts';

const CAMERA: CameraPose = { position: vec(0), rows: IDENTITY };
const F1 = presentationViewport(0x0c, 0);
const FULL = presentationViewport(8, 0);
/** F(rand × C × span + base), as the original stores a real draw. */
const real = (rand: number, span: number, base: number): number => Math.fround(rand * RAND_SCALE * span + base);
const SMALL = 7;
const LARGE = 2;

describe('extra explosions (X2 step 6)', () => {
  it('draws rand AND 3 extras for small kinds and 2 more for large kinds', () => {
    for (const [kind, rand, count] of [[SMALL, 4, 0], [SMALL, 7, 3], [LARGE, 4, 2], [LARGE, 7, 5]] as const) {
      const random = scriptedRand([rand, ...Array<number>(6 * count).fill(0)]);
      expect(extraExplosionPositions(kind, vec(0, 0, 100), CAMERA, random)).toHaveLength(count);
      expect(random.used).toBe(1 + 6 * count);
    }
  });

  it('jitters each component by its own draws times the camera rows, 2 units towards the camera', () => {
    // Rows R0 = (0, 1, 0), R1 = (1, 0, 0): x takes t₄ (R1.x), y takes t₂ (R0.y); a t·R0 + t′·R1 sum would mix t₁ in.
    const rows = Object.freeze([0, 1, 0, 1, 0, 0, 0, 0, 1]) as unknown as Matrix3;
    const draws = [1, 0, 16384, 32767, 8192, 0, 24576];
    const [p] = extraExplosionPositions(SMALL, vec(0, 0, 100), { position: vec(0), rows }, scriptedRand(draws));
    expect(p).toEqual({ x: Math.fround(real(8192, 30, -15)), y: Math.fround(real(16384, 30, -15)), z: 98 });
    // Large kinds jitter by (120, −60).
    const [q] = extraExplosionPositions(LARGE, vec(0, 0, 100), CAMERA, scriptedRand([0, 0, 0, 0, 0, 32767, 0, ...Array<number>(6).fill(0)]));
    expect(q).toEqual({ x: -60, y: real(32767, 120, -60), z: 98 });
  });

  it('delays each extra by rand % 21', () => {
    expect([0, 20, 21, 32767].map((rand) => extraActivationDelay(scriptedRand([rand])))).toEqual([0, 20, 0, 7]);
  });
});

describe('event 0x10 gate (X5)', () => {
  it('projects with chop, W = right and the centre (right SAR 1, bottom SAR 1), ends included', () => {
    const on = (p: Vec3, viewport = F1) => isOnScreen(p, CAMERA, viewport);
    // z: 10 ≤ z < 3800.
    expect([on(vec(0, 0, 10)), on(vec(0, 0, 9.99)), on(vec(0, 0, 3799.5)), on(vec(0, 0, 3800))]).toEqual([true, false, true, false]);
    // x at z = 639: sx = trunc(x) + 319 within 0–639; −319.5 chops to −319, inside.
    expect([on(vec(320, 0, 639)), on(vec(321, 0, 639)), on(vec(-319.5, 0, 639)), on(vec(-320, 0, 639))]).toEqual([true, false, true, false]);
    // y: sy = trunc(−y) + 157 within 0–315 in F1, + 239 within 0–479 in a full-screen view.
    expect([on(vec(0, 157, 639)), on(vec(0, 158, 639)), on(vec(0, -158, 639)), on(vec(0, -159, 639))]).toEqual([true, false, true, false]);
    expect([on(vec(0, 239, 639), FULL), on(vec(0, 240, 639), FULL), on(vec(0, -240, 639), FULL), on(vec(0, -241, 639), FULL)]).toEqual([true, false, true, false]);
  });

  it('keeps both events under 300, mode 2 under 450 and nothing beyond, for class-0 kinds on screen only', () => {
    const kept = (kind: number, p: Vec3) => keptFragmentEvents(kind, p, CAMERA, F1);
    expect([299.9, 300, 449.9, 450].map((z) => kept(SMALL, vec(0, 0, z)))).toEqual([[1, 2], [2], [2], []]);
    // Off screen (behind, and beside) keeps nothing however near.
    expect([kept(SMALL, vec(0, 0, -50)), kept(SMALL, vec(0, 100, 50))]).toEqual([[], []]);
    // Classes 1 and 2 (the large kinds) keep nothing; kinds 0, 1, 7–9, 13 and 14 are class 0.
    for (const kind of [2, 6, 10, 12, 15, 19]) expect(kept(kind, vec(0, 0, 20))).toEqual([]);
    for (const kind of [0, 1, 8, 9, 13, 14]) expect(kept(kind, vec(0, 0, 20))).toEqual([1, 2]);
  });

  it('counts (rand AND 3) + 10 or rand % 5 fragments, only for kinds of 0x91780', () => {
    const count = (mode: 1 | 2, kind: number, rand: number) => {
      const random = scriptedRand([rand]);
      const n = fragmentEventCount(mode, kind, random);
      expect(random.used).toBe(1);
      return n;
    };
    expect([count(1, 7, 3), count(1, 8, 4), count(1, 9, 32767), count(2, 7, 9), count(2, 7, 5)]).toEqual([13, 10, 13, 4, 0]);
    for (const kind of [0, 1, 13, 14]) expect([count(1, kind, 3), count(2, kind, 4)]).toEqual([0, 0]);
  });
});

describe('discriminator-1/2 fragments (X5, X7)', () => {
  const base = vec(1, 2, 3);
  const position = vec(10, 20, 30);

  it('makes a discriminator-2 fragment from seven draws', () => {
    // Flag (rand % 10 = 0), direction entry and octant, spin, speed, rotation, axis.
    const random = scriptedRand([20, 5, 3, 0, 32767, 65, 4]);
    const fragment = fragmentInit(2, 3, position, base, 32, random);
    expect(random.used).toBe(7);
    const u = DIRECTION_TABLE[5];
    const speed = real(32767, 12, 4);
    expect(fragment).toEqual({
      discriminator: 2, part: 3, explodesOnExpiry: true, shape: null, position, rows: STARTUP_ROTATIONS[1],
      block: {
        mode: 'spinning', speed: 32, spin: Math.fround(0.0872664638888889), spinAxis: 1,
        velocity: { x: Math.fround(1 + u.x * speed), y: Math.fround(2 + u.y * speed), z: Math.fround(3 - u.z * speed) },
      },
    });
    expect(fragmentInit(2, 0, position, base, 32, scriptedRand([21, 0, 0, 0, 0, 0, 0])).explodesOnExpiry).toBe(false);
  });

  it('makes a discriminator-1 fragment from the second direction, axis 0, and its shape', () => {
    const random = scriptedRand([7, 1, 5, 0, 32767, 0, 63, 3]);
    const fragment = fragmentInit(1, 9, position, base, -8, random);
    expect(random.used).toBe(8);
    const u = DIRECTION_TABLE[5];
    expect(fragment).toMatchObject({
      discriminator: 1, part: null, explodesOnExpiry: false, shape: 1, rows: STARTUP_ROTATIONS[63],
      block: { speed: -8, spin: real(32767, 20 * 3.1415927 / 180, 5 * 3.1415927 / 180), spinAxis: 0, velocity: { x: Math.fround(1 + u.x * 4), y: Math.fround(2 + u.y * 4), z: Math.fround(3 + u.z * 4) } },
    });
    // Spin 5°–25° and speed 4–18 for discriminator 1, 5°–15° and 4–16 for discriminator 2.
    expect(fragment.block.spin).toBeCloseTo(25 * Math.PI / 180, 6);
    expect(real(32767, 14, 4)).toBeCloseTo(18, 3);
  });

  it('recovers the explosion\'s speed from its rows and velocity, sign included', () => {
    const rows = (rx: number, ry: number, rz: number) => Object.freeze([1, 0, 0, 0, 1, 0, rx, ry, rz]) as unknown as Matrix3;
    expect(explosionSpeed(rows(0, 0, 1), vec(0, 0, 32))).toBe(32);
    expect(explosionSpeed(rows(0, 0, 1), vec(0, 0, -32))).toBe(-32);
    // Rows that drifted from unit length: v = F(R2 × s) with |R2|² = 4.
    expect(explosionSpeed(rows(0, 0, 2), vec(0, 0, 64))).toBe(32);
    expect(explosionSpeed(rows(0.6, 0.8, 0), vec(Math.fround(0.6 * 25), Math.fround(0.8 * 25), 0))).toBeCloseTo(25, 5);
    expect(explosionSpeed(rows(0, 0, 0), vec(0))).toBe(0);
  });

  it('expires 0x100 + rand % 0xC0 or 0x200 + rand % 0xC0 after the first callback', () => {
    expect([fragmentLifetime(1, scriptedRand([0xbf])), fragmentLifetime(1, scriptedRand([0xc0])), fragmentLifetime(2, scriptedRand([0xbf]))]).toEqual([0x1bf, 0x100, 0x2bf]);
  });
});

describe('flash check 0x24314 (X4)', () => {
  it('flashes for craft sources only: large kinds always, others by L1 distance and the forward row', () => {
    const flashes = (kind: number, p: Vec3) => flashChecks(kind, p, CAMERA);
    expect([flashes(20, vec(0, 0, 1)), flashes(24, vec(0, 0, 1)), flashes(22, vec(0, 0, 1))]).toEqual([false, false, false]);
    expect(flashes(LARGE, vec(0, 0, -5000))).toBe(true);
    // L1 below 100 in any direction.
    expect([flashes(SMALL, vec(-33, 33, -33.99)), flashes(SMALL, vec(-33, 33, -34))]).toEqual([true, false]);
    // From 100 to under 150 only ahead: the unnormalised forward dot above 0.707.
    expect([flashes(SMALL, vec(0, 120, 0.75)), flashes(SMALL, vec(0, 120, 0.7)), flashes(SMALL, vec(0, 74.5, 75)), flashes(SMALL, vec(0, 75, 75))])
      .toEqual([true, false, true, false]);
  });
});
