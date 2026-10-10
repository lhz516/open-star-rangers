/**
 * Spawning (docs/plan/p3/02/spec.md, 任务实例化 and 僚机; docs/original/formats/executable.md, spawn queue,
 * section-5 dispatch and instantiation, P3-02/02–03). The spawn queue check (`0x67018`) only posts spawn requests;
 * request handling dispatches each (`0x67678`) and instantiates (`0x67938`) in posting order, so a request posts its
 * objects one after another, a group request member by member.
 *
 * Draws, in the original's order: a request's placement draws (each group member's layout cycle placing its anchor
 * first), then each instantiation's own (name fallbacks only so far). The rule tasks add their instantiation draws at
 * the marked extension point, in Q-07's order: `0x3060c` (P3-07), `0x68050` (P3-08), the Warp timer +0xC8 (P3-09),
 * `0x20990` (P3-08), `0x38cd4` (P3-10).
 *
 * Instantiation writes only what does not depend on craft records (Q-07). The original's resource test `0x6a0b8`
 * after allocation, whose failure conditions were not established, always passes here (a disclosed difference).
 */
import type { Vector3 } from '../../content/logic/logic-content.ts';
import type { EntitySource, ObjectInstantiatedEvent } from '../contracts/domain-events.ts';
import { isDue } from '../contracts/time.ts';
import { CoreFaultError } from '../errors.ts';
import { assignName } from '../rules/name-assignment.ts';
import { RandStream } from '../rules/original-random.ts';
import { memberPosition, placeRecord, type AttitudeRows, type Placement, type PlacementRecord } from '../rules/placement.ts';
import { PLAYER_KIND_BIT } from '../rules/spawn-schedule.ts';
import type { Entity, EntityRuleInputs, Matrix3 } from '../world/entity-table.ts';
import { COCKPIT_VIEW_MODE } from '../world/player-state.ts';
import type { RuntimeRecord, SpawnEntry, SpawnSourceType } from '../world/spawn-state.ts';
import type { WorldState } from '../world/world-state.ts';

/** Message 0x4000: one spawn request of a firing queue entry. */
export interface SpawnRequest {
  readonly type: 'spawn';
  readonly source: SpawnSourceType;
  /** The entry's declaration, group or wingman option index. */
  readonly index: number;
  /** The request's number within the firing, from 0. */
  readonly request: number;
}

/**
 * x/y radius² of the active area around the player (`0x186b44`): the f32 runtime scale² × 0.25, 7500² exactly. A new
 * object other than the player is active when strictly inside it.
 */
const ACTIVE_RADIUS_SQUARED = 56_250_000;
const IDENTITY: Matrix3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;

/**
 * Stage `spawn-queue-check` (`0x67018`), while spawning is enabled: takes every entry due at this tick's clock, in queue
 * order, and posts its requests. The probability roll needs no draw in supported content: world creation admits only
 * 100 (always posts) and, on a group template the build does not fill, a source 0 (never posts); the original draws
 * one rand even then. Entries never repeat, since supported content has no repeat interval, and no limit applies.
 */
export function checkSpawnQueue(world: WorldState, requests: { post(request: SpawnRequest): void }): void {
  const { spawn, clock } = world;
  if (!spawn.enabled) return;
  while (spawn.queue.length > 0 && isDue(clock, spawn.queue[0].due)) {
    const { source, index, requests: count } = spawn.queue.shift() as SpawnEntry;
    if (firingRecord(world, source, index).ruleInputs.percentA < 100) continue;
    for (let request = 0; request < count; request++) requests.post({ type: 'spawn', source, index, request });
  }
}

/** The record whose probability a firing reads: the record itself, a group's template or the wingman option. */
function firingRecord({ spawn, setup }: WorldState, source: SpawnSourceType, index: number): RuntimeRecord {
  switch (source) {
    case 'record':
      return spawn.records[index];
    case 'group':
      return spawn.records[setup.groups[index].template];
    case 'wingman':
      if (spawn.wingman === null) throw new CoreFaultError('invariant-violated', 'spawn.wingman');
      return spawn.wingman;
  }
}

/** Spawning stays enabled from creation until P3-11 clears it at the end of the mission; it is never set again. */
export function isSpawningEnabled(world: WorldState): boolean {
  return world.spawn.enabled;
}

/** For P3-11: clears the spawn enable flag; no entry fires afterwards. */
export function disableSpawning(world: WorldState): void {
  world.spawn.enabled = false;
}

/** For P3-11's all-clear test: the entries still queued, in firing order, as detached copies. */
export function pendingSpawns(world: WorldState): readonly SpawnEntry[] {
  return Object.freeze(world.spawn.queue.map((entry) => Object.freeze({ ...entry })));
}

/**
 * The position now of the entity a record is anchored on: the first entity, in allocation order, in the list of the
 * anchor record's kind whose source is that record, whatever its state. None for an anchor record of kind 0.
 */
function anchoredPosition(world: WorldState, anchor: number): Vector3 | null {
  const { craftType } = world.setup.declarations[anchor];
  if (craftType === null) return null;
  for (const entity of world.entities.walk(2 ** craftType)) {
    if (entity.source?.collection === 'mission' && entity.source.index === anchor) return entity.position;
  }
  return null;
}

/**
 * The placement service (`0x68398`) for one of the world's records, at this moment; also for P3-11's rescue. Draws from
 * `rand` as placeRecord does.
 */
export function placeWorldRecord(world: WorldState, record: RuntimeRecord, rand: RandStream): Placement {
  const placementRecord: PlacementRecord = {
    gridSpacing: record.gridSpacing,
    anchor: record.anchor === null ? null : { target: anchoredPosition(world, record.anchor) },
    position: record.position,
    region: record.region,
  };
  return placeRecord(placementRecord, world.spawn.frame, rand);
}

/**
 * Whether an object other than the player starts active (`0x3a540`): only with a player entity, strictly within the
 * x/y radius 7500 of it. While the player Warps the original takes the player state's point instead (P3-09).
 */
function startsActive(world: WorldState, { x, y }: Vector3): boolean {
  const playerId = world.player.entityId;
  const player = playerId === null ? undefined : world.entities.get(playerId);
  if (player === undefined) return false;
  const dx = player.position.x - x;
  const dy = player.position.y - y;
  return dx * dx + dy * dy < ACTIVE_RADIUS_SQUARED;
}

const matrixOf = ([first, second, third]: AttitudeRows): Matrix3 =>
  Object.freeze([first.x, first.y, first.z, second.x, second.y, second.z, third.x, third.y, third.z]) as unknown as Matrix3;

function entityRuleInputs({ percentB, percentC, percentD, aiValueA, aiValueB, aiValueC }: RuntimeRecord['ruleInputs']): EntityRuleInputs {
  return { percentB, percentC, percentD, aiValueA, aiValueB, aiValueC };
}

/** Instantiation `0x67938` of `record` at a placed position and attitude; emits `object-instantiated`. */
function instantiate(
  world: WorldState,
  record: RuntimeRecord,
  source: EntitySource,
  position: Vector3,
  attitude: AttitudeRows,
  rand: RandStream,
  emit: (event: ObjectInstantiatedEvent) => void,
): Entity {
  const declaration = (source.collection === 'mission' ? world.setup.declarations : world.setup.wingmanOptions)[source.index];
  const kindBit = declaration.craftType;
  // World creation admits no kind-0 record that spawns and binds every kind to a model.
  if (kindBit === null || declaration.model === null) throw new CoreFaultError('invariant-violated', 'spawn.kind');
  const name = assignName(world.setup, world.entities, world.spawn.namePoolUses, { declaration: record.declaration, kindBit }, rand);
  const player = kindBit === PLAYER_KIND_BIT;
  const active = player || startsActive(world, position);
  // An active player's movement block takes the identity instead of the placement attitude (0x2c3b0, 0x21794).
  const entity = world.entities.allocate({
    kindBit,
    source,
    name,
    side: declaration.side,
    baseInteraction: declaration.baseInteraction,
    presentation: { type: 'model', model: declaration.model },
    position,
    orientation: player ? IDENTITY : matrixOf(attitude),
    activity: active ? 'active' : 'parked',
    ruleInputs: entityRuleInputs(record.ruleInputs),
  });
  // Extension point: the rule tasks' instantiation fields and draws go here, in Q-07's order (module comment).
  if (player) {
    world.player.entityId = entity.id;
    world.player.viewMode = COCKPIT_VIEW_MODE;
    world.player.previousViewMode = COCKPIT_VIEW_MODE;
  }
  emit({ type: 'object-instantiated', tick: world.tick, entityId: entity.id, kindBit, source: entity.source as EntitySource, position: entity.position });
  return entity;
}

/** A group request (`0x67678`, source 1): every member, a layout cycle at a time, then the group's count. */
function dispatchGroup(world: WorldState, index: number, request: number, rand: RandStream, emit: (event: ObjectInstantiatedEvent) => void): void {
  const { template, members } = world.setup.groups[index];
  const group = world.spawn.groups[index];
  const templateRecord = world.spawn.records[template];
  const { layout } = group;
  // Member i takes layout offset i mod L; each layout cycle starts by placing a new anchor from the template.
  for (let start = 0; start < members.length; start += layout.length) {
    group.leader = null;
    const anchor = placeWorldRecord(world, templateRecord, rand);
    for (let cycle = 0; cycle < layout.length && start + cycle < members.length; cycle++) {
      const position = start + cycle;
      const member = members[position];
      const memberRecord = world.spawn.records[member];
      // The copies persist in the member's record, which may also be a section-1 record.
      if (templateRecord.aiTarget !== null) memberRecord.aiTarget = templateRecord.aiTarget;
      if (templateRecord.aiTargetCraftTypes.length > 0) memberRecord.aiTargetCraftTypes = templateRecord.aiTargetCraftTypes;
      const source: EntitySource = { collection: 'mission', index: member, group: { index, request, member: position } };
      const entity = instantiate(world, memberRecord, source, memberPosition(anchor.position, layout[cycle]), anchor.attitude, rand, emit);
      if (cycle === 0) group.leader = entity.id;
    }
  }
  group.spawnCount++;
}

/**
 * Request handling of a spawn request (`0x67678`): a section-1 record or the wingman places and instantiates one
 * object and counts it in its record; a group instantiates its members. Writes the world RNG state back. The original
 * instantiates nothing while its main flow is in state 1 (`0x339cc`), a state P3-11 introduces with its gate.
 */
export function dispatchSpawn(world: WorldState, request: SpawnRequest, emit: (event: ObjectInstantiatedEvent) => void): void {
  const rand = new RandStream(world.rngState);
  if (request.source === 'group') {
    dispatchGroup(world, request.index, request.request, rand, emit);
  } else {
    const record = firingRecord(world, request.source, request.index);
    const placement = placeWorldRecord(world, record, rand);
    const source: EntitySource = { collection: request.source === 'record' ? 'mission' : 'wingman', index: request.index, group: null };
    instantiate(world, record, source, placement.position, placement.attitude, rand, emit);
    record.spawnCount++;
  }
  world.rngState = rand.state;
}
