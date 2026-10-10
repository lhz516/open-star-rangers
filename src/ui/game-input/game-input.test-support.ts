/**
 * Test support for ui/game-input: synthetic keyboard events and moments, and a TEST binding table. The table is shaped
 * like the spec's draft binding table so the Node tests read like it, but it is not the production binding data,
 * which subtask 19 builds from checkpoint K's final table.
 */
import type { Command } from '../../core/contracts/tick-input.ts';
import { normalizeKeyboardInput, type KeyboardInput } from '../../platform/input/keyboard-input.ts';
import {
  createBindingTable, type Binding, type BindingTable, type InputAction, type InputContext, type ModifierRule,
} from './input-action.ts';
import type { InputMoment } from './input-state.ts';

export type KeyPatch = Partial<Omit<KeyboardInput, 'type' | 'code'>>;

export function keyEvent(type: KeyboardInput['type'], code: string, patch: KeyPatch = {}): KeyboardInput {
  return normalizeKeyboardInput({
    type, code, repeat: false, shiftKey: false, ctrlKey: false, altKey: false, altGraph: false, metaKey: false,
    numLock: false, isComposing: false, ...patch,
  });
}

export const down = (code: string, patch?: KeyPatch): KeyboardInput => keyEvent('keydown', code, patch);
export const up = (code: string, patch?: KeyPatch): KeyboardInput => keyEvent('keyup', code, patch);

export function moment(patch: Partial<InputMoment> = {}): InputMoment {
  return { eligible: true, running: true, runId: 1, context: 'flight', clock: 0, ...patch };
}

interface Entry {
  readonly shift?: ModifierRule;
  readonly ctrl?: ModifierRule;
  readonly numLock?: ModifierRule;
  readonly repeatable?: boolean;
  readonly source?: Binding['source'];
}

function bind(code: string, contexts: readonly InputContext[], action: InputAction, entry: Entry = {}): Binding {
  return {
    code, contexts, action, shift: entry.shift ?? false, ctrl: entry.ctrl ?? false, numLock: entry.numLock ?? 'any',
    repeatable: entry.repeatable ?? false, source: entry.source ?? 'original',
  };
}

const command = (value: Command): InputAction => ({ kind: 'command', command: value });
const FLIGHT: readonly InputContext[] = ['flight'];
const STEERING: readonly InputContext[] = ['flight', 'warp'];
const ALL: readonly InputContext[] = ['flight', 'warp', 'map', 'base'];
const steer = (axis: 'pitch' | 'yaw' | 'roll', direction: -1 | 1): InputAction => ({ kind: 'steer', axis, direction });

export const TEST_BINDING_ENTRIES: readonly Binding[] = Object.freeze([
  bind('KeyI', STEERING, steer('pitch', -1), { shift: 'any', ctrl: 'any', source: 'project' }),
  bind('KeyK', STEERING, steer('pitch', 1), { shift: 'any', ctrl: 'any', source: 'project' }),
  bind('KeyJ', STEERING, steer('yaw', -1), { shift: 'any', source: 'project' }),
  bind('KeyL', STEERING, steer('yaw', 1), { shift: 'any', source: 'project' }),
  bind('KeyJ', STEERING, steer('roll', -1), { shift: 'any', ctrl: true, source: 'project' }),
  bind('KeyL', STEERING, steer('roll', 1), { shift: 'any', ctrl: true, source: 'project' }),
  bind('AltLeft', FLIGHT, { kind: 'primary-fire' }, { shift: 'any', ctrl: 'any' }),
  bind('AltRight', FLIGHT, { kind: 'primary-fire' }, { shift: 'any', ctrl: 'any' }),
  bind('Space', FLIGHT, command({ type: 'fire', channel: 'secondary' }), { repeatable: true }),
  bind('Equal', FLIGHT, command({ type: 'speed', operation: 'increase' }), { shift: 'any', repeatable: true }),
  bind('Minus', FLIGHT, command({ type: 'speed', operation: 'decrease' }), { repeatable: true }),
  bind('KeyS', FLIGHT, command({ type: 'energy', operation: 'shield-decrease' }), { repeatable: true }),
  bind('KeyS', FLIGHT, command({ type: 'energy', operation: 'shield-increase' }), { shift: true, repeatable: true }),
  bind('KeyR', FLIGHT, command({ type: 'target', operation: 'next' }), { repeatable: true }),
  bind('KeyT', FLIGHT, command({ type: 'target', operation: 'enemy' })),
  bind('Digit1', FLIGHT, command({ type: 'speed-preset', level: 1 }), { shift: true }),
  bind('Digit1', ['flight', 'base'], command({ type: 'select-number', value: 1 })),
  bind('Enter', ['flight', 'base'], command({ type: 'confirm-selection' })),
  bind('Enter', FLIGHT, command({ type: 'speed', operation: 'toggle-auto-match' }), { ctrl: true }),
  bind('Numpad8', ['base'], command({ type: 'navigate-selection', direction: 'previous' }), { numLock: false, repeatable: true }),
  bind('Numpad8', ['base'], command({ type: 'select-number', value: 8 }), { numLock: true }),
  bind('ArrowUp', FLIGHT, command({ type: 'cockpit-front' })),
  bind('ArrowUp', ['base'], command({ type: 'navigate-selection', direction: 'previous' }), { repeatable: true }),
  bind('KeyM', ['flight', 'map'], command({ type: 'toggle-map' })),
  bind('KeyL', ['base'], command({ type: 'launch' })),
  bind('F1', FLIGHT, command({ type: 'cockpit-front' })),
  bind('F2', FLIGHT, { kind: 'gap', gap: 'G-08' }, { source: 'gap' }),
  bind('KeyA', FLIGHT, { kind: 'gap', gap: 'G-09' }, { source: 'gap' }),
  bind('F11', FLIGHT, { kind: 'gap', gap: 'G-10' }, { source: 'gap' }),
  bind('KeyP', ALL, { kind: 'session', control: 'toggle-pause' }, { shift: 'any' }),
  bind('Escape', ['flight', 'warp', 'base'], { kind: 'session', control: 'open-menu' }, { source: 'project' }),
]);

export const TEST_BINDINGS: BindingTable = createBindingTable(TEST_BINDING_ENTRIES);
