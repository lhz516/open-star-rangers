import { describe, expect, it } from 'vitest';
import { deepFrozen, MARKER } from '../../content/logic/logic-content.test-support.ts';
import { MARKER as CRAFT_INFO_MARKER } from '../../content/rule-data/rule-data.test-support.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import { fnv1a64 } from '../determinism/fnv1a64.ts';
import { CoreInputError } from '../errors.ts';
import { createWorld, initialWorldState } from '../world/create-world.ts';
import { asCreateInput, reversedKeys, SYNTHETIC_RUN, worldInput } from '../world/create-world.test-support.ts';
import {
  ALL_KINDS, allocatorFlightState, clearedControllerCommon, TRANSPONDER_KIND_BIT, type AiControllerCommon, type Entity, type TableController,
  type SteeredMovementBlock,
} from '../world/entity-table.ts';
import { constructWorld } from '../world/world.ts';
import { initialPlayerControl, type CommunicationsMenu } from '../world/player-state.ts';
import {
  addPlayerEntity, busyCombat, entityInit, stateText, stillEntityInit, TEST_ORIENTATION, testState, thrownBy, tickInput, withEveryKindBound,
} from '../world/world.test-support.ts';
import type { ParsedScript, RadioItem, WorldState } from '../world/world-state.ts';
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
 * references); one of each of P3-07's runtime kinds with every optional part of its combat state and its own movement
 * block variant; and P3-09's map marker. The player state has P3-07's targeting and references, P3-09's destination,
 * saved page and Warp transit, and P3-10's docking object, open command menu, partner, saved pages, stamps, thanks and
 * saved pose set; the unnamed craft has P3-10's communications fields and a pending command; the world has object sets,
 * map icons and a map-visible craft (MW-02), and is in the docking countdown with two radio items (one per message
 * variant, with and without a speaker), a playing message, taken portraits, stamped limits, a friendly-fire total and a
 * base service. P3-08's: the unnamed craft has a table program whose interpreter runs a script with every part of its
 * execution state set, and the world's parse cache holds one script with every argument variant (CR-16, CR-17, CR-19).
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
  runtime.ai.program = { type: 'table', record: 2, controller: interpreterController() };
  state.ai.parseCache.push(PARSED_SCRIPT);
  for (const kindBit of RUNTIME_KIND_BITS) state.entities.allocate(entityInit(kindBit, { combat: busyCombat(kindBit) }));
  Object.assign(state.player, { targeting: { mode: 'friendly', autoTargetDueClock: 5 }, followedEntity: 3, delayedExplosionClock: 7, dockingObject: 4 });
  state.spawn.namePoolUses[1] = 1;
  Object.assign(state.player, {
    map: { cursor: { column: 3, row: 399 }, destination: { x: -45000, y: 120.5, z: -7 } },
    savedLeftPage: 5,
    warp: {
      serial: 2, origin: { x: 1, y: -2, z: 3 }, length: 4.5, segments: 3, fraction: 0.25, error: 0.125, angle: 0.5, centring: 0.75,
      frame: { position: { x: 10, y: 20, z: 30 }, orientation: [...TEST_ORIENTATION] },
      path: Array.from({ length: 15 }, (_, index) => ({ x: index, y: -index, z: 2000 * index })),
    },
  });
  state.entities.get(5)!.mapVisible = true;
  state.objectSets = { friendly: [1, 2], hostile: [5, 4] };
  state.mapIcons = [
    { entityId: 1, kindBit: 0, position: { x: 1, y: 2, z: 3 }, pixel: { column: 178, row: 154 }, inWorld: true },
    { entityId: 5, kindBit: 7, position: { x: 45000, y: -45000, z: -1 }, pixel: { column: 400, row: -3 }, inWorld: false },
  ];
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

/** A controller with every common field away from its cleared value (CR-16). */
function busyControllerCommon(): AiControllerCommon {
  const common = clearedControllerCommon();
  const axis = (value: number) => ({ clear: true, set: false, value });
  return {
    ...common,
    nextUpdateClock: 30,
    period: 12,
    limits: { turn: 0.5, speed: 2, saturation: 0.25, rollMatchThreshold: 0.75 },
    triggers: [{ pressed: true, holdDeadline: 40 }, { pressed: false, holdDeadline: 0 }, { pressed: true, holdDeadline: 7 }],
    aiLock: true,
    missileReady: true,
    automaticMounts: true,
    engagement: { dueClock: 50, period: 64, mask: 0xfbfff },
    attackPass: { phase: 2, deadline: 60, savedSizeClass: 3, savedLeadMode: 1 },
    steering: {
      ...common.steering,
      targetValid: true, target: 3, targetSample: 8, relativeSample: 6, point: { x: 1, y: -2, z: 3 }, distance: 100, targetSpeed: 40,
      offset: { enabled: true, frame: 1, vector: { x: 0, y: 5, z: -5 } }, sizeClass: 2, approachRadius: 250, speedLimit: 96, halfSpeedLimit: 48,
      turnRates: [1.5, 2.5, 3.5], leadMode: 1, leadConstant: 0.5, relativeFlags: 5, relative: { x: 7, y: 8, z: 9 }, reverseFlags: 3,
      reverse: { x: -7, y: -8, z: -9 }, angles: [0.125, -0.25], control: { scale: 1, axes: [axis(0.5), axis(-1), axis(2)], speedFactor: 0.75 },
      coneBits: 3, speedFraction: 0.5, turnFraction: 0.25, rollMatch: true,
      throttleNoise: { enabled: true, low: -0.5, high: 0.5 }, steeringNoise: { enabled: true, low: -1, high: 1 },
    },
  };
}

function interpreterController(): Extract<TableController, { handler: 'interpreter' }> {
  return {
    ...busyControllerCommon(),
    handler: 'interpreter',
    interpreter: {
      state: 4,
      execution: {
        script: 5, item: 2, variables: [1, -2, 3, -4], timers: [10, 11, 12, 13], returnStack: [3, 1], wait: { active: true, until: 14 },
        hold: { active: true, until: 15 },
      },
      lastRunEnded: true,
      steadyClock: 16,
      stateDeadline: 17,
      state4Deadline: 18,
    },
  };
}

/** A cached script with each argument variant (CR-19). */
const PARSED_SCRIPT: ParsedScript = {
  script: 5,
  uses: 2,
  items: [
    { type: 'none' }, { type: 'integer', value: -3 }, { type: 'float', value: 0.5 },
    {
      type: 'optional-floats',
      values: [{ present: true, value: 1 }, { present: false, value: 0 }, { present: true, value: 0 }, { present: true, value: -2.5 }],
    },
    { type: 'floats', values: [1, 2, 3] },
  ],
};

/** P3-07's runtime kinds, missile, projectile, explosion and fragment, and P3-09's map marker. */
const RUNTIME_KIND_BITS = [20, 21, 22, 24, 25];

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
    // speed-preset only the rules version (docs/plan/p3/05/spec.md, 持久化与兼容). P3-09/12 and P3-10/11 each incremented
    // both from 3 and 4 on their branches (MW-14, CB-16); their merge increments both once more, so that neither branch's
    // snapshots share a version with the merged state. P3-08/12 increments both once more (CR-25).
    expect([GAME_SNAPSHOT_FORMAT, GAME_SNAPSHOT_VERSION, RULES_VERSION]).toEqual(['osr-game-snapshot', 6, 7]);
    const { state } = snapshot;
    expect(Object.keys(state)).toEqual([
      'config', 'tick', 'clock', 'rngState', 'nextEntityId', 'entities', 'kindOrder', 'spawn', 'missionStatus', 'flow', 'player', 'objectSets', 'mapIcons',
      'communications', 'ai', 'baseService',
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
      map: { cursor: { column: 178, row: 154 }, destination: null }, savedLeftPage: 0, warp: null,
      communications: { menu: null, partner: null, menuSavedPage: 0, incomingSavedPage: 0, limits: { friendlyHit: null, friendlyKill: null }, thanks: 0 },
      docking: { savedPose: null },
    });
    expect([state.objectSets, state.mapIcons]).toEqual([{ friendly: [], hostile: [] }, []]);
    // P3-10's creation values (CB-02, CB-05, CB-11).
    expect(state.flow).toEqual({ mainState: 3, subState: 0, dockingDeadline: 0 });
    expect(state.communications).toEqual({
      queue: [], channel: { phase: 'idle' }, facePools: { craft: [false, false, false], base: [false, false, false, false, false] },
      limits: { wingmanLowHull: 0, enemyAppears: 0, tailWarning: 0, wingmanArrivalRepair: 0 },
      tailCheck: { dueClock: 0, attackerOnTail: false, missileIncoming: false },
    });
    // P3-08's: an empty parse cache, and no program before the selection (CR-19, CR-23).
    expect(state.ai).toEqual({ friendlyFire: { accumulated: 0, windowEnd: 0 }, parseCache: [] });
    expect(state.entities.every(({ ai, transponder }) => ai.program.type === 'none' && transponder === null)).toBe(true);
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
    expect(text).not.toContain('informationCapacity');
    expect(textOf({ ...state, ruleData: { ...state.ruleData, craft: [], guns: [], missiles: [], map: { ...state.ruleData.map, side: 1 } } })).toBe(text);
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
      'ai', 'baseService', 'clock', 'communications', 'config', 'craftInfo', 'entities', 'flow', 'mapIcons', 'missionStatus', 'objectSets', 'player',
      'rngState', 'ruleData', 'setup', 'spawn', 'tick',
    ]);
    // Every entity is written by the same writer, so one entity of each shape stands for the rest: by collection,
    // group membership, name variant and combat type: the player, the wingman, a candidate-named record, a group
    // member, a pool name, an unnamed craft, the four runtime kinds and the map marker, whose movement blocks are the
    // other variants.
    const shapes = new Map<string, Entity>();
    for (const entity of state.entities.byId()) {
      const shape = `${entity.source?.collection}:${entity.source?.group === null}:${entity.name.type}:${entity.combat.type}`;
      if (!shapes.has(shape)) shapes.set(shape, entity);
    }
    expect(shapes.size).toBe(11);
    expect(new Set([...shapes.values()].map(({ movement }) => movement?.mode))).toEqual(new Set(['craft', 'linear', 'spinning', 'marker', undefined]));
    // The others only make each text longer to write.
    const representatives = new Set(shapes.values());
    for (const entity of [...state.entities.byId()]) if (!representatives.has(entity)) state.entities.remove(entity);
    const holders: (readonly [Mutable, string])[] = [
      ...['config', 'tick', 'clock', 'rngState', 'missionStatus', 'player', 'spawn', 'objectSets', 'mapIcons', 'flow', 'communications', 'ai', 'baseService']
        .map((key) => [state as unknown as Mutable, key] as const),
      ...[...shapes.values()].flatMap((entity) => Object.keys(entity).map((key) => [entity as unknown as Mutable, key] as const)),
    ];
    // A null in a nullable object field (a region, a source, a group membership, a movement block, a formation, a timed
    // rotation about an axis, an impulse, a disturbance, a craft's references, a missile's guidance and homing state, a
    // projectile's expiry, the player's destination and Warp transit, a pending command, a radio item's speaker, a
    // transponder state) cannot become 0; the same fields hold objects elsewhere in this state or in P3-08's test below,
    // whose members are leaves themselves.
    const nullableObjects = new Set([
      'region', 'source', 'group', 'movement', 'formation', 'pitch', 'yaw', 'roll', 'impulse', 'disturbance',
      'proximity', 'lastVictim', 'lastAttacker', 'guidance', 'homing', 'expiry', 'destination', 'warp', 'speaker', 'pendingCommand', 'transponder',
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
          // Another movement mode, channel phase or controller handler is no variant, like another `type`, which leafPaths skips.
          expect(
            nullableObjects.has(String([key, ...path].at(-1))) || ['movement.mode', 'communications.channel.phase', 'ai.program.controller.handler'].includes(name),
            name,
          ).toBe(true);
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

  it('writes every leaf of P3-08\'s other controller variants, its unset parts and a transponder state (CR-16, CR-17, CR-20)', () => {
    const state = richState();
    const runtime = [...state.entities.walk(1 << 19)].find(({ ai }) => ai.program.type === 'table')!;
    const transponder = state.entities.allocate(entityInit(TRANSPONDER_KIND_BIT, {
      ...allocatorFlightState(), name: { type: 'none' }, side: null, ruleInputs: { percentB: 0, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: 0, aiValueC: 0 },
      transponder: { creator: 'player', callback: { phase: 'first-update' } },
    }));
    transponder.transponder!.callback = { phase: 'tumbling', since: 21 };
    const variants: (readonly [Mutable, string, unknown])[] = [
      [runtime.ai as unknown as Mutable, 'program', { type: 'built-in', record: 4, controller: {
        ...busyControllerCommon(), handler: 'wingman', wingman: { behaviour: 5, doNotAttack: 3, attackTarget: 4, nextGunSwitchClock: 19, nextEngageSearchClock: 20 },
      } }],
      [runtime.ai as unknown as Mutable, 'program', { type: 'built-in', record: 6, controller: { ...busyControllerCommon(), handler: 'base', base: { targetMask: 0x93780 } } }],
      [runtime.ai as unknown as Mutable, 'program', { type: 'table', record: 1, controller: { ...busyControllerCommon(), handler: 'parked' } }],
      [transponder as unknown as Mutable, 'transponder', { creator: 'player', callback: { phase: 'tumbling', since: 21 } }],
    ];
    for (const [holder, key, variant] of variants) {
      holder[key] = variant;
      const baseline = textOf(state);
      for (const path of leafPaths(variant).filter((leaf) => !['handler', 'phase', 'creator'].includes(String(leaf.at(-1))))) {
        holder[key] = withChangedLeaf(variant, path);
        expect(textOf(state), [key, ...path].join('.')).not.toBe(baseline);
      }
      holder[key] = variant;
    }
    // The creator and callback variants, no execution, a selected record without a controller, no program and an
    // empty parse cache each write their own text.
    const texts = new Set([textOf(state)]);
    for (const callback of [{ phase: 'first-update' }, { phase: 'none' }] as const) {
      transponder.transponder!.callback = callback;
      texts.add(textOf(state));
    }
    (transponder as unknown as { transponder: object }).transponder = { creator: 'wingman', callback: { phase: 'none' } };
    texts.add(textOf(state));
    const installed = interpreterController();
    runtime.ai.program = { type: 'table', record: 2, controller: installed };
    texts.add(textOf(state));
    Object.assign(installed.interpreter, { state: 0, execution: null });
    texts.add(textOf(state));
    runtime.ai.program = { type: 'table', record: 2, controller: null };
    texts.add(textOf(state));
    runtime.ai.program = { type: 'none' };
    texts.add(textOf(state));
    state.ai.parseCache.length = 0;
    texts.add(textOf(state));
    expect(texts.size).toBe(9);
  });

  it('includes the next entity ID, which an allocation advances even after the entity is gone', () => {
    const state = richState();
    const before = takeSnapshot(state);
    state.entities.remove(state.entities.allocate(entityInit(21)));
    const after = takeSnapshot(state);
    expect(after.state.entities).toEqual(before.state.entities);
    expect([before.state.nextEntityId, after.state.nextEntityId]).toEqual([59, 60]);
    expect(snapshotText(after)).not.toBe(snapshotText(before));
  });

  it('lists the entities by ID and the kind lists in walk order, without a removed entity', () => {
    const state = richState();
    const { entities, kindOrder } = takeSnapshot(state).state;
    expect(entities.map(({ id }) => id)).toEqual(Array.from({ length: 58 }, (_, index) => index + 1));
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
    ['object sets', (copy: ReturnType<typeof copyOf>) => ((copy.state.objectSets as Mutable).friendly as unknown[]).reverse()],
    ['map icons', (copy: ReturnType<typeof copyOf>) => (copy.state.mapIcons as unknown as unknown[]).reverse()],
  ])('keeps the order of the %s', (_, reorder) => {
    const state = initialWorldState(asCreateInput(worldInput({ run: { wingman: 0 } })));
    state.spawn.namePoolUses[0] = 2;
    state.objectSets = { friendly: [1, 2], hostile: [] };
    state.mapIcons = [1, 2].map((entityId) => ({ entityId, kindBit: 0, position: { x: 0, y: 0, z: 0 }, pixel: { column: 0, row: 0 }, inWorld: true }));
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
    expect(text.startsWith('{"format":"osr-game-snapshot","version":6,"rulesVersion":7,"state":{"config":{"content":{"schemaVersion":1,')).toBe(true);
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

describe('the map state a select leaves (P3-09/14; docs/plan/p3/02/spec.md, MW-14)', () => {
  /** A world in the map with a standing friendly craft, after a map frame, a first select on it and another map frame. */
  function selected(column: number): WorldState {
    const state = testState();
    addPlayerEntity(state).state = 'active';
    state.player.control = initialPlayerControl(1);
    state.player.targeting!.autoTargetDueClock = 1e9;
    state.player.viewMode = 8;
    const craft = state.entities.allocate(stillEntityInit(3, { position: { x: 100, y: 100, z: 50 } }));
    craft.state = 'active';
    const world = constructWorld(state);
    world.step(tickInput());
    world.step(tickInput([{ type: 'map-point', operation: 'select', right: (column + 0.5) / state.ruleData.map.side, down: 0.5 }]));
    world.step(tickInput());
    return state;
  }

  it('writes the destination, the marker and the icon list, the same for equal worlds and different for another point', () => {
    const state = selected(10);
    expect(state.player.map.destination).not.toBeNull();
    expect([...state.entities.walk(1 << 25)]).toHaveLength(1);
    expect(state.mapIcons.length).toBeGreaterThan(0);
    const text = stateText(state);
    expect(stateText(selected(10))).toBe(text);
    expect(stateText(selected(11))).not.toBe(text);
    const snapshot = JSON.parse(text) as { state: { mapIcons: unknown[]; player: { map: unknown } } };
    expect(snapshot.state.mapIcons).toHaveLength(state.mapIcons.length);
    expect(snapshot.state.player.map).toMatchObject({ destination: state.player.map.destination });
  });
});

describe('the object sets and map visibility flags the stage leaves (P3-09/15; docs/plan/p3/02/spec.md, MW-06, MW-14)', () => {
  /** A created slice world with the first wingman, stepped until its player is available, then `mapTicks` ticks in the map. */
  function sliceInMap(mapTicks: number): WorldState {
    const state = initialWorldState(asCreateInput(worldInput({ run: { wingman: 0 } })));
    const world = constructWorld(state);
    for (let tick = 0; tick < 3; tick++) world.step(tickInput());
    world.step(tickInput([{ type: 'toggle-map' }]));
    for (let tick = 1; tick < mapTicks; tick++) world.step(tickInput());
    return state;
  }

  it('writes both sets in order and every flag, survives a JSON round trip, and is the same for equal runs', () => {
    const state = sliceInMap(2);
    expect(state.player.viewMode).toBe(8);
    expect(state.objectSets.friendly[0]).toBe(state.player.entityId);
    expect(state.objectSets.hostile.length).toBeGreaterThan(0);
    const text = stateText(state);
    const snapshot = JSON.parse(text) as { state: { objectSets: unknown; entities: { id: number; mapVisible: boolean }[] } };
    expect(snapshot.state.objectSets).toEqual(state.objectSets);
    expect(snapshot.state.entities.map(({ id, mapVisible }) => [id, mapVisible])).toEqual(
      [...state.entities.walk(ALL_KINDS)].sort((a, b) => a.id - b.id).map(({ id, mapVisible }) => [id, mapVisible]),
    );
    // The player and its wingman are friendly members, which the reveal always makes visible.
    expect(snapshot.state.entities.filter(({ mapVisible }) => mapVisible).length).toBeGreaterThanOrEqual(2);
    expect(snapshotText(roundTrip(JSON.parse(text)) as GameSnapshot)).toBe(text);
    expect(stateText(sliceInMap(2))).toBe(text);
  });
});
