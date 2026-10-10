import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { readTickInput, type Command, type TickAxes } from '../contracts/tick-input.ts';
import { RandStream } from '../rules/original-random.ts';
import type { Entity, ObjectState, SteeredMovementBlock } from '../world/entity-table.ts';
import { initialPlayerControl, initialPlayerTargeting, type PlayerTargeting } from '../world/player-state.ts';
import { constructWorld } from '../world/world.ts';
import { entityInit, expectFault, testState } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { availablePlayer, updatePlayer, type ControlRequest, type PlayerRequest } from './flight-control.ts';
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

/**
 * The player's targeting state (CR-04) with P3-07's automatic target selection not due in these tests, so that it
 * neither selects a target nor emits.
 */
const quietTargeting = (): PlayerTargeting => ({ ...initialPlayerTargeting(), autoTargetDueClock: 1e9 });

/** A drained world with an available player at full throttle (commanded speed 48), its assist off. */
function withPlayer(): [WorldState, Entity] {
  const state = testState({ group: 1 });
  const player = state.entities.allocate(entityInit(0));
  player.state = 'active';
  state.player.entityId = player.id;
  state.player.control = initialPlayerControl(1);
  state.player.targeting = quietTargeting();
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

/** The player's update alone: its events and the requests it posts, every command it hands on rejected/not-implemented. */
function update(state: WorldState, commands: readonly Command[] = [], axes: TickAxes = NEUTRAL): { events: DomainEvent[]; requests: PlayerRequest[] } {
  const events: DomainEvent[] = [];
  const requests: PlayerRequest[] = [];
  const tick = state.tick + 1;
  updatePlayer(state, input(commands, axes), tick, {
    emit: (event) => events.push(event),
    post: (request) => requests.push(request),
    judge: ({ type }, commandIndex) => events.push({ type: 'command-result', tick, commandIndex, commandType: type, outcome: 'rejected', reason: 'not-implemented' }),
    lockMissiles: () => {},
  });
  return { events, requests };
}

/** Each request's throttle, or the type of a request other than `control`. */
const throttles = ({ requests }: { requests: readonly PlayerRequest[] }) => requests.map((request) => (request.type === 'control' ? request.throttle : request.type));
/** Each request's axes, or the type of a request other than `control`. */
const requestAxes = ({ requests }: { requests: readonly PlayerRequest[] }) => requests.map((request) => (request.type === 'control' ? request.axes : request.type));

const speed = (operation: 'increase' | 'decrease' | 'zero' | 'maximum' | 'match-target' | 'toggle-auto-match'): Command => ({ type: 'speed', operation });
const preset = (value: number): Command => ({ type: 'select-number', value });
const results = (events: readonly DomainEvent[]) => events.flatMap((event) => (event.type === 'command-result' ? [[event.commandIndex, event.outcome, event.reason]] : []));
/** A craft's movement block, which is steered (P3-07 CR-03). */
const craftBlock = ({ movement }: Entity) => movement as SteeredMovementBlock;
const steering = (entity: Entity) => {
  const { pitch, yaw, roll } = craftBlock(entity).steering;
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
    const before = craftBlock(player).speed;
    stepControls(state, [command]);
    expect([craftBlock(player).commandedSpeed, craftBlock(player).atCommandedSpeed, craftBlock(player).speed]).toEqual([commanded, false, before]);
  });

  it('keeps no throttle: each request carries its own, and nothing persists but the commanded speed', () => {
    const [state, player] = withPlayer();
    expect(throttles(update(state, [speed('decrease'), preset(3)]))).toEqual([116, 28]);
    expect(Object.keys(state.player.control!)).toEqual(['lastAxes', 'speedAssist']);
    stepControls(state, [speed('decrease')]);
    expect(craftBlock(player).commandedSpeed).toBe(43.5);
    // The next tick reads the throttle back from the commanded speed: 116 − 12.
    expect(throttles(update(state, [speed('decrease')]))).toEqual([104]);
  });

  it('reads back a matched commanded speed as its ratio', () => {
    for (const [operation, throttle, commanded] of [['increase', 92, 34.5], ['decrease', 68, 25.5]] as const) {
      const [state, player] = withPlayer();
      craftBlock(player).commandedSpeed = 30;
      expect(throttles(update(state, [speed(operation)]))).toEqual([throttle]);
      stepControls(state, [speed(operation)]);
      expect(craftBlock(player).commandedSpeed).toBe(commanded);
    }
  });

  it('clamps the table index of a readback above full throttle after a lowered maximum', () => {
    const [state, player] = withPlayer();
    player.maximumSpeed = 24;
    expect(throttles(update(state, [speed('decrease'), speed('increase')]))).toEqual([244, 128]);
    stepControls(state, [speed('decrease')]);
    expect(craftBlock(player).commandedSpeed).toBe(24);
  });

  it('judges same-tick commands in array order, each reading back what the requests before it leave', () => {
    const cases = [
      [24, [speed('increase'), speed('increase')], [76, 88], 33],
      [48, [speed('decrease'), speed('zero'), speed('increase')], [116, 0, 12], 4.5],
      [48, [speed('zero'), speed('decrease'), preset(9), speed('increase')], [0, 0, 112, 124], 46.5],
    ] as const;
    for (const [start, commands, posted, commanded] of cases) {
      const [state, player] = withPlayer();
      craftBlock(player).commandedSpeed = start;
      expect(throttles(update(state, commands))).toEqual(posted);
      stepControls(state, commands);
      expect(craftBlock(player).commandedSpeed).toBe(commanded);
    }
  });

  it('accepts commands on a locked block, which drops their requests, so later ones read back the unchanged speed', () => {
    const [state, player] = withPlayer();
    Object.assign(craftBlock(player), { commandedSpeed: 24, atCommandedSpeed: true, locked: true });
    const commands = [speed('increase'), speed('increase')];
    expect(throttles(update(state, commands))).toEqual([76, 76]);
    const events = stepControls(state, commands);
    expect(results(events)).toEqual([[0, 'accepted', null], [1, 'accepted', null]]);
    expect([craftBlock(player).commandedSpeed, craftBlock(player).atCommandedSpeed]).toEqual([24, true]);
  });

  it('keeps no command across ticks: a later tick without commands posts and reports nothing', () => {
    const [state, player] = withPlayer();
    stepControls(state, [speed('zero')]);
    craftBlock(player).commandedSpeed = 30;
    expect(update(state)).toEqual({ events: [], requests: [] });
    expect(stepControls(state)).toEqual([]);
    expect(craftBlock(player).commandedSpeed).toBe(30);
  });
});

describe('command results (P3-06 AC-04, 行为与边界)', () => {
  const THROTTLE_COMMANDS = [speed('increase'), speed('decrease'), speed('zero'), speed('maximum'), preset(5)];
  const MATCH_COMMANDS = [speed('match-target'), speed('toggle-auto-match'), { type: 'confirm-selection' }] as const satisfies readonly Command[];
  const P3_06_COMMANDS: readonly Command[] = [...THROTTLE_COMMANDS, ...MATCH_COMMANDS];
  const OTHERS = [{ type: 'launch' }, { type: 'toggle-map' }, { type: 'navigate-selection', direction: 'next' }] as const satisfies readonly Command[];

  type Unavailable = (state: WorldState, player: Entity) => void;
  const inState = (objectState: ObjectState): [string, Unavailable] => [`in state ${objectState}`, (_, player) => void (player.state = objectState)];

  it.each<[string, Unavailable]>([
    ['none', (state) => void (state.player.entityId = null)],
    ...(['presentation-ready', 'area-switch', 'pending-removal', 'destroyed-source'] as ObjectState[]).map(inState),
    ['destroyed', (_, player) => void (player.destroyed = true)],
  ])('ignores P3-06 commands as player-unavailable with a player %s, changing nothing', (_, make) => {
    const [state, player] = withPlayer();
    make(state, player);
    const target = state.entities.allocate(entityInit(7));
    state.player.target = target.id;
    const block = structuredClone(player.movement);
    const control = structuredClone(state.player.control);
    const rng = state.rngState;
    const events = stepControls(state, [...P3_06_COMMANDS, ...OTHERS], { pitch: 1, yaw: 1, roll: 1 });
    expect(results(events)).toEqual([
      ...P3_06_COMMANDS.map((_, index) => [index, 'ignored', 'player-unavailable']),
      ...OTHERS.map((_, index) => [P3_06_COMMANDS.length + index, 'rejected', 'not-implemented']),
    ]);
    expect(events.every(({ type }) => type === 'command-result')).toBe(true);
    // A player in area-switch parks in request handling, which releases its block (area.ts).
    expect(player.movement).toEqual(player.activity === 'parked' ? null : block);
    // Removing a pending-removal player clears its control state with it.
    expect(state.player.control).toEqual(state.entities.get(player.id) === undefined ? null : control);
    expect(state.rngState).toBe(rng);
  });

  it.each([
    ['Warp', WARP, 'wrong-context'],
    ['base', BASE, 'not-implemented'],
    ['map', MAP, 'not-implemented'],
  ] as const)('ignores speed commands as wrong-context in the %s context; select-number and confirm-selection there: %s', (_, viewMode, selectionReason) => {
    const [state, player] = withPlayer();
    state.player.viewMode = viewMode;
    state.player.target = state.entities.allocate(entityInit(7)).id;
    const control = structuredClone(state.player.control);
    const selection = selectionReason === 'wrong-context' ? 'ignored' : 'rejected';
    const events = stepControls(state, [...P3_06_COMMANDS, ...OTHERS]);
    expect(results(events)).toEqual([
      [0, 'ignored', 'wrong-context'],
      [1, 'ignored', 'wrong-context'],
      [2, 'ignored', 'wrong-context'],
      [3, 'ignored', 'wrong-context'],
      [4, selection, selectionReason],
      [5, 'ignored', 'wrong-context'],
      [6, 'ignored', 'wrong-context'],
      [7, selection, selectionReason],
      ...OTHERS.map((_, index) => [P3_06_COMMANDS.length + index, 'rejected', 'not-implemented']),
    ]);
    expect(events.every(({ type }) => type === 'command-result')).toBe(true);
    expect(craftBlock(player).commandedSpeed).toBe(48);
    expect(state.player.control).toEqual(control);
  });

  it('reports player-unavailable before wrong-context', () => {
    const [state] = withPlayer();
    state.player.viewMode = MAP;
    state.player.entityId = null;
    expect(results(stepControls(state, [speed('zero'), preset(1)]))).toEqual([[0, 'ignored', 'player-unavailable'], [1, 'rejected', 'not-implemented']]);
  });

  it('leaves every command of other tasks not implemented in flight', () => {
    const [state, player] = withPlayer();
    expect(results(stepControls(state, OTHERS))).toEqual(OTHERS.map((_, index) => [index, 'rejected', 'not-implemented']));
    expect(craftBlock(player).commandedSpeed).toBe(48);
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
    expect(requestAxes(update(state, [], held))).toEqual([axesOf(128, 64, null)]);
    expect(update(state, [], held).requests).toEqual([]);
    expect(requestAxes(update(state, [], { ...held, yaw: -0.5 }))).toEqual([axesOf(null, -64, null)]);
    // Applied once: a later change of the rate by another rule is not overwritten while the axis is held.
    stepControls(state, [], { ...held, yaw: -0.5 });
    craftBlock(player).steering.pitch.rate = 3;
    stepControls(state, [], { ...held, yaw: -0.5 });
    expect(craftBlock(player).steering.pitch.rate).toBe(3);
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
    craftBlock(player).locked = true;
    stepControls(state, [], { pitch: 0, yaw: 1, roll: 0 });
    expect(state.player.control!.lastAxes.yaw).toBe(128);
    expect(steering(player).yaw).toEqual({ rate: 0, enabled: false });
    craftBlock(player).locked = false;
    expect(update(state, [], { pitch: 0, yaw: 1, roll: 0 }).requests).toEqual([]);
  });

  it.each([['map', MAP], ['base', BASE]] as const)('takes the manual axes as 0 in the %s context and restores nothing after it', (_, viewMode) => {
    const [state, player] = withPlayer();
    stepControls(state, [], { pitch: 0, yaw: 1, roll: 0 });
    const block = craftBlock(player);
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
    expect([craftBlock(player).commandedSpeed, steering(player).pitch.rate]).toEqual([48, -0.75]);
    stepControls(state, [speed('maximum')], { pitch: -1, yaw: 0, roll: 0 }, { 'spawn-queue-check': ({ requests }) => requests.post(late) });
    expect([craftBlock(player).commandedSpeed, steering(player).pitch.rate]).toEqual([0, 0.75]);
  });

  it('draws three times per applied request under a disturbance, only for accepted messages', () => {
    const [state, player] = withPlayer();
    craftBlock(player).disturbance = { level: 1 };
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
    craftBlock(player).locked = true;
    stepControls(state, [speed('zero')], { pitch: 0, yaw: 1, roll: 0 });
    craftBlock(player).locked = false;
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
    expect([state.rngState, craftBlock(player).commandedSpeed]).toEqual([before, 48]);
  });

  it('runs in the real world step: the commanded speed persists across ticks', () => {
    const [state, player] = withPlayer();
    const world = constructWorld(state);
    world.step(input([speed('zero')], { pitch: 0, yaw: -1, roll: 0 }));
    expect(craftBlock(player).commandedSpeed).toBe(0);
    expect(steering(player).yaw).toEqual({ rate: 0.25, enabled: true });
    world.step(input([speed('increase')]));
    expect(craftBlock(player).commandedSpeed).toBe(4.5);
    expect(steering(player).yaw).toEqual({ rate: 0.25, enabled: false });
  });
});

// The speed match and the speed assist (docs/plan/p3/06/spec.md, 匹配速度与速度辅助; executable.md, P3-06/03): the test
// player sits at the origin at full throttle (speed and commanded speed 48, maximum 48); targets are active craft of
// kind bit 7, one of the assist kinds, 100 units ahead and flying at 30 unless a test says otherwise. Clock units per
// tick are 2, so tick n runs at clock 2n.

const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 });

/** withPlayer, the player at the origin, with the assist on (as in group 0) or off. */
function withAssist(enabled = true): [WorldState, Entity] {
  const [state, player] = withPlayer();
  player.position = ORIGIN;
  state.player.control = initialPlayerControl(enabled ? 0 : 1);
  return [state, player];
}

/** An active entity of `kindBit` 100 units ahead at speed 30 (or without a block), made the player's target. */
function addTarget(state: WorldState, { kindBit = 7, position = { x: 0, y: 0, z: 100 }, speed: targetSpeed = 30 as number | null, select = true } = {}): Entity {
  const target = state.entities.allocate(entityInit(kindBit, { position }));
  target.state = 'active';
  if (targetSpeed === null) target.movement = null;
  else target.movement!.speed = targetSpeed;
  if (select) state.player.target = target.id;
  return target;
}

const assistOf = (state: WorldState) => ({ ...state.player.control!.speedAssist });
const nonResults = (events: readonly DomainEvent[]) => events.filter(({ type }) => type !== 'command-result');
const assistMatched = (tick: number, targetEntityId: number, speedDifferenceExceeded: boolean): DomainEvent =>
  ({ type: 'speed-matched', tick, targetEntityId, origin: 'assist', speedDifferenceExceeded });
const commandMatched = (tick: number, targetEntityId: number, commandIndex: number): DomainEvent =>
  ({ type: 'speed-matched', tick, targetEntityId, origin: 'command', commandIndex });
const accepted = (tick: number, commandIndex: number, commandType: Command['type']): DomainEvent =>
  ({ type: 'command-result', tick, commandIndex, commandType, outcome: 'accepted', reason: null });

describe('player target reference (P3-06 S-05, D-03)', () => {
  it('drops a target that no longer resolves at the start of the player update', () => {
    const [state] = withPlayer();
    const target = addTarget(state);
    state.entities.remove(target);
    update(state);
    expect(state.player.target).toBeNull();
  });

  it('runs P3-07\'s missile lock on the available player after the drop and before the speed assist (CR-07)', () => {
    const [state, player] = withAssist();
    const target = addTarget(state);
    const seen: [number, number | null, number][] = [];
    const run = () => updatePlayer(state, input(), state.tick + 1, {
      emit: () => {}, post: () => {}, judge: () => {}, lockMissiles: (entity) => void seen.push([entity.id, state.player.target, craftBlock(player).commandedSpeed]),
    });
    // The assist, due and in range, matches the target's 30 after the lock has seen the block at 48.
    expect(run()).toBe(player);
    expect([seen, craftBlock(player).commandedSpeed]).toEqual([[[player.id, target.id, 48]], 30]);
    state.entities.remove(target);
    run();
    expect(seen[1]).toEqual([player.id, null, 30]);
    player.state = 'presentation-ready';
    expect(run()).toBeNull();
    expect(seen).toHaveLength(2);
  });

  it('keeps a resolvable target, destroyed or pending removal included', () => {
    const [state] = withPlayer();
    const target = addTarget(state);
    target.destroyed = true;
    target.state = 'destroyed-source';
    update(state);
    expect(state.player.target).toBe(target.id);
  });
});

describe('manual speed match (P3-06 AC-04, AC-05, 匹配速度与速度辅助)', () => {
  it.each<[string, Command]>([
    ['match-target', speed('match-target')],
    ['confirm-selection (Enter)', { type: 'confirm-selection' }],
  ])('accepts %s at its own index, posts a match-speed request and matches in request handling', (_, command) => {
    const [state, player] = withPlayer();
    const target = addTarget(state);
    expect(update(state, [speed('zero'), command]).requests[1]).toEqual({ type: 'match-speed', entityId: player.id, targetEntityId: target.id, commandIndex: 1 });
    const events = stepControls(state, [speed('zero'), command]);
    expect(events).toEqual([accepted(1, 0, 'speed'), accepted(1, 1, command.type), commandMatched(1, target.id, 1)]);
    expect([craftBlock(player).commandedSpeed, craftBlock(player).atCommandedSpeed, craftBlock(player).speed]).toEqual([30, false, 48]);
  });

  it.each([
    ['no target', (state: WorldState) => void addTarget(state, { select: false })],
    ['a target that no longer resolves', (state: WorldState) => void state.entities.remove(addTarget(state))],
    ['a target without a block', (state: WorldState) => void addTarget(state, { speed: null })],
  ])('ignores both match commands as no-target with %s, changing nothing', (_, make) => {
    const [state, player] = withPlayer();
    make(state);
    const events = stepControls(state, [speed('match-target'), { type: 'confirm-selection' }]);
    expect(events).toEqual([
      { type: 'command-result', tick: 1, commandIndex: 0, commandType: 'speed', outcome: 'ignored', reason: 'no-target' },
      { type: 'command-result', tick: 1, commandIndex: 1, commandType: 'confirm-selection', outcome: 'ignored', reason: 'no-target' },
    ]);
    expect([craftBlock(player).commandedSpeed, craftBlock(player).atCommandedSpeed]).toEqual([48, true]);
  });

  it('clamps the target speed into [0, the player maximum]', () => {
    for (const [targetSpeed, matched] of [[60, 48], [-5, 0], [12.5, 12.5]] as const) {
      const [state, player] = withPlayer();
      addTarget(state, { speed: targetSpeed });
      stepControls(state, [speed('match-target')]);
      expect(craftBlock(player).commandedSpeed).toBe(matched);
    }
  });

  it('matches a destroyed target that is not removed yet, at any distance and kind, with the assist off', () => {
    const [state, player] = withPlayer();
    const target = addTarget(state, { kindBit: 12, position: { x: 1e6, y: 0, z: 0 }, speed: 20 });
    target.destroyed = true;
    target.state = 'destroyed-source';
    expect(nonResults(stepControls(state, [speed('match-target')]))).toEqual([commandMatched(1, target.id, 0)]);
    expect(craftBlock(player).commandedSpeed).toBe(20);
  });

  it('matches on a locked block, and later throttle commands read back the match', () => {
    const [state, player] = withPlayer();
    craftBlock(player).locked = true;
    addTarget(state);
    // The match leaves 30, read back as 80; the increase to 92 is dropped by the lock.
    expect(throttles(update(state, [speed('match-target'), speed('increase')]))).toEqual(['match-speed', 92]);
    stepControls(state, [speed('match-target'), speed('increase')]);
    expect(craftBlock(player).commandedSpeed).toBe(30);
  });

  it('counts the match in the readback of later same-tick commands, and the commands before it are overwritten', () => {
    const [state, player] = withPlayer();
    addTarget(state);
    // Readback of 30 is 80, + 12 = 92: commanded 46/64 × 48.
    stepControls(state, [speed('zero'), speed('match-target'), speed('increase')]);
    expect(craftBlock(player).commandedSpeed).toBe(34.5);
    stepControls(state, [speed('increase'), speed('match-target')]);
    expect(craftBlock(player).commandedSpeed).toBe(30);
  });

  it('merges the axes into a throttle request only, never into a match request', () => {
    const [state, player] = withPlayer();
    const target = addTarget(state);
    expect(update(state, [speed('match-target')], { pitch: 0, yaw: 1, roll: 0 }).requests).toEqual([
      { type: 'match-speed', entityId: player.id, targetEntityId: target.id, commandIndex: 0 },
      { type: 'control', entityId: player.id, throttle: null, axes: axesOf(null, 128, null) },
    ]);
  });

  it('matches a target that leaves only after the match request is handled', () => {
    const [state, player] = withPlayer();
    const target = addTarget(state);
    const events = stepControls(state, [speed('match-target')], NEUTRAL, {
      'spawn-queue-check': ({ world, requests }) => {
        world.entities.get(target.id)!.state = 'pending-removal';
        requests.post({ type: 'leave', entityId: target.id });
      },
    });
    expect(nonResults(events)).toEqual([commandMatched(1, target.id, 0)]);
    expect(craftBlock(player).commandedSpeed).toBe(30);
  });

  it('writes nothing and emits no match when the target is gone by the time request handling reaches it', () => {
    const [state, player] = withPlayer();
    const target = addTarget(state);
    const events = stepControls(state, [speed('match-target')], NEUTRAL, {
      'request-handling': ({ world }) => void world.entities.remove(world.entities.get(target.id)!),
    });
    expect(events).toEqual([accepted(1, 0, 'speed')]);
    expect(craftBlock(player).commandedSpeed).toBe(48);
  });
});

describe('speed assist switch (P3-06 AC-04, AC-05, 匹配速度与速度辅助)', () => {
  it('toggles the one switch, with speed-assist-toggled right after the command result', () => {
    const [state] = withAssist(false);
    const commands = [speed('toggle-auto-match'), speed('zero'), speed('toggle-auto-match')];
    expect(stepControls(state, commands)).toEqual([
      accepted(1, 0, 'speed'),
      { type: 'speed-assist-toggled', tick: 1, commandIndex: 0, enabled: true },
      accepted(1, 1, 'speed'),
      accepted(1, 2, 'speed'),
      { type: 'speed-assist-toggled', tick: 1, commandIndex: 2, enabled: false },
    ]);
    expect(assistOf(state).enabled).toBe(false);
  });

  it('makes the assist due at once and forgets the last match when switching on; switching off leaves both', () => {
    const [state] = withAssist(false);
    // Out of range, so the assist itself neither matches nor releases.
    addTarget(state, { position: { x: 0, y: 0, z: 1000 } });
    Object.assign(state.player.control!.speedAssist, { dueClock: 500, engaged: true });
    stepControls(state, [speed('toggle-auto-match')]);
    expect(assistOf(state)).toEqual({ enabled: true, dueClock: 0, engaged: false });
    Object.assign(state.player.control!.speedAssist, { dueClock: 700, engaged: true });
    stepControls(state, [speed('toggle-auto-match')]);
    expect(assistOf(state)).toEqual({ enabled: false, dueClock: 700, engaged: true });
  });

  it('is seen by the assist only from the next tick', () => {
    const [state, player] = withAssist(false);
    const target = addTarget(state);
    expect(nonResults(stepControls(state, [speed('toggle-auto-match')]))).toEqual([{ type: 'speed-assist-toggled', tick: 1, commandIndex: 0, enabled: true }]);
    expect(craftBlock(player).commandedSpeed).toBe(48);
    expect(stepControls(state)).toEqual([assistMatched(2, target.id, true)]);
  });

  it('does nothing while off, not even release a match', () => {
    const [state, player] = withAssist(false);
    addTarget(state);
    Object.assign(state.player.control!.speedAssist, { engaged: true });
    expect(stepControls(state)).toEqual([]);
    state.player.target = null;
    expect(update(state)).toEqual({ events: [], requests: [] });
    expect(craftBlock(player).commandedSpeed).toBe(48);
    expect(assistOf(state)).toEqual({ enabled: false, dueClock: 0, engaged: true });
  });

  it('forgets a match across off and on, so a later loss restores nothing', () => {
    const [state] = withAssist();
    addTarget(state);
    stepControls(state);
    expect(assistOf(state).engaged).toBe(true);
    stepControls(state, [speed('toggle-auto-match'), speed('toggle-auto-match')]);
    state.player.target = null;
    expect(update(state)).toEqual({ events: [], requests: [] });
  });
});

describe('speed assist (P3-06 AC-05, 匹配速度与速度辅助)', () => {
  it('matches a due target in range directly, re-arms 32 units from this clock and counts as engaged', () => {
    const [state, player] = withAssist();
    const target = addTarget(state);
    const events = stepControls(state);
    expect(events).toEqual([assistMatched(1, target.id, true)]);
    expect([craftBlock(player).commandedSpeed, craftBlock(player).atCommandedSpeed]).toEqual([30, false]);
    expect(assistOf(state)).toEqual({ enabled: true, dueClock: 34, engaged: true });
  });

  it('runs in every view, the map included', () => {
    const [state, player] = withAssist();
    state.player.viewMode = MAP;
    addTarget(state);
    stepControls(state);
    expect(craftBlock(player).commandedSpeed).toBe(30);
  });

  it('matches only the assist kinds 7, 8 and 9', () => {
    const matchedKinds: number[] = [];
    for (let kindBit = 0; kindBit < 20; kindBit++) {
      const [state] = withAssist();
      addTarget(state, { kindBit });
      if (stepControls(state).length > 0) matchedKinds.push(kindBit);
      if (!matchedKinds.includes(kindBit)) expect(assistOf(state)).toEqual({ enabled: true, dueClock: 0, engaged: false });
    }
    expect(matchedKinds).toEqual([7, 8, 9]);
  });

  it.each([
    ['300 ahead', { x: 0, y: 0, z: 300 }, true],
    ['at (100, −200, 200), a squared distance of exactly 90,000', { x: 100, y: -200, z: 200 }, true],
    ['just beyond 300 ahead', { x: 0, y: 0, z: 300 + 2 ** -20 }, false],
    ['at (100, 200, 200 + 2^-16)', { x: 100, y: 200, z: 200 + 2 ** -16 }, false],
  ])('matches a target %s: %s', (_, position, matches) => {
    const [state, player] = withAssist();
    addTarget(state, { position });
    stepControls(state);
    expect(craftBlock(player).commandedSpeed).toBe(matches ? 30 : 48);
    expect(assistOf(state).dueClock).toBe(matches ? 34 : 0);
  });

  it('measures from the player position', () => {
    const [state, player] = withAssist();
    player.position = { x: 0, y: 0, z: 1000 };
    addTarget(state, { position: { x: 0, y: 0, z: 1200 } });
    stepControls(state);
    expect(craftBlock(player).commandedSpeed).toBe(30);
  });

  it('matches at the due clock, not before, and does not advance the timer while it waits', () => {
    const [state, player] = withAssist();
    addTarget(state);
    state.player.control!.speedAssist.dueClock = 5;
    expect(stepControls(state)).toEqual([]);
    expect(stepControls(state)).toEqual([]);
    expect(assistOf(state).dueClock).toBe(5);
    expect(craftBlock(player).commandedSpeed).toBe(48);
    state.player.control!.speedAssist.dueClock = 6;
    expect(stepControls(state).map(({ type }) => type)).toEqual(['speed-matched']);
    expect(assistOf(state).dueClock).toBe(38);
  });

  it('re-arms from the clock of each match without catching up', () => {
    const [state] = withAssist();
    const target = addTarget(state);
    state.player.control!.speedAssist.dueClock = 1;
    const ticks: number[] = [];
    // A tick of 6 units: due at 1 → match at 6 (due 38) → at 42 (due 74) → at 78 (due 110) → at 114.
    const stepped = { ...state, config: Object.freeze({ ...state.config, clockUnitsPerTick: 6 }) };
    for (let tick = 1; tick <= 19; tick++) {
      if (stepControls(stepped).some((event) => event.type === 'speed-matched' && event.targetEntityId === target.id)) ticks.push(stepped.clock);
    }
    expect(ticks).toEqual([6, 42, 78, 114]);
  });

  it('keeps its timer and engagement when the target changes, and matches the new one when due', () => {
    const [state, player] = withAssist();
    const first = addTarget(state);
    stepControls(state);
    const second = addTarget(state, { speed: 20 });
    expect(state.player.target).toBe(second.id);
    for (let tick = 2; tick < 17; tick++) expect(stepControls(state)).toEqual([]);
    expect(assistOf(state)).toEqual({ enabled: true, dueClock: 34, engaged: true });
    expect(stepControls(state)).toEqual([assistMatched(17, second.id, true)]);
    expect(craftBlock(player).commandedSpeed).toBe(20);
    expect(first.id).not.toBe(second.id);
  });

  it('matches a destroyed target that is not removed yet', () => {
    const [state, player] = withAssist();
    const target = addTarget(state);
    target.destroyed = true;
    target.state = 'destroyed-source';
    expect(stepControls(state)).toEqual([assistMatched(1, target.id, true)]);
    expect(craftBlock(player).commandedSpeed).toBe(30);
  });

  it('engages and re-arms on a target without a block but writes nothing and emits nothing', () => {
    const [state, player] = withAssist();
    addTarget(state, { speed: null });
    expect(stepControls(state)).toEqual([]);
    expect(craftBlock(player).commandedSpeed).toBe(48);
    expect(assistOf(state)).toEqual({ enabled: true, dueClock: 34, engaged: true });
  });

  it('flags a speed difference strictly above 10', () => {
    for (const [targetSpeed, exceeded] of [[38, false], [37.5, true], [58, false], [58.5, true]] as const) {
      const [state] = withAssist();
      const target = addTarget(state, { speed: targetSpeed });
      expect(stepControls(state)).toEqual([assistMatched(1, target.id, exceeded)]);
    }
  });

  it.each([
    ['removed', (state: WorldState, target: Entity) => void state.entities.remove(target)],
    ['cleared', (state: WorldState) => void (state.player.target = null)],
  ])('releases a match once the target is %s: full throttle before the commands, then nothing', (_, lose) => {
    const [state, player] = withAssist();
    const target = addTarget(state);
    stepControls(state);
    expect(craftBlock(player).commandedSpeed).toBe(30);
    lose(state, target);
    // The release request comes first; the increase reads back 30 (80 + 12), not the release's full throttle.
    expect(update(state, [speed('increase')]).requests).toEqual([
      { type: 'control', entityId: player.id, throttle: 128, axes: axesOf(null, null, null) },
      { type: 'control', entityId: player.id, throttle: 92, axes: axesOf(null, null, null) },
    ]);
    state.player.control!.speedAssist.engaged = true;
    const events = stepControls(state, [speed('increase')]);
    expect(events).toEqual([{ type: 'speed-assist-released', tick: 2 }, accepted(2, 0, 'speed')]);
    expect(craftBlock(player).commandedSpeed).toBe(34.5);
    expect(state.player.target).toBeNull();
    expect(assistOf(state)).toEqual({ enabled: true, dueClock: 34, engaged: false });
    expect(update(state)).toEqual({ events: [], requests: [] });
  });

  it('restores full throttle with no command, through a request of its own beside one carrying the axes', () => {
    const [state, player] = withAssist();
    addTarget(state);
    stepControls(state);
    state.player.target = null;
    expect(update(state, [], { pitch: 1, yaw: 0, roll: 0 }).requests).toEqual([
      { type: 'control', entityId: player.id, throttle: 128, axes: axesOf(null, null, null) },
      { type: 'control', entityId: player.id, throttle: null, axes: axesOf(128, null, null) },
    ]);
  });

  it('comes before the commands: their readback starts from its match, and its event from their results', () => {
    const [state, player] = withAssist();
    const target = addTarget(state);
    const events = stepControls(state, [speed('increase'), speed('toggle-auto-match')]);
    expect(events).toEqual([
      assistMatched(1, target.id, true),
      accepted(1, 0, 'speed'),
      accepted(1, 1, 'speed'),
      { type: 'speed-assist-toggled', tick: 1, commandIndex: 1, enabled: false },
    ]);
    expect(craftBlock(player).commandedSpeed).toBe(34.5);
  });

  it('matches on a locked block, and the manual match and the assist share one tick in order', () => {
    const [state, player] = withAssist();
    craftBlock(player).locked = true;
    const near = addTarget(state, { speed: 20, select: false });
    const far = addTarget(state, { position: { x: 0, y: 0, z: 5000 }, speed: 40 });
    state.player.target = near.id;
    stepControls(state);
    expect(craftBlock(player).commandedSpeed).toBe(20);
    state.player.target = far.id;
    const events = stepControls(state, [speed('match-target')]);
    expect(events).toEqual([accepted(2, 0, 'speed'), commandMatched(2, far.id, 0)]);
    expect(craftBlock(player).commandedSpeed).toBe(40);
  });

  it('does not run while the player is unavailable', () => {
    const [state, player] = withAssist();
    addTarget(state);
    player.state = 'presentation-ready';
    expect(stepControls(state)).toEqual([]);
    expect(assistOf(state)).toEqual({ enabled: true, dueClock: 0, engaged: false });
  });

  it('runs in the real world step: a group-0 player matches without any key', () => {
    const state = testState({ group: 0 });
    const player = state.entities.allocate(entityInit(0, { position: ORIGIN }));
    player.state = 'active';
    state.player.entityId = player.id;
    state.player.control = initialPlayerControl(state.config.group);
    state.player.targeting = quietTargeting();
    const target = addTarget(state);
    const world = constructWorld(state);
    expect(world.step(input())).toEqual([assistMatched(1, target.id, true)]);
    expect(craftBlock(player).commandedSpeed).toBe(30);
    expect(world.step(input([speed('match-target')]))).toEqual([accepted(2, 0, 'speed'), commandMatched(2, target.id, 0)]);
  });
});
