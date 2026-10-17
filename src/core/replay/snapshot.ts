/**
 * The formal Core snapshot (docs/plan/p3/02/spec.md, 快照、哈希与 replay; 技术决定 9):
 * `{ format: 'osr-game-snapshot', version: 7, rulesVersion, state }`, deeply frozen and detached from the world. The
 * state is every piece of the world's authoritative state that can affect a later result: the configuration with the
 * full content identity and setupHash, tick, clock, RNG state, the next entity ID, the entities and the order of the
 * kind lists with each entity's flight state (maximum speed, timers, movement block, AI state, formation) and combat
 * state (P3-07, CR-02 to CR-04), the spawn state (queue, enable flag, the records after the build's defaults with their
 * aliasing by declaration, the record and group counts, the group leaders, the name pool counters), the mission status
 * and the player state with its target, control, targeting, combat records and cockpit display state, and P3-09's
 * map cursor, destination, saved page and Warp transit, each entity's map visibility flag, the object sets and the map
 * icon list (docs/plan/p3/02/spec.md, MW-14). P3-10 adds the mission flow, the player's docking object, communications
 * state and saved docking pose, each entity's communications fields and pending command, and the world's
 * communications, friendly-fire and base service state (CB-16). P3-08 adds each entity's AI program slot with its
 * controller and the handler's private state, the transponder state, and the world's parse cache (CR-25); the static AI
 * data is not copied. P3-12 adds whether the player's model is shown (FS-08). Names are held by the entities that
 * carry them. The static MissionSetup and rule data are not copied: setupHash binds them. A snapshot is a diagnostic
 * and a checkpoint source, not a save: Core restores no world from one.
 *
 * The canonical text writes every object's members in the order listed here, never in an object's own key order; the
 * entities are a set written in ascending ID order, every other list keeps its order. The state hash is fnv1a64 of the
 * whole snapshot's text, versions included.
 */
import type { ContentIdentity, ContentOrigin } from '../../content/content-identity.ts';
import type { SpawnRegion } from '../../content/logic/logic-content.ts';
import {
  canonicalHash,
  canonicalList as list,
  canonicalMembers as object,
  canonicalNullable as nullable,
  canonicalObject,
  canonicalScalar as scalar,
  canonicalText,
  type CanonicalMembers,
  type CanonicalWriter as Writer,
} from '../contracts/canonical-text.ts';
import type { EntitySource, GroupMembership, Vec3 } from '../contracts/domain-events.ts';
import type { RuntimeFrame } from '../rules/coordinates.ts';
import type { AxisControl, ControlBlock } from '../systems/pipeline.ts';
import {
  ALL_KINDS,
  type AiController,
  type AiControllerCommon,
  type AiHandler,
  type AiState,
  type AiProgramSlot,
  type AttackPass,
  type BaseState,
  type ChannelTrigger,
  type ControllerLimits,
  type CraftCombat,
  type DeclarationReference,
  type Disturbance,
  type Entity,
  type EntityCombat,
  type EntityCommunications,
  type EntityId,
  type EntityPresentation,
  type EntityRuleInputs,
  type EngagementTimer,
  type ExecutionState,
  type ExplosionCombat,
  type Formation,
  type FragmentCombat,
  type FragmentExpiry,
  type HomingState,
  type Impulse,
  type InterpreterState,
  type LinearMovementBlock,
  type ListSelection,
  type MarkerCombat,
  type MarkerMovementBlock,
  type MissileCombat,
  type MissileGuidance,
  type MissileLock,
  type MountState,
  type MovementBlock,
  type NameReference,
  type NoiseSettings,
  type PendingCommand,
  type ScriptDeadline,
  type ProjectileCombat,
  type SpinningMovementBlock,
  type SteeredMovementBlock,
  type SteeringAxis,
  type SteeringBlock,
  type TimedRotation,
  type TransponderCallback,
  type TransponderState,
  type WeaponBlock,
  type WingmanState,
} from '../world/entity-table.ts';
import type { MapPixel, MapPoint } from '../world/map-rule-data.ts';
import type {
  CategoryValue,
  CommandValue,
  CommunicationsMenu,
  KillCounts,
  MenuExit,
  MenuItem,
  ObjectValue,
  PlayerCommunications,
  PlayerControl,
  PlayerMap,
  PlayerState,
  PlayerTargeting,
  Pose,
  ShotCounts,
  SpeedAssist,
  WarpTransit,
} from '../world/player-state.ts';
import type { GroupState, RecordRuleInputs, RuntimeRecord, SpawnEntry } from '../world/spawn-state.ts';
import type {
  BaseService,
  IncomingChannel,
  MapIcon,
  MessageIdentity,
  MissionFlow,
  MissionStatus,
  ObjectSets,
  OptionalFloat,
  ParsedArgument,
  ParsedScript,
  RadioItem,
  SpeakerSnapshot,
  WorldAi,
  WorldCommunications,
  WorldConfig,
  WorldState,
} from '../world/world-state.ts';
import { RULES_VERSION } from './rules-version.ts';

export const GAME_SNAPSHOT_FORMAT = 'osr-game-snapshot';
export const GAME_SNAPSHOT_VERSION = 7;

export type SnapshotEntity = Readonly<Entity>;
export type SnapshotRecord = Readonly<RuntimeRecord>;
export type SnapshotGroup = Readonly<GroupState>;

export interface SnapshotSpawn {
  readonly frame: RuntimeFrame;
  /** One per mission declaration, in index order. */
  readonly records: readonly SnapshotRecord[];
  readonly wingman: SnapshotRecord | null;
  readonly groups: readonly SnapshotGroup[];
  /** In firing order. */
  readonly queue: readonly SpawnEntry[];
  readonly enabled: boolean;
  readonly namePoolUses: readonly number[];
}

export interface SnapshotState {
  readonly config: WorldConfig;
  readonly tick: number;
  readonly clock: number;
  readonly rngState: number;
  readonly nextEntityId: EntityId;
  /** In ascending ID order. */
  readonly entities: readonly SnapshotEntity[];
  /** Entity IDs in the order a walk over every kind visits them: ascending kind bit, each kind's list in its order. */
  readonly kindOrder: readonly EntityId[];
  readonly spawn: SnapshotSpawn;
  readonly missionStatus: MissionStatus;
  readonly flow: Readonly<MissionFlow>;
  readonly player: Readonly<PlayerState>;
  readonly objectSets: ObjectSets;
  readonly mapIcons: readonly MapIcon[];
  readonly communications: Readonly<WorldCommunications>;
  readonly ai: WorldAi;
  readonly baseService: Readonly<BaseService> | null;
}

export interface GameSnapshot {
  readonly format: typeof GAME_SNAPSHOT_FORMAT;
  readonly version: typeof GAME_SNAPSHOT_VERSION;
  readonly rulesVersion: number;
  readonly state: SnapshotState;
}

/** A deeply frozen copy of plain data. */
function frozenCopy<Value>(value: Value): Value {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy)) as Value;
  const copy: Record<string, unknown> = {};
  for (const [key, member] of Object.entries(value)) copy[key] = frozenCopy(member);
  return Object.freeze(copy) as Value;
}

/** For World.snapshot(): reads the state without changing it and returns a deeply frozen, detached snapshot. */
export function takeSnapshot(world: WorldState): GameSnapshot {
  const { config, tick, clock, rngState, entities, spawn, missionStatus, flow, player, objectSets, mapIcons, communications, ai, baseService } = world;
  return frozenCopy({
    format: GAME_SNAPSHOT_FORMAT,
    version: GAME_SNAPSHOT_VERSION,
    rulesVersion: RULES_VERSION,
    state: {
      config,
      tick,
      clock,
      rngState,
      nextEntityId: entities.nextId,
      entities: [...entities.byId()],
      kindOrder: Array.from(entities.walk(ALL_KINDS), ({ id }) => id),
      spawn,
      missionStatus,
      flow,
      player,
      objectSets,
      mapIcons,
      communications,
      ai,
      baseService,
    },
  });
}

const origin: Writer<ContentOrigin> = (value) => canonicalObject(value.type === 'synthetic'
  ? [['type', value.type], ['fixtureId', value.fixtureId]]
  : [['type', value.type], ['sourceFingerprint', value.sourceFingerprint]]);

const content = object<ContentIdentity>({
  schemaVersion: scalar,
  sliceId: scalar,
  sliceDefinitionVersion: scalar,
  converterVersion: scalar,
  manifestIdentity: scalar,
  origin,
});

const config = object<WorldConfig>({
  content,
  mission: scalar,
  setupHash: scalar,
  rawDifficulty: scalar,
  group: scalar,
  slot: scalar,
  wingman: scalar,
  seed: scalar,
  clockUnitsPerTick: scalar,
});

const vector = object<Vec3>({ x: scalar, y: scalar, z: scalar });
const declarationReference = object<DeclarationReference>({ collection: scalar, index: scalar });

const source = object<EntitySource>({
  collection: scalar,
  index: scalar,
  group: nullable(object<GroupMembership>({ index: scalar, request: scalar, member: scalar })),
});

const name: Writer<NameReference> = (value) => {
  switch (value.type) {
    case 'none':
      return canonicalObject([['type', value.type]]);
    case 'candidate':
      return canonicalObject([['type', value.type], ['declaration', declarationReference(value.declaration)], ['candidate', value.candidate]]);
    case 'pool':
      return canonicalObject([['type', value.type], ['index', value.index]]);
    case 'craft-type':
      return canonicalObject([['type', value.type], ['kindBit', value.kindBit]]);
    case 'map-marker':
      return canonicalObject([['type', value.type]]);
  }
};

const presentation: Writer<EntityPresentation> = (value) => {
  switch (value.type) {
    case 'model':
      return canonicalObject([['type', value.type], ['model', value.model]]);
    case 'missile':
      return canonicalObject([['type', value.type], ['missile', value.missile]]);
    case 'projectile':
      return canonicalObject([['type', value.type], ['visuals', value.visuals], ['record', value.record]]);
    case 'explosion':
      return canonicalObject([['type', value.type], ['variant', value.variant]]);
    case 'fragment':
      return canonicalObject([['type', value.type], ['model', value.model], ['part', value.part], ['display', value.display]]);
    case 'map-marker':
      return canonicalObject([['type', value.type]]);
  }
};

const entityRuleInputs = object<EntityRuleInputs>({
  percentB: scalar,
  percentC: scalar,
  percentD: scalar,
  aiValueA: scalar,
  aiValueB: scalar,
  aiValueC: scalar,
});

const steeringAxis = object<SteeringAxis>({ rate: scalar, enabled: scalar });
const timedRotation = nullable(object<TimedRotation>({ rate: scalar, decay: scalar, end: scalar }));

const disturbance: Writer<Disturbance> = (value) =>
  canonicalObject(value.level === 1 ? [['level', value.level]] : [['level', value.level], ['biases', value.biases]]);

// One writer per movement-block variant, dispatched on the mode.
const steeredMovement = object<SteeredMovementBlock>({
  mode: scalar,
  speed: scalar,
  commandedSpeed: scalar,
  atCommandedSpeed: scalar,
  speedRatio: scalar,
  steering: object<SteeredMovementBlock['steering']>({ pitch: steeringAxis, yaw: steeringAxis, roll: steeringAxis }),
  timedRotation: object<SteeredMovementBlock['timedRotation']>({ pitch: timedRotation, yaw: timedRotation, roll: timedRotation }),
  impulse: nullable(object<Impulse>({ direction: vector, magnitude: scalar })),
  locked: scalar,
  disturbance: nullable(disturbance),
});
const linearMovement = object<LinearMovementBlock>({ mode: scalar, speed: scalar, velocity: vector, previousPosition: vector, hitTest: scalar });
const spinningMovement = object<SpinningMovementBlock>({ mode: scalar, speed: scalar, velocity: vector, spin: scalar, spinAxis: scalar });
const markerMovement = object<MarkerMovementBlock>({ mode: scalar, speed: scalar });

const movement: Writer<MovementBlock> = (value) => {
  switch (value.mode) {
    case 'craft':
    case 'warp':
      return steeredMovement(value);
    case 'linear':
      return linearMovement(value);
    case 'spinning':
      return spinningMovement(value);
    case 'marker':
      return markerMovement(value);
  }
};

// P3-08's controller (docs/plan/p3/02/spec.md, CR-16, CR-17).
const axisControl = object<AxisControl>({ clear: scalar, set: scalar, value: scalar });
const noise = object<NoiseSettings>({ enabled: scalar, low: scalar, high: scalar });

const steeringBlock = object<SteeringBlock>({
  targetValid: scalar,
  target: scalar,
  targetSample: scalar,
  relativeSample: scalar,
  point: vector,
  distance: scalar,
  targetSpeed: scalar,
  offset: object<SteeringBlock['offset']>({ enabled: scalar, frame: scalar, vector }),
  sizeClass: scalar,
  approachRadius: scalar,
  speedLimit: scalar,
  halfSpeedLimit: scalar,
  turnRates: list(scalar),
  leadMode: scalar,
  leadConstant: scalar,
  relativeFlags: scalar,
  relative: vector,
  reverseFlags: scalar,
  reverse: vector,
  angles: list(scalar),
  control: object<ControlBlock>({ scale: scalar, axes: list(axisControl), speedFactor: scalar }),
  coneBits: scalar,
  speedFraction: scalar,
  turnFraction: scalar,
  rollMatch: scalar,
  throttleNoise: noise,
  steeringNoise: noise,
});

const controllerCommon = {
  nextUpdateClock: scalar,
  period: scalar,
  limits: object<ControllerLimits>({ turn: scalar, speed: scalar, saturation: scalar, rollMatchThreshold: scalar }),
  triggers: list(object<ChannelTrigger>({ pressed: scalar, holdDeadline: scalar })),
  aiLock: scalar,
  missileReady: scalar,
  automaticMounts: scalar,
  engagement: object<EngagementTimer>({ dueClock: scalar, period: scalar, mask: scalar }),
  attackPass: object<AttackPass>({ phase: scalar, deadline: scalar, savedSizeClass: scalar, savedLeadMode: scalar }),
  steering: steeringBlock,
} as const satisfies CanonicalMembers<AiControllerCommon>;

const deadline = object<ScriptDeadline>({ active: scalar, until: scalar });

const interpreter = object<InterpreterState>({
  state: scalar,
  execution: nullable(object<ExecutionState>({
    script: scalar,
    item: scalar,
    variables: list(scalar),
    timers: list(scalar),
    returnStack: list(scalar),
    wait: deadline,
    hold: deadline,
  })),
  lastRunEnded: scalar,
  steadyClock: scalar,
  stateDeadline: scalar,
  state4Deadline: scalar,
});

const wingman = object<WingmanState>({
  behaviour: scalar,
  doNotAttack: scalar,
  attackTarget: scalar,
  nextGunSwitchClock: scalar,
  nextEngageSearchClock: scalar,
});

type ControllerOf<Handler extends AiHandler> = Extract<AiController, { readonly handler: Handler }>;

// One writer per handler: the common members, then the handler and its private state.
const interpreterController = object<ControllerOf<'interpreter'>>({ ...controllerCommon, handler: scalar, interpreter });
const wingmanController = object<ControllerOf<'wingman'>>({ ...controllerCommon, handler: scalar, wingman });
const baseController = object<ControllerOf<'base'>>({ ...controllerCommon, handler: scalar, base: object<BaseState>({ targetMask: scalar }) });
const parkedController = object<ControllerOf<'parked'>>({ ...controllerCommon, handler: scalar });

const controller: Writer<AiController> = (value) => {
  switch (value.handler) {
    case 'interpreter':
      return interpreterController(value);
    case 'wingman':
      return wingmanController(value);
    case 'base':
      return baseController(value);
    case 'parked':
      return parkedController(value);
  }
};

const program: Writer<AiProgramSlot> = (value) => (value.type === 'none'
  ? canonicalObject([['type', value.type]])
  : canonicalObject([['type', value.type], ['record', value.record], ['controller', value.controller === null ? null : controller(value.controller)]]));

const ai = object<AiState>({
  mode: scalar,
  target: scalar,
  goal: vector,
  targetOffset: vector,
  objectTarget: scalar,
  pendingCommand: nullable(object<PendingCommand>({ code: scalar, issuedTick: scalar })),
  program,
});

const transponderCallback: Writer<TransponderCallback> = (value) =>
  canonicalObject(value.phase === 'tumbling' ? [['phase', value.phase], ['since', value.since]] : [['phase', value.phase]]);

const clockReference = nullable(object<{ readonly entity: EntityId; readonly clock: number }>({ entity: scalar, clock: scalar }));
const listSelection = object<ListSelection>({ index: scalar, mount: scalar });

const craftCombat = object<CraftCombat>({
  type: scalar,
  energy: scalar,
  shield: scalar,
  charge: scalar,
  shieldLevel: scalar,
  chargeLevel: scalar,
  sparePower: scalar,
  fullSpeedPower: scalar,
  lastEnergyClock: scalar,
  nextEnergyClock: scalar,
  depleted: scalar,
  hull: scalar,
  subsystems: list(scalar),
  weapons: object<WeaponBlock>({
    selections: list(listSelection),
    lock: object<MissileLock>({ level: scalar, stageDueClock: scalar, losing: scalar, graceDueClock: scalar, nextUpdateClock: scalar }),
    mounts: list(object<MountState>({
      lastShotClock: scalar,
      ammunition: scalar,
      damage: scalar,
      burst: scalar,
      aim: list(scalar),
      autoTarget: scalar,
      retargetClock: scalar,
    })),
  }),
  hitFeedbackClock: scalar,
  proximity: nullable(object<NonNullable<CraftCombat['proximity']>>({ entity: scalar, distanceSquared: scalar })),
  lastVictim: clockReference,
  lastAttacker: clockReference,
});

const missileCombat = object<MissileCombat>({
  type: scalar,
  missile: scalar,
  shooter: scalar,
  target: scalar,
  launchByte: scalar,
  program: scalar,
  detonate: scalar,
  contact: scalar,
  guidance: nullable(object<MissileGuidance>({
    phase: scalar,
    lifetimeClock: scalar,
    armClock: scalar,
    fuseRadiusSquared: scalar,
    detonationClock: scalar,
    checkInterval: scalar,
    nextCheckClock: scalar,
  })),
  homing: nullable(object<HomingState>({
    period: scalar,
    nextUpdateClock: scalar,
    turnFraction: scalar,
    speedFraction: scalar,
    targetValid: scalar,
    targetDistance: scalar,
  })),
});

const projectileCombat = object<ProjectileCombat>({
  type: scalar,
  gun: scalar,
  shooter: scalar,
  expiry: nullable(object<NonNullable<ProjectileCombat['expiry']>>({ clock: scalar, firstHitPending: scalar })),
});

const explosionCombat = object<ExplosionCombat>({
  type: scalar,
  source: scalar,
  sourceKindBit: scalar,
  variant: scalar,
  heldSource: scalar,
  activationClock: scalar,
  removalAfterClock: scalar,
});

const fragmentExpiry: Writer<FragmentExpiry> = (value) =>
  canonicalObject(value.type === 'at' ? [['type', value.type], ['clock', value.clock]] : [['type', value.type]]);

const fragmentCombat = object<FragmentCombat>({
  type: scalar,
  sourceKindBit: scalar,
  part: scalar,
  debris: scalar,
  durability: scalar,
  explodeOnExpiry: scalar,
  expiry: fragmentExpiry,
  handOff: scalar,
});

// One writer per combat variant, dispatched on the type.
const combat: Writer<EntityCombat> = (value) => {
  switch (value.type) {
    case 'craft':
      return craftCombat(value);
    case 'missile':
      return missileCombat(value);
    case 'projectile':
      return projectileCombat(value);
    case 'explosion':
      return explosionCombat(value);
    case 'fragment':
      return fragmentCombat(value);
    case 'marker':
      return object<MarkerCombat>({ type: scalar })(value);
  }
};

const entity = object<SnapshotEntity>({
  id: scalar,
  kindBit: scalar,
  source: nullable(source),
  name,
  side: scalar,
  baseInteraction: scalar,
  presentation,
  position: vector,
  orientation: list(scalar),
  placementSerial: scalar,
  ruleInputs: entityRuleInputs,
  state: scalar,
  activity: scalar,
  destroyed: scalar,
  maximumSpeed: scalar,
  lastParkedUpdateClock: scalar,
  warpClock: scalar,
  inWarp: scalar,
  mapVisible: scalar,
  movement: nullable(movement),
  ai,
  formation: nullable(object<Formation>({ leader: scalar, offset: vector })),
  combat,
  communications: object<EntityCommunications>({ face: scalar, threatStamp: scalar }),
  transponder: nullable(object<TransponderState>({ creator: scalar, callback: transponderCallback })),
});

const record = object<SnapshotRecord>({
  declaration: declarationReference,
  position: vector,
  region: nullable(object<SpawnRegion>({ x0: scalar, y0: scalar, x1: scalar, y1: scalar })),
  anchor: scalar,
  gridSpacing: scalar,
  ruleInputs: object<RecordRuleInputs>({
    percentA: scalar,
    craftCount: scalar,
    percentB: scalar,
    percentC: scalar,
    percentD: scalar,
    aiValueA: scalar,
    aiValueB: scalar,
    aiValueC: scalar,
  }),
  aiTarget: scalar,
  aiTargetCraftTypes: list(scalar),
  spawnCount: scalar,
});

const spawn = object<SnapshotSpawn>({
  frame: object<RuntimeFrame>({ sectors: scalar, scaleFactor: scalar }),
  records: list(record),
  wingman: nullable(record),
  groups: list(object<SnapshotGroup>({ layout: list(vector), spawnCount: scalar, leader: scalar })),
  queue: list(object<SpawnEntry>({ due: scalar, source: scalar, index: scalar, requests: scalar })),
  enabled: scalar,
  namePoolUses: list(scalar),
});

// MapPixel and MapPoint have the same members.
const mapPixel = object<MapPixel | MapPoint>({ column: scalar, row: scalar });

const warpTransit = object<WarpTransit>({
  serial: scalar,
  origin: vector,
  length: scalar,
  segments: scalar,
  fraction: scalar,
  error: scalar,
  angle: scalar,
  centring: scalar,
  frame: object<WarpTransit['frame']>({ position: vector, orientation: list(scalar) }),
  path: list(vector),
});

const mapIcon = object<MapIcon>({ entityId: scalar, kindBit: scalar, position: vector, pixel: mapPixel, inWorld: scalar });

// P3-10's state (docs/plan/p3/02/spec.md, CB-02 to CB-05, CB-11).
const pose = object<Pose>({ position: vector, orientation: list(scalar) });

const menuValue: Writer<CategoryValue | ObjectValue | CommandValue | MenuExit> = (value) => {
  switch (value.type) {
    case 'category':
      return canonicalObject([['type', value.type], ['source', value.source], ['kindMask', value.kindMask]]);
    case 'object':
      return canonicalObject([['type', value.type], ['entityId', value.entityId], ['kindBit', value.kindBit], ['name', name(value.name)], ['tone', value.tone]]);
    case 'command':
      return canonicalObject([['type', value.type], ['source', value.source], ['code', value.code]]);
    case 'exit':
      return canonicalObject([['type', value.type]]);
  }
};

const menu = object<CommunicationsMenu>({
  level: scalar,
  table: scalar,
  items: list(object<MenuItem<CategoryValue | ObjectValue | CommandValue>>({ key: scalar, value: menuValue })),
});

const playerCommunications = object<PlayerCommunications>({
  menu: nullable(menu),
  partner: scalar,
  menuSavedPage: scalar,
  incomingSavedPage: scalar,
  limits: object<PlayerCommunications['limits']>({ friendlyHit: scalar, friendlyKill: scalar }),
  thanks: scalar,
});

const radioItem = object<RadioItem>({
  message: object<MessageIdentity>({ table: scalar, face: scalar, index: scalar }),
  due: scalar,
  callback: scalar,
  speaker: nullable(object<SpeakerSnapshot>({ entityId: scalar, kindBit: scalar, name })),
});

// One writer per channel phase.
const channel: Writer<IncomingChannel> = (value) => {
  switch (value.phase) {
    case 'idle':
      return canonicalObject([['phase', value.phase]]);
    case 'loading':
      return canonicalObject([['phase', value.phase], ['item', radioItem(value.item)], ['readyTick', value.readyTick]]);
    case 'playing':
      return canonicalObject([
        ['phase', value.phase], ['item', radioItem(value.item)], ['startClock', value.startClock], ['frameDurations', value.frameDurations],
      ]);
  }
};

const worldCommunications = object<Readonly<WorldCommunications>>({
  queue: list(radioItem),
  channel,
  facePools: object<WorldCommunications['facePools']>({ craft: list(scalar), base: list(scalar) }),
  limits: object<WorldCommunications['limits']>({ wingmanLowHull: scalar, enemyAppears: scalar, tailWarning: scalar, wingmanArrivalRepair: scalar }),
  tailCheck: object<WorldCommunications['tailCheck']>({ dueClock: scalar, attackerOnTail: scalar, missileIncoming: scalar }),
});

const baseService = object<Readonly<BaseService>>({
  rows: list(scalar),
  cursor: scalar,
  dues: object<BaseService['dues']>({ repair: scalar, hull: scalar, energy: scalar }),
  rates: object<BaseService['rates']>({ hull: scalar, energy: scalar }),
  flags: object<BaseService['flags']>({ repairsComplete: scalar, energyAndMissilesFull: scalar, hullFull: scalar }),
});

// P3-08's parse cache (CR-19).
const optionalFloat = object<OptionalFloat>({ present: scalar, value: scalar });

const parsedArgument: Writer<ParsedArgument> = (value) => {
  switch (value.type) {
    case 'none':
      return canonicalObject([['type', value.type]]);
    case 'integer':
    case 'float':
      return canonicalObject([['type', value.type], ['value', value.value]]);
    case 'optional-floats':
      return canonicalObject([['type', value.type], ['values', value.values.map(optionalFloat)]]);
    case 'floats':
      return canonicalObject([['type', value.type], ['values', value.values]]);
  }
};

const state = object<SnapshotState>({
  config,
  tick: scalar,
  clock: scalar,
  rngState: scalar,
  nextEntityId: scalar,
  entities: (entities) => [...entities].sort((left, right) => left.id - right.id).map(entity),
  kindOrder: list(scalar),
  spawn,
  missionStatus: scalar,
  flow: object<Readonly<MissionFlow>>({ mainState: scalar, subState: scalar, dockingDeadline: scalar }),
  player: object<Readonly<PlayerState>>({
    entityId: scalar,
    viewMode: scalar,
    previousViewMode: scalar,
    subMode: scalar,
    target: scalar,
    control: nullable(object<PlayerControl>({
      lastAxes: object<PlayerControl['lastAxes']>({ pitch: scalar, yaw: scalar, roll: scalar }),
      speedAssist: object<SpeedAssist>({ enabled: scalar, dueClock: scalar, engaged: scalar }),
    })),
    targeting: nullable(object<PlayerTargeting>({ mode: scalar, autoTargetDueClock: scalar })),
    followedEntity: scalar,
    delayedExplosionClock: scalar,
    kills: object<KillCounts>({ 7: scalar, 8: scalar, 9: scalar, 10: scalar, 11: scalar, 12: scalar, 16: scalar, 19: scalar }),
    shots: object<ShotCounts>({ projectilesFired: scalar, projectileHits: scalar, missilesFired: scalar, missileHits: scalar }),
    heavyDamage: scalar,
    leftDisplay: object<PlayerState['leftDisplay']>({ page: scalar }),
    statusDisplay: object<PlayerState['statusDisplay']>({ blink: scalar, blinkDueClock: scalar, redraw: scalar }),
    map: object<PlayerMap>({ cursor: mapPixel, destination: nullable(vector) }),
    savedLeftPage: scalar,
    warp: nullable(warpTransit),
    dockingObject: scalar,
    communications: playerCommunications,
    docking: object<PlayerState['docking']>({ savedPose: nullable(pose) }),
    modelShown: scalar,
  }),
  objectSets: object<ObjectSets>({ friendly: list(scalar), hostile: list(scalar) }),
  mapIcons: list(mapIcon),
  communications: worldCommunications,
  ai: object<WorldAi>({
    friendlyFire: object<WorldAi['friendlyFire']>({ accumulated: scalar, windowEnd: scalar }),
    parseCache: list(object<ParsedScript>({ script: scalar, uses: scalar, items: list(parsedArgument) })),
  }),
  baseService: nullable(baseService),
});

const snapshotValue = object<GameSnapshot>({ format: scalar, version: scalar, rulesVersion: scalar, state });

/**
 * The canonical text of a snapshot (compact ASCII JSON, see canonical-text.ts). Throws CoreInputError at a
 * `snapshot…` path for a value the contract does not allow, or for text longer than CORE_LIMITS.canonicalTextLength.
 */
export function snapshotText(snapshot: GameSnapshot): string {
  return canonicalText(snapshotValue(snapshot), 'snapshot');
}

/** The state hash: 16 lowercase hex digits, fnv1a64 of the snapshot's canonical text; throws as snapshotText does. */
export function snapshotHash(snapshot: GameSnapshot): string {
  return canonicalHash(snapshotValue(snapshot), 'snapshot');
}
