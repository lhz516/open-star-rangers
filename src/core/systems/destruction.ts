/**
 * Destruction, explosions and fragments in the pipeline (docs/plan/p3/02/spec.md, CR-04 to CR-08, CR-11 and CR-13;
 * docs/original/formats/executable.md, X1, X2, X4, X6, X7 and X9):
 * - constructExplosion, the explosion constructor `0x23ac8`, a direct call from whichever stage destroys (CR-08):
 *   request handling (a missile's detonation, P3-07/20; a flagged fragment's expiry), movement (a projectile's kill,
 *   P3-07/17), collision (P3-07/19), the delayed player explosion, and object update (P3-08's area damage `0x6313c`).
 *   damage.ts reaches it through destroyEntity, after `object-destroyed`, for a victim that is not parked. There P3-11
 *   adds `0x32d74` for kind 1 and `0x32dec` for kind 2 before this entry (CR-13);
 * - the callbacks of explosions (`0x23838`) and fragments (`0x24ac4`), which replace the generic lifecycle update;
 * - in request handling: an explosion's `set-state` (`0x2409c`), a fragment's `expire` (`0x256e4`), `release-held`
 *   (message 0x40, `0x24424`) and `hand-off` (message 0x2000000, `0x2574c`);
 * - the `delayed-player-explosion` stage (`0x23808`).
 * rules/explosions.ts and rules/fragments.ts hold the arithmetic. Core makes no EXPL choice, extra explosion, event 0x10,
 * discriminator-1/2 fragment or flash (CR-11), so the draws Core takes here are the fragments' only.
 *
 * Timing (X9, CR-08), from a destruction in tick N outside object update: the explosion and the fragments are new; at
 * N+1 their first callbacks run, the explosion activates in request handling (`explosion-started`) and the fragments
 * set their expiries and become active; at N+2 part 0 hands its source off, which becomes pending removal and leaves at
 * N+3. A held source (a missile, a fragment, a craft without parts) becomes pending removal when the animation is over,
 * 28 ticks after the activation with 12 frames and 14 with 6; the explosion asks for removal 49 ticks after it. Objects
 * made during object update are visited in the same walk, so they start one tick earlier.
 */
import { EXPLOSION_CONSTRUCTION_STAGES, type ExplosionConstructionStage, type PipelineStageName } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { activateExplosion, explosionFrameCount, explosionInit, explosionUpdate, playerExplosionDue } from '../rules/explosions.ts';
import { expiryOutcome, firstExpiry, fragmentInit, isExpiryDue, SPENT_EXPIRY } from '../rules/fragments.ts';
import { RandStream } from '../rules/original-random.ts';
import { PLAYER_KIND_BIT } from '../rules/spawn-schedule.ts';
import type { Entity, ExplosionCombat, FragmentCombat } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { passesTeardownGate } from './mission-teardown.ts';
import { emit, type PipelineStage, type RequestOf, type TickContext } from './pipeline.ts';
import { resolvePlayerLoss } from './rescue.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `destruction.${site}`);

/**
 * The producer `0x24d78(source, 3)` (X6): one discriminator-3 fragment per part of list 1 of the source's model, in part
 * order, each allocated as it is made; the player's pod becomes the followed entity (+0x90). False, with nothing made,
 * when the model has no such part. In main state 1, the teardown, the gate `0x339cc` drops every fragment's message 0x10,
 * so nothing is made or drawn, but the source still counts as shed (ME-11).
 */
function shedFragments(world: WorldState, source: Entity): boolean {
  const kind = world.ruleData.craft[source.kindBit];
  if (kind === null || kind === undefined || source.presentation.type !== 'model') throw fault('source');
  if (kind.parts <= 0) return false;
  if (!passesTeardownGate(world.flow)) return true;
  const rand = new RandStream(world.rngState);
  for (let part = 0; part < kind.parts; part++) {
    const init = fragmentInit(source, source.presentation.model, kind.debris, part, rand);
    if (init === null) continue;
    const fragment = world.entities.allocate(init);
    if (source.kindBit === PLAYER_KIND_BIT && part === 0) world.player.followedEntity = fragment.id;
  }
  world.rngState = rand.state;
  return true;
}

function explosionOf(entity: Entity): ExplosionCombat {
  if (entity.combat.type !== 'explosion') throw fault('explosion');
  return entity.combat;
}

const isConstructionStage = (stage: PipelineStageName): stage is ExplosionConstructionStage =>
  (EXPLOSION_CONSTRUCTION_STAGES as readonly PipelineStageName[]).includes(stage);

/** `explosion-created` for `explosion` just built from `source` (FS-03): the construction position and the drift velocity. */
function emitExplosionCreated(context: TickContext, explosion: Entity, source: Entity): void {
  const combat = explosionOf(explosion);
  const { stage } = context;
  if (!isConstructionStage(stage)) throw fault('construction-stage');
  const { movement } = explosion;
  if (movement?.mode !== 'linear') throw fault('explosion-movement');
  emit(context, {
    type: 'explosion-created',
    tick: context.time.tick,
    entityId: explosion.id,
    sourceEntityId: source.id,
    sourceKindBit: combat.sourceKindBit,
    variant: combat.variant,
    stage,
    position: explosion.position,
    velocity: movement.velocity,
  });
}

/**
 * `0x23ac8` on `source` (X2), a direct call without a request. Nothing for a source that was removed or has no movement
 * block. For the player (kind 1) it only arms the delay at the clock + 0xC0 and builds nothing, while the delay is
 * unset or not yet past; the `delayed-player-explosion` stage calls it again once the clock is past it, which clears
 * the delay and builds. Otherwise, in order: the explosion is allocated; the source becomes a destroyed source (still
 * moved, no longer updated); `explosion-created` (FS-03); a craft sheds its fragments; the explosion holds a source that
 * is no craft or shed none.
 */
export function constructExplosion(context: TickContext, source: Entity): void {
  const { world } = context;
  if (world.entities.get(source.id) !== source || source.movement === null) return;
  if (source.kindBit === PLAYER_KIND_BIT) {
    const due = world.player.delayedExplosionClock;
    if (due === null) world.player.delayedExplosionClock = playerExplosionDue(world.clock);
    if (due === null || due > world.clock) return;
    world.player.delayedExplosionClock = null;
  }
  const explosion = world.entities.allocate(explosionInit(source));
  source.state = 'destroyed-source';
  emitExplosionCreated(context, explosion, source);
  if (source.combat.type !== 'craft' || !shedFragments(world, source)) explosionOf(explosion).heldSource = source.id;
}

/**
 * The destruction entry damage.ts calls for a destroyed victim that is not parked, after its `object-destroyed` (X1):
 * the player's delayed explosion, any other craft's explosion.
 */
export function destroyEntity(context: TickContext, entity: Entity): void {
  constructExplosion(context, entity);
}

/**
 * `0x23838`, an explosion's own update: at its first callback and in state 7 it asks for state 7 (activation, then an
 * update every tick); pending removal posts `release-held` on the source it still holds, then its removal. Main
 * explosions never wait: the extras' delays are the presentation layer's.
 */
export function updateExplosion(context: TickContext, entity: Entity, explosion: ExplosionCombat): void {
  const { world, requests } = context;
  switch (entity.state) {
    case 'new':
      throw fault('explosion-state');
    case 'presentation-ready':
    case 'active':
      requests.post({ type: 'set-state', entityId: entity.id, state: 'active' });
      return;
    case 'pending-removal':
      if (explosion.heldSource !== null && world.entities.get(explosion.heldSource) !== undefined) {
        requests.post({ type: 'release-held', entityId: explosion.heldSource });
      }
      explosion.heldSource = null;
      requests.post({ type: 'leave', entityId: entity.id });
      return;
    default:
      return;
  }
}

/**
 * `0x24ac4`, a fragment's own update (X7): its first callback sets the expiry (at most one draw) and asks for state 7;
 * in state 7, part 0 first posts the hand-off of its source and lets it go, then a due expiry is posted once; pending
 * removal posts its removal.
 */
export function updateFragment(context: TickContext, entity: Entity, fragment: FragmentCombat): void {
  const { world, requests } = context;
  switch (entity.state) {
    case 'new':
      throw fault('fragment-state');
    case 'presentation-ready': {
      const rand = new RandStream(world.rngState);
      fragment.expiry = firstExpiry(fragment, world.clock, rand);
      world.rngState = rand.state;
      requests.post({ type: 'set-state', entityId: entity.id, state: 'active' });
      return;
    }
    case 'active':
      if (fragment.handOff !== null) {
        requests.post({ type: 'hand-off', entityId: fragment.handOff, fragment: entity.id });
        fragment.handOff = null;
      }
      if (isExpiryDue(fragment.expiry, world.clock)) {
        requests.post({ type: 'expire', entityId: entity.id });
        fragment.expiry = SPENT_EXPIRY;
      }
      return;
    case 'pending-removal':
      requests.post({ type: 'leave', entityId: entity.id });
      return;
    default:
      return;
  }
}

/**
 * `0x2409c`, a `set-state` request for an explosion (X4): one asking for state 7 while it is not in state 7 activates
 * it (t₀ and the removal time) and emits `explosion-started` at its position, before it ever moved. Any later one is an
 * update: once the animation is over and the clock past the removal time, it becomes pending removal; otherwise it
 * stays in state 7, and once the animation is over the source it holds becomes pending removal and is let go.
 */
export function setExplosionState(context: TickContext, entity: Entity, explosion: ExplosionCombat, request: RequestOf<'set-state'>): void {
  const { world } = context;
  if (entity.state !== 'active' && request.state === 'active') {
    entity.state = 'active';
    activateExplosion(explosion, world.clock);
    emit(context, {
      type: 'explosion-started',
      tick: context.time.tick,
      entityId: entity.id,
      sourceEntityId: explosion.source,
      sourceKindBit: explosion.sourceKindBit,
      variant: explosion.variant,
      position: entity.position,
      activationClock: world.clock,
    });
    return;
  }
  const update = explosionUpdate(explosion, world.clock, explosionFrameCount(world.ruleData.explosionFrames, explosion.variant));
  if (update === 'remove') {
    entity.state = 'pending-removal';
    return;
  }
  entity.state = 'active';
  if (update === 'over' && explosion.heldSource !== null) {
    const held = world.entities.get(explosion.heldSource);
    if (held !== undefined) held.state = 'pending-removal';
    explosion.heldSource = null;
  }
}

/**
 * `0x256e4`, a fragment's expiry (X7), after `fragment-expired`: a flagged fragment becomes the held source of its own
 * explosion; the player's pod ends the follow (+0x90) and the destruction's loss handling `0x32e14(1)` (rescue.ts,
 * CR-13), then leaves as any other fragment does (`0x2574c`: pending removal).
 */
export function expireFragment(context: TickContext, entity: Entity, fragment: FragmentCombat, _request: RequestOf<'expire'>): void {
  const outcome = expiryOutcome(fragment);
  emit(context, {
    type: 'fragment-expired',
    tick: context.time.tick,
    entityId: entity.id,
    sourceKindBit: fragment.sourceKindBit,
    part: fragment.part,
    position: entity.position,
    outcome,
  });
  if (outcome === 'explodes') {
    constructExplosion(context, entity);
    return;
  }
  if (outcome === 'escape-pod') {
    context.world.player.followedEntity = null;
    resolvePlayerLoss(context, 'destroyed');
  }
  entity.state = 'pending-removal';
}

/** Message 0x40 (`0x24424`): an explosion lets go of the source it held, which becomes pending removal (X4). */
export function releaseHeld(_context: TickContext, entity: Entity, _request: RequestOf<'release-held'>): void {
  entity.state = 'pending-removal';
}

/**
 * Message 0x2000000 (`0x2574c`) on the source part 0 held (X7): the source becomes pending removal, except the player,
 * which stays a destroyed source and whose model is hidden (FS-02); then `source-released`.
 */
export function handOff(context: TickContext, source: Entity, request: RequestOf<'hand-off'>): void {
  const removed = source.kindBit !== PLAYER_KIND_BIT;
  if (removed) source.state = 'pending-removal';
  else context.world.player.modelShown = false;
  emit(context, { type: 'source-released', tick: context.time.tick, entityId: source.id, kindBit: source.kindBit, fragmentEntityId: request.fragment, removed });
}

/**
 * The `delayed-player-explosion` stage (`0x23808`, X2), after movement and collisions: once the clock is strictly past
 * the delay and the player has an entity, the player's explosion.
 */
function explodePlayerWhenDue(context: TickContext): void {
  const { world } = context;
  const due = world.player.delayedExplosionClock;
  if (due === null || world.clock <= due || world.player.entityId === null) return;
  const player = world.entities.get(world.player.entityId);
  if (player === undefined) throw fault('player');
  constructExplosion(context, player);
}

/** The `delayed-player-explosion` stage's run. */
export const delayedPlayerExplosionStage: PipelineStage['run'] = explodePlayerWhenDue;
