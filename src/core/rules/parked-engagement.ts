/**
 * The parked engagement's rules (docs/plan/p3/02/spec.md, CR-09; docs/original/formats/executable.md, E2–E5): the
 * arithmetic of the multi-target collection `0x2ffec` and of the engagement `0x30150`, which systems/parked-engagement.ts
 * applies to the world. They read only what they are given, change nothing and draw only from the given RandSource.
 *
 * Kinds are tested by mask (E2, E3): a self kind in `0x6c87f` opposes every kind outside `0x6c07f`, any other self kind
 * every kind outside `0x93f80`. The two peer masks split the craft kinds; `0x800` is in `0x6c87f` but not `0x6c07f`, so
 * a self of that kind opposes its own kind and itself.
 *
 * Arithmetic (E3, E5), x87 at 53-bit precision, round to nearest, which JavaScript's double operations in the same order
 * reproduce: every f32 store is Math.fround, and one that overflows f32 is a fault, as the original's unmasked overflow
 * exception is. A float becomes an integer only through `0x74518` and `FISTP` (chop): a result beyond i32 is a fault,
 * as the unmasked invalid-operation exception is, though the load checks (CR-01: gun +0x14 in 0–32) and the TABL 4003
 * scales (≤ 1) keep shipped data from it. The gun sum adds in i32 and wraps.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { RandSource } from './original-random.ts';
import { toInt32 } from './record-defaults.ts';
import { WINGMAN_KIND_BIT } from './spawn-schedule.ts';
import { isFriendlyKind } from './targeting.ts';

/** The kinds a self of the friendly class `0x6c87f` counts as its side, and those any other self does (E2). */
const FRIENDLY_PEERS = 0x6c07f;
const HOSTILE_PEERS = 0x93f80;

/** E3.1: the self kinds that roll before engaging, in the order tested, with the rand % 100 below which they do not. */
const DECLINE_ROLLS: readonly (readonly [mask: number, below: number])[] = Object.freeze([
  [0x2, 80],
  [0x87c, 90],
  [0x78000, 95],
  [0xf9c7c, 90],
]);

/** f32 `0x170fe4` and `0x170fe8`: the factors of the L1 distance, applied in this order. */
const DISTANCE_TRIPLE = 3;
const DISTANCE_QUARTER = 0.25;
/** f32 `0x171004`: clock units to seconds. */
const SECONDS_PER_CLOCK_UNIT = 1 / 64;
/** A chosen missile against a target of kind 2 (the wingman) counts only when rand % 100 is below this. */
const WINGMAN_MISSILE_BELOW = 20;

/** E3.6 step 2: the f64 factors by the target's kind (`0x170ffc`, `0x170ff4`, `0x170fec`). */
const LARGE_FRIENDLY_KINDS = 0x78000;
const LARGE_FRIENDLY_FACTOR = 0.88;
const SMALL_FRIENDLY_KINDS = 0x87c;
const SMALL_FRIENDLY_FACTOR = 0.5;
const HOSTILE_FACTOR_KINDS = 0x81400;
const PLAIN_FACTOR = 0.9;

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `parked-engagement.${site}`);

const hasKind = (mask: number, kindBit: number): boolean => ((mask >>> kindBit) & 1) === 1;

/** An f32 store; one that overflows is a fault. */
function store(value: number, site: string): number {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored)) throw fault(site);
  return stored;
}

/** `0x74518` and `FISTP` i32: truncation toward zero; a result beyond i32 (or NaN) is a fault. */
function chop(value: number, site: string): number {
  const chopped = Math.trunc(value) + 0;
  if (toInt32(chopped) !== chopped) throw fault(site);
  return chopped;
}

/**
 * E3.1, before anything else: whether a self of `kindBit` declines this engagement, by one rand % 100 for the kinds that
 * roll; the other kinds (1, 0x80, 0x100, 0x200, 0x2000, 0x4000) always engage without a draw.
 */
export function declinesEngagement(kindBit: number, rand: RandSource): boolean {
  for (const [mask, below] of DECLINE_ROLLS) if (hasKind(mask, kindBit)) return rand.next() % 100 < below;
  return false;
}

/** The side gate (E2, E3.2): whether a self of `selfKindBit` opposes an object of `otherKindBit`. */
export function isOpposingSide(selfKindBit: number, otherKindBit: number): boolean {
  return !hasKind(isFriendlyKind(selfKindBit) ? FRIENDLY_PEERS : HOSTILE_PEERS, otherKindBit);
}

/**
 * E3.2: which of the leader's references holds the target, by the leader's AI mode (+0xC4, unsigned): the AI target
 * (+0x90) for 0 and 6 and above, the object target (+0x8C) for 1–4; mode 5 does not engage.
 */
export function targetReference(mode: number): 'target' | 'object-target' | null {
  if (mode === 5) return null;
  return mode >= 1 && mode <= 4 ? 'object-target' : 'target';
}

/** E2 step 1: the collection radius² f32(R × R) of the self's craft record +0x0C. */
export function collectionRadiusSquared(radius: number): number {
  return store(radius * radius, 'collection-radius');
}

/**
 * `0x56b50`: the squared distance in double, unrounded: with each axis difference d in double,
 * (dy·f32(dy) + dx·f32(dx)) + dz·f32(dz).
 */
export function collectionDistanceSquared(from: Vec3, to: Vec3): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const site = 'collection-distance';
  return dy * store(dy, site) + dx * store(dx, site) + dz * store(dz, site);
}

/** E2 step 2: an object strictly inside the collection radius is collected (the original's test lets a NaN through). */
export function isCollected(distanceSquared: number, radiusSquared: number): boolean {
  return !(distanceSquared >= radiusSquared);
}

/**
 * E3.3: the engagement distance d = f32((((|Δy| + |Δx|) + |Δz|) − r) × 3.0 × 0.25) from the self at `from` to the
 * target at `to` whose collision shape has radius `targetRadius`, in double before the one store.
 */
export function engagementDistance(from: Vec3, to: Vec3, targetRadius: number): number {
  const l1 = Math.abs(to.y - from.y) + Math.abs(to.x - from.x) + Math.abs(to.z - from.z);
  return store((l1 - targetRadius) * DISTANCE_TRIPLE * DISTANCE_QUARTER, 'distance');
}

/**
 * E3.5: a gun's shots over `elapsed` clock units (a u32) shared by `divisor` targets: q = chop(elapsed × (1/64) ×
 * cooldown), then q ÷ divisor toward zero, and 1 when that is at most 1.
 */
export function shotCount(elapsed: number, cooldown: number, divisor: number): number {
  const shots = Math.trunc(chop(elapsed * SECONDS_PER_CLOCK_UNIT * cooldown, 'shots') / divisor);
  return shots <= 1 ? 1 : shots;
}

/** E3.6 step 2: the f64 factor by the target's kind, or null for the kinds without one. */
export function targetKindFactor(kindBit: number): number | null {
  if (isFriendlyKind(kindBit)) {
    if (hasKind(LARGE_FRIENDLY_KINDS, kindBit)) return LARGE_FRIENDLY_FACTOR;
    return hasKind(SMALL_FRIENDLY_KINDS, kindBit) ? SMALL_FRIENDLY_FACTOR : PLAIN_FACTOR;
  }
  return hasKind(HOSTILE_FACTOR_KINDS, kindBit) ? PLAIN_FACTOR : null;
}

/** A mount as the engagement reads it, in mount order: its weapon record's range (+0x0C after the load) and fields. */
export type EngagementMount =
  | { readonly type: 'gun'; readonly range: number; readonly cooldown: number; readonly damage: number }
  | { readonly type: 'missile'; readonly range: number; readonly damage: number; readonly ammunition: number };

/** What one engagement fires at its target. */
export interface VolleyInput {
  /** Every mount of the self, in mount order, whatever its list, firing type, damage level or cooldown state. */
  readonly mounts: readonly EngagementMount[];
  /** E3.3's d. */
  readonly distance: number;
  /** The parked update's elapsed time, a u32. */
  readonly elapsed: number;
  /** 1, or the multi-target collection's count. */
  readonly divisor: number;
  /** Self +0xE0 (the record's +0x74) ≥ 0, signed: only then is a missile chosen. */
  readonly choosesMissile: boolean;
  readonly targetKindBit: number;
  /** The TABL 4003 scale S (`0x2cf0c`). */
  readonly scale: number;
}

export interface Volley {
  /** The total after both factors, i32: only a positive one deals damage. */
  readonly damage: number;
  /** The chosen missile's mount, whose ammunition the engagement spends whether or not it counted; null without one. */
  readonly missileMount: number | null;
}

/**
 * E3.4–E3.6 steps 1 and 2. The missile: among the missile mounts with ammunition ≠ 0 and range > d, the
 * (rand % count)-th in mount order, one draw when there are any; against a target of kind 2 it counts only when a
 * second rand % 100 is below 20. The sum: every gun mount with range > d adds its +0x1C once per shot, then the counted
 * missile its +0x5C, wrapping in i32. Then chop(sum × S) and the factor of the target's kind, each chopped.
 */
export function volley(input: VolleyInput, rand: RandSource): Volley {
  const { mounts, distance, elapsed, divisor, targetKindBit } = input;
  const inRange = (mount: EngagementMount): boolean => mount.range > distance;
  let missileMount: number | null = null;
  if (input.choosesMissile) {
    const loaded = mounts.flatMap((mount, index) => (mount.type === 'missile' && mount.ammunition !== 0 && inRange(mount) ? [index] : []));
    if (loaded.length > 0) missileMount = loaded[rand.next() % loaded.length];
  }
  let total = 0;
  for (const mount of mounts) {
    if (mount.type === 'gun' && inRange(mount)) total = toInt32(total + Math.imul(shotCount(elapsed, mount.cooldown, divisor), mount.damage));
  }
  if (missileMount !== null) {
    const counts = targetKindBit !== WINGMAN_KIND_BIT || rand.next() % 100 < WINGMAN_MISSILE_BELOW;
    if (counts) total = toInt32(total + mounts[missileMount].damage);
  }
  total = chop(total * input.scale, 'scaled');
  const factor = targetKindFactor(targetKindBit);
  return { damage: factor === null ? total : chop(total * factor, 'factor'), missileMount };
}
