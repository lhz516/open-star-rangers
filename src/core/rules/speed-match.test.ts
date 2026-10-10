import { describe, expect, it } from 'vitest';
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { craft } from '../../content/rule-data/rule-data.test-support.ts';
import type { SteeredMovementBlock } from '../world/entity-table.ts';
import { expectFault } from '../world/world.test-support.ts';
import { craftMovementBlock, FULL_THROTTLE } from './flight-state.ts';
import {
  applySpeedMatch,
  ASSIST_INTERVAL,
  isAssistKind,
  matchedSpeed,
  nextAssistDue,
  speedDifferenceExceeded,
  speedMatch,
  squaredDistance,
  withinAssistRange,
} from './speed-match.ts';

// Expectations are written out from docs/original/formats/executable.md (throttle, maximum speed and speed matching,
// P3-06/03: manual match and `0x21adc`, speed assist) and docs/plan/p3/06/spec.md (匹配速度与速度辅助); none is computed
// with the code under test.

const RECORD = craft() as unknown as CraftRecord;
const MAXIMUM = 48;
/** A block at full throttle: speed = commanded speed = 48, arrived. */
const block = (overrides: Partial<SteeredMovementBlock> = {}): SteeredMovementBlock => ({ ...craftMovementBlock(FULL_THROTTLE, MAXIMUM, 96), ...overrides });
const target = (speed: number) => ({ speed });

describe('the shared match 0x21adc (P3-06 AC-05, 匹配速度与速度辅助)', () => {
  it.each([
    ['within the range', 30, 30],
    ['at zero', 0, 0],
    ['at the maximum', 48, 48],
    ['above the maximum', 60, 48],
    ['negative', -5, 0],
    ['an f32 just above the maximum', 48.000003814697266, 48],
  ])('clamps a target speed %s into [0, the subject maximum]', (_, speed, matched) => {
    expect(matchedSpeed(speed, MAXIMUM)).toBe(matched);
  });

  it('keeps a target speed of −0, which is neither below 0 nor above the maximum', () => {
    expect(Object.is(matchedSpeed(-0, MAXIMUM), -0)).toBe(true);
  });

  it('writes the commanded speed of a craft block and clears its arrival, leaving the current speed', () => {
    const subject = block();
    expect(applySpeedMatch(subject, RECORD, MAXIMUM, target(30))).toBe(true);
    expect([subject.commandedSpeed, subject.atCommandedSpeed, subject.speed]).toEqual([30, false, 48]);
  });

  it('writes the current speed of a block in any other mode, leaving the commanded speed and the arrival', () => {
    const subject = block({ mode: 'warp' });
    expect(applySpeedMatch(subject, RECORD, MAXIMUM, target(70))).toBe(true);
    expect([subject.speed, subject.commandedSpeed, subject.atCommandedSpeed]).toEqual([48, 48, true]);
    expect(applySpeedMatch(subject, RECORD, MAXIMUM, target(12))).toBe(true);
    expect(subject.speed).toBe(12);
  });

  it('ignores the lock', () => {
    const subject = block({ locked: true });
    expect(applySpeedMatch(subject, RECORD, MAXIMUM, target(30))).toBe(true);
    expect(subject.commandedSpeed).toBe(30);
  });

  it.each([
    ['the subject has no block', null, RECORD, target(30)],
    ['the subject has no craft record', block(), undefined, target(30)],
    ['the target has no block', block(), RECORD, null],
  ] as const)('fails and writes nothing when %s', (_, subject, record, targetBlock) => {
    const before = structuredClone(subject);
    expect(speedMatch(subject, record, MAXIMUM, targetBlock)).toBeNull();
    expect(applySpeedMatch(subject, record, MAXIMUM, targetBlock)).toBe(false);
    expect(subject).toEqual(before);
  });

  it('predicts what it writes', () => {
    expect(speedMatch(block(), RECORD, MAXIMUM, target(60))).toBe(48);
    expect(speedMatch(block({ locked: true }), RECORD, MAXIMUM, target(20))).toBe(20);
  });
});

describe('speed assist conditions (P3-06 AC-05, 匹配速度与速度辅助)', () => {
  it('matches only kind bits 7, 8 and 9 (mask 0x380)', () => {
    const kinds = Array.from({ length: 32 }, (_, kindBit) => kindBit).filter(isAssistKind);
    expect(kinds).toEqual([7, 8, 9]);
  });

  it('squares the distance with one factor of each term rounded to f32', () => {
    expect(squaredDistance({ x: 3, y: -4, z: 12 }, { x: 0, y: 0, z: 0 })).toBe(169);
    expect(squaredDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: -4, z: 12 })).toBe(169);
    // d = 1 + 2^-30 rounds to f32 1, so the term is d × 1 = 1 + 2^-30, where d² would round to 1 + 2^-29.
    const d = 1 + 2 ** -30;
    expect(squaredDistance({ x: d, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(1 + 2 ** -30);
  });

  it('matches within the range of 300, equality included', () => {
    const origin = { x: 0, y: 0, z: 0 };
    expect(withinAssistRange(origin, { x: 0, y: 0, z: 300 })).toBe(true);
    expect(withinAssistRange(origin, { x: 100, y: -200, z: 200 })).toBe(true);
    expect(withinAssistRange(origin, { x: 0, y: 0, z: 300 + 2 ** -20 })).toBe(false);
    // 200 + 2^-16 is an f32, so its term is its exact square, above 40,000.
    expect(withinAssistRange(origin, { x: 100, y: 200, z: 200 + 2 ** -16 })).toBe(false);
    expect(withinAssistRange(origin, { x: 0, y: 0, z: 300 - 2 ** -20 })).toBe(true);
  });

  it('flags a speed difference strictly above 10', () => {
    expect(speedDifferenceExceeded(48, 38)).toBe(false);
    expect(speedDifferenceExceeded(38, 48)).toBe(false);
    expect(speedDifferenceExceeded(48, 37.5)).toBe(true);
    expect(speedDifferenceExceeded(0, -10.5)).toBe(true);
    expect(speedDifferenceExceeded(0, 0)).toBe(false);
  });

  it('re-arms 32 units (0.5 s) from the clock of the match', () => {
    expect(ASSIST_INTERVAL).toBe(32);
    expect(nextAssistDue(1000)).toBe(1032);
    expectFault(() => nextAssistDue(Number.MAX_SAFE_INTEGER - 31), 'budget-exhausted', 'speed-match.due-clock');
  });
});
