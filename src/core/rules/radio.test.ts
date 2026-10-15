import { describe, expect, it } from 'vitest';
import { CoreFaultError } from '../errors.ts';
import type { CommunicationsRuleData } from '../world/comm-input.ts';
import type { RadioItem } from '../world/world-state.ts';
import { assignFace, elapsedEighths, insertionIndex, lookupMessage, messageFrames, playbackFrame, takesRadio } from './radio.ts';

// Expectations written out from docs/original/formats/executable.md RQ3–RQ5 and RQ10 and docs/plan/p3/02/spec.md CB-05,
// CB-09 and CB-12, not from the code under test.

const item = (due: number, index: number): RadioItem => ({ message: { table: 20983, face: null, index }, due, callback: 'none', speaker: null });

describe('insertion order (RQ3 `0x2c740`; CB-05)', () => {
  const queue = [item(4, 0), item(6, 1), item(6, 2), item(10, 3)];

  it('puts an item before the first one due later, so equal dues stay first in, first out', () => {
    expect(insertionIndex(queue, 6, false)).toBe(3);
    expect(insertionIndex(queue, 5, false)).toBe(1);
    expect(insertionIndex(queue, 4, false)).toBe(1);
    expect(insertionIndex(queue, 3, false)).toBe(0);
    expect(insertionIndex(queue, 12, false)).toBe(4);
    expect(insertionIndex([], 12, false)).toBe(0);
  });

  it('puts a head item before the current head whatever its due', () => {
    expect(insertionIndex(queue, 12, true)).toBe(0);
    expect(insertionIndex([], 0, true)).toBe(0);
  });
});

describe('the take gate `0x3336c` (RQ3; CB-02)', () => {
  it('holds in main-flow state 3 for every sub-state but 2', () => {
    for (const subState of [0, 3, 4, 5] as const) expect(takesRadio({ mainState: 3, subState })).toBe(true);
    // Sub-state 2 belongs to P3-11; the gate already holds the queue there.
    expect(takesRadio({ mainState: 3, subState: 2 as never })).toBe(false);
    expect(takesRadio({ mainState: 2 as never, subState: 0 })).toBe(false);
  });
});

describe('message lookup `0x3c618` (RQ4; CB-12)', () => {
  const messages: CommunicationsRuleData['messages'] = {
    faceTables: { 20011: [[[3, 9], null], [[6]]], 20019: [[null, [1, 1]]], 20985: [[null], [[4, 0, 5]]] },
    direct: [[5], null, [0]],
  };

  it('finds an entry of a face sub-table or of the direct list', () => {
    expect(lookupMessage(messages, 20011, 0, 0)).toEqual([3, 9]);
    expect(lookupMessage(messages, 20011, 1, 0)).toEqual([6]);
    expect(lookupMessage(messages, 20985, 1, 0)).toEqual([4, 0, 5]);
    expect(lookupMessage(messages, 20983, 0, 2)).toEqual([0]);
  });

  it('finds nothing for no face, a negative face, a face past the sub-tables, an index past the sub-table or an entry of 0', () => {
    expect(lookupMessage(messages, 20011, null, 0)).toBeNull();
    expect(lookupMessage(messages, 20011, -1, 0)).toBeNull();
    expect(lookupMessage(messages, 20983, -1, 0)).toBeNull();
    expect(lookupMessage(messages, 20011, 2, 0)).toBeNull();
    expect(lookupMessage(messages, 20019, 0, 2)).toBeNull();
    expect(lookupMessage(messages, 20011, 0, 1)).toBeNull();
    expect(lookupMessage(messages, 20983, 0, 1)).toBeNull();
    expect(lookupMessage(messages, 20983, 0, 3)).toBeNull();
  });

  it('takes a queued message that no longer resolves as a broken invariant', () => {
    expect(messageFrames(messages, { table: 20019, face: 0, index: 1 })).toEqual([1, 1]);
    expect(() => messageFrames(messages, { table: 20019, face: 0, index: 0 })).toThrow(CoreFaultError);
  });
});

describe('face assignment `0x3c91c` (RQ4)', () => {
  const draws = (...values: number[]) => {
    const taken: number[] = [];
    return { rand: () => {
      const value = values[taken.length];
      if (value === undefined) throw new Error('drew too often');
      taken.push(value);
      return value;
    }, taken };
  };

  it('takes rand % n when that face is free: one draw', () => {
    const flags = [false, false, false, false, false];
    const { rand, taken } = draws(32767);
    expect(assignFace(flags, rand)).toBe(32767 % 5);
    expect(taken).toEqual([32767]);
    expect(flags).toEqual([false, false, true, false, false]);
  });

  it('takes the first free face when rand % n is taken, still one draw', () => {
    const flags = [true, false, true];
    const { rand, taken } = draws(5);
    expect(assignFace(flags, rand)).toBe(1);
    expect(taken).toHaveLength(1);
    expect(flags).toEqual([true, true, true]);
  });

  it('draws again when every face is taken', () => {
    const flags = [true, true, true];
    const { rand, taken } = draws(0, 7);
    expect(assignFace(flags, rand)).toBe(1);
    expect(taken).toEqual([0, 7]);
    expect(flags).toEqual([true, true, true]);
  });
});

describe('playback (RQ5, RQ10; CB-09)', () => {
  it('counts eighths of a second as ((Δ × 8) mod 2³²) >> 6', () => {
    expect(elapsedEighths(6, 6)).toBe(0);
    expect(elapsedEighths(13, 6)).toBe(0);
    expect(elapsedEighths(14, 6)).toBe(1);
    expect(elapsedEighths(6 + 144, 6)).toBe(18);
    // The ×8 wraps at 2³²: Δ = 2²⁹ is 0 again, 2²⁹ + 8 one eighth.
    expect(elapsedEighths(2 ** 29, 0)).toBe(0);
    expect(elapsedEighths(2 ** 29 + 8, 0)).toBe(1);
    expect(elapsedEighths(2 ** 29 - 8, 0)).toBe(2 ** 26 - 1);
  });

  it('faults for a clock before the start or more than 2³² − 1 units after it', () => {
    expect(() => elapsedEighths(5, 6)).toThrow(CoreFaultError);
    expect(() => elapsedEighths(2 ** 32, 0)).toThrow(CoreFaultError);
    expect(elapsedEighths(2 ** 32 - 1, 0)).toBe(((2 ** 32 - 8) >>> 0) >>> 6);
  });

  it('consumes the frames in turn and ends once e reaches their sum: the baseline 5 + 8 + 5 at 18', () => {
    const frames = [5, 8, 5];
    expect([0, 4, 5, 12, 13, 17, 18, 40].map((elapsed) => playbackFrame(elapsed, frames))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(playbackFrame(0, [0])).toBe(1);
    expect(playbackFrame(3, [4, 0, 5])).toBe(0);
    expect(playbackFrame(4, [4, 0, 5])).toBe(2);
  });
});
