/**
 * Destruction (docs/plan/p3/02/spec.md, CR-05, CR-07, CR-08; P3-07 subtask 18 implements its rules): the explosion
 * (kind 22, `0x23838`) and fragment (kind 24, `0x24ac4`) callbacks, an explosion's state requests (`0x2409c`), a
 * fragment's `expire` request (`0x256e4`), the `release-held` (message 0x40) and `hand-off` (message 0x2000000)
 * requests, and the run of the `delayed-player-explosion` stage (`0x23808`). Until subtask 18, the callbacks and state
 * requests keep to the generic lifecycle, nothing posts the other requests, and the stage has no run.
 */
import { CoreFaultError } from '../errors.ts';
import type { Entity, ExplosionCombat, FragmentCombat } from '../world/entity-table.ts';
import { updateLifecycle, type PipelineStage, type RequestOf, type TickContext } from './pipeline.ts';

/** An explosion's own update. */
export function updateExplosion(context: TickContext, entity: Entity, _explosion: ExplosionCombat): void {
  updateLifecycle(context, entity);
}

/** A fragment's own update. */
export function updateFragment(context: TickContext, entity: Entity, _fragment: FragmentCombat): void {
  updateLifecycle(context, entity);
}

/** A `set-state` request for an explosion: its activation and later states (X4). */
export function setExplosionState(_context: TickContext, entity: Entity, _explosion: ExplosionCombat, request: RequestOf<'set-state'>): void {
  entity.state = request.state;
}

/** A fragment's expiry (X7); no rule posts the request yet. */
export function expireFragment(_context: TickContext, _entity: Entity, _fragment: FragmentCombat, _request: RequestOf<'expire'>): void {
  throw new CoreFaultError('invariant-violated', 'destruction.expire');
}

/** An explosion releases the source it holds (X4); no rule posts the request yet. */
export function releaseHeld(_context: TickContext, _entity: Entity, _request: RequestOf<'release-held'>): void {
  throw new CoreFaultError('invariant-violated', 'destruction.release-held');
}

/** A part-0 fragment hands its source off (X7); no rule posts the request yet. */
export function handOff(_context: TickContext, _source: Entity, _request: RequestOf<'hand-off'>): void {
  throw new CoreFaultError('invariant-violated', 'destruction.hand-off');
}

/** The `delayed-player-explosion` stage's run (X2). */
export const delayedPlayerExplosionStage: PipelineStage['run'] = null;
