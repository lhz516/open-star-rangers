import { describe, expect, it } from 'vitest';
import type { ObjectInstantiatedEvent } from '../contracts/domain-events.ts';
import { CoreFaultError, CoreInputError } from '../errors.ts';
import { applyRecomputedMaximum } from '../rules/flight-state.ts';
import { motionStep, type MotionStep } from '../rules/flight-motion.ts';
import { referenceFrame } from '../rules/flight-motion.test-support.ts';
import { FLOAT32_MAX } from '../rules/float32.ts';
import { createWorld, initialWorldState } from '../world/create-world.ts';
import { asCreateInput, craftInfoContent, playerOnlyMission, worldInput, type CraftInfoDraft } from '../world/create-world.test-support.ts';
import type { Activity, Entity, Matrix3, ObjectState } from '../world/entity-table.ts';
import { constructWorld } from '../world/world.ts';
import { entityInit, expectFault, testState, thrownBy, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { moveEntities, movesThisTick } from './movement.ts';

// Expectations come from the exact-rational reference of rules/flight-motion.test-support.ts (docs/original/formats/
// executable.md, movement stage and integration, P3-06/01) or are written out; the integrators' own rule tests are in
// rules/flight-motion.test.ts.

/** A copy that keeps the sign of zeros. */
const poseAndBlock = ({ position, orientation, movement }: Entity) => structuredClone({ position, orientation, block: movement! });

/** What the reference expects of `entity` after one movement at `step` with its kind's craft record. */
function expected(state: WorldState, entity: Entity, step: MotionStep) {
  const { position, orientation, block } = referenceFrame(poseAndBlock(entity), state.craftInfo.content.craft[entity.kindBit], step);
  return { position, orientation, movement: block };
}

const poseOf = ({ position, orientation, movement }: Entity) => ({ position, orientation, movement });

/** A drained player-only world with craft info `info`, whose queue posts nothing. */
function stateWith(info: CraftInfoDraft = craftInfoContent()): WorldState {
  const state = initialWorldState(asCreateInput(worldInput({ mission: playerOnlyMission(), craftInfo: info })));
  state.spawn.queue.length = 0;
  return state;
}

const STEERING = { pitch: { rate: 0.5, enabled: true }, yaw: { rate: -0.75, enabled: true }, roll: { rate: 0.25, enabled: false } };

/** Sets the entity's steady steering to STEERING; the axes object itself is frozen, its axes are not. */
function steer(entity: Entity): void {
  const { steering } = entity.movement!;
  for (const axis of ['pitch', 'yaw', 'roll'] as const) Object.assign(steering[axis], STEERING[axis]);
}

describe('movement stage 0x221fc (P3-06 AC-02, M-01)', () => {
  it.each([
    ['active', 'active', true],
    ['docked', 'active', true],
    ['active', 'projectile-hit', true],
    ['active', 'destroyed-source', true],
    ['docked', 'destroyed-source', true],
    ['parked', 'active', false],
    ['parked', 'destroyed-source', false],
    ['active', 'presentation-ready', false],
    ['active', 'awaiting-presentation', false],
    ['active', 'area-switch', false],
    ['active', 'pending-removal', false],
    ['active', 'new', false],
  ] as [Activity, ObjectState, boolean][])('moves an entity %s in state %s: %s', (activity, objectState, moves) => {
    const state = testState();
    const entity = state.entities.allocate(entityInit(3));
    entity.activity = activity;
    entity.state = objectState;
    const before = poseOf(entity);
    const want = expected(state, entity, motionStep(state.config.clockUnitsPerTick, state.clock));
    expect(movesThisTick(entity)).toBe(moves);
    moveEntities(state);
    expect(poseOf(entity)).toEqual(moves ? want : before);
    if (moves) expect(entity.position).not.toEqual(before.position);
  });

  it('moves a destroyed entity still in state 7, since the filter reads only the activity and the state', () => {
    const state = testState();
    const entity = state.entities.allocate(entityInit(5));
    entity.state = 'active';
    entity.destroyed = true;
    const want = expected(state, entity, motionStep(2, 0));
    moveEntities(state);
    expect(poseOf(entity)).toEqual(want);
  });

  it('integrates every kind with its own craft record, this tick\'s configured step and the f32 seconds of this tick\'s clock', () => {
    const info = craftInfoContent();
    Object.assign(info.craft[7], { atBC: 6, atC0: 9, atC4: 1, atC8: 0 });
    Object.assign(info.craft[19], { atB8: 0, atC8: 0 });
    const state = stateWith(info);
    const config = Object.freeze({ ...state.config, clockUnitsPerTick: 4 });
    const world: WorldState = { ...state, config, clock: 640 };
    const entities = [0, 7, 19].map((kindBit) => world.entities.allocate(entityInit(kindBit, { orientation: Object.freeze([0.75, 0.5, 0, -0.5, 0.75, 0, 0, 0, 1]) as unknown as Matrix3 })));
    for (const entity of entities) {
      entity.state = 'active';
      Object.assign(entity.movement!, { speed: 40, atCommandedSpeed: false });
      steer(entity);
      // t = 640 ÷ 64 = 10: a rotation ending at 10 is still on.
      entity.movement!.timedRotation.roll = { rate: 1.5, decay: 0.5, end: 10 };
    }
    const wants = entities.map((entity) => expected(world, entity, { seconds: 4 / 64, time: 10 }));
    moveEntities(world);
    expect(entities.map(poseOf)).toEqual(wants);
    expect(entities.map((entity) => entity.movement!.timedRotation.roll)).toEqual(entities.map(() => ({ rate: 1.5 - 0.5 / 16, decay: 0.5, end: 10 })));
  });

  it('integrates a warp block with 0x22600: it turns and speeds up but does not translate', () => {
    const state = testState();
    const entity = state.entities.allocate(entityInit(9));
    entity.state = 'active';
    Object.assign(entity.movement!, { mode: 'warp', speed: 0, atCommandedSpeed: false });
    steer(entity);
    const before = entity.position;
    const want = expected(state, entity, motionStep(2, 0));
    moveEntities(state);
    expect(poseOf(entity)).toEqual(want);
    expect(entity.position).toEqual(before);
    expect(entity.movement!.speed).toBeGreaterThan(0);
  });

  it('faults on an entity that passes the filter without a block (the original has no null test)', () => {
    const state = testState();
    const entity = state.entities.allocate(entityInit(4));
    entity.state = 'active';
    entity.movement = null;
    expectFault(() => moveEntities(state), 'invariant-violated', 'movement.block');
  });

  it('faults on a moving entity of a kind without a craft record', () => {
    const state = testState();
    state.entities.allocate(entityInit(25)).state = 'active';
    expectFault(() => moveEntities(state), 'invariant-violated', 'movement.record');
  });
});

describe('movement in a running world (P3-06 AC-02, AC-07)', () => {
  it('moves no entity in the tick it is instantiated; from the next, the take-off state advances along +z only (M-09)', () => {
    const state = initialWorldState(asCreateInput(worldInput({ mission: playerOnlyMission() })));
    const world = constructWorld(state);
    const [event] = world.step(tickInput()).filter((item): item is ObjectInstantiatedEvent => item.type === 'object-instantiated');
    const player = state.entities.get(event.entityId)!;
    expect(player.position).toEqual(event.position);
    expect(player.state).toBe('presentation-ready');
    const instantiated = poseAndBlock(player);
    const want = expected(state, player, motionStep(2, 4));
    world.step(tickInput());
    expect(poseOf(player)).toEqual(want);
    // Bit for bit: x and y, the identity rows, the speed, the ratio and the arrival stay; z gains 64 × 1/32.
    expect(player.position).toEqual({ x: instantiated.position.x, y: instantiated.position.y, z: instantiated.position.z + 2 });
    expect(player.orientation).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(player.movement).toEqual(instantiated.block);
    expect(player.movement).toMatchObject({ speed: 64, commandedSpeed: 64, atCommandedSpeed: true, speedRatio: 1 });
  });

  it('never reads the maximum speed: a speed above a lowered maximum falls at +0xC0 per second', () => {
    const info = craftInfoContent();
    info.craft[3].atC0 = 16;
    const state = stateWith(info);
    const world = constructWorld(state);
    const entity = state.entities.allocate(entityInit(3));
    entity.maximumSpeed = 10;
    applyRecomputedMaximum(entity.movement, 10);
    for (let tick = 0; tick < 3; tick++) world.step(tickInput());
    // The first step makes the entity active, before movement: three steps of 16 × 1/32.
    expect(entity.movement).toMatchObject({ speed: 48 - 1.5, commandedSpeed: 10, atCommandedSpeed: false });
    expect(entity.maximumSpeed).toBe(10);
  });

  it('latches a non-finite result as the world\'s fault and publishes nothing from that step on', () => {
    const state = testState();
    const world = constructWorld(state);
    const entity = state.entities.allocate(entityInit(3, { position: { x: 0, y: 0, z: FLOAT32_MAX } }));
    Object.assign(entity.movement!, { speed: FLOAT32_MAX, commandedSpeed: FLOAT32_MAX });
    const fault = thrownBy(() => world.step(tickInput()));
    expect(fault).toBeInstanceOf(CoreFaultError);
    expect(fault).toMatchObject({ code: 'invariant-violated', site: 'flight-motion.result' });
    expect(entity.position.z).toBe(FLOAT32_MAX);
    for (const call of [() => world.step(tickInput()), () => world.projection(), () => world.renderState(), () => world.snapshot()]) expect(thrownBy(call)).toBe(fault);
  });

  it('advances only by the configured positive step: neither a zero step nor a step in the tick input enters', () => {
    const input = worldInput({ mission: playerOnlyMission(), run: { clockUnitsPerTick: 0 } });
    expect(thrownBy(() => createWorld(asCreateInput(input)))).toBeInstanceOf(CoreInputError);
    const world = createWorld(asCreateInput(worldInput({ mission: playerOnlyMission() })));
    expect(thrownBy(() => world.step({ ...tickInput(), clockUnits: 0 } as never))).toBeInstanceOf(CoreInputError);
    expect(world.step.length).toBe(1);
  });
});
