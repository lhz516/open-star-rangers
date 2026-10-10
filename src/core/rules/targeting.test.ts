import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import { EntityTable, type Entity, type EntityInit, type Matrix3 } from '../world/entity-table.ts';
import { entityInit, expectFault } from '../world/world.test-support.ts';
import {
  ENEMY_KINDS, fartherCandidate, FORWARD_KINDS, forwardCandidate, forwardMode, FRIENDLY_KINDS, isTargetCandidate, modeKinds, nearerCandidate,
  targetDistance,
} from './targeting.ts';

// Expectations derived by hand from T2 and T10 (docs/original/formats/executable.md), not by the helpers.

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };
const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const bitsOf = (mask: number): number[] => Array.from({ length: 32 }, (_, bit) => bit).filter((bit) => ((mask >>> bit) & 1) === 1);

/** A table with the player (kind bit 0) at `position`, facing along +z, active. */
function withSelf(position: Vec3 = ORIGIN, orientation: Matrix3 = IDENTITY): [EntityTable, Entity] {
  const table = new EntityTable();
  const self = table.allocate(entityInit(0, { position, orientation }));
  self.state = 'active';
  return [table, self];
}

/** An active craft of `kindBit` at `position` in state 7, unless `overrides` say otherwise. */
function add(table: EntityTable, kindBit: number, position: Vec3, overrides: Partial<EntityInit> = {}): Entity {
  const entity = table.allocate(entityInit(kindBit, { position, ...overrides }));
  if (entity.activity !== 'parked') entity.state = 'active';
  return entity;
}

const ids = (entities: (Entity | null)[]): (number | null)[] => entities.map((entity) => entity?.id ?? null);

describe('kind masks and the forward mode (T2, player target modes)', () => {
  it('splits the model kinds between the two modes as the M2ID table does, the marker friendly', () => {
    expect(bitsOf(ENEMY_KINDS)).toEqual([7, 8, 9, 10, 12, 13, 16, 19]);
    expect(bitsOf(FRIENDLY_KINDS)).toEqual([1, 2, 3, 4, 5, 6, 11, 14, 15, 17, 18, 25]);
    expect([modeKinds('enemy'), modeKinds('friendly')]).toEqual([ENEMY_KINDS, FRIENDLY_KINDS]);
    expect(bitsOf(FORWARD_KINDS)).toEqual(Array.from({ length: 20 }, (_, bit) => bit));
  });

  it('gives a forward choice the friendly mode exactly for the friendly model kinds and the player\'s', () => {
    const friendly = [0, 1, 2, 3, 4, 5, 6, 11, 14, 15, 17, 18];
    for (let kindBit = 0; kindBit < 20; kindBit++) expect(forwardMode(kindBit)).toBe(friendly.includes(kindBit) ? 'friendly' : 'enemy');
  });
});

describe('the candidate filter', () => {
  it('keeps active entities in state 7 or 8 outside Warp, destroyed or not', () => {
    const [table] = withSelf();
    const entity = add(table, 7, at(0, 0, 10));
    expect(isTargetCandidate(entity)).toBe(true);
    entity.destroyed = true;
    expect(isTargetCandidate(entity)).toBe(true);
    entity.state = 'projectile-hit';
    expect(isTargetCandidate(entity)).toBe(true);
  });

  it.each([
    ['in Warp', (entity: Entity) => void (entity.inWarp = true)],
    ['docked', (entity: Entity) => void (entity.activity = 'docked')],
    ...(['new', 'presentation-ready', 'destroyed-source', 'area-switch', 'pending-removal'] as const)
      .map((state): [string, (entity: Entity) => void] => [`in state ${state}`, (entity) => void (entity.state = state)]),
  ])('drops an entity %s', (_, change) => {
    const [table] = withSelf();
    const entity = add(table, 7, at(0, 0, 10));
    change(entity);
    expect(isTargetCandidate(entity)).toBe(false);
  });

  it('drops a parked entity', () => {
    const [table] = withSelf();
    expect(isTargetCandidate(add(table, 7, at(0, 0, 10), { activity: 'parked' }))).toBe(false);
  });
});

describe('targetDistance, 0x637e4', () => {
  // dx = (1 + 2^−23) − (−2^−30) = 1 + 2^−23 + 2^−30, whose f32 copy is 1 + 2^−23 (2^−30 is below half an ulp).
  const near = -(2 ** -30);
  const far = 1 + 2 ** -23;

  it('squares the f32 copy of x: (1 + 2^−23)² = 1 + 2^−22 + 2^−46', () => {
    expect(targetDistance(at(near, 0, 0), at(far, 0, 0))).toBe(1 + 2 ** -22 + 2 ** -46);
  });

  it('multiplies y and z by their f32 copies: 1 + 2^−22 + 2^−30 + 2^−46 + 2^−53 rounds to even, dropping 2^−53', () => {
    const expected = 1 + 2 ** -22 + 2 ** -30 + 2 ** -46;
    expect(targetDistance(at(0, near, 0), at(0, far, 0))).toBe(expected);
    expect(targetDistance(at(0, 0, near), at(0, 0, far))).toBe(expected);
  });

  it('sums the three squares, either way round', () => {
    expect(targetDistance(at(1, 2, 3), at(4, 6, 15))).toBe(9 + 16 + 144);
    expect(targetDistance(at(4, 6, 15), at(1, 2, 3))).toBe(169);
  });
});

/**
 * a = 1 + 2049·2^−23: a² = 1 + 4098·2^−23 + 2049²·2^−46 = 1 + 4098·2^−23 + 2^−24 + 4097·2^−46, above the f32 midpoint, so
 * d32(a²) = 1 + 4099·2^−23 rounds up. A point (a, 2^−12, 0) adds 2^−24: 1 + 4099·2^−23 + 4097·2^−46, at least d32(a²)
 * unrounded and equal to it as f32. A point (0, a, 0) is at a² exactly (a and its f32 copy agree), below d32(a²).
 */
const A = 1 + 2049 * 2 ** -23;
const ROUNDED_UP = 1 + 4099 * 2 ** -23;

describe('fartherCandidate, 0x63858', () => {
  it('without a reference is the nearest candidate of the mask, the first in walk order on a tie', () => {
    const [table, self] = withSelf();
    add(table, 8, at(0, 0, 30));
    const nearest = add(table, 7, at(0, 20, 0));
    add(table, 7, at(0, 0, 40));
    add(table, 14, at(0, 0, 1));
    expect(fartherCandidate(table, self, null, ENEMY_KINDS)).toBe(nearest);
    // Kind 8 allocated first loses the tie to kind 7: the walk takes kind bits in ascending order.
    const [tied, tiedSelf] = withSelf();
    add(tied, 8, at(10, 0, 0));
    const first = add(tied, 7, at(0, 10, 0));
    add(tied, 7, at(0, 0, 10));
    expect(fartherCandidate(tied, tiedSelf, null, ENEMY_KINDS)).toBe(first);
  });

  it('with a reference is the nearest candidate at least as far, the reference excluded and its geometric twin kept', () => {
    const [table, self] = withSelf();
    add(table, 7, at(0, 0, 10));
    const reference = add(table, 7, at(0, 0, 20));
    const twin = add(table, 8, at(0, 20, 0));
    add(table, 8, at(0, 0, 30));
    expect(fartherCandidate(table, self, reference, ENEMY_KINDS)).toBe(twin);
    expect(fartherCandidate(table, self, twin, ENEMY_KINDS)).toBe(reference);
  });

  it('compares the unrounded distance with the f32 reference, then f32 distances among the eligible', () => {
    const [table, self] = withSelf();
    const reference = add(table, 7, at(A, 0, 0));
    // At a², below d32(a²): not eligible, though at the reference's own distance.
    add(table, 7, at(0, A, 0));
    const above = add(table, 8, at(A, 2 ** -12, 0));
    add(table, 8, at(2, 0, 0));
    expect(Math.fround(targetDistance(ORIGIN, reference.position))).toBe(ROUNDED_UP);
    expect(Math.fround(targetDistance(ORIGIN, above.position))).toBe(ROUNDED_UP);
    expect(fartherCandidate(table, self, reference, ENEMY_KINDS)).toBe(above);
  });

  it('is null without an eligible candidate, and skips filtered entities', () => {
    const [table, self] = withSelf();
    add(table, 7, at(0, 0, 10), { inWarp: true });
    add(table, 14, at(0, 0, 5));
    expect(fartherCandidate(table, self, null, ENEMY_KINDS)).toBeNull();
    const reference = add(table, 7, at(0, 0, 50));
    add(table, 8, at(0, 0, 40));
    expect(fartherCandidate(table, self, reference, ENEMY_KINDS)).toBeNull();
  });

  it('measures from the self\'s position', () => {
    const [table, self] = withSelf(at(100, 0, 0));
    add(table, 7, at(0, 0, 0));
    const nearest = add(table, 8, at(120, 0, 0));
    expect(fartherCandidate(table, self, null, ENEMY_KINDS)).toBe(nearest);
  });
});

describe('nearerCandidate, 0x63954', () => {
  it('without a reference is the farthest candidate, the first in walk order on a tie, and never one at distance 0', () => {
    const [table, self] = withSelf();
    add(table, 7, at(0, 0, 10));
    const farthest = add(table, 7, at(0, 30, 0));
    add(table, 8, at(30, 0, 0));
    expect(nearerCandidate(table, self, null, ENEMY_KINDS)).toBe(farthest);
    const [zero, zeroSelf] = withSelf(at(5, 5, 5));
    add(zero, 7, at(5, 5, 5));
    expect(nearerCandidate(zero, zeroSelf, null, ENEMY_KINDS)).toBeNull();
  });

  it('with a reference is the farthest candidate strictly nearer in f32', () => {
    const [table, self] = withSelf();
    const nearest = add(table, 7, at(0, 0, 10));
    const middle = add(table, 7, at(0, 0, 20));
    const reference = add(table, 8, at(0, 0, 30));
    add(table, 8, at(0, 30, 0));
    expect(ids([
      nearerCandidate(table, self, reference, ENEMY_KINDS),
      nearerCandidate(table, self, middle, ENEMY_KINDS),
      nearerCandidate(table, self, nearest, ENEMY_KINDS),
    ])).toEqual([middle.id, nearest.id, null]);
  });

  it('skips a candidate whose f32 distance equals the reference\'s, geometrically nearer or not', () => {
    const [table, self] = withSelf();
    const reference = add(table, 8, at(A, 2 ** -12, 0));
    // a² is geometrically nearer than the reference but has the same f32 distance.
    add(table, 7, at(0, A, 0));
    const half = add(table, 7, at(0.5, 0, 0));
    expect(nearerCandidate(table, self, reference, ENEMY_KINDS)).toBe(half);
  });

  it('faults when a stored distance overflows f32', () => {
    const [table, self] = withSelf();
    add(table, 7, at(2 ** 70, 0, 0));
    expectFault(() => nearerCandidate(table, self, null, ENEMY_KINDS), 'invariant-violated', 'targeting.distance');
  });
});

describe('forwardCandidate, 0x63a4c', () => {
  const radius = (value: number) => (): number => value;

  it('keeps candidates strictly more than 5 ahead, with any range, and picks the nearest ahead, ties the earliest', () => {
    const [table, self] = withSelf();
    add(table, 7, at(0, 0, 5));
    add(table, 7, at(0, 0, -20));
    expect(forwardCandidate(table, self, FORWARD_KINDS, radius(1))).toBeNull();
    const far = add(table, 19, at(0, 0, 1e6));
    expect(forwardCandidate(table, self, FORWARD_KINDS, radius(1))).toBe(far);
    const justAhead = add(table, 14, at(0, 0, Math.fround(5 + 2 ** -20)));
    expect(forwardCandidate(table, self, FORWARD_KINDS, radius(1))).toBe(justAhead);
    const tie = add(table, 2, at(0, 0, Math.fround(5 + 2 ** -20)));
    expect(forwardCandidate(table, self, FORWARD_KINDS, radius(1))).toBe(tie);
  });

  it('needs the lateral offset within the candidate\'s r², the edge included', () => {
    const [table, self] = withSelf();
    const edge = add(table, 7, at(3, 4, 10));
    expect(forwardCandidate(table, self, FORWARD_KINDS, radius(25))).toBe(edge);
    expect(forwardCandidate(table, self, FORWARD_KINDS, radius(Math.fround(25 - 2 ** -19)))).toBeNull();
    const wide = add(table, 8, at(30, 0, 20));
    const byKind = (candidate: Entity): number => (candidate.kindBit === 8 ? 900 : 1);
    expect(forwardCandidate(table, self, FORWARD_KINDS, byKind)).toBe(wide);
  });

  it('uses the self\'s pose: ahead along its third row from its position', () => {
    // Rows (0, 1, 0), (0, 0, 1), (1, 0, 0): forward is +x.
    const facingX = Object.freeze([0, 1, 0, 0, 0, 1, 1, 0, 0]) as unknown as Matrix3;
    const [table, self] = withSelf(at(100, 0, 0), facingX);
    add(table, 7, at(0, 0, 50));
    add(table, 7, at(90, 0, 0));
    const ahead = add(table, 8, at(110, 1, -1));
    expect(forwardCandidate(table, self, FORWARD_KINDS, radius(2))).toBe(ahead);
  });

  it('applies the candidate filter and the mask', () => {
    const [table, self] = withSelf();
    add(table, 7, at(0, 0, 10), { inWarp: true });
    add(table, 7, at(0, 0, 20)).state = 'destroyed-source';
    expect(forwardCandidate(table, self, FORWARD_KINDS, radius(1))).toBeNull();
    const enemy = add(table, 7, at(0, 0, 30));
    expect(forwardCandidate(table, self, FRIENDLY_KINDS, radius(1))).toBeNull();
    expect(forwardCandidate(table, self, FORWARD_KINDS, radius(1))).toBe(enemy);
  });
});
