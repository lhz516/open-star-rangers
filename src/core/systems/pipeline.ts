/**
 * The fixed system pipeline of formal Core (docs/plan/p3/02/spec.md, 系统流水线; Q-09 in
 * docs/original/formats/executable.md#frame-pipeline-p3-0201). PIPELINE is the only ordered stage table: every step
 * runs each stage once, in order. A stage whose rules are not implemented yet has no `run` and names its owner below;
 * Core has no fake systems, registered callbacks or subscriptions, and no production entry injects handlers.
 *
 * Within a tick, stages pass results explicitly through the tick context: domain events in emission order, which later
 * stages may read, and requests, the original's dispatcher messages (internal records, never DomainEvents; see
 * RequestQueue). Instantiation and removal happen only in request handling. Neither list nor the tick input outlives
 * its tick: Core keeps no queue across ticks.
 */
import type { DomainEvent } from '../contracts/domain-events.ts';
import { CORE_LIMITS, fitsLimit } from '../contracts/limits.ts';
import type { TickInput } from '../contracts/tick-input.ts';
import { advanceTime, type MissionTime } from '../contracts/time.ts';
import { CoreFaultError, CoreInputError } from '../errors.ts';
import { ALL_KINDS, type Entity, type EntityId, type ObjectState } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { checkActiveArea, isHeldInWarpTransit, switchParking, updateParked } from './area.ts';
import { applyControlRequest, applyMatchRequest, updatePlayer, type ControlRequest, type MatchSpeedRequest } from './flight-control.ts';
import { moveEntities } from './movement.ts';
import { checkSpawnQueue, dispatchSpawn, type SpawnRequest } from './spawn.ts';

/** An internal request of one tick, the counterpart of an original dispatcher message. */
export type Request =
  /** Message 0x200: an entity's own update asks for its next state. */
  | { readonly type: 'set-state'; readonly entityId: EntityId; readonly state: ObjectState }
  /** Message 0x20: an entity in state area-switch or pending-removal leaves, or switches its parking. */
  | { readonly type: 'leave'; readonly entityId: EntityId }
  /** Message 0x4000: one spawn request of a due queue entry (spawn.ts). */
  | SpawnRequest
  /** Message 0x20000: the integer control path on an entity, posted by the player's update (flight-control.ts). */
  | ControlRequest
  /** Message 0x80000: a speed match, posted by the player's manual match (flight-control.ts). */
  | MatchSpeedRequest;

/**
 * The requests of one tick. Request handling takes them in posting order (mission flow, then object updates in walk
 * order, then the spawn queue check) and also handles those posted while it runs. A request posted after handling is
 * dropped unhandled, as the original clears late messages at the next frame.
 *
 * The count of posts is bounded by CORE_LIMITS.eventsPerTick, a runaway guard rather than an original limit: the
 * stages so far post at most one request per entity update and one per spawn request, of which a world schedules at
 * most CORE_LIMITS.spawnExpansion in its lifetime. The player's update posts at most one request per speed command and
 * two more (the speed assist's restoring request and one carrying only the axes), and an available player posts no
 * lifecycle request (docs/plan/p3/06/spec.md, 容量核算): entities + spawn expansion + commands + 2, 3,138 at the
 * limits, which that limit covers. A rule whose requests fan out further derives its own bound and revises CoreLimits.
 */
export class RequestQueue {
  readonly #requests: Request[] = [];
  #posted = 0;
  #handled = false;

  post(request: Request): void {
    if (!fitsLimit('eventsPerTick', this.#posted, 1)) throw new CoreFaultError('budget-exhausted', 'pipeline.requests');
    this.#posted++;
    if (!this.#handled) this.#requests.push(request);
  }

  /** Handles every request in posting order, including those `handle` posts itself; once per tick. */
  handle(handle: (request: Request) => void): void {
    if (this.#handled) throw new CoreFaultError('invariant-violated', 'pipeline.requests-handled');
    // The length is read again after every request, so requests posted meanwhile are handled in the same pass.
    for (let index = 0; index < this.#requests.length; index++) handle(this.#requests[index]);
    this.#handled = true;
    this.#requests.length = 0;
  }
}

/** Everything one step's stages share. */
export interface TickContext {
  readonly world: WorldState;
  /** This step's number and clock; registration and the clock stage store them in the world. */
  readonly time: MissionTime;
  readonly input: TickInput;
  /** Emitted with emit(); frozen by the commit stage. */
  readonly events: DomainEvent[];
  readonly requests: RequestQueue;
}

/**
 * Stage 1, input registration, up to the first change: given the validated tick input, checks everything else that
 * can reject the step, so that a CoreInputError leaves the world as it was. That is the time after this step (tick or
 * clock past the safe integer range), and the entity IDs the step may allocate: fewer than the entity budget, checked
 * up front since allocation runs mid-tick. A CoreFaultError here means the world state itself is broken.
 */
export function registerTick(world: WorldState, input: TickInput): TickContext {
  const time = advanceTime(world, world.config.clockUnitsPerTick);
  if (!Number.isSafeInteger(world.entities.nextId + CORE_LIMITS.entities)) {
    throw new CoreInputError('tickInput', 'would allocate entity IDs past the safe integer range');
  }
  return { world, time, input, events: [], requests: new RequestQueue() };
}

/** A deeply frozen copy of plain data, so that no later change to what an event was built from reaches it. */
function frozenCopy<Value>(value: Value): Value {
  if (typeof value !== 'object' || value === null) return value;
  const source = value as Record<string, unknown>;
  const copy = (Array.isArray(value) ? [] : {}) as Record<string, unknown>;
  for (const key of Object.keys(source)) copy[key] = frozenCopy(source[key]);
  return Object.freeze(copy) as Value;
}

/** Appends a deeply frozen, detached copy of `event`; more than CORE_LIMITS.eventsPerTick in one tick is a budget fault. */
export function emit(context: TickContext, event: DomainEvent): void {
  if (!fitsLimit('eventsPerTick', context.events.length, 1)) throw new CoreFaultError('budget-exhausted', 'pipeline.events');
  context.events.push(frozenCopy(event));
}

/** Stage 1, input registration, from the first change: registerTick has checked everything that can reject the step. */
function registerInput(context: TickContext): void {
  context.world.tick = context.time.tick;
}

/** Stage 3 (`0x25894`): the mission flow before it still read the previous clock. */
function advanceClock(context: TickContext): void {
  context.world.clock = context.time.clock;
}

/**
 * The player's update (flight-control.ts), where the original polls game input: the player (kind bit 0) comes first in
 * the walk, so that is the start of the stage. It judges every command, those of rules not implemented yet with one
 * rejected/not-implemented result each, and with an available player consumes the axes. The rule tasks add their
 * commands and steps there.
 */
function updatePlayerControls(context: TickContext): void {
  const { world, input, time, requests } = context;
  updatePlayer(world, input, time.tick, { emit: (event) => emit(context, event), post: (request) => requests.post(request) });
}

/**
 * The generic part of an entity's own update (`0x20ae4`, the player's `0x25f90`): a new parked entity or one whose
 * presentation is ready asks to become active, unless it is in Warp transit (`0x20c18`; the player's own callback has
 * no such check), and one in area-switch or pending-removal asks to leave. Active behaviour belongs to the rule tasks
 * (P3-06 to P3-10).
 */
function updateLifecycle(context: TickContext, entity: Entity): void {
  if (isHeldInWarpTransit(context.world, entity)) return;
  switch (entity.state) {
    case 'new':
      // Only a parked entity has no presentation; an active one counted its presentation ready when it got it.
      if (entity.activity !== 'parked') throw new CoreFaultError('invariant-violated', 'object-update.new');
      context.requests.post({ type: 'set-state', entityId: entity.id, state: 'active' });
      return;
    case 'presentation-ready':
      context.requests.post({ type: 'set-state', entityId: entity.id, state: 'active' });
      return;
    case 'area-switch':
    case 'pending-removal':
      context.requests.post({ type: 'leave', entityId: entity.id });
      return;
    default:
      return;
  }
}

/**
 * Stage 4 (`0x20938`): a live walk over every kind, the player first. An entity allocated during the walk at a higher
 * kind bit is updated in the same walk. A destroyed source (state 4) gets no update.
 */
function updateObjects(context: TickContext): void {
  updatePlayerControls(context);
  for (const entity of context.world.entities.walk(ALL_KINDS)) {
    if (entity.state !== 'destroyed-source') updateLifecycle(context, entity);
  }
}

/**
 * Message 0x20 (`0x20d10`): an entity in area-switch whose kind parks switches its parking and starts its state again
 * (area.ts); any other entity, those of the kinds removed on leaving included, is removed. Removal of the player's
 * entity clears the player-state reference to it (the original clears it for kind 1, the player's) together with the
 * player's target and control state, which exist only with a player entity (P3-06 D-03). Removal makes the ID
 * unresolvable; holders of the ID find nothing. Nothing else changes: spawn counts keep counting spawns, and a name
 * becomes free because no entity holds it any more (Q-08).
 */
function leave(world: WorldState, entity: Entity): void {
  if (switchParking(world, entity)) return;
  if (world.player.entityId === entity.id) {
    world.player.entityId = null;
    world.player.target = null;
    world.player.control = null;
  }
  world.entities.remove(entity);
}

function handleRequest(context: TickContext, request: Request): void {
  const { world } = context;
  if (request.type === 'spawn') {
    dispatchSpawn(world, request, (event) => emit(context, event));
    return;
  }
  const entity = world.entities.get(request.entityId);
  // The subject was removed earlier in this pass: a reference to a removed entity is invalid.
  if (entity === undefined) return;
  switch (request.type) {
    case 'set-state':
      entity.state = request.state;
      return;
    case 'leave':
      leave(world, entity);
      return;
    case 'control':
      applyControlRequest(world, entity, request);
      return;
    case 'match-speed':
      applyMatchRequest(world, entity, request, context.time.tick, (event) => emit(context, event));
      return;
  }
}

/** Dispatcher message loop (`0x20d10`): every request of the tick, in posting order. */
function handleRequests(context: TickContext): void {
  context.requests.handle((request) => handleRequest(context, request));
}

/** Stage `spawn-queue-check` (`0x67018`): posts the spawn requests of every due queue entry; instantiates nothing. */
function checkSpawns(context: TickContext): void {
  checkSpawnQueue(context.world, context.requests);
}

/** Stage `movement` (`0x221fc`, movement.ts). */
function move(context: TickContext): void {
  moveEntities(context.world);
}

/** Stage `parked-update` (`0x2f1b0`, area.ts), where a parked object's true exit emits `object-left-world`. */
function updateParkedObjects(context: TickContext): void {
  updateParked(context.world, (event) => emit(context, event));
}

/** Stage `area-check` (`0x3a468`, area.ts). */
function checkArea(context: TickContext): void {
  checkActiveArea(context.world);
}

/** Stage 7 (project boundary): seals the tick's events; requests posted since request handling were dropped. */
function commit(context: TickContext): void {
  Object.freeze(context.events);
}

export interface PipelineStage {
  readonly id: string;
  /** Null until the owning rule task implements the stage. */
  readonly run: ((context: TickContext) => void) | null;
}

const stage = (id: string, run: PipelineStage['run']): PipelineStage => Object.freeze({ id, run });

/**
 * The stage table (spec 系统流水线, rows 1–7), with every dispatcher step Q-09 confirms in its place. Two are not
 * Core stages: the dispatcher `0x20d10` first clears the renderer's and sound's presentation items (`0x52c3c`) and
 * last places the camera for the view mode (`0x21584`), which renderers derive from Render State (P3-12, P3-13).
 */
export const PIPELINE: readonly PipelineStage[] = Object.freeze([
  stage('input-registration', registerInput),
  // 0x3266c, reading the previous clock: P3-11 (flow, result, rescue), P3-10 (docking sub-states).
  stage('mission-flow', null),
  stage('clock', advanceClock),
  stage('object-update', updateObjects),
  // Dispatcher 0x20d10. A due communications reply (0x2cd60): P3-10.
  stage('communications-reply', null),
  stage('spawn-queue-check', checkSpawns),
  stage('request-handling', handleRequests),
  // After the message loop, each once: 0x221fc movement, then its collision passes 0x29670 and 0x29934 (P3-07).
  stage('movement', move),
  stage('collision', null),
  // 0x23808 (P3-07).
  stage('delayed-player-explosion', null),
  // 0x30590 (P3-07).
  stage('energy', null),
  // 0x2ede0 rebuilds the friendly and hostile craft sets through 0x2f028 and the map visibility flag, for the map
  // (P3-09, P3-13) and the parked AI handler (P3-08, the suggested owner); no P3-06 rule reads them.
  stage('object-sets', null),
  stage('parked-update', updateParkedObjects),
  // 0x2bf08 (P3-09).
  stage('warp-completion', null),
  // 0x398ec, view mode 6 (P3-10).
  stage('base-interior', null),
  // 0x334bc, main-flow state 0, which retires every object (P3-11).
  stage('mission-teardown', null),
  stage('area-check', checkArea),
  // Rule progress the original makes in its frame render, such as 0x50508 (P3-09); never waits for a rendered frame.
  stage('frame-end', null),
  stage('commit', commit),
]);

/** Runs a registered tick through every stage and returns its events, deeply frozen. Any throw leaves the world faulted. */
export function runTick(context: TickContext): readonly DomainEvent[] {
  for (const { run } of PIPELINE) run?.(context);
  return context.events;
}
