import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import { EntityTable, type Entity, type ExplosionCombat, type Matrix3, type MovementBlock } from '../world/entity-table.ts';
import { entityInit, expectFault } from '../world/world.test-support.ts';
import {
  activateExplosion, explosionFrame, explosionFrameCount, explosionInit, explosionUpdate, explosionVariant, playerExplosionDue,
} from './explosions.ts';
import { craftMovementBlock } from './flight-state.ts';

// docs/original/formats/executable.md X2, X4, X9 and X11; docs/plan/p3/02/spec.md CR-02, CR-03, CR-04, CR-07, CR-08 and
// CR-11. Expectations are worked out by hand: at 2 clock units per tick the frame index (14 × Δ) SHR 6 first reaches 12
// at Δ = 56 (28 ticks) and 6 at Δ = 28 (14 ticks), and the clock first passes t₀ + 0x60 at Δ = 98 (49 ticks).

const f = Math.fround;
const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const matrix = (...rows: number[]) => Object.freeze(rows) as unknown as Matrix3;
/** Row 1 along +y, row 2 along −x, row 3 along +z. */
const TURNED = matrix(0, 1, 0, -1, 0, 0, 0, 0, 1);
const FRAMES = Object.freeze({ lists12: 12, list3: 6 });

const explosionOf = (overrides: Partial<ExplosionCombat> = {}): ExplosionCombat => ({
  type: 'explosion', source: 3, sourceKindBit: 7, variant: 'other', heldSource: null, activationClock: null, removalAfterClock: null, ...overrides,
});

function sourceOf(kindBit: number, movement: MovementBlock | null): Entity {
  return new EntityTable().allocate(entityInit(kindBit, { position: vec(1, 2, 3), orientation: TURNED, activity: movement === null ? 'parked' : 'active', movement }));
}

describe('the player\'s delay in 0x23ac8 (X2, CR-04)', () => {
  it('arms the delay at the clock + 0xC0, a budget fault past the safe integers', () => {
    expect(playerExplosionDue(100)).toBe(100 + 0xc0);
    expectFault(() => playerExplosionDue(Number.MAX_SAFE_INTEGER - 0x10), 'budget-exhausted', 'explosions.delay');
  });
});

describe('what 0x23ac8 allocates (X2, CR-02, CR-03)', () => {
  it('names the variant: missile for a missile, large for mask 0xf9c7c, other for the rest', () => {
    expect([20, 2, 10, 19, 0, 1, 7, 13, 24].map(explosionVariant)).toEqual(['missile', 'large', 'large', 'large', 'other', 'other', 'other', 'other', 'other']);
  });

  it('places the explosion at the source in a linear block at the source\'s speed along row 3, without the hit test', () => {
    const source = sourceOf(10, craftMovementBlock(0x80, 48, 96));
    const init = explosionInit(source);
    expect(init).toMatchObject({
      kindBit: 22, activity: 'active', source: null, name: { type: 'none' }, side: null, maximumSpeed: 0,
      presentation: { type: 'explosion', variant: 'large' },
      position: vec(1, 2, 3), orientation: TURNED,
      movement: { mode: 'linear', speed: 48, velocity: vec(0, 0, 48), previousPosition: vec(1, 2, 3), hitTest: false },
      combat: { type: 'explosion', source: source.id, sourceKindBit: 10, variant: 'large', heldSource: null, activationClock: null, removalAfterClock: null },
    });
    expect(new EntityTable().allocate(init).combat).toEqual(init.combat);
  });

  it('turns a spinning source\'s velocity into row 3 of the explosion\'s frame', () => {
    const fragment = sourceOf(24, { mode: 'spinning', speed: 5, velocity: vec(0, 3, 4), spin: f(0.1), spinAxis: 0 });
    const { orientation, movement } = explosionInit(fragment);
    expect(orientation.slice(6)).toEqual([0, f(0.6), f(0.8)]);
    expect(movement).toMatchObject({ speed: 5, velocity: vec(0, f(f(0.6) * 5), f(f(0.8) * 5)) });
  });

  it('faults on a source without a movement block', () => {
    expectFault(() => explosionInit(sourceOf(7, null)), 'invariant-violated', 'explosions.source');
  });
});

describe('the activation and update of 0x2409c (X4)', () => {
  it('sets t₀ and the removal time t₀ + 0x60, a budget fault past the safe integers', () => {
    const explosion = explosionOf();
    activateExplosion(explosion, 40);
    expect([explosion.activationClock, explosion.removalAfterClock]).toEqual([40, 40 + 0x60]);
    expectFault(() => activateExplosion(explosionOf(), Number.MAX_SAFE_INTEGER - 0x10), 'budget-exhausted', 'explosions.removal');
  });

  it('indexes frames by (14 × Δ) SHR 6: 12 first at 28 ticks, 6 first at 14', () => {
    expect([0, 54, 56].map((delta) => explosionFrame(1000 + delta, 1000))).toEqual([0, 11, 12]);
    expect([26, 28].map((delta) => explosionFrame(delta, 0))).toEqual([5, 6]);
  });

  it('keeps the low 32 bits of the product and shifts them as unsigned', () => {
    // 14 × 153391690 = 2^31 + 12 shifts to 2^25, not to a negative index; 14 × 306783379 = 2^32 + 10 keeps 10.
    expect(explosionFrame(153391690, 0)).toBe(2 ** 25);
    expect(explosionFrame(306783379, 0)).toBe(0);
  });

  it('counts n₃ frames for a missile\'s explosion and n₁₂ for the others', () => {
    expect(['large', 'other', 'missile'].map((variant) => explosionFrameCount(FRAMES, variant as ExplosionCombat['variant']))).toEqual([12, 12, 6]);
    expectFault(() => explosionFrameCount({ lists12: 12, list3: null }, 'missile'), 'invariant-violated', 'explosions.frames');
  });

  it('runs until the animation is over, then holds until the clock is past the removal time', () => {
    const explosion = explosionOf();
    activateExplosion(explosion, 1000);
    expect(explosionUpdate(explosion, 1000 + 54, 12)).toBe('running');
    expect(explosionUpdate(explosion, 1000 + 56, 12)).toBe('over');
    expect(explosionUpdate(explosion, 1000 + 0x60, 12)).toBe('over');
    expect(explosionUpdate(explosion, 1000 + 0x60 + 2, 12)).toBe('remove');
    // The animation decides first: a longer one keeps the explosion past its removal time.
    expect(explosionUpdate(explosion, 1000 + 0x60 + 2, 100)).toBe('running');
  });

  it('faults on an update before the activation', () => {
    expectFault(() => explosionUpdate(explosionOf(), 10, 12), 'invariant-violated', 'explosions.activation');
  });
});
