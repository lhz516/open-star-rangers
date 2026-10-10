import { describe, expect, it } from 'vitest';
import { KeyRepeat } from './key-repeat.ts';

describe('key repeat schedule', () => {
  it('is first due at the press clock + 32 and then at each observed clock + 16', () => {
    const repeat = new KeyRepeat();
    repeat.start('Equal', 100);
    expect(repeat.due(100)).toEqual([]);
    expect(repeat.due(131)).toEqual([]);
    expect(repeat.due(132)).toEqual(['Equal']);
    expect(repeat.due(132)).toEqual([]);
    expect(repeat.due(146)).toEqual([]);
    expect(repeat.due(148)).toEqual(['Equal']);
    // A late frame repeats once and the next due follows the observed clock, not the missed schedule.
    expect(repeat.due(300)).toEqual(['Equal']);
    expect(repeat.due(314)).toEqual([]);
    expect(repeat.due(316)).toEqual(['Equal']);
  });

  it.each([
    ['one tick per frame', [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2], [32, 48]],
    ['frames without ticks between', [0, 2, 0, 0, 30, 0, 0, 16, 0, 2], [32, 48]],
    ['five ticks per frame', [10, 10, 10, 10, 10, 10, 10], [40, 60]],
    ['one frame across many dues', [200, 0, 10, 6], [200, 216]],
  ])('repeats at most once per frame with %s, without catching up', (_name, steps, expected) => {
    const repeat = new KeyRepeat();
    repeat.start('Space', 0);
    const fired: number[] = [];
    let clock = 0;
    for (const step of steps) {
      clock += step;
      fired.push(...repeat.due(clock).map(() => clock));
    }
    expect(fired).toEqual(expected);
  });

  it('gives due keys in the order they started, each with its own schedule', () => {
    const repeat = new KeyRepeat();
    repeat.start('KeyS', 10);
    repeat.start('Equal', 0);
    repeat.start('KeyR', 20);
    expect(repeat.due(42)).toEqual(['KeyS', 'Equal']);
    expect(repeat.due(52)).toEqual(['KeyR']);
    expect(repeat.due(58)).toEqual(['KeyS', 'Equal']);
    repeat.start('KeyS', 58);
    expect(repeat.due(68)).toEqual(['KeyR']);
  });

  it('forgets cancelled keys until they start again from a new clock', () => {
    const repeat = new KeyRepeat();
    repeat.start('Space', 0);
    repeat.start('Equal', 0);
    repeat.cancel('Space');
    expect(repeat.has('Space')).toBe(false);
    expect(repeat.due(40)).toEqual(['Equal']);
    repeat.start('Space', 40);
    expect(repeat.due(71)).toEqual(['Equal']);
    expect(repeat.due(72)).toEqual(['Space']);
    expect(repeat.due(88)).toEqual(['Equal', 'Space']);
    repeat.clear();
    expect(repeat.due(1000)).toEqual([]);
  });
});
