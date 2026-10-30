import { describe, expect, it } from 'vitest';
import type { DomainEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import type { CollisionShape } from '../rules/collision-shapes.ts';
import type { Entity, EntityInit, Matrix3 } from '../world/entity-table.ts';
import { initialPlayerControl, initialPlayerTargeting, type PlayerTargeting } from '../world/player-state.ts';
import type { CraftRuleData } from '../world/rule-data.ts';
import { constructWorld } from '../world/world.ts';
import { expectFault, stateText, stillEntityInit, testState, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { enterBaseView } from './base-interior.test-support.ts';
import { PIPELINE, registerTick, type Request, type TickContext } from './pipeline.ts';
import { AUTOMATIC_TARGET_INTERVAL, clearRightDisplayTarget, selectAutomaticTarget } from './targeting.ts';

// docs/plan/p3/02/spec.md, CR-05, CR-06, CR-07 and CR-10; docs/original/formats/executable.md, T1–T5 and T7.
// Expectations derived by hand from the positions each test places.

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
/** Every craft's r² in these worlds. */
const RADIUS_SQUARED = 4;

function craftData(): CraftRuleData {
  const shape: CollisionShape = { radius: 2, radiusSquared: RADIUS_SQUARED, bounds: { lower: at(-2, -2, -2), upper: at(2, 2, 2) }, boxes: [], innerBox: null };
  return { shape, mountOffsets: [], parts: 0, debris: [] };
}

/** An automatic selection due clock no test reaches: the formal step's automatic selection (CR-07) stays out of the way. */
const NOT_DUE = 1e9;

/**
 * A world (speed assist off) whose player is active at the origin, facing +z, with its control and targeting state,
 * every craft kind with rule data. Its craft stand still, so movement keeps the positions a test places. The automatic
 * selection is due after `autoTargetDueClock`, by default never in these tests.
 */
function flightWorld(autoTargetDueClock = NOT_DUE): [WorldState, Entity] {
  const base = testState({ group: 1 });
  const state: WorldState = { ...base, ruleData: { ...base.ruleData, craft: Array.from({ length: 20 }, craftData) } };
  const player = state.entities.allocate(stillEntityInit(0, { position: at(0, 0, 0), orientation: IDENTITY }));
  player.state = 'active';
  state.player.entityId = player.id;
  state.player.control = initialPlayerControl(1);
  state.player.targeting = { ...initialPlayerTargeting(), autoTargetDueClock };
  return [state, player];
}

function add(state: WorldState, kindBit: number, position: Vec3, overrides: Partial<EntityInit> = {}): Entity {
  const entity = state.entities.allocate(stillEntityInit(kindBit, { position, orientation: IDENTITY, ...overrides }));
  entity.state = 'active';
  return entity;
}

const targeting = (state: WorldState): PlayerTargeting => state.player.targeting!;
const target = (operation: Extract<Command, { type: 'target' }>['operation']): Command => ({ type: 'target', operation });
const accepted = (commandIndex: number, tick = 1): DomainEvent =>
  ({ type: 'command-result', tick, commandIndex, commandType: 'target', outcome: 'accepted', reason: null });
const ignored = (commandIndex: number, reason: 'no-candidate' | 'no-change' | 'player-unavailable' | 'wrong-context', tick = 1): DomainEvent =>
  ({ type: 'command-result', tick, commandIndex, commandType: 'target', outcome: 'ignored', reason });

function changed(player: Entity, previous: Entity | null, next: Entity, mode: 'enemy' | 'friendly', commandIndex: number | null, tick = 1): DomainEvent {
  const fields = { type: 'target-changed', tick, playerEntityId: player.id, previousTarget: previous?.id ?? null, target: next.id, targetKindBit: next.kindBit, mode } as const;
  return commandIndex === null ? { ...fields, origin: 'automatic', commandIndex: null } : { ...fields, origin: 'command', commandIndex };
}

describe('target commands (AC-03; CR-05, T2–T4)', () => {
  it('select the nearest of the mode, write the mode at once and the target in request handling', () => {
    const [state, player] = flightWorld();
    add(state, 8, at(0, 0, 30));
    const enemy = add(state, 7, at(0, 20, 0));
    const friendly = add(state, 14, at(0, 0, 5));
    add(state, 1, at(0, 0, 50));
    const world = constructWorld(state);
    expect(world.step(tickInput([target('friendly')]))).toEqual([accepted(0), changed(player, null, friendly, 'friendly', 0)]);
    expect([state.player.target, targeting(state).mode]).toEqual([friendly.id, 'friendly']);
    expect(world.step(tickInput([target('enemy')]))).toEqual([accepted(0, 2), changed(player, friendly, enemy, 'enemy', 0, 2)]);
    expect([state.player.target, targeting(state).mode]).toEqual([enemy.id, 'enemy']);
  });

  type Operation = Extract<Command, { type: 'target' }>['operation'];
  it.each<[string, Operation, (state: WorldState) => void]>([
    ['no-change: the nearest is the target already', 'enemy', (state: WorldState) => {
      state.player.target = add(state, 7, at(0, 0, 10)).id;
      add(state, 8, at(0, 0, 20));
    }],
    ['no-candidate: no candidate of the mode', 'enemy', (state: WorldState) => void add(state, 14, at(0, 0, 10))],
    ['no-candidate: the only one is in Warp', 'friendly', (state: WorldState) => void add(state, 14, at(0, 0, 10), { inWarp: true })],
    ['no-change: only the target is in front', 'forward', (state: WorldState) => {
      state.player.target = add(state, 14, at(0, 0, 10)).id;
      add(state, 7, at(0, 0, -10));
    }],
    ['no-candidate: nothing within its radius in front', 'forward', (state: WorldState) => void add(state, 7, at(2, 1, 10))],
    ['no-change: only the target qualifies when cycling', 'next', (state: WorldState) => {
      state.player.target = add(state, 14, at(0, 0, 10)).id;
      add(state, 7, at(0, 0, 20));
    }],
    ['no-candidate: no candidate of the mode to cycle', 'previous', (state: WorldState) => void add(state, 7, at(0, 0, 20))],
  ])('%s, writing nothing, the mode included', (name, operation, place) => {
    const prepare = (): WorldState => {
      const [state] = flightWorld();
      targeting(state).mode = 'friendly';
      place(state);
      return state;
    };
    const [judged, idle] = [prepare(), prepare()];
    const events = constructWorld(judged).step(tickInput([target(operation)]));
    constructWorld(idle).step(tickInput());
    expect(events).toEqual([ignored(0, name.startsWith('no-change') ? 'no-change' : 'no-candidate')]);
    expect(stateText(judged)).toBe(stateText(idle));
  });

  it('cycle with next to the nearer and previous to the farther candidate of the mode, wrapping, and keep the mode', () => {
    const [state] = flightWorld();
    const near = add(state, 7, at(0, 0, 10));
    const middle = add(state, 7, at(0, 20, 0));
    const far = add(state, 8, at(30, 0, 0));
    const friendly = add(state, 14, at(0, 0, 15));
    const world = constructWorld(state);
    const cycle = (operation: 'next' | 'previous'): number | null => {
      const events = world.step(tickInput([target(operation)]));
      expect(events[0]).toMatchObject({ outcome: 'accepted' });
      return state.player.target;
    };
    // Without a target, next takes the farthest and previous the nearest.
    expect([cycle('next'), cycle('next'), cycle('next'), cycle('next')]).toEqual([far.id, middle.id, near.id, far.id]);
    expect([cycle('previous'), cycle('previous'), cycle('previous')]).toEqual([near.id, middle.id, far.id]);
    state.player.target = null;
    expect(cycle('previous')).toBe(near.id);
    expect(targeting(state).mode).toBe('enemy');
    targeting(state).mode = 'friendly';
    state.player.target = friendly.id;
    expect(world.step(tickInput([target('next')]))).toEqual([ignored(0, 'no-change', 9)]);
  });

  it('judge several commands of a tick against the reference target, as the original\'s keys in successive frames', () => {
    const [state, player] = flightWorld();
    const near = add(state, 7, at(0, 0, 10));
    const middle = add(state, 7, at(0, 0, 20));
    const far = add(state, 7, at(0, 0, 30));
    const events = constructWorld(state).step(tickInput([target('enemy'), target('next'), target('next'), target('enemy'), target('enemy')]));
    expect(events).toEqual([
      accepted(0), accepted(1), accepted(2), accepted(3), ignored(4, 'no-change'),
      changed(player, null, near, 'enemy', 0),
      changed(player, near, far, 'enemy', 1),
      changed(player, far, middle, 'enemy', 2),
      changed(player, middle, near, 'enemy', 3),
    ]);
    expect(state.player.target).toBe(near.id);
  });

  it('write the mode at once, so a later command of the tick cycles in it; the event reports the mode request handling finds', () => {
    const [state, player] = flightWorld();
    const enemy = add(state, 7, at(0, 0, 10));
    const close = add(state, 14, at(0, 0, 15));
    const distant = add(state, 1, at(0, 0, 40));
    expect(constructWorld(state).step(tickInput([target('friendly'), target('next'), target('enemy')]))).toEqual([
      accepted(0), accepted(1), accepted(2),
      changed(player, null, close, 'enemy', 0),
      changed(player, close, distant, 'enemy', 1),
      changed(player, distant, enemy, 'enemy', 2),
    ]);
    expect(targeting(state).mode).toBe('enemy');
  });

  it.each([
    ['an enemy', 7, 'friendly', 'enemy'],
    ['a friendly', 17, 'enemy', 'friendly'],
    ['a wingman', 1, 'enemy', 'friendly'],
  ] as const)('forward selects the nearest craft in front, %s, and writes its mode', (_, kindBit, before, after) => {
    const [state, player] = flightWorld();
    targeting(state).mode = before;
    add(state, 8, at(0, 0, -5));
    add(state, 9, at(0, 2.5, 8));
    const ahead = add(state, kindBit, at(1, 1, 20));
    add(state, 14, at(0, 0, 40));
    expect(constructWorld(state).step(tickInput([target('forward')]))).toEqual([accepted(0), changed(player, null, ahead, after, 0)]);
    expect(targeting(state).mode).toBe(after);
  });

  it.each<[string, (state: WorldState, player: Entity) => void, 'player-unavailable' | 'wrong-context']>([
    ['no player entity', (state: WorldState) => void (state.player.entityId = null), 'player-unavailable'],
    ['a destroyed player', (_: WorldState, player: Entity) => void (player.destroyed = true), 'player-unavailable'],
    ['a player not active', (_: WorldState, player: Entity) => void (player.state = 'presentation-ready'), 'player-unavailable'],
    ['the map', (state: WorldState) => void (state.player.viewMode = 8), 'wrong-context'],
    ['the base', (state: WorldState) => enterBaseView(state), 'wrong-context'],
    ['a Warp', (state: WorldState) => void (state.player.viewMode = 2), 'wrong-context'],
  ])('are ignored with %s, changing nothing', (_, change, reason) => {
    const prepare = (): WorldState => {
      const [state, player] = flightWorld();
      add(state, 7, at(0, 0, 10));
      add(state, 14, at(0, 0, 20));
      change(state, player);
      return state;
    };
    const [judged, idle] = [prepare(), prepare()];
    const operations = ['enemy', 'friendly', 'next', 'previous', 'forward'] as const;
    const events = constructWorld(judged).step(tickInput(operations.map(target)));
    constructWorld(idle).step(tickInput());
    // Without a player entity the area check retires the two craft in both worlds (P3-14 FA-07).
    expect(events.filter(({ type }) => type !== 'object-retired')).toEqual(operations.map((__, index) => ignored(index, reason)));
    expect(stateText(judged)).toBe(stateText(idle));
  });

  it('are a Core fault without the player\'s targeting state or a forward candidate\'s craft rule data', () => {
    const [state] = flightWorld();
    add(state, 7, at(0, 0, 10));
    state.player.targeting = null;
    expectFault(() => constructWorld(state).step(tickInput([target('enemy')])), 'invariant-violated', 'targeting.player-targeting');
    const [shapeless] = flightWorld();
    add(shapeless, 7, at(0, 0, 10));
    const world = constructWorld({ ...shapeless, ruleData: { ...shapeless.ruleData, craft: [] } });
    expectFault(() => world.step(tickInput([target('forward')])), 'invariant-violated', 'targeting.craft-shape');
  });

  it('draw no random number', () => {
    const [state] = flightWorld();
    add(state, 7, at(0, 0, 10));
    add(state, 17, at(0, 0, 20));
    const rng = state.rngState;
    constructWorld(state).step(tickInput([target('enemy'), target('friendly'), target('next'), target('previous'), target('forward')]));
    expect(state.rngState).toBe(rng);
  });
});

/** A registered tick of `state` whose request handling `handle` runs; no other stage. */
function tickOf(state: WorldState): [TickContext, () => void] {
  const context = registerTick(state, readTickInput(tickInput()));
  const handling = PIPELINE.find(({ id }) => id === 'request-handling')!;
  return [context, () => handling.run!(context)];
}

describe('the select-target request (CR-05, CR-06, T1)', () => {
  it('sets the target without checking it again, one target-changed per request in posting order, the last winning', () => {
    const [state, player] = flightWorld();
    const first = add(state, 7, at(0, 0, 10));
    const gone = add(state, 8, at(0, 0, 20));
    const [context, handle] = tickOf(state);
    const select = (entity: Entity): Request => ({ type: 'select-target', entityId: player.id, target: entity.id, targetKindBit: entity.kindBit, origin: 'command', commandIndex: 3 });
    context.requests.post(select(first));
    context.requests.post({ type: 'leave', entityId: gone.id });
    context.requests.post(select(gone));
    handle();
    expect(state.entities.get(gone.id)).toBeUndefined();
    expect(state.player.target).toBe(gone.id);
    expect(context.events).toEqual([changed(player, null, first, 'enemy', 3), changed(player, first, gone, 'enemy', 3)]);
  });

  it('is a Core fault for a subject other than the player\'s entity', () => {
    const [state] = flightWorld();
    const other = add(state, 7, at(0, 0, 10));
    const [context, handle] = tickOf(state);
    context.requests.post({ type: 'select-target', entityId: other.id, target: other.id, targetKindBit: 7, origin: 'automatic', commandIndex: null });
    expectFault(handle, 'invariant-violated', 'targeting.select-target');
  });

  it('is never emitted for a clearing: a removed target is dropped without an event', () => {
    const [state] = flightWorld();
    // An external view (0x13) has no right display, whose clearing would emit target-cleared first (CR-10).
    state.player.viewMode = 0x13;
    const doomed = add(state, 7, at(0, 0, 10));
    state.player.target = doomed.id;
    doomed.state = 'pending-removal';
    const world = constructWorld(state);
    expect([...world.step(tickInput()), ...world.step(tickInput())]).toEqual([]);
    expect(state.player.target).toBeNull();
  });
});

describe('the automatic selection (CR-07, T3)', () => {
  /** Runs the automatic selection on a registered tick, then request handling. */
  function automatic(state: WorldState, player: Entity, before: (context: TickContext) => void = () => {}): TickContext {
    const [context, handle] = tickOf(state);
    before(context);
    selectAutomaticTarget(context, player);
    handle();
    return context;
  }

  it('once the clock is past its due clock, posts the nearest enemy, writes the enemy mode and is due again 0x40 later', () => {
    const [state, player] = flightWorld(0);
    add(state, 14, at(0, 0, 5));
    const enemy = add(state, 8, at(0, 0, 10));
    add(state, 7, at(0, 0, 20));
    targeting(state).mode = 'friendly';
    const context = automatic(state, player);
    expect(AUTOMATIC_TARGET_INTERVAL).toBe(0x40);
    expect(context.events).toEqual([changed(player, null, enemy, 'enemy', null)]);
    expect(state.player.target).toBe(enemy.id);
    expect(targeting(state)).toEqual({ mode: 'enemy', autoTargetDueClock: context.time.clock + 0x40 });
  });

  it('compares strictly: not due at its due clock', () => {
    const [state, player] = flightWorld(0);
    add(state, 7, at(0, 0, 10));
    const clock = state.clock + state.config.clockUnitsPerTick;
    targeting(state).autoTargetDueClock = clock;
    expect(automatic(state, player).events).toEqual([]);
    expect(targeting(state).autoTargetDueClock).toBe(clock);
    targeting(state).autoTargetDueClock = clock - 1;
    state.player.target = null;
    const context = automatic(state, player);
    expect(context.events).toHaveLength(1);
    expect(targeting(state).autoTargetDueClock).toBe(context.time.clock + 0x40);
  });

  it.each([
    ['the Warp view 0', 0, 0, false],
    ['the Warp view 1', 1, 0, false],
    ['the base view', 6, 0, false],
    ['the destruction view 0x11/8', 0x11, 8, false],
    ['the map', 8, 0, true],
    ['view 0x11 in another sub-mode', 0x11, 0, true],
    ['the Warp view 2', 2, 0, true],
  ] as const)('in %s selects: %s, and is due again either way', (_, viewMode, subMode, selects) => {
    const [state, player] = flightWorld(0);
    add(state, 7, at(0, 0, 10));
    targeting(state).mode = 'friendly';
    state.player.viewMode = viewMode;
    state.player.subMode = subMode;
    const context = automatic(state, player);
    expect(context.events).toHaveLength(selects ? 1 : 0);
    expect(targeting(state)).toEqual({ mode: selects ? 'enemy' : 'friendly', autoTargetDueClock: context.time.clock + 0x40 });
  });

  it('looks at the actual target: none while one is set, but one despite a command\'s pending selection, applied after it', () => {
    const [state, player] = flightWorld(0);
    add(state, 7, at(0, 0, 10));
    const friendly = add(state, 14, at(0, 0, 20));
    state.player.target = friendly.id;
    expect(automatic(state, player).events).toEqual([]);
    expect(state.player.target).toBe(friendly.id);

    const [fresh, freshPlayer] = flightWorld(0);
    const freshEnemy = add(fresh, 7, at(0, 0, 10));
    const freshFriendly = add(fresh, 14, at(0, 0, 20));
    targeting(fresh).mode = 'friendly';
    const context = automatic(fresh, freshPlayer, ({ requests }) => requests.post({
      type: 'select-target', entityId: freshPlayer.id, target: freshFriendly.id, targetKindBit: 14, origin: 'command', commandIndex: 0,
    }));
    expect(context.events).toEqual([changed(freshPlayer, null, freshFriendly, 'enemy', 0), changed(freshPlayer, freshFriendly, freshEnemy, 'enemy', null)]);
    expect(fresh.player.target).toBe(freshEnemy.id);
  });

  it('without an enemy candidate posts nothing and keeps the mode', () => {
    const [state, player] = flightWorld(0);
    add(state, 14, at(0, 0, 10));
    add(state, 7, at(0, 0, 20), { inWarp: true });
    targeting(state).mode = 'friendly';
    const context = automatic(state, player);
    expect(context.events).toEqual([]);
    expect(targeting(state)).toEqual({ mode: 'friendly', autoTargetDueClock: context.time.clock + 0x40 });
  });

  it('faults when the next due clock passes the safe integers', () => {
    const [state, player] = flightWorld(0);
    state.clock = Number.MAX_SAFE_INTEGER - state.config.clockUnitsPerTick - 10;
    const [context] = tickOf(state);
    expectFault(() => selectAutomaticTarget(context, player), 'budget-exhausted', 'targeting.due-clock');
  });
});

describe('the right display\'s target clearing (CR-10, T7)', () => {
  type Setup = (state: WorldState, target: Entity) => number | null;
  const cases: [string, Setup, 'invalid' | 'base-view' | 'warp' | null][] = [
    ['a target that no longer resolves', () => 999, 'invalid'],
    ['an invalid target in the base view', (state) => {
      state.player.viewMode = 6;
      return 999;
    }, 'invalid'],
    ['the base view', (state, entity) => {
      state.player.viewMode = 6;
      return entity.id;
    }, 'base-view'],
    ['the base view with a target in Warp', (state, entity) => {
      state.player.viewMode = 6;
      entity.inWarp = true;
      return entity.id;
    }, 'base-view'],
    ['a target in Warp', (_, entity) => {
      entity.inWarp = true;
      return entity.id;
    }, 'warp'],
    ['a valid target in flight', (_, entity) => entity.id, null],
    ['a destroyed target', (_, entity) => {
      entity.destroyed = true;
      entity.state = 'destroyed-source';
      return entity.id;
    }, null],
    ['no target', () => null, null],
  ];

  it.each(cases)('with %s clears: %s', (_, setup, cause) => {
    const [state, player] = flightWorld();
    const entity = add(state, 7, at(0, 0, 10));
    const previous = setup(state, entity);
    state.player.target = previous;
    const [context] = tickOf(state);
    clearRightDisplayTarget(context);
    if (cause === null) {
      expect(context.events).toEqual([]);
      expect(state.player.target).toBe(previous);
      return;
    }
    expect(context.events).toEqual([{ type: 'target-cleared', tick: 1, playerEntityId: player.id, previousTarget: previous, cause }]);
    expect(state.player.target).toBeNull();
  });

  it('does nothing without a player entity', () => {
    const [state] = flightWorld();
    state.player.entityId = null;
    state.player.target = 999;
    const [context] = tickOf(state);
    clearRightDisplayTarget(context);
    expect(context.events).toEqual([]);
    expect(state.player.target).toBe(999);
  });
});
