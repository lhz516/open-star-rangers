/**
 * The formal Core snapshot (docs/plan/p3/02/spec.md, 快照、哈希与 replay; 技术决定 9):
 * `{ format: 'osr-game-snapshot', version: 2, rulesVersion, state }`, deeply frozen and detached from the world. The
 * state is every piece of the world's authoritative state that can affect a later result: the configuration with the
 * full content identity and setupHash, tick, clock, RNG state, the next entity ID, the entities and the order of the
 * kind lists with each entity's flight state (maximum speed, timers, movement block, AI state, formation), the spawn
 * state (queue, enable flag, the records after the build's defaults with their aliasing by declaration, the record and
 * group counts, the group leaders, the name pool counters), the mission status and the player state with its target and
 * control state. Names are held by the entities that carry them. The static MissionSetup is not copied: setupHash binds
 * it. A snapshot is a diagnostic and a checkpoint source, not a save: Core restores no world from one.
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
  type CanonicalWriter as Writer,
} from '../contracts/canonical-text.ts';
import type { EntitySource, GroupMembership, Vec3 } from '../contracts/domain-events.ts';
import type { RuntimeFrame } from '../rules/coordinates.ts';
import {
  ALL_KINDS,
  type AiState,
  type DeclarationReference,
  type Disturbance,
  type Entity,
  type EntityId,
  type EntityPresentation,
  type EntityRuleInputs,
  type Formation,
  type Impulse,
  type SteeredMovementBlock,
  type NameReference,
  type SteeringAxis,
  type TimedRotation,
} from '../world/entity-table.ts';
import type { PlayerControl, PlayerState, SpeedAssist } from '../world/player-state.ts';
import type { GroupState, RecordRuleInputs, RuntimeRecord, SpawnEntry } from '../world/spawn-state.ts';
import type { MissionStatus, WorldConfig, WorldState } from '../world/world-state.ts';
import { RULES_VERSION } from './rules-version.ts';

export const GAME_SNAPSHOT_FORMAT = 'osr-game-snapshot';
export const GAME_SNAPSHOT_VERSION = 2;

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
  readonly player: Readonly<PlayerState>;
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
  const { config, tick, clock, rngState, entities, spawn, missionStatus, player } = world;
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
      player,
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
  }
};

const presentation: Writer<EntityPresentation> = (value) => canonicalObject([['type', value.type], ['model', value.model]]);

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

// One writer per movement-block variant; P3-07 and P3-09 add theirs and dispatch on the mode.
const movement = object<SteeredMovementBlock>({
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

const ai = object<AiState>({ mode: scalar, target: scalar, goal: vector, targetOffset: vector, objectTarget: scalar });

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
  movement: nullable(movement),
  ai,
  formation: nullable(object<Formation>({ leader: scalar, offset: vector })),
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
  }),
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
