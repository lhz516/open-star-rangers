import { describe, expect, it } from 'vitest';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { craft, gun, mount, syntheticCraftInfo } from '../../content/rule-data/rule-data.test-support.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { blankCraftCombat, clearedControllerCommon, type AiControllerCommon, type Entity, type EntityInit, type Matrix3 } from '../world/entity-table.ts';
import type { WorldRuleData } from '../world/rule-data.ts';
import { addPlayerEntity, expectFault, stillEntityInit, testState } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { pilotScene } from './ai-piloting.ts';
import {
  armEngagement, chooseAutomaticTarget, DEFAULT_ENGAGEMENT_MASK, engageTarget, engagementShare, isRetargetDue, isSameSide, nextIdleAutomaticMount,
  previousAutomaticMount, proximityClearance, recentAttacker, refreshEngagement, type EngagementCall,
} from './ai-targeting.ts';
import { buildWeaponBlock, type CraftEntity } from './combat-init.ts';
import type { FiringData } from './firing.ts';
import { scriptedRand } from './rand.test-support.ts';

// P3-08/18 (docs/plan/p3/08/spec.md, S-07, AC-06; docs/original/formats/executable.md, A8–A11, A15, W9; P3-02 CR-24
// decision 3). Expectations are worked out by hand from those records: the share's counts, percentages and branches
// against a chosen group triple, the timer's draws, and the walk, fallback and hold of the automatic mounts' choice.

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
const at = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
const ZERO = at(0, 0, 0);
const LIMITS = Object.freeze({ turn: 1, speed: 0.5, saturation: 0.75, rollMatchThreshold: 0 });

/**
 * A world whose kind-17 record has mounts 0, 2 and 3 automatic (gun 0: burst 3) and 1 fixed (gun 1), every arc open
 * (+0x20 = 0) and every gun of range 1000; the triple of AICO group 0 is `triple`.
 */
function world(triple: readonly [number, number, number] = [60, 40, 100]): WorldState {
  const base = testState();
  const raw = syntheticCraftInfo();
  raw.guns = [gun({ at08: 100, at14: 4, at28: 2, at2C: 3 }), gun({ at08: 100, at14: 4, at18: 5, at28: 0 })];
  const automatic = () => mount({ weapon: 0, at20: 0, at24: [0, 0, 0], at34: 0 });
  raw.craft[17] = craft({ mounts: [automatic(), mount({ weapon: 1, at20: 0, at34: 0 }), automatic(), automatic()], mountLists: [[1], [], []] });
  const info = readCraftInfo(raw);
  const { inputs } = base.ruleData;
  const ruleData = {
    ...base.ruleData,
    craft: base.ruleData.craft.map((kind, kindBit) => (kindBit === 17 ? { ...kind!, mountOffsets: info.craft[17].mounts.map(() => ZERO) } : kind)),
    guns: info.guns.map(() => ({ range: 1000, rangeSquared: 1_000_000 })),
    inputs: { ...inputs, aiPrograms: { ...inputs.aiPrograms, content: { ...inputs.aiPrograms.content, groupTriple: triple } } },
  } as WorldRuleData;
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content: info }, ruleData };
  state.clock = 1000;
  return state;
}

/** An active, standing craft of `kindBit` at `position`. */
function add(state: WorldState, kindBit: number, position: Vec3, overrides: Partial<EntityInit> = {}): Entity {
  const entity = state.entities.allocate(stillEntityInit(kindBit, { position, orientation: IDENTITY, ...overrides }));
  entity.state = 'active';
  return entity;
}

const firing = (state: WorldState): FiringData => ({ info: state.craftInfo.content, rules: state.ruleData });

describe('the side test (ai §11.3)', () => {
  it('counts 0x6c07f as allies of a subject of the kinds 0x6c87f, 0x93f80 as allies of any other', () => {
    const state = world();
    const [wingman, base, enemy, other] = [add(state, 1, ZERO), add(state, 17, ZERO), add(state, 7, ZERO), add(state, 11, ZERO)];
    expect(isSameSide(wingman, base)).toBe(true);
    expect(isSameSide(wingman, enemy)).toBe(false);
    expect(isSameSide(enemy, add(state, 8, ZERO))).toBe(true);
    expect(isSameSide(enemy, wingman)).toBe(false);
    // Kind 11 is in 0x6c87f and in 0x93f80 but not in 0x6c07f.
    expect(isSameSide(other, base)).toBe(true);
    expect(isSameSide(wingman, other)).toBe(false);
    expect(isSameSide(enemy, other)).toBe(true);
  });
});

describe('the reads of the hit and proximity records (A15)', () => {
  it('gives the last attacker while it resolves and its hit lies within the window, strictly or inclusively', () => {
    const state = world();
    const subject = add(state, 7, ZERO) as CraftEntity;
    const attacker = add(state, 0, ZERO);
    const resolve = (id: number) => state.entities.get(id);
    expect(recentAttacker(subject, resolve, 1000, 50, false)).toBeUndefined();
    subject.combat.lastAttacker = { entity: attacker.id, clock: 950 };
    expect(recentAttacker(subject, resolve, 999, 50, false)).toBe(attacker);
    expect(recentAttacker(subject, resolve, 1000, 50, false)).toBeUndefined();
    expect(recentAttacker(subject, resolve, 1000, 50, true)).toBe(attacker);
    expect(recentAttacker(subject, resolve, 1001, 50, true)).toBeUndefined();
    // A negative window is a large unsigned one.
    expect(recentAttacker(subject, resolve, 99_999, -1, false)).toBe(attacker);
    subject.combat.lastAttacker = { entity: 9999, clock: 999 };
    expect(recentAttacker(subject, resolve, 1000, 50, true)).toBeUndefined();
  });

  it('gives the clearance F(d² − r²) of `0x2d37c`, with the own radius term only for an own kind', () => {
    const state = world();
    const rules = { ...state.ruleData, craft: state.ruleData.craft.map((kind, kindBit) => (kindBit === 7 || kindBit === 1 ? { ...kind!, shape: { ...kind!.shape, radiusSquared: kindBit === 7 ? 16 : 2.25 } } : kind)) };
    expect(proximityClearance(rules, null, 100.1, 7)).toBe(Math.fround(100.1 - 16));
    expect(proximityClearance(rules, 1, 100.1, 7)).toBe(Math.fround(100.1 - 2.25 - 16));
    expectFault(() => proximityClearance({ ...rules, craft: rules.craft.map(() => null) }, null, 1, 7), 'invariant-violated', 'ai-targeting.clearance-kind');
  });
});

interface ShareScene {
  readonly state: WorldState;
  readonly subject: CraftEntity;
  readonly player: Entity;
  readonly wingman: Entity;
  readonly controller: AiControllerCommon;
}

/** A player at the origin, the wingman, and the subject: an enemy (kind 7) whose controller's timer period is 50. */
function shareScene(triple?: readonly [number, number, number]): ShareScene {
  const state = world(triple);
  const player = addPlayerEntity(state, { position: ZERO });
  const wingman = add(state, 1, at(0, 50, 0));
  const subject = add(state, 7, at(0, 0, 100), { ruleInputs: { percentB: 0, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: 0, aiValueC: 40 } }) as CraftEntity;
  const controller = { ...clearedControllerCommon(), limits: LIMITS };
  controller.engagement.period = 50;
  return { state, subject, player, wingman, controller };
}

/** The share's call with scripted draws and a departure that answers `departs`, counting its calls. */
function call({ state, subject, controller }: ShareScene, draws: readonly number[] = [], departs = false) {
  const rand = scriptedRand(draws);
  let departures = 0;
  const shareCall: EngagementCall = {
    world: state, controller, scene: pilotScene(state, subject, controller), rand,
    depart: () => {
      departures++;
      return departs;
    },
  };
  return { call: shareCall, used: () => rand.used, departures: () => departures };
}

/** Kind-7 or kind-8 enemies, each targeting what `targets` names. */
function enemies({ state }: ShareScene, targets: readonly (Entity | null)[], kindBit = 8): Entity[] {
  return targets.map((target, index) => {
    const enemy = add(state, kindBit, at(index, 0, 500));
    enemy.ai.objectTarget = target?.id ?? null;
    return enemy;
  });
}

describe('the engagement share 0x632a4 (A9; difficulty path 5)', () => {
  it('does nothing without a player or while the player is in Warp', () => {
    const scene = shareScene();
    scene.player.inWarp = true;
    const { call: share, used } = call(scene);
    expect(engagementShare(share)).toBe(false);
    scene.state.player.entityId = null;
    expect(engagementShare(share)).toBe(false);
    expect(scene.subject.ai.objectTarget).toBeNull();
    expect(used()).toBe(0);
  });

  it('targets a recent attacker of the other side first, within C+0x148 strictly', () => {
    const scene = shareScene();
    scene.subject.combat.lastAttacker = { entity: scene.wingman.id, clock: 951 };
    expect(engagementShare(call(scene).call)).toBe(true);
    expect(scene.subject.ai.objectTarget).toBe(scene.wingman.id);
    expect(scene.controller.steering.target).toBe(scene.wingman.id);
    // At the window's end, or from the subject's own side, the attacker is passed over: no counted enemy, so the player.
    const later = shareScene();
    later.subject.combat.lastAttacker = { entity: later.wingman.id, clock: 950 };
    engagementShare(call(later).call);
    expect(later.subject.ai.objectTarget).toBe(later.player.id);
    const ally = shareScene();
    ally.subject.combat.lastAttacker = { entity: enemies(ally, [null])[0].id, clock: 999 };
    engagementShare(call(ally).call);
    expect(ally.subject.ai.objectTarget).toBe(ally.player.id);
  });

  it('targets the player when no counted enemy, or none of them, targets the player', () => {
    const scene = shareScene();
    enemies(scene, [scene.wingman, null]);
    const { call: share, used } = call(scene);
    expect(engagementShare(share)).toBe(true);
    expect(scene.subject.ai.objectTarget).toBe(scene.player.id);
    expect(used()).toBe(0);
  });

  it('counts only active enemies of kinds 0x380 in state 7 or above, alive, whose +0x8C is null or resolves', () => {
    // The excluded enemies all target the player; were any counted, the share would choose the wingman below.
    const scene = shareScene([0, 0, 0]);
    const [parked, fresh, dead, dangling] = enemies(scene, [scene.player, scene.player, scene.player, null]);
    parked.activity = 'parked';
    fresh.state = 'new';
    dead.destroyed = true;
    dangling.ai.objectTarget = 9999;
    enemies(scene, [scene.player], 2);
    engagementShare(call(scene).call);
    expect(scene.subject.ai.objectTarget).toBe(scene.player.id);
  });

  // Four counted enemies: two at the player, one at the wingman, one at none, so pP = 50, pW = 25 and pO = 75.
  const counted = (triple: readonly [number, number, number]) => {
    const scene = shareScene(triple);
    enemies(scene, [scene.player, scene.wingman, scene.player, null]);
    return scene;
  };

  it('chooses the wingman when a ≤ T0 SAR 1 and b > T1 SAR 1 or a < b, otherwise the player', () => {
    // T = [60, 40, 75]: a = 10, b = 15, c = 0; a < b.
    const wingman = counted([60, 40, 75]);
    engagementShare(call(wingman).call);
    expect(wingman.subject.ai.objectTarget).toBe(wingman.wingman.id);
    // T = [60, 50, 75]: b = 25 > 25 fails, a = 10 < 25 holds.
    const less = counted([60, 50, 75]);
    engagementShare(call(less).call);
    expect(less.subject.ai.objectTarget).toBe(less.wingman.id);
    // T = [60, 30, 75]: b = 5, neither holds.
    const player = counted([60, 30, 75]);
    engagementShare(call(player).call);
    expect(player.subject.ai.objectTarget).toBe(player.player.id);
    // T = [18, 80, 75]: a = −32 ≤ 9 and b = 55 > 40.
    const over = counted([18, 80, 75]);
    engagementShare(call(over).call);
    expect(over.subject.ai.objectTarget).toBe(over.wingman.id);
    // T = [110, 80, 75]: a = 60 > 55.
    const greater = counted([110, 80, 75]);
    engagementShare(call(greater).call);
    expect(greater.subject.ai.objectTarget).toBe(greater.player.id);
    // Without a ready wingman, the player.
    const away = counted([60, 40, 75]);
    away.wingman.inWarp = true;
    engagementShare(call(away).call);
    expect(away.subject.ai.objectTarget).toBe(away.player.id);
  });

  it('sends the subject at an active +0x90 of the other side when c > 0 and the draw lets it', () => {
    // T = [60, 30, 78]: c = 3 ≤ 39, so one draw: 0 % 96 < 40.
    const scene = counted([60, 30, 78]);
    const target = add(scene.state, 17, at(0, 0, 900));
    scene.subject.ai.target = target.id;
    const { call: share, used } = call(scene, [0]);
    engagementShare(share);
    expect(used()).toBe(1);
    expect(scene.subject.ai.objectTarget).toBe(target.id);
  });

  it('draws once when c ≤ T2 SAR 1, going while rand % 96 is below +0xE4', () => {
    const go = counted([60, 30, 100]);
    const target = add(go.state, 17, at(0, 0, 900));
    go.subject.ai.target = target.id;
    // T = [60, 30, 100]: c = 25 ≤ 50, so one draw: 135 % 96 = 39 < 40. Then 40 % 96 = 40 is not, and a = 10, b = 5 give the player.
    const going = call(go, [135]);
    engagementShare(going.call);
    expect(going.used()).toBe(1);
    expect(go.subject.ai.objectTarget).toBe(target.id);
    const stay = counted([60, 30, 100]);
    stay.subject.ai.target = add(stay.state, 17, at(0, 0, 900)).id;
    const staying = call(stay, [40]);
    engagementShare(staying.call);
    expect(staying.used()).toBe(1);
    expect(stay.subject.ai.objectTarget).toBe(stay.player.id);
  });

  it('draws nothing when c > T2 SAR 1, nor without a resolving +0x90 or with c ≤ 0', () => {
    // T = [60, 30, 151]: c = 76 > 75.
    const above = counted([60, 30, 151]);
    const target = add(above.state, 17, at(0, 0, 900));
    above.subject.ai.target = target.id;
    const noDraw = call(above);
    engagementShare(noDraw.call);
    expect(noDraw.used()).toBe(0);
    expect(above.subject.ai.objectTarget).toBe(target.id);
    // T = [60, 30, 120]: c = 45 ≤ 60 would draw, but +0x90 does not resolve.
    const half = counted([60, 30, 120]);
    half.subject.ai.target = 9999;
    const dangling = call(half);
    engagementShare(dangling.call);
    expect(dangling.used()).toBe(0);
    // T = [60, 30, 75]: c = 0.
    const none = counted([60, 30, 75]);
    none.subject.ai.target = add(none.state, 17, at(0, 0, 900)).id;
    const zero = call(none);
    engagementShare(zero.call);
    expect(zero.used()).toBe(0);
    expect(none.subject.ai.objectTarget).toBe(none.player.id);
  });

  it('passes over a +0x90 of its own side, and asks a non-active one to leave by Warp', () => {
    // T = [60, 30, 151]: c = 76 > 75 goes without a draw; a = 10, b = 5 give the player when it falls through.
    const own = counted([60, 30, 151]);
    // Kind 12 is on the subject's side and outside the counted kinds.
    own.subject.ai.target = add(own.state, 12, at(0, 0, 900)).id;
    engagementShare(call(own).call);
    expect(own.subject.ai.objectTarget).toBe(own.player.id);
    const parked = counted([60, 30, 151]);
    const friend = add(parked.state, 17, at(0, 0, 900));
    friend.activity = 'parked';
    parked.subject.ai.target = friend.id;
    const posted = call(parked, [], true);
    expect(engagementShare(posted.call)).toBe(true);
    expect(posted.departures()).toBe(1);
    expect(parked.subject.ai.objectTarget).toBeNull();
    // A refused departure falls through to the wingman or the player.
    const refused = call(parked, [], false);
    expect(engagementShare(refused.call)).toBe(true);
    expect(refused.departures()).toBe(1);
    expect(parked.subject.ai.objectTarget).toBe(parked.player.id);
  });
});

describe('the engagement timer (A10)', () => {
  it('arms with one draw rand % period, off for a period of 0, and the default mask for 0', () => {
    const controller = clearedControllerCommon();
    const none = scriptedRand([]);
    armEngagement(controller, 0, 0, 1000, none);
    expect(controller.engagement).toEqual({ dueClock: 0, period: 0, mask: DEFAULT_ENGAGEMENT_MASK });
    const rand = scriptedRand([250]);
    armEngagement(controller, 100, 0x380, 1000, rand);
    expect(controller.engagement).toEqual({ dueClock: 1050, period: 100, mask: 0x380 });
    expect(rand.used).toBe(1);
    expectFault(() => armEngagement(controller, -1, 0, 1000, none), 'invariant-violated', 'ai-targeting.engagement-period');
  });

  it('runs the share for a +0x8C that no longer resolves, clearing it first, and reports the change', () => {
    const scene = shareScene();
    scene.subject.ai.objectTarget = 9999;
    expect(refreshEngagement(call(scene).call)).toBe(true);
    expect(scene.subject.ai.objectTarget).toBe(scene.player.id);
  });

  it('runs it for a resolving +0x8C only once the timer is on and due, re-arming without a draw', () => {
    const scene = shareScene();
    const enemy = enemies(scene, [scene.player])[0];
    scene.subject.ai.objectTarget = enemy.id;
    expect(refreshEngagement(call(scene).call)).toBe(false);
    scene.controller.engagement.dueClock = 1001;
    expect(refreshEngagement(call(scene).call)).toBe(false);
    expect(scene.subject.ai.objectTarget).toBe(enemy.id);
    scene.controller.engagement.dueClock = 1000;
    const due = call(scene);
    expect(refreshEngagement(due.call)).toBe(true);
    expect(scene.controller.engagement.dueClock).toBe(1050);
    // One counted enemy at the player: pP = 100, pW = 0, pO = 100; a = −40 ≤ 30 and b = 40 > 20 give the wingman.
    expect(scene.subject.ai.objectTarget).toBe(scene.wingman.id);
    expect(due.used()).toBe(0);
    // Due again with the share choosing the same target: no change.
    scene.controller.engagement.dueClock = 1000;
    expect(refreshEngagement(call(scene).call)).toBe(false);
  });

  it('re-arms after a successful `0x5c584` (0x63744) while the timer is on', () => {
    const scene = shareScene();
    const view = pilotScene(scene.state, scene.subject, scene.controller);
    expect(engageTarget(scene.controller, view, scene.player.id)).toBe(true);
    expect(scene.controller.engagement.dueClock).toBe(0);
    scene.controller.engagement.dueClock = 1;
    expect(engageTarget(scene.controller, view, 9999)).toBe(false);
    expect(scene.controller.engagement.dueClock).toBe(1);
    expect(engageTarget(scene.controller, view, scene.wingman.id)).toBe(true);
    expect(scene.controller.engagement.dueClock).toBe(1050);
    expect(scene.subject.ai.objectTarget).toBe(scene.wingman.id);
  });
});

describe('the automatic mounts\' target choice (A11, W9)', () => {
  function armed() {
    const state = world();
    const base = add(state, 17, ZERO, { combat: { ...blankCraftCombat(), weapons: buildWeaponBlock(state.craftInfo.content.craft[17]) } }) as CraftEntity;
    return { state, base, data: firing(state), mounts: base.combat.weapons.mounts };
  }

  it('walks the idle automatic mounts: automatic, not destroyed, burst 0', () => {
    const { base, data, mounts } = armed();
    expect([nextIdleAutomaticMount(data, base, null), nextIdleAutomaticMount(data, base, 0), nextIdleAutomaticMount(data, base, 2), nextIdleAutomaticMount(data, base, 3)])
      .toEqual([0, 2, 3, null]);
    mounts[0].burst = 3;
    mounts[2].damage = 2;
    expect(nextIdleAutomaticMount(data, base, null)).toBe(3);
  });

  it('finds the previous automatic mount downward with wrap-around, the mount itself when it is the only one', () => {
    const { base, data, mounts } = armed();
    expect([0, 2, 3].map((index) => previousAutomaticMount(data, base, index))).toEqual([3, 0, 2]);
    mounts[0].burst = 3;
    expect(previousAutomaticMount(data, base, 2)).toBe(0);
    mounts[0].damage = 2;
    mounts[3].damage = 2;
    expect(previousAutomaticMount(data, base, 2)).toBe(2);
    mounts[2].damage = 2;
    expect(previousAutomaticMount(data, base, 2)).toBeNull();
  });

  it('takes the first entity of the mask in walk order that is in range and hemisphere, storing the hold as given', () => {
    const { state, base, data, mounts } = armed();
    const near8 = add(state, 8, at(0, 0, 100));
    const far7 = add(state, 7, at(0, 0, 2000));
    const near7 = add(state, 7, at(0, 0, 500));
    expect(chooseAutomaticTarget(data, state.entities, base, 0, 0x380, 0x1c0)).toBe(true);
    // Kind 7 comes before kind 8 in the walk.
    expect(mounts[0]).toMatchObject({ autoTarget: near7.id, retargetClock: 0x1c0 });
    // No state filter: a parked, destroyed or Warping entity is a candidate.
    near7.activity = 'parked';
    near7.destroyed = true;
    near7.inWarp = true;
    near7.state = 'destroyed-source';
    // Mount 3's previous automatic mount, 2, holds nothing.
    expect(chooseAutomaticTarget(data, state.entities, base, 3, 0x380, 0)).toBe(true);
    expect(mounts[3]).toMatchObject({ autoTarget: near7.id, retargetClock: 0 });
    expect([far7.id, near8.id]).not.toContain(mounts[0].autoTarget);
  });

  it('passes over the previous mount\'s target as the fallback, chosen only when nothing else passes', () => {
    const { state, base, data, mounts } = armed();
    const near7 = add(state, 7, at(0, 0, 500));
    const near8 = add(state, 8, at(0, 0, 100));
    // Mount 2's previous automatic mount is 0.
    mounts[0].autoTarget = near7.id;
    chooseAutomaticTarget(data, state.entities, base, 2, 0x380, 0x140);
    expect(mounts[2].autoTarget).toBe(near8.id);
    near8.position = at(0, 0, 5000);
    chooseAutomaticTarget(data, state.entities, base, 2, 0x380, 0x140);
    expect(mounts[2].autoTarget).toBe(near7.id);
    near7.position = at(0, 0, 5000);
    expect(chooseAutomaticTarget(data, state.entities, base, 2, 0x380, 0x140)).toBe(false);
    expect(mounts[2]).toMatchObject({ autoTarget: null, retargetClock: 0x140 });
  });

  it('drops a previous target that no longer resolves once the walk meets an entity, and draws nothing', () => {
    const { state, base, data, mounts } = armed();
    mounts[3].autoTarget = 9999;
    const before = state.rngState;
    chooseAutomaticTarget(data, state.entities, base, 0, 0x380, 0x140);
    expect(mounts[3].autoTarget).toBe(9999);
    add(state, 7, at(0, 0, 5000));
    chooseAutomaticTarget(data, state.entities, base, 0, 0x380, 0x140);
    expect(mounts[3].autoTarget).toBeNull();
    expect(state.rngState).toEqual(before);
  });

  it('treats every hold as passed (P3-02 CR-24 decision 3) and faults on one no writer stores', () => {
    const { mounts } = armed();
    for (const hold of [0, 0x140, 0x1c0]) {
      mounts[0].retargetClock = hold;
      expect(isRetargetDue(mounts[0])).toBe(true);
    }
    mounts[0].retargetClock = 0x1c1;
    expectFault(() => isRetargetDue(mounts[0]), 'invariant-violated', 'ai-targeting.retarget-hold');
  });
});
