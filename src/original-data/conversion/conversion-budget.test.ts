import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { chargeConversionBudget } from './conversion-budget.ts';
import { SourceError } from '../source-error.ts';

const LIMITS = { ...EMPTY_BUDGET_USAGE, assets: 2, audioSamples: 10, payloadBytes: Number.MAX_SAFE_INTEGER };

const failureOf = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    if (error instanceof SourceError) return error.toData();
    throw error;
  }
  throw new Error('expected a SourceError');
};

describe('conversion budget', () => {
  it('passes a total equal to a limit and adds every dimension once', () => {
    const usage = chargeConversionBudget(LIMITS, { ...EMPTY_BUDGET_USAGE, assets: 1, audioSamples: 4 }, { assets: 1, audioSamples: 6, payloadBytes: 7 }, 'sounds[1]');
    expect(usage).toEqual({ ...EMPTY_BUDGET_USAGE, assets: 2, audioSamples: 10, payloadBytes: 7 });
  });

  it('fails one over a limit with its name, limit and observed total, applying nothing', () => {
    const usage = { ...EMPTY_BUDGET_USAGE, audioSamples: 4 };
    expect(failureOf(() => chargeConversionBudget(LIMITS, usage, { assets: 1, audioSamples: 7 }, 'sounds[2]')))
      .toEqual({ code: 'budget-exceeded', location: 'sounds[2]', reason: expect.any(String), limit: { name: 'audioSamples', limit: 10, observed: 11 } });
    expect(usage.audioSamples).toBe(4);
  });

  it('reports a null observed total beyond the safe integer range', () => {
    expect(failureOf(() => chargeConversionBudget(LIMITS, { ...EMPTY_BUDGET_USAGE, payloadBytes: Number.MAX_SAFE_INTEGER - 1 }, { payloadBytes: 2 }, 'sounds[0]')).limit)
      .toEqual({ name: 'payloadBytes', limit: Number.MAX_SAFE_INTEGER, observed: null });
  });

  it('fails a dimension whose limit is 0', () => {
    expect(failureOf(() => chargeConversionBudget(LIMITS, EMPTY_BUDGET_USAGE, { dependencyEdges: 1 }, 'sounds[0]')).limit)
      .toEqual({ name: 'dependencyEdges', limit: 0, observed: 1 });
  });
});
