import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import { CoreInputError } from '../errors.ts';
import { compareReplayResults } from '../replay/compare.ts';
import { snapshotText } from '../replay/snapshot.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, sliceMission, worldInput } from '../world/create-world.test-support.ts';
import {
  ALL_KINDS, EXPLOSION_KIND_BIT, FRAGMENT_KIND_BIT, MARKER_KIND_BIT, MISSILE_KIND_BIT, PROJECTILE_KIND_BIT, type Entity, type ExplosionCombat,
} from '../world/entity-table.ts';
import { COCKPIT_VIEW_MODE } from '../world/player-state.ts';
import { constructWorld, type World } from '../world/world.ts';
import { entityInit, expectFault, tickInput, withEveryKindBound } from '../world/world.test-support.ts';
import type { MissionResult, WorldState } from '../world/world-state.ts';
import { applyContactDamage, applyShotHit } from './damage.ts';
import { constructExplosion } from './destruction.ts';
import { applyLaunchRequest } from './launch.ts';
import { TEARDOWN_VIEW_MODE } from './mission-teardown.ts';
import { PIPELINE, registerTick, type RequestOf, type TickContext } from './pipeline.ts';
import { dispatchSpawn } from './spawn.ts';
import { WARP_VIEW_MODE } from './view-switch.ts';

// docs/plan/p3/02/spec.md, ME-03, ME-11, ME-12, ME-13 and ME-14; docs/plan/p3/11/spec.md, 任务流程状态 (S-08, AC-07,
// AC-10). The slice-shaped mission (create-world.test-support.ts) has ten enemies at the start and group 2 queued at
// 300 s. Expectations come from those records: the teardown starts in the latch's tick, in the `mission-teardown`
// stage (view 0x13, the old view as the previous one, main state 1, every entity pending removal); in the next tick
// every entity leaves through its own update and request handling, and the same stage completes the run, its last
// event; any later step is a non-latching CoreInputError.

const IMPACT = Object.freeze({ point: Object.freeze({ x: 0, y: 0, z: 0 }), local: Object.freeze({ x: 0, y: 0, z: -1 }), face: 0 });
const DESTRUCTION_VIEW = 0x11;
const WARP_PAGE = 6;
/** Every kind of command, each structurally valid. */
const COMMANDS: readonly Command[] = Object.freeze([
  { type: 'fire', channel: 'primary' },
  { type: 'speed', operation: 'maximum' },
  { type: 'speed-preset', level: 3 },
  { type: 'target', operation: 'enemy' },
  { type: 'toggle-map' },
  { type: 'request-warp' },
  { type: 'communications', operation: 'open' },
  { type: 'energy', operation: 'open' },
  { type: 'drop-transponder' },
  { type: 'launch' },
]);

interface Run {
  readonly state: WorldState;
  readonly world: World;
}

function newRun(): Run {
  const input = worldInput({ mission: sliceMission(), run: { wingman: 0 } });
  const state = withEveryKindBound(initialWorldState(asCreateInput(input)));
  const world = constructWorld(state);
  // The first step instantiates every entry due at 0.
  world.step(tickInput());
  return { state, world };
}

type Hooks = Partial<Record<string, (context: TickContext) => void>>;

/** One formal tick, the step's own registration and stages, with `hooks` run right before the named stages. */
function stepWith(state: WorldState, hooks: Hooks, commands: readonly Command[] = []): readonly DomainEvent[] {
  const context = registerTick(state, readTickInput(tickInput(commands)));
  for (const stage of PIPELINE) {
    hooks[stage.id]?.(context);
    stage.run?.(context);
  }
  return context.events;
}

const contextOf = (state: WorldState): TickContext => registerTick(state, readTickInput(tickInput()));
const ofType = <Type extends DomainEvent['type']>(events: readonly DomainEvent[], type: Type) =>
  events.filter((event): event is Extract<DomainEvent, { type: Type }> => event.type === type);
const allEntities = (state: WorldState): Entity[] => [...state.entities.walk(ALL_KINDS)];
const enemies = (state: WorldState): Entity[] => allEntities(state).filter(({ kindBit, destroyed }) => (kindBit === 7 || kindBit === 8) && !destroyed);

function weaken(entity: Entity): CraftEntity {
  const craft = entity as CraftEntity;
  Object.assign(craft.combat, { shield: 0, hull: 1 });
  return craft;
}

/** Destroys `entity` by a collision (event class 1). */
const destroy = (context: TickContext, entity: Entity): void => void applyContactDamage(context, weaken(entity), 5, 'collision');

/** Ends the mission: every enemy but the last destroyed outside a step, the last by the player's projectile in one. */
function endMission(run: Run): readonly DomainEvent[] {
  const { state } = run;
  state.spawn.queue.length = 0;
  const [last, ...others] = enemies(state);
  for (const entity of others) destroy(contextOf(state), entity);
  return stepWith(state, {
    'request-handling': (context) => {
      const projectile = state.entities.allocate(entityInit(PROJECTILE_KIND_BIT, { combat: { type: 'projectile', gun: 0, shooter: state.player.entityId!, expiry: null } }));
      expect(applyShotHit(context, projectile, weaken(last), 5, IMPACT)).not.toBeNull();
    },
  });
}

/** A run in state 5 whose result is due at the next step: the all-clear, the settlement, then the due moved to now. */
function dueRun(): Run {
  const run = newRun();
  endMission(run);
  expect(ofType(run.world.step(tickInput()), 'settlement-started')).toHaveLength(1);
  run.state.flow.mainState = 5;
  run.state.flow.settlementDeadline = run.state.clock - 1;
  return run;
}

/** Steps until the latch, logging every event, with `commands` in each tick; returns the latch tick's events. */
function stepUntilLatched({ world }: Run, log: DomainEvent[], commands: readonly Command[] = []): readonly DomainEvent[] {
  for (let step = 0; step < 1000; step++) {
    const events = world.step(tickInput(commands));
    log.push(...events);
    if (ofType(events, 'result-latched').length > 0) return events;
  }
  throw new Error('no latch');
}

/** The replay comparator's order check over `events`, a run ending at `finalTick`. */
function expectContractOrder(events: readonly DomainEvent[], finalTick: number): void {
  const result = { events, checkpoints: [{ tick: 0, hash: '0'.repeat(16) }, { tick: finalTick, hash: '1'.repeat(16) }], finalTick };
  expect(compareReplayResults(result, result)).toEqual({ match: true });
}

/** The run's step after the completion: a non-latching CoreInputError that changes nothing; reads go on. */
function expectRejectedStep({ state, world }: Run): void {
  const before = snapshotText(world.snapshot());
  for (const input of [tickInput(), tickInput(COMMANDS), null]) {
    let error: unknown;
    try {
      world.step(input as never);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(CoreInputError);
    expect(error).toMatchObject({ path: 'step', reason: 'mission-completed' });
  }
  expect(snapshotText(world.snapshot())).toBe(before);
  expect(world.projection().result).toMatchObject({ outcome: state.flow.result!.outcome, completedTick: state.flow.completedTick });
  expect(world.renderState()).toMatchObject({ entities: [] });
}

describe('the teardown after a success (ME-11)', () => {
  it('starts in the latch tick and completes in the next through the lifecycle; the full run passes the comparator', () => {
    const run = newRun();
    const { state, world } = run;
    const log = [...endMission(run)];
    const latchTick = stepUntilLatched(run, log);
    expect(state.player.viewMode).toBe(TEARDOWN_VIEW_MODE);

    // The latch tick: the result first, the teardown later in the same tick, every entity still in the table.
    const types = latchTick.map(({ type }) => type);
    expect(types.indexOf('result-latched')).toBeLessThan(types.indexOf('teardown-started'));
    const entities = allEntities(state);
    expect(entities.length).toBeGreaterThan(10);
    expect(ofType(latchTick, 'teardown-started')).toEqual([{ type: 'teardown-started', tick: state.tick, entities: entities.length }]);
    expect(entities.every(({ state: objectState }) => objectState === 'pending-removal')).toBe(true);
    // The player, the wingman, the bases and the destroyed enemies' fragments, among others.
    const kinds = new Set(entities.map(({ kindBit }) => kindBit));
    for (const kindBit of [0, 1, 17, 24]) expect(kinds.has(kindBit)).toBe(true);
    expect([state.flow.mainState, state.player.viewMode, state.player.previousViewMode]).toEqual([1, TEARDOWN_VIEW_MODE, COCKPIT_VIEW_MODE]);
    expect(world.projection()).toMatchObject({ mission: { phase: 'teardown' }, result: { readiness: 'ready', outcome: 'in-progress' } });

    // The next tick removes everything, releases every controller and script use, and completes: its last event.
    const last = world.step(tickInput());
    log.push(...last);
    expect(last.at(-1)).toEqual({ type: 'mission-completed', tick: state.tick, outcome: 'success' });
    expect(ofType(last, 'object-destroyed')).toEqual([]);
    expect([state.entities.size, state.ai.parseCache, state.flow.completedTick]).toEqual([0, [], state.tick]);
    expect([state.player.entityId, state.player.target, state.player.dockingObject, state.player.control]).toEqual([null, null, null, null]);
    const result = state.flow.result as MissionResult;
    expect(world.projection()).toMatchObject({
      mission: { phase: 'completed', status: 'ended' },
      result: { readiness: 'ready', outcome: 'success', reason: { type: 'all-clear' }, latchTick: result.latchTick, completedTick: state.tick },
    });
    expect(world.renderState()).toMatchObject({ viewMode: TEARDOWN_VIEW_MODE, observedEntityId: null, entities: [] });

    expectContractOrder(log, state.tick);
    expectRejectedStep(run);
  });

  it('ignores every command of the latch tick and of the completion tick as mission-ended, posting nothing', () => {
    const run = dueRun();
    const { state, world } = run;
    const shots = state.player.shots;
    const map = structuredClone(state.player.map);
    const expected = (tick: number) => COMMANDS.map(({ type }, commandIndex) => (
      { type: 'command-result', tick, commandIndex, commandType: type, outcome: 'ignored', reason: 'mission-ended' }
    ));
    const latchTick = world.step(tickInput(COMMANDS));
    expect(ofType(latchTick, 'result-latched')).toHaveLength(1);
    expect(ofType(latchTick, 'command-result')).toEqual(expected(state.tick));
    for (const type of ['shot-fired', 'map-toggled', 'warp-started', 'target-changed', 'transponder-deployed', 'docking-requested'] as const) {
      expect(ofType(latchTick, type)).toEqual([]);
    }
    expect([state.player.shots, state.player.map]).toEqual([shots, map]);
    const last = world.step(tickInput(COMMANDS));
    expect(ofType(last, 'command-result')).toEqual(expected(state.tick));
    expect(last.at(-1)).toMatchObject({ type: 'mission-completed' });
    expectContractOrder([...latchTick, ...last], state.tick);
  });

  it('keeps the latched result through the rest of the latch tick: a later destruction neither ends nor rescues', () => {
    const { state } = dueRun();
    const [wingman] = state.entities.walk(2);
    const player = state.entities.get(state.player.entityId!)!;
    let latched: MissionResult | null = null;
    const events = stepWith(state, {
      collision: (context) => {
        latched = state.flow.result;
        destroy(context, wingman);
        destroy(context, player);
      },
    });
    expect(latched).not.toBeNull();
    expect(state.flow.result).toBe(latched);
    expect(ofType(events, 'object-destroyed').map(({ entityId }) => entityId)).toEqual([wingman.id, player.id]);
    for (const type of ['all-clear', 'player-loss-started', 'player-rescued', 'transition'] as const) expect(ofType(events, type)).toEqual([]);
    expect(state.flow).toMatchObject({ mainState: 1, subState: 0, rescues: 0 });
    expect(ofType(events, 'teardown-started')).toHaveLength(1);
  });

  it('switches the view from the true old view: leaving the Warp view restores the saved page before teardown-started', () => {
    // The latch's flush has set page 0 earlier in the tick; leaving the Warp view then restores the saved page.
    const { state, world } = dueRun();
    Object.assign(state.player, { viewMode: WARP_VIEW_MODE, savedLeftPage: 2 });
    state.player.leftDisplay.page = WARP_PAGE;
    const events = world.step(tickInput());
    const index = events.findIndex(({ type }) => type === 'teardown-started');
    expect(events[index - 1]).toEqual({ type: 'left-page-changed', tick: state.tick, page: 2, previousPage: 0, commandIndex: null });
    expect([state.player.viewMode, state.player.previousViewMode, state.player.leftDisplay.page]).toEqual([TEARDOWN_VIEW_MODE, WARP_VIEW_MODE, 2]);
  });
});

describe('the teardown after a third loss (ME-10, ME-11)', () => {
  it('latched at the escape pod\'s expiry in request handling: the commands judged before stand, then the same teardown', () => {
    const run = newRun();
    const { state, world } = run;
    const log: DomainEvent[] = [];
    // A transponder, then the player's third destruction; the pod, the explosion and the fragments follow.
    log.push(...world.step(tickInput([{ type: 'drop-transponder' }])));
    state.flow.rescues = 2;
    const player = state.entities.get(state.player.entityId!)!;
    log.push(...stepWith(state, { collision: (context) => destroy(context, player) }));
    // The latch tick's commands come before the pod's expiry: judged in main state 3, the player unavailable.
    const latchTick = stepUntilLatched(run, log, [{ type: 'fire', channel: 'primary' }]);
    expect(ofType(latchTick, 'command-result')).toEqual([expect.objectContaining({ outcome: 'ignored', reason: 'player-unavailable' })]);
    expect(ofType(latchTick, 'result-latched')[0].result).toMatchObject({ outcome: 'failure', reason: { type: 'third-loss', loss: 'destroyed' } });
    expect([state.flow.mainState, state.player.viewMode, state.player.previousViewMode, state.player.followedEntity]).toEqual([1, TEARDOWN_VIEW_MODE, DESTRUCTION_VIEW, null]);
    const kinds = new Set(allEntities(state).map(({ kindBit }) => kindBit));
    // The player's explosion has run its course by the pod's expiry; the enemies, the transponder and fragments remain.
    expect(kinds).toEqual(new Set([0, 1, 7, 8, 14, 17, 24]));
    // The living enemies' controllers still hold their scripts.
    const controlled = allEntities(state).filter(({ ai: { program } }) => program.type !== 'none' && program.controller !== null);
    expect([controlled.length > 0, state.ai.parseCache.length > 0]).toEqual([true, true]);

    const last = world.step(tickInput());
    log.push(...last);
    expect(last.at(-1)).toEqual({ type: 'mission-completed', tick: state.tick, outcome: 'failure' });
    expect([state.entities.size, state.ai.parseCache]).toEqual([0, []]);
    expect(world.projection().result).toMatchObject({ outcome: 'failure', endingGaps: [{ gap: 'G-02/7', variant: 'destroyed' }], completedTick: state.tick });
    expectContractOrder(log, state.tick);
    expectRejectedStep(run);
  });

  it('removes every runtime kind present at the teardown: markers, missiles, projectiles, explosions and fragments', () => {
    const { state, world } = dueRun();
    const shooter = state.player.entityId!;
    stepWith(state, {
      'mission-teardown': () => {
        state.entities.allocate(entityInit(MARKER_KIND_BIT));
        state.entities.allocate(entityInit(MISSILE_KIND_BIT, { combat: { ...entityInit(MISSILE_KIND_BIT).combat, shooter } as never }));
        state.entities.allocate(entityInit(PROJECTILE_KIND_BIT, { combat: { type: 'projectile', gun: 0, shooter, expiry: null } }));
        // A parked enemy goes too: a pending removal never switches its parking.
        state.entities.allocate(entityInit(7, { activity: 'parked' }));
      },
    });
    expect(state.flow.mainState).toBe(1);
    const last = world.step(tickInput());
    expect(last.at(-1)).toMatchObject({ type: 'mission-completed' });
    expect(state.entities.size).toBe(0);
  });
});

describe('the gate 0x339cc in main state 1 (ME-11)', () => {
  it('drops spawn and launch requests without an event, and lets them through in main state 0', () => {
    const run = newRun();
    const { state } = run;
    const player = state.entities.get(state.player.entityId!)!;
    const spawn: RequestOf<'spawn'> = { type: 'spawn', source: 'group', index: 2, request: 0 };
    const launch: RequestOf<'launch'> = {
      type: 'launch', family: 'gun', shooter: player.id, gun: 0, mount: 0, offset: { x: 0, y: 0, z: 0 },
      orientation: state.craftInfo.content.guns[0].at28 === 0 ? null : player.orientation, trigger: { type: 'command', channel: 'primary', commandIndex: 0 },
    };
    const size = state.entities.size;
    const shots = state.player.shots.projectilesFired;
    for (const mainState of [1, 0] as const) {
      state.flow.mainState = mainState;
      const context = contextOf(state);
      dispatchSpawn(context, spawn);
      applyLaunchRequest(context, launch);
      if (mainState === 1) {
        expect([context.events, state.entities.size, state.player.shots.projectilesFired]).toEqual([[], size, shots]);
      } else {
        const instantiated = ofType(context.events, 'object-instantiated').length;
        expect(instantiated).toBeGreaterThan(0);
        expect(state.entities.size).toBe(size + instantiated + 1);
        expect(ofType(context.events, 'shot-fired')).toHaveLength(1);
      }
    }
  });
});

describe('the fragment gate 0x339cc in main state 1 (ME-11)', () => {
  it('sheds no fragment and draws nothing in main state 1, yet the source counts as shed; in main state 3 it sheds', () => {
    const { state } = newRun();
    const [first, second] = enemies(state);
    expect(first.kindBit).toBe(second.kindBit);
    const kindCount = (kindBit: number): number => [...state.entities.walk(2 ** kindBit)].length;
    const fragments = kindCount(FRAGMENT_KIND_BIT);

    state.flow.mainState = 1;
    const rngState = state.rngState;
    constructExplosion(contextOf(state), first);
    const [explosion] = [...state.entities.walk(2 ** EXPLOSION_KIND_BIT)];
    expect([kindCount(FRAGMENT_KIND_BIT), state.rngState, first.state, (explosion.combat as ExplosionCombat).heldSource]).toEqual([fragments, rngState, 'destroyed-source', null]);

    state.flow.mainState = 3;
    constructExplosion(contextOf(state), second);
    expect(kindCount(FRAGMENT_KIND_BIT)).toBeGreaterThan(fragments);
  });
});

describe('teardown faults (ME-11, ME-13)', () => {
  /** A run right after its latch tick, in main state 1. */
  function tornDown(): Run {
    const run = dueRun();
    run.world.step(tickInput());
    expect(run.state.flow.mainState).toBe(1);
    return run;
  }

  it('faults, latched and without completing, when an entity is left at the completion', () => {
    const { state, world } = tornDown();
    allEntities(state)[0].state = 'active';
    const fault = expectFault(() => world.step(tickInput()), 'invariant-violated', 'mission-teardown');
    expect(state.flow.completedTick).toBeNull();
    expect(() => world.projection()).toThrow(fault);
    expect(() => world.step(tickInput())).toThrow(fault);
  });

  it('faults when a script use is left in the AI parse cache', () => {
    const { state, world } = tornDown();
    // A use of a cached script that no controller releases; script −1 keeps the cache's order.
    state.ai.parseCache.unshift({ script: -1, uses: 1, items: [] });
    expectFault(() => world.step(tickInput()), 'invariant-violated', 'mission-teardown');
    expect(state.flow.completedTick).toBeNull();
  });

  it('faults on a transition in the latch tick', () => {
    const { state } = dueRun();
    expectFault(() => stepWith(state, {
      'mission-teardown': (context) => void context.events.push({ type: 'transition', tick: context.time.tick, gap: 'G-02/5' }),
    }), 'invariant-violated', 'mission-teardown.transition');
  });
});
