import { describe, expect, it } from 'vitest';
import { CORE_LIMITS } from '../contracts/limits.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, worldInput } from '../world/create-world.test-support.ts';
import { expectFault } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { degreeSlot } from './ai-parameters.ts';
import { drawFloat, drawInteger, loadScript, parseArgument, parsedScript, releaseScript, resetExecution } from './ai-script.ts';
import { RAND_SCALE } from './original-random.ts';
import { scriptedRand } from './rand.test-support.ts';

// P3-08/16 (docs/plan/p3/08/spec.md, 解释器与脚本, AC-04; docs/plan/p3/02/spec.md, CR-17, CR-19; docs/original/formats/
// ai.md §5.1–§5.3, §12). Expectations are worked out from the parser's arithmetic and the cache's count rules, with
// scripted rand values; the synthetic AI programs (create-world.test-support.ts) reach scripts 1 (install), 2 (every
// supported opcode but 1101) and 3 (a draw test and a wait).

const f32 = Math.fround;

function world(): WorldState {
  return initialWorldState(asCreateInput(worldInput({ run: { wingman: 0 } })));
}

describe('integer and float terms (`0x60538`, `0x60688`)', () => {
  it('draws lo + rand % (hi − lo + 1) in i32, a negative divisor giving lo … lo + |d| − 1, and a second draw for the sign', () => {
    expect(drawInteger({ type: 'value', value: -7 }, scriptedRand([]))).toBe(-7);
    expect(drawInteger({ type: 'range', lo: 10, hi: 20, signed: false }, scriptedRand([25]))).toBe(10 + (25 % 11));
    // [5 2]: hi − lo + 1 = −2, and the remainder of a non-negative rand keeps its sign.
    expect([0, 1, 7].map((r) => drawInteger({ type: 'range', lo: 5, hi: 2, signed: false }, scriptedRand([r])))).toEqual([5, 6, 6]);
    // The sign draw negates when bit 1 is set; −2³¹ negates to itself.
    expect(drawInteger({ type: 'range', lo: 1, hi: 4, signed: true }, scriptedRand([2, 2]))).toBe(-3);
    expect(drawInteger({ type: 'range', lo: 1, hi: 4, signed: true }, scriptedRand([2, 5]))).toBe(3);
    expect(drawInteger({ type: 'range', lo: -0x8000_0000, hi: -0x8000_0000, signed: true }, scriptedRand([0, 2]))).toBe(-0x8000_0000);
    // lo + r wraps in i32: [0x7fffffff 0x7fffffff + …] cannot be written, but lo near the top with a remainder wraps.
    expect(drawInteger({ type: 'range', lo: 0x7fff_fffe, hi: -0x7fff_ffff, signed: false }, scriptedRand([3]))).toBe(-0x7fff_ffff);
  });

  it('draws F(D(lo + D(D(r × c) × D(hi − lo)))) from f64 bounds, and flips the f32 sign bit, 0 becoming −0', () => {
    expect(drawFloat({ type: 'value', value: 0.75 }, scriptedRand([]))).toBe(0.75);
    expect(drawFloat({ type: 'range', lo: 0.1, hi: 0.3, signed: false }, scriptedRand([12345]))).toBe(f32(0.1 + 12345 * RAND_SCALE * (0.3 - 0.1)));
    // Reversed bounds interpolate downward.
    expect(drawFloat({ type: 'range', lo: 2, hi: 1, signed: false }, scriptedRand([32767]))).toBe(f32(2 + 32767 * RAND_SCALE * -1));
    expect(drawFloat({ type: 'range', lo: 0.5, hi: 1.5, signed: true }, scriptedRand([0, 6]))).toBe(-0.5);
    expect(Object.is(drawFloat({ type: 'range', lo: 0, hi: 1, signed: true }, scriptedRand([0, 2])), -0)).toBe(true);
  });

  it('parses each class from its plan, a drawn degree value scaled after the draw, multi-value tokens drawn in order', () => {
    expect(parseArgument({ type: 'none' }, scriptedRand([]))).toEqual({ type: 'none' });
    expect(parseArgument({ type: 'float', degrees: true, term: { type: 'value', value: degreeSlot(45) } }, scriptedRand([]))).toEqual({ type: 'float', value: degreeSlot(45) });
    const drawn = f32(10 + 100 * RAND_SCALE * 10);
    expect(parseArgument({ type: 'float', degrees: true, term: { type: 'range', lo: 10, hi: 20, signed: false } }, scriptedRand([100]))).toEqual({ type: 'float', value: degreeSlot(drawn) });
    const rand = scriptedRand([1, 2, 3]);
    expect(parseArgument({ type: 'optional-floats', terms: [{ type: 'value', value: 1 }, null, { type: 'range', lo: 0, hi: 1, signed: true }, { type: 'range', lo: 0, hi: 2, signed: false }] }, rand)).toEqual({
      type: 'optional-floats',
      values: [{ present: true, value: 1 }, { present: false, value: 0 }, { present: true, value: -f32(RAND_SCALE) }, { present: true, value: f32(3 * RAND_SCALE * 2) }],
    });
    expect(rand.used).toBe(3);
    expect(parseArgument({ type: 'floats', terms: [{ type: 'value', value: 1 }, { type: 'range', lo: 0, hi: 1, signed: false }, { type: 'value', value: 3 }] }, scriptedRand([9]))).toEqual({
      type: 'floats', values: [1, f32(9 * RAND_SCALE), 3],
    });
  });
});

describe('the shared parse cache (`0x5e940`, `0x5e9a8`; ai §5.2)', () => {
  /** The six draws of script 2's first parse, and its expected arguments (create-world.test-support.ts, everyOpcodeScript). */
  const DRAWS = [100, 2, 30, 7, 60, 200];
  const parsedEveryOpcode = (draws: readonly number[]) => [
    { type: 'optional-floats', values: [{ present: true, value: 1 }, { present: false, value: 0 }, { present: true, value: (draws[1] & 2) !== 0 ? -f32(0.5 + draws[0] * RAND_SCALE) : f32(0.5 + draws[0] * RAND_SCALE) }, { present: true, value: 2 }] },
    { type: 'float', value: 0.75 }, { type: 'none' }, { type: 'none' }, { type: 'floats', values: [1, 2, 3] },
    { type: 'integer', value: 1 }, { type: 'float', value: 1.5 }, { type: 'float', value: -2 }, { type: 'integer', value: 0 },
    { type: 'integer', value: 0 }, { type: 'integer', value: 1 }, { type: 'integer', value: 10 + (draws[2] % 11) },
    { type: 'integer', value: 3 }, { type: 'integer', value: 1 }, { type: 'integer', value: 32 }, { type: 'integer', value: 1 + (draws[3] % 4) },
    { type: 'integer', value: 0 }, { type: 'integer', value: 16 + (draws[4] % 49) }, { type: 'float', value: degreeSlot(45) },
    { type: 'float', value: degreeSlot(f32(10 + draws[5] * RAND_SCALE * 10)) }, { type: 'float', value: degreeSlot(5) },
    { type: 'none' }, { type: 'integer', value: 1 }, { type: 'integer', value: 0 },
  ];

  it('parses every item at the first load with its draws in item and token order, and resets the execution state', () => {
    const state = world();
    const rand = scriptedRand(DRAWS);
    const execution = loadScript(state, 2, rand);
    expect(rand.used).toBe(6);
    expect(execution).toEqual({ script: 2, item: 0, variables: [0, 0, 0, 0], timers: [0, 0, 0, 0], returnStack: [], wait: { active: false, until: 0 }, hold: { active: false, until: 0 } });
    expect(state.ai.parseCache).toEqual([{ script: 2, uses: 1, items: parsedEveryOpcode(DRAWS) }]);
  });

  it('shares a cached parse without drawing; each execution state is its own; the last release drops it and the next load draws again', () => {
    const state = world();
    const first = loadScript(state, 2, scriptedRand(DRAWS));
    const second = loadScript(state, 2, scriptedRand([]));
    expect(second).not.toBe(first);
    expect(parsedScript(state, 2).uses).toBe(2);
    first.item = 5;
    expect(second.item).toBe(0);
    releaseScript(state, first);
    expect(state.ai.parseCache).toEqual([{ script: 2, uses: 1, items: parsedEveryOpcode(DRAWS) }]);
    releaseScript(state, second);
    expect(state.ai.parseCache).toEqual([]);
    const redrawn = [5, 0, 1, 2, 3, 4];
    const rand = scriptedRand(redrawn);
    loadScript(state, 2, rand);
    expect(rand.used).toBe(6);
    expect(parsedScript(state, 2).items).toEqual(parsedEveryOpcode(redrawn));
  });

  it('keeps the cache in ascending script order, one entry a script, with no draw for a script without ranges', () => {
    const state = world();
    loadScript(state, 3, scriptedRand([]));
    loadScript(state, 1, scriptedRand([]));
    loadScript(state, 2, scriptedRand(DRAWS));
    expect(state.ai.parseCache.map(({ script, uses }) => [script, uses])).toEqual([[1, 1], [2, 1], [3, 1]]);
    expect(parsedScript(state, 3).items).toEqual([{ type: 'integer', value: 50 }, { type: 'integer', value: 8 }, { type: 'integer', value: 0 }]);
  });

  it('resets an execution state to its first item without touching the cache (`0x5e9d8`)', () => {
    const state = world();
    const execution = loadScript(state, 3, scriptedRand([]));
    Object.assign(execution, { item: 2, returnStack: [1], wait: { active: true, until: 9 }, hold: { active: true, until: 4 } });
    resetExecution(execution);
    expect(execution).toEqual({ script: 3, item: 0, variables: [0, 0, 0, 0], timers: [0, 0, 0, 0], returnStack: [], wait: { active: false, until: 0 }, hold: { active: false, until: 0 } });
    expect(parsedScript(state, 3).uses).toBe(1);
  });

  it('faults on a script outside the support closure, a release of what is not loaded, and past its bounds (CR-25)', () => {
    const state = world();
    expectFault(() => loadScript(state, 5, scriptedRand([])), 'invariant-violated', 'ai-script.script');
    expectFault(() => releaseScript(state, { script: 3 } as never), 'invariant-violated', 'ai-script.not-loaded');
    loadScript(state, 3, scriptedRand([]));
    state.ai.parseCache[0].uses = CORE_LIMITS.entities + 1;
    expectFault(() => loadScript(state, 3, scriptedRand([])), 'invariant-violated', 'ai-script.uses');
    // The closure has three scripts: a fourth entry cannot come from a supported load.
    state.ai.parseCache.splice(0, 1, { script: 0, uses: 1, items: [] }, { script: 2, uses: 1, items: [] }, { script: 3, uses: 1, items: [] });
    expectFault(() => loadScript(state, 1, scriptedRand([])), 'invariant-violated', 'ai-script.cache');
  });
});
