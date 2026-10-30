import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { gun, missile, mount } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent, HitEvent, ShotFiredEvent } from '../../core/contracts/domain-events.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import { createWorld } from '../../core/world/create-world.ts';
import {
  EXPLOSION_KIND_BIT, FRAGMENT_KIND_BIT, MARKER_KIND_BIT, MISSILE_KIND_BIT, PROJECTILE_KIND_BIT, TRANSPONDER_KIND_BIT,
} from '../../core/world/entity-table.ts';
import { asCreateInput, craftInfoContent, declaration, missionFrame, worldInput } from '../../core/world/create-world.test-support.ts';
import { thrownBy, tickInput } from '../../core/world/world.test-support.ts';
import { COMBAT_EVENTS } from '../runtime/combat-events.test-support.ts';
import type { DomainEventType } from '../runtime/game-event-bus.ts';
import type { TickEvent } from '../runtime/game-runtime.ts';
import { bindFlightSounds, type FlightSoundContent } from './content.ts';
import { MODELS, soundPackage, SOUNDS } from './content.test-support.ts';
import {
  dispatchTypeOfKind, EVENT_SOUNDS, FlightSoundEventError, readEventSound, readTickEventSounds,
  type EventSoundItem, type FlightSoundEventFailure, type HitItem, type ShotItem,
} from './events.ts';

// The flight sounds' reading of domain events (P3-14 subtask 15; spec S-02, S-04, S-07, AC-02, AC-03, AC-09; D-02 DW-06,
// DW-09): every variant's classification, object sounds by kind bit from the static bindings, legal silence apart from
// contract errors, and each tick's order and independent repeats. Synthetic content and events, then a formal Core run.

const { held, bound } = soundPackage();
const CONTENT: FlightSoundContent = bindFlightSounds(held, bound);
/** Kinds of the synthetic craft type table: 0 the player's model, 7 enemy A, 8 enemy B (every slot empty). */
const PLAYER = 0;
const ENEMY = 7;
const SILENT_CRAFT = 8;
/** A craft kind the synthetic table does not bind. */
const UNBOUND = 9;

type EventOf<Type extends DomainEventType> = Extract<DomainEvent, { readonly type: Type }>;

const at = (x: number, y: number, z: number) => ({ x, y, z });
const combat = <Type extends 'shot-fired' | 'hit'>(type: Type): EventOf<Type> =>
  COMBAT_EVENTS.find((event): event is EventOf<Type> => event.type === type)!;
const SHOT = combat('shot-fired');
const HIT = combat('hit');

/** An event of `type` at tick 5 with `fields`; the reading only looks at the fields each test sets. */
const sample = <Type extends DomainEventType>(type: Type, fields: Partial<EventOf<Type>> = {}): EventOf<Type> =>
  Object.freeze({ type, tick: 5, ...fields }) as unknown as EventOf<Type>;

/** One event of every variant, in the representative shape of each; the record makes a new variant fail to compile. */
const EVERY_EVENT: { readonly [Type in DomainEventType]: EventOf<Type> } = {
  'command-result': sample('command-result', { commandIndex: 0, outcome: 'accepted', reason: null }),
  'object-instantiated': sample('object-instantiated', { entityId: 3, kindBit: 14 }),
  'speed-assist-toggled': sample('speed-assist-toggled'),
  'speed-matched': sample('speed-matched'),
  'speed-assist-released': sample('speed-assist-released'),
  'object-left-world': sample('object-left-world', { entityId: 12, kindBit: ENEMY }),
  'target-changed': sample('target-changed', { origin: 'command', commandIndex: 1 }),
  'target-cleared': sample('target-cleared'),
  'weapon-selected': sample('weapon-selected', { changed: true, commandIndex: 0 }),
  'shot-fired': SHOT,
  hit: HIT,
  'object-destroyed': sample('object-destroyed', { entityId: 14, kindBit: ENEMY, outcome: 'removed' }),
  'explosion-started': sample('explosion-started'),
  'missile-ended': sample('missile-ended'),
  'fragment-expired': sample('fragment-expired'),
  'source-released': sample('source-released'),
  'energy-depleted': sample('energy-depleted'),
  'energy-allocation-changed': sample('energy-allocation-changed', { commandIndex: 2 }),
  'left-page-changed': sample('left-page-changed', { commandIndex: 2 }),
  'map-toggled': sample('map-toggled'),
  'warp-destination-set': sample('warp-destination-set'),
  'warp-started': sample('warp-started'),
  'warp-completed': sample('warp-completed', { arrival: { hostileNear: true } as never }),
  'command-delivered': sample('command-delivered'),
  'radio-queued': sample('radio-queued'),
  'radio-taken': sample('radio-taken'),
  'incoming-started': sample('incoming-started'),
  'incoming-ended': sample('incoming-ended'),
  'radio-flushed': sample('radio-flushed'),
  'docking-requested': sample('docking-requested'),
  'docking-cancelled': sample('docking-cancelled'),
  docked: sample('docked'),
  departed: sample('departed'),
  transition: sample('transition'),
  'base-navigated': sample('base-navigated', { moved: true }),
  'base-confirmed': sample('base-confirmed'),
  'wingman-command-consumed': sample('wingman-command-consumed'),
  'transponder-deployed': sample('transponder-deployed'),
  'all-clear': sample('all-clear'),
  'settlement-started': sample('settlement-started'),
  'settlement-deferred': sample('settlement-deferred'),
  'flight-message': sample('flight-message'),
  'player-loss-started': sample('player-loss-started'),
  'player-rescued': sample('player-rescued'),
  'result-latched': sample('result-latched'),
  'teardown-started': sample('teardown-started'),
  'mission-completed': sample('mission-completed'),
  'wingman-loss-timer-started': sample('wingman-loss-timer-started'),
  'wingman-loss-timer-expired': sample('wingman-loss-timer-expired'),
  'explosion-created': sample('explosion-created'),
  'view-switched': sample('view-switched', { viewMode: 1 }),
  'warp-wall-contact': sample('warp-wall-contact'),
  'object-retired': sample('object-retired', { entityId: 12, kindBit: ENEMY, state: 'pending-removal' }),
};

/** DW-06's table: each variant's action, and its sound or reason. */
const DW_06: { readonly [Type in DomainEventType]: string } = {
  'command-result': 'silent no-sound',
  'object-instantiated': 'silent no-sound',
  'speed-assist-toggled': 'silent no-sound',
  'speed-matched': 'silent no-sound',
  'speed-assist-released': 'silent no-sound',
  'object-left-world': 'leave',
  'target-changed': `by-id ${EVENT_SOUNDS.targetSelect}`,
  'target-cleared': 'silent no-sound',
  'weapon-selected': `by-id ${EVENT_SOUNDS.weaponSelect}`,
  'shot-fired': `shot ${SOUNDS.gun}`,
  hit: `hit ${SOUNDS.hull}`,
  'object-destroyed': 'silent no-sound',
  'explosion-started': 'presentation',
  'missile-ended': 'silent no-sound',
  'fragment-expired': 'silent no-sound',
  'source-released': 'silent no-sound',
  'energy-depleted': 'silent no-sound',
  'energy-allocation-changed': `by-id ${EVENT_SOUNDS.keyCommand}`,
  'left-page-changed': `by-id ${EVENT_SOUNDS.keyCommand}`,
  'map-toggled': 'silent no-sound',
  'warp-destination-set': `by-id ${EVENT_SOUNDS.mapDestination}`,
  'warp-started': `by-id ${EVENT_SOUNDS.warpStart}`,
  'warp-completed': `by-id ${EVENT_SOUNDS.warpArrival}`,
  'command-delivered': 'silent no-sound',
  'radio-queued': 'silent no-sound',
  'radio-taken': 'silent no-sound',
  'incoming-started': 'silent out-of-slice',
  'incoming-ended': 'silent no-sound',
  'radio-flushed': 'silent no-sound',
  'docking-requested': 'silent no-sound',
  'docking-cancelled': 'silent no-sound',
  docked: 'stop-all',
  departed: 'stop-all',
  transition: 'silent no-sound',
  'base-navigated': `by-id ${EVENT_SOUNDS.baseSelectKey}`,
  'base-confirmed': `by-id ${EVENT_SOUNDS.baseExecuteKey}`,
  'wingman-command-consumed': 'silent no-sound',
  'transponder-deployed': `by-id ${EVENT_SOUNDS.transponderCreated}`,
  'all-clear': 'silent no-sound',
  'settlement-started': 'silent no-sound',
  'settlement-deferred': 'silent no-sound',
  'flight-message': 'silent no-sound',
  'player-loss-started': 'silent no-sound',
  'player-rescued': 'stop-all',
  'result-latched': 'stop-all',
  'teardown-started': 'stop-all',
  'mission-completed': 'silent no-sound',
  'wingman-loss-timer-started': 'silent no-sound',
  'wingman-loss-timer-expired': 'silent no-sound',
  'explosion-created': 'presentation',
  'view-switched': 'hud-input',
  'warp-wall-contact': 'silent no-sound',
  'object-retired': 'retire',
};

const read = (event: DomainEvent, index = 0): EventSoundItem => readEventSound(CONTENT, event, index);

function summary(item: EventSoundItem): string {
  switch (item.action) {
    case 'silent': return `silent ${item.reason}`;
    case 'by-id': case 'shot': case 'hit': return `${item.action} ${item.sound}`;
    default: return item.action;
  }
}

function eventError(work: () => unknown, failure: FlightSoundEventFailure, path: string): void {
  const error = thrownBy(work);
  expect(error).toBeInstanceOf(FlightSoundEventError);
  expect(error).toMatchObject({ failure, path });
}

const delivered = (event: DomainEvent, commandId: number | null = null): TickEvent => ({ event, commandId });

describe('event classification (DW-06)', () => {
  it('names the P3-03 Assets of the original\'s play-by-ID entries', () => {
    expect(EVENT_SOUNDS).toEqual({
      targetSelect: 'sound/event/target-select', // 11087
      weaponSelect: 'sound/event/weapon-select', // 11381
      keyCommand: 'sound/event/key-command', // 10485
      mapDestination: 'sound/event/map-destination', // 10463
      warpStart: 'sound/warp', // 10401
      warpArrival: 'sound/event/warp-arrival', // 10181
      transponderCreated: 'sound/event/transponder-created', // 10055
      baseSelectKey: 'sound/event/base-select-key', // 10167
      baseExecuteKey: 'sound/event/base-execute-key', // 10169
    });
  });

  it('reads every DomainEvent variant by its own entry of DW-06', () => {
    const read = Object.fromEntries(Object.entries(EVERY_EVENT).map(([type, event]) => [type, summary(readEventSound(CONTENT, event, 0))]));
    expect(read).toEqual(DW_06);
  });

  it('plays every play-by-ID item in class 4 with preemption, whatever origin, change or command it reports', () => {
    const events: DomainEvent[] = [
      sample('target-changed', { origin: 'automatic', commandIndex: null }),
      sample('weapon-selected', { changed: false, commandIndex: 0 }),
      // The rescue's selection: no command (FA-06).
      sample('weapon-selected', { changed: true, commandIndex: null }),
      sample('base-navigated', { moved: false, row: null }),
      sample('base-confirmed', { row: null, record: null, moved: false }),
    ];
    for (const event of events) expect(read(event)).toMatchObject({ action: 'by-id', voiceClass: 4, preempt: true });
  });

  it('posts the conditional sounds only when the event says the original does', () => {
    expect(read(sample('left-page-changed', { commandIndex: null }))).toMatchObject({ action: 'silent', reason: 'condition' });
    expect(read(sample('left-page-changed', { commandIndex: 0 }))).toMatchObject({ action: 'by-id', sound: EVENT_SOUNDS.keyCommand });
    expect(read(sample('warp-completed', { arrival: null }))).toMatchObject({ action: 'silent', reason: 'condition' });
    expect(read(sample('warp-completed', { arrival: { hostileNear: false } as never }))).toMatchObject({ action: 'silent', reason: 'condition' });
    expect(read(sample('warp-completed', { arrival: { hostileNear: true } as never }))).toMatchObject({ action: 'by-id', sound: EVENT_SOUNDS.warpArrival });
    for (const viewMode of [0xc, 6, 8, 0x11, 0x13]) expect(read(sample('view-switched', { viewMode }))).toMatchObject({ action: 'silent', reason: 'condition' });
    // A failed command never sounds: no event follows a refused Warp or a rejected selection, and the result itself is silent.
    expect(read(sample('command-result', { outcome: 'ignored', reason: 'insufficient-energy' }))).toMatchObject({ action: 'silent', reason: 'no-sound' });
  });
});

describe('object sounds by kind bit (A-01, A-02)', () => {
  const shot = (fields: Partial<ShotFiredEvent>) => read({ ...SHOT, ...fields }) as ShotItem;
  const hit = (fields: Partial<HitEvent>) => read({ ...HIT, ...fields }) as HitItem;

  it('gives a gun shot the shooter\'s slot 1 as type 8 and a missile its slot 2 as type 4, both class 1 with preemption', () => {
    expect(shot({ family: 'gun', shooterEntityId: 4, shooterKindBit: ENEMY })).toMatchObject({
      action: 'shot', dispatch: 8, entityId: 4, slot: 1, sound: SOUNDS.gun, voiceClass: 1, preempt: true,
    });
    expect(shot({ family: 'missile', shooterEntityId: 4, shooterKindBit: ENEMY })).toMatchObject({
      action: 'shot', dispatch: 4, entityId: 4, slot: 2, sound: SOUNDS.missile, voiceClass: 1, preempt: true,
    });
  });

  it('keeps the shooter\'s snapshot in the item, never the projectile\'s position, and resolves without a Render State', () => {
    const item = shot({ shooterEntityId: 99, shooterPosition: at(7, 8, 9), position: at(70, 80, 90) });
    expect(item.entityId).toBe(99);
    expect(item.event.shooterPosition).toEqual(at(7, 8, 9));
    expect(item.sound).toBe(SOUNDS.gun);
  });

  it('gives a hit the victim\'s slot 4 when its shield was empty before, otherwise slot 3, as type 4 in class 2', () => {
    expect(hit({ victimEntityId: 6, victimKindBit: PLAYER, shieldWasEmpty: false })).toMatchObject({
      action: 'hit', dispatch: 4, entityId: 6, slot: 3, sound: SOUNDS.hull, voiceClass: 2, preempt: true,
    });
    expect(hit({ victimEntityId: 6, victimKindBit: PLAYER, shieldWasEmpty: true })).toMatchObject({ slot: 4, sound: SOUNDS.kill });
  });

  it('sounds a gated hit and every cause but a parked engagement\'s', () => {
    expect(hit({ gated: true })).toMatchObject({ action: 'hit', sound: SOUNDS.hull });
    for (const cause of ['projectile', 'missile', 'collision', 'area'] as const) expect(hit({ cause })).toMatchObject({ action: 'hit' });
    expect(read({ ...HIT, cause: 'parked', victimSpeed: null })).toMatchObject({ action: 'silent', reason: 'parked' });
  });

  it('tells an empty slot (legal silence) from a kind the bindings lack (a contract error)', () => {
    expect(shot({ shooterKindBit: SILENT_CRAFT })).toMatchObject({ action: 'shot', slot: 1, sound: null });
    expect(hit({ victimKindBit: SILENT_CRAFT, shieldWasEmpty: true })).toMatchObject({ action: 'hit', slot: 4, sound: null });
    eventError(() => shot({ shooterKindBit: UNBOUND }), 'unbound-kind', 'shot-fired.shooterKindBit');
    eventError(() => hit({ victimKindBit: UNBOUND }), 'unbound-kind', 'hit.victimKindBit');
    // A parked hit needs no binding: it posts no item.
    expect(read({ ...HIT, cause: 'parked', victimKindBit: UNBOUND })).toMatchObject({ action: 'silent', reason: 'parked' });
  });
});

describe('removal (DW-07)', () => {
  const retire = (kindBit: number) => read(sample('object-retired', { entityId: 30, kindBit, state: 'area-switch' }));

  it('dispatches kinds 0x21fffff as type 4 and 0x1600000 as type 8, and posts nothing for the others', () => {
    const types = Array.from({ length: 32 }, (_, kindBit) => dispatchTypeOfKind(kindBit));
    expect(types).toEqual([...Array(21).fill(4), 8, 8, null, 8, 4, ...Array(6).fill(null)]);
    for (const value of [-1, 32, 1.5, 0x80]) expect(() => dispatchTypeOfKind(value)).toThrow(RangeError);
  });

  it('stops the tracked voices of a retired craft or explosion, never of the kinds 0x3300000', () => {
    expect(retire(ENEMY)).toMatchObject({ action: 'retire', dispatch: 4, entityId: 30, stopsVoices: true });
    expect(retire(TRANSPONDER_KIND_BIT)).toMatchObject({ dispatch: 4, stopsVoices: true });
    expect(retire(EXPLOSION_KIND_BIT)).toMatchObject({ dispatch: 8, stopsVoices: true });
    expect([MISSILE_KIND_BIT, PROJECTILE_KIND_BIT, FRAGMENT_KIND_BIT, MARKER_KIND_BIT].map(retire)).toMatchObject([
      { dispatch: 4, stopsVoices: false }, { dispatch: 8, stopsVoices: false }, { dispatch: 8, stopsVoices: false }, { dispatch: 4, stopsVoices: false },
    ]);
    // A kind outside both masks has no removal item: its table is only dropped.
    for (const kindBit of [23, 26, 31]) expect(retire(kindBit)).toMatchObject({ action: 'retire', dispatch: null, stopsVoices: false });
  });

  it('drops a parked object\'s table on its exit from the world without a removal item', () => {
    expect(read(sample('object-left-world', { entityId: 12, kindBit: ENEMY }))).toMatchObject({ action: 'leave', entityId: 12 });
  });
});

describe('a tick\'s events (DW-03, DW-09)', () => {
  it('keeps every event in emission order with its tick and index, equal events as separate items', () => {
    const select = sample('weapon-selected', { changed: false, commandIndex: 0 });
    const events = [delivered(select, 4), delivered(select, 4), delivered(SHOT), delivered(SHOT), delivered(HIT)];
    const { tick, stopAll, items } = readTickEventSounds(CONTENT, { tick: 5, events });
    expect(tick).toBe(5);
    expect(stopAll).toBe(false);
    expect(items.map(({ action, tick: at, index }) => [action, at, index])).toEqual([
      ['by-id', 5, 0], ['by-id', 5, 1], ['shot', 5, 2], ['shot', 5, 3], ['hit', 5, 4],
    ]);
    expect(items.map(({ event }) => event)).toEqual([select, select, SHOT, SHOT, HIT]);
  });

  it('never keys a sound by the delivery\'s command ID', () => {
    const select = sample('weapon-selected', { changed: true, commandIndex: 0 });
    const withId = readTickEventSounds(CONTENT, { tick: 5, events: [delivered(select, 17)] });
    const without = readTickEventSounds(CONTENT, { tick: 5, events: [delivered(select)] });
    expect(withId).toEqual(without);
  });

  it('marks a tick with any stop event for one stop before all its sounds, also when the sounds were emitted first', () => {
    // A rescue tick: its selections, then `player-rescued`, then the hold (ME-13); the selections still play (DW-09 (d)).
    const events = [
      sample('weapon-selected', { changed: true, commandIndex: null }),
      sample('weapon-selected', { changed: true, commandIndex: null }),
      sample('player-rescued'),
      sample('transition', { gap: 'G-02/5' }),
    ].map(event => delivered(event));
    const { stopAll, items } = readTickEventSounds(CONTENT, { tick: 5, events });
    expect(stopAll).toBe(true);
    expect(items.map(({ action }) => action)).toEqual(['by-id', 'by-id', 'stop-all', 'silent']);
    for (const type of ['docked', 'departed', 'result-latched', 'teardown-started'] as const) {
      expect(readTickEventSounds(CONTENT, { tick: 5, events: [delivered(sample(type))] }).stopAll).toBe(true);
    }
    expect(readTickEventSounds(CONTENT, { tick: 5, events: [] })).toEqual({ tick: 5, stopAll: false, items: [] });
  });

  it('refuses an event of another tick', () => {
    eventError(() => readTickEventSounds(CONTENT, { tick: 6, events: [delivered(SHOT)] }), 'tick-mismatch', 'events[0].tick');
  });

  it('returns frozen items that hold the delivered event itself', () => {
    const reading = readTickEventSounds(CONTENT, { tick: 5, events: COMBAT_EVENTS.map(event => delivered(event)) });
    expect(deepFrozen(reading)).toBe(true);
    expect(reading.items.map(({ event }) => event)).toEqual(COMBAT_EVENTS);
    reading.items.forEach(({ event }, index) => expect(event).toBe(COMBAT_EVENTS[index]));
  });
});

describe('formal Core combat events', () => {
  // A synthetic combat run (as combat-replay.test.ts's): the player kills kind 7 ahead with its gun at tick 3, fires a
  // missile at kind 8 at tick 11, then changes selection, page and allocation; seed 12 sends fragments into the player.
  function combatWorld() {
    const mission = missionFrame();
    mission.declarations = [
      declaration(0, { craftType: PLAYER, position: { x: 100, y: 200, z: 0 } }),
      declaration(1, { craftType: ENEMY, position: { x: 100, y: 200, z: 60 } }),
      declaration(2, { craftType: SILENT_CRAFT, position: { x: 100, y: 200, z: 120 } }),
      declaration(3, { craftType: ENEMY, position: { x: 100, y: 200, z: 300 } }),
    ];
    const info = craftInfoContent();
    info.hitDamageScale = 1;
    info.guns = info.guns.map(() => gun({ at08: 2000, at14: 8, at18: 5, at1C: 400, at24: 64, at28: 0 }));
    info.missiles[1] = missile({
      body: 1, at18: 1, at1C: 6, at20: 0, at28: 0.5, at30: 10, at34: 20, at38: 30, at3C: 0, at44: 320, at48: 32, at4C: 10, at54: 0, at58: 4,
      at5C: 800, at60: 4, at64: 20,
    });
    Object.assign(info.missileBodies[1], { atB8: 640, atBC: 640, atC0: 640 });
    Object.assign(info.craft[PLAYER], {
      at74: 100, at9C: 400, mounts: [mount({ weapon: 0, at20: 0, at34: 0 }), mount({ at10: 1, weapon: 1, at0C: 4 })], mountLists: [[0], [1], []],
    });
    for (const kindBit of [ENEMY, SILENT_CRAFT]) info.craft[kindBit].atB8 = 0;
    return createWorld(asCreateInput(worldInput({ mission, craftInfo: info, run: { seed: 12 } })));
  }

  const COMMANDS: Readonly<Record<number, readonly Command[]>> = {
    3: [{ type: 'fire', channel: 'primary' }],
    10: [{ type: 'target', operation: 'enemy' }],
    11: [{ type: 'fire', channel: 'secondary' }],
    50: [{ type: 'damage-report' }, { type: 'energy', operation: 'open' }, { type: 'energy', operation: 'shield-increase' }],
    52: [{ type: 'select-missile', direction: 'next' }, { type: 'target', operation: 'friendly' }, { type: 'target', operation: 'enemy' }],
  };

  /** Each tick's events, read for sound. */
  function run(): { readonly events: readonly DomainEvent[]; readonly items: readonly EventSoundItem[] } {
    const world = combatWorld();
    const events: DomainEvent[] = [];
    const items: EventSoundItem[] = [];
    for (let tick = 1; tick <= 120; tick++) {
      const emitted = world.step(tickInput(COMMANDS[tick] ?? []));
      const reading = readTickEventSounds(CONTENT, { tick, events: emitted.map(event => delivered(event)) });
      expect(reading.items).toHaveLength(emitted.length);
      events.push(...emitted);
      items.push(...reading.items);
    }
    return { events, items };
  }

  const { events, items } = run();
  const of = <Action extends EventSoundItem['action']>(action: Action) =>
    items.filter((item): item is Extract<EventSoundItem, { action: Action }> => item.action === action);

  it('reads every event the run emits', () => {
    expect(items.map(({ event }) => event)).toEqual(events);
    expect([...new Set(events.map(({ type }) => type))]).toEqual(expect.arrayContaining([
      'object-instantiated', 'command-result', 'target-changed', 'weapon-selected', 'shot-fired', 'hit', 'object-destroyed', 'explosion-created',
      'explosion-started', 'object-retired', 'missile-ended', 'left-page-changed', 'energy-allocation-changed',
    ]));
  });

  it('sounds the player\'s gun and missile from its own slots', () => {
    const shots = of('shot').map(({ dispatch, slot, sound, entityId }) => ({ dispatch, slot, sound, entityId }));
    expect(shots).toContainEqual({ dispatch: 8, slot: 1, sound: SOUNDS.gun, entityId: 1 });
    expect(shots).toContainEqual({ dispatch: 4, slot: 2, sound: SOUNDS.missile, entityId: 1 });
    expect(of('shot').every(({ event }) => event.shooterKindBit === PLAYER)).toBe(true);
  });

  it('sounds each hit from its victim\'s kind, an empty slot as legal silence', () => {
    const hits = of('hit');
    expect(hits.length).toBeGreaterThan(0);
    for (const { event, slot, sound } of hits) {
      expect(slot).toBe(event.shieldWasEmpty ? 4 : 3);
      expect(sound).toBe(event.shieldWasEmpty ? SOUNDS.kill : SOUNDS.hull);
    }
    expect(new Set(hits.map(({ event }) => event.victimKindBit))).toEqual(new Set([PLAYER, ENEMY]));
    // The same Core hits against a package whose enemy model has empty hit slots: silence, not an error.
    const { held: emptied, bound: binding } = soundPackage({
      slots: {
        [MODELS.player]: [SOUNDS.playerEngine, SOUNDS.gun, SOUNDS.missile, SOUNDS.hull, SOUNDS.kill],
        [MODELS.enemyA]: [SOUNDS.enemyEngine, SOUNDS.gun, SOUNDS.missile, null, null],
        [MODELS.enemyB]: [null, null, null, null, null],
        [MODELS.base]: [null, null, null, null, null],
      },
    });
    const quiet = bindFlightSounds(emptied, binding);
    const enemyHits = hits.filter(({ event }) => event.victimKindBit === ENEMY);
    expect(enemyHits.length).toBeGreaterThan(0);
    for (const { event, index } of enemyHits) expect(readEventSound(quiet, event, index)).toMatchObject({ action: 'hit', sound: null });
  });

  it('turns retirements into removal items and selections, pages and allocations into play-by-ID items', () => {
    const retired = of('retire');
    expect(retired.some(({ event, dispatch, stopsVoices }) => event.kindBit === EXPLOSION_KIND_BIT && dispatch === 8 && stopsVoices)).toBe(true);
    expect(retired.some(({ event, stopsVoices }) => event.kindBit === PROJECTILE_KIND_BIT && !stopsVoices)).toBe(true);
    const byId = of('by-id').map(({ sound, tick }) => `${tick} ${sound}`);
    expect(byId).toEqual(expect.arrayContaining([
      `10 ${EVENT_SOUNDS.targetSelect}`, `50 ${EVENT_SOUNDS.keyCommand}`, `52 ${EVENT_SOUNDS.weaponSelect}`,
    ]));
    expect(of('stop-all')).toEqual([]);
  });
});
