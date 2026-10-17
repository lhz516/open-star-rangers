/**
 * The shared writer of the two retirement states (docs/plan/p3/02/spec.md, FA-07): every rule that makes an entity
 * pending removal or puts it in the area switch writes the state here, so that an active entity entering either from
 * another state emits `object-retired` at the write, with the tick and its place among the tick's events. It stands for
 * the original's removal item, which `0x21650`, the area check and the dispatcher branch `0x214cb` post for objects of
 * activity 1. Parked and docked entities emit nothing, nor does a rewrite of the state an entity is already in; an
 * active entity in the area switch that then becomes pending removal emits a second one. Every kind emits: the
 * exception of kinds `0x3300000` belongs to the sound consumer (A-02).
 */
import type { RetiredState } from '../contracts/domain-events.ts';
import type { Entity, ObjectState } from '../world/entity-table.ts';
import { emit, type TickContext } from './pipeline.ts';

/** Whether `state` is one of the two retirement states, which only `retire` writes. */
export const isRetiredState = (state: ObjectState): state is RetiredState => state === 'pending-removal' || state === 'area-switch';

/** Writes `state` on `entity` and emits `object-retired` as the module comment says. */
export function retire(context: TickContext, entity: Entity, state: RetiredState): void {
  const previous = entity.state;
  entity.state = state;
  if (previous === state || entity.activity !== 'active') return;
  emit(context, { type: 'object-retired', tick: context.time.tick, entityId: entity.id, kindBit: entity.kindBit, state });
}
