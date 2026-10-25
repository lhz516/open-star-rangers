import { describe, expect, it } from 'vitest';
import { isHeldActivation, placeholderKeyAction, placeholderTakesFocus, type PageKey } from './page-keys.ts';

const press = (key: string, overrides: Partial<PageKey> = {}): PageKey =>
  ({ key, repeat: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false, ...overrides });

describe('mission page keys (P3-04 衔接占位, 任务开始配置)', () => {
  it('skip on a new press of Enter, Space or Esc, with or without Shift', () => {
    for (const key of ['Enter', ' ', 'Escape']) expect(placeholderKeyAction(press(key)), key).toBe('skip');
  });

  it('suppress repeats of those keys, modified or not, so a held key ends nothing and activates no focused button', () => {
    for (const key of ['Enter', ' ', 'Escape']) expect(placeholderKeyAction(press(key, { repeat: true })), key).toBe('suppress');
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'isComposing'] as const) {
      expect(placeholderKeyAction(press('Enter', { [modifier]: true, repeat: true })), modifier).toBe('suppress');
    }
  });

  it('leave other keys, new modified presses and composition to the browser', () => {
    for (const key of ['Tab', 'a', 'Spacebar', 'Esc', 'ArrowDown', 'F1']) {
      expect(placeholderKeyAction(press(key)), key).toBeNull();
      expect(placeholderKeyAction(press(key, { repeat: true })), key).toBeNull();
    }
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'isComposing'] as const) {
      expect(placeholderKeyAction(press('Enter', { [modifier]: true })), modifier).toBeNull();
    }
  });

  it('treat only repeats of Enter and Space as held activations', () => {
    expect(isHeldActivation(press('Enter', { repeat: true }))).toBe(true);
    expect(isHeldActivation(press(' ', { repeat: true }))).toBe(true);
    expect(isHeldActivation(press('Enter'))).toBe(false);
    expect(isHeldActivation(press('Escape', { repeat: true }))).toBe(false);
  });
});

describe('placeholder focus (P3-10 缺省与标注)', () => {
  it('always for the flow\'s own placeholders; for a running hold\'s only on a visible page whose focus was dropped', () => {
    for (const focusDropped of [true, false]) {
      for (const visible of [true, false]) {
        expect(placeholderTakesFocus({ placement: 'flow', focusDropped, visible })).toBe(true);
        expect(placeholderTakesFocus({ placement: 'hold', focusDropped, visible })).toBe(focusDropped && visible);
      }
    }
  });

  it('for each ending placeholder on a visible page, wherever focus was, and never on a hidden page (P3-11)', () => {
    for (const focusDropped of [true, false]) {
      expect(placeholderTakesFocus({ placement: 'ending', focusDropped, visible: true })).toBe(true);
      expect(placeholderTakesFocus({ placement: 'ending', focusDropped, visible: false })).toBe(false);
    }
  });
});
