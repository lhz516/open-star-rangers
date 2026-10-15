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
   * Events of one tick, a runaway budget above the bounds the rules derive (docs/plan/p3/02/spec.md, CR-14), not an
   * original limit. P3-02 and P3-06 (docs/plan/p3/06/spec.md, 容量核算): commandsPerTick results + commandsPerTick
   * additional speed events + 1 speed assist event + spawnExpansion instantiations + entities world exits = 3,201 at the
   * entity limit, 1,185 with 32 world exits. P3-07's `hit` has quadratic terms, so its bound takes a generous slice at
   * once (32 craft of which 24 in collision group A, 256 mounts, 64 commands with fire chains of 4, 512 live
   * projectiles, 32 missiles, 256 fragments, 64 explosions; 32 destructions, detonations and AI area damages in one
   * tick, 256 fragments expiring or shot down, 32 parked objects engaging 32 candidates each): `hit` 512 + (32 + 32) ×
   * 32 + 2 × 32 + 256 + 2 × 24 × 32 + 32 × 32 + 32 = 5,472, `shot-fired` 512, `explosion-started` 353,
   * `fragment-expired` and `source-released` 256 each, `object-destroyed`, `energy-depleted` and `missile-ended` 32
   * each, `target-changed` 65 and `target-cleared` 1, the per-command `weapon-selected`, `energy-allocation-changed`
   * and `left-page-changed` 64: 7,075. P3-09 (MW-14) adds at most 64 `map-toggled` and `warp-destination-set` together
   * (one per command), 1 `warp-started`, 1 `warp-completed` and 2 `left-page-changed` without a command: with
   * P3-02's and P3-06's 1,185, 8,328 in all. This is about four times that. At the entity limit the quadratic terms have no fixed bound, and exceeding the
   * budget is a fault.
   */
  eventsPerTick: 32_768,
  /**
   * Requests of one tick (pipeline.ts), the same kind of budget (CR-14). P3-02 and P3-06: entities lifecycle requests +
   * spawnExpansion spawn requests + commandsPerTick speed command requests + 2 control requests = 3,138 at the entity
   * limit. At the slice above: `select-target` 65, launches 512, at most 2 per live object's own update (an explosion's
   * release and leave, a part-0 fragment's hand-off and expiry) 2 × 896, `steer` 64, and P3-02's and P3-06's spawn
   * requests 1,024 and speed requests 66: 3,523; P3-09's `map-toggle`, `map-point` and `warp-start` requests (one per
   * command, MW-14) make 3,588. This is about 4.6 times that.
   */
  requestsPerTick: 16_384,
  /** Ticks of one recording or replay: 68 minutes at the default rate, several times a slice mission. */
  recordedTicks: 131_072,
  /** Commands of one recording: 2 per tick on average, e.g. fire held every tick plus one more action. */
  recordedCommands: 262_144,
  /** Events of one recording: 4 per tick on average; at about 120 characters of JSON each, 64 MB at most. */
  recordedEvents: 524_288,
  /** Checkpoints of one recording: tick 0 and one per tick, so an interval of 1 always fits. */
  recordedCheckpoints: 131_073,
  /**
   * Characters of one canonical text. A snapshot at the entity limit is about 10.5 MiB with P3-07's combat state
   * (CR-14): at most spawnExpansion craft at about 8.5 KiB each with 18 mounts, about 2 KiB for every other entity.
   * P3-09's state (MW-14) adds at most `entities` map icons of about 170 characters (0.35 MiB; 200 at the longest
   * numbers, 0.4 MiB), `entities` IDs in the object sets (12 KiB; 34 KiB at 16 digits) and the Warp transit (1 KiB; about
   * 2 KiB at the longest numbers): about 10.9 MiB, 11 MiB at the longest (budget.test.ts).
   */
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
