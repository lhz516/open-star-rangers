/**
 * Discriminator-3 fragments (kind bit 24; docs/plan/p3/02/spec.md, CR-02, CR-03 and CR-08;
 * docs/original/formats/executable.md, X6, X7, X11, H1 and H4): the constructor `0x25124` for one part of a destroyed
 * craft, the first callback's expiry of `0x24ac4`, the shot-down mark `0x24a6c`, the outcome of the expiry `0x256e4`
 * and the mode-2 move `0x2285c`. destruction.ts runs the producer `0x24d78` over the parts, allocates and handles the
 * requests. The discriminator-1 and -2 fragments of event 0x10 are the presentation layer's (CR-11).
 *
 * Numbers follow the original's write-back points (W13): every arithmetic step is a JavaScript double operation, as
 * the x87 rounds at double precision, and every f32 store is `Math.fround`. A product of two f32 values is exact in
 * double precision, so it rounds only at its store. A store that is not finite is a fault, as the original unmasks the
 * overflow and invalid-operation exceptions. Rand values come in the original's draw order.
 */
import type { AssetId } from '../../content/asset-id.ts';
import type { FragmentExpiredEvent, Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import {
  FRAGMENT_KIND_BIT, isEscapePod,
  type Entity, type EntityInit, type FragmentCombat, type FragmentExpiry, type Matrix3, type RotationAxis, type SpinningMovementBlock,
} from '../world/entity-table.ts';
import { runtimeKindDefaults } from './combat-init.ts';
import { rotateRows, type MotionStep } from './flight-motion.ts';
import { normalise, type DebrisRuleData } from './load-transforms.ts';
import { rowOf, spinningBlock, spinningItem } from './movement-builders.ts';
import { RAND_SCALE, type RandSource } from './original-random.ts';
import { PLAYER_KIND_BIT, WINGMAN_KIND_BIT } from './spawn-schedule.ts';

/** Mask `0xf9c7c`, the large craft kinds (4, 8, 0x10, 0x20, 0x40, 0x400, 0x800, 0x1000 and 0x8000–0x80000). */
const LARGE_KINDS = 0xf9c7c;

/** Whether `kindBit` is a large craft kind: its explosion is `large`, its fragments slow, flagless and lasting. */
export const isLargeKind = (kindBit: number): boolean => ((LARGE_KINDS >>> kindBit) & 1) === 1;

/** Kinds 1 and 2: the player's and the wingman's craft, whose part 0 is the escape pod and parts 1 and 2 shed nothing. */
const isOwnKind = (kindBit: number): boolean => kindBit === PLAYER_KIND_BIT || kindBit === WINGMAN_KIND_BIT;

/** Durability +0xD0 of a fragment with DEBRIS parameters: +0x5C ≠ 0 (small) or = 0. */
const SMALL_DURABILITY = 1200;
const LARGE_DURABILITY = 4000;

/** The push speed's base and spans, f64 `0x170c97`, `0x170cc7` (pods), `0x170caf` (small kinds), `0x170c8f` (large kinds). */
const PUSH_BASE = 2;
const POD_PUSH_SPAN = 6;
const SMALL_PUSH_SPAN = 8;
const LARGE_PUSH_SPAN = 3;
/** The spin per move: a pod's fixed f32 (−5°); f64 span and base `0x170cb7`, `0x170cbf` (small) and `0x170c9f`, `0x170ca7` (large). */
const POD_SPIN = Math.fround(-0.08726647);
const SMALL_SPIN_SPAN = 0.2443460988888889;
const SMALL_SPIN_BASE = 0.01745329277777778;
const LARGE_SPIN_SPAN = 0.01047197566666666;
const LARGE_SPIN_BASE = 0.001745329277777778;
/** A pod's spin axis byte: 2, `0x228cc`. Other fragments take table `0x174b08` {0, 1, 2} at rand % 3. */
const POD_SPIN_AXIS = 2;
const SPIN_AXES = 3;

/** First-callback expiries (X7), in clock units after that callback's clock. */
const PLAYER_POD_LIFETIME = 0x140;
const WINGMAN_POD_LIFETIME = 0x780;
const FLAGGED_LIFETIME = 0x80;
const FLAGGED_LIFETIME_RANGE = 0xc0;
const LIFETIME = 0x3c0;
const LIFETIME_RANGE = 0x200;
/** The expiry `0x24a6c` writes: clock 1, which every later clock reaches. */
const SHOT_DOWN_EXPIRY: FragmentExpiry = Object.freeze({ type: 'at', clock: 1 });
const NEVER: FragmentExpiry = Object.freeze({ type: 'never' });

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `fragments.${site}`);

/** An f32 store F(x), and a fault when it is not finite. */
function store(value: number): number {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored)) throw fault('result');
  return stored;
}

const vec = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
/** F(row × weight) per component. */
const scaled = ({ x, y, z }: Vec3, weight: number): Vec3 => vec(store(x * weight), store(y * weight), store(z * weight));

/** A real draw, F(rand × C × span + base). */
const realDraw = (rand: RandSource, span: number, base: number): number => store(rand.next() * RAND_SCALE * span + base);

/**
 * `0x249dc`: the index of part `part`'s DEBRIS parameters in the source kind's table (craft §4.1): part − 3 for kinds 1
 * and 2, where a negative index is none (the pod), and the part itself for every other kind.
 */
export function debrisIndex(sourceKindBit: number, part: number): number | null {
  if (!isOwnKind(sourceKindBit)) return part;
  return part >= 3 ? part - 3 : null;
}

/** Where a fragment starts and the direction it is pushed along. */
interface Placement {
  readonly position: Vec3;
  readonly push: Vec3;
  readonly durability: number;
}

/**
 * Step 6 of `0x25124` with parameters r: the offset d = F((F(row 2 × w₂) + F(row 3 × w₃)) + F(row 1 × w₁)) per
 * component from the load-negated weights w, the position F(P + d), then d normalised (`0x56aa8`), and the durability
 * by the +0x5C class. Without parameters (a pod): no offset, the push along row 2 as it is, durability 0.
 */
function placement(position: Vec3, orientation: Matrix3, record: DebrisRuleData | null): Placement {
  if (record === null) return { position, push: rowOf(orientation, 1), durability: 0 };
  const { weights } = record;
  const along1 = scaled(rowOf(orientation, 0), weights.x);
  const along2 = scaled(rowOf(orientation, 1), weights.y);
  const along3 = scaled(rowOf(orientation, 2), weights.z);
  const offset = vec(
    store(along2.x + along3.x + along1.x),
    store(along2.y + along3.y + along1.y),
    store(along2.z + along3.z + along1.z),
  );
  return {
    position: vec(store(position.x + offset.x), store(position.y + offset.y), store(position.z + offset.z)),
    push: normalise(offset),
    durability: record.small ? SMALL_DURABILITY : LARGE_DURABILITY,
  };
}

/** Step 7: the push speed and the spin per move, by pod, large and small kind, speed first. */
function pushAndSpin(sourceKindBit: number, pod: boolean, rand: RandSource): { readonly speed: number; readonly spin: number } {
  if (pod) return { speed: realDraw(rand, POD_PUSH_SPAN, PUSH_BASE), spin: POD_SPIN };
  if (isLargeKind(sourceKindBit)) {
    const speed = realDraw(rand, LARGE_PUSH_SPAN, PUSH_BASE);
    return { speed, spin: realDraw(rand, LARGE_SPIN_SPAN, LARGE_SPIN_BASE) };
  }
  const speed = realDraw(rand, SMALL_PUSH_SPAN, PUSH_BASE);
  return { speed, spin: realDraw(rand, SMALL_SPIN_SPAN, SMALL_SPIN_BASE) };
}

/**
 * `0x25124(source, kind, part)`: the discriminator-3 fragment of part `part` of `source`'s model `model` (the index in
 * its part list 1), or null for parts 1 and 2 of kinds 1 and 2, which make no object and draw nothing. `debris` is the
 * source kind's DEBRIS parameters after the load. In the original's order:
 * 1. the explode-on-expiry flag: false for a pod and for large kinds, otherwise (rand & 7) = 0, one draw;
 * 2. the item of `0x218e8` for mode 2: the source's position and rows and the base velocity F(row 3 × its speed);
 * 3. the placement of step 6 (see placement);
 * 4. the push speed s and the spin, one draw for a pod (whose spin is fixed), two otherwise;
 * 5. the velocity F(base + push × s) per component, then the spin axis: 2 for a pod, otherwise rand % 3, one draw.
 * Part 0 holds its source until the hand-off. The fragment keeps the source's rows and speed, and allocation makes it
 * active (CR-08): its first callback comes in the next walk.
 */
export function fragmentInit(source: Entity, model: AssetId, debris: readonly DebrisRuleData[], part: number, rand: RandSource): EntityInit | null {
  const { kindBit } = source;
  if (isOwnKind(kindBit) && (part === 1 || part === 2)) return null;
  if (source.movement === null) throw fault('source');
  const pod = isEscapePod(kindBit, part);
  const explodeOnExpiry = pod || isLargeKind(kindBit) ? false : (rand.next() & 7) === 0;
  const item = spinningItem(source.position, source.orientation, source.movement);
  const index = debrisIndex(kindBit, part);
  const record = index === null ? null : debris[index];
  if (record === undefined) throw fault('debris');
  const { position, push, durability } = placement(item.position, item.orientation, record);
  const { speed, spin } = pushAndSpin(kindBit, pod, rand);
  const base = item.velocity;
  const velocity = vec(store(base.x + push.x * speed), store(base.y + push.y * speed), store(base.z + push.z * speed));
  const spinAxis = pod ? POD_SPIN_AXIS : ((rand.next() % SPIN_AXES) as 0 | 1 | 2);
  return {
    kindBit: FRAGMENT_KIND_BIT,
    ...runtimeKindDefaults(),
    presentation: { type: 'fragment', model, part, display: pod ? 'parts-0-2' : 'part' },
    position,
    orientation: item.orientation,
    maximumSpeed: 0,
    movement: spinningBlock(item.speed, velocity, spin, spinAxis),
    combat: {
      type: 'fragment', sourceKindBit: kindBit, part, debris: index, durability, explodeOnExpiry, expiry: { type: 'pending' },
      handOff: part === 0 ? source.id : null,
    },
  };
}

/** A clock `delay` units after `clock`; past the safe integers is a budget fault. */
function after(clock: number, delay: number): FragmentExpiry {
  const due = clock + delay;
  if (!Number.isSafeInteger(due)) throw new CoreFaultError('budget-exhausted', 'fragments.expiry');
  return Object.freeze({ type: 'at', clock: due });
}

/**
 * The expiry the first callback of `0x24ac4` sets at `clock` (X7), in its order: the player's pod 0x140 later, the
 * wingman's 0x780 later, a flagged fragment 0x80 + rand % 0xC0 later, a large kind's never, any other 0x3C0 + rand %
 * 0x200 later. One draw, except for the pods and large kinds.
 */
export function firstExpiry({ sourceKindBit, part, explodeOnExpiry }: FragmentCombat, clock: number, rand: RandSource): FragmentExpiry {
  if (part === 0 && sourceKindBit === PLAYER_KIND_BIT) return after(clock, PLAYER_POD_LIFETIME);
  if (part === 0 && sourceKindBit === WINGMAN_KIND_BIT) return after(clock, WINGMAN_POD_LIFETIME);
  if (explodeOnExpiry) return after(clock, FLAGGED_LIFETIME + (rand.next() % FLAGGED_LIFETIME_RANGE));
  if (isLargeKind(sourceKindBit)) return NEVER;
  return after(clock, LIFETIME + (rand.next() % LIFETIME_RANGE));
}

/** Whether the expiry is due at `clock` (the state-7 callback, X7): set and not after the clock. */
export const isExpiryDue = (expiry: FragmentExpiry, clock: number): boolean => expiry.type === 'at' && expiry.clock <= clock;

/** What the state-7 callback leaves once it has posted the expiry: the timer cleared, so it never fires again. */
export const SPENT_EXPIRY = NEVER;

/**
 * `0x24a6c`, for a fragment whose durability a projectile (P3-07/17) or the player's contact (P3-07/19) used up: it
 * explodes on expiry, and the expiry becomes clock 1, so its next callback posts it. Before its first callback the
 * fragment has no timer, and nothing happens. Returns whether it took effect.
 */
export function shootDown(fragment: FragmentCombat): boolean {
  if (fragment.expiry.type === 'pending') return false;
  fragment.explodeOnExpiry = true;
  fragment.expiry = SHOT_DOWN_EXPIRY;
  return true;
}

/**
 * The outcome of `0x256e4` (X7), in its order: a flagged fragment explodes; the player's pod ends the destruction view's
 * follow (and calls P3-11's rescue); the wingman's pod and any other fragment are removed.
 */
export function expiryOutcome({ sourceKindBit, part, explodeOnExpiry }: FragmentCombat): FragmentExpiredEvent['outcome'] {
  if (explodeOnExpiry) return 'explodes';
  if (part === 0 && sourceKindBit === PLAYER_KIND_BIT) return 'escape-pod';
  if (part === 0 && sourceKindBit === WINGMAN_KIND_BIT) return 'wingman-pod';
  return 'removed';
}

/** The rotation helper of a spin axis byte: 0 → `0x22990` (rows 1 and 2), 1 → `0x22a50` (rows 1 and 3), 2 → `0x228cc` (rows 2 and 3). */
const SPIN_ROTATIONS: readonly RotationAxis[] = Object.freeze(['roll', 'yaw', 'pitch']);

/**
 * `0x2285c`, a fragment's move (H1): the position F(P + v × step) per axis, then the rows turned by the spin about the
 * axis byte's helper. The spin is per move, not scaled by the step. Returns the new pose; the block does not change.
 */
export function spinFragment(position: Vec3, orientation: Matrix3, block: SpinningMovementBlock, { seconds }: MotionStep): { readonly position: Vec3; readonly orientation: Matrix3 } {
  const { velocity } = block;
  return {
    position: vec(store(position.x + velocity.x * seconds), store(position.y + velocity.y * seconds), store(position.z + velocity.z * seconds)),
    orientation: rotateRows(orientation, SPIN_ROTATIONS[block.spinAxis], block.spin),
  };
}
