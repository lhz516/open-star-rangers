/**
 * The 64 start-up rotations `0x1b0a10` (docs/plan/p3/02/spec.md, MW-01 and MW-12 R-A; P3-09/28): the module
 * initialiser `0x568b0` builds them right after the direction table (random-direction.ts), before the program seeds its
 * generator, so they come from the C library's default sequence and are the same in every run. Core rebuilds them as a
 * code rule (difference 6 does not apply): static, never part of a snapshot; world creation puts it in the rule data
 * (`WorldRuleData.startupRotations`). The map marker (MW-03) and the Warp arrival (MW-08) copy entry rand % 64
 * (`0x56cd4`), one world draw each.
 */
import type { Matrix3 } from '../world/entity-table.ts';
import type { RandSource } from './original-random.ts';
import { randomDirection } from './random-direction.ts';

export const STARTUP_ROTATION_COUNT = 64;

/**
 * The original's Watcom rand() from the C standard's default seed 1: state × 0x41C64E6D + 0x3039 modulo 2³², returning
 * bits 16–30. Only the start-up tables use this sequence; the world's draws come from the world RNG (original-random.ts).
 */
export class DefaultSeedRand implements RandSource {
  #state = 1;

  next(): number {
    this.#state = (Math.imul(this.#state, 0x41c64e6d) + 0x3039) >>> 0;
    return (this.#state >>> 16) & 0x7fff;
  }
}

/** The draws before the table: init entry 15 (`0x3ec70` → `0x3fbc0`) fills a 500-entry presentation table, two draws each. */
const DRAWS_BEFORE_TABLE = 1000;

/**
 * One entry: the forward row R2 is a random direction, drawn again while its y and z are both ±0 (no table direction is,
 * so it never repeats). With ρ = F(√D(fy² + fz²)) and inv = D(1 ÷ ρ), R0 = (ρ, F(D(−fx·fy · inv)), F(D(−fx·fz · inv)))
 * and R1 = (+0, F(D(fz · inv)), F(D(−fy · inv))): R1 = normalise((0, fz, −fy)) and R0 = R1 × R2 in closed form. Every
 * product of two f32 values is exact in double.
 */
function startupRotation(rand: RandSource): Matrix3 {
  let forward = randomDirection(rand);
  // The original tests the bits masked with 0x7fffffff, that is ±0.
  while (forward.y === 0 && forward.z === 0) forward = randomDirection(rand);
  const { x, y, z } = forward;
  const rho = Math.fround(Math.sqrt(y * y + z * z));
  const inv = 1 / rho;
  return Object.freeze([
    rho, Math.fround(-x * y * inv), Math.fround(-x * z * inv),
    0, Math.fround(z * inv), Math.fround(-y * inv),
    x, y, z,
  ]) as unknown as Matrix3;
}

/** Builds the table from `rand`, which must be at the state the original's start-up leaves before `0x568b0`. */
export function buildStartupRotations(rand: RandSource): readonly Matrix3[] {
  return Object.freeze(Array.from({ length: STARTUP_ROTATION_COUNT }, () => startupRotation(rand)));
}

/** `0x1b0a10`: draws 1001–1128 of the default sequence, through the direction table. */
export const STARTUP_ROTATIONS: readonly Matrix3[] = (() => {
  const rand = new DefaultSeedRand();
  for (let draw = 0; draw < DRAWS_BEFORE_TABLE; draw++) rand.next();
  return buildStartupRotations(rand);
})();

/** `0x56cd4`: one draw, entry rand % 64 of `table` (the world's `ruleData.startupRotations`). */
export function drawStartupRotation(table: readonly Matrix3[], rand: RandSource): Matrix3 {
  return table[rand.next() % STARTUP_ROTATION_COUNT];
}
