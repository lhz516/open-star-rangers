/**
 * Speed match rules of P3-06 (docs/plan/p3/06/spec.md, 匹配速度与速度辅助; docs/original/formats/executable.md, throttle,
 * maximum speed and speed matching, P3-06/03): the shared match `0x21adc`, which the manual match (Enter), the speed
 * assist `0x27f68` and P3-08's AI message 0x80000 all call (the AI with its own (a, lo, hi)), and the assist's conditions: its kinds, its squared 3-D
 * range, its timer and the speed difference the original flashes the HUD for.
 *
 * These read only what they are given; the caller resolves the target ID (an ID that no longer resolves is the
 * original's invalid handle) and owns the switch, the timer and the events (systems/flight-control.ts). The constants
 * are code rules (spec 技术决定 11). Numbers follow the original's: comparisons in double precision against the f32 or
 * f64 constants, and every f32 store `Math.fround`.
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { MovementBlock, SteeredMovementBlock } from '../world/entity-table.ts';

/**
 * The shape (a, lo, hi) of a call of `0x21adc`, three f32 values: the player's manual match and assist pass
 * PLAYER_MATCH, P3-08's AI message 0x80000 its own (docs/plan/p3/08/spec.md, revision ⑧).
 */
export interface SpeedMatchShape {
  readonly a: number;
  readonly lo: number;
  readonly hi: number;
}

/** (0, 0, 1), the shape of the player's match and of `0x5d080`. */
export const PLAYER_MATCH: SpeedMatchShape = Object.freeze({ a: 0, lo: 0, hi: 1 });

/**
 * The value `0x21adc` writes for a target's current speed with `shape`: v = D(D(a + 1) × the target's speed), clamped
 * by the subject's maximum scaled to F(maximum × lo) below (v, the double, against it) and F(maximum × hi) above (F(v)
 * against it). With PLAYER_MATCH this is the target's speed clamped into [0, maximum].
 */
export function matchedSpeed(targetSpeed: number, maximumSpeed: number, { a, lo, hi }: SpeedMatchShape = PLAYER_MATCH): number {
  const low = Math.fround(maximumSpeed * lo);
  const high = Math.fround(maximumSpeed * hi);
  const speed = (a + 1) * targetSpeed;
  if (speed < low) return low;
  const stored = Math.fround(speed);
  return stored > high ? high : stored;
}

/**
 * The speed `0x21adc` would write on `subject` (the subject's block, its craft record and its maximum speed) from the
 * target's block with `shape`, or null when it fails: unless both have a block and the subject has a craft record. It
 * does not test the subject's lock.
 */
export function speedMatch(
  subject: SteeredMovementBlock | null,
  record: CraftRecord | undefined,
  maximumSpeed: number,
  target: Pick<MovementBlock, 'speed'> | null,
  shape: SpeedMatchShape = PLAYER_MATCH,
): number | null {
  return subject === null || target === null || record === undefined ? null : matchedSpeed(target.speed, maximumSpeed, shape);
}

/**
 * `0x21adc` on `subject` with `shape`: in mode `craft` the matched speed becomes the commanded speed and clears the
 * arrival flag; in any other mode it becomes the current speed. Returns whether it wrote (speedMatch).
 */
export function applySpeedMatch(
  subject: SteeredMovementBlock | null,
  record: CraftRecord | undefined,
  maximumSpeed: number,
  target: Pick<MovementBlock, 'speed'> | null,
  shape: SpeedMatchShape = PLAYER_MATCH,
): boolean {
  const speed = speedMatch(subject, record, maximumSpeed, target, shape);
  if (subject === null || speed === null) return false;
  if (subject.mode === 'craft') {
    subject.commandedSpeed = speed;
    subject.atCommandedSpeed = false;
  } else {
    subject.speed = speed;
  }
  return true;
}

/** The kinds the assist matches (`0x380`, a 16-bit test of the kind): kind bits 7, 8 and 9. */
const ASSIST_KINDS = 0x380;

export function isAssistKind(kindBit: number): boolean {
  return ((ASSIST_KINDS >>> kindBit) & 1) === 1;
}

/**
 * `0x56b50`: Σ dᵢ × f32(dᵢ) over x, y and z, the differences, products and sum in double precision; a squared 3-D
 * distance in which one factor of each square is rounded to f32.
 */
export function squaredDistance(from: Vec3, to: Vec3): number {
  let sum = 0;
  for (const axis of ['x', 'y', 'z'] as const) {
    const difference = from[axis] - to[axis];
    sum += difference * Math.fround(difference);
  }
  return sum;
}

/** The squared range of the assist, the f32 constant `0x170e2d` (300²). */
const ASSIST_RANGE_SQUARED = 90_000;

/** Whether `to` is within the assist's range of `from`: the original skips only when greater, so equality matches. */
export function withinAssistRange(from: Vec3, to: Vec3): boolean {
  return !(squaredDistance(from, to) > ASSIST_RANGE_SQUARED);
}

/** The f64 constant `0x170e31`: an assisted match with a larger speed difference starts the HUD flash. */
const NOTICEABLE_SPEED_DIFFERENCE = 10;

/**
 * Whether |f32(player speed) − target speed| exceeds the flash constant (strict), each speed its block's current
 * speed, 0 without a block (`0x21c78`).
 */
export function speedDifferenceExceeded(playerSpeed: number, targetSpeed: number): boolean {
  return Math.abs(Math.fround(playerSpeed) - targetSpeed) > NOTICEABLE_SPEED_DIFFERENCE;
}

/** The assist's interval in clock units, 0x20 (0.5 s) of the time-base table; it is due again at or past the due clock. */
export const ASSIST_INTERVAL = 0x20;

/**
 * The due clock after an assisted match at `clock`, counted from that clock rather than the previous due one, so a late
 * match does not catch up. A due clock past the safe integers is a budget fault.
 */
export function nextAssistDue(clock: number): number {
  const due = clock + ASSIST_INTERVAL;
  if (!Number.isSafeInteger(due)) throw new CoreFaultError('budget-exhausted', 'speed-match.due-clock');
  return due;
}
