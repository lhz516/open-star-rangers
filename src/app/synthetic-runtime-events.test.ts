import { describe, expect, it } from 'vitest';
import { CoreInputError } from '../core/errors.ts';
import type { Command, DomainEvent } from '../core/synthetic-scene.ts';
import type { EventDelivery } from './synthetic-event-bus.ts';
import { createSyntheticRuntime } from './synthetic-runtime.ts';

const create = () => createSyntheticRuntime({ scene: { seed: 0, tickRateHz: 50 } });

describe('Runtime commands and frame-end delivery', () => {
  it('consumes FIFO once at the first tick, preserving IDs and end-of-frame reads', () => {
    const runtime = create(), events: { event: DomainEvent; delivery: EventDelivery }[] = [];
    expect(runtime.submitCommand({ type: 'add-marker' })).toBe(1);
    expect(runtime.submitCommand({ type: 'add-marker' })).toBe(2);
    expect(runtime.submitCommand({ type: 'remove-marker' })).toBe(3);
    runtime.onAny((event, delivery) => {
      events.push({ event, delivery });
      expect(runtime.uiProjection().tick).toBe(3);
      expect(runtime.renderFrame()).toMatchObject({ current: { tick: 3 }, alpha: 0.25 });
    });
    runtime.frame(0); runtime.frame(10);
    expect(events).toEqual([]);
    expect(runtime.frame(65)).toEqual({ ticks: 3, capped: false });
    expect(events.map(({ event, delivery }) => [event.type, event.tick, event.commandIndex, delivery.commandId])).toEqual([
      ['marker-added', 1, 0, 1], ['command-rejected', 1, 1, 2], ['marker-removed', 1, 2, 3],
    ]);
    expect(events[0].event).toMatchObject({ entityId: 2 });
    expect(events[1].event).toMatchObject({ reason: 'marker-already-exists' });
    expect(events[2].event).toMatchObject({ entityId: 2 });
    expect(runtime.uiProjection().marker).toBeNull();
  });

  it.each([null, { type: 'unknown' }, { type: 'add-marker', extra: 1 }])('rejects %j without consuming IDs', command => {
    const runtime = create();
    expect(runtime.submitCommand({ type: 'add-marker' })).toBe(1);
    expect(() => runtime.submitCommand(command as Command)).toThrowError(expect.objectContaining({
      kind: 'invalid-argument', cause: expect.any(CoreInputError),
    }));
    expect(runtime.submitCommand({ type: 'remove-marker' })).toBe(2);
    runtime.frame(0); runtime.frame(20);
    expect(runtime.uiProjection().marker).toBeNull();
  });

  it('executes the validated command copy, reading caller getters once', () => {
    const runtime = create();
    let reads = 0;
    const command: Command = { get type() { return reads++ === 0 ? 'add-marker' : 'remove-marker'; } };
    runtime.submitCommand(command);
    expect(reads).toBe(1);
    expect(Object.isFrozen(command)).toBe(false);
    runtime.frame(0); runtime.frame(20);
    expect(runtime.uiProjection().marker?.id).toBe(2);
  });

  it('defers listener-generated commands and input across zero-tick frames', () => {
    const runtime = create(), events: DomainEvent[] = [];
    runtime.submitCommand({ type: 'add-marker' }); runtime.submitCommand({ type: 'remove-marker' });
    runtime.on('marker-removed', () => {
      expect(runtime.submitCommand({ type: 'add-marker' })).toBe(3);
      runtime.setInput({ moveX: 1 });
    });
    runtime.onAny(event => { events.push(event); });
    runtime.frame(0); runtime.frame(60); runtime.frame(65);
    expect(events).toHaveLength(2);
    expect(runtime.uiProjection().mover.position.x).toBe(0);
    runtime.frame(80);
    expect(events[2]).toMatchObject({ type: 'marker-added', tick: 4, commandIndex: 0 });
    expect(runtime.uiProjection().mover.position.x).toBe(0.02);
  });

  it.each([true, false])('handles nested frames (listener catches = %s)', caught => {
    const runtime = create();
    let deliveries = 0;
    const off = runtime.onAny(() => {
      if (caught) expect(() => runtime.frame(200)).toThrowError(expect.objectContaining({ kind: 'reentrant-call' }));
      else runtime.frame(200);
    });
    runtime.onAny(() => { deliveries++; });
    runtime.submitCommand({ type: 'add-marker' }); runtime.frame(0);
    if (caught) expect(runtime.frame(60)).toEqual({ ticks: 3, capped: false });
    else expect(() => runtime.frame(60)).toThrowError(expect.objectContaining({
      kind: 'listener-failed', errors: [expect.objectContaining({ kind: 'reentrant-call' })],
    }));
    expect(deliveries).toBe(1);
    off();
    expect(runtime.frame(60)).toEqual({ ticks: 0, capped: false });
    expect(runtime.uiProjection().tick).toBe(3);
  });

  it('retains listener side effects on failure but does not replay the committed frame', () => {
    const setup = (fail: boolean) => {
      const runtime = create(), events: DomainEvent[] = [];
      const errors = [new Error('one'), 'two', undefined];
      let calls = 0;
      const off = runtime.onAny(() => {
        runtime.submitCommand({ type: 'remove-marker' });
        runtime.setInput({ moveX: 1 });
        const cause = errors[calls++];
        if (fail) throw cause;
      });
      runtime.onAny(event => { events.push(event); });
      for (const type of ['add-marker', 'add-marker', 'remove-marker'] as const) runtime.submitCommand({ type });
      runtime.frame(0);
      return { runtime, events, errors, off };
    };
    const failed = setup(true), control = setup(false);
    expect(() => failed.runtime.frame(60)).toThrowError(expect.objectContaining({ kind: 'listener-failed', errors: failed.errors }));
    control.runtime.frame(60);
    expect(failed.events).toEqual(control.events);
    expect(failed.runtime.renderFrame()).toEqual(control.runtime.renderFrame());
    failed.off(); control.off();
    expect(failed.runtime.frame(60).ticks).toBe(0);
    expect(failed.events).toHaveLength(3);
    failed.runtime.frame(80); control.runtime.frame(80);
    expect(failed.events).toHaveLength(6);
    expect(failed.events).toEqual(control.events);
    expect(failed.runtime.uiProjection()).toEqual(control.runtime.uiProjection());
  });
});
