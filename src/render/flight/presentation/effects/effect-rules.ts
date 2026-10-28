/**
 * The arithmetic of the presentation effects (docs/plan/p3/12/spec.md, 表现层效果与会话级选择者;
 * docs/original/formats/executable.md, X2–X5, X7 and X11): the extra explosions of `0x23ac8` step 6 and `0x23fdc`, the
 * screen gate `0x2443c`, the producer `0x24d78` in modes 1 and 2 with the constructor `0x24ec4`, the discriminator-1/2
 * expiries of `0x24ac4` and the flash check `0x24314`. presentation-effects.ts keeps the objects and their timing.
 *
 * Numbers follow the original's write-back points as Core's rules do: every arithmetic step is a double operation and
 * every f32 store `Math.fround`. Each draw keeps the original's support and mapping (`rand % n`, low-bit masks,
 * F(rand × C × K + B)); the order of draws need not match the original's (spec, 随机), and draws whose result the
 * original never uses (the mode-0 event of non-craft and extra explosions) are not taken.
 */
import type { Vec3 } from '../../../../core/contracts/domain-events.ts';
import { pointInFrame } from '../../../../core/rules/collision-shapes.ts';
import { isLargeKind } from '../../../../core/rules/fragments.ts';
import { normalise } from '../../../../core/rules/load-transforms.ts';
import { spinningBlock } from '../../../../core/rules/movement-builders.ts';
import { RAND_MAX, RAND_SCALE, type RandSource } from '../../../../core/rules/original-random.ts';
import { randomDirection } from '../../../../core/rules/random-direction.ts';
import { drawStartupRotation, STARTUP_ROTATIONS } from '../../../../core/rules/startup-rotations.ts';
import { combatTypeOf, type Matrix3, type SpinningMovementBlock } from '../../../../core/world/entity-table.ts';
import { PresentationError } from '../presentation-budget.ts';
import type { CameraPose, PresentationViewport } from '../presentation-contract.ts';

const PATH = 'presentation.effects';

/** One rand value, checked to be the original's 0–32767. */
function drawRand(random: RandSource): number {
  const value = random.next();
  if (!Number.isInteger(value) || value < 0 || value > RAND_MAX) throw new PresentationError('invariant-violated', `${PATH}.random`, 'must give integers from 0 to 32767');
  return value;
}

/** An f32 store; a value that is not finite is a fault, as the original unmasks overflow and invalid operations. */
function store(value: number): number {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored)) throw new PresentationError('invariant-violated', `${PATH}.number`, 'must stay finite');
  return stored;
}

const vec = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
const difference = (a: Vec3, b: Vec3): Vec3 => vec(store(a.x - b.x), store(a.y - b.y), store(a.z - b.z));

/** F(rand × C × span + base), C the f32 1/32767. */
const realDraw = (random: RandSource, span: number, base: number): number => store(drawRand(random) * RAND_SCALE * span + base);

/** Kind bits 0–19 (mask `0xfffff`): only their explosions have extras, fragment events and the flash. */
export const isCraftKind = (kindBit: number): boolean => combatTypeOf(kindBit) === 'craft';

// --- Extra explosions (X2 step 6, X3, X4) ---

/** (K, B) of the jitter draws: (120, −60) for large source kinds, (30, −15) otherwise. */
const LARGE_JITTER = Object.freeze({ span: 120, base: -60 });
const JITTER = Object.freeze({ span: 30, base: -15 });
/** The extras stand this far from the source towards the camera. */
const TOWARDS_CAMERA = 2;
/** An extra waits rand % 21 clock units after its first callback before it activates (X4). */
const EXTRA_DELAY_RANGE = 21;

/**
 * The extra explosions `0x23ac8` makes for a craft source at `source` (its position at the call), seen from `camera`,
 * the camera before the construction's tick (PV7): n := rand AND 3, plus 2 for large kinds; then for each extra six
 * draws tᵢ = F(rand × C × K + B), each stored again times the camera's R0.x, R0.y, R0.z, R1.x, R1.y and R1.z in turn,
 * and the position F(P + 2u + (t₁R0.x + t₄R1.x)) per component, with u = normalise(F(camera − P)): the jitter is per
 * component, not t·R0 + t′·R1.
 */
export function extraExplosionPositions(sourceKindBit: number, source: Vec3, camera: CameraPose, random: RandSource): readonly Vec3[] {
  const large = isLargeKind(sourceKindBit);
  const count = (drawRand(random) & 3) + (large ? 2 : 0);
  const { span, base } = large ? LARGE_JITTER : JITTER;
  const towards = normalise(difference(camera.position, source));
  const [r0x, r0y, r0z, r1x, r1y, r1z] = camera.rows;
  const positions: Vec3[] = [];
  for (let ordinal = 0; ordinal < count; ordinal++) {
    const [a1, a2, a3, a4, a5, a6] = [r0x, r0y, r0z, r1x, r1y, r1z].map((row) => store(realDraw(random, span, base) * row));
    positions.push(vec(
      store(source.x + TOWARDS_CAMERA * towards.x + (a1 + a4)),
      store(source.y + TOWARDS_CAMERA * towards.y + (a2 + a5)),
      store(source.z + TOWARDS_CAMERA * towards.z + (a3 + a6)),
    ));
  }
  return Object.freeze(positions);
}

/** An extra's activation delay [4], drawn at its first callback: it activates once the clock is past that + delay. */
export const extraActivationDelay = (random: RandSource): number => drawRand(random) % EXTRA_DELAY_RANGE;

// --- Event 0x10 (X4, X5) ---

/** The fragment events [3] (mode 1) and [2] (mode 2) are due 0xC and 0x10 after the first callback; mode 0 makes nothing. */
export const FRAGMENT_EVENT_DELAYS = Object.freeze({ 1: 0xc, 2: 0x10 } as const);
export type FragmentEventMode = 1 | 2;

/** The depth range of the gate's projection, f32 constants: 10 ≤ z < 3800. */
const NEAR_DEPTH = 10;
const FAR_DEPTH = 3800;
/**
 * Class 0's entries of the f32 tables `0x174ae8` {90000, 202500, −1} and `0x174af4` {202500, −1, −1}: 300² and 450².
 * Classes 1 (kinds 4–0x40, 0x400–0x1000) and 2 (0x8000–0x80000), together exactly the large kinds, keep nothing.
 */
const KEEP_ALL_BELOW = 90_000;
const KEEP_MODE_2_BELOW = 202_500;

/**
 * Whether `position` projects into `viewport` from `camera` (`0x2443c`): the local point rows · (P − camera)
 * (`0x56dc0`) needs 10 ≤ z < 3800; with W = right and the centre (right SAR 1, bottom SAR 1), sx = chop(W × x × (1/z))
 * + cx and sy = chop(−W × y × (1/z)) + cy must lie within the rectangle, ends included.
 */
export function isOnScreen(position: Vec3, camera: CameraPose, { left, top, right, bottom }: PresentationViewport): boolean {
  const { x, y, z } = pointInFrame(camera.rows, camera.position, position);
  if (!(z >= NEAR_DEPTH && z < FAR_DEPTH)) return false;
  const inverse = 1 / z;
  const sx = Math.trunc(right * x * inverse) + (right >> 1);
  const sy = Math.trunc(-right * y * inverse) + (bottom >> 1);
  return left <= sx && sx <= right && top <= sy && sy <= bottom;
}

/**
 * The fragment events a craft source's explosion keeps (`0x2443c`), at its first callback, before it moves: none off
 * screen; on screen, with d² = Σ F(P − camera)ᵢ² in double, all below A and B ≥ 0, else only mode 2 below B and A ≥ 0,
 * else none: class 0 keeps both modes under 300 and mode 2 under 450, classes 1 and 2 nothing.
 */
export function keptFragmentEvents(sourceKindBit: number, position: Vec3, camera: CameraPose, viewport: PresentationViewport): readonly FragmentEventMode[] {
  if (isLargeKind(sourceKindBit) || !isOnScreen(position, camera, viewport)) return [];
  const { x, y, z } = difference(position, camera.position);
  const squared = x * x + y * y + z * z;
  if (squared < KEEP_ALL_BELOW) return [1, 2];
  return squared < KEEP_MODE_2_BELOW ? [2] : [];
}

/** Kinds `0x91780` (0x80, 0x100, 0x200, 0x400, 0x1000, 0x10000, 0x80000): the only ones the producer sheds fragments for. */
const SHEDDING_KINDS = 0x91780;
const MODE_1_BASE = 10;
const MODE_2_RANGE = 5;

/**
 * The producer `0x24d78` for a fragment event: n := (rand AND 3) + 10 discriminator-1 fragments (mode 1) or rand % 5
 * discriminator-2 fragments (mode 2), drawn for every source kind; 0 unless the kind is in `0x91780`.
 */
export function fragmentEventCount(mode: FragmentEventMode, sourceKindBit: number, random: RandSource): number {
  const count = mode === 1 ? (drawRand(random) & 3) + MODE_1_BASE : drawRand(random) % MODE_2_RANGE;
  return ((SHEDDING_KINDS >>> sourceKindBit) & 1) === 1 ? count : 0;
}

// --- Discriminator-1/2 fragments (X5, X7) ---

export type FragmentDiscriminator = 1 | 2;

/**
 * The speed s of an explosion's block, which its fragments keep: its velocity is F(R2 × s), so s = F(R2 · v ÷ R2 · R2)
 * from its rows (rows that were never re-orthonormalised need not be unit length), up to the velocity's f32 rounding;
 * 0 with a zero R2, whose velocity is zero whatever s is. FS-03 gives the velocity, not the speed, whose sign it loses.
 */
export function explosionSpeed(rows: Matrix3, { x, y, z }: Vec3): number {
  const [, , , , , , rx, ry, rz] = rows;
  const length = rx * rx + ry * ry + rz * rz;
  return length === 0 ? 0 : store((rx * x + ry * y + rz * z) / length);
}

/**
 * The f64 constants of `0x24ec4` (Likely: one pool next to the code, read from the local image as values only): the
 * spin span 20° or 10° and its base 5°, each degrees × 3.1415927 ÷ 180; the speed span 14 or 12 and its base 4.
 */
const DEGREE = 3.1415927 / 180;
const SPIN_BASE = 5 * DEGREE;
const MOTION = Object.freeze({
  1: Object.freeze({ spinSpan: 20 * DEGREE, speedSpan: 14 }),
  2: Object.freeze({ spinSpan: 10 * DEGREE, speedSpan: 12 }),
} as const);
const SPEED_BASE = 4;
/** Discriminator 2 explodes on expiry when rand % 10 = 0; its spin axis is table `0x174b08` {0, 1, 2} at rand % 3. */
const EXPLODE_RANGE = 10;
const SPIN_AXES = 3;
/** The visual completion `0x3e590` gives a discriminator-1 fragment shape `0x1752ac`[rand % 2], once. */
const SHAPES = 2;

/** One discriminator-1/2 fragment as `0x24ec4` makes it, and the shape its visual draws once. */
export interface FragmentInit {
  readonly discriminator: FragmentDiscriminator;
  /** Discriminator 2's +0xF5, its index in the producer's loop; null for discriminator 1, which does not write it. */
  readonly part: number | null;
  /** +0xF6: only discriminator 2 may explode on expiry. */
  readonly explodesOnExpiry: boolean;
  /** Discriminator 1's procedural shape, 0 or 1; null for discriminator 2. */
  readonly shape: 0 | 1 | null;
  readonly position: Vec3;
  readonly rows: Matrix3;
  readonly block: SpinningMovementBlock;
}

/**
 * `0x24ec4(explosion, kind, disc, i)`: the item of the explosion (its position, and its velocity as the base, since
 * the item's velocity is F(R2 × its speed)); for discriminator 2 the flag (rand % 10 = 0); the random direction u
 * (`0x56b8c`, taken twice for discriminator 1, which keeps the second); spin F(rand × C × span + 5°) and speed
 * F(rand × C × span + 4); velocity F(base + u × speed) per component; rows from a start-up rotation (rand % 64); spin
 * axis 0, or rand % 3 for discriminator 2. The block keeps the explosion's `speed`. Seven draws, plus discriminator 1's
 * shape.
 */
export function fragmentInit(discriminator: FragmentDiscriminator, part: number, explosion: Vec3, velocity: Vec3, speed: number, random: RandSource): FragmentInit {
  const explodesOnExpiry = discriminator === 2 && drawRand(random) % EXPLODE_RANGE === 0;
  let push = randomDirection(random);
  if (discriminator === 1) push = randomDirection(random);
  const { spinSpan, speedSpan } = MOTION[discriminator];
  const spin = realDraw(random, spinSpan, SPIN_BASE);
  const pushSpeed = realDraw(random, speedSpan, SPEED_BASE);
  const moving = vec(store(velocity.x + push.x * pushSpeed), store(velocity.y + push.y * pushSpeed), store(velocity.z + push.z * pushSpeed));
  const rows = drawStartupRotation(STARTUP_ROTATIONS, random);
  const spinAxis = discriminator === 1 ? 0 : (drawRand(random) % SPIN_AXES) as 0 | 1 | 2;
  const shape = discriminator === 1 ? (drawRand(random) % SHAPES) as 0 | 1 : null;
  return Object.freeze({
    discriminator,
    part: discriminator === 2 ? part : null,
    explodesOnExpiry,
    shape,
    position: explosion,
    rows,
    block: spinningBlock(speed, moving, spin, spinAxis),
  });
}

/** The expiries of the first callback (X7): 0x100 + rand % 0xC0 (discriminator 1) or 0x200 + rand % 0xC0 after it. */
const LIFETIME_BASE = Object.freeze({ 1: 0x100, 2: 0x200 } as const);
const LIFETIME_RANGE = 0xc0;

export const fragmentLifetime = (discriminator: FragmentDiscriminator, random: RandSource): number =>
  LIFETIME_BASE[discriminator] + (drawRand(random) % LIFETIME_RANGE);

// --- Flash check (X4) ---

/** The L1 distances of `0x24314`, and the threshold of the unnormalised forward dot product. */
const FLASH_NEAR = 100;
const FLASH_AHEAD = 150;
const FLASH_FORWARD = 0.707;

/**
 * `0x24314`, at an explosion's first update: only craft sources; large kinds always; others when the L1 distance
 * from the camera is below 100, or below 150 with the camera's forward row · (P − camera) above 0.707.
 */
export function flashChecks(sourceKindBit: number, position: Vec3, camera: CameraPose): boolean {
  if (!isCraftKind(sourceKindBit)) return false;
  if (isLargeKind(sourceKindBit)) return true;
  const { x, y, z } = difference(position, camera.position);
  const distance = Math.abs(x) + Math.abs(y) + Math.abs(z);
  if (distance < FLASH_NEAR) return true;
  const [, , , , , , fx, fy, fz] = camera.rows;
  return distance < FLASH_AHEAD && fx * x + fy * y + fz * z > FLASH_FORWARD;
}
