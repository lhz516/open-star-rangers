import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import type { Disturbance, SteeredMovementBlock } from '../world/entity-table.ts';
import { expectFault } from '../world/world.test-support.ts';
import {
  applyFloatControl,
  applyIntegerControl,
  axisDeflection,
  decreasedThrottle,
  FULL_DEFLECTION,
  increasedThrottle,
  presetThrottle,
  SENSITIVITY_TABLE,
  throttleReadback,
  type AxisDeflections,
  type ControlRecord,
  type FloatControl,
} from './flight-control.ts';
import { craftMovementBlock, FULL_THROTTLE } from './flight-state.ts';
import { scriptedRand } from './rand.test-support.ts';

// Expectations are written out from the rules recorded in docs/original/formats/executable.md (flight controls and
// rotation, throttle, maximum speed and speed matching, P3-06/02 and 03) and in docs/plan/p3/06/spec.md (操纵, 速度与油门,
// checkpoint A); none is computed with the code under test.

/** Distinct craft rates per axis: pitch +0xAC, yaw +0xB4, roll +0xB0. */
const RECORD: ControlRecord = Object.freeze({ atAC: 1.5, atB4: 0.75, atB0: 0.375 });
const MAXIMUM = 48;

/** A block at full throttle (speed = commanded speed = 48, arrived) with its axes off. */
const block = (overrides: Partial<SteeredMovementBlock> = {}): SteeredMovementBlock => ({ ...craftMovementBlock(FULL_THROTTLE, MAXIMUM, 96), ...overrides });
const axes = (pitch: number | null, yaw: number | null, roll: number | null): AxisDeflections => ({ pitch, yaw, roll });
const NO_AXES = axes(null, null, null);
const rates = ({ steering }: SteeredMovementBlock) => [steering.pitch.rate, steering.yaw.rate, steering.roll.rate];
const flags = ({ steering }: SteeredMovementBlock) => [steering.pitch.enabled, steering.yaw.enabled, steering.roll.enabled];

describe('Medium sensitivity table (P3-06 AC-03, 技术决定 8)', () => {
  it('holds ±k²/4096 at 64 ± k, ±1 at full deflection, with a −0 middle', () => {
    expect(SENSITIVITY_TABLE).toHaveLength(129);
    for (let k = 0; k <= 64; k++) {
      expect(SENSITIVITY_TABLE[64 + k]).toBe(k === 0 ? -0 : (k * k) / 4096);
      expect(SENSITIVITY_TABLE[64 - k]).toBe(-(k * k) / 4096);
    }
    expect(Object.is(SENSITIVITY_TABLE[64], -0)).toBe(true);
    expect([SENSITIVITY_TABLE[0], SENSITIVITY_TABLE[128]]).toEqual([-1, 1]);
    expect(deepFrozen(SENSITIVITY_TABLE)).toBe(true);
  });
});

describe('project axes as a digital stick (P3-06 AC-03, checkpoint A)', () => {
  it.each([
    [1, 128],
    [-1, -128],
    [0, 0],
    [-0, 0],
    [0.5, 64],
    [-0.5, -64],
    [0.3, 38],
    [-0.3, -38],
    [0.999, 127],
    [-0.999, -127],
    [1 / 128, 1],
    [-1 / 128, -1],
    [1 / 256, 0],
    [-1 / 256, 0],
    [0.0078, 0],
  ])('maps %d to deflection %d, truncating toward zero', (value, deflection) => {
    expect(Object.is(axisDeflection(value), deflection)).toBe(true);
  });

  it('spans the device range ±128', () => {
    expect(FULL_DEFLECTION).toBe(128);
  });
});

describe('throttle readback 0x21ca8 and the throttle keys (P3-06 AC-04, M-04)', () => {
  it('reads back 0 without a block or a positive maximum', () => {
    expect(throttleReadback(null, MAXIMUM)).toBe(0);
    expect(throttleReadback(48, 0)).toBe(0);
    expect(throttleReadback(48, -1)).toBe(0);
  });

  it('reads back every keyboard throttle exactly: commanded speed k/64 × maximum gives 2k', () => {
    for (let k = 0; k <= 64; k++) expect(throttleReadback(0.75 * k, MAXIMUM)).toBe(2 * k);
  });

  it.each([
    [30, 80],
    [31, 82],
    [-1, -2],
    [60, 160],
  ])('truncates the ratio of a matched or lowered commanded speed %d toward zero: %d', (commanded, throttle) => {
    expect(throttleReadback(commanded, MAXIMUM)).toBe(throttle);
  });

  it('faults on a readback beyond i32', () => {
    expect(throttleReadback(MAXIMUM * 2 ** 24 - 1, MAXIMUM)).toBe(2 ** 31 - 3);
    expectFault(() => throttleReadback(MAXIMUM * 2 ** 24, MAXIMUM), 'invariant-violated', 'flight-control.readback');
  });

  it.each([
    [0, 12, 0],
    [64, 76, 52],
    [116, 128, 104],
    [120, 128, 108],
    [128, 128, 116],
    [5, 17, 0],
    [12, 24, 0],
    [200, 128, 188],
  ])('steps readback %d by 12: + gives %d (at most 128), − gives %d (at least 0)', (readback, up, down) => {
    expect(increasedThrottle(readback)).toBe(up);
    expect(decreasedThrottle(readback)).toBe(down);
  });

  it('gives speed-preset level n the original Shift+n preset 14(n − 1)', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(presetThrottle)).toEqual([0, 14, 28, 42, 56, 70, 84, 98, 112]);
    for (const value of [0, 10, 1.5]) expectFault(() => presetThrottle(value), 'invariant-violated', 'flight-control.preset');
  });
});

describe('integer control path 0x21dd0 (P3-06 AC-03, AC-04, M-02)', () => {
  const DISTURBED: Disturbance = Object.freeze({ level: 1 });

  it.each([
    ['no block', null, RECORD],
    ['no craft record', block({ disturbance: DISTURBED }), undefined],
    ['a lock', block({ locked: true, disturbance: DISTURBED }), RECORD],
  ] as const)('drops the message with %s, drawing nothing', (_, target, record) => {
    const before = structuredClone(target);
    const rand = scriptedRand([]);
    applyIntegerControl(target, record, MAXIMUM, { throttle: 0, axes: axes(128, 0, -1) }, rand);
    expect(target).toEqual(before);
    expect(rand.used).toBe(0);
  });

  it.each([
    [0, 0],
    [1, 0],
    [2, 0.75],
    [64, 24],
    [116, 43.5],
    [127, 47.25],
    [128, 48],
    [200, 48],
    [-10, -3.75],
    [-1000, -48],
  ])('sets throttle %d as commanded speed %d (table index clamped into the table) and clears the arrival', (throttle, commanded) => {
    const target = block({ speed: 20 });
    applyIntegerControl(target, RECORD, MAXIMUM, { throttle, axes: NO_AXES }, scriptedRand([]));
    expect([target.commandedSpeed, target.atCommandedSpeed, target.speed]).toEqual([commanded, false, 20]);
  });

  it('leaves the commanded speed and the arrival with an unchanged throttle', () => {
    const target = block();
    applyIntegerControl(target, RECORD, MAXIMUM, { throttle: null, axes: NO_AXES }, scriptedRand([]));
    expect(target).toEqual(block());
  });

  it.each([
    [128, -1],
    [-128, 1],
    [64, -0.25],
    [100, -2500 / 4096],
    [-127, 3969 / 4096],
    [127, -1],
    [3, -4 / 4096],
    [-3, 1 / 4096],
    [1, -1 / 4096],
  ])('turns deflection %d into rate (sensitivity entry %d) × craft rate on every axis, flag set', (deflection, entry) => {
    const target = block();
    applyIntegerControl(target, RECORD, MAXIMUM, { throttle: null, axes: axes(deflection, deflection, deflection) }, scriptedRand([]));
    expect(rates(target)).toEqual([entry * 1.5, entry * 0.75, entry * 0.375]);
    expect(flags(target)).toEqual([true, true, true]);
  });

  it('turns deflection −1 into the middle entry: rate −0 with the flag set', () => {
    const target = block();
    applyIntegerControl(target, RECORD, MAXIMUM, { throttle: null, axes: axes(-1, null, null) }, scriptedRand([]));
    expect(Object.is(target.steering.pitch.rate, -0)).toBe(true);
    expect(target.steering.pitch.enabled).toBe(true);
  });

  it('switches an axis off at 0, keeping its rate, and leaves an unchanged axis alone', () => {
    const target = block();
    Object.assign(target.steering.pitch, { rate: 0.5, enabled: true });
    Object.assign(target.steering.yaw, { rate: -0.25, enabled: true });
    applyIntegerControl(target, RECORD, MAXIMUM, { throttle: null, axes: axes(0, null, -128) }, scriptedRand([]));
    expect(rates(target)).toEqual([0.5, -0.25, 0.375]);
    expect(flags(target)).toEqual([false, true, true]);
  });

  it('draws three offsets rand % 129 − 64 first under a disturbance, then clamps d − a to ±128', () => {
    const target = block({ disturbance: DISTURBED });
    // Offsets −64, 64 and 0.
    const rand = scriptedRand([0, 128, 129 + 64]);
    applyIntegerControl(target, RECORD, MAXIMUM, { throttle: 64, axes: axes(128, -128, 10) }, rand);
    expect(rand.used).toBe(3);
    // v = clamp(−192) = −128, clamp(192) = 128, −10: entries −1, +1, −25/4096.
    expect(rates(target)).toEqual([-1.5, 0.75, (-25 / 4096) * 0.375]);
    expect(target.commandedSpeed).toBe(24);
  });

  it('adds the integer biases at level 2', () => {
    const target = block({ disturbance: { level: 2, biases: [100, -100, 5] } });
    const rand = scriptedRand([64, 64 + 129, 64]);
    applyIntegerControl(target, RECORD, MAXIMUM, { throttle: null, axes: axes(-50, 50, 7) }, rand);
    // d = 100, −100, 5; v = clamp(150) = 128, clamp(−150) = −128, −2.
    expect(rates(target)).toEqual([1.5, -0.75, (-1 / 4096) * 0.375]);
  });

  it.each([
    ['a throttle-only message', { throttle: 0, axes: NO_AXES }],
    ['a message that changes nothing', { throttle: null, axes: NO_AXES }],
  ])('draws three times for %s too', (_, control) => {
    const rand = scriptedRand([1, 2, 3]);
    applyIntegerControl(block({ disturbance: DISTURBED }), RECORD, MAXIMUM, control, rand);
    expect(rand.used).toBe(3);
  });

  it.each([129, -129, 1.5])('faults on deflection %d, outside the device range', (deflection) => {
    expectFault(() => applyIntegerControl(block(), RECORD, MAXIMUM, { throttle: null, axes: axes(null, deflection, null) }, scriptedRand([])), 'invariant-violated', 'flight-control.deflection');
  });
});

describe('float control path 0x21fd8 (P3-06 AC-03, M-02)', () => {
  const control = (overrides: Partial<FloatControl> = {}): FloatControl => ({ scale: 0.5, axes: { pitch: null, yaw: null, roll: null }, speedFactor: null, ...overrides });

  it('drops the message with a lock, drawing nothing', () => {
    const target = block({ locked: true, disturbance: { level: 1 } });
    const rand = scriptedRand([]);
    applyFloatControl(target, RECORD, MAXIMUM, control({ axes: { pitch: 0.25, yaw: 'clear', roll: 'clear' }, speedFactor: 0 }), rand);
    expect(target).toEqual(block({ locked: true, disturbance: { level: 1 } }));
    expect(rand.used).toBe(0);
  });

  it('sets craft rate × (−s) × value, linear in the value, and the flag', () => {
    const target = block();
    applyFloatControl(target, RECORD, MAXIMUM, control({ axes: { pitch: 0.25, yaw: -1, roll: 0.5 } }), scriptedRand([]));
    expect(rates(target)).toEqual([-0.1875, 0.375, -0.09375]);
    expect(flags(target)).toEqual([true, true, true]);
  });

  it('keeps the exact double product craft rate × (−s) before the value without a disturbance', () => {
    const third = Math.fround(1 / 3);
    const target = block();
    applyFloatControl(target, { ...RECORD, atAC: third }, MAXIMUM, control({ scale: Math.fround(0.9), axes: { pitch: 0.75, yaw: null, roll: null } }), scriptedRand([]));
    expect(target.steering.pitch.rate).toBe(-0.22499999403953552);
  });

  it('clears pitch and roll by their flag, but the yaw rate instead of its flag', () => {
    for (const enabled of [true, false]) {
      const target = block();
      for (const axis of ['pitch', 'yaw', 'roll'] as const) Object.assign(target.steering[axis], { rate: 2, enabled });
      applyFloatControl(target, RECORD, MAXIMUM, control({ axes: { pitch: 'clear', yaw: 'clear', roll: 'clear' } }), scriptedRand([]));
      expect(rates(target)).toEqual([2, 0, 2]);
      expect(flags(target)).toEqual([false, enabled, false]);
    }
  });

  it('sets the commanded speed to maximum × factor and clears the arrival, and leaves both without a factor', () => {
    const target = block();
    applyFloatControl(target, RECORD, MAXIMUM, control({ speedFactor: 0.25 }), scriptedRand([]));
    expect([target.commandedSpeed, target.atCommandedSpeed]).toEqual([12, false]);
    const untouched = block();
    applyFloatControl(untouched, RECORD, MAXIMUM, control(), scriptedRand([]));
    expect(untouched).toEqual(block());
  });

  it('draws a random direction and three values under a disturbance, then clamps value + offset to ±s', () => {
    const target = block({ disturbance: { level: 1 } });
    // Direction entry 0, octant 0: (0, 0, 1). Rand 0 gives offsets (−0.4)·u: −0, −0 and f32(−0.4).
    const rand = scriptedRand([0, 0, 0, 0, 0]);
    applyFloatControl(target, RECORD, MAXIMUM, control({ axes: { pitch: 0.75, yaw: -0.75, roll: 0.25 } }), rand);
    expect(rand.used).toBe(5);
    // 0.75 > s gives s, −0.75 < −s gives −s, 0.25 − 0.4000000059604645 stays inside; each times f32(craft rate × −s).
    expect(rates(target)).toEqual([-0.375, 0.1875, 0.02812500111758709]);
    expect(flags(target)).toEqual([true, true, true]);
  });

  it('negates the direction by its octant', () => {
    const target = block({ disturbance: { level: 1 } });
    // Octant 3 negates z: the roll offset is +f32(0.4).
    applyFloatControl(target, RECORD, MAXIMUM, control({ scale: 1, axes: { pitch: null, yaw: null, roll: 0.25 } }), scriptedRand([0, 3, 0, 0, 0]));
    expect(target.steering.roll.rate).toBe(Math.fround(-0.375 * Math.fround(0.6500000059604645)));
  });

  it('rounds craft rate × (−s) to f32 before the disturbed value', () => {
    const third = Math.fround(1 / 3);
    const target = block({ disturbance: { level: 1 } });
    applyFloatControl(target, { ...RECORD, atAC: third }, MAXIMUM, control({ scale: Math.fround(0.9), axes: { pitch: 0.75, yaw: null, roll: null } }), scriptedRand([0, 0, 0, 0, 0]));
    expect(target.steering.pitch.rate).toBe(-0.22500000894069672);
  });

  it('adds the float copies f32(bias / 127) of the integer biases at level 2', () => {
    const target = block({ disturbance: { level: 2, biases: [127, -127, 0] } });
    applyFloatControl(target, RECORD, MAXIMUM, control({ scale: 2, axes: { pitch: 0.5, yaw: 0.5, roll: null } }), scriptedRand([0, 0, 0, 0, 0]));
    // Offsets −0 + 1 and −0 − 1: values 1.5 and −0.5, times f32(1.5 × −2) and f32(0.75 × −2).
    expect(rates(target)).toEqual([-4.5, 0.75, 0]);
  });

  it.each([
    ['a non-f32 scale', { scale: 0.1 }],
    ['an infinite value', { axes: { pitch: Number.POSITIVE_INFINITY, yaw: null, roll: null } }],
    ['a NaN factor', { speedFactor: Number.NaN }],
  ] as const)('faults on %s', (_, overrides) => {
    expectFault(() => applyFloatControl(block(), RECORD, MAXIMUM, control(overrides), scriptedRand([])), 'invariant-violated', 'flight-control.float-control');
  });

  it('faults on a rate that overflows f32', () => {
    const huge = Math.fround(2 ** 100);
    expectFault(() => applyFloatControl(block(), RECORD, MAXIMUM, control({ scale: huge, axes: { pitch: huge, yaw: null, roll: null } }), scriptedRand([])), 'invariant-violated', 'flight-control.result');
  });
});
