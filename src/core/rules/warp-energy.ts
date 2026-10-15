/**
 * The Warp energy rule (docs/plan/p3/02/spec.md, MW-04 step 6, MW-08 step 4 and MW-11; docs/original/formats/executable.md,
 * Warp cost and Warp start): the cost `0x30d2c`, the 3-D distance `0x56b14` it is given, and its three uses, each named
 * apart and measured between its own points:
 * - the **check** of a Warp request: c = cost(trunc(d)), d from the player's position to the destination; it passes when
 *   c ≤ E (equality passes) and charges nothing;
 * - the **estimated cost** of the map readouts: the same cost from the player's icon position to the cursor's world point
 *   or to the stored destination, shown as a percentage of the current energy E;
 * - the **charge** at the completion: c = cost(trunc(D)), D the f32 store of the distance from the Warp origin to the
 *   arrival, deducted as E := max(trunc(E − (c + c × s × 0.5)), 0), s the Warp error; ⌈c × (1 + s/2)⌉ when affordable.
 *
 * The stages that apply them are the Warp start's and the completion's; the readouts are the map partition's. Integer
 * arithmetic is the original's i32 (D17): the cost's `IMUL` wraps and is not rejected (MW-01 check 4), signed `IDIV`
 * truncates toward zero; the x87 parts are in double. A truncation the original's `FISTP` cannot hold in i32 is a fault, as
 * its unmasked invalid-operation exception is.
 */
import type { Pair } from '../../content/rule-data/craft-info.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { MapCostReading } from '../projections/projection.ts';
import { CoreFaultError } from '../errors.ts';
import { quotient } from './energy.ts';
import { toInt32 } from './record-defaults.ts';
import { squaredDistance } from './speed-match.ts';

/** The cost's parameter and result scale: q = n ÷ 1000 picks the pair, and (coefficient × n) ÷ 1000 is the cost. */
const COST_SCALE = 1000;
/** The readouts' percentage factor, the f64 constant 100.0. */
const PERCENT = 100;
/** The completion's error factor, the f64 constant 0.5: an error of 1 charges 1.5 times the cost. */
const ERROR_FACTOR = 0.5;

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `warp-energy.${site}`);

/** A value truncated toward zero into i32 (`0x74518`, `FISTP` dword); beyond i32 the original faults. */
function truncateToInt32(value: number, site: string): number {
  const truncated = Math.trunc(value) + 0;
  if (toInt32(truncated) !== truncated) throw fault(site);
  return truncated;
}

/** `0x56b14`, as its Warp callers read it: √(Σ dᵢ × f32(dᵢ)) in double, unrounded (`0x56b50` and `FSQRT`). */
export function warpDistance(from: Vec3, to: Vec3): number {
  return Math.sqrt(squaredDistance(from, to));
}

/**
 * `0x30d2c(h, n)`, in energy units: with q = n ÷ 1000, the coefficient of the first pair in table order whose first value
 * f satisfies q ≤ f (signed), else of the last pair; then (coefficient × n) ÷ 1000, the product wrapping in i32. `n` is
 * an i32, the truncated distance in runtime units. The player's record has at least one pair (MW-01 check 4); with none
 * the original reads the word before the array, so here that is a fault.
 */
export function warpCost(pairs: readonly Pair[], n: number): number {
  if (pairs.length === 0) throw fault('pairs');
  const q = quotient(n, COST_SCALE, 'warp-energy.parameter');
  const pair = pairs.find(({ at00 }) => q <= at00) ?? pairs[pairs.length - 1];
  return quotient(Math.imul(pair.at04, n), COST_SCALE, 'warp-energy.cost');
}

/** The cost of an unrounded distance d as the start and the readouts compute it: cost(trunc(d)). */
const costOf = (pairs: readonly Pair[], distance: number): number => warpCost(pairs, truncateToInt32(distance, 'parameter'));

/** The start's energy check (MW-04 step 6; Warp start steps 4 and 5): an amount compared, never charged. */
export interface WarpCheck {
  /** R(d): the f32 store of the start distance, which the transit length and `warp-started` take. */
  readonly distance: number;
  /** c = cost(trunc(d)), d unrounded. */
  readonly cost: number;
  /** E: the player's `combat.energy` at the check. */
  readonly energy: number;
  /** c ≤ E (signed): an exactly affordable Warp passes. */
  readonly affordable: boolean;
}

/** The check of a Warp request from the player's current `position` to the effective destination. */
export function warpStartCheck(pairs: readonly Pair[], position: Vec3, destination: Vec3, energy: number): WarpCheck {
  const distance = warpDistance(position, destination);
  const cost = costOf(pairs, distance);
  // d < 2³¹ once its cost exists, so its f32 store is finite.
  return { distance: Math.fround(distance), cost, energy, affordable: cost <= energy };
}

/**
 * The readouts' percentage: trunc((c ÷ E) × 100) in double, at least 1; null at E = 0, where the original raises an x87
 * exception (MW-12 difference 4). For E > 0 a shown value of 100 or more is exactly c ≥ E, so the ≥ 100 colour band also
 * covers an exactly affordable Warp; the bands (≥ 100, 67–99, ≤ 66) are the readout's drawing (MW-11).
 */
export function costPercent(cost: number, energy: number): number | null {
  if (energy === 0) return null;
  return Math.max(Math.trunc((cost / energy) * PERCENT), 1);
}

/**
 * A map readout's estimated cost (`0x49f8c`): from the player's icon position `from` to `point`, the cursor's world point
 * (z = 0) or the stored destination (with its z, not the marker), against the current energy E.
 */
export function warpCostReading(pairs: readonly Pair[], from: Vec3, point: Vec3, energy: number): MapCostReading {
  const cost = costOf(pairs, warpDistance(from, point));
  return { cost, energy, percent: costPercent(cost, energy) };
}

/** The completion's charge (MW-08 step 4; `0x30d94`), the energy actually deducted. */
export interface WarpCharge {
  /** trunc(D): the cost's parameter, D the f32 store of the distance from the Warp origin to the arrival. */
  readonly distance: number;
  /** c = cost(trunc(D)). */
  readonly cost: number;
  readonly energyBefore: number;
  /** max(trunc(E − (c + c × s × 0.5)), 0): the deduction is energyBefore − energyAfter. */
  readonly energyAfter: number;
}

/**
 * The charge of a completed Warp: `distance` is D, the f32 store of `0x56b14` from the arrival to the origin
 * (steering.ts's vectorDistance), which the completion's interval also reads; `error` is the f32 error s in [0, 1]. A charge that ends at 0 does not run the depletion
 * handler; the next due energy update notices it.
 */
export function warpCharge(pairs: readonly Pair[], distance: number, energy: number, error: number): WarpCharge {
  const parameter = truncateToInt32(distance, 'charge-distance');
  const cost = warpCost(pairs, parameter);
  const remaining = truncateToInt32(energy - (cost + cost * error * ERROR_FACTOR), 'charge');
  return { distance: parameter, cost, energyBefore: energy, energyAfter: Math.max(remaining, 0) };
}
