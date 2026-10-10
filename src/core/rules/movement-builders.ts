/**
 * Builders of the movement blocks and poses of P3-07's runtime kinds (docs/plan/p3/02/spec.md, CR-03 and CR-09;
 * docs/original/formats/executable.md, W7, W11 and H1): the parameter item `0x218e8` builds from a source object for
 * mode 1, the mode-1 branch of `0x21794` that turns an item into a `linear` block, the frame completion `0x56d18`, the
 * offset position the launch constructors and the aim solution compute inline, and a missile's guided launch speed
 * `0x21a3c` and launch scatter. Mode 2 (fragments) is P3-07/18's; mode 0 (missiles, the rescue, kind 0x4000) is P3-06's
 * craftMovementBlock and rebuiltMovementBlock.
 *
 * Numbers follow the original's write-back points (W13): every arithmetic step is a JavaScript double operation, as
 * the x87 rounds at double precision, and every f32 store is `Math.fround`. A product of two f32 values is exact in
 * double precision, so it rounds only at its store. The original unmasks the overflow and invalid-operation
 * exceptions, so a store that is not finite is a fault.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { Entity, LinearMovementBlock, Matrix3, MovementBlock, SteeredMovementBlock } from '../world/entity-table.ts';
import { rotateRows } from './flight-motion.ts';
import { speedRatio } from './flight-state.ts';
import { normalise } from './load-transforms.ts';
import { RAND_SCALE, type RandSource } from './original-random.ts';

/** An f32 store F(x): `Math.fround`, and a fault when the stored value is not finite. */
function store(value: number): number {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored)) throw new CoreFaultError('invariant-violated', 'movement-builders.result');
  return stored;
}

const vec = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
const frozenMatrix = (rows: readonly number[]): Matrix3 => Object.freeze([...rows]) as unknown as Matrix3;

/** An entity's speed as `0x21c78` reads it: its block's +0x08, or 0 without a block. */
export const speedOf = (entity: Entity): number => entity.movement?.speed ?? 0;

/** Row `index` (0, 1 or 2 for the original's rows 1, 2 and 3) of `rows`. */
export const rowOf = (rows: Matrix3, index: 0 | 1 | 2): Vec3 => vec(rows[3 * index], rows[3 * index + 1], rows[3 * index + 2]);

/** f32(a × b − c × d): both products are exact in double precision, so only the difference and the store round. */
const crossComponent = (a: number, b: number, c: number, d: number): number => store(a * b - c * d);

/**
 * `0x56d18` as both of its P3-07 callers use it (the aim solution `0x2e9d4` and `0x218e8` for a mode-2 source): row 3 is
 * normalised (`0x56aa8`); row 1 becomes row 2 × row 3, then is normalised; row 2 becomes row 3 × row 1, not normalised.
 */
export function orthonormalFrame(rows: Matrix3): Matrix3 {
  const third = normalise(rowOf(rows, 2));
  const [, , , x2, y2, z2] = rows;
  const first = normalise(vec(
    crossComponent(y2, third.z, z2, third.y),
    crossComponent(z2, third.x, x2, third.z),
    crossComponent(x2, third.y, y2, third.x),
  ));
  return frozenMatrix([
    first.x, first.y, first.z,
    crossComponent(third.y, first.z, third.z, first.y),
    crossComponent(third.z, first.x, third.x, first.z),
    crossComponent(third.x, first.y, third.y, first.x),
    third.x, third.y, third.z,
  ]);
}

/**
 * A position moved by an offset along `rows` (the launch constructors `0x25b0c` and `0x2b00c`, and the aim solution's
 * origin): per component p₁ = F(p + F(row 1 × x)), p₂ = F(p₁ + F(row 2 × y)), then F(p₂ + F(row 3 × k)). The
 * constructors pass k = z + shooter speed × step in double precision (the speed and the f32 step multiply exactly);
 * the aim solution passes k = z.
 */
export function offsetPosition(position: Vec3, rows: Matrix3, x: number, y: number, k: number): Vec3 {
  const along = (base: Vec3, row: 0 | 1 | 2, length: number): Vec3 => {
    const { x: rx, y: ry, z: rz } = rowOf(rows, row);
    return vec(store(base.x + store(rx * length)), store(base.y + store(ry * length)), store(base.z + store(rz * length)));
  };
  return along(along(along(position, 0, x), 1, y), 2, k);
}

/** The parameter item of `0x218e8` for modes 1 and 2: a pose and a speed. */
export interface MovementItem {
  readonly position: Vec3;
  readonly orientation: Matrix3;
  /** f32. */
  readonly speed: number;
}

/**
 * `0x218e8(source, its block, mode 1)`: the source's position and rows and its block's speed. For a `spinning` (mode 2)
 * source, row 3 is first replaced by the source's velocity and the frame completed (`0x56d18`). The speed of the source
 * is copied, not added: the constructors that use the item set their own.
 */
export function linearItem(position: Vec3, orientation: Matrix3, block: MovementBlock): MovementItem {
  if (block.mode !== 'spinning') return { position, orientation, speed: block.speed };
  const { x, y, z } = block.velocity;
  return { position, orientation: orthonormalFrame(frozenMatrix([...orientation.slice(0, 6), x, y, z])), speed: block.speed };
}

/**
 * The mode-1 branch of `0x21794` for an item: speed, velocity F(row 3 × speed) per component, the item's position as the
 * position before the first move, and the hit-test flag (projectiles true, explosions false).
 */
export function linearBlock({ position, orientation, speed }: MovementItem, hitTest: boolean): LinearMovementBlock {
  const { x, y, z } = rowOf(orientation, 2);
  return { mode: 'linear', speed, velocity: vec(store(x * speed), store(y * speed), store(z * speed)), previousPosition: position, hitTest };
}

/**
 * `0x21a3c` on a guided missile's new mode-0 block (W11, P3-07/30): arrived; speed and commanded speed the missile's
 * maximum speed when it is below the shooter's speed, otherwise the shooter's (equal values give the shooter's), copied
 * without rounding; the ratio F(speed ÷ base) against the body record's +0xB8 when that is positive, otherwise 0. The
 * caller skips it for a shooter without a block, as the original returns without a write.
 */
export function applyGuidedLaunchSpeed(block: SteeredMovementBlock, maximumSpeed: number, shooterSpeed: number, baseMaximumSpeed: number): void {
  const speed = maximumSpeed < shooterSpeed ? maximumSpeed : shooterSpeed;
  block.atCommandedSpeed = true;
  block.speed = speed;
  block.commandedSpeed = speed;
  block.speedRatio = speedRatio(speed, baseMaximumSpeed);
}

/** f64 `0x170ef8` and `0x170f00`: the roll of a scattered launch, u × 1.57079635 − 0.785398175 (about ±45°). */
const SCATTER_ROLL_SPAN = 1.57079635;
const SCATTER_ROLL_BASE = -0.785398175;
/** f64 `0x170f08` and `0x170f10`: its pitch or yaw, u × 0.03490658555555556 − 0.01745329277777778 (about ±1°). */
const SCATTER_TURN_SPAN = 0.03490658555555556;
const SCATTER_TURN_BASE = -0.01745329277777778;

/**
 * The scatter of a missile with +0x20 ≠ 0 (`0x2b00c`, W11, W12), three draws: a roll by F((rand × C) × span + base)
 * (`0x22990`), then a coin (rand & 1) turning about row 2 when odd (`0x22a50`) and about row 1 when even (`0x228cc`) by
 * the smaller angle of a third draw. P3-06's rotation helpers rotate the rows.
 */
export function scatteredRows(rows: Matrix3, rand: RandSource): Matrix3 {
  const angle = (span: number, base: number): number => store(rand.next() * RAND_SCALE * span + base);
  const rolled = rotateRows(rows, 'roll', angle(SCATTER_ROLL_SPAN, SCATTER_ROLL_BASE));
  const axis = (rand.next() & 1) === 1 ? 'yaw' : 'pitch';
  return rotateRows(rolled, axis, angle(SCATTER_TURN_SPAN, SCATTER_TURN_BASE));
}
