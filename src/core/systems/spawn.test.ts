import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import type { DomainEvent, ObjectInstantiatedEvent } from '../contracts/domain-events.ts';
import { expectedRectangle, expectedWorld, float32OfDouble } from '../rules/derivation.test-support.ts';
import { RandStream } from '../rules/original-random.ts';
import { randValues, rngStateAfter } from '../rules/rand.test-support.ts';
import { initialWorldState } from '../world/create-world.ts';
import {
  asCreateInput, craftInfoContent, declaration, MARKER, missionFrame, modelOf, playerOnlyMission, rosterContent, ruleInputs, sliceMission,
  worldInput, type MissionDraft, type WorldInputParts,
} from '../world/create-world.test-support.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import { isActiveState, type Entity } from '../world/entity-table.ts';
import { constructWorld, type World } from '../world/world.ts';
import { recordOf, thrownBy, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { PIPELINE, registerTick } from './pipeline.ts';
import { disableSpawning, isSpawningEnabled, pendingSpawns, placeWorldRecord } from './spawn.ts';

// Expectations are written out from Q-01–Q-07 (docs/original/formats/executable.md, P3-02/02–03, and the selected
// mission's instantiation list in scenario.md) and the revised Q-11 decision (goal 执行记录: f32 stores round to
// nearest). Random values come from the world's Mulberry32 state directly: the original's rand() is the top 15 bits of
// each 32-bit draw.

const Q = 1.875;
/** f32(0.70710677), bits 0x3F3504F3, read independently of the code under test. */
const C = (() => {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, 0x3f3504f3);
  return view.getFloat32(0);
})();

function setUp(parts: WorldInputParts = {}): { readonly state: WorldState; readonly world: World } {
  const state = initialWorldState(asCreateInput(worldInput(parts)));
  return { state, world: constructWorld(state) };
}

const instantiated = (events: readonly DomainEvent[]): ObjectInstantiatedEvent[] =>
  events.filter((event): event is ObjectInstantiatedEvent => event.type === 'object-instantiated');

function stepTo(world: World, state: WorldState, tick: number): ObjectInstantiatedEvent[] {
  const events: ObjectInstantiatedEvent[] = [];
  while (state.tick < tick) events.push(...instantiated(world.step(tickInput())));
  return events;
}

const entities = (state: WorldState): Entity[] => [...state.entities.byId()];
const mission = (index: number, group: { index: number; request: number; member: number } | null = null) => ({ collection: 'mission', index, group });

/** A record of kind bit `craftType` at a stored reference position. */
const stored = (index: number, craftType: number, x: number, y: number, overrides: Record<string, unknown> = {}) =>
  declaration(index, { craftType, position: { x, y, z: 0 }, ...overrides });

describe('spawn timing (P3-02 AC-03, R-01 units)', () => {
  /** The player at 0 s, record 1 at 1 s and record 2 at 3 s, all at stored positions. */
  function timedMission(): MissionDraft {
    const m = playerOnlyMission();
    m.declarations.push(stored(1, 7, 400, 0, { spawnTime: 1 }), stored(2, 8, 0, 400, { spawnTime: 3 }));
    return m;
  }

  it.each([2, 4])('instantiates an item due at T seconds on the first tick whose clock exceeds 64T, at %i units per tick', (units) => {
    const { state, world } = setUp({ mission: timedMission(), run: { clockUnitsPerTick: units } });
    const seen = new Map<number, number>();
    while (state.tick < 100) {
      for (const event of instantiated(world.step(tickInput()))) seen.set(event.source.index, event.tick);
    }
    // T = 0 at tick 1; tick n has clock n × units, so the first n with n × units > 64T is ⌊64T ÷ units⌋ + 1.
    expect(seen).toEqual(new Map([[0, 1], [1, units === 2 ? 33 : 17], [2, units === 2 ? 97 : 49]]));
  });
});

describe('instantiation of the slice-shaped mission (P3-02 AC-05, R-02 scheduling)', () => {
  /** [source declaration, kind bit, group membership] in instantiation order at tick 1, without a wingman. */
  function openingOrder(): [number, number, { index: number; request: number; member: number } | null][] {
    const rows: [number, number, { index: number; request: number; member: number } | null][] = [[0, 0, null]];
    for (let count = 0; count < 2; count++) rows.push([3, 7, null]);
    for (let count = 0; count < 4; count++) rows.push([7, 17, null]);
    for (let count = 0; count < 35; count++) rows.push([8, 14, null]);
    for (const [group, member, kindBit] of [[0, 4, 7], [1, 6, 8]]) {
      for (let request = 0; request < 2; request++) {
        for (let position = 0; position < 2; position++) rows.push([member, kindBit, { index: group, request, member: position }]);
      }
    }
    return rows;
  }

  it('instantiates rows 1–7 at tick 1 and group 2 at the first tick past 19,200 units, in queue order with IDs from 1', () => {
    // 64 units per tick: group 2 is due at tick 301, the first whose clock (19,264) exceeds 19,200.
    const { state, world } = setUp({ run: { clockUnitsPerTick: 64 } });
    const first = instantiated(world.step(tickInput()));
    expect(first.map(({ tick, entityId, kindBit, source }) => [tick, entityId, kindBit, source])).toEqual(
      openingOrder().map(([index, kindBit, group], at) => [1, at + 1, kindBit, mission(index, group)]),
    );
    // An entity removed meanwhile keeps its ID unused, and counts do not fall.
    state.entities.get(5)!.state = 'pending-removal';
    expect(stepTo(world, state, 300)).toEqual([]);
    expect(state.entities.get(5)).toBeUndefined();
    const late = stepTo(world, state, 301);
    expect(late.map(({ tick, entityId, kindBit, source }) => [tick, entityId, kindBit, source])).toEqual(
      [0, 1, 2].flatMap((request) => [0, 1].map((member, at) => [301, 51 + request * 2 + at, 7, mission(5, { index: 2, request, member })])),
    );
    expect(state.spawn.queue).toEqual([]);
    const kinds = new Map<number, number>();
    for (const { kindBit } of [...first, ...late]) kinds.set(kindBit, (kinds.get(kindBit) ?? 0) + 1);
    expect(kinds).toEqual(new Map([[0, 1], [7, 12], [17, 4], [14, 35], [8, 4]]));
    expect(state.spawn.records.map(({ spawnCount }) => spawnCount)).toEqual([1, 0, 0, 2, 0, 0, 0, 4, 35]);
    expect(state.spawn.groups.map(({ spawnCount, leader }) => [spawnCount, leader])).toEqual([[2, 45], [2, 49], [3, 55]]);
  });

  it('describes every object in its event: ID, kind, namespaced source and a detached position, in instantiation order', () => {
    const { state, world } = setUp();
    const events = world.step(tickInput());
    expect(deepFrozen(events)).toBe(true);
    for (const event of instantiated(events)) {
      const entity = state.entities.get(event.entityId)!;
      expect(event).toEqual({ type: 'object-instantiated', tick: 1, entityId: entity.id, kindBit: entity.kindBit, source: entity.source, position: entity.position });
      expect(event.position).not.toBe(entity.position);
    }
  });

  it('names the player, kinds 0x80 and 0x4000 by craft type and the four 0x20000 craft by candidates 0–3', () => {
    const { state, world } = setUp();
    world.step(tickInput());
    const names = entities(state).map(({ name }) => name);
    expect(names[0]).toEqual({ type: 'craft-type', kindBit: 0 });
    expect(names.slice(1, 3)).toEqual([{ type: 'craft-type', kindBit: 7 }, { type: 'craft-type', kindBit: 7 }]);
    expect(names.slice(3, 7)).toEqual([0, 1, 2, 3].map((candidate) => ({ type: 'candidate', declaration: { collection: 'mission', index: 7 }, candidate })));
    expect(new Set(names.slice(7, 42).map((name) => JSON.stringify(name)))).toEqual(new Set([JSON.stringify({ type: 'craft-type', kindBit: 14 })]));
    expect(names.slice(42)).toEqual([...Array(4).fill({ type: 'craft-type', kindBit: 7 }), ...Array(4).fill({ type: 'craft-type', kindBit: 8 })]);
  });

  it('places each group cycle at its anchor plus the layout offset, with the anchor\'s attitude, parked far from the player', () => {
    const { state, world } = setUp();
    world.step(tickInput());
    for (const [leader, follower] of [[43, 44], [45, 46], [47, 48], [49, 50]]) {
      const anchor = state.entities.get(leader)!;
      const member = state.entities.get(follower)!;
      expect(member.position).toEqual({ x: float32OfDouble(anchor.position.x + 250, 'nearest'), y: anchor.position.y, z: anchor.position.z });
      expect(member.orientation).toEqual(anchor.orientation);
      expect([anchor.activity, member.activity]).toEqual(['parked', 'parked']);
      // Rectangle 1, 30000–37500 on both axes: the attitude faces away from the centre along (+, +).
      expect(anchor.orientation).toEqual([-C, C, 0, 0, 0, 1, C, C, 0]);
    }
    expect(state.entities.get(1)!.activity).toBe('active');
    expect([2, 3].map((id) => state.entities.get(id)!.activity)).toEqual(['active', 'active']);
  });

  it('gives each object its record\'s rule inputs after the build\'s defaults, its side and its interaction category', () => {
    const { state, world } = setUp();
    world.step(tickInput());
    // The build draws +0x78 for records 0, 1, 2, 4, 5, 6, 7 and 8 in that order; record 3's is 30. +0x70 and +0x74
    // default to (0 + 3) × 1, except the player's +0x70 of 6; +0x60–+0x68 to 100.
    const draws = randValues(0x1234_5678, 8).map((value) => (value % 60) + 20);
    const aiValueC = new Map([[0, draws[0]], [3, 30], [4, draws[3]], [6, draws[5]], [7, draws[6]], [8, draws[7]]]);
    const binding = new Map([[0, ['player', false]], [7, ['enemy', false]], [8, ['enemy', false]], [14, ['friendly', false]], [17, ['friendly', true]]]);
    for (const entity of entities(state)) {
      const index = entity.source!.index;
      expect(entity.ruleInputs).toEqual({ percentB: 100, percentC: 100, percentD: 100, aiValueA: index === 0 ? 6 : 3, aiValueB: 3, aiValueC: aiValueC.get(index) });
      expect([entity.side, entity.baseInteraction]).toEqual(binding.get(entity.kindBit));
    }
  });

  it('instantiates in request handling: no object takes part in the stages after it, nor gets an update, in that tick', () => {
    const { state, world } = setUp();
    const context = registerTick(state, readTickInput(tickInput()));
    const seen: Record<string, number> = {};
    for (const stage of PIPELINE) {
      if (stage.id === 'request-handling') seen.before = state.entities.size;
      stage.run?.(context);
      if (stage.id === 'request-handling') seen.after = state.entities.size;
      if (stage.id === 'movement') seen.activeAtMovement = entities(state).filter(({ state: objectState }) => isActiveState(objectState)).length;
    }
    expect(seen).toEqual({ before: 0, after: 50, activeAtMovement: 0 });
    expect(instantiated(context.events)).toHaveLength(50);
    expect(new Set(entities(state).map(({ activity, state: objectState }) => `${activity}/${objectState}`))).toEqual(new Set(['active/presentation-ready', 'parked/new']));
    world.step(tickInput());
    expect(new Set(entities(state).map(({ state: objectState }) => objectState))).toEqual(new Set(['active']));
  });
});

describe('spawn enable flag and queue queries (P3-02 AC-05; P3-11 interfaces)', () => {
  it('instantiates nothing once spawning is disabled, keeping the queue for the pending query', () => {
    const { state, world } = setUp({ run: { clockUnitsPerTick: 64 } });
    expect(isSpawningEnabled(state)).toBe(true);
    world.step(tickInput());
    disableSpawning(state);
    expect(isSpawningEnabled(state)).toBe(false);
    stepTo(world, state, 400);
    expect(state.entities.size).toBe(50);
    const pending = pendingSpawns(state);
    expect(pending).toEqual([{ due: 19200, source: 'group', index: 2, requests: 3 }]);
    expect(deepFrozen(pending)).toBe(true);
    expect(pending[0]).not.toBe(state.spawn.queue[0]);
  });

  it('posts nothing for a non-positive request count, and a group template the build leaves at probability 0 never fires', () => {
    const m = playerOnlyMission();
    m.declarations.push(
      stored(1, 7, 0, 400, { ruleInputs: ruleInputs({ craftCount: 0xffffffff }) }),
      declaration(2, { origins: ['group-template'], position: { x: 400, y: 0, z: 0 } }),
      declaration(3, { origins: ['group-member'], craftType: 8, memberOf: 0 }),
      declaration(4, { origins: ['group-template'], position: { x: 400, y: 0, z: 0 }, ruleInputs: ruleInputs({ percentA: 100 }) }),
      declaration(5, { origins: ['group-member'], craftType: 8, memberOf: 1 }),
      declaration(6, { origins: ['group-member'], craftType: 8, memberOf: 2 }),
    );
    m.groups = [
      { template: 2, members: [3], spawnCount: 2, layout: [{ x: 0, y: 0, z: 0 }] },
      { template: 4, members: [5], spawnCount: 0xffffffff, layout: [{ x: 0, y: 0, z: 0 }] },
      { template: 4, members: [6], spawnCount: 0, layout: [{ x: 0, y: 0, z: 0 }] },
    ];
    const { state, world } = setUp({ mission: m });
    expect(instantiated(world.step(tickInput())).map(({ source }) => source.index)).toEqual([0]);
    expect(state.spawn.queue).toEqual([]);
    expect(state.spawn.groups.map(({ spawnCount }) => spawnCount)).toEqual([0, 0, 0]);
  });
});

describe('records and groups as aliases (P3-02 AC-06 integration, Q-03)', () => {
  const p = { x: Math.fround(1234.5678), y: Math.fround(-987.6543), z: Math.fround(0.3) };
  const runtime = (value: number) => float32OfDouble(value * Q, 'nearest');

  /**
   * Record 1 is a section-1 record of kind bit 7 at stored position p and group 0's template; record 2 a member
   * reachable only through group 0. Record 3, reachable only through group 1, is its template at p, unconverted.
   */
  function aliasMission(): MissionDraft {
    const m = playerOnlyMission();
    m.declarations.push(
      declaration(1, { origins: ['object', 'group-template'], craftType: 7, position: { ...p } }),
      declaration(2, { origins: ['group-member'], craftType: 8, memberOf: 0 }),
      declaration(3, { origins: ['group-template'], position: { ...p }, ruleInputs: ruleInputs({ percentA: 100 }) }),
      declaration(4, { origins: ['group-member'], craftType: 8, memberOf: 1 }),
    );
    m.groups = [
      { template: 1, members: [2, 2], spawnCount: 1, layout: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] },
      { template: 3, members: [4], spawnCount: 1, layout: [{ x: 0, y: 0, z: 0 }] },
    ];
    return m;
  }

  it('converts a section-1 record once, whether it spawns directly or anchors its group; a group-only record not at all', () => {
    const { state, world } = setUp({ mission: aliasMission() });
    const events = instantiated(world.step(tickInput()));
    const at = (index: number, member: number | null = null) => events.find(({ source }) => source.index === index && (member === null || source.group?.member === member))!.position;
    const once = { x: runtime(p.x), y: runtime(p.y), z: runtime(p.z) };
    expect(at(1)).toEqual(once);
    expect(once.x).not.toBe(runtime(runtime(p.x)));
    expect(at(2, 0)).toEqual(once);
    expect(at(2, 1)).toEqual({ ...once, x: float32OfDouble(once.x + 10, 'nearest') });
    expect(at(4)).toEqual(p);
    // The build fills section-1 records only: the group-only member keeps its source values.
    expect(state.entities.get(events.find(({ source }) => source.index === 2)!.entityId)!.ruleInputs).toEqual({ percentB: 0, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: 0, aiValueC: 0 });
    expect(state.entities.get(events.find(({ source }) => source.index === 1)!.entityId)!.ruleInputs).toMatchObject({ percentB: 100, aiValueA: 3, aiValueB: 3 });
  });
});

describe('group dispatch (P3-02 AC-05, Q-02 section-5 dispatch)', () => {
  /**
   * Group 0: template 1 (rectangle 0, AI target the player, target kinds [0]) with members 2, 3, 2 and two layout
   * offsets. Group 1: template 4 without AI target fields, member 5 (AI target kinds [17]).
   */
  function cycleMission(): MissionDraft {
    const m = playerOnlyMission();
    m.spawnRegions = [{ x0: -800, y0: 400, x1: 800, y1: 1600 }];
    m.declarations.push(
      declaration(1, { origins: ['object', 'group-template'], placement: { region: 0, anchor: null }, aiTarget: 0, aiTargetCraftTypes: [0] }),
      declaration(2, { origins: ['object', 'group-member'], craftType: 7, memberOf: 0, aiTargetCraftTypes: [17] }),
      declaration(3, { origins: ['object', 'group-member'], craftType: 8, memberOf: 0 }),
      declaration(4, { origins: ['object', 'group-template'], position: { x: 64, y: 64, z: 0 } }),
      declaration(5, { origins: ['object', 'group-member'], craftType: 8, memberOf: 1, aiTargetCraftTypes: [17] }),
    );
    m.groups = [
      { template: 1, members: [2, 3, 2], spawnCount: 1, layout: [{ x: 0, y: 0, z: 0 }, { x: -300, y: 20, z: 5 }] },
      { template: 4, members: [5], spawnCount: 1, layout: [{ x: 0, y: 0, z: 0 }] },
    ];
    return m;
  }

  it('takes offset i mod L and places a new anchor from the template at each cycle\'s start, drawing x then y', () => {
    const { state, world } = setUp({ mission: cycleMission() });
    // The player at its stored position draws its AI goal (two); each member then draws only its Warp timer, since the
    // AI target it copies is the player, near and of the other side (P3-06, 0x68050).
    const [, , r2, r3, , , r6, r7] = randValues(state.rngState, 8);
    const events = instantiated(world.step(tickInput()));
    const members = events.filter(({ source }) => source.group?.index === 0);
    // Rectangle 0 in runtime units: x −1500 to 1500, y 750 to 3000.
    const first = { x: expectedRectangle(-1500, 1500, r2), y: expectedRectangle(750, 3000, r3), z: 0 };
    const second = { x: expectedRectangle(-1500, 1500, r6), y: expectedRectangle(750, 3000, r7), z: 0 };
    expect(members.map(({ source, position }) => [source, position])).toEqual([
      [mission(2, { index: 0, request: 0, member: 0 }), first],
      [mission(3, { index: 0, request: 0, member: 1 }), { x: float32OfDouble(first.x - 300, 'nearest'), y: float32OfDouble(first.y + 20, 'nearest'), z: 5 }],
      [mission(2, { index: 0, request: 0, member: 2 }), second],
    ]);
    const facing = (x: number): number[] => (x >= 0 ? [-C, C, 0, 0, 0, 1, C, C, 0] : [-C, -C, 0, 0, 0, 1, -C, C, 0]);
    expect(members.map(({ entityId }) => state.entities.get(entityId)!.orientation)).toEqual([facing(first.x), facing(first.x), facing(second.x)]);
    expect(state.spawn.groups[0]).toMatchObject({ spawnCount: 1, leader: members[2].entityId });
  });

  it('copies the template\'s AI target fields into each member record when they are set, and keeps them there', () => {
    const { state, world } = setUp({ mission: cycleMission() });
    world.step(tickInput());
    expect(recordOf(state, 'mission', 2)).toMatchObject({ aiTarget: 0, aiTargetCraftTypes: [0], spawnCount: 0 });
    expect(recordOf(state, 'mission', 3)).toMatchObject({ aiTarget: 0, aiTargetCraftTypes: [0] });
    expect(recordOf(state, 'mission', 5)).toMatchObject({ aiTarget: null, aiTargetCraftTypes: [17] });
    // The input setup is untouched.
    expect(state.setup.declarations[2].aiTarget).toBeNull();
  });
});

describe('placement at instantiation (P3-02 AC-06, Q-02)', () => {
  /** Anchor offset of one axis from a sign draw and a size draw. */
  const offset = (sign: number, size: number) => (sign % 2 === 0 ? 1 : -1) * (400 + (size % 200));

  it('anchors on the oldest entity of the anchor record, whatever its state, and on the world default when it has none', () => {
    const m = playerOnlyMission();
    m.declarations.push(
      declaration(1, { craftType: 7, placement: { region: null, anchor: 0 }, ruleInputs: ruleInputs({ craftCount: 2 }) }),
      declaration(2, { craftType: 8, placement: { region: null, anchor: 1 }, spawnTime: 1 }),
      declaration(3, { craftType: 8, placement: { region: null, anchor: 4 } }),
      declaration(4, { craftType: 17, spawnTime: 2, position: { x: 100, y: 100, z: 0 } }),
      declaration(5, { origins: ['object', 'group-template'] }),
      declaration(6, { craftType: 8, placement: { region: null, anchor: 5 } }),
      declaration(7, { origins: ['object', 'group-member'], craftType: 8, memberOf: 0 }),
    );
    m.groups = [{ template: 5, members: [7], spawnCount: 0, layout: [{ x: 0, y: 0, z: 0 }] }];
    const { state, world } = setUp({ mission: m });
    const r = randValues(state.rngState, 27);
    const events = instantiated(world.step(tickInput()));
    const player = { x: 100 * Q, y: 200 * Q, z: 0 };
    const near = (base: { x: number; y: number; z: number }, values: number[]) => ({
      x: base.x + offset(values[0], values[1]), y: base.y + offset(values[2], values[3]), z: base.z + offset(values[4], values[5]),
    });
    const byIndex = (index: number) => events.filter(({ source }) => source.index === index).map(({ position }) => position);
    // After its placement draws each object draws its AI goal (two) and, but the player, its Warp timer (one).
    expect(byIndex(1)).toEqual([near(player, r.slice(2, 8)), near(player, r.slice(11, 17))]);
    // Record 4 has not spawned yet and record 5 has kind 0: the whole-world default, x then y.
    expect(byIndex(3)).toEqual([{ x: expectedWorld(6, r[20]), y: expectedWorld(6, r[21]), z: 0 }]);
    expect(byIndex(6)).toEqual([{ x: expectedWorld(6, r[25]), y: expectedWorld(6, r[26]), z: 0 }]);
    const [oldest] = entities(state).filter(({ source }) => source?.index === 1);
    oldest.destroyed = true;
    oldest.state = 'destroyed-source';
    // Record 2 is due at tick 33: its anchor is where the destroyed source, which keeps moving, is when tick 33 starts.
    stepTo(world, state, 32);
    const anchor = oldest.position;
    const later = randValues(state.rngState, 6);
    const due = stepTo(world, state, 33).find(({ source }) => source.index === 2)!;
    expect(due.position).toEqual(near(anchor, later));
  });

  it('serves the rescue: places a world record now, a stored position without drawing', () => {
    const { state, world } = setUp({ mission: playerOnlyMission() });
    world.step(tickInput());
    const rand = new RandStream(state.rngState);
    const placement = placeWorldRecord(state, recordOf(state, 'mission', 0), rand);
    expect(placement).toMatchObject({ route: 'stored', position: { x: 100 * Q, y: 200 * Q, z: 0 } });
    expect(rand.state).toBe(state.rngState);
  });
});

describe('activity and the player at instantiation (P3-02 AC-05, Q-07)', () => {
  /**
   * The player stored above the origin; group-only templates at exact runtime points, each with one member of kind
   * bit 8. The player's height does not count: the radius reads x and y only.
   */
  function activityMission(points: readonly [number, number][], playerSpawnTime = 0): MissionDraft {
    const m = missionFrame();
    m.declarations.push(declaration(0, { craftType: 0, spawnTime: playerSpawnTime, position: { x: 0, y: 0, z: 1 } }));
    points.forEach(([x, y], group) => {
      m.declarations.push(
        declaration(1 + group * 2, { origins: ['group-template'], position: { x, y, z: 0 }, ruleInputs: ruleInputs({ percentA: 100 }) }),
        declaration(2 + group * 2, { origins: ['group-member'], craftType: 8, memberOf: group }),
      );
      m.groups.push({ template: 1 + group * 2, members: [2 + group * 2], spawnCount: 1, layout: [{ x: 0, y: 0, z: 0 }] });
    });
    return m;
  }

  it('starts an object active strictly within x/y radius 7500 of the player, parked on and beyond it', () => {
    const points: [number, number][] = [[7500, 0], [7499.5, 0], [0, -7500], [4500, 6000], [4500, 5999.5], [-1, 1]];
    const { state, world } = setUp({ mission: activityMission(points) });
    world.step(tickInput());
    expect(entities(state).map(({ kindBit, activity }) => [kindBit, activity])).toEqual([
      [0, 'active'],
      [8, 'parked'],
      [8, 'active'],
      [8, 'parked'],
      [8, 'parked'],
      [8, 'active'],
      [8, 'active'],
    ]);
    expect(world.renderState().entities.map(({ id }) => id)).toEqual([1, 3, 6, 7]);
  });

  it('parks every object while there is no player entity; the area check resumes it once the player is near', () => {
    const { state, world } = setUp({ mission: activityMission([[-1, 1]], 1) });
    world.step(tickInput());
    expect(entities(state).map(({ activity }) => activity)).toEqual(['parked']);
    // The player is due at 1 s, the first tick past clock 64: instantiated in tick 33, whose area check (P3-06/14)
    // finds the parked object inside; tick 34 switches it.
    stepTo(world, state, 33);
    expect(entities(state).map(({ kindBit, activity, state: objectState }) => [kindBit, activity, objectState])).toEqual([
      [8, 'parked', 'area-switch'],
      [0, 'active', 'presentation-ready'],
    ]);
    stepTo(world, state, 34);
    expect(entities(state).map(({ kindBit, activity }) => [kindBit, activity])).toEqual([[8, 'active'], [0, 'active']]);
  });

  it('gives the player the identity attitude and view mode 0xC, every other object its placement attitude', () => {
    const m = playerOnlyMission();
    m.declarations.push(stored(1, 7, -100, 50));
    const { state, world } = setUp({ mission: m });
    state.player.viewMode = 3;
    state.player.previousViewMode = 5;
    world.step(tickInput());
    const [player, other] = entities(state);
    expect(player.orientation).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    // x < 0 and y ≥ 0: forward (−c, +c, 0), up (0, 0, 1), first row (−c, −c, 0).
    expect(other.orientation).toEqual([-C, -C, 0, 0, 0, 1, -C, C, 0]);
    expect(state.player).toMatchObject({ entityId: player.id, viewMode: 0xc, previousViewMode: 0xc });
    expect(world.projection().player).toMatchObject({ entityId: player.id, viewMode: 0xc, previousViewMode: 0xc });
  });
});

describe('the wingman (P3-02 AC-08, R-03, Q-06)', () => {
  /** The player at a stored position and one record at 1 s; the queue is empty after tick 33. */
  function shortMission(): MissionDraft {
    const m = playerOnlyMission();
    m.declarations.push(stored(1, 7, 400, 0, { spawnTime: 1 }));
    return m;
  }

  it('spawns no object of kind bit 1 in a run without a wingman', () => {
    const { state, world } = setUp({ mission: shortMission() });
    const events = stepTo(world, state, 40);
    expect(state.spawn.queue).toEqual([]);
    expect(events.map(({ kindBit }) => kindBit)).toEqual([0, 7]);
    expect(world.projection().mission.wingman).toBeNull();
  });

  it.each([0, 1, 2, 3, 4])('spawns exactly wingman option %i, right after the player, anchored on it, named by its candidate', (index) => {
    const { state, world } = setUp({ mission: shortMission(), run: { wingman: index } });
    // Creation draws +0x78 for the player, the wingman and record 1, in that order.
    const [, wingmanDraw] = randValues(0x1234_5678, 3);
    // The player draws its AI goal first; the wingman then draws six for its anchor and two for its own AI goal.
    const r = randValues(state.rngState, 10);
    const events = stepTo(world, state, 40);
    expect(events.map(({ entityId, kindBit, source }) => [entityId, kindBit, source])).toEqual([
      [1, 0, mission(0)],
      [2, 1, { collection: 'wingman', index, group: null }],
      [3, 7, mission(1)],
    ]);
    const offset = (sign: number, size: number) => (sign % 2 === 0 ? 1 : -1) * (400 + (size % 200));
    const wingman = state.entities.get(2)!;
    // Where it was instantiated; it has moved since.
    expect(events[1].position).toEqual({ x: 100 * Q + offset(r[2], r[3]), y: 200 * Q + offset(r[4], r[5]), z: offset(r[6], r[7]) });
    // Like the player, the wingman draws no Warp timer.
    expect(wingman).toMatchObject({ warpClock: 0, inWarp: false, ai: { mode: 4, target: null, goal: { x: expectedWorld(6, r[8]), y: expectedWorld(6, r[9]), z: 0 } } });
    expect(wingman.name).toEqual({ type: 'candidate', declaration: { collection: 'wingman', index }, candidate: 0 });
    expect([wingman.side, wingman.baseInteraction]).toEqual(['friendly', false]);
    expect(wingman.ruleInputs).toEqual({ percentB: 100, percentC: 100, percentD: 100, aiValueA: 3, aiValueB: 3, aiValueC: (wingmanDraw % 60) + 20 });
    expect(recordOf(state, 'wingman', index).spawnCount).toBe(1);
    expect(world.projection().mission.wingman).toBe(index);
    expect(world.renderState().entities[1]).toEqual({ id: 2, kindBit: 1, presentation: { type: 'model', model: modelOf(1) }, position: wingman.position, orientation: wingman.orientation, placementSerial: 0 });
  });
});

describe('names in a running world (P3-02 AC-07, Q-05)', () => {
  it('frees a candidate when its holder is removed; while it is held and the pool is empty, the next gets no name', () => {
    const named = (removeFirst: boolean) => {
      const m = playerOnlyMission();
      m.declarations.push(
        stored(1, 17, 400, 0, { nameCandidates: [`${MARKER}-x`] }),
        stored(2, 18, 0, 400, { nameCandidates: [`${MARKER}-x`], spawnTime: 1 }),
      );
      const { state, world } = setUp({ mission: m });
      world.step(tickInput());
      if (removeFirst) state.entities.get(2)!.state = 'pending-removal';
      stepTo(world, state, 33);
      return entities(state).find(({ kindBit }) => kindBit === 18)!.name;
    };
    expect(named(true)).toEqual({ type: 'candidate', declaration: { collection: 'mission', index: 2 }, candidate: 0 });
    expect(named(false)).toEqual({ type: 'none' });
  });

  // Only kind 25 and the wingman kind reach the pool branch, and kind 25 has no craft record (P3-06 D-01), so a running
  // world reaches it through a wingman option without candidates; name-assignment.test.ts covers the cycling.
  it('keeps the pool counters in world state: one draw for a pooled name, from rand % count', () => {
    const m = playerOnlyMission();
    m.namePool = [`${MARKER}-p0`, `${MARKER}-p1`];
    const roster = rosterContent();
    roster.options[0].nameCandidates = [];
    const { state, world } = setUp({ mission: m, roster, run: { wingman: 0 } });
    // The player at its stored position draws its AI goal (two); the wingman anchored on it draws six, then its name.
    const start = randValues(state.rngState, 9)[8] % 2;
    world.step(tickInput());
    expect(entities(state)[1].name).toEqual({ type: 'pool', index: start });
    expect(state.spawn.namePoolUses).toEqual(start === 0 ? [1, 0] : [0, 1]);
  });
});

describe('outputs of instantiation (P3-02 AC-10)', () => {
  it('keeps the source namespace, the kind and the model apart, at placement serial 0, and leaves parked objects out of Render State', () => {
    const { state, world } = setUp({ run: { wingman: 0 } });
    world.step(tickInput());
    const render = world.renderState();
    const active = entities(state).filter(({ activity }) => activity === 'active');
    expect(render.entities.map(({ id }) => id)).toEqual(active.map(({ id }) => id));
    for (const entity of render.entities) {
      expect(entity).toMatchObject({ presentation: { type: 'model', model: modelOf(entity.kindBit) }, placementSerial: 0 });
    }
    expect(state.entities.get(2)!.source).toEqual({ collection: 'wingman', index: 0, group: null });
    expect(render.observedEntityId).toBe(1);
    expect(deepFrozen(render)).toBe(true);
  });
});

describe('flight state at instantiation (P3-06 S-05, S-07, AC-04, AC-06, AC-07; 实例化扩展)', () => {
  const still = { rate: 0, enabled: false };
  const quiet = { steering: { pitch: still, yaw: still, roll: still }, timedRotation: { pitch: null, yaw: null, roll: null }, impulse: null, locked: false, disturbance: null };
  const ZERO = { x: 0, y: 0, z: 0 };
  /** f32(base + anchor offset) per axis from six draws. */
  const near = (base: { x: number; y: number; z: number }, r: number[]) => {
    const axis = (value: number, sign: number, size: number) => float32OfDouble(value + (sign % 2 === 0 ? 1 : -1) * (400 + (size % 200)), 'nearest');
    return { x: axis(base.x, r[0], r[1]), y: axis(base.y, r[2], r[3]), z: axis(base.z, r[4], r[5]) };
  };

  it('gives the player its take-off state, drawing its AI goal after its placement, and the next object its draws after those', () => {
    const { state, world } = setUp();
    const r = randValues(state.rngState, 13);
    world.step(tickInput());
    const player = state.entities.get(1)!;
    // Rectangle 0 in runtime units: −3750 to 3750 on both axes.
    expect(player.position).toEqual({ x: expectedRectangle(-3750, 3750, r[0]), y: expectedRectangle(-3750, 3750, r[1]), z: 0 });
    // The synthetic player record keeps the base 64 at the initial levels: E = 200 − (2 + 8) is not below T = 0.
    expect(player).toMatchObject({ orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1], maximumSpeed: 64, lastParkedUpdateClock: 2, warpClock: 0, inWarp: false, formation: null });
    expect(player.movement).toEqual({ mode: 'craft', speed: 64, commandedSpeed: 64, atCommandedSpeed: true, speedRatio: 1, ...quiet });
    // 0x68050 never writes the player's target; the player record names no candidates, so a world goal in mode 4.
    expect(player.ai).toEqual({ mode: 4, target: null, goal: { x: expectedWorld(6, r[2]), y: expectedWorld(6, r[3]), z: 0 }, targetOffset: ZERO, objectTarget: null });
    expect(state.player).toMatchObject({ entityId: 1, target: null, control: { lastAxes: { pitch: 0, yaw: 0, roll: 0 }, speedAssist: { enabled: true, dueClock: 0, engaged: false } } });
    // Record 3's first craft (kind bit 7), anchored on the player: placement, its AI goal, then its Warp timer.
    const next = state.entities.get(2)!;
    expect(next.position).toEqual(near(player.position, r.slice(4, 10)));
    expect(next).toMatchObject({ activity: 'active', maximumSpeed: 64, lastParkedUpdateClock: 2, warpClock: 2 + (r[12] % 0x2d00), inWarp: false });
    expect(next.ai).toEqual({ mode: 4, target: null, goal: { x: expectedWorld(6, r[10]), y: expectedWorld(6, r[11]), z: 0 }, targetOffset: ZERO, objectTarget: null });
    expect(next.movement).toEqual(player.movement);
    expect(next.movement).not.toBe(player.movement);
  });

  it('gives each kind of the slice its AI mode: a search with no candidates for 0x80, mode 1 for 0x20000, mode 5 for 0x4000', () => {
    const { state, world } = setUp();
    world.step(tickInput());
    const modes = new Map<number, Set<number>>();
    for (const entity of entities(state)) modes.set(entity.kindBit, (modes.get(entity.kindBit) ?? new Set()).add(entity.ai.mode));
    expect(modes).toEqual(new Map([[0, new Set([4])], [7, new Set([4])], [17, new Set([1])], [14, new Set([5])], [8, new Set([4])]]));
    for (const entity of entities(state)) expect(entity.warpClock > 2 && entity.warpClock <= 2 + 0x2cff).toBe(entity.kindBit !== 0);
  });

  it('keeps an energy-limited player maximum at the initial levels, every other kind at its base, a block only when active', () => {
    const craftInfo = craftInfoContent();
    // E = 50 − (10 + 5) = 35 < T = trunc(100 × 500 ÷ 1000) = 50: trunc(35,000 ÷ 500) = 70.
    Object.assign(craftInfo.craft[0], { at58: 50, at64: [99, 10, 99, 99], at78: [99, 99, 5, 99], atB8: 100, at88: 500 });
    Object.assign(craftInfo.craft[7], { at58: 50, at64: [99, 10, 99, 99], at78: [99, 99, 5, 99], atB8: 100.5, at88: 500 });
    const m = playerOnlyMission();
    m.declarations.push(stored(1, 7, 400, 0), stored(2, 8, 20000, 0), stored(3, 7, 0, 400, { spawnTime: 1 }));
    const { state, world } = setUp({ mission: m, craftInfo, run: { clockUnitsPerTick: 4 } });
    world.step(tickInput());
    const [player, near7, far8] = entities(state);
    expect(player.maximumSpeed).toBe(70);
    expect(player.movement).toMatchObject({ speed: 70, commandedSpeed: 70, speedRatio: float32OfDouble(0.7, 'nearest') });
    expect(near7).toMatchObject({ activity: 'active', maximumSpeed: 100.5, movement: { speed: 100.5, commandedSpeed: 100.5, speedRatio: 1 } });
    expect(far8).toMatchObject({ activity: 'parked', maximumSpeed: 64, movement: null, lastParkedUpdateClock: 4 });
    // A later spawn takes the clock of its own tick: due at 64 units, at tick 17 with 4 units per tick.
    stepTo(world, state, 17);
    const late = entities(state)[3];
    expect(late.source).toEqual(mission(3));
    expect(late.lastParkedUpdateClock).toBe(68);
    expect(late.warpClock).toBeGreaterThan(68);
  });

  it('searches the AI target record\'s objects while it has spawned, the record\'s kinds otherwise, drawing nothing on a near target', () => {
    const m = playerOnlyMission();
    m.declarations.push(
      stored(1, 7, 400, 0),
      // Record 3 has not spawned yet, so record 2 searches its kinds [7]: record 1's craft, its own side (0x93f80).
      stored(2, 8, 0, 400, { aiTarget: 3, aiTargetCraftTypes: [7] }),
      stored(3, 7, -400, 0, { spawnTime: 10 }),
      // Record 1 has spawned, so record 4 searches its objects and not the kinds [0], which would give the player.
      stored(4, 8, 0, -400, { aiTarget: 1, aiTargetCraftTypes: [0] }),
    );
    const { state, world } = setUp({ mission: m });
    // The player's goal (2), record 1's goal (2) and Warp timer (1), then one Warp timer each for records 2 and 4.
    const before = state.rngState;
    const r = randValues(before, 7);
    world.step(tickInput());
    const [, first, second, fourth] = entities(state);
    expect(first.ai).toMatchObject({ mode: 4, target: null });
    expect(second.ai).toEqual({ mode: 2, target: first.id, goal: ZERO, targetOffset: ZERO, objectTarget: null });
    expect(fourth.ai).toEqual({ mode: 2, target: first.id, goal: ZERO, targetOffset: ZERO, objectTarget: null });
    expect([first, second, fourth].map(({ warpClock }) => warpClock)).toEqual([2 + (r[4] % 0x2d00), 2 + (r[5] % 0x2d00), 2 + (r[6] % 0x2d00)]);
    expect(state.rngState).toBe(rngStateAfter(before, 7));
  });

  it('gives a wingman whose option names the player\'s kind the player as its target, in mode 2, with no AI or Warp draw', () => {
    const roster = rosterContent();
    roster.options[0].aiTargetCraftTypes = [0];
    const { state, world } = setUp({ mission: playerOnlyMission(), roster, run: { wingman: 0 } });
    const before = state.rngState;
    world.step(tickInput());
    const wingman = entities(state)[1];
    expect(wingman).toMatchObject({ kindBit: 1, warpClock: 0, ai: { mode: 2, target: 1, goal: ZERO } });
    // The player's goal (2) and the wingman's anchor (6) are all the draws.
    expect(state.rngState).toBe(rngStateAfter(before, 8));
  });

  it('faults rather than store a Warp timer past the safe integers', () => {
    const m = playerOnlyMission();
    m.declarations.push(stored(1, 7, 400, 0));
    const { state, world } = setUp({ mission: m });
    state.clock = Number.MAX_SAFE_INTEGER - 2;
    // The player's goal (2) and record 1's goal (2) come before its Warp delay.
    expect(randValues(state.rngState, 5)[4] % 0x2d00).toBeGreaterThan(0);
    expect(thrownBy(() => world.step(tickInput()))).toMatchObject({ code: 'budget-exhausted', site: 'flight-state.warp-clock' });
  });

  it('records each layout cycle\'s first member as the formation leader of the others, at f32(l − layout[0])', () => {
    const { state, world } = setUp();
    world.step(tickInput());
    for (const [leader, follower] of [[43, 44], [45, 46], [47, 48], [49, 50]]) {
      expect(state.entities.get(leader)!.formation).toBeNull();
      expect(state.entities.get(follower)!.formation).toEqual({ leader, offset: { x: 250, y: 0, z: 0 } });
    }
    expect(entities(state).filter(({ formation }) => formation !== null).map(({ id }) => id)).toEqual([44, 46, 48, 50]);

    const m = sliceMission();
    const first = { x: Math.fround(0.3), y: -2, z: 0 };
    m.groups[0].layout = [first, { x: 1000, y: 20, z: 5 }];
    const rounded = setUp({ mission: m });
    rounded.world.step(tickInput());
    const [leader, follower] = entities(rounded.state).filter(({ source }) => source?.group?.index === 0);
    expect(leader.formation).toBeNull();
    expect(follower.formation).toEqual({ leader: leader.id, offset: { x: float32OfDouble(1000 - first.x, 'nearest'), y: 22, z: 5 } });
    expect(follower.formation!.offset.x).not.toBe(1000 - first.x);
  });
});
