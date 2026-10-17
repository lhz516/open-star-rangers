import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import { createWorld } from '../../core/world/create-world.ts';
import { asCreateInput, worldInput } from '../../core/world/create-world.test-support.ts';
import { COMBAT_EVENTS, MAP_WARP_EVENTS } from './combat-events.test-support.ts';
import { GameEventBus, type GameEventListener, type PendingDelivery } from './game-event-bus.ts';
import { GameRuntimeError } from './runtime-errors.ts';

/** A real first tick of the slice mission: two command results, then the instantiations due at time 0. */
function batch(): PendingDelivery[] {
  const events = createWorld(asCreateInput(worldInput())).step({
    axes: { pitch: 0, yaw: 0, roll: 0 },
    commands: [{ type: 'fire', channel: 'primary' }, { type: 'launch' }],
  });
  return events.map((event) => ({ event, commandId: event.type === 'command-result' ? event.commandIndex + 1 : null }));
}

const label = (event: DomainEvent) => {
  switch (event.type) {
    case 'command-result': return `result:${event.commandIndex}`;
    case 'object-instantiated': return `object:${event.entityId}`;
    default: return event.type;
  }
};

/** One event of each P3-06 type, as Core emits them (docs/plan/p3/06/spec.md, 检查点 A 定稿的状态与契约). */
const FLIGHT_EVENTS: readonly DomainEvent[] = Object.freeze([
  Object.freeze({ type: 'speed-assist-released', tick: 5 }),
  Object.freeze({ type: 'speed-matched', tick: 5, targetEntityId: 3, origin: 'assist', speedDifferenceExceeded: true }),
  Object.freeze({ type: 'speed-assist-toggled', tick: 5, commandIndex: 0, enabled: true }),
  Object.freeze({ type: 'speed-matched', tick: 5, targetEntityId: 3, origin: 'command', commandIndex: 1 }),
  Object.freeze({ type: 'object-left-world', tick: 5, entityId: 4, kindBit: 7, source: null }),
] satisfies DomainEvent[]);

describe('GameEventBus', () => {
  it('delivers each event to every receiver in registration order, filtered by type, with the given metadata', () => {
    const bus = new GameEventBus(), pending = batch(), calls: string[] = [];
    expect(pending.slice(0, 2).map(({ event }) => event.type)).toEqual(['command-result', 'command-result']);
    expect(pending.length).toBeGreaterThan(3);
    bus.on('command-result', (event, delivery) => { calls.push(`r:${event.commandType}:${delivery.commandId}`); });
    bus.onAny((event, delivery) => {
      expect(event).toBe(pending.find((entry) => entry.event === event)?.event);
      expect(Object.isFrozen(event) && Object.isFrozen(delivery)).toBe(true);
      calls.push(`a:${label(event)}:${delivery.commandId}`);
    });
    bus.on('object-instantiated', (event, delivery) => { calls.push(`o:${event.entityId}:${delivery.commandId}`); });
    bus.dispatch(pending.slice(0, 4));
    expect(calls).toEqual([
      'r:fire:1', 'a:result:0:1',
      'r:launch:2', 'a:result:1:2',
      'a:object:1:null', 'o:1:null',
      'a:object:2:null', 'o:2:null',
    ]);
  });

  it('keeps no history and shares nothing between instances', () => {
    const bus = new GameEventBus(), other = new GameEventBus(), calls: DomainEvent[] = [];
    bus.dispatch(batch());
    bus.onAny((event) => { calls.push(event); });
    bus.dispatch([]);
    other.dispatch(batch());
    expect(calls).toEqual([]);
    const pending = batch();
    bus.dispatch(pending);
    expect(calls).toEqual(pending.map(({ event }) => event));
  });

  it('fixes the receivers of a batch: a new subscription waits for the next batch, a cancellation is immediate and idempotent', () => {
    const bus = new GameEventBus(), calls: string[] = [];
    let added = false;
    bus.onAny(() => {
      calls.push('first');
      cancel();
      cancel();
      if (!added) {
        added = true;
        bus.onAny(() => { calls.push('new'); });
      }
    });
    const cancel = bus.onAny(() => { calls.push('cancelled'); });
    const pending = batch().slice(0, 2);
    bus.dispatch(pending);
    expect(calls).toEqual(['first', 'first']);
    bus.dispatch(pending);
    expect(calls).toEqual(['first', 'first', 'first', 'new', 'first', 'new']);
  });

  it('treats repeated registrations of one function independently', () => {
    const bus = new GameEventBus();
    let calls = 0;
    const listener: GameEventListener = () => { calls++; };
    const cancel = bus.onAny(listener);
    bus.onAny(listener);
    bus.dispatch(batch().slice(0, 1));
    expect(calls).toBe(2);
    cancel();
    bus.dispatch(batch().slice(0, 1));
    expect(calls).toBe(3);
  });

  it('tries every receiver for every event and reports all failures afterwards', () => {
    const bus = new GameEventBus(), first = new Error('first'), calls: string[] = [];
    bus.onAny(() => { throw first; });
    bus.onAny((event) => { calls.push(label(event)); });
    bus.on('command-result', () => { throw 'second'; });
    const pending = batch().slice(0, 3);
    let error: unknown;
    try { bus.dispatch(pending); } catch (caught) { error = caught; }
    expect(calls).toEqual(['result:0', 'result:1', 'object:1']);
    expect(error).toBeInstanceOf(GameRuntimeError);
    expect(error).toMatchObject({ kind: 'listener-failed', errors: [first, 'second', first, 'second', first] });
  });

  it('counts a receiver that returns anything, such as a Promise, as failed, without an unhandled rejection', async () => {
    const bus = new GameEventBus(), calls: string[] = [];
    bus.onAny((async () => { calls.push('async'); throw new Error('later'); }) as never);
    bus.on('command-result', (() => 'value') as never);
    bus.onAny(() => { calls.push('sync'); });
    let error: unknown;
    try { bus.dispatch(batch().slice(0, 1)); } catch (caught) { error = caught; }
    expect(calls).toEqual(['async', 'sync']);
    expect(error).toMatchObject({ kind: 'listener-failed' });
    expect((error as GameRuntimeError).errors).toEqual([expect.any(TypeError), expect.any(TypeError)]);
    // Vitest fails the run on an unhandled rejection; let the async receiver's rejection settle first.
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });

  it('accepts every Core event type, P3-06\'s speed and world-exit events included, and filters by it', () => {
    const bus = new GameEventBus(), calls: string[] = [];
    for (const type of ['speed-assist-toggled', 'speed-matched', 'speed-assist-released', 'object-left-world'] as const) {
      bus.on(type, (event, delivery) => { calls.push(`${type}:${event.tick}:${delivery.commandId}`); });
    }
    bus.dispatch(FLIGHT_EVENTS.map((event) => ({ event, commandId: null })));
    expect(calls).toEqual([
      'speed-assist-released:5:null', 'speed-matched:5:null', 'speed-assist-toggled:5:null', 'speed-matched:5:null', 'object-left-world:5:null',
    ]);
  });

  it('accepts P3-07\'s combat event types and filters by each', () => {
    const bus = new GameEventBus(), calls: string[] = [];
    for (const { type } of COMBAT_EVENTS) bus.on(type, (event, delivery) => { calls.push(`${event.type}:${delivery.commandId}`); });
    bus.dispatch(COMBAT_EVENTS.map((event) => ({ event, commandId: null })));
    expect(calls).toEqual(COMBAT_EVENTS.map(({ type }) => `${type}:null`));
    expect(new Set(calls).size).toBe(13);
  });

  it('accepts P3-09\'s map and Warp event types and filters by each', () => {
    const bus = new GameEventBus(), calls: string[] = [];
    for (const { type } of MAP_WARP_EVENTS) bus.on(type, (event, delivery) => { calls.push(`${event.type}:${delivery.commandId}`); });
    bus.dispatch([...COMBAT_EVENTS, ...MAP_WARP_EVENTS].map((event) => ({ event, commandId: null })));
    expect(calls).toEqual(['map-toggled:null', 'warp-destination-set:null', 'warp-started:null', 'warp-completed:null']);
  });

  it('accepts P3-08\'s wingman command and transponder event types and filters by each (CR-22)', () => {
    const bus = new GameEventBus(), calls: string[] = [];
    const events: DomainEvent[] = [
      { type: 'wingman-command-consumed', tick: 6, wingmanEntityId: 2, code: 7, issuedTick: 5, path: 'parked', outcome: 'status', replyLine: 0xc },
      { type: 'transponder-deployed', tick: 6, entityId: 9, creatorEntityId: 1, position: { x: 0, y: -15, z: 1 }, orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
    ];
    for (const { type } of events) bus.on(type, (event, delivery) => { calls.push(`${event.type}:${delivery.commandId}`); });
    bus.dispatch([...COMBAT_EVENTS, ...events].map((event) => ({ event, commandId: null })));
    expect(calls).toEqual(['wingman-command-consumed:null', 'transponder-deployed:null']);
  });

  it('accepts P3-12\'s presentation fact types and filters by each (FS-03)', () => {
    const bus = new GameEventBus(), calls: string[] = [];
    const events: DomainEvent[] = [
      {
        type: 'explosion-created', tick: 6, entityId: 9, sourceEntityId: 4, sourceKindBit: 7, variant: 'other', stage: 'collision',
        position: { x: 1, y: -2, z: 3 }, velocity: { x: 0, y: 0, z: 48 },
      },
      { type: 'view-switched', tick: 6, fromViewMode: 12, fromSubMode: 0, viewMode: 8, subMode: 0, stage: 'request-handling', player: null },
      { type: 'warp-wall-contact', tick: 6, serial: 1 },
    ];
    for (const { type } of events) bus.on(type, (event, delivery) => { calls.push(`${event.type}:${delivery.commandId}`); });
    bus.dispatch([...COMBAT_EVENTS, ...events].map((event) => ({ event, commandId: null })));
    expect(calls).toEqual(['explosion-created:null', 'view-switched:null', 'warp-wall-contact:null']);
  });

  it('clears every subscription, and rejects unknown types and non-function receivers', () => {
    const bus = new GameEventBus();
    let calls = 0;
    bus.onAny(() => { calls++; });
    bus.clear();
    bus.dispatch(batch());
    expect(calls).toBe(0);
    for (const [action, path] of [
      [() => bus.on('marker-added' as never, () => undefined), 'on.type'],
      [() => bus.on('toString' as never, () => undefined), 'on.type'],
      [() => bus.on('command-result', null as never), 'on.listener'],
      [() => bus.onAny('listener' as never), 'onAny.listener'],
    ] as const) {
      expect(action).toThrowError(expect.objectContaining({ kind: 'invalid-argument', path }));
    }
  });
});

function checkTypes(bus: GameEventBus) {
  // @ts-expect-error Receivers are synchronous.
  bus.onAny(async () => undefined);
  // @ts-expect-error A command result has no entity.
  bus.on('command-result', (event) => { void event.entityId; });
  // @ts-expect-error The delivery ID is nullable.
  bus.onAny((_event, delivery) => { const id: number = delivery.commandId; void id; });
}
void checkTypes;
