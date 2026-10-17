import { describe, expect, it } from 'vitest';
import { mount } from '../../content/rule-data/rule-data.test-support.ts';
import type { Request } from '../systems/pipeline.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, craftInfoContent, declaration, missionFrame, worldInput } from '../world/create-world.test-support.ts';
import { ALL_KINDS, type AiControllerCommon, type Entity, type Matrix3, type SteeredMovementBlock } from '../world/entity-table.ts';
import { constructWorld } from '../world/world.ts';
import { tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { attackPass, isInFront, type AttackPassCall } from './ai-attack-pass.ts';
import { pilotScene } from './ai-piloting.ts';
import { installedController } from './ai-selection.ts';
import type { CraftEntity } from './combat-init.ts';
import { RAND_SCALE } from './original-random.ts';
import { randomDirection } from './random-direction.ts';
import { scriptedRand } from './rand.test-support.ts';
import { steerAtTarget } from './steering.ts';

// P3-08/16 (docs/original/formats/executable.md, WA7; ai.md §5.4 opcode 1101; docs/plan/p3/02/spec.md, CR-24 decision
// 15). Expectations are worked out from WA7's arithmetic with scripted rand values. The subject is a kind-7 craft at
// runtime (187.5, 375, 112.5), unturned, with the synthetic craft record (maximum +0xB8 64, turn rates 0.75, 0.25, 0.5:
// speed limit 64, half 32, S+0x58 0.25) and one list-0 gun of range 5000; the target is the player at the same x and y,
// unturned, or the base (kind 17, a large kind). The AICO globals are the synthetic ones: +0x34 8.5, +0x38 0xfffffffe,
// the weave's period 0.125–0.25 and amplitude 0.375–0.5.

const f32 = Math.fround;
const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
/** Rows (0, 0, 1), (0, 1, 0), (1, 0, 0): row 3 along +x. */
const SIDEWAYS = Object.freeze([0, 0, 1, 0, 1, 0, 1, 0, 0]) as unknown as Matrix3;
const REVERSED = Object.freeze([-1, 0, 0, 0, 1, 0, 0, 0, -1]) as unknown as Matrix3;
const PERIOD = 70;
const RANGE = 5000;

interface Harness {
  readonly state: WorldState;
  readonly craft: CraftEntity;
  readonly player: Entity;
  readonly base: Entity;
  readonly controller: AiControllerCommon;
  readonly posted: Request[];
  call(draws: readonly number[]): AttackPassCall & { readonly rand: { readonly used: number } };
}

/** The world above, the player at runtime z `playerZ`, after instantiation; the craft's controller as installed. */
function harness(playerZ = 1000): Harness {
  const mission = missionFrame();
  mission.declarations = [
    declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
    declaration(1, { craftType: 7, position: { x: 100, y: 200, z: 60 } }),
    declaration(2, { craftType: 17, position: { x: 100, y: 1200, z: 60 } }),
  ];
  const craftInfo = craftInfoContent();
  Object.assign(craftInfo.guns[0], { at08: 100, at24: 3200 });
  Object.assign(craftInfo.craft[7], { mounts: [mount({ weapon: 0, at20: 0, at34: 0 })], mountLists: [[0], [], []] });
  const state = initialWorldState(asCreateInput(worldInput({ mission, craftInfo })));
  constructWorld(state).step(tickInput());
  const entities = [...state.entities.walk(ALL_KINDS)];
  const craft = entities.find(({ kindBit }) => kindBit === 7) as CraftEntity;
  const player = entities.find(({ kindBit }) => kindBit === 0)!;
  const base = entities.find(({ kindBit }) => kindBit === 17)!;
  craft.orientation = IDENTITY;
  player.orientation = IDENTITY;
  player.position = { ...player.position, z: playerZ };
  (player.movement as SteeredMovementBlock).speed = 0;
  const controller = installedController(state.ruleData.ai.tablePrograms[0], state.craftInfo.content.craft[7]);
  // Aimed through 0x5c584, as the interpreter's state machine leaves a craft that took a target.
  steerAtTarget(controller.steering, pilotScene(state, craft, controller), player.id);
  const posted: Request[] = [];
  return {
    state, craft, player, base, controller, posted,
    call: (draws) => ({ world: state, subject: craft, rand: scriptedRand(draws), post: (request) => void posted.push(request) }),
  };
}

const UNSET = { clear: false, set: false, value: 0 };
const throttle = (entityId: number, factor: number) => ({ type: 'steer', entityId, control: { scale: 0, axes: [UNSET, UNSET, UNSET], speedFactor: factor } });
const factors = (posted: readonly Request[]) => posted.map((request) => (request.type === 'steer' ? request.control.speedFactor : null));

describe('in front, 0x5e844', () => {
  it('is ahead along the subject\'s row 3 from the f32 differences, strictly', () => {
    const { craft, player } = harness();
    expect(isInFront(craft, player)).toBe(true);
    player.position = { ...player.position, z: 0 };
    expect(isInFront(craft, player)).toBe(false);
    player.position = { ...craft.position, x: craft.position.x + 50 };
    expect(isInFront(craft, player)).toBe(false);
    craft.orientation = SIDEWAYS;
    expect(isInFront(craft, player)).toBe(true);
  });
});

describe('the attack pass 0x63c00 (WA7)', () => {
  it('does not apply without a valid target, nor to a small target at least as fast as half the speed limit', () => {
    const h = harness();
    h.craft.ai.objectTarget = null;
    expect(attackPass(h.call([]), h.controller)).toBe(false);
    h.craft.ai.objectTarget = h.player.id;
    (h.player.movement as SteeredMovementBlock).speed = 32;
    expect(attackPass(h.call([]), h.controller)).toBe(false);
    expect(h.posted).toEqual([]);
    expect(h.controller.attackPass.phase).toBe(0);
  });

  it('starts: saves the size class and lead mode, flies size 3 and lead 5 with constant 0, the deadline d ÷ v chopped × 64 + 0x100', () => {
    const h = harness();
    Object.assign(h.controller.steering, { sizeClass: 1, leadMode: 2, leadConstant: 9 });
    const clock = h.state.clock;
    expect(attackPass(h.call([]), h.controller)).toBe(true);
    // d = 887.5: trunc(887.5 ÷ 64) = 13.
    expect(h.controller.attackPass).toEqual({ phase: 1, deadline: clock + 13 * 64 + 0x100, savedSizeClass: 1, savedLeadMode: 2 });
    expect(h.controller.steering).toMatchObject({ sizeClass: 3, leadMode: 5, leadConstant: 0, offset: { enabled: false } });
    expect(h.controller.steering.distance).toBeGreaterThanOrEqual(h.controller.steering.approachRadius);
    // Phase 1 in range with the cone bits still 0: the throttle for ρ = 0 < 0.1 is max(0.3, 0.5); then the steering.
    expect(h.posted.map(({ type }) => type)).toEqual(['steer', 'steer']);
    expect(h.posted[0]).toEqual(throttle(h.craft.id, 0.5));
    expect(h.posted[1]).toMatchObject({ control: { scale: 1, axes: [{ set: true }, { set: true }, { set: false }], speedFactor: null } });
    expect(h.controller.nextUpdateClock).toBe(clock + PERIOD);
    expect(h.controller.triggers.map(({ pressed }) => pressed)).toEqual([false, false, false]);
  });

  it('presses in phase 1: channel 1 when ready and steady, channel 0 with hold 0x80 when aimed and in range', () => {
    const h = harness();
    attackPass(h.call([]), h.controller);
    expect(h.controller.steering.coneBits).toBe(3);
    h.controller.missileReady = true;
    h.state.clock += 2;
    attackPass(h.call([]), h.controller);
    expect(h.controller.triggers.slice(0, 2)).toEqual([{ pressed: true, holdDeadline: h.state.clock + 0x80 }, { pressed: true, holdDeadline: h.state.clock + 0x7d00 }]);
  });

  it('throttles phase 1 by ρ and the facing dot (0x64474), 1.0 out of channel 0\'s range', () => {
    const throttleFor = (speed: number, orientation: Matrix3, coneBits: 0 | 3, playerZ = 1000): number => {
      const h = harness(playerZ);
      (h.player.movement as SteeredMovementBlock).speed = speed;
      h.player.orientation = orientation;
      h.controller.attackPass.phase = 1;
      h.controller.attackPass.deadline = h.state.clock + 10_000;
      h.controller.steering.coneBits = coneBits;
      attackPass(h.call([]), h.controller);
      return factors(h.posted)[0]!;
    };
    // ρ = F(16 ÷ 64) = 0.25.
    expect(throttleFor(16, IDENTITY, 0)).toBe(0.5);
    expect(throttleFor(16, IDENTITY, 3)).toBe(f32(0.45));
    expect(throttleFor(16, SIDEWAYS, 0)).toBe(f32(0.65));
    expect(throttleFor(16, SIDEWAYS, 3)).toBe(f32(0.65));
    expect(throttleFor(16, REVERSED, 0)).toBe(f32(0.4));
    expect(throttleFor(16, REVERSED, 3)).toBe(0.5);
    expect(throttleFor(0, IDENTITY, 3)).toBe(0.5);
    expect(throttleFor(0, IDENTITY, 3, RANGE + 200)).toBe(1);
  });

  it('breaks off past the deadline: an offset in world axes beside the target, one draw, throttle 0, phase 2', () => {
    const h = harness();
    attackPass(h.call([]), h.controller);
    h.state.clock = h.controller.attackPass.deadline + 1;
    h.posted.length = 0;
    const call = h.call([1000]);
    attackPass(call, h.controller);
    expect(call.rand.used).toBe(1);
    // u = (0, 0, 1), its perpendicular (0, 1, −0); r = 5000; d0 = D(π′ ÷ 0.25) × 64; hi = F(d0 + r) (the target is
    // still); lo = F(hi − 2500); D = x + S+0x48.
    const { approachRadius } = h.controller.steering;
    const hi = f32((3.1415927 / 0.25) * 64 + RANGE);
    const lo = f32(hi - RANGE * 0.5);
    const distance = 1000 * RAND_SCALE * (hi - lo) + lo + approachRadius;
    expect(h.controller.steering.offset).toEqual({ enabled: true, frame: 1, vector: { x: 0, y: f32(distance * (1 / 3)), z: f32(distance) } });
    expect(h.controller.attackPass).toMatchObject({ phase: 2, deadline: h.state.clock + Math.trunc(distance / 64) * 64 });
    expect(h.posted[0]).toEqual(throttle(h.craft.id, 0));
  });

  it('breaks off from a large target: the offset away from it, scattered by a random direction × 100 (three draws)', () => {
    const h = harness();
    steerAtTarget(h.controller.steering, pilotScene(h.state, h.craft, h.controller), h.base.id);
    attackPass(h.call([]), h.controller);
    h.state.clock = h.controller.attackPass.deadline + 1;
    const call = h.call([0, 5, 3]);
    attackPass(call, h.controller);
    expect(call.rand.used).toBe(3);
    const dx = f32(h.craft.position.x - h.base.position.x);
    const dy = f32(h.craft.position.y - h.base.position.y);
    const dz = f32(h.craft.position.z - h.base.position.z);
    const length = f32(Math.sqrt(dy * dy + dx * dx + dz * dz));
    const u = [dx, dy, dz].map((value) => f32(value * (1 / length)));
    const far = (3.1415927 / 0.25) * 64 + RANGE * 2;
    const lo = f32(far - RANGE * 0.5);
    const distance = 0 * RAND_SCALE * (f32(far) - lo) + lo + h.controller.steering.approachRadius;
    const scatter = randomDirection(scriptedRand([5, 3]));
    const expected = [scatter.x, scatter.y, scatter.z].map((value, axis) => f32(f32(u[axis] * distance) + f32(value * 100)));
    const { vector } = h.controller.steering.offset;
    expect([vector.x, vector.y, vector.z]).toEqual(expected);
  });

  it('turns back in phase 2 within 50 or past the deadline (no throttle), else posts full throttle', () => {
    const h = harness();
    attackPass(h.call([]), h.controller);
    h.controller.attackPass.phase = 2;
    h.state.clock += 2;
    h.posted.length = 0;
    attackPass(h.call([]), h.controller);
    expect(factors(h.posted)).toEqual([1, null]);
    h.player.position = { ...h.player.position, z: 150 };
    h.state.clock += 2;
    h.posted.length = 0;
    attackPass(h.call([]), h.controller);
    // d = 37.5 < 50: trunc(37.5 ÷ 64) = 0.
    expect(h.controller.attackPass).toMatchObject({ phase: 1, deadline: h.state.clock + 0x100 });
    expect(factors(h.posted)).toEqual([null]);
  });

  it('evades a close proximity ahead (both radii against AICO +0x34) instead of steering, still due again after the period', () => {
    const h = harness();
    h.craft.combat.proximity = { entity: h.player.id, distanceSquared: 1 };
    attackPass(h.call([]), h.controller);
    // The throttle, then the evasion's break turn and full throttle; no 0x5d014.
    expect(h.posted.map((request) => (request.type === 'steer' ? request.control.scale : request.type))).toEqual([0, 1.5, 0]);
    expect(h.controller.nextUpdateClock).toBe(h.state.clock + PERIOD);
  });

  it('weaves row 1 in phase 1 after a recent hit: two draws for the period and amplitude, a third when row 3 is unset', () => {
    const h = harness();
    h.craft.combat.lastAttacker = { entity: h.player.id, clock: h.state.clock };
    const call = h.call([100, 200, 300]);
    attackPass(call, h.controller);
    expect(call.rand.used).toBe(3);
    const period = f32(100 * RAND_SCALE * f32(0.25 - 0.125) + 0.125);
    const amplitude = f32(200 * RAND_SCALE * f32(0.5 - 0.375) + 0.375);
    const time = f32(h.state.clock / 64);
    const swing = Math.cos(((time * 2) * 3.1415927) / period) * amplitude;
    const steer = h.posted[1];
    if (steer.type !== 'steer') throw new Error('steer');
    const [pitch, , roll] = steer.control.axes;
    // The target dead ahead: 0x5cd1c's row 1 is 0 before the swing.
    const value = f32(swing + 0);
    expect(pitch).toEqual({ clear: true, set: true, value: value > 1 ? 1 : value < -1 ? -1 : value });
    expect(roll).toEqual({ clear: true, set: true, value: f32(0.4) });
  });

  it('undoes an active pass when it stops applying: offset off, size class and lead-mode byte restored, constant left 0', () => {
    const h = harness();
    Object.assign(h.controller.steering, { sizeClass: 1, leadMode: 2, leadConstant: 9 });
    attackPass(h.call([]), h.controller);
    h.craft.ai.objectTarget = null;
    expect(attackPass(h.call([]), h.controller)).toBe(false);
    expect(h.controller.attackPass.phase).toBe(0);
    expect(h.controller.steering).toMatchObject({ sizeClass: 1, leadMode: 2, leadConstant: 0, offset: { enabled: false } });
  });
});
