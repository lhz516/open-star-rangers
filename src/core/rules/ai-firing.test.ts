import { describe, expect, it } from 'vitest';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { craft, gun, missile, mount, syntheticCraftInfo } from '../../content/rule-data/rule-data.test-support.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { blankCraftCombat, type AiControllerCommon, type Entity, type EntityInit, type Matrix3, type SteeredMovementBlock } from '../world/entity-table.ts';
import type { WorldRuleData } from '../world/rule-data.ts';
import { expectFault, stillEntityInit, testState } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import {
  AI_CHANNELS, disableAiLock, enableAiLock, firingDataOf, installBase, isChannelInRange, isSteady, pressChannel, releaseChannel, runTriggerLoop,
  updateAiLock, updateBase,
} from './ai-firing.ts';
import { aiPilot, evade, type PilotRequest } from './ai-piloting.ts';
import { installedController } from './ai-selection.ts';
import { buildWeaponBlock, type CraftEntity } from './combat-init.ts';
import type { MountList } from './mounts.ts';
import { scriptedRand } from './rand.test-support.ts';

// P3-08/18 (docs/plan/p3/08/spec.md, S-08, AC-06; docs/original/formats/executable.md, A12–A14, W9, W10; P3-02 CR-16,
// CR-24 decision 3). Expectations are worked out by hand from those records: the presses' deadlines, the trigger loop's
// fire and release order, the range and steadiness tests, the AI lock's stages and the base's install and update.

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
const at = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
const ZERO = at(0, 0, 0);
const CLOCK = 1000;
/** `0x5dc0c`'s record: period 70, limits from +0x24 and +0x28, saturation 1. */
const RECORD = Object.freeze({ at14: 70, at24: 1, at28: 2, at2C: 1, at30: 0 });

/**
 * Guns: 0 automatic (burst 3), 1 fixed, both of range 1000. Missiles: 0 guided (lock cosine 0.5, stage time 8), 1
 * unguided, both of range 500. Kind 1: mount 0 gun 1 (list 0), mounts 1 (missile 0, two rounds) and 2 (missile 1, one
 * round) in list 1. Kinds 7 and 17: mounts 0, 2 and 3 automatic, mount 1 gun 1; every arc open.
 */
function world(): WorldState {
  const base = testState();
  const raw = syntheticCraftInfo();
  raw.guns = [gun({ at08: 100, at14: 4, at28: 2, at2C: 3 }), gun({ at08: 100, at14: 4, at18: 5, at28: 0 })];
  raw.missiles = [missile({ body: 0, at18: 1, at28: 0.5, at34: 8 }), missile({ body: 1, at18: 0, at34: 8 })];
  const fixed = () => mount({ weapon: 1, at20: 0, at34: 0 });
  const automatic = () => mount({ weapon: 0, at20: 0, at24: [0, 0, 0], at34: 0 });
  raw.craft[1] = craft({ mounts: [fixed(), mount({ at10: 1, weapon: 0, at0C: 2 }), mount({ at10: 1, weapon: 1, at0C: 1 })], mountLists: [[0], [1, 2], []] });
  raw.craft[7] = craft({ mounts: [automatic(), fixed(), automatic(), automatic()], mountLists: [[1], [], []] });
  raw.craft[17] = raw.craft[7];
  const info = readCraftInfo(raw);
  const ruleData = {
    ...base.ruleData,
    craft: base.ruleData.craft.map((kind, kindBit) => ({ ...kind!, mountOffsets: info.craft[kindBit].mounts.map(() => ZERO) })),
    guns: info.guns.map(() => ({ range: 1000, rangeSquared: 1_000_000 })),
    missiles: info.missiles.map(() => ({ range: 500, rangeSquared: 250_000, fuseRadiusSquared: 1 })),
  } as WorldRuleData;
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content: info }, ruleData };
  state.clock = CLOCK;
  return state;
}

/** An active, standing craft of `kindBit` at `position`, armed from its record. */
function add(state: WorldState, kindBit: number, position: Vec3, overrides: Partial<EntityInit> = {}): CraftEntity {
  const combat = { ...blankCraftCombat(), weapons: buildWeaponBlock(state.craftInfo.content.craft[kindBit]) };
  const entity = state.entities.allocate(stillEntityInit(kindBit, { position, orientation: IDENTITY, combat, ...overrides })) as CraftEntity;
  entity.state = 'active';
  return entity;
}

const controllerOf = (state: WorldState, entity: Entity): AiControllerCommon => installedController(RECORD, state.craftInfo.content.craft[entity.kindBit]);

describe('presses and releases (A12; 0x5df20, 0x5df84)', () => {
  const pressed = (hold: number) => {
    const controller = controllerOf(world(), { kindBit: 1 } as Entity);
    pressChannel(controller, 0, hold, CLOCK);
    return controller.triggers[0];
  };

  it('presses with deadline 0 for hold 0, clock + 0x7D00 for a negative hold, clock + hold otherwise', () => {
    expect(pressed(0)).toEqual({ pressed: true, holdDeadline: 0 });
    expect(pressed(-1)).toEqual({ pressed: true, holdDeadline: CLOCK + 0x7d00 });
    expect(pressed(-0x8000_0000)).toEqual({ pressed: true, holdDeadline: CLOCK + 0x7d00 });
    expect(pressed(0x60)).toEqual({ pressed: true, holdDeadline: CLOCK + 0x60 });
  });

  it('does not press a pressed channel again: its deadline stays; a release keeps the deadline', () => {
    const controller = controllerOf(world(), { kindBit: 1 } as Entity);
    pressChannel(controller, 2, 0x20, CLOCK);
    pressChannel(controller, 2, -1, CLOCK + 5);
    expect(controller.triggers[2]).toEqual({ pressed: true, holdDeadline: CLOCK + 0x20 });
    releaseChannel(controller, 2);
    expect(controller.triggers[2]).toEqual({ pressed: false, holdDeadline: CLOCK + 0x20 });
    pressChannel(controller, 2, 0, CLOCK + 5);
    expect(controller.triggers[2]).toEqual({ pressed: true, holdDeadline: 0 });
    expectFault(() => pressChannel(controller, 1, 0x8000_0000, CLOCK), 'invariant-violated', 'ai-firing.hold');
  });
});

describe('the trigger loop of the AI step (A12)', () => {
  function loop(controller: AiControllerCommon, clock: number): MountList[] {
    const fired: MountList[] = [];
    runTriggerLoop(controller, clock, (channel) => fired.push(channel));
    return fired;
  }

  it('fires the pressed channels in order 0, 1, 2; channel 1 once, clearing the missile-ready flag', () => {
    const controller = controllerOf(world(), { kindBit: 1 } as Entity);
    controller.missileReady = true;
    for (const channel of AI_CHANNELS) pressChannel(controller, channel, 10, CLOCK);
    expect(loop(controller, CLOCK)).toEqual([0, 1, 2]);
    expect(controller.missileReady).toBe(false);
    expect(controller.triggers.map((trigger) => trigger.pressed)).toEqual([true, false, true]);
    controller.missileReady = true;
    // At the deadline the channels still fire; one unit later they fire for the last time and are released.
    expect(loop(controller, CLOCK + 10)).toEqual([0, 2]);
    expect(controller.missileReady).toBe(true);
    expect(loop(controller, CLOCK + 11)).toEqual([0, 2]);
    expect(controller.triggers.map((trigger) => trigger.pressed)).toEqual([false, false, false]);
    expect(loop(controller, CLOCK + 12)).toEqual([]);
  });

  it('fires a press with hold 0 exactly once', () => {
    const controller = controllerOf(world(), { kindBit: 1 } as Entity);
    pressChannel(controller, 0, 0, CLOCK);
    expect(loop(controller, CLOCK)).toEqual([0]);
    expect(loop(controller, CLOCK + 2)).toEqual([]);
  });
});

describe('the range test 0x5dfa4 and the steadiness 0x5e15c (A12, A13)', () => {
  it('compares the distance C+0x2C with the current weapon\'s range, strictly; no mount or no missile ammunition fails', () => {
    const state = world();
    const wingman = add(state, 1, ZERO);
    const controller = controllerOf(state, wingman);
    const data = firingDataOf(state);
    controller.steering.distance = Math.fround(999.9);
    expect(isChannelInRange(data, wingman, controller, 0)).toBe(true);
    controller.steering.distance = 1000;
    expect(isChannelInRange(data, wingman, controller, 0)).toBe(false);
    controller.steering.distance = Number.NaN;
    expect(isChannelInRange(data, wingman, controller, 0)).toBe(true);
    controller.steering.distance = 400;
    expect(isChannelInRange(data, wingman, controller, 1)).toBe(true);
    expect(isChannelInRange(data, wingman, controller, 2)).toBe(false);
    wingman.combat.weapons.mounts[1].ammunition = 0;
    expect(isChannelInRange(data, wingman, controller, 1)).toBe(false);
  });

  it('is steady unless an enabled pitch or yaw rate exceeds its limit; never without a movement block', () => {
    const state = world();
    const wingman = add(state, 1, ZERO);
    const { steering } = wingman.movement as SteeredMovementBlock;
    expect(isSteady(wingman)).toBe(true);
    Object.assign(steering.pitch, { rate: -0.17, enabled: true });
    Object.assign(steering.yaw, { rate: 0.2, enabled: true });
    expect(isSteady(wingman)).toBe(true);
    steering.pitch.rate = -0.18;
    expect(isSteady(wingman)).toBe(false);
    steering.pitch.enabled = false;
    expect(isSteady(wingman)).toBe(true);
    steering.yaw.rate = 0.21;
    expect(isSteady(wingman)).toBe(false);
    steering.yaw.rate = Number.NaN;
    expect(isSteady(wingman)).toBe(true);
    Object.assign(steering.roll, { rate: 9, enabled: true });
    expect(isSteady(wingman)).toBe(true);
    wingman.movement = null;
    expect(isSteady(wingman)).toBe(false);
  });
});

describe('the AI lock 0x5dfec and its switches (A13; P3-02 CR-16)', () => {
  function locking() {
    const state = world();
    const wingman = add(state, 1, ZERO);
    const enemy = add(state, 7, at(0, 0, 300));
    wingman.ai.objectTarget = enemy.id;
    const controller = controllerOf(state, wingman);
    enableAiLock(controller, wingman);
    controller.steering.distance = 300;
    controller.steering.angles = Object.freeze([0.5, -0.5] as const);
    const update = (clock: number) => updateAiLock(firingDataOf(state), wingman, controller, (id) => state.entities.get(id), clock);
    return { state, wingman, enemy, controller, lock: wingman.combat.weapons.lock, update };
  }

  it('switches on with level 0 and the next update at once, and off with level 0', () => {
    const { wingman, controller, lock } = locking();
    expect(controller.aiLock).toBe(true);
    expect(lock).toMatchObject({ level: 0, nextUpdateClock: 0 });
    lock.level = 3;
    lock.nextUpdateClock = 77;
    disableAiLock(controller, wingman);
    expect(controller.aiLock).toBe(false);
    expect(lock).toMatchObject({ level: 0, nextUpdateClock: 77 });
    enableAiLock(controller, wingman);
    expect(lock).toMatchObject({ level: 0, nextUpdateClock: 0 });
  });

  it('steps 0 → 2 → 3 → 4 every 0x40 units at the stage deadlines (+0x34 SAR 1), skipping level 1 and any grace', () => {
    const { lock, update } = locking();
    expect(update(CLOCK)).toBe(false);
    expect(lock).toMatchObject({ level: 2, stageDueClock: CLOCK + 4, nextUpdateClock: CLOCK + 0x40, losing: false, graceDueClock: 0 });
    expect(update(CLOCK + 0x3f)).toBe(false);
    expect(lock.level).toBe(2);
    expect(update(CLOCK + 0x40)).toBe(false);
    expect(lock).toMatchObject({ level: 3, stageDueClock: CLOCK + 0x44, nextUpdateClock: CLOCK + 0x80 });
    expect(update(CLOCK + 0x80)).toBe(true);
    expect(lock).toMatchObject({ level: 4, nextUpdateClock: CLOCK + 0xc0 });
    // Level 4 stands before the next update, and it is ready then without one.
    expect(update(CLOCK + 0x81)).toBe(true);
    expect(update(CLOCK + 0xc0)).toBe(true);
  });

  it('waits for the stage deadline, and leaves level 1', () => {
    const { lock, update } = locking();
    lock.level = 2;
    lock.stageDueClock = CLOCK + 1;
    expect(update(CLOCK)).toBe(false);
    expect(lock).toMatchObject({ level: 2, nextUpdateClock: CLOCK + 0x40 });
    lock.level = 1;
    expect(update(CLOCK + 0x40)).toBe(false);
    expect(lock.level).toBe(1);
  });

  it('drops to 0 when the geometry fails: out of range, or an angle beyond the lock angle; an unordered angle passes', () => {
    const lockAngle = Math.fround(Math.acos(0.5));
    for (const [distance, angles, ok] of [
      [500, [0.5, 0.5], false], [499, [lockAngle, -lockAngle], true], [499, [0, Math.fround(1.0472)], false], [499, [Number.NaN, 0], true],
      [Number.NaN, [0, 0], false],
    ] as const) {
      const { controller, lock, update } = locking();
      lock.level = 4;
      controller.steering.distance = distance;
      controller.steering.angles = angles;
      expect(update(CLOCK)).toBe(ok);
      expect(lock.level, `${distance} ${angles.join()}`).toBe(ok ? 4 : 0);
      expect(lock.nextUpdateClock).toBe(CLOCK + 0x40);
    }
  });

  it('drops to 0 at once for a target that does not resolve or is not active, or no ammunition, and turns off without list 1', () => {
    const cases: ((scene: ReturnType<typeof locking>) => void)[] = [
      ({ wingman }) => void (wingman.ai.objectTarget = null),
      ({ wingman }) => void (wingman.ai.objectTarget = 9999),
      ({ enemy }) => void (enemy.activity = 'parked'),
      ({ wingman }) => void (wingman.combat.weapons.mounts[1].ammunition = 0),
    ];
    for (const change of cases) {
      const scene = locking();
      scene.lock.level = 4;
      scene.lock.nextUpdateClock = CLOCK + 5;
      change(scene);
      expect(scene.update(CLOCK)).toBe(false);
      expect(scene.lock).toMatchObject({ level: 0, nextUpdateClock: CLOCK + 5 });
      expect(scene.controller.aiLock).toBe(true);
    }
    const scene = locking();
    scene.wingman.combat.weapons.selections[1].mount = null;
    scene.lock.level = 3;
    expect(scene.update(CLOCK)).toBe(false);
    expect(scene.controller.aiLock).toBe(false);
    expect(scene.lock.level).toBe(3);
  });

  it('starts again from level 0 after an evasion from a threat other than the target (A7: `0x5c584` on the copy)', () => {
    const scene = locking();
    scene.lock.level = 4;
    const threat = add(scene.state, 8, at(0, 0, 50));
    evade(aiPilot(scene.state, scene.wingman, scene.controller, scriptedRand([]), () => {}), threat.id);
    expect(scene.lock.level).toBe(0);
    expect(scene.wingman.ai.objectTarget).toBe(scene.enemy.id);
    expect(scene.update(CLOCK)).toBe(false);
    expect(scene.lock.level).toBe(2);
  });

  it('is ready at once for an unguided current mount, writing nothing', () => {
    const scene = locking();
    scene.wingman.combat.weapons.selections[1].index = 1;
    scene.wingman.combat.weapons.selections[1].mount = 2;
    scene.lock.level = 2;
    scene.wingman.ai.objectTarget = null;
    expect(scene.update(CLOCK)).toBe(true);
    expect(scene.lock).toMatchObject({ level: 2, nextUpdateClock: 0 });
  });
});

describe('the base handler 0x62c10 with 0x62b60 (A14)', () => {
  function based(kindBit = 17) {
    const state = world();
    const base = add(state, kindBit, ZERO);
    const enemy = add(state, kindBit === 17 ? 7 : 1, at(0, 0, 500));
    const posted: PilotRequest[] = [];
    return { state, base, enemy, common: controllerOf(state, base), posted, post: (request: PilotRequest) => void posted.push(request) };
  }

  it('installs: automatic mounts on, fractions 1, yaw set to 1.0, the kind mask, a draw per idle mount, then the update body', () => {
    const { state, base, enemy, common, posted, post } = based();
    const second = add(state, 7, at(0, 0, 600));
    const rand = scriptedRand([5, 6, 7]);
    const controller = installBase(state, base, common, rand, post);
    expect(rand.used).toBe(3);
    expect(controller).toMatchObject({ handler: 'base', base: { targetMask: 0x93780 }, automaticMounts: true, nextUpdateClock: CLOCK + 70 });
    expect(controller.steering).toMatchObject({ speedFraction: 1, turnFraction: 1, rollMatch: false });
    expect(posted).toEqual([{
      type: 'steer', entityId: base.id,
      control: { scale: 1, axes: [{ clear: true, set: false, value: 0 }, { clear: false, set: true, value: 1 }, { clear: true, set: false, value: 0 }], speedFactor: null },
    }]);
    // Each choice passes over the previous automatic mount's target. The install's pass gives mounts 0, 2 and 3 the
    // targets 1, 2, 1 (the two enemies in walk order); the update body's pass, reading those, gives 2, 1, 2 with the hold
    // 0x140, and loads each burst (without the install's pass it would give 1, 2, 1). The fixed mount is untouched.
    const mounts = base.combat.weapons.mounts;
    expect([0, 2, 3].map((index) => mounts[index].autoTarget)).toEqual([second.id, enemy.id, second.id]);
    for (const index of [0, 2, 3]) expect(mounts[index]).toMatchObject({ retargetClock: 0x140, burst: 3 });
    expect(mounts[0].aim).not.toEqual(mounts[1].aim);
    expect(mounts[1]).toMatchObject({ autoTarget: null, retargetClock: 0, burst: 0 });
  });

  it('gives a subject of the enemy kinds the mask 0x6c87f', () => {
    const { state, base, enemy, common, post } = based(7);
    const controller = installBase(state, base, common, scriptedRand([0, 0, 0]), post);
    expect(controller.base.targetMask).toBe(0x6c87f);
    expect(base.combat.weapons.mounts[0].autoTarget).toBe(enemy.id);
  });

  it('draws for every idle mount even with nothing to target, and the update reaches only the idle ones', () => {
    const { state, base, enemy, common, post } = based();
    enemy.position = at(0, 0, 5000);
    const mounts = base.combat.weapons.mounts;
    mounts[2].burst = 1;
    const rand = scriptedRand([1, 2]);
    const controller = installBase(state, base, common, rand, post);
    expect(rand.used).toBe(2);
    expect(mounts.map((mount) => mount.autoTarget)).toEqual([null, null, null, null]);
    expect(mounts.map((mount) => mount.retargetClock)).toEqual([0x140, 0, 0, 0x140]);
    enemy.position = at(0, 0, 500);
    state.clock = CLOCK + 70;
    updateBase(state, base, controller);
    expect(mounts.map((mount) => mount.burst)).toEqual([3, 0, 1, 3]);
    expect(mounts[2].autoTarget).toBeNull();
    expect(controller.nextUpdateClock).toBe(CLOCK + 140);
  });
});
