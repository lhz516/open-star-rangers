import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import { chainInput, chainScript, OPEN_TICK, PLAYER_ID, WARP_TICK } from '../replay/map-warp.test-support.ts';
import { compareReplayResults } from '../replay/compare.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { initialWorldState } from '../world/create-world.ts';
import type { Entity } from '../world/entity-table.ts';
import { COCKPIT_VIEW_MODE } from '../world/player-state.ts';
import { constructWorld, type World } from '../world/world.ts';
import { addPlayerEntity, testState, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { enterBaseView } from './base-interior.test-support.ts';
import { applyContactDamage } from './damage.ts';
import { PIPELINE, registerTick, type TickContext } from './pipeline.ts';
import { BEACON_WAIT, destroyPlayer, startBeaconWait } from './player-loss.ts';
import { addActive, BASE_KIND_BIT, HOSTILE_KIND_BIT, radioItem, radioScene, type RadioScene } from './radio.test-support.ts';

// docs/plan/p3/02/spec.md, ME-03, ME-07, ME-09 and ME-13; docs/plan/p3/11/spec.md, 玩家损失 (S-04, AC-04, AC-05);
// docs/original/formats/executable.md, destruction entry 0x32d74 and energy loss and the beacon wait (P3-11/02). The
// player dies through the real damage entry inside a formal tick (a collision's contact damage, or P3-10's docked
// scene's missile in docked-systems.test.ts); the map and Warp cases run P3-09's created synthetic chain
// (map-warp.test-support.ts) to the map or the Warp first. Expected ticks and clocks are worked out by hand: a tick is 2
// clock units unless set otherwise, the mission flow reads the previous tick's clock c′, and the beacon's due is
// reached at c′ ≥ due (non-strict). The loss handling and the rescue that end a loss are rescue.ts's (rescue.test.ts);
// where a test runs past the escape pod's expiry or the beacon's due, it checks only that one rescue ends the loss.

const DESTRUCTION_VIEW = 0x11;
const WARP_VIEW = 1;
const MAP_VIEW = 8;
const ENERGY_PAGE = 1;
const WARP_PAGE = 6;

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

/** A formal tick in which `player` takes a deadly collision. */
function destroyInTick(state: WorldState, player: Entity): readonly DomainEvent[] {
  Object.assign((player as CraftEntity).combat, { shield: 0, hull: 1 });
  return stepWith(state, { collision: (context) => applyContactDamage(context, player, 5, 'collision') });
}

const contextOf = (state: WorldState): TickContext => registerTick(state, readTickInput(tickInput()));
const ofType = <Type extends DomainEvent['type']>(events: readonly DomainEvent[], type: Type) =>
  events.filter((event): event is Extract<DomainEvent, { type: Type }> => event.type === type);
const craftOf = (entity: Entity) => (entity as CraftEntity).combat;

/** The events from the player's `object-destroyed` on. */
function fromDestruction(events: readonly DomainEvent[], player: Entity): readonly DomainEvent[] {
  const index = events.findIndex((event) => event.type === 'object-destroyed' && event.entityId === player.id);
  expect(index).toBeGreaterThanOrEqual(0);
  return events.slice(index);
}

/** The events of a run from tick 1 to `finalTick`, as a replay result whose order the comparator checks. */
const replayResult = (events: readonly DomainEvent[], finalTick: number) =>
  ({ events, checkpoints: [{ tick: 0, hash: '0'.repeat(16) }, { tick: finalTick, hash: '1'.repeat(16) }], finalTick });

function expectContractOrder(events: readonly DomainEvent[], finalTick: number): void {
  const result = replayResult(events, finalTick);
  expect(compareReplayResults(result, result)).toEqual({ match: true });
}

/** P3-09's synthetic chain world, stepped through `ticks` of its script, with every event kept. */
function chainRun(ticks: number): { readonly state: WorldState; readonly world: World; readonly player: Entity; readonly log: DomainEvent[] } {
  const state = initialWorldState(chainInput());
  const world = constructWorld(state);
  const log: DomainEvent[] = [];
  for (let tick = 1; tick <= ticks; tick++) log.push(...world.step(chainScript(tick)));
  const player = state.entities.get(PLAYER_ID);
  if (player === undefined) throw new Error('no player');
  return { state, world, player, log };
}

/**
 * The player's energy runs out at the update due at the next tick's clock and stays out: with a full charge (above any
 * record's maximum, so that the charge recharge does not run) and no commanded speed, nothing changes the energy.
 */
function depleteNow(state: WorldState, player: Entity): void {
  Object.assign(craftOf(player), { energy: 0, charge: 2 ** 30, nextEnergyClock: state.clock + state.config.clockUnitsPerTick });
}

/** The player entity's declaration, whose runtime record a rescue rewrites (rescue.ts). */
const PLAYER_SOURCE = Object.freeze({ collection: 'mission', index: 0, group: null } as const);

/** The radio scene with the player's source set, so that a loss may end in a rescue. */
function rescuableScene(): RadioScene {
  const scene = radioScene();
  Object.assign(scene.player, { source: PLAYER_SOURCE });
  return scene;
}

/** The rescuable scene after its first tick, which gives the player its resources; its world steps on from tick 2. */
function readyScene(): RadioScene & { readonly world: World } {
  const scene = rescuableScene();
  const world = constructWorld(scene.state);
  world.step(tickInput());
  return { ...scene, world };
}

describe('the destruction entry 0x32d74 (ME-09; AC-04)', () => {
  it('in flight: sub-state 2, the flush, the view 0x11/8 written twice, target and docking object cleared, in the contract\'s event order', () => {
    const scene = radioScene();
    const { state, player } = scene;
    const hostile = addActive(scene, HOSTILE_KIND_BIT);
    state.player.target = hostile.id;
    state.player.dockingObject = hostile.id;
    state.player.leftDisplay.page = ENERGY_PAGE;
    state.communications.queue.push(radioItem({ table: 20011, face: 0, index: 1 }, 1e9));
    Object.assign(state.flow, { rescues: 1, dockingDeadline: 77, beaconDeadline: 88, wingmanLoss: { pending: true, dueClock: 1e9 } });
    const flowBefore = structuredClone(state.flow);
    const events = destroyInTick(state, player);
    expect(fromDestruction(events, player).slice(0, 4)).toEqual([
      expect.objectContaining({ type: 'object-destroyed', entityId: player.id, outcome: 'delayed' }),
      { type: 'left-page-changed', tick: 1, page: 0, previousPage: ENERGY_PAGE, commandIndex: null },
      { type: 'radio-flushed', tick: 1, cause: 'player-destroyed', removed: 1, interrupted: 'none' },
      { type: 'player-loss-started', tick: 1, playerEntityId: player.id, loss: 'destroyed', previousSubState: 0, previousViewMode: COCKPIT_VIEW_MODE, viewSwitched: true },
    ]);
    // The target is cleared without target-changed (CR-06 decision 6).
    expect(ofType(events, 'target-changed')).toEqual([]);
    const { player: ps } = state;
    expect([ps.viewMode, ps.previousViewMode, ps.subMode, ps.target, ps.dockingObject, state.communications.queue]).toEqual([DESTRUCTION_VIEW, DESTRUCTION_VIEW, 8, null, null, []]);
    // Only the sub-state changes in the flow; the activity, the Warp and the status stay.
    expect(state.flow).toEqual({ ...flowBefore, subState: 2 });
    expect([player.activity, player.inWarp, player.warpClock, state.missionStatus]).toEqual(['active', false, 0, 'built']);
    expectContractOrder(events, 1);
  });

  it('enters once: in sub-state 2, in main states 4 and 5 and in view 0x11 with sub-mode 8 as the original\'s branches say', () => {
    const { state, player } = radioScene();
    state.flow.subState = 2;
    const context = contextOf(state);
    destroyPlayer(context, player);
    expect([context.events, state.player.viewMode]).toEqual([[], COCKPIT_VIEW_MODE]);
    for (const mainState of [4, 5] as const) {
      Object.assign(state.flow, { mainState, subState: 0 });
      destroyPlayer(context, player);
      startBeaconWait(context, player);
      expect([context.events, state.flow.subState, state.player.viewMode]).toEqual([[], 0, COCKPIT_VIEW_MODE]);
    }
    // Already in view 0x11 with sub-mode 8 (unreachable in normal play): no view writes, the rest as ever.
    Object.assign(state.flow, { mainState: 3, subState: 0 });
    Object.assign(state.player, { viewMode: DESTRUCTION_VIEW, previousViewMode: 3, subMode: 8, target: 9 });
    destroyPlayer(context, player);
    expect(context.events.at(-1)).toEqual({
      type: 'player-loss-started', tick: 1, playerEntityId: player.id, loss: 'destroyed', previousSubState: 0, previousViewMode: DESTRUCTION_VIEW, viewSwitched: false,
    });
    expect([state.flow.subState, state.player.previousViewMode, state.player.target]).toEqual([2, 3, 9]);
  });

  it('in main states 4 and 5 neither destruction nor depletion starts a loss: the flow runs on to its message', () => {
    for (const mainState of [4, 5] as const) {
      const { state, player, world } = readyScene();
      Object.assign(state, { missionStatus: 'ended' });
      Object.assign(state.flow, { mainState, settlement: { outcome: 'success', summary: null, summarySelector: -1 }, settlementDeadline: 40 });
      depleteNow(state, player);
      const depleted = world.step(tickInput());
      expect(ofType(depleted, 'energy-depleted')).toHaveLength(1);
      const destroyed = destroyInTick(state, player);
      const losses = [...depleted, ...destroyed].filter(({ type }) => type === 'player-loss-started' || type === 'radio-flushed' || type === 'flight-message');
      expect([losses, state.flow.subState, state.player.viewMode, player.destroyed]).toEqual([[], 0, COCKPIT_VIEW_MODE, true]);
      // State 4 still posts its completion message and state 5 latches at their dues (c′ = 42 > 40).
      const next: DomainEvent[] = [];
      for (let tick = 0; tick < 20; tick++) next.push(...world.step(tickInput()));
      expect(next.filter(({ type }) => type === 'flight-message' || type === 'result-latched').map(({ type }) => type)).toEqual([mainState === 4 ? 'flight-message' : 'result-latched']);
    }
  });

  it('with the map open: the destruction view replaces it, and neither the map toggle nor cockpit-front leaves it', () => {
    const { state, world, player, log } = chainRun(OPEN_TICK);
    expect(state.player.viewMode).toBe(MAP_VIEW);
    log.push(...destroyInTick(state, player));
    expect(ofType(log, 'player-loss-started')).toEqual([expect.objectContaining({ previousViewMode: MAP_VIEW, previousSubState: 0, viewSwitched: true })]);
    expect([state.player.viewMode, state.player.previousViewMode]).toEqual([DESTRUCTION_VIEW, DESTRUCTION_VIEW]);
    // MW-04's map exception needs the map: in 0x11 the toggle meets the unavailable player; F1 has no rule yet.
    const commands: Command[] = [{ type: 'toggle-map' }, { type: 'cockpit-front' }, { type: 'map-point', operation: 'select', right: 0.5, down: 0.5 }];
    const events = world.step(tickInput(commands));
    log.push(...events);
    expect(ofType(events, 'command-result').map(({ outcome, reason }) => [outcome, reason])).toEqual([
      ['ignored', 'player-unavailable'], ['rejected', 'not-implemented'], ['ignored', 'player-unavailable'],
    ]);
    expect([state.player.viewMode, state.flow.subState]).toEqual([DESTRUCTION_VIEW, 2]);
    expectContractOrder(log, state.tick);
  });

  it('in the Warp: abandoned with inWarp and its clock kept, and the saved page restored after the loss event', () => {
    const { state, world, player, log } = chainRun(WARP_TICK - 1);
    // The energy page is the page the Warp start saves.
    log.push(...world.step(tickInput([{ type: 'energy', operation: 'open' }])));
    log.push(...world.step(tickInput([{ type: 'request-warp' }])));
    expect(ofType(log, 'warp-started')).toHaveLength(1);
    for (let tick = 0; tick < 5; tick++) log.push(...world.step(tickInput()));
    expect([state.player.viewMode, state.player.leftDisplay.page, state.player.savedLeftPage, player.inWarp]).toEqual([WARP_VIEW, WARP_PAGE, ENERGY_PAGE, true]);
    const warpClock = player.warpClock;
    const events = destroyInTick(state, player);
    log.push(...events);
    const tick = state.tick;
    expect(fromDestruction(events, player).slice(1, 5)).toEqual([
      { type: 'left-page-changed', tick, page: 0, previousPage: WARP_PAGE, commandIndex: null },
      expect.objectContaining({ type: 'radio-flushed', cause: 'player-destroyed' }),
      expect.objectContaining({ type: 'player-loss-started', previousViewMode: WARP_VIEW, viewSwitched: true }),
      { type: 'left-page-changed', tick, page: ENERGY_PAGE, previousPage: 0, commandIndex: null },
    ]);
    expect([state.player.viewMode, state.player.previousViewMode, player.inWarp, player.warpClock]).toEqual([DESTRUCTION_VIEW, DESTRUCTION_VIEW, true, warpClock]);
    // The abandoned Warp never completes (MW-09), not even after the escape pod's rescue leaves 0x11 for 0xC.
    for (let step = 0; step < 700; step++) log.push(...world.step(tickInput()));
    expect(ofType(log, 'warp-completed')).toEqual([]);
    expect(ofType(log, 'player-rescued').map(({ loss }) => loss)).toEqual(['destroyed']);
    expect([state.player.viewMode, state.flow.subState, player.inWarp]).toEqual([COCKPIT_VIEW_MODE, 0, true]);
    expectContractOrder(log, state.tick);
  });

  it('in the docking wait: overrides sub-state 3, releases the object, flushes the base\'s reply; no docking follows', () => {
    const scene = rescuableScene();
    const { state, player } = scene;
    const base = addActive(scene, BASE_KIND_BIT);
    base.communications.face = 0;
    const world = constructWorld(state);
    const log = [...world.step(tickInput([{ type: 'communications', operation: 'open' }, { type: 'select-number', value: 1 }]))];
    log.push(...world.step(tickInput([{ type: 'select-number', value: 2 }])));
    // Tick 3 takes the base's reply (RQ6), still loading when the player dies in tick 4.
    log.push(...world.step(tickInput()));
    expect([ofType(log, 'docking-requested').length, ofType(log, 'radio-taken').length, state.flow.subState]).toEqual([1, 1, 3]);
    const deadline = state.flow.dockingDeadline;
    const events = destroyInTick(state, player);
    log.push(...events);
    expect(ofType(events, 'radio-flushed')).toEqual([expect.objectContaining({ cause: 'player-destroyed', removed: 0, interrupted: 'loading' })]);
    expect(ofType(events, 'player-loss-started')).toEqual([expect.objectContaining({ previousSubState: 3 })]);
    expect([state.flow.subState, state.player.dockingObject, state.flow.dockingDeadline, state.communications.queue]).toEqual([2, null, deadline, []]);
    for (let tick = 0; tick < 0x780; tick++) log.push(...world.step(tickInput()));
    const docking = new Set(['radio-taken', 'incoming-ended', 'docking-cancelled', 'docked']);
    expect(log.filter(({ type, tick }) => tick > 4 && docking.has(type))).toEqual([]);
    // The only transition is the escape pod's rescue (G-02/5), which ends the loss in sub-state 0.
    expect(ofType(log, 'transition').map(({ gap }) => gap)).toEqual(['G-02/5']);
    expect([state.flow.subState, player.activity, state.player.viewMode]).toEqual([0, 'active', COCKPIT_VIEW_MODE]);
    expectContractOrder(log, state.tick);
  });

  it('overrides a beacon wait: its due is never read again', () => {
    const { state, player, world } = readyScene();
    depleteNow(state, player);
    const log = [...world.step(tickInput())];
    expect([state.flow.subState, state.flow.beaconDeadline]).toEqual([1, 4 + BEACON_WAIT]);
    log.push(...destroyInTick(state, player));
    expect(ofType(log, 'player-loss-started').map(({ loss, previousSubState }) => [loss, previousSubState])).toEqual([['energy', 0], ['destroyed', 1]]);
    // Well past the old due: no beacon flush; the loss ends once, on the escape pod's path.
    for (let tick = 0; tick < BEACON_WAIT; tick++) log.push(...world.step(tickInput()));
    expect(ofType(log, 'radio-flushed').map(({ cause }) => cause)).toEqual(['player-destroyed']);
    expect(ofType(log, 'player-rescued').map(({ loss, rescues }) => [loss, rescues])).toEqual([['destroyed', 1]]);
    expect(state.flow.subState).toBe(0);
    expectContractOrder([...log], state.tick);
  });
});

describe('the energy entry 0x33464 and the beacon wait (ME-07, ME-09; AC-05)', () => {
  it('starts at a depleted update in sub-state 0, after the update\'s events, and ends when c′ reaches sample + 0x3C0', () => {
    const { state, player, world } = readyScene();
    depleteNow(state, player);
    const log = [...world.step(tickInput())];
    // Tick 2 at clock 4: due 4 + 0x3C0 = 964.
    expect(log).toEqual([
      expect.objectContaining({ type: 'energy-depleted', tick: 2, entityId: player.id }),
      { type: 'flight-message', tick: 2, message: 'beacon' },
      { type: 'player-loss-started', tick: 2, playerEntityId: player.id, loss: 'energy', previousSubState: 0, deadlineClock: 964 },
    ]);
    expect([state.flow.subState, state.flow.beaconDeadline, state.player.viewMode]).toEqual([1, 964, COCKPIT_VIEW_MODE]);
    // Tick t reads c′ = 2(t − 1): 962 at tick 482 waits, 964 at tick 483 ends it. The depleted updates in between (each
    // 0x40 units) start nothing more.
    while (state.tick < 482) log.push(...world.step(tickInput()));
    expect(log.filter(({ type }) => type !== 'energy-depleted').length).toBe(2);
    expect(state.flow.subState).toBe(1);
    state.player.leftDisplay.page = ENERGY_PAGE;
    const expiry = world.step(tickInput());
    log.push(...expiry);
    expect(expiry.slice(0, 2)).toEqual([
      { type: 'left-page-changed', tick: 483, page: 0, previousPage: ENERGY_PAGE, commandIndex: null },
      { type: 'radio-flushed', tick: 483, cause: 'beacon-expired', removed: 0, interrupted: 'none' },
    ]);
    // The energy loss's handling follows at once: a rescue (rescue.test.ts) back to sub-state 0.
    expect(ofType(expiry, 'player-rescued').map(({ loss }) => loss)).toEqual(['energy']);
    expect(state.flow.subState).toBe(0);
    expectContractOrder(log, state.tick);
  });

  it('compares non-strictly with any step: c′ equal to the due ends the wait', () => {
    const state = testState({ clockUnitsPerTick: 0x140 });
    const player = addPlayerEntity(state, { source: PLAYER_SOURCE });
    player.state = 'active';
    state.player.targeting!.autoTargetDueClock = 1e15;
    const world = constructWorld(state);
    world.step(tickInput());
    depleteNow(state, player);
    world.step(tickInput());
    // Tick 2 at clock 2 × 0x140: due 2 × 0x140 + 0x3C0 = 5 × 0x140, which tick 6 reads as c′.
    expect([state.flow.subState, state.flow.beaconDeadline]).toEqual([1, 5 * 0x140]);
    for (let tick = 3; tick <= 5; tick++) expect(ofType(world.step(tickInput()), 'radio-flushed')).toEqual([]);
    expect(ofType(world.step(tickInput()), 'radio-flushed')).toEqual([expect.objectContaining({ tick: 6, cause: 'beacon-expired' })]);
  });

  it('is overridden by a docking request from a menu built in sub-state 0; the time-out\'s sub-state 0 re-arms it at the next update', () => {
    const scene = radioScene();
    const { state, player } = scene;
    // Face 4 of 20011 has only entries of 0: the base never replies, so the wait times out.
    const base = addActive(scene, BASE_KIND_BIT);
    base.communications.face = 4;
    const world = constructWorld(state);
    // Tick 1 builds the base's command menu in sub-state 0; tick 2 (clock 4) runs out of energy.
    const log = [...world.step(tickInput([{ type: 'communications', operation: 'open' }, { type: 'select-number', value: 1 }]))];
    depleteNow(state, player);
    log.push(...world.step(tickInput()));
    expect([state.flow.subState, state.flow.beaconDeadline]).toEqual([1, 4 + BEACON_WAIT]);
    // Tick 3 (clock 6): code 9 sets sub-state 3 over the wait, due a reply by 6 + 0x780.
    log.push(...world.step(tickInput([{ type: 'select-number', value: 2 }])));
    expect(ofType(log, 'docking-requested')).toEqual([expect.objectContaining({ tick: 3, previousSubState: 1, deadlineClock: 6 + 0x780 })]);
    // The time-out reads c′ = 2(t − 1) ≥ 1926 at tick 964. The depleted updates come at clocks 4 + 64n; none in the
    // wait starts a beacon, and the old due 964 passes unread.
    while (state.tick < 964) log.push(...world.step(tickInput()));
    expect(ofType(log, 'docking-cancelled')).toEqual([expect.objectContaining({ tick: 964, cause: 'timeout' })]);
    expect(state.flow.subState).toBe(0);
    expect(log.filter(({ type, tick }) => tick > 2 && (type === 'player-loss-started' || type === 'radio-flushed'))).toEqual([]);
    // The next depleted update, at clock 4 + 64 × 31 = 1988 (tick 994), starts a new wait due 1988 + 0x3C0.
    while (state.tick < 993) log.push(...world.step(tickInput()));
    expect(state.flow.subState).toBe(0);
    const rearmed = world.step(tickInput());
    log.push(...rearmed);
    expect(ofType(rearmed, 'player-loss-started')).toEqual([expect.objectContaining({ tick: 994, loss: 'energy', deadlineClock: 1988 + BEACON_WAIT })]);
    expect([craftOf(player).energy, state.flow.subState]).toEqual([0, 1]);
    expectContractOrder(log, state.tick);
  });

  it('in the Warp: the view, the Warp and its completion go on', () => {
    // Late in the transit, so that the Warp completes before the wait's 0x3C0.
    const { state, world, player, log } = chainRun(WARP_TICK);
    while (state.tick < 400) log.push(...world.step(tickInput()));
    expect([state.player.viewMode, player.inWarp]).toEqual([WARP_VIEW, true]);
    depleteNow(state, player);
    const events = world.step(tickInput());
    log.push(...events);
    expect(ofType(events, 'player-loss-started')).toEqual([expect.objectContaining({ loss: 'energy' })]);
    expect([state.flow.subState, state.player.viewMode, player.inWarp]).toEqual([1, WARP_VIEW, true]);
    while (ofType(log, 'warp-completed').length === 0 && state.tick < 1000) log.push(...world.step(tickInput()));
    expect(ofType(log, 'warp-completed')).toHaveLength(1);
    expect([state.flow.subState, player.inWarp]).toEqual([1, false]);
    expectContractOrder(log, state.tick);
  });

  it('keeps the player flying while waiting: the map opens, the view is not switched (B-001)', () => {
    const { state, player, world } = readyScene();
    depleteNow(state, player);
    world.step(tickInput());
    expect(state.flow.subState).toBe(1);
    const events = world.step(tickInput([{ type: 'toggle-map' }]));
    expect(ofType(events, 'command-result')).toEqual([expect.objectContaining({ commandType: 'toggle-map', outcome: 'accepted' })]);
    expect([state.player.viewMode, state.flow.subState]).toEqual([MAP_VIEW, 1]);
  });

  it('starts nothing for a docked player, which has no energy update, nor outside sub-state 0', () => {
    const { state, player } = radioScene();
    player.activity = 'docked';
    enterBaseView(state);
    depleteNow(state, player);
    expect(constructWorld(state).step(tickInput()).filter(({ type }) => type === 'energy-depleted' || type === 'player-loss-started')).toEqual([]);
    expect(state.flow.subState).toBe(0);
    const context = contextOf(state);
    for (const subState of [2, 3, 4, 5] as const) {
      state.flow.subState = subState;
      startBeaconWait(context, player);
    }
    expect([context.events, state.flow.beaconDeadline]).toEqual([[], 0]);
  });
});
