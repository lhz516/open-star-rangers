import { describe, expect, expectTypeOf, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { constructWorld } from '../world/world.ts';
import { entityInit, testState, tickInput } from '../world/world.test-support.ts';
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

describe('projection (P3-02 AC-10, Projection 与 Render State)', () => {
  it('has the clock, mission and player partitions ready and the rule partitions, both flight groups included, not implemented', () => {
    const state = testState({ clockUnitsPerTick: 4, wingman: 3, rawDifficulty: 50, group: 1, slot: 2 });
    const world = constructWorld(state);
    world.step(tickInput());
    const player = state.entities.allocate(entityInit(0));
    state.player.entityId = player.id;
    expect(world.projection()).toEqual({
      clock: { tick: 1, clock: 4, clockUnitsPerTick: 4 },
      mission: { mission: 'mission/first-campaign', group: 1, slot: 2, rawDifficulty: 50, wingman: 3, status: 'built' },
      player: { entityId: player.id, viewMode: 0x0c, previousViewMode: 0x0c, subMode: 0, interactionContext: 'flight' },
      flight: { motion: { readiness: 'not-implemented' }, combat: { readiness: 'not-implemented' } },
      map: { readiness: 'not-implemented' },
      communications: { readiness: 'not-implemented' },
      result: { readiness: 'not-implemented' },
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
