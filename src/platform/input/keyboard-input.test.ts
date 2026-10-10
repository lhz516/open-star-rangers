import { describe, expect, it } from 'vitest';
import { classifyKeyboardInput, HeldKeyboardAxis, normalizeKeyboardInput, readKeyboardEvent } from './keyboard-input.ts';
import type { KeyboardInput } from './keyboard-input.ts';

function key(code: string, patch: Partial<KeyboardInput> = {}): KeyboardInput {
  return normalizeKeyboardInput({
    type: 'keydown', code, repeat: false, shiftKey: false, ctrlKey: false, altKey: false, altGraph: false,
    metaKey: false, numLock: false, isComposing: false, ...patch,
  });
}

const forbidden = {
  get key(): never { throw new Error('key read'); },
  get keyCode(): never { throw new Error('keyCode read'); },
};

const MODIFIER_FLAGS = ['shiftKey', 'altGraph', 'numLock'] as const;

describe('keyboard input contract', () => {
  it('copies and freezes every agreed field, modifier states included, without reading key/keyCode', () => {
    const fields: KeyboardInput = {
      type: 'keyup', code: 'Numpad5', repeat: true, shiftKey: true, ctrlKey: false, altKey: true, altGraph: true,
      metaKey: false, numLock: true, isComposing: false,
    };
    const event = Object.defineProperties({ ...fields, extra: 1 }, Object.getOwnPropertyDescriptors(forbidden));
    const normalized = normalizeKeyboardInput(event);
    expect(normalized).toStrictEqual(fields);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(normalized === event).toBe(false);
  });

  it.each([[false, false], [true, false], [false, true], [true, true]])(
    'reads the reported AltGraph=%s and NumLock=%s states and Shift from a browser-shaped event',
    (altGraph, numLock) => {
      const queried: string[] = [];
      // DOM KeyboardEvent fields are prototype getters, so the reader must not rely on spreading the event.
      const prototype = Object.defineProperties({
        getModifierState(name: string) {
          queried.push(name);
          return name === 'AltGraph' ? altGraph : name === 'NumLock' ? numLock : true;
        },
      }, {
        ...Object.getOwnPropertyDescriptors(forbidden),
        code: { get: () => 'Digit1' },
        repeat: { get: () => false },
        shiftKey: { get: () => true },
        ctrlKey: { get: () => true },
        altKey: { get: () => false },
        metaKey: { get: () => false },
        isComposing: { get: () => false },
      });
      const event = readKeyboardEvent('keydown', Object.create(prototype) as Parameters<typeof readKeyboardEvent>[1]);
      expect(event).toStrictEqual({ ...key('Digit1', { shiftKey: true, ctrlKey: true, altGraph, numLock }) });
      expect(queried).toEqual(['AltGraph', 'NumLock']);
    },
  );

  it.each(MODIFIER_FLAGS)('keeps classification and the held axis unchanged by %s', flag => {
    for (const type of ['keydown', 'keyup'] as const) {
      for (const repeat of [false, true]) {
        for (const bound of [false, true]) {
          for (const eligible of [false, true]) {
            const plain = key('ArrowRight', { type, repeat });
            expect(classifyKeyboardInput(key('ArrowRight', { type, repeat, [flag]: true }), bound, eligible))
              .toEqual(classifyKeyboardInput(plain, bound, eligible));
          }
        }
      }
    }
    const held = new HeldKeyboardAxis({ ArrowLeft: -1, ArrowRight: 1 });
    expect(held.apply(key('ArrowRight', { [flag]: true }), true, true)).toBe(true);
    expect(held.value()).toBe(1);
    expect(held.apply(key('ArrowLeft', { [flag]: true }), true, true)).toBe(true);
    expect(held.value()).toBe(0);
    expect(held.apply(key('ArrowLeft', { type: 'keyup' }), true, true)).toBe(true);
    expect(held.apply(key('ArrowRight', { type: 'keyup', [flag]: true }), true, true)).toBe(true);
    expect(held.value()).toBe(0);
  });

  it.each(['Tab', 'Escape', 'Space', 'Enter', 'AltLeft', 'F5', 'toString'])('leaves unbound %s native', code => {
    expect(classifyKeyboardInput(key(code), false, true)).toEqual({
      release: false, activate: false, preventDefault: false,
    });
  });

  it.each(['keydown', 'keyup'] as const)('does not intercept a bound ineligible %s', type => {
    expect(classifyKeyboardInput(key('ArrowRight', { type }), true, false)).toEqual({
      release: type === 'keyup', activate: false, preventDefault: false,
    });
  });

  it.each(['ctrlKey', 'altKey', 'metaKey', 'isComposing'] as const)('releases but does not intercept %s keyup', field => {
    const held = new HeldKeyboardAxis({ ArrowLeft: -1, ArrowRight: 1 });
    held.apply(key('ArrowRight'), true, true);
    const release = key('ArrowRight', { type: 'keyup', [field]: true });
    expect(classifyKeyboardInput(release, true, true)).toEqual({
      release: true, activate: false, preventDefault: false,
    });
    expect(held.apply(release, true, true)).toBe(true);
    expect(held.value()).toBe(0);
    expect(held.apply(key('ArrowRight', { [field]: true }), true, true)).toBe(false);
  });

  it.each([['ArrowLeft', 'ArrowRight', -1, 1], ['ArrowRight', 'ArrowLeft', 1, -1]] as const)(
    'cancels %s/%s independently of press order',
    (first, second, firstValue, secondValue) => {
      const held = new HeldKeyboardAxis({ ArrowLeft: -1, ArrowRight: 1 });
      expect(held.apply(key(first), true, true)).toBe(true);
      expect(held.value()).toBe(firstValue);
      expect(held.apply(key(first, { repeat: true }), true, true)).toBe(false);
      expect(held.apply(key(first), true, true)).toBe(false);
      expect(held.apply(key(second), true, true)).toBe(true);
      expect(held.value()).toBe(0);
      expect(held.apply(key(first, { type: 'keyup' }), true, true)).toBe(true);
      expect(held.value()).toBe(secondValue);
      expect(held.apply(key(second, { type: 'keyup' }), true, true)).toBe(true);
      expect(held.value()).toBe(0);
    },
  );

  it('deduplicates clears, releases even when ineligible, and cannot rebuild from repeats', () => {
    const held = new HeldKeyboardAxis({ ArrowLeft: -1, ArrowRight: 1 });
    for (const [eligible, running] of [[false, true], [true, false], [false, false]]) {
      expect(held.apply(key('ArrowRight'), eligible, running)).toBe(false);
    }
    expect(held.apply(key('ArrowRight'), true, true)).toBe(true);
    expect(held.clear()).toBe(true);
    expect(held.clear()).toBe(false);
    expect(held.apply(key('ArrowRight', { repeat: true }), true, true)).toBe(false);
    expect(classifyKeyboardInput(key('ArrowRight', { repeat: true }), true, true).preventDefault).toBe(true);
    expect(held.apply(key('ArrowRight'), true, true)).toBe(true);
    expect(held.apply(key('ArrowRight', { type: 'keyup' }), false, false)).toBe(true);
    expect(held.apply(key('toString'), true, true)).toBe(false);
  });
});
