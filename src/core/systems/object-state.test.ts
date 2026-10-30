import { describe, expect, it } from 'vitest';
import { readTickInput } from '../contracts/tick-input.ts';
import type { Activity, Entity } from '../world/entity-table.ts';
import { entityInit, testState, tickInput, withEveryKindBound } from '../world/world.test-support.ts';
import { retire } from './object-state.ts';
import { registerTick } from './pipeline.ts';

// docs/plan/p3/02/spec.md, FA-07: the shared writer of the two retirement states and its `object-retired`.

function scene() {
  const state = withEveryKindBound(testState());
  const context = registerTick(state, readTickInput(tickInput()));
  const add = (kindBit: number, activity: Activity = 'active'): Entity => {
    const entity = state.entities.allocate(entityInit(kindBit, { activity: activity === 'docked' ? 'active' : activity }));
    entity.activity = activity;
    entity.state = 'active';
    return entity;
  };
  return { state, context, add };
}

describe('retire (FA-07)', () => {
  it('emits one event for an active entity entering each state, the area switch then the pending removal included', () => {
    const { context, add } = scene();
    const craft = add(7);
    retire(context, craft, 'area-switch');
    retire(context, craft, 'area-switch');
    retire(context, craft, 'pending-removal');
    retire(context, craft, 'pending-removal');
    expect(context.events).toEqual([
      { type: 'object-retired', tick: context.time.tick, entityId: craft.id, kindBit: 7, state: 'area-switch' },
      { type: 'object-retired', tick: context.time.tick, entityId: craft.id, kindBit: 7, state: 'pending-removal' },
    ]);
    expect(craft.state).toBe('pending-removal');
  });

  it('writes the state of a parked or docked entity without an event', () => {
    const { context, add } = scene();
    const parked = add(7, 'parked');
    const docked = add(2, 'docked');
    retire(context, parked, 'area-switch');
    retire(context, docked, 'pending-removal');
    expect([parked.state, docked.state, context.events]).toEqual(['area-switch', 'pending-removal', []]);
  });

  it('emits for every kind, those whose sounds the consumer skips (0x3300000) included, from any other state', () => {
    const { context, add } = scene();
    const entities = [20, 21, 24, 25, 22].map((kindBit) => add(kindBit));
    entities[4].state = 'destroyed-source';
    for (const entity of entities) retire(context, entity, 'pending-removal');
    expect(context.events.map((event) => (event.type === 'object-retired' ? [event.entityId, event.kindBit] : null)))
      .toEqual(entities.map(({ id, kindBit }) => [id, kindBit]));
    expect(Object.isFrozen(context.events[0])).toBe(true);
  });
});
