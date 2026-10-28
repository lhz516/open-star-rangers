import { describe, expect, it } from 'vitest';
import { pointInFrame } from '../../../core/rules/collision-shapes.ts';
import type { ExplosionActivation, ExplosionKey, ExplosionSelection, PresentationTick } from '../presentation/presentation-contract.ts';
import { IDENTITY, vec } from '../presentation/presentation.test-support.ts';
import {
  depthFactor, isSpriteView, projectSprite, sortSprites, spriteBlocks, SpriteFrames, spriteScale, spriteVariant,
} from './sprite-rules.ts';

// Code-generated synthetic cameras, positions and ticks; never original data.

const F1_VIEWPORT = Object.freeze({ left: 0, top: 0, right: 639, bottom: 315 });
const CAMERA = Object.freeze({ position: vec(0), rows: IDENTITY });
const BACK_PLANE = 600;

const LIST_1: ExplosionSelection = { list: 1, item: 0 };
const LIST_2: ExplosionSelection = { list: 2, item: 1 };

describe('sprite projection, scale and key', () => {
  it('maps the explosion variant and the chosen list to the scale variant', () => {
    expect(spriteVariant('large', LIST_1)).toBe(0);
    expect(spriteVariant('other', LIST_1)).toBe(1);
    expect(spriteVariant('other', LIST_2)).toBe(2);
    expect(spriteVariant('missile', { list: 3, item: 0 })).toBe(3);
  });

  it('scales by variant with the integer boundaries of FC7', () => {
    expect([spriteScale(0, 0.2499), spriteScale(0, 0.25), spriteScale(0, 0.75), spriteScale(0, 1)]).toEqual([0, 1, 3, 4]);
    expect([spriteScale(1, 0), spriteScale(1, 0.3333), spriteScale(1, 0.3334), spriteScale(1, 0.9)]).toEqual([1, 1, 2, 3]);
    expect([spriteScale(2, 0.1499), spriteScale(2, 0.1501), spriteScale(2, 0.3999), spriteScale(2, 0.4001), spriteScale(2, 0.9)]).toEqual([0, 1, 1, 2, 4]);
    expect([spriteScale(3, 0.4999), spriteScale(3, 0.5), spriteScale(3, 1)]).toEqual([0, 1, 2]);
  });

  it('centres on the chopped projection with the right edge as scale, and keys by the depth term', () => {
    const k = Math.fround(599 / 598);
    expect(depthFactor(BACK_PLANE)).toBe(k);
    const t = (99 * k) / 100;
    expect(projectSprite(vec(10, 5, 100), CAMERA, F1_VIEWPORT, BACK_PLANE, 0)).toEqual({ sx: 319 + 63, sy: 157 - 31, d: Math.trunc(t * 65535), s: 3, t });
    expect(projectSprite(vec(10, 5, 100), CAMERA, F1_VIEWPORT, BACK_PLANE, 2)?.s).toBe(4);
    // In view 0x11 the centre row is bottom SAR 1 = 239.
    expect(projectSprite(vec(0, -5, 100), CAMERA, { left: 0, top: 0, right: 639, bottom: 479 }, BACK_PLANE, 3)?.sy).toBe(239 + 31);
  });

  it('projects through the camera frame the original uses', () => {
    const rows = Object.freeze([0, 0, -1, 0, 1, 0, 1, 0, 0]) as unknown as typeof IDENTITY;
    const camera = { position: vec(3, 4, 5), rows };
    const local = pointInFrame(rows, camera.position, vec(203, 9, 15));
    expect(local).toEqual(vec(-10, 5, 200));
    expect(projectSprite(vec(203, 9, 15), camera, F1_VIEWPORT, BACK_PLANE, 1)).toMatchObject({ sx: 319 + Math.trunc(-6390 / 200), sy: 157 + Math.trunc(-3195 / 200) });
  });

  it('draws only strictly between depths 1 and 3800, with a positive scale', () => {
    expect(projectSprite(vec(0, 0, 1), CAMERA, F1_VIEWPORT, BACK_PLANE, 1)).toBeNull();
    expect(projectSprite(vec(0, 0, 1.2), CAMERA, F1_VIEWPORT, BACK_PLANE, 1)?.s).toBe(1);
    expect(projectSprite(vec(0, 0, 1.2), CAMERA, F1_VIEWPORT, BACK_PLANE, 0)).toBeNull();
    expect(projectSprite(vec(0, 0, 3800), CAMERA, F1_VIEWPORT, 4000, 1)).toBeNull();
    expect(projectSprite(vec(0, 0, 3799), CAMERA, F1_VIEWPORT, 4000, 1)).not.toBeNull();
    expect(projectSprite(vec(0, 0, -50), CAMERA, F1_VIEWPORT, BACK_PLANE, 1)).toBeNull();
  });

  it('keeps a centre on the viewport edge and drops one past it', () => {
    expect(projectSprite(vec(320.5, 0, 639), CAMERA, F1_VIEWPORT, BACK_PLANE, 1)?.sx).toBe(639);
    expect(projectSprite(vec(321.5, 0, 639), CAMERA, F1_VIEWPORT, BACK_PLANE, 1)).toBeNull();
    expect(projectSprite(vec(-319.5, 0, 639), CAMERA, F1_VIEWPORT, BACK_PLANE, 1)?.sx).toBe(0);
    expect(projectSprite(vec(0, -158.5, 639), CAMERA, F1_VIEWPORT, BACK_PLANE, 1)?.sy).toBe(315);
    expect(projectSprite(vec(0, -159.5, 639), CAMERA, F1_VIEWPORT, BACK_PLANE, 1)).toBeNull();
  });

  it('gives keys above 65535 from the back plane − 1 on', () => {
    const near = projectSprite(vec(0, 0, 590), CAMERA, F1_VIEWPORT, BACK_PLANE, 1)!;
    const far = projectSprite(vec(0, 0, 610), CAMERA, F1_VIEWPORT, BACK_PLANE, 1)!;
    expect(near.d).toBeLessThan(65535);
    expect(far.d).toBeGreaterThan(65535);
  });
});

describe('sprite order', () => {
  const entries = (...keys: number[]) => keys.map((d, at) => ({ d, name: String.fromCharCode(65 + at) }));
  const names = (queue: readonly { name: string }[]) => queue.map(({ name }) => name).join('');

  it('sorts nearest first', () => {
    expect(names(sortSprites(entries(5, 1, 9, 3, 7)))).toBe('BDAEC');
  });

  it('reorders equal keys as the gap-3 pass of the library sort does up to 15 entries', () => {
    // The gap-3 pass swaps A and D; the gap-1 pass never swaps equal keys.
    expect(names(sortSprites(entries(2, 1, 1, 1)))).toBe('DBCA');
    expect(names(sortSprites(entries(1, 1, 1, 1)))).toBe('ABCD');
  });

  it('partitions 16 entries or more around the middle entry, as the library quicksort orders equal keys', () => {
    // The pivot I is swapped to the front; everything equal to it stays put.
    expect(names(sortSprites(entries(...Array.from({ length: 16 }, () => 1))))).toBe('IBCDEFGHAJKLMNOP');
    // The greater A ends the run of equal keys at the right; its swap partner P comes from that run's end.
    expect(names(sortSprites(entries(...Array.from({ length: 16 }, (_, at) => (at === 0 ? 2 : 1)))))).toBe('IBCDEFGHPJKLMNOA');
  });

  it('sorts longer queues with median pivots', () => {
    let seed = 7;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % 40;
    };
    for (const length of [16, 29, 30, 42, 43, 64, 200]) {
      const queue = entries(...Array.from({ length }, next));
      const keys = queue.map(({ d }) => d).sort((a, b) => a - b);
      expect(sortSprites(queue).map(({ d }) => d)).toEqual(keys);
    }
  });
});

describe('sprite blocks', () => {
  it('places the frame by its scaled half extents', () => {
    expect(spriteBlocks({ sx: 100, sy: 50, s: 3 }, 5, 4, 315)).toEqual({ left: 93, top: 44, s: 3, i0: 0, i1: 4, j0: 0, j1: 3 });
  });

  it('drops whole blocks across the left and top edges', () => {
    // Block 1 starts at x = −1: dropped, not cut.
    expect(spriteBlocks({ sx: 3, sy: 2, s: 3 }, 5, 4, 315)).toMatchObject({ left: -4, top: -4, i0: 2, j0: 2 });
  });

  it('never paints the last column or the viewport bottom two rows', () => {
    // x + s < 640: the block at 636 ends at 638; the one at 639 is dropped.
    expect(spriteBlocks({ sx: 637, sy: 100, s: 3 }, 5, 4, 315)).toMatchObject({ left: 630, i1: 2 });
    // y < B − s = 312: the block at 309 is drawn, the one at 312 not.
    expect(spriteBlocks({ sx: 100, sy: 315, s: 3 }, 4, 10, 315)).toMatchObject({ top: 300, j1: 3 });
    expect(spriteBlocks({ sx: 100, sy: 100, s: 1 }, 1, 1, 315)).toMatchObject({ i0: 0, i1: 0, j0: 0, j1: 0 });
    expect(spriteBlocks({ sx: 639, sy: 100, s: 1 }, 1, 1, 315)).toBeNull();
    expect(spriteBlocks({ sx: 100, sy: 314, s: 1 }, 1, 1, 315)).toBeNull();
    expect(spriteBlocks({ sx: 100, sy: 313, s: 1 }, 1, 1, 315)).not.toBeNull();
  });
});

const activation = (key: ExplosionKey, tick: number, origin: ExplosionActivation['origin'] = { type: 'core', entityId: Number(key.split(':')[1]) as never, eventIndex: 0 }): ExplosionActivation =>
  ({ key, origin, sourceKindBit: 7, variant: 'other', selection: LIST_1, tick, clock: 2 * tick, position: vec(0) });

function presentationTick(tick: number, viewMode: number, activations: readonly ExplosionActivation[] = []): PresentationTick {
  const camera = { tick, position: vec(0), rows: IDENTITY, viewMode, subMode: 0, viewport: F1_VIEWPORT };
  return { ownerId: 1, runId: 1, tick, clock: 2 * tick, beforeStep: camera, afterStep: camera, activations };
}

/** Steps `frames` over `views` (tick → view mode), returning the frame of `key` after each tick. */
function follow(frames: SpriteFrames, key: ExplosionKey, from: number, views: readonly number[]): (number | null)[] {
  return views.map((viewMode, at) => {
    frames.step(presentationTick(from + at, viewMode));
    return frames.sprite(key)?.frame ?? null;
  });
}

describe('sprite frames', () => {
  it('shows frame 0 from the activation, then (14 × elapsed) SHR 6, and hides at the frame count', () => {
    const frames = new SpriteFrames(() => 3);
    frames.step(presentationTick(10, 0x0c, [activation('core:5', 10)]));
    expect(frames.sprite('core:5')?.frame).toBe(0);
    expect(follow(frames, 'core:5', 11, [0x0c, 0x0c, 0x0c, 0x0c, 0x0c, 0x0c, 0x0c, 0x0c])).toEqual([0, 0, 1, 1, 2, 2, null, null]);
  });

  it('never draws an explosion activated outside views 0xC–0x12', () => {
    expect([1, 6, 8, 0x13].map(isSpriteView)).toEqual([false, false, false, false]);
    expect([0x0c, 0x11, 0x12].map(isSpriteView)).toEqual([true, true, true]);
    const frames = new SpriteFrames(() => 3);
    frames.step(presentationTick(10, 8, [activation('core:5', 10)]));
    expect(follow(frames, 'core:5', 11, [0x0c, 0x0c, 0x0c, 0x0c])).toEqual([null, null, null, null]);
  });

  it('applies a frame change made outside those views only at the next change', () => {
    const frames = new SpriteFrames(() => 3);
    frames.step(presentationTick(10, 0x0c, [activation('core:5', 10)]));
    // Frame 1 starts at tick 13, in the map; frame 2 at tick 15.
    expect(follow(frames, 'core:5', 11, [8, 8, 8, 0x0c, 0x0c])).toEqual([0, 0, 0, 0, 2]);
  });

  it('keeps a record until it is hidden and past its removal time; a new activation of a key replaces it', () => {
    const frames = new SpriteFrames(() => 3);
    frames.step(presentationTick(10, 0x0c, [activation('core:5', 10)]));
    // Hidden from tick 17; 96 units after the activation at tick 58, past them at tick 59.
    follow(frames, 'core:5', 11, Array.from({ length: 48 }, () => 0x0c));
    expect(frames.size).toBe(1);
    frames.step(presentationTick(59, 0x0c));
    expect(frames.size).toBe(0);
    frames.step(presentationTick(60, 0x0c, [activation('core:5', 60)]));
    expect(frames.sprite('core:5')?.frame).toBe(0);
  });

  it('ranks extras right after their main explosion, in creation order', () => {
    const frames = new SpriteFrames(() => 12);
    frames.step(presentationTick(10, 0x0c, [activation('core:5', 10)]));
    frames.step(presentationTick(11, 0x0c, [activation('core:3', 11)]));
    frames.step(presentationTick(12, 0x0c, [
      activation('extra:1', 12, { type: 'extra', parentExplosionKey: 'core:5', ordinal: 2 }),
      activation('fragment-explosion:1', 12, { type: 'fragment', fragmentKey: 'fragment:1' }),
    ]));
    expect(['core:5', 'core:3', 'extra:1', 'fragment-explosion:1'].map((key) => frames.sprite(key as ExplosionKey)?.rank)).toEqual([[1, 0], [2, 0], [1, 3], [4, 0]]);
  });
});
