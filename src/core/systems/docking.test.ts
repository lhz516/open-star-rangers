import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import { craftMovementBlock } from '../rules/flight-state.ts';
import { RandStream } from '../rules/original-random.ts';
import type { Entity, EntityInit, Matrix3 } from '../world/entity-table.ts';
import { COCKPIT_VIEW_MODE as FLIGHT } from '../world/player-state.ts';
import { constructWorld } from '../world/world.ts';
import { expectFault, stillEntityInit, TEST_BASE_MAXIMUM_SPEED, TEST_MAXIMUM_SPEED, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { depart, dock } from './docking.ts';
import { PIPELINE, registerTick, type RequestOf, type TickContext } from './pipeline.ts';
import { addActive, BASE_KIND_BIT, DOCKING_REPLY, pageChanged, radioItem, radioScene, snapshotOf, WINGMAN_KIND_BIT, type RadioScene } from './radio.test-support.ts';

const open: Command = { type: 'communications', operation: 'open' };
const digit = (value: number): Command => ({ type: 'select-number', value });
/** The base kind of the test menus' third category (create-world.test-support.ts); bit 17 is the second's. */
const OTHER_BASE_KIND_BIT = 18;
const UNITS = 2;
/** The f32 just below 1000. */
const BELOW_1000 = 1000 - 2 ** -14;
const BASE_ORIENTATION = Object.freeze([1, 0, 0, 0, 0, -1, 0, 1, 0]) as unknown as Matrix3;

/** A base the radio scene's player can dock at: face 0 preassigned, so its reply resolves without a draw. */
function addBase(scene: RadioScene, overrides: Partial<EntityInit> = {}, kindBit = BASE_KIND_BIT): Entity {
  const base = addActive(scene, kindBit, overrides);
  base.communications.face = 0;
  return base;
}

/** The scene in sub-state `subState` waiting on `object` until `deadline`, as the wait's writers leave it. */
function waiting({ state }: RadioScene, subState: 3 | 4 | 5, object: Entity, deadline: number): void {
  state.flow.subState = subState;
  state.flow.dockingDeadline = deadline;
  state.player.dockingObject = object.id;
}

/** Runs ticks of the formal step and returns each tick's events, the first tick's first. */
function run(state: WorldState, ticks: readonly (readonly Command[])[]): DomainEvent[][] {
  const world = constructWorld(state);
  return ticks.map((commands) => [...world.step(tickInput(commands))]);
}

/** Empty ticks until (and including) `tick`. */
const until = (state: WorldState, tick: number): Command[][] => Array.from({ length: tick - state.tick }, () => []);

/** Runs one tick's stages before request handling and returns its context, with the requests still pending. */
function beforeRequests(state: WorldState, commands: readonly Command[] = []): TickContext {
  const context = registerTick(state, readTickInput(tickInput(commands)));
  for (const stage of PIPELINE) {
    context.stage = stage.id;
    if (stage.id === 'request-handling') break;
    stage.run?.(context);
  }
  return context;
}

/**
 * P3-12's `view-switched` of a docking or launch in request handling (FS-03): `player` is the player entity's pose at
 * the switch, before a launch places it.
 */
const switched = (tick: number, fromViewMode: number, viewMode: number, player: Entity | { entityId: number; position: object; orientation: object }): DomainEvent => ({
  type: 'view-switched', tick, fromViewMode, fromSubMode: 0, viewMode, subMode: 0, stage: 'request-handling',
  player: 'id' in player ? { entityId: player.id, position: player.position, orientation: player.orientation } : player,
} as DomainEvent);

/** Calls `dock` in a context as request handling makes it, with this tick's clock, and returns that context. */
function runDock(state: WorldState): TickContext {
  const context = registerTick(state, readTickInput(tickInput()));
  context.stage = 'request-handling';
  dock(context);
  return context;
}

const cancelled = (scene: RadioScene, object: Entity, cause: 'timeout' | 'invalid-object' | 'gate', tick: number): DomainEvent =>
  ({ type: 'docking-cancelled', tick, playerEntityId: scene.player.id, dockingObject: object.id, cause });

describe('the docking chain through the formal step (CB-02, CB-09; RQ6)', () => {
  it('waits for the reply, counts 0x200 from its end and docks at the tick whose previous clock reaches the due, wingman included', () => {
    const scene = radioScene();
    const { state, player } = scene;
    const wingman = addActive(scene, WINGMAN_KIND_BIT, { position: { x: 900, y: 0, z: 0 } });
    const base = addBase(scene);
    // Category 1 is the wingman's, 2 the base's (its one object skips to the near command menu); item 2 is code 9.
    const [, request, reply, start] = run(state, [[open, digit(2)], [digit(2)], [], []]);
    expect(request).toContainEqual({ type: 'docking-requested', tick: 2, playerEntityId: player.id, dockingObject: base.id, previousSubState: 0, deadlineClock: 2 * UNITS + 0x780, commandIndex: 0 });
    expect(reply).toContainEqual({ type: 'radio-taken', tick: 3, message: { table: 20011, face: 0, index: 0 }, speaker: snapshotOf(base) });
    expect(start).toContainEqual(expect.objectContaining({ type: 'incoming-started', tick: 4 }));
    // The reply lasts 8 × (5 + 10 + 5) = 160 clock units from tick 4's clock: it ends at tick 4 + 80, due 0x200 later.
    const replyEnd = 4 + (8 * DOCKING_REPLY.reduce((sum, duration) => sum + duration, 0)) / UNITS;
    const ends = run(state, until(state, replyEnd));
    expect(ends.at(-1)).toContainEqual(expect.objectContaining({ type: 'incoming-ended', tick: replyEnd, callback: 'docking-reply', countdownStarted: true }));
    expect(state.flow).toEqual({ mainState: 3, subState: 4, dockingDeadline: replyEnd * UNITS + 0x200 });
    // Mission flow reads the previous clock: the tick after the one whose clock equals the due posts the docking.
    const dockTick = replyEnd + 0x200 / UNITS + 1;
    const countdown = run(state, until(state, dockTick - 1));
    expect(countdown.flat()).toEqual([]);
    expect(state.flow.subState).toBe(4);
    expect(player.activity).toBe('active');
    const [docking] = run(state, [[]]);
    expect(docking).toEqual([
      switched(dockTick, FLIGHT, 6, player),
      { type: 'docked', tick: dockTick, playerEntityId: player.id, baseEntityId: base.id, wingmanEntityId: wingman.id, previousViewMode: FLIGHT },
      { type: 'transition', tick: dockTick, gap: 'G-02/3' },
    ]);
    expect(state.flow.subState).toBe(5);
    expect(state.player.dockingObject).toBe(base.id);
    expect([player.activity, wingman.activity, state.player.viewMode]).toEqual(['docked', 'docked', 6]);
  });

  it('offers the docking command at 1000 units, where the menu gate passes, and then cancels at the strict execution gate', () => {
    const scene = radioScene();
    const { state } = scene;
    const base = addBase(scene, { position: { x: 1000, y: 0, z: 0 } });
    const [, request] = run(state, [[open, digit(1)], [digit(2)]]);
    expect(request).toContainEqual(expect.objectContaining({ type: 'docking-requested', dockingObject: base.id }));
    const events = run(state, until(state, 341)).flat();
    expect(events.filter(({ type }) => type === 'docked' || type === 'transition')).toEqual([]);
    expect(events.filter(({ type }) => type === 'docking-cancelled')).toEqual([cancelled(scene, base, 'gate', 341)]);
    expect(state.flow.subState).toBe(0);
    expect(state.player.dockingObject).toBeNull();
    expect([scene.player.activity, state.player.viewMode, state.baseService]).toEqual(['active', FLIGHT, null]);
  });
});

describe('the wait checks in mission flow (CB-02; DK1, DK5)', () => {
  it('times out a request no reply answers at the tick whose previous clock reaches the request\'s clock + 0x780', () => {
    const scene = radioScene();
    const { state } = scene;
    // Face 4 of 20011 has only entries of 0: the base's docking reply does not resolve and nothing is queued (RQ1).
    const base = addActive(scene, BASE_KIND_BIT);
    base.communications.face = 4;
    const [, request] = run(state, [[open, digit(1)], [digit(2)]]);
    expect(request).toContainEqual(expect.objectContaining({ type: 'docking-requested', deadlineClock: 2 * UNITS + 0x780 }));
    const timeoutTick = (2 * UNITS + 0x780) / UNITS + 1;
    const waited = run(state, until(state, timeoutTick - 1)).flat();
    expect(waited.filter(({ type }) => type.startsWith('radio') || type.startsWith('docking') || type.startsWith('incoming'))).toEqual([]);
    expect(state.flow.subState).toBe(3);
    expect(run(state, [[]])).toEqual([[cancelled(scene, base, 'timeout', timeoutTick)]]);
    expect([state.flow.subState, state.player.dockingObject, state.player.leftDisplay.page]).toEqual([0, base.id, 0]);
  });

  it('times sub-state 3 out at the previous clock equal to the deadline, keeping the object, the queue and the page', () => {
    const scene = radioScene();
    const { state } = scene;
    const base = addBase(scene);
    run(state, until(state, 3));
    // Tick 4 reads clock 6, tick 5 clock 8.
    waiting(scene, 3, base, 8);
    state.player.leftDisplay.page = 1;
    state.communications.queue.push(radioItem({ table: 20011, face: 0, index: 1 }, 1e9));
    const [before, at] = run(state, [[], []]);
    expect(before).toEqual([]);
    expect(at).toEqual([cancelled(scene, base, 'timeout', 5)]);
    expect(state.flow).toEqual({ mainState: 3, subState: 0, dockingDeadline: 8 });
    expect(state.player.dockingObject).toBe(base.id);
    expect(state.communications.queue).toHaveLength(1);
    expect(state.player.leftDisplay.page).toBe(1);
  });

  it.each([3, 4] as const)('releases sub-state %s on an invalid object, before the deadline test: object null, flush, page 0', (subState) => {
    const scene = radioScene();
    const { state } = scene;
    const base = addBase(scene);
    run(state, until(state, 2));
    waiting(scene, subState, base, 0);
    state.player.leftDisplay.page = 1;
    state.communications.queue.push(radioItem({ table: 20011, face: 0, index: 0 }, 1e9, 'docking-reply'));
    base.state = 'pending-removal';
    const [events] = run(state, [[]]);
    expect(events.slice(0, 3)).toEqual([
      cancelled(scene, base, 'invalid-object', 3),
      pageChanged(1, 0, 3),
      { type: 'radio-flushed', tick: 3, cause: 'docking-cancel', removed: 1, interrupted: 'none' },
    ]);
    expect(state.flow.subState).toBe(0);
    expect(state.player.dockingObject).toBeNull();
    expect(state.communications.queue).toEqual([]);
  });

  it('releases on an object removed from the world, and stops a playing reply without its callback', () => {
    const scene = radioScene();
    const { state } = scene;
    const base = addBase(scene);
    run(state, until(state, 2));
    waiting(scene, 3, base, 1e9);
    state.communications.channel = { phase: 'playing', item: radioItem({ table: 20011, face: 0, index: 0 }, 0, 'docking-reply'), startClock: 4, frameDurations: [1] };
    state.player.communications.incomingSavedPage = 1;
    state.player.leftDisplay.page = 5;
    state.entities.remove(base);
    const [events] = run(state, [[]]);
    expect(events).toEqual([
      cancelled(scene, base, 'invalid-object', 3),
      pageChanged(5, 1, 3),
      pageChanged(1, 0, 3),
      { type: 'radio-flushed', tick: 3, cause: 'docking-cancel', removed: 0, interrupted: 'playing' },
    ]);
    expect([state.flow.subState, state.communications.channel.phase]).toEqual([0, 'idle']);
  });

  it('posts the docking in sub-state 4 at the previous clock equal to the due and enters 5, which is not yet docked', () => {
    const scene = radioScene();
    const { state, player } = scene;
    const base = addBase(scene);
    run(state, until(state, 3));
    waiting(scene, 4, base, 8);
    expect(run(state, [[]])).toEqual([[]]);
    const context = beforeRequests(state);
    expect(state.flow.subState).toBe(5);
    expect([player.activity, state.player.viewMode, state.baseService]).toEqual(['active', FLIGHT, null]);
    expect(context.events).toEqual([]);
    const posted: unknown[] = [];
    context.requests.handle((request) => void posted.push(request));
    expect(posted).toEqual([{ type: 'dock', entityId: player.id }]);
  });

  it('keeps sub-state 5 with a valid object, and posts the automatic launch for an invalid one: sub-state 0, no release, no flush', () => {
    const scene = radioScene();
    const { state, player } = scene;
    const base = addBase(scene);
    waiting(scene, 5, base, 0);
    expect(run(state, [[], []]).flat()).toEqual([]);
    base.state = 'pending-removal';
    state.player.leftDisplay.page = 1;
    state.communications.queue.push(radioItem({ table: 20011, face: 0, index: 1 }, 1e9));
    const context = beforeRequests(state);
    expect(context.events).toEqual([]);
    expect([state.flow.subState, state.player.dockingObject, state.player.leftDisplay.page]).toEqual([0, base.id, 1]);
    expect(state.communications.queue).toHaveLength(1);
    const posted: unknown[] = [];
    context.requests.handle((request) => void posted.push(request));
    // The base's own update follows mission flow with its leave request.
    expect(posted).toEqual([{ type: 'depart', entityId: player.id, origin: 'automatic', commandIndex: null }, { type: 'leave', entityId: base.id }]);
  });

  it('checks nothing without a player entity, and takes a null docking object in sub-states 3–5 as Core\'s fault', () => {
    const scene = radioScene();
    const { state } = scene;
    const base = addBase(scene);
    waiting(scene, 3, base, 0);
    state.player.dockingObject = null;
    expectFault(() => run(state, [[]]), 'invariant-violated', 'docking.object');
    const without = radioScene();
    waiting(without, 4, addBase(without), 0);
    without.state.player.entityId = null;
    without.state.player.dockingObject = null;
    expect(run(without.state, [[]])).toEqual([[]]);
    expect(without.state.flow.subState).toBe(4);
  });

  it('lets the world run on during the countdown', () => {
    const scene = radioScene();
    const { state } = scene;
    const base = addBase(scene);
    const mover = state.entities.allocate(stillEntityInit(7, { position: { x: -300, y: 0, z: 0 }, movement: craftMovementBlock(100, TEST_MAXIMUM_SPEED, TEST_BASE_MAXIMUM_SPEED) }));
    mover.state = 'active';
    waiting(scene, 4, base, 1e9);
    const start = mover.position;
    run(state, until(state, 10));
    expect(mover.position).not.toEqual(start);
    expect(state.flow.subState).toBe(4);
  });
});

describe('re-requests and stale replies (DK1 races)', () => {
  it('re-targets the wait on another code 9, while changing the communications partner leaves it', () => {
    const scene = radioScene();
    const { state } = scene;
    const near = addBase(scene, {}, OTHER_BASE_KIND_BIT);
    const other = addBase(scene, { position: { x: 900, y: 0, z: 0 } });
    // The menus are built in sub-state 0, as the original keeps a built menu (comm §7.5): category 1 is kind 17's.
    run(state, [[open, digit(1)]]);
    waiting(scene, 3, near, 1e9);
    // Choosing a status query of the other base changes the partner only, and so does opening another object's menu.
    run(state, [[digit(1)]]);
    expect(state.player.communications.partner).toBe(other.id);
    expect([state.flow.subState, state.player.dockingObject, state.flow.dockingDeadline]).toEqual([3, near.id, 1e9]);
    run(state, [[open, digit(2)]]);
    expect(state.player.communications.partner).toBe(near.id);
    expect([state.flow.subState, state.player.dockingObject, state.flow.dockingDeadline]).toEqual([3, near.id, 1e9]);
    // A code 9 from a command menu built earlier in sub-state 0 restarts the wait on the other base.
    const rebuilt = radioScene();
    const first = addBase(rebuilt, {}, OTHER_BASE_KIND_BIT);
    const second = addBase(rebuilt, { position: { x: 900, y: 0, z: 0 } });
    run(rebuilt.state, [[open, digit(1)]]);
    waiting(rebuilt, 4, first, 1e9);
    const [events] = run(rebuilt.state, [[digit(2)]]);
    expect(events).toContainEqual({ type: 'docking-requested', tick: 2, playerEntityId: rebuilt.player.id, dockingObject: second.id, previousSubState: 4, deadlineClock: 4 + 0x780, commandIndex: 0 });
    expect([rebuilt.state.flow.subState, rebuilt.state.player.dockingObject]).toEqual([3, second.id]);
  });

  it('advances the current wait with a reply queued for the earlier request, and docks at the new base', () => {
    const scene = radioScene();
    const { state, player } = scene;
    const old = addBase(scene, {}, OTHER_BASE_KIND_BIT);
    const current = addBase(scene, { position: { x: 900, y: 0, z: 0 } });
    run(state, [[open, digit(1)]]);
    waiting(scene, 3, old, 1e9);
    state.communications.queue.push(radioItem({ table: 20011, face: 0, index: 0 }, 0, 'docking-reply', snapshotOf(old)));
    // Tick 2 re-requests (current's own reply follows from tick 3) and takes old's reply, which ends at tick 3 + 80.
    run(state, [[digit(2)]]);
    expect(state.player.dockingObject).toBe(current.id);
    const ends = run(state, until(state, 83)).flat();
    expect(ends).toContainEqual(expect.objectContaining({ type: 'incoming-ended', tick: 83, speaker: snapshotOf(old), countdownStarted: true }));
    const docked = run(state, until(state, 83 + 0x100 + 1)).flat().filter(({ type }) => type === 'docked');
    expect(docked).toEqual([{ type: 'docked', tick: 340, playerEntityId: player.id, baseEntityId: current.id, wingmanEntityId: null, previousViewMode: FLIGHT }]);
  });

  it('docks a code 9 of the tick sub-state 4 expires in, before the sub-command 0 its mission flow posted, then waits again in 3', () => {
    const scene = radioScene();
    const { state, player } = scene;
    const base = addBase(scene);
    run(state, [[open, digit(1)]]);
    waiting(scene, 4, base, 2);
    const [events] = run(state, [[digit(2)]]);
    expect(events.map(({ type }) => type)).toEqual(['command-result', 'left-page-changed', 'docking-requested', 'view-switched', 'docked', 'transition', 'command-delivered']);
    expect([state.flow.subState, state.flow.dockingDeadline, state.player.dockingObject, player.activity]).toEqual([3, 4 + 0x780, base.id, 'docked']);
  });
});

describe('docking in request handling (CB-10 dock; DK2)', () => {
  type DockingScene = ReturnType<typeof docking>;

  /** A player at the origin in sub-state 5 on `base`, flying in view 0xC with a target, field 2 damaged. */
  function docking(baseOverrides: Partial<EntityInit> = {}) {
    const scene = radioScene();
    const base = addBase(scene, { position: { x: 300, y: -400, z: 120 }, orientation: BASE_ORIENTATION, ...baseOverrides });
    waiting(scene, 5, base, 0);
    const { state, player } = scene;
    state.player.target = base.id;
    state.player.statusDisplay.redraw = false;
    state.player.leftDisplay.page = 1;
    state.player.communications.incomingSavedPage = 4;
    state.communications.queue.push(radioItem({ table: 20011, face: 0, index: 1 }, 1e9));
    if (player.combat.type !== 'craft') throw new Error('the test player is a craft');
    player.combat.subsystems = player.combat.subsystems.map((value, field) => (field === 2 ? 2 : value));
    return { ...scene, base };
  }

  it('saves the base\'s pose, docks the player, draws once, enters view 6 without the target and sets up the service', () => {
    const scene = docking();
    const { state, player, base } = scene;
    const rng = new RandStream(state.rngState);
    rng.next();
    const movement = player.movement;
    state.player.modelShown = true;
    const context = runDock(state);
    expect(context.events).toEqual([
      // The switch before the docked's own event; the player stays where it docked.
      switched(1, FLIGHT, 6, player),
      { type: 'docked', tick: 1, playerEntityId: player.id, baseEntityId: base.id, wingmanEntityId: null, previousViewMode: FLIGHT },
      { type: 'transition', tick: 1, gap: 'G-02/3' },
    ]);
    expect(state.player.docking.savedPose).toEqual({ position: { x: 300, y: -400, z: 120 }, orientation: BASE_ORIENTATION });
    expect([player.activity, player.state, player.movement, player.position]).toEqual(['docked', 'active', movement, { x: 0, y: 0, z: 0 }]);
    expect(state.rngState).toEqual(rng.state);
    // The shared switch hides the player's model (P3-12 FS-02).
    expect(state.player).toMatchObject({
      viewMode: 6, previousViewMode: FLIGHT, target: null, statusDisplay: { redraw: true }, leftDisplay: { page: 1 }, dockingObject: base.id, modelShown: false,
    });
    expect(state.flow.subState).toBe(5);
    const { at9C, at54 } = state.craftInfo.content.craft[player.kindBit]!;
    // Selectors 0, 33, 34, 5, 7, 8, 1, 2, … : only record 7 (field 2) needs service.
    expect(state.baseService).toEqual({
      rows: [7, 0, 1, 2, 3, 4, 5, 6, 8, 9, 10],
      cursor: 0,
      dues: { repair: 2 + 0x200, hull: 2 + 0x40, energy: 2 + 4 },
      rates: { hull: Math.trunc(at9C / 60), energy: Math.trunc(at54 / 240) },
      flags: { repairsComplete: false, energyAndMissilesFull: false, hullFull: false },
    });
  });

  it('docks the wingman list\'s head by its distance from the base, not from the player', () => {
    const near = docking({ position: { x: 900, y: 0, z: 0 } });
    const wingman = addActive(near, WINGMAN_KIND_BIT, { position: { x: 1800, y: 0, z: 0 } });
    const context = runDock(near.state);
    expect(context.events[1]).toMatchObject({ type: 'docked', wingmanEntityId: wingman.id });
    expect(wingman.activity).toBe('docked');
    const far = docking({ position: { x: 900, y: 0, z: 0 } });
    const left = addActive(far, WINGMAN_KIND_BIT, { position: { x: -200, y: 0, z: 0 } });
    const farContext = runDock(far.state);
    expect(farContext.events[1]).toMatchObject({ type: 'docked', wingmanEntityId: null });
    expect(left.activity).toBe('active');
  });

  it.each([
    ['in a Warp view', (scene: DockingScene) => void (scene.state.player.viewMode = 1)],
    ['at the range itself', (scene: DockingScene) => void (scene.base.position = { x: 1000, y: 0, z: 0 })],
    ['for a base that is no longer active', (scene: DockingScene) => void (scene.base.activity = 'docked')],
  ])('cancels at the gate %s: object released, sub-state 0, nothing else', (_, setUp) => {
    const scene = docking();
    setUp(scene);
    const rng = scene.state.rngState;
    const viewMode = scene.state.player.viewMode;
    const context = runDock(scene.state);
    expect(context.events).toEqual([cancelled(scene, scene.base, 'gate', 1)]);
    expect([scene.state.flow.subState, scene.state.player.dockingObject, scene.player.activity]).toEqual([0, null, 'active']);
    expect([scene.state.rngState, scene.state.player.viewMode, scene.state.player.target, scene.state.baseService]).toEqual([rng, viewMode, scene.base.id, null]);
    // Only the invalid-object cancels flush: the queue, the channel and the pages stay.
    expect(scene.state.communications.queue).toHaveLength(1);
    expect(scene.state.communications.channel).toEqual({ phase: 'idle' });
    expect([scene.state.player.leftDisplay.page, scene.state.player.communications.incomingSavedPage]).toEqual([1, 4]);
  });

  it('cancels when the first qualifying base in walk order is not the requested one, even though the requested one is nearer', () => {
    const scene = docking({ position: { x: 100, y: 0, z: 0 } });
    // The requested base has kind bit 17; one of bit 15 comes first in the walk.
    addBase(scene, { position: { x: 0, y: 0, z: BELOW_1000 } }, 15);
    const context = runDock(scene.state);
    expect(context.events).toEqual([cancelled(scene, scene.base, 'gate', 1)]);
    // Requesting that farther base docks there.
    const again = docking({ position: { x: 100, y: 0, z: 0 } });
    const farther = addBase(again, { position: { x: 0, y: 0, z: BELOW_1000 } }, 15);
    again.state.player.dockingObject = farther.id;
    const accepted = runDock(again.state);
    expect(accepted.events[1]).toMatchObject({ type: 'docked', baseEntityId: farther.id });
  });

  it('does nothing without a player entity', () => {
    const scene = docking();
    scene.state.player.entityId = null;
    const context = runDock(scene.state);
    expect(context.events).toEqual([]);
    expect([scene.state.flow.subState, scene.state.player.dockingObject, scene.player.activity]).toEqual([5, scene.base.id, 'active']);
  });
});

describe('the launch in request handling (CB-10 depart; DK3)', () => {
  /** Units of the launch's pose: the base's (300, −400, 120) and rows (1, 0, 0), (0, 0, −1), (0, 1, 0) give these. */
  const LAUNCH_POSITION = Object.freeze({ x: 1300, y: -400, z: 120 });
  const LAUNCH_ORIENTATION = Object.freeze([-0, -1, -0, 0, 0, -1, 1, 0, 0]);

  /**
   * A player docked by the formal step at tick 1 (clock 2) at a base off the origin, from view `viewMode`, with a
   * wingman within range of the base; the player's field 2 (record 7) is at 2 and field 3 (record 9) at 1.
   */
  function docked(viewMode = FLIGHT) {
    const scene = radioScene();
    const { state, player } = scene;
    const base = addBase(scene, { position: { x: 300, y: -400, z: 120 }, orientation: BASE_ORIENTATION });
    const wingman = addActive(scene, WINGMAN_KIND_BIT, { position: { x: 900, y: 0, z: 0 } });
    if (player.combat.type !== 'craft') throw new Error('the test player is a craft');
    player.combat.subsystems = player.combat.subsystems.map((value, field) => (field === 2 ? 2 : field === 3 ? 1 : value));
    state.player.viewMode = viewMode;
    waiting(scene, 4, base, 0);
    const world = constructWorld(state);
    const step = (commands: readonly Command[] = []): DomainEvent[] => [...world.step(tickInput(commands))];
    expect(step()).toContainEqual(expect.objectContaining({ type: 'docked', tick: 1, wingmanEntityId: wingman.id }));
    return { ...scene, base, wingman, step };
  }

  /** A launch's events: the switch from the previous view (at the pose before the launch places the player), `departed`, `transition`. */
  const departed = (
    tick: number, origin: { origin: 'command'; commandIndex: number } | { origin: 'automatic'; commandIndex: null },
    fields: { viewMode: number; previousViewMode: number; [field: string]: unknown },
  ): DomainEvent[] => [
    switched(tick, fields.previousViewMode, fields.viewMode, { entityId: expect.any(Number), position: expect.any(Object), orientation: expect.any(Array) }),
    { type: 'departed', tick, playerEntityId: expect.any(Number) as number, ...origin, ...fields } as DomainEvent,
    { type: 'transition', tick, gap: 'G-02/4' },
  ];

  /** Calls `depart` in a context as request handling makes it, and returns that context. */
  function runDepart(state: WorldState, request: RequestOf<'depart'>): TickContext {
    const context = registerTick(state, readTickInput(tickInput()));
    context.stage = 'request-handling';
    depart(context, request);
    return context;
  }

  it('launches on l in the base: active, the previous view back, the base service gone, the wingman active, placed 1000 units out', () => {
    const { state, player, base, wingman, step } = docked();
    const serial = player.placementSerial;
    const wingmanPosition = wingman.position;
    const events = step([{ type: 'launch' }]);
    expect(events).toEqual([
      { type: 'command-result', tick: 2, commandIndex: 0, commandType: 'launch', outcome: 'accepted', reason: null },
      ...departed(2, { origin: 'command', commandIndex: 0 }, {
        viewMode: FLIGHT, previousViewMode: 6, position: LAUNCH_POSITION, orientation: LAUNCH_ORIENTATION, wingmanEntityId: wingman.id,
      }),
    ]);
    expect([player.activity, wingman.activity, wingman.position]).toEqual(['active', 'active', wingmanPosition]);
    expect(player.placementSerial).toBe(serial + 1);
    expect(player.orientation).toEqual(LAUNCH_ORIENTATION);
    expect(state.player.docking.savedPose).toEqual({ position: LAUNCH_POSITION, orientation: LAUNCH_ORIENTATION });
    expect(state.player).toMatchObject({ viewMode: FLIGHT, previousViewMode: 6, dockingObject: null, target: null });
    expect([state.flow.subState, state.baseService, base.activity]).toEqual([0, null, 'active']);
  });

  it('places the player and leaves its movement block as it was: speed, commanded speed and turns go on', () => {
    const { state, player, step } = docked();
    step();
    const block = player.movement;
    if (block?.mode !== 'craft') throw new Error('the test player has a craft block');
    Object.assign(block, { speed: 17, commandedSpeed: 33, atCommandedSpeed: false });
    Object.assign(block.steering.yaw, { rate: 0.25, enabled: true });
    const before = structuredClone(block);
    state.player.statusDisplay.redraw = false;
    const pose = { entityId: player.id, position: player.position, orientation: player.orientation };
    const context = runDepart(state, { type: 'depart', entityId: player.id, origin: 'command', commandIndex: 4 });
    // The switch reports the docked pose, before the launch places the player (FS-03).
    expect(context.events[0]).toEqual(switched(context.time.tick, 6, FLIGHT, pose));
    expect(context.events[1]).toMatchObject({ type: 'departed', origin: 'command', commandIndex: 4, position: LAUNCH_POSITION });
    expect(player.position).toEqual(LAUNCH_POSITION);
    // Leaving view 6 rebuilds the cockpit (`0x4cd68`).
    expect(state.player.statusDisplay.redraw).toBe(true);
    expect(player.movement).toBe(block);
    expect(block).toEqual(before);
  });

  it('restores the view the player docked from, and 0xC from a lower one', () => {
    const from0xD = docked(0xd);
    from0xD.step([{ type: 'launch' }]);
    expect([from0xD.state.player.viewMode, from0xD.state.player.previousViewMode]).toEqual([0xd, 6]);
    const fromLow = docked(0xb);
    fromLow.step([{ type: 'launch' }]);
    expect([fromLow.state.player.viewMode, fromLow.state.player.previousViewMode]).toEqual([0xc, 6]);
  });

  it('launches automatically when the base goes in sub-state 5, in the tick whose mission flow sees it, without a flush', () => {
    const { state, player, base, wingman, step } = docked();
    state.player.leftDisplay.page = 1;
    state.communications.queue.push(radioItem({ table: 20011, face: 0, index: 1 }, 1e9));
    state.entities.remove(base);
    const events = step();
    expect(events).toEqual(departed(2, { origin: 'automatic', commandIndex: null }, {
      viewMode: FLIGHT, previousViewMode: 6, position: LAUNCH_POSITION, orientation: LAUNCH_ORIENTATION, wingmanEntityId: wingman.id,
    }));
    expect([player.activity, state.flow.subState, state.player.dockingObject, state.baseService]).toEqual(['active', 0, null, null]);
    expect([state.player.leftDisplay.page, state.communications.queue.length]).toEqual([1, 1]);
  });

  it('launches automatically from an open map to 0xC, not the view before docking, and leaves the previous view at 8', () => {
    const { state, base, step } = docked(0xd);
    // The map opened in the base (P3-09's toggle, set as it leaves the views: view 8, previous 6).
    Object.assign(state.player, { viewMode: 8, previousViewMode: 6 });
    base.state = 'presentation-ready';
    const events = step();
    expect(events[1]).toMatchObject({ type: 'departed', origin: 'automatic', viewMode: 0xc, previousViewMode: 8 });
    expect([state.player.viewMode, state.player.previousViewMode]).toEqual([0xc, 8]);
  });

  it('applies a second launch in the same tick again: the automatic one, then l, each with its transition (CB-17 decision 6)', () => {
    const { state, player, base, wingman, step } = docked();
    const serial = player.placementSerial;
    state.entities.remove(base);
    const events = step([{ type: 'launch' }]);
    // The second launch reads previous view 6 → 0xC, turns the pose another quarter and moves 1000 along the new row 1 (−r3).
    const secondPosition = { x: 1300, y: -1400, z: 120 };
    const secondOrientation = [-1, -0, -0, 0, 0, -1, -0, -1, -0];
    expect(events).toEqual([
      { type: 'command-result', tick: 2, commandIndex: 0, commandType: 'launch', outcome: 'accepted', reason: null },
      ...departed(2, { origin: 'automatic', commandIndex: null }, {
        viewMode: FLIGHT, previousViewMode: 6, position: LAUNCH_POSITION, orientation: LAUNCH_ORIENTATION, wingmanEntityId: wingman.id,
      }),
      ...departed(2, { origin: 'command', commandIndex: 0 }, {
        viewMode: 0xc, previousViewMode: 0xc, position: secondPosition, orientation: secondOrientation, wingmanEntityId: null,
      }),
    ]);
    expect(player.placementSerial).toBe(serial + 2);
    expect(state.player.docking.savedPose).toEqual({ position: secondPosition, orientation: secondOrientation });
    expect([state.flow.subState, state.player.dockingObject, player.activity, wingman.activity]).toEqual([0, null, 'active', 'active']);
  });

  it('neither completes nor rolls back a partly done service: what it did stays, the rest is left', () => {
    const { state, player, step } = docked();
    if (player.combat.type !== 'craft') throw new Error('the test player is a craft');
    const { combat } = player;
    combat.energy = 0;
    // The repair step at clock 516 (tick 258) repairs record 7 (field 2); record 9 (field 3) is next.
    while (state.tick < 258) step();
    const energy = combat.energy;
    expect([combat.subsystems[2], combat.subsystems[3]]).toEqual([0, 1]);
    expect(energy).toBeGreaterThan(0);
    expect(energy).toBeLessThan(1000);
    const context = beforeRequests(state, [{ type: 'launch' }]);
    context.requests.handle((request) => {
      if (request.type === 'depart') depart(context, request);
    });
    expect([combat.subsystems[2], combat.subsystems[3], combat.energy, state.baseService]).toEqual([0, 1, energy, null]);
    // No service step runs after the launch; the energy update resumes for the active player (D14).
    while (state.tick < 300) step();
    expect(combat.subsystems[3]).toBe(1);
  });

  it('does nothing without a player entity, and takes a launch without a saved pose as Core\'s fault', () => {
    const { state, player } = docked();
    const before = { view: state.player.viewMode, activity: player.activity, subState: state.flow.subState };
    state.player.entityId = null;
    expect(runDepart(state, { type: 'depart', entityId: player.id, origin: 'automatic', commandIndex: null }).events).toEqual([]);
    expect({ view: state.player.viewMode, activity: player.activity, subState: state.flow.subState }).toEqual(before);
    const scene = radioScene();
    expectFault(() => runDepart(scene.state, { type: 'depart', entityId: scene.player.id, origin: 'automatic', commandIndex: null }), 'invariant-violated', 'docking.saved-pose');
  });
});
