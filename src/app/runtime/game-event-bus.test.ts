import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import { createWorld } from '../../core/world/create-world.ts';
import { asCreateInput, worldInput } from '../../core/world/create-world.test-support.ts';
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

const label = (event: DomainEvent) => (event.type === 'command-result' ? `result:${event.commandIndex}` : `object:${event.entityId}`);

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
