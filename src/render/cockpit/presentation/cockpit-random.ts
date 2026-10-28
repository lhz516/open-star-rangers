/**
 * The cockpit presentation stream (docs/plan/p3/13/spec.md, D-01 定稿 DC-04): its seed is FNV-1a 32 over the run's
 * host seed s as 4 little-endian bytes followed by the ASCII label `cockpit-presentation`, so it is never the world's
 * stream nor P3-12's, and no draw from either is spent on it. The original shares one rand() for everything; this
 * difference is disclosed by the spec, and no claim is made that the joint distribution matches.
 */
import { RandStream } from '../../../core/rules/original-random.ts';
import { PresentationError } from './cockpit-limits.ts';

export const COCKPIT_RANDOM_LABEL = 'cockpit-presentation';

const FNV32_OFFSET = 0x811c9dc5;
const FNV32_PRIME = 0x01000193;

/** FNV-1a 32 of a byte sequence. */
export function fnv1a32(bytes: Iterable<number>): number {
  let hash = FNV32_OFFSET;
  for (const byte of bytes) hash = Math.imul(hash ^ (byte & 0xff), FNV32_PRIME) >>> 0;
  return hash;
}

function requireSeed(seed: number): number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new PresentationError('invalid-input', 'cockpit.seed', 'must be a uint32');
  return seed;
}

/** The derived uint32 seed of the cockpit presentation stream. */
export function cockpitPresentationSeed(seed: number): number {
  const value = requireSeed(seed);
  const bytes = [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, value >>> 24];
  for (let at = 0; at < COCKPIT_RANDOM_LABEL.length; at++) bytes.push(COCKPIT_RANDOM_LABEL.charCodeAt(at));
  return fnv1a32(bytes);
}

/** A fresh cockpit presentation stream for the run's host seed. */
export function cockpitRandom(seed: number): RandStream {
  return new RandStream(cockpitPresentationSeed(seed));
}
