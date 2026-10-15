import { describe, expect, it } from 'vitest';
import { CORE_LIMITS } from '../contracts/limits.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import { RandStream } from '../rules/original-random.ts';
import { constructWorld } from '../world/world.ts';
import { expectFault, stateText, tickInput } from '../world/world.test-support.ts';
import type { MessageIdentity, WorldState } from '../world/world-state.ts';
import { registerTick, type TickContext } from './pipeline.ts';
import { flushRadio, queueLine, queueRadio } from './radio.ts';
import { addActive, BASE_KIND_BIT, pageChanged, radioItem, radioScene, snapshotOf, STATUS_REPLY, WINGMAN_KIND_BIT, type RadioScene } from './radio.test-support.ts';

// Expectations written out from docs/plan/p3/02/spec.md CB-02, CB-05, CB-06, CB-09 and CB-13, docs/plan/p3/10/spec.md
// D-03 items 2–4 and docs/original/formats/executable.md RQ3, RQ5, RQ8 and RX1, not from the code under test. Every
// tick adds 2 clock units; e = Δ/8 eighths, so a message of total d eighths ends 8d units after it starts.

const open: Command = { type: 'communications', operation: 'open' };
const close: Command = { type: 'communications', operation: 'close' };
const digit = (value: number): Command => ({ type: 'select-number', value });

const STATUS: MessageIdentity = { table: 20011, face: 0, index: 1 };
const DIRECT = (index: number): MessageIdentity => ({ table: 20983, face: null, index });

/** A context for this world's next tick, for the entries other rules call; no stage has run. */
const nextTick = (state: WorldState): TickContext => registerTick(state, readTickInput(tickInput()));

/** Steps `count` ticks without commands, returning each tick's events. */
function stepQuietly(world: ReturnType<typeof constructWorld>, count: number) {
  return Array.from({ length: count }, () => world.step(tickInput()));
}

describe('queuing (CB-05, CB-06 `queueRadio`; RQ3)', () => {
  it('inserts by due with equal dues first in, first out, puts a docking reply at the head and emits radio-queued', () => {
    const { state } = radioScene();
    const world = constructWorld(state);
    world.step(tickInput());
    state.communications.queue.push(radioItem(DIRECT(0), 2), radioItem(DIRECT(3), 4));
    // Called before tick 2's clock stage, as from `mission-flow`: the sample is still tick 1's clock 2.
    const context = nextTick(state);
    queueRadio(context, DIRECT(4), 'none', null);
    queueRadio(context, STATUS, 'docking-reply', null);
    queueRadio(context, DIRECT(5), 'music-step', null);
    expect(state.communications.queue.map(({ message, due, callback }) => [message.index, due, callback])).toEqual([
      [1, 2, 'docking-reply'], [0, 2, 'none'], [4, 2, 'none'], [5, 2, 'music-step'], [3, 4, 'none'],
    ]);
    expect(context.events).toEqual([
      { type: 'radio-queued', tick: 2, message: DIRECT(4), callback: 'none', speaker: null, position: 'sorted', length: 3 },
      { type: 'radio-queued', tick: 2, message: STATUS, callback: 'docking-reply', speaker: null, position: 'head', length: 4 },
      { type: 'radio-queued', tick: 2, message: DIRECT(5), callback: 'music-step', speaker: null, position: 'sorted', length: 5 },
    ]);
  });

  it('holds radioQueueItems items and faults at one more rather than dropping it', () => {
    const { state } = radioScene();
    for (let index = 1; index < CORE_LIMITS.radioQueueItems; index++) state.communications.queue.push(radioItem(DIRECT(0), 0));
    const context = nextTick(state);
    queueRadio(context, DIRECT(3), 'none', null);
    expect(state.communications.queue).toHaveLength(CORE_LIMITS.radioQueueItems);
    expect(state.communications.queue.at(-1)?.message).toEqual(DIRECT(3));
    expectFault(() => queueRadio(context, DIRECT(4), 'none', null), 'budget-exhausted', 'radio.queue');
    expect(state.communications.queue).toHaveLength(CORE_LIMITS.radioQueueItems);
  });
});

describe('taking (CB-06; RQ3 `0x2cd60`)', () => {
  it('takes at most the head per tick, only while the channel is idle, then starts it at the next tick', () => {
    const scene = radioScene();
    const { state } = scene;
    state.communications.queue.push(radioItem(DIRECT(2), 0), radioItem(DIRECT(4), 0));
    const world = constructWorld(state);
    // Tick 1 takes the first; tick 2 starts and ends it (0 eighths) while the channel was loading at the take; tick 3
    // takes the second.
    const events = stepQuietly(world, 5);
    expect(events[0]).toEqual([{ type: 'radio-taken', tick: 1, message: DIRECT(2), speaker: null }]);
    expect(events[1]).toEqual([
      pageChanged(0, 5, 2),
      { type: 'incoming-started', tick: 2, message: DIRECT(2), speaker: null, frameDurations: [0], shown: true },
      pageChanged(5, 0, 2),
      { type: 'incoming-ended', tick: 2, message: DIRECT(2), speaker: null, callback: 'none', countdownStarted: false },
    ]);
    expect(events[2]).toEqual([{ type: 'radio-taken', tick: 3, message: DIRECT(4), speaker: null }]);
    expect(events[3].map(({ type }) => type)).toEqual(['left-page-changed', 'incoming-started']);
    expect(state.communications.channel).toMatchObject({ phase: 'playing', startClock: 8, frameDurations: [1] });
    expect(events[4]).toEqual([]);
    expect(state.communications.queue).toEqual([]);
  });

  it('keeps the queue while a message plays and looks only at the head', () => {
    const { state } = radioScene();
    state.communications.channel = { phase: 'playing', item: radioItem(DIRECT(0), 0), startClock: 0, frameDurations: [1000] };
    state.communications.queue.push(radioItem(DIRECT(3), 0));
    const world = constructWorld(state);
    expect(world.step(tickInput())).toEqual([]);
    expect(state.communications.queue).toHaveLength(1);
    // A head not yet due holds back an item behind it that is due (dues from a corrupted order, which no insert makes).
    const blocked = radioScene();
    blocked.state.communications.queue.push(radioItem(DIRECT(3), 100), radioItem(DIRECT(4), 0));
    expect(constructWorld(blocked.state).step(tickInput())).toEqual([]);
    expect(blocked.state.communications.queue).toHaveLength(2);
  });

  it('takes an item queued after the take in a later tick, at its due clock', () => {
    const { state } = radioScene();
    const world = constructWorld(state);
    world.step(tickInput());
    // As if a later stage of tick 1 had queued it, due tick 1's clock.
    state.communications.queue.push(radioItem(DIRECT(3), state.clock));
    expect(world.step(tickInput())).toEqual([{ type: 'radio-taken', tick: 2, message: DIRECT(3), speaker: null }]);
  });
});

describe('the presentation sub-step (CB-09; D-03 item 3; RQ5, RQ8)', () => {
  /** A scene whose next tick starts a message of STATUS_REPLY loaded at the previous tick. */
  function loaded(callback: 'none' | 'docking-reply' = 'none'): RadioScene & { world: ReturnType<typeof constructWorld> } {
    const scene = radioScene();
    scene.state.communications.channel = { phase: 'loading', item: radioItem(STATUS, 0, callback), readyTick: 1 };
    return { ...scene, world: constructWorld(scene.state) };
  }

  it('shows page 5 for the length of the frames, saving and restoring the page, at a one-tick load latency', () => {
    const { state, world } = loaded();
    state.player.leftDisplay.page = 1;
    expect(world.step(tickInput())).toEqual([
      pageChanged(1, 5, 1),
      { type: 'incoming-started', tick: 1, message: STATUS, speaker: null, frameDurations: [5, 8, 5], shown: true },
    ]);
    expect(state.player.communications.incomingSavedPage).toBe(1);
    expect(state.communications.channel).toEqual({ phase: 'playing', item: radioItem(STATUS, 0), startClock: 2, frameDurations: [5, 8, 5] });
    // 18 eighths are 144 units, 72 ticks: it ends at clock 146, tick 73.
    const quiet = stepQuietly(world, 71);
    expect(quiet.flat()).toEqual([]);
    expect(world.step(tickInput())).toEqual([
      pageChanged(5, 1, 73),
      { type: 'incoming-ended', tick: 73, message: STATUS, speaker: null, callback: 'none', countdownStarted: false },
    ]);
    expect(state.communications.channel).toEqual({ phase: 'idle' });
  });

  it('shows no page 5 in the Warp view (1) but still ends and runs the docking reply\'s callback', () => {
    const { state, world } = loaded('docking-reply');
    state.player.viewMode = 1;
    state.flow.subState = 3;
    expect(world.step(tickInput())).toEqual([
      { type: 'incoming-started', tick: 1, message: STATUS, speaker: null, frameDurations: [5, 8, 5], shown: false },
    ]);
    stepQuietly(world, 71);
    expect(world.step(tickInput())).toEqual([
      { type: 'incoming-ended', tick: 73, message: STATUS, speaker: null, callback: 'docking-reply', countdownStarted: true },
    ]);
    expect(state.flow).toEqual({ mainState: 3, subState: 4, dockingDeadline: 146 + 0x200 });
    expect(state.player.leftDisplay.page).toBe(0);
  });

  it('runs the docking reply\'s callback only in sub-state 3: a late reply after a cancel moves nothing', () => {
    for (const subState of [0, 4, 5] as const) {
      const { state, world } = loaded('docking-reply');
      state.flow.subState = subState;
      state.flow.dockingDeadline = 77;
      stepQuietly(world, 72);
      expect(world.step(tickInput()).at(-1)).toMatchObject({ type: 'incoming-ended', countdownStarted: false });
      expect(state.flow).toEqual({ mainState: 3, subState, dockingDeadline: 77 });
    }
  });

  it('advances the current wait with a reply to an earlier request, whoever replied (DK1)', () => {
    const scene = radioScene();
    const { state } = scene;
    const first = addActive(scene, BASE_KIND_BIT);
    const second = addActive(scene, BASE_KIND_BIT, { position: { x: 0, y: 100, z: 0 } });
    state.communications.channel = { phase: 'loading', item: radioItem(STATUS, 0, 'docking-reply', snapshotOf(first)), readyTick: 1 };
    Object.assign(state.flow, { subState: 3, dockingDeadline: 5000 });
    state.player.dockingObject = second.id;
    const world = constructWorld(state);
    stepQuietly(world, 72);
    expect(world.step(tickInput()).at(-1)).toMatchObject({ type: 'incoming-ended', speaker: snapshotOf(first), countdownStarted: true });
    expect(state.flow).toEqual({ mainState: 3, subState: 4, dockingDeadline: 146 + 0x200 });
    expect(state.player.dockingObject).toBe(second.id);
  });

  it('covers an open menu: menu keys do nothing meanwhile, and the menu page and its keys return at the end', () => {
    const scene = radioScene();
    const { state } = scene;
    addActive(scene, BASE_KIND_BIT);
    const world = constructWorld(state);
    world.step(tickInput([open]));
    expect(state.player.leftDisplay.page).toBe(2);
    state.communications.queue.push(radioItem(DIRECT(3), state.clock));
    expect(world.step(tickInput()).map(({ type }) => type)).toEqual(['radio-taken']);
    expect(world.step(tickInput())).toEqual([
      pageChanged(2, 5, 3),
      { type: 'incoming-started', tick: 3, message: DIRECT(3), speaker: null, frameDurations: [2], shown: true },
    ]);
    // The digit finds no menu page (P3-05's wrong-context); 2 eighths are 16 units, so tick 11 ends it.
    expect(world.step(tickInput([digit(1)]))).toEqual([{ type: 'command-result', tick: 4, commandIndex: 0, commandType: 'select-number', outcome: 'ignored', reason: 'wrong-context' }]);
    stepQuietly(world, 6);
    expect(world.step(tickInput())).toEqual([
      pageChanged(5, 2, 11),
      { type: 'incoming-ended', tick: 11, message: DIRECT(3), speaker: null, callback: 'none', countdownStarted: false },
    ]);
    expect(state.player.communications.menu?.level).toBe(2);
    expect(world.step(tickInput([digit(1)])).map(({ type }) => type)).toEqual(['command-result', 'left-page-changed']);
    expect(state.player.leftDisplay.page).toBe(4);
  });

  it('keeps the incoming saved page apart from the menu\'s: c on page 5 saves 5, the end does not restore, and a close returns to an empty page 5 that the handler leaves', () => {
    const scene = radioScene();
    const { state } = scene;
    addActive(scene, BASE_KIND_BIT);
    state.player.leftDisplay.page = 1;
    state.communications.channel = { phase: 'loading', item: radioItem(DIRECT(3), 0), readyTick: 1 };
    const world = constructWorld(state);
    world.step(tickInput());
    expect(world.step(tickInput([open])).slice(0, 2)).toEqual([
      { type: 'command-result', tick: 2, commandIndex: 0, commandType: 'communications', outcome: 'accepted', reason: null },
      pageChanged(5, 2, 2, 0),
    ]);
    expect(state.player.communications).toMatchObject({ menuSavedPage: 5, incomingSavedPage: 1 });
    stepQuietly(world, 6);
    // Ends at tick 9 (16 units after clock 2) on page 2: nothing to restore.
    expect(world.step(tickInput()).map(({ type }) => type)).toEqual(['incoming-ended']);
    expect(state.player.leftDisplay.page).toBe(2);
    // The close returns to page 5 with no message; the page-5 handler in the same tick's frame-end leaves it.
    expect(world.step(tickInput([close]))).toEqual([
      { type: 'command-result', tick: 10, commandIndex: 0, commandType: 'communications', outcome: 'accepted', reason: null },
      pageChanged(2, 5, 10, 0),
      pageChanged(5, 0, 10),
    ]);
  });

  it('keeps an empty page 5 while field 13 is 2 or outside the cockpit views', () => {
    for (const [field, viewMode] of [[2, 0x0c], [0, 0x13]] as const) {
      const scene = radioScene();
      if (scene.player.combat.type !== 'craft') throw new Error('the test player is a craft');
      scene.player.combat.subsystems = scene.player.combat.subsystems.map((value, index) => (index === 13 ? field : value));
      scene.state.player.viewMode = viewMode;
      scene.state.player.leftDisplay.page = 5;
      expect(constructWorld(scene.state).step(tickInput())).toEqual([]);
      expect(scene.state.player.leftDisplay.page).toBe(5);
    }
  });

  it('plays a message whose speaker is gone from the snapshot it was queued with', () => {
    const scene = radioScene();
    const { state } = scene;
    const base = addActive(scene, BASE_KIND_BIT);
    state.communications.queue.push(radioItem(STATUS, 0, 'none', snapshotOf(base)));
    state.entities.remove(base);
    const world = constructWorld(state);
    expect(world.step(tickInput())).toEqual([{ type: 'radio-taken', tick: 1, message: STATUS, speaker: snapshotOf(base) }]);
    expect(world.step(tickInput())[1]).toEqual({ type: 'incoming-started', tick: 2, message: STATUS, speaker: snapshotOf(base), frameDurations: [...STATUS_REPLY], shown: true });
  });
});

describe('the flush entry `flushRadio` (CB-06; RQ3 `0x2cd20`)', () => {
  it('stops a playing message on page 5: the saved page returns, then page 0, without the callback', () => {
    const { state } = radioScene();
    state.communications.queue.push(radioItem(DIRECT(0), 0), radioItem(DIRECT(3), 0));
    state.communications.channel = { phase: 'playing', item: radioItem(STATUS, 0, 'docking-reply'), startClock: 0, frameDurations: [5] };
    Object.assign(state.player.leftDisplay, { page: 5 });
    state.player.communications.incomingSavedPage = 3;
    state.flow.subState = 3;
    const context = nextTick(state);
    flushRadio(context, 'docking-cancel');
    expect(context.events).toEqual([
      pageChanged(5, 3, 1),
      pageChanged(3, 0, 1),
      { type: 'radio-flushed', tick: 1, cause: 'docking-cancel', removed: 2, interrupted: 'playing' },
    ]);
    expect(state.communications).toMatchObject({ queue: [], channel: { phase: 'idle' } });
    expect(state.flow.subState).toBe(3);
  });

  it('cancels a loading message, which then never starts, and leaves a page other than 5 to page 0 alone', () => {
    const { state } = radioScene();
    state.communications.channel = { phase: 'loading', item: radioItem(STATUS, 0, 'docking-reply'), readyTick: 1 };
    state.player.leftDisplay.page = 1;
    const context = nextTick(state);
    flushRadio(context, 'docking-cancel');
    expect(context.events).toEqual([pageChanged(1, 0, 1), { type: 'radio-flushed', tick: 1, cause: 'docking-cancel', removed: 0, interrupted: 'loading' }]);
    expect(constructWorld(state).step(tickInput())).toEqual([]);
  });

  it('writes no page event when page 0 already shows, and stops a message playing under another page without restoring', () => {
    const { state } = radioScene();
    state.communications.channel = { phase: 'playing', item: radioItem(STATUS, 0), startClock: 0, frameDurations: [5] };
    state.player.communications.incomingSavedPage = 3;
    const context = nextTick(state);
    flushRadio(context, 'docking-cancel');
    expect(context.events).toEqual([{ type: 'radio-flushed', tick: 1, cause: 'docking-cancel', removed: 0, interrupted: 'playing' }]);
  });
});

describe('wingman lines `queueLine` (CB-06; RX1 `0x38d54`)', () => {
  /** A scene with the wingman whose +0xDC is `aiValueA` (face aiValueA − 1). */
  function withWingman(aiValueA: number) {
    const scene = radioScene();
    const wingman = addActive(scene, WINGMAN_KIND_BIT, { ruleInputs: { percentB: 0, percentC: 0, percentD: 0, aiValueA, aiValueB: 0, aiValueC: 0 } });
    return { ...scene, wingman, context: nextTick(scene.state), rand: new RandStream(scene.state.rngState) };
  }

  it('returns false before any draw for a speaker that does not resolve or a face outside 0–4', () => {
    for (const aiValueA of [0, 6]) {
      const { state, wingman, context } = withWingman(aiValueA);
      const before = stateText(state);
      expect(queueLine(context, wingman.id, 0)).toBe(false);
      expect(queueLine(context, null, 0)).toBe(false);
      expect(queueLine(context, 999, 0)).toBe(false);
      expect(stateText(state)).toBe(before);
      expect(context.events).toEqual([]);
    }
  });

  it.each([
    { type: 0, index: (rand: number) => rand % 3 },
    { type: 3, index: (rand: number) => 3 + (rand % 2) },
    { type: 0xe, index: (rand: number) => 0xe + (rand % 2) },
    { type: 7, index: (rand: number) => 5 + (rand % 3) },
  ])('draws for type $type before the lookup and queues 20985 at the drawn index', ({ type, index }) => {
    const { state, wingman, context, rand } = withWingman(3);
    const expected = index(rand.next());
    expect(queueLine(context, wingman.id, type)).toBe(true);
    expect(state.rngState).toBe(rand.state);
    expect(context.events).toEqual([{
      type: 'radio-queued', tick: 1, message: { table: 20985, face: 2, index: expected }, callback: 'none', speaker: snapshotOf(wingman), position: 'sorted', length: 1,
    }]);
  });

  it('queues type 8 with the music step, and takes no draw for another type such as 0xA', () => {
    const eight = withWingman(1);
    const drawn = eight.rand.next();
    expect(queueLine(eight.context, eight.wingman.id, 8)).toBe(true);
    expect(eight.context.events[0]).toMatchObject({ message: { table: 20985, face: 0, index: 8 + (drawn % 2) }, callback: 'music-step' });
    const tail = withWingman(5);
    const rngState = tail.state.rngState;
    expect(queueLine(tail.context, tail.wingman.id, 0xa)).toBe(true);
    expect(tail.state.rngState).toBe(rngState);
    expect(tail.context.events[0]).toMatchObject({ message: { table: 20985, face: 4, index: 0xa }, callback: 'none' });
  });

  it('returns false when the line does not resolve (type 12, no draw)', () => {
    const { state, wingman, context } = withWingman(2);
    const rngState = state.rngState;
    expect(queueLine(context, wingman.id, 12)).toBe(false);
    expect(state.rngState).toBe(rngState);
    expect(context.events).toEqual([]);
  });
});
