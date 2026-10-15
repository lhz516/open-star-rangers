import { describe, expect, it } from 'vitest';
import type { ObjectInstantiatedEvent } from '../contracts/domain-events.ts';
import { CoreFaultError, CoreInputError } from '../errors.ts';
import { applyRecomputedMaximum } from '../rules/flight-state.ts';
import { motionStep, type MotionStep } from '../rules/flight-motion.ts';
import { referenceFrame } from '../rules/flight-motion.test-support.ts';
import { FLOAT32_MAX } from '../rules/float32.ts';
import { createWorld, initialWorldState } from '../world/create-world.ts';
import { asCreateInput, craftInfoContent, playerOnlyMission, worldInput, type CraftInfoDraft } from '../world/create-world.test-support.ts';
import { markerInit, type Activity, type Entity, type LinearMovementBlock, type Matrix3, type ObjectState, type SteeredMovementBlock } from '../world/entity-table.ts';
import { constructWorld } from '../world/world.ts';
import { entityInit, expectFault, testState, thrownBy, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { moveEntities, movesThisTick } from './movement.ts';

// Expectations come from the exact-rational reference of rules/flight-motion.test-support.ts (docs/original/formats/
// executable.md, movement stage and integration, P3-06/01) or are written out; the integrators' own rule tests are in
// rules/flight-motion.test.ts.

/** A copy that keeps the sign of zeros. */
const poseAndBlock = ({ position, orientation, movement }: Entity) => structuredClone({ position, orientation, block: movement as SteeredMovementBlock });

/** What the reference expects of `entity` after one movement at `step` with its kind's craft record. */
function expected(state: WorldState, entity: Entity, step: MotionStep) {
  const { position, orientation, block } = referenceFrame(poseAndBlock(entity), state.craftInfo.content.craft[entity.kindBit], step);
  return { position, orientation, movement: block };
}

const poseOf = ({ position, orientation, movement }: Entity) => ({ position, orientation, movement });

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;

/** No block here is hit-tested. */
const noHitTest = (): never => {
  throw new Error('hit test');
};

/** A drained player-only world with craft info `info`, whose queue posts nothing. */
function stateWith(info: CraftInfoDraft = craftInfoContent()): WorldState {
  const state = initialWorldState(asCreateInput(worldInput({ mission: playerOnlyMission(), craftInfo: info })));
  state.spawn.queue.length = 0;
  return state;
}

const STEERING = { pitch: { rate: 0.5, enabled: true }, yaw: { rate: -0.75, enabled: true }, roll: { rate: 0.25, enabled: false } };

/** Sets the entity's steady steering to STEERING; the axes object itself is frozen, its axes are not. */
function steer(entity: Entity): void {
  const { steering } = entity.movement as SteeredMovementBlock;
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
    moveEntities(state, noHitTest);
    expect(poseOf(entity)).toEqual(moves ? want : before);
    if (moves) expect(entity.position).not.toEqual(before.position);
  });

  it('moves a destroyed entity still in state 7, since the filter reads only the activity and the state', () => {
    const state = testState();
    const entity = state.entities.allocate(entityInit(5));
    entity.state = 'active';
    entity.destroyed = true;
    const want = expected(state, entity, motionStep(2, 0));
    moveEntities(state, noHitTest);
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
      (entity.movement as SteeredMovementBlock).timedRotation.roll = { rate: 1.5, decay: 0.5, end: 10 };
    }
    const wants = entities.map((entity) => expected(world, entity, { seconds: 4 / 64, time: 10 }));
    moveEntities(world, noHitTest);
    expect(entities.map(poseOf)).toEqual(wants);
    expect(entities.map((entity) => (entity.movement as SteeredMovementBlock).timedRotation.roll)).toEqual(entities.map(() => ({ rate: 1.5 - 0.5 / 16, decay: 0.5, end: 10 })));
  });

  it('integrates a warp block with 0x22600: it turns and speeds up but does not translate', () => {
    const state = testState();
    const entity = state.entities.allocate(entityInit(9));
    entity.state = 'active';
    Object.assign(entity.movement!, { mode: 'warp', speed: 0, atCommandedSpeed: false });
    steer(entity);
    const before = entity.position;
    const want = expected(state, entity, motionStep(2, 0));
    moveEntities(state, noHitTest);
    expect(poseOf(entity)).toEqual(want);
    expect(entity.position).toEqual(before);
    expect(entity.movement!.speed).toBeGreaterThan(0);
  });

  it('faults on an entity that passes the filter without a block (the original has no null test)', () => {
    const state = testState();
    const entity = state.entities.allocate(entityInit(4));
    entity.state = 'active';
    entity.movement = null;
    expectFault(() => moveEntities(state, noHitTest), 'invariant-violated', 'movement.block');
  });

  it('integrates a missile\'s craft block with its body record (missile +0x14), not a craft record of its kind (P3-07 CR-09)', () => {
    const info = craftInfoContent();
    // Missile 1's body is record 1, which turns with the speed ratio (+0xC8 = 0) and couples yaw into roll; body 0 does not.
    Object.assign(info.missileBodies[1], { atB8: 64, atBC: 6, atC0: 9, atC4: 1, atC8: 0 });
    const state = stateWith(info);
    const missile = state.entities.allocate(entityInit(20));
    Object.assign(missile.combat, { missile: 1 });
    missile.state = 'active';
    Object.assign(missile.movement!, { speed: 40, atCommandedSpeed: false });
    steer(missile);
    const step = motionStep(2, 0);
    const [body0, body1] = state.craftInfo.content.missileBodies;
    const want = referenceFrame(poseAndBlock(missile), body1, step);
    expect(referenceFrame(poseAndBlock(missile), body0, step).orientation).not.toEqual(want.orientation);
    moveEntities(state, noHitTest);
    expect(poseOf(missile)).toEqual({ position: want.position, orientation: want.orientation, movement: want.block });
  });

  it.each([['missile', 9], ['body', 0]] as const)('faults on a moving missile whose %s record is missing', (_, missile) => {
    const base = testState();
    const { content } = base.craftInfo;
    const state: WorldState = missile === 0 ? { ...base, craftInfo: { ...base.craftInfo, content: { ...content, missileBodies: [] } } } : base;
    const entity = state.entities.allocate(entityInit(20));
    Object.assign(entity.combat, { missile });
    entity.state = 'active';
    expectFault(() => moveEntities(state, noHitTest), 'invariant-violated', 'movement.record');
  });
});

describe('P3-07\'s modes 1 and 2 (P3-07 CR-03, H1, H3)', () => {
  it('moves a linear block by F(P + v × step), keeping P, and hit-tests right after its own move only when flagged', () => {
    const state = testState();
    const [projectile, explosion] = [21, 22].map((kindBit) => state.entities.allocate(entityInit(kindBit, { position: { x: kindBit, y: 2, z: 3 } })));
    for (const entity of [projectile, explosion]) {
      entity.state = 'active';
      Object.assign(entity.movement!, { velocity: { x: 32, y: -64, z: 0.5 } });
    }
    const tested: unknown[] = [];
    // Kind 22 comes after kind 21 in the walk: it has not moved yet when the projectile is tested.
    moveEntities(state, (entity) => void tested.push([entity.id, entity.position, explosion.position]));
    // 1/32 s: (1, −2, 1/64); 3 + 1/64 is an f32.
    expect([projectile.position, explosion.position]).toEqual([{ x: 22, y: 0, z: 3 + 1 / 64 }, { x: 23, y: 0, z: 3 + 1 / 64 }]);
    expect([projectile, explosion].map(({ movement }) => (movement as LinearMovementBlock).previousPosition)).toEqual([{ x: 21, y: 2, z: 3 }, { x: 22, y: 2, z: 3 }]);
    expect(tested).toEqual([[projectile.id, { x: 22, y: 0, z: 3 + 1 / 64 }, { x: 22, y: 2, z: 3 }]]);
  });

  it('moves a spinning block by F(P + v × step) and turns it by its spin per move, whatever the step', () => {
    const turned = (clockUnitsPerTick: number) => {
      const state = testState({ clockUnitsPerTick });
      const fragment = state.entities.allocate(entityInit(24, { position: { x: 0, y: 0, z: 0 }, orientation: IDENTITY }));
      fragment.state = 'active';
      Object.assign(fragment.movement!, { velocity: { x: 64, y: 0, z: 0 }, spin: 0.5, spinAxis: 2 });
      const block = structuredClone(fragment.movement);
      moveEntities(state, noHitTest);
      expect(fragment.movement).toEqual(block);
      return fragment;
    };
    const [short, long] = [turned(2), turned(4)];
    expect([short.position, long.position]).toEqual([{ x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }]);
    // Axis byte 2 turns rows 2 and 3 (0x228cc), by the same angle at either step.
    expect(short.orientation.slice(0, 3)).toEqual([1, 0, 0]);
    expect(short.orientation).not.toEqual(IDENTITY);
    expect(long.orientation).toEqual(short.orientation);
  });
});

describe('the map marker\'s mode 4 (P3-09 MW-03)', () => {
  it('passes the filter in state 7 but is never integrated and reads no craft record', () => {
    const state = testState();
    const marker = state.entities.allocate(markerInit({ x: 100, y: -200, z: 3 }, IDENTITY));
    marker.state = 'active';
    // The synthetic craft info has no record for kind 25: reading one would fault (movement.record).
    expect(state.craftInfo.content.craft[25]).toBeUndefined();
    expect(movesThisTick(marker)).toBe(true);
    moveEntities(state, noHitTest);
    expect(poseOf(marker)).toEqual({ position: { x: 100, y: -200, z: 3 }, orientation: IDENTITY, movement: { mode: 'marker', speed: 0 } });
    expect(marker.placementSerial).toBe(0);
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
    info.craft[0].atC0 = 16;
    const state = stateWith(info);
    const world = constructWorld(state);
    // Kind bit 0, which the area check (P3-06/14) never walks: without a player entity it would park any other kind.
    const entity = state.entities.allocate(entityInit(0));
    entity.maximumSpeed = 10;
    applyRecomputedMaximum(entity.movement as SteeredMovementBlock, 10);
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
