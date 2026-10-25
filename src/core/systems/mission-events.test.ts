import { describe, expect, it } from 'vitest';
import type { DomainEvent, EntitySource } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, sliceMission, worldInput } from '../world/create-world.test-support.ts';
import type { Entity, EntityInit } from '../world/entity-table.ts';
import { constructWorld } from '../world/world.ts';
import { entityInit, expectFault, tickInput, withEveryKindBound } from '../world/world.test-support.ts';
import type { MissionEventCounts, WorldState } from '../world/world-state.ts';
import { updateParked } from './area.ts';
import { applyContactDamage, applyShotHit } from './damage.ts';
import { reportObjectEvent } from './mission-events.ts';
import { registerTick, type TickContext } from './pipeline.ts';

// docs/plan/p3/02/spec.md, ME-04 and ME-08 (0x6977c's counters); docs/original/formats/executable.md, object events
// 0x6977c (P3-11/02). The slice-shaped mission (create-world.test-support.ts) gets two triggers, the content's maximum:
// the player's record 0, record 3 (two craft of kind 7) and record 8 (35 craft of kind 14) count on trigger 0, the group
// members 4 (kind 7, group 0) and 6 (kind 8, group 1) on trigger 1; the four bases of record 7 and the wingman on none.
// Expected counts come from these declarations, not from the code.

const ALL_KINDS = 0xffffffff;
const IMPACT = Object.freeze({ point: Object.freeze({ x: 0, y: 0, z: 0 }), local: Object.freeze({ x: 0, y: 0, z: -1 }), face: 0 });

function eventSliceMission() {
  const mission = sliceMission();
  mission.declarations[0].eventTrigger = 0;
  mission.declarations[3].eventTrigger = 0;
  mission.declarations[8].eventTrigger = 0;
  mission.declarations[4].eventTrigger = 1;
  mission.declarations[6].eventTrigger = 1;
  const ranges = [{ lower: 0, upper: 100, messages: [], summarySelector: 0 }];
  mission.eventTriggers = [{ ranges }, { ranges }];
  return mission;
}

const newState = (): WorldState => withEveryKindBound(initialWorldState(asCreateInput(worldInput({ mission: eventSliceMission(), run: { wingman: 0 } }))));

const counts = (instantiated: number, destroyed: number, left: number): MissionEventCounts => ({ instantiated, destroyed, left });
const sourced = (state: WorldState, collection: EntitySource['collection'], index: number): Entity[] =>
  [...state.entities.walk(ALL_KINDS)].filter(({ source }) => source?.collection === collection && source.index === index);

/** The world after its first step, which instantiates every entry due at 0 (all but group 2, at 300 s). */
function stepped(): { readonly state: WorldState; readonly events: readonly DomainEvent[] } {
  const state = newState();
  const events = constructWorld(state).step(tickInput());
  return { state, events };
}

/** A tick's context outside a step, standing in the collision stage, where these tests' destructions build their explosions (P3-12 FS-03). */
const contextOf = (state: WorldState): TickContext => Object.assign(registerTick(state, readTickInput(tickInput())), { stage: 'collision' as const });

function weaken(entity: Entity): CraftEntity {
  const craft = entity as CraftEntity;
  Object.assign(craft.combat, { shield: 0, hull: 1 });
  return craft;
}

describe('object event 0x6977c: instantiation (ME-08, type 3)', () => {
  it('counts each instantiated object on its own declaration\'s trigger, group members by their member record, the player too', () => {
    const { state, events } = stepped();
    expect(sourced(state, 'mission', 3)).toHaveLength(2);
    expect(sourced(state, 'mission', 8)).toHaveLength(35);
    expect(sourced(state, 'mission', 4)).toHaveLength(4);
    expect(sourced(state, 'mission', 6)).toHaveLength(4);
    expect(sourced(state, 'mission', 7)).toHaveLength(4);
    expect(sourced(state, 'wingman', 0)).toHaveLength(1);
    expect(state.missionEvents.triggers).toEqual([counts(1 + 2 + 35, 0, 0), counts(2 * 2 + 2 * 2, 0, 0)]);
    // One object-instantiated per object, and the counter has no event of its own (ME-13).
    expect(events.filter(({ type }) => type === 'object-instantiated')).toHaveLength(1 + 2 + 35 + 4 + 4 + 4 + 1);
    expect(events.filter(({ type }) => type === 'all-clear')).toEqual([]);
  });

  it('keeps every counter at 0 without event triggers', () => {
    const state = withEveryKindBound(initialWorldState(asCreateInput(worldInput({ run: { wingman: 0 } }))));
    constructWorld(state).step(tickInput());
    expect(state.entities.size).toBeGreaterThan(40);
    expect(state.missionEvents.triggers).toEqual([]);
  });
});

describe('object event 0x6977c: destruction (ME-08, types 0 and 1)', () => {
  it('counts a destruction once, by the player or otherwise, after object-destroyed; sourceless objects never count', () => {
    const { state } = stepped();
    const context = contextOf(state);
    const playerId = state.player.entityId!;
    const [first, second] = sourced(state, 'mission', 3).map(weaken);
    const member = weaken(sourced(state, 'mission', 4)[0]);
    const base = weaken(sourced(state, 'mission', 7)[0]);
    const bare = (kindBit: number, overrides: Partial<EntityInit> = {}) => weaken(state.entities.allocate(entityInit(kindBit, overrides)));
    const sourceless = bare(7);
    const transponder = bare(14);
    const projectile = state.entities.allocate(entityInit(21, { combat: { type: 'projectile', gun: 0, shooter: playerId, expiry: null } }));

    // The player's kill (class 0), then a hit on the destroyed craft, which does nothing.
    expect(applyShotHit(context, projectile, first, 5, IMPACT)).not.toBeNull();
    expect(applyShotHit(context, projectile, first, 5, IMPACT)).toBeNull();
    // A collision below 0 (class 1): 0x3c0f4 runs twice, the object event once; a second contact does nothing.
    applyContactDamage(context, second, 5, 'collision');
    applyContactDamage(context, second, 5, 'collision');
    applyContactDamage(context, member, 5, 'area');
    for (const victim of [base, sourceless, transponder]) applyContactDamage(context, victim, 5, 'collision');
    applyContactDamage(context, weaken(state.entities.get(playerId)!), 5, 'collision');

    const destroyed = context.events.filter((event) => event.type === 'object-destroyed');
    expect(destroyed.map((event) => [event.entityId, event.eventClass])).toEqual([
      [first.id, 0], [second.id, 1], [member.id, 1], [base.id, 1], [sourceless.id, 1], [transponder.id, 1], [playerId, 1],
    ]);
    // Trigger 0: the player's kill of `first`, the collision of `second` and the player's own destruction.
    expect(state.missionEvents.triggers).toEqual([counts(38, 3, 0), counts(8, 1, 0)]);
  });
});

describe('object event 0x6977c: the world exit (ME-08, type 2)', () => {
  /** A drained world with parked craft at `position`, in AI mode 0 heading for it. */
  function parkedAt(state: WorldState, kindBit: number, source: EntitySource | null, position = { x: 44900.25, y: 0, z: -1e6 }): Entity {
    const entity = state.entities.allocate(entityInit(kindBit, { activity: 'parked', position, source }));
    entity.state = 'active';
    entity.ai = { ...entity.ai, mode: 0, goal: position };
    return entity;
  }

  it('counts a world exit once on the leaving object\'s trigger, never the wingman\'s, and the removal that follows adds nothing', () => {
    const state = newState();
    state.spawn.queue.length = 0;
    const world = constructWorld(state);
    const leaving = parkedAt(state, 7, { collection: 'mission', index: 3, group: null });
    const member = parkedAt(state, 7, { collection: 'mission', index: 4, group: { index: 0, request: 0, member: 1 } });
    const uncounted = parkedAt(state, 17, { collection: 'mission', index: 7, group: null });
    const sourceless = parkedAt(state, 8, null);
    const wingman = parkedAt(state, 1, { collection: 'wingman', index: 0, group: null });
    const inside = parkedAt(state, 7, { collection: 'mission', index: 3, group: null }, { x: -44900, y: 44900, z: 0 });

    // The parked update at clock 200, when every entity last updated at clock 0 is due.
    state.clock = 198;
    state.tick = 99;
    const context = registerTick(state, readTickInput(tickInput()));
    state.clock = 200;
    state.tick = context.time.tick;
    updateParked(context, () => {});
    const left = context.events.filter((event) => event.type === 'object-left-world').map(({ entityId }) => entityId);
    // The update walks the kind lists in kind order.
    expect(left).toEqual([leaving.id, member.id, sourceless.id, uncounted.id]);
    expect([wingman.state, inside.state]).toEqual(['active', 'active']);
    expect(state.missionEvents.triggers).toEqual([counts(0, 0, 1), counts(0, 0, 1)]);

    world.step(tickInput());
    expect(left.map((id) => state.entities.get(id))).toEqual([undefined, undefined, undefined, undefined]);
    expect(state.missionEvents.triggers).toEqual([counts(0, 0, 1), counts(0, 0, 1)]);
  });
});

describe('object event 0x6977c: bounds (ME-04)', () => {
  it('faults instead of leaving the i32 range', () => {
    const { state } = stepped();
    const [craft] = sourced(state, 'mission', 3);
    state.missionEvents.triggers[0].left = 0x7fff_fffe;
    reportObjectEvent(contextOf(state), craft, 2);
    expect(state.missionEvents.triggers[0].left).toBe(0x7fff_ffff);
    expectFault(() => reportObjectEvent(contextOf(state), craft, 2), 'invariant-violated', 'mission-events.count');
    expect(state.missionEvents.triggers[0].left).toBe(0x7fff_ffff);
  });
});
