import { describe, expect, it } from 'vitest';
import type { KeyboardInput } from '../../platform/input/keyboard-input.ts';
import { down, keyEvent, up, type KeyPatch } from './game-input.test-support.ts';
import { shouldPreventDefault, type InterceptFacts } from './page-intercept.ts';

const facts = (event: KeyboardInput, patch: Partial<Omit<InterceptFacts, 'event'>> = {}): InterceptFacts =>
  ({ event, eligible: true, ctrl: event.ctrlKey, bound: false, ...patch });

const both = (code: string, patch?: KeyPatch): readonly KeyboardInput[] =>
  [down(code, patch), down(code, { ...patch, repeat: true }), up(code, patch)];

describe('page interception priorities', () => {
  it.each([
    ['an unqualified zone', down('Space'), { eligible: false, bound: true }],
    ['a stale callback, reported unqualified', up('AltLeft', { altKey: true }), { eligible: false }],
    ['composition', down('KeyT', { isComposing: true }), { bound: true }],
    ['a Meta combination', down('KeyJ', { metaKey: true }), { bound: true }],
    ['Meta+Alt', down('AltLeft', { metaKey: true, altKey: true }), { bound: true }],
    ['the Meta key itself', down('MetaLeft', { metaKey: true }), {}],
    ['Tab', down('Tab'), {}],
    ['Shift+Tab', down('Tab', { shiftKey: true }), {}],
    ['Alt+Tab', down('Tab', { altKey: true }), {}],
    ['F12', down('F12'), {}],
    ['Alt+F12', down('F12', { altKey: true }), {}],
    ['Ctrl+Shift+F12', down('F12', { ctrlKey: true, shiftKey: true }), {}],
  ] as const)('1. leaves %s native, even when bound or with Alt', (_name, event, patch) => {
    expect(shouldPreventDefault(facts(event, patch))).toBe(false);
  });

  it.each([
    ['AltLeft', { altKey: true }],
    ['AltRight', { altKey: true, ctrlKey: true, altGraph: true }],
    ['AltRight', { altGraph: true }],
    ['AltLeft', {}],
    ['KeyQ', { altKey: true }],
    ['KeyT', { altKey: true, ctrlKey: true }],
    ['Enter', { altGraph: true, ctrlKey: true, altKey: true }],
    ['KeyE', { altGraph: true }],
    ['F4', { altKey: true }],
    ['Escape', { altKey: true }],
    ['ArrowLeft', { altKey: true, shiftKey: true }],
  ] as const)('2. prevents %s with Alt or AltGraph %j, keydown, repeat and keyup', (code, patch) => {
    for (const event of both(code, patch)) {
      // An AltGr Ctrl flag is masked or not: neither makes it a browser Ctrl shortcut.
      for (const ctrl of [false, true]) expect(shouldPreventDefault(facts(event, { ctrl }))).toBe(true);
    }
  });

  it('3. leaves an unbound Ctrl combination, Ctrl+F1 included, and prevents a bound one', () => {
    for (const event of [...both('KeyT', { ctrlKey: true }), ...both('F1', { ctrlKey: true }), ...both('F5', { ctrlKey: true })]) {
      expect(shouldPreventDefault(facts(event))).toBe(false);
    }
    for (const event of [...both('KeyJ', { ctrlKey: true }), ...both('Enter', { ctrlKey: true, shiftKey: true })]) {
      expect(shouldPreventDefault(facts(event, { bound: true }))).toBe(true);
    }
    expect(shouldPreventDefault(facts(down('ControlLeft', { ctrlKey: true })))).toBe(false);
  });

  it('3. prevents bound and gap keys, keydown, repeat and keyup, and the keyup that released a held key', () => {
    for (const code of ['Space', 'KeyT', 'ArrowDown', 'KeyA', 'Digit1']) {
      for (const event of both(code)) expect(shouldPreventDefault(facts(event, { bound: true }))).toBe(true);
      for (const event of both(code)) expect(shouldPreventDefault(facts(event))).toBe(false);
    }
    // A key pressed alone and released with Shift no longer matches, but released a held key.
    expect(shouldPreventDefault(facts(up('KeyE', { shiftKey: true }), { bound: true }))).toBe(true);
    expect(shouldPreventDefault(facts(up('KeyE', { shiftKey: true, metaKey: true }), { bound: true }))).toBe(false);
  });

  it('3. prevents F1–F11 without Ctrl or Meta, bound or not', () => {
    for (let n = 1; n <= 11; n += 1) {
      for (const patch of [{}, { shiftKey: true }]) {
        for (const event of both(`F${n}`, patch)) expect(shouldPreventDefault(facts(event))).toBe(true);
      }
      expect(shouldPreventDefault(facts(down(`F${n}`, { ctrlKey: true })))).toBe(false);
      expect(shouldPreventDefault(facts(down(`F${n}`, { metaKey: true }), { bound: true }))).toBe(false);
    }
  });

  it('3. leaves Escape to the browser, bound or not', () => {
    for (const patch of [{}, { shiftKey: true }, { ctrlKey: true }]) {
      for (const event of both('Escape', patch)) expect(shouldPreventDefault(facts(event, { bound: true }))).toBe(false);
    }
  });

  it('4. leaves anything else', () => {
    for (const code of ['KeyZ', 'ShiftLeft', 'CapsLock', 'F13', 'Backquote']) {
      for (const event of both(code)) expect(shouldPreventDefault(facts(event))).toBe(false);
    }
    expect(shouldPreventDefault(facts(keyEvent('keyup', 'ShiftLeft', { shiftKey: false })))).toBe(false);
  });
});
