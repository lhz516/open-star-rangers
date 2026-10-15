import { describe, expect, it } from 'vitest';
import { readTickInput } from '../contracts/tick-input.ts';
import { installedController } from '../rules/ai-selection.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, worldInput, type WorldInputParts } from '../world/create-world.test-support.ts';
import { ALL_KINDS, type Activity, type Entity, type ObjectState, type TableController } from '../world/entity-table.ts';
import { constructWorld, type World } from '../world/world.ts';
import { thrownBy, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { controllerCall, installedHandler, updateController } from './ai.ts';
import { registerTick } from './pipeline.ts';

// The controller part of `0x20c18` (docs/plan/p3/02/spec.md, CR-23; docs/original/formats/ai.md §1). Expectations
// follow ai §1's callback table: states 0–3 install after the Warp-transit test, 4 nothing, 5 and 6 remove, 7 step; the
// parked handler while parked, otherwise the record's. No handler is wired yet (P3-08/15's handoff): their subtasks
// cover the install's update body and its draws.

function setUp(parts: WorldInputParts = { run: { wingman: 0 } }): { readonly state: WorldState; readonly world: World } {
  const state = initialWorldState(asCreateInput(worldInput(parts)));
  return { state, world: constructWorld(state) };
}

const entities = (state: WorldState): Entity[] => [...state.entities.walk(ALL_KINDS)];
const firstOf = (state: WorldState, kindBit: number): Entity => entities(state).find((entity) => entity.kindBit === kindBit)!;

/** A copy of `entity` in `state` with `activity`, as controllerCall reads it. */
const as = (entity: Entity, state: ObjectState, activity: Activity = entity.activity): Entity => ({ ...entity, state, activity });

/** `entity` with its selected program's controller installed for `handler` (the common part only; a valid slot). */
function installed(world: WorldState, entity: Entity, handler: 'parked' | 'interpreter'): Entity {
  const { program } = entity.ai;
  if (program.type !== 'table') throw new Error('a table program');
  const common = installedController(world.ruleData.ai.tablePrograms[program.record], world.craftInfo.content.craft[entity.kindBit]);
  const controller = (handler === 'parked'
    ? { ...common, handler }
    : { ...common, handler, interpreter: { state: 0, execution: null, lastRunEnded: false, steadyClock: 0, stateDeadline: 0, state4Deadline: 0 } }) as TableController;
  return { ...entity, ai: { ...entity.ai, program: { ...program, controller } } };
}

describe('the call `0x20c18` makes by state and activity (AC-03)', () => {
  const { state, world } = setUp();
  world.step(tickInput());
  const handlers = state.ruleData.ai.builtInHandlers;
  const craft = firstOf(state, 7);
  const wingman = firstOf(state, 1);
  const base = firstOf(state, 17);

  it('selects at instantiation without installing: the slot holds the record and no controller', () => {
    expect(craft.ai.program).toEqual({ type: 'table', record: 0, controller: null });
    expect(wingman.ai.program).toEqual({ type: 'built-in', record: 3, controller: null });
    expect(base.ai.program).toEqual({ type: 'built-in', record: 4, controller: null });
    for (const kindBit of [0, 14]) expect(firstOf(state, kindBit).ai.program).toEqual({ type: 'none' });
  });

  it('installs in states 0–3: the parked handler while parked, otherwise the interpreter or the built-in record\'s handler', () => {
    for (const objectState of ['new', 'presentation-ready', 'awaiting-presentation'] as const) {
      expect(controllerCall(as(craft, objectState, 'parked'), handlers)).toEqual({ call: 'install', handler: 'parked' });
      expect(controllerCall(as(craft, objectState, 'active'), handlers)).toEqual({ call: 'install', handler: 'interpreter' });
      expect(controllerCall(as(craft, objectState, 'docked'), handlers)).toEqual({ call: 'install', handler: 'interpreter' });
      expect(controllerCall(as(wingman, objectState, 'active'), handlers)).toEqual({ call: 'install', handler: 'wingman' });
      expect(controllerCall(as(base, objectState, 'active'), handlers)).toEqual({ call: 'install', handler: 'base' });
      expect(controllerCall(as(base, objectState, 'parked'), handlers)).toEqual({ call: 'install', handler: 'parked' });
    }
  });

  it('does nothing without a controller outside states 0–3, and never for an object without a program', () => {
    for (const objectState of ['destroyed-source', 'area-switch', 'pending-removal', 'active', 'projectile-hit'] as const) {
      expect(controllerCall(as(craft, objectState), handlers)).toBeNull();
    }
    for (const objectState of ['new', 'area-switch', 'active'] as const) expect(controllerCall(as(firstOf(state, 0), objectState), handlers)).toBeNull();
  });

  it('with a controller: none again in states 0–3, removal in 5 and 6 through the installing handler, the step in 7, nothing in 4 and 8', () => {
    for (const handler of ['parked', 'interpreter'] as const) {
      const holder = installed(state, craft, handler);
      for (const objectState of ['new', 'presentation-ready', 'awaiting-presentation', 'destroyed-source', 'projectile-hit'] as const) {
        expect(controllerCall(as(holder, objectState), handlers)).toBeNull();
      }
      // The removal follows the installing handler whatever the activity now is (install and removal share the dispatch).
      expect(controllerCall(as(holder, 'area-switch', 'active'), handlers)).toEqual({ call: 'remove', handler });
      expect(controllerCall(as(holder, 'pending-removal', 'parked'), handlers)).toEqual({ call: 'remove', handler });
      expect(controllerCall(as(holder, 'active'), handlers)).toEqual({ call: 'step', handler });
    }
  });

  it('faults when a selected built-in record has no handler, which world creation rules out', () => {
    expect(installedHandler({ type: 'built-in', record: 3, controller: null }, 'active', handlers)).toBe('wingman');
    expect(installedHandler({ type: 'built-in', record: 3, controller: null }, 'parked', handlers)).toBe('parked');
    expect(thrownBy(() => installedHandler({ type: 'built-in', record: 0, controller: null }, 'active', handlers))).toMatchObject({ site: 'ai.handler' });
  });
});

describe('the controller part while no handler is wired (P3-08/15; CR-23)', () => {
  it('leaves an install undone: no controller, no draw, no event, no request, and the slot keeps its record', () => {
    const { state, world } = setUp();
    world.step(tickInput());
    const context = registerTick(state, readTickInput(tickInput()));
    const before = state.rngState;
    for (const entity of entities(state)) {
      const program = entity.ai.program;
      updateController(context, entity);
      expect(entity.ai.program).toBe(program);
    }
    expect(state.rngState).toBe(before);
    expect(context.events).toEqual([]);
  });

  it('never reselects: over parking, resuming and removal every object keeps the record instantiation selected', () => {
    const { state, world } = setUp();
    world.step(tickInput());
    const selected = new Map(entities(state).map((entity) => [entity.id, entity.ai.program]));
    const craft = firstOf(state, 7);
    const activities: Activity[] = [];
    for (let tick = 0; tick < 40; tick++) {
      // Toggle the craft's parking every few ticks through the area-switch state (message 0x20).
      if (tick % 8 === 0 && craft.state === 'active') craft.state = 'area-switch';
      world.step(tickInput());
      if (activities.at(-1) !== craft.activity) activities.push(craft.activity);
      for (const entity of entities(state)) expect(entity.ai.program, `${entity.id}`).toEqual(selected.get(entity.id));
    }
    expect(activities.length).toBeGreaterThan(3);
  });

  it('faults rather than skip a step or removal of a controller whose handler is not wired, or a step through the wrong dispatch', () => {
    const { state, world } = setUp();
    world.step(tickInput());
    const context = registerTick(state, readTickInput(tickInput()));
    const craft = firstOf(state, 7);
    const parked = installed(state, craft, 'parked');
    const step = { ...parked, state: 'active' as const, activity: 'parked' as const };
    expect(thrownBy(() => updateController(context, step))).toMatchObject({ code: 'invariant-violated', site: 'ai.unwired' });
    expect(thrownBy(() => updateController(context, { ...parked, state: 'area-switch' }))).toMatchObject({ site: 'ai.unwired' });
    expect(thrownBy(() => updateController(context, { ...step, activity: 'active' }))).toMatchObject({ site: 'ai.dispatch' });
  });
});
