import { describe, expect, it } from 'vitest';
import { DiscReadError, type DiscLimit } from './disc-error.ts';

describe('disc read errors', () => {
  it('exposes a frozen, structured-cloneable DTO with a frozen copy of the limit', () => {
    const limit: { -readonly [Key in keyof DiscLimit]: DiscLimit[Key] } = { name: 'sourceReadBytes', limit: 10, observed: 11 };
    const error = new DiscReadError('budget-exceeded', 'image', 'the source read budget is exhausted', limit);
    limit.observed = 0;
    const data = error.toData();
    expect(data).toEqual({ code: 'budget-exceeded', location: 'image', reason: 'the source read budget is exhausted', limit: { name: 'sourceReadBytes', limit: 10, observed: 11 } });
    expect(Object.isFrozen(data) && Object.isFrozen(data.limit)).toBe(true);
    expect(structuredClone(data)).toEqual(data);
    expect(error).toBeInstanceOf(Error);
    expect([error.name, error.message]).toEqual(['DiscReadError', 'image: the source read budget is exhausted']);
  });

  it('uses a null limit when none applies', () => {
    expect(new DiscReadError('read-failed', 'descriptor', 'the source failed to read').toData().limit).toBeNull();
  });
});
