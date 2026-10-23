import { describe, expect, it } from 'vitest';
import type { RuntimeRecord } from '../world/spawn-state.ts';
import { stillEntityInit, testState } from '../world/world.test-support.ts';
import { replaceRescueRecord, rescueMovementBlock, rescuePoint, selectRescueBase } from './rescue.ts';
import type { RandSource } from './original-random.ts';

// docs/plan/p3/02/spec.md, ME-06, ME-10 (steps 6, 7 and 10) and ME-17 decision 7; docs/original/formats/executable.md,
// rescue 0x32e14 and 0x67b98 and numbers on the flow and rescue paths (P3-11/02). Expectations come from those records:
// the base kinds are bits 15, 17 and 18; the pick is r % count for r ∈ [0, 32767]; the rescue point is the base's
// position with z := F(z + 2000); the throttle is chop(F(speed ÷ +0xB8) × 128) and its table index 64 + (throttle >> 1)
// must lie in the 129-entry table.

/** A rand source that yields `values` in order and counts its draws. */
function scripted(...values: number[]): RandSource & { readonly draws: () => number } {
  let drawn = 0;
  return {
    next() {
      if (drawn >= values.length) throw new Error('unexpected draw');
      return values[drawn++];
    },
    draws: () => drawn,
  };
}

const RAND_VALUES = 32768;

describe('the base selection of 0x67b98 (ME-10 step 6)', () => {
  it('draws nothing and chooses no base without a base-class entity; other kinds never count', () => {
    const state = testState();
    for (const kindBit of [0, 1, 7, 14, 16, 19]) state.entities.allocate(stillEntityInit(kindBit));
    const rand = scripted();
    expect(selectRescueBase(state.entities, rand)).toEqual({ base: null, candidates: 0 });
    expect(rand.draws()).toBe(0);
  });

  it('walks bits 15, 17, 18 in ascending order and allocation order, whatever the state, activity, dead flag or removal', () => {
    const state = testState();
    const base18 = state.entities.allocate(stillEntityInit(18));
    const parked15 = state.entities.allocate(stillEntityInit(15, { activity: 'parked', movement: null }));
    state.entities.allocate(stillEntityInit(16));
    const removed17 = state.entities.allocate(stillEntityInit(17));
    removed17.state = 'pending-removal';
    const dead15 = state.entities.allocate(stillEntityInit(15));
    dead15.destroyed = true;
    dead15.activity = 'docked';
    const fresh17 = state.entities.allocate(stillEntityInit(17));
    expect(fresh17.state).toBe('presentation-ready');
    const order = [parked15, dead15, removed17, fresh17, base18];
    for (const [r, expected] of [[0, 0], [4, 4], [7, 2], [32767, 2]] as const) {
      const rand = scripted(r);
      expect(selectRescueBase(state.entities, rand)).toEqual({ base: order[expected], candidates: 5 });
      expect(rand.draws()).toBe(1);
    }
  });

  it('maps the rand range by r % count, not uniformly: the recorded preimage counts for 1 to 4 candidates', () => {
    const preimages: Record<number, number[]> = { 1: [32768], 2: [16384, 16384], 3: [10923, 10923, 10922], 4: [8192, 8192, 8192, 8192] };
    for (const count of [1, 2, 3, 4]) {
      const state = testState();
      const bases = Array.from({ length: count }, () => state.entities.allocate(stillEntityInit(17)));
      const tally = bases.map(() => 0);
      for (let r = 0; r < RAND_VALUES; r++) tally[bases.indexOf(selectRescueBase(state.entities, scripted(r)).base!)]++;
      expect(tally).toEqual(preimages[count]);
    }
  });
});

describe('the rescue point and the player record (ME-06, ME-10 step 7)', () => {
  it('is the base position with z raised by 2000 in one f32 rounding; the zero vector without a base', () => {
    const state = testState();
    const base = state.entities.allocate(stillEntityInit(17, { position: { x: -0, y: 512.5, z: Math.fround(0.1) } }));
    const point = rescuePoint(base);
    // F(F(0.1) + 2000): the f64 sum 2000.1000000014901 rounds to the f32 2000.0999755859375; x keeps its sign bit.
    expect(point).toEqual({ x: -0, y: 512.5, z: 2000.0999755859375 });
    expect(Object.is(point.x, -0)).toBe(true);
    expect(Object.isFrozen(point)).toBe(true);
    expect(rescuePoint(null)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('rewrites only the record\'s position, rectangle and anchor, in place', () => {
    const record: RuntimeRecord = {
      declaration: { collection: 'mission', index: 0 },
      position: { x: 1, y: 2, z: 3 },
      region: { x0: -10, y0: -10, x1: 10, y1: 10 },
      anchor: 4,
      gridSpacing: 0,
      ruleInputs: { percentA: 100, craftCount: 1, percentB: 100, percentC: 90, percentD: 80, aiValueA: 1, aiValueB: 2, aiValueC: 3 },
      aiTarget: 5,
      aiTargetCraftTypes: [7],
      spawnCount: 1,
    };
    const before = structuredClone(record);
    const point = Object.freeze({ x: 7, y: 8, z: 9 });
    replaceRescueRecord(record, point);
    expect(record).toEqual({ ...before, position: point, region: null, anchor: null });
  });
});

describe('the movement block after a rescue (ME-10 step 10, ME-17 decision 7)', () => {
  const BASE = 96;
  const MAXIMUM = 48;

  it('takes the throttle from the old speed ratio, an odd throttle acting as the even one below', () => {
    // 24 ÷ 96 = 0.25 → throttle 32 → entry 64 + 16 = 80, 16 steps of 1/64: 0.25 of the maximum, 12.
    expect(rescueMovementBlock({ speed: 24 }, MAXIMUM, BASE)).toEqual({
      mode: 'craft', speed: 12, commandedSpeed: 12, atCommandedSpeed: true, speedRatio: 0.125,
      steering: { pitch: { rate: 0, enabled: false }, yaw: { rate: 0, enabled: false }, roll: { rate: 0, enabled: false } },
      timedRotation: { pitch: null, yaw: null, roll: null }, impulse: null, locked: false, disturbance: null,
    });
    // 25 ÷ 96 → F(0.260416…) × 128 = 33.33… → throttle 33 → entry 80 as well.
    expect(rescueMovementBlock({ speed: 25 }, MAXIMUM, BASE).speed).toBe(12);
    // A reverse speed: −0.25 → throttle −32 → entry 48, −0.25 of the maximum.
    expect(rescueMovementBlock({ speed: -24 }, MAXIMUM, BASE).speed).toBe(-12);
    // A base of 0 gives a ratio 0, throttle 0.
    expect(rescueMovementBlock({ speed: 24 }, MAXIMUM, 0).speed).toBe(0);
  });

  it('accepts the table\'s ends and faults one entry beyond them, without clamping (gap G-2)', () => {
    // 96.75 ÷ 96 = 1.0078125 → 129 → entry 128, the last (1.0); 97.5 ÷ 96 = 1.015625 → 130 → entry 129, beyond.
    expect(rescueMovementBlock({ speed: 96.75 }, MAXIMUM, BASE).speed).toBe(MAXIMUM);
    expect(() => rescueMovementBlock({ speed: 97.5 }, MAXIMUM, BASE)).toThrow(expect.objectContaining({ code: 'invariant-violated', site: 'rescue.throttle' }));
    // −96 → −128 → entry 0, the first (−1.0); −96.75 → −129 → entry 64 + (−65) = −1, beyond.
    expect(rescueMovementBlock({ speed: -96 }, MAXIMUM, BASE).speed).toBe(-MAXIMUM);
    expect(() => rescueMovementBlock({ speed: -96.75 }, MAXIMUM, BASE)).toThrow(expect.objectContaining({ site: 'rescue.throttle' }));
  });
});
