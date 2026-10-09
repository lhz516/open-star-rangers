/**
 * The original's C library rand() and the placement mappings built on it (docs/original/formats/executable.md,
 * placement mappings, P3-02/02; Q-02). The original's `rand()` `0x7453b` returns 0–32767. Core does not reproduce the
 * original sequence: each rand() call takes one draw of the world RNG and keeps its top 15 bits, so every value of
 * {0, …, 32767} has exactly 2^17 of the 2^32 RNG outputs as preimages. The mappings take rand values; their outputs,
 * endpoints and preimage counts therefore follow from that domain. Consecutive calls are modelled as independent
 * uniform values, since the joint distribution of the original's consecutive calls was not analysed.
 */
import { nextRandom, type RngState } from '../determinism/rng.ts';
import { CoreFaultError } from '../errors.ts';

/** The largest value of the original's rand(). */
export const RAND_MAX = 32767;

/** C = f32(1 ÷ 32767) = 2^−15 + 2^−30 = 32769 ÷ 2^30, the factor the original applies to a rand value. */
export const RAND_SCALE = 32769 / 2 ** 30;

/** Supplies rand values, 0–32767, in draw order. */
export interface RandSource {
  next(): number;
}

/** The rand value of one uint32 RNG output: its top 15 bits. */
export function randOfUint32(uint32: number): number {
  if (!Number.isInteger(uint32) || uint32 < 0 || uint32 > 0xffffffff) throw new CoreFaultError('invariant-violated', 'original-random.uint32');
  return uint32 >>> 17;
}

/** Draws rand values from a world RNG state, one RNG step per value; `state` is the state after the last draw. */
export class RandStream implements RandSource {
  #state: RngState;

  constructor(state: RngState) {
    this.#state = state;
  }

  get state(): RngState {
    return this.#state;
  }

  next(): number {
    const draw = nextRandom(this.#state);
    this.#state = draw.state;
    // `value` is uint32 ÷ 2^32, so the product restores the uint32 exactly.
    return randOfUint32(draw.value * 2 ** 32);
  }
}

function requireRand(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > RAND_MAX) throw new CoreFaultError('invariant-violated', 'original-random.rand');
  return value;
}

/**
 * One axis of rectangle placement `0x6883c`: f32(from + |to − from| × rand × C), rounded to nearest. The span starts
 * at `from` whatever the order of the two ends. Within the supported coordinate range the sum is exact in double
 * precision, so the result is the exact value rounded once.
 */
export function rectangleCoordinate(from: number, to: number, rand: number): number {
  return Math.fround(from + Math.abs(to - from) * requireRand(rand) * RAND_SCALE);
}

/**
 * One axis of whole-world default placement `0x68c98` over the integer world extent W (15000 × sectors): with h = W
 * shifted right by 1, f32(W × rand × C − h), rounded to nearest (exact before the rounding).
 */
export function worldCoordinate(extent: number, rand: number): number {
  return Math.fround(extent * requireRand(rand) * RAND_SCALE - (extent >> 1));
}

/**
 * One axis of the anchor offset of `0x68708`, from two consecutive draws: the sign draw gives +1 when even and −1 when
 * odd, the size draw 400 + (rand mod 200). The offset is ±400 to ±599, never 0.
 */
export function anchorOffset(signRand: number, sizeRand: number): number {
  const size = 400 + (requireRand(sizeRand) % 200);
  return requireRand(signRand) % 2 === 0 ? size : -size;
}
