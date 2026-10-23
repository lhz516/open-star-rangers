import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import { compareReplayResults } from '../replay/compare.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, commMessagesContent, worldInput } from '../world/create-world.test-support.ts';
import type { Entity } from '../world/entity-table.ts';
import { constructWorld, type World } from '../world/world.ts';
import { expectFault, tickInput, withEveryKindBound } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { applyContactDamage } from './damage.ts';
import { PIPELINE, registerTick, type TickContext } from './pipeline.ts';
import { BASE_KIND_BIT, WINGMAN_KIND_BIT } from './radio.test-support.ts';
import { startWingmanLossTimer } from './wingman-loss.ts';

// docs/plan/p3/02/spec.md, ME-03, ME-07, ME-09 and ME-13; docs/original/formats/executable.md, wingman-loss timer
// (P3-11/02) and C3. The slice-shaped mission (create-world.test-support.ts) with the wingman of roster entry 0. The
// timer is due 0x780 units after the destroying tick's clock; the mission flow compares the previous tick's clock c′
// with it, non-strictly, so with the production step of 2 units the test passes 0x780 / 2 + 1 = 961 ticks after the
// destruction. Expected ticks and clocks are worked out by hand from that.

const ALL_KINDS = 0xffffffff;
/** The slice's enemy kinds. */
const ENEMY_KIND_BITS = [7, 8];
const DELAY = 0x780;
/** The direct list's item 6 and the identity a queued item carries (no face). */
const LOSS_MESSAGE = { table: 20983, face: null, index: 6 };

/** The synthetic messages with the direct list's item 6 present, of two frames. */
function messagesWithLossItem() {
  const messages = commMessagesContent();
  const direct: unknown[] = [...messages.direct];
  while (direct.length < 6) direct.push({ present: false });
  direct.push({ present: true, frameDurations: [2, 7] });
  return { ...messages, direct };
}

interface Run {
  readonly state: WorldState;
  readonly world: World;
}

function newRun(commMessages: unknown = messagesWithLossItem()): Run {
  const input = worldInput({ run: { wingman: 0 }, commMessages });
  const state = withEveryKindBound(initialWorldState(asCreateInput(input)));
  const world = constructWorld(state);
  // The first step instantiates every entry due at 0, the wingman among them.
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

function wingmanOf(state: WorldState): Entity {
  const [wingman] = state.entities.walk(1 << WINGMAN_KIND_BIT);
  expect(wingman).toBeDefined();
  return wingman;
}

/** A tick in which `victim` is destroyed by a collision (class 1); returns its events. */
function destroyInTick(state: WorldState, victim: Entity): readonly DomainEvent[] {
  Object.assign((victim as CraftEntity).combat, { shield: 0, hull: 1 });
  return stepWith(state, { collision: (context) => void applyContactDamage(context, victim as CraftEntity, 5, 'collision') });
}

const enemiesOf = (state: WorldState): Entity[] => [...state.entities.walk(ALL_KINDS)].filter(({ kindBit }) => ENEMY_KIND_BITS.includes(kindBit));

/** The mission ended, as the all-clear leaves it (spawning off); in main state 4 or 5 with a successful settlement. */
function endMission(state: WorldState, mainState?: 4 | 5): void {
  state.missionStatus = 'ended';
  state.spawn.enabled = false;
  if (mainState === undefined) return;
  Object.assign(state.flow, { mainState, settlementDeadline: 1e9, settlement: { outcome: 'success', summary: null, summarySelector: -1 } });
}

const ofType = <Type extends DomainEvent['type']>(events: readonly DomainEvent[], type: Type) =>
  events.filter((event): event is Extract<DomainEvent, { type: Type }> => event.type === type);

const TIMER_EVENTS = new Set(['wingman-loss-timer-started', 'wingman-loss-timer-expired', 'radio-queued', 'settlement-started', 'all-clear']);
const timerEvents = (events: readonly DomainEvent[]): DomainEvent[] => events.filter(({ type }) => TIMER_EVENTS.has(type));

/** A pending timer whose due c′ reaches at the next step: c′ is then the current clock. */
function armDue(state: WorldState): void {
  Object.assign(state.flow.wingmanLoss, { pending: true, dueClock: state.clock });
}

describe('the timer\'s start, 0x32dec (ME-09)', () => {
  it('arms at the wingman\'s destruction, right after its object-destroyed, due 0x780 after this tick\'s clock', () => {
    const { state } = newRun();
    const wingman = wingmanOf(state);
    const events = destroyInTick(state, wingman);
    const index = events.findIndex(({ type }) => type === 'wingman-loss-timer-started');
    expect(events[index - 1]).toMatchObject({ type: 'object-destroyed', entityId: wingman.id, kindBit: 1, outcome: 'explodes' });
    // The damage stages run after the clock stage: state.clock is this tick's.
    expect(events[index]).toEqual({ type: 'wingman-loss-timer-started', tick: state.tick, wingmanEntityId: wingman.id, dueClock: state.clock + DELAY });
    expect(ofType(events, 'wingman-loss-timer-started')).toHaveLength(1);
    expect(state.flow.wingmanLoss).toEqual({ pending: true, dueClock: state.clock + DELAY });
  });

  it('arms only while no timer is pending: a later loss neither re-arms nor moves the due', () => {
    const { state } = newRun();
    const wingman = wingmanOf(state);
    Object.assign(state.flow.wingmanLoss, { pending: true, dueClock: 12345 });
    const events = destroyInTick(state, wingman);
    expect(ofType(events, 'object-destroyed')).toEqual([expect.objectContaining({ entityId: wingman.id })]);
    expect(ofType(events, 'wingman-loss-timer-started')).toEqual([]);
    expect(state.flow.wingmanLoss).toEqual({ pending: true, dueClock: 12345 });
  });

  it('arms for a parked wingman too, before its removal without an explosion, and in any main or sub-state', () => {
    const parked = newRun();
    const wingman = wingmanOf(parked.state);
    wingman.activity = 'parked';
    const events = destroyInTick(parked.state, wingman);
    expect(ofType(events, 'object-destroyed')).toEqual([expect.objectContaining({ entityId: wingman.id, outcome: 'removed' })]);
    expect(ofType(events, 'wingman-loss-timer-started')).toEqual([expect.objectContaining({ dueClock: parked.state.clock + DELAY })]);
    expect(wingman.state).toBe('pending-removal');

    for (const [mainState, subState] of [[3, 2], [3, 1], [4, 0], [5, 0], [0, 2]] as const) {
      const { state } = newRun();
      const victim = wingmanOf(state);
      Object.assign(state.flow, { subState, beaconDeadline: 1e9 });
      if (mainState !== 3) endMission(state, mainState === 0 ? 5 : mainState);
      state.flow.mainState = mainState;
      if (mainState === 0) state.flow.result = { outcome: 'success', reason: { type: 'all-clear' }, summary: null, rescuesUsed: 0, endingGaps: [], playerKills: 0, latchTick: 1 };
      const started = ofType(destroyInTick(state, victim), 'wingman-loss-timer-started');
      expect(started).toEqual([{ type: 'wingman-loss-timer-started', tick: state.tick, wingmanEntityId: victim.id, dueClock: state.clock + DELAY }]);
    }
  });

  it('is no general non-player branch: other kinds and the player do not arm it', () => {
    const { state } = newRun();
    const [enemy] = enemiesOf(state);
    expect(ofType(destroyInTick(state, enemy), 'object-destroyed')).toHaveLength(1);
    expect(state.flow.wingmanLoss).toEqual({ pending: false, dueClock: 0 });
  });

  it('faults when the due leaves the safe integer range', () => {
    const { state } = newRun();
    state.clock = Number.MAX_SAFE_INTEGER - DELAY - 1;
    const context = registerTick(state, readTickInput(tickInput()));
    expectFault(() => startWingmanLossTimer(context, wingmanOf(state)), 'budget-exhausted', 'wingman-loss.due');
    expect(state.flow.wingmanLoss).toEqual({ pending: false, dueClock: 0 });
  });
});

describe('the timer\'s test in sub-state 0 (ME-07)', () => {
  it('expires 961 ticks after the destruction, c′ ≥ due, and queues 20983\'s item 6 without a face or speaker', () => {
    const { state, world } = newRun();
    const log = [...destroyInTick(state, wingmanOf(state))];
    const destroyedTick = state.tick;
    const due = state.flow.wingmanLoss.dueClock;
    for (let tick = 1; tick <= 960; tick++) {
      const events = world.step(tickInput());
      expect(timerEvents(events)).toEqual([]);
      log.push(...events);
    }
    // c′ = due − 2 at tick + 960, = due at tick + 961.
    expect(state.flow.wingmanLoss).toEqual({ pending: true, dueClock: due });
    const events = world.step(tickInput());
    expect(state.tick).toBe(destroyedTick + 961);
    expect(state.clock - 2).toBe(due);
    const index = events.findIndex(({ type }) => type === 'wingman-loss-timer-expired');
    expect(events.slice(index - 1, index + 1)).toEqual([
      { type: 'radio-queued', tick: state.tick, message: LOSS_MESSAGE, callback: 'none', speaker: null, position: 'sorted', length: expect.any(Number) },
      { type: 'wingman-loss-timer-expired', tick: state.tick, queued: true },
    ]);
    expect(state.flow.wingmanLoss).toEqual({ pending: false, dueClock: due });
    // The whole chain passes the replay comparator's order check (ME-13).
    log.push(...events);
    const result = { events: log, checkpoints: [{ tick: 0, hash: '0'.repeat(16) }, { tick: state.tick, hash: '1'.repeat(16) }], finalTick: state.tick };
    expect(compareReplayResults(result, result)).toEqual({ match: true });
    // Once: the flag is clear, and the next loss can arm again.
    for (let tick = 0; tick < 20; tick++) expect(ofType(world.step(tickInput()), 'wingman-loss-timer-expired')).toEqual([]);
  });

  it('compares non-strictly with any step: c′ equal to the due expires, one less waits', () => {
    const { state, world } = newRun();
    Object.assign(state.flow.wingmanLoss, { pending: true, dueClock: state.clock + 2 });
    expect(timerEvents(world.step(tickInput()))).toEqual([]);
    expect(ofType(world.step(tickInput()), 'wingman-loss-timer-expired')).toEqual([{ type: 'wingman-loss-timer-expired', tick: state.tick, queued: true }]);
  });

  it('clears the flag without queueing when item 6 does not resolve', () => {
    // The default synthetic direct list has three items.
    const { state, world } = newRun(commMessagesContent());
    armDue(state);
    const events = world.step(tickInput());
    expect(timerEvents(events)).toEqual([{ type: 'wingman-loss-timer-expired', tick: state.tick, queued: false }]);
    expect(state.flow.wingmanLoss.pending).toBe(false);
  });

  it('is postponed in sub-states 1–5 and expires at the first tick back in 0', () => {
    for (const subState of [1, 2, 3, 4, 5] as const) {
      const { state, world } = newRun();
      // The bases reach an active object state, which keeps them valid docking objects.
      for (let tick = 0; tick < 5; tick++) world.step(tickInput());
      armDue(state);
      const due = state.clock;
      // A far beacon due keeps sub-state 1 waiting; a valid docking object and a far deadline keep 3–5 (DK1).
      const [base] = state.entities.walk(1 << BASE_KIND_BIT);
      Object.assign(state.flow, { subState, beaconDeadline: 1e9, dockingDeadline: 1e9 });
      state.player.dockingObject = base.id;
      for (let tick = 0; tick < 10; tick++) expect(ofType(world.step(tickInput()), 'wingman-loss-timer-expired')).toEqual([]);
      expect([state.flow.subState, state.flow.wingmanLoss]).toEqual([subState, { pending: true, dueClock: due }]);
      state.flow.subState = 0;
      state.player.dockingObject = null;
      expect(ofType(world.step(tickInput()), 'wingman-loss-timer-expired')).toEqual([expect.objectContaining({ tick: state.tick, queued: true })]);
    }
  });

  it('is never made outside main state 3', () => {
    for (const mainState of [4, 5] as const) {
      const { state, world } = newRun();
      armDue(state);
      endMission(state, mainState);
      for (let tick = 0; tick < 10; tick++) expect(ofType(world.step(tickInput()), 'wingman-loss-timer-expired')).toEqual([]);
      expect(state.flow.wingmanLoss.pending).toBe(true);
    }
  });
});

describe('the timer against the all-clear (ME-07)', () => {
  it('drops the message when the mission ended before the test: settlement-started, then never an expiry', () => {
    const { state, world } = newRun();
    armDue(state);
    const due = state.clock;
    endMission(state);
    state.spawn.queue.length = 0;
    for (const entity of enemiesOf(state)) entity.state = 'pending-removal';
    const events = timerEvents(world.step(tickInput()));
    expect(events.map(({ type }) => type)).toEqual(['settlement-started']);
    for (let tick = 0; tick < 2000 && state.flow.result === null; tick++) expect(ofType(world.step(tickInput()), 'wingman-loss-timer-expired')).toEqual([]);
    // The flag stays set and the due unread through states 4, 5, the latch and the teardown (P3-11/14).
    expect([state.flow.mainState, state.flow.wingmanLoss]).toEqual([1, { pending: true, dueClock: due }]);
  });

  it('queues it when the all-clear comes later in the due tick: the mission flow runs first, and settles at the next', () => {
    const { state } = newRun();
    armDue(state);
    state.spawn.queue.length = 0;
    const [last, ...others] = enemiesOf(state);
    for (const entity of others) entity.state = 'pending-removal';
    const events = timerEvents(destroyInTick(state, last));
    expect(events.map(({ type }) => type)).toEqual(['radio-queued', 'wingman-loss-timer-expired', 'all-clear']);
    expect(timerEvents(stepWith(state, {})).map(({ type }) => type)).toEqual(['settlement-started']);
  });
});

describe('the timer\'s lifetime (ME-03)', () => {
  it('starts unset in every new world, whatever an earlier world of the same input left', () => {
    const first = newRun();
    destroyInTick(first.state, wingmanOf(first.state));
    expect(first.state.flow.wingmanLoss.pending).toBe(true);
    const second = newRun();
    expect(second.state.flow.wingmanLoss).toEqual({ pending: false, dueClock: 0 });
  });
});
