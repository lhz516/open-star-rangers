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
  /** Above the 52 distinct commands of the TickInput union (map-point counted once per operation; P3-05 speed presets and P3-08 drop-transponder included), so all can be requested in one tick. */
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
   * P3-02's and P3-06's 1,185, 8,328. P3-10 adds at the same slice (docs/plan/p3/02/spec.md, CB-16) `radio-queued` 300,
   * the per-command `command-delivered`, `docking-requested`, `base-navigated`, `base-confirmed` and menu
   * `left-page-changed` 64 each, 8 page changes without a command, one each of `radio-taken`, `incoming-started`,
   * `incoming-ended` and `docked`, and two each of `departed`, `transition`, `docking-cancelled` and `radio-flushed`:
   * 640, 8,968 in all. P3-08 (CR-25) adds at most one `wingman-command-consumed` per wingman (32) and one
   * `transponder-deployed` per command (64): 9,064. P3-11 (ME-16) adds about 15 flow events (10 of its types at most
   * once, `player-loss-started` twice, the wingman loss message's `radio-queued` and two flush page changes), a rescue's
   * `weapon-selected` around both lists (2 × 256 mounts) and the teardown's two page changes: 529, 9,593. P3-14 (FA-07)
   * adds at most two `object-retired` per entity and tick (an area switch, then a pending removal): 2 × entities =
   * 4,096, 13,689 in all, which this is about 2.4 times. At the entity limit the quadratic terms have no fixed bound, and
   * exceeding the budget is a fault. P3-11 adds no request type: the teardown's `leave` is one of each live object's own
   * two.
   */
  eventsPerTick: 32_768,
  /**
   * Requests of one tick (pipeline.ts), the same kind of budget (CR-14). P3-02 and P3-06: entities lifecycle requests +
   * spawnExpansion spawn requests + commandsPerTick speed command requests + 2 control requests = 3,138 at the entity
   * limit. At the slice above: `select-target` 65, launches 512, at most 2 per live object's own update (an explosion's
   * release and leave, a part-0 fragment's hand-off and expiry) 2 × 896, `steer` 64, and P3-02's and P3-06's spawn
   * requests 1,024 and speed requests 66: 3,523; P3-09's `map-toggle`, `map-point` and `warp-start` requests (one per
   * command, MW-14) make 3,588, and P3-10's 64 `deliver-command`, one `dock`, two `depart` and 64 base key requests
   * (CB-16) 3,719. P3-08's AI (CR-25), with all 32 craft at the worst table program: at most 2 executor runs per craft
   * and tick (the installation's script and the first update), each dispatched item posting at most 3 requests (opcode
   * 1101's attack pass) over at most 18 dispatches, 2 for the entry's hold step, 2 for state rule 1's evasion and 1
   * departure, 2 × (3 × 18 + 2 + 2 + 1) = 118 each, plus one `create-transponder` per command: 32 × 118 + 64 = 3,840,
   * 7,559 in all. This is about 4.3 times that.
   */
  requestsPerTick: 32_768,
  /**
   * Item dispatches of one executor run (`0x5f4f4` from its entry to a yield or the end; CR-25), a runaway budget: the
   * original has none. Without 9001/9002 in the supported closure the stack stays empty and an acyclic script dispatches
   * at most its item count, at most 128 (AI_PROGRAMS_LIMITS.scriptItems); this lets every item run 8 times in one run,
   * for loops that leave through a test. The group-0 closure's most is 18 (ai §12), about 57 times below it.
   */
  aiDispatchesPerRun: 1024,
  /**
   * Item dispatches of all runs in one tick (CR-25): at most 2 runs per object and tick (ai §12), so the slice's content
   * dispatches at most entities × 2 × 18 = 73,728 at the entity limit, within it; it stops 2,048 pathological scripts
   * from stalling one tick.
   */
  aiDispatchesPerTick: 131_072,
  /**
   * Items of the radio queue (docs/plan/p3/02/spec.md, CB-16), unbounded in the original: a runaway threshold, and
   * exceeding it is a fault rather than a dropped message. Unthrottled rule queuing comes from destructions (about 4
   * each), bounded by spawnExpansion; throttled reports add one per period. Only replies repeat without limit, at least
   * 3 menu keys each and at most one per object and tick; with one key per poll at 4 keys per second the queue grows
   * about 0.9 items per second, so legal input takes over an hour to reach it, beyond recordedTicks.
   */
  radioQueueItems: 4096,
  /** Ticks of one recording or replay: 68 minutes at the default rate, several times a slice mission. */
  recordedTicks: 131_072,
  /** Commands of one recording: 2 per tick on average, e.g. fire held every tick plus one more action. */
  recordedCommands: 262_144,
  /**
   * Events of one recording: 4 per tick on average; at about 120 characters of JSON each, 64 MB at most. P3-14's forward
   * rows and speeds (FA-05) make a `shot-fired` or `hit` about 80 characters longer, and they are a minority of events.
   */
  recordedEvents: 524_288,
  /** Checkpoints of one recording: tick 0 and one per tick, so an interval of 1 always fits. */
  recordedCheckpoints: 131_073,
  /**
   * Characters of one canonical text: 2^25 (32 MiB), above the strict worst snapshot (CR-25, budget.test.ts measures it).
   * With every number at its longest (f32 and doubles 25 characters, IDs and clocks 16 digits), at the entity limit:
   * every entity's flight state 3.3 KiB (6.6 MiB), P3-09's icons, object sets and Warp transit (MW-14) 0.43 MiB, P3-10's
   * full radio queue (CB-16) 1.2 MiB, P3-08's longest controller on the spawnExpansion craft instantiation can make and
   * the player (2.9 KiB each, 2.8 MiB) and a parse cache at the content limits (1.9 MiB), and P3-07's combat state (CR-14)
   * on those 1,025 craft with CRAFT_INFO_LIMITS.mounts (32) mounts of 396 characters each (12.4 MiB): about 25.7 MiB.
   * CR-14's 10.5 MiB took typical numbers and 18 mounts, and was never a strict bound; 16 MiB did not hold the strict
   * case even before P3-08. Exceeding it remains a fault.
   */
  canonicalTextLength: 33_554_432,
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
