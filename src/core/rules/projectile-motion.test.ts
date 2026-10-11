import { describe, expect, it } from 'vitest';
import type { LinearMovementBlock } from '../world/entity-table.ts';
import { expectFault } from '../world/world.test-support.ts';
import { motionStep } from './flight-motion.ts';
import { isTimerDue, lingerTimer, moveLinear, projectileTimer } from './projectile-motion.ts';

// docs/plan/p3/02/spec.md, CR-02 and CR-03; docs/original/formats/executable.md, H1, H2 and H8. Expectations are worked
// out by hand from the f32 grid: between 2^24 and 2^25 the f32 values are the even integers.

const at = (x: number, y: number, z: number) => ({ x, y, z });
const block = (velocity: ReturnType<typeof at>, previousPosition = at(0, 0, 0)): LinearMovementBlock =>
  ({ mode: 'linear', speed: 7, velocity, previousPosition, hitTest: true });
/** 2 clock units per tick: a step of 1/32 s. */
const STEP = motionStep(2, 0);

describe('moveLinear, 0x22818 (H1, CR-03)', () => {
  it('keeps the position before the move and adds velocity × step per axis', () => {
    const start = at(10, -20, 0.5);
    const moved = moveLinear(start, block(at(32, -64, 0)), STEP);
    expect(moved.position).toEqual(at(11, -22, 0.5));
    expect(moved.block).toEqual(block(at(32, -64, 0), start));
    expect(moved.block.previousPosition).toBe(start);
  });

  it('stores each axis as f32, so a move below half the grid spacing leaves the axis', () => {
    // 2^24 + 1 is halfway between 2^24 and 2^24 + 2 and rounds to the even 2^24; 2^24 + 3 rounds to 2^24 + 4.
    const start = at(2 ** 24, 2 ** 24, -(2 ** 24));
    const moved = moveLinear(start, block(at(32, 96, -96)), STEP);
    expect(moved.position).toEqual(at(2 ** 24, 2 ** 24 + 4, -(2 ** 24) - 4));
  });

  it('scales the translation with the step and changes neither argument', () => {
    const start = at(1, 2, 3);
    const original = block(at(64, 0, -128), at(9, 9, 9));
    const frozen = structuredClone(original);
    expect(moveLinear(start, original, motionStep(4, 0)).position).toEqual(at(5, 2, -5));
    expect(moveLinear(start, original, motionStep(0, 0)).position).toEqual(start);
    expect(original).toEqual(frozen);
    expect(start).toEqual(at(1, 2, 3));
  });

  it('faults when a stored coordinate leaves the f32 range, as the original unmasks overflow', () => {
    expectFault(() => moveLinear(at(3e38, 0, 0), block(at(3e38, 0, 0)), { seconds: 1, time: 0 }), 'invariant-violated', 'projectile-motion.result');
  });
});

describe('the projectile timer of 0x259b0 (H2, CR-02)', () => {
  it('is due the gun\'s lifetime after the first callback, with the first-state-8 flag set', () => {
    expect(projectileTimer(100, 40)).toEqual({ clock: 140, firstHitPending: true });
    expect(projectileTimer(100, 0)).toEqual({ clock: 100, firstHitPending: true });
  });

  it('after a hit, lingers 0x80 units from its first state-8 callback with the flag cleared', () => {
    expect(lingerTimer(150)).toEqual({ clock: 150 + 0x80, firstHitPending: false });
  });

  it('is due once the clock reaches it (due ≤ clock), and never without a timer', () => {
    const timer = projectileTimer(100, 40);
    expect([isTimerDue(timer, 139), isTimerDue(timer, 140), isTimerDue(timer, 141)]).toEqual([false, true, true]);
    expect(isTimerDue(null, 1e9)).toBe(false);
  });

  it('faults on a due clock Core cannot represent', () => {
    expectFault(() => projectileTimer(10, -11), 'invariant-violated', 'projectile-motion.clock');
    expect(projectileTimer(11, -11)).toEqual({ clock: 0, firstHitPending: true });
    expectFault(() => lingerTimer(Number.MAX_SAFE_INTEGER), 'budget-exhausted', 'projectile-motion.clock');
  });
});
