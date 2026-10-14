import { describe, expect, it } from 'vitest';
import { TEST_BINDING_ENTRIES, TEST_BINDINGS } from './game-input.test-support.ts';
import { createBindingTable, findBindingConflicts, INPUT_CONTEXTS, type Binding, type MatchModifiers } from './input-action.ts';

const mods = (patch: Partial<MatchModifiers> = {}): MatchModifiers => ({ shift: false, ctrl: false, numLock: false, ...patch });
const entry = (patch: Partial<Binding>): Binding => ({
  code: 'KeyT', shift: false, ctrl: false, numLock: 'any', contexts: ['flight'],
  action: { kind: 'command', command: { type: 'target', operation: 'enemy' } }, repeatable: false, source: 'original', ...patch,
});

describe('binding table', () => {
  it('copies and deeply freezes its entries', () => {
    const command = { type: 'target' as const, operation: 'enemy' as const };
    const contexts: Binding['contexts'] = ['flight'];
    const source = entry({ contexts, action: { kind: 'command', command } });
    const table = createBindingTable([source]);
    const [copy] = table.bindings;
    expect(copy).toStrictEqual(source);
    expect(copy === source).toBe(false);
    expect(Object.isFrozen(table) && Object.isFrozen(table.bindings) && Object.isFrozen(copy)).toBe(true);
    expect(Object.isFrozen(copy?.contexts) && Object.isFrozen(copy?.action)).toBe(true);
    expect(copy?.action.kind === 'command' && Object.isFrozen(copy.action.command)).toBe(true);
    command.operation = 'friendly' as 'enemy';
    expect(table.resolve('KeyT', mods(), 'flight')?.action).toEqual({ kind: 'command', command: { type: 'target', operation: 'enemy' } });
  });

  it('matches the exact Shift and effective Ctrl a binding asks for, and either when it accepts both', () => {
    expect(TEST_BINDINGS.resolve('KeyT', mods(), 'flight')?.action).toMatchObject({ command: { operation: 'enemy' } });
    expect(TEST_BINDINGS.resolve('KeyT', mods({ shift: true }), 'flight')).toBeNull();
    expect(TEST_BINDINGS.resolve('KeyT', mods({ ctrl: true }), 'flight')).toBeNull();
    expect(TEST_BINDINGS.resolve('KeyS', mods(), 'flight')?.action).toMatchObject({ command: { operation: 'shield-decrease' } });
    expect(TEST_BINDINGS.resolve('KeyS', mods({ shift: true }), 'flight')?.action).toMatchObject({ command: { operation: 'shield-increase' } });
    for (const shift of [false, true]) {
      expect(TEST_BINDINGS.resolve('Equal', mods({ shift }), 'flight')?.action).toMatchObject({ command: { operation: 'increase' } });
      expect(TEST_BINDINGS.resolve('KeyJ', mods({ shift }), 'flight')?.action).toEqual({ kind: 'steer', axis: 'yaw', direction: -1 });
      expect(TEST_BINDINGS.resolve('KeyJ', mods({ shift, ctrl: true }), 'flight')?.action).toEqual({ kind: 'steer', axis: 'roll', direction: -1 });
    }
    expect(TEST_BINDINGS.resolve('Enter', mods({ ctrl: true }), 'flight')?.action).toMatchObject({ command: { operation: 'toggle-auto-match' } });
    expect(TEST_BINDINGS.resolve('Digit1', mods({ shift: true }), 'flight')?.action).toMatchObject({ command: { type: 'speed-preset', level: 1 } });
    expect(TEST_BINDINGS.resolve('Digit1', mods(), 'flight')?.action).toMatchObject({ command: { type: 'select-number', value: 1 } });
  });

  it('tells keypad meanings apart by the reported NumLock state only where the binding asks', () => {
    expect(TEST_BINDINGS.resolve('Numpad8', mods(), 'base')?.action).toMatchObject({ command: { type: 'navigate-selection' } });
    expect(TEST_BINDINGS.resolve('Numpad8', mods({ numLock: true }), 'base')?.action).toMatchObject({ command: { type: 'select-number', value: 8 } });
    for (const numLock of [false, true]) expect(TEST_BINDINGS.resolve('KeyT', mods({ numLock }), 'flight')).not.toBeNull();
  });

  it('acts only in the binding contexts, while interception counts a binding in any context', () => {
    expect(TEST_BINDINGS.resolve('KeyL', mods(), 'base')?.action).toMatchObject({ command: { type: 'launch' } });
    expect(TEST_BINDINGS.resolve('KeyL', mods(), 'flight')?.action).toEqual({ kind: 'steer', axis: 'yaw', direction: 1 });
    expect(TEST_BINDINGS.resolve('KeyL', mods(), 'map')).toBeNull();
    expect(TEST_BINDINGS.resolve('Space', mods(), 'map')).toBeNull();
    expect(TEST_BINDINGS.resolve('Space', mods(), null)).toBeNull();
    expect(TEST_BINDINGS.bound('Space', mods())).toBe(true);
    expect(TEST_BINDINGS.bound('Space', mods({ shift: true }))).toBe(false);
    expect(TEST_BINDINGS.bound('KeyZ', mods())).toBe(false);
  });

  it.each(['toString', '__proto__', 'constructor', ''])('finds nothing for the code %j', code => {
    for (const context of INPUT_CONTEXTS) expect(TEST_BINDINGS.resolve(code, mods(), context)).toBeNull();
    expect(TEST_BINDINGS.bound(code, mods())).toBe(false);
  });

  it('has no conflicts in the test table', () => {
    expect(findBindingConflicts(TEST_BINDING_ENTRIES)).toEqual([]);
  });

  it.each([
    ['the same modifiers', entry({}), entry({ action: { kind: 'gap', gap: 'G-09' } }), ['flight']],
    ['an any-Shift rule', entry({ shift: 'any', contexts: ['flight', 'base'] }), entry({ shift: true, contexts: ['base', 'map'] }), ['base']],
    ['an any-Ctrl steering key', entry({ code: 'KeyJ', ctrl: 'any', action: { kind: 'steer', axis: 'yaw', direction: -1 } }),
      entry({ code: 'KeyJ', ctrl: true, action: { kind: 'steer', axis: 'roll', direction: -1 } }), ['flight']],
    ['an any-NumLock keypad key', entry({ code: 'Numpad1' }), entry({ code: 'Numpad1', numLock: true }), ['flight']],
  ] as const)('reports and refuses competing bindings with %s', (_name, a, b, contexts) => {
    expect(findBindingConflicts([a, b])).toEqual([{ code: a.code, contexts, bindings: [a, b] }]);
    expect(() => createBindingTable([a, b])).toThrow(/conflict/);
  });

  it('accepts bindings told apart by code, context, Shift, Ctrl or NumLock', () => {
    const apart = [
      entry({}), entry({ code: 'KeyF' }), entry({ contexts: ['base'] }), entry({ shift: true }), entry({ ctrl: true }),
      entry({ code: 'Numpad1', numLock: false }), entry({ code: 'Numpad1', numLock: true }),
    ];
    expect(findBindingConflicts(apart)).toEqual([]);
    expect(createBindingTable(apart).bindings).toHaveLength(apart.length);
  });

  it.each([
    ['an empty code', entry({ code: '' }), /code/],
    ['no context', entry({ contexts: [] }), /contexts/],
    ['a repeated context', entry({ contexts: ['flight', 'flight'] }), /contexts/],
    ['an unknown context', entry({ contexts: ['menu' as 'map'] }), /contexts/],
    ['steering in map', entry({ contexts: ['flight', 'map'], action: { kind: 'steer', axis: 'yaw', direction: 1 } }), /steer acts only in flight, warp/],
    ['steering in base', entry({ contexts: ['base'], action: { kind: 'steer', axis: 'pitch', direction: 1 } }), /steer/],
    ['primary fire in warp', entry({ code: 'AltLeft', contexts: ['flight', 'warp'], action: { kind: 'primary-fire' } }), /primary-fire acts only in flight/],
    ['a repeating steering key', entry({ repeatable: true, action: { kind: 'steer', axis: 'pitch', direction: 1 } }), /repeat/],
    ['a repeating session control', entry({ repeatable: true, action: { kind: 'session', control: 'toggle-pause' } }), /repeat/],
  ] as const)('refuses %s', (_name, binding, message) => {
    expect(() => createBindingTable([binding])).toThrow(message);
  });
});
