import { describe, expect, it } from 'vitest';
import type { DomainEvent, EntitySource } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, sliceMission, worldInput } from '../world/create-world.test-support.ts';
import type { Entity } from '../world/entity-table.ts';
import { compareReplayResults } from '../replay/compare.ts';
import { constructWorld, type World } from '../world/world.ts';
import { entityInit, expectFault, tickInput, withEveryKindBound } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { updateParked } from './area.ts';
import { applyContactDamage, applyShotHit } from './damage.ts';
import { reportObjectEvent } from './mission-events.ts';
import { latch } from './mission-flow.ts';
import { PIPELINE, registerTick, type TickContext } from './pipeline.ts';

// docs/plan/p3/02/spec.md, ME-03, ME-05, ME-07, ME-08 and ME-13; docs/original/formats/executable.md, flow dispatch and
// ending, all-clear and summary selection, state-5 failure in normal play, numbers on the flow paths (P3-11/01). The
// slice-shaped mission (create-world.test-support.ts) has ten enemies at the start, record 3's two craft of kind 7 and
// groups 0 and 1 (kinds 7 and 8, four each), and group 2 (six of kind 7) queued at 300 s, as SCEN 3019 has 10 + 6. The
// four bases of record 7 (kind 17) count on trigger 0, record 3 on trigger 1. Expected ticks and clocks are worked out
// by hand from the production step of 2 units: c′ is the previous tick's clock, and states 4 and 5 compare strictly.

const ALL_KINDS = 0xffffffff;
const IMPACT = Object.freeze({ point: Object.freeze({ x: 0, y: 0, z: 0 }), local: Object.freeze({ x: 0, y: 0, z: -1 }), face: 0 });
const MISSION = 'mission/test-mission';

/** Trigger 0, the bases: every base lost (100) selects 16, otherwise selector 0. Trigger 1, record 3: one range, −2. */
function flowMission() {
  const mission = sliceMission();
  mission.declarations[7].eventTrigger = 0;
  mission.declarations[3].eventTrigger = 1;
  mission.eventTriggers = [
    { ranges: [{ lower: 100, upper: 100, messages: [], summarySelector: 16 }, { lower: 0, upper: 99, messages: [], summarySelector: 0 }] },
    { ranges: [{ lower: 0, upper: 100, messages: [], summarySelector: -2 }] },
  ];
  return mission;
}

interface Run {
  readonly state: WorldState;
  readonly world: World;
}

function newRun(run: Record<string, unknown> = { wingman: 0 }, mission = flowMission()): Run {
  const input = worldInput({ mission, run });
  const state = withEveryKindBound(initialWorldState(asCreateInput({ ...input, mission: { ...input.mission, id: MISSION } })));
  const world = constructWorld(state);
  // The first step instantiates every entry due at 0.
  world.step(tickInput());
  return { state, world };
}

type Hooks = Partial<Record<string, (context: TickContext) => void>>;

/** One formal tick, the step's own registration and stages, with `hooks` run right before the named stages. */
function stepWith(state: WorldState, hooks: Hooks): readonly DomainEvent[] {
  const context = registerTick(state, readTickInput(tickInput()));
  for (const stage of PIPELINE) {
    hooks[stage.id]?.(context);
    stage.run?.(context);
  }
  return context.events;
}

const contextOf = (state: WorldState): TickContext => registerTick(state, readTickInput(tickInput()));
const enemies = (state: WorldState): Entity[] => [...state.entities.walk(ALL_KINDS)].filter(({ kindBit, destroyed }) => (kindBit === 7 || kindBit === 8) && !destroyed);
const sourced = (state: WorldState, index: number): Entity[] =>
  [...state.entities.walk(ALL_KINDS)].filter(({ source }) => source?.collection === 'mission' && source.index === index);

function weaken(entity: Entity): CraftEntity {
  const craft = entity as CraftEntity;
  Object.assign(craft.combat, { shield: 0, hull: 1 });
  return craft;
}

/** Destroys `entity` by a collision (event class 1). */
const destroy = (context: TickContext, entity: Entity): void => void applyContactDamage(context, weaken(entity), 5, 'collision');

/** Destroys `entity` by the player's projectile (event class 0). */
function destroyByPlayer(context: TickContext, entity: Entity): void {
  const { entities, player } = context.world;
  const projectile = entities.allocate(entityInit(21, { combat: { type: 'projectile', gun: 0, shooter: player.entityId!, expiry: null } }));
  expect(applyShotHit(context, projectile, weaken(entity), 5, IMPACT)).not.toBeNull();
}

/** Destroys every enemy but `keep` outside a step, and drops group 2's queue entry. */
function clearAllBut(state: WorldState, keep: number): Entity[] {
  state.spawn.queue.length = 0;
  const context = contextOf(state);
  const left = enemies(state);
  for (const entity of left.slice(keep)) destroy(context, entity);
  return left.slice(0, keep);
}

const ofType = <Type extends DomainEvent['type']>(events: readonly DomainEvent[], type: Type) =>
  events.filter((event): event is Extract<DomainEvent, { type: Type }> => event.type === type);

const FLOW_EVENTS = new Set(['all-clear', 'settlement-started', 'settlement-deferred', 'flight-message', 'result-latched', 'radio-flushed']);
const flowEvents = (events: readonly DomainEvent[]): DomainEvent[] => events.filter(({ type }) => FLOW_EVENTS.has(type));

/** Steps until the next tick with a flow event, at most `limit` ticks; returns those events and how many ticks it took. */
function stepToFlowEvent({ world }: Run, limit: number): { readonly ticks: number; readonly events: DomainEvent[] } {
  for (let ticks = 1; ticks <= limit; ticks++) {
    const events = flowEvents(world.step(tickInput()));
    if (events.length > 0) return { ticks, events };
  }
  throw new Error(`no flow event in ${limit} ticks`);
}

/** The run with its last enemy destroyed by the player inside a formal step; returns that step's events. */
function endMission(run: Run): readonly DomainEvent[] {
  const [last] = clearAllBut(run.state, 1);
  return stepWith(run.state, { 'request-handling': (context) => destroyByPlayer(context, last) });
}

describe('the all-clear entry (ME-08)', () => {
  it('ends the mission at the player\'s kill of the last enemy: status, spawning, and all-clear right after its destruction', () => {
    const run = newRun();
    const { state } = run;
    const [last] = clearAllBut(state, 1);
    expect([state.missionStatus, state.spawn.enabled]).toEqual(['built', true]);
    const events = stepWith(state, { 'request-handling': (context) => destroyByPlayer(context, last) });
    const index = events.findIndex((event) => event.type === 'all-clear');
    expect(events[index - 1]).toMatchObject({ type: 'object-destroyed', entityId: last.id, eventClass: 0 });
    expect(events[index]).toEqual({ type: 'all-clear', tick: state.tick, entityId: last.id, kindBit: last.kindBit, eventClass: 0 });
    expect(ofType(events, 'all-clear')).toHaveLength(1);
    expect([state.missionStatus, state.spawn.enabled, state.flow.mainState]).toEqual(['ended', false, 3]);
    expect(run.world.projection().result).toEqual({ readiness: 'ready', outcome: 'in-progress' });
  });

  it('also at any other destruction (class 1)', () => {
    const run = newRun();
    const [last] = clearAllBut(run.state, 1);
    const events = stepWith(run.state, { 'request-handling': (context) => destroy(context, last) });
    expect(ofType(events, 'all-clear')).toEqual([{ type: 'all-clear', tick: run.state.tick, entityId: last.id, kindBit: last.kindBit, eventClass: 1 }]);
  });

  it('and at a world exit (class 2), right after object-left-world', () => {
    // The world exit of a parked craft of record 3 at clock 200 (as in mission-events.test.ts), the last enemy left.
    const { state } = newRun();
    const position = { x: 44900.25, y: 0, z: -1e6 };
    const source: EntitySource = { collection: 'mission', index: 3, group: null };
    const leaving = state.entities.allocate(entityInit(7, { activity: 'parked', position, source }));
    leaving.state = 'active';
    leaving.ai = { ...leaving.ai, mode: 0, goal: position };
    state.spawn.queue.length = 0;
    for (const entity of enemies(state)) if (entity !== leaving) destroy(contextOf(state), entity);
    expect(state.missionStatus).toBe('built');
    state.clock = 198;
    state.tick = 99;
    const context = contextOf(state);
    state.clock = 200;
    state.tick = context.time.tick;
    updateParked(context, () => {});
    const left = context.events.findIndex((event) => event.type === 'object-left-world');
    expect(context.events.slice(left)).toEqual([
      { type: 'object-left-world', tick: 100, entityId: leaving.id, kindBit: 7, source },
      { type: 'all-clear', tick: 100, entityId: leaving.id, kindBit: 7, eventClass: 2 },
    ]);
    expect(state.missionStatus).toBe('ended');
  });

  it('waits for a queued group, however far its due, and for any live enemy, in any activity', () => {
    const run = newRun();
    const { state } = run;
    // Group 2 is still queued, due at 300 s.
    for (const entity of enemies(state)) destroy(contextOf(state), entity);
    expect(state.spawn.queue.map(({ source, index }) => [source, index])).toEqual([['group', 2]]);
    expect([state.missionStatus, state.spawn.enabled]).toEqual(['built', true]);

    const second = newRun().state;
    const [parked, docked, last] = clearAllBut(second, 3);
    parked.activity = 'parked';
    docked.activity = 'docked';
    const context = contextOf(second);
    destroy(context, last);
    destroy(context, docked);
    expect(second.missionStatus).toBe('built');
    destroy(context, parked);
    expect(ofType(context.events, 'all-clear').map(({ entityId }) => entityId)).toEqual([parked.id]);
  });

  it('no longer counts an enemy pending removal; counts a sourceless one, whose own destruction never runs the test', () => {
    const { state } = newRun();
    const [pending, last] = clearAllBut(state, 2);
    pending.state = 'pending-removal';
    const sourceless = state.entities.allocate(entityInit(8));
    const context = contextOf(state);
    destroy(context, last);
    expect(state.missionStatus).toBe('built');
    // Neither a sourceless enemy nor a base (outside the entry set) runs the test: the mission never ends.
    destroy(context, sourceless);
    destroy(context, sourced(state, 7)[0]);
    expect([state.missionStatus, ofType(context.events, 'all-clear')]).toEqual(['built', []]);
  });

  it('never runs at an instantiation (type 3), even of the only enemy left', () => {
    const { state } = newRun();
    const [last] = clearAllBut(state, 1);
    const context = contextOf(state);
    reportObjectEvent(context, last, 3);
    expect([state.missionStatus, state.spawn.enabled, ofType(context.events, 'all-clear')]).toEqual(['built', true, []]);
    reportObjectEvent(context, last, 2);
    expect(state.missionStatus).toBe('ended');
  });

  it('counts kind 13 for the entry but not as remaining, and runs once: a later enemy event only counts', () => {
    const { state } = newRun();
    const [last] = clearAllBut(state, 1);
    const kind13 = state.entities.allocate(entityInit(13, { source: { collection: 'mission', index: 3, group: null } }));
    const context = contextOf(state);
    destroy(context, last);
    expect(ofType(context.events, 'all-clear').map(({ entityId }) => entityId)).toEqual([last.id]);
    const late = state.entities.allocate(entityInit(7, { source: { collection: 'mission', index: 3, group: null } }));
    destroy(context, late);
    destroy(context, kind13);
    expect(ofType(context.events, 'all-clear')).toHaveLength(1);
    expect(state.missionEvents.triggers[1].destroyed).toBe(2 + 2);
  });
});

describe('the mission flow: settlement, completion and result (ME-05, ME-07)', () => {
  it('runs 3→4 at the next poll, the completion 161 ticks later, the latch 481 after that, each strictly past its due', () => {
    const run = newRun();
    const { state, world } = run;
    const allClear = endMission(run);
    const clearTick = state.tick;
    expect(flowEvents(allClear).map(({ type }) => type)).toEqual(['all-clear']);

    const settlement = stepToFlowEvent(run, 1);
    const due4 = state.clock - 2 + 0x140;
    expect(settlement.events).toEqual([{
      type: 'settlement-started', tick: clearTick + 1, outcome: 'success', summary: { mission: MISSION, trigger: 0, range: 1 }, summarySelector: 0,
      dueClock: due4,
    }]);
    expect(state.flow).toMatchObject({ mainState: 4, subState: 0, settlementDeadline: due4, settlement: { outcome: 'success', summarySelector: 0 } });
    expect(world.projection().mission.phase).toBe('settlement-wait');

    // c′ = due at tick + 160 does not pass; the completion comes at + 161.
    const completion = stepToFlowEvent(run, 200);
    expect(completion.ticks).toBe(161);
    expect(completion.events.map(({ type }) => type)).toEqual(['radio-flushed', 'flight-message']);
    expect(completion.events).toMatchObject([{ cause: 'completion-message' }, { message: 'missionComplete', tick: clearTick + 162 }]);
    const due5 = state.clock - 2 + 0x3c0;
    expect(state.flow).toMatchObject({ mainState: 5, settlementDeadline: due5 });
    expect(world.projection()).toMatchObject({ mission: { phase: 'result-delay', status: 'ended' }, result: { outcome: 'in-progress' } });

    const result = stepToFlowEvent(run, 600);
    expect(result.ticks).toBe(481);
    const latchTick = clearTick + 162 + 481;
    expect(result.events).toEqual([
      expect.objectContaining({ type: 'radio-flushed', cause: 'result-due' }),
      {
        type: 'result-latched', tick: latchTick, result: {
          outcome: 'success', reason: { type: 'all-clear' }, summary: { mission: MISSION, trigger: 0, range: 1 }, rescuesUsed: 0,
          endingGaps: [{ gap: 'G-02/8', variant: 'wingman' }], playerKills: 1, latchTick,
        },
      },
    ]);
    // The teardown starts in the latch's tick (P3-11/14), main state 1.
    expect(state.flow).toMatchObject({ mainState: 1, rescues: 0, result: (result.events[1] as { result: unknown }).result });
    // The result stays private until the teardown completes (ME-14).
    expect(world.projection()).toMatchObject({ mission: { phase: 'teardown' }, result: { readiness: 'ready', outcome: 'in-progress' } });

    // The next tick completes the run: no further flow event, one completion message and one latch in the run.
    const last = world.step(tickInput());
    expect(flowEvents(last)).toEqual([]);
    expect(ofType(last, 'mission-completed')).toEqual([{ type: 'mission-completed', tick: latchTick + 1, outcome: 'success' }]);
    expect(state.flow.completedTick).toBe(latchTick + 1);
  });

  it('compares strictly with any step: c′ equal to the due waits one more tick', () => {
    const run = newRun({ wingman: 0, clockUnitsPerTick: 0x140 });
    endMission(run);
    expect(stepToFlowEvent(run, 1).events[0]).toMatchObject({ type: 'settlement-started' });
    // c′ = due at the next tick; past it at the one after.
    expect(stepToFlowEvent(run, 5).ticks).toBe(2);
    // State 5's 0x3C0 is three steps of 0x140: c′ = due after 3, past it after 4.
    expect(stepToFlowEvent(run, 10)).toMatchObject({ ticks: 4, events: [{ cause: 'result-due' }, { type: 'result-latched' }] });
  });

  it('polls only in sub-state 0: sub-states 1–5 hold the settlement until the flow returns to 0', () => {
    for (const subState of [1, 2, 3, 4, 5] as const) {
      const run = newRun();
      const { state } = run;
      endMission(run);
      const base = sourced(state, 7)[0];
      state.flow.subState = subState;
      // A valid docking object and a far deadline keep the docking sub-states where they are (DK1).
      state.player.dockingObject = base.id;
      state.flow.dockingDeadline = 1e9;
      // A far beacon due keeps sub-state 1 waiting (P3-11/11).
      state.flow.beaconDeadline = 1e9;
      for (let tick = 0; tick < 200; tick++) expect(flowEvents(run.world.step(tickInput()))).toEqual([]);
      expect([state.flow.mainState, state.flow.subState, state.flow.settlement]).toEqual([3, subState, null]);
      state.flow.subState = 0;
      state.player.dockingObject = null;
      expect(stepToFlowEvent(run, 1).events[0]).toMatchObject({ type: 'settlement-started', tick: state.tick, dueClock: state.clock - 2 + 0x140 });
    }
  });

  it('defers state 4 by 0x140 from c′ while the view is Warp (1) at its due, without the completion message', () => {
    const run = newRun();
    const { state } = run;
    endMission(run);
    stepToFlowEvent(run, 1);
    // Every tick until the due, then three dues in the Warp view: the mission flow reads view mode 1 exactly.
    for (let tick = 0; tick < 160; tick++) expect(flowEvents(run.world.step(tickInput()))).toEqual([]);
    const restore = { clock: (context: TickContext) => void (context.world.player.viewMode = 0xc) };
    for (let deferral = 0; deferral < 3; deferral++) {
      const events = stepWith(state, { 'mission-flow': (context) => void (context.world.player.viewMode = 1), ...restore });
      const dueClock = state.clock - 2 + 0x140;
      expect(flowEvents(events)).toEqual([{ type: 'settlement-deferred', tick: state.tick, dueClock }]);
      expect(state.flow).toMatchObject({ mainState: 4, settlementDeadline: dueClock });
      for (let tick = 0; tick < 160; tick++) {
        expect(flowEvents(stepWith(state, { 'mission-flow': (context) => void (context.world.player.viewMode = 1), ...restore }))).toEqual([]);
      }
    }
    // Views other than 1 do not defer: the map (8) gets the completion message.
    const events = stepWith(state, { 'mission-flow': (context) => void (context.world.player.viewMode = 8), ...restore });
    expect(flowEvents(events).map(({ type }) => type)).toEqual(['radio-flushed', 'flight-message']);
    expect(state.flow.mainState).toBe(5);
  });

  it('freezes the summary at the pre-settlement: bases lost later change the counts, not the settlement or the result', () => {
    const run = newRun();
    const { state } = run;
    endMission(run);
    stepToFlowEvent(run, 1);
    const settlement = state.flow.settlement;
    const context = contextOf(state);
    for (const base of sourced(state, 7)) destroy(context, base);
    expect(state.missionEvents.triggers[0]).toEqual({ instantiated: 4, destroyed: 4, left: 0 });
    stepToFlowEvent(run, 200);
    const [, latched] = stepToFlowEvent(run, 600).events;
    expect(state.flow.settlement).toBe(settlement);
    expect(latched).toMatchObject({ result: { summary: { trigger: 0, range: 1 }, endingGaps: [{ gap: 'G-02/8' }] } });
  });

  it('adds the mission\'s own cutscene for a positive selector, after the return', () => {
    const run = newRun();
    const { state } = run;
    const context = contextOf(state);
    for (const base of sourced(state, 7)) destroy(context, base);
    endMission(run);
    expect(stepToFlowEvent(run, 1).events[0]).toMatchObject({ summary: { trigger: 0, range: 0 }, summarySelector: 16 });
    stepToFlowEvent(run, 200);
    expect(stepToFlowEvent(run, 600).events[1]).toMatchObject({
      result: { summary: { trigger: 0, range: 0 }, endingGaps: [{ gap: 'G-02/8', variant: 'wingman' }, { gap: 'G-02/9', row: 16 }] },
    });
  });

  it('settles without a summary when no range matches, and a trigger without instantiations or destructions is skipped', () => {
    const mission = flowMission();
    // Trigger 0 (the bases) has instantiations but its only range never matches; trigger 1's range would match ratio
    // 0, but only group 2's member 5 counts on it, and endMission drops group 2 from the queue.
    mission.eventTriggers[0].ranges = [{ lower: 5, upper: 4, messages: [], summarySelector: 13 }];
    mission.declarations[3].eventTrigger = null;
    mission.declarations[5].eventTrigger = 1;
    const run = newRun({ wingman: 0 }, mission);
    endMission(run);
    expect(stepToFlowEvent(run, 1).events[0]).toMatchObject({ outcome: 'success', summary: null, summarySelector: -1 });
  });
});

describe('the return variant and the latch (ME-05)', () => {
  /** A run in state 5 whose due passes at the next step. */
  function dueRun(run = newRun()): Run {
    endMission(run);
    stepToFlowEvent(run, 1);
    run.state.flow.mainState = 5;
    run.state.flow.settlementDeadline = run.state.clock - 1;
    return run;
  }

  /** The return variant with the wingman changed only while the mission flow reads it. */
  const variant = (run: Run, change: Partial<Entity>): unknown => {
    // The wingman's list is kind bit 1 (mask 2).
    const [wingman] = run.state.entities.walk(2);
    const { activity, state, destroyed } = wingman;
    const events = stepWith(run.state, {
      'mission-flow': () => void Object.assign(wingman, change),
      clock: () => void Object.assign(wingman, { activity, state, destroyed }),
    });
    return ofType(events, 'result-latched')[0].result.endingGaps[0];
  };

  it('reads the wingman list head\'s object state (+3, 7 or 8), not its activity (+2)', () => {
    expect(variant(dueRun(), { activity: 'docked', state: 'active' })).toEqual({ gap: 'G-02/8', variant: 'wingman' });
    expect(variant(dueRun(), { activity: 'parked', state: 'projectile-hit' })).toEqual({ gap: 'G-02/8', variant: 'wingman' });
    for (const state of ['new', 'presentation-ready', 'destroyed-source', 'area-switch', 'pending-removal'] as const) {
      expect(variant(dueRun(), { activity: 'active', state })).toEqual({ gap: 'G-02/8', variant: 'solo' });
    }
    // The destroyed flag is not read either.
    expect(variant(dueRun(), { destroyed: true })).toEqual({ gap: 'G-02/8', variant: 'wingman' });
  });

  it('is solo without a wingman', () => {
    const run = dueRun(newRun({}));
    const events = run.world.step(tickInput());
    expect(ofType(events, 'result-latched')[0].result.endingGaps).toEqual([{ gap: 'G-02/8', variant: 'solo' }]);
  });

  it('captures the rescue count and the kill total, then clears the count; a second latch is a fault', () => {
    const run = dueRun();
    const { state } = run;
    state.flow.rescues = 2;
    Object.assign(state.player, { kills: { ...state.player.kills, 7: 3, 16: 2, 19: 1 } });
    const [latched] = ofType(run.world.step(tickInput()), 'result-latched');
    expect(latched.result).toMatchObject({ rescuesUsed: 2, playerKills: 3 + 2 + 1, latchTick: state.tick });
    // The teardown follows in the same tick (P3-11/14).
    expect([state.flow.rescues, state.flow.mainState, Object.isFrozen(state.flow.result)]).toEqual([0, 1, true]);
    expectFault(() => latch(contextOf(state), { type: 'all-clear' }), 'invariant-violated', 'mission-flow.latch');
  });

  it('latches a third loss in state 3 with its loss kind, only with both rescues used and the mission ended (P3-11/12)', () => {
    const { state } = newRun();
    state.flow.rescues = 2;
    expectFault(() => latch(contextOf(state), { type: 'third-loss', loss: 'energy' }), 'invariant-violated', 'mission-flow.latch');
    state.missionStatus = 'ended';
    state.flow.rescues = 1;
    expectFault(() => latch(contextOf(state), { type: 'third-loss', loss: 'energy' }), 'invariant-violated', 'mission-flow.latch');
    state.flow.rescues = 2;
    // State 3 latches no settlement reason.
    expectFault(() => latch(contextOf(state), { type: 'settlement-failed' }), 'invariant-violated', 'mission-flow.latch');
    const context = contextOf(state);
    latch(context, { type: 'third-loss', loss: 'energy' });
    expect(ofType(context.events, 'result-latched')[0].result).toEqual({
      outcome: 'failure', reason: { type: 'third-loss', loss: 'energy' }, summary: null, rescuesUsed: 2,
      endingGaps: [{ gap: 'G-02/7', variant: 'energy' }], playerKills: 0, latchTick: context.time.tick,
    });
    expect([state.flow.rescues, state.flow.mainState]).toEqual([0, 0]);
  });

  it('latches in state 5 only the settlement\'s own outcome, and no third loss', () => {
    const { state } = dueRun();
    for (const reason of [{ type: 'settlement-failed' }, { type: 'third-loss', loss: 'destroyed' }] as const) {
      expectFault(() => latch(contextOf(state), reason), 'invariant-violated', 'mission-flow.latch');
    }
  });

  it('faults in states 4 and 5 without a settlement', () => {
    const run = newRun();
    run.state.flow.mainState = 4;
    expectFault(() => run.world.step(tickInput()), 'invariant-violated', 'mission-flow.settlement');
  });
});

describe('the state-5 failure race (ME-17 decision 1)', () => {
  /** A run whose last enemy is destroyed in the step that takes group 2 off the queue, before or after that. */
  function race(killStage: 'request-handling' | 'spawn-queue-check'): Run & { readonly events: readonly DomainEvent[] } {
    const run = newRun();
    const { state } = run;
    const [last] = enemies(state);
    for (const entity of enemies(state).slice(1)) destroy(contextOf(state), entity);
    // Group 2 falls due at this step's clock.
    const [entry] = state.spawn.queue;
    state.spawn.queue[0] = { ...entry, due: state.clock + 1 };
    // A kill in request handling comes before the spawn requests (a missile's detonation); one before the queue check
    // stands for a destruction in the object updates.
    const events = stepWith(state, { [killStage]: (context: TickContext) => destroyByPlayer(context, last) });
    return { ...run, events };
  }

  it('ends the mission while the taken request is unhandled; the group still arrives, and the pre-settlement fails', () => {
    const run = race('request-handling');
    const { state, events } = run;
    expect(ofType(events, 'all-clear')).toHaveLength(1);
    expect(ofType(events, 'object-instantiated').filter(({ kindBit }) => kindBit === 7)).toHaveLength(6);
    expect([state.missionStatus, state.spawn.enabled, state.spawn.queue]).toEqual(['ended', false, []]);

    expect(stepToFlowEvent(run, 1).events).toEqual([expect.objectContaining({ type: 'settlement-started', outcome: 'failure', summary: null, summarySelector: -1 })]);
    // The completion message is still posted.
    expect(stepToFlowEvent(run, 200).events.map(({ type }) => type)).toEqual(['radio-flushed', 'flight-message']);
    const [flush, latched] = stepToFlowEvent(run, 600).events;
    expect(flush).toMatchObject({ cause: 'result-due' });
    expect(latched).toMatchObject({
      result: { outcome: 'failure', reason: { type: 'settlement-failed' }, summary: null, endingGaps: [{ gap: 'G-02/7', variant: 'destroyed' }] },
    });
  });

  it('does not end the mission when the last kill comes before the queue check', () => {
    const { state, events } = race('spawn-queue-check');
    expect(ofType(events, 'all-clear')).toEqual([]);
    expect(state.missionStatus).toBe('built');
  });
});

describe('the event order (ME-13)', () => {
  /**
   * Every event from the all-clear's tick up to the tick before the latch. The comparator requires the teardown in the
   * latch's tick (P3-11/14), so the latch tick itself is checked here only for the latch right after its flush.
   */
  function eventsBeforeLatch(run: Run, allClear: readonly DomainEvent[]): DomainEvent[] {
    const events = [...allClear];
    for (;;) {
      const tick = run.world.step(tickInput());
      if (ofType(tick, 'result-latched').length > 0) {
        // The latch comes right after its flush.
        const index = tick.findIndex(({ type }) => type === 'result-latched');
        expect(tick[index - 1]).toMatchObject({ type: 'radio-flushed', cause: 'result-due' });
        return events;
      }
      events.push(...tick);
    }
  }

  const replayResult = (events: readonly DomainEvent[], finalTick: number) =>
    ({ events, checkpoints: [{ tick: 0, hash: '0'.repeat(16) }, { tick: finalTick, hash: '1'.repeat(16) }], finalTick });

  it('passes the replay comparator\'s order check up to the latch, in a successful run and in the failure race', () => {
    const run = newRun();
    const events = eventsBeforeLatch(run, endMission(run));
    expect(ofType(events, 'flight-message')).toHaveLength(1);
    const result = replayResult(events, run.state.tick);
    expect(compareReplayResults(result, result)).toEqual({ match: true });

    const { state, world } = newRun();
    const [last] = enemies(state);
    for (const entity of enemies(state).slice(1)) destroy(contextOf(state), entity);
    state.spawn.queue[0] = { ...state.spawn.queue[0], due: state.clock + 1 };
    const allClear = stepWith(state, { 'request-handling': (context) => destroyByPlayer(context, last) });
    const raced = eventsBeforeLatch({ state, world }, allClear);
    const racedResult = replayResult(raced, state.tick);
    expect(compareReplayResults(racedResult, racedResult)).toEqual({ match: true });
  });
});
