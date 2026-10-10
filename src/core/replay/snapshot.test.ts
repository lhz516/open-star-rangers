import { describe, expect, it } from 'vitest';
import { deepFrozen, MARKER } from '../../content/logic/logic-content.test-support.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import { fnv1a64 } from '../determinism/fnv1a64.ts';
import { CoreInputError } from '../errors.ts';
import { createWorld, initialWorldState } from '../world/create-world.ts';
import { asCreateInput, SYNTHETIC_RUN, worldInput } from '../world/create-world.test-support.ts';
import type { Entity } from '../world/entity-table.ts';
import { constructWorld } from '../world/world.ts';
import { entityInit, stateText, thrownBy, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { roundTrip } from './replay.test-support.ts';
import { RULES_VERSION } from './rules-version.ts';
import { GAME_SNAPSHOT_FORMAT, GAME_SNAPSHOT_VERSION, snapshotHash, snapshotText, takeSnapshot, type GameSnapshot } from './snapshot.ts';

type Path = readonly (string | number)[];
type Mutable = Record<string | number, unknown>;

/**
 * The slice-shaped world with the first wingman after its first tick (51 entities from section-1 records, groups and
 * the wingman, with craft-type and candidate names), plus two entities the rules would create at run time: one named
 * from the pool, one unnamed.
 */
function richState(): WorldState {
  const state = initialWorldState(asCreateInput(worldInput({ run: { wingman: 0 } })));
  constructWorld(state).step(tickInput());
  state.entities.allocate(entityInit(25, { name: { type: 'pool', index: 1 }, side: null, activity: 'parked' }));
  state.entities.allocate(entityInit(25));
  state.spawn.namePoolUses[1] = 1;
  return state;
}

const textOf = (state: WorldState): string => snapshotText(takeSnapshot(state));

/**
 * The path of every scalar and every empty list in plain data, but union discriminants (`type`): another value there
 * is no variant, and each variant's members are leaves themselves.
 */
function leafPaths(value: unknown, path: Path = []): Path[] {
  if (Array.isArray(value)) return value.length === 0 ? [path] : value.flatMap((item, index) => leafPaths(item, [...path, index]));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => (key === 'type' ? [] : leafPaths(item, [...path, key])));
  }
  return [path];
}

/** A copy of `value` with the leaf at `path` changed to another value of its kind (an empty list gets an item). */
function withChangedLeaf(value: unknown, path: Path): unknown {
  if (path.length === 0) {
    if (Array.isArray(value)) return [0];
    if (typeof value === 'number') return value + 1;
    if (typeof value === 'string') return `${value}x`;
    if (typeof value === 'boolean') return !value;
    return 0;
  }
  const [head, ...rest] = path;
  const copy = (Array.isArray(value) ? [...value] : { ...(value as object) }) as Mutable;
  copy[head] = withChangedLeaf((value as Mutable)[head], rest);
  return copy;
}

/** Plain data with every object's keys in reverse order. */
function reversedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversedKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reversedKeys(item)]));
}

const copyOf = (snapshot: GameSnapshot) => roundTrip(snapshot) as { state: { spawn: Mutable; entities: Mutable[]; kindOrder: number[] } & Mutable } & Mutable;

describe('formal snapshot (P3-02 AC-11, 快照、哈希与 replay)', () => {
  it('has the versioned shape and the configuration, without the setup', () => {
    const input = worldInput({ run: { wingman: 3 } });
    const snapshot = createWorld(asCreateInput(input)).snapshot();
    expect(Object.keys(snapshot)).toEqual(['format', 'version', 'rulesVersion', 'state']);
    expect(snapshot).toMatchObject({ format: GAME_SNAPSHOT_FORMAT, version: GAME_SNAPSHOT_VERSION, rulesVersion: RULES_VERSION });
    expect([GAME_SNAPSHOT_FORMAT, GAME_SNAPSHOT_VERSION, RULES_VERSION]).toEqual(['osr-game-snapshot', 1, 1]);
    const { state } = snapshot;
    expect(Object.keys(state)).toEqual(['config', 'tick', 'clock', 'rngState', 'nextEntityId', 'entities', 'kindOrder', 'spawn', 'missionStatus', 'player']);
    expect(state.config).toEqual({
      content: syntheticIdentity(),
      mission: 'mission/first-campaign',
      setupHash: expect.stringMatching(/^[0-9a-f]{16}$/),
      group: 0,
      slot: 1,
      rawDifficulty: SYNTHETIC_RUN.rawDifficulty,
      wingman: 3,
      seed: SYNTHETIC_RUN.seed,
      clockUnitsPerTick: 2,
    });
    expect(state).toMatchObject({ tick: 0, clock: 0, nextEntityId: 1, entities: [], kindOrder: [], missionStatus: 'built' });
    expect(state.player).toEqual({ entityId: null, viewMode: 0xc, previousViewMode: 0xc, subMode: 0 });
    expect(state.spawn.records).toHaveLength(9);
    expect(state.spawn.wingman?.declaration).toEqual({ collection: 'wingman', index: 3 });
    // Seven declared entries and the wingman's.
    expect(state.spawn.queue).toHaveLength(8);
    expect(snapshotText(snapshot)).not.toContain(MARKER);
    expect(deepFrozen(snapshot)).toBe(true);
  });

  it('copies the world: reading changes nothing, every call is a new copy, and later ticks never change it', () => {
    const state = richState();
    const world = constructWorld(state);
    const before = stateText(state);
    const [first, second] = [world.snapshot(), world.snapshot()];
    expect(stateText(state)).toBe(before);
    expect(second).toEqual(first);
    expect(second.state.entities[0]).not.toBe(first.state.entities[0]);
    expect(second.state.spawn.records[0]).not.toBe(first.state.spawn.records[0]);
    const text = snapshotText(first);
    world.step(tickInput([{ type: 'launch' }]));
    state.entities.get(1)!.placementSerial++;
    state.spawn.records[0].spawnCount++;
    expect(snapshotText(first)).toBe(text);
    expect(snapshotText(world.snapshot())).not.toBe(text);
  });

  it('changes the canonical text when any value of the world state but its static setup changes', () => {
    const state = richState();
    // A new top-level field fails here until the snapshot covers it.
    expect(Object.keys(state).sort()).toEqual(['clock', 'config', 'entities', 'missionStatus', 'player', 'rngState', 'setup', 'spawn', 'tick']);
    // Every entity is written by the same writer, so one entity of each shape stands for the rest: by collection,
    // group membership and name variant: the player, the wingman, a candidate-named record, a group member, a pool
    // name and an unnamed runtime entity.
    const shapes = new Map<string, Entity>();
    for (const entity of state.entities.byId()) {
      const shape = `${entity.source?.collection}:${entity.source?.group === null}:${entity.name.type}`;
      if (!shapes.has(shape)) shapes.set(shape, entity);
    }
    expect(shapes.size).toBe(6);
    // The others only make each text longer to write.
    const representatives = new Set(shapes.values());
    for (const entity of [...state.entities.byId()]) if (!representatives.has(entity)) state.entities.remove(entity);
    const holders: (readonly [Mutable, string])[] = [
      ...['config', 'tick', 'clock', 'rngState', 'missionStatus', 'player', 'spawn'].map((key) => [state as unknown as Mutable, key] as const),
      ...[...shapes.values()].flatMap((entity) => Object.keys(entity).map((key) => [entity as unknown as Mutable, key] as const)),
    ];
    // A null in a nullable object field (a region, a source, a group membership) cannot become 0; the same fields hold
    // objects elsewhere in this state, whose members are leaves themselves.
    const nullableObjects = new Set(['region', 'source', 'group']);
    const baseline = textOf(state);
    let changes = 0;
    for (const [holder, key] of holders) {
      const original = holder[key];
      for (const path of leafPaths(original)) {
        const name = [key, ...path].join('.');
        holder[key] = withChangedLeaf(original, path);
        let text: unknown;
        try {
          text = textOf(state);
        } catch (error) {
          text = error;
        }
        holder[key] = original;
        if (text instanceof CoreInputError) {
          expect(nullableObjects.has(String([key, ...path].at(-1))), name).toBe(true);
          continue;
        }
        expect(text, name).not.toBe(baseline);
        changes++;
      }
    }
    expect(textOf(state)).toBe(baseline);
    // Six entities of 30 and more values each, and every record, group, queue entry and counter.
    expect(changes).toBeGreaterThan(6 * 30 + 9 * 20);
  });

  it('includes the next entity ID, which an allocation advances even after the entity is gone', () => {
    const state = richState();
    const before = takeSnapshot(state);
    state.entities.remove(state.entities.allocate(entityInit(25)));
    const after = takeSnapshot(state);
    expect(after.state.entities).toEqual(before.state.entities);
    expect([before.state.nextEntityId, after.state.nextEntityId]).toEqual([54, 55]);
    expect(snapshotText(after)).not.toBe(snapshotText(before));
  });

  it('lists the entities by ID and the kind lists in walk order, without a removed entity', () => {
    const state = richState();
    const { entities, kindOrder } = takeSnapshot(state).state;
    expect(entities.map(({ id }) => id)).toEqual(Array.from({ length: 53 }, (_, index) => index + 1));
    // Kinds ascend and each kind's list keeps allocation order, which is ID order.
    const walk = [...entities].sort((left, right) => left.kindBit - right.kindBit || left.id - right.id).map(({ id }) => id);
    expect(kindOrder).toEqual(walk);
    expect(kindOrder.slice(0, 4)).toEqual([1, 2, 3, 4]);
    expect(kindOrder).not.toEqual(entities.map(({ id }) => id));
    state.entities.remove(state.entities.get(3)!);
    const removed = takeSnapshot(state).state;
    expect(removed.entities.map(({ id }) => id)).not.toContain(3);
    expect(removed.kindOrder).toEqual(walk.filter((id) => id !== 3));
  });

  it('does not depend on the key order of its objects or of the creation input, nor on the order of the entity set', () => {
    const snapshot = takeSnapshot(richState());
    const text = snapshotText(snapshot);
    expect(snapshotText(reversedKeys(snapshot) as GameSnapshot)).toBe(text);
    expect(snapshotText(roundTrip(snapshot) as GameSnapshot)).toBe(text);
    const shuffled = copyOf(snapshot);
    shuffled.state.entities.reverse();
    expect(snapshotText(shuffled as unknown as GameSnapshot)).toBe(text);

    const input = worldInput({ run: { wingman: 0 } });
    const [world, reordered] = [createWorld(asCreateInput(input)), createWorld(asCreateInput(reversedKeys(input)))];
    for (const each of [world, reordered]) each.step(tickInput());
    expect(snapshotText(reordered.snapshot())).toBe(snapshotText(world.snapshot()));
  });

  it.each([
    ['spawn queue', (copy: ReturnType<typeof copyOf>) => (copy.state.spawn.queue as unknown[]).reverse()],
    ['kind order', (copy: ReturnType<typeof copyOf>) => copy.state.kindOrder.reverse()],
    ['name pool counters', (copy: ReturnType<typeof copyOf>) => (copy.state.spawn.namePoolUses as unknown[]).reverse()],
    ['records', (copy: ReturnType<typeof copyOf>) => (copy.state.spawn.records as unknown[]).reverse()],
    ['group layout', (copy: ReturnType<typeof copyOf>) => ((copy.state.spawn.groups as Mutable[])[0].layout as unknown[]).reverse()],
  ])('keeps the order of the %s', (_, reorder) => {
    const state = initialWorldState(asCreateInput(worldInput({ run: { wingman: 0 } })));
    state.spawn.namePoolUses[0] = 2;
    // Kind 7 before kind 0: the walk visits them in the other order.
    state.entities.allocate(entityInit(7));
    state.entities.allocate(entityInit(0));
    const snapshot = takeSnapshot(state);
    const copy = copyOf(snapshot);
    reorder(copy);
    expect(snapshotText(copy as unknown as GameSnapshot)).not.toBe(snapshotText(snapshot));
  });

  it('writes ASCII with escapes, -0 as 0, and hashes with fnv1a64 as 16 lowercase hex digits', () => {
    const snapshot = takeSnapshot(richState());
    const text = snapshotText(snapshot);
    expect(text).toMatch(/^[\x20-\x7e]+$/);
    expect(text.startsWith('{"format":"osr-game-snapshot","version":1,"rulesVersion":1,"state":{"config":{"content":{"schemaVersion":1,')).toBe(true);
    expect(snapshotHash(snapshot)).toBe(fnv1a64(text));
    expect(snapshotHash(snapshot)).toMatch(/^[0-9a-f]{16}$/);

    const escaped = copyOf(snapshot);
    escaped.state.missionStatus = 'b\u00e9\u{1f680}';
    expect(snapshotText(escaped as unknown as GameSnapshot)).toContain('"missionStatus":"b\\u00e9\\ud83d\\ude80"');

    const [negative, positive] = [copyOf(snapshot), copyOf(snapshot)];
    (negative.state.entities[0].position as Mutable).x = -0;
    (positive.state.entities[0].position as Mutable).x = 0;
    expect(snapshotText(negative as unknown as GameSnapshot)).toBe(snapshotText(positive as unknown as GameSnapshot));

    const infinite = copyOf(snapshot);
    (infinite.state.entities[1].position as Mutable).y = Number.POSITIVE_INFINITY;
    const error = thrownBy(() => snapshotHash(infinite as unknown as GameSnapshot));
    expect(error).toBeInstanceOf(CoreInputError);
    expect(error).toMatchObject({ path: 'snapshot.state.entities[1].position.y', reason: 'must be a finite number' });
  });

  it('is equal for equal input and steps, and differs by seed', () => {
    const run = (seed: number) => {
      const world = createWorld(asCreateInput(worldInput({ run: { wingman: 0, seed } })));
      world.step(tickInput());
      return snapshotText(world.snapshot());
    };
    expect(run(7)).toBe(run(7));
    expect(run(7)).not.toBe(run(8));
  });
});
