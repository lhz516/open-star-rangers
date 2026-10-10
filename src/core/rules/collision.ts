/**
 * Collision rules (docs/plan/p3/02/spec.md, CR-03, CR-07 and CR-09; docs/original/formats/executable.md, H6–H8): who
 * takes part in the passes `0x29670` and `0x29934`, their two contact responses and the damage arithmetic around them.
 * systems/collision.ts runs the passes; the point tests are collision-shapes.ts's.
 *
 * A response reads both objects' positions, attitudes and block speeds (+8) and returns what it writes into the
 * movement blocks, the knock (impulse) and the tumble (timed rotations), with the raw damage:
 * - `0x29eb8`, the glance (the second object is not large, or a fragment with DEBRIS +0x5C ≠ 0): the first object is
 *   knocked along the second's row 3 at the second's speed, the second along the first's row 3 at twice the first's
 *   speed; X = |row3₁ · row3₂ − 1| × (speed₁ + speed₂); the second tumbles opposite to the first;
 * - `0x2a12c`, the bounce (a large second object, or a fragment with +0x5C = 0): only the first object is knocked,
 *   along the second's row 3 plus a reflection term, at 1.2 × its own speed; Y = (speed₁ + speed₂) × 2.0; the second
 *   object gets nothing.
 * The tumble of the first object draws twice per axis (pitch, yaw, roll): the rate between lo = X ÷ 140 (at least ≈5°)
 * and hi = X × 0.01 (Y × 0.0125 for the bounce), then a sign flip of rate and decay (±π/4) when the draw has bit 1 set:
 * 6 draws per response. An axis turns until (rate ÷ decay + t) − 0.5, and only when that end is after t. The raw damage
 * is 2 × trunc(f32 X) + 150 (Y for the bounce).
 *
 * Numbers follow the native x87 sequence under the start-up control word (53-bit precision, round to nearest): every
 * arithmetic step is a JavaScript double operation and every f32 store `Math.fround`. X and Y stay unrounded for hi and
 * lo; only the raw damage reads their f32 store. The bounce's reflection term is computed in place over −row3₁, one
 * component at a time, so each later component's dot product already uses the earlier components' results: it is not
 * the exact projection. A store that is not finite is a fault, as the original unmasks the overflow and invalid-operation
 * exceptions; so is a raw damage whose truncation does not fit i32, which `FISTP` would trap on. Doubling it and adding
 * 150 wrap as the integer additions do.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { ROTATION_AXES, type Impulse, type Matrix3, type RotationAxis, type TimedRotation } from '../world/entity-table.ts';
import { quotient } from './energy.ts';
import { normalise } from './load-transforms.ts';
import { rowOf } from './movement-builders.ts';
import { RAND_SCALE, type RandSource } from './original-random.ts';
import { toInt32 } from './record-defaults.ts';

/** The craft kinds the player's centre is tested against: kind bits 1–19 (mask `0xffffe`). */
export const PLAYER_CONTACT_KINDS = 0xffffe;
/** Group A of `0x29934` (mask `0x382`: kinds 2, 0x80, 0x100, 0x200), whose centres are tested. */
export const POINT_GROUP_KINDS = 0x382;
/** Group B of `0x29934` (mask `0xffc7c`): tested against group A only, never against each other. */
export const SHAPE_GROUP_KINDS = 0xffc7c;

/** The f64 constants of both responses: the glance's knock factor 2.0 and the dot product's −1.0, hi's factors, lo's factor (one ulp above 1/140), lo's floor test (≈5°), the bounce's knock factor 1.2 and the end margin. */
const GLANCE_KNOCK_FACTOR = 2;
const DOT_OFFSET = -1;
const GLANCE_HIGH_FACTOR = 0.01;
const BOUNCE_HIGH_FACTOR = 0.0125;
const LOW_FACTOR = 0.0071428571428571435;
const LOW_FLOOR_LIMIT = 0.0872664638888889;
const BOUNCE_KNOCK_FACTOR = 1.2;
const BOUNCE_SPEED_FACTOR = 2;
const REFLECTION_FACTOR = 2;
const END_MARGIN = -0.5;
/** The f32 floor of lo, bits `0x3DB2B8C3` (≈5°), and the decay, bits `0x3F490FDB` (π/4). */
const LOW_FLOOR = Math.fround(0.08726647);
const TUMBLE_DECAY = Math.fround(Math.PI / 4);
/** The bit of the second draw per axis that flips the rate's and the decay's signs. */
const SIGN_FLIP = 2;
const RAW_BASE = 150;

/** What a response reads from one colliding object: its pose and its block's speed (+8). */
export interface ContactBody {
  readonly position: Vec3;
  readonly orientation: Matrix3;
  readonly speed: number;
}

/** A tumble: the timed rotation of each axis, null where its end is not after t. */
export type Tumble = Readonly<Record<RotationAxis, TimedRotation | null>>;

/** What a response writes into one object's movement block (+0x18–+0x58). */
export interface ContactPush {
  readonly impulse: Impulse;
  readonly timedRotation: Tumble;
}

/** A response: the pushes of both objects and the raw damage (i32). */
export interface ContactResponse {
  readonly raw: number;
  readonly first: ContactPush;
  /** Null for the bounce, which leaves the second object alone. */
  readonly second: ContactPush | null;
}

/** A response: `0x29eb8` or `0x2a12c`, the first object's centre in the second's shape, at f32 mission time `time`. */
export type ContactRule = (first: ContactBody, second: ContactBody, time: number, rand: RandSource) => ContactResponse;

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `collision.${site}`);

/** An f32 store F(x), and a fault when it is not finite. */
function store(value: number): number {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored)) throw fault('result');
  return stored;
}

const vec = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });

/** 2 × trunc(f32 value) + 150 (`0x74518`, `FISTP`, two integer additions). */
function rawDamage(stored: number): number {
  const chopped = Math.trunc(stored) + 0;
  if (toInt32(chopped) !== chopped) throw fault('raw');
  return toInt32(chopped + chopped + RAW_BASE);
}

/**
 * The first object's tumble from the unrounded X or Y (`value`) and hi's factor: lo = F(value × LOW_FACTOR), or the
 * floor when the unrounded product is below ≈5°; per axis a rate F(rand × C × (hi − lo) + lo) and the decay π/4, both
 * negated when the next draw has bit 1; then each end F((rate ÷ decay + t) − 0.5), active only when after t.
 */
function tumble(value: number, highFactor: number, time: number, rand: RandSource): Tumble {
  const high = store(value * highFactor);
  const lowProduct = value * LOW_FACTOR;
  const low = lowProduct >= LOW_FLOOR_LIMIT ? store(lowProduct) : LOW_FLOOR;
  const axes = {} as Record<RotationAxis, TimedRotation | null>;
  for (const axis of ROTATION_AXES) {
    let rate = store(rand.next() * RAND_SCALE * (high - low) + low);
    let decay = TUMBLE_DECAY;
    if ((rand.next() & SIGN_FLIP) !== 0) {
      rate = -rate;
      decay = -decay;
    }
    const end = store(rate / decay + time + END_MARGIN);
    axes[axis] = end > time ? Object.freeze({ rate, decay, end }) : null;
  }
  return Object.freeze(axes);
}

/** The same tumble the other way round: every rate and decay negated, the ends unchanged. */
function opposite(axes: Tumble): Tumble {
  const negated = {} as Record<RotationAxis, TimedRotation | null>;
  for (const axis of ROTATION_AXES) {
    const timed = axes[axis];
    negated[axis] = timed && Object.freeze({ rate: -timed.rate, decay: -timed.decay, end: timed.end });
  }
  return Object.freeze(negated);
}

const pushOf = (direction: Vec3, magnitude: number, timedRotation: Tumble): ContactPush =>
  Object.freeze({ impulse: Object.freeze({ direction, magnitude }), timedRotation });

/** `0x29eb8`, the glance; see the module comment. */
export const glancingContact: ContactRule = (first, second, time, rand) => {
  const forward = rowOf(first.orientation, 2);
  const otherForward = rowOf(second.orientation, 2);
  const otherKnock = store(first.speed * GLANCE_KNOCK_FACTOR);
  const dot = forward.y * otherForward.y + forward.z * otherForward.z + forward.x * otherForward.x;
  const x = Math.abs(dot + DOT_OFFSET) * (first.speed + second.speed);
  const raw = rawDamage(store(x));
  const axes = tumble(x, GLANCE_HIGH_FACTOR, time, rand);
  return Object.freeze({
    raw,
    first: pushOf(otherForward, second.speed, axes),
    second: pushOf(forward, otherKnock, opposite(axes)),
  });
};

/**
 * The reflection term of `0x2a12c` over v = −row3₁ and the unit offset n: each component w_k = F((d_k × 2) × n_k), where
 * d_k is the dot product (y + z) + x of n with v as the earlier components have already overwritten it.
 */
function reflection(normal: Vec3, forward: Vec3): Vec3 {
  const yz = normal.y * -forward.y + normal.z * -forward.z;
  const x = store((yz + normal.x * -forward.x) * REFLECTION_FACTOR * normal.x);
  const y = store((yz + normal.x * x) * REFLECTION_FACTOR * normal.y);
  const z = store((normal.z * -forward.z + normal.y * y + normal.x * x) * REFLECTION_FACTOR * normal.z);
  return vec(x, y, z);
}

/** `0x2a12c`, the bounce; see the module comment. The offset P₁ − P₂ is stored f32 and normalised by `0x56aa8`. */
export const bounceContact: ContactRule = (first, second, time, rand) => {
  const { position: from } = first;
  const { position: to } = second;
  const normal = normalise(vec(store(from.x - to.x), store(from.y - to.y), store(from.z - to.z)));
  const w = reflection(normal, rowOf(first.orientation, 2));
  const otherForward = rowOf(second.orientation, 2);
  const direction = vec(store(otherForward.x + w.x), store(otherForward.y + w.y), store(otherForward.z + w.z));
  const knock = store(first.speed * BOUNCE_KNOCK_FACTOR);
  const y = (first.speed + second.speed) * BOUNCE_SPEED_FACTOR;
  const raw = rawDamage(store(y));
  return Object.freeze({ raw, first: pushOf(direction, knock, tumble(y, BOUNCE_HIGH_FACTOR, time, rand)), second: null });
};

/** The damage of a contact: raw ÷ (3 − group), the signed `IDIV` (truncation toward zero), group 0–2. */
export const collisionDamage = (raw: number, group: number): number => quotient(raw, 3 - group, 'collision.damage');

/** Half a contact's damage for a large kind, or half a small fragment's raw damage: `SAR 1`, rounding toward −∞. */
export const halved = (damage: number): number => damage >> 1;

/** The number of contacts with small fragments (+0x5C ≠ 0) that damage the player in one tick: g × 2 + 2. */
export const fragmentContactLimit = (group: number): number => group * 2 + 2;
