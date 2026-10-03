import { describe, expect, it } from 'vitest';
import { RollbackError } from '../../app/session/rollback-error.ts';
import { classifyKeyboardInput, HeldKeyboardAxis, normalizeKeyboardInput } from './keyboard-input.ts';
import type { KeyboardInput, KeyboardSignal, KeyboardSink } from './keyboard-input.ts';
import { createKeyboardSource } from './keyboard-source.ts';
import type { KeyboardFacts, KeyboardHost, KeyboardLifecycleType } from './keyboard-source.ts';

class Host implements KeyboardHost {
  facts: KeyboardFacts = { visible: true, elementFocused: true, windowFocused: true };
  readonly keys = new Map<KeyboardInput['type'], (event: KeyboardInput, prevent: () => void) => void>();
  readonly signals = new Map<KeyboardLifecycleType, () => void>();
  readonly removals: number[] = [];
  failAdd = -1;
  failRemove = new Set<number>();
  adds = 0;
  readonly failure = new Error('injected');
  readFacts = () => this.facts;
  listenKey(type: KeyboardInput['type'], listener: (event: KeyboardInput, prevent: () => void) => void) {
    return this.add(() => this.keys.set(type, listener));
  }
  listenSignal(type: KeyboardLifecycleType, listener: () => void) {
    return this.add(() => this.signals.set(type, listener));
  }
  add(save: () => void): () => void {
    const id = this.adds++;
    if (id === this.failAdd) throw this.failure;
    save();
    return () => {
      this.removals.push(id);
      if (this.failRemove.has(id)) throw this.failure;
    };
  }
  signal(type: KeyboardLifecycleType): void {
    const listener = this.signals.get(type);
    if (!listener) throw new Error('Missing signal listener');
    listener();
  }
  key(patch: Partial<KeyboardInput> = {}): number {
    const input = normalizeKeyboardInput({
      type: 'keydown', code: 'ArrowRight', repeat: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false, ...patch,
    });
    let prevented = 0;
    this.keys.get(input.type)?.(input, () => { prevented++; });
    return prevented;
  }
}

function setup(host = new Host()) {
  const signals: KeyboardSignal[] = [];
  const keys: KeyboardInput[] = [];
  const held = new HeldKeyboardAxis({ ArrowRight: 1 });
  const sink: KeyboardSink = {
    key(event, eligible) {
      keys.push(event);
      held.apply(event, eligible, true);
      return classifyKeyboardInput(event, event.code === 'ArrowRight', eligible).preventDefault;
    },
    signal(signal) {
      signals.push(signal);
      if (!signal.eligible) held.clear();
    },
  };
  const source = createKeyboardSource(host);
  return { host, signals, keys, held, sink, source };
}

describe('production keyboard source', () => {
  it('owns exactly nine registrations, normalizes keys, and invalidates before removal', () => {
    const s = setup();
    const release = s.source.connect(s.sink);
    expect(s.host.adds).toBe(9);
    expect(s.signals).toEqual([{ type: 'initial', eligible: true }]);
    expect(s.host.key()).toBe(1);
    expect(Object.isFrozen(s.keys[0])).toBe(true);
    release();
    release();
    expect(s.host.removals).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const count = s.signals.length;
    expect(s.host.key()).toBe(0);
    s.host.signal('focus');
    expect(s.keys).toHaveLength(1);
    expect(s.signals).toHaveLength(count);
    expect(() => s.source.connect(s.sink)).toThrow('exactly once');
  });

  it.each(['elementFocused', 'windowFocused', 'visible'] as const)('reconciles initial %s qualification', field => {
    const s = setup();
    s.host.facts = { ...s.host.facts, [field]: false };
    s.source.connect(s.sink)();
    expect(s.signals[0]?.eligible).toBe(false);
  });

  it('reconciles real facts on keys and lifecycle; focus restores without a new focusin', () => {
    const s = setup();
    const release = s.source.connect(s.sink);
    expect(s.host.key()).toBe(1);
    expect(s.held.value()).toBe(1);
    s.host.facts = { ...s.host.facts, windowFocused: false };
    s.host.signal('blur');
    expect(s.held.value()).toBe(0);
    expect(s.host.key()).toBe(0);
    s.host.facts = { ...s.host.facts, windowFocused: true };
    s.host.signal('focus');
    expect(s.signals.at(-1)).toEqual({ type: 'focus', eligible: true });
    expect(s.host.key({ repeat: true })).toBe(1);
    expect(s.held.value()).toBe(0);
    expect(s.host.key()).toBe(1);
    s.host.facts = { ...s.host.facts, elementFocused: false };
    s.host.signal('focusout');
    expect(s.held.value()).toBe(0);
    s.host.facts = { ...s.host.facts, elementFocused: true, visible: false };
    s.host.signal('visibilitychange');
    expect(s.host.key()).toBe(0);
    s.host.signal('pagehide');
    s.host.facts = { ...s.host.facts, visible: true };
    s.host.signal('visibilitychange');
    expect(s.signals.at(-1)?.eligible).toBe(false);
    s.host.signal('pageshow');
    expect(s.signals.at(-1)?.eligible).toBe(true);
    expect(s.held.value()).toBe(0);
    release();
  });

  it('keeps qualified default interception distinct from modified/composing release', () => {
    const s = setup();
    const release = s.source.connect(s.sink);
    expect(s.host.key()).toBe(1);
    expect(s.host.key({ type: 'keyup', isComposing: true })).toBe(0);
    expect(s.held.value()).toBe(0);
    expect(s.host.key({ ctrlKey: true })).toBe(0);
    expect(s.host.key({ code: 'Enter' })).toBe(0);
    release();
  });

  it.each(Array.from({ length: 9 }, (_, i) => i))('rolls back actual registration failure at index %i', index => {
    const s = setup();
    s.host.failAdd = index;
    expect(() => s.source.connect(s.sink)).toThrow(s.host.failure);
    expect(s.host.removals).toEqual(Array.from({ length: index }, (_, i) => i));
    expect(s.host.key()).toBe(0);
    for (const callback of s.host.signals.values()) callback();
    expect(s.signals).toHaveLength(0);
    expect(s.keys).toHaveLength(0);
  });

  it('preserves all removal failures and the registration cause after failed rollback', () => {
    const s = setup();
    s.host.failAdd = 8;
    s.host.failRemove = new Set([0, 3, 7]);
    let failure: unknown;
    try { s.source.connect(s.sink); } catch (cause) { failure = cause; }
    expect(failure).toBeInstanceOf(RollbackError);
    if (!(failure instanceof RollbackError)) throw new Error('Expected rollback error');
    expect(failure.cause).toBe(s.host.failure);
    expect(failure.errors).toEqual([s.host.failure, s.host.failure, s.host.failure, s.host.failure]);
    expect(s.host.removals).toHaveLength(8);
    expect(s.host.key()).toBe(0);
  });

  it('invalidates even retained callbacks when disposal throws and attempts every cleanup once', () => {
    const s = setup();
    const release = s.source.connect(s.sink);
    s.host.failRemove = new Set([0, 1, 8]);
    expect(() => release()).toThrow(AggregateError);
    const count = s.signals.length;
    expect(s.host.key()).toBe(0);
    for (const callback of s.host.signals.values()) callback();
    expect(s.keys).toHaveLength(0);
    expect(s.signals).toHaveLength(count);
    expect(s.host.removals).toHaveLength(9);
    expect(() => release()).not.toThrow();
    expect(s.host.removals).toHaveLength(9);
  });

  it('rolls back every acquired listener if initial facts or consumer delivery throws', () => {
    const s = setup();
    s.sink.signal = () => { throw s.host.failure; };
    expect(() => s.source.connect(s.sink)).toThrow(s.host.failure);
    expect(s.host.removals).toHaveLength(9);
    expect(s.host.key()).toBe(0);
  });

  it('pageshow rechecks window focus without a preceding window focus event', () => {
    const s = setup();
    const release = s.source.connect(s.sink);
    s.host.facts = { ...s.host.facts, windowFocused: false };
    s.host.signal('blur');
    s.host.signal('pagehide');
    s.host.facts = { ...s.host.facts, windowFocused: true };
    s.host.signal('pageshow');
    expect(s.signals.at(-1)).toEqual({ type: 'pageshow', eligible: true });
    release();
  });
});
