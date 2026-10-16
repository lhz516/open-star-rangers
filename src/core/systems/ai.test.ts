import { describe, expect, it } from 'vitest';
import { mount } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import { enableAiLock, pressChannel } from '../rules/ai-firing.ts';
import { installedController } from '../rules/ai-selection.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { randValues, rngStateAfter } from '../rules/rand.test-support.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, craftInfoContent, worldInput, type WorldInputParts } from '../world/create-world.test-support.ts';
import { ALL_KINDS, type Activity, type AiController, type Entity, type ObjectState, type TableController } from '../world/entity-table.ts';
import { constructWorld, type World } from '../world/world.ts';
import { thrownBy, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { controllerCall, installedHandler, updateController } from './ai.ts';
import { registerTick, type Request, type TickContext } from './pipeline.ts';

// The controller part of `0x20c18` (docs/plan/p3/02/spec.md, CR-23; docs/original/formats/ai.md §1). Expectations
// follow ai §1's callback table: states 0–3 install after the Warp-transit test, 4 nothing, 5 and 6 remove, 7 step; the
// parked handler while parked, otherwise the record's. Each handler's subtask covers its install's update body and draws
// (P3-08/15's handoff): the base's are below (P3-08/18); the interpreter, wingman and parked handler are not wired yet.

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

describe('the controller part while a handler is not wired (P3-08/15; CR-23)', () => {
  it('leaves the install of an unwired handler undone: no controller, no draw, no event, no request, and the slot keeps its record', () => {
    const { state, world } = setUp();
    world.step(tickInput());
    const context = registerTick(state, readTickInput(tickInput()));
    const before = state.rngState;
    // The base (kind 17) is wired (P3-08/18).
    for (const entity of entities(state).filter(({ kindBit }) => kindBit !== 17)) {
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
    const recordOf = ({ ai: { program } }: Entity) => (program.type === 'none' ? program : { type: program.type, record: program.record });
    const selected = new Map(entities(state).map((entity) => [entity.id, recordOf(entity)]));
    const craft = firstOf(state, 7);
    const activities: Activity[] = [];
    for (let tick = 0; tick < 40; tick++) {
      // Toggle the craft's parking every few ticks through the area-switch state (message 0x20).
      if (tick % 8 === 0 && craft.state === 'active') craft.state = 'area-switch';
      world.step(tickInput());
      if (activities.at(-1) !== craft.activity) activities.push(craft.activity);
      for (const entity of entities(state)) expect(recordOf(entity), `${entity.id}`).toEqual(selected.get(entity.id));
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

describe('the base 0x62c10 and the AI step 0x5dcd4 (P3-08/18; AC-03, AC-06; A12–A14)', () => {
  /**
   * The synthetic content with an armed base (kind 17): mounts 0 and 1 automatic (gun 0: burst 3), 2 fixed (gun 1, list
   * 0) and 3 a guided missile (missile 0: two rounds, list 1); every arc open, every gun of range 5000, the missile of
   * range 1000 and stage time 8. The base's record has period 70.
   */
  function armedContent() {
    const info = craftInfoContent();
    Object.assign(info.guns[0], { at08: 100, at24: 3200, at2C: 3 });
    Object.assign(info.guns[1], { at08: 100, at24: 3200 });
    Object.assign(info.missiles[0], { at18: 1, at34: 8, at44: 16_000 });
    const automatic = () => mount({ weapon: 0, at20: 0, at24: [0, 0, 0], at34: 0 });
    info.craft[17].mounts = [automatic(), automatic(), mount({ weapon: 1, at20: 0, at34: 0 }), mount({ at10: 1, weapon: 0, at0C: 2, at20: 0 })];
    info.craft[17].mountLists = [[2], [3], []];
    return info;
  }

  /** The armed world after its first step: every object instantiated, none updated yet. */
  function armedWorld(): { readonly state: WorldState; readonly world: World } {
    const parts = setUp({ run: { wingman: 0 }, craftInfo: armedContent() });
    parts.world.step(tickInput());
    return parts;
  }

  /** A registered tick whose clock stage has run, and the requests its updates post, in order. */
  function tickOf(state: WorldState): { readonly context: TickContext; readonly posted: () => Request[] } {
    const context = registerTick(state, readTickInput(tickInput()));
    state.clock = context.time.clock;
    return {
      context,
      posted: () => {
        const requests: Request[] = [];
        context.requests.handle((request) => void requests.push(request));
        return requests;
      },
    };
  }

  const controllerOf = (entity: Entity): AiController => {
    const { program } = entity.ai;
    if (program.type === 'none' || program.controller === null) throw new Error('an installed controller');
    return program.controller;
  };

  /** Steps until the base is active with its controller installed. */
  function activeBase(state: WorldState, world: World): CraftEntity {
    const base = firstOf(state, 17) as CraftEntity;
    while (base.state !== 'active') world.step(tickInput());
    controllerOf(base);
    return base;
  }

  const shotsBy = (events: readonly DomainEvent[], shooter: Entity) =>
    events.flatMap((event) => (event.type === 'shot-fired' && event.shooterEntityId === shooter.id ? [event] : []));

  it('installs in the first callback and runs the update body with its draws in the same call: one draw per idle automatic mount', () => {
    const { state } = armedWorld();
    const base = firstOf(state, 17) as CraftEntity;
    const [first, second] = entities(state).filter(({ kindBit }) => kindBit === 7);
    expect(base.ai.program).toEqual({ type: 'built-in', record: 4, controller: null });
    const { context, posted } = tickOf(state);
    const before = state.rngState;
    updateController(context, base);
    expect(state.rngState).toEqual(rngStateAfter(before, 2));
    expect(controllerOf(base)).toMatchObject({ handler: 'base', automaticMounts: true, nextUpdateClock: context.time.clock + 70, base: { targetMask: 0x93780 } });
    // Each choice passes over the target the previous automatic mount holds: mount 0 then takes the first enemy in the
    // walk (mount 1 holds the second), mount 1 the second.
    expect(base.combat.weapons.mounts.map(({ autoTarget, retargetClock, burst }) => ({ autoTarget, retargetClock, burst }))).toEqual([
      { autoTarget: first.id, retargetClock: 0x140, burst: 3 },
      { autoTarget: second.id, retargetClock: 0x140, burst: 3 },
      { autoTarget: null, retargetClock: 0, burst: 0 },
      { autoTarget: null, retargetClock: 0, burst: 0 },
    ]);
    expect(posted()).toMatchObject([{ type: 'steer', entityId: base.id, control: { axes: [{ set: false }, { set: true, value: 1 }, { set: false }] } }]);
    expect(context.events).toEqual([]);
  });

  it('removes without a draw and installs again with its draws after parking and resuming, never reselecting', () => {
    const { state } = armedWorld();
    const base = firstOf(state, 17) as CraftEntity;
    updateController(tickOf(state).context, base);
    base.state = 'area-switch';
    let before = state.rngState;
    updateController(tickOf(state).context, base);
    expect(base.ai.program).toEqual({ type: 'built-in', record: 4, controller: null });
    // Parked, the install goes to the parked handler, which is not wired yet (P3-08/21).
    base.activity = 'parked';
    base.state = 'new';
    updateController(tickOf(state).context, base);
    expect(base.ai.program).toEqual({ type: 'built-in', record: 4, controller: null });
    expect(state.rngState).toEqual(before);
    // Resumed with the bursts fired off: the install draws once per idle mount again.
    base.activity = 'active';
    for (const mount of base.combat.weapons.mounts) mount.burst = 0;
    before = state.rngState;
    updateController(tickOf(state).context, base);
    expect(state.rngState).toEqual(rngStateAfter(before, 2));
    expect(base.ai.program).toMatchObject({ type: 'built-in', record: 4, controller: { handler: 'base' } });
  });

  it('fires the loaded bursts through the stages from the AI step after the install, as automatic shots without a command result', () => {
    const { state, world } = armedWorld();
    const base = activeBase(state, world);
    const controller = controllerOf(base);
    // A step fires each loaded mount once its cooldown (gun +0x14 = 7) has passed: every fourth tick of 2 units, three
    // times. The next due update reloads, and the reload fires from the step after it.
    let reloadStep: number | null = null;
    const firing: string[] = [];
    for (let step = 0; step < 48; step++) {
      if (reloadStep === null && state.clock + 2 > controller.nextUpdateClock) reloadStep = step;
      const events = world.step(tickInput());
      expect(events.some((event) => event.type === 'command-result')).toBe(false);
      for (const { trigger, family, mount } of shotsBy(events, base)) firing.push(`${step} ${trigger.type} ${family} ${mount}`);
    }
    expect(reloadStep).not.toBeNull();
    const fired = (step: number) => [`${step} automatic gun 0`, `${step} automatic gun 1`];
    expect(firing).toEqual([0, 4, 8, reloadStep! + 1, reloadStep! + 5, reloadStep! + 9].filter((step) => step < 48).flatMap(fired));
  });

  it('fires a handler\'s press in the next AI step, before the automatic mounts, at the object target; hold 0 fires once', () => {
    const { state, world } = armedWorld();
    const base = activeBase(state, world);
    const controller = controllerOf(base);
    const target = entities(state).find(({ kindBit }) => kindBit === 7)!;
    const { mounts } = base.combat.weapons;
    base.ai.objectTarget = target.id;
    pressChannel(controller, 0, 0, state.clock);
    // Mount 0 is damaged: one draw decides whether it fires (W9), then the shots draw 5 each (direction and jitter).
    mounts[0].damage = 1;
    const { context, posted } = tickOf(state);
    const before = state.rngState;
    const [roll] = randValues(before, 1);
    const damagedFires = (roll & 0xff) < 0x80;
    updateController(context, base);
    expect(state.rngState).toEqual(rngStateAfter(before, 1 + (damagedFires ? 5 : 0) + 5));
    expect(posted()).toMatchObject([
      { type: 'launch', family: 'gun', shooter: base.id, mount: 2, trigger: { type: 'ai', channel: 0 } },
      ...(damagedFires ? [{ type: 'launch', mount: 0, trigger: { type: 'automatic' } }] : []),
      { type: 'launch', mount: 1, trigger: { type: 'automatic' } },
    ]);
    expect(controller.triggers[0].pressed).toBe(false);
    for (const mount of mounts) mount.burst = 0;
    const again = tickOf(state);
    updateController(again.context, base);
    expect(again.posted()).toEqual([]);
  });

  it('updates the AI lock only when the handler is due, and launches a guided missile with level 4 that takes the homing rules', () => {
    const { state, world } = armedWorld();
    const base = activeBase(state, world);
    const controller = controllerOf(base);
    const { lock } = base.combat.weapons;
    // The base never turns the AI lock on or presses; here it stands in for a wingman, which does both (WA2, WA9).
    controller.automaticMounts = false;
    base.ai.objectTarget = entities(state).find(({ kindBit }) => kindBit === 7)!.id;
    enableAiLock(controller, base as CraftEntity);
    controller.steering.distance = 100;
    const levels: number[] = [];
    while (!controller.missileReady) {
      const due = state.clock + 2 > controller.nextUpdateClock;
      const nextLockUpdate = lock.nextUpdateClock;
      world.step(tickInput());
      expect(lock.nextUpdateClock !== nextLockUpdate, `clock ${state.clock}`).toBe(due);
      if (due) levels.push(lock.level);
      expect(controller.missileReady).toBe(lock.level === 4);
      expect(levels.length).toBeLessThan(5);
    }
    expect(levels).toEqual([2, 3, 4]);
    pressChannel(controller, 1, -1, state.clock);
    const events = world.step(tickInput());
    const [shot] = shotsBy(events, base);
    expect(shot).toMatchObject({ family: 'missile', weapon: 0, mount: 3, trigger: { type: 'ai', channel: 1 } });
    expect(state.entities.get(shot.entityId)?.combat).toMatchObject({ type: 'missile', shooter: base.id, target: base.ai.objectTarget, launchByte: 4, program: 'heat-seeker' });
    expect(controller).toMatchObject({ missileReady: false, triggers: [{ pressed: false }, { pressed: false }, { pressed: false }] });
    expect(lock.level).toBe(0);
    expect(shotsBy(world.step(tickInput()), base)).toEqual([]);
  });

  it('neither steps nor fires a destroyed base, and removes the controller of one switching area without firing', () => {
    const { state, world } = armedWorld();
    const base = activeBase(state, world);
    const controller = controllerOf(base);
    for (const mount of base.combat.weapons.mounts) mount.burst = 0;
    pressChannel(controller, 0, -1, state.clock);
    base.state = 'destroyed-source';
    const deadline = controller.nextUpdateClock;
    for (let tick = 0; tick < 40; tick++) expect(shotsBy(world.step(tickInput()), base)).toEqual([]);
    expect(controller.nextUpdateClock).toBe(deadline);
    expect(controller.triggers[0].pressed).toBe(true);
    base.state = 'area-switch';
    expect(shotsBy(world.step(tickInput()), base)).toEqual([]);
    expect(base.ai.program).toMatchObject({ controller: null });
  });
});
