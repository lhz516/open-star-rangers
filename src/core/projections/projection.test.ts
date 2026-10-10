import { describe, expect, expectTypeOf, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { snapshotHash } from '../replay/snapshot.ts';
import { constructWorld } from '../world/world.ts';
import {
  addPlayerEntity, entityInit, expectFault, stillEntityInit, testState, thrownBy, tickInput, TEST_ORIENTATION,
} from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import {
  projectWorld,
  type CombatReady,
  type CommunicationsReady,
  type FlightResourceName,
  type MapReady,
  type MotionPlayer,
  type MotionReady,
  type NotImplementedPartition,
  type Projection,
  type ResultReady,
  type SpeedLimitStatus,
} from './projection.ts';

const NOT_IMPLEMENTED = { readiness: 'not-implemented' };

/** The motion group's player reading. */
function motionPlayer(projection: Projection): MotionPlayer | null {
  const { motion } = projection.flight;
  if (motion.readiness !== 'ready') throw new Error('The motion group is not ready');
  return motion.player;
}

/** A world with an available player (group 0: the assist on) and, 100 units away, an active craft of assist kind 7 at speed 20 as its target. */
function assistedState(): WorldState {
  const state = testState();
  addPlayerEntity(state).state = 'active';
  const target = state.entities.allocate(stillEntityInit(7, { position: { x: 100, y: 2, z: 3 } }));
  target.state = 'active';
  target.movement!.speed = 20;
  // P3-07 selects targets; until then a test sets it.
  state.player.target = target.id;
  return state;
}

describe('projection (P3-02 AC-10, Projection 与 Render State; P3-06 AC-08, D-05)', () => {
  it('has the clock, mission and player partitions and the flight motion group ready, apart from the combat group and the other rule partitions, not implemented', () => {
    const state = testState({ clockUnitsPerTick: 4, wingman: 3, rawDifficulty: 50, group: 1, slot: 2 });
    const world = constructWorld(state);
    world.step(tickInput());
    const player = addPlayerEntity(state, { position: { x: -1.5, y: 2.25, z: 300 }, orientation: TEST_ORIENTATION, maximumSpeed: 52 });
    Object.assign(player.movement!, { speed: 30.5, commandedSpeed: 41.25 });
    expect(world.projection()).toEqual({
      clock: { tick: 1, clock: 4, clockUnitsPerTick: 4 },
      mission: { mission: 'mission/first-campaign', group: 1, slot: 2, rawDifficulty: 50, wingman: 3, status: 'built' },
      player: { entityId: player.id, viewMode: 0x0c, previousViewMode: 0x0c, subMode: 0, interactionContext: 'flight' },
      flight: {
        motion: {
          readiness: 'ready',
          player: {
            entityId: player.id,
            position: { x: -1.5, y: 2.25, z: 300 },
            orientation: [...TEST_ORIENTATION],
            speed: 30.5,
            commandedSpeed: 41.25,
            maximumSpeed: 52,
            // Until P3-07 recomputes it from the live energy state.
            speedLimitStatus: 'initial-only',
            // Group 1: off.
            speedAssist: { enabled: false, engaged: false },
          },
        },
        combat: NOT_IMPLEMENTED,
      },
      map: NOT_IMPLEMENTED,
      communications: NOT_IMPLEMENTED,
      result: NOT_IMPLEMENTED,
    });
  });

  it('derives the interaction context from the view mode', () => {
    const state = testState();
    for (const [viewMode, context] of [[1, 'warp'], [6, 'base'], [8, 'map'], [0x11, 'flight']] as const) {
      Object.assign(state.player, { viewMode, previousViewMode: 0x0c, subMode: 2 });
      expect(projectWorld(state).player).toEqual({ entityId: null, viewMode, previousViewMode: 0x0c, subMode: 2, interactionContext: context });
    }
  });

  it('is deeply frozen and lists no entities', () => {
    const state = testState();
    for (let kindBit = 0; kindBit < 4; kindBit++) state.entities.allocate(entityInit(kindBit));
    const projection = projectWorld(state);
    expect(deepFrozen(projection)).toBe(true);
    expect(Object.keys(projection)).toEqual(['clock', 'mission', 'player', 'flight', 'map', 'communications', 'result']);
    expect(JSON.stringify(projection)).not.toMatch(/model\/test-craft|kindBit|position/);
  });

  describe('flight motion group (P3-06)', () => {
    it('gives a null player, never a made-up zero speed, before the player entity exists and after it is removed', () => {
      const state = testState();
      expect(projectWorld(state).flight).toEqual({ motion: { readiness: 'ready', player: null }, combat: NOT_IMPLEMENTED });
      const world = constructWorld(state);
      const player = addPlayerEntity(state);
      expect(motionPlayer(world.projection())?.entityId).toBe(player.id);
      player.state = 'pending-removal';
      world.step(tickInput());
      expect(state.entities.get(player.id)).toBeUndefined();
      expect(world.projection().flight).toEqual({ motion: { readiness: 'ready', player: null }, combat: NOT_IMPLEMENTED });
    });

    it('reads what the rules leave: the speeds after a speed command and movement, and the pose after movement', () => {
      const state = testState({ group: 1 });
      const player = addPlayerEntity(state, { movement: entityInit(0).movement });
      player.state = 'active';
      const world = constructWorld(state);
      world.step(tickInput([{ type: 'speed', operation: 'zero' }]));
      const reading = motionPlayer(world.projection())!;
      expect(reading.commandedSpeed).toBe(0);
      expect([reading.speed, reading.maximumSpeed]).toEqual([player.movement!.speed, player.maximumSpeed]);
      // Movement has changed the speed (the synthetic craft's deceleration rate is negative, so it rises).
      expect(reading.speed).not.toBe(48);
      expect(reading.position).toEqual(player.position);
      expect(reading.position).not.toEqual({ x: 0, y: 2, z: 3 });
    });

    it('reads the speed assist switch and its match from any one projection, without the event history', () => {
      const state = assistedState();
      const world = constructWorld(state);
      const assist = () => motionPlayer(world.projection())!.speedAssist;
      expect(assist()).toEqual({ enabled: true, engaged: false });
      expect(world.step(tickInput())).toContainEqual(expect.objectContaining({ type: 'speed-matched', origin: 'assist' }));
      expect(assist()).toEqual({ enabled: true, engaged: true });
      // Ticks without any speed event: the state persists, the events do not repeat it.
      for (let tick = 0; tick < 5; tick++) {
        expect(world.step(tickInput())).toEqual([]);
        expect(assist()).toEqual({ enabled: true, engaged: true });
      }
      // Switching off leaves the match; switching on forgets it.
      world.step(tickInput([{ type: 'speed', operation: 'toggle-auto-match' }]));
      expect(assist()).toEqual({ enabled: false, engaged: true });
      world.step(tickInput([{ type: 'speed', operation: 'toggle-auto-match' }]));
      expect(assist()).toEqual({ enabled: true, engaged: false });
      // Due at once again: it matches, then losing the target releases it.
      world.step(tickInput());
      expect(assist()).toEqual({ enabled: true, engaged: true });
      state.entities.get(state.player.target!)!.state = 'pending-removal';
      world.step(tickInput());
      expect(world.step(tickInput())).toEqual([{ type: 'speed-assist-released', tick: 11 }]);
      expect(assist()).toEqual({ enabled: true, engaged: false });
    });

    it('is deeply frozen, detached from the world and a new copy every call; reading it changes neither the state nor its hash', () => {
      const state = assistedState();
      const world = constructWorld(state);
      world.step(tickInput([{ type: 'speed', operation: 'decrease' }]));
      const hash = snapshotHash(world.snapshot());
      const [first, second] = [world.projection(), world.projection()];
      expect(snapshotHash(world.snapshot())).toBe(hash);
      expect(deepFrozen(first)).toBe(true);
      expect(second).toEqual(first);
      const reading = motionPlayer(first)!;
      expect(motionPlayer(second)).not.toBe(reading);
      const player = state.entities.get(reading.entityId)!;
      expect(reading.position).not.toBe(player.position);
      expect(reading.orientation).not.toBe(player.orientation);

      const json = JSON.stringify(first);
      Object.assign(player.movement!, { speed: 1, commandedSpeed: 2 });
      player.position = { x: 9, y: 9, z: 9 };
      player.maximumSpeed = 3;
      state.player.control!.speedAssist.enabled = false;
      world.step(tickInput());
      expect(JSON.stringify(first)).toBe(json);
      expect(world.projection()).not.toEqual(first);
    });

    it.each<[string, (state: WorldState) => void]>([
      ['has no movement block', (state) => {
        addPlayerEntity(state, { activity: 'parked', movement: null });
      }],
      ['has no control state', (state) => {
        addPlayerEntity(state);
        state.player.control = null;
      }],
      ['does not resolve', (state) => {
        addPlayerEntity(state);
        state.player.entityId = 99;
      }],
    ])('is a latched Core fault when the player entity %s', (_, breakState) => {
      const state = testState();
      breakState(state);
      const world = constructWorld(state);
      const fault = expectFault(() => world.projection(), 'invariant-violated', 'projection.motion');
      expect(thrownBy(() => world.renderState())).toBe(fault);
    });
  });

  it('types each rule partition as not-implemented or its ready shape', () => {
    // P3-06 D-05: the flight partition is two groups, each not-implemented or its own ready shape.
    expectTypeOf<Projection['flight']>().toEqualTypeOf<{
      readonly motion: NotImplementedPartition | MotionReady;
      readonly combat: NotImplementedPartition | CombatReady;
    }>();
    expectTypeOf<Projection['map']>().toEqualTypeOf<NotImplementedPartition | MapReady>();
    expectTypeOf<Projection['communications']>().toEqualTypeOf<NotImplementedPartition | CommunicationsReady>();
    expectTypeOf<Projection['result']>().toEqualTypeOf<NotImplementedPartition | ResultReady>();
    // Owners define the resources (and the other `never` fields) by revising the spec before a partition can be ready.
    expectTypeOf<FlightResourceName>().toBeNever();
    expectTypeOf<MotionReady['readiness']>().toEqualTypeOf<'ready'>();
    expectTypeOf<CombatReady['readiness']>().toEqualTypeOf<'ready'>();
    expectTypeOf<MotionReady['player']>().toEqualTypeOf<MotionPlayer | null>();
    expectTypeOf<keyof MotionPlayer>().toEqualTypeOf<
      'entityId' | 'position' | 'orientation' | 'speed' | 'commandedSpeed' | 'maximumSpeed' | 'speedLimitStatus' | 'speedAssist'
    >();
    expectTypeOf<SpeedLimitStatus>().toEqualTypeOf<'initial-only' | 'live'>();
    expectTypeOf<MotionPlayer['speedAssist']>().toEqualTypeOf<{ readonly enabled: boolean; readonly engaged: boolean }>();
  });
});
