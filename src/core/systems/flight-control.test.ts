import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { readTickInput, type Command, type TickAxes } from '../contracts/tick-input.ts';
import { RandStream } from '../rules/original-random.ts';
import type { Entity, ObjectState } from '../world/entity-table.ts';
import { initialPlayerControl } from '../world/player-state.ts';
import { constructWorld } from '../world/world.ts';
import { entityInit, expectFault, testState } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { availablePlayer, updatePlayer, type ControlRequest } from './flight-control.ts';
import { PIPELINE, registerTick, type TickContext } from './pipeline.ts';

// Expectations are written out from docs/plan/p3/06/spec.md (操纵, 速度与油门, 行为与边界; checkpoint A) and the original
// rules in docs/original/formats/executable.md (P3-06/02 and 03). The test player has maximum speed 48 and the synthetic
// craft record 0: turn rates 0.75 (pitch, +0xAC), 0.25 (yaw, +0xB4) and 0.5 (roll, +0xB0). Throttle t commands
// (t >> 1) / 64 × 48 = 0.75 × (t >> 1).

const NEUTRAL: TickAxes = Object.freeze({ pitch: 0, yaw: 0, roll: 0 });
const FLIGHT = 0x0c;
const WARP = 1;
const BASE = 6;
const MAP = 8;

/** A drained world with an available player at full throttle (commanded speed 48), its assist off. */
function withPlayer(): [WorldState, Entity] {
  const state = testState({ group: 1 });
  const player = state.entities.allocate(entityInit(0));
  player.state = 'active';
  state.player.entityId = player.id;
  state.player.control = initialPlayerControl(1);
  return [state, player];
}

const input = (commands: readonly Command[] = [], axes: TickAxes = NEUTRAL) => readTickInput({ axes: { ...axes }, commands: [...commands] });

/** Runs one tick's real stages up to request handling, so that movement does not blur what the controls wrote. */
function stepControls(state: WorldState, commands: readonly Command[] = [], axes: TickAxes = NEUTRAL, hooks: Readonly<Record<string, (context: TickContext) => void>> = {}): readonly DomainEvent[] {
  const context = registerTick(state, input(commands, axes));
  for (const stage of PIPELINE) {
    if (stage.id === 'movement') break;
    hooks[stage.id]?.(context);
    stage.run?.(context);
  }
  return context.events;
}

/** The player's update alone: its events and the requests it posts. */
function update(state: WorldState, commands: readonly Command[] = [], axes: TickAxes = NEUTRAL): { events: DomainEvent[]; requests: ControlRequest[] } {
  const events: DomainEvent[] = [];
  const requests: ControlRequest[] = [];
  updatePlayer(state, input(commands, axes), state.tick + 1, { emit: (event) => events.push(event), post: (request) => requests.push(request) });
  return { events, requests };
}

const speed = (operation: 'increase' | 'decrease' | 'zero' | 'maximum' | 'match-target' | 'toggle-auto-match'): Command => ({ type: 'speed', operation });
const preset = (value: number): Command => ({ type: 'select-number', value });
const results = (events: readonly DomainEvent[]) => events.flatMap((event) => (event.type === 'command-result' ? [[event.commandIndex, event.outcome, event.reason]] : []));
const steering = ({ movement }: Entity) => {
  const { pitch, yaw, roll } = movement!.steering;
  return { pitch: { ...pitch }, yaw: { ...yaw }, roll: { ...roll } };
};
const axesOf = (pitch: number | null, yaw: number | null, roll: number | null) => ({ pitch, yaw, roll });

describe('throttle commands (P3-06 AC-04, 速度与油门)', () => {
  it('gives each speed operation and preset one accepted result at its own index', () => {
    const [state] = withPlayer();
    const commands = [speed('increase'), speed('decrease'), speed('zero'), speed('maximum'), ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(preset)];
    const events = stepControls(state, commands);
    expect(events).toEqual(commands.map((command, commandIndex) => ({ type: 'command-result', tick: 1, commandIndex, commandType: command.type, outcome: 'accepted', reason: null })));
  });

  it.each<[string, Command, number]>([
    ['increase', speed('increase'), 48],
    ['decrease', speed('decrease'), 43.5],
    ['zero', speed('zero'), 0],
    ['maximum', speed('maximum'), 48],
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value): [string, Command, number] => [`select-number ${value} (Shift+${value})`, preset(value), 5.25 * (value - 1)]),
  ])('sets %s from full throttle as commanded speed %d and clears the arrival', (_, command, commanded) => {
    const [state, player] = withPlayer();
    const before = player.movement!.speed;
    stepControls(state, [command]);
    expect([player.movement!.commandedSpeed, player.movement!.atCommandedSpeed, player.movement!.speed]).toEqual([commanded, false, before]);
  });

  it('keeps no throttle: each request carries its own, and nothing persists but the commanded speed', () => {
    const [state, player] = withPlayer();
    expect(update(state, [speed('decrease'), preset(3)]).requests.map(({ throttle }) => throttle)).toEqual([116, 28]);
    expect(Object.keys(state.player.control!)).toEqual(['lastAxes', 'speedAssist']);
    stepControls(state, [speed('decrease')]);
    expect(player.movement!.commandedSpeed).toBe(43.5);
    // The next tick reads the throttle back from the commanded speed: 116 − 12.
    expect(update(state, [speed('decrease')]).requests[0].throttle).toBe(104);
  });

  it('reads back a matched commanded speed as its ratio', () => {
    for (const [operation, throttle, commanded] of [['increase', 92, 34.5], ['decrease', 68, 25.5]] as const) {
      const [state, player] = withPlayer();
      player.movement!.commandedSpeed = 30;
      expect(update(state, [speed(operation)]).requests[0].throttle).toBe(throttle);
      stepControls(state, [speed(operation)]);
      expect(player.movement!.commandedSpeed).toBe(commanded);
    }
  });

  it('clamps the table index of a readback above full throttle after a lowered maximum', () => {
    const [state, player] = withPlayer();
    player.maximumSpeed = 24;
    expect(update(state, [speed('decrease'), speed('increase')]).requests.map(({ throttle }) => throttle)).toEqual([244, 128]);
    stepControls(state, [speed('decrease')]);
    expect(player.movement!.commandedSpeed).toBe(24);
  });

  it('judges same-tick commands in array order, each reading back what the requests before it leave', () => {
    const cases = [
      [24, [speed('increase'), speed('increase')], [76, 88], 33],
      [48, [speed('decrease'), speed('zero'), speed('increase')], [116, 0, 12], 4.5],
      [48, [speed('zero'), speed('decrease'), preset(9), speed('increase')], [0, 0, 112, 124], 46.5],
    ] as const;
    for (const [start, commands, throttles, commanded] of cases) {
      const [state, player] = withPlayer();
      player.movement!.commandedSpeed = start;
      expect(update(state, commands).requests.map(({ throttle }) => throttle)).toEqual(throttles);
      stepControls(state, commands);
      expect(player.movement!.commandedSpeed).toBe(commanded);
    }
  });

  it('accepts commands on a locked block, which drops their requests, so later ones read back the unchanged speed', () => {
    const [state, player] = withPlayer();
    Object.assign(player.movement!, { commandedSpeed: 24, atCommandedSpeed: true, locked: true });
    const commands = [speed('increase'), speed('increase')];
    expect(update(state, commands).requests.map(({ throttle }) => throttle)).toEqual([76, 76]);
    const events = stepControls(state, commands);
    expect(results(events)).toEqual([[0, 'accepted', null], [1, 'accepted', null]]);
    expect([player.movement!.commandedSpeed, player.movement!.atCommandedSpeed]).toEqual([24, true]);
  });

  it('keeps no command across ticks: a later tick without commands posts and reports nothing', () => {
    const [state, player] = withPlayer();
    stepControls(state, [speed('zero')]);
    player.movement!.commandedSpeed = 30;
    expect(update(state)).toEqual({ events: [], requests: [] });
    expect(stepControls(state)).toEqual([]);
    expect(player.movement!.commandedSpeed).toBe(30);
  });
});

describe('command results (P3-06 AC-04, 行为与边界)', () => {
  const THROTTLE_COMMANDS = [speed('increase'), speed('decrease'), speed('zero'), speed('maximum'), preset(5)];
  const OTHERS = [speed('match-target'), speed('toggle-auto-match'), { type: 'confirm-selection' }, { type: 'launch' }] as const satisfies readonly Command[];

  type Unavailable = (state: WorldState, player: Entity) => void;
  const inState = (objectState: ObjectState): [string, Unavailable] => [`in state ${objectState}`, (_, player) => void (player.state = objectState)];

  it.each<[string, Unavailable]>([
    ['none', (state) => void (state.player.entityId = null)],
    ...(['presentation-ready', 'area-switch', 'pending-removal', 'destroyed-source'] as ObjectState[]).map(inState),
    ['destroyed', (_, player) => void (player.destroyed = true)],
  ])('ignores throttle commands as player-unavailable with a player %s, changing nothing', (_, make) => {
    const [state, player] = withPlayer();
    make(state, player);
    const block = structuredClone(player.movement);
    const rng = state.rngState;
    const events = stepControls(state, [...THROTTLE_COMMANDS, ...OTHERS], { pitch: 1, yaw: 1, roll: 1 });
    expect(results(events)).toEqual([
      ...THROTTLE_COMMANDS.map((_, index) => [index, 'ignored', 'player-unavailable']),
      ...OTHERS.map((_, index) => [THROTTLE_COMMANDS.length + index, 'rejected', 'not-implemented']),
    ]);
    expect(player.movement).toEqual(block);
    expect(state.player.control!.lastAxes).toEqual({ pitch: 0, yaw: 0, roll: 0 });
    expect(state.rngState).toBe(rng);
  });

  it.each([
    ['Warp', WARP, 'wrong-context'],
    ['base', BASE, 'not-implemented'],
    ['map', MAP, 'not-implemented'],
  ] as const)('ignores speed commands as wrong-context in the %s context; select-number there: %s', (_, viewMode, presetReason) => {
    const [state, player] = withPlayer();
    state.player.viewMode = viewMode;
    const events = stepControls(state, [...THROTTLE_COMMANDS, ...OTHERS]);
    expect(results(events)).toEqual([
      [0, 'ignored', 'wrong-context'],
      [1, 'ignored', 'wrong-context'],
      [2, 'ignored', 'wrong-context'],
      [3, 'ignored', 'wrong-context'],
      [4, presetReason === 'wrong-context' ? 'ignored' : 'rejected', presetReason],
      ...OTHERS.map((_, index) => [THROTTLE_COMMANDS.length + index, 'rejected', 'not-implemented']),
    ]);
    expect(player.movement!.commandedSpeed).toBe(48);
  });

  it('reports player-unavailable before wrong-context', () => {
    const [state] = withPlayer();
    state.player.viewMode = MAP;
    state.player.entityId = null;
    expect(results(stepControls(state, [speed('zero'), preset(1)]))).toEqual([[0, 'ignored', 'player-unavailable'], [1, 'rejected', 'not-implemented']]);
  });

  it('leaves the speed match, the assist toggle and every other command not implemented in flight', () => {
    const [state, player] = withPlayer();
    expect(results(stepControls(state, OTHERS))).toEqual(OTHERS.map((_, index) => [index, 'rejected', 'not-implemented']));
    expect(player.movement!.commandedSpeed).toBe(48);
  });

  it('counts only an active, undestroyed player as available', () => {
    const [state, player] = withPlayer();
    expect(availablePlayer(state)).toBe(player);
    for (const objectState of ['new', 'presentation-ready', 'awaiting-presentation', 'destroyed-source', 'area-switch', 'pending-removal', 'projectile-hit'] as ObjectState[]) {
      player.state = objectState;
      expect(availablePlayer(state)).toBeNull();
    }
    player.state = 'active';
    player.activity = 'docked';
    expect(availablePlayer(state)).toBe(player);
  });
});

describe('axes (P3-06 AC-03, 操纵)', () => {
  it('maps the tick axes through the Medium table to rates about rows 1, 2 and 3', () => {
    const [state, player] = withPlayer();
    stepControls(state, [], { pitch: 0.5, yaw: 1, roll: -1 });
    // Deflections 64, 128, −128: entries −0.25, −1, +1.
    expect(steering(player)).toEqual({ pitch: { rate: -0.1875, enabled: true }, yaw: { rate: -0.25, enabled: true }, roll: { rate: 0.5, enabled: true } });
    expect(state.player.control!.lastAxes).toEqual({ pitch: 64, yaw: 128, roll: -128 });
  });

  it('truncates a non-integer deflection toward zero and takes one below a step as 0', () => {
    const [state, player] = withPlayer();
    expect(update(state, [], { pitch: 0.999, yaw: -0.3, roll: 0.005 }).requests).toEqual([{ type: 'control', entityId: player.id, throttle: null, axes: axesOf(127, -38, null) }]);
  });

  it('applies only the axes whose deflection changed, and nothing while none changes', () => {
    const [state, player] = withPlayer();
    const held = { pitch: 1, yaw: 0.5, roll: 0 };
    expect(update(state, [], held).requests.map(({ axes }) => axes)).toEqual([axesOf(128, 64, null)]);
    expect(update(state, [], held).requests).toEqual([]);
    expect(update(state, [], { ...held, yaw: -0.5 }).requests.map(({ axes }) => axes)).toEqual([axesOf(null, -64, null)]);
    // Applied once: a later change of the rate by another rule is not overwritten while the axis is held.
    stepControls(state, [], { ...held, yaw: -0.5 });
    player.movement!.steering.pitch.rate = 3;
    stepControls(state, [], { ...held, yaw: -0.5 });
    expect(player.movement!.steering.pitch.rate).toBe(3);
  });

  it('switches a released axis off in the same tick, keeping its rate', () => {
    const [state, player] = withPlayer();
    stepControls(state, [], { pitch: 0, yaw: 1, roll: 0 });
    stepControls(state, [], NEUTRAL);
    expect(steering(player).yaw).toEqual({ rate: -0.25, enabled: false });
    expect(state.player.control!.lastAxes.yaw).toBe(0);
  });

  it('updates the last read while a lock drops the request, as the original does', () => {
    const [state, player] = withPlayer();
    player.movement!.locked = true;
    stepControls(state, [], { pitch: 0, yaw: 1, roll: 0 });
    expect(state.player.control!.lastAxes.yaw).toBe(128);
    expect(steering(player).yaw).toEqual({ rate: 0, enabled: false });
    player.movement!.locked = false;
    expect(update(state, [], { pitch: 0, yaw: 1, roll: 0 }).requests).toEqual([]);
  });

  it.each([['map', MAP], ['base', BASE]] as const)('takes the manual axes as 0 in the %s context and restores nothing after it', (_, viewMode) => {
    const [state, player] = withPlayer();
    stepControls(state, [], { pitch: 0, yaw: 1, roll: 0 });
    const block = player.movement!;
    Object.assign(block, { commandedSpeed: 30, speed: 40, impulse: { direction: { x: 0, y: 0, z: 1 }, magnitude: 5 } });
    block.timedRotation.roll = { rate: 1, decay: 0.5, end: 9 };
    const independent = structuredClone({ commandedSpeed: block.commandedSpeed, speed: block.speed, impulse: block.impulse, timedRotation: block.timedRotation });

    state.player.viewMode = viewMode;
    stepControls(state, [], { pitch: 1, yaw: 1, roll: 0 });
    expect(state.player.control!.lastAxes).toEqual({ pitch: 0, yaw: 0, roll: 0 });
    expect(steering(player)).toEqual({ pitch: { rate: 0, enabled: false }, yaw: { rate: -0.25, enabled: false }, roll: { rate: 0, enabled: false } });
    expect({ commandedSpeed: block.commandedSpeed, speed: block.speed, impulse: block.impulse, timedRotation: block.timedRotation }).toEqual(independent);

    expect(update(state, [], { pitch: -1, yaw: 0.5, roll: 1 }).requests).toEqual([]);
    state.player.viewMode = FLIGHT;
    expect(update(state, [], NEUTRAL).requests).toEqual([]);
    expect(steering(player).yaw.enabled).toBe(false);
  });

  it('applies the axes in the Warp context', () => {
    const [state, player] = withPlayer();
    state.player.viewMode = WARP;
    stepControls(state, [], { pitch: -1, yaw: 0, roll: 0 });
    expect(steering(player).pitch).toEqual({ rate: 0.75, enabled: true });
  });

  it('leaves the last reads alone while the player is unavailable', () => {
    const [state, player] = withPlayer();
    player.state = 'presentation-ready';
    expect(update(state, [], { pitch: 1, yaw: 1, roll: 1 }).requests).toEqual([]);
    expect(state.player.control!.lastAxes).toEqual({ pitch: 0, yaw: 0, roll: 0 });
  });

  it('faults when an available player has no control state', () => {
    const [state] = withPlayer();
    state.player.control = null;
    expectFault(() => update(state), 'invariant-violated', 'flight-control.player-control');
  });
});

describe('control requests (P3-06 AC-03, AC-04; D-08)', () => {
  it('merges the axes into the last command request, or posts them alone', () => {
    const [state, player] = withPlayer();
    const id = player.id;
    expect(update(state, [speed('zero'), speed('maximum')], { pitch: 0, yaw: 1, roll: 0 }).requests).toEqual([
      { type: 'control', entityId: id, throttle: 0, axes: axesOf(null, null, null) },
      { type: 'control', entityId: id, throttle: 128, axes: axesOf(null, 128, null) },
    ]);
    expect(update(state, [], { pitch: 0, yaw: 0, roll: 0 }).requests).toEqual([{ type: 'control', entityId: id, throttle: null, axes: axesOf(null, 0, null) }]);
    expect(update(state, [speed('zero')]).requests).toEqual([{ type: 'control', entityId: id, throttle: 0, axes: axesOf(null, null, null) }]);
    expect(update(state).requests).toEqual([]);
  });

  it('applies requests in posting order with the values they were posted with', () => {
    const [state, player] = withPlayer();
    const late: ControlRequest = { type: 'control', entityId: player.id, throttle: 0, axes: axesOf(-128, null, null) };
    // Posted before the player's update (mission flow) and after it (spawn queue check).
    stepControls(state, [speed('maximum')], { pitch: 1, yaw: 0, roll: 0 }, { 'mission-flow': ({ requests }) => requests.post(late) });
    expect([player.movement!.commandedSpeed, steering(player).pitch.rate]).toEqual([48, -0.75]);
    stepControls(state, [speed('maximum')], { pitch: -1, yaw: 0, roll: 0 }, { 'spawn-queue-check': ({ requests }) => requests.post(late) });
    expect([player.movement!.commandedSpeed, steering(player).pitch.rate]).toEqual([0, 0.75]);
  });

  it('draws three times per applied request under a disturbance, only for accepted messages', () => {
    const [state, player] = withPlayer();
    player.movement!.disturbance = { level: 1 };
    const drawn = (count: number, from: number): number => {
      const rand = new RandStream(from);
      for (let draw = 0; draw < count; draw++) rand.next();
      return rand.state;
    };
    let rng = state.rngState;
    // A throttle-only request, then one request carrying a command's throttle and the axes: three draws each.
    stepControls(state, [speed('zero')]);
    expect(state.rngState).toBe((rng = drawn(3, rng)));
    stepControls(state, [speed('maximum')], { pitch: 1, yaw: 0, roll: 0 });
    expect(state.rngState).toBe((rng = drawn(3, rng)));
    // Two commands: two requests.
    stepControls(state, [speed('zero'), speed('maximum')], { pitch: 1, yaw: 0, roll: 0 });
    expect(state.rngState).toBe((rng = drawn(6, rng)));
    // Nothing changed, a lock, an unavailable player: no draw.
    stepControls(state, [], { pitch: 1, yaw: 0, roll: 0 });
    player.movement!.locked = true;
    stepControls(state, [speed('zero')], { pitch: 0, yaw: 1, roll: 0 });
    player.movement!.locked = false;
    player.destroyed = true;
    stepControls(state, [speed('zero')], { pitch: 0, yaw: 0, roll: 1 });
    expect(state.rngState).toBe(rng);
  });

  it('does nothing for a request whose entity has no block', () => {
    const [state, player] = withPlayer();
    const other = state.entities.allocate(entityInit(5, { activity: 'parked' }));
    const before = state.rngState;
    stepControls(state, [], NEUTRAL, { 'mission-flow': ({ requests }) => requests.post({ type: 'control', entityId: other.id, throttle: 0, axes: axesOf(128, 128, 128) }) });
    expect(other.movement).toBeNull();
    expect([state.rngState, player.movement!.commandedSpeed]).toEqual([before, 48]);
  });

  it('runs in the real world step: the commanded speed persists across ticks', () => {
    const [state, player] = withPlayer();
    const world = constructWorld(state);
    world.step(input([speed('zero')], { pitch: 0, yaw: -1, roll: 0 }));
    expect(player.movement!.commandedSpeed).toBe(0);
    expect(steering(player).yaw).toEqual({ rate: 0.25, enabled: true });
    world.step(input([speed('increase')]));
    expect(player.movement!.commandedSpeed).toBe(4.5);
    expect(steering(player).yaw).toEqual({ rate: 0.25, enabled: false });
  });
});
