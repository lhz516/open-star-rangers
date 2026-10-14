import { describe, expect, it } from 'vitest';
import type { Command } from '../../core/contracts/tick-input.ts';
import { UNLOCKABLE_KEY_CODES } from '../../platform/browser/fullscreen.ts';
import { GAME_INPUT_BINDINGS, KEYBOARD_LOCK_CODES } from './bindings.ts';
import { findBindingConflicts, type InputAction, type InputContext, type MatchModifiers } from './input-action.ts';

const modifiers = (patch: Partial<MatchModifiers> = {}): MatchModifiers => ({
  shift: false, ctrl: false, numLock: false, ...patch,
});

function resolved(code: string, context: InputContext | null, patch: Partial<MatchModifiers> = {}): InputAction | null {
  return GAME_INPUT_BINDINGS.resolve(code, modifiers(patch), context)?.action ?? null;
}

function expectCommand(
  code: string,
  command: Command,
  context: InputContext = 'flight',
  patch: Partial<MatchModifiers> = {},
): void {
  expect(resolved(code, context, patch), `${code} ${JSON.stringify(patch)} in ${context}`).toEqual({ kind: 'command', command });
}

function expectSteer(
  code: string,
  axis: 'pitch' | 'yaw' | 'roll',
  direction: -1 | 1,
  context: 'flight' | 'warp',
  patch: Partial<MatchModifiers> = {},
): void {
  expect(resolved(code, context, patch), `${code} ${JSON.stringify(patch)} in ${context}`).toEqual({
    kind: 'steer', axis, direction,
  });
}

function expectGap(code: string, gap: 'G-08' | 'G-09' | 'G-10', patch: Partial<MatchModifiers> = {}): void {
  expect(resolved(code, 'flight', patch), `${code} ${JSON.stringify(patch)} in flight`).toEqual({ kind: 'gap', gap });
}

describe('production game input bindings', () => {
  it('has no competing action for a code/modifier/context combination', () => {
    expect(findBindingConflicts(GAME_INPUT_BINDINGS.bindings)).toEqual([]);
  });

  it('routes the project steering keys through pitch, yaw and Ctrl-roll in flight and warp', () => {
    for (const context of ['flight', 'warp'] as const) {
      for (const shift of [false, true]) {
        for (const ctrl of [false, true]) {
          expectSteer('BracketRight', 'pitch', -1, context, { shift, ctrl });
          expectSteer('Semicolon', 'pitch', 1, context, { shift, ctrl });
          expectSteer('Backquote', ctrl ? 'roll' : 'yaw', -1, context, { shift, ctrl });
          expectSteer('Quote', ctrl ? 'roll' : 'yaw', 1, context, { shift, ctrl });
        }
      }
    }
    for (const code of ['BracketRight', 'Semicolon', 'Backquote', 'Quote']) {
      expect(resolved(code, 'map')).toBeNull();
      expect(resolved(code, 'base')).toBeNull();
    }
    expect(GAME_INPUT_BINDINGS.bindings.filter(({ action }) => action.kind === 'steer').every(({ source }) => source === 'project')).toBe(true);
  });

  it('binds every ordinary flight, Warp, communications and base command', () => {
    for (const code of ['AltLeft', 'AltRight']) {
      expect(resolved(code, 'flight')).toEqual({ kind: 'primary-fire' });
      expect(resolved(code, 'warp')).toBeNull();
    }
    expectCommand('Space', { type: 'fire', channel: 'secondary' });
    for (const code of ['Equal', 'NumpadAdd']) {
      for (const shift of [false, true]) expectCommand(code, { type: 'speed', operation: 'increase' }, 'flight', { shift });
    }
    expectCommand('Minus', { type: 'speed', operation: 'decrease' });
    for (const shift of [false, true]) expectCommand('NumpadSubtract', { type: 'speed', operation: 'decrease' }, 'flight', { shift });
    expectCommand('Backslash', { type: 'speed', operation: 'zero' });
    expectCommand('Backspace', { type: 'speed', operation: 'maximum' });
    expectCommand('Digit0', { type: 'speed', operation: 'maximum' }, 'flight', { shift: true });
    expect(resolved('Digit0', 'flight')).toBeNull();

    for (let level = 1; level <= 9; level += 1) {
      expectCommand(`Digit${level}`, { type: 'speed-preset', level }, 'flight', { shift: true });
      expectCommand(`Digit${level}`, { type: 'select-number', value: level });
      for (const [shift, numLock] of [[false, true], [true, false]] as const) {
        expectCommand(`Numpad${level}`, { type: 'select-number', value: level }, 'flight', { shift, numLock });
      }
    }
    for (const shift of [false, true]) {
      expectCommand('NumpadMultiply', { type: 'speed-preset', level: 8 }, 'flight', { shift });
      expectCommand('NumpadDivide', { type: 'cycle-main-weapon' }, 'flight', { shift });
    }
    for (const code of ['Enter', 'NumpadEnter']) {
      for (const shift of [false, true]) {
        expectCommand(code, { type: 'confirm-selection' }, 'flight', { shift });
        expectCommand(code, { type: 'confirm-selection' }, 'base', { shift });
        expectCommand(code, { type: 'speed', operation: 'toggle-auto-match' }, 'flight', { shift, ctrl: true });
      }
    }

    const single = [
      ['KeyT', { type: 'target', operation: 'enemy' }],
      ['KeyF', { type: 'target', operation: 'friendly' }],
      ['KeyU', { type: 'target', operation: 'forward' }],
      ['KeyE', { type: 'energy', operation: 'open' }],
      ['KeyD', { type: 'damage-report' }],
      ['KeyC', { type: 'communications', operation: 'open' }],
      ['KeyX', { type: 'communications', operation: 'close' }],
    ] as const;
    for (const [code, action] of single) expectCommand(code, action);
    expectCommand('KeyR', { type: 'target', operation: 'next' });
    expectCommand('KeyY', { type: 'target', operation: 'previous' });

    for (const shift of [false, true]) {
      expectCommand('Comma', { type: 'select-missile', direction: 'previous' }, 'flight', { shift });
      expectCommand('Period', { type: 'select-missile', direction: 'next' }, 'flight', { shift });
      for (const [code, operation] of [['KeyS', 'shield'], ['KeyG', 'gun']] as const) {
        expectCommand(code, { type: 'energy', operation: `${operation}-${shift ? 'increase' : 'decrease'}` }, 'flight', { shift });
      }
    }
    expectCommand('Slash', { type: 'cycle-main-weapon' });
    for (const [shift, numLock] of [[false, true], [true, false]] as const) {
      expectCommand('NumpadDecimal', { type: 'select-missile', direction: 'next' }, 'flight', { shift, numLock });
    }

    expectCommand('KeyM', { type: 'toggle-map' }, 'flight');
    expectCommand('KeyM', { type: 'toggle-map' }, 'map');
    expectCommand('KeyM', { type: 'toggle-map' }, 'base');
    for (const shift of [false, true]) {
      expectCommand('KeyW', { type: 'request-warp' }, 'flight', { shift });
      expectCommand('KeyW', { type: 'request-warp' }, 'map', { shift });
    }
    expectCommand('KeyL', { type: 'launch' }, 'base');
    expectCommand('ArrowUp', { type: 'navigate-selection', direction: 'previous' }, 'base');
    expectCommand('ArrowDown', { type: 'navigate-selection', direction: 'next' }, 'base');
  });

  it('separates keypad navigation, front view, unavailable views and digits by NumLock/Shift', () => {
    expectCommand('ArrowUp', { type: 'cockpit-front' }, 'flight');
    for (const shift of [false, true]) {
      expectCommand('F1', { type: 'cockpit-front' }, 'flight');
      expectCommand('Numpad8', { type: 'cockpit-front' }, 'flight', { shift, numLock: shift });
      expectCommand('Numpad8', { type: 'navigate-selection', direction: 'previous' }, 'base', { shift, numLock: shift });
      expectGap('Numpad2', 'G-08', { shift, numLock: shift });
      expectCommand('Numpad2', { type: 'navigate-selection', direction: 'next' }, 'base', { shift, numLock: shift });
      for (const code of ['Numpad7', 'Numpad9', 'Numpad4', 'Numpad6', 'Numpad5']) {
        expectGap(code, 'G-08', { shift, numLock: shift });
      }
    }
    for (const code of ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10',
      'Home', 'PageUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown']) expectGap(code, 'G-08');
    expectGap('KeyA', 'G-09');
    expectGap('F11', 'G-10');
    expect(resolved('Numpad2', 'map', { shift: false, numLock: false })).toBeNull();
    expect(resolved('Numpad8', 'warp', { shift: false, numLock: false })).toBeNull();
  });

  it('keeps session controls contextual and maps Escape according to lock-independent input context', () => {
    for (const context of ['flight', 'warp', 'map', 'base'] as const) {
      for (const shift of [false, true]) {
        expect(resolved('KeyP', context, { shift })).toEqual({ kind: 'session', control: 'toggle-pause' });
      }
    }
    for (const context of ['flight', 'warp', 'base'] as const) {
      const menuBinding = GAME_INPUT_BINDINGS.resolve('Escape', modifiers(), context);
      expect(menuBinding?.action).toEqual({ kind: 'session', control: 'open-menu' });
      expect(menuBinding?.source).toBe('project');
    }
    expectCommand('Escape', { type: 'toggle-map' }, 'map');
  });

  it('marks repeatable commands, sources and the Keyboard Lock code set', () => {
    for (const binding of GAME_INPUT_BINDINGS.bindings) {
      const { action } = binding;
      const expected = action.kind === 'command' && (
        (action.command.type === 'fire' && action.command.channel === 'secondary')
        || (action.command.type === 'speed' && ['increase', 'decrease'].includes(action.command.operation))
        || (action.command.type === 'target' && ['next', 'previous'].includes(action.command.operation))
        || action.command.type === 'select-missile'
        || (action.command.type === 'energy' && ['shield-increase', 'shield-decrease', 'gun-increase', 'gun-decrease'].includes(action.command.operation))
        || action.command.type === 'navigate-selection'
      );
      expect(binding.repeatable, `${binding.code} ${JSON.stringify(action)} in ${binding.contexts}`).toBe(expected);
    }
    for (const binding of GAME_INPUT_BINDINGS.bindings.filter(({ action }) => action.kind === 'gap')) {
      expect(binding.source).toBe('gap');
    }
    for (const binding of GAME_INPUT_BINDINGS.bindings.filter(({ action }) =>
      action.kind === 'session' && action.control === 'toggle-pause')) {
      expect(binding.source).toBe('project');
    }

    const boundCodes = new Set(GAME_INPUT_BINDINGS.bindings.map(({ code }) => code));
    const lockCodes = new Set(KEYBOARD_LOCK_CODES);
    expect(KEYBOARD_LOCK_CODES.length).toBe(lockCodes.size);
    expect([...lockCodes].every(code => !UNLOCKABLE_KEY_CODES.has(code))).toBe(true);
    expect([...boundCodes].filter(code => !UNLOCKABLE_KEY_CODES.has(code)).every(code => lockCodes.has(code))).toBe(true);
    expect(lockCodes.has('ControlLeft')).toBe(true);
    expect(lockCodes.has('ControlRight')).toBe(true);
    expect(lockCodes.has('AltLeft')).toBe(true);
    expect(lockCodes.has('AltRight')).toBe(true);
    expect([...lockCodes].every(code => boundCodes.has(code) || code === 'ControlLeft' || code === 'ControlRight')).toBe(true);
  });

  it('does not bind unlisted keys, Ctrl variants, or Shift+Slash as an alias', () => {
    for (const [code, context, patch] of [
      ['KeyQ', 'flight', {}],
      ['Tab', 'flight', {}],
      ['F12', 'flight', {}],
      ['Slash', 'flight', { shift: true }],
      ['KeyT', 'flight', { ctrl: true }],
      ['Digit1', 'flight', { shift: false, ctrl: true }],
      ['Numpad1', 'flight', { shift: false, ctrl: true, numLock: true }],
      ['Space', 'map', {}],
      ['KeyL', 'flight', {}],
      ['KeyC', 'base', {}],
    ] as const) {
      expect(resolved(code, context, patch)).toBeNull();
    }
    expect(GAME_INPUT_BINDINGS.resolve('KeyT', modifiers(), null)).toBeNull();
  });
});
