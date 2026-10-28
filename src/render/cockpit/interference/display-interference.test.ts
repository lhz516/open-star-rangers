import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import { isolatedDrawContext } from '../presentation/cockpit.test-support.ts';
import { interferenceFrames, syntheticImage } from '../left-display/left-display.test-support.ts';
import {
  createDisplayInterference, createInterferenceGate, holdInterference, interferenceFrame, toggleInterference,
} from './display-interference.ts';

// hud.md, SNIP 10487 and §4.4/§4.5; spec DC-10. Synthetic frames: frame f is index 0x70 + f with row 0 at 0x7f.

const LEFT = Object.freeze({ x0: 120, y0: 340, x1: 219, y1: 439 });
const RIGHT = Object.freeze({ x0: 500, y0: 340, x1: 599, y1: 439 });

/** The frame by the recorded rule, computed with BigInt: ((clock − start) mod 2^32 × 12 mod 2^32) >> 6, mod count. */
const expectedFrame = (clock: number, start: number, count: number): number =>
  Number(((((BigInt(clock) - BigInt(start)) & 0xffff_ffffn) * 12n) & 0xffff_ffffn) >> 6n) % count;

/** A RandSource returning `values` in order and counting draws. */
function scriptedRandom(values: readonly number[]): RandSource & { readonly draws: () => number } {
  let at = 0;
  return { next: () => values[at++] ?? (() => { throw new Error('no more values'); })(), draws: () => at };
}

/** The pixels of B in `rect` rows y0 + 1 … y0 + 96 and columns x0 … x0 + 95, row-major. */
function framePixels(indices: Uint8Array, { x0, y0 }: { readonly x0: number; readonly y0: number }): number[] {
  const out: number[] = [];
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) out.push(indices[(y0 + 1 + y) * 640 + x0 + x]);
  return out;
}

describe('interference frame', () => {
  it('advances 12/64 of a frame per clock unit, wraps at the frame count and uses u32 arithmetic', () => {
    const cases: [number, number][] = [[100, 100], [105, 100], [106, 100], [148, 100], [147, 100], [0x10, 0xffff_fff0], [0x2000_0064, 100], [0x1555_5600, 0]];
    for (const [clock, start] of cases) expect(interferenceFrame(clock, start, 9), `${clock} − ${start}`).toBe(expectedFrame(clock, start, 9));
    expect([105, 106, 147, 148].map((clock) => interferenceFrame(clock, 100, 9))).toEqual([0, 1, 8, 0]);
    // Negative control: without the u32 product the overflowing case differs.
    expect(Math.floor((0x2000_0000 * 12) / 64) % 9).not.toBe(interferenceFrame(0x2000_0064, 100, 9));
  });
});

describe('interference gate', () => {
  it('state 2 switches on once and keeps the start; the next toggle is not advanced', () => {
    const gate = createInterferenceGate();
    expect(gate).toEqual({ on: false, start: 0, nextToggle: 0 });
    holdInterference(gate, 50);
    holdInterference(gate, 80);
    expect(gate).toEqual({ on: true, start: 50, nextToggle: 0 });
  });

  it('a state-1 toggle flips, records the start only when switching on and draws exactly one rand', () => {
    const gate = createInterferenceGate();
    const random = scriptedRandom([0x7fff, 0x40]);
    toggleInterference(gate, 10, random);
    expect(gate).toEqual({ on: true, start: 10, nextToggle: 10 + 0x40 + 0x3f });
    toggleInterference(gate, 200, random);
    expect(gate).toEqual({ on: false, start: 10, nextToggle: 200 + 0x40 });
    expect(random.draws()).toBe(2);
    toggleInterference(gate, 0xffff_fff0, scriptedRandom([0]));
    expect(gate.nextToggle).toBe(0x30);
  });
});

describe('interference picture', () => {
  it('draws the frame opaque at (x0, y0 + 1) and publishes the rectangle unless forced', () => {
    const interference = createDisplayInterference(interferenceFrames());
    expect(interference.lastFrame()).toBe(-1);
    const { context, surfaces, published } = isolatedDrawContext(10);
    expect(interference.draw(context, LEFT, 0, false)).toBe(true);
    const frame = expectedFrame(20, 0, 9);
    expect(frame).toBe(3);
    expect(framePixels(surfaces.back.indices, LEFT)).toEqual([...Array(96).fill(0x7f), ...Array(95 * 96).fill(0x70 + frame)]);
    expect(surfaces.back.indices[LEFT.y0 * 640 + LEFT.x0]).toBe(0);
    expect(surfaces.back.indices[(LEFT.y0 + 1) * 640 + LEFT.x0 + 96]).toBe(0);
    expect(published).toEqual([LEFT]);
    expect(framePixels(surfaces.screen.indices, LEFT)).toEqual(framePixels(surfaces.back.indices, LEFT));
    expect(interference.lastFrame()).toBe(frame);
  });

  it('skips an unforced call of the last frame, also for the other display, but not a forced one', () => {
    const interference = createDisplayInterference(interferenceFrames());
    const first = isolatedDrawContext(10);
    interference.draw(first.context, LEFT, 0, false);
    const right = isolatedDrawContext(10);
    expect(interference.draw(right.context, RIGHT, 0, false)).toBe(false);
    expect(right.published).toEqual([]);
    expect(right.surfaces.back.indices.every((index) => index === 0)).toBe(true);
    // Negative control: a second run's own interference draws the same call.
    expect(createDisplayInterference(interferenceFrames()).draw(isolatedDrawContext(10).context, RIGHT, 0, false)).toBe(true);
    const forced = isolatedDrawContext(10);
    expect(interference.draw(forced.context, RIGHT, 0, true)).toBe(true);
    expect(forced.published).toEqual([]);
    expect(framePixels(forced.surfaces.back.indices, RIGHT).slice(96, 97)).toEqual([0x73]);
    expect(interference.lastFrame()).toBe(3);
  });

  it('records each drawn frame as the last frame and draws again once the frame changes', () => {
    const interference = createDisplayInterference(interferenceFrames());
    const frames: number[] = [];
    for (let tick = 0; tick < 8; tick++) {
      const { context } = isolatedDrawContext(tick);
      if (interference.draw(context, LEFT, 0, false)) frames.push(interference.lastFrame());
    }
    // clock 0, 2, …, 14: frames 0, 0, 0, 1, 1, 1, 2, 2.
    expect(frames).toEqual([0, 1, 2]);
  });

  it('rejects frames that are missing, of different sizes, masked or not direct', () => {
    const frame = (patch: Partial<ImagePayload>): ImagePayload => ({ ...syntheticImage(4, 4, () => 1), ...patch });
    const cases: (readonly ImagePayload[])[] = [
      [],
      [frame({}), frame({ width: 2, indices: new Uint8Array(8) })],
      [frame({ mask: new Uint8Array(4) })],
      [frame({ display: { nearest: 'palette/flight/models' } as unknown as ImagePayload['display'] })],
    ];
    for (const frames of cases) {
      expect(() => createDisplayInterference(frames)).toThrow(ContentContractError);
      try {
        createDisplayInterference(frames);
      } catch (error) {
        expect((error as ContentContractError).code).toBe('binding-mismatch');
      }
    }
  });
});
