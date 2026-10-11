/**
 * The production bindings finalized in docs/plan/p3/05/spec.md (绑定表, finalized by checkpoint K).
 * Codes are KeyboardEvent.code values; Alt is a separate primary-fire level, not a matching modifier.
 */
import type { Command } from '../../core/contracts/tick-input.ts';
import { UNLOCKABLE_KEY_CODES } from '../../platform/browser/fullscreen.ts';
import {
  createBindingTable, INPUT_CONTEXTS, type Binding, type BindingTable, type InputAction, type InputContext, type ModifierRule,
} from './input-action.ts';

const FLIGHT: readonly InputContext[] = ['flight'];
const FLIGHT_WARP: readonly InputContext[] = ['flight', 'warp'];
const FLIGHT_MAP: readonly InputContext[] = ['flight', 'map'];
const FLIGHT_MAP_BASE: readonly InputContext[] = ['flight', 'map', 'base'];
const FLIGHT_WARP_BASE: readonly InputContext[] = ['flight', 'warp', 'base'];
const BASE: readonly InputContext[] = ['base'];
const INPUT_CONTEXTS_ALL = INPUT_CONTEXTS;
const ORIGINAL = 'original' as const;
const PROJECT = 'project' as const;
const GAP = 'gap' as const;

interface BindingOptions {
  readonly shift?: ModifierRule;
  readonly ctrl?: ModifierRule;
  readonly numLock?: ModifierRule;
  readonly contexts: readonly InputContext[];
  readonly repeatable?: boolean;
  readonly source?: Binding['source'];
}

const entries: Binding[] = [];

function add(codes: string | readonly string[], action: InputAction, options: BindingOptions): void {
  for (const code of typeof codes === 'string' ? [codes] : codes) {
    entries.push({
      code,
      shift: options.shift ?? false,
      ctrl: options.ctrl ?? false,
      numLock: options.numLock ?? 'any',
      contexts: options.contexts,
      action,
      repeatable: options.repeatable ?? false,
      source: options.source ?? ORIGINAL,
    });
  }
}

function command(code: string | readonly string[], value: Command, options: BindingOptions): void {
  add(code, { kind: 'command', command: value }, options);
}

function steering(codes: readonly [string, string], axis: 'pitch' | 'yaw', options: BindingOptions): void {
  const [negative, positive] = codes;
  add(negative, { kind: 'steer', axis, direction: -1 }, options);
  add(positive, { kind: 'steer', axis, direction: 1 }, options);
}

function keypadModifierPair(
  codes: string | readonly string[],
  action: InputAction,
  contexts: readonly InputContext[],
  relation: 'same' | 'different' = 'same',
  repeatable = false,
): void {
  for (const modifier of [false, true]) {
    add(codes, action, {
      shift: modifier, ctrl: false, numLock: relation === 'same' ? modifier : !modifier, contexts, repeatable,
      source: action.kind === 'gap' ? GAP : ORIGINAL,
    });
  }
}

const anyShift: ModifierRule = 'any';

steering(['BracketRight', 'Semicolon'], 'pitch', {
  shift: anyShift, ctrl: 'any', contexts: FLIGHT_WARP, source: PROJECT,
});
steering(['Backquote', 'Quote'], 'yaw', {
  shift: anyShift, ctrl: false, contexts: FLIGHT_WARP, source: PROJECT,
});
for (const [code, direction] of [['Backquote', -1], ['Quote', 1]] as const) {
  add(code, { kind: 'steer', axis: 'roll', direction }, {
    shift: anyShift, ctrl: true, contexts: FLIGHT_WARP, source: PROJECT,
  });
}

add(['AltLeft', 'AltRight'], { kind: 'primary-fire' }, { contexts: FLIGHT, source: ORIGINAL });
command('Space', { type: 'fire', channel: 'secondary' }, { contexts: FLIGHT, repeatable: true });

command(['Equal', 'NumpadAdd'], { type: 'speed', operation: 'increase' }, {
  shift: anyShift, contexts: FLIGHT, repeatable: true,
});
command('Minus', { type: 'speed', operation: 'decrease' }, { contexts: FLIGHT, repeatable: true });
command('NumpadSubtract', { type: 'speed', operation: 'decrease' }, {
  shift: anyShift, contexts: FLIGHT, repeatable: true,
});
command('Backslash', { type: 'speed', operation: 'zero' }, { contexts: FLIGHT });
command('Backspace', { type: 'speed', operation: 'maximum' }, {
  shift: false, contexts: FLIGHT,
});
command('Digit0', { type: 'speed', operation: 'maximum' }, { shift: true, contexts: FLIGHT });

for (let level = 1; level <= 9; level += 1) {
  const digit = `Digit${level}`;
  command(digit, { type: 'speed-preset', level }, { shift: true, contexts: FLIGHT });
  command(digit, { type: 'select-number', value: level }, { shift: false, contexts: FLIGHT });

  const keypad = `Numpad${level}`;
  for (const [shift, numLock] of [[false, true], [true, false]] as const) {
    command(keypad, { type: 'select-number', value: level }, {
      shift, numLock, contexts: FLIGHT,
    });
  }
}

command('NumpadMultiply', { type: 'speed-preset', level: 8 }, {
  shift: anyShift, contexts: FLIGHT,
});
command('NumpadDivide', { type: 'cycle-main-weapon' }, { shift: anyShift, contexts: FLIGHT });

for (const code of ['Enter', 'NumpadEnter']) {
  command(code, { type: 'confirm-selection' }, {
    shift: anyShift, ctrl: false, contexts: ['flight', 'base'],
  });
  command(code, { type: 'speed', operation: 'toggle-auto-match' }, {
    shift: anyShift, ctrl: true, contexts: FLIGHT,
  });
}

command('KeyT', { type: 'target', operation: 'enemy' }, { contexts: FLIGHT });
command('KeyF', { type: 'target', operation: 'friendly' }, { contexts: FLIGHT });
command('KeyR', { type: 'target', operation: 'next' }, { contexts: FLIGHT, repeatable: true });
command('KeyY', { type: 'target', operation: 'previous' }, { contexts: FLIGHT, repeatable: true });
command('KeyU', { type: 'target', operation: 'forward' }, { contexts: FLIGHT });
command('Slash', { type: 'cycle-main-weapon' }, { contexts: FLIGHT });
command('Comma', { type: 'select-missile', direction: 'previous' }, {
  shift: anyShift, contexts: FLIGHT, repeatable: true,
});
command('Period', { type: 'select-missile', direction: 'next' }, {
  shift: anyShift, contexts: FLIGHT, repeatable: true,
});
keypadModifierPair('NumpadDecimal', {
  kind: 'command', command: { type: 'select-missile', direction: 'next' },
}, FLIGHT, 'different', true);

command('KeyE', { type: 'energy', operation: 'open' }, { contexts: FLIGHT });
for (const [code, operation] of [['KeyS', 'shield'], ['KeyG', 'gun']] as const) {
  command(code, { type: 'energy', operation: `${operation}-decrease` }, {
    shift: false, contexts: FLIGHT, repeatable: true,
  });
  command(code, { type: 'energy', operation: `${operation}-increase` }, {
    shift: true, contexts: FLIGHT, repeatable: true,
  });
}
command('KeyD', { type: 'damage-report' }, { contexts: FLIGHT });

command('KeyM', { type: 'toggle-map' }, { contexts: FLIGHT_MAP_BASE });
command('KeyW', { type: 'request-warp' }, { shift: anyShift, contexts: FLIGHT_MAP });
command('KeyC', { type: 'communications', operation: 'open' }, { contexts: FLIGHT });
command('KeyX', { type: 'communications', operation: 'close' }, { contexts: FLIGHT });
command('KeyL', { type: 'launch' }, { contexts: BASE });
command('ArrowUp', { type: 'navigate-selection', direction: 'previous' }, {
  contexts: BASE, repeatable: true,
});
command('ArrowDown', { type: 'navigate-selection', direction: 'next' }, {
  contexts: BASE, repeatable: true,
});

command('ArrowUp', { type: 'cockpit-front' }, { contexts: FLIGHT });
command('F1', { type: 'cockpit-front' }, { contexts: FLIGHT });
keypadModifierPair('Numpad8', { kind: 'command', command: { type: 'cockpit-front' } }, ['flight']);
keypadModifierPair('Numpad8', {
  kind: 'command', command: { type: 'navigate-selection', direction: 'previous' },
}, BASE, 'same', true);
keypadModifierPair('Numpad2', { kind: 'gap', gap: 'G-08' }, FLIGHT);
keypadModifierPair('Numpad2', {
  kind: 'command', command: { type: 'navigate-selection', direction: 'next' },
}, BASE, 'same', true);
for (const code of ['Numpad7', 'Numpad9', 'Numpad4', 'Numpad6', 'Numpad5']) {
  keypadModifierPair(code, { kind: 'gap', gap: 'G-08' }, FLIGHT);
}

for (const code of ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10',
  'Home', 'PageUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown']) {
  add(code, { kind: 'gap', gap: 'G-08' }, { contexts: FLIGHT, source: GAP });
}
add('KeyA', { kind: 'gap', gap: 'G-09' }, { contexts: FLIGHT, source: GAP });
add('F11', { kind: 'gap', gap: 'G-10' }, { contexts: FLIGHT, source: GAP });

add('KeyP', { kind: 'session', control: 'toggle-pause' }, {
  shift: anyShift, contexts: INPUT_CONTEXTS_ALL, source: PROJECT,
});
add('Escape', { kind: 'session', control: 'open-menu' }, {
  contexts: FLIGHT_WARP_BASE, source: PROJECT,
});
command('Escape', { type: 'toggle-map' }, { contexts: ['map'] });

/** The immutable production binding table used by the game input consumer. */
export const GAME_INPUT_BINDINGS: BindingTable = createBindingTable(entries);

const UNLOCKABLE_MODIFIER_CODES = ['ControlLeft', 'ControlRight'] as const;

/**
 * Codes actually used by bindings, plus Ctrl modifier codes required by Ctrl bindings.
 * Escape, browser Tab/Meta controls and F12 are never locked.
 */
export const KEYBOARD_LOCK_CODES: readonly string[] = Object.freeze([...new Set([
  ...GAME_INPUT_BINDINGS.bindings.map(({ code }) => code),
  ...UNLOCKABLE_MODIFIER_CODES,
])].filter(code => !UNLOCKABLE_KEY_CODES.has(code)));
