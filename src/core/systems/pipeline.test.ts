import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import { isActiveState, type Entity } from '../world/entity-table.ts';
import { entityInit, expectFault, stateText, testState, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { emit, PIPELINE, registerTick, RequestQueue, runTick, type Request, type TickContext } from './pipeline.ts';

/** Stand-ins for rules that do not exist yet: each runs just before the stage with its ID. */
type Hooks = Readonly<Record<string, (context: TickContext) => void>>;

/** Runs one tick through PIPELINE like runTick, calling `hooks` between stages. */
function runTickWith(state: WorldState, hooks: Hooks = {}, commands: readonly Command[] = []): readonly DomainEvent[] {
  const context = registerTick(state, readTickInput(tickInput(commands)));
  for (const stage of PIPELINE) {
    hooks[stage.id]?.(context);
    stage.run?.(context);
  }
  return context.events;
}

function withEntities(...inits: Parameters<typeof entityInit>[]): [WorldState, Entity[]] {
  const state = testState();
  return [state, inits.map((init) => state.entities.allocate(entityInit(...init)))];
}

const setState = (entity: Entity, state: Entity['state']): Request => ({ type: 'set-state', entityId: entity.id, state });

describe('stage table (P3-02 AC-09, 系统流水线, Q-09)', () => {
  it('is the one fixed order of the spec and Q-09', () => {
    expect(PIPELINE.map(({ id }) => id)).toEqual([
      'input-registration',
      'mission-flow',
      'clock',
      'object-update',
      'communications-reply',
      'spawn-queue-check',
      'request-handling',
      'movement',
      'collision',
      'delayed-player-explosion',
      'energy',
      'object-sets',
      'parked-update',
      'warp-completion',
      'base-interior',
      'mission-teardown',
      'area-check',
      'frame-end',
      'commit',
    ]);
    expect(deepFrozen(PIPELINE)).toBe(true);
  });

  it('implements only the stages P3-02 owns and fakes no rule system', () => {
    expect(PIPELINE.filter(({ run }) => run !== null).map(({ id }) => id)).toEqual(['input-registration', 'clock', 'object-update', 'request-handling', 'commit']);
  });

  it('is what runTick runs', () => {
    const [manual] = withEntities([0], [3, { activity: 'parked' }]);
    const [direct] = withEntities([0], [3, { activity: 'parked' }]);
    const commands: Command[] = [{ type: 'launch' }];
    expect(runTick(registerTick(direct, readTickInput(tickInput(commands))))).toEqual(runTickWith(manual, {}, commands));
    expect(stateText(direct)).toBe(stateText(manual));
  });
});

describe('request queue (P3-02 AC-09, 系统流水线)', () => {
  const request = (entityId: number): Request => ({ type: 'leave', entityId });

  it('handles requests in posting order, then those posted while handling', () => {
    const queue = new RequestQueue();
    queue.post(request(1));
    queue.post(request(2));
    const handled: number[] = [];
    queue.handle(({ entityId }) => {
      handled.push(entityId);
      if (entityId === 1) queue.post(request(3));
      if (entityId === 3) queue.post(request(4));
    });
    expect(handled).toEqual([1, 2, 3, 4]);
  });

  it('never handles a request posted after handling, and handles once per tick', () => {
    const queue = new RequestQueue();
    const handled: number[] = [];
    queue.post(request(1));
    queue.handle(({ entityId }) => handled.push(entityId));
    queue.post(request(2));
    expectFault(() => queue.handle(({ entityId }) => handled.push(entityId)), 'invariant-violated', 'pipeline.requests-handled');
    expect(handled).toEqual([1]);
  });

  it('takes at most CORE_LIMITS.eventsPerTick posts in a tick, late ones included, a budget fault beyond', () => {
    const queue = new RequestQueue();
    for (let count = 0; count < CORE_LIMITS.eventsPerTick - 1; count++) queue.post(request(count + 1));
    queue.handle(() => {});
    queue.post(request(0));
    expectFault(() => queue.post(request(0)), 'budget-exhausted', 'pipeline.requests');
  });

  it('emits a deeply frozen copy, detached from what the event was built from', () => {
    const state = testState();
    const context = registerTick(state, readTickInput(tickInput()));
    const group = { index: 1, request: 2, member: 3 };
    const position = { x: 1, y: 2, z: 3 };
    const event = { type: 'object-instantiated', tick: 1, entityId: 4, kindBit: 7, source: { collection: 'mission', index: 5, group }, position } as const;
    emit(context, event);
    group.member = 9;
    position.x = 9;
    expect(context.events).toEqual([{ ...event, source: { collection: 'mission', index: 5, group: { index: 1, request: 2, member: 3 } }, position: { x: 1, y: 2, z: 3 } }]);
    expect(deepFrozen(context.events[0])).toBe(true);
  });

  it('emits at most CORE_LIMITS.eventsPerTick events in a tick, a budget fault beyond', () => {
    const state = testState();
    const context = registerTick(state, readTickInput(tickInput()));
    const event = Object.freeze({ type: 'command-result', tick: 1, commandIndex: 0, commandType: 'launch', outcome: 'rejected', reason: 'not-implemented' } as const);
    for (let count = 0; count < CORE_LIMITS.eventsPerTick; count++) emit(context, event);
    expectFault(() => emit(context, event), 'budget-exhausted', 'pipeline.events');
  });
});

describe('tick order (P3-02 AC-09, 系统流水线)', () => {
  it('registers the tick first; mission flow reads the previous clock, later stages the new one', () => {
    const state = testState({ clockUnitsPerTick: 4 });
    runTickWith(state);
    const seen: [string, number, number][] = [];
    const record = (stage: string) => ({ world }: TickContext) => void seen.push([stage, world.tick, world.clock]);
    runTickWith(state, { 'mission-flow': record('mission-flow'), clock: record('clock'), 'object-update': record('object-update') });
    expect(seen).toEqual([['mission-flow', 2, 4], ['clock', 2, 4], ['object-update', 2, 8]]);
  });

  it('judges commands in the object update; later stages see the events, and the returned list is frozen', () => {
    const state = testState();
    const seen: Record<string, number> = {};
    const count = (stage: string) => ({ events }: TickContext) => void (seen[stage] = events.length);
    const events = runTickWith(state, { 'object-update': count('object-update'), 'communications-reply': count('communications-reply'), commit: count('commit') }, [
      { type: 'launch' },
      { type: 'toggle-map' },
    ]);
    expect(seen).toEqual({ 'object-update': 0, 'communications-reply': 2, commit: 2 });
    expect(events.map(({ type }) => type)).toEqual(['command-result', 'command-result']);
    expect(deepFrozen(events)).toBe(true);
  });

  it('handles requests in posting order: mission flow, object updates, then the spawn queue check', () => {
    const [state, [early, updated]] = withEntities([3], [1]);
    early.state = 'active';
    runTickWith(state, {
      'mission-flow': ({ requests }) => {
        requests.post(setState(early, 'projectile-hit'));
        requests.post(setState(updated, 'pending-removal'));
      },
      // `updated` is presentation-ready, so its own update posts set-state active after the mission flow's request.
      'spawn-queue-check': ({ requests }) => requests.post(setState(early, 'area-switch')),
    });
    expect(early.state).toBe('area-switch');
    expect(updated.state).toBe('active');
  });

  it('drops requests posted after request handling', () => {
    const [state, [entity]] = withEntities([2]);
    entity.state = 'active';
    runTickWith(state, { movement: ({ requests }) => requests.post(setState(entity, 'pending-removal')) });
    expect(entity.state).toBe('active');
    runTickWith(state);
    expect(state.entities.get(entity.id)).toBe(entity);
  });

  it('drops a request whose entity was removed earlier in the same pass', () => {
    const [state, [entity]] = withEntities([2]);
    entity.state = 'pending-removal';
    runTickWith(state, { 'spawn-queue-check': ({ requests }) => requests.post(setState(entity, 'active')) });
    expect(state.entities.get(entity.id)).toBeUndefined();
  });

  it('keeps no request, command or event across ticks', () => {
    const state = testState();
    expect(runTickWith(state, {}, [{ type: 'launch' }])).toHaveLength(1);
    expect(runTickWith(state)).toEqual([]);
  });
});

describe('entity lifecycle in the pipeline (P3-02 AC-09, 实体与生命周期, Q-08)', () => {
  it('makes a new entity active at its first update: in request handling, before movement', () => {
    const [state, [active, parked]] = withEntities([4], [4, { activity: 'parked' }]);
    const atMovement: string[] = [];
    runTickWith(state, { movement: () => atMovement.push(active.state, parked.state) });
    expect(atMovement).toEqual(['active', 'active']);
    expect([active.activity, parked.activity]).toEqual(['active', 'parked']);
  });

  it('does not update an entity instantiated in request handling, nor count it active, until its next update', () => {
    // Instantiation itself is subtask 07's spawn request; the stand-in allocates as request handling ends.
    const state = testState();
    let late: Entity | undefined;
    const activeAtMovement: boolean[] = [];
    runTickWith(state, {
      movement: () => {
        late = state.entities.allocate(entityInit(5));
        activeAtMovement.push(isActiveState(late.state));
      },
    });
    expect(late!.state).toBe('presentation-ready');
    runTickWith(state, { movement: () => void activeAtMovement.push(isActiveState(late!.state)) });
    expect(activeAtMovement).toEqual([false, true]);
  });

  it('removes an entity marked before its update in the same tick', () => {
    const [state, [entity, other]] = withEntities([3], [3]);
    runTickWith(state, { 'mission-flow': () => void (entity.state = 'pending-removal') });
    expect(state.entities.get(entity.id)).toBeUndefined();
    expect([...state.entities.byId()]).toEqual([other]);
  });

  it.each([
    ['in request handling', 'spawn-queue-check', ({ requests }: TickContext, entity: Entity): void => requests.post(setState(entity, 'pending-removal'))],
    ['after request handling', 'movement', (_: TickContext, entity: Entity): void => void (entity.state = 'pending-removal')],
  ] as const)('removes an entity marked %s at the next tick, keeping it listed meanwhile', (_, stage, mark) => {
    const [state, [entity]] = withEntities([3]);
    entity.state = 'active';
    runTickWith(state, { [stage]: (context: TickContext) => mark(context, entity) });
    expect(entity.state).toBe('pending-removal');
    expect([...state.entities.walk(1 << 3)]).toEqual([entity]);
    runTickWith(state);
    expect(state.entities.get(entity.id)).toBeUndefined();
    expect([...state.entities.walk(1 << 3)]).toEqual([]);
  });

  it('clears the player reference when it removes the player, and only then', () => {
    const [state, [player, other, sameKind]] = withEntities([0], [6], [0]);
    state.player.entityId = player.id;
    other.state = 'pending-removal';
    sameKind.state = 'pending-removal';
    runTickWith(state);
    expect(state.player.entityId).toBe(player.id);
    player.state = 'pending-removal';
    runTickWith(state);
    expect(state.player.entityId).toBeNull();
    expect(state.entities.size).toBe(0);
    expect(state.entities.nextId).toBe(4);
  });

  it.each([
    ['active', 'parked', 'new'],
    ['docked', 'parked', 'new'],
    ['parked', 'active', 'presentation-ready'],
  ] as const)('switches a %s entity in area-switch to %s, state %s, in request handling', (from, to, startState) => {
    const [state, [entity]] = withEntities([7]);
    entity.activity = from;
    entity.state = 'area-switch';
    runTickWith(state);
    expect([entity.activity, entity.state]).toEqual([to, startState]);
    expect(state.entities.get(entity.id)).toBe(entity);
    runTickWith(state);
    expect([entity.activity, entity.state]).toEqual([to, 'active']);
  });

  it('removes an entity whose leave request finds it in any state but area-switch', () => {
    const [state, [entity]] = withEntities([7]);
    entity.state = 'area-switch';
    // Handled before the leave request the entity's own update posts.
    runTickWith(state, { 'mission-flow': ({ requests }) => requests.post(setState(entity, 'active')) });
    expect(state.entities.get(entity.id)).toBeUndefined();
  });

  it('never updates a destroyed source and never removes a destroyed entity', () => {
    const [state, [source, destroyed, reviving]] = withEntities([8], [8], [8]);
    source.state = 'destroyed-source';
    destroyed.state = 'active';
    destroyed.destroyed = true;
    reviving.destroyed = true;
    for (let tick = 0; tick < 3; tick++) runTickWith(state);
    expect([...state.entities.byId()]).toEqual([source, destroyed, reviving]);
    expect([source.state, destroyed.state, reviving.state]).toEqual(['destroyed-source', 'active', 'active']);
  });

  it('treats an active entity left in state new as a broken invariant', () => {
    const [state, [entity]] = withEntities([2]);
    entity.state = 'new';
    expectFault(() => runTickWith(state), 'invariant-violated', 'object-update.new');
  });
});
