import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { craft, gun, missile, mount, syntheticCraftInfo } from '../../content/rule-data/rule-data.test-support.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { Command, TickInput } from '../contracts/tick-input.ts';
import { createRecordingSession } from '../replay/recording.ts';
import { longInput, PRODUCER } from '../replay/replay.test-support.ts';
import { snapshotText } from '../replay/snapshot.ts';
import { buildWeaponBlock, type CraftEntity } from '../rules/combat-init.ts';
import { blankCraftCombat, SUBSYSTEM_COUNT, type Entity, type EntityInit, type SubsystemState } from '../world/entity-table.ts';
import { constructWorld } from '../world/world.ts';
import { addPlayerEntity, entityInit, expectFault, stateText, testState, TEST_ORIENTATION, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { displayDistance, projectCombat } from './combat.ts';
import { projectWorld, type CombatPlayer, type CombatTarget } from './projection.ts';

// Consumer contract of flight.combat (docs/plan/p3/02/spec.md, CR-12; docs/plan/p3/07/spec.md, AC-04). Expectations are
// worked out by hand from the synthetic records below and T6, T7, W8, D9 and D16 of docs/original/formats/executable.md;
// the rules behind each reading have their own tests.

const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const fields = (entries: Record<number, SubsystemState> = {}): SubsystemState[] =>
  Array.from({ length: SUBSYSTEM_COUNT }, (_, index): SubsystemState => entries[index] ?? 0);

/**
 * Guns 0 and 1. Missiles 0 (c34 = 64), 1 (c34 = 64), 2 (c34 = 10) and 3 (c34 = −8). The player's (kind 0) mounts: 0 gun
 * 0 firing together with 1; 1 gun 1; 2 missile 0 (2 rounds); 3 missile 1 (3 rounds) alternating with 4; 4 missile 2
 * (4 rounds); 5 gun 1; 6 missile 3 (1 round). Lists [0, 2], [3, 4, 5, 6] and none. Full scales c54 1000, c5C 300, c74
 * 50, c9C 120; kind 7's c5C is 450.
 */
function content(change: (info: ReturnType<typeof syntheticCraftInfo>) => void = () => {}) {
  const info = syntheticCraftInfo();
  info.guns = [gun(), gun()];
  info.missiles = [missile({ at34: 64 }), missile({ at34: 64 }), missile({ at34: 10 }), missile({ at34: -8 })];
  const mounts = [
    mount({ weapon: 0, at18: 1 }),
    mount({ weapon: 1 }),
    mount({ at10: 1, weapon: 0, at0C: 2 }),
    mount({ at10: 1, weapon: 1, at0C: 3, at1C: 4 }),
    mount({ at10: 1, weapon: 2, at0C: 4 }),
    mount({ weapon: 1 }),
    mount({ at10: 1, weapon: 3, at0C: 1 }),
  ];
  info.craft[0] = craft({ at54: 1000, at5C: 300, at74: 50, at9C: 120, mounts, mountLists: [[0, 2], [3, 4, 5, 6], []] });
  info.craft[7] = craft({ at5C: 450 });
  change(info);
  return readCraftInfo(info);
}

/** A world whose player stands active at `position` with the mounts above and its targeting state. */
function combatWorld(position: Vec3 = at(0, 0, 0), change?: Parameters<typeof content>[0]): [WorldState, CraftEntity] {
  const base = testState({ group: 1 });
  const info = content(change);
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content: info } };
  const player = addPlayerEntity(state, { position, combat: { ...blankCraftCombat(), weapons: buildWeaponBlock(info.craft[0]) } }) as CraftEntity;
  player.state = 'active';
  return [state, player];
}

function add(state: WorldState, kindBit: number, position: Vec3, overrides: Partial<EntityInit> = {}): Entity {
  const entity = state.entities.allocate(entityInit(kindBit, { position, ...overrides }));
  if (entity.activity !== 'parked') entity.state = 'active';
  return entity;
}

function combatPlayer(state: WorldState): CombatPlayer {
  const { combat } = projectWorld(state).flight;
  if (combat.readiness !== 'ready' || combat.player === null) throw new Error('no combat player');
  return combat.player;
}

const targetOf = (state: WorldState): CombatTarget | null => combatPlayer(state).target;

describe('flight.combat readiness (CR-12, AC-04)', () => {
  it('is ready with a null player before the player entity exists, beside the motion group it leaves alone', () => {
    const state = testState();
    for (const kindBit of [1, 7, 20]) add(state, kindBit, at(0, 0, kindBit));
    expect(projectWorld(state).flight).toEqual({ motion: { readiness: 'not-implemented' }, combat: { readiness: 'ready', player: null } });
  });

  it('is ready with a null player again once the player entity is removed', () => {
    const [state, player] = combatWorld();
    expect(combatPlayer(state).entityId).toBe(player.id);
    player.state = 'pending-removal';
    constructWorld(state).step(tickInput());
    expect(state.entities.get(player.id)).toBeUndefined();
    expect(projectWorld(state).flight.combat).toEqual({ readiness: 'ready', player: null });
  });

  it('marks a destroyed player, which keeps its readings until the rescue, apart from a live one', () => {
    const [state, player] = combatWorld();
    const live = combatPlayer(state);
    expect(live.destroyed).toBe(false);
    player.destroyed = true;
    player.state = 'destroyed-source';
    expect(combatPlayer(state)).toEqual({ ...live, destroyed: true });
  });

  it('faults when the player entity does not resolve, is no craft or has no targeting state (CR-04)', () => {
    const [state, player] = combatWorld();
    state.player.targeting = null;
    expectFault(() => projectCombat(state), 'invariant-violated', 'combat.targeting');
    state.player.entityId = player.id + 100;
    expectFault(() => projectCombat(state), 'invariant-violated', 'combat.player');
    state.player.entityId = add(state, 20, at(0, 0, 5)).id;
    expectFault(() => projectCombat(state), 'invariant-violated', 'combat.player');
  });
});

describe('flight.combat readings (CR-12, AC-04)', () => {
  it('gives exactly CR-12\'s readings of the player', () => {
    const [state, player] = combatWorld();
    const wingman = add(state, 1, at(300, 0, 0));
    add(state, 8, at(0, 50, 0), { activity: 'parked' });
    const name = { type: 'candidate', declaration: { collection: 'mission', index: 2 }, candidate: 1 } as const;
    const target = add(state, 7, at(0, 0, 100), { name, combat: { ...blankCraftCombat(), shield: 120 } });
    target.movement!.speed = 37.5;
    state.player.target = target.id;
    state.player.targeting!.mode = 'friendly';
    state.player.leftDisplay.page = 1;
    Object.assign(player.combat, {
      energy: 640, shield: 210, charge: 33, hull: -7, sparePower: -25, fullSpeedPower: 90, shieldLevel: 3, chargeLevel: 0,
      subsystems: fields({ 4: 1, 12: 1, 18: 2 }),
    });
    const { weapons } = player.combat;
    weapons.mounts[4].damage = 1;
    Object.assign(weapons.lock, { level: 3, stageDueClock: 32, losing: false });
    expect(projectWorld(state).flight.combat).toEqual({
      readiness: 'ready',
      player: {
        entityId: player.id,
        destroyed: false,
        targetMode: 'friendly',
        target: {
          entityId: target.id, kindBit: 7, name, position: { x: 0, y: 0, z: 100 }, orientation: [...TEST_ORIENTATION],
          distance: 100, speed: 37.5, shield: { current: 120, maximum: 450 },
        },
        radar: {
          status: 1,
          contacts: [
            { entityId: wingman.id, offset: { x: 300, y: 0, z: 0 }, class: 'friendly', missile: false, near: true, target: false },
            { entityId: target.id, offset: { x: 0, y: 0, z: 100 }, class: 'hostile', missile: false, near: true, target: true },
          ],
        },
        resources: {
          energy: { current: 640, maximum: 1000 },
          shield: { current: 210, maximum: 300 },
          charge: { current: 33, maximum: 50 },
          hull: { current: -7, maximum: 120 },
          'spare-power': { current: -25, maximum: 90 },
        },
        allocation: { shieldLevel: 3, chargeLevel: 0 },
        weapons: [
          { index: 0, mount: 0, weapon: { asset: state.craftInfo.id, family: 'gun', index: 0 }, ammunition: null, damage: 0, status: 0 },
          // Mount 3's alternate chain holds 3 + 4 rounds; mount 4 on it is damaged.
          { index: 0, mount: 3, weapon: { asset: state.craftInfo.id, family: 'missile', index: 1 }, ammunition: 7, damage: 0, status: 1 },
        ],
        // At clock 0: 100 × 32 ÷ 64 at level 3.
        lock: { level: 3, losing: false, progress: 50 },
        subsystems: fields({ 4: 1, 12: 1, 18: 2 }),
        leftPage: 1,
      },
    });
  });

  it('is deeply frozen, detached from the world and unchanged by later ticks', () => {
    const [state, player] = combatWorld();
    const target = add(state, 7, at(0, 0, 100));
    state.player.target = target.id;
    const combat = projectWorld(state).flight.combat;
    const text = JSON.stringify(combat);
    expect(deepFrozen(combat)).toBe(true);
    if (combat.readiness !== 'ready' || combat.player === null) throw new Error('no combat player');
    expect(combat.player.subsystems).not.toBe(player.combat.subsystems);
    expect(combat.player.target?.position).not.toBe(target.position);
    player.combat.energy = 1;
    player.combat.weapons.selections[0].index = 1;
    player.combat.weapons.mounts[2].ammunition = 0;
    player.combat.subsystems = fields({ 0: 2 });
    target.position = at(5, 5, 5);
    state.player.leftDisplay.page = 1;
    constructWorld(state).step(tickInput([{ type: 'target', operation: 'enemy' }]));
    expect(JSON.stringify(combat)).toBe(text);
    expect(JSON.stringify(projectWorld(state).flight.combat)).not.toBe(text);
  });
});

describe('flight.combat target (T7)', () => {
  it('gives only CR-12\'s target fields, for the player\'s target while its ID resolves, a destroyed one included', () => {
    const [state] = combatWorld();
    expect(targetOf(state)).toBeNull();
    const target = add(state, 7, at(0, 0, 100));
    state.player.target = target.id;
    expect(Object.keys(targetOf(state)!)).toEqual(['entityId', 'kindBit', 'name', 'position', 'orientation', 'distance', 'speed', 'shield']);
    target.destroyed = true;
    target.state = 'destroyed-source';
    expect(targetOf(state)?.entityId).toBe(target.id);
    state.entities.remove(target);
    expect(targetOf(state)).toBeNull();
  });

  it('has no speed without a movement block and a shield only for a craft', () => {
    const [state] = combatWorld();
    const parked = add(state, 7, at(0, 0, 100), { activity: 'parked', combat: { ...blankCraftCombat(), shield: -3 } });
    state.player.target = parked.id;
    expect(targetOf(state)).toMatchObject({ speed: null, shield: { current: -3, maximum: 450 } });
    const missile = add(state, 20, at(0, 0, 100));
    missile.movement!.speed = 12.5;
    state.player.target = missile.id;
    expect(targetOf(state)).toMatchObject({ kindBit: 20, speed: 12.5, shield: null });
  });

  it('measures the distance as the right display does: each double difference times its f32 store', () => {
    // The player stands at x = y = 2^−20. Each difference d = n − 2^−20 stores to the f32 n, so d × f32(d) = n² − n·2^−20,
    // exactly. For n = 1000 on both axes √(2·10⁶ − 2000·2^−20) ≈ 1414.2135616987 lies below the midpoint
    // 1414.21356201171875 of its f32 neighbours, so it rounds down, where f32(d)² would give √(2·10⁶) ≈ 1414.2135623731,
    // which rounds up.
    const player = at(2 ** -20, 2 ** -20, 0);
    expect(displayDistance(player, at(1000, 1000, 0))).toBe(1414.2135009765625);
    // For 1006 and 2000, √(5012036 − 3006·2^−20) ≈ 2238.7576905805 lies above the midpoint 2238.7576904296875 and rounds
    // up, where the double squares d² would give √(5012036 − 6012·2^−20 + 2·2^−40) ≈ 2238.7576899402, which rounds down.
    expect(displayDistance(player, at(1006, 2000, 0))).toBe(2238.7578125);
    expect(displayDistance(at(1006, 2000, 0), player)).toBe(2238.7578125);
    const [state] = combatWorld(player);
    state.player.target = add(state, 7, at(1000, 1000, 0)).id;
    expect(targetOf(state)?.distance).toBe(1414.2135009765625);
  });

  it('faults when the distance or a difference does not fit an f32 store', () => {
    // 1.5·2^127 on every axis: each f32 store holds, the root 1.5·√3·2^127 does not.
    const half = 0.75 * 2 ** 127;
    expectFault(() => displayDistance(at(-half, -half, -half), at(half, half, half)), 'invariant-violated', 'combat.distance');
    expectFault(() => displayDistance(at(-(2 ** 127), 0, 0), at(2 ** 127, 0, 0)), 'invariant-violated', 'combat.distance');
    expect(displayDistance(at(-half, 0, 0), at(half, 0, 0))).toBe(1.5 * 2 ** 127);
  });
});

describe('flight.combat radar (T6)', () => {
  it('reads subsystem 12: at 2 no real contact, at 1 the contacts stay, 3 builds as 0', () => {
    const [state, player] = combatWorld();
    const enemy = add(state, 7, at(0, 0, 100));
    for (const [field, status, contacts] of [[0, 0, 1], [1, 1, 1], [2, 2, 0], [3, 0, 1]] as const) {
      player.combat.subsystems = fields({ 12: field });
      const { radar } = combatPlayer(state);
      expect(radar.status).toBe(status);
      expect(radar.contacts.map(({ entityId }) => entityId)).toEqual(contacts === 0 ? [] : [enemy.id]);
    }
  });

  it('boxes the player\'s target and stops at 120 entries, the target box included', () => {
    const [state] = combatWorld();
    const enemies = Array.from({ length: 125 }, (_, index) => add(state, 7, at(0, 0, 10 + index)));
    expect(combatPlayer(state).radar.contacts).toHaveLength(120);
    state.player.target = enemies[0].id;
    const { contacts } = combatPlayer(state).radar;
    expect(contacts).toHaveLength(119);
    expect(contacts.filter(({ target }) => target).map(({ entityId }) => entityId)).toEqual([enemies[0].id]);
    expect(contacts.map(({ entityId }) => entityId)).toEqual(enemies.slice(0, 119).map(({ id }) => id));
  });
});

describe('flight.combat weapons (W1–W3, W8)', () => {
  it('gives each list\'s selection, current mount, weapon record and the alternate chain\'s missile rounds', () => {
    const [state, player] = combatWorld();
    const { selections } = player.combat.weapons;
    const reference = (family: 'gun' | 'missile', index: number) => ({ asset: state.craftInfo.id, family, index });
    Object.assign(selections[0], { index: 1, mount: 2 });
    for (const [index, mount, weapon, ammunition] of [
      [0, 3, reference('missile', 1), 7],
      [1, 4, reference('missile', 2), 4],
      [2, 5, reference('gun', 1), null],
      [3, 6, reference('missile', 3), 1],
    ] as const) {
      Object.assign(selections[1], { index, mount });
      expect(combatPlayer(state).weapons).toEqual([
        { index: 1, mount: 2, weapon: reference('missile', 0), ammunition: 2, damage: 0, status: 0 },
        { index, mount, weapon, ammunition, damage: 0, status: 0 },
      ]);
    }
  });

  it('gives no mount, weapon, rounds or damage for an empty list, whose index may be −1', () => {
    const [state, player] = combatWorld(at(0, 0, 0), (info) => { info.craft[0].mountLists[1] = []; });
    player.combat.weapons.selections[1].index = -1;
    expect(combatPlayer(state).weapons[1]).toEqual({ index: -1, mount: null, weapon: null, ammunition: null, damage: null, status: 0 });
  });

  it('gives the current mount\'s damage and the list status over every entry\'s walk', () => {
    const [state, player] = combatWorld();
    const { mounts, selections } = player.combat.weapons;
    const read = () => combatPlayer(state).weapons.map(({ damage, status }) => [damage, status]);
    // List 0 walks 0 → 1 (fire-together) and 2; list 1 walks 3 → 4, 4, 5 and 6.
    mounts[1].damage = 2;
    mounts[4].damage = 1;
    expect(read()).toEqual([[0, 1], [0, 1]]);
    Object.assign(selections[1], { index: 1, mount: 4 });
    expect(read()).toEqual([[0, 1], [1, 1]]);
    for (const index of [0, 1, 2]) mounts[index].damage = 2;
    for (const index of [3, 4, 5, 6]) mounts[index].damage = 2;
    expect(read()).toEqual([[2, 2], [2, 2]]);
  });
});

describe('flight.combat lock progress (`0x2e080`, W8)', () => {
  /** The lock reading at clock 1000 for `lock` with list-1 entry `entry` current (mount 3 + entry; none for null). */
  function lockAt(lock: { level: 0 | 1 | 2 | 3 | 4; stageDueClock: number; losing: boolean }, entry: number | null = 0, change?: Parameters<typeof content>[0]) {
    const [state, player] = combatWorld(at(0, 0, 0), change);
    state.clock = 1000;
    Object.assign(player.combat.weapons.lock, lock);
    Object.assign(player.combat.weapons.selections[1], entry === null ? { index: -1, mount: null } : { index: entry, mount: 3 + entry });
    return combatPlayer(state).lock;
  }

  it('is −1 at levels 0 and 1, while losing and without a current list-1 mount, and 0 at level 4', () => {
    for (const level of [0, 1] as const) expect(lockAt({ level, stageDueClock: 1032, losing: false })).toEqual({ level, losing: false, progress: -1 });
    for (const level of [2, 3, 4] as const) expect(lockAt({ level, stageDueClock: 1032, losing: true })).toEqual({ level, losing: true, progress: -1 });
    expect(lockAt({ level: 4, stageDueClock: 1032, losing: false }).progress).toBe(0);
    expect(lockAt({ level: 3, stageDueClock: 1032, losing: false }, null, (info) => { info.craft[0].mountLists[1] = []; }).progress).toBe(-1);
  });

  it('counts the remaining stage time over c34 of the current mount: level 2 from 100 to 50, level 3 from 50 to 0', () => {
    // r = due − clock; c34 = 64: 100 × 32 ÷ 64 = 50, 100 × 1 ÷ 64 truncates to 1.
    for (const [due, level2, level3] of [[1032, 100, 50], [1001, 51, 1], [1000, 50, 0], [999, 50, 0], [0, 50, 0]] as const) {
      expect(lockAt({ level: 2, stageDueClock: due, losing: false }).progress).toBe(level2);
      expect(lockAt({ level: 3, stageDueClock: due, losing: false }).progress).toBe(level3);
    }
  });

  it('reads c34 of the current mount, not of the chain member with rounds that drives the lock', () => {
    // Mount 3 (missile 1, c34 = 64) has no rounds left; the lock runs on mount 4 (missile 2, c34 = 10).
    const [state, player] = combatWorld();
    state.clock = 1000;
    player.combat.weapons.mounts[3].ammunition = 0;
    Object.assign(player.combat.weapons.lock, { level: 3, stageDueClock: 1010, losing: false });
    expect(combatPlayer(state).lock.progress).toBe(15);
  });

  it('wraps 100 × r as IMUL does and truncates toward zero as IDIV does', () => {
    // 100 × 2^25 wraps to −939524096, and −939524096 ÷ 64 = −14680064 (+ 50 at level 2).
    expect(lockAt({ level: 3, stageDueClock: 1000 + 2 ** 25, losing: false }).progress).toBe(-14680064);
    expect(lockAt({ level: 2, stageDueClock: 1000 + 2 ** 25, losing: false }).progress).toBe(-14680014);
    // Mount 6 carries missile 3, c34 = −8: 100 × 3 ÷ −8 = −37.5 truncates to −37.
    expect(lockAt({ level: 3, stageDueClock: 1003, losing: false }, 3).progress).toBe(-37);
  });

  it('faults on a zero c34, and on a gun current mount only where the record would be read', () => {
    const zero = (info: ReturnType<typeof syntheticCraftInfo>) => { info.missiles[1].at34 = 0; };
    expectFault(() => lockAt({ level: 3, stageDueClock: 1001, losing: false }, 0, zero), 'invariant-violated', 'combat.lock-progress');
    expect(lockAt({ level: 3, stageDueClock: 999, losing: false }, 0, zero).progress).toBe(0);
    // Entry 2 is mount 5, a gun.
    expectFault(() => lockAt({ level: 2, stageDueClock: 1001, losing: false }, 2), 'invariant-violated', 'combat.lock-record');
    expect(lockAt({ level: 2, stageDueClock: 999, losing: false }, 2).progress).toBe(50);
    expect(lockAt({ level: 4, stageDueClock: 1001, losing: false }, 2).progress).toBe(0);
  });
});

describe('flight.combat purity (AC-04)', () => {
  it('reading it changes neither the world nor its RNG', () => {
    const [state] = combatWorld();
    state.player.target = add(state, 7, at(0, 0, 100)).id;
    const before = stateText(state);
    for (let read = 0; read < 3; read++) projectCombat(state);
    expect(stateText(state)).toBe(before);
  });

  it('reading it every tick or never gives the same events, checkpoints and final state', () => {
    // Target, energy and selection commands; the primary fire stays on the gun the synthetic charge cannot pay for, as
    // projectiles and missiles do not move before P3-07/22.
    const commands: Record<number, readonly Command[]> = {
      2: [{ type: 'target', operation: 'friendly' }],
      3: [{ type: 'energy', operation: 'open' }, { type: 'energy', operation: 'shield-increase' }],
      4: [{ type: 'fire', channel: 'primary' }, { type: 'select-missile', direction: 'next' }],
      5: [{ type: 'select-missile', direction: 'previous' }],
      6: [{ type: 'damage-report' }, { type: 'target', operation: 'next' }],
    };
    const script = (tick: number): TickInput => tickInput(commands[tick % 8] ?? []);
    const run = (read: boolean) => {
      const session = createRecordingSession(longInput(), { producer: PRODUCER, checkpointInterval: 7 });
      const events = [];
      const targets = new Set<number>();
      for (let tick = 1; tick <= 40; tick++) {
        events.push(session.step(script(tick)));
        if (read) {
          const { combat } = session.projection().flight;
          const target = combat.readiness === 'ready' ? combat.player?.target : null;
          if (target) targets.add(target.entityId);
        }
      }
      return { events, recording: session.exportRecording(), snapshot: snapshotText(session.snapshot()), targets };
    };
    const [read, unread] = [run(true), run(false)];
    expect(read.targets.size).toBeGreaterThan(0);
    expect(read.events).toEqual(unread.events);
    expect(read.recording).toEqual(unread.recording);
    expect(read.snapshot).toBe(unread.snapshot);
  });
});
