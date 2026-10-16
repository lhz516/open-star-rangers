import { describe, expect, it } from 'vitest';
import { mount, parameterEntry, script, scriptItem } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import { enableAiLock, pressChannel } from '../rules/ai-firing.ts';
import { installedController } from '../rules/ai-selection.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { randValues, rngStateAfter } from '../rules/rand.test-support.ts';
import { initialWorldState } from '../world/create-world.ts';
import {
  aiProgramsContent, asCreateInput, craftInfoContent, declaration, missionFrame, rosterContent, ruleInputs, wingmanOption, worldInput, type WorldInputParts,
} from '../world/create-world.test-support.ts';
import { initialMovementBlock } from '../rules/flight-state.ts';
import { ALL_KINDS, setActivity, type Activity, type AiController, type Entity, type EntityId, type ObjectState, type TableController } from '../world/entity-table.ts';
import { constructWorld, type World } from '../world/world.ts';
import { entityInit, stateText, thrownBy, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { controllerCall, installedHandler, requestWarpDeparture, updateController } from './ai.ts';
import { applyShotHit } from './damage.ts';
import { PIPELINE, registerTick, type Request, type TickContext } from './pipeline.ts';

// The controller part of `0x20c18` (docs/plan/p3/02/spec.md, CR-23; docs/original/formats/ai.md §1). Expectations
// follow ai §1's callback table: states 0–3 install after the Warp-transit test, 4 nothing, 5 and 6 remove, 7 step; the
// parked handler while parked, otherwise the record's. Each handler's subtask covers its install's update body and draws
// (P3-08/15's handoff): the base's (P3-08/18), the interpreter's (P3-08/16), the wingman's (P3-08/19) and the parked
// handler's (P3-08/21) are below.

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

describe('the controller part over the lifecycle (P3-08/15; CR-23)', () => {
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

  it('faults on a step through the wrong dispatch: a parked controller on an object no longer parked, or the reverse', () => {
    const { state, world } = setUp();
    world.step(tickInput());
    const context = registerTick(state, readTickInput(tickInput()));
    const craft = firstOf(state, 7);
    const parked = { ...installed(state, craft, 'parked'), state: 'active' as const };
    expect(thrownBy(() => updateController(context, { ...parked, activity: 'active' }))).toMatchObject({ code: 'invariant-violated', site: 'ai.dispatch' });
    const active = { ...installed(state, craft, 'interpreter'), state: 'active' as const };
    expect(thrownBy(() => updateController(context, { ...active, activity: 'parked' }))).toMatchObject({ site: 'ai.dispatch' });
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
    // Parked, the install goes to the parked handler `0x62250`: the deadline sample + 0x40 and no draw (D1).
    base.activity = 'parked';
    base.state = 'new';
    const parkedTick = tickOf(state).context;
    updateController(parkedTick, base);
    expect(base.ai.program).toMatchObject({ type: 'built-in', record: 4, controller: { handler: 'parked', nextUpdateClock: parkedTick.time.clock + 0x40 } });
    base.state = 'area-switch';
    updateController(tickOf(state).context, base);
    expect(base.ai.program).toEqual({ type: 'built-in', record: 4, controller: null });
    expect(state.rngState).toEqual(before);
    // Resumed with the bursts fired off: the install draws once per idle mount again.
    base.state = 'new';
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

describe('the interpreter 0x64cb8 in the object update (P3-08/16; AC-03, AC-04, AC-17; CR-23, CR-25)', () => {
  const keywords = aiProgramsContent().keywordTables;
  /** The state script: a draw test of a drawn bound, then a wait of 100. */
  const STATE_SCRIPT = [scriptItem(240, '[10 20]'), scriptItem(1000, '100'), scriptItem(10000)];

  /**
   * AI programs whose DFPG 0 arms the engagement timer (+0x04 50), installs with a draw-free script (lead mode 4) and
   * lists `stateScript` for states 1 and 3; record 0 without noise or `0x5e4d0` (+0x44 = +0x50 = 0), period 70.
   */
  function content(stateScript = STATE_SCRIPT) {
    const programs = aiProgramsContent();
    programs.entries = [
      { ...parameterEntry(1, { state1: [2], state3: [2] }), at04: 50, at10: 100, at14: 50 },
      { kind: 'script', items: [scriptItem(300, keywords[1][4].name), scriptItem(10000)] },
      { kind: 'script', items: stateScript },
      parameterEntry(null, { state1: [4] }),
      script(),
    ] as typeof programs.entries;
    programs.programs[0] = { ...programs.programs[0], at44: 0, at50: 0 };
    programs.programs[2] = { ...programs.programs[2], parameters: 3 };
    return programs;
  }

  /** The player and two kind-7 craft 112.5 and 225 above it, after instantiation. */
  function interpreterWorld(stateScript = STATE_SCRIPT) {
    const mission = missionFrame();
    mission.declarations = [
      declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
      declaration(1, { craftType: 7, position: { x: 100, y: 200, z: 60 } }),
      declaration(2, { craftType: 7, position: { x: 100, y: 200, z: 120 } }),
    ];
    const state = initialWorldState(asCreateInput(worldInput({ mission, aiPrograms: content(stateScript) })));
    const world = constructWorld(state);
    world.step(tickInput());
    const [first, second] = entities(state).filter(({ kindBit }) => kindBit === 7);
    return { state, world, first, second };
  }

  const contextOf = (state: WorldState): TickContext => {
    const context = registerTick(state, readTickInput(tickInput()));
    state.clock = context.time.clock;
    return context;
  };

  it('installs in the first callback with the install script and the first update in the same call, and their draws', () => {
    const { state, first } = interpreterWorld();
    const context = contextOf(state);
    const before = state.rngState;
    const [engagement, , bound] = randValues(before, 4);
    updateController(context, first);
    // 0x63250 (rand % 50), the state-1 list (rand % 1), the parse of [10 20] and the 240 test.
    expect(state.rngState).toEqual(rngStateAfter(before, 4));
    const clock = context.time.clock;
    const controller = first.ai.program.type === 'table' ? first.ai.program.controller : null;
    expect(controller).toMatchObject({
      handler: 'interpreter', nextUpdateClock: clock + 70, period: 70, engagement: { dueClock: clock + (engagement % 50), period: 50 },
      steering: { leadMode: 4 }, interpreter: { state: 1, lastRunEnded: false, execution: { script: 2, item: 2, wait: { active: true, until: clock + 100 } } },
    });
    expect(state.ai.parseCache).toEqual([{ script: 2, uses: 1, items: [{ type: 'integer', value: 10 + (bound % 11) }, { type: 'integer', value: 100 }, { type: 'integer', value: 0 }] }]);
    expect(context.events).toEqual([]);
  });

  it('shares the parse between two craft, releases it at each removal and parses again with new draws at the reinstall', () => {
    const { state, first, second } = interpreterWorld();
    const context = contextOf(state);
    updateController(context, first);
    let before = state.rngState;
    updateController(context, second);
    // The second install draws for the timer, its list and its 240, not for the cached parse.
    expect(state.rngState).toEqual(rngStateAfter(before, 3));
    expect(state.ai.parseCache.map(({ script, uses }) => [script, uses])).toEqual([[2, 2]]);
    const items = state.ai.parseCache[0].items;
    before = state.rngState;
    first.state = 'area-switch';
    updateController(context, first);
    expect(state.ai.parseCache.map(({ script, uses }) => [script, uses])).toEqual([[2, 1]]);
    second.state = 'pending-removal';
    updateController(context, second);
    expect(state.ai.parseCache).toEqual([]);
    expect(state.rngState).toEqual(before);
    expect(first.ai.program).toEqual({ type: 'table', record: 0, controller: null });
    first.state = 'new';
    updateController(context, first);
    expect(state.rngState).toEqual(rngStateAfter(before, 4));
    expect(state.ai.parseCache).toEqual([{ script: 2, uses: 1, items: [{ type: 'integer', value: 10 + (randValues(before, 3)[2] % 11) }, items[1], items[2]] }]);
  });

  it('keeps each world\'s parse cache to itself', () => {
    const one = interpreterWorld();
    const other = interpreterWorld();
    updateController(contextOf(one.state), one.first);
    expect(one.state.ai.parseCache).toHaveLength(1);
    expect(other.state.ai.parseCache).toEqual([]);
  });

  it('runs the interpreter in the AI step only when due, the period after each run', () => {
    const { state, world, first } = interpreterWorld();
    let runs = 0;
    let deadline: number | null = null;
    for (let tick = 0; tick < 120; tick++) {
      world.step(tickInput());
      const { program } = first.ai;
      const due = program.type === 'table' && program.controller !== null ? program.controller.nextUpdateClock : null;
      if (deadline !== null && due !== deadline) {
        // A run on the first sample past the deadline (2 units a tick), which it moves the period on.
        expect(state.clock).toBe(deadline + 2);
        expect(due).toBe(state.clock + 70);
        runs++;
      } else if (deadline !== null) {
        expect(state.clock).toBeLessThanOrEqual(deadline);
      }
      deadline = due;
    }
    expect(runs).toBeGreaterThan(2);
  });

  it('latches a fault when a script never yields: the step publishes nothing, and every later call is refused with it (AC-17)', () => {
    const { world } = interpreterWorld([scriptItem(104, '0.5', 0), scriptItem(10000)]);
    const fault = thrownBy(() => world.step(tickInput()));
    expect(fault).toMatchObject({ code: 'budget-exhausted', site: 'ai.dispatches-per-run' });
    expect(thrownBy(() => world.step(tickInput()))).toBe(fault);
    expect(thrownBy(() => world.snapshot())).toBe(fault);
  });

  it('asks for a Warp departure (0x5e6cc) only for an active object in state 7 whose reference point lies outside the active area', () => {
    const { state, first } = interpreterWorld();
    const context = contextOf(state);
    Object.assign(first, { state: 'active', activity: 'active', inWarp: false, warpClock: 0 });
    first.ai.target = null;
    // The goal next to the player: inside the active area.
    first.ai.goal = { x: 0, y: 0, z: 0 };
    expect(requestWarpDeparture(context, first)).toBe(false);
    first.ai.goal = { x: 30_000, y: 0, z: 0 };
    for (const refused of [{ state: 'awaiting-presentation' }, { activity: 'parked' }, { inWarp: true }] as const) {
      const entity = { ...first, ...refused } as Entity;
      expect(requestWarpDeparture(context, entity)).toBe(false);
    }
    first.ai.target = 9999;
    expect(requestWarpDeparture(context, first)).toBe(false);
    first.ai.target = null;
    // Allowed, it posts `warp-departure` to the poster itself (area.test.ts follows its handling).
    expect(requestWarpDeparture(context, first)).toBe(true);
    const posted: Request[] = [];
    context.requests.handle((request) => void posted.push(request));
    expect(posted).toEqual([{ type: 'warp-departure', entityId: first.id }]);
  });
});

describe('the wingman 0x610c8 in the object update (P3-08/19; AC-03, AC-07; WA2–WA9, WB6)', () => {
  /**
   * The synthetic content with an armed wingman (kind 1): mounts 0 a gun (gun 0: speed 100) on list 0 and 1 a guided
   * missile (missile 0: two rounds, stage time 8, lock cosine 0.5) on list 1. Roster entry 0 takes AICO element
   * `element` (+0xDC); element 1 (0.75, 0.5, 0.25, 0) has throttle noise, element 2 (0.5, 0.5, 0, 0) none. The wingman's
   * record has period 70 and the limits 30°, 30° and saturation 1; the friendly-fire threshold AICO +0x28 is 4.
   */
  function wingmanWorld(element = 3): { readonly state: WorldState; readonly world: World; readonly wingman: CraftEntity; readonly player: Entity } {
    const info = craftInfoContent();
    Object.assign(info.guns[0], { at08: 100, at24: 3200 });
    Object.assign(info.missiles[0], { at18: 1, at34: 8, at44: 16_000 });
    info.craft[1].mounts = [mount({ weapon: 0, at20: 0, at34: 0 }), mount({ at10: 1, weapon: 0, at0C: 2, at20: 0 })];
    info.craft[1].mountLists = [[0], [1], []];
    const roster = rosterContent();
    roster.options[0] = wingmanOption(0, { ruleInputs: ruleInputs({ aiValueA: element }) });
    // Steering limits that turn towards the target: 30° and saturation 1 (the builder's saturation is negative).
    const aiPrograms = aiProgramsContent();
    aiPrograms.builtInPrograms[3] = { ...aiPrograms.builtInPrograms[3], at24: 30, at28: 30, at2C: 1 };
    const { state, world } = setUp({ run: { wingman: 0 }, craftInfo: info, roster, aiPrograms });
    world.step(tickInput());
    return { state, world, wingman: firstOf(state, 1) as CraftEntity, player: firstOf(state, 0) };
  }

  /** A registered tick whose clock stage has run, and the requests its updates post. */
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

  const wingmanOf = (entity: Entity): Extract<AiController, { handler: 'wingman' }> => {
    const { program } = entity.ai;
    if (program.type !== 'built-in' || program.controller?.handler !== 'wingman') throw new Error('an installed wingman controller');
    return program.controller;
  };

  /** Steps until the wingman's controller has just run (its deadline moved). */
  function stepToUpdate(world: World, wingman: Entity): DomainEvent[] {
    const events: DomainEvent[] = [];
    const deadline = wingmanOf(wingman).nextUpdateClock;
    while (wingmanOf(wingman).nextUpdateClock === deadline) events.push(...world.step(tickInput()));
    return events;
  }

  /** Puts the wingman 2000 above the player: far from its formation point, so it flies there at full throttle. */
  const farFromFormation = (wingman: Entity, player: Entity) => void (wingman.position = { ...player.position, z: player.position.z + 2000 });

  it('installs in the first callback and runs the update body with its draws in the same call: the formation at full throttle', () => {
    const { state, wingman, player } = wingmanWorld(2);
    expect(wingman.ai.program).toEqual({ type: 'built-in', record: 3, controller: null });
    farFromFormation(wingman, player);
    const { context, posted } = tickOf(state);
    const before = state.rngState;
    updateController(context, wingman);
    // The steering post (no speed factor, no steering noise), then full throttle with one throttle-noise draw.
    expect(state.rngState).toEqual(rngStateAfter(before, 1));
    expect(wingmanOf(wingman)).toMatchObject({
      nextUpdateClock: context.time.clock + 70, aiLock: true, wingman: { behaviour: 2 },
      steering: { target: player.id, offset: { enabled: true, frame: 0, vector: { x: 125, y: 3, z: 25 } } },
    });
    expect(posted()).toMatchObject([
      { type: 'steer', entityId: wingman.id, control: { speedFactor: null } },
      { type: 'steer', entityId: wingman.id, control: { axes: [{ set: false }, { set: false }, { set: false }] } },
    ]);
    expect(wingman.ai).toMatchObject({ mode: 2, target: player.id });
    expect(context.events).toEqual([]);
  });

  it('removes without a draw and installs again with its draws after parking and resuming; the private block is rebuilt', () => {
    const { state, wingman, player } = wingmanWorld(2);
    farFromFormation(wingman, player);
    updateController(tickOf(state).context, wingman);
    const controller = wingmanOf(wingman);
    Object.assign(controller.wingman, { doNotAttack: player.id, nextGunSwitchClock: 999 });
    wingman.state = 'area-switch';
    const before = state.rngState;
    updateController(tickOf(state).context, wingman);
    expect(wingman.ai.program).toEqual({ type: 'built-in', record: 3, controller: null });
    // Parked, the install goes to the parked handler, without a draw (D1); its removal draws nothing either.
    Object.assign(wingman, { state: 'new', activity: 'parked' });
    updateController(tickOf(state).context, wingman);
    expect(wingman.ai.program).toMatchObject({ type: 'built-in', record: 3, controller: { handler: 'parked' } });
    wingman.state = 'area-switch';
    updateController(tickOf(state).context, wingman);
    expect(wingman.ai.program).toEqual({ type: 'built-in', record: 3, controller: null });
    expect(state.rngState).toEqual(before);
    Object.assign(wingman, { state: 'new', activity: 'active' });
    updateController(tickOf(state).context, wingman);
    expect(state.rngState).toEqual(rngStateAfter(before, 1));
    // B+4 and B+0x0C are lost; b comes back from the mirror (+0xC4 2, +0x90 the player): the formation.
    expect(wingmanOf(wingman).wingman).toMatchObject({ behaviour: 2, doNotAttack: null, nextGunSwitchClock: 0 });
  });

  it('resumes b 5 as 0 against B+8, which the same call\'s periodic update makes 5 again while the accumulator stays above', () => {
    for (const [accumulated, behaviour] of [[5, 5], [0, 0]] as const) {
      const { state, world, wingman, player } = wingmanWorld();
      const hostile = firstOf(state, 7);
      world.step(tickInput());
      const controller = wingmanOf(wingman);
      controller.wingman.attackTarget = hostile.id;
      state.ai.friendlyFire.accumulated = 5;
      stepToUpdate(world, wingman);
      expect(controller.wingman.behaviour).toBe(5);
      expect(wingman.ai).toMatchObject({ mode: 0, target: hostile.id, objectTarget: player.id });
      wingman.state = 'area-switch';
      updateController(tickOf(state).context, wingman);
      state.ai.friendlyFire.accumulated = accumulated;
      wingman.state = 'new';
      updateController(tickOf(state).context, wingman);
      expect(wingmanOf(wingman).wingman, `${accumulated}`).toMatchObject({ behaviour, attackTarget: hostile.id });
      expect(wingman.ai.objectTarget).toBe(behaviour === 5 ? player.id : hostile.id);
    }
  });

  it('becomes angry at the update after real hits by the player take the accumulator above AICO +0x28, and stays angry (CR-27)', () => {
    const { state, world, wingman, player } = wingmanWorld();
    world.step(tickInput());
    const controller = wingmanOf(wingman);
    Object.assign(wingman.combat, { shield: 0, hull: 1000 });
    /** The player's projectile hits the wingman for `damage` through P3-07's damage entry, where P3-10's 0x38f20 counts it. */
    const hit = (damage: number): void => {
      const projectile = state.entities.allocate(entityInit(21, { combat: { type: 'projectile', gun: 0, shooter: player.id, expiry: null } }));
      const { context } = tickOf(state);
      applyShotHit(context, projectile, wingman, damage, null);
      state.entities.remove(projectile);
    };
    hit(3);
    hit(1);
    // Each hit counts once, with its raw damage: 4, at the threshold, does not anger.
    expect(state.ai.friendlyFire.accumulated).toBe(4);
    stepToUpdate(world, wingman);
    expect(controller.wingman.behaviour).toBe(2);
    hit(1);
    expect(state.ai.friendlyFire.accumulated).toBe(5);
    stepToUpdate(world, wingman);
    expect(controller.wingman.behaviour).toBe(5);
    expect(controller.steering.target).toBe(player.id);
    // A hit after the window end restarts the accumulator below the threshold; the anger stays.
    state.clock = state.ai.friendlyFire.windowEnd + 1;
    hit(1);
    expect(state.ai.friendlyFire.accumulated).toBe(1);
    stepToUpdate(world, wingman);
    expect(controller.wingman.behaviour).toBe(5);
  });

  it('launches a guided missile at its target with lock byte 4 once the AI lock it turned on reaches level 4 (WA9, revision ⑦)', () => {
    const { state, world, wingman, player } = wingmanWorld();
    state.ai.friendlyFire.accumulated = 5;
    let shot: Extract<DomainEvent, { type: 'shot-fired' }> | undefined;
    for (let step = 0; step < 400 && shot === undefined; step++) {
      shot = world.step(tickInput()).find((event): event is Extract<DomainEvent, { type: 'shot-fired' }> =>
        event.type === 'shot-fired' && event.shooterEntityId === wingman.id && event.family === 'missile');
    }
    expect(shot).toMatchObject({ weapon: 0, mount: 1, trigger: { type: 'ai', channel: 1 } });
    expect(state.entities.get(shot!.entityId)?.combat).toMatchObject({ type: 'missile', shooter: wingman.id, target: player.id, launchByte: 4, program: 'heat-seeker' });
  });

  it('without a wingman: no kind-1 entity or wingman controller, and the friendly-fire state keeps its initial values', () => {
    const { state, world } = setUp({ run: { wingman: null } });
    for (let tick = 0; tick < 40; tick++) world.step(tickInput());
    expect(entities(state).filter(({ kindBit }) => kindBit === 1)).toEqual([]);
    expect(entities(state).some(({ ai: { program } }) => program.type !== 'none' && program.controller?.handler === 'wingman')).toBe(false);
    expect(state.ai.friendlyFire).toEqual({ accumulated: 0, windowEnd: 0 });
  });
});

describe('the parked handler 0x62250 in the object update (P3-08/21; AC-09; D1, E4, CR-23)', () => {
  /**
   * The player at the origin, a kind-7 leader (record 1) and a kind-17 base (record 2) 37500 to either side, both
   * parked, after instantiation; with `wingman`, roster option 0 too. No record names preferred kinds.
   */
  function parkedWorld(wingman: number | null = null) {
    const mission = missionFrame();
    mission.declarations = [
      declaration(0, { craftType: 0, position: { x: 0, y: 0, z: 0 } }),
      declaration(1, { craftType: 7, position: { x: 20_000, y: 0, z: 0 } }),
      declaration(2, { craftType: 17, position: { x: -20_000, y: 0, z: 0 } }),
    ];
    const state = initialWorldState(asCreateInput(worldInput({ mission, run: { wingman } })));
    const world = constructWorld(state);
    world.step(tickInput());
    return { state, world, player: firstOf(state, 0), leader: firstOf(state, 7) as CraftEntity, base: firstOf(state, 17) as CraftEntity };
  }

  it('installs in the first callback of a parked object with the deadline sample + 0x40, without a draw, request or event', () => {
    const { state, leader, base } = parkedWorld();
    expect([leader.activity, leader.state, base.activity, base.state]).toEqual(['parked', 'new', 'parked', 'new']);
    const context = registerTick(state, readTickInput(tickInput()));
    state.clock = context.time.clock;
    const before = state.rngState;
    updateController(context, leader);
    updateController(context, base);
    expect(state.rngState).toEqual(before);
    expect(parkedOf(leader).nextUpdateClock).toBe(context.time.clock + 0x40);
    expect(base.ai.program).toMatchObject({ type: 'built-in', record: 4, controller: { handler: 'parked', nextUpdateClock: context.time.clock + 0x40 } });
    const posted: Request[] = [];
    context.requests.handle((request) => void posted.push(request));
    expect(posted).toEqual([]);
    expect(context.events).toEqual([]);
  });

  it('steps only when due, in the object update; its draws precede every parked-update draw, whose travel follows its decision', () => {
    const { state, world, player, leader, base } = parkedWorld();
    world.step(tickInput());
    const [leaderController, baseController] = [parkedOf(leader), parkedOf(base)];
    expect(leaderController.nextUpdateClock).toBe(baseController.nextUpdateClock);
    // Until due, the object update draws nothing (the player draws nothing without commands).
    while (!(state.clock + 2 > leaderController.nextUpdateClock)) {
      const before = state.rngState;
      runStages(state, tickInput(), { 'object-update': () => expect(state.rngState).toEqual(before) });
    }
    // The due tick, with the leader's parked update due too, and the player back at the origin: the leader's nearest
    // friendly within three sectors, so no random pick.
    leader.lastParkedUpdateClock = state.clock + 2 - 0x80;
    player.position = { x: 0, y: 0, z: 0 };
    const start = leader.position;
    const before = state.rngState;
    const values = randValues(before, 2);
    let afterControllers: unknown = null;
    let beforeParked = state.rngState;
    const { context } = runStages(state, tickInput(), {
      'object-update': () => {
        // Walk order: the leader (kind bit 7) before the base (17), one draw each, rand % 64 last.
        expect(state.rngState).toEqual(rngStateAfter(before, 2));
        const clock = state.clock;
        // The leader's friendly set holds the base, so no shortcut: the nearest of 0x6c87f, the player (D2, D3).
        expect(leader.ai).toMatchObject({ mode: 0, target: player.id, targetOffset: { x: 0, y: 0, z: 0 } });
        expect(leaderController.nextUpdateClock).toBe(clock + 0x280 + (values[0] % 64));
        expect(base.ai.mode).toBe(1);
        expect(baseController.nextUpdateClock).toBe(clock + 0xf00 + (values[1] % 64));
        afterControllers = structuredClone([leaderController, baseController, leader.ai.mode, base.ai.mode]);
      },
      'object-sets': () => void (beforeParked = state.rngState),
    });
    // The parked update draws after them, and travels toward the target the step chose, with a random offset; it does
    // not run the controller again.
    expect(beforeParked).not.toEqual(state.rngState);
    const { targetOffset } = leader.ai;
    expect(targetOffset).not.toEqual({ x: 0, y: 0, z: 0 });
    const goal = { x: player.position.x + targetOffset.x, y: player.position.y + targetOffset.y };
    const towards = (position: Vec3) => Math.hypot(position.x - goal.x, position.y - goal.y);
    expect(towards(leader.position)).toBeLessThan(towards(start));
    expect(structuredClone([leaderController, baseController, leader.ai.mode, base.ai.mode])).toEqual(afterControllers);
    expect(context.events.filter(({ type }) => type !== 'command-result')).toEqual([]);
  });

  it('removes in states 5 and 6 without a draw, and the next callback installs by the activity then', () => {
    const { state, world, leader } = parkedWorld();
    world.step(tickInput());
    const before = state.rngState;
    leader.state = 'area-switch';
    const context = registerTick(state, readTickInput(tickInput()));
    updateController(context, leader);
    expect(leader.ai.program).toEqual({ type: 'table', record: 0, controller: null });
    expect(state.rngState).toEqual(before);
    leader.state = 'new';
    updateController(context, leader);
    expect(parkedOf(leader).nextUpdateClock).toBe(context.time.clock + 0x40);
    expect(state.rngState).toEqual(before);
  });

  /** A wingman world after its first step whose wingman is parked far from the player, its parked handler installed. */
  function parkedWingmanWorld() {
    const parts = parkedWorld(0);
    const { state, world } = parts;
    const wingman = firstOf(state, 1) as CraftEntity;
    Object.assign(wingman, { position: { x: 30_000, y: 1000, z: 0 }, state: 'area-switch' });
    world.step(tickInput());
    world.step(tickInput());
    expect(wingman).toMatchObject({ activity: 'parked', state: 'active' });
    return { ...parts, wingman, controller: parkedOf(wingman) };
  }

  it('the wingman\'s drop creates a parked Xpon in the walk, whose first callback follows in the same walk (AC-10, CR-20, D4)', () => {
    const { state, world, wingman, controller } = parkedWingmanWorld();
    const kind14 = () => entities(state).filter(({ kindBit }) => kindBit === 14);
    expect(kind14()).toEqual([]);
    controller.nextUpdateClock = state.clock;
    // No parked update is due in this tick, nor the new Xpon's: each parked craft draws only its due check.
    for (const entity of entities(state)) if (entity.activity === 'parked') entity.lastParkedUpdateClock = state.clock + 2;
    expect(wingman.state).toBe('active');
    const before = state.rngState;
    const values = randValues(before, 2);
    let beforeParked = state.rngState;
    const { context, events } = runStages(state, tickInput(), {
      'object-update': (tick) => {
        const [xpon] = kind14();
        expect(xpon).toMatchObject({
          source: null, activity: 'parked', movement: null, state: 'new', transponder: { creator: 'wingman', callback: { phase: 'none' } },
          lastParkedUpdateClock: state.clock,
        });
        // Its first callback ran in this walk: the generic part's request to become active.
        expect(tick.requests.findLastPending((request): request is Request => request.type === 'set-state' && request.entityId === xpon.id)).toBeDefined();
        // The construction's one draw (the energy update) precedes the handler's last one; the Xpon itself draws nothing.
        expect(state.rngState).toEqual(rngStateAfter(before, 2));
        expect(xpon.combat).toMatchObject({ nextEnergyClock: state.clock + 0x80 + (values[0] % 64) });
        // The far leader is the only hostile and is not map-visible: no choice with p 0 (sample + 0x3C0).
        expect(controller.nextUpdateClock).toBe(state.clock + 0x3c0 + (values[1] % 64));
        expect(wingman.ai).toMatchObject({ mode: 4, target: null });
        // Not a member before the next rebuild.
        expect(state.objectSets.friendly).not.toContain(xpon.id);
      },
      'object-sets': () => {
        expect(state.objectSets.friendly).toContain(kind14()[0].id);
        beforeParked = state.rngState;
      },
      'parked-update': () => {
        // This tick's parked update selects the active-state parked craft: the leader, the base, the wingman and the new Xpon.
        expect(state.rngState).toEqual(rngStateAfter(beforeParked, 4));
      },
    });
    expect(kind14()[0].state).toBe('active');
    expect(events.some(({ type }) => type === 'transponder-deployed')).toBe(false);
    expect(context.events).toBe(events);
    // Each new Xpon covers its own drop point, so the next due step drops none.
    controller.nextUpdateClock = state.clock;
    world.step(tickInput());
    expect(kind14()).toHaveLength(1);
  });

  it('a wingman in b 4 whose destination lies outside the active area departs by Warp through the parked handler (WA5, D6)', () => {
    const { state, world } = parkedWorld(0);
    const wingman = firstOf(state, 1) as CraftEntity;
    world.step(tickInput());
    const { program } = wingman.ai;
    if (program.type !== 'built-in' || program.controller?.handler !== 'wingman') throw new Error('the wingman handler');
    state.player.map.destination = { x: 30_000, y: 0, z: 0 };
    Object.assign(wingman.ai, { target: null, objectTarget: null, goal: state.player.map.destination, mode: 2 });
    program.controller.wingman.behaviour = 4;
    wingman.warpClock = 0;
    let departed: number | null = null;
    for (let tick = 0; tick < 200 && departed === null; tick++) {
      world.step(tickInput());
      if (wingman.inWarp) departed = state.clock;
    }
    expect(departed).not.toBeNull();
    expect(wingman).toMatchObject({ state: 'area-switch', activity: 'active', inWarp: true, warpClock: 0, lastParkedUpdateClock: departed! - 0x80 });
    world.step(tickInput());
    expect(wingman).toMatchObject({ activity: 'parked', state: 'new' });
    expect(wingman.ai.program).toMatchObject({ controller: null });
    world.step(tickInput());
    expect(parkedOf(wingman).nextUpdateClock).toBe(state.clock + 0x40);
    expect(wingman).toMatchObject({ state: 'active', inWarp: true, warpClock: state.clock, lastParkedUpdateClock: state.clock });
  });
});

/** The installed parked controller of `entity`. */
function parkedOf(entity: Entity): Extract<AiController, { handler: 'parked' }> {
  const { program } = entity.ai;
  if (program.type === 'none' || program.controller?.handler !== 'parked') throw new Error('an installed parked controller');
  return program.controller;
}

/** Registers a tick for `state`, runs every stage in order and calls `after[stage]` after it; the tick's context and events. */
function runStages(state: WorldState, input = tickInput(), after: Partial<Record<string, (context: TickContext) => void>> = {}) {
  const context = registerTick(state, readTickInput(input));
  for (const { id, run } of PIPELINE) {
    run?.(context);
    after[id]?.(context);
  }
  return { context, events: context.events };
}

describe('the object sets and map visibility as the parked wingman reads them: CR-29 joint tests 1–7 (P3-08/21; AC-09, MW-06)', () => {
  /** The wingman's position W, far outside the active area; its craft +0x0C (reveal range) is 250. */
  const W = { x: 30_000, y: 1000, z: 0 };
  const from = (dx: number): Vec3 => ({ x: W.x + dx, y: W.y, z: 0 });
  const NEAR = from(100);
  const OUTSIDE = from(1000);
  const AWAY = from(5000);

  /**
   * The player at the origin, two kind-7 hostiles H1 and H2 and a kind-17 base, all far away and parked; the wingman
   * (option 0) moved to W and parked, its parked handler installed. `wingman` null: no wingman.
   */
  function mapWorld(wingman: number | null = 0) {
    const mission = missionFrame();
    mission.declarations = [
      declaration(0, { craftType: 0, position: { x: 0, y: 0, z: 0 } }),
      declaration(1, { craftType: 7, position: { x: 20_000, y: 2000, z: 0 } }),
      declaration(2, { craftType: 7, position: { x: 20_000, y: -2000, z: 0 } }),
      declaration(3, { craftType: 17, position: { x: -20_000, y: 0, z: 0 } }),
    ];
    const state = initialWorldState(asCreateInput(worldInput({ mission, run: { wingman } })));
    const world = constructWorld(state);
    world.step(tickInput());
    const [h1, h2] = entities(state).filter(({ kindBit }) => kindBit === 7);
    const flier = wingman === null ? null : firstOf(state, 1);
    if (flier !== null) Object.assign(flier, { position: W, state: 'area-switch' });
    world.step(tickInput());
    world.step(tickInput());
    return { state, world, h1, h2, wingman: flier, player: firstOf(state, 0) };
  }

  type MapWorld = ReturnType<typeof mapWorld>;

  interface Step {
    /** Gives the `toggle-map` command. */
    readonly toggleMap?: boolean;
    readonly due?: boolean;
    readonly h1?: Vec3;
    readonly h2?: Vec3;
    /** Runs after the object update, before the object sets are rebuilt. */
    readonly afterWalk?: () => void;
  }

  /**
   * One tick with H1 and H2 at the given positions and no parked update due (so nothing travels or engages); with `due`
   * the wingman's step runs, from mode 0 without targets (a p-0 search). Returns what the search saw and chose, after
   * the object update, and the flags after the tick.
   */
  function step(env: MapWorld, { toggleMap = false, due = false, h1, h2, afterWalk }: Step = {}) {
    const { state, wingman } = env;
    if (h1 !== undefined) env.h1.position = h1;
    if (h2 !== undefined) env.h2.position = h2;
    for (const entity of entities(state)) if (entity.activity === 'parked') entity.lastParkedUpdateClock = state.clock + 2;
    if (wingman !== null) {
      parkedOf(wingman).nextUpdateClock = due ? state.clock : state.clock + 10_000;
      if (due) Object.assign(wingman.ai, { mode: 0, target: null, objectTarget: null });
    }
    let during: { readonly target: EntityId | null; readonly visible: readonly boolean[] } | null = null;
    runStages(state, tickInput(toggleMap ? [{ type: 'toggle-map' }] : []), {
      'object-update': () => {
        during = { target: wingman?.ai.target ?? null, visible: [env.h1.mapVisible, env.h2.mapVisible] };
        afterWalk?.();
      },
    });
    return { during: during!, after: [env.h1.mapVisible, env.h2.mapVisible], icons: state.mapIcons.map(({ entityId }) => entityId) };
  }

  /**
   * MW-06 recomputed from the current positions: the sets by kind in walk order; with the map open, each friendly in set
   * order becomes visible and reveals the hostiles within its +0x0C on the plane, until as many hostiles as the set holds
   * are revealed (later friendlies keep the base value).
   */
  function recomputed(state: WorldState) {
    const craft = [...state.entities.walk(0xfffff)];
    const isHostile = ({ kindBit }: Entity) => ((0x93780 >>> kindBit) & 1) === 1;
    const friendly = craft.filter((entity) => !isHostile(entity));
    const hostile = craft.filter(isHostile);
    const visible = new Set<Entity>();
    let revealed = 0;
    for (const source of friendly) {
      if (revealed === hostile.length && revealed > 0) break;
      visible.add(source);
      const range = state.craftInfo.content.craft[source.kindBit].at0C;
      for (const target of hostile) {
        if (visible.has(target) || !((source.position.x - target.position.x) ** 2 + (source.position.y - target.position.y) ** 2 < range * range)) continue;
        visible.add(target);
        revealed++;
      }
    }
    return { sets: { friendly: friendly.map(({ id }) => id), hostile: hostile.map(({ id }) => id) }, visible: craft.map((entity) => visible.has(entity)) };
  }

  it('1. map closed: the step\'s own reveal lets it find a hostile it covers, but neither the map step nor the next rebuild sees it', () => {
    const env = mapWorld();
    const { during, after, icons } = step(env, { due: true, h1: NEAR, h2: AWAY, afterWalk: () => void (env.h1.position = OUTSIDE) });
    expect(during).toEqual({ target: env.h1.id, visible: [true, false] });
    expect(after).toEqual([false, false]);
    expect(icons).toEqual([]);
    expect(env.wingman!.mapVisible).toBe(false);
    // With the map open the same tick's map step lists the friendlies only: the rebuild reset the step's reveal.
    step(env, { toggleMap: true, h1: AWAY });
    expect(env.state.player.viewMode).toBe(8);
    const open = step(env, { due: true, h1: NEAR, afterWalk: () => void (env.h1.position = OUTSIDE) });
    expect(open.during.target).toBe(env.h1.id);
    expect(open.after).toEqual([false, false]);
    expect(open.icons).toContain(env.wingman!.id);
    expect(open.icons).not.toContain(env.h1.id);
  });

  it('2. map opened at tick N: the search of N + 1 reads N\'s reveal and adds its own on top', () => {
    const env = mapWorld();
    const opened = step(env, { toggleMap: true, h1: NEAR, h2: AWAY });
    expect(env.state.player.viewMode).toBe(8);
    expect(opened.after).toEqual([true, false]);
    // H1 has left every friendly's range since; H2 has come within the wingman's.
    const next = step(env, { due: true, h1: OUTSIDE, h2: NEAR });
    expect(next.during).toEqual({ target: env.h2.id, visible: [true, true] });
    expect(next.after).toEqual([false, true]);
    // A hostile only N's reveal shows is found too.
    step(env, { h1: NEAR, h2: AWAY });
    expect(step(env, { due: true, h1: OUTSIDE }).during).toEqual({ target: env.h1.id, visible: [true, false] });
  });

  it('3. map closed at tick M: the rebuild of M reveals nothing, so the search of M + 1 has only the base value and its own reveal', () => {
    const env = mapWorld();
    step(env, { toggleMap: true, h1: NEAR, h2: AWAY });
    const closed = step(env, { toggleMap: true, h1: NEAR });
    expect(env.state.player.viewMode).not.toBe(8);
    expect(closed.after).toEqual([false, false]);
    const next = step(env, { due: true, h1: OUTSIDE });
    expect(next.during).toEqual({ target: null, visible: [false, false] });
    expect(parkedOf(env.wingman!).nextUpdateClock - env.state.clock).toBeGreaterThanOrEqual(0x3c0);
  });

  it('4. consecutive map frames: each tick\'s sets and flags follow only from the current positions; the snapshot holds them', () => {
    const env = mapWorld();
    step(env, { toggleMap: true });
    const positions = [[NEAR, AWAY], [OUTSIDE, NEAR], [OUTSIDE, AWAY], [NEAR, NEAR], [AWAY, OUTSIDE]] as const;
    for (const [index, [h1, h2]] of positions.entries()) {
      step(env, { due: index % 2 === 0, h1, h2 });
      const expected = recomputed(env.state);
      expect(env.state.objectSets, `${index}`).toEqual(expected.sets);
      expect([...env.state.entities.walk(0xfffff)].map(({ mapVisible }) => mapVisible), `${index}`).toEqual(expected.visible);
      const snapshot = env.world.snapshot().state;
      expect(snapshot.objectSets).toEqual(expected.sets);
      expect(snapshot.entities.filter(({ kindBit }) => kindBit < 20).map(({ id, mapVisible }) => [id, mapVisible]))
        .toEqual([...env.state.entities.byId()].filter(({ kindBit }) => kindBit < 20).map(({ id, mapVisible }) => [id, mapVisible]));
    }
  });

  it('5. destroyed, docked, parked and Warping craft stay members and can be chosen; the Xpon dropped in the walk is not one yet', () => {
    const env = mapWorld();
    const { h1, h2 } = env;
    // H1 docked (its parked controller removed, as a docking would), destroyed and in Warp; H2 a destroyed source.
    h1.ai.program = { ...h1.ai.program, controller: null } as typeof h1.ai.program;
    setActivity(h1, 'docked', initialMovementBlock(h1.maximumSpeed, env.state.craftInfo.content.craft[7].atB8));
    Object.assign(h1, { state: 'active', destroyed: true, inWarp: true });
    h2.state = 'destroyed-source';
    step(env, { h1: AWAY, h2: AWAY });
    expect(env.state.objectSets.hostile).toEqual([h1.id, h2.id]);
    let dropped: EntityId | undefined;
    const first = step(env, {
      due: true,
      h1: AWAY,
      h2: NEAR,
      afterWalk: () => {
        dropped = entities(env.state).find(({ kindBit }) => kindBit === 14)?.id;
        expect(env.state.objectSets.friendly).not.toContain(dropped);
      },
    });
    expect(first.during.target).toBe(h2.id);
    expect(dropped).toBeDefined();
    expect(env.state.objectSets.friendly).toContain(dropped);
    expect(step(env, { due: true, h1: NEAR, h2: AWAY }).during.target).toBe(h1.id);
  });

  it('6. without a wingman nothing reveals outside the map; without a player the wingman still searches; the first decision follows a rebuild', () => {
    const created = initialWorldState(asCreateInput(worldInput({ run: { wingman: 0 } })));
    expect(created.objectSets).toEqual({ friendly: [], hostile: [] });
    const alone = mapWorld(null);
    const leaderStep = parkedOf(alone.h1).nextUpdateClock;
    expect(alone.state.objectSets.hostile).toEqual([alone.h1.id, alone.h2.id]);
    let stepped = false;
    for (let tick = 0; tick < 60; tick++) {
      alone.world.step(tickInput());
      stepped ||= parkedOf(alone.h1).nextUpdateClock !== leaderStep;
      expect(entities(alone.state).some(({ mapVisible }) => mapVisible)).toBe(false);
    }
    expect(stepped).toBe(true);
    const env = mapWorld();
    env.player.state = 'pending-removal';
    step(env);
    expect(env.state.player.entityId).toBeNull();
    expect(env.state.objectSets.friendly).not.toContain(env.player.id);
    expect(step(env, { due: true, h1: NEAR, h2: AWAY }).during).toEqual({ target: env.h1.id, visible: [true, false] });
  });

  it('7. two worlds share no sets or flags, and the same content, seed and input give the same states', () => {
    const one = mapWorld();
    const other = mapWorld();
    step(one, { toggleMap: true, h1: NEAR });
    step(other, { h1: NEAR });
    expect(one.h1.mapVisible).toBe(true);
    expect(other.h1.mapVisible).toBe(false);
    expect(other.state.objectSets).not.toBe(one.state.objectSets);
    const run = () => {
      const env = mapWorld();
      for (let tick = 0; tick < 40; tick++) env.world.step(tickInput(tick === 5 || tick === 20 ? [{ type: 'toggle-map' }] : []));
      return stateText(env.state);
    };
    expect(run()).toBe(run());
  });
});
