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

/** The original mission status byte `0x1b46fc`: 1 once the mission is built. P3-11 adds the later states. */
export type MissionStatus = 'built';

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
 * The mission sub-state `0x186881` (docs/plan/p3/02/spec.md, CB-02): 0 normal; 3 a docking request awaits its reply; 4
 * the countdown after the reply; 5 docking delivered or the base interior. P3-11 adds 1, 2 and 6 to this closed union.
 */
export type MissionSubState = 0 | 3 | 4 | 5;

/** The mission flow (CB-02); P3-11 extends both states rather than adding a competing flow state. */
export interface MissionFlow {
  /** `0x1863ac`: a world exists only while the mission runs, state 3; P3-11 adds its main-flow states. */
  readonly mainState: 3;
  subState: MissionSubState;
  /** `0x186824`, a clock: sub-state 3's deadline and 4's due clock; 0 at creation, read only in sub-states 3 and 4. */
  dockingDeadline: number;
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
  readonly entities: EntityTable;
  readonly player: PlayerState;
  readonly spawn: SpawnState;
  /** MW-02, MW-06. */
  objectSets: ObjectSets;
  /** The map icon list (MW-02, MW-07): built by a view mode 8 frame end, emptied by any other; empty at creation. */
  mapIcons: readonly MapIcon[];
  /** P3-10's world state (docs/plan/p3/02/spec.md, CB-02, CB-05, CB-11), from here on. */
  readonly flow: MissionFlow;
  readonly communications: WorldCommunications;
  readonly ai: WorldAi;
  baseService: BaseService | null;
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
 * icons; the mission running in sub-state 0, with P3-10's state at its creation values (CB-02, CB-05, CB-11) and an
 * empty parse cache (CR-19).
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
    entities: new EntityTable(),
    player: createPlayerState(ruleData.map.startPixel),
    spawn,
    objectSets: Object.freeze({ friendly: Object.freeze([]), hostile: Object.freeze([]) }),
    mapIcons: Object.freeze([]),
    flow: { mainState: 3, subState: 0, dockingDeadline: 0 },
    communications: createWorldCommunications(),
    ai: { friendlyFire: { accumulated: 0, windowEnd: 0 }, parseCache: [] },
    baseService: null,
  };
}
