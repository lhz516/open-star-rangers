import { describe, expect, it } from 'vitest';
import { RollbackError } from '../../app/session/rollback-error.ts';
import { classifyKeyboardInput, HeldKeyboardAxis } from './keyboard-input.ts';
import type { KeyboardInput, KeyboardSignal, KeyboardSink } from './keyboard-input.ts';
import { createKeyboardSource } from './keyboard-source.ts';
import type { KeyboardHost, KeyboardPageEventType, KeyboardZoneEventType } from './keyboard-source.ts';

type Zone = 'a' | 'b';
type Owner = Zone | 'page';
type KeyListener = (event: KeyboardInput, prevent: () => void) => void;

interface Registration {
  readonly id: number;
  readonly owner: Owner;
  readonly type: string;
  readonly listener: KeyListener;
  removed: boolean;
}

/** Keeps every listener ever registered and delivers to all of them, so retained callbacks must be inert. */
class Host implements KeyboardHost<Zone> {
  focused: Zone | null = 'a';
  windowFocused = true;
  visible = true;
  readonly registrations: Registration[] = [];
  readonly removals: number[] = [];
  readonly factReads: Zone[] = [];
  failAdd = -1;
  failRemove = new Set<number>();
  readonly failure = new Error('injected');

  readFacts(zone: Zone) {
    this.factReads.push(zone);
    return { elementFocused: this.focused === zone, windowFocused: this.windowFocused, visible: this.visible };
  }
  listenKey(zone: Zone, type: KeyboardInput['type'], listener: KeyListener) { return this.add(zone, type, listener); }
  listenZone(zone: Zone, type: KeyboardZoneEventType, listener: () => void) { return this.add(zone, type, listener); }
  listenPage(type: KeyboardPageEventType, listener: () => void) { return this.add('page', type, listener); }

  #next = 0;

  add(owner: Owner, type: string, listener: KeyListener): () => void {
    const id = this.#next++;
    if (id === this.failAdd) throw this.failure;
    const registration: Registration = { id, owner, type, listener, removed: false };
    this.registrations.push(registration);
    return () => {
      this.removals.push(id);
      if (this.failRemove.has(id)) throw this.failure;
      registration.removed = true;
    };
  }
  live(owner?: Owner): number {
    return this.registrations.filter(r => !r.removed && (owner === undefined || r.owner === owner)).length;
  }
  ids(owner: Owner): number[] {
    return this.registrations.filter(r => r.owner === owner).map(r => r.id);
  }
  signal(owner: Owner, type: KeyboardZoneEventType | KeyboardPageEventType): void {
    const listeners = this.registrations.filter(r => r.owner === owner && r.type === type);
    if (!listeners.length) throw new Error('Missing signal listener');
    for (const { listener } of listeners) (listener as () => void)();
  }
  key(zone: Zone = 'a', patch: Partial<KeyboardInput> = {}): number {
    const input: KeyboardInput = {
      type: 'keydown', code: 'ArrowRight', repeat: false, shiftKey: false, ctrlKey: false, altKey: false,
      altGraph: false, metaKey: false, numLock: false, isComposing: false, ...patch,
    };
    let prevented = 0;
    for (const r of this.registrations) {
      if (r.owner === zone && r.type === input.type) r.listener(input, () => { prevented++; });
    }
    return prevented;
  }
}

function setup(host = new Host(), zone: Zone | null = 'a') {
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
  source.bind(zone);
  return { host, signals, keys, held, sink, source };
}

function caught(action: () => void): unknown {
  try { action(); } catch (cause) { return cause; }
  throw new Error('Expected a failure');
}

describe('production keyboard source', () => {
  it('owns exactly nine registrations when bound, normalizes keys, and invalidates before removal', () => {
    const s = setup();
    expect(s.host.registrations).toHaveLength(0);
    const release = s.source.connect(s.sink);
    expect(s.host.registrations).toHaveLength(9);
    expect(s.host.live('a')).toBe(4);
    expect(s.signals).toEqual([{ type: 'initial', eligible: true }]);
    expect(s.host.key()).toBe(1);
    expect(Object.isFrozen(s.keys[0])).toBe(true);
    release();
    release();
    expect(s.host.removals).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s.host.live()).toBe(0);
    const count = s.signals.length;
    expect(s.host.key()).toBe(0);
    s.host.signal('page', 'focus');
    s.host.signal('a', 'focusin');
    expect(s.keys).toHaveLength(1);
    expect(s.signals).toHaveLength(count);
    expect(() => s.source.connect(s.sink)).toThrow('exactly once');
  });

  it('passes reported Shift, AltGraph and NumLock states to the sink frozen', () => {
    const s = setup();
    const release = s.source.connect(s.sink);
    s.host.key('a', { shiftKey: true, altGraph: true, numLock: true, code: 'Numpad8' });
    s.host.key('a', { type: 'keyup', altGraph: false, numLock: true, code: 'Numpad8' });
    expect(s.keys.map(({ shiftKey, altGraph, numLock }) => ({ shiftKey, altGraph, numLock }))).toEqual([
      { shiftKey: true, altGraph: true, numLock: true },
      { shiftKey: false, altGraph: false, numLock: true },
    ]);
    expect(s.keys.every(Object.isFrozen)).toBe(true);
    release();
  });

  it.each(['focused', 'windowFocused', 'visible'] as const)('reconciles initial %s qualification', field => {
    const s = setup();
    if (field === 'focused') s.host.focused = 'b';
    else s.host[field] = false;
    s.source.connect(s.sink)();
    expect(s.signals[0]?.eligible).toBe(false);
  });

  it('is ineligible without a zone and reads facts only for the bound zone', () => {
    const s = setup(new Host(), null);
    const release = s.source.connect(s.sink);
    expect(s.host.registrations).toHaveLength(5);
    expect(s.signals).toEqual([{ type: 'initial', eligible: false }]);
    s.host.signal('page', 'focus');
    expect(s.signals.at(-1)).toEqual({ type: 'focus', eligible: false });
    expect(s.host.factReads).toEqual([]);
    s.source.bind('b');
    s.host.focused = 'b';
    s.host.signal('b', 'focusin');
    expect(s.signals.at(-1)).toEqual({ type: 'focusin', eligible: true });
    expect(new Set(s.host.factReads)).toEqual(new Set(['b']));
    release();
  });

  it('reconciles real facts on keys and lifecycle; focus restores without a new focusin', () => {
    const s = setup();
    const release = s.source.connect(s.sink);
    expect(s.host.key()).toBe(1);
    expect(s.held.value()).toBe(1);
    s.host.windowFocused = false;
    s.host.signal('page', 'blur');
    expect(s.held.value()).toBe(0);
    expect(s.host.key()).toBe(0);
    s.host.windowFocused = true;
    s.host.signal('page', 'focus');
    expect(s.signals.at(-1)).toEqual({ type: 'focus', eligible: true });
    expect(s.host.key('a', { repeat: true })).toBe(1);
    expect(s.held.value()).toBe(0);
    expect(s.host.key()).toBe(1);
    s.host.focused = null;
    s.host.signal('a', 'focusout');
    expect(s.held.value()).toBe(0);
    s.host.focused = 'a';
    s.host.visible = false;
    s.host.signal('page', 'visibilitychange');
    expect(s.host.key()).toBe(0);
    s.host.signal('page', 'pagehide');
    s.host.visible = true;
    s.host.signal('page', 'visibilitychange');
    expect(s.signals.at(-1)?.eligible).toBe(false);
    s.host.signal('page', 'pageshow');
    expect(s.signals.at(-1)?.eligible).toBe(true);
    expect(s.held.value()).toBe(0);
    release();
  });

  it('keeps qualified default interception distinct from modified/composing release', () => {
    const s = setup();
    const release = s.source.connect(s.sink);
    expect(s.host.key()).toBe(1);
    expect(s.host.key('a', { type: 'keyup', isComposing: true })).toBe(0);
    expect(s.held.value()).toBe(0);
    expect(s.host.key('a', { ctrlKey: true })).toBe(0);
    expect(s.host.key('a', { code: 'Enter' })).toBe(0);
    release();
  });

  it('replaces and removes the zone with balanced listeners, one identity and one sink', () => {
    const s = setup(new Host(), null);
    const release = s.source.connect(s.sink);
    s.source.bind('a');
    expect(s.host.live('a')).toBe(4);
    expect(s.signals.at(-1)).toEqual({ type: 'bind', eligible: true });
    expect(s.host.key('a')).toBe(1);
    expect(s.held.value()).toBe(1);

    s.source.bind('b');
    expect([s.host.live('a'), s.host.live('b'), s.host.live('page')]).toEqual([0, 4, 5]);
    expect(s.signals.at(-1)).toEqual({ type: 'bind', eligible: false });
    expect(s.held.value()).toBe(0);
    expect(s.host.key('a')).toBe(0);
    s.host.signal('a', 'focusin');
    expect(s.signals.at(-1)?.type).toBe('bind');
    s.host.focused = 'b';
    s.host.signal('b', 'focusin');
    expect(s.signals.at(-1)).toEqual({ type: 'focusin', eligible: true });
    expect(s.host.key('b')).toBe(1);

    s.source.bind(null);
    expect([s.host.live('b'), s.host.live('page')]).toEqual([0, 5]);
    expect(s.signals.at(-1)).toEqual({ type: 'unbind', eligible: false });
    expect(s.host.key('b')).toBe(0);
    s.host.signal('page', 'focus');
    expect(s.signals.at(-1)).toEqual({ type: 'focus', eligible: false });
    expect(s.keys.map(k => k.type)).toEqual(['keydown', 'keydown']);
    release();
    expect(s.host.live()).toBe(0);
  });

  it('binds through a detached reference, as a callback ref would', () => {
    const s = setup(new Host(), null);
    const release = s.source.connect(s.sink);
    const { bind } = s.source;
    bind('a');
    expect(s.host.live('a')).toBe(4);
    bind(null);
    expect(s.host.live('a')).toBe(0);
    expect(s.signals.map(signal => signal.type)).toEqual(['initial', 'bind', 'unbind']);
    release();
  });

  it('ignores rebinding the current zone and binds before connection without registering', () => {
    const s = setup(new Host(), null);
    s.source.bind(null);
    s.source.bind('a');
    s.source.bind('b');
    expect(s.host.registrations).toHaveLength(0);
    const release = s.source.connect(s.sink);
    expect([s.host.live('a'), s.host.live('b')]).toEqual([0, 4]);
    const count = s.signals.length;
    s.source.bind('b');
    expect(s.host.registrations).toHaveLength(9);
    expect(s.signals).toHaveLength(count);
    release();
  });

  it('keeps callbacks of an earlier binding of the same zone inert', () => {
    const s = setup();
    const release = s.source.connect(s.sink);
    s.host.failRemove = new Set(s.host.ids('a'));
    const failure = caught(() => s.source.bind(null));
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure).not.toBeInstanceOf(RollbackError);
    expect((failure as AggregateError).errors).toEqual(Array(4).fill(s.host.failure));
    expect(s.signals.at(-1)).toEqual({ type: 'unbind', eligible: false });
    expect(s.host.key('a')).toBe(0);
    s.source.bind('a');
    expect(s.host.live('a')).toBe(8);
    expect(s.host.key('a')).toBe(1);
    expect(s.keys).toHaveLength(1);
    const count = s.signals.length;
    s.host.signal('a', 'focusout');
    expect(s.signals).toHaveLength(count + 1);
    release();
  });

  it.each([0, 1, 2, 3])('rolls back a failed zone registration at index %i and keeps the previous binding', index => {
    const s = setup();
    const release = s.source.connect(s.sink);
    const count = s.signals.length;
    s.host.failAdd = 9 + index;
    expect(() => s.source.bind('b')).toThrow(s.host.failure);
    expect(s.host.removals).toEqual(Array.from({ length: index }, (_, i) => 9 + i));
    expect([s.host.live('a'), s.host.live('b')]).toEqual([4, 0]);
    expect(s.signals).toHaveLength(count);
    expect(s.host.key('b')).toBe(0);
    expect(s.host.key('a')).toBe(1);
    s.source.bind(null);
    expect(s.host.live()).toBe(5);
    release();
    expect(s.host.live()).toBe(0);
  });

  it('reports a failed zone rollback with every cause and keeps the previous binding', () => {
    const s = setup();
    const release = s.source.connect(s.sink);
    s.host.failAdd = 12;
    s.host.failRemove = new Set([9, 11]);
    const failure = caught(() => s.source.bind('b'));
    expect(failure).toBeInstanceOf(RollbackError);
    if (!(failure instanceof RollbackError)) throw new Error('Expected rollback error');
    expect(failure.cause).toBe(s.host.failure);
    expect(failure.errors).toEqual([s.host.failure, s.host.failure, s.host.failure]);
    expect(s.host.removals).toEqual([9, 10, 11]);
    expect(s.host.key('b')).toBe(0);
    expect(s.host.key('a')).toBe(1);
    release();
  });

  it('signals the new binding before reporting removal failures of the replaced zone', () => {
    const s = setup();
    const release = s.source.connect(s.sink);
    s.host.failRemove = new Set([0, 3]);
    s.host.focused = 'b';
    const failure = caught(() => s.source.bind('b'));
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([s.host.failure, s.host.failure]);
    expect(s.host.removals).toEqual([0, 1, 2, 3]);
    expect(s.signals.at(-1)).toEqual({ type: 'bind', eligible: true });
    expect(s.host.key('a')).toBe(0);
    expect(s.host.key('b')).toBe(1);
    expect(s.keys).toHaveLength(1);
    release();
  });

  it('propagates a sink failure on rebinding and keeps it with removal failures', () => {
    const s = setup();
    const release = s.source.connect(s.sink);
    const delivery = new Error('delivery');
    s.sink.signal = () => { throw delivery; };
    expect(() => s.source.bind('b')).toThrow(delivery);
    expect([s.host.live('a'), s.host.live('b')]).toEqual([0, 4]);
    s.host.failRemove = new Set(s.host.ids('b'));
    const failure = caught(() => s.source.bind(null));
    expect((failure as AggregateError).errors).toEqual([...Array(4).fill(s.host.failure), delivery]);
    release();
  });

  it('does not apply a prevention decided for a zone replaced during dispatch', () => {
    const s = setup();
    const release = s.source.connect(s.sink);
    s.sink.key = () => {
      s.source.bind('b');
      return true;
    };
    expect(s.host.key('a')).toBe(0);
    expect(s.host.live('a')).toBe(0);
    release();
  });

  it('ignores binding after release and after failed connection', () => {
    const s = setup();
    s.source.connect(s.sink)();
    const count = s.signals.length;
    s.source.bind('b');
    s.source.bind(null);
    expect(s.host.registrations).toHaveLength(9);
    expect(s.signals).toHaveLength(count);

    const f = setup();
    f.host.failAdd = 4;
    expect(() => f.source.connect(f.sink)).toThrow(f.host.failure);
    f.source.bind('b');
    expect(f.host.registrations).toHaveLength(4);
    expect(f.host.live()).toBe(0);
  });

  it.each(Array.from({ length: 9 }, (_, i) => i))('rolls back actual registration failure at index %i', index => {
    const s = setup();
    s.host.failAdd = index;
    expect(() => s.source.connect(s.sink)).toThrow(s.host.failure);
    expect(s.host.removals).toEqual(Array.from({ length: index }, (_, i) => i));
    expect(s.host.live()).toBe(0);
    expect(s.host.key()).toBe(0);
    for (const { listener } of s.host.registrations) (listener as () => void)();
    expect(s.signals).toHaveLength(0);
    expect(s.keys).toHaveLength(0);
  });

  it('preserves all removal failures and the registration cause after failed rollback', () => {
    const s = setup();
    s.host.failAdd = 8;
    s.host.failRemove = new Set([0, 3, 7]);
    const failure = caught(() => s.source.connect(s.sink));
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
    s.host.signal('a', 'focusin');
    s.host.signal('page', 'pageshow');
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
    expect(s.host.live()).toBe(0);
    expect(s.host.key()).toBe(0);
  });

  it('pageshow rechecks window focus without a preceding window focus event', () => {
    const s = setup();
    const release = s.source.connect(s.sink);
    s.host.windowFocused = false;
    s.host.signal('page', 'blur');
    s.host.signal('page', 'pagehide');
    s.host.windowFocused = true;
    s.host.signal('page', 'pageshow');
    expect(s.signals.at(-1)).toEqual({ type: 'pageshow', eligible: true });
    release();
  });
});
