/**
 * Mode-1 motion and the projectile timer (docs/plan/p3/02/spec.md, CR-02 and CR-03; docs/original/formats/executable.md,
 * H1, H2 and H8): the move `0x22818` that projectiles and explosions share, and the timer block of the projectile
 * callback `0x259b0`. systems/projectiles.ts runs the callback; the movement stage calls the move, and for a block
 * with the hit-test flag the hit test right after it.
 *
 * Numbers follow the original's write-back points (W13): the frame step is an f32, so its product with an f32 velocity
 * component is exact in double precision; the sum rounds to double as the x87 does at the start-up precision, and the
 * f32 store is `Math.fround`. A store that is not finite is a fault, as the original unmasks the overflow and
 * invalid-operation exceptions. The timer's clocks are compared as plain integers, since Core's clock never wraps
 * (P3-02); the original's unsigned `≥` agrees with that for every clock Core reaches.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { LinearMovementBlock, ProjectileCombat } from '../world/entity-table.ts';
import type { MotionStep } from './flight-motion.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `projectile-motion.${site}`);

/** An f32 store F(x), and a fault when it is not finite. */
function store(value: number): number {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored)) throw fault('result');
  return stored;
}

/** What a mode-1 move changes: the position, and the block's position before the move. */
export interface LinearMotion {
  readonly position: Vec3;
  readonly block: LinearMovementBlock;
}

/**
 * `0x22818`: the position before the move goes to the block's +0x0C–+0x14, then each axis moves by F(v × step + P),
 * one f32 store per axis. The velocity is constant: no drag, no gravity, and the block's speed is not read. Returns the
 * new position and a copy of the block; neither argument changes.
 */
export function moveLinear(position: Vec3, block: LinearMovementBlock, { seconds }: MotionStep): LinearMotion {
  const { velocity } = block;
  return {
    position: Object.freeze({
      x: store(velocity.x * seconds + position.x),
      y: store(velocity.y * seconds + position.y),
      z: store(velocity.z * seconds + position.z),
    }),
    block: { ...block, previousPosition: position },
  };
}

/** A projectile's timer block once its first callback has run. */
export type ProjectileTimer = NonNullable<ProjectileCombat['expiry']>;

/** How long a projectile that has hit lingers after its first state-8 callback: 0x80 clock units (2 s). */
const HIT_LINGER = 0x80;

/** `clock + duration` as a clock; a sum Core cannot represent (negative or past the safe integers) is a fault. */
function dueClock(clock: number, duration: number): number {
  const due = clock + duration;
  if (!Number.isSafeInteger(due)) throw new CoreFaultError('budget-exhausted', 'projectile-motion.clock');
  if (due < 0) throw fault('clock');
  return due;
}

/**
 * The timer the first callback of `0x259b0` allocates at `clock` (H2): due at the clock plus the gun's lifetime +0x24
 * (i32), with the first-state-8 flag set. The lifetime counts from that callback, one tick after the launch.
 */
export function projectileTimer(clock: number, lifetime: number): ProjectileTimer {
  return { clock: dueClock(clock, lifetime), firstHitPending: true };
}

/** The first state-8 callback after a hit (H2): the flag cleared and the timer due 0x80 units after `clock`. */
export function lingerTimer(clock: number): ProjectileTimer {
  return { clock: dueClock(clock, HIT_LINGER), firstHitPending: false };
}

/**
 * Whether the timer is due at `clock`: the original's `due ≤ clock` (states 7 and 8 post the expiry then). Without a
 * timer it never is, as the callback tests for none.
 */
export const isTimerDue = (timer: ProjectileTimer | null, clock: number): boolean => timer !== null && timer.clock <= clock;
