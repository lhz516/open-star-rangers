import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { COMMAND_TYPES, readTickInput, type Command, type CommandType } from '../contracts/tick-input.ts';
import type { Entity } from '../world/entity-table.ts';
import { initialPlayerControl, initialPlayerTargeting } from '../world/player-state.ts';
import { constructWorld } from '../world/world.ts';
import { entityInit, stateText, testState, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { combatCommandPlayer } from './commands.ts';
import { registerTick, type Request } from './pipeline.ts';
import { referenceTarget } from './targeting.ts';
import { updateMissileLock } from './weapons.ts';

// docs/plan/p3/02/spec.md, CR-05 and CR-07: command judgement routes P3-07's commands to their rule modules, which
// keep the not-implemented result until subtasks 13 (targeting.test.ts), 14 and 16 implement them. The player's update (flight-control.ts)
// is the one command loop: it judges P3-06's throttle, speed match and speed assist commands itself and hands every
// other command to judgeCommand.

/** Every operation of P3-07's six command types. */
const COMBAT_COMMANDS: readonly Command[] = [
  ...(['enemy', 'friendly', 'next', 'previous', 'forward'] as const).map((operation): Command => ({ type: 'target', operation })),
  { type: 'fire', channel: 'primary' },
  { type: 'fire', channel: 'secondary' },
  { type: 'cycle-main-weapon' },
  { type: 'select-missile', direction: 'next' },
  { type: 'select-missile', direction: 'previous' },
  ...(['open', 'shield-increase', 'shield-decrease', 'gun-increase', 'gun-decrease'] as const).map((operation): Command => ({ type: 'energy', operation })),
  { type: 'damage-report' },
];
/** P3-07's commands whose rules are not implemented yet. */
const UNIMPLEMENTED_COMBAT_COMMANDS = COMBAT_COMMANDS.filter(({ type }) => type !== 'target');

/** P3-06's commands, which the player's update judges itself in flight: throttle, and Enter's speed match. */
const P3_06_COMMANDS: readonly Command[] = [
  { type: 'speed', operation: 'increase' },
  { type: 'select-number', value: 3 },
  { type: 'confirm-selection' },
];

/** One command of every other type. */
const OTHER_COMMANDS: readonly Command[] = [
  { type: 'navigate-selection', direction: 'next' },
  { type: 'toggle-map' },
  { type: 'map-point', operation: 'select', right: 0.5, down: 0.5 },
  { type: 'request-warp' },
  { type: 'communications', operation: 'open' },
  { type: 'launch' },
  { type: 'cockpit-front' },
];

/** A world whose player entity is active in flight, the state P3-07's commands are judged in. */
function flightState(): [WorldState, Entity] {
  const state = testState();
  const player = state.entities.allocate(entityInit(0));
  player.state = 'active';
  state.player.entityId = player.id;
  state.player.control = initialPlayerControl(state.config.group);
  state.player.targeting = initialPlayerTargeting();
  return [state, player];
}

const notImplemented = (commands: readonly Command[], tick: number): DomainEvent[] => commands.map(({ type }, commandIndex) => ({
  type: 'command-result', tick, commandIndex, commandType: type, outcome: 'rejected', reason: 'not-implemented',
}));

describe('command judgement (P3-07 CR-05, CR-07)', () => {
  it('covers every command type', () => {
    expect(new Set([...COMBAT_COMMANDS, ...P3_06_COMMANDS, ...OTHER_COMMANDS].map(({ type }) => type))).toEqual(new Set<CommandType>(COMMAND_TYPES));
  });

  it.each([['P3-07\'s unimplemented commands', UNIMPLEMENTED_COMBAT_COMMANDS], ['every other command', OTHER_COMMANDS]])(
    'gives %s exactly one rejected/not-implemented result each, in order, and changes nothing else',
    (_, commands) => {
      const [judged] = flightState();
      const [idle] = flightState();
      const events = constructWorld(judged).step(tickInput(commands));
      constructWorld(idle).step(tickInput());
      expect(events).toEqual(notImplemented(commands, 1));
      expect(stateText(judged)).toBe(stateText(idle));
    },
  );

  it('keeps the results in command order across the modules and P3-06\'s throttle commands, with repeated types', () => {
    const commands = [COMBAT_COMMANDS[0], P3_06_COMMANDS[0], COMBAT_COMMANDS[5], COMBAT_COMMANDS[0], COMBAT_COMMANDS[15], OTHER_COMMANDS[5]];
    const [state] = flightState();
    expect(constructWorld(state).step(tickInput(commands))).toEqual(commands.map(({ type }, commandIndex) => ({
      type: 'command-result',
      tick: 1,
      commandIndex,
      commandType: type,
      ...(commandIndex === 1 ? { outcome: 'accepted', reason: null }
        : type === 'target' ? { outcome: 'ignored', reason: 'no-candidate' }
        : { outcome: 'rejected', reason: 'not-implemented' }),
    })));
  });
});

describe('the common pre-judgement of P3-07\'s commands (CR-05)', () => {
  it('gives the player entity when it is active in flight', () => {
    const [state, player] = flightState();
    expect(combatCommandPlayer(state)).toBe(player);
    state.player.viewMode = 0x11;
    expect(combatCommandPlayer(state)).toBe(player);
  });

  it.each([
    ['no player entity', (state: WorldState) => { state.player.entityId = null; }],
    ['a removed player entity', (state: WorldState) => { state.player.entityId = 99; }],
    ['a destroyed player', (_: WorldState, player: Entity) => { player.destroyed = true; }],
    ['a player not active yet', (_: WorldState, player: Entity) => { player.state = 'presentation-ready'; }],
    ['a player being removed', (_: WorldState, player: Entity) => { player.state = 'pending-removal'; }],
    ['a player destroyed in the map', (state: WorldState, player: Entity) => { player.destroyed = true; state.player.viewMode = 8; }],
  ])('is player-unavailable with %s, before the context', (_, change) => {
    const [state, player] = flightState();
    change(state, player);
    expect(combatCommandPlayer(state)).toBe('player-unavailable');
  });

  it.each([[0, 'Warp'], [3, 'Warp'], [6, 'the base'], [8, 'the map']] as const)('is wrong-context in view mode %i (%s)', (viewMode, _) => {
    const [state] = flightState();
    state.player.viewMode = viewMode;
    expect(combatCommandPlayer(state)).toBe('wrong-context');
  });
});

describe('the reference target (CR-05)', () => {
  const select = (target: number, origin: 'command' | 'automatic'): Request => (origin === 'command'
    ? { type: 'select-target', entityId: 1, target, targetKindBit: 7, origin, commandIndex: 0 }
    : { type: 'select-target', entityId: 1, target, targetKindBit: 7, origin, commandIndex: null });

  it('is the last pending selection a command posted this tick, otherwise the player\'s target, and reading it changes nothing', () => {
    const [state] = flightState();
    const context = registerTick(state, readTickInput(tickInput()));
    expect(referenceTarget(context)).toBeNull();
    state.player.target = 9;
    expect(referenceTarget(context)).toBe(9);
    context.requests.post(select(4, 'command'));
    context.requests.post({ type: 'leave', entityId: 3 });
    expect(referenceTarget(context)).toBe(4);
    context.requests.post(select(5, 'command'));
    // An automatic selection is no command's; the selection looks at the actual target instead (CR-07).
    context.requests.post(select(6, 'automatic'));
    const before = stateText(state);
    expect(referenceTarget(context)).toBe(5);
    expect(stateText(state)).toBe(before);
  });

  it('no longer counts a selection once request handling has taken it', () => {
    const [state] = flightState();
    state.player.target = 9;
    const context = registerTick(state, readTickInput(tickInput()));
    context.requests.post(select(4, 'command'));
    context.requests.post(select(5, 'command'));
    const seen: (number | null)[] = [];
    context.requests.handle(() => void seen.push(referenceTarget(context)));
    expect(seen).toEqual([5, 9]);
    expect(referenceTarget(context)).toBe(9);
  });
});

describe('the player update\'s P3-07 entry points (CR-07)', () => {
  it('change nothing until subtask 14 implements the missile lock', () => {
    const [state, player] = flightState();
    const context = registerTick(state, readTickInput(tickInput()));
    const before = stateText(state);
    updateMissileLock(context, player);
    expect(stateText(state)).toBe(before);
    expect(context.events).toEqual([]);
    expect(context.requests.findLastPending((_request): _request is Request => true)).toBeUndefined();
  });
});
