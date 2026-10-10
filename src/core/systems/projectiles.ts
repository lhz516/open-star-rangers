/**
 * Projectiles (docs/plan/p3/02/spec.md, CR-05, CR-07; P3-07 subtask 17 implements their rules): the kind 21 callback
 * (`0x259b0`) and a projectile's `expire` request (`0x25f48`). Until subtask 17, the callback keeps to the generic
 * lifecycle update and nothing posts the request.
 */
import { CoreFaultError } from '../errors.ts';
import type { Entity, ProjectileCombat } from '../world/entity-table.ts';
import { updateLifecycle, type RequestOf, type TickContext } from './pipeline.ts';

/** A projectile's own update. */
export function updateProjectile(context: TickContext, entity: Entity, _projectile: ProjectileCombat): void {
  updateLifecycle(context, entity);
}

/** A projectile's expiry (H2); no rule posts the request yet. */
export function expireProjectile(_context: TickContext, _entity: Entity, _projectile: ProjectileCombat, _request: RequestOf<'expire'>): void {
  throw new CoreFaultError('invariant-violated', 'projectiles.expire');
}
