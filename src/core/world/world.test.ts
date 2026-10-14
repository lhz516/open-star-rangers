import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import { COMMAND_TYPES, type Command } from '../contracts/tick-input.ts';
import { CoreFaultError, CoreInputError } from '../errors.ts';
import { EntityTable } from './entity-table.ts';
import { initialPlayerControl, initialPlayerTargeting } from './player-state.ts';
import { constructWorld } from './world.ts';
import { entityInit, expectFault, stateText, testConfig, testState, thrownBy, tickInput } from './world.test-support.ts';
import type { WorldState } from './world-state.ts';

const MAX = Number.MAX_SAFE_INTEGER;

/** One valid command of every type. */
const EVERY_COMMAND = [
  { type: 'fire', channel: 'secondary' },
  { type: 'speed', operation: 'match-target' },
  { type: 'speed-preset', level: 1 },
  { type: 'select-number', value: 9 },
  { type: 'navigate-selection', direction: 'next' },
  { type: 'confirm-selection' },
  { type: 'target', operation: 'forward' },
  { type: 'cycle-main-weapon' },
  { type: 'select-missile', direction: 'previous' },
  { type: 'toggle-map' },
  { type: 'map-point', operation: 'select', right: 0.25, down: 1 },
  { type: 'request-warp' },
  { type: 'communications', operation: 'open' },
  { type: 'launch' },
  { type: 'energy', operation: 'gun-decrease' },
  { type: 'damage-report' },
  { type: 'cockpit-front' },
] as const;

/** A state with a player and entities in several lifecycle states, as if instantiated by world creation. */
function populatedState(overrides: Parameters<typeof testState>[0] = {}): WorldState {
  const state = testState(overrides);
  const player = state.entities.allocate(entityInit(0));
  state.player.entityId = player.id;
  state.player.control = initialPlayerControl(state.config.group);
  state.player.targeting = initialPlayerTargeting();
  state.entities.allocate(entityInit(7, { activity: 'parked' }));
  state.entities.allocate(entityInit(7)).state = 'active';
  return state;
}

class TableAt extends EntityTable {
  readonly #nextId: number;

  constructor(nextId: number) {
    super();
    this.#nextId = nextId;
  }

  override get nextId(): number {
    return this.#nextId;
  }
}

describe('world step (P3-02 AC-03, AC-04)', () => {
  it.each([2, 4])('advances the tick by 1 and the clock by %i units per step', (units) => {
    const world = constructWorld(testState({ clockUnitsPerTick: units }));
    expect(world.projection().clock).toEqual({ tick: 0, clock: 0, clockUnitsPerTick: units });
    for (let tick = 1; tick <= 3; tick++) {
      world.step(tickInput());
      expect(world.projection().clock).toEqual({ tick, clock: tick * units, clockUnitsPerTick: units });
      expect(world.renderState().tick).toBe(tick);
    }
  });

  it('has no way to advance time other than step()', () => {
    const world = constructWorld(testState());
    expect(Object.keys(world)).toEqual([]);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(world)).sort()).toEqual(['constructor', 'projection', 'renderState', 'snapshot', 'step']);
  });

  it('gives every valid command exactly one result in order, rejected/not-implemented without a rule, and changes nothing else', () => {
    expect(new Set(EVERY_COMMAND.map(({ type }) => type))).toEqual(new Set(COMMAND_TYPES));
    const commands: Command[] = [...EVERY_COMMAND, { type: 'launch' }, { type: 'fire', channel: 'primary' }];
    const commanded = populatedState();
    const idle = populatedState();
    const events = constructWorld(commanded).step(tickInput(commands));
    constructWorld(idle).step(tickInput());
    // P3-06 handles the speed commands and presets, select-number and confirm-selection in flight, P3-07 the target,
    // weapon, energy and damage-report commands, P3-09 toggle-map, and the player becomes active only in this step's
    // request handling.
    const unavailable = new Set<Command['type']>([
      'speed', 'speed-preset', 'select-number', 'confirm-selection', 'target', 'fire', 'cycle-main-weapon', 'select-missile', 'energy', 'damage-report',
      'toggle-map',
    ]);
    expect(events).toEqual(commands.map(({ type }, commandIndex) => ({
      type: 'command-result',
      tick: 1,
      commandIndex,
      commandType: type,
      ...(unavailable.has(type) ? { outcome: 'ignored', reason: 'player-unavailable' } : { outcome: 'rejected', reason: 'not-implemented' }),
    })));
    expect(deepFrozen(events)).toBe(true);
    expect(stateText(commanded)).toBe(stateText(idle));
  });

  it('keeps no command across ticks and stamps events with their step number', () => {
    const world = constructWorld(testState());
    expect(world.step(tickInput([{ type: 'launch' }])).map(({ tick }) => tick)).toEqual([1]);
    expect(world.step(tickInput())).toEqual([]);
    expect(world.step(tickInput([{ type: 'launch' }, { type: 'launch' }])).map(({ tick }) => tick)).toEqual([3, 3]);
  });

  it.each([
    ['a missing field', { commands: [] }],
    ['a non-finite axis', { axes: { pitch: Number.NaN, yaw: 0, roll: 0 }, commands: [] }],
    ['an unknown command', { axes: { pitch: 0, yaw: 0, roll: 0 }, commands: [{ type: 'self-destruct' }] }],
    ['a sparse command list', { axes: { pitch: 0, yaw: 0, roll: 0 }, commands: Object.assign([], { 0: { type: 'launch' }, 2: { type: 'launch' } }) }],
    ['too many commands', tickInput(Array.from({ length: CORE_LIMITS.commandsPerTick + 1 }, () => ({ type: 'launch' })))],
  ])('rejects %s without changing the world and keeps working', (_, input) => {
    const state = populatedState();
    const world = constructWorld(state);
    const before = stateText(state);
    expect(thrownBy(() => world.step(input as never))).toBeInstanceOf(CoreInputError);
    expect(stateText(state)).toBe(before);
    expect(world.step(tickInput()).length).toBe(0);
    expect(world.projection().clock.tick).toBe(1);
  });

  it.each([
    ['tick', { tick: MAX }],
    ['clock', { clock: MAX - 1 }],
  ])('rejects a step that would pass the safe %s range before any change', (_, time) => {
    const state = Object.assign(populatedState(), time);
    const before = stateText(state);
    expect(thrownBy(() => constructWorld(state).step(tickInput()))).toBeInstanceOf(CoreInputError);
    expect(stateText(state)).toBe(before);
  });

  it('rejects a step whose entity allocations could pass the safe ID range before any change', () => {
    const far: WorldState = { ...testState(), entities: new TableAt(MAX - CORE_LIMITS.entities + 1) };
    expect(thrownBy(() => constructWorld(far).step(tickInput()))).toMatchObject({ path: 'tickInput', reason: 'would allocate entity IDs past the safe integer range' });
    expect(far.tick).toBe(0);
    const near: WorldState = { ...testState(), entities: new TableAt(MAX - CORE_LIMITS.entities) };
    constructWorld(near).step(tickInput());
    expect(near.tick).toBe(1);
  });
});

describe('fault latch (P3-02 AC-09, 行为与边界)', () => {
  it('latches a broken invariant: no events from that tick, and every later call throws the same fault', () => {
    const state = populatedState();
    state.entities.allocate(entityInit(9)).state = 'new';
    const world = constructWorld(state);
    const fault = expectFault(() => world.step(tickInput([{ type: 'launch' }])), 'invariant-violated', 'object-update.new');
    expect(thrownBy(() => world.step(tickInput()))).toBe(fault);
    expect(thrownBy(() => world.step({} as never))).toBe(fault);
    expect(thrownBy(() => world.projection())).toBe(fault);
    expect(thrownBy(() => world.renderState())).toBe(fault);
    expect(thrownBy(() => world.snapshot())).toBe(fault);
  });

  it.each([
    ['a clock outside its contract', { clock: -2 }],
    ['a step outside its contract', { config: testConfig({ clockUnitsPerTick: 3 }) }],
  ])('latches %s found before the tick runs, changing nothing', (_, broken) => {
    const state = Object.assign(testState(), broken);
    const world = constructWorld(state);
    const before = stateText(state);
    const fault = expectFault(() => world.step(tickInput()), 'invariant-violated', 'time.advanceTime');
    expect(stateText(state)).toBe(before);
    expect(thrownBy(() => world.step(tickInput()))).toBe(fault);
    expect(thrownBy(() => world.projection())).toBe(fault);
    expect(thrownBy(() => world.renderState())).toBe(fault);
    expect(thrownBy(() => world.snapshot())).toBe(fault);
  });

  it('turns any other failure during a tick into a latched broken invariant at its site', () => {
    class BrokenWalk extends EntityTable {
      // eslint-disable-next-line require-yield
      override *walk(): Generator<never, void, undefined> {
        throw new TypeError('broken walk');
      }
    }
    const world = constructWorld({ ...testState(), entities: new BrokenWalk() });
    const fault = expectFault(() => world.step(tickInput()), 'invariant-violated', 'world.step');
    expect(fault.cause).toBeInstanceOf(TypeError);
    expect(thrownBy(() => world.projection())).toBe(fault);
  });

  it.each([
    ['projection', 'missionStatus'],
    ['renderState', 'tick'],
    ['snapshot', 'clock'],
  ] as const)('latches a failure while reading the %s', (method, field) => {
    const state = testState();
    const world = constructWorld(state);
    Object.defineProperty(state, field, { get: () => { throw new RangeError('broken state'); } });
    const fault = expectFault(() => world[method](), 'invariant-violated', `world.${method}`);
    expect(thrownBy(() => world.step(tickInput()))).toBe(fault);
  });

  it('is a CoreFaultError, never a CoreInputError', () => {
    const state = testState();
    state.entities.allocate(entityInit(1)).state = 'new';
    const error = thrownBy(() => constructWorld(state).step(tickInput()));
    expect(error).toBeInstanceOf(CoreFaultError);
    expect(error).not.toBeInstanceOf(CoreInputError);
  });
});

describe('world reads (P3-02 AC-10)', () => {
  it('change nothing in the world', () => {
    const state = populatedState();
    const world = constructWorld(state);
    world.step(tickInput());
    const before = stateText(state);
    world.projection();
    world.renderState();
    world.snapshot();
    world.projection();
    expect(stateText(state)).toBe(before);
  });

  it('return deeply frozen data that later ticks never change', () => {
    const state = populatedState();
    const world = constructWorld(state);
    const events = world.step(tickInput([{ type: 'launch' }]));
    const outputs = [events, world.projection(), world.renderState(), world.snapshot()];
    const texts = outputs.map((output) => JSON.stringify(output));
    for (const output of outputs) expect(deepFrozen(output)).toBe(true);

    const player = state.entities.get(state.player.entityId!)!;
    player.position = { x: 50, y: 60, z: 70 };
    player.placementSerial += 1;
    state.player.viewMode = 8;
    state.entities.get(3)!.state = 'pending-removal';
    world.step(tickInput([{ type: 'toggle-map' }]));
    world.step(tickInput());

    expect(outputs.map((output) => JSON.stringify(output))).toEqual(texts);
    expect(world.renderState()).not.toEqual(outputs[2]);
  });

  it('return a new copy on every call', () => {
    const world = constructWorld(populatedState());
    const [first, second] = [world.renderState(), world.renderState()];
    expect(second).toEqual(first);
    expect(second.entities[0]).not.toBe(first.entities[0]);
    expect(second.entities[0].position).not.toBe(first.entities[0].position);
  });
});
