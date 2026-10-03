import { describe, expect, it } from 'vitest';
import { classifyKeyboardInput, HeldKeyboardAxis, normalizeKeyboardInput } from './keyboard-input.ts';
import type { KeyboardInput } from './keyboard-input.ts';

function key(code: string, patch: Partial<KeyboardInput> = {}): KeyboardInput {
  return normalizeKeyboardInput({
    type: 'keydown', code, repeat: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false, ...patch,
  });
}

describe('keyboard input contract', () => {
  it('copies and freezes only the agreed fields without reading key/keyCode/shiftKey', () => {
    const event = {
      ...key('ArrowLeft'),
      get key(): never { throw new Error('key read'); },
      get keyCode(): never { throw new Error('keyCode read'); },
      get shiftKey(): never { throw new Error('shift read'); },
    };
    const normalized = normalizeKeyboardInput(event);
    expect(normalized).toEqual(key('ArrowLeft'));
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(normalized === event).toBe(false);
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
