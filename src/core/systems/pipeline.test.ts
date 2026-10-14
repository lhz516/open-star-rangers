import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import { rotateRows } from '../rules/flight-motion.ts';
import { isActiveState, type Entity } from '../world/entity-table.ts';
import { initialPlayerControl } from '../world/player-state.ts';
import { addPlayerEntity, entityInit, expectFault, stateText, TEST_ORIENTATION, testState, tickInput } from '../world/world.test-support.ts';
import { initialPlayerTargeting } from '../world/player-state.ts';
import type { WorldState } from '../world/world-state.ts';
import { collisionStage } from './collision.ts';
import { delayedPlayerExplosionStage } from './destruction.ts';
import { frameEndStage } from './displays.ts';
import { energyStage } from './energy.ts';
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

/** Gives a missile the G of one that has detonated (phase 4), so that its state-7 callback does nothing more (P3-07/20). */
function spendGuidance(missile: Entity): void {
  Object.assign(missile.combat, {
    guidance: { phase: 4, lifetimeClock: 0, armClock: 0, fuseRadiusSquared: 0, detonationClock: 0, checkInterval: 0, nextCheckClock: 0 },
  });
}

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

  it('implements only the stages P3-02, P3-06, P3-07 and P3-09 own and fakes no rule system', () => {
    expect(PIPELINE.filter(({ run }) => run !== null).map(({ id }) => id)).toEqual([
      'input-registration', 'clock', 'object-update', 'spawn-queue-check', 'request-handling', 'movement', 'collision', 'delayed-player-explosion', 'energy',
      'object-sets', 'parked-update', 'warp-completion', 'area-check', 'frame-end', 'commit',
    ]);
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
  /** The subject of a leave request; the tests post no other kind. */
  const subject = (posted: Request): number => (posted.type === 'leave' ? posted.entityId : Number.NaN);

  it('handles requests in posting order, then those posted while handling', () => {
    const queue = new RequestQueue();
    queue.post(request(1));
    queue.post(request(2));
    const handled: number[] = [];
    queue.handle((posted) => {
      const entityId = subject(posted);
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
    queue.handle((posted) => handled.push(subject(posted)));
    queue.post(request(2));
    expectFault(() => queue.handle((posted) => handled.push(subject(posted))), 'invariant-violated', 'pipeline.requests-handled');
    expect(handled).toEqual([1]);
  });

  it('takes at most CORE_LIMITS.requestsPerTick posts in a tick, late ones included, a budget fault beyond', () => {
    const queue = new RequestQueue();
    for (let count = 0; count < CORE_LIMITS.requestsPerTick - 1; count++) queue.post(request(count + 1));
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

  it('starts the command view from the view committed at the object update, and commits a toggle in request handling (MW-04)', () => {
    const state = testState();
    const player = addPlayerEntity(state);
    player.state = 'active';
    const seen: [string, number, number][] = [];
    const record = (stage: string) => ({ world, commandView }: TickContext) => void seen.push([stage, world.player.viewMode, commandView.viewMode]);
    runTickWith(state, {
      // A view change before the object update, as P3-11's mission flow may make, is where the batch starts.
      'mission-flow': ({ world }) => void (world.player.viewMode = 8),
      'communications-reply': record('communications-reply'),
      movement: record('movement'),
    }, [{ type: 'toggle-map' }]);
    expect(seen).toEqual([['communications-reply', 8, 0x0c], ['movement', 0x0c, 0x0c]]);
    expect(state.player.previousViewMode).toBe(8);
  });

  it('handles requests in posting order: mission flow, object updates, then the spawn queue check', () => {
    const [state, [early, updated]] = withEntities([3], [1]);
    addPlayerEntity(state);
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
    addPlayerEntity(state);
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
    // A stand-in allocates as request handling ends; spawn.test.ts covers the real spawn requests.
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

  it('clears the player reference, target and control state when it removes the player, and only then', () => {
    const [state, [player, other, sameKind]] = withEntities([0], [6], [0]);
    const target = state.entities.allocate(entityInit(7, { activity: 'parked' }));
    state.player.entityId = player.id;
    state.player.target = target.id;
    state.player.control = initialPlayerControl(0);
    other.state = 'pending-removal';
    sameKind.state = 'pending-removal';
    runTickWith(state);
    expect(state.player).toMatchObject({ entityId: player.id, target: target.id, control: initialPlayerControl(0) });
    player.state = 'pending-removal';
    target.state = 'pending-removal';
    runTickWith(state);
    expect(state.player).toMatchObject({ entityId: null, target: null, control: null });
    expect(state.entities.size).toBe(0);
    expect(state.entities.nextId).toBe(5);
  });

  it.each([
    ['active', 'parked', 'new'],
    ['docked', 'parked', 'new'],
    ['parked', 'active', 'presentation-ready'],
  ] as const)('switches a %s entity in area-switch to %s, state %s, in request handling', (from, to, startState) => {
    const [state, [entity]] = withEntities([7, { activity: from === 'parked' ? 'parked' : 'active' }]);
    // A resumed entity stays active near a player; a parked one stays parked without a player entity.
    if (to === 'active') addPlayerEntity(state);
    entity.activity = from;
    entity.state = 'area-switch';
    runTickWith(state);
    expect([entity.activity, entity.state]).toEqual([to, startState]);
    expect(entity.movement === null).toBe(to === 'parked');
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

describe('P3-07 access points (P3-07 S-01, AC-01; P3-02 CR-05, CR-07)', () => {
  const stageRun = (id: string) => PIPELINE.find((stage) => stage.id === id)!.run;

  it('reads the runs of its stages from their rule modules', () => {
    expect([stageRun('collision'), stageRun('delayed-player-explosion'), stageRun('energy')])
      .toEqual([collisionStage, delayedPlayerExplosionStage, energyStage]);
    expect([typeof collisionStage, typeof delayedPlayerExplosionStage, typeof energyStage, typeof frameEndStage]).toEqual(['function', 'function', 'function', 'function']);
  });

  /** A craft (1), a missile (2) that has detonated, a projectile (3), a fragment (4) and an explosion (5), all active. */
  function runtimeKinds(): [WorldState, Entity[]] {
    const [state, entities] = withEntities([7], [20], [21], [24], [22]);
    for (const entity of entities) entity.state = 'active';
    spendGuidance(entities[1]);
    return [state, entities];
  }

  const control = { scale: 1, axes: [{ clear: false, set: true, value: 0.5 }, { clear: true, set: false, value: 0 }, { clear: false, set: false, value: 0 }], speedFactor: null } as const;
  it.each([
    ['select-target', { type: 'select-target', entityId: 1, target: 2, targetKindBit: 20, origin: 'command', commandIndex: 0 }, 'targeting.select-target'],
    ['a craft\'s expiry', { type: 'expire', entityId: 1 }, 'requests.expire'],
    ['an explosion\'s expiry', { type: 'expire', entityId: 5 }, 'requests.expire'],
  ] as [string, Request, string][])('routes %s to its module in request handling, which no rule posts yet', (_, request, site) => {
    const [state] = runtimeKinds();
    expectFault(() => runTickWith(state, { 'mission-flow': ({ requests }) => requests.post(request) }), 'invariant-violated', site);
  });

  it('routes steer to missiles.ts (P3-07/20): 0x21fd8 on the missile\'s block with its body record, before the movement (P3-07/22)', () => {
    const [state, [missile]] = withEntities([20]);
    missile.state = 'active';
    spendGuidance(missile);
    let block: unknown = null;
    runTickWith(state, {
      'mission-flow': ({ requests }) => requests.post({ type: 'steer', entityId: missile.id, control }),
      movement: () => void (block = structuredClone(missile.movement)),
    });
    // Row 1 set to 0.5 at scale 1: F(body +0xAC (1) × −1 × 0.5); row 2 cleared: yaw's rate 0 and its flag kept; row 3 untouched.
    expect(block).toMatchObject({ steering: { pitch: { rate: -0.5, enabled: true }, yaw: { rate: 0, enabled: false }, roll: { rate: 0, enabled: false } } });
    // The same tick's movement integrates the block with the body record: body +0xC8 ≠ 0 makes the turn factor the step,
    // so pitch turns rows 2 and 3 by F(−0.5 × 1/32) (CR-09, executable.md 0x222f0).
    const turned = rotateRows(TEST_ORIENTATION, 'pitch', Math.fround(-0.5 / 32));
    expect(missile.orientation).toEqual(turned);
  });

  it('routes a missile\'s expiry to missiles.ts (P3-07/20): it fizzles, emits missile-ended and leaves at its next update', () => {
    const [state, [missile]] = withEntities([20]);
    missile.state = 'active';
    spendGuidance(missile);
    expect(runTickWith(state, { 'mission-flow': ({ requests }) => requests.post({ type: 'expire', entityId: missile.id }) })).toMatchObject([
      { type: 'missile-ended', entityId: missile.id, shooterEntityId: null, outcome: 'fizzled' },
    ]);
    expect(missile.state).toBe('pending-removal');
    runTickWith(state);
    expect(state.entities.size).toBe(0);
  });

  it('routes a projectile\'s expiry to projectiles.ts (P3-07/17): pending removal, its shooter let go', () => {
    const [state, [projectile]] = withEntities([21, { combat: { type: 'projectile', gun: 0, shooter: 7, expiry: null } }]);
    projectile.state = 'active';
    runTickWith(state, { 'mission-flow': ({ requests }) => requests.post({ type: 'expire', entityId: projectile.id }) });
    expect(projectile.state).toBe('pending-removal');
    expect(projectile.combat).toMatchObject({ shooter: null });
  });

  it('drops a new request whose subject is gone, as every request', () => {
    const [state] = withEntities([7]);
    const [reference] = withEntities([7]);
    runTickWith(state, { 'mission-flow': ({ requests }) => ['expire', 'release-held'].forEach((type) => requests.post({ type, entityId: 99 } as Request)) });
    runTickWith(reference);
    expect(stateText(state)).toBe(stateText(reference));
  });

  it('routes the own updates of missiles and projectiles to their modules: state 7 at once, removal from pending removal (explosions and fragments: destruction.test.ts)', () => {
    const [state, entities] = withEntities([20], [21]);
    // The synthetic missile records have a negative lifetime, which a new G rejects; G is made once, so this missile's
    // first callback only asks for state 7.
    spendGuidance(entities[0]);
    const atMovement: string[] = [];
    const before = entities.map(({ position }) => position);
    runTickWith(state, { movement: () => void atMovement.push(...entities.map(({ state: objectState }) => objectState)) });
    expect(atMovement).toEqual(['active', 'active']);
    // Both move in the tick that activates them: the missile by mode 0 with its body record (P3-07/22), at its block's
    // speed 48 along row 3 (0, 0, 1) of TEST_ORIENTATION for 1/32 s; the projectile's block is at rest.
    expect(entities.map(({ position }) => position)).toEqual([{ ...before[0], z: before[0].z + 1.5 }, before[1]]);
    for (const entity of entities) entity.state = 'pending-removal';
    runTickWith(state);
    expect(state.entities.size).toBe(0);
  });

  it('moves kind 21\'s and 22\'s linear blocks and kind 24\'s spinning block in the movement stage (P3-07/35)', () => {
    const [state, entities] = withEntities([21], [22], [24]);
    for (const entity of entities) {
      entity.state = 'active';
      Object.assign(entity.movement!, { velocity: { x: 0, y: 0, z: 64 } });
    }
    // An active explosion has been activated, or its update faults in request handling first.
    Object.assign(entities[1].combat, { activationClock: 0, removalAfterClock: 0x60 });
    const before = entities.map(({ position }) => position);
    runTickWith(state);
    // 64 units per second for 2/64 s; the linear blocks keep the position before the move.
    expect(entities.map(({ position }) => position)).toEqual(before.map(({ x, y, z }) => ({ x, y, z: z + 2 })));
    expect(entities.slice(0, 2).map(({ movement }) => movement)).toMatchObject(before.slice(0, 2).map((previousPosition) => ({ mode: 'linear', previousPosition })));
  });

  it('clears the player\'s targeting state with its entity, together with P3-06\'s target', () => {
    const [state, [player, target]] = withEntities([0], [7]);
    // In an external view (0x13), whose layout has no right display to clear the target that is gone (CR-10).
    Object.assign(state.player, { entityId: player.id, target: target.id, targeting: initialPlayerTargeting(), viewMode: 0x13 });
    target.state = 'pending-removal';
    expect(runTickWith(state)).toEqual([]);
    expect(state.player).toMatchObject({ entityId: player.id, target: target.id, targeting: { mode: 'enemy', autoTargetDueClock: 0 } });
    player.state = 'pending-removal';
    expect(runTickWith(state)).toEqual([]);
    expect(state.player).toMatchObject({ entityId: null, target: null, targeting: null });
  });
});

describe('pending requests (P3-07 CR-05)', () => {
  const request = (entityId: number): Request => ({ type: 'leave', entityId });
  const isLeave = (posted: Request): posted is Extract<Request, { type: 'leave' }> => posted.type === 'leave';
  const lastPending = (queue: RequestQueue): number | undefined => queue.findLastPending(isLeave)?.entityId;

  it('finds the last matching request not taken yet, and none once handling is over', () => {
    const queue = new RequestQueue();
    expect(lastPending(queue)).toBeUndefined();
    queue.post(request(1));
    queue.post(request(2));
    queue.post({ type: 'set-state', entityId: 3, state: 'active' });
    expect(lastPending(queue)).toBe(2);
    const seen: (number | undefined)[] = [];
    queue.handle((posted) => {
      seen.push(lastPending(queue));
      if (posted.type === 'leave' && posted.entityId === 1) queue.post(request(4));
    });
    expect(seen).toEqual([2, 4, 4, undefined]);
    expect(lastPending(queue)).toBeUndefined();
    queue.post(request(5));
    expect(lastPending(queue)).toBeUndefined();
  });

  it('holds a deferred request, counted at once, until release appends the held ones in order (CR-07)', () => {
    const queue = new RequestQueue();
    queue.post(request(1));
    queue.defer(request(2));
    queue.defer(request(3));
    queue.post(request(4));
    expect(lastPending(queue)).toBe(4);
    queue.release();
    expect(lastPending(queue)).toBe(3);
    const handled: number[] = [];
    queue.handle((posted) => void (isLeave(posted) && handled.push(posted.entityId)));
    expect(handled).toEqual([1, 4, 2, 3]);
    const full = new RequestQueue();
    for (let count = 0; count < CORE_LIMITS.requestsPerTick - 1; count++) full.post(request(count + 1));
    full.defer(request(0));
    expectFault(() => full.post(request(0)), 'budget-exhausted', 'pipeline.requests');
  });

  it('faults when handling finds a request still held', () => {
    const queue = new RequestQueue();
    queue.defer(request(1));
    expectFault(() => queue.handle(() => {}), 'invariant-violated', 'pipeline.requests-deferred');
  });
});
