import { describe, expect, it } from 'vitest';
import { CORE_LIMITS, fitsLimit, productFitsLimit, type CoreLimitName } from './limits.ts';

const names = Object.keys(CORE_LIMITS) as CoreLimitName[];

describe('CORE_LIMITS (P3-02 AC-02, 快照、哈希与 replay)', () => {
  it('covers every budget the spec names with a frozen positive safe integer', () => {
    expect(names).toEqual([
      'commandsPerTick', 'entities', 'spawnExpansion', 'eventsPerTick',
      'recordedTicks', 'recordedCommands', 'recordedEvents', 'recordedCheckpoints', 'canonicalTextLength',
    ]);
    expect(Object.isFrozen(CORE_LIMITS)).toBe(true);
    for (const name of names) expect(Number.isSafeInteger(CORE_LIMITS[name]) && CORE_LIMITS[name] > 0, name).toBe(true);
  });

  it('keeps the relations its documented basis relies on', () => {
    const { commandsPerTick, entities, spawnExpansion, eventsPerTick, recordedTicks, recordedCommands, recordedEvents, recordedCheckpoints } = CORE_LIMITS;
    // P3-02 and P3-06's derived bounds of one tick (docs/plan/p3/06/spec.md, 容量核算).
    const events = commandsPerTick + commandsPerTick + 1 + spawnExpansion + entities;
    const requests = entities + spawnExpansion + commandsPerTick + 2;
    expect([events, requests]).toEqual([3201, 3138]);
    expect(eventsPerTick).toBeGreaterThanOrEqual(Math.max(events, requests));
    expect(spawnExpansion).toBeLessThanOrEqual(entities);
    expect(recordedCheckpoints).toBe(recordedTicks + 1);
    expect(recordedCommands).toBeGreaterThanOrEqual(recordedTicks);
    expect(recordedEvents).toBeGreaterThanOrEqual(recordedCommands);
  });

  it('keeps every sum and product of two limits a safe integer', () => {
    const largest = Math.max(...names.map((name) => CORE_LIMITS[name]));
    expect(largest).toBe(CORE_LIMITS.canonicalTextLength);
    expect(Number.isSafeInteger(largest + largest)).toBe(true);
    expect(Number.isSafeInteger(largest * largest)).toBe(true);
  });

  it.each(names)('fits exactly %s items and rejects one more', (name) => {
    const limit = CORE_LIMITS[name];
    expect(fitsLimit(name, 0, limit)).toBe(true);
    expect(fitsLimit(name, 0, limit + 1)).toBe(false);
    expect(fitsLimit(name, limit - 1, 1)).toBe(true);
    expect(fitsLimit(name, limit, 1)).toBe(false);
    expect(fitsLimit(name, limit, 0)).toBe(true);
    expect(fitsLimit(name, limit + 1, 0)).toBe(false);
    expect(productFitsLimit(name, 1, limit)).toBe(true);
    expect(productFitsLimit(name, 1, limit + 1)).toBe(false);
    expect(productFitsLimit(name, limit, 1)).toBe(true);
    expect(productFitsLimit(name, limit + 1, 1)).toBe(false);
  });

  it('decides products at the limit exactly, including factors whose product would lose precision', () => {
    // 2048 = 32 × 64 = 2^11; one more member exceeds it.
    expect(productFitsLimit('entities', 32, 64)).toBe(true);
    expect(productFitsLimit('entities', 32, 65)).toBe(false);
    expect(productFitsLimit('entities', 31, 66)).toBe(true);
    expect(productFitsLimit('entities', 0, Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(productFitsLimit('entities', Number.MAX_SAFE_INTEGER, 0)).toBe(true);
    expect(productFitsLimit('entities', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(productFitsLimit('entities', 2 ** 27, 2 ** 27)).toBe(false);
    expect(fitsLimit('entities', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it.each([-1, 0.5, Number.NaN, Infinity, 2 ** 53])('treats %s as not fitting', (bad) => {
    expect(fitsLimit('entities', bad, 0)).toBe(false);
    expect(fitsLimit('entities', 0, bad)).toBe(false);
    expect(productFitsLimit('entities', bad, 1)).toBe(false);
    expect(productFitsLimit('entities', 1, bad)).toBe(false);
  });
});
