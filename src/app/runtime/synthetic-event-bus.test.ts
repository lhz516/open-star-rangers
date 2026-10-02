import { describe, expect, it } from 'vitest';
import { createSyntheticScene, type DomainEvent } from '../../core/synthetic/synthetic-scene.ts';
import { SyntheticEventBus, type EventListener } from './synthetic-event-bus.ts';

function batch() {
  return createSyntheticScene({ seed: 0 }).step({
    input: { moveX: 0 },
    commands: [{ type: 'add-marker' }, { type: 'add-marker' }, { type: 'remove-marker' }],
  }).map((event, index) => ({ event, delivery: { commandId: index + 1 } }));
}

describe('SyntheticEventBus', () => {
  it('filters types, interleaves registration order and preserves frozen event identities', () => {
    const bus = new SyntheticEventBus(), events = batch(), calls: string[] = [];
    bus.on('marker-added', (event, delivery) => {
      expect(event).toBe(events[0].event);
      expect(Object.isFrozen(event)).toBe(true);
      expect(Object.isFrozen(delivery)).toBe(true);
      calls.push(`added:${delivery.commandId}`);
    });
    bus.onAny((event, delivery) => { calls.push(`all:${event.type}:${delivery.commandId}`); });
    bus.on('command-rejected', event => { calls.push(event.reason); });
    bus.dispatch(events);
    expect(calls).toEqual(['added:1', 'all:marker-added:1', 'all:command-rejected:2', 'marker-already-exists', 'all:marker-removed:3']);
  });

  it('does not retain past events or share subscriptions between instances', () => {
    const bus = new SyntheticEventBus(), other = new SyntheticEventBus(), calls: DomainEvent[] = [];
    bus.dispatch(batch());
    bus.onAny(event => { calls.push(event); });
    bus.dispatch([]);
    other.dispatch(batch());
    expect(calls).toEqual([]);
    bus.dispatch(batch());
    expect(calls).toHaveLength(3);
  });

  it('treats repeated function registrations independently and cancellation as idempotent', () => {
    const bus = new SyntheticEventBus();
    let calls = 0;
    const listener: EventListener = () => { calls++; };
    const cancel = bus.onAny(listener);
    bus.onAny(listener);
    bus.dispatch(batch());
    expect(calls).toBe(6);
    cancel(); cancel();
    bus.dispatch(batch());
    expect(calls).toBe(9);
  });

  it('defers additions and immediately cancels a not-yet-called receiver', () => {
    const bus = new SyntheticEventBus(), calls: string[] = [];
    let added = false;
    bus.onAny(() => {
      calls.push('a');
      cancel();
      if (!added) { added = true; bus.onAny(() => { calls.push('new'); }); }
    });
    const cancel = bus.onAny(() => { calls.push('cancelled'); });
    bus.dispatch(batch());
    expect(calls).toEqual(['a', 'a', 'a']);
    calls.length = 0;
    bus.dispatch(batch());
    expect(calls).toEqual(['a', 'new', 'a', 'new', 'a', 'new']);
  });

  it('delivers the whole batch despite thrown values, keeps subscriptions, and never retries', () => {
    const bus = new SyntheticEventBus(), failures: unknown[] = [new Error('A'), 'B', undefined];
    let a = 0, b = 0;
    const cancel = bus.onAny(() => { throw failures[a++ % failures.length]; });
    bus.onAny(() => { b++; });
    expect(() => bus.dispatch(batch())).toThrowError(expect.objectContaining({ kind: 'listener-failed', errors: failures }));
    expect([a, b]).toEqual([3, 3]);
    expect(() => bus.dispatch([])).not.toThrow();
    expect(() => bus.dispatch(batch())).toThrowError(expect.objectContaining({ kind: 'listener-failed', errors: failures }));
    expect([a, b]).toEqual([6, 6]);
    cancel();
    bus.dispatch(batch());
    expect([a, b]).toEqual([6, 9]);
  });

  it('preserves order across ticks in an internal batch', () => {
    const scene = createSyntheticScene({ seed: 0 }), bus = new SyntheticEventBus(), ticks: number[] = [];
    const events = [
      ...scene.step({ input: { moveX: 0 }, commands: [{ type: 'add-marker' }] }),
      ...scene.step({ input: { moveX: 0 }, commands: [{ type: 'remove-marker' }] }),
    ];
    bus.onAny(event => { ticks.push(event.tick); });
    bus.dispatch(events.map((event, i) => ({ event, delivery: { commandId: i + 1 } })));
    expect(ticks).toEqual([1, 2]);
  });

  it('rejects unknown types and non-functions with precise paths', () => {
    const bus = new SyntheticEventBus();
    expect(() => bus.on('unknown' as DomainEvent['type'], () => {})).toThrowError(expect.objectContaining({ path: 'on.type' }));
    // @ts-expect-error Exercise the non-function runtime guard.
    expect(() => bus.on('marker-added', null)).toThrowError(expect.objectContaining({ path: 'on.listener' }));
    // @ts-expect-error Exercise the non-function runtime guard.
    expect(() => bus.onAny(null)).toThrowError(expect.objectContaining({ path: 'onAny.listener' }));
  });
});

function checkTypes(bus: SyntheticEventBus) {
  bus.on('marker-added', event => {
    const id: number = event.entityId;
    void id;
    // @ts-expect-error Added events have no rejection reason.
    void event.reason;
  });
  // @ts-expect-error Async callbacks cannot participate in synchronous error aggregation.
  bus.onAny(async () => {});
  // @ts-expect-error A non-async function returning a Promise is also invalid.
  bus.on('marker-removed', () => Promise.resolve());
}
void checkTypes;
