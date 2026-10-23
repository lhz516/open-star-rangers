import { describe, expect, expectTypeOf, it } from 'vitest';
import type { AssetId } from '../../content/asset-id.ts';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { snapshotHash } from '../replay/snapshot.ts';
import { constructWorld } from '../world/world.ts';
import {
  addPlayerEntity, entityInit, expectFault, stillEntityInit, testState, thrownBy, tickInput, TEST_ORIENTATION,
} from '../world/world.test-support.ts';
import type { SteeredMovementBlock } from '../world/entity-table.ts';
import type { MissionResult, WorldState } from '../world/world-state.ts';
import {
  PLAYER_SPEED_LIMIT_STATUS,
  projectWorld,
  type CombatPlayer,
  type BaseServiceView,
  type CombatReady,
  type CombatWarpReading,
  type CommunicationsMenuView,
  type CommunicationsOption,
  type CommunicationsPlayer,
  type CommunicationsProjection,
  type FlightCombat,
  type FlightResourceName,
  type IncomingView,
  type MapContact,
  type MapInformationRow,
  type MapOpen,
  type MapPartition,
  type MapPlayer,
  type MapReady,
  type MenuContentReference,
  type MissionPhase,
  type MotionPlayer,
  type MotionReady,
  type NotImplementedPartition,
  type Projection,
  type ResultMessageReference,
  type ResultProjection,
  type SpeedLimitStatus,
  type WeaponListReading,
  type WarpRequestReading,
  type WeaponRecordReference,
} from './projection.ts';

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
  (target.movement as SteeredMovementBlock).speed = 20;
  // P3-07 selects targets; until then a test sets it.
  state.player.target = target.id;
  return state;
}

describe('projection (P3-02 AC-10, Projection 与 Render State; P3-06 AC-08, D-05)', () => {
  it('has every partition and both flight groups ready, the result in progress', () => {
    const state = testState({ clockUnitsPerTick: 4, wingman: 3, rawDifficulty: 50, group: 1, slot: 2 });
    const world = constructWorld(state);
    world.step(tickInput());
    const player = addPlayerEntity(state, { position: { x: -1.5, y: 2.25, z: 300 }, orientation: TEST_ORIENTATION, maximumSpeed: 52 });
    Object.assign(player.movement!, { speed: 30.5, commandedSpeed: 41.25 });
    expect(world.projection()).toEqual({
      clock: { tick: 1, clock: 4, clockUnitsPerTick: 4 },
      mission: { mission: 'mission/first-campaign', group: 1, slot: 2, rawDifficulty: 50, wingman: 3, status: 'built', phase: 'normal' },
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
            // P3-07 recomputes it from the live energy state (CR-09).
            speedLimitStatus: 'live',
            // Group 1: off.
            speedAssist: { enabled: false, engaged: false },
          },
        },
        combat: { readiness: 'ready', player: expect.objectContaining({ entityId: player.id }) },
      },
      // A closed map; the player entity is not active yet.
      map: { readiness: 'ready', player: { state: 'closed', destination: null, markerEntityId: null, warpRequest: { accepted: false, reason: 'player-unavailable' } } },
      // P3-10 CB-14; its readings have their own tests (communications.test.ts).
      communications: { readiness: 'ready', player: expect.objectContaining({ entityId: player.id, menu: null, incoming: null, base: null }) },
      // P3-11 ME-14: in progress until the teardown completed.
      result: { readiness: 'ready', outcome: 'in-progress' },
    });
  });

  describe('mission phase and result (P3-11 ME-14)', () => {
    const latched: MissionResult = {
      outcome: 'success',
      reason: { type: 'all-clear' },
      summary: { mission: 'mission/first-campaign' as AssetId, trigger: 1, range: 2 },
      rescuesUsed: 1,
      endingGaps: [{ gap: 'G-02/8', variant: 'wingman' }, { gap: 'G-02/9', row: 16 }],
      playerKills: 7,
      latchTick: 40,
    };

    it('maps main state 3 by sub-state, states 4, 5, 0 and 1, and the completion to the phase', () => {
      const state = testState();
      const cases: readonly [Pick<WorldState['flow'], 'mainState' | 'subState'>, MissionPhase][] = [
        [{ mainState: 3, subState: 0 }, 'normal'],
        [{ mainState: 3, subState: 1 }, 'beacon-wait'],
        [{ mainState: 3, subState: 2 }, 'destruction-sequence'],
        [{ mainState: 3, subState: 3 }, 'docking'],
        [{ mainState: 3, subState: 4 }, 'docking'],
        [{ mainState: 3, subState: 5 }, 'docking'],
        // State 4 and 5 ignore the sub-state, which 0x333b4 can still set to 3 (ME-03).
        [{ mainState: 4, subState: 3 }, 'settlement-wait'],
        [{ mainState: 5, subState: 0 }, 'result-delay'],
        [{ mainState: 0, subState: 2 }, 'teardown'],
        [{ mainState: 1, subState: 0 }, 'teardown'],
      ];
      for (const [flow, phase] of cases) {
        Object.assign(state.flow, flow);
        expect(projectWorld(state).mission.phase, JSON.stringify(flow)).toBe(phase);
        expect(projectWorld(state).result).toEqual({ readiness: 'ready', outcome: 'in-progress' });
      }
      state.missionStatus = 'ended';
      Object.assign(state.flow, { mainState: 1, result: latched, completedTick: 41 });
      expect(projectWorld(state).mission).toMatchObject({ status: 'ended', phase: 'completed' });
    });

    it('keeps the latched result in progress through the teardown and gives it, frozen and detached, once completed', () => {
      const state = testState();
      state.missionStatus = 'ended';
      Object.assign(state.flow, { mainState: 0, result: latched, rescues: 0 });
      expect(projectWorld(state).result).toEqual({ readiness: 'ready', outcome: 'in-progress' });
      Object.assign(state.flow, { mainState: 1, completedTick: 41 });
      const { result } = projectWorld(state);
      expect(result).toEqual({ readiness: 'ready', ...latched, completedTick: 41 });
      expect(deepFrozen(result)).toBe(true);
      if (result.outcome === 'in-progress') throw new Error('The result must be final');
      expect(result.summary).not.toBe(latched.summary);
      expect(result.endingGaps).not.toBe(latched.endingGaps);
      // The rescue count, the section-2 counters, the deadlines and the settlement stay out of the projection.
      expect(JSON.stringify(projectWorld(state))).not.toMatch(/rescues"|instantiated|Deadline|settlement|dueClock/);
    });

    it('gives a failure\'s reason and its one ending gap', () => {
      const state = testState();
      state.missionStatus = 'ended';
      const failure: MissionResult = {
        outcome: 'failure', reason: { type: 'third-loss', loss: 'energy' }, summary: null, rescuesUsed: 2,
        endingGaps: [{ gap: 'G-02/7', variant: 'energy' }], playerKills: 0, latchTick: 9,
      };
      Object.assign(state.flow, { mainState: 1, result: failure, completedTick: 10 });
      expect(projectWorld(state).result).toEqual({ readiness: 'ready', ...failure, completedTick: 10 });
    });

    it('faults on a completion without a latched result', () => {
      const state = testState();
      Object.assign(state.flow, { mainState: 1, completedTick: 3 });
      expectFault(() => projectWorld(state), 'invariant-violated', 'projection.result');
    });
  });

  it('keeps the combat group\'s four states apart: not implemented, no player, a live player and a destroyed one (P3-07 AC-04)', () => {
    const stateOf = (combat: FlightCombat): string => {
      if (combat.readiness === 'not-implemented') return 'not-implemented';
      if (combat.player === null) return 'no-player';
      return combat.player.destroyed ? 'destroyed' : 'live';
    };
    const state = testState();
    const combat = () => stateOf(projectWorld(state).flight.combat);
    expect(stateOf({ readiness: 'not-implemented' })).toBe('not-implemented');
    expect(combat()).toBe('no-player');
    const player = addPlayerEntity(state);
    expect(combat()).toBe('live');
    player.destroyed = true;
    expect(combat()).toBe('destroyed');
    expect(projectWorld(state).flight.motion).toMatchObject({ readiness: 'ready', player: { entityId: player.id } });
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
      expect(projectWorld(state).flight).toEqual({ motion: { readiness: 'ready', player: null }, combat: { readiness: 'ready', player: null } });
      const world = constructWorld(state);
      const player = addPlayerEntity(state);
      expect(motionPlayer(world.projection())?.entityId).toBe(player.id);
      player.state = 'pending-removal';
      world.step(tickInput());
      expect(state.entities.get(player.id)).toBeUndefined();
      expect(world.projection().flight).toEqual({ motion: { readiness: 'ready', player: null }, combat: { readiness: 'ready', player: null } });
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
      ['has a block that is not steered', (state) => {
        const player = addPlayerEntity(state);
        player.movement = { mode: 'linear', speed: 0, velocity: { x: 0, y: 0, z: 0 }, previousPosition: { x: 0, y: 0, z: 0 }, hitTest: false };
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
    // P3-09 MW-11: the map partition's shapes replace the `never` placeholders (map.test.ts).
    expectTypeOf<MapPartition>().toEqualTypeOf<NotImplementedPartition | MapReady>();
    expectTypeOf<MapReady['player']>().toEqualTypeOf<MapPlayer | null>();
    expectTypeOf<MapPlayer['state']>().toEqualTypeOf<'closed' | 'open'>();
    expectTypeOf<keyof MapOpen>().toEqualTypeOf<
      | 'state' | 'openedFromBase' | 'geometry' | 'cursor' | 'contacts' | 'zoomMembers' | 'information' | 'labels' | 'line' | 'destination'
      | 'cursorCost' | 'markerEntityId' | 'warpRequest'
    >();
    expectTypeOf<MapContact['class']>().toEqualTypeOf<'player' | 'friendly' | 'hostile'>();
    expectTypeOf<MapInformationRow['type']>().toEqualTypeOf<'unit-name' | 'unit-values' | 'count'>();
    expectTypeOf<Extract<WarpRequestReading, { accepted: false }>['reason']>()
      .toEqualTypeOf<'player-unavailable' | 'wrong-context' | 'no-destination' | 'cooldown' | 'insufficient-energy'>();
    expectTypeOf<Projection['communications']>().toEqualTypeOf<NotImplementedPartition | CommunicationsProjection>();
    // P3-11 ME-14: the result partition is always ready, in progress or final.
    expectTypeOf<Projection['result']>().toEqualTypeOf<ResultProjection>();
    expectTypeOf<keyof Extract<ResultProjection, { outcome: 'success' | 'failure' }>>().toEqualTypeOf<
      'readiness' | 'outcome' | 'reason' | 'summary' | 'rescuesUsed' | 'endingGaps' | 'playerKills' | 'latchTick' | 'completedTick'
    >();
    expectTypeOf<keyof ResultMessageReference>().toEqualTypeOf<'mission' | 'trigger' | 'range'>();
    expectTypeOf<Projection['mission']['phase']>().toEqualTypeOf<
      'normal' | 'beacon-wait' | 'destruction-sequence' | 'docking' | 'settlement-wait' | 'result-delay' | 'teardown' | 'completed'
    >();
    expectTypeOf<MotionReady['readiness']>().toEqualTypeOf<'ready'>();
    // P3-07 CR-12: the combat group is the flight partition's, ready with the player's readings or null without one.
    expectTypeOf<FlightCombat>().toEqualTypeOf<NotImplementedPartition | CombatReady>();
    expectTypeOf<CombatReady['readiness']>().toEqualTypeOf<'ready'>();
    expectTypeOf<CombatReady['player']>().toEqualTypeOf<CombatPlayer | null>();
    expectTypeOf<keyof CombatPlayer>().toEqualTypeOf<
      'entityId' | 'destroyed' | 'targetMode' | 'target' | 'radar' | 'resources' | 'allocation' | 'weapons' | 'lock' | 'subsystems' | 'leftPage' | 'warp'
    >();
    expectTypeOf<keyof CombatWarpReading>().toEqualTypeOf<'indicator' | 'page'>();
    expectTypeOf<FlightResourceName>().toEqualTypeOf<'energy' | 'shield' | 'charge' | 'hull' | 'spare-power'>();
    expectTypeOf<WeaponRecordReference['family']>().toEqualTypeOf<'gun' | 'missile'>();
    expectTypeOf<CombatPlayer['weapons']>().toEqualTypeOf<readonly [WeaponListReading, WeaponListReading]>();
    expectTypeOf<MotionReady['player']>().toEqualTypeOf<MotionPlayer | null>();
    expectTypeOf<keyof MotionPlayer>().toEqualTypeOf<
      'entityId' | 'position' | 'orientation' | 'speed' | 'commandedSpeed' | 'maximumSpeed' | 'speedLimitStatus' | 'speedAssist'
    >();
    expectTypeOf<SpeedLimitStatus>().toEqualTypeOf<'initial-only' | 'live'>();
    expectTypeOf<MotionPlayer['speedAssist']>().toEqualTypeOf<{ readonly enabled: boolean; readonly engaged: boolean }>();
    // P3-10 CB-14: the communications partition's final shape, ready with the player's readings or null without one;
    // no option is unavailable, and the radio queue, deadlines and base timers are not shown.
    expectTypeOf<CommunicationsProjection['readiness']>().toEqualTypeOf<'ready'>();
    expectTypeOf<CommunicationsProjection['player']>().toEqualTypeOf<CommunicationsPlayer | null>();
    expectTypeOf<keyof CommunicationsPlayer>().toEqualTypeOf<'entityId' | 'page' | 'subsystem' | 'menu' | 'incoming' | 'docking' | 'base' | 'warnings'>();
    expectTypeOf<CommunicationsPlayer['menu']>().toEqualTypeOf<CommunicationsMenuView | null>();
    expectTypeOf<CommunicationsPlayer['incoming']>().toEqualTypeOf<IncomingView | null>();
    expectTypeOf<CommunicationsPlayer['base']>().toEqualTypeOf<BaseServiceView | null>();
    expectTypeOf<keyof CommunicationsMenuView>().toEqualTypeOf<'menu' | 'level' | 'partnerEntityId' | 'options'>();
    expectTypeOf<keyof CommunicationsOption>().toEqualTypeOf<'position' | 'key' | 'value'>();
    expectTypeOf<CommunicationsOption['value']['type']>().toEqualTypeOf<'category' | 'object' | 'command' | 'exit'>();
    expectTypeOf<MenuContentReference['table']>().toEqualTypeOf<'categories' | 'objects' | 'gated' | 'other' | 'kind2'>();
    expectTypeOf<keyof BaseServiceView>().toEqualTypeOf<'baseEntityId' | 'rows' | 'cursor' | 'flags'>();
  });

  it('reports the player\'s maximum speed as live, which P3-07 recomputes from the live energy state (CR-09)', () => {
    expect(PLAYER_SPEED_LIMIT_STATUS).toBe('live');
  });
});
