import { describe, expect, it } from 'vitest';
import {
  BUDGET_DIMENSIONS, BUDGET_UNITS, chargeBudget, chargeManifestBudget, EMPTY_BUDGET_USAGE, readBudgetRecord, type BudgetDimension,
} from './budget.ts';
import { SLICE_ID } from './content-identity.ts';

const MAX = Number.MAX_SAFE_INTEGER;
const amounts = (amount: number, overrides: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ ...Object.fromEntries(BUDGET_DIMENSIONS.map(dimension => [dimension, amount])), ...overrides });

describe('budget dimensions', () => {
  it('fixes the twelve schema 1 dimensions, each with one unit', () => {
    expect(BUDGET_DIMENSIONS).toEqual([
      'assets', 'dependencyEdges', 'sourceReadBytes', 'payloadBytes', 'vertices', 'triangles',
      'imagePixels', 'paletteEntries', 'glyphs', 'audioSamples', 'missionObjects', 'missionReferences',
    ]);
    expect(BUDGET_UNITS).toEqual({
      assets: 'asset', dependencyEdges: 'dependency-edge', sourceReadBytes: 'byte', payloadBytes: 'byte', vertices: 'vertex',
      triangles: 'triangle', imagePixels: 'pixel', paletteEntries: 'palette-entry', glyphs: 'glyph', audioSamples: 'sample-point',
      missionObjects: 'mission-object', missionReferences: 'mission-reference',
    });
    expect(EMPTY_BUDGET_USAGE).toEqual(amounts(0));
    expect([BUDGET_DIMENSIONS, BUDGET_UNITS, EMPTY_BUDGET_USAGE].every(Object.isFrozen)).toBe(true);
  });
});

describe('budget records', () => {
  it('reads a complete record as a frozen, structured-cloneable copy', () => {
    const input = amounts(0, { vertices: MAX, glyphs: -0 });
    const record = readBudgetRecord(input, 'limits');
    input.vertices = 1;
    expect(record).toEqual(amounts(0, { vertices: MAX }));
    expect(Object.is(record.glyphs, 0) && Object.isFrozen(record)).toBe(true);
    expect(structuredClone(record)).toEqual(record);
  });

  it.each(BUDGET_DIMENSIONS)('rejects a record without %s instead of defaulting it', dimension => {
    const input = amounts(0);
    delete input[dimension];
    expect(() => readBudgetRecord(input, 'limits'))
      .toThrowError(expect.objectContaining({ code: 'missing-budget-dimension', path: `limits.${dimension}` }));
  });

  it('rejects a dimension outside schema 1, such as a quantity in another unit, without echoing its name', () => {
    const renamed = amounts(0, { sourceReadKilobytes: 1 });
    delete renamed.sourceReadBytes;
    expect(() => readBudgetRecord(renamed, 'usage'))
      .toThrowError(expect.objectContaining({ code: 'missing-budget-dimension', path: 'usage.sourceReadBytes' }));
    const extra = amounts(0, { privateSourceName: 1 });
    expect(() => readBudgetRecord(extra, 'usage')).toThrowError(expect.objectContaining({ code: 'unknown-budget-dimension', path: 'usage' }));
    expect(() => readBudgetRecord(extra, 'usage')).not.toThrowError(/privateSourceName/);
  });

  it.each([-1, -MAX, 0.5, NaN, Infinity, -Infinity, MAX + 1, '1', null, undefined, true, BigInt(1), {}])(
    'rejects amount %# that is not a nonnegative safe integer',
    value => {
      expect(() => readBudgetRecord(amounts(0, { triangles: value }), 'limits'))
        .toThrowError(expect.objectContaining({ code: 'invalid-budget-value', path: 'limits.triangles' }));
    },
  );

  it('rejects records that are not plain data', () => {
    const accessor = Object.defineProperty(amounts(0), 'vertices', { enumerable: true, get: () => 0 });
    for (const value of [null, [], Object.assign(new (class Limits {})(), amounts(0)), accessor]) {
      expect(() => readBudgetRecord(value, 'limits')).toThrowError(expect.objectContaining({ code: 'invalid-record', path: 'limits' }));
    }
  });
});

describe('budget charges', () => {
  it.each(BUDGET_DIMENSIONS)('accepts %s usage equal to its limit and rejects one more', (dimension: BudgetDimension) => {
    const limits = amounts(0, { [dimension]: 10 });
    expect(chargeBudget(limits, amounts(0, { [dimension]: 4 }), amounts(0, { [dimension]: 6 })))
      .toEqual({ status: 'within-budget', usage: amounts(0, { [dimension]: 10 }) });
    expect(chargeBudget(limits, amounts(0, { [dimension]: 4 }), amounts(0, { [dimension]: 7 }))).toEqual({
      status: 'over-budget',
      usage: amounts(0, { [dimension]: 4 }),
      violations: [{ code: 'budget-exceeded', dimension, path: 'increment', limit: 10, observed: 11 }],
    });
  });

  it('rejects a total beyond MAX_SAFE_INTEGER as overflow instead of judging a rounded sum', () => {
    const limits = amounts(MAX);
    expect(chargeBudget(limits, amounts(0, { audioSamples: MAX - 1 }), amounts(0, { audioSamples: 1 })))
      .toEqual({ status: 'within-budget', usage: amounts(0, { audioSamples: MAX }) });
    for (const [used, added] of [[MAX, 1], [MAX - 1, 2], [MAX, MAX]]) {
      expect(chargeBudget(limits, amounts(0, { audioSamples: used }), amounts(0, { audioSamples: added }))).toEqual({
        status: 'over-budget',
        usage: amounts(0, { audioSamples: used }),
        violations: [{ code: 'budget-overflow', dimension: 'audioSamples', path: 'increment', limit: MAX, observed: null }],
      });
    }
  });

  it('writes 0 for dimensions that do not apply and reports every violated dimension in fixed order', () => {
    const limits = amounts(0, { vertices: 100, triangles: 50 });
    const within = chargeBudget(limits, EMPTY_BUDGET_USAGE, amounts(0, { vertices: 100 }));
    expect(within.status === 'within-budget' && Object.keys(within.usage)).toEqual(BUDGET_DIMENSIONS);
    expect(chargeBudget(limits, EMPTY_BUDGET_USAGE, amounts(0, { glyphs: 1, triangles: 51, vertices: 100 }), 'groups[1].model')).toEqual({
      status: 'over-budget',
      usage: EMPTY_BUDGET_USAGE,
      violations: [
        { code: 'budget-exceeded', dimension: 'triangles', path: 'groups[1].model', limit: 50, observed: 51 },
        { code: 'budget-exceeded', dimension: 'glyphs', path: 'groups[1].model', limit: 0, observed: 1 },
      ],
    });
  });

  it('validates limits, usage and the increment on every call', () => {
    const missing = amounts(0);
    delete missing.vertices;
    expect(() => chargeBudget(missing, EMPTY_BUDGET_USAGE, EMPTY_BUDGET_USAGE))
      .toThrowError(expect.objectContaining({ code: 'missing-budget-dimension', path: 'limits.vertices' }));
    expect(() => chargeBudget(amounts(9), amounts(0, { glyphs: -1 }), EMPTY_BUDGET_USAGE))
      .toThrowError(expect.objectContaining({ code: 'invalid-budget-value', path: 'usage.glyphs' }));
    expect(() => chargeBudget(amounts(9), EMPTY_BUDGET_USAGE, amounts(0, { extra: 1 }), 'groups[2].font'))
      .toThrowError(expect.objectContaining({ code: 'unknown-budget-dimension', path: 'groups[2].font' }));
  });

  it('isolates results from later input changes and keeps calls independent', () => {
    const [limits, usage, increment] = [amounts(10), amounts(1), amounts(2)];
    const within = chargeBudget(limits, usage, increment);
    limits.vertices = 0;
    usage.vertices = 9;
    increment.vertices = 9;
    expect(within).toEqual({ status: 'within-budget', usage: amounts(3) });
    expect(Object.isFrozen(within) && Object.isFrozen(within.usage)).toBe(true);
    expect(() => { (within.usage as Record<string, number>).vertices = 99; }).toThrowError(TypeError);
    expect(chargeBudget(amounts(10), amounts(1), amounts(2))).toEqual(within);
    const over = chargeBudget(amounts(1), amounts(1), amounts(1));
    expect(over.status === 'over-budget' && [over, over.usage, over.violations, ...over.violations].every(Object.isFrozen)).toBe(true);
    expect(structuredClone(over)).toEqual(over);
  });
});

describe('manifest budget charges', () => {
  const manifest = (assets: { id: string; dependencies?: string[]; byteLength: number }[]) => ({
    identity: {
      schemaVersion: 1, sliceId: SLICE_ID, sliceDefinitionVersion: 1, converterVersion: 'synthetic-converter.1',
      manifestIdentity: 'manifest:synthetic-1', origin: { type: 'synthetic', fixtureId: 'p2-01-budget' },
    },
    group: 'models',
    assets: assets.map(({ id, dependencies = [], byteLength }) => ({
      id, kind: id.split('/')[0], role: 'synthetic-role', group: 'models',
      dependencies: dependencies.map(dependency => ({ id: dependency, kind: dependency.split('/')[0] })),
      payloadIdentity: { schemaVersion: 1, byteLength, fingerprint: `sha256:${'0'.repeat(64)}` },
    })),
  });
  const declared = manifest([
    { id: 'image/synthetic-hull', byteLength: 64 },
    { id: 'model/synthetic-enemy', dependencies: ['image/synthetic-hull', 'sound/synthetic-engine'], byteLength: 4096 },
  ]);
  const limits = amounts(0, { assets: 2, dependencyEdges: 2, payloadBytes: 4160 });

  it('charges declared Assets, dependency edges and payload bytes without any payload', () => {
    expect(chargeManifestBudget(limits, EMPTY_BUDGET_USAGE, declared))
      .toEqual({ status: 'within-budget', usage: amounts(0, { assets: 2, dependencyEdges: 2, payloadBytes: 4160 }) });
  });

  it('rejects the whole manifest at the first Asset over a limit and keeps the prior usage', () => {
    const usage = amounts(0, { payloadBytes: 100 });
    expect(chargeManifestBudget({ ...limits, payloadBytes: 4259 }, usage, declared, 'groups[1].manifest')).toEqual({
      status: 'over-budget',
      usage,
      violations: [{ code: 'budget-exceeded', dimension: 'payloadBytes', path: 'groups[1].manifest.assets[1]', limit: 4259, observed: 4260 }],
    });
    expect(chargeManifestBudget({ ...limits, dependencyEdges: 1 }, EMPTY_BUDGET_USAGE, declared)).toMatchObject({
      status: 'over-budget',
      violations: [{ code: 'budget-exceeded', dimension: 'dependencyEdges', path: 'manifest.assets[1]', limit: 1, observed: 2 }],
    });
  });

  it('rejects declared payload bytes whose sum leaves the safe integer range', () => {
    const huge = manifest([{ id: 'image/synthetic-a', byteLength: MAX }, { id: 'image/synthetic-b', byteLength: 1 }]);
    expect(chargeManifestBudget(amounts(MAX), EMPTY_BUDGET_USAGE, huge)).toEqual({
      status: 'over-budget',
      usage: EMPTY_BUDGET_USAGE,
      violations: [{ code: 'budget-overflow', dimension: 'payloadBytes', path: 'manifest.assets[1]', limit: MAX, observed: null }],
    });
  });

  it('reads the manifest with the group manifest contract', () => {
    const unordered = { ...declared, assets: [...declared.assets].reverse() };
    expect(() => chargeManifestBudget(limits, EMPTY_BUDGET_USAGE, unordered))
      .toThrowError(expect.objectContaining({ code: 'asset-order', path: 'manifest.assets[1]' }));
  });

  it('stops at the first Asset over a limit without reading later descriptors, keeping index order', () => {
    const malformedTail = { ...declared, assets: [declared.assets[0], { id: 'Image/Not-Read' }] };
    expect(chargeManifestBudget({ ...limits, payloadBytes: 63 }, EMPTY_BUDGET_USAGE, malformedTail)).toEqual({
      status: 'over-budget',
      usage: EMPTY_BUDGET_USAGE,
      violations: [{ code: 'budget-exceeded', dimension: 'payloadBytes', path: 'manifest.assets[0]', limit: 63, observed: 64 }],
    });
    expect(() => chargeManifestBudget({ ...limits, payloadBytes: 63 }, EMPTY_BUDGET_USAGE, { ...declared, assets: [{ ...declared.assets[0], id: 'Image/Bad' }] }))
      .toThrowError(expect.objectContaining({ code: 'invalid-asset-id', path: 'manifest.assets[0].id' }));
    const repeated = { ...declared, assets: [declared.assets[0], declared.assets[0]] };
    expect(() => chargeManifestBudget({ ...limits, assets: 1 }, EMPTY_BUDGET_USAGE, repeated))
      .toThrowError(expect.objectContaining({ code: 'duplicate-asset', path: 'manifest.assets[1]' }));
  });

  it('rejects usage already over a limit, even for a manifest without Assets', () => {
    const usage = amounts(0, { assets: 3 });
    expect(chargeManifestBudget(limits, usage, manifest([]))).toEqual({
      status: 'over-budget',
      usage,
      violations: [{ code: 'budget-exceeded', dimension: 'assets', path: 'manifest', limit: 2, observed: 3 }],
    });
    expect(chargeManifestBudget(limits, EMPTY_BUDGET_USAGE, manifest([]))).toEqual({ status: 'within-budget', usage: EMPTY_BUDGET_USAGE });
  });
});
