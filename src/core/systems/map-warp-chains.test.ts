import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import type { DomainEvent, Vec3 } from '../contracts/domain-events.ts';
import {
  chainInput, chainScript, CHAIN_TICKS, HOVER_PIXEL, CLOSE_TICK, FAR_HOSTILE_ID, FAR_HOSTILE_POSITION, FAR_PIXEL, FAR_SELECT_TICK, FIRE_TICK, FRIENDLY_TICK,
  MARKER_ID, NEAR_HOSTILE_ID, NEAR_HOSTILE_POSITION, NEAR_ICON_PIXEL, NEAR_SELECT_TICK, OPEN_TICK, PLAYER_ID, PLAYER_START, TRANSIT_SECONDS,
  UNITS_PER_PIXEL, WARP_INTERVAL_SECONDS, WARP_TICK, WORLD_MIN,
} from '../replay/map-warp.test-support.ts';
import { snapshotHash, type GameSnapshot, type SnapshotEntity } from '../replay/snapshot.ts';
import { STARTUP_ROTATIONS } from '../rules/startup-rotations.ts';
import { createWorld } from '../world/create-world.ts';
import type { CraftCombat, EntityId, SteeredMovementBlock } from '../world/entity-table.ts';
import type { MapPixel } from '../world/map-rule-data.ts';
import type { World } from '../world/world.ts';

// P3-09 AC-11's end-to-end chain (docs/plan/p3/09/spec.md; subtask 20): open the map → select → close → select the
// marker as the friendly target → request-warp → arrival, in formal World.step on created synthetic content (never
// original data), with nothing written into the world from outside. The expectations are worked out from the contract
// (docs/plan/p3/02/spec.md, MW-02 to MW-09) and the synthetic frame of map-warp.test-support.ts, not read back from the
// rule code: pixels from the 225-units-a-pixel frame, the destination from the pixel, the icon's z, the fog, the start's
// check, the transit's per-tick counters and the arrival's snap, charge and interval from their formulas. Rotations are
// only checked to be entries of the start-up rotation table, whose own contract is startup-rotations.test.ts's. Each
// step's own rules are the unit tests'.

const FLIGHT = 0x0c;
const WARP = 1;
const MAP = 8;
const WARP_PAGE = 6;

/** The run read once: the events of tick t at `events[t]`, the snapshot after tick t (0: before any) at `snapshots[t]`. */
interface Run {
  readonly events: readonly (readonly DomainEvent[])[];
  readonly snapshots: readonly GameSnapshot[];
}

function runChain(world: World = createWorld(chainInput()), ticks = CHAIN_TICKS): Run {
  const events: (readonly DomainEvent[])[] = [[]];
  const snapshots = [world.snapshot()];
  for (let tick = 1; tick <= ticks; tick++) {
    events.push(world.step(chainScript(tick)));
    snapshots.push(world.snapshot());
  }
  return { events, snapshots };
}

const RUN = runChain();
const stateAt = (tick: number) => RUN.snapshots[tick].state;
const entityAt = (tick: number, id: EntityId): SnapshotEntity | undefined => stateAt(tick).entities.find((entity) => entity.id === id);
const energyAt = (tick: number) => (entityAt(tick, PLAYER_ID)!.combat as CraftCombat).energy;
const ofType = <Type extends DomainEvent['type']>(events: readonly DomainEvent[], type: Type) =>
  events.filter((event): event is Extract<DomainEvent, { type: Type }> => event.type === type);
const allOf = <Type extends DomainEvent['type']>(type: Type) => ofType(RUN.events.flat(), type);

/** The main map's pixel of a world point, trunc((x − min) ÷ units per pixel), and the cursor pixel's world point. */
const pixelOf = ({ x, y }: Vec3): MapPixel => ({ column: Math.trunc((x - WORLD_MIN) / UNITS_PER_PIXEL), row: Math.trunc((y - WORLD_MIN) / UNITS_PER_PIXEL) });
const worldOf = ({ column, row }: MapPixel, z: number): Vec3 => ({ x: column * UNITS_PER_PIXEL + WORLD_MIN, y: row * UNITS_PER_PIXEL + WORLD_MIN, z });
const distance = (from: Vec3, to: Vec3) => Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
/** The Warp cost from the pairs (10, 100), (1000, 200): q = n ÷ 1000 ≤ 10 takes 100 per 1000 units. */
const costOf = (units: number) => Math.trunc(((Math.trunc(units / 1000) <= 10 ? 100 : 200) * units) / 1000);

/** Every coverage radius in the synthetic craft info (+0x0C). */
const COVERAGE = 250;
const NEAR_DESTINATION = worldOf(NEAR_ICON_PIXEL, NEAR_HOSTILE_POSITION.z);
const FAR_DESTINATION = worldOf(FAR_PIXEL, 0);

/** The P3-09 events with the target and page events among them, as [tick, type]. */
const MAP_WARP_TYPES = new Set(['map-toggled', 'warp-destination-set', 'warp-started', 'warp-completed', 'target-changed', 'left-page-changed']);
const sequenceOf = (events: readonly DomainEvent[]) => events.flatMap((event) => (MAP_WARP_TYPES.has(event.type) ? [[event.tick, event.type]] : []));

const COMPLETION = allOf('warp-completed')[0]?.tick ?? Number.NaN;

describe('the map and Warp chain in formal steps (P3-09 AC-11)', () => {
  it('runs the whole chain: its map, target, Warp and page events in order, each once', () => {
    expect(sequenceOf(RUN.events.flat())).toEqual([
      [3, 'target-changed'],
      [OPEN_TICK, 'map-toggled'],
      [NEAR_SELECT_TICK, 'warp-destination-set'],
      [FAR_SELECT_TICK, 'warp-destination-set'],
      [CLOSE_TICK, 'map-toggled'],
      [FRIENDLY_TICK, 'target-changed'],
      [WARP_TICK, 'warp-started'],
      [WARP_TICK, 'left-page-changed'],
      [COMPLETION, 'warp-completed'],
      [COMPLETION, 'left-page-changed'],
    ]);
    const results = RUN.events.flat().flatMap((event) => (event.type === 'command-result' ? [[event.tick, event.commandType, event.outcome]] : []));
    expect(results).toEqual([
      [OPEN_TICK, 'toggle-map', 'accepted'],
      [NEAR_SELECT_TICK, 'map-point', 'accepted'],
      [NEAR_SELECT_TICK, 'map-point', 'accepted'],
      [FAR_SELECT_TICK, 'map-point', 'accepted'],
      [CLOSE_TICK, 'toggle-map', 'accepted'],
      [FIRE_TICK, 'fire', 'accepted'],
      [FRIENDLY_TICK, 'target', 'accepted'],
      [WARP_TICK, 'request-warp', 'accepted'],
    ]);
    // The near hostile is shot down and released while the player is in the Warp.
    expect(allOf('object-destroyed').map(({ entityId }) => entityId)).toEqual([NEAR_HOSTILE_ID]);
    expect(allOf('source-released')).toEqual([expect.objectContaining({ entityId: NEAR_HOSTILE_ID, removed: true })]);
    expect(COMPLETION).toBeGreaterThan(WARP_TICK);
    expect(COMPLETION).toBeLessThan(CHAIN_TICKS);
  });

  it('opens the map: view 8, the cursor at its start, the object sets, and icons and visibility only within coverage', () => {
    expect(ofType(RUN.events[OPEN_TICK], 'map-toggled')).toEqual([{ type: 'map-toggled', tick: OPEN_TICK, open: true, viewMode: MAP, previousViewMode: FLIGHT, commandIndex: 0 }]);
    // Before the map nothing is revealed and no icon list is built; the sets are rebuilt every tick.
    const before = stateAt(OPEN_TICK - 1);
    expect(before.mapIcons).toEqual([]);
    expect(before.entities.map(({ mapVisible }) => mapVisible)).toEqual([false, false, false]);
    expect(before.objectSets).toEqual({ friendly: [PLAYER_ID], hostile: [NEAR_HOSTILE_ID, FAR_HOSTILE_ID] });

    const state = stateAt(OPEN_TICK);
    expect(state.player).toMatchObject({ viewMode: MAP, previousViewMode: FLIGHT, map: { cursor: { column: 178, row: 154 }, destination: null } });
    // The player reveals itself and the hostile 112.5 above it (planar distance 0 < 250), not the one ~6000 away.
    expect(Math.hypot(FAR_HOSTILE_POSITION.x - PLAYER_START.x, FAR_HOSTILE_POSITION.y - PLAYER_START.y)).toBeGreaterThan(COVERAGE);
    expect(state.entities.map(({ id, mapVisible }) => [id, mapVisible])).toEqual([[PLAYER_ID, true], [NEAR_HOSTILE_ID, true], [FAR_HOSTILE_ID, false]]);
    // One icon a contact, at its position at the frame end; the hostile's pixel is the player's, so it moves by (+3, +3).
    const player = entityAt(OPEN_TICK, PLAYER_ID)!;
    const playerPixel = pixelOf(player.position);
    expect([playerPixel, pixelOf(NEAR_HOSTILE_POSITION)]).toEqual([{ column: 200, row: 201 }, { column: 200, row: 201 }]);
    expect(state.mapIcons).toEqual([
      { entityId: PLAYER_ID, kindBit: 0, position: player.position, pixel: playerPixel, inWorld: true },
      { entityId: NEAR_HOSTILE_ID, kindBit: 7, position: NEAR_HOSTILE_POSITION, pixel: { column: playerPixel.column + 3, row: playerPixel.row + 3 }, inWorld: true },
    ]);
    expect(state.mapIcons[1].pixel).toEqual(NEAR_ICON_PIXEL);
  });

  it('selects: the icon\'s z is taken, a hover moves only the cursor, the marker is created and then moved, and the fog hides the far z', () => {
    // The hover after the select gives its result and no event of its own.
    expect(RUN.events[NEAR_SELECT_TICK].map(({ type }) => type)).toEqual(['command-result', 'command-result', 'warp-destination-set']);
    expect(ofType(RUN.events[NEAR_SELECT_TICK], 'warp-destination-set')).toEqual([{
      type: 'warp-destination-set', tick: NEAR_SELECT_TICK, playerEntityId: PLAYER_ID, destination: NEAR_DESTINATION, pixel: NEAR_ICON_PIXEL,
      icon: { entityId: NEAR_HOSTILE_ID, kindBit: 7 }, marker: { type: 'created', entityId: MARKER_ID }, commandIndex: 0,
    }]);
    expect(NEAR_DESTINATION).toEqual({ x: 675, y: 900, z: 112.5 });
    const created = entityAt(NEAR_SELECT_TICK, MARKER_ID)!;
    expect(created).toMatchObject({ kindBit: 25, position: NEAR_DESTINATION, name: { type: 'map-marker' }, presentation: { type: 'map-marker' }, mapVisible: false });
    expect(STARTUP_ROTATIONS).toContainEqual(created.orientation);
    // The select put the cursor on its pixel and the hover then moved only the cursor.
    expect(stateAt(NEAR_SELECT_TICK).player.map).toEqual({ cursor: HOVER_PIXEL, destination: NEAR_DESTINATION });

    // The far hostile's own pixel: it has no icon (not revealed), so z is +0, not its 600.
    expect(pixelOf(FAR_HOSTILE_POSITION)).toEqual(FAR_PIXEL);
    expect(stateAt(NEAR_SELECT_TICK).mapIcons.map(({ entityId }) => entityId)).toEqual([PLAYER_ID, NEAR_HOSTILE_ID]);
    expect(ofType(RUN.events[FAR_SELECT_TICK], 'warp-destination-set')).toEqual([{
      type: 'warp-destination-set', tick: FAR_SELECT_TICK, playerEntityId: PLAYER_ID, destination: FAR_DESTINATION, pixel: FAR_PIXEL, icon: null,
      marker: { type: 'moved', entityId: MARKER_ID }, commandIndex: 0,
    }]);
    expect(FAR_DESTINATION).toEqual({ x: 4500, y: 4500, z: 0 });
    const moved = entityAt(FAR_SELECT_TICK, MARKER_ID)!;
    expect(moved).toMatchObject({ position: FAR_DESTINATION, placementSerial: created.placementSerial + 1, orientation: created.orientation });
    // Only the marker was added: one entity, never on the map list.
    expect(stateAt(FAR_SELECT_TICK).nextEntityId).toBe(MARKER_ID + 1);
    expect(stateAt(FAR_SELECT_TICK).mapIcons.map(({ entityId }) => entityId)).toEqual([PLAYER_ID, NEAR_HOSTILE_ID]);
  });

  it('closes the map back to flight, clearing the icons and reveal while keeping the cursor, destination and marker', () => {
    expect(ofType(RUN.events[CLOSE_TICK], 'map-toggled')).toEqual([{ type: 'map-toggled', tick: CLOSE_TICK, open: false, viewMode: FLIGHT, previousViewMode: MAP, commandIndex: 0 }]);
    const state = stateAt(CLOSE_TICK);
    expect(state.player).toMatchObject({ viewMode: FLIGHT, previousViewMode: MAP, map: { cursor: FAR_PIXEL, destination: FAR_DESTINATION }, target: NEAR_HOSTILE_ID });
    expect(state.mapIcons).toEqual([]);
    expect(state.entities.filter(({ mapVisible }) => mapVisible)).toEqual([]);
    expect(entityAt(CLOSE_TICK, MARKER_ID)!.position).toEqual(FAR_DESTINATION);
  });

  it('selects the marker as the friendly target', () => {
    expect(ofType(RUN.events[FRIENDLY_TICK], 'target-changed')).toEqual([{
      type: 'target-changed', tick: FRIENDLY_TICK, playerEntityId: PLAYER_ID, previousTarget: NEAR_HOSTILE_ID, target: MARKER_ID, targetKindBit: 25, mode: 'friendly',
      origin: 'command', commandIndex: 0,
    }]);
    expect(stateAt(FRIENDLY_TICK).player.target).toBe(MARKER_ID);
  });

  it('starts the Warp on the committed state: the check, the view and page, the cleared target, and no energy taken', () => {
    const origin = entityAt(WARP_TICK - 1, PLAYER_ID)!.position;
    const start = distance(origin, FAR_DESTINATION);
    const energy = energyAt(WARP_TICK - 1);
    // A short Warp: d ÷ (15000 × 8 × 1.414) is below 0.5, so L = 0.5 × +0xA8.
    expect(start / (15000 * 8 * 1.414)).toBeLessThan(0.5);
    expect(costOf(Math.trunc(start))).toBeLessThanOrEqual(energy);
    expect(RUN.events[WARP_TICK].filter(({ type }) => type === 'warp-started' || type === 'left-page-changed' || type === 'target-changed')).toEqual([
      {
        type: 'warp-started', tick: WARP_TICK, playerEntityId: PLAYER_ID, serial: 1, origin, destination: FAR_DESTINATION, distance: Math.fround(start),
        check: { cost: costOf(Math.trunc(start)), energy }, transitLength: Math.fround(0.5 * TRANSIT_SECONDS), fromViewMode: FLIGHT, commandIndex: 0,
      },
      { type: 'left-page-changed', tick: WARP_TICK, page: WARP_PAGE, previousPage: 0, commandIndex: null },
    ]);
    const state = stateAt(WARP_TICK);
    expect(state.player).toMatchObject({ viewMode: WARP, previousViewMode: FLIGHT, target: null, savedLeftPage: 0, leftDisplay: { page: WARP_PAGE } });
    expect(state.player.warp).toMatchObject({ serial: 1, origin, length: 7 });
    expect(state.player.warp!.path).toHaveLength(15);
    expect(entityAt(WARP_TICK, PLAYER_ID)).toMatchObject({ inWarp: true, warpClock: 0, movement: { mode: 'warp' } });
  });

  it('runs the transit once a tick to the end, writing nothing of the map, while the world goes on', () => {
    const progress = (tick: number) => {
      const { segments, fraction, length } = stateAt(tick).player.warp!;
      return Math.fround((segments + fraction) * Math.fround(1 / length));
    };
    for (let tick = WARP_TICK; tick < COMPLETION; tick++) {
      const state = stateAt(tick);
      expect(state.player, `tick ${tick}`).toMatchObject({ viewMode: WARP, target: null, leftDisplay: { page: WARP_PAGE }, map: { destination: FAR_DESTINATION } });
      expect(state.player.warp, `tick ${tick}`).toMatchObject({ serial: 1, length: 7 });
      expect(state.mapIcons, `tick ${tick}`).toEqual([]);
      expect(entityAt(tick, MARKER_ID)!.position).toEqual(FAR_DESTINATION);
      expect(entityAt(tick, PLAYER_ID)).toMatchObject({ inWarp: true, movement: { mode: 'warp' } });
      if (tick > WARP_TICK) expect(progress(tick), `tick ${tick}`).toBeGreaterThanOrEqual(progress(tick - 1));
    }
    // MW-07's step, once a tick from the start's reset (n = 1, u = 0): u += speed × 1/32 s ÷ the segment length +0xB8
    // (64), stored f32, the block's speed after the tick's movement; at u ≥ 1 the next segment starts at u = 0.
    let counters = { segments: 1, fraction: 0 };
    for (let tick = WARP_TICK; tick < COMPLETION; tick++) {
      const { speed } = entityAt(tick, PLAYER_ID)!.movement as SteeredMovementBlock;
      const fraction = Math.fround(counters.fraction + (speed * (2 / 64)) / 64);
      counters = 1 > fraction ? { segments: counters.segments, fraction } : { segments: Math.fround(counters.segments + 1), fraction: 0 };
      expect(stateAt(tick).player.warp, `tick ${tick}`).toMatchObject(counters);
    }
    // The completion comes in the tick after the frame end that reached the end: (n + u) ÷ L ≥ 1 with L = 7. In this run
    // that is tick 639, a regression anchor for the speed the step integrates.
    expect(progress(COMPLETION - 1)).toBeGreaterThanOrEqual(1);
    expect(progress(COMPLETION - 2)).toBeLessThan(1);
    expect(COMPLETION).toBe(639);
    // The released hostile has left the world in the meantime.
    expect(entityAt(COMPLETION - 1, NEAR_HOSTILE_ID)).toBeUndefined();
  });

  it('arrives by the contract: the snap, the charge, the interval and the hostile nearby, then flight with the saved page', () => {
    const [completed] = allOf('warp-completed');
    const before = stateAt(COMPLETION - 1);
    const { error, origin } = before.player.warp!;
    expect(error).toBeGreaterThanOrEqual(0);
    expect(error).toBeLessThanOrEqual(1);
    // The arrival point: the destination pulled by s toward its sector corner (sector 0 of S = 15000 on both axes: the
    // centre 7500, so the corner 0) and moved by s × ±(group + 1) × 5000. Whichever the sign, the player, put at the
    // destination first and first in the walk, is the nearest candidate within 600 (the marker there comes later).
    const k = (before.config.group + 1) * 5000;
    for (const sign of [1, -1]) {
      const point = { x: FAR_DESTINATION.x * (1 - error), y: FAR_DESTINATION.y * (1 - error), z: sign * error * k };
      const scores = before.kindOrder.map((id) => {
        const position = id === PLAYER_ID ? FAR_DESTINATION : before.entities.find((entity) => entity.id === id)!.position;
        return [id, distance(point, position) ** 2] as const;
      });
      const best = Math.min(...scores.map(([, score]) => score));
      expect(scores.find(([, score]) => score === best)![0]).toBe(PLAYER_ID);
      expect(best).toBeLessThan(600 ** 2);
    }
    const position = { ...FAR_DESTINATION, z: 600 };
    const travelled = Math.fround(distance(position, origin));
    // No energy update falls due in the completing tick, so the charge starts from the energy the tick before left.
    expect((entityAt(COMPLETION - 1, PLAYER_ID)!.combat as CraftCombat).nextEnergyClock).toBeGreaterThan(COMPLETION * 2);
    const energyBefore = energyAt(COMPLETION - 1);
    const cost = costOf(Math.trunc(travelled));
    const energyAfter = Math.max(Math.trunc(energyBefore - (cost + cost * error * 0.5)), 0);
    const warpClock = COMPLETION * 2 + Math.max(Math.trunc(64 * WARP_INTERVAL_SECONDS * Math.min(1, travelled / 30000)), 0x280);
    // The far hostile lies 53 units from the arrival, within the player craft's 250.
    expect(distance(position, FAR_HOSTILE_POSITION)).toBeLessThan(COVERAGE);
    expect(completed).toEqual({
      type: 'warp-completed', tick: COMPLETION, serial: 1, viewMode: FLIGHT, previousViewMode: WARP,
      arrival: {
        playerEntityId: PLAYER_ID, origin, destination: FAR_DESTINATION, position, orientation: expect.any(Array), error, snapped: PLAYER_ID,
        charge: { distance: Math.trunc(travelled), cost, energyBefore, energyAfter },
        warpClock, hostileNear: true,
      },
    });
    expect(STARTUP_ROTATIONS).toContainEqual(completed.arrival!.orientation);
    expect(ofType(RUN.events[COMPLETION], 'left-page-changed')).toEqual([{ type: 'left-page-changed', tick: COMPLETION, page: 0, previousPage: WARP_PAGE, commandIndex: null }]);
    expect(RUN.events[COMPLETION].findIndex(({ type }) => type === 'warp-completed'))
      .toBeLessThan(RUN.events[COMPLETION].findIndex(({ type }) => type === 'left-page-changed'));

    // Flight again, at the arrival; the transit, destination and marker stay as they were (MW-02, MW-08).
    const after = stateAt(COMPLETION);
    const player = entityAt(COMPLETION, PLAYER_ID)!;
    expect(after.player).toMatchObject({ viewMode: FLIGHT, previousViewMode: WARP, leftDisplay: { page: 0 }, target: null, map: { destination: FAR_DESTINATION } });
    expect(after.player.warp).toEqual(before.player.warp);
    expect(player).toMatchObject({ position, orientation: completed.arrival!.orientation, inWarp: false, warpClock, movement: { mode: 'craft', speed: player.maximumSpeed } });
    expect((player.combat as CraftCombat).energy).toBe(energyAfter);
    expect(entityAt(COMPLETION, MARKER_ID)!.position).toEqual(FAR_DESTINATION);
    expect(sequenceOf(RUN.events.slice(COMPLETION + 1).flat())).toEqual([]);
  });
});

describe('events read after a Runtime frame of several ticks (P3-09 AC-11)', () => {
  it('still hold what happened when the entities they name have moved or been removed', () => {
    const world = createWorld(chainInput());
    for (let tick = 1; tick < NEAR_SELECT_TICK; tick++) world.step(chainScript(tick));
    // One frame runs ticks 5–13 before its consumer reads any event; a copy of each is taken as the tick returns.
    const last = WARP_TICK + 3;
    const frame: DomainEvent[] = [];
    const copies: unknown[] = [];
    for (let tick = NEAR_SELECT_TICK; tick <= last; tick++) {
      const events = world.step(chainScript(tick));
      frame.push(...events);
      copies.push(...events.map((event) => JSON.parse(JSON.stringify(event)) as unknown));
    }
    const { state } = world.snapshot();
    // By now the selected icon's hostile is gone, the marker has moved and the player flies in the Warp's own frame.
    expect(state.entities.some(({ id }) => id === NEAR_HOSTILE_ID)).toBe(false);
    expect(state.entities.find(({ id }) => id === MARKER_ID)!.position).toEqual(FAR_DESTINATION);
    expect(state.entities.find(({ id }) => id === PLAYER_ID)!.position.z).toBeGreaterThan(10000);

    expect(frame).toEqual(copies);
    expect(frame.every(deepFrozen)).toBe(true);
    expect(frame).toEqual(RUN.events.slice(NEAR_SELECT_TICK, last + 1).flat());
    const [first] = ofType(frame, 'warp-destination-set');
    expect(first).toMatchObject({ destination: NEAR_DESTINATION, pixel: NEAR_ICON_PIXEL, icon: { entityId: NEAR_HOSTILE_ID, kindBit: 7 }, marker: { type: 'created', entityId: MARKER_ID } });
    const [started] = ofType(frame, 'warp-started');
    expect(started.origin).toEqual(entityAt(WARP_TICK - 1, PLAYER_ID)!.position);
    expect(ofType(frame, 'object-destroyed')).toEqual([expect.objectContaining({ entityId: NEAR_HOSTILE_ID, kindBit: 7, position: NEAR_HOSTILE_POSITION })]);
  });
});

describe('a retry (P3-09 AC-11; docs/plan/p3/02/spec.md, MW-02 lifecycle)', () => {
  it('rebuilds every map and Warp state in a new world, where the earlier run\'s events and IDs never appear', () => {
    const input = chainInput();
    const earlier = createWorld(input);
    // The earlier run is left in the Warp with a marker, a destination, a saved page and a destroyed hostile.
    const stopped = WARP_TICK + 2;
    for (let tick = 1; tick <= stopped; tick++) earlier.step(chainScript(tick));
    expect(earlier.snapshot().state.player).toMatchObject({ viewMode: WARP, warp: { serial: 1 } });

    const retry = createWorld(input);
    const initial = retry.snapshot();
    expect(initial).toEqual(RUN.snapshots[0]);
    expect(snapshotHash(initial)).toBe(snapshotHash(RUN.snapshots[0]));
    expect(initial.state.player).toMatchObject({ viewMode: FLIGHT, map: { cursor: { column: 178, row: 154 }, destination: null }, savedLeftPage: 0, warp: null });
    expect([initial.state.objectSets, initial.state.mapIcons, initial.state.entities, initial.state.nextEntityId]).toEqual([{ friendly: [], hostile: [] }, [], [], 1]);

    // Both go on, interleaved: each follows the run alone, the retry from its own tick 1 with the same IDs and serial 1.
    for (let tick = 1; tick <= stopped; tick++) {
      expect(earlier.step(chainScript(stopped + tick))).toEqual(RUN.events[stopped + tick]);
      expect(retry.step(chainScript(tick))).toEqual(RUN.events[tick]);
    }
    expect(retry.snapshot()).toEqual(RUN.snapshots[stopped]);
    expect(earlier.snapshot()).toEqual(RUN.snapshots[2 * stopped]);
  });

  it('gives a retry the same run whether or not the earlier one went through the map and the Warp', () => {
    const input = chainInput();
    const earlier = createWorld(input);
    for (let tick = 1; tick <= WARP_TICK + 2; tick++) earlier.step(chainScript(tick));
    const again = runChain(createWorld(input), WARP_TICK + 2);
    expect(again.events).toEqual(RUN.events.slice(0, WARP_TICK + 3));
    expect(again.snapshots.map(snapshotHash)).toEqual(RUN.snapshots.slice(0, WARP_TICK + 3).map(snapshotHash));
  });
});
