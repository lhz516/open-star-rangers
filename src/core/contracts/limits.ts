/**
 * Fixed capacity budgets of formal Core (docs/plan/p3/02/spec.md, 运行配置与世界创建 and 快照、哈希与 replay). They
 * protect memory and time; they are not original-game limits, and callers cannot raise them. Every capacity is checked
 * before Core allocates or executes, with the helpers below so that the check itself cannot overflow.
 *
 * Scale of the selected mission (group 0 / slot 1): it declares 9 records and 3 groups and schedules a few tens of
 * instances (player 1, 16 enemy craft, 4 of kind 0x20000, at most one wingman, …), see
 * docs/original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure. The default rate is 32 ticks
 * per second (2 clock units per tick).
 */
export const CORE_LIMITS = Object.freeze({
  /** Above the 42 distinct commands of the TickInput union (map-point counted once per operation), so all can be requested in one tick. */
  commandsPerTick: 64,
  /** Live entities, including runtime-created projectiles, explosions and debris: over 50 times the selected mission's instances; at 1 KiB of state each, 2 MiB. */
  entities: 2048,
  /** Instances one world may schedule from its declarations (requests × members, summed): over 25 times the selected mission, and half of `entities`. */
  spawnExpansion: 1024,
  /**
   * Events of one tick, and separately the requests of one tick (pipeline.ts), above the bounds the rules derive
   * (docs/plan/p3/06/spec.md, 容量核算). Events: commandsPerTick results + commandsPerTick additional speed events (at most
   * one per command) + 1 speed assist event + spawnExpansion instantiations + entities world exits (P3-06's
   * `object-left-world` takes the one rule event per entity P3-02 reserved) = 3,201. Requests: entities lifecycle
   * requests + spawnExpansion spawn requests + commandsPerTick speed command requests + 2 (the assist's and the axes'
   * control requests) = 3,138. A rule task that adds terms derives the sum again (P3-07).
   */
  eventsPerTick: 4096,
  /** Ticks of one recording or replay: 68 minutes at the default rate, several times a slice mission. */
  recordedTicks: 131_072,
  /** Commands of one recording: 2 per tick on average, e.g. fire held every tick plus one more action. */
  recordedCommands: 262_144,
  /** Events of one recording: 4 per tick on average; at about 120 characters of JSON each, 64 MB at most. */
  recordedEvents: 524_288,
  /** Checkpoints of one recording: tick 0 and one per tick, so an interval of 1 always fits. */
  recordedCheckpoints: 131_073,
  /** Characters of one canonical text: a snapshot at the entity limit with 4 KiB per entity is 8 MiB, half of this. */
  canonicalTextLength: 16_777_216,
});

export type CoreLimitName = keyof typeof CORE_LIMITS;

const isCount = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

/** Whether `used + added` stays within the named limit; false for anything but non-negative safe integers. Never forms the sum. */
export function fitsLimit(name: CoreLimitName, used: number, added: number): boolean {
  return isCount(used) && isCount(added) && added <= CORE_LIMITS[name] - used;
}

/** Whether `count × each` stays within the named limit; false for anything but non-negative safe integers. Never forms the product. */
export function productFitsLimit(name: CoreLimitName, count: number, each: number): boolean {
  return isCount(count) && isCount(each) && (count === 0 || each <= Math.floor(CORE_LIMITS[name] / count));
}
