import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import { RandStream } from '../rules/original-random.ts';
import type { Entity } from '../world/entity-table.ts';
import { constructWorld } from '../world/world.ts';
import { tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { threatened } from './base-response.ts';
import { PIPELINE, registerTick } from './pipeline.ts';
import {
  addActive, BASE_KIND_BIT, CRAFT_KIND_BIT, DOCKING_REPLY, HOSTILE_KIND_BIT, pageChanged, radioScene, snapshotOf, TEST_MESSAGES, WINGMAN_KIND_BIT, type RadioScene,
} from './radio.test-support.ts';

// Expectations written out from docs/plan/p3/02/spec.md CB-04, CB-07, CB-08, CB-12 and CB-13 and from
// docs/original/formats/executable.md CD2–CD4, RQ1, RQ2, RQ4–RQ6 and DK1, not from the code under test. The synthetic
// menus (create-world.test-support.ts) list a lone base's near command menu at once after its category: '1' → 7, '2' → 9.
// Every tick adds 2 clock units; the threat radius (craft +0x0C) is 250 for every kind.

const open: Command = { type: 'communications', operation: 'open' };
const digit = (value: number): Command => ({ type: 'select-number', value });
const STATUS_KEYS = [open, digit(1), digit(1)];
const DOCKING_KEYS = [open, digit(1), digit(2)];

/** The Mulberry32 state after `draws` more draws: each adds 0x6D2B79F5 (mod 2³²), whatever their order. */
const advanced = (state: number, draws: number): number => (state + draws * 0x6d2b79f5) >>> 0;

const delivered = (receiver: Entity, code: number, sender: Entity, commandIndex: number, tick = 1): DomainEvent => ({
  type: 'command-delivered', tick, receiverEntityId: receiver.id, receiverKindBit: receiver.kindBit, code, senderEntityId: sender.id, commandIndex,
});

/** A scene with one active base at x = 100, near the player. */
function baseScene(): RadioScene & { base: Entity } {
  const scene = radioScene();
  return { ...scene, base: addActive(scene, BASE_KIND_BIT) };
}

/** Sets a pending command as an earlier tick's request handling would have. */
const pend = (entity: Entity, code: number): void => {
  entity.ai.pendingCommand = { code, issuedTick: 0 };
};

describe('delivery, reply and callback are separate facts (AC-04, AC-05; CB-07, CB-08, CB-12; RQ6)', () => {
  it('runs the docking chain tick by tick: delivered at the key, queued and taken at the next tick, shown one tick later, the callback at the end', () => {
    const { state, player, base } = baseScene();
    const world = constructWorld(state);
    const face = new RandStream(state.rngState);

    const first = world.step(tickInput(DOCKING_KEYS));
    expect(first.slice(-2)).toEqual([
      { type: 'docking-requested', tick: 1, playerEntityId: player.id, dockingObject: base.id, previousSubState: 0, deadlineClock: 2 + 0x780, commandIndex: 2 },
      delivered(base, 9, player, 2),
    ]);
    expect(base.ai.pendingCommand).toEqual({ code: 9, issuedTick: 1 });
    expect(state.communications.queue).toEqual([]);

    // The base's first speech draws its face from the 5-face pool: one draw, nothing else draws in this tick.
    const expectedFace = face.next() % 5;
    const message = { table: 20011, face: expectedFace, index: 0 } as const;
    const speaker = snapshotOf(base);
    if (expectedFace === 4) throw new Error('the seed gives face 4, whose entries are all 0 in TEST_MESSAGES');
    expect(world.step(tickInput())).toEqual([
      { type: 'radio-queued', tick: 2, message, callback: 'docking-reply', speaker, position: 'head', length: 1 },
      { type: 'radio-taken', tick: 2, message, speaker },
    ]);
    expect(state.rngState).toBe(face.state);
    expect(base.communications.face).toBe(expectedFace);
    expect(state.communications.facePools.base.filter(Boolean)).toHaveLength(1);
    expect(base.ai.pendingCommand).toBeNull();

    expect(world.step(tickInput())).toEqual([
      pageChanged(0, 5, 3),
      { type: 'incoming-started', tick: 3, message, speaker, frameDurations: [...DOCKING_REPLY], shown: true },
    ]);
    // 20 eighths after clock 6: clock 166, tick 83. Until then nothing happens and sub-state 3 holds.
    for (let tick = 4; tick < 83; tick++) expect(world.step(tickInput())).toEqual([]);
    expect(state.flow.subState).toBe(3);
    expect(world.step(tickInput())).toEqual([
      pageChanged(5, 0, 83),
      { type: 'incoming-ended', tick: 83, message, speaker, callback: 'docking-reply', countdownStarted: true },
    ]);
    expect(state.flow).toEqual({ mainState: 3, subState: 4, dockingDeadline: 166 + 0x200 });
  });

  it('answers a status query in due order without a callback, and the accepted command alone says nothing of the reply', () => {
    const { state, player, base } = baseScene();
    base.communications.face = 1;
    const world = constructWorld(state);
    const first = world.step(tickInput(STATUS_KEYS));
    expect(first.filter(({ type }) => type === 'command-result').map((event) => (event as { outcome: string }).outcome)).toEqual(['accepted', 'accepted', 'accepted']);
    expect(first.at(-1)).toEqual(delivered(base, 7, player, 2));
    const message = { table: 20011, face: 1, index: 1 } as const;
    expect(world.step(tickInput())).toEqual([
      { type: 'radio-queued', tick: 2, message, callback: 'none', speaker: snapshotOf(base), position: 'sorted', length: 1 },
      { type: 'radio-taken', tick: 2, message, speaker: snapshotOf(base) },
    ]);
    expect(base.communications.threatStamp).toBeNull();
  });

  it('keeps the last of two deliveries to one object in a tick: two command-delivered, one reply', () => {
    const { state, player, base } = baseScene();
    base.communications.face = 0;
    const world = constructWorld(state);
    const events = world.step(tickInput([...STATUS_KEYS, ...DOCKING_KEYS]));
    expect(events.filter(({ type }) => type === 'command-delivered')).toEqual([delivered(base, 7, player, 2), delivered(base, 9, player, 5)]);
    expect(base.ai.pendingCommand).toEqual({ code: 9, issuedTick: 1 });
    expect(world.step(tickInput()).map((event) => (event.type === 'radio-queued' ? [event.message.index, event.callback] : event.type))).toEqual([
      [0, 'docking-reply'], 'radio-taken',
    ]);
  });

  it('writes nothing for a receiver removed before request handling', () => {
    const { state, base } = baseScene();
    const context = registerTick(state, readTickInput(tickInput(STATUS_KEYS)));
    for (const stage of PIPELINE) {
      if (stage.id === 'request-handling') state.entities.remove(base);
      stage.run?.(context);
    }
    expect(context.events.map(({ type }) => type)).not.toContain('command-delivered');
    expect(base.ai.pendingCommand).toBeNull();
  });

  it('stores a wingman\'s code with no effect or reply while P3-08 has no consumer, until a later delivery replaces it', () => {
    const scene = radioScene();
    const { state, player } = scene;
    const wingman = addActive(scene, WINGMAN_KIND_BIT);
    const world = constructWorld(state);
    // Categories: W first; one wingman skips to TABL 2013, '3' → 3.
    expect(world.step(tickInput([open, digit(1), digit(3)])).at(-1)).toEqual(delivered(wingman, 3, player, 2));
    for (let tick = 2; tick <= 5; tick++) expect(world.step(tickInput())).toEqual([]);
    expect(wingman.ai.pendingCommand).toEqual({ code: 3, issuedTick: 1 });
    world.step(tickInput([open, digit(1), digit(6)]));
    expect(wingman.ai.pendingCommand).toEqual({ code: 6, issuedTick: 6 });
    expect(state.communications.queue).toEqual([]);
  });
});

describe('`0x3bed0` (AC-04; CB-12; RQ1, RQ4)', () => {
  /** Steps one tick and returns its radio-queued events. */
  const queuedBy = (state: WorldState) => constructWorld(state).step(tickInput()).filter(({ type }) => type === 'radio-queued');

  it('clears any other non-zero code without a message', () => {
    for (const code of [1, 6, 8, 10, 0xffffffff]) {
      const { state, base } = baseScene();
      pend(base, code);
      const rngState = state.rngState;
      expect(constructWorld(state).step(tickInput())).toEqual([]);
      expect(base.ai.pendingCommand).toBeNull();
      expect(state.rngState).toBe(rngState);
      expect(base.communications.face).toBeNull();
    }
  });

  it('answers in state 7 only, whatever the activity: a parked base answers, one in another state keeps its code', () => {
    const parked = baseScene();
    parked.base.activity = 'parked';
    parked.base.communications.face = 0;
    pend(parked.base, 9);
    expect(queuedBy(parked.state)).toHaveLength(1);
    const waiting = baseScene();
    waiting.base.state = 'presentation-ready';
    pend(waiting.base, 9);
    constructWorld(waiting.state).step(tickInput());
    expect(waiting.base.ai.pendingCommand).toEqual({ code: 9, issuedTick: 0 });
  });

  it('queues nothing when the speaker\'s message does not resolve, still clearing the code: a docking request then waits in vain', () => {
    const { state, base } = baseScene();
    base.communications.face = 4;
    pend(base, 9);
    expect(queuedBy(state)).toEqual([]);
    expect(base.ai.pendingCommand).toBeNull();
  });

  it('draws a base\'s face once: a second reply takes no draw', () => {
    const { state, base } = baseScene();
    pend(base, 7);
    const world = constructWorld(state);
    const before = state.rngState;
    world.step(tickInput());
    expect(state.rngState).toBe(advanced(before, 1));
    pend(base, 7);
    const again = state.rngState;
    world.step(tickInput());
    expect(state.rngState).toBe(again);
  });

  it('draws a craft of 0x87c a face from the 3-face pool and answers status from 20019, 0 unstamped and 1 under threat', () => {
    const scene = radioScene();
    const craft = addActive(scene, CRAFT_KIND_BIT);
    const rand = new RandStream(scene.state.rngState);
    const face = rand.next() % 3;
    pend(craft, 7);
    expect(queuedBy(scene.state)).toMatchObject([{ message: { table: 20019, face, index: 0 } }]);
    expect(scene.state.communications.facePools).toEqual({ craft: [0, 1, 2].map((index) => index === face), base: [false, false, false, false, false] });
    addActive(scene, HOSTILE_KIND_BIT, { position: { x: 300, y: 0, z: 0 } });
    pend(craft, 7);
    expect(queuedBy(scene.state)).toMatchObject([{ message: { table: 20019, face, index: 1 } }]);
  });
});

describe('the status reply\'s threat stamp (RQ1, RQ2 `0x3c040`)', () => {
  /** A base answering 7 with face 0 and one hostile of `kindBit` at x = 100 + `offset`. */
  function threat(offset: number, hostile: Partial<Pick<Entity, 'state' | 'destroyed' | 'activity'>> = {}, kindBit = HOSTILE_KIND_BIT) {
    const scene = baseScene();
    scene.base.communications.face = 0;
    pend(scene.base, 7);
    const enemy = addActive(scene, kindBit, { position: { x: 100 + offset, y: 0, z: 0 } });
    Object.assign(enemy, hostile);
    return { ...scene, enemy };
  }

  const statusIndex = (state: WorldState) => {
    const [event] = constructWorld(state).step(tickInput()).filter(({ type }) => type === 'radio-queued');
    return event?.type === 'radio-queued' ? event.message : null;
  };

  it('stamps this clock under a threat strictly within the radius and answers 20011 index 4', () => {
    const { state, base } = threat(249);
    expect(statusIndex(state)).toEqual({ table: 20011, face: 0, index: 4 });
    expect(base.communications.threatStamp).toBe(2);
  });

  it('takes a hostile at exactly the radius, a destroyed one, a new one or a friendly kind as no threat: no stamp, index 1', () => {
    for (const [offset, hostile, kindBit] of [
      [250, {}, HOSTILE_KIND_BIT], [10, { destroyed: true }, HOSTILE_KIND_BIT], [10, { state: 'new', activity: 'parked' }, HOSTILE_KIND_BIT], [10, {}, CRAFT_KIND_BIT],
    ] as const) {
      const { state, base } = threat(offset, hostile, kindBit);
      base.communications.threatStamp = 40;
      expect(statusIndex(state)).toEqual({ table: 20011, face: 0, index: 1 });
      expect(base.communications.threatStamp).toBeNull();
    }
  });

  it('counts a destroyed source (state 4) and a parked hostile, and keeps an earlier stamp', () => {
    for (const hostile of [{ state: 'destroyed-source' }, { activity: 'parked' }] as const) {
      const { state, base } = threat(-200, hostile);
      base.communications.threatStamp = 40;
      expect(statusIndex(state)).toEqual({ table: 20011, face: 0, index: 4 });
      expect(base.communications.threatStamp).toBe(40);
    }
  });

  it('counts an unordered distance as near', () => {
    const { state, base, enemy } = threat(0);
    Object.assign(enemy, { position: { x: Number.NaN, y: 0, z: 0 } });
    expect(threatened(state, base)).toBe(true);
  });
});

describe('the threat re-announce without a command (RQ1, RX2 step 3, RX4)', () => {
  // The sample is 10002: the stamp is re-tested once stamp + 0xB40 < 10002 and re-announced once stamp + 0x2D00 < 10002.
  // Pool name 0 is TABL 2001 position 2, so the base's re-announce is 20983 index 0x1A + 2, then index rand % 4.
  const SAMPLE = 10002;
  const MESSAGES = { ...TEST_MESSAGES, direct: Object.freeze(Array.from({ length: 40 }, (_, index) => Object.freeze([index + 1]))) };

  /** A base at x = 100 with `stamp`, named pool 0 when `named`, and a hostile at x = 150 when `threat`. */
  function reannounce(stamp: number, threat: boolean, named = true) {
    const radio = radioScene();
    const { communications } = radio.state.ruleData;
    const pool = Object.freeze([{ in2001: 2, in2011: null }]);
    const state: WorldState = { ...radio.state, ruleData: { ...radio.state.ruleData, communications: { ...communications, messages: MESSAGES, nameIndexes: { ...communications.nameIndexes, pool } } } };
    const scene = { state, player: radio.player };
    const base = addActive(scene, BASE_KIND_BIT, named ? { name: { type: 'pool', index: 0 } } : {});
    base.communications.threatStamp = stamp;
    if (threat) addActive(scene, HOSTILE_KIND_BIT, { position: { x: 150, y: 0, z: 0 } });
    state.clock = SAMPLE - 2;
    return { state, base, queued: () => constructWorld(state).step(tickInput()).filter(({ type }) => type === 'radio-queued') };
  }

  it('leaves a stamp no older than 0xB40 alone, threat or not', () => {
    const { base, queued } = reannounce(SAMPLE - 0xb40, false);
    expect(queued()).toEqual([]);
    expect(base.communications.threatStamp).toBe(SAMPLE - 0xb40);
  });

  it('clears an older stamp once no threat is left, without a message', () => {
    const { state, base, queued } = reannounce(SAMPLE - 0xb40 - 1, false);
    const rngState = state.rngState;
    expect(queued()).toEqual([]);
    expect(base.communications.threatStamp).toBeNull();
    expect(state.rngState).toBe(rngState);
  });

  it('keeps a threatened stamp no older than 0x2D00', () => {
    const { base, queued } = reannounce(SAMPLE - 0x2d00, true);
    expect(queued()).toEqual([]);
    expect(base.communications.threatStamp).toBe(SAMPLE - 0x2d00);
  });

  it('re-announces an older threatened stamp through 0x3c208 step 3 and stamps the sample again', () => {
    const { state, base, queued } = reannounce(SAMPLE - 0x2d00 - 1, true);
    const rand = new RandStream(state.rngState);
    const second = rand.next() % 4;
    const speaker = snapshotOf(base);
    expect(queued()).toEqual([
      { type: 'radio-queued', tick: 1, message: { table: 20983, face: null, index: 0x1a + 2 }, callback: 'none', speaker, position: 'sorted', length: 1 },
      { type: 'radio-queued', tick: 1, message: { table: 20983, face: null, index: second }, callback: 'none', speaker, position: 'sorted', length: 2 },
    ]);
    expect(state.rngState).toBe(rand.state);
    expect(base.communications.threatStamp).toBe(SAMPLE);
  });

  it('leaves the stamp cleared for a base named in neither list, and does nothing outside state 7', () => {
    const nameless = reannounce(SAMPLE - 0x2d00 - 1, true, false);
    expect(nameless.queued()).toEqual([]);
    expect(nameless.base.communications.threatStamp).toBeNull();
    const waiting = reannounce(SAMPLE - 0x2d00 - 1, true);
    waiting.base.state = 'area-switch';
    expect(waiting.queued()).toEqual([]);
    expect(waiting.base.communications.threatStamp).toBe(SAMPLE - 0x2d00 - 1);
  });
});
