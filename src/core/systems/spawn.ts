/**
 * Spawning (docs/plan/p3/02/spec.md, 任务实例化 and 僚机; docs/original/formats/executable.md, spawn queue,
 * section-5 dispatch and instantiation, P3-02/02–03). The spawn queue check (`0x67018`) only posts spawn requests;
 * request handling dispatches each (`0x67678`) and instantiates (`0x67938`) in posting order, so a request posts its
 * objects one after another, a group request member by member.
 *
 * Draws, in the original's order: a request's placement draws (each group member's layout cycle placing its anchor
 * first), then each instantiation's own: name fallbacks, then those of the extension point (docs/plan/p3/06/spec.md,
 * 实例化扩展; docs/plan/p3/02/spec.md, CR-07): P3-07's first energy update `0x3060c`, P3-06's initial AI state
 * `0x68050` and Warp timer +0xC8, P3-08's program selection `0x20990` (one or two starts, rules/ai-selection.ts; the
 * controller installs at the object's first callback, ai.ts), and P3-10's `0x38cd4` (comm-reactions.ts) for an active
 * hostile. Every draw steps the world's generator directly, so a report that draws itself interleaves in the original's
 * order.
 *
 * The original's resource test `0x6a0b8` after allocation, whose failure conditions were not established, always
 * passes here (a disclosed difference).
 */
import type { Vector3 } from '../../content/logic/logic-content.ts';
import type { EntitySource } from '../contracts/domain-events.ts';
import { isDue } from '../contracts/time.ts';
import { CoreFaultError } from '../errors.ts';
import { initialiseCraftCombat, type CraftEntity } from '../rules/combat-init.ts';
import { initialMovementBlock, initialWarpClock } from '../rules/flight-state.ts';
import { selectionSubject, selectProgram } from '../rules/ai-selection.ts';
import { aiCandidates, initialAiState } from '../rules/initial-ai.ts';
import { assignName } from '../rules/name-assignment.ts';
import { HOSTILE_KINDS } from '../rules/comm-reactions.ts';
import { RandStream, type RandSource } from '../rules/original-random.ts';
import { memberPosition, placeRecord, type AttitudeRows, type Placement, type PlacementRecord } from '../rules/placement.ts';
import { activeAreaCentre, isWithinActiveArea } from '../rules/active-area.ts';
import { hasKind } from '../rules/radio.ts';
import { firingRecord, PLAYER_KIND_BIT, postsRequests } from '../rules/spawn-schedule.ts';
import { allocatorFlightState, blankCraftCombat, setActivity, type Entity, type EntityRuleInputs, type Matrix3 } from '../world/entity-table.ts';
import { COCKPIT_VIEW_MODE, initialPlayerControl, initialPlayerTargeting } from '../world/player-state.ts';
import type { RuntimeRecord, SpawnEntry, SpawnSourceType } from '../world/spawn-state.ts';
import type { WorldState } from '../world/world-state.ts';
import { reportEnemyAppears } from './comm-reactions.ts';
import { emit, type TickContext } from './pipeline.ts';

/** Message 0x4000: one spawn request of a firing queue entry. */
export interface SpawnRequest {
  readonly type: 'spawn';
  readonly source: SpawnSourceType;
  /** The entry's declaration, group or wingman option index. */
  readonly index: number;
  /** The request's number within the firing, from 0. */
  readonly request: number;
}

/** Draws straight from the world's generator, one RNG step per value. */
function worldRand(world: WorldState): RandSource {
  return {
    next() {
      const stream = new RandStream(world.rngState);
      const value = stream.next();
      world.rngState = stream.state;
      return value;
    },
  };
}

const IDENTITY: Matrix3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;

/**
 * Stage `spawn-queue-check` (`0x67018`), while spawning is enabled: takes every entry due at this tick's clock, in queue
 * order, and posts its requests when it posts any (postsRequests: the probability roll needs no draw in supported
 * content). Entries never repeat, since supported content has no repeat interval, and no limit applies.
 */
export function checkSpawnQueue(world: WorldState, requests: { post(request: SpawnRequest): void }): void {
  const { spawn, setup, clock } = world;
  if (!spawn.enabled) return;
  while (spawn.queue.length > 0 && isDue(clock, spawn.queue[0].due)) {
    const entry = spawn.queue.shift() as SpawnEntry;
    if (!postsRequests(spawn, setup, entry)) continue;
    const { source, index } = entry;
    for (let request = 0; request < entry.requests; request++) requests.post({ type: 'spawn', source, index, request });
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
export function placeWorldRecord(world: WorldState, record: RuntimeRecord, rand: RandSource): Placement {
  const placementRecord: PlacementRecord = {
    gridSpacing: record.gridSpacing,
    anchor: record.anchor === null ? null : { target: anchoredPosition(world, record.anchor) },
    position: record.position,
    region: record.region,
  };
  return placeRecord(placementRecord, world.spawn.frame, rand);
}

const matrixOf = ([first, second, third]: AttitudeRows): Matrix3 =>
  Object.freeze([first.x, first.y, first.z, second.x, second.y, second.z, third.x, third.y, third.z]) as unknown as Matrix3;

function entityRuleInputs({ percentB, percentC, percentD, aiValueA, aiValueB, aiValueC }: RuntimeRecord['ruleInputs']): EntityRuleInputs {
  return { percentB, percentC, percentD, aiValueA, aiValueB, aiValueC };
}

/** Instantiation `0x67938` of `record` at a placed position and attitude; emits `object-instantiated`. */
function instantiate(context: TickContext, record: RuntimeRecord, source: EntitySource, position: Vector3, attitude: AttitudeRows, rand: RandSource): Entity {
  const { world } = context;
  const declaration = (source.collection === 'mission' ? world.setup.declarations : world.setup.wingmanOptions)[source.index];
  const kindBit = declaration.craftType;
  // World creation admits no kind-0 record that spawns and binds every kind to a model and a craft record (D-01).
  const craft = kindBit === null ? undefined : world.craftInfo.content.craft[kindBit];
  if (kindBit === null || declaration.model === null || craft === undefined) throw new CoreFaultError('invariant-violated', 'spawn.kind');
  const name = assignName(world.setup, world.entities, world.spawn.namePoolUses, { declaration: record.declaration, kindBit }, rand);
  // Allocated as the allocator leaves an object, parked and without a block, its maximum speed 0 and its combat state
  // blank; the steps below write the rest in the original's order (docs/plan/p3/06/spec.md, 实例化扩展; CR-07).
  const entity = world.entities.allocate({
    kindBit,
    source,
    name,
    side: declaration.side,
    baseInteraction: declaration.baseInteraction,
    presentation: { type: 'model', model: declaration.model },
    position,
    orientation: matrixOf(attitude),
    activity: 'parked',
    ruleInputs: entityRuleInputs(record.ruleInputs),
    ...allocatorFlightState(),
    maximumSpeed: 0,
    lastParkedUpdateClock: 0,
    movement: null,
    combat: blankCraftCombat(),
  }) as CraftEntity;
  // The weapon block and the hull, `0x3060c` with the maximum speed and its draw, the cleared two-bit fields.
  initialiseCraftCombat(entity, craft, world.clock, rand);
  entity.ai = initialAiState(world.entities, entity, aiCandidates(record, world.spawn, world.setup), world.spawn.frame, rand);
  entity.lastParkedUpdateClock = world.clock;
  entity.warpClock = initialWarpClock(kindBit, world.clock, rand);
  // `0x20990`: only the program selection, its draws here; the first callback installs the controller (CR-23).
  const { ruleData } = world;
  entity.ai.program = selectProgram(selectionSubject(entity), ruleData.ai.tablePrograms, ruleData.inputs.aiPrograms.content.builtInPrograms, rand);
  const player = kindBit === PLAYER_KIND_BIT;
  // An object other than the player starts active only inside the active area (`0x3a540`), the area check's test.
  if (player || isWithinActiveArea(activeAreaCentre(world), position)) {
    // An active object gets its block at full throttle (0x2c3b0); the player's takes the identity instead of the
    // placement attitude, which 0x21794 writes back.
    setActivity(entity, 'active', initialMovementBlock(entity.maximumSpeed, craft.atB8));
    if (player) entity.orientation = IDENTITY;
    else if (hasKind(HOSTILE_KINDS, kindBit)) reportEnemyAppears(context, position);
  }
  if (player) {
    world.player.entityId = entity.id;
    world.player.viewMode = COCKPIT_VIEW_MODE;
    world.player.previousViewMode = COCKPIT_VIEW_MODE;
    world.player.target = null;
    world.player.control = initialPlayerControl(world.config.group);
    world.player.targeting = initialPlayerTargeting();
    world.player.statusDisplay.redraw = true;
    // `0x67938` hides the new player visual (FS-02).
    world.player.modelShown = false;
  }
  emit(context, { type: 'object-instantiated', tick: world.tick, entityId: entity.id, kindBit, source: entity.source as EntitySource, position: entity.position });
  return entity;
}

const formationOffset = (offset: Vector3, first: Vector3): Vector3 =>
  Object.freeze({ x: Math.fround(offset.x - first.x), y: Math.fround(offset.y - first.y), z: Math.fround(offset.z - first.z) });

/** A group request (`0x67678`, source 1): every member, a layout cycle at a time, then the group's count. */
function dispatchGroup(context: TickContext, index: number, request: number, rand: RandSource): void {
  const { world } = context;
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
      const entity = instantiate(context, memberRecord, source, memberPosition(anchor.position, layout[cycle]), anchor.attitude, rand);
      // After instantiation: the cycle's first member leads, the later ones follow it at f32(l − layout[0]) (+0x7C,
      // +0x80–+0x88).
      if (group.leader === null) group.leader = entity.id;
      else entity.formation = Object.freeze({ leader: group.leader, offset: formationOffset(layout[cycle], layout[0]) });
    }
  }
  group.spawnCount++;
}

/**
 * Request handling of a spawn request (`0x67678`): a section-1 record or the wingman places and instantiates one
 * object and counts it in its record; a group instantiates its members. The original instantiates nothing while its
 * main flow is in state 1 (`0x339cc`), a state P3-11 introduces with its gate.
 */
export function dispatchSpawn(context: TickContext, request: SpawnRequest): void {
  const { world } = context;
  const rand = worldRand(world);
  if (request.source === 'group') {
    dispatchGroup(context, request.index, request.request, rand);
  } else {
    const record = firingRecord(world.spawn, world.setup, request.source, request.index);
    const placement = placeWorldRecord(world, record, rand);
    const source: EntitySource = { collection: request.source === 'record' ? 'mission' : 'wingman', index: request.index, group: null };
    instantiate(context, record, source, placement.position, placement.attitude, rand);
    record.spawnCount++;
  }
}
