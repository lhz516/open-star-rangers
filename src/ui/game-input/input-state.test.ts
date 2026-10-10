import { describe, expect, it } from 'vitest';
import type { KeyboardInput } from '../../platform/input/keyboard-input.ts';
import { down, moment, TEST_BINDINGS, up, type KeyPatch } from './game-input.test-support.ts';
import { InputState, type InputMoment } from './input-state.ts';

const ALT_GR: KeyPatch = { ctrlKey: true, altKey: true, altGraph: true };

/** A state with its current moment; `at` changes the moment for the following calls. */
function harness(initial: Partial<InputMoment> = {}) {
  const state = new InputState(TEST_BINDINGS);
  let now = moment(initial);
  return {
    state,
    at(patch: Partial<InputMoment>) { now = { ...now, ...patch }; },
    key: (event: KeyboardInput) => state.key(event, now),
    frame: (clock: number) => { now = { ...now, clock }; return state.frame(now); },
    axes: () => ({ ...state.intent().axes }),
    fire: () => state.intent().primaryFire,
    actionOf: (event: KeyboardInput) => state.key(event, now).action,
  };
}

const axes = (pitch: number, yaw: number, roll: number) => ({ pitch, yaw, roll });

describe('steering axes', () => {
  it.each([['KeyI', axes(-1, 0, 0)], ['KeyK', axes(1, 0, 0)], ['KeyJ', axes(0, -1, 0)], ['KeyL', axes(0, 1, 0)]])(
    'a new %s press holds its direction until its keyup',
    (code, held) => {
      const h = harness();
      expect(h.key(down(code))).toEqual({ action: null, intentChanged: true, preventDefault: true });
      expect(h.axes()).toEqual(held);
      expect(h.key(down(code, { repeat: true }))).toEqual({ action: null, intentChanged: false, preventDefault: true });
      expect(h.key(up(code))).toEqual({ action: null, intentChanged: true, preventDefault: true });
      expect(h.axes()).toEqual(axes(0, 0, 0));
    },
  );

  it('gives 0 for both directions of an axis, whatever the order', () => {
    for (const [first, second] of [['KeyI', 'KeyK'], ['KeyK', 'KeyI'], ['KeyJ', 'KeyL'], ['KeyL', 'KeyJ']] as const) {
      const h = harness();
      h.key(down(first));
      h.key(down(second));
      expect(h.axes()).toEqual(axes(0, 0, 0));
      h.key(up(first));
      expect(h.axes()).not.toEqual(axes(0, 0, 0));
    }
  });

  it('routes the lateral keys to roll while Ctrl is effective, otherwise to yaw, leaving pitch alone', () => {
    const h = harness();
    h.key(down('KeyJ'));
    h.key(down('KeyI'));
    expect(h.axes()).toEqual(axes(-1, -1, 0));
    expect(h.key(down('ControlLeft', { ctrlKey: true }))).toMatchObject({ action: null, intentChanged: true, preventDefault: false });
    expect(h.axes()).toEqual(axes(-1, 0, -1));
    h.key(down('KeyL', { ctrlKey: true }));
    expect(h.axes()).toEqual(axes(-1, 0, 0));
    h.key(up('KeyJ', { ctrlKey: true }));
    expect(h.axes()).toEqual(axes(-1, 0, 1));
    expect(h.key(up('ControlLeft')).intentChanged).toBe(true);
    expect(h.axes()).toEqual(axes(-1, 1, 0));
  });

  it('keeps steering through Shift and Alt, which are not routing modifiers', () => {
    const h = harness();
    h.key(down('KeyJ'));
    expect(h.key(down('ShiftLeft', { shiftKey: true })).intentChanged).toBe(false);
    h.key(down('KeyK', { shiftKey: true }));
    expect(h.axes()).toEqual(axes(1, -1, 0));
    expect(h.key(down('AltLeft', { shiftKey: true, altKey: true }))).toMatchObject({ intentChanged: true, preventDefault: true });
    expect(h.state.intent()).toEqual({ axes: axes(1, -1, 0), primaryFire: true });
    h.key(down('ControlLeft', { shiftKey: true, altKey: true, ctrlKey: true }));
    expect(h.axes()).toEqual(axes(1, 0, -1));
  });

  it('steers in warp without the primary-fire level', () => {
    const h = harness({ context: 'warp' });
    h.key(down('KeyL'));
    h.key(down('AltLeft', { altKey: true }));
    expect(h.state.intent()).toEqual({ axes: axes(0, 1, 0), primaryFire: false });
  });

  it('keeps the axes and fire at 0 in map and base, where the table can bind neither', () => {
    for (const context of ['map', 'base'] as const) {
      const h = harness({ context });
      for (const code of ['KeyI', 'KeyJ', 'KeyL']) expect(h.key(down(code, { ctrlKey: true })).intentChanged).toBe(false);
      expect(h.key(down('AltLeft', { altKey: true })).intentChanged).toBe(false);
      expect(h.state.intent()).toEqual({ axes: axes(0, 0, 0), primaryFire: false });
    }
  });

  it('takes no steering or fire while not running, and keeps a paused zone to session controls', () => {
    const h = harness({ running: false });
    for (const code of ['KeyJ', 'AltLeft', 'Space', 'KeyT', 'F2']) expect(h.key(down(code)).action).toBeNull();
    expect(h.state.intent()).toEqual({ axes: axes(0, 0, 0), primaryFire: false });
    expect(h.actionOf(down('KeyP'))).toEqual({ kind: 'session', control: 'toggle-pause' });
    h.at({ running: true });
    expect(h.key(down('KeyJ', { repeat: true })).intentChanged).toBe(false);
    expect(h.key(down('KeyJ')).intentChanged).toBe(true);
  });
});

describe('interaction context changes', () => {
  it('clear all local state, publish neutral and restore nothing on return to flight', () => {
    const h = harness();
    h.key(down('KeyJ'));
    h.key(down('AltLeft', { altKey: true }));
    h.key(down('Space', { altKey: true }));
    h.at({ context: 'map', clock: 10 });
    expect(h.state.frame({ ...moment({ context: 'map', clock: 10 }) })).toEqual({ intentChanged: true, repeats: [] });
    expect(h.state.intent()).toEqual({ axes: axes(0, 0, 0), primaryFire: false });
    h.at({ context: 'flight' });
    expect(h.state.frame(moment({ clock: 100 }))).toEqual({ intentChanged: false, repeats: [] });
    expect(h.key(down('KeyJ', { repeat: true, altKey: true })).intentChanged).toBe(false);
    expect(h.key(down('AltLeft', { repeat: true, altKey: true })).intentChanged).toBe(false);
    expect(h.state.intent()).toEqual({ axes: axes(0, 0, 0), primaryFire: false });
    expect(h.frame(200).repeats).toEqual([]);
    expect(h.key(down('KeyJ', { altKey: true })).intentChanged).toBe(true);
    expect(h.axes()).toEqual(axes(0, -1, 0));
  });

  it('are seen on the key event itself when no frame came first', () => {
    const h = harness();
    h.key(down('KeyL'));
    h.at({ context: 'base' });
    expect(h.key(down('KeyL', { repeat: true }))).toEqual({ action: null, intentChanged: true, preventDefault: true });
    expect(h.actionOf(down('ArrowUp'))).toEqual({ kind: 'command', command: { type: 'navigate-selection', direction: 'previous' } });
  });
});

describe('primary fire', () => {
  it('is established only by a new AltLeft or AltRight press in flight', () => {
    const h = harness();
    for (const event of [down('KeyJ', { altKey: true }), down('KeyJ', { altGraph: true }), down('AltLeft', { altKey: true, repeat: true })]) {
      h.key(event);
      expect(h.fire()).toBe(false);
    }
    expect(h.key(down('AltRight', { altKey: true })).intentChanged).toBe(true);
    expect(h.fire()).toBe(true);
  });

  it('holds while either Alt of two is down and clears when both are up', () => {
    const h = harness();
    h.key(down('AltLeft', { altKey: true }));
    h.key(down('AltRight', { altKey: true }));
    expect(h.key(up('AltLeft', { altKey: true })).intentChanged).toBe(false);
    expect(h.fire()).toBe(true);
    expect(h.key(up('AltRight')).intentChanged).toBe(true);
    expect(h.fire()).toBe(false);
  });

  it('is released by an Alt-free event when the Alt keyup was missed', () => {
    const h = harness();
    h.key(down('AltLeft', { altKey: true }));
    expect(h.key(down('KeyJ')).intentChanged).toBe(true);
    expect(h.state.intent()).toEqual({ axes: axes(0, -1, 0), primaryFire: false });
  });

  it('keeps a right Alt the AltGraph flag still reports, and releases it once both flags are off', () => {
    const h = harness();
    h.key(down('AltRight', { altGraph: true }));
    h.key(down('KeyL', { altGraph: true }));
    expect(h.fire()).toBe(true);
    h.key(up('KeyL', { altGraph: true }));
    expect(h.fire()).toBe(true);
    h.key(down('KeyK'));
    expect(h.fire()).toBe(false);
  });

  it('does not come back with focus, the altKey flag or repeats after a clear', () => {
    const h = harness();
    h.key(down('AltLeft', { altKey: true }));
    h.at({ eligible: false });
    expect(h.key(down('AltLeft', { altKey: true, repeat: true }))).toEqual({ action: null, intentChanged: true, preventDefault: false });
    h.at({ eligible: true });
    for (const event of [down('AltLeft', { altKey: true, repeat: true }), down('KeyK', { altKey: true }), up('KeyK', { altKey: true })]) {
      h.key(event);
    }
    expect(h.fire()).toBe(false);
  });

  it('does not keep other bindings from acting', () => {
    const h = harness();
    h.key(down('AltLeft', { altKey: true }));
    expect(h.actionOf(down('Space', { altKey: true }))).toEqual({ kind: 'command', command: { type: 'fire', channel: 'secondary' } });
    expect(h.actionOf(down('Digit1', { altKey: true, shiftKey: true }))).toEqual({ kind: 'command', command: { type: 'speed-preset', level: 1 } });
    h.key(down('ControlLeft', { altKey: true, ctrlKey: true }));
    expect(h.actionOf(down('Enter', { altKey: true, ctrlKey: true }))).toEqual({ kind: 'command', command: { type: 'speed', operation: 'toggle-auto-match' } });
    expect(h.fire()).toBe(true);
  });
});

describe('AltGr normalization', () => {
  it.each([
    ['AltRight keyup first', [up('AltRight', { ctrlKey: true }), up('ControlLeft')]],
    ['ControlLeft keyup first', [up('ControlLeft', { altKey: true, altGraph: true }), up('AltRight')]],
  ] as const)('masks the synthesized left Ctrl over a held lateral key, %s, and leaves no Ctrl behind', (_name, releases) => {
    const h = harness();
    h.key(down('KeyJ'));
    // The synthesized ControlLeft arrives before the AltRight that explains it: for that moment it is a Ctrl.
    h.key(down('ControlLeft', { ctrlKey: true }));
    expect(h.axes()).toEqual(axes(0, 0, -1));
    expect(h.key(down('AltRight', ALT_GR)).intentChanged).toBe(true);
    expect(h.state.intent()).toEqual({ axes: axes(0, -1, 0), primaryFire: true });
    expect(h.key(down('Enter', ALT_GR))).toEqual({ action: { kind: 'command', command: { type: 'confirm-selection' } }, intentChanged: false, preventDefault: true });
    for (const release of releases) {
      h.key(release);
      expect(h.axes()).toEqual(axes(0, -1, 0));
    }
    expect(h.fire()).toBe(false);
    h.key(down('ControlLeft', { ctrlKey: true }));
    expect(h.axes()).toEqual(axes(0, 0, -1));
  });

  it('keeps a left Ctrl seen during AltGr masked after the Alt is released, until the Ctrl itself is', () => {
    const h = harness();
    h.key(down('ControlLeft', { ctrlKey: true }));
    h.key(down('AltRight', ALT_GR));
    h.key(up('AltRight', { ctrlKey: true }));
    h.key(down('KeyJ', { ctrlKey: true }));
    expect(h.axes()).toEqual(axes(0, -1, 0));
    expect(h.key(down('Enter', { ctrlKey: true }))).toEqual({ action: { kind: 'command', command: { type: 'confirm-selection' } }, intentChanged: false, preventDefault: true });
    h.key(up('ControlLeft'));
    h.key(down('ControlLeft', { ctrlKey: true }));
    expect(h.axes()).toEqual(axes(0, 0, -1));
  });

  it.each([
    ['the AltGraph flag of an unobserved right Alt', ALT_GR],
    ['an Alt flag without an observed left Alt', { ctrlKey: true, altKey: true }],
  ] as const)('masks an unobserved Ctrl with %s', (_name, flags) => {
    const h = harness();
    h.key(down('KeyL', flags));
    expect(h.axes()).toEqual(axes(0, 1, 0));
    expect(h.actionOf(down('Enter', flags))).toEqual({ kind: 'command', command: { type: 'confirm-selection' } });
  });

  it('masks a left Ctrl while an observed right Alt is held, even without the AltGraph flag', () => {
    const h = harness();
    h.key(down('AltRight', { altKey: true }));
    h.key(down('ControlLeft', { altKey: true, ctrlKey: true }));
    h.key(down('KeyL', { altKey: true, ctrlKey: true }));
    expect(h.axes()).toEqual(axes(0, 1, 0));
  });

  it('keeps the Ctrl meaning of an explicitly pressed ControlRight during AltGr', () => {
    const h = harness();
    h.key(down('ControlLeft', { ctrlKey: true }));
    h.key(down('AltRight', ALT_GR));
    h.key(down('KeyL', ALT_GR));
    expect(h.axes()).toEqual(axes(0, 1, 0));
    h.key(down('ControlRight', ALT_GR));
    expect(h.axes()).toEqual(axes(0, 0, 1));
    expect(h.actionOf(down('Enter', ALT_GR))).toEqual({ kind: 'command', command: { type: 'speed', operation: 'toggle-auto-match' } });
    h.key(up('ControlRight', ALT_GR));
    expect(h.axes()).toEqual(axes(0, 1, 0));
  });

  it('keeps a real Ctrl with an observed left Alt', () => {
    const h = harness();
    h.key(down('AltLeft', { altKey: true }));
    h.key(down('ControlLeft', { altKey: true, ctrlKey: true }));
    h.key(down('KeyJ', { altKey: true, ctrlKey: true }));
    expect(h.state.intent()).toEqual({ axes: axes(0, 0, -1), primaryFire: true });
  });

  it('handles an AltGr that sends no Ctrl and no Alt flag', () => {
    const h = harness();
    h.key(down('KeyJ'));
    h.key(down('AltRight', { altGraph: true }));
    expect(h.state.intent()).toEqual({ axes: axes(0, -1, 0), primaryFire: true });
    expect(h.key(down('KeyT', { altGraph: true }))).toMatchObject({ action: { command: { operation: 'enemy' } }, preventDefault: true });
  });

  it('gives an isolated Ctrl event no command and leaves it to the browser', () => {
    const h = harness();
    expect(h.key(down('ControlLeft', { ctrlKey: true }))).toEqual({ action: null, intentChanged: false, preventDefault: false });
    expect(h.key(down('ControlRight', { ctrlKey: true }))).toEqual({ action: null, intentChanged: false, preventDefault: false });
    expect(h.key(down('KeyT', { ctrlKey: true }))).toEqual({ action: null, intentChanged: false, preventDefault: false });
  });
});

describe('discrete presses', () => {
  it('give one action per new press, none for repeats or a duplicate keydown', () => {
    const h = harness();
    expect(h.actionOf(down('KeyT'))).toEqual({ kind: 'command', command: { type: 'target', operation: 'enemy' } });
    expect(h.actionOf(down('KeyT', { repeat: true }))).toBeNull();
    expect(h.actionOf(down('KeyT'))).toBeNull();
    expect(h.key(up('KeyT'))).toEqual({ action: null, intentChanged: false, preventDefault: true });
    expect(h.actionOf(down('KeyT'))).not.toBeNull();
  });

  it('give gap notices and session controls as actions', () => {
    const h = harness();
    expect(h.key(down('F2'))).toEqual({ action: { kind: 'gap', gap: 'G-08' }, intentChanged: false, preventDefault: true });
    expect(h.actionOf(down('KeyA'))).toEqual({ kind: 'gap', gap: 'G-09' });
    expect(h.actionOf(down('F11'))).toEqual({ kind: 'gap', gap: 'G-10' });
    expect(h.actionOf(down('KeyP', { shiftKey: true }))).toEqual({ kind: 'session', control: 'toggle-pause' });
    expect(h.key(down('Escape'))).toEqual({ action: { kind: 'session', control: 'open-menu' }, intentChanged: false, preventDefault: false });
    h.at({ context: 'map' });
    expect(h.key(down('Escape', { repeat: true }))).toEqual({ action: null, intentChanged: false, preventDefault: false });
    h.key(up('Escape'));
    expect(h.key(down('Escape'))).toEqual({ action: null, intentChanged: false, preventDefault: false });
    expect(h.actionOf(down('KeyM'))).toEqual({ kind: 'command', command: { type: 'toggle-map' } });
  });

  it('read only the code, never key or keyCode', () => {
    const h = harness();
    const event = Object.defineProperties({ ...down('KeyT') }, {
      key: { get: () => { throw new Error('key read'); } },
      keyCode: { get: () => { throw new Error('keyCode read'); } },
    });
    expect(h.actionOf(event)).toEqual({ kind: 'command', command: { type: 'target', operation: 'enemy' } });
  });

  it('start nothing with Meta or during composition, while their keyups still release', () => {
    const h = harness();
    expect(h.key(down('Space', { metaKey: true }))).toEqual({ action: null, intentChanged: false, preventDefault: false });
    expect(h.key(down('KeyJ', { isComposing: true }))).toEqual({ action: null, intentChanged: false, preventDefault: false });
    h.key(down('KeyJ'));
    h.key(down('KeyI'));
    expect(h.key(up('KeyJ', { metaKey: true, ctrlKey: true }))).toEqual({ action: null, intentChanged: true, preventDefault: false });
    expect(h.key(up('KeyI', { isComposing: true })).intentChanged).toBe(true);
    expect(h.axes()).toEqual(axes(0, 0, 0));
  });

  it('cancel the continuous intent and repeats when composition starts; only new presses come back', () => {
    const h = harness();
    h.key(down('KeyK'));
    h.key(down('AltLeft', { altKey: true }));
    h.key(down('Space', { altKey: true }));
    expect(h.key(down('KeyQ', { altKey: true, isComposing: true }))).toEqual({ action: null, intentChanged: true, preventDefault: false });
    expect(h.state.intent()).toEqual({ axes: axes(0, 0, 0), primaryFire: false });
    expect(h.frame(100).repeats).toEqual([]);
    h.key(down('KeyK', { repeat: true, altKey: true }));
    expect(h.axes()).toEqual(axes(0, 0, 0));
    h.key(down('KeyK', { altKey: true }));
    expect(h.axes()).toEqual(axes(1, 0, 0));
  });

  it('are refused in an unqualified zone, whose keyups still release', () => {
    const h = harness();
    h.key(down('KeyJ'));
    h.at({ eligible: false });
    expect(h.key(down('KeyT'))).toEqual({ action: null, intentChanged: true, preventDefault: false });
    expect(h.key(up('KeyJ'))).toEqual({ action: null, intentChanged: false, preventDefault: false });
  });
});

describe('repeat', () => {
  const SPACE = { code: 'Space', command: { type: 'fire', channel: 'secondary' } };

  it('starts at the press clock, is due at +32, then at each observed clock +16, once per frame', () => {
    const h = harness({ clock: 100 });
    expect(h.actionOf(down('Space'))).toEqual({ kind: 'command', command: SPACE.command });
    expect(h.key(down('Space', { repeat: true })).action).toBeNull();
    expect(h.frame(100).repeats).toEqual([]);
    expect(h.frame(131).repeats).toEqual([]);
    expect(h.frame(132).repeats).toEqual([SPACE]);
    expect(h.frame(132).repeats).toEqual([]);
    expect(h.frame(140).repeats).toEqual([]);
    expect(h.frame(148).repeats).toEqual([SPACE]);
    expect(h.frame(400).repeats).toEqual([SPACE]);
    expect(h.frame(414).repeats).toEqual([]);
    expect(h.frame(416).repeats).toEqual([SPACE]);
  });

  it('gives the due keys of one frame in first-press order', () => {
    const h = harness();
    h.key(down('Equal'));
    h.at({ clock: 10 });
    h.key(down('Space'));
    h.key(down('KeyT'));
    expect(h.frame(42).repeats.map(({ code }) => code)).toEqual(['Equal', 'Space']);
    expect(h.frame(58).repeats.map(({ code }) => code)).toEqual(['Equal', 'Space']);
  });

  it('observes no due outside a running frame of a qualified zone', () => {
    const h = harness();
    h.key(down('Space'));
    expect(h.state.frame(moment({ clock: 40, eligible: false })).repeats).toEqual([]);
    expect(h.state.frame(moment({ clock: 40 })).repeats).toEqual([]);
  });

  it.each([
    ['its keyup', (h: ReturnType<typeof harness>) => { h.key(up('Space')); }],
    ['a failed submission', (h: ReturnType<typeof harness>) => { h.state.cancelRepeat('Space'); }],
    ['a pause', (h: ReturnType<typeof harness>) => { h.at({ running: false }); h.state.sync(moment({ running: false })); h.at({ running: true }); }],
    ['a stop or transition frame', (h: ReturnType<typeof harness>) => { h.at({ running: false }); h.frame(20); h.at({ running: true }); }],
    ['losing qualification', (h: ReturnType<typeof harness>) => { h.at({ eligible: false }); h.key(down('Space', { repeat: true })); h.at({ eligible: true }); }],
    ['another run', (h: ReturnType<typeof harness>) => { h.at({ runId: 2 }); }],
    ['another context and back', (h: ReturnType<typeof harness>) => { h.at({ context: 'map' }); h.frame(20); h.at({ context: 'flight' }); }],
    ['a clear', (h: ReturnType<typeof harness>) => { h.state.clear(); }],
    ['a Ctrl that changes the match, released again', (h: ReturnType<typeof harness>) => {
      h.key(down('ControlLeft', { ctrlKey: true }));
      h.key(up('ControlLeft'));
    }],
    ['a Shift that changes the match, released again', (h: ReturnType<typeof harness>) => {
      h.key(down('ShiftLeft', { shiftKey: true }));
      h.key(up('ShiftLeft'));
    }],
  ])('is cancelled by %s and not revived until a new press', (_name, cancel) => {
    const h = harness();
    h.key(down('Space'));
    cancel(h);
    h.key(down('Space', { repeat: true }));
    expect(h.frame(1000).repeats).toEqual([]);
    expect(h.frame(2000).repeats).toEqual([]);
    h.key(up('Space'));
    h.at({ clock: 2000 });
    h.key(down('Space'));
    expect(h.frame(2032).repeats).toEqual([SPACE]);
  });

  it('turns no held energy decrease into an increase when Shift changes, nor back again', () => {
    const h = harness();
    h.key(down('KeyS'));
    h.key(down('ShiftLeft', { shiftKey: true }));
    expect(h.frame(100).repeats).toEqual([]);
    h.key(up('ShiftLeft'));
    expect(h.frame(200).repeats).toEqual([]);
  });

  it('keeps going when Shift is not what decides the action, and when Alt changes', () => {
    const h = harness();
    h.key(down('Equal'));
    h.key(down('ShiftLeft', { shiftKey: true }));
    h.key(down('AltLeft', { shiftKey: true, altKey: true }));
    h.key(down('AltRight', { ...ALT_GR, ctrlKey: false, shiftKey: true }));
    expect(h.frame(32).repeats.map(({ code }) => code)).toEqual(['Equal']);
    h.key(up('AltLeft', { shiftKey: true, altKey: true }));
    h.key(up('AltRight', { shiftKey: true }));
    expect(h.frame(48).repeats.map(({ code }) => code)).toEqual(['Equal']);
  });

  it('judges AltGr by the normalized Ctrl: a masked synthesized Ctrl does not cancel it', () => {
    const h = harness();
    h.key(down('Space'));
    h.key(down('AltRight', { altKey: true, altGraph: true }));
    h.key(down('ControlLeft', ALT_GR));
    expect(h.frame(32).repeats).toEqual([SPACE]);
  });

  it('is cancelled by a NumLock change that decides a keypad action', () => {
    const h = harness({ context: 'base' });
    expect(h.actionOf(down('Numpad8'))).toMatchObject({ command: { type: 'navigate-selection' } });
    h.key(down('NumLock', { numLock: true }));
    expect(h.frame(100).repeats).toEqual([]);
    h.key(up('NumLock'));
    expect(h.frame(200).repeats).toEqual([]);
  });

  it('never starts for a press that is not repeatable', () => {
    const h = harness();
    h.key(down('KeyT'));
    h.key(down('KeyJ'));
    expect(h.frame(1000).repeats).toEqual([]);
  });
});

describe('clearing and restoring', () => {
  it('reports whether the intent changed, and restores nothing on qualification, resume or a new run', () => {
    const h = harness();
    expect(h.state.clear()).toBe(false);
    h.key(down('KeyI'));
    h.key(down('AltLeft', { altKey: true }));
    expect(h.state.clear()).toBe(true);
    expect(h.state.intent()).toEqual({ axes: axes(0, 0, 0), primaryFire: false });
    for (const patch of [{ eligible: false }, { eligible: true }, { running: false }, { running: true }, { runId: 2 }] as const) {
      h.at(patch);
      h.key(down('KeyI', { repeat: true, altKey: true }));
      h.key(down('AltLeft', { repeat: true, altKey: true }));
      expect(h.state.intent()).toEqual({ axes: axes(0, 0, 0), primaryFire: false });
    }
  });

  it('still prevents the keyup of a key held before the clear, as a bound key', () => {
    const h = harness();
    h.key(down('KeyT'));
    h.state.clear();
    expect(h.key(up('KeyT'))).toEqual({ action: null, intentChanged: false, preventDefault: true });
  });

  it('clears on a stop seen in a frame, and ignores frames that change nothing', () => {
    const h = harness();
    h.key(down('KeyJ'));
    expect(h.frame(10)).toEqual({ intentChanged: false, repeats: [] });
    h.at({ running: false });
    expect(h.frame(10)).toEqual({ intentChanged: true, repeats: [] });
  });
});

describe('page interception through the state', () => {
  it('prevents bound keys in contexts that do not use them', () => {
    const h = harness({ context: 'map' });
    for (const event of [down('Space'), down('Space', { repeat: true }), up('Space'), down('ArrowLeft', { altKey: true })]) {
      expect(h.key(event)).toEqual({ action: null, intentChanged: false, preventDefault: true });
    }
  });

  it('prevents the keyup of a held key whose modifiers changed since its press', () => {
    const h = harness();
    h.key(down('KeyT'));
    expect(h.key(up('KeyT', { shiftKey: true })).preventDefault).toBe(true);
    expect(h.key(up('KeyT', { shiftKey: true })).preventDefault).toBe(false);
  });

  it('leaves unbound Ctrl combinations and the priority-1 keys to the browser, and prevents bound Ctrl and Alt ones', () => {
    const h = harness();
    h.key(down('ControlLeft', { ctrlKey: true }));
    expect(h.key(down('KeyW', { ctrlKey: true })).preventDefault).toBe(false);
    expect(h.key(down('F5', { ctrlKey: true })).preventDefault).toBe(false);
    expect(h.key(down('KeyJ', { ctrlKey: true })).preventDefault).toBe(true);
    h.key(up('ControlLeft'));
    expect(h.key(down('Tab', { altKey: true })).preventDefault).toBe(false);
    expect(h.key(down('F12', { altKey: true })).preventDefault).toBe(false);
    expect(h.key(down('AltLeft', { altKey: true, metaKey: true })).preventDefault).toBe(false);
    expect(h.key(down('KeyW', { altKey: true })).preventDefault).toBe(true);
    expect(h.key(down('F1', { shiftKey: true })).preventDefault).toBe(true);
  });
});
