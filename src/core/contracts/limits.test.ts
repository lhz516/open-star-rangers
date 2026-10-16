import { describe, expect, it } from 'vitest';
import { AI_PROGRAMS_LIMITS } from '../../content/rule-data/ai-programs.ts';
import { CORE_LIMITS, fitsLimit, productFitsLimit, type CoreLimitName } from './limits.ts';

const names = Object.keys(CORE_LIMITS) as CoreLimitName[];

describe('CORE_LIMITS (P3-02 AC-02, 快照、哈希与 replay)', () => {
  it('covers every budget the spec names with a frozen positive safe integer', () => {
    expect(names).toEqual([
      'commandsPerTick', 'entities', 'spawnExpansion', 'eventsPerTick', 'requestsPerTick', 'aiDispatchesPerRun', 'aiDispatchesPerTick', 'radioQueueItems',
      'recordedTicks', 'recordedCommands', 'recordedEvents', 'recordedCheckpoints', 'canonicalTextLength',
    ]);
    expect(Object.isFrozen(CORE_LIMITS)).toBe(true);
    for (const name of names) expect(Number.isSafeInteger(CORE_LIMITS[name]) && CORE_LIMITS[name] > 0, name).toBe(true);
  });

  it('keeps the relations its documented basis relies on', () => {
    const {
      commandsPerTick, entities, spawnExpansion, eventsPerTick, requestsPerTick, radioQueueItems, recordedTicks, recordedCommands, recordedEvents, recordedCheckpoints,
    } = CORE_LIMITS;
    // P3-02 and P3-06's derived bounds of one tick at the entity limit (docs/plan/p3/06/spec.md, 容量核算).
    const events = commandsPerTick + commandsPerTick + 1 + spawnExpansion + entities;
    const requests = entities + spawnExpansion + commandsPerTick + 2;
    expect([events, requests]).toEqual([3201, 3138]);
    expect(eventsPerTick).toBeGreaterThanOrEqual(events);
    expect(requestsPerTick).toBeGreaterThanOrEqual(requests);
    // P3-07's bounds at the generous slice of docs/plan/p3/02/spec.md, CR-14, with P3-02's and P3-06's terms there.
    const [craft, groupA, mounts, chain, projectiles, missiles, fragments, explosions, perTick, engaging] = [32, 24, 256, 4, 512, 32, 256, 64, 32, 32];
    const hits = projectiles + (perTick + perTick) * craft + 2 * perTick + fragments + 2 * groupA * craft + engaging * craft + perTick;
    const combatEvents = hits + (mounts + commandsPerTick * chain) + (perTick * 3 + fragments + 1) + 2 * fragments + 3 * perTick + (commandsPerTick + 1 + 1)
      + commandsPerTick;
    const otherEvents = commandsPerTick + commandsPerTick + 1 + spawnExpansion + craft;
    expect([hits, combatEvents, combatEvents + otherEvents]).toEqual([5472, 7075, 8260]);
    const liveObjects = craft + projectiles + missiles + fragments + explosions;
    const combatRequests = (commandsPerTick + 1) + (mounts + commandsPerTick * chain) + 2 * liveObjects + commandsPerTick + spawnExpansion + (commandsPerTick + 2);
    expect([liveObjects, combatRequests]).toEqual([896, 3523]);
    // P3-09's (docs/plan/p3/02/spec.md, MW-14): map-toggled and warp-destination-set together at most one a command,
    // warp-started, warp-completed and their two left-page-changed without a command; a request a command and the
    // deferred warp-start.
    const mapWarpEvents = commandsPerTick + 1 + 1 + 2;
    const mapWarpRequests = commandsPerTick + 1;
    expect([combatEvents + otherEvents + mapWarpEvents, combatRequests + mapWarpRequests]).toEqual([8328, 3588]);
    // About four times each sum, as runaway budgets (CR-14); P3-08 doubled the request budget (CR-25).
    expect([eventsPerTick, requestsPerTick]).toEqual([32_768, 32_768]);
    expect(eventsPerTick).toBeGreaterThan(3.9 * (combatEvents + otherEvents + mapWarpEvents));
    expect(requestsPerTick).toBeGreaterThan(4.5 * (combatRequests + mapWarpRequests));
    // P3-10's additions at the same slice (CB-16): radio-queued, five per-command events, page changes without a command,
    // four events at most once and four at most twice; deliveries, a dock, two launches and base keys.
    const communicationsEvents = 300 + 5 * commandsPerTick + 8 + 4 * 1 + 4 * 2;
    const communicationsRequests = commandsPerTick + 1 + 2 + commandsPerTick;
    expect([communicationsEvents, combatEvents + otherEvents + communicationsEvents]).toEqual([640, 8900]);
    expect(combatRequests + communicationsRequests).toBe(3654);
    // P3-09's and P3-10's additions together.
    const allEvents = combatEvents + otherEvents + mapWarpEvents + communicationsEvents;
    const allRequests = combatRequests + mapWarpRequests + communicationsRequests;
    expect([allEvents, allRequests]).toEqual([8968, 3719]);
    // P3-08's (CR-25), with all 32 craft at the worst table program: 2 executor runs per craft and tick, each of at
    // most 18 dispatches posting 3 requests, plus the hold step's 2, state rule 1's 2 and one departure; one
    // create-transponder per command. Events: one consumed command per wingman, one deployment per command.
    const dispatchesPerRun = 18;
    const aiRequests = craft * 2 * (3 * dispatchesPerRun + 2 + 2 + 1) + commandsPerTick;
    const aiEvents = craft + commandsPerTick;
    expect([aiRequests, allRequests + aiRequests, aiEvents, allEvents + aiEvents]).toEqual([3840, 7559, 96, 9064]);
    expect(eventsPerTick).toBeGreaterThan(3.6 * (allEvents + aiEvents));
    expect(requestsPerTick).toBeGreaterThan(4.3 * (allRequests + aiRequests));
    // The executor budgets: 8 dispatches of every item of the longest script (AI_PROGRAMS_LIMITS.scriptItems) in one
    // run, and two runs of the group-0 closure's longest at the entity limit within one tick.
    expect(CORE_LIMITS.aiDispatchesPerRun).toBe(8 * AI_PROGRAMS_LIMITS.scriptItems);
    expect(CORE_LIMITS.aiDispatchesPerRun).toBeGreaterThan(50 * dispatchesPerRun);
    expect(CORE_LIMITS.aiDispatchesPerTick).toBeGreaterThanOrEqual(entities * 2 * dispatchesPerRun);
    // The radio queue's runaway threshold: at about 0.9 items a second of legal input it takes over an hour, longer
    // than a recording at the default 32 ticks a second.
    expect(radioQueueItems).toBe(4096);
    expect(radioQueueItems / 0.9).toBeGreaterThan(3600);
    expect(radioQueueItems / 0.9).toBeGreaterThan(recordedTicks / 32);
    expect(spawnExpansion).toBeLessThanOrEqual(entities);
    expect(recordedCheckpoints).toBe(recordedTicks + 1);
    expect(recordedCommands).toBeGreaterThanOrEqual(recordedTicks);
    expect(recordedEvents).toBeGreaterThanOrEqual(recordedCommands);
    // The canonical text holds the strict worst snapshot (CR-25), about 25.7 MiB, which budget.test.ts measures.
    expect(CORE_LIMITS.canonicalTextLength).toBe(2 ** 25);
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
