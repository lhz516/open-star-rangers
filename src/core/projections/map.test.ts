import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import { buildMapIcons, pickMapIcon } from '../rules/map-icons.ts';
import { snapshotHash } from '../replay/snapshot.ts';
import type { CraftCombat, Entity, EntityInit } from '../world/entity-table.ts';
import { initialPlayerControl } from '../world/player-state.ts';
import { constructWorld, type World } from '../world/world.ts';
import { addPlayerEntity, expectFault, stillEntityInit, testState } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { projectMap } from './map.ts';
import { projectWorld, type MapInformationRow, type MapOpen, type MapPlayer, type Projection } from './projection.ts';
import { renderWorld } from './render-state.ts';

// P3-09 S-06, S-10, AC-06, AC-10 (docs/plan/p3/09/spec.md, 地图 projection, Warp 的驾驶舱状态) against the contract of
// docs/plan/p3/02/spec.md, MW-11, and the original's map draw (docs/original/formats/executable.md, cursor, destination
// and marker; map contacts, coverage and fog; zoom window, information window and labels; Warp cost and Warp start).
// Expectations are worked out from those rules, not from the code. The synthetic map (map-rule-data.test.ts): a main
// map of side 400 at (21, 45) over the world ±45000, so pixel = trunc((v + 45000) × F(1/225)); the cursor's start pixel
// (178, 154) is the world point (−4950, −10350, 0), whose zoom window spans x −12450…2550 and y −25350…4650 with
// F(19/1500) and F(1/150) zoom pixels per unit; information capacity 25. Every craft record's +0x0C is 250, so each
// coverage radius is trunc(250 × F(1/225)) = 1 and the reveal reaches 250 units. The player's record has the cost pairs
// (10, 100), (1000, 200): below 11000 units the cost is trunc(n ÷ 10), and the Warp interval +0xA4 = 2 s (128 units).

const FLIGHT = 0x0c;
const WARP = 1;
const BASE = 6;
const MAP = 8;
const CURSOR = Object.freeze({ column: 178, row: 154 });
const CURSOR_WORLD = Object.freeze({ x: -4950, y: -10350, z: 0 });
const ZOOM = Object.freeze({ left: -12450, right: 2550, top: -25350, bottom: 4650 });
const INTERVAL = 128;

const toggle: Command = { type: 'toggle-map' };
const select = (column: number, row: number): Command => ({ type: 'map-point', operation: 'select', right: (column + 0.5) / 400, down: (row + 0.5) / 400 });
const hover = (column: number, row: number): Command => ({ type: 'map-point', operation: 'hover', right: (column + 0.5) / 400, down: (row + 0.5) / 400 });
const warp: Command = { type: 'request-warp' };

const mainPixel = ({ x, y }: Vec3) => ({ column: Math.trunc((x + 45000) * Math.fround(1 / 225)), row: Math.trunc((y + 45000) * Math.fround(1 / 225)) });
const zoomPixel = ({ x, y }: Vec3) => ({ column: Math.trunc((x - ZOOM.left) * Math.fround(19 / 1500)), row: Math.trunc((y - ZOOM.top) * Math.fround(1 / 150)) });
const combat = (entity: Entity) => entity.combat as CraftCombat;
const at = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

/** A world whose player stands at (−9000, −15000, 0), available, with 10000 energy and the record above. */
function setUp(capacity?: number): { state: WorldState; player: Entity; add: (kindBit: number, position: Vec3, overrides?: Partial<EntityInit>) => Entity } {
  const base = testState();
  const { content } = base.craftInfo;
  const craft = content.craft.map((record, kindBit) => (kindBit === 0 ? { ...record, pairs: [{ at00: 10, at04: 100 }, { at00: 1000, at04: 200 }], atA4: 2 } : record));
  const map = capacity === undefined ? base.ruleData.map : Object.freeze({ ...base.ruleData.map, informationCapacity: capacity });
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content: { ...content, craft } }, ruleData: { ...base.ruleData, map } };
  const player = addPlayerEntity(state, { position: at(-9000, -15000) });
  player.state = 'active';
  combat(player).energy = 10000;
  state.player.control = initialPlayerControl(1);
  state.player.targeting!.autoTargetDueClock = 1e9;
  const add = (kindBit: number, position: Vec3, overrides: Partial<EntityInit> = {}) => {
    const entity = state.entities.allocate(stillEntityInit(kindBit, { position, ...overrides }));
    entity.state = 'active';
    return entity;
  };
  return { state, player, add };
}

/** The map reading of a projection. */
function mapPlayer(projection: Projection): MapPlayer | null {
  if (projection.map.readiness !== 'ready') throw new Error('The map partition is not ready');
  return projection.map.player;
}

function openMap(projection: Projection): MapOpen {
  const reading = mapPlayer(projection);
  if (reading?.state !== 'open') throw new Error('The map is not open');
  return reading;
}

/** Opens the map without a tick: view 8 from flight and the icon list a frame end would build. */
function openDirectly(state: WorldState): MapOpen {
  state.player.viewMode = MAP;
  state.player.previousViewMode = FLIGHT;
  state.mapIcons = buildMapIcons(state);
  return openMap(projectWorld(state));
}

const step = (world: World, commands: readonly Command[] = []) => world.step(readTickInput({ axes: { pitch: 0, yaw: 0, roll: 0 }, commands: [...commands] }));

describe('map partition (MW-11)', () => {
  it('is ready with a null player without a player entity, and faults when the player\'s ID does not resolve', () => {
    const state = testState();
    expect(projectWorld(state).map).toEqual({ readiness: 'ready', player: null });
    state.player.entityId = 99;
    expectFault(() => projectMap(state), 'invariant-violated', 'map.player');
  });

  it('gives the open map\'s full reading after a real opening and select, and only the closed fields once closed', () => {
    const { state, player, add } = setUp();
    const wingman = add(1, at(-8900, -14900));
    const name = { type: 'candidate', declaration: { collection: 'mission', index: 2 }, candidate: 1 } as const;
    const friendly = add(2, at(-6000, -15000, 300), { name });
    const outsideZoom = add(3, at(-13000, -15000));
    const warping = add(4, at(-8000, -15000), { inWarp: true });
    const hidden = add(7, at(-7000, -16000));
    const revealed = add(8, at(-9100, -15100));
    const counted = add(14, at(-7000, -14000));
    state.player.target = revealed.id;
    Object.assign(combat(player), { shield: 210, hull: -7 });
    Object.assign(combat(wingman), { shield: 5, hull: 6, energy: 7 });
    Object.assign(combat(friendly), { shield: 8, hull: 9, energy: 10 });
    const world = constructWorld(state);
    step(world, [toggle]);
    const destinationPixel = mainPixel(friendly.position);
    // The select moves the cursor; the hover puts it back on its start.
    step(world, [select(destinationPixel.column, destinationPixel.row), hover(CURSOR.column, CURSOR.row)]);
    // The select picked the friendly's icon: its pixel's world point with the icon's z.
    const destination = { x: destinationPixel.column * 225 - 45000, y: destinationPixel.row * 225 - 45000, z: 300 };
    expect(state.player.map.destination).toEqual(destination);
    const marker = [...state.entities.walk(1 << 25)][0];

    const reading = openMap(world.projection());
    const record = (kindBit: number) => state.craftInfo.content.craft[kindBit]!;
    const disc = { radius: 1, style: 'disc' };
    const contact = (entity: Entity, cls: string, pixel = mainPixel(entity.position), coverage: unknown = disc) => ({
      entityId: entity.id, kindBit: entity.kindBit, name: entity.name, position: entity.position, pixel, inWorld: true, class: cls,
      target: entity === revealed, coverage,
    });
    const playerPixel = mainPixel(player.position);
    // Kind-table order; the wingman's pixel equals the player's, so the de-overlap moves it by (+3, +3).
    expect(reading.contacts).toEqual([
      contact(player, 'player'),
      contact(wingman, 'friendly', { column: playerPixel.column + 3, row: playerPixel.row + 3 }),
      contact(friendly, 'friendly'),
      contact(outsideZoom, 'friendly'),
      contact(revealed, 'hostile', mainPixel(revealed.position), { radius: 1, style: 'ring' }),
      contact(counted, 'friendly'),
    ]);
    const member = (entity: Entity, distance: number | null, boxed = false) => ({ entityId: entity.id, pixel: zoomPixel(entity.position), boxed, distance });
    // trunc of the 3-D distance from the player's icon: √(100² + 100²), √(3000² + 300²), √(2000² + 1000²).
    expect(reading.zoomMembers).toEqual([
      member(player, null),
      member(wingman, 141),
      member(friendly, 3014, true),
      member(revealed, 141),
      member(counted, 2236),
    ]);
    const unit = (entity: Entity): MapInformationRow[] => {
      const { shield, hull, energy } = combat(entity);
      const { at5C, at9C, at54 } = record(entity.kindBit);
      return [
        { type: 'unit-name', entityId: entity.id, kindBit: entity.kindBit, name: entity.name },
        { type: 'unit-values', entityId: entity.id, shield: { current: shield, maximum: at5C }, hull: { current: hull, maximum: at9C }, energy: { current: energy, maximum: at54 } },
      ];
    };
    expect(reading.information).toEqual({
      capacity: 25,
      rows: [...unit(player), ...unit(wingman), ...unit(friendly), { type: 'count', kindBit: 8, count: 1 }, { type: 'count', kindBit: 14, count: 1 }],
    });
    const label = (entity: Entity, pixel: unknown, playerOrWingman = false) => ({ entityId: entity.id, name: entity.name, pixel, playerOrWingman });
    expect(reading.labels).toEqual([
      label(player, playerPixel, true),
      label(wingman, { column: playerPixel.column + 3, row: playerPixel.row + 3 }, true),
      label(friendly, mainPixel(friendly.position)),
      label(outsideZoom, mainPixel(outsideZoom.position)),
    ]);
    // Cursor: √(4050² + 4650²) = 6166.4, cost 616; destination: √(2925² + 75² + 300²) = 2941.3, cost 294; both against
    // the energy the ticks' energy updates left (a little above 10000).
    const energy = combat(player).energy;
    expect(energy).toBeGreaterThan(10000);
    expect(energy).toBeLessThan(10267);
    expect(reading).toEqual({
      state: 'open',
      openedFromBase: false,
      geometry: {
        main: { x: 21, y: 45, width: 400, height: 400 },
        information: { x: 421, y: 45, width: 190, height: 200 },
        zoom: { x: 421, y: 245, width: 190, height: 200 },
        pixelsPerUnit: { x: Math.fround(1 / 225), y: Math.fround(1 / 225) },
        unitsPerPixel: { x: 225, y: 225 },
        zoomPixelsPerUnit: { x: Math.fround(19 / 1500), y: Math.fround(1 / 150) },
        world: { minX: -45000, minY: -45000, maxX: 45000, maxY: 45000 },
      },
      cursor: { pixel: CURSOR, world: CURSOR_WORLD, zoomBounds: ZOOM },
      contacts: reading.contacts,
      zoomMembers: reading.zoomMembers,
      information: reading.information,
      labels: reading.labels,
      line: { from: playerPixel, to: CURSOR },
      destination: { position: destination, pixel: mainPixel(destination), inWorld: true, cost: { cost: 294, energy, percent: 2 } },
      cursorCost: { cost: 616, energy, percent: 6 },
      markerEntityId: marker.id,
      warpRequest: { accepted: true },
    });
    // Nothing in the reading belongs to the hidden hostile or the craft in Warp.
    expect(JSON.stringify(reading)).not.toMatch(new RegExp(`"entityId":(${hidden.id}|${warping.id}),`));

    step(world, [toggle]);
    expect(mapPlayer(world.projection())).toEqual({ state: 'closed', destination, markerEntityId: marker.id, warpRequest: { accepted: true } });
    expect(JSON.stringify(world.projection().map)).not.toMatch(/contacts|coverage|zoom/);
  });

  it('keeps a craft outside the map predicate out of every map reading and the pick, while radar, target and Render State still have it (P3-07)', () => {
    const { state, player, add } = setUp();
    const hidden = add(7, at(-7000, -15000));
    const inWarp = add(2, at(-6000, -17000), { inWarp: true });
    const outside = add(3, at(50000, -15000));
    const visible = add(8, at(-9100, -15100));
    visible.mapVisible = true;
    // The hostile is beyond every friendly's 250 units, so the reveal leaves it hidden.
    const world = constructWorld(state);
    step(world, [toggle]);
    expect(hidden.mapVisible).toBe(false);
    state.player.target = hidden.id;
    const projection = world.projection();
    const reading = openMap(projection);
    const ids = (list: readonly { entityId: number }[]) => list.map(({ entityId }) => entityId);
    expect(ids(reading.contacts)).toEqual([player.id, visible.id]);
    for (const absent of [hidden, inWarp, outside]) {
      expect(ids(reading.zoomMembers)).not.toContain(absent.id);
      expect(ids(reading.labels)).not.toContain(absent.id);
      expect(reading.information.rows.some((row) => 'entityId' in row && row.entityId === absent.id)).toBe(false);
      expect(pickMapIcon(state.mapIcons, mainPixel(absent.position))).toBeNull();
    }
    // Only the revealed hostile is counted.
    expect(reading.information.rows.filter(({ type }) => type === 'count')).toEqual([{ type: 'count', kindBit: 8, count: 1 }]);
    expect(reading.contacts.some(({ target }) => target)).toBe(false);
    const { combat: combatGroup } = projection.flight;
    if (combatGroup.readiness !== 'ready' || combatGroup.player === null) throw new Error('no combat player');
    expect(combatGroup.player.target?.entityId).toBe(hidden.id);
    expect(combatGroup.player.radar.contacts.map(({ entityId }) => entityId)).toContain(hidden.id);
    expect(world.renderState().entities.map(({ id }) => id)).toEqual(expect.arrayContaining([hidden.id, inWarp.id]));
  });

  it('lists units up to the capacity, a name row possibly without its values, and stops counting there', () => {
    const { state, player, add } = setUp(3);
    const wingman = add(1, at(-8000, -15000));
    add(8, at(-7000, -15000)).mapVisible = true;
    const rows = openDirectly(state).information.rows;
    expect(rows.map((row) => [row.type, 'entityId' in row ? row.entityId : row.kindBit])).toEqual([
      ['unit-name', player.id], ['unit-values', player.id], ['unit-name', wingman.id],
    ]);
  });

  it('writes every non-zero count row in the original order once the units leave room, past the capacity', () => {
    const { state, player, add } = setUp(5);
    for (const [kindBit, x] of [[16, -8800], [8, -8600], [12, -8400], [8, -8200], [14, -8000], [19, -7800], [7, -7600]] as const) {
      add(kindBit, at(x, -15000)).mapVisible = true;
    }
    const wingman = add(1, at(-7400, -15000));
    const { capacity, rows } = openDirectly(state).information;
    expect(capacity).toBe(5);
    // Kind-table order: player, wingman, then the counted kinds; four unit rows leave n = 4 < 5.
    expect(rows).toEqual([
      expect.objectContaining({ type: 'unit-name', entityId: player.id }),
      expect.objectContaining({ type: 'unit-values', entityId: player.id }),
      expect.objectContaining({ type: 'unit-name', entityId: wingman.id }),
      expect.objectContaining({ type: 'unit-values', entityId: wingman.id }),
      { type: 'count', kindBit: 7, count: 1 },
      { type: 'count', kindBit: 8, count: 2 },
      { type: 'count', kindBit: 19, count: 1 },
      { type: 'count', kindBit: 14, count: 1 },
      { type: 'count', kindBit: 16, count: 1 },
      { type: 'count', kindBit: 12, count: 1 },
    ]);
  });

  it('gives no information rows at capacity 0, and no count rows once the units fill it', () => {
    const empty = setUp(0);
    expect(openDirectly(empty.state).information).toEqual({ capacity: 0, rows: [] });
    const full = setUp(2);
    full.add(8, at(-8000, -15000)).mapVisible = true;
    expect(openDirectly(full.state).information.rows.map(({ type }) => type)).toEqual(['unit-name', 'unit-values']);
  });

  it('boxes every zoom member within 1000 of the destination on each axis, the player and the target included', () => {
    const { state, player, add } = setUp();
    const near = add(2, at(-8001, -14001, 999));
    const far = add(3, at(-9000, -15000, 1000));
    state.player.target = near.id;
    state.player.map.destination = at(-9000, -15000, 0);
    const reading = openDirectly(state);
    expect(reading.zoomMembers.map(({ entityId, boxed }) => [entityId, boxed])).toEqual([[player.id, true], [near.id, true], [far.id, false]]);
    expect(reading.contacts.find(({ entityId }) => entityId === near.id)?.target).toBe(true);
  });

  it('reads a null percentage at zero energy and a 100 % readout for an exactly affordable cost', () => {
    const { state, player } = setUp();
    state.player.map.destination = at(-9000, -12000);
    combat(player).energy = 0;
    expect(openDirectly(state)).toMatchObject({ cursorCost: { cost: 616, energy: 0, percent: null }, destination: { cost: { cost: 300, energy: 0, percent: null } } });
    combat(player).energy = 300;
    expect(openDirectly(state)).toMatchObject({ destination: { cost: { cost: 300, energy: 300, percent: 100 } }, warpRequest: { accepted: true } });
  });

  it('starts the line and the readouts at the player\'s live position when the player has no icon, with no zoom numbers', () => {
    const { state, player, add } = setUp();
    const friendly = add(2, at(-8000, -15000));
    player.inWarp = true;
    state.player.map.destination = at(-9000, -12000);
    const reading = openDirectly(state);
    expect(reading.contacts.map(({ entityId }) => entityId)).toEqual([friendly.id]);
    expect(reading.zoomMembers).toEqual([{ entityId: friendly.id, pixel: zoomPixel(friendly.position), boxed: false, distance: null }]);
    expect(reading.line).toEqual({ from: mainPixel(player.position), to: CURSOR });
    // From (−9000, −15000): 6166.4 to the cursor and 3000 to the destination.
    expect(reading.cursorCost).toEqual({ cost: 616, energy: 10000, percent: 6 });
    expect(reading.destination?.cost).toEqual({ cost: 300, energy: 10000, percent: 3 });
  });

  it('faults on an icon whose entity no longer resolves', () => {
    const { state, add } = setUp();
    const friendly = add(2, at(-8000, -15000));
    openDirectly(state);
    state.entities.remove(friendly);
    expectFault(() => projectMap(state), 'invariant-violated', 'map.icon');
  });

  it.each<[string, (state: WorldState, player: Entity) => void, unknown]>([
    ['accepts a request with a destination in flight', () => undefined, { accepted: true }],
    ['refuses without a destination', (state) => void (state.player.map.destination = null), { accepted: false, reason: 'no-destination' }],
    ['refuses an unavailable player', (_, player) => void (player.destroyed = true), { accepted: false, reason: 'player-unavailable' }],
    ['refuses in the base', (state) => void (state.player.viewMode = BASE), { accepted: false, reason: 'wrong-context' }],
    ['refuses in a Warp', (state) => void (state.player.viewMode = WARP), { accepted: false, reason: 'wrong-context' }],
    ['refuses until the interval has passed', (state, player) => void (player.warpClock = state.clock - INTERVAL + 1), { accepted: false, reason: 'cooldown' }],
    ['passes at the interval\'s end', (state, player) => void (player.warpClock = state.clock - INTERVAL), { accepted: true }],
    ['refuses a cost above the energy', (_, player) => void (combat(player).energy = 299), { accepted: false, reason: 'insufficient-energy' }],
  ])('judges request-warp on the committed state while closed: %s', (_, change, expected) => {
    const { state, player } = setUp();
    state.clock = 1000;
    state.player.map.destination = at(-9000, -12000);
    change(state, player);
    const reading = mapPlayer(projectWorld(state));
    expect(reading).toMatchObject({ state: 'closed', warpRequest: expected });
  });

  it('refuses a Warp from a map opened in the base and says so', () => {
    const { state } = setUp();
    state.player.map.destination = at(-9000, -12000);
    openDirectly(state);
    state.player.previousViewMode = BASE;
    expect(openMap(projectWorld(state))).toMatchObject({ openedFromBase: true, warpRequest: { accepted: false, reason: 'wrong-context' } });
  });

  it('is deeply frozen, detached and a pure read: the world, its RNG and its hash stay as they were', () => {
    const { state, add } = setUp();
    add(2, at(-8000, -15000));
    const world = constructWorld(state);
    step(world, [toggle]);
    step(world, [select(170, 130)]);
    const hash = snapshotHash(world.snapshot());
    const rng = state.rngState;
    const [first, second] = [world.projection(), world.projection()];
    expect(snapshotHash(world.snapshot())).toBe(hash);
    expect(state.rngState).toEqual(rng);
    expect(deepFrozen(first)).toBe(true);
    expect(second).toEqual(first);
    const reading = openMap(first);
    expect(reading.contacts[0].position).not.toBe(state.mapIcons[0].position);
    expect(reading.destination?.position).not.toBe(state.player.map.destination);
    expect(reading.cursor.pixel).not.toBe(state.player.map.cursor);
    expect(reading.geometry.main).not.toBe(state.ruleData.map.main);
    const json = JSON.stringify(first);
    step(world, [select(10, 10)]);
    step(world, [toggle]);
    expect(JSON.stringify(first)).toBe(json);
    expect(world.projection()).not.toEqual(first);
  });
});

describe('the cockpit\'s Warp readings and Render State (MW-11)', () => {
  /** A world in a Warp: the map opened, the destination selected, then `w`. */
  function inWarp() {
    const { state, player, add } = setUp();
    const world = constructWorld(state);
    step(world, [toggle]);
    step(world, [select(178, 130)]);
    step(world, [warp]);
    return { state, player, add, world };
  }

  const combatPlayer = (projection: Projection) => {
    const { combat: group } = projection.flight;
    if (group.readiness !== 'ready' || group.player === null) throw new Error('no combat player');
    return group.player;
  };

  it('lights the indicator at +0xC8 = 0 and strictly after the interval', () => {
    const { state, player } = setUp();
    const indicator = () => combatPlayer(projectWorld(state)).warp.indicator;
    state.clock = 1000;
    expect(indicator()).toBe(true);
    player.warpClock = 1000 - INTERVAL;
    // Equal: the start's check passes, but the indicator is still dark.
    expect(indicator()).toBe(false);
    expect(mapPlayer(projectWorld(state))).toMatchObject({ warpRequest: { accepted: false, reason: 'no-destination' } });
    player.warpClock = 1000 - INTERVAL - 1;
    expect(indicator()).toBe(true);
    player.warpClock = 999;
    expect(indicator()).toBe(false);
  });

  it('gives page 6\'s values and the Render State transit in view 1 only', () => {
    const { state, world } = inWarp();
    expect(state.player.viewMode).toBe(WARP);
    const transit = state.player.warp!;
    const progress = Math.fround((transit.segments + transit.fraction) * Math.fround(1 / transit.length));
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(1);
    const projection = world.projection();
    expect(combatPlayer(projection).warp).toEqual({
      indicator: true,
      page: { angle: transit.angle, error: transit.error, completion: progress, centring: transit.centring },
    });
    const render = world.renderState();
    expect(render.viewMode).toBe(WARP);
    expect(render.warp).toEqual({ serial: 1, progress, segments: transit.segments, fraction: transit.fraction, length: transit.length, path: transit.path });
    expect(render.warp?.path).toHaveLength(15);
    expect(render.warp?.path).not.toBe(transit.path);
    expect(render.warp?.path[0]).not.toBe(transit.path[0]);
    expect(deepFrozen(render)).toBe(true);
    // In a Warp the map is closed and refuses another Warp.
    expect(mapPlayer(projection)).toMatchObject({ state: 'closed', warpRequest: { accepted: false, reason: 'wrong-context' } });
    // Outside view 1 the transit stays in the state but neither reading gives it.
    state.player.viewMode = FLIGHT;
    expect(combatPlayer(projectWorld(state)).warp.page).toBeNull();
    expect(renderWorld(state).warp).toBeNull();
  });

  it('reads the marker as a target with kind 25, its marker name, speed 0 and no shield, and lists it in Render State', () => {
    const { state, player, world } = (() => {
      const set = setUp();
      const created = constructWorld(set.state);
      step(created, [toggle]);
      step(created, [select(178, 140)]);
      return { ...set, world: created };
    })();
    const marker = [...state.entities.walk(1 << 25)][0];
    state.player.target = marker.id;
    expect(combatPlayer(world.projection()).target).toMatchObject({
      entityId: marker.id, kindBit: 25, name: { type: 'map-marker' }, position: state.player.map.destination, speed: 0, shield: null,
    });
    expect(player.id).not.toBe(marker.id);
    expect(world.renderState().entities.find(({ id }) => id === marker.id)?.presentation).toEqual({ type: 'map-marker' });
  });
});
