/**
 * The rescue's own rules (docs/plan/p3/02/spec.md, ME-06, ME-10, ME-17 decision 7; docs/original/formats/executable.md,
 * rescue `0x32e14` and `0x67b98`, P3-11/02): the base selection and the rescue point of `0x67b98` steps 6 and 7, the
 * rewrite of the player's runtime record (steps 5, 7 and 8), and the movement block `0x32e14` rebuilds (step 13).
 * systems/rescue.ts runs them in the original's order with the placement service and the other restores.
 *
 * - **Base selection:** every entity of the base kinds `0x68000` still in the kind lists, in ascending bit order and
 *   allocation order, whatever its state, activity, dead flag or pending removal; one draw r ∈ [0, 32767] picks the
 *   r % count-th, so the preimages are not uniform (count 3: 10923, 10923, 10922). No base: no draw.
 * - **Rescue point:** the base's position (bit copies) with z := F(z + 2000), one f32 rounding; the zero vector
 *   without a base, which sends the placement to the whole-world default.
 * - **Movement block:** mode 0 at the new maximum speed, the throttle chop(F(speed ÷ +0xB8) × 128) from the old
 *   block's speed; a throttle whose table index falls outside the table is a fault (the energy rescue in a Warp, gap
 *   G-2), not clamped as other throttles are.
 */
import type { Vector3 } from '../../content/logic/logic-content.ts';
import { CoreFaultError } from '../errors.ts';
import type { Entity, EntityTable, MovementBlock, SteeredMovementBlock } from '../world/entity-table.ts';
import type { RuntimeRecord } from '../world/spawn-state.ts';
import { craftMovementBlock, speedRatio, THROTTLE_TABLE } from './flight-state.ts';
import type { RandSource } from './original-random.ts';

/** The base kinds `0x68000`: bits 15, 17 and 18. */
const BASE_KINDS = 0x68000;
/** The f32 height `0x1725cc` above the chosen base. */
const RESCUE_HEIGHT = 2000;
/** The f64 factor `0x17004c` that turns a speed ratio into a throttle. */
const THROTTLE_PER_RATIO = 128;
const THROTTLE_TABLE_MIDDLE = (THROTTLE_TABLE.length - 1) / 2;

const ZERO: Vector3 = Object.freeze({ x: 0, y: 0, z: 0 });

/** The base a rescue chose, null without a candidate, and the number of candidates it drew from. */
interface RescueBase {
  readonly base: Entity | null;
  readonly candidates: number;
}

/** `0x67b98` steps 6 and 7: the choice among the base-class entities (module comment): one draw when there is any. */
export function selectRescueBase(entities: EntityTable, rand: RandSource): RescueBase {
  const candidates = [...entities.walk(BASE_KINDS)];
  if (candidates.length === 0) return { base: null, candidates: 0 };
  return { base: candidates[rand.next() % candidates.length], candidates: candidates.length };
}

/** The point the player's record takes (module comment). */
export function rescuePoint(base: Entity | null): Vector3 {
  if (base === null) return ZERO;
  const { x, y, z } = base.position;
  return Object.freeze({ x, y, z: Math.fround(z + RESCUE_HEIGHT) });
}

/**
 * The rewrite of the player's runtime record in place (ME-06): the stored position becomes `point`, the rectangle and
 * the anchor go; the grid spacing, the rule inputs and every other field stay. The record keeps its slot and identity.
 */
export function replaceRescueRecord(record: RuntimeRecord, point: Vector3): void {
  record.position = point;
  record.region = null;
  record.anchor = null;
}

/**
 * `0x218e8` and `0x21794` in mode 0 after a rescue (module comment): speed = commanded speed from the throttle table,
 * the lock, the rates and the disturbance cleared.
 */
export function rescueMovementBlock(oldBlock: Pick<MovementBlock, 'speed'>, maximumSpeed: number, baseMaximumSpeed: number): SteeredMovementBlock {
  const throttle = Math.trunc(speedRatio(oldBlock.speed, baseMaximumSpeed) * THROTTLE_PER_RATIO);
  const index = THROTTLE_TABLE_MIDDLE + Math.floor(throttle / 2);
  if (!(index >= 0 && index < THROTTLE_TABLE.length)) throw new CoreFaultError('invariant-violated', 'rescue.throttle');
  return craftMovementBlock(throttle, maximumSpeed, baseMaximumSpeed);
}
