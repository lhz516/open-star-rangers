/**
 * Missiles (docs/plan/p3/02/spec.md, CR-05, CR-07; P3-07 subtask 20 implements their rules): the kind 20 callback
 * (`0x2aa40`/`0x2ab00`), the `steer` request (message 0x40000) and a missile's `expire` request (`0x2b408`). Until
 * subtask 20, the callback keeps to the generic lifecycle update and nothing posts the requests.
 */
import { CoreFaultError } from '../errors.ts';
import type { Entity, MissileCombat } from '../world/entity-table.ts';
import { updateLifecycle, type RequestOf, type TickContext } from './pipeline.ts';

/** A missile's own update. */
export function updateMissile(context: TickContext, entity: Entity, _missile: MissileCombat): void {
  updateLifecycle(context, entity);
}

/** Applies a control block through P3-06's `0x21fd8` in request handling (H5); no rule posts the request yet. */
export function applySteer(_context: TickContext, _entity: Entity, _request: RequestOf<'steer'>): void {
  throw new CoreFaultError('invariant-violated', 'missiles.steer');
}

/** A missile's expiry: detonation or fizzling (H5); no rule posts the request yet. */
export function expireMissile(_context: TickContext, _entity: Entity, _missile: MissileCombat, _request: RequestOf<'expire'>): void {
  throw new CoreFaultError('invariant-violated', 'missiles.expire');
}
