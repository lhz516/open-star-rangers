/**
 * The rules of the parked update (docs/plan/p3/06/spec.md, 活动区域、停放与世界边界; docs/original/formats/executable.md,
 * world boundary, active area, parking and autopilot, P3-06/04): its cadence (`0x2f1b0`), the Warp transit (`0x2f298`)
 * and eligibility (`0x2ff98`) times, and the numeric steps of the parked travel `0x2f314`: the goal distance, the pose
 * rebuild that faces the goal, the Warp jump and travel lengths, the random jitter and the formation snap (`0x56e34`).
 * The system that applies them is systems/area.ts. They are pure and draw only from the RandSource they get.
 *
 * Numbers follow the original's store points: every arithmetic step is a JavaScript double operation, which rounds as
 * the original's double precision does, and every f32 store is `Math.fround`. The original unmasks the overflow,
 * invalid-operation and divide-by-zero exceptions, so an f32 store that is not finite is a fault.
 *
 * Clock arithmetic is exact integer arithmetic. The original adds and compares u32 samples of an absolute counter, so a
 * negative Warp duration (+0xA8, or +0xA8 + +0xA4) wraps there whenever the counter is below its magnitude; Core's
 * clock counts from world creation and never wraps, and it takes the sums as they are (project rule, checkpoint A
 * handoff of P3-06/09): a negative duration ends a transit at its first check and never postpones a Warp. This matches
 * the original whenever its counter exceeds the duration's magnitude. No craft record of the slice has one.
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { CLOCK_UNITS_PER_SECOND } from '../contracts/time.ts';
import { CoreFaultError } from '../errors.ts';
import type { Matrix3 } from '../world/entity-table.ts';
import type { RandSource } from './original-random.ts';
import { randomDirection } from './random-direction.ts';

/** The least interval between two parked updates of an entity; one draw adds up to one less than as much again. */
const PARKED_UPDATE_INTERVAL = 64;

/**
 * The due check of `0x2f1b0`, with `rand`, the draw the parked update takes for every selected entity at every tick:
 * due when the clock is at or past the last update plus 64 + rand % 64.
 */
export function isParkedUpdateDue(clock: number, lastParkedUpdateClock: number, rand: number): boolean {
  return clock >= lastParkedUpdateClock + PARKED_UPDATE_INTERVAL + (rand % PARKED_UPDATE_INTERVAL);
}

/** Whole seconds of a craft record field in clock units (a shift by 6 in the original). */
const clockUnits = (seconds: number): number => seconds * CLOCK_UNITS_PER_SECOND;

/**
 * `0x2f298`'s test: an entity in Warp with Warp timer `warpClock` (not 0) is in transit while the clock is before the
 * timer plus the record's +0xA8 seconds; the record is the valid formation leader's, otherwise the entity's own.
 */
export function isInWarpTransit(warpClock: number, record: Pick<CraftRecord, 'atA8'>, clock: number): boolean {
  return warpClock + clockUnits(record.atA8) > clock;
}

/**
 * `0x2ff98`: whether a craft may Warp: its record's +0xA4 is positive and either its timer is unset (0) or the clock is
 * past the timer plus +0xA8 + +0xA4 seconds.
 */
export function isWarpAllowed(warpClock: number, record: Pick<CraftRecord, 'atA4' | 'atA8'>, clock: number): boolean {
  return record.atA4 > 0 && (warpClock === 0 || clock > warpClock + clockUnits(record.atA8 + record.atA4));
}

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `parked-travel.${site}`);

/** An f32 store: `Math.fround`, and a fault when the stored value is not finite. */
function store(value: number): number {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored)) throw fault('result');
  return stored;
}

const vector = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });

/** The squared distance below which (strictly) the subject has arrived at its goal: f32 10000, 100 units. */
const ARRIVAL_DISTANCE_SQUARED = 10000;

/** How a subject stands to its goal, as `0x2f314` measures it. */
export interface GoalDistance {
  /** The f32 differences goal − position. */
  readonly difference: Vec3;
  /** The double sum dx·F(dx) + (dy·F(dy) + dz·F(dz)), each difference d in double; the arrival test compares it. */
  readonly squared: number;
  /** Its f32 store, which the Warp-jump test and the travel read. */
  readonly squared32: number;
}

export function goalDistance(goal: Vec3, position: Vec3): GoalDistance {
  const dx = goal.x - position.x;
  const dy = goal.y - position.y;
  const dz = goal.z - position.z;
  const difference = vector(store(dx), store(dy), store(dz));
  const squared = dx * difference.x + (dy * difference.y + dz * difference.z);
  return { difference, squared, squared32: store(squared) };
}

/** Whether the subject has arrived: strictly within 100 units of its goal. */
export function hasArrived({ squared }: GoalDistance): boolean {
  return squared < ARRIVAL_DISTANCE_SQUARED;
}

/** The f32 constant `0x170fd4` the squared +0x0C is multiplied by: a Warp jump needs more than twice +0x0C to go. */
const WARP_JUMP_DISTANCE_FACTOR = 4;

/** Whether the goal is far enough for a craft without a leader to Warp: (+0x0C)² × 4 < the f32 squared distance. */
export function isWarpJumpDistance(record: Pick<CraftRecord, 'at0C'>, { squared32 }: GoalDistance): boolean {
  return record.at0C * record.at0C * WARP_JUMP_DISTANCE_FACTOR < squared32;
}

/** The shortest length of a random target offset, f32 `0x170fcc` and f64 800. */
const MINIMUM_OFFSET_LENGTH = 800;
/** The span of the length `0x2f314` draws when the target's record gives none. */
const OFFSET_LENGTH_SPAN = 500;
const INT32_MAX = 0x7fffffff;

/**
 * The random target offset that replaces a zero one (`0x2f314`): one draw for the length, then the random direction
 * `0x56b8c` (two draws), each component f32(direction × length). The length is rand % trunc(the target record's +0x0C),
 * at least 800, when `targetRecord` is given (a subject in AI mode 2 without a valid object target), otherwise
 * rand % 500 + 800. World creation proves +0x0C truncates to at least 1 for every craft that can be a target; beyond
 * i32 the original's integer conversion raises its unmasked invalid-operation exception, a fault here.
 */
export function randomTargetOffset(targetRecord: Pick<CraftRecord, 'at0C'> | null, rand: RandSource): Vec3 {
  let length: number;
  if (targetRecord === null) {
    length = (rand.next() % OFFSET_LENGTH_SPAN) + MINIMUM_OFFSET_LENGTH;
  } else {
    const modulus = Math.trunc(targetRecord.at0C);
    if (!(modulus >= 1 && modulus <= INT32_MAX)) throw fault('offset-modulus');
    length = Math.max(rand.next() % modulus, MINIMUM_OFFSET_LENGTH);
  }
  const direction = randomDirection(rand);
  return vector(store(direction.x * length), store(direction.y * length), store(direction.z * length));
}

/** A target-based goal: f32(target position + offset) per axis. */
export function offsetGoal(targetPosition: Vec3, offset: Vec3): Vec3 {
  return vector(store(targetPosition.x + offset.x), store(targetPosition.y + offset.y), store(targetPosition.z + offset.z));
}

/**
 * `0x56aa8`: the vector divided by its f32 length L = F(√((y² + x²) + z²)), each component F(c × (1 ÷ L)); a vector of
 * length 0 stays as it is.
 */
export function normalized({ x, y, z }: Vec3): Vec3 {
  const length = store(Math.sqrt(y * y + x * x + z * z));
  if (length === 0) return vector(x, y, z);
  const inverse = 1 / length;
  return vector(store(x * inverse), store(y * inverse), store(z * inverse));
}

/** The f32 cross product a × b, each component one difference of exact products. */
const cross = (a: Vec3, b: Vec3): Vec3 => vector(store(a.y * b.z - a.z * b.y), store(a.z * b.x - a.x * b.z), store(a.x * b.y - a.y * b.x));

/** |forward z| above this (f64 `0x170fd8`) takes the x axis as the reference up, otherwise the z axis. */
const STEEP_FORWARD = 0.5;
const X_AXIS = vector(1, 0, 0);
const Z_AXIS = vector(0, 0, 1);

/** The pose rebuild of the Warp jump and the travel, facing the goal. */
export interface Heading {
  /** The f32 distance F(√(the f32 squared distance)). */
  readonly distance: number;
  /** The third row: the f32 unit goal direction. */
  readonly forward: Vec3;
  readonly orientation: Matrix3;
}

/**
 * The pose rebuild of `0x2f314`: the third row is the goal direction, each f32 difference times 1 ÷ the f32 distance;
 * the reference up is the x axis when the unrounded |z| of that direction exceeds 0.5, otherwise the z axis; the first
 * row is normalised(up × forward) and the second forward × first, not normalised.
 */
export function headingTowards({ difference, squared32 }: GoalDistance): Heading {
  const distance = store(Math.sqrt(squared32));
  const inverse = 1 / distance;
  const z = difference.z * inverse;
  const forward = vector(store(difference.x * inverse), store(difference.y * inverse), store(z));
  const right = normalized(cross(Math.abs(z) > STEEP_FORWARD ? X_AXIS : Z_AXIS, forward));
  const up = cross(forward, right);
  const orientation = Object.freeze([right.x, right.y, right.z, up.x, up.y, up.z, forward.x, forward.y, forward.z]) as unknown as Matrix3;
  return { distance, forward, orientation };
}

/** The lower bound, exclusive, of a jump length cap (`0x2f314` compares f32 +0xA0 with 1.0). */
const MINIMUM_JUMP_CAP = 1;

/** The Warp jump's length: +0xA0 when it lies strictly between 1 and the distance, otherwise the distance. */
export function warpJumpLength(record: Pick<CraftRecord, 'atA0'>, distance: number): number {
  const cap = record.atA0;
  return cap > MINIMUM_JUMP_CAP && cap < distance ? cap : distance;
}

/**
 * The travel's length after `elapsed` clock units: the double step elapsed ÷ 64 × +0xB8 (the craft record's base
 * maximum speed, not the entity's current maximum), compared unrounded with the distance; the distance when the step
 * reaches it, otherwise F(step).
 */
export function travelLength(elapsed: number, record: Pick<CraftRecord, 'atB8'>, distance: number): number {
  const step = elapsed * (1 / CLOCK_UNITS_PER_SECOND) * record.atB8;
  return step >= distance ? distance : store(step);
}

/** A move along `forward` by `length`: F(position + F(forward × length)) per axis. */
export function advanced(position: Vec3, forward: Vec3, length: number): Vec3 {
  const axis = (from: number, along: number): number => store(from + store(along * length));
  return vector(axis(position.x, forward.x), axis(position.y, forward.y), axis(position.z, forward.z));
}

/** The Warp jump's jitter span: up to 999 units per axis. */
export const WARP_JUMP_JITTER = 1000;
/** The travel's jitter span: up to 19 units per axis. */
export const TRAVEL_JITTER = 20;

/**
 * The random jitter after a jump or a travel step: for x, y and z in turn, a sign draw (an odd value adds, an even one
 * subtracts) and a magnitude draw rand % `span`, added as an integer: F(position + sign × magnitude). Six draws.
 */
export function jittered(position: Vec3, span: number, rand: RandSource): Vec3 {
  const axis = (value: number): number => {
    const sign = rand.next() % 2 !== 0 ? 1 : -1;
    // `+ 0` turns the −0 of a negative sign times 0 into the integer 0 the original adds.
    return store(sign * (rand.next() % span) + 0 + value);
  };
  const x = axis(position.x);
  const y = axis(position.y);
  return vector(x, y, axis(position.z));
}

/**
 * `0x56e34`, the formation snap: the leader's position plus the offset along the leader's rows. Each component c is
 * F(p_c + F((o.y × row2_c + o.x × row1_c) + o.z × row3_c)).
 */
export function formationPosition(leaderOrientation: Matrix3, leaderPosition: Vec3, offset: Vec3): Vec3 {
  const axis = (column: number, from: number): number => {
    const along = offset.y * leaderOrientation[3 + column] + offset.x * leaderOrientation[column] + offset.z * leaderOrientation[6 + column];
    return store(from + store(along));
  };
  return vector(axis(0, leaderPosition.x), axis(1, leaderPosition.y), axis(2, leaderPosition.z));
}
