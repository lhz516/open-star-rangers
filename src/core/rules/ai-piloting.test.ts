import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import { PIPELINE, registerTick, type ControlBlock, type Request, type TickContext } from '../systems/pipeline.ts';
import { clearedControllerCommon, MARKER_KIND_BIT, type AiControllerCommon, type Entity, type EntityId, type Matrix3, type SteeredMovementBlock } from '../world/entity-table.ts';
import { addPlayerEntity, expectFault, stillEntityInit, testState, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import {
  aiPilot, evade, pilotScene, postAxes, postBreakTurn, postRates, postSpeedMatch, postSteering, postTargetSpeedMatch, postThrottle,
  type AiPilot, type PilotRequest,
} from './ai-piloting.ts';
import { RAND_SCALE, RandStream } from './original-random.ts';
import { rngStateAfter, scriptedRand } from './rand.test-support.ts';
import { computeSteering, setSteeringFractions, setSteeringNoise, steerAtTarget, updateTargetPoint } from './steering.ts';

// P3-08/17 (docs/plan/p3/08/spec.md, AI 驾驶, AC-05; docs/plan/p3/02/spec.md, CR-21, CR-24 decision 6;
// docs/original/formats/executable.md, A5–A7). Expectations are worked out from those records: the words of each posted
// block, the draws of the noise routines, and the motion P3-06's integration makes of the block the request leaves.
// The AI craft is kind 2 with the synthetic craft record: turn rates +0xAC 0.75 (pitch), +0xB4 0.25 (yaw), +0xB0 0.5
// (roll), maximum +0xB8 64 (its runtime maximum speed is TEST_MAXIMUM_SPEED, 48); a tick is 2 clock units.

const f32 = Math.fround;
const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
const at = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
const AI_KIND = 2;
const LIMITS = Object.freeze({ turn: 1, speed: 0.5, saturation: 0.75, rollMatchThreshold: 0 });

const UNSET = { clear: false, set: false, value: 0 };
const CLEARED = { clear: true, set: false, value: 0 };
const setTo = (value: number) => ({ clear: false, set: true, value });
const turned = (value: number) => ({ clear: true, set: true, value });

interface Scene {
  readonly state: WorldState;
  readonly craft: Entity;
  readonly controller: AiControllerCommon;
}

/** A world with a player and a standing, unturned AI craft at the origin whose controller has fractions 1 and the limits above. */
function scene(): Scene {
  const state = testState();
  state.clock = 640;
  addPlayerEntity(state, { position: at(0, 0, -50) });
  const craft = state.entities.allocate(stillEntityInit(AI_KIND, { position: at(0, 0, 0), orientation: IDENTITY }));
  craft.state = 'active';
  const controller = { ...clearedControllerCommon(), limits: LIMITS };
  setSteeringFractions(controller.steering, state.craftInfo.content.craft[AI_KIND], 1, 1, false);
  return { state, craft, controller };
}

/** A standing craft of kind 7 at `position`, unturned unless `orientation` says otherwise. */
function other({ state }: Scene, position: Vec3, orientation: Matrix3 = IDENTITY): Entity {
  const entity = state.entities.allocate(stillEntityInit(7, { position, orientation }));
  entity.state = 'active';
  return entity;
}

/** The pilot of the scene's craft with scripted draws, collecting what it posts. */
function pilotOf({ state, craft, controller }: Scene, draws: readonly number[] = []): AiPilot & { readonly posted: PilotRequest[]; readonly used: () => number } {
  const posted: PilotRequest[] = [];
  const rand = scriptedRand(draws);
  return { ...aiPilot(state, craft, controller, rand, (request) => posted.push(request)), posted, used: () => rand.used };
}

const steer = (entityId: EntityId, control: ControlBlock) => ({ type: 'steer', entityId, control });
/** One draw over [−v, v]: D(D(r × C) × F(2v)) − v. */
const draw = (rand: number, v: number): number => rand * RAND_SCALE * f32(2 * v) - v;
/** Full throttle after the throttle noise over [−0.5, 0.5] with the draw `rand`, clamped to 1.0. */
const noisyFull = (rand: number): number => Math.min(f32(draw(rand, 0.5) + 1), 1);

describe('the scene (pilotScene)', () => {
  it('reads the subject\'s craft record, the limits, the clock, the target radius and the current list-0 gun', () => {
    const world = scene();
    const target = other(world, at(0, 0, 10));
    const marker = world.state.entities.allocate(stillEntityInit(MARKER_KIND_BIT, { movement: { mode: 'marker', speed: 0 } }));
    const view = pilotScene(world.state, world.craft, world.controller);
    expect(view).toMatchObject({ subject: world.craft, craft: world.state.craftInfo.content.craft[AI_KIND], limits: LIMITS, clock: 640 });
    expect(view.resolve(target.id)).toBe(target);
    expect(view.targetRadius(target)).toBe(world.state.ruleData.craft[7]?.shape.radius);
    expect(view.targetRadius(marker)).toBe(0);
    // The kind-2 record has no mounts: lead mode 5 has no gun to read.
    expectFault(() => view.mainWeaponSpeed(), 'invariant-violated', 'ai-piloting.main-weapon');
    // Kind 0's record lists gun 0 first in list 0.
    const armed = world.state.entities.allocate(stillEntityInit(0, { position: at(5, 0, 0) }));
    expect(pilotScene(world.state, armed, world.controller).mainWeaponSpeed()).toBe(world.state.craftInfo.content.guns[0].at08);
  });

  it('faults for a subject that is no craft', () => {
    const world = scene();
    const marker = world.state.entities.allocate(stillEntityInit(MARKER_KIND_BIT, { movement: { mode: 'marker', speed: 0 } }));
    expectFault(() => pilotScene(world.state, marker, world.controller), 'invariant-violated', 'ai-piloting.subject');
  });
});

describe('the posters of message 0x40000 (A5)', () => {
  it('0x5d014 posts nothing without S+0x0C, else CB after the noise routines, which change CB in place', () => {
    const world = scene();
    const pilot = pilotOf(world, [1000, 2000, 3000]);
    expect(postSteering(pilot)).toBe(false);
    expect(pilot.posted).toEqual([]);
    const target = other(world, at(0, 1, 1));
    steerAtTarget(pilot.steering, pilot.scene, target.id);
    updateTargetPoint(pilot.steering, pilot.scene);
    computeSteering(pilot.steering, pilot.scene);
    setSteeringNoise(pilot.steering, 0.5, 0.25);
    const [pitch, yaw] = pilot.steering.control.axes;
    expect(postSteering(pilot)).toBe(true);
    // Rows 1 and 2 are set: a draw added to each; row 3 is unset: a draw becomes its value and sets it. No speed flag.
    expect(pilot.used()).toBe(3);
    expect(pilot.posted).toEqual([steer(world.craft.id, pilot.steering.control)]);
    expect(pilot.steering.control.axes).toEqual([
      turned(f32(draw(1000, 0.25) + pitch.value)), turned(f32(draw(2000, 0.25) + yaw.value)), turned(f32(draw(3000, 0.25))),
    ]);
  });

  it('0x5d0ec posts a fresh block of set rates, the steering noise first, then the factor and its noise, leaving CB', () => {
    const world = scene();
    const pilot = pilotOf(world, [100, 200, 300, 400]);
    setSteeringFractions(pilot.steering, world.state.craftInfo.content.craft[AI_KIND], 0.5, 0.25, false);
    setSteeringNoise(pilot.steering, 0.5, 0.25);
    const before = pilot.steering.control;
    postRates(pilot, [0.5, 0, -0.5], 1);
    expect(pilot.posted).toEqual([steer(world.craft.id, {
      scale: 0.25,
      axes: [setTo(f32(draw(100, 0.25) + 0.5)), setTo(f32(draw(200, 0.25))), setTo(f32(draw(300, 0.25) - 0.5))],
      speedFactor: f32(draw(400, 0.5) + 0.5),
    })]);
    expect(pilot.steering.control).toBe(before);
    const quiet = pilotOf(world);
    setSteeringNoise(quiet.steering, 0, 0);
    postRates(quiet, [0.5, 0, -0.5], -1);
    expect(quiet.posted).toEqual([steer(world.craft.id, { scale: 0.25, axes: [setTo(0.5), setTo(0), setTo(-0.5)], speedFactor: null })]);
  });

  it('0x5d1ac sets the rows with values and clears the others, without a speed flag; 0x5d41c posts only the factor', () => {
    const world = scene();
    const pilot = pilotOf(world);
    postAxes(pilot, [null, 1, null]);
    postThrottle(pilot, f32(0.75));
    expect(pilot.posted).toEqual([
      steer(world.craft.id, { scale: 1, axes: [CLEARED, setTo(1), CLEARED], speedFactor: null }),
      steer(world.craft.id, { scale: 0, axes: [UNSET, UNSET, UNSET], speedFactor: f32(0.75) }),
    ]);
  });

  it('0x5d274 turns 0x5cd1c\'s block into a full break turn away from the point at scale 1.5, without noise', () => {
    const world = scene();
    const pilot = pilotOf(world);
    expect(postBreakTurn(pilot)).toBe(false);
    const target = other(world, at(-1, 2, 10));
    steerAtTarget(pilot.steering, pilot.scene, target.id);
    updateTargetPoint(pilot.steering, pilot.scene);
    setSteeringNoise(pilot.steering, 0.5, 0.5);
    expect(postBreakTurn(pilot)).toBe(true);
    // A > 0 turns −1.0, B < 0 turns +1.0; row 3 stays cleared.
    const control: ControlBlock = { scale: 1.5, axes: [turned(-1), turned(1), CLEARED], speedFactor: null };
    expect(pilot.posted).toEqual([steer(world.craft.id, control)]);
    expect(pilot.steering.control).toEqual(control);
  });
});

describe('the posters of message 0x80000 (0x5d090, 0x5d080)', () => {
  it('posts nothing without the handle S+0x10 and posts for a handle that no longer resolves', () => {
    const world = scene();
    const pilot = pilotOf(world);
    expect(postSpeedMatch(pilot, 0, f32(0.6), 1)).toBe(false);
    pilot.steering.target = 99;
    expect(postSpeedMatch(pilot, 0, f32(0.6), 1)).toBe(true);
    expect(postTargetSpeedMatch(pilot)).toBe(true);
    expect(pilot.posted).toEqual([
      { type: 'ai-match-speed', entityId: world.craft.id, targetEntityId: 99, a: 0, lo: f32(0.6), hi: 1 },
      { type: 'ai-match-speed', entityId: world.craft.id, targetEntityId: 99, a: 0, lo: 0, hi: 1 },
    ]);
    expectFault(() => postSpeedMatch(pilot, 0.1, 0, 1), 'invariant-violated', 'steering.argument');
  });
});

describe('the evasion (0x5d374, A7)', () => {
  /** The scene's craft aiming at a target up and right ahead (A, B > 0) with a threat down and left ahead. */
  function evading(sampled: boolean) {
    const world = scene();
    const target = other(world, at(1, 2, 10));
    const threat = other(world, at(-5, -5, 10));
    const pilot = pilotOf(world, [5000]);
    setSteeringNoise(pilot.steering, 0.5, 0);
    steerAtTarget(pilot.steering, pilot.scene, target.id);
    if (world.craft.combat.type !== 'craft') throw new Error('craft');
    world.craft.combat.weapons.lock.level = 4;
    if (sampled) updateTargetPoint(pilot.steering, pilot.scene);
    const before = structuredClone(pilot.steering);
    return { world, target, threat, pilot, before };
  }

  it('posts the break turn and then full throttle with S\'s throttle noise, and leaves S and the subject\'s target as they were', () => {
    const { world, target, threat, pilot, before } = evading(false);
    expect(evade(pilot, threat.id)).toBe(true);
    // Not sampled yet: the copy aims at the threat (A, B < 0), so both rows turn +1.0.
    expect(pilot.posted).toEqual([
      steer(world.craft.id, { scale: 1.5, axes: [turned(1), turned(1), CLEARED], speedFactor: null }),
      steer(world.craft.id, { scale: 0, axes: [UNSET, UNSET, UNSET], speedFactor: noisyFull(5000) }),
    ]);
    expect(pilot.steering).toEqual(before);
    expect(world.craft.ai.objectTarget).toBe(target.id);
    // 0x5c584 on the copy cleared the subject's lock level.
    expect(world.craft.combat.type === 'craft' && world.craft.combat.weapons.lock.level).toBe(0);
  });

  it('keeps the once-per-sample cache: after 0x5c8b0 ran on S this sample, it turns away from the current target', () => {
    const { world, threat, pilot } = evading(true);
    evade(pilot, threat.id);
    expect(pilot.posted[0]).toEqual(steer(world.craft.id, { scale: 1.5, axes: [turned(-1), turned(-1), CLEARED], speedFactor: null }));
  });

  it('restores a subject target that no longer resolved at entry as null, and posts no break turn at an invalid threat', () => {
    const { world, target, pilot } = evading(false);
    world.state.entities.remove(target);
    expect(evade(pilot, 99)).toBe(false);
    expect(pilot.posted).toEqual([steer(world.craft.id, { scale: 0, axes: [UNSET, UNSET, UNSET], speedFactor: noisyFull(5000) })]);
    expect(world.craft.ai.objectTarget).toBe(null);
  });
});

// AC-05 in the formal step: the AI posts in the object update; request handling applies the requests in posting order
// through P3-06's 0x21fd8 and 0x21adc, and movement integrates the block they leave.

/** Runs one tick through every stage; `posting` runs right after the object update, where the AI posts. */
function step(state: WorldState, posting: (context: TickContext) => void = () => undefined, before: Readonly<Record<string, (context: TickContext) => void>> = {}): void {
  const context = registerTick(state, readTickInput(tickInput()));
  for (const stage of PIPELINE) {
    context.stage = stage.id;
    before[stage.id]?.(context);
    stage.run?.(context);
    if (stage.id === 'object-update') posting(context);
  }
}

const blockOf = (entity: Entity): SteeredMovementBlock => entity.movement as SteeredMovementBlock;
const post = (request: Request) => (context: TickContext) => context.requests.post(request);

describe('AI requests in the formal step (AC-05)', () => {
  it('moves the craft exactly as P3-06\'s integration moves the block a steer request leaves', () => {
    const control = { scale: 1, axes: [turned(0.5), turned(-1), CLEARED], speedFactor: f32(0.5) } as const;
    const posted = scene();
    step(posted.state, post({ type: 'steer', entityId: posted.craft.id, control }));
    const byHand = scene();
    step(byHand.state, undefined, {
      movement: () => {
        // F(rate × (−scale) × value): pitch F(0.75 × −0.5), yaw F(0.25 × 1); the commanded speed F(48 × 0.5).
        Object.assign(blockOf(byHand.craft).steering.pitch, { rate: -0.375, enabled: true });
        Object.assign(blockOf(byHand.craft).steering.yaw, { rate: 0.25, enabled: true });
        Object.assign(blockOf(byHand.craft), { commandedSpeed: 24, atCommandedSpeed: false });
      },
    });
    expect(posted.craft.orientation).toEqual(byHand.craft.orientation);
    expect(posted.craft.orientation).not.toEqual(IDENTITY);
    expect(blockOf(posted.craft)).toEqual(blockOf(byHand.craft));
    expect(posted.craft.position).toEqual(byHand.craft.position);
  });

  it('applies the AI\'s requests in posting order: a speed match after a throttle wins, and the reverse', () => {
    for (const matchLast of [true, false]) {
      const world = scene();
      const target = other(world, at(0, 0, 100));
      blockOf(target).speed = 20;
      const match: Request = { type: 'ai-match-speed', entityId: world.craft.id, targetEntityId: target.id, a: f32(0.5), lo: 0, hi: 1 };
      const throttle: Request = { type: 'steer', entityId: world.craft.id, control: { scale: 0, axes: [UNSET, UNSET, UNSET], speedFactor: 1 } };
      const requests = matchLast ? [throttle, match] : [match, throttle];
      step(world.state, (context) => requests.forEach((request) => context.requests.post(request)), {
        movement: () => expect(blockOf(world.craft).commandedSpeed).toBe(matchLast ? 30 : 48),
      });
    }
  });

  it('matches with the generalised 0x21adc: D(a + 1) × the target speed, clamped to [F(max × lo), F(max × hi)]', () => {
    for (const [a, lo, hi, expected] of [[f32(0.5), 0, 1, 30], [0, f32(0.75), 1, 36], [1, 0, f32(0.5), 24]] as const) {
      const world = scene();
      const target = other(world, at(0, 0, 100));
      blockOf(target).speed = 20;
      step(world.state, post({ type: 'ai-match-speed', entityId: world.craft.id, targetEntityId: target.id, a, lo, hi }), {
        movement: () => expect(blockOf(world.craft)).toMatchObject({ commandedSpeed: expected, atCommandedSpeed: false }),
      });
    }
  });

  it('drops a request whose subject is gone and writes nothing for a match whose target is gone', () => {
    const world = scene();
    const target = other(world, at(0, 0, 100));
    const gone = other(world, at(0, 0, 200));
    world.state.entities.remove(gone);
    const before = structuredClone(blockOf(world.craft));
    step(world.state, (context) => {
      context.requests.post({ type: 'steer', entityId: gone.id, control: { scale: 1, axes: [setTo(1), setTo(1), setTo(1)], speedFactor: 1 } });
      context.requests.post({ type: 'ai-match-speed', entityId: world.craft.id, targetEntityId: gone.id, a: 0, lo: 0, hi: 1 });
      context.requests.post({ type: 'ai-match-speed', entityId: gone.id, targetEntityId: target.id, a: 0, lo: 0, hi: 1 });
    }, { movement: () => expect(blockOf(world.craft)).toEqual(before) });
  });

  it('applies a later steer over an earlier one in the same tick, row by row', () => {
    const world = scene();
    step(world.state, (context) => {
      context.requests.post({ type: 'steer', entityId: world.craft.id, control: { scale: 1, axes: [setTo(1), setTo(1), setTo(1)], speedFactor: null } });
      context.requests.post({ type: 'steer', entityId: world.craft.id, control: { scale: 1, axes: [CLEARED, UNSET, setTo(-1)], speedFactor: null } });
    }, {
      movement: () => expect(blockOf(world.craft).steering).toEqual({
        pitch: { rate: -0.75, enabled: false }, yaw: { rate: -0.25, enabled: true }, roll: { rate: 0.5, enabled: true },
      }),
    });
  });

  it('draws a disturbed craft\'s five steer disturbance draws in request handling, after the noise draws of the posts', () => {
    const world = scene();
    const start = world.state.rngState;
    const target = other(world, at(0, 1, 1));
    blockOf(world.craft).disturbance = { level: 1 };
    let afterPosts = start;
    step(world.state, (context) => {
      const rand = new RandStream(context.world.rngState);
      const pilot = aiPilot(context.world, world.craft, world.controller, rand, (request) => context.requests.post(request));
      setSteeringNoise(pilot.steering, 0, 0.25);
      steerAtTarget(pilot.steering, pilot.scene, target.id);
      updateTargetPoint(pilot.steering, pilot.scene);
      computeSteering(pilot.steering, pilot.scene);
      postSteering(pilot);
      context.world.rngState = rand.state;
      afterPosts = rand.state;
    }, { movement: () => expect(world.state.rngState).toEqual(rngStateAfter(afterPosts, 5)) });
    // Three noise draws: rows 1 and 2 set, row 3 unset.
    expect(afterPosts).toEqual(rngStateAfter(start, 3));
  });
});
