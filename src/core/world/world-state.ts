/**
 * The authoritative state of one formal Core world (docs/plan/p3/02/spec.md, 运行配置与世界创建). Only the world's
 * pipeline changes it; projection and Render State read it and copy what they return. World creation
 * (create-world.ts) validates the input and builds it.
 */
import type { AssetId } from '../../content/asset-id.ts';
import type { ContentIdentity } from '../../content/content-identity.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { RngState } from '../determinism/rng.ts';
import type { MissionSetup } from '../mission/load-mission.ts';
import type { WorldCraftInfo } from './craft-info-input.ts';
import { EntityTable, type EntityId, type NameReference } from './entity-table.ts';
import type { MapPoint } from './map-rule-data.ts';
import { createPlayerState, type PlayerState } from './player-state.ts';
import type { WorldRuleData } from './rule-data.ts';
import type { SpawnState } from './spawn-state.ts';

/** The run's configuration, fixed for the world's lifetime and validated by world creation. */
export interface WorldConfig {
  /** The identity of the package the logic Assets came from. */
  readonly content: ContentIdentity;
  readonly mission: AssetId;
  /** fnv1a64 of the canonical text of the validated setup, the craft info and the rule-data inputs (setup-hash.ts). */
  readonly setupHash: string;
  readonly group: number;
  /** The campaign slot, the mission number the defaults use. */
  readonly slot: number;
  readonly rawDifficulty: number;
  /** Null, or an index of `MissionSetup.wingmanOptions` (original selector = index + 1). */
  readonly wingman: number | null;
  /** uint32. */
  readonly seed: number;
  readonly clockUnitsPerTick: number;
}

/**
 * The original mission status byte `0x1b46fc` (docs/plan/p3/02/spec.md, ME-04): 1 (`built`) once the mission is built, 4
 * (`ended`) once the all-clear or the failure branch closed it; never back to `built`. The original's 0 (building) is
 * not visible in Core.
 */
export type MissionStatus = 'built' | 'ended';

/**
 * The craft object sets (`0x174b74`, `0x174b78`; docs/plan/p3/02/spec.md, MW-02, MW-06): the `object-sets` stage
 * rebuilds them every tick and the reveal drops stale IDs, keeping the order. The wingman's AI reads the last rebuild
 * in the next tick, so they persist across ticks. Empty at creation.
 */
export interface ObjectSets {
  readonly friendly: readonly EntityId[];
  readonly hostile: readonly EntityId[];
}

/** The part of a 100-byte map icon entry (`0x1a34e0`) the rules read (MW-02). */
export interface MapIcon {
  readonly entityId: EntityId;
  /** Entry +0x24; the selection excludes only bit 0, the player. */
  readonly kindBit: number;
  /** Entry +0x00–+0x08, f32: the position when the list was built; a selection's z reads it. */
  readonly position: Vec3;
  /** Entry +0x0C/+0x0E: `0x4c524`'s main map pixel (the i32's low 16 bits as signed i16), then moved by `0x4b3a8`. */
  readonly pixel: MapPoint;
  /** Entry +0x28: `0x4c524`'s result, bounds included. */
  readonly inWorld: boolean;
}

/**
 * The main-flow state `0x1863ac` (ME-03): 3 the mission runs; 4 the settlement wait; 5 the result delay; 0 latched, the
 * teardown due; 1 tearing down. Core never enters 2, which builds the next mission.
 */
export type MainState = 0 | 1 | 3 | 4 | 5;

/**
 * The mission sub-state `0x186881` (docs/plan/p3/02/spec.md, CB-02, ME-03): 0 normal; 1 the beacon wait; 2 the
 * destruction sequence (or the loss handling after the beacon's expiry); 3 a docking request awaits its reply; 4 the
 * countdown after the reply; 5 docking delivered or the base interior. Sub-state 6 is not added (ME-01).
 */
export type MissionSubState = 0 | 1 | 2 | 3 | 4 | 5;

/** The player's loss (ME-01): the original's `0x32e14(p)` with p = 1 (`destroyed`) or 0 (`energy`). */
export type PlayerLoss = 'destroyed' | 'energy';

/** A range of a section-2 event trigger of the run's mission Asset (ME-05): `eventTriggers[trigger].ranges[range]`. */
export interface SummaryReference {
  readonly mission: AssetId;
  readonly trigger: number;
  readonly range: number;
}

/** The pre-settlement of the state 3→4 step (`0x69c54` with EDX = 0, ME-05), written once. */
export interface Settlement {
  /** The result word: 1 (`success`) when the all-clear check finds nothing left, otherwise 0. */
  readonly outcome: 'success' | 'failure';
  /** The matched range on a success; always null on a failure. */
  readonly summary: SummaryReference | null;
  /** i8: the matched range's selector; −1 (state 2's 0xFF) without a match or on a failure. */
  readonly summarySelector: number;
}

/** Why the result was latched (ME-05). */
export type ResultReason =
  /** State 5 expired with a successful settlement. */
  | { readonly type: 'all-clear' }
  /** A loss with the rescue count at 2. */
  | { readonly type: 'third-loss'; readonly loss: PlayerLoss }
  /** State 5 expired with a failed settlement (ME-17 decision 1). */
  | { readonly type: 'settlement-failed' };

/** An ending placeholder, in display order (ME-05). */
export type EndingGap =
  /** The failure cutscene's first clip: a third loss's kind; `destroyed` for a failed settlement (the original's p = 1). */
  | { readonly gap: 'G-02/7'; readonly variant: PlayerLoss }
  /** The successful return. */
  | { readonly gap: 'G-02/8'; readonly variant: 'solo' | 'wingman' }
  /** The mission's own cutscene: CINC row = the settlement's summarySelector (13–19). */
  | { readonly gap: 'G-02/9'; readonly row: number };

/** The latched result summary (ME-05), written once at the latch and frozen. */
export interface MissionResult {
  readonly outcome: 'success' | 'failure';
  readonly reason: ResultReason;
  /** The settlement's summary on a success; null on a failure. */
  readonly summary: SummaryReference | null;
  /** The rescue count before the latch. */
  readonly rescuesUsed: 0 | 1 | 2;
  /** One or two items. */
  readonly endingGaps: readonly EndingGap[];
  /** The sum of the player's eight kill counters (ps +0x68), a non-negative i32. */
  readonly playerKills: number;
  readonly latchTick: number;
}

/** The mission flow (CB-02, ME-03); P3-11 extends both states rather than adding a competing flow state. */
export interface MissionFlow {
  /** `0x1863ac`; 3 at creation. */
  mainState: MainState;
  /** `0x186881`; 0 at creation. */
  subState: MissionSubState;
  /** `0x186824`, a clock: sub-state 3's deadline and 4's due clock; 0 at creation, read only in sub-states 3 and 4. */
  dockingDeadline: number;
  /** `0x186854`, a clock: the beacon's expiry; 0 at creation, read only in sub-state 1. */
  beaconDeadline: number;
  /** `0x18681c`, a clock shared by main states 4 and 5; 0 at creation, read only there. */
  settlementDeadline: number;
  /** `0x186830`: rescues so far; the latch zeroes it after capturing it. */
  rescues: 0 | 1 | 2;
  /** `0x18682c` and `0x186818`: the wingman loss message's timer; read only in main state 3, sub-state 0, status `built`. */
  readonly wingmanLoss: { pending: boolean; dueClock: number };
  /** `0x18685c`'s result word, summary and selector byte; written once by the 3→4 step. */
  settlement: Settlement | null;
  /** A project field: the latched result summary, written once by the latch. */
  result: MissionResult | null;
  /** A project field: the tick the teardown completed, written once. */
  completedTick: number | null;
}

/** One section-2 trigger's run counters (+0x08, +0x0C, +0x10; ME-04): non-negative i32, 0 at creation. */
export interface MissionEventCounts {
  instantiated: number;
  destroyed: number;
  left: number;
}

/** The section-2 run state (ME-04): as long as `setup.eventTriggers` and in its order; neither rescue nor teardown clears it. */
export interface MissionEvents {
  readonly triggers: readonly MissionEventCounts[];
}

/**
 * A radio message (CB-05): a portrait sub-table's entry, or an entry of the direct list. Queued messages were all
 * found, so the portrait and the index lie inside the content's tables.
 */
export type MessageIdentity =
  | { readonly table: 20011 | 20019 | 20985; readonly face: number; readonly index: number }
  | { readonly table: 20983; readonly face: null; readonly index: number };

/** The speaker when the message was queued, a project field no rule reads: the message stays displayable after it goes. */
export interface SpeakerSnapshot {
  readonly entityId: EntityId;
  readonly kindBit: number;
  readonly name: NameReference;
}

/**
 * The original's one callback slot: none, `0x333d4`, `0x2c6cc` and `0x2c6dc`. Only `docking-reply` is a rule; the two
 * music callbacks are presentation marks for P3-14 (D-03 item 2, G-01).
 */
export type RadioCallback = 'none' | 'docking-reply' | 'music-step' | 'music-reset';

export interface RadioItem {
  readonly message: MessageIdentity;
  /** A clock: the sample when it was queued, as every queuing delay is 0 (RQ3). */
  readonly due: number;
  readonly callback: RadioCallback;
  readonly speaker: SpeakerSnapshot | null;
}

/** The incoming-message channel (D-03 item 2). */
export type IncomingChannel =
  | { readonly phase: 'idle' }
  | { readonly phase: 'loading'; readonly item: RadioItem; readonly readyTick: number }
  | { readonly phase: 'playing'; readonly item: RadioItem; readonly startClock: number; readonly frameDurations: readonly number[] };

/** The world's communications state (CB-05). */
export interface WorldCommunications {
  /** `0x174b3c`, in order; at most CORE_LIMITS.radioQueueItems items. */
  readonly queue: RadioItem[];
  channel: IncomingChannel;
  /** `0x186bd4` (3 craft portraits) and `0x186be0` (5 base portraits): true once taken; never freed within a world. */
  readonly facePools: { readonly craft: boolean[]; readonly base: boolean[] };
  /** Clocks, 0 at creation; a report is due once the sample is greater (RX8). */
  readonly limits: {
    /** `0x174e10`. */
    wingmanLowHull: number;
    /** `0x174e0c`. */
    enemyAppears: number;
    /** `0x174e08`. */
    tailWarning: number;
    /** `0x174b84`. */
    wingmanArrivalRepair: number;
  };
  /** `0x175f34`, `0x175f10`, `0x175f14`: the tail warning's due clock and its two indicators (CB-09). */
  readonly tailCheck: { dueClock: number; attackerOnTail: boolean; missileIncoming: boolean };
}

/**
 * The world's AI state (docs/plan/p3/02/spec.md, CR-19): the friendly-fire total `0x174dfc` (i32) and its window end
 * `0x174e00` (a clock), the same field as P3-10's CB-05, which P3-10's `0x3c208` writes and P3-08 reads; and the script
 * parse cache. The object sets are WorldState.objectSets (MW-06).
 */
export interface WorldAi {
  readonly friendlyFire: { accumulated: number; windowEnd: number };
  /**
   * The parsed arguments of every script with a live execution state (ai §5.2), in ascending script order. A load that
   * takes a script's count from 0 to 1 parses it and draws then; one that finds it shares it without drawing; the
   * release to 0 drops it, so the next load parses and draws again. A count per script stands for the original's count
   * per item. Empty in a new world.
   */
  readonly parseCache: ParsedScript[];
}

/** A cached script (CR-19). */
export interface ParsedScript {
  /** The script's entry index in the AI programs. */
  readonly script: number;
  /** Positive: the live execution states of the script. */
  uses: number;
  /** One per item up to the script's first 10000, in item order. */
  readonly items: readonly ParsedArgument[];
}

/** An item's parsed argument, its +0x08/+0x0C slots, by its opcode's class (ai §5). */
export type ParsedArgument =
  /** Opcodes without an argument (106, 107, 9500). */
  | { readonly type: 'none' }
  /** i32: integer, boolean and keyword classes; an integer class without text is 0. */
  | { readonly type: 'integer'; readonly value: number }
  /** f32: the float, degree (times two constants) and cosine classes. */
  | { readonly type: 'float'; readonly value: number }
  /** Opcode 100's four optional values. */
  | { readonly type: 'optional-floats'; readonly values: readonly [OptionalFloat, OptionalFloat, OptionalFloat, OptionalFloat] }
  /** Opcode 111's three f32. */
  | { readonly type: 'floats'; readonly values: readonly number[] };

/** A token starting with x or X is absent; an empty token is a present 0.0. */
export interface OptionalFloat {
  readonly present: boolean;
  readonly value: number;
}

/**
 * The base service (CB-11), rebuilt by `0x39664` at docking and null after the launch. Its periods 0x200, 0x40 and 4
 * are constants.
 */
export interface BaseService {
  /** `0x186a70`: a permutation of the records 0–10, both the service queue and the display order (BS5). */
  readonly rows: number[];
  /** `0x186b20`: a row, 0–10. */
  cursor: number;
  /** `0x174e34`, `0x174e38`, `0x174e3c`: clocks. */
  readonly dues: { repair: number; hull: number; energy: number };
  /** `0x174e40`, `0x174e44`: trunc(c9C ÷ 60) and trunc(c54 ÷ 240) at docking. */
  readonly rates: { readonly hull: number; readonly energy: number };
  /** `0x174e48`, `0x174e4c`, `0x174e50`. */
  readonly flags: { repairsComplete: boolean; energyAndMissilesFull: boolean; hullFull: boolean };
}

export interface WorldState {
  readonly config: WorldConfig;
  /** The validated mission setup: read-only input, never part of a snapshot. */
  readonly setup: MissionSetup;
  /** The craft info as read, the rules' frozen content: read-only input, never part of a snapshot; setupHash binds it. */
  readonly craftInfo: WorldCraftInfo;
  /**
   * The static rule data (docs/plan/p3/02/spec.md, CR-01): the rule-data inputs as read and what the load transforms
   * derive from them and the craft info. Read-only, never part of a snapshot; setupHash binds its inputs.
   */
  readonly ruleData: WorldRuleData;
  /** The number of the last completed step; 0 at creation. */
  tick: number;
  /** Mission clock units (1/64 s) since creation. */
  clock: number;
  /** The world's own Mulberry32 generator; every rule draw comes from it. */
  rngState: RngState;
  missionStatus: MissionStatus;
  /** ME-04. */
  readonly missionEvents: MissionEvents;
  readonly entities: EntityTable;
  readonly player: PlayerState;
  readonly spawn: SpawnState;
  /** MW-02, MW-06. */
  objectSets: ObjectSets;
  /** The map icon list (MW-02, MW-07): built by a view mode 8 frame end, emptied by any other; empty at creation. */
  mapIcons: readonly MapIcon[];
  /** P3-10's world state (docs/plan/p3/02/spec.md, CB-02, CB-05, CB-11), from here on; P3-11 extends the flow (ME-03). */
  readonly flow: MissionFlow;
  readonly communications: WorldCommunications;
  readonly ai: WorldAi;
  baseService: BaseService | null;
}

/** The mission flow of a new world (ME-03). */
function createMissionFlow(): MissionFlow {
  return {
    mainState: 3,
    subState: 0,
    dockingDeadline: 0,
    beaconDeadline: 0,
    settlementDeadline: 0,
    rescues: 0,
    wingmanLoss: { pending: false, dueClock: 0 },
    settlement: null,
    result: null,
    completedTick: null,
  };
}

/** The communications state of a new world: nothing queued, the channel idle, no portrait taken, every limit at 0. */
export function createWorldCommunications(): WorldCommunications {
  return {
    queue: [],
    channel: { phase: 'idle' },
    facePools: { craft: [false, false, false], base: [false, false, false, false, false] },
    limits: { wingmanLowHull: 0, enemyAppears: 0, tailWarning: 0, wingmanArrivalRepair: 0 },
    tailCheck: { dueClock: 0, attackerOnTail: false, missileIncoming: false },
  };
}

/**
 * The state of a world just created: tick 0, clock 0, no entities, view mode 0xC, with the spawn state and the RNG
 * state the build's defaults left (spawn-schedule.ts), the map cursor at its start pixel, empty object sets and no map
 * icons; the mission running in main state 3 and sub-state 0 with every flow deadline, the rescue count and the
 * section-2 counters at 0, no wingman loss timer, settlement, result or completion (ME-03, ME-04), P3-10's state at its
 * creation values (CB-02, CB-05, CB-11) and an empty parse cache (CR-19).
 */
export function createWorldState(
  config: WorldConfig,
  setup: MissionSetup,
  craftInfo: WorldCraftInfo,
  ruleData: WorldRuleData,
  spawn: SpawnState,
  rngState: RngState,
): WorldState {
  const { content, mission, setupHash, group, slot, rawDifficulty, wingman, seed, clockUnitsPerTick } = config;
  return {
    config: Object.freeze({ content, mission, setupHash, group, slot, rawDifficulty, wingman, seed, clockUnitsPerTick }),
    setup,
    craftInfo,
    ruleData,
    tick: 0,
    clock: 0,
    rngState,
    missionStatus: 'built',
    missionEvents: { triggers: setup.eventTriggers.map(() => ({ instantiated: 0, destroyed: 0, left: 0 })) },
    entities: new EntityTable(),
    player: createPlayerState(ruleData.map.startPixel),
    spawn,
    objectSets: Object.freeze({ friendly: Object.freeze([]), hostile: Object.freeze([]) }),
    mapIcons: Object.freeze([]),
    flow: createMissionFlow(),
    communications: createWorldCommunications(),
    ai: { friendlyFire: { accumulated: 0, windowEnd: 0 }, parseCache: [] },
    baseService: null,
  };
}
