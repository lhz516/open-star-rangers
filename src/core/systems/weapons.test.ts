import { describe, expect, it } from 'vitest';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { craft, gun, missile, mount, syntheticCraftInfo } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import { buildWeaponBlock, type CraftEntity } from '../rules/combat-init.ts';
import { craftMovementBlock } from '../rules/flight-state.ts';
import { blankCraftCombat, type Entity, type EntityInit, type Matrix3 } from '../world/entity-table.ts';
import { initialPlayerControl, initialPlayerTargeting } from '../world/player-state.ts';
import type { WorldRuleData } from '../world/rule-data.ts';
import { constructWorld } from '../world/world.ts';
import { entityInit, stateText, testState, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { enterBaseView } from './base-interior.test-support.ts';
import { registerTick, type Request } from './pipeline.ts';
import { acquireAutomatic, fireAiChannel, fireAutomatic, updateMissileLock } from './weapons.ts';

// docs/plan/p3/02/spec.md, CR-05 to CR-08; docs/original/formats/executable.md, W3, W5–W11. Through the formal step:
// command results, events and new entities in their order. Expectations are worked out by hand from the synthetic
// records below; the rule arithmetic itself is covered by the rule tests.

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
const at = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });

/**
 * Guns: 0 fixed (cooldown 4, cost 5), 1 aimed (cost 2), 2 automatic (burst 2). Missiles: 0 guided, 1 unguided. The
 * player's (and kind 7's) mounts: 0 gun 0; 1 gun 1, aimed at row 3 ≥ 0.5; 2 missile 0 (two rounds); 3 missile 1 (one
 * round); 4 gun 2. Lists [0, 1], [2, 3] and [3].
 */
function content(change: (info: ReturnType<typeof syntheticCraftInfo>) => void = () => {}) {
  const info = syntheticCraftInfo();
  info.guns = [gun({ at08: 100, at14: 4, at18: 5, at28: 0 }), gun({ at08: 100, at14: 4, at18: 2, at28: 1 }), gun({ at08: 50, at14: 2, at28: 2, at2C: 2 })];
  info.missiles = [missile({ body: 0, at18: 1, at1C: 6, at20: 0 }), missile({ body: 1, at18: 0, at1C: 6, at20: 0 })];
  const mounts = [
    mount({ weapon: 0, at20: 0, at34: 0 }),
    mount({ weapon: 1, at20: 0x01, at24: [0.5, 0, 0], at30: 0, at34: 0 }),
    mount({ at10: 1, weapon: 0, at0C: 2 }),
    mount({ at10: 1, weapon: 1, at0C: 1 }),
    mount({ weapon: 2, at20: 0x01, at24: [0.5, 0, 0], at34: 0 }),
  ];
  info.craft[0] = craft({ mounts, mountLists: [[0, 1], [2, 3], [3]] });
  info.craft[7] = craft({ mounts, mountLists: [[0, 1], [2, 3], [3]] });
  change(info);
  return readCraftInfo(info);
}

const OFFSETS = [at(1, 0, 0), at(-1, 0, 0), at(0, 0, 3), at(0, 0, -3), at(0, 2, 0)];

/**
 * A world (speed assist off) whose player is active in flight at the origin, facing +z at speed 40, with charge 100, its
 * control and targeting state; kinds 0 and 7 carry the mounts above.
 */
function flightWorld(change?: Parameters<typeof content>[0]): [WorldState, CraftEntity] {
  const base = testState({ group: 1 });
  const info = content(change);
  const ruleData = {
    ...base.ruleData,
    craft: Array.from({ length: 20 }, (_, kindBit) => (kindBit === 0 || kindBit === 7 ? { ...base.ruleData.craft[0]!, mountOffsets: OFFSETS } : null)),
    guns: info.guns.map(() => ({ range: 100, rangeSquared: 10_000 })),
    missiles: info.missiles.map(() => ({ range: 100, rangeSquared: 10_000, fuseRadiusSquared: 1 })),
  } as WorldRuleData;
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content: info }, ruleData };
  const player = state.entities.allocate(entityInit(0, {
    position: at(0, 0, 0),
    orientation: IDENTITY,
    movement: craftMovementBlock(0x80, 40, 80),
    combat: { ...blankCraftCombat(), charge: 100, weapons: buildWeaponBlock(info.craft[0]) },
  })) as CraftEntity;
  player.state = 'active';
  state.player.entityId = player.id;
  state.player.control = initialPlayerControl(1);
  state.player.targeting = initialPlayerTargeting();
  return [state, player];
}

/** An active craft of `kindBit` standing still at `position`. */
function add(state: WorldState, kindBit: number, position: Vec3, overrides: Partial<EntityInit> = {}): Entity {
  const entity = state.entities.allocate(entityInit(kindBit, { position, orientation: IDENTITY, movement: craftMovementBlock(0, 40, 80), ...overrides }));
  entity.state = 'active';
  return entity;
}

type CommandType = Command['type'];
const result = (commandIndex: number, commandType: CommandType, reason: string | null = null, tick = 1): DomainEvent => (reason === null
  ? { type: 'command-result', tick, commandIndex, commandType, outcome: 'accepted', reason: null }
  : { type: 'command-result', tick, commandIndex, commandType, outcome: 'ignored', reason } as DomainEvent);
const FIRE_PRIMARY: Command = { type: 'fire', channel: 'primary' };
const FIRE_SECONDARY: Command = { type: 'fire', channel: 'secondary' };
const CYCLE: Command = { type: 'cycle-main-weapon' };
const missileStep = (direction: 'next' | 'previous'): Command => ({ type: 'select-missile', direction });
const mountsOf = (player: CraftEntity) => player.combat.weapons.mounts;
const shots = (events: readonly DomainEvent[]) => events.flatMap((event) => (event.type === 'shot-fired' ? [event] : []));

describe('weapon selection commands (AC-05; CR-05, CR-06, W3)', () => {
  it('cycles list 0 and steps list 1 both ways, each followed by weapon-selected', () => {
    const [state, player] = flightWorld();
    const events = constructWorld(state).step(tickInput([CYCLE, missileStep('previous'), missileStep('next'), CYCLE]));
    expect(events).toEqual([
      result(0, 'cycle-main-weapon'),
      { type: 'weapon-selected', tick: 1, entityId: player.id, list: 0, index: 1, mount: 1, changed: true, commandIndex: 0 },
      result(1, 'select-missile'),
      { type: 'weapon-selected', tick: 1, entityId: player.id, list: 1, index: 1, mount: 3, changed: true, commandIndex: 1 },
      result(2, 'select-missile'),
      { type: 'weapon-selected', tick: 1, entityId: player.id, list: 1, index: 0, mount: 2, changed: true, commandIndex: 2 },
      result(3, 'cycle-main-weapon'),
      { type: 'weapon-selected', tick: 1, entityId: player.id, list: 0, index: 0, mount: 0, changed: true, commandIndex: 3 },
    ]);
  });

  it('accepts a selection that keeps the mount, an empty list included, and clears the lock on list 1', () => {
    const [state, player] = flightWorld((info) => { info.craft[0].mountLists = [[0], [], []]; });
    player.combat.weapons.lock.level = 3;
    const events = constructWorld(state).step(tickInput([CYCLE, missileStep('previous')]));
    expect(events).toEqual([
      result(0, 'cycle-main-weapon'),
      { type: 'weapon-selected', tick: 1, entityId: player.id, list: 0, index: 0, mount: 0, changed: false, commandIndex: 0 },
      result(1, 'select-missile'),
      { type: 'weapon-selected', tick: 1, entityId: player.id, list: 1, index: -1, mount: null, changed: false, commandIndex: 1 },
    ]);
    expect(player.combat.weapons.lock.level).toBe(0);
  });

  it('gives no-weapon only for a craft without mounts, firing included', () => {
    const [state] = flightWorld((info) => { info.craft[0] = craft(); });
    const commands = [CYCLE, missileStep('next'), FIRE_PRIMARY, FIRE_SECONDARY];
    expect(constructWorld(state).step(tickInput(commands))).toEqual(commands.map(({ type }, index) => result(index, type, 'no-weapon')));
  });
});

describe('the common pre-judgement of the weapon commands (CR-05)', () => {
  it.each([
    ['player-unavailable for a destroyed player', (state: WorldState, player: Entity) => { player.destroyed = true; return state; }, 'player-unavailable'],
    ['wrong-context in the map', (state: WorldState) => { state.player.viewMode = 8; return state; }, 'wrong-context'],
    ['wrong-context in the base', (state: WorldState) => { enterBaseView(state); return state; }, 'wrong-context'],
  ] as const)('ignores every weapon command with %s and changes nothing', (_, change, reason) => {
    const commands = [FIRE_PRIMARY, FIRE_SECONDARY, CYCLE, missileStep('next')];
    const [state, player] = flightWorld();
    const [idle, idlePlayer] = flightWorld();
    change(state, player);
    change(idle, idlePlayer);
    expect(constructWorld(state).step(tickInput(commands))).toEqual(commands.map(({ type }, index) => result(index, type, reason)));
    constructWorld(idle).step(tickInput());
    expect(stateText(state)).toBe(stateText(idle));
  });
});

describe('fire commands (AC-06; CR-05, CR-06, W5–W8)', () => {
  it('accepts a shot, posts its launch and emits shot-fired from request handling', () => {
    const [state, player] = flightWorld();
    const events = constructWorld(state).step(tickInput([FIRE_PRIMARY]));
    expect(events.map(({ type }) => type)).toEqual(['command-result', 'shot-fired']);
    expect(events[0]).toEqual(result(0, 'fire'));
    const [shot] = shots(events);
    const projectile = state.entities.get(shot.entityId)!;
    expect(shot).toMatchObject({ shooterEntityId: player.id, family: 'gun', weapon: 0, mount: 0, trigger: { type: 'command', channel: 'primary', commandIndex: 0 } });
    expect(projectile).toMatchObject({ kindBit: 21, state: 'presentation-ready', combat: { type: 'projectile', gun: 0, shooter: player.id } });
    // Built at mount offset (1, 0, 0) plus the player's speed 40 times the step 2/64 along row 3, and not moved in its
    // launch tick, while the player moved the same 1.25 after it.
    expect([shot.position, projectile.position, player.position]).toEqual([at(1, 0, 1.25), at(1, 0, 1.25), at(0, 0, 1.25)]);
    expect([player.combat.charge, mountsOf(player)[0].lastShotClock, state.player.shots.projectilesFired]).toEqual([95, state.clock, 1]);
  });

  it('judges fire → cycle-main-weapon → fire each against the selection then, every launch with its own identity', () => {
    const [state, player] = flightWorld();
    const events = constructWorld(state).step(tickInput([FIRE_PRIMARY, CYCLE, FIRE_PRIMARY]));
    expect(events.map(({ type }) => type)).toEqual(['command-result', 'command-result', 'weapon-selected', 'command-result', 'shot-fired', 'shot-fired']);
    expect([events[0], events[1], events[3]]).toEqual([result(0, 'fire'), result(1, 'cycle-main-weapon'), result(2, 'fire')]);
    expect(shots(events).map(({ mount: index, weapon, trigger }) => [index, weapon, trigger])).toEqual([
      [0, 0, { type: 'command', channel: 'primary', commandIndex: 0 }],
      [1, 1, { type: 'command', channel: 'primary', commandIndex: 2 }],
    ]);
    expect(player.combat.charge).toBe(100 - 5 - 2);
  });

  it('refuses a repeated request the cooldown it wrote blocks, and spends once', () => {
    const [state, player] = flightWorld();
    const events = constructWorld(state).step(tickInput([FIRE_PRIMARY, FIRE_PRIMARY, FIRE_PRIMARY]));
    expect(events.filter(({ type }) => type === 'command-result')).toEqual([result(0, 'fire'), result(1, 'fire', 'cooldown'), result(2, 'fire', 'cooldown')]);
    expect(shots(events)).toHaveLength(1);
    expect(player.combat.charge).toBe(95);
  });

  it('reports insufficient charge and writes the charge before the next command reads it', () => {
    const [state, player] = flightWorld();
    player.combat.charge = 6;
    // 6 − 5 leaves 1: below gun 1's cost 2, and gun 0's charge test comes before its cooldown.
    const events = constructWorld(state).step(tickInput([FIRE_PRIMARY, CYCLE, FIRE_PRIMARY, CYCLE, FIRE_PRIMARY]));
    expect(events.filter(({ type }) => type === 'command-result').map((event) => (event.type === 'command-result' ? event.reason : null)))
      .toEqual([null, null, 'insufficient-charge', null, 'insufficient-charge']);
    expect(player.combat.charge).toBe(1);
  });

  it('hands the launches to request handling after P3-06\'s requests, as the triggers follow message 0x20000 (T3)', () => {
    const match: Command = { type: 'speed', operation: 'match-target' };
    for (const commands of [[match, FIRE_PRIMARY], [FIRE_PRIMARY, match]]) {
      const [state] = flightWorld();
      state.player.target = add(state, 7, at(0, 0, 500)).id;
      const events = constructWorld(state).step(tickInput(commands));
      expect(events.map(({ type }) => type)).toEqual(['command-result', 'command-result', 'speed-matched', 'shot-fired']);
    }
  });

  it('emits no shot-fired for a command that launched nothing', () => {
    const [state, player] = flightWorld();
    mountsOf(player)[0].damage = 2;
    expect(constructWorld(state).step(tickInput([FIRE_PRIMARY]))).toEqual([result(0, 'fire', 'weapon-disabled')]);
  });
});

describe('fire and the reference target (CR-05)', () => {
  it('launches from the load-transformed mount offsets of craft §3.8', () => {
    // The default synthetic world: the player's mount 1 is fixed gun 1 at (0.5, −1, 2), whose projectile length 6 kind
    // bit 0 adds at half to +0x08: z = 2 + 3; mount 2 carries missile 1 and keeps its offset.
    const state = testState({ group: 1 });
    const record = state.craftInfo.content.craft[0];
    const player = state.entities.allocate(entityInit(0, {
      position: at(0, 0, 0), orientation: IDENTITY, movement: craftMovementBlock(0, 40, 80),
      combat: { ...blankCraftCombat(), charge: 0x7fffffff, weapons: buildWeaponBlock(record) },
    })) as CraftEntity;
    player.state = 'active';
    Object.assign(state.player, { entityId: player.id, control: initialPlayerControl(1), targeting: initialPlayerTargeting(), target: add(state, 7, at(0, 0, 50)).id });
    Object.assign(player.combat.weapons.selections[0], { index: 1, mount: 1 });
    const events = constructWorld(state).step(tickInput([FIRE_PRIMARY, FIRE_SECONDARY]));
    // At speed 0 the launch adds nothing along row 3.
    expect(shots(events).map(({ mount: index, position }) => [index, position])).toEqual([[1, at(0.5, -1, 5)], [2, at(0.5, -1, 2)]]);
  });

  it('reads a target selected earlier in the tick and keeps it against later selections', () => {
    const [state, player] = flightWorld();
    const near = add(state, 7, at(0, 0, 40));
    const far = add(state, 7, at(0, 0, 80));
    const events = constructWorld(state).step(tickInput([{ type: 'target', operation: 'enemy' }, FIRE_SECONDARY, { type: 'target', operation: 'previous' }]));
    expect(events.filter(({ type }) => type === 'command-result')).toEqual([result(0, 'target'), result(1, 'fire'), result(2, 'target')]);
    // Request handling applies both selections before the deferred launch: the missile keeps the target its command
    // read. The automatic selection, which sees no actual target yet, posts the nearest enemy last (CR-07, T3).
    const [shot] = shots(events);
    expect(state.entities.get(shot.entityId)?.combat).toMatchObject({ type: 'missile', missile: 0, shooter: player.id, target: near.id });
    expect(events.flatMap((event) => (event.type === 'target-changed' ? [[event.target, event.origin]] : []))).toEqual([
      [near.id, 'command'], [far.id, 'command'], [near.id, 'automatic'],
    ]);
    expect(state.player.target).toBe(near.id);
  });

  it('gives no-target to a guided missile before any target, and a target selected after it does not help', () => {
    const [state] = flightWorld();
    add(state, 7, at(0, 0, 40));
    const events = constructWorld(state).step(tickInput([FIRE_SECONDARY, { type: 'target', operation: 'enemy' }]));
    expect(events.filter(({ type }) => type === 'command-result')).toEqual([result(0, 'fire', 'no-target'), result(1, 'target')]);
    expect(shots(events)).toEqual([]);
  });

  it('aims an aimed gun at the reference target and counts the player\'s missile', () => {
    const [state, player] = flightWorld();
    add(state, 7, at(0, 10, 90));
    player.combat.weapons.selections[0].mount = 1;
    player.combat.weapons.selections[0].index = 1;
    const events = constructWorld(state).step(tickInput([{ type: 'target', operation: 'enemy' }, FIRE_PRIMARY, FIRE_SECONDARY]));
    const [gunShot, missileShot] = shots(events);
    const projectile = state.entities.get(gunShot.entityId)!;
    // The aim tilts row 3 up toward y = 10; an unaimed shot would keep the identity rows.
    expect(projectile.orientation[7]).toBeGreaterThan(0);
    expect(missileShot.family).toBe('missile');
    expect(state.player.shots).toEqual({ projectilesFired: 1, projectileHits: 0, missilesFired: 1, missileHits: 0 });
  });
});

describe('the missile lock entry point (CR-07)', () => {
  it('locks on the player\'s target in stages and drops without one', () => {
    const [state, player] = flightWorld();
    state.player.target = add(state, 7, at(0, 0, 50)).id;
    state.clock = 100;
    const context = registerTick(state, readTickInput(tickInput()));
    updateMissileLock(context, player);
    expect(player.combat.weapons.lock).toMatchObject({ level: 1, nextUpdateClock: 121 });
    state.player.target = null;
    updateMissileLock(context, player);
    expect(player.combat.weapons.lock.level).toBe(0);
    expect(context.events).toEqual([]);
  });
});

describe('the AI entry points (AC-06; CR-05, W9, W10)', () => {
  function aiWorld(): [WorldState, CraftEntity, Entity] {
    const [state] = flightWorld();
    const shooter = add(state, 7, at(0, 0, 0), { combat: { ...blankCraftCombat(), weapons: buildWeaponBlock(state.craftInfo.content.craft[7]) } }) as CraftEntity;
    const enemy = add(state, 0, at(0, 0, 60));
    shooter.ai.objectTarget = enemy.id;
    state.clock = 100;
    return [state, shooter, enemy];
  }
  const launches = (context: ReturnType<typeof registerTick>) => {
    const posted: Request[] = [];
    context.requests.handle((request) => {
      posted.push(request);
    });
    return posted;
  };

  it('fires a channel at the AI\'s object target with an AI trigger and no command result or charge', () => {
    const [state, shooter, enemy] = aiWorld();
    const context = registerTick(state, readTickInput(tickInput()));
    expect(fireAiChannel(context, shooter, 1)).toEqual({ launched: 1, last: 'launched' });
    expect(fireAiChannel(context, shooter, 2)).toEqual({ launched: 1, last: 'launched' });
    expect(context.events).toEqual([]);
    expect(launches(context)).toMatchObject([
      { type: 'launch', family: 'missile', shooter: shooter.id, missile: 0, mount: 2, target: enemy.id, trigger: { type: 'ai', channel: 1 } },
      { type: 'launch', family: 'missile', shooter: shooter.id, missile: 1, mount: 3, target: enemy.id, trigger: { type: 'ai', channel: 2 } },
    ]);
    expect(shooter.combat.weapons.lock.level).toBe(0);
  });

  it('acquires and then fires an automatic mount independently of the lists', () => {
    const [state, shooter, enemy] = aiWorld();
    shooter.combat.weapons.mounts[4].autoTarget = enemy.id;
    const context = registerTick(state, readTickInput(tickInput()));
    expect(acquireAutomatic(context, shooter, 4)).toBe(true);
    expect(shooter.combat.weapons.mounts[4].burst).toBe(2);
    const before = state.rngState;
    fireAutomatic(context, shooter);
    expect(state.rngState).not.toEqual(before);
    expect(launches(context)).toMatchObject([{ type: 'launch', family: 'gun', gun: 2, mount: 4, trigger: { type: 'automatic' } }]);
    expect(shooter.combat.weapons.mounts[4]).toMatchObject({ burst: 1, lastShotClock: 100 });
  });
});
