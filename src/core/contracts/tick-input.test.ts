import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { CoreInputError } from '../errors.ts';
import { CORE_LIMITS } from './limits.ts';
import { COMMAND_TYPES, readTickInput, type Command, type TickInput } from './tick-input.ts';

const ZERO_AXES = { pitch: 0, yaw: 0, roll: 0 };

/** Every distinct command of the spec's command table, written out independently of the module under test. */
const ALL_COMMANDS: readonly Command[] = [
  { type: 'fire', channel: 'primary' },
  { type: 'fire', channel: 'secondary' },
  ...(['increase', 'decrease', 'zero', 'maximum', 'match-target', 'toggle-auto-match'] as const).map((operation) => ({ type: 'speed', operation }) as const),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => ({ type: 'select-number', value }) as const),
  { type: 'navigate-selection', direction: 'previous' },
  { type: 'navigate-selection', direction: 'next' },
  { type: 'confirm-selection' },
  ...(['enemy', 'friendly', 'next', 'previous', 'forward'] as const).map((operation) => ({ type: 'target', operation }) as const),
  { type: 'cycle-main-weapon' },
  { type: 'select-missile', direction: 'previous' },
  { type: 'select-missile', direction: 'next' },
  { type: 'toggle-map' },
  { type: 'map-point', operation: 'hover', right: 0, down: 1 },
  { type: 'map-point', operation: 'select', right: 0.25, down: 0.75 },
  { type: 'request-warp' },
  { type: 'communications', operation: 'open' },
  { type: 'communications', operation: 'close' },
  { type: 'launch' },
  ...(['open', 'shield-increase', 'shield-decrease', 'gun-increase', 'gun-decrease'] as const).map((operation) => ({ type: 'energy', operation }) as const),
  { type: 'damage-report' },
  { type: 'cockpit-front' },
];

const tick = (commands: readonly unknown[], axes: unknown = ZERO_AXES): unknown => ({ axes, commands });

function expectInputError(input: unknown, path: string, reason: string): void {
  let thrown: unknown;
  try {
    readTickInput(input);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(CoreInputError);
  expect(thrown).toMatchObject({ path, reason });
}

/** Wraps plain objects and arrays in Proxies that log every property access, so tests can count reads. */
function tracked<T>(value: T, log: string[], path = 'input'): T {
  if (typeof value !== 'object' || value === null) return value;
  const target = (Array.isArray(value) ? value.map((item, index) => tracked(item, log, `${path}[${index}]`))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, tracked(item, log, `${path}.${key}`)]))) as object;
  return new Proxy(target, {
    get(object, key, receiver) {
      log.push(`get ${path}.${String(key)}`);
      return Reflect.get(object, key, receiver);
    },
    getOwnPropertyDescriptor(object, key) {
      log.push(`read ${path}.${String(key)}`);
      return Reflect.getOwnPropertyDescriptor(object, key);
    },
  }) as T;
}

describe('readTickInput (P3-02 AC-04, 输入与命令)', () => {
  it('accepts every command of the closed union and covers each command type', () => {
    expect(new Set(ALL_COMMANDS.map((command) => command.type))).toEqual(new Set(COMMAND_TYPES));
    expect(COMMAND_TYPES).toHaveLength(16);
    // 42 distinct commands, counting map-point once per operation; all fit into one tick.
    expect(ALL_COMMANDS).toHaveLength(42);
    expect(CORE_LIMITS.commandsPerTick).toBeGreaterThanOrEqual(ALL_COMMANDS.length);
    const read = readTickInput(tick(ALL_COMMANDS, { pitch: -1, yaw: 0.5, roll: 1 }));
    expect(read).toEqual({ axes: { pitch: -1, yaw: 0.5, roll: 1 }, commands: ALL_COMMANDS });
  });

  it('returns a deeply frozen copy, detached from the caller, with canonical field order', () => {
    const map = { down: 0.5, right: 0.125, operation: 'select', type: 'map-point' };
    const input = { commands: [map, { channel: 'primary', type: 'fire' }], axes: { roll: 0.25, yaw: -0.5, pitch: 1 } };
    const read = readTickInput(input);
    expect(deepFrozen(read)).toBe(true);
    expect(read).not.toBe(input);
    expect(read.commands[0]).not.toBe(map);
    expect(Object.keys(read)).toEqual(['axes', 'commands']);
    expect(Object.keys(read.axes)).toEqual(['pitch', 'yaw', 'roll']);
    expect(Object.keys(read.commands[0])).toEqual(['type', 'operation', 'right', 'down']);
    map.right = 0.75;
    input.axes.pitch = 0;
    input.commands.push({ channel: 'secondary', type: 'fire' });
    expect(read.commands).toHaveLength(2);
    expect(read.commands[0]).toEqual({ type: 'map-point', operation: 'select', right: 0.125, down: 0.5 });
    expect(read.axes.pitch).toBe(1);
  });

  it('gives equal actions from differently built sources equal records, with -0 as 0', () => {
    const first = readTickInput({ axes: { pitch: -0, yaw: 0, roll: -0 }, commands: [{ type: 'map-point', operation: 'hover', right: -0, down: 0 }] });
    const second = readTickInput(JSON.parse('{"commands":[{"down":0,"right":0,"operation":"hover","type":"map-point"}],"axes":{"roll":0,"yaw":0,"pitch":0}}'));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(Object.is(first.axes.pitch, 0)).toBe(true);
    expect(Object.is(first.axes.roll, 0)).toBe(true);
    expect(Object.is((first.commands[0] as Extract<Command, { type: 'map-point' }>).right, 0)).toBe(true);
  });

  it('accepts null-prototype records and an empty command list', () => {
    const axes = Object.assign(Object.create(null) as object, ZERO_AXES);
    expect(readTickInput(tick([], axes))).toEqual({ axes: ZERO_AXES, commands: [] });
  });

  it('reads every caller value exactly once, through descriptors, and runs no accessor', () => {
    const log: string[] = [];
    const input = tracked({ axes: { pitch: 0.5, yaw: 0, roll: 0 }, commands: [{ type: 'select-number', value: 3 }, { type: 'launch' }] }, log);
    expect(readTickInput(input)).toEqual({ axes: { pitch: 0.5, yaw: 0, roll: 0 }, commands: [{ type: 'select-number', value: 3 }, { type: 'launch' }] });
    // An array's length is its only value read with [[Get]].
    expect(log.filter((entry) => entry.startsWith('get ') && !entry.endsWith('.length'))).toEqual([]);
    expect(log.length).toBe(new Set(log).size);
    for (const field of ['input.axes', 'input.commands', 'input.axes.pitch', 'input.commands.0', 'input.commands[0].type', 'input.commands[0].value', 'input.commands[1].type']) {
      expect(log.filter((entry) => entry.endsWith(` ${field}`)), field).toHaveLength(1);
    }
    expect(log.filter((entry) => entry === 'get input.commands.length')).toHaveLength(1);
  });

  it('rejects an accessor without running it', () => {
    let ran = false;
    const axes = { yaw: 0, roll: 0, get pitch() { ran = true; return 0; } };
    expectInputError(tick([], axes), 'tickInput.axes', 'must contain only enumerable data fields');
    const commands: unknown[] = [];
    Object.defineProperty(commands, 0, { enumerable: true, get: () => { ran = true; return { type: 'launch' }; } });
    expectInputError(tick(commands), 'tickInput.commands[0]', 'must be a data element');
    expect(ran).toBe(false);
  });

  it(`accepts exactly ${CORE_LIMITS.commandsPerTick} commands and rejects one more before reading any`, () => {
    const commands = Array.from({ length: CORE_LIMITS.commandsPerTick }, () => ({ type: 'fire', channel: 'primary' }));
    expect(readTickInput(tick(commands)).commands).toHaveLength(CORE_LIMITS.commandsPerTick);
    const log: string[] = [];
    const tooMany = tracked([...commands, { type: 'launch' }], log, 'commands');
    expectInputError(tick(tooMany), 'tickInput.commands', `must have at most ${CORE_LIMITS.commandsPerTick} items`);
    expect(log).toEqual(['get commands.length']);
  });

  it('checks a huge list by length alone', () => {
    const huge = new Proxy(new Array(2 ** 31), {
      ownKeys: () => { throw new Error('enumerated an oversized list'); },
      getOwnPropertyDescriptor: () => { throw new Error('read an oversized list'); },
    });
    expectInputError(tick(huge), 'tickInput.commands', `must have at most ${CORE_LIMITS.commandsPerTick} items`);
  });

  it.each([
    ['not an object', null, 'tickInput', 'must be a plain object'],
    ['an array', [], 'tickInput', 'must be a plain object'],
    ['a class instance', new (class { axes = ZERO_AXES; commands = []; })(), 'tickInput', 'must be a plain object'],
    ['an inherited field', Object.assign(Object.create({ axes: ZERO_AXES }) as object, { commands: [] }), 'tickInput', 'must be a plain object'],
    ['a missing field', { axes: ZERO_AXES }, 'tickInput.commands', 'is required'],
    ['an extra field', { axes: ZERO_AXES, commands: [], unknownField: 1 }, 'tickInput', 'contains unknown fields'],
    ['a symbol key', { axes: ZERO_AXES, [Symbol('extra')]: 1 }, 'tickInput', 'must contain only enumerable data fields'],
    ['a non-enumerable field', Object.defineProperty({ axes: ZERO_AXES }, 'commands', { value: [] }), 'tickInput', 'must contain only enumerable data fields'],
    ['missing axes', tick([], { pitch: 0, yaw: 0 }), 'tickInput.axes.roll', 'is required'],
    ['an extra axis', tick([], { ...ZERO_AXES, strafe: 0 }), 'tickInput.axes', 'contains unknown fields'],
    ['a non-object command list', tick({ 0: { type: 'launch' } } as unknown as unknown[]), 'tickInput.commands', 'must be an array'],
    ['an Array subclass', tick(new (class extends Array {})()), 'tickInput.commands', 'must be an array'],
    // eslint-disable-next-line no-sparse-arrays
    ['a sparse command list', tick([{ type: 'launch' }, , { type: 'launch' }]), 'tickInput.commands', 'must be a dense array without extra fields'],
    ['an array with an extra field', tick(Object.assign([{ type: 'launch' }], { extra: 1 })), 'tickInput.commands', 'must be a dense array without extra fields'],
    ['a non-object command', tick(['launch']), 'tickInput.commands[0]', 'must be a plain object'],
    ['a command without type', tick([{ channel: 'primary' }]), 'tickInput.commands[0].type', 'is required'],
    ['a command with too many fields', tick([{ type: 'map-point', operation: 'hover', right: 0, down: 0, extra: 0 }]), 'tickInput.commands[0]', 'contains unknown fields'],
    ['a field of another variant', tick([{ type: 'confirm-selection', value: 1 }]), 'tickInput.commands[0]', 'contains unknown fields'],
    ['a missing command field', tick([{ type: 'fire' }]), 'tickInput.commands[0].channel', 'is required'],
    ['a misplaced command field', tick([{ type: 'fire', operation: 'increase' }]), 'tickInput.commands[0].channel', 'is required'],
    ['a fire channel outside the union', tick([{ type: 'fire', channel: 'tertiary' }]), 'tickInput.commands[0].channel', 'must be one of primary, secondary'],
    ['a speed operation outside the union', tick([{ type: 'speed', operation: 'MAXIMUM' }]), 'tickInput.commands[0].operation', 'must be one of increase, decrease, zero, maximum, match-target, toggle-auto-match'],
    ['a target operation outside the union', tick([{ type: 'target', operation: 'nearest' }]), 'tickInput.commands[0].operation', 'must be one of enemy, friendly, next, previous, forward'],
    ['an energy operation outside the union', tick([{ type: 'energy', operation: 'close' }]), 'tickInput.commands[0].operation', 'must be one of open, shield-increase, shield-decrease, gun-increase, gun-decrease'],
    ['a direction outside the union', tick([{ type: 'select-missile', direction: 1 }]), 'tickInput.commands[0].direction', 'must be one of previous, next'],
    ['a communications operation outside the union', tick([{ type: 'communications', operation: 'toggle' }]), 'tickInput.commands[0].operation', 'must be one of open, close'],
    ['a map-point operation outside the union', tick([{ type: 'map-point', operation: 'drag', right: 0, down: 0 }]), 'tickInput.commands[0].operation', 'must be one of hover, select'],
    ['an error in a later command', tick([{ type: 'launch' }, { type: 'launch', extra: true }]), 'tickInput.commands[1]', 'contains unknown fields'],
  ])('rejects %s', (_, input, path, reason) => {
    expectInputError(input, path, reason);
  });

  it.each(['warp', 'FIRE', '', 'toString', 'constructor', '__proto__', 'hasOwnProperty', 1, null, true])('rejects the unknown command type %j', (type) => {
    expectInputError(tick([{ type }]), 'tickInput.commands[0].type', 'must be a known command type');
  });

  it.each([Number.NaN, Infinity, -Infinity, 1.0001, -1.5, '0', null, true, 2 ** 53])('rejects the axis value %s', (value) => {
    for (const axis of ['pitch', 'yaw', 'roll']) {
      expectInputError(tick([], { ...ZERO_AXES, [axis]: value }), `tickInput.axes.${axis}`, 'must be a number from -1 to 1');
    }
  });

  it.each([0, 10, -0, 1.5, Number.NaN, Infinity, '1', null])('rejects the selection number %s', (value) => {
    expectInputError(tick([{ type: 'select-number', value }]), 'tickInput.commands[0].value', 'must be an integer from 1 to 9');
  });

  it.each([-0.001, 1.001, Number.NaN, Infinity, -Infinity, '0.5', null])('rejects the map fraction %s', (value) => {
    expectInputError(tick([{ type: 'map-point', operation: 'hover', right: value, down: 0 }]), 'tickInput.commands[0].right', 'must be a number from 0 to 1');
    expectInputError(tick([{ type: 'map-point', operation: 'hover', right: 0, down: value }]), 'tickInput.commands[0].down', 'must be a number from 0 to 1');
  });

  it('never echoes unknown keys or values in errors', () => {
    try {
      readTickInput({ axes: ZERO_AXES, commands: [], privateName: 'Secret' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toMatch(/privateName|Secret/);
    }
  });
});

function checkTypes(input: TickInput) {
  const valid: Command[] = [{ type: 'select-number', value: 3 }, { type: 'confirm-selection' }, { type: 'map-point', operation: 'select', right: 0, down: 1 }];
  // @ts-expect-error Each variant requires its own fields.
  const missing: Command = { type: 'fire' };
  // @ts-expect-error A variant accepts no field of another variant.
  const foreign: Command = { type: 'confirm-selection', value: 1 };
  // @ts-expect-error Choices are closed.
  const choice: Command = { type: 'fire', channel: 'tertiary' };
  // @ts-expect-error The result is read-only.
  input.axes.pitch = 1;
  return [valid, missing, foreign, choice];
}
void checkTypes;
