import { describe, expect, it } from 'vitest';
import { mount } from '../../content/rule-data/rule-data.test-support.ts';
import type { Request } from '../systems/pipeline.ts';
import { initialWorldState } from '../world/create-world.ts';
import {
  aiProgramsContent, asCreateInput, craftInfoContent, declaration, missionFrame, rosterContent, ruleInputs, wingmanOption, worldInput,
} from '../world/create-world.test-support.ts';
import { ALL_KINDS, type Entity, type Matrix3, type SteeredMovementBlock } from '../world/entity-table.ts';
import { constructWorld } from '../world/world.ts';
import { tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { installedController } from './ai-selection.ts';
import { applyBehaviour, installWingman, isFriendlyFireBlocking, updateWingman, type WingmanCall, type WingmanController } from './ai-wingman.ts';
import type { CraftEntity } from './combat-init.ts';
import { scriptedRand } from './rand.test-support.ts';

// P3-08/19 (docs/plan/p3/08/spec.md, 僚机, S-09, AC-07; docs/original/formats/executable.md, WA1–WA10, WB6). Every
// expectation is worked out from the WA records with the synthetic data below, not from the module.
//
// The world: the player at the runtime origin side, two kind-7 hostiles, one base (kind 17), and the wingman (kind 1,
// built-in record 3: period 70) of roster entry 0. The wingman's craft (synthetic record: maximum 64, turn rates 0.75,
// 0.25, 0.5; hull 12) gets two list-0 guns (gun 0: speed 100, range 5000), so lead mode 5 has a weapon speed. AICO
// element 2 is (0.5, 0.5, 0, 0): fractions 0.5 and no noise; element 1 (0.75, 0.5, 0.25, 0) has throttle noise. The
// globals are the synthetic ones (+0x20 2, +0x24 3, +0x28 4; the engage radius −6 − 7 × +0xE4 is never positive) unless
// a test sets the engage radius +0x2C 1000, +0x30 1 (ENGAGING) over the wingman's +0xE4 of 20: 980. Every entity is
// active, faces along +z (rows x, y, z) and stands still unless a test moves it.

const f32 = Math.fround;
const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
const PERIOD = 70;
const LEAD_CONSTANT = f32(PERIOD / 64);
const PLAYER_AT = Object.freeze({ x: 0, y: 0, z: 0 });
/** The formation point: the player's position plus (125, 3, 25) along its rows. */
const FORMATION_POINT = Object.freeze({ x: 125, y: 3, z: 25 });
const ENGAGING = Object.freeze({ at2C: 1000, at30: 1 });

interface Harness {
  readonly state: WorldState;
  readonly wingman: CraftEntity;
  readonly player: Entity;
  readonly hostiles: readonly [Entity, Entity];
  readonly base: Entity;
  readonly posted: Request[];
  readonly departures: number[];
  /** A call with the scripted draws; the clock moves on by 2 first, so each call is a new sample. */
  call(draws?: readonly number[]): WingmanCall & { readonly rand: { readonly used: number } };
  install(draws?: readonly number[]): WingmanController;
}

interface Options {
  readonly element?: number;
  readonly globals?: Record<string, number>;
  readonly period?: number;
}

function harness({ element = 3, globals = {}, period = PERIOD }: Options = {}): Harness {
  const mission = missionFrame();
  mission.declarations = [
    declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
    declaration(1, { craftType: 7, position: { x: 100, y: 200, z: 600 } }),
    declaration(2, { craftType: 7, position: { x: 100, y: 200, z: 900 } }),
    declaration(3, { craftType: 17, position: { x: 100, y: 1200, z: 60 } }),
  ];
  const craftInfo = craftInfoContent();
  Object.assign(craftInfo.guns[0], { at08: 100, at24: 3200 });
  const gun = () => mount({ weapon: 0, at20: 0, at34: 0 });
  Object.assign(craftInfo.craft[1], { mounts: [gun(), gun()], mountLists: [[0, 1], [], []] });
  const aiPrograms = aiProgramsContent();
  Object.assign(aiPrograms.globals, globals);
  aiPrograms.builtInPrograms[3] = { ...aiPrograms.builtInPrograms[3], at14: period };
  const roster = rosterContent();
  roster.options[0] = wingmanOption(0, { ruleInputs: ruleInputs({ aiValueA: element, aiValueC: 20 }) });
  const state = initialWorldState(asCreateInput(worldInput({ mission, craftInfo, aiPrograms, roster, run: { wingman: 0 } })));
  constructWorld(state).step(tickInput());
  const entities = [...state.entities.walk(ALL_KINDS)];
  const of = (kindBit: number) => entities.filter((entity) => entity.kindBit === kindBit);
  const [player] = of(0);
  const [wingman] = of(1) as CraftEntity[];
  const [first, second] = of(7);
  const [base] = of(17);
  for (const entity of [player, wingman, first, second, base]) {
    entity.state = 'active';
    entity.orientation = IDENTITY;
    if (entity.movement !== null) (entity.movement as SteeredMovementBlock).speed = 0;
  }
  player.position = PLAYER_AT;
  wingman.position = FORMATION_POINT;
  first.position = { x: 125, y: 3, z: 600 };
  second.position = { x: 125, y: 3, z: 900 };
  base.position = { x: 5000, y: 0, z: 0 };
  const posted: Request[] = [];
  const departures: number[] = [];
  const call = (draws: readonly number[] = []) => {
    state.clock += 2;
    return { world: state, subject: wingman, rand: scriptedRand(draws), post: (request: Request) => void posted.push(request), depart: () => (departures.push(state.clock), false) } as WingmanCall & { readonly rand: { readonly used: number } };
  };
  const install = (draws: readonly number[] = []) => {
    const common = installedController(state.ruleData.inputs.aiPrograms.content.builtInPrograms[3], state.craftInfo.content.craft[1]);
    const rand = call(draws);
    const controller = installWingman(rand, common);
    expect(rand.rand.used).toBe(draws.length);
    return controller;
  };
  return { state, wingman, player, hostiles: [first, second], base, posted, departures, call, install };
}

/** Runs one update with `draws`, which it must use up, after clearing the posted requests. */
function update(h: Harness, controller: WingmanController, draws: readonly number[] = []): Request[] {
  h.posted.length = 0;
  const call = h.call(draws);
  updateWingman(call, controller);
  expect(call.rand.used).toBe(draws.length);
  return [...h.posted];
}

const speedOf = (entity: Entity, speed: number) => void ((entity.movement as SteeredMovementBlock).speed = speed);
const match = (entityId: number, targetEntityId: number, a: number, lo: number, hi: number) => ({ type: 'ai-match-speed', entityId, targetEntityId, a, lo, hi });
const throttleOnly = (factor: number) => ({ type: 'steer', control: { axes: [{ set: false }, { set: false }, { set: false }], speedFactor: factor } });
const stopped = { type: 'steer', control: { axes: [{ set: true, value: 0 }, { set: true, value: 0 }, { set: true, value: 0 }], speedFactor: 0 } };

describe('the friendly-fire reader 0x38fd8 (WB6; CR-27)', () => {
  it('blocks only above AICO +0x28, signed: equality does not', () => {
    const { state } = harness();
    for (const [accumulated, blocking] of [[3, false], [4, false], [5, true], [-1, false]] as const) {
      state.ai.friendlyFire.accumulated = accumulated;
      expect(isFriendlyFireBlocking(state)).toBe(blocking);
    }
    const negative = harness({ globals: { at28: -2 } });
    expect(isFriendlyFireBlocking(negative.state)).toBe(true);
    negative.state.ai.friendlyFire.accumulated = -2;
    expect(isFriendlyFireBlocking(negative.state)).toBe(false);
  });
});

describe('the install 0x60f80 and the initial behaviour 0x61d64 (WA2)', () => {
  it('takes AICO element +0xDC − 1 for the fractions with roll matching and the noise, turns the AI lock on, and starts in formation', () => {
    const h = harness();
    h.wingman.combat.weapons.lock.level = 3;
    const controller = h.install();
    const clock = h.state.clock;
    expect(controller.steering).toMatchObject({
      speedFraction: 0.5, turnFraction: 0.5, rollMatch: true, speedLimit: 32, halfSpeedLimit: 16, turnRates: [0.375, 0.125, 0.25],
      throttleNoise: { enabled: false }, steeringNoise: { enabled: false },
      // Formation: the player, offset (125, 3, 25) in its rows, no lead.
      target: h.player.id, targetValid: true, offset: { enabled: true, frame: 0, vector: FORMATION_POINT }, leadMode: 0,
    });
    expect(controller).toMatchObject({ handler: 'wingman', aiLock: true, period: PERIOD, nextUpdateClock: clock + PERIOD });
    expect(h.wingman.combat.weapons.lock.level).toBe(0);
    // The search near the player ran in the same call (B+0x10) and the gun check did not (formation).
    expect(controller.wingman).toEqual({ behaviour: 2, doNotAttack: null, attackTarget: null, nextGunSwitchClock: 0, nextEngageSearchClock: clock + 0x140 });
    // The mirror: +0x90 the player, +0xC4 2.
    expect(h.wingman.ai).toMatchObject({ target: h.player.id, mode: 2, objectTarget: h.player.id });
    // The same call's flight: on the formation point next to a still player, all rates and the throttle 0.
    expect(h.posted).toMatchObject([{ ...stopped, entityId: h.wingman.id }]);
  });

  it('draws the throttle noise of an element that has it in the same call\'s posts', () => {
    const h = harness({ element: 2 });
    h.wingman.position = { x: 125, y: 3, z: 400 };
    // The formation point 375 away: steering (no speed factor, so no throttle noise), then full throttle with one draw.
    const controller = h.install([16383]);
    expect(controller.steering).toMatchObject({ speedFraction: 0.75, turnFraction: 0.5, throttleNoise: { enabled: true, low: -0.25, high: 0.25 }, steeringNoise: { enabled: false } });
    expect(h.posted).toHaveLength(2);
    expect(h.posted[1]).toMatchObject({ type: 'steer', control: { speedFactor: f32(f32(f32(16383 / 32767) * 0.5) - 0.25 + 0.75) } });
  });

  it('rebuilds b from +0xC4 and +0x90: 0 attacks a resolving +0x90; 2 returns to a base; anything else is the formation', () => {
    const cases = [
      { mode: 0, target: 'hostile', behaviour: 0, attackTarget: 'hostile' },
      { mode: 0, target: 'gone', behaviour: 0, attackTarget: null },
      { mode: 2, target: 'base', behaviour: 3, attackTarget: null },
      { mode: 2, target: 'hostile', behaviour: 2, attackTarget: null },
      { mode: 4, target: 'base', behaviour: 2, attackTarget: null },
      { mode: 5, target: null, behaviour: 2, attackTarget: null },
    ] as const;
    for (const { mode, target, behaviour, attackTarget } of cases) {
      const h = harness();
      // The hostile moves at half the speed limit (16), so b 0 pursues instead of passing; the base stands right here.
      speedOf(h.hostiles[0], 16);
      h.base.position = { x: 130, y: 3, z: 25 };
      const ids = { hostile: h.hostiles[0].id, base: h.base.id, gone: 9999 } as const;
      Object.assign(h.wingman.ai, { mode, target: target === null ? null : ids[target] });
      // b 0 and b 1 (the base's arrival) pursue the hostile and check the main gun at once: (0x7fff & 0xff) ≥ 0x40 keeps it.
      const controller = h.install((behaviour === 0 && attackTarget !== null) || behaviour === 3 ? [0x7fff] : []);
      const expected = attackTarget === null ? null : ids[attackTarget];
      // A gone +0x90 gives b 0 without B+8, which the apply drops to the formation at once.
      expect(controller.wingman, `${mode} ${target}`).toMatchObject({ behaviour: attackTarget === null && behaviour === 0 ? 2 : behaviour === 3 ? 1 : behaviour, attackTarget: expected });
    }
  });
});

describe('applying a behaviour 0x61740 and the mirror 0x61dfc (WA4)', () => {
  it('b 0: attacks B+8 with the offset off and lead mode 5 at F(C+0xF4 ÷ 64); falls back to the formation for B+4 or a gone B+8', () => {
    const h = harness();
    const controller = h.install();
    Object.assign(controller.wingman, { behaviour: 0, attackTarget: h.hostiles[0].id });
    expect(applyBehaviour(h.call(), controller)).toBe(true);
    expect(controller.steering).toMatchObject({ target: h.hostiles[0].id, offset: { enabled: false }, leadMode: 5, leadConstant: LEAD_CONSTANT });
    expect(h.wingman.ai).toMatchObject({ target: h.hostiles[0].id, mode: 0, objectTarget: h.hostiles[0].id });
    controller.wingman.doNotAttack = h.hostiles[0].id;
    expect(applyBehaviour(h.call(), controller)).toBe(false);
    expect(controller.wingman.behaviour).toBe(2);
    expect(controller.steering).toMatchObject({ target: h.player.id, offset: { enabled: true }, leadMode: 0 });
    Object.assign(controller.wingman, { behaviour: 0, attackTarget: 9999, doNotAttack: 8888 });
    expect(applyBehaviour(h.call(), controller)).toBe(false);
    // The accessor cleared the gone B+8; B+4 was not read.
    expect(controller.wingman).toMatchObject({ behaviour: 2, attackTarget: null, doNotAttack: 8888 });
  });

  it('b 1: the nearest hostile at least as far as the player\'s target, passing B+4; the formation without one', () => {
    const h = harness();
    const controller = h.install();
    const [first, second] = h.hostiles;
    controller.wingman.behaviour = 1;
    expect(applyBehaviour(h.call(), controller)).toBe(true);
    expect(controller.steering.target).toBe(first.id);
    expect(h.wingman.ai).toMatchObject({ target: first.id, mode: 0 });
    // The player targets the nearer one: the search starts there and finds the farther.
    h.state.player.target = first.id;
    expect(applyBehaviour(h.call(), controller)).toBe(true);
    expect(controller.steering.target).toBe(second.id);
    // B+4 the farther one: the search passes it and finds nothing more.
    controller.wingman.doNotAttack = second.id;
    expect(applyBehaviour(h.call(), controller)).toBe(false);
    expect(controller.wingman.behaviour).toBe(2);
    expect(controller.steering.target).toBe(h.player.id);
  });

  it('b 3: the first base in walk order as +0x90 with +0xC4 2; steers at it while active, else departs with +0x8C null', () => {
    const h = harness();
    const controller = h.install();
    controller.wingman.behaviour = 3;
    expect(applyBehaviour(h.call(), controller)).toBe(true);
    expect(controller.steering).toMatchObject({ target: h.base.id, offset: { enabled: false } });
    expect(h.wingman.ai).toMatchObject({ target: h.base.id, mode: 2, objectTarget: h.base.id });
    expect(h.departures).toEqual([]);
    h.base.activity = 'parked';
    expect(applyBehaviour(h.call(), controller)).toBe(true);
    expect(h.departures).toEqual([h.state.clock]);
    expect(h.wingman.ai).toMatchObject({ target: h.base.id, mode: 2, objectTarget: null });
    h.state.entities.remove(h.base);
    expect(applyBehaviour(h.call(), controller)).toBe(false);
    expect(controller.wingman.behaviour).toBe(2);
  });

  it('b 4: the player\'s destination as the goal; point steering inside the active area, else a departure', () => {
    const h = harness();
    const controller = h.install();
    controller.wingman.behaviour = 4;
    expect(applyBehaviour(h.call(), controller)).toBe(false);
    expect(controller.wingman.behaviour).toBe(2);
    const near = { x: 2000, y: 1000, z: 50 };
    h.state.player.map.destination = near;
    controller.wingman.behaviour = 4;
    expect(applyBehaviour(h.call(), controller)).toBe(true);
    expect(controller.steering).toMatchObject({ targetValid: true, target: null, point: near, offset: { enabled: false } });
    expect(h.wingman.ai).toMatchObject({ target: null, mode: 2, goal: near, objectTarget: null });
    expect(h.departures).toEqual([]);
    // 7500 is the active area's radius: a point on it is outside.
    const far = { x: 7500, y: 0, z: 0 };
    h.state.player.map.destination = far;
    expect(applyBehaviour(h.call(), controller)).toBe(true);
    expect(h.departures).toEqual([h.state.clock]);
    expect(h.wingman.ai).toMatchObject({ goal: far, objectTarget: null });
  });

  it('b 5: attacks the player with lead mode 5; the mirror writes +0x90 B+8 and +0xC4 0', () => {
    const h = harness();
    const controller = h.install();
    Object.assign(controller.wingman, { behaviour: 5, attackTarget: h.hostiles[1].id });
    expect(applyBehaviour(h.call(), controller)).toBe(true);
    expect(controller.steering).toMatchObject({ target: h.player.id, offset: { enabled: false }, leadMode: 5, leadConstant: LEAD_CONSTANT });
    expect(h.wingman.ai).toMatchObject({ target: h.hostiles[1].id, mode: 0 });
  });

  it('does nothing without the player', () => {
    const h = harness();
    const controller = h.install();
    controller.wingman.behaviour = 5;
    h.state.player.entityId = null;
    const steering = structuredClone(controller.steering);
    expect(applyBehaviour(h.call(), controller)).toBe(false);
    expect(controller.steering).toEqual(steering);
    expect(controller.wingman.behaviour).toBe(5);
  });
});

describe('the periodic behaviour 0x61a88 (WA5)', () => {
  it('turns angry above the threshold and stays angry after the accumulator falls (sticky b 5)', () => {
    const h = harness();
    const controller = h.install();
    h.state.ai.friendlyFire.accumulated = 4;
    update(h, controller);
    expect(controller.wingman.behaviour).toBe(2);
    h.state.ai.friendlyFire.accumulated = 5;
    // Angry, it pursues the player: the gun check draws once.
    update(h, controller, [0x7fff]);
    expect(controller.wingman.behaviour).toBe(5);
    expect(controller.steering).toMatchObject({ target: h.player.id, leadMode: 5 });
    expect(h.wingman.ai.mode).toBe(0);
    h.state.ai.friendlyFire.accumulated = 0;
    update(h, controller);
    expect(controller.wingman.behaviour).toBe(5);
  });

  it('b 0 drops B+8 to the formation when the steering target is gone or is B+4', () => {
    const h = harness();
    const controller = h.install();
    speedOf(h.hostiles[0], 16);
    Object.assign(controller.wingman, { behaviour: 0, attackTarget: h.hostiles[0].id });
    applyBehaviour(h.call(), controller);
    update(h, controller, [0x7fff]);
    expect(controller.wingman).toMatchObject({ behaviour: 0, attackTarget: h.hostiles[0].id });
    controller.wingman.doNotAttack = h.hostiles[0].id;
    update(h, controller);
    expect(controller.wingman).toMatchObject({ behaviour: 2, attackTarget: null });
  });

  it('b 1 picks again when its target is the player\'s', () => {
    const h = harness();
    const controller = h.install();
    speedOf(h.hostiles[0], 16);
    speedOf(h.hostiles[1], 16);
    controller.wingman.behaviour = 1;
    applyBehaviour(h.call(), controller);
    expect(controller.steering.target).toBe(h.hostiles[0].id);
    h.state.player.target = h.hostiles[0].id;
    update(h, controller, [0x7fff]);
    expect(controller.steering.target).toBe(h.hostiles[1].id);
  });

  it('b 2 engages the hostile nearest the player within the engage radius, strictly on the chopped distance, every 0x140', () => {
    for (const [z, engages] of [[979.9, true], [980.5, false]] as const) {
      const h = harness({ globals: ENGAGING });
      const [first, second] = h.hostiles;
      speedOf(first, 16);
      first.position = { x: 0, y: 0, z: f32(z) };
      second.position = { x: 0, y: 0, z: 3000 };
      // The install's own update searches at once (B+0x10 is 0); an engagement pursues and checks the gun.
      const controller = h.install(engages ? [0x7fff] : []);
      expect(controller.wingman, `${z}`).toMatchObject({ behaviour: engages ? 0 : 2, attackTarget: engages ? first.id : null, nextEngageSearchClock: h.state.clock + 0x140 });
    }
  });

  it('b 2 searches past B+4, skips the player\'s target, and waits for its next search', () => {
    const h = harness({ globals: ENGAGING });
    const [first, second] = h.hostiles;
    for (const hostile of h.hostiles) hostile.position = { x: 0, y: 0, z: 5000 };
    const controller = h.install();
    speedOf(second, 16);
    first.position = { x: 0, y: 0, z: 100 };
    second.position = { x: 0, y: 0, z: 200 };
    controller.wingman.doNotAttack = first.id;
    const due = controller.wingman.nextEngageSearchClock;
    while (h.state.clock + 2 <= due) update(h, controller);
    expect(controller.wingman.behaviour).toBe(2);
    update(h, controller, [0x7fff]);
    expect(controller.wingman).toMatchObject({ behaviour: 0, attackTarget: second.id, doNotAttack: first.id });
    const other = harness({ globals: ENGAGING });
    other.hostiles[0].position = { x: 0, y: 0, z: 100 };
    other.hostiles[1].position = { x: 0, y: 0, z: 5000 };
    other.state.player.target = other.hostiles[0].id;
    expect(other.install().wingman.behaviour).toBe(2);
  });

  it('b 3 departs while the base is parked, and within the approach radius of an active one repairs fully and turns to b 1', () => {
    const h = harness();
    const controller = h.install();
    controller.wingman.behaviour = 3;
    applyBehaviour(h.call(), controller);
    h.base.activity = 'parked';
    update(h, controller);
    expect(h.departures).toEqual([h.state.clock]);
    expect(h.wingman.ai.objectTarget).toBeNull();
    expect(controller.wingman.behaviour).toBe(3);
    // Back, active, and next to the wingman: well within the approach radius.
    h.base.activity = 'active';
    h.base.position = { x: 130, y: 3, z: 25 };
    applyBehaviour(h.call(), controller);
    h.wingman.combat.hull = 1;
    speedOf(h.hostiles[0], 16);
    update(h, controller, [0x7fff]);
    expect(h.wingman.combat.hull).toBe(12);
    expect(controller.wingman.behaviour).toBe(1);
    expect(controller.steering.target).toBe(h.hostiles[0].id);
  });

  it('b 3 counts an unordered distance to an active base as arrived', () => {
    const h = harness();
    const controller = h.install();
    controller.wingman.behaviour = 3;
    applyBehaviour(h.call(), controller);
    controller.steering.distance = Number.NaN;
    h.wingman.combat.hull = 1;
    speedOf(h.hostiles[0], 16);
    update(h, controller, [0x7fff]);
    expect(h.wingman.combat.hull).toBe(12);
    expect(controller.wingman.behaviour).toBe(1);
  });

  it('b 4 asks for a departure at every update in point mode, where +0x8C stays null', () => {
    const h = harness();
    const controller = h.install();
    h.state.player.map.destination = { x: 2000, y: 1000, z: 50 };
    controller.wingman.behaviour = 4;
    applyBehaviour(h.call(), controller);
    update(h, controller);
    const first = h.state.clock;
    update(h, controller);
    expect(h.departures).toEqual([first, h.state.clock]);
    expect(controller.wingman.behaviour).toBe(4);
  });
});

describe('the update order of 0x610c8 and its flight branches (WA3, WA6)', () => {
  it('holds the formation by the distance to the formation point: 16, 32 and 120, strictly, and stops next to a slow player', () => {
    const cases = [
      [10, match(0, 0, f32(-0.1), 0, 1)],
      [16, match(0, 0, 0, 0, 1)],
      [100, match(0, 0, f32(0.15), 0, 1)],
      [120, throttleOnly(0.5)],
    ] as const;
    for (const [distance, speed] of cases) {
      const h = harness();
      const controller = h.install();
      speedOf(h.player, 5);
      h.wingman.position = { ...FORMATION_POINT, z: FORMATION_POINT.z - distance };
      const posted = update(h, controller);
      const expected = speed.type === 'ai-match-speed' ? { ...speed, entityId: h.wingman.id, targetEntityId: h.player.id } : speed;
      expect(posted, `${distance}`).toMatchObject([{ type: 'steer', control: { speedFactor: null } }, expected]);
      expect(controller.nextUpdateClock).toBe(h.state.clock + PERIOD);
    }
    const h = harness();
    const controller = h.install();
    speedOf(h.player, f32(4.9));
    h.wingman.position = { ...FORMATION_POINT, z: FORMATION_POINT.z - 59 };
    expect(update(h, controller)).toMatchObject([stopped]);
  });

  it('pursues by the distance to the target, 250 and 550; presses channel 0 aimed and in range, channel 1 ready and steady', () => {
    for (const [z, expected] of [[249, match(0, 0, f32(-0.15), f32(0.2), 1)], [250, match(0, 0, 0, 0, 1)], [550, throttleOnly(0.5)]] as const) {
      const h = harness();
      const controller = h.install();
      const [hostile] = h.hostiles;
      speedOf(hostile, 16);
      hostile.position = { x: 125, y: 3, z: 25 + z };
      Object.assign(controller.wingman, { behaviour: 0, attackTarget: hostile.id });
      applyBehaviour(h.call(), controller);
      controller.missileReady = true;
      const clock = h.state.clock + 2;
      const posted = update(h, controller, [0x7fff]);
      const speed = expected.type === 'ai-match-speed' ? { ...expected, entityId: h.wingman.id, targetEntityId: hostile.id } : expected;
      expect(posted, `${z}`).toMatchObject([{ type: 'steer', control: { speedFactor: null } }, speed]);
      expect(controller.steering.coneBits).toBe(3);
      expect(controller.triggers.slice(0, 2)).toEqual([{ pressed: true, holdDeadline: clock + 0x60 }, { pressed: true, holdDeadline: clock + 0x7d00 }]);
      expect(controller.wingman.nextGunSwitchClock).toBe(clock + 0x780);
    }
  });

  it('switches the main gun on a draw below 0x40 every 0x780, and moves list 1 on while its chain has no ammunition', () => {
    const h = harness();
    const controller = h.install();
    const [hostile] = h.hostiles;
    speedOf(hostile, 16);
    Object.assign(controller.wingman, { behaviour: 0, attackTarget: hostile.id });
    applyBehaviour(h.call(), controller);
    const { weapons } = h.wingman.combat;
    weapons.lock.level = 2;
    update(h, controller, [0x140]);
    expect(weapons.selections[0]).toMatchObject({ index: 0, mount: 0 });
    // The empty list 1 moved on, which clears the lock level.
    expect(weapons.lock.level).toBe(0);
    update(h, controller);
    controller.wingman.nextGunSwitchClock = 0;
    update(h, controller, [0x13f]);
    expect(weapons.selections[0]).toMatchObject({ index: 1, mount: 1 });
  });

  it('runs the attack pass for b 0 and 1 against a slow target, which then writes the next update', () => {
    const h = harness();
    const controller = h.install();
    const [hostile] = h.hostiles;
    Object.assign(controller.wingman, { behaviour: 0, attackTarget: hostile.id });
    applyBehaviour(h.call(), controller);
    update(h, controller);
    expect(controller.attackPass).toMatchObject({ phase: 1, savedLeadMode: 5 });
    expect(controller.steering).toMatchObject({ leadMode: 5, leadConstant: 0, sizeClass: 3 });
    expect(controller.nextUpdateClock).toBe(h.state.clock + PERIOD);
    expect(controller.wingman.nextGunSwitchClock).toBe(0);
  });

  it('evades a near proximity record ahead (only its radius against AICO +0x20) for half the period', () => {
    const h = harness();
    const controller = h.install();
    const [hostile] = h.hostiles;
    const radiusSquared = h.state.ruleData.craft[7]!.shape.radiusSquared;
    hostile.position = { x: 125, y: 3, z: 100 };
    for (const [extra, ahead, evades] of [[1, true, true], [2, true, false], [1, false, false]] as const) {
      h.wingman.combat.proximity = { entity: hostile.id, distanceSquared: f32(radiusSquared + extra) };
      hostile.position = { x: 125, y: 3, z: ahead ? 100 : -100 };
      const posted = update(h, controller);
      expect(controller.nextUpdateClock - h.state.clock, `${extra} ${ahead}`).toBe(evades ? PERIOD >> 1 : PERIOD);
      // The evasion: a break turn at scale 1.5, then full throttle.
      if (evades) expect(posted).toMatchObject([{ control: { scale: 1.5 } }, throttleOnly(1)]);
    }
  });

  it('turns away from its recent friendly victim (AICO +0x24, strict), which no longer includes the player when angry', () => {
    const h = harness();
    const controller = h.install();
    controller.triggers[0].pressed = true;
    h.wingman.combat.lastVictim = { entity: h.base.id, clock: h.state.clock };
    // 2 units on, within 3: evade, channel 0 released.
    let posted = update(h, controller);
    expect(posted).toMatchObject([{ control: { scale: 1.5 } }, throttleOnly(1)]);
    expect(controller.triggers[0].pressed).toBe(false);
    // 4 units on: the formation flight.
    expect(update(h, controller)).toMatchObject([stopped]);
    h.wingman.combat.lastVictim = { entity: h.player.id, clock: h.state.clock + 1 };
    posted = update(h, controller);
    expect(posted).toMatchObject([{ control: { scale: 1.5 } }, throttleOnly(1)]);
    h.state.ai.friendlyFire.accumulated = 5;
    h.wingman.combat.lastVictim = { entity: h.player.id, clock: h.state.clock + 1 };
    posted = update(h, controller, [0x7fff]);
    expect(controller.wingman.behaviour).toBe(5);
    expect(posted[0]).toMatchObject({ type: 'steer', control: { scale: 0.5 } });
  });

  it('docked: channel 0 released, all rates and the throttle 0', () => {
    const h = harness();
    const controller = h.install();
    controller.triggers[0].pressed = true;
    h.wingman.activity = 'docked';
    expect(update(h, controller)).toMatchObject([stopped]);
    expect(controller.triggers[0].pressed).toBe(false);
    expect(controller.nextUpdateClock).toBe(h.state.clock + PERIOD);
  });

  it('b 3 and 4 fly without a speed post or a press', () => {
    const h = harness();
    const controller = h.install();
    controller.wingman.behaviour = 3;
    applyBehaviour(h.call(), controller);
    controller.triggers[0].pressed = true;
    h.base.position = { x: 3000, y: 0, z: 0 };
    expect(update(h, controller)).toMatchObject([{ type: 'steer', control: { speedFactor: null } }]);
    expect(controller.triggers[0].pressed).toBe(false);
  });
});

describe('the parameters of the seven (roster entry, record) tuples (WA10; AC-07)', () => {
  // Synthetic tuples standing for the five elements and the two records' periods: each changes what it feeds.
  const tuples = [
    { element: 1, period: 90 }, { element: 2, period: 90 }, { element: 3, period: 90 }, { element: 4, period: 90 }, { element: 5, period: 90 },
    { element: 4, period: 60 }, { element: 5, period: 60 },
  ];
  const elements = [[1, 1, 0, 0], [0.75, 0.5, 0.25, 0], [0.5, 0.5, 0, 0], [0.25, 0.75, 0, 0], [1, 0.25, 0, 0]];

  it.each(tuples)('element $element, period $period: fractions, noise, cadence and the lead constant', ({ element, period }) => {
    const h = harness({ element, period });
    h.wingman.position = { x: 125, y: 3, z: 25 };
    const [speed, turn, throttle] = elements[element - 1];
    // At the formation point next to a still player: the stop, whose throttle 0 takes the throttle noise's draw.
    const controller = h.install(throttle > 0 ? [16383] : []);
    expect(controller.steering).toMatchObject({
      speedFraction: speed, turnFraction: turn, speedLimit: f32(64 * speed), turnRates: [f32(0.75 * turn), f32(0.25 * turn), f32(0.5 * turn)],
      throttleNoise: { enabled: throttle > 0 },
    });
    expect(controller.nextUpdateClock).toBe(h.state.clock + period);
    controller.wingman.behaviour = 5;
    applyBehaviour(h.call(), controller);
    expect(controller.steering.leadConstant).toBe(f32(period / 64));
  });
});
