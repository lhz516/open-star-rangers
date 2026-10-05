import { fail, readRecord } from './contract-validation.ts';
import { visitGroupManifest } from './manifest.ts';

/**
 * Schema 1 budget dimensions (S-09) and their fixed units. Adding or removing a dimension or changing a unit is an
 * incompatible content schema change, so a quantity in another unit is never a schema 1 dimension.
 */
export const BUDGET_UNITS = Object.freeze({
  assets: 'asset',
  dependencyEdges: 'dependency-edge',
  sourceReadBytes: 'byte',
  payloadBytes: 'byte',
  vertices: 'vertex',
  triangles: 'triangle',
  imagePixels: 'pixel',
  paletteEntries: 'palette-entry',
  glyphs: 'glyph',
  audioSamples: 'sample-point',
  missionObjects: 'mission-object',
  missionReferences: 'mission-reference',
} as const);

export type BudgetDimension = keyof typeof BUDGET_UNITS;
export const BUDGET_DIMENSIONS: readonly BudgetDimension[] = Object.freeze(Object.keys(BUDGET_UNITS) as BudgetDimension[]);

/** Limits or usage: every schema 1 dimension as a nonnegative safe integer, 0 where the dimension does not apply. */
export type BudgetRecord = { readonly [Dimension in BudgetDimension]: number };

export const EMPTY_BUDGET_USAGE: BudgetRecord = Object.freeze(
  Object.fromEntries(BUDGET_DIMENSIONS.map(dimension => [dimension, 0])) as Record<BudgetDimension, number>,
);

/** Reads a complete budget record; a missing, unknown or invalid dimension fails instead of defaulting. */
export function readBudgetRecord(value: unknown, path: string): BudgetRecord {
  const record = readRecord(value, path);
  const amounts = {} as Record<BudgetDimension, number>;
  for (const dimension of BUDGET_DIMENSIONS) {
    const at = `${path}.${dimension}`;
    if (!Object.hasOwn(record, dimension)) fail('missing-budget-dimension', at, 'is required; write 0 when it does not apply');
    const amount = record[dimension];
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) {
      fail('invalid-budget-value', at, 'must be a nonnegative safe integer');
    }
    amounts[dimension] = amount + 0;
  }
  // Never echo unknown keys, which may carry private source details.
  if (Object.keys(record).length !== BUDGET_DIMENSIONS.length) fail('unknown-budget-dimension', path, 'contains a dimension outside schema 1');
  return Object.freeze(amounts);
}

export type BudgetCode = 'budget-exceeded' | 'budget-overflow';

export interface BudgetViolation {
  readonly code: BudgetCode;
  readonly dimension: BudgetDimension;
  /** Where the rejected increment came from, such as a manifest Asset. */
  readonly path: string;
  readonly limit: number;
  /** The total the increment would reach; null when that total is beyond the safe integer range. */
  readonly observed: number | null;
}

export type BudgetResult =
  | { readonly status: 'within-budget'; readonly usage: BudgetRecord }
  /** `usage` is the usage before the rejected charge, which is never partly applied. */
  | { readonly status: 'over-budget'; readonly usage: BudgetRecord; readonly violations: readonly BudgetViolation[] };

function charge(limits: BudgetRecord, usage: BudgetRecord, increment: BudgetRecord, path: string): BudgetResult {
  const total = {} as Record<BudgetDimension, number>;
  const violations: BudgetViolation[] = [];
  for (const dimension of BUDGET_DIMENSIONS) {
    const used = usage[dimension];
    const added = increment[dimension];
    const limit = limits[dimension];
    // Compare against the remaining room so no decision depends on an overflowed sum.
    if (added > Number.MAX_SAFE_INTEGER - used) violations.push(Object.freeze({ code: 'budget-overflow', dimension, path, limit, observed: null }));
    else if (added > limit - used) violations.push(Object.freeze({ code: 'budget-exceeded', dimension, path, limit, observed: used + added }));
    else total[dimension] = used + added;
  }
  if (violations.length > 0) return Object.freeze({ status: 'over-budget', usage, violations: Object.freeze(violations) });
  return Object.freeze({ status: 'within-budget', usage: Object.freeze(total) });
}

/**
 * Adds a complete increment to usage under the limits. Callers charge a declared size before reading or allocating it;
 * a total equal to a limit passes, and any dimension over its limit or the safe integer range rejects the whole charge.
 */
export function chargeBudget(limits: unknown, usage: unknown, increment: unknown, path = 'increment'): BudgetResult {
  return charge(readBudgetRecord(limits, 'limits'), readBudgetRecord(usage, 'usage'), readBudgetRecord(increment, path), path);
}

/**
 * Charges a group manifest's declared Assets, dependency edges and payload bytes Asset by Asset, as each descriptor is
 * read and before any payload is read or allocated. The first Asset that would exceed a limit rejects the whole
 * manifest without reading later descriptors.
 */
export function chargeManifestBudget(limits: unknown, usage: unknown, manifest: unknown, path = 'manifest'): BudgetResult {
  const checkedLimits = readBudgetRecord(limits, 'limits');
  const initial = readBudgetRecord(usage, 'usage');
  // A zero charge rejects usage already over a limit, even for a manifest without Assets.
  let current = charge(checkedLimits, initial, EMPTY_BUDGET_USAGE, path);
  if (current.status === 'over-budget') return current;
  const violations = visitGroupManifest(manifest, path, ({ dependencies, payloadIdentity }, at) => {
    const increment = { ...EMPTY_BUDGET_USAGE, assets: 1, dependencyEdges: dependencies.length, payloadBytes: payloadIdentity.byteLength };
    current = charge(checkedLimits, current.usage, increment, at);
    return current.status === 'over-budget' ? current.violations : undefined;
  });
  return violations ? Object.freeze({ status: 'over-budget', usage: initial, violations }) : current;
}
