/**
 * The explosion sprites' rules (docs/plan/p3/12/spec.md, 爆炸精灵与屏幕闪光; docs/original/formats/executable.md, X4,
 * FC2, FC6–FC8; textures.md §6; S-09, AC-13). Pure arithmetic in logical pixels, so each value can be compared with the
 * original's formulas; explosion-sprites.ts draws what they give.
 *
 * - **Frames (X4, FC6):** an explosion shows frame 0 from its activation, and at every later update the frame
 *   f = (14 × (sample − t₀)) mod 2³² SHR 6, or −1 (hidden) once f reaches the animation's frame count; a change is
 *   posted to the sprite record. Only the sprite pass of views 0xC–0x12 consumes those posts: an explosion activated in
 *   another view never gets a record and is never drawn, and a change made in another view shows only from the next
 *   change on. Hidden is final.
 * - **Queue (FC7):** with the frame's 3D camera, camera-space z must lie strictly between 1 and 3800; the centre
 *   sx = (R SAR 1) + chop(R·x/z), sy = (B SAR 1) + chop(−R·y/z), R and B the viewport's right and bottom, must lie in
 *   the viewport, ends included; t = (z − 1)·K/z with K = F((F − 1) ÷ (F − 2)), F the back plane; key d = chop(65535 t);
 *   scale s by the scale variant (0: chop(4t); 1: chop(3t) + 1; 2: chop(4t + 0.4); 3: chop(2t); HI), skipped when ≤ 0.
 * - **Order (FC8):** the queue, in the explosions' creation order, is sorted by ascending key, nearest first, with the
 *   library's sort and its handling of equal keys (`sortSprites`), and drawn in that order without depth writes, so a
 *   farther sprite covers a nearer one where they overlap.
 * - **Blocks (FC8):** left = sx − ((width·s) SAR 1), top = sy − ((height·s) SAR 1); source pixel (i, j) is the s × s
 *   block at (left + s·i, top + s·j), drawn only when it lies entirely inside x ≥ 0, y ≥ 0, x + s < 640 and y < B − s.
 *   Transparent pixels are skipped and opaque ones, index 0 included, show their DATA colour.
 */
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import { pointInFrame } from '../../../core/rules/collision-shapes.ts';
import { explosionFrame } from '../../../core/rules/explosions.ts';
import type { ExplosionVariant } from '../../../core/world/entity-table.ts';
import { LOGICAL_WIDTH } from '../composition/logical-screen.ts';
import type { CameraPose, ExplosionKey, ExplosionSelection, PresentationTick, PresentationViewport } from '../presentation/presentation-contract.ts';

/** The jump-table variant `0x49004` scales by (movement block +0xF0). */
export type SpriteVariant = 0 | 1 | 2 | 3;

/** Camera-space depths a sprite is drawn between, both excluded (f32 `0x171cac` for the far one). */
export const SPRITE_NEAR_DEPTH = 1;
export const SPRITE_FAR_DEPTH = 3800;
/** The depth key's scale (`0x171c8c`). */
export const DEPTH_KEY_SCALE = 65535;
/** Ranges the library sorts with insertion passes are shorter than this; longer ones it partitions. */
const INSERTION_SORT_LIMIT = 16;
/** The gaps of the insertion passes. */
const INSERTION_GAPS = Object.freeze([3, 1]);
/** An explosion asks for its removal past this many clock units after its activation (X4). */
const REMOVAL_DELAY = 0x60;

/** Views whose frame render runs the sprite pass `0x49004` (FC2, FC6). */
export const isSpriteView = (viewMode: number): boolean => viewMode >= 0x0c && viewMode <= 0x12;

/**
 * The scale variant of an activated explosion: 0 for `large`, 3 for `missile`; an `other` explosion is variant 2 when
 * its activation chose list 2 and variant 1 when the near rule moved it to list 1 (X4).
 */
export function spriteVariant(variant: ExplosionVariant, { list }: ExplosionSelection): SpriteVariant {
  if (variant === 'large') return 0;
  if (variant === 'missile') return 3;
  return list === 2 ? 2 : 1;
}

/** The scale s of `variant` at depth term t (FC7), HI. */
export function spriteScale(variant: SpriteVariant, t: number): number {
  switch (variant) {
    case 0: return Math.trunc(4 * t);
    case 1: return Math.trunc(3 * t) + 1;
    case 2: return Math.trunc(4 * t + 0.4);
    case 3: return Math.trunc(2 * t);
  }
}

/** `0x175220`: K = F((F − 1) ÷ (F − 2)) of the back plane F. */
export const depthFactor = (backPlane: number): number => Math.fround((backPlane - 1) / (backPlane - 2));

/** One queued sprite (`0x492d0`): its centre, depth key, scale and depth term. */
export interface SpriteProjection {
  readonly sx: number;
  readonly sy: number;
  readonly d: number;
  readonly s: number;
  readonly t: number;
}

/** The queue entry of an explosion at `position` (FC7), or null when it is not queued. */
export function projectSprite(position: Vec3, camera: CameraPose, viewport: PresentationViewport, backPlane: number, variant: SpriteVariant): SpriteProjection | null {
  const { x, y, z } = pointInFrame(camera.rows, camera.position, position);
  if (!(z > SPRITE_NEAR_DEPTH && z < SPRITE_FAR_DEPTH)) return null;
  const { left, top, right, bottom } = viewport;
  const sx = (right >> 1) + Math.trunc((right * x) / z);
  const sy = (bottom >> 1) + Math.trunc((-right * y) / z);
  if (sx < left || sx > right || sy < top || sy > bottom) return null;
  const t = ((z - 1) * depthFactor(backPlane)) / z;
  const s = spriteScale(variant, t);
  if (s <= 0) return null;
  return { sx, sy, d: Math.trunc(t * DEPTH_KEY_SCALE), s, t };
}

/**
 * Sorts `queue`, given in creation order, by ascending key as the library's `qsort` `0x85b2a` does with the comparator
 * `0x493cc` (a.d − b.d), equal keys included; returns it. A range of 2–15 entries gets two swap-based insertion passes,
 * gap 3 over its entries 0, 3, 6, … and then gap 1, swapping only on a strictly greater earlier key. A larger range is
 * partitioned three ways around a pivot swapped to its first entry: the middle entry; the median of the first, middle
 * and last above 29 entries; above 42, the median of three medians of entries n SHR 3 apart (med3 below). Equal entries
 * gather at both ends and are swapped to the middle; the smaller side is sorted first, the larger one kept on a stack.
 */
export function sortSprites<Entry extends { readonly d: number }>(queue: Entry[]): Entry[] {
  if (queue.length < 2) return queue;
  const compare = (a: number, b: number): number => queue[a].d - queue[b].d;
  const swap = (a: number, b: number): void => {
    [queue[a], queue[b]] = [queue[b], queue[a]];
  };
  const swapRanges = (a: number, b: number, count: number): void => {
    for (let at = 0; at < count; at++) swap(a + at, b + at);
  };
  const median = (a: number, b: number, c: number): number => {
    if (compare(a, b) <= 0) {
      if (compare(a, c) >= 0) return a;
      return compare(b, c) <= 0 ? b : c;
    }
    if (compare(a, c) <= 0) return a;
    return compare(b, c) > 0 ? b : c;
  };
  const stack: [number, number][] = [];
  let base = 0;
  let count = queue.length;
  for (;;) {
    if (count >= INSERTION_SORT_LIMIT) {
      let pivot = base + (count >> 1);
      if (count > 29) {
        let first = base;
        let last = base + count - 1;
        if (count > 42) {
          const step = count >> 3;
          first = median(first, first + step, first + 2 * step);
          pivot = median(pivot - step, pivot, pivot + step);
          last = median(last - 2 * step, last - step, last);
        }
        pivot = median(first, pivot, last);
      }
      swap(base, pivot);
      let a = base;
      let b = base;
      let c = base + count - 1;
      let d = c;
      for (;;) {
        for (; b <= c; b++) {
          const order = compare(b, base);
          if (order > 0) break;
          if (order === 0) swap(a++, b);
        }
        for (; b <= c; c--) {
          const order = compare(c, base);
          if (order < 0) break;
          if (order === 0) swap(c, d--);
        }
        if (b > c) break;
        swap(b++, c--);
      }
      const end = base + count;
      let span = Math.min(a - base, b - a);
      swapRanges(base, b - span, span);
      span = Math.min(d - c, end - d - 1);
      swapRanges(b, end - span, span);
      const lower = b - a;
      const upper = d - c;
      if (upper < lower) {
        if (lower > 1) {
          stack.push([base, lower]);
          base = end - upper;
          count = upper;
          continue;
        }
      } else {
        stack.push([end - upper, upper]);
        count = lower;
        continue;
      }
    } else if (count > 1) {
      for (const gap of INSERTION_GAPS) {
        for (let at = base + gap; at < base + count; at += gap) {
          for (let j = at; j > base && compare(j - gap, j) > 0; j -= gap) swap(j - gap, j);
        }
      }
    }
    const next = stack.pop();
    if (next === undefined) return queue;
    [base, count] = next;
  }
}

/** The source pixels of a sprite whose blocks are drawn, inclusive, and where its block (0, 0) lies. */
export interface SpriteBlocks {
  readonly left: number;
  readonly top: number;
  readonly s: number;
  readonly i0: number;
  readonly i1: number;
  readonly j0: number;
  readonly j1: number;
}

/** The blocks a `width` × `height` frame drawn at scale `s` around (sx, sy) keeps (FC8), or null when none. */
export function spriteBlocks({ sx, sy, s }: Pick<SpriteProjection, 'sx' | 'sy' | 's'>, width: number, height: number, bottom: number): SpriteBlocks | null {
  const left = sx - ((width * s) >> 1);
  const top = sy - ((height * s) >> 1);
  // x ≥ 0 and x + s < 640 for x = left + s·i; y ≥ 0 and y < bottom − s for y = top + s·j.
  const i0 = Math.max(0, Math.ceil(-left / s));
  const i1 = Math.min(width - 1, Math.floor((LOGICAL_WIDTH - 1 - s - left) / s));
  const j0 = Math.max(0, Math.ceil(-top / s));
  const j1 = Math.min(height - 1, Math.floor((bottom - s - 1 - top) / s));
  if (i0 > i1 || j0 > j1) return null;
  return { left, top, s, i0, i1, j0, j1 };
}

/** An explosion's position in creation order: its activation's, or right after its parent's for an extra (see `SpriteFrames`). */
export type CreationRank = readonly [number, number];

export const compareRanks = (a: CreationRank, b: CreationRank): number => a[0] - b[0] || a[1] - b[1];

interface SpriteRecord {
  readonly rank: CreationRank;
  readonly activationClock: number;
  readonly frames: number;
  /** The frame the explosion last computed (+0xF8), −1 when hidden. */
  shown: number;
  /** The sprite record's frame; null when the explosion never got a record. */
  drawn: number | null;
}

/**
 * The frames of every activated explosion, stepped once per presentation tick from the run's first tick (see the module
 * comment). Creation order: a main explosion, then its extras, which are created with it although they activate later,
 * then later explosions. Explosions activate at their first callback, in the kind list's order, which is their creation
 * order, so the others are ranked by activation; the presentation lists a tick's Core activations before its fragment
 * explosions, which the original orders by creation (this matters only between equal keys). A record is kept until its
 * explosion is hidden and past its removal time, after every extra of a main explosion has activated.
 */
export class SpriteFrames {
  readonly #frameCount: (selection: ExplosionSelection) => number;
  readonly #records = new Map<ExplosionKey, SpriteRecord>();
  #activations = 0;

  /** `frameCount` gives the frame count of a selection's animation. */
  constructor(frameCount: (selection: ExplosionSelection) => number) {
    this.#frameCount = frameCount;
  }

  step({ clock, afterStep: { viewMode }, activations }: PresentationTick): void {
    const consumed = isSpriteView(viewMode);
    for (const [key, record] of this.#records) {
      const f = explosionFrame(clock, record.activationClock);
      const shown = f < record.frames ? f : -1;
      if (shown !== record.shown) {
        record.shown = shown;
        if (consumed && record.drawn !== null) record.drawn = shown;
      }
      if (shown < 0 && clock - record.activationClock > REMOVAL_DELAY) this.#records.delete(key);
    }
    for (const { key, origin, selection, clock: activationClock } of activations) {
      const order = ++this.#activations;
      const parent = origin.type === 'extra' ? this.#records.get(origin.parentExplosionKey) : undefined;
      const rank: CreationRank = parent && origin.type === 'extra' ? [parent.rank[0], origin.ordinal + 1] : [order, 0];
      this.#records.set(key, { rank, activationClock, frames: this.#frameCount(selection), shown: 0, drawn: consumed ? 0 : null });
    }
  }

  /** The frame the sprite record of `key` shows and the explosion's rank, or null without a record or once hidden. */
  sprite(key: ExplosionKey): { readonly frame: number; readonly rank: CreationRank } | null {
    const record = this.#records.get(key);
    return record?.drawn != null && record.drawn >= 0 ? { frame: record.drawn, rank: record.rank } : null;
  }

  get size(): number {
    return this.#records.size;
  }
}
