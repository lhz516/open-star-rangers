import { describe, expect, it } from 'vitest';
import { deepFrozen, MARKER } from '../../content/logic/logic-content.test-support.ts';
import { MARKER as CRAFT_INFO_MARKER } from '../../content/rule-data/rule-data.test-support.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import { fnv1a64 } from '../determinism/fnv1a64.ts';
import { CoreInputError } from '../errors.ts';
import { createWorld, initialWorldState } from '../world/create-world.ts';
import { asCreateInput, reversedKeys, SYNTHETIC_RUN, worldInput } from '../world/create-world.test-support.ts';
import type { Entity, SteeredMovementBlock } from '../world/entity-table.ts';
import type { CommunicationsMenu } from '../world/player-state.ts';
import { constructWorld } from '../world/world.ts';
import { busyCombat, entityInit, stateText, thrownBy, tickInput, withEveryKindBound } from '../world/world.test-support.ts';
import type { RadioItem, WorldState } from '../world/world-state.ts';
import { roundTrip } from './replay.test-support.ts';
import { RULES_VERSION } from './rules-version.ts';
import { GAME_SNAPSHOT_FORMAT, GAME_SNAPSHOT_VERSION, snapshotHash, snapshotText, takeSnapshot, type GameSnapshot } from './snapshot.ts';

type Path = readonly (string | number)[];
type Mutable = Record<string | number, unknown>;

/**
 * The slice-shaped world with the first wingman after its first tick (51 entities from section-1 records, groups and
 * the wingman, with craft-type and candidate names, active and parked, with and without a formation), plus entities
 * the rules would create at run time: a craft named from the pool; an unnamed craft whose flight and combat state has
 * every optional part other tasks write (a formation, a timed rotation, an impulse, a disturbance, AI targets, mounts,
 * references); and one of each of P3-07's runtime kinds with every optional part of its combat state and its own
 * movement block variant. The player state has P3-07's targeting and references set, and P3-10's docking object, open
 * command menu, partner, saved pages, stamps, thanks and saved pose; the unnamed craft has P3-10's communications
 * fields and a pending command; the world is in the docking countdown with two radio items (one per message variant,
 * with and without a speaker), a playing message, taken portraits, stamped limits, a friendly-fire total and a base
 * service.
 */
function richState(): WorldState {
  const state = withEveryKindBound(initialWorldState(asCreateInput(worldInput({ run: { wingman: 0 } }))));
  constructWorld(state).step(tickInput());
  state.entities.allocate(entityInit(12, { name: { type: 'pool', index: 1 }, side: null, activity: 'parked' }));
  const runtime = state.entities.allocate(entityInit(19, { formation: { leader: 1, offset: { x: 1, y: 2, z: 3 } }, combat: busyCombat(19) }));
  const block = runtime.movement as SteeredMovementBlock;
  Object.assign(block.timedRotation, { pitch: { rate: 0.5, decay: -0.25, end: 3 }, yaw: { rate: -1, decay: 0.5, end: 4 }, roll: { rate: 2, decay: -1, end: 5 } });
  block.impulse = { direction: { x: 0, y: 1, z: 0 }, magnitude: 5 };
  block.disturbance = { level: 2, biases: [1, -2, 3] };
  Object.assign(runtime.ai, { target: 1, objectTarget: 2, pendingCommand: { code: 0xffffffff, issuedTick: 1 } });
  Object.assign(runtime.communications, { face: 4, threatStamp: 9 });
  for (const kindBit of RUNTIME_KIND_BITS) state.entities.allocate(entityInit(kindBit, { combat: busyCombat(kindBit) }));
  Object.assign(state.player, { targeting: { mode: 'friendly', autoTargetDueClock: 5 }, followedEntity: 3, delayedExplosionClock: 7, dockingObject: 4 });
  state.spawn.namePoolUses[1] = 1;
  Object.assign(state.player.communications, {
    menu: COMMAND_MENU, partner: 4, menuSavedPage: 1, incomingSavedPage: 5, limits: { friendlyHit: 11, friendlyKill: 12 }, thanks: 2,
  });
  state.player.docking.savedPose = { position: { x: 1, y: -2, z: 3 }, orientation: [0, 0, -1, 0, 1, 0, 1, 0, 0] };
  Object.assign(state.flow, { subState: 4, dockingDeadline: 0x204 });
  const { communications } = state;
  communications.queue.push(DIRECT_ITEM, { ...SPOKEN_ITEM, due: 3 });
  communications.channel = { phase: 'playing', item: SPOKEN_ITEM, startClock: 2, frameDurations: [5, 8, 5] };
  communications.facePools.craft[1] = true;
  communications.facePools.base[4] = true;
  Object.assign(communications.limits, { wingmanLowHull: 13, enemyAppears: 14, tailWarning: 15, wingmanArrivalRepair: 16 });
  Object.assign(communications.tailCheck, { dueClock: 17, attackerOnTail: true, missileIncoming: true });
  Object.assign(state.ai.friendlyFire, { accumulated: -40, windowEnd: 18 });
  state.baseService = {
    rows: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10], cursor: 2, dues: { repair: 19, hull: 20, energy: 21 }, rates: { hull: 22, energy: 23 },
    flags: { repairsComplete: true, energyAndMissilesFull: false, hullFull: true },
  };
  return state;
}

// P3-10's state (docs/plan/p3/02/spec.md, CB-03, CB-05): a command menu and two radio items.
const COMMAND_MENU: CommunicationsMenu = {
  level: 4, table: 'kind2', items: [{ key: 0x31, value: { type: 'command', source: 0, code: 9 } }, { key: 0x78, value: { type: 'exit' } }],
};
const SPOKEN_ITEM: RadioItem = {
  message: { table: 20985, face: 2, index: 7 }, due: 2, callback: 'docking-reply',
  speaker: { entityId: 4, kindBit: 15, name: { type: 'candidate', declaration: { collection: 'mission', index: 2 }, candidate: 1 } },
};
const DIRECT_ITEM: RadioItem = { message: { table: 20983, face: null, index: 6 }, due: 1, callback: 'music-step', speaker: null };

/** P3-07's runtime kinds: missile, projectile, explosion and fragment. */
const RUNTIME_KIND_BITS = [20, 21, 22, 24];

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

const copyOf = (snapshot: GameSnapshot) => roundTrip(snapshot) as { state: { spawn: Mutable; entities: Mutable[]; kindOrder: number[] } & Mutable } & Mutable;

describe('formal snapshot (P3-02 AC-11, 快照、哈希与 replay)', () => {
  it('has the versioned shape and the configuration, without the setup or the craft info', () => {
    const input = worldInput({ run: { wingman: 3 } });
    const snapshot = createWorld(asCreateInput(input)).snapshot();
    expect(Object.keys(snapshot)).toEqual(['format', 'version', 'rulesVersion', 'state']);
    expect(snapshot).toMatchObject({ format: GAME_SNAPSHOT_FORMAT, version: GAME_SNAPSHOT_VERSION, rulesVersion: RULES_VERSION });
    // P3-06 incremented both once (docs/plan/p3/06/spec.md, D-07), then P3-07 (docs/plan/p3/02/spec.md, CR-14); P3-05's
    // speed-preset only the rules version (docs/plan/p3/05/spec.md, 持久化与兼容); then P3-10 both (CB-16).
    expect([GAME_SNAPSHOT_FORMAT, GAME_SNAPSHOT_VERSION, RULES_VERSION]).toEqual(['osr-game-snapshot', 4, 5]);
    const { state } = snapshot;
    expect(Object.keys(state)).toEqual([
      'config', 'tick', 'clock', 'rngState', 'nextEntityId', 'entities', 'kindOrder', 'spawn', 'missionStatus', 'flow', 'player', 'communications', 'ai',
      'baseService',
    ]);
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
    expect(state.player).toEqual({
      entityId: null, viewMode: 0xc, previousViewMode: 0xc, subMode: 0, target: null, control: null, targeting: null, followedEntity: null,
      delayedExplosionClock: null, kills: { 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 16: 0, 19: 0 },
      shots: { projectilesFired: 0, projectileHits: 0, missilesFired: 0, missileHits: 0 }, heavyDamage: -1, leftDisplay: { page: 0 },
      statusDisplay: { blink: 0, blinkDueClock: 0, redraw: true }, dockingObject: null,
      communications: { menu: null, partner: null, menuSavedPage: 0, incomingSavedPage: 0, limits: { friendlyHit: null, friendlyKill: null }, thanks: 0 },
      docking: { savedPose: null },
    });
    // P3-10's creation values (CB-02, CB-05, CB-11).
    expect(state.flow).toEqual({ mainState: 3, subState: 0, dockingDeadline: 0 });
    expect(state.communications).toEqual({
      queue: [], channel: { phase: 'idle' }, facePools: { craft: [false, false, false], base: [false, false, false, false, false] },
      limits: { wingmanLowHull: 0, enemyAppears: 0, tailWarning: 0, wingmanArrivalRepair: 0 },
      tailCheck: { dueClock: 0, attackerOnTail: false, missileIncoming: false },
    });
    expect(state.ai).toEqual({ friendlyFire: { accumulated: 0, windowEnd: 0 } });
    expect(state.baseService).toBeNull();
    expect(state.spawn.records).toHaveLength(9);
    expect(state.spawn.wingman?.declaration).toEqual({ collection: 'wingman', index: 3 });
    // Seven declared entries and the wingman's.
    expect(state.spawn.queue).toHaveLength(8);
    expect(snapshotText(snapshot)).not.toContain(MARKER);
    expect(snapshotText(snapshot)).not.toContain(CRAFT_INFO_MARKER);
    expect(deepFrozen(snapshot)).toBe(true);
  });

  it('writes the combat state instantiation gives, and leaves the static rule data out (P3-07 AC-05, CR-01, CR-14)', () => {
    const state = initialWorldState(asCreateInput(worldInput()));
    const world = constructWorld(state);
    world.step(tickInput());
    const snapshot = world.snapshot();
    const player = state.entities.get(1)!;
    expect(snapshot.state.entities[0].combat).toEqual(player.combat);
    expect(snapshot.state.entities[0].maximumSpeed).toBe(player.maximumSpeed);
    // The frame-end status display has consumed the redraw instantiation set (CR-10).
    expect(snapshot.state.player).toMatchObject({ targeting: { mode: 'enemy', autoTargetDueClock: 0 }, statusDisplay: { redraw: false } });
    // Nothing of the static data is written: replacing it leaves the text as it is.
    const text = snapshotText(snapshot);
    expect(text).not.toContain('explosion-animation');
    expect(text).not.toContain('mountOffsets');
    expect(textOf({ ...state, ruleData: { ...state.ruleData, craft: [], guns: [], missiles: [] } })).toBe(text);
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
    // The runtime kinds leave in this tick rather than run their callbacks on busyCombat's made-up combat states.
    for (const kindBit of RUNTIME_KIND_BITS) for (const entity of state.entities.walk(1 << kindBit)) entity.state = 'pending-removal';
    world.step(tickInput([{ type: 'launch' }]));
    state.entities.get(1)!.placementSerial++;
    state.spawn.records[0].spawnCount++;
    expect(snapshotText(first)).toBe(text);
    expect(snapshotText(world.snapshot())).not.toBe(text);
  });

  it('changes the canonical text when any value of the world state but its static setup, craft info and rule data changes', () => {
    const state = richState();
    // A new top-level field fails here until the snapshot covers it; setupHash in the config binds the static ones.
    expect(Object.keys(state).sort()).toEqual([
      'ai', 'baseService', 'clock', 'communications', 'config', 'craftInfo', 'entities', 'flow', 'missionStatus', 'player', 'rngState', 'ruleData', 'setup',
      'spawn', 'tick',
    ]);
    // Every entity is written by the same writer, so one entity of each shape stands for the rest: by collection,
    // group membership, name variant and combat type: the player, the wingman, a candidate-named record, a group
    // member, a pool name, an unnamed craft and the four runtime kinds, whose movement blocks are the other variants.
    const shapes = new Map<string, Entity>();
    for (const entity of state.entities.byId()) {
      const shape = `${entity.source?.collection}:${entity.source?.group === null}:${entity.name.type}:${entity.combat.type}`;
      if (!shapes.has(shape)) shapes.set(shape, entity);
    }
    expect(shapes.size).toBe(10);
    expect(new Set([...shapes.values()].map(({ movement }) => movement?.mode))).toEqual(new Set(['craft', 'linear', 'spinning', undefined]));
    // The others only make each text longer to write.
    const representatives = new Set(shapes.values());
    for (const entity of [...state.entities.byId()]) if (!representatives.has(entity)) state.entities.remove(entity);
    const holders: (readonly [Mutable, string])[] = [
      ...['config', 'tick', 'clock', 'rngState', 'missionStatus', 'player', 'spawn', 'flow', 'communications', 'ai', 'baseService']
        .map((key) => [state as unknown as Mutable, key] as const),
      ...[...shapes.values()].flatMap((entity) => Object.keys(entity).map((key) => [entity as unknown as Mutable, key] as const)),
    ];
    // A null in a nullable object field (a region, a source, a group membership, a movement block, a formation, a timed
    // rotation about an axis, an impulse, a disturbance, a craft's references, a missile's guidance and homing state, a
    // projectile's expiry, a pending command, a radio item's speaker) cannot become 0; the same fields hold objects elsewhere in this state,
    // whose members are leaves themselves.
    const nullableObjects = new Set([
      'region', 'source', 'group', 'movement', 'formation', 'pitch', 'yaw', 'roll', 'impulse', 'disturbance',
      'proximity', 'lastVictim', 'lastAttacker', 'guidance', 'homing', 'expiry', 'speaker', 'pendingCommand',
    ]);
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
          // Another movement mode or channel phase is no variant, like another `type`, which leafPaths skips.
          expect(nullableObjects.has(String([key, ...path].at(-1))) || name === 'movement.mode' || name === 'communications.channel.phase', name).toBe(true);
          continue;
        }
        expect(text, name).not.toBe(baseline);
        changes++;
      }
    }
    expect(textOf(state)).toBe(baseline);
    // Ten entities of 30 and more values each, and every record, group, queue entry and counter.
    expect(changes).toBeGreaterThan(10 * 30 + 9 * 20);
  });

  it('writes every leaf of P3-10\'s other menu and channel variants and its unset parts (CB-03, CB-05)', () => {
    const state = richState();
    const objects: CommunicationsMenu = {
      level: 3, table: 'objects', items: [
        { key: 0x31, value: { type: 'object', entityId: 4, kindBit: 15, name: { type: 'pool', index: 1 }, tone: 'threatened' } },
        { key: 0x78, value: { type: 'exit' } },
      ],
    };
    const categories: CommunicationsMenu = {
      level: 2, table: 'categories', items: [{ key: 0x31, value: { type: 'category', source: 3, kindMask: 0x68000 } }, { key: 0x58, value: { type: 'exit' } }],
    };
    const variants: (readonly [Mutable, string, unknown])[] = [
      [state.player.communications as unknown as Mutable, 'menu', objects],
      [state.player.communications as unknown as Mutable, 'menu', categories],
      [state.communications as unknown as Mutable, 'channel', { phase: 'loading', item: SPOKEN_ITEM, readyTick: 3 }],
    ];
    for (const [holder, key, variant] of variants) {
      holder[key] = variant;
      const baseline = textOf(state);
      // A channel's phase is its variant, like a `type`.
      for (const path of leafPaths(variant).filter((leaf) => leaf.at(-1) !== 'phase')) {
        holder[key] = withChangedLeaf(variant, path);
        expect(textOf(state), [key, ...path].join('.')).not.toBe(baseline);
      }
      holder[key] = variant;
    }
    // The idle channel, a closed menu, no saved pose and no base service each write their own text.
    const texts = new Set([textOf(state)]);
    state.communications.channel = { phase: 'idle' };
    texts.add(textOf(state));
    state.player.communications.menu = null;
    texts.add(textOf(state));
    state.player.docking.savedPose = null;
    texts.add(textOf(state));
    state.baseService = null;
    texts.add(textOf(state));
    expect(texts.size).toBe(5);
  });

  it('includes the next entity ID, which an allocation advances even after the entity is gone', () => {
    const state = richState();
    const before = takeSnapshot(state);
    state.entities.remove(state.entities.allocate(entityInit(21)));
    const after = takeSnapshot(state);
    expect(after.state.entities).toEqual(before.state.entities);
    expect([before.state.nextEntityId, after.state.nextEntityId]).toEqual([58, 59]);
    expect(snapshotText(after)).not.toBe(snapshotText(before));
  });

  it('lists the entities by ID and the kind lists in walk order, without a removed entity', () => {
    const state = richState();
    const { entities, kindOrder } = takeSnapshot(state).state;
    expect(entities.map(({ id }) => id)).toEqual(Array.from({ length: 57 }, (_, index) => index + 1));
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
    expect(text.startsWith('{"format":"osr-game-snapshot","version":4,"rulesVersion":5,"state":{"config":{"content":{"schemaVersion":1,')).toBe(true);
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
