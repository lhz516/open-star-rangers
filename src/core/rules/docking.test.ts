import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { EntityInit, Matrix3, ObjectState } from '../world/entity-table.ts';
import { stillEntityInit, testState } from '../world/world.test-support.ts';
import {
  dockingWaitStep, findDockingBase, findDockingWingman, isDockingSubState, isValidDockingObject, launchPose, launchViewMode, type DockingSubState, serviceRows,
  serviceState, setUpBaseService, wingmanHead, withinDockingRange,
} from './docking.ts';

const ORIGIN: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });
const at = (x: number): Vec3 => ({ x, y: 0, z: 0 });
/** The f32 just below 1000. */
const BELOW_1000 = 1000 - 2 ** -14;

function entities(...inits: [number, Partial<EntityInit>][]) {
  const state = testState();
  const allocated = inits.map(([kindBit, overrides]) => state.entities.allocate(stillEntityInit(kindBit, overrides)));
  return { table: state.entities, allocated };
}

describe('the docking range (DK5)', () => {
  it('is strict: 1000 units fails, the f32 below passes, on any axis', () => {
    expect(withinDockingRange(ORIGIN, at(1000))).toBe(false);
    expect(withinDockingRange(ORIGIN, at(BELOW_1000))).toBe(true);
    expect(withinDockingRange(at(-600), { x: 0, y: 800, z: 0 })).toBe(false);
    expect(withinDockingRange(ORIGIN, { x: 0, y: 0, z: -BELOW_1000 })).toBe(true);
  });

  it('lets an unordered sum pass, as the masked x87 compare does', () => {
    expect(withinDockingRange(ORIGIN, at(Number.NaN))).toBe(true);
  });
});

describe('the docking object test (DK1)', () => {
  it.each<[ObjectState, boolean]>([
    ['active', true], ['projectile-hit', true], ['new', false], ['presentation-ready', false], ['area-switch', false],
    ['pending-removal', false], ['destroyed-source', false],
  ])('takes state %s as %s, whatever the activity and dead flag', (state, valid) => {
    const { allocated: [base] } = entities([17, {}]);
    base.activity = 'docked';
    base.state = state;
    base.destroyed = true;
    expect(isValidDockingObject(base)).toBe(valid);
  });

  it('takes an object that no longer resolves as invalid', () => {
    expect(isValidDockingObject(undefined)).toBe(false);
  });
});

describe('the per-tick wait check (DK1, DK5)', () => {
  it('owns sub-states 3, 4 and 5 only', () => {
    expect([0, 3, 4, 5].map((subState) => isDockingSubState(subState as 0 | 3 | 4 | 5))).toEqual([false, true, true, true]);
  });

  it.each<[DockingSubState, boolean, number, string]>([
    [3, true, 99, 'none'],
    [3, true, 100, 'time-out'],
    [3, true, 101, 'time-out'],
    [3, false, 0, 'release'],
    [3, false, 100, 'release'],
    [4, true, 99, 'none'],
    [4, true, 100, 'dock'],
    [4, true, 200, 'dock'],
    [4, false, 100, 'release'],
    [5, true, 1e6, 'none'],
    [5, false, 0, 'launch'],
  ])('in sub-state %s with a valid object %s at previous clock %s against deadline 100: %s', (subState, valid, clock, step) => {
    expect(dockingWaitStep(subState, valid, clock, 100)).toBe(step);
  });
});

describe('the execution search 0x3959c (DK2 step 1)', () => {
  it('finds nothing in the Warp views 0 and 1, and the base in the others', () => {
    const { table, allocated: [base] } = entities([17, { position: at(100) }]);
    expect(findDockingBase(table, ORIGIN, 0)).toBeNull();
    expect(findDockingBase(table, ORIGIN, 1)).toBeNull();
    for (const view of [2, 6, 8, 0xc]) expect(findDockingBase(table, ORIGIN, view)).toBe(base);
  });

  it('returns the first base in walk order, not the nearest: lower kind bit first, then allocation order', () => {
    const { table, allocated: [, farLowBit] } = entities([17, { position: at(100) }], [15, { position: at(900) }]);
    expect(findDockingBase(table, ORIGIN, 0xc)).toBe(farLowBit);
    const same = entities([18, { position: at(900) }], [18, { position: at(10) }]);
    expect(findDockingBase(same.table, ORIGIN, 0xc)).toBe(same.allocated[0]);
  });

  it('skips bases that are not active or are at the range or beyond, and other kinds; state and dead flag are not read', () => {
    const { table, allocated } = entities(
      [15, { position: at(10) }],
      [15, { position: at(10), activity: 'parked', movement: null }],
      [17, { position: at(1000) }],
      [16, { position: at(10) }],
      [18, { position: at(BELOW_1000) }],
    );
    allocated[0].activity = 'docked';
    const found = allocated[4];
    found.state = 'pending-removal';
    found.destroyed = true;
    expect(findDockingBase(table, ORIGIN, 0xc)).toBe(found);
  });

  it('finds nothing when no base qualifies', () => {
    const { table } = entities([17, { position: at(1000) }]);
    expect(findDockingBase(table, ORIGIN, 0xc)).toBeNull();
  });
});

describe('the docking wingman (DK2 step 5)', () => {
  it('takes the head of the wingman list when it is active and strictly within range of the saved position', () => {
    const base = at(5000);
    const { table, allocated: [wingman] } = entities([1, { position: at(5000 + BELOW_1000) }]);
    expect(findDockingWingman(table, base)).toBe(wingman);
    expect(findDockingWingman(table, ORIGIN)).toBeNull();
    wingman.position = at(6000);
    expect(findDockingWingman(table, base)).toBeNull();
  });

  it('looks at the head only: a later wingman in range is not taken', () => {
    const { table } = entities([1, { position: at(2000) }], [1, { position: at(0) }]);
    expect(findDockingWingman(table, ORIGIN)).toBeNull();
  });

  it('takes no head whose activity is not exactly active, and reads neither state nor dead flag', () => {
    const { table, allocated: [wingman] } = entities([1, { position: at(10) }]);
    wingman.activity = 'docked';
    expect(findDockingWingman(table, ORIGIN)).toBeNull();
    wingman.activity = 'active';
    wingman.state = 'pending-removal';
    wingman.destroyed = true;
    expect(findDockingWingman(table, ORIGIN)).toBe(wingman);
  });

  it('finds nothing without a wingman', () => {
    expect(findDockingWingman(entities().table, ORIGIN)).toBeNull();
  });
});

describe('the service set-up 0x39664 (BS2, BS3)', () => {
  const fields = (writes: Record<number, number>): number[] => Array.from({ length: 19 }, (_, field) => writes[field] ?? 0);

  it('reads a single field as stored', () => {
    expect(serviceState(fields({ 5: 3, 9: 1 }), 5)).toBe(3);
    expect(serviceState(fields({ 5: 3, 9: 1 }), 9)).toBe(1);
    expect(serviceState(fields({ 5: 3, 9: 1 }), 0)).toBe(0);
  });

  it.each<[number, Record<number, number>, number]>([
    [33, { 15: 2 }, 1],
    [33, { 15: 2, 16: 2 }, 2],
    [33, { 18: 1 }, 1],
    [33, { 15: 1, 16: 1, 17: 1, 18: 1 }, 1],
    [33, { 15: 1, 16: 2, 17: 3, 18: 3 }, 3],
    [33, { 10: 3 }, 0],
    [34, { 10: 2, 11: 2, 12: 2, 13: 2, 14: 2 }, 2],
    [34, { 14: 3 }, 1],
    [34, { 10: 1, 11: 3, 12: 3, 13: 3 }, 3],
  ])('counts group %s over %o as %s, not the maximum', (selector, writes, state) => {
    expect(serviceState(fields(writes), selector)).toBe(state);
  });

  it('keeps record order among equal states, record 0 included', () => {
    expect(serviceRows([0, 33, 34, 5, 7, 8, 1, 2, 18, 3, 9], fields({}))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('orders the records by state descending, ties in record order', () => {
    // States by record: 0 → 1, 1 (33) → 1, 2 (34) → 2, 3 (5) → 3, 4 (7) → 0, 5 (8) → 2, 6 (1) → 0, 7 (2) → 1, 8 (18) → 1,
    // 9 (3) → 0, 10 (9) → 3.
    const subsystems = fields({ 0: 1, 18: 1, 10: 2, 11: 2, 5: 3, 8: 2, 2: 1, 9: 3 });
    expect(serviceRows([0, 33, 34, 5, 7, 8, 1, 2, 18, 3, 9], subsystems)).toEqual([3, 10, 2, 5, 0, 1, 7, 8, 4, 6, 9]);
  });

  it('puts a record above row 0 when it needs more service', () => {
    expect(serviceRows([0, 1, 2], fields({ 2: 1 }))).toEqual([2, 0, 1]);
  });

  it('sets the cursor on row 0, the three dues from the sample, the rates by truncating division and no flag', () => {
    const service = setUpBaseService(1000, { at9C: 1019, at54: 959 }, [0, 1], fields({}));
    expect(service).toEqual({
      rows: [0, 1],
      cursor: 0,
      dues: { repair: 1000 + 0x200, hull: 1000 + 0x40, energy: 1004 },
      rates: { hull: 16, energy: 3 },
      flags: { repairsComplete: false, energyAndMissilesFull: false, hullFull: false },
    });
    expect(setUpBaseService(0, { at9C: 59, at54: 0 }, [0], fields({})).rates).toEqual({ hull: 0, energy: 0 });
  });
});

describe('the launch view (DK3 step 4)', () => {
  it.each([[6, 0xc], [8, 0xc], [0, 0xc], [1, 0xc], [0xb, 0xc], [0xc, 0xc], [0xd, 0xd], [0x13, 0x13]])('restores previous view %i as %i', (previous, view) => {
    expect(launchViewMode(previous)).toBe(view);
  });
});

describe('the launch pose (DK3 step 7, DK5)', () => {
  /** Rows r1 = (1, 0, 0), r2 = (0, 0, −1), r3 = (0, 1, 0): a base turned about row 1. */
  const BASE_ROWS = Object.freeze([1, 0, 0, 0, 0, -1, 0, 1, 0]) as unknown as Matrix3;
  const determinant = ([a, b, c, d, e, f, g, h, i]: Matrix3): number => a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);

  it('leaves 1000 units along the saved row 1, facing along it: row 1 −r3, row 2 r2, row 3 r1', () => {
    const pose = launchPose({ position: { x: 300, y: -400, z: 120 }, orientation: BASE_ROWS });
    expect(pose).toEqual({ position: { x: 1300, y: -400, z: 120 }, orientation: [-0, -1, -0, 0, 0, -1, 1, 0, 0] });
    // A quarter turn about row 2 keeps a rotation a rotation.
    expect(determinant(pose.orientation)).toBe(1);
    expect(Object.isFrozen(pose) && Object.isFrozen(pose.position) && Object.isFrozen(pose.orientation)).toBe(true);
  });

  it('turns another quarter on a second launch, now leaving along −r3', () => {
    const twice = launchPose(launchPose({ position: { x: 0, y: 0, z: 0 }, orientation: BASE_ROWS }));
    expect(twice).toEqual({ position: { x: 1000, y: -1000, z: 0 }, orientation: [-1, -0, -0, 0, 0, -1, -0, -1, -0] });
  });

  it('stores the product to f32 before the sum, and the sum to f32', () => {
    // r1x × 1000 = −995.787918567657…: F(p + F(product)) is 1627.012939453125, not the 1627.0128173828125 of one rounding.
    const pose = launchPose({ position: { x: 2622.80078125, y: 0.1, z: 0 }, orientation: [-0.9957879185676575, 0, 0, 0, 1, 0, 0, 0, 1] });
    expect(pose.position).toEqual({ x: 1627.012939453125, y: Math.fround(0.1), z: 0 });
  });
});

describe('the wingman list\'s head', () => {
  it('is the first wingman in allocation order whatever its activity and state, or none', () => {
    expect(wingmanHead(entities([17, {}]).table)).toBeNull();
    const { table, allocated: [, first] } = entities([17, {}], [1, {}], [1, {}]);
    first.activity = 'docked';
    first.state = 'pending-removal';
    expect(wingmanHead(table)).toBe(first);
  });
});
