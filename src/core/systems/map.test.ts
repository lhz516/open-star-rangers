import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { readTickInput, type Command, type TickAxes } from '../contracts/tick-input.ts';
import { mapPixelToWorld, zoomBounds } from '../rules/map-frame.ts';
import { randValues, rngStateAfter } from '../rules/rand.test-support.ts';
import { STARTUP_ROTATIONS } from '../rules/startup-rotations.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, sliceMission, worldInput } from '../world/create-world.test-support.ts';
import type { Entity, SteeredMovementBlock } from '../world/entity-table.ts';
import { initialPlayerControl } from '../world/player-state.ts';
import { constructWorld, type World } from '../world/world.ts';
import { addPlayerEntity, entityInit, stillEntityInit, testState } from '../world/world.test-support.ts';
import { enterBaseView } from './base-interior.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { PIPELINE, registerTick } from './pipeline.ts';

// P3-09 S-03, AC-03 (docs/plan/p3/09/spec.md, 地图模式, 行为与边界) in the real World.step, against the contract of
// docs/plan/p3/02/spec.md, MW-04 (the command view, toggle-map's result table, the map context's wrong-context, the
// map-toggle request in request handling, the automatic selection reading the committed view), MW-05 (map-toggled) and
// MW-09 (a map switch has no rule effect). Expectations are written out from that contract, not from the code: the
// synthetic map geometry (main map side 400 at (21, 45)) puts the cursor's start pixel at (178, 154), and with the
// synthetic world of ±45000 one pixel is 225 units (map-rule-data.test.ts), so the start's world point is
// (178 × 225 − 45000, 154 × 225 − 45000, 0) = (−4950, −10350, 0); the zoom window, 15000 × 30000 units, spans
// x −12450…2550 and y −25350…4650 around it.

const FLIGHT = 0x0c;
const WARP = 1;
const BASE = 6;
const MAP = 8;
const START = Object.freeze({ column: 178, row: 154 });
const NEUTRAL: TickAxes = Object.freeze({ pitch: 0, yaw: 0, roll: 0 });

const toggle: Command = { type: 'toggle-map' };
const zero: Command = { type: 'speed', operation: 'zero' };
const maximum: Command = { type: 'speed', operation: 'maximum' };
const fire: Command = { type: 'fire', channel: 'primary' };
const enemy: Command = { type: 'target', operation: 'enemy' };
const energyPage: Command = { type: 'energy', operation: 'open' };
const confirm: Command = { type: 'confirm-selection' };

/**
 * A world with an available, standing player in `viewMode` (previous view 0xC), its speed assist off and the automatic
 * selection not due.
 */
function setUp(viewMode = FLIGHT): { state: WorldState; world: World; player: Entity } {
  const state = testState();
  const player = addPlayerEntity(state);
  player.state = 'active';
  state.player.control = initialPlayerControl(1);
  state.player.targeting!.autoTargetDueClock = 1e9;
  // View 6 has P3-10's base service and saved pose, as only docking enters it (CB-10, CB-11).
  if (viewMode === BASE) enterBaseView(state);
  else state.player.viewMode = viewMode;
  state.player.previousViewMode = FLIGHT;
  return { state, world: constructWorld(state), player };
}

const step = (world: World, commands: readonly Command[] = [], axes: TickAxes = NEUTRAL) =>
  world.step(readTickInput({ axes: { ...axes }, commands: [...commands] }));
const results = (events: readonly DomainEvent[]) => events.flatMap((event) => (event.type === 'command-result' ? [[event.commandIndex, event.commandType, event.outcome, event.reason]] : []));
const others = (events: readonly DomainEvent[]) => events.filter(({ type }) => type !== 'command-result');
const view = ({ player }: WorldState) => [player.viewMode, player.previousViewMode];
const toggled = (tick: number, open: boolean, viewMode: number, previousViewMode: number, commandIndex: number): DomainEvent =>
  ({ type: 'map-toggled', tick, open, viewMode, previousViewMode, commandIndex });
const block = (player: Entity) => player.movement as SteeredMovementBlock;

describe('opening and closing the map (MW-04, MW-05, MW-09)', () => {
  it('opens from flight: view 8 after the saved mode, the cursor at its start, nothing else written', () => {
    const { state, world, player } = setUp();
    const target = state.entities.allocate(entityInit(7));
    state.player.target = target.id;
    state.player.map.cursor = { column: 3, row: 4 };
    state.player.statusDisplay.redraw = false;
    state.player.leftDisplay.page = 1;
    const destination = { x: 1, y: 2, z: 3 };
    state.player.map.destination = destination;
    const events = step(world, [toggle]);
    expect(results(events)).toEqual([[0, 'toggle-map', 'accepted', null]]);
    expect(others(events)).toEqual([toggled(1, true, MAP, FLIGHT, 0)]);
    expect(view(state)).toEqual([MAP, FLIGHT]);
    expect(state.player.map.cursor).toEqual(START);
    expect(mapPixelToWorld(state.ruleData.map, state.player.map.cursor)).toEqual({ x: -4950, y: -10350, z: 0 });
    expect(zoomBounds(state.ruleData.map, mapPixelToWorld(state.ruleData.map, START))).toEqual({ left: -12450, right: 2550, top: -25350, bottom: 4650 });
    // No page, redraw, target or destination change (MW-09: the map has no rule effect).
    expect([state.player.leftDisplay.page, state.player.statusDisplay.redraw, state.player.target, state.player.map.destination]).toEqual([1, false, target.id, destination]);
    expect(state.player.savedLeftPage).toBe(0);
    expect(player.state).toBe('active');
  });

  it('closes back to the saved view, keeping the cursor, page, redraw and target', () => {
    const { state, world } = setUp();
    step(world, [toggle]);
    const target = state.entities.allocate(entityInit(7));
    state.player.target = target.id;
    state.player.map.cursor = { column: 5, row: 6 };
    state.player.statusDisplay.redraw = false;
    state.player.leftDisplay.page = 1;
    const events = step(world, [toggle]);
    expect(results(events)).toEqual([[0, 'toggle-map', 'accepted', null]]);
    expect(others(events)).toEqual([toggled(2, false, FLIGHT, MAP, 0)]);
    expect(view(state)).toEqual([FLIGHT, MAP]);
    expect([state.player.map.cursor, state.player.leftDisplay.page, state.player.statusDisplay.redraw, state.player.target]).toEqual([{ column: 5, row: 6 }, 1, false, target.id]);
  });

  it('returns to every saved flight view, the external views included', () => {
    for (const saved of [0x0d, 0x11, 0x0c]) {
      const { state, world } = setUp(saved);
      step(world, [toggle]);
      expect(view(state)).toEqual([MAP, saved]);
      step(world, [toggle]);
      expect(view(state)).toEqual([saved, MAP]);
    }
  });

  it('opens from and closes into a base (synthetic pre-state view 6), keeping the base as the previous view', () => {
    const { state, world } = setUp(BASE);
    state.player.statusDisplay.redraw = false;
    let events = step(world, [toggle]);
    expect(results(events)).toEqual([[0, 'toggle-map', 'accepted', null]]);
    expect(others(events)).toEqual([toggled(1, true, MAP, BASE, 0)]);
    expect(view(state)).toEqual([MAP, BASE]);
    expect(state.player.map.cursor).toEqual(START);
    // Leaving or entering view 6 runs 0x4cd68 in the view switch (P3-10, CB-10): the redraw flag, the page unchanged.
    // View 8 has no cockpit display step to consume it.
    expect([state.player.statusDisplay.redraw, state.player.leftDisplay.page]).toEqual([true, 0]);
    // From the base, P3-06's commands are wrong-context after the close as before the open.
    events = step(world, [toggle, zero]);
    expect(results(events)).toEqual([[0, 'toggle-map', 'accepted', null], [1, 'speed', 'ignored', 'wrong-context']]);
    expect(others(events)).toEqual([toggled(2, false, BASE, MAP, 0)]);
    expect(view(state)).toEqual([BASE, MAP]);
  });

  it('is wrong-context in the Warp context, whose keys have no m', () => {
    const { state, world } = setUp(WARP);
    const events = step(world, [toggle]);
    expect(events).toEqual([{ type: 'command-result', tick: 1, commandIndex: 0, commandType: 'toggle-map', outcome: 'ignored', reason: 'wrong-context' }]);
    expect(view(state)).toEqual([WARP, FLIGHT]);
  });
});

describe('the player gate of toggle-map (MW-04, MW-12 difference 8)', () => {
  const unavailable: [string, (state: WorldState, player: Entity) => void][] = [
    ['without a player entity', (state) => void (state.player.entityId = null)],
    ['destroyed', (_, player) => void (player.destroyed = true)],
    ['not yet active', (_, player) => void (player.state = 'presentation-ready')],
  ];

  it.each(unavailable)('does not open the map with a player %s', (_, make) => {
    const { state, world, player } = setUp();
    make(state, player);
    const events = step(world, [toggle]);
    expect(events).toEqual([{ type: 'command-result', tick: 1, commandIndex: 0, commandType: 'toggle-map', outcome: 'ignored', reason: 'player-unavailable' }]);
    expect(view(state)).toEqual([FLIGHT, FLIGHT]);
  });

  it.each(unavailable)('still closes an open map with a player %s, and then cannot reopen it', (_, make) => {
    const { state, world, player } = setUp();
    step(world, [toggle]);
    make(state, player);
    const events = step(world, [toggle, toggle]);
    expect(results(events)).toEqual([[0, 'toggle-map', 'accepted', null], [1, 'toggle-map', 'ignored', 'player-unavailable']]);
    expect(others(events)).toEqual([toggled(2, false, FLIGHT, MAP, 0)]);
    expect(view(state)).toEqual([FLIGHT, MAP]);
  });
});

describe('ordered command gates in one tick (MW-04)', () => {
  it('judges the commands after an opening in the map context, and earlier accepted requests keep their values', () => {
    const { state, world, player } = setUp();
    const events = step(world, [zero, toggle, maximum, fire, enemy, energyPage, confirm, { type: 'select-number', value: 2 }, { type: 'navigate-selection', direction: 'next' }]);
    expect(results(events)).toEqual([
      [0, 'speed', 'accepted', null],
      [1, 'toggle-map', 'accepted', null],
      [2, 'speed', 'ignored', 'wrong-context'],
      [3, 'fire', 'ignored', 'wrong-context'],
      [4, 'target', 'ignored', 'wrong-context'],
      [5, 'energy', 'ignored', 'wrong-context'],
      [6, 'confirm-selection', 'ignored', 'wrong-context'],
      [7, 'select-number', 'ignored', 'wrong-context'],
      [8, 'navigate-selection', 'ignored', 'wrong-context'],
    ]);
    expect(others(events)).toEqual([toggled(1, true, MAP, FLIGHT, 1)]);
    // The throttle accepted before the opening is applied in request handling after it, with the value it was posted with.
    expect(block(player).commandedSpeed).toBe(0);
    expect(state.player.leftDisplay.page).toBe(0);
  });

  it('judges the commands after a closing in the restored flight context', () => {
    const { state, world, player } = setUp();
    step(world, [toggle]);
    const events = step(world, [maximum, toggle, zero, energyPage]);
    expect(results(events)).toEqual([
      [0, 'speed', 'ignored', 'wrong-context'],
      [1, 'toggle-map', 'accepted', null],
      [2, 'speed', 'accepted', null],
      [3, 'energy', 'accepted', null],
    ]);
    // The energy page is written at its judgement, and the map closes in request handling.
    expect(others(events)).toEqual([
      { type: 'left-page-changed', tick: 2, page: 1, previousPage: 0, commandIndex: 3 },
      toggled(2, false, FLIGHT, MAP, 1),
    ]);
    expect(block(player).commandedSpeed).toBe(0);
    expect(view(state)).toEqual([FLIGHT, MAP]);
  });

  it('opens and closes in the same tick: two requests applied in order, the commands between in the map', () => {
    const { state, world, player } = setUp();
    state.player.map.cursor = { column: 1, row: 1 };
    const events = step(world, [toggle, zero, toggle, zero]);
    expect(results(events)).toEqual([
      [0, 'toggle-map', 'accepted', null],
      [1, 'speed', 'ignored', 'wrong-context'],
      [2, 'toggle-map', 'accepted', null],
      [3, 'speed', 'accepted', null],
    ]);
    expect(others(events)).toEqual([toggled(1, true, MAP, FLIGHT, 0), toggled(1, false, FLIGHT, MAP, 2)]);
    expect(view(state)).toEqual([FLIGHT, MAP]);
    // The opening reset the cursor.
    expect(state.player.map.cursor).toEqual(START);
    expect(block(player).commandedSpeed).toBe(0);
  });

  it('closes and reopens in the same tick from an open map, restoring the saved view as the previous one', () => {
    const { state, world } = setUp(0x0d);
    step(world, [toggle]);
    const events = step(world, [toggle, toggle, zero]);
    expect(results(events)).toEqual([[0, 'toggle-map', 'accepted', null], [1, 'toggle-map', 'accepted', null], [2, 'speed', 'ignored', 'wrong-context']]);
    expect(others(events)).toEqual([toggled(2, false, 0x0d, MAP, 0), toggled(2, true, MAP, 0x0d, 1)]);
    expect(view(state)).toEqual([MAP, 0x0d]);
  });

  it('applies a target selection posted before the opening first, and the automatic selection after it', () => {
    const { state, world, player } = setUp();
    const near = state.entities.allocate(entityInit(7, { position: { x: 0, y: 0, z: 100 } }));
    near.state = 'active';
    let events = step(world, [enemy, toggle]);
    expect(results(events)).toEqual([[0, 'target', 'accepted', null], [1, 'toggle-map', 'accepted', null]]);
    expect(others(events)).toEqual([
      { type: 'target-changed', tick: 1, playerEntityId: player.id, previousTarget: null, target: near.id, targetKindBit: 7, mode: 'enemy', origin: 'command', commandIndex: 0 },
      toggled(1, true, MAP, FLIGHT, 1),
    ]);

    // The automatic selection (due now, no target) posts after the command batch, so after the map's request.
    const second = setUp();
    const other = second.state.entities.allocate(entityInit(7, { position: { x: 0, y: 0, z: 100 } }));
    other.state = 'active';
    second.state.player.targeting!.autoTargetDueClock = 0;
    events = step(second.world, [toggle]);
    expect(others(events)).toEqual([
      toggled(1, true, MAP, FLIGHT, 0),
      { type: 'target-changed', tick: 1, playerEntityId: second.player.id, previousTarget: null, target: other.id, targetKindBit: 7, mode: 'enemy', origin: 'automatic', commandIndex: null },
    ]);
  });

  it('runs the automatic selection by the committed view, not the command view', () => {
    // From the base (view 6, where the automatic selection does not run), an opening in the batch does not let it run
    // in the same tick; it runs in the next, with view 8 committed.
    const { state, world, player } = setUp(BASE);
    const near = state.entities.allocate(entityInit(7, { position: { x: 0, y: 0, z: 100 } }));
    near.state = 'active';
    state.player.targeting!.autoTargetDueClock = 0;
    let events = step(world, [toggle]);
    expect(others(events)).toEqual([toggled(1, true, MAP, BASE, 0)]);
    expect(state.player.target).toBeNull();
    state.player.targeting!.autoTargetDueClock = 0;
    events = step(world);
    expect(others(events)).toEqual([
      { type: 'target-changed', tick: 2, playerEntityId: player.id, previousTarget: null, target: near.id, targetKindBit: 7, mode: 'enemy', origin: 'automatic', commandIndex: null },
    ]);
  });

  it('matches by Enter after a same-tick closing, and leaves Enter, digits and menus without effect in the map', () => {
    const { state, world, player } = setUp();
    const target = state.entities.allocate(entityInit(7, { position: { x: 0, y: 0, z: 100 } }));
    target.state = 'active';
    block(target).speed = 30;
    state.player.target = target.id;
    step(world, [toggle]);
    let events = step(world, [confirm, { type: 'communications', operation: 'open' }, { type: 'launch' }, { type: 'map-point', operation: 'hover', right: 0.5, down: 0.5 }, { type: 'request-warp' }]);
    expect(results(events)).toEqual([
      [0, 'confirm-selection', 'ignored', 'wrong-context'],
      // P3-10's menu and launch keys never reach the map (CB-07); the Warp request has no destination (warp.test.ts).
      [1, 'communications', 'ignored', 'wrong-context'],
      [2, 'launch', 'ignored', 'wrong-context'],
      [3, 'map-point', 'accepted', null],
      [4, 'request-warp', 'ignored', 'no-destination'],
    ]);
    expect(block(player).commandedSpeed).toBe(0);
    events = step(world, [toggle, confirm]);
    expect(results(events)).toEqual([[0, 'toggle-map', 'accepted', null], [1, 'confirm-selection', 'accepted', null]]);
    expect(others(events)).toEqual([toggled(3, false, FLIGHT, MAP, 0), { type: 'speed-matched', tick: 3, targetEntityId: target.id, origin: 'command', commandIndex: 1 }]);
    expect(block(player).commandedSpeed).toBe(30);
  });

  it('gives player-unavailable before wrong-context to the selection commands in the map', () => {
    const { state, world } = setUp(MAP);
    state.player.entityId = null;
    expect(results(step(world, [confirm, { type: 'select-number', value: 1 }, { type: 'navigate-selection', direction: 'previous' }]))).toEqual([
      [0, 'confirm-selection', 'ignored', 'player-unavailable'],
      [1, 'select-number', 'ignored', 'player-unavailable'],
      [2, 'navigate-selection', 'ignored', 'player-unavailable'],
    ]);
  });
});

describe('axes and the map (MW-04; P3-06 spec 技术决定 10)', () => {
  const held: TickAxes = { pitch: 0, yaw: 1, roll: 0 };

  it('takes held axes as 0 once the batch ends in the map, switching a held turn off in the opening tick', () => {
    const { state, world, player } = setUp();
    step(world, [], held);
    expect(block(player).steering.yaw.enabled).toBe(true);
    step(world, [toggle], held);
    expect(state.player.control!.lastAxes).toEqual({ pitch: 0, yaw: 0, roll: 0 });
    expect(block(player).steering.yaw.enabled).toBe(false);
    // Neutral input after leaving the map restores nothing.
    step(world, [toggle]);
    expect(block(player).steering.yaw.enabled).toBe(false);
  });

  it('applies the axes when the batch ends in flight: open and close in one tick, or a closing', () => {
    const { state, world, player } = setUp();
    step(world, [toggle, toggle], held);
    expect([state.player.control!.lastAxes.yaw, block(player).steering.yaw.enabled]).toEqual([128, true]);
    step(world, [toggle], NEUTRAL);
    expect(block(player).steering.yaw.enabled).toBe(false);
    step(world, [toggle], held);
    expect([view(state), block(player).steering.yaw.enabled]).toEqual([[FLIGHT, MAP], true]);
  });
});

describe('the map is not a pause (地图模式: 不是暂停)', () => {
  /**
   * A created slice world stepped until its player is available, with the automatic selection as created; its record 2
   * group template spawns at 2 s instead of 300 s, while the map is open.
   */
  function sliceWorld(): { state: WorldState; world: World } {
    const mission = sliceMission();
    mission.declarations[2].spawnTime = 2;
    const state = initialWorldState(asCreateInput(worldInput({ mission })));
    const world = constructWorld(state);
    for (let tick = 0; tick < 3; tick++) step(world);
    return { state, world };
  }

  const progress = (state: WorldState) => ({
    tick: state.tick,
    clock: state.clock,
    rng: state.rngState,
    spawn: structuredClone(state.spawn),
    entities: [...state.entities.walk(0x3ffffff)].map(({ id, state: objectState, position, combat }) => ({
      id, objectState, position: { ...position }, energy: combat.type === 'craft' ? combat.energy : null,
    })),
  });

  it('advances the clock, movement, energy, AI and spawning exactly as without the map', () => {
    const open = sliceWorld();
    const closed = sliceWorld();
    expect(step(open.world, [toggle]).some(({ type }) => type === 'map-toggled')).toBe(true);
    step(closed.world);
    const before = progress(open.state);
    for (let tick = 0; tick < 200; tick++) {
      step(open.world);
      step(closed.world);
    }
    expect(view(open.state)).toEqual([MAP, FLIGHT]);
    const after = progress(open.state);
    expect(after).toEqual(progress(closed.state));
    // Something did happen while the map was open: the clock ran, energy updated and the spawn state moved on.
    expect(after.clock).toBeGreaterThan(before.clock);
    expect(after.entities.map(({ energy }) => energy)).not.toEqual(before.entities.map(({ energy }) => energy));
    expect(after.entities.map(({ position }) => position)).not.toEqual(before.entities.map(({ position }) => position));
    expect(after.spawn).not.toEqual(before.spawn);
    expect(after.entities.length).toBeGreaterThan(before.entities.length);
  });

  it('keeps the map and every accepted assist state across neutral (cleared) input', () => {
    const { state, world } = setUp();
    step(world, [{ type: 'speed', operation: 'toggle-auto-match' }, toggle]);
    const kept = structuredClone({ view: view(state), cursor: state.player.map.cursor, assist: state.player.control!.speedAssist.enabled, destination: state.player.map.destination });
    for (let tick = 0; tick < 3; tick++) step(world);
    expect({ view: view(state), cursor: state.player.map.cursor, assist: state.player.control!.speedAssist.enabled, destination: state.player.map.destination }).toEqual(kept);
    expect(kept.view).toEqual([MAP, FLIGHT]);
    expect(kept.assist).toBe(true);
  });
});

// P3-09 S-04, AC-04 (spec 光标、跃迁目标与标记) against docs/plan/p3/02/spec.md, MW-02 (cursor, destination, icon list),
// MW-03 (the marker), MW-04 (map-point's gate and quantisation, the command view's destination), MW-05
// (warp-destination-set) and MW-07 (the frame end's map step and the pick). With the synthetic map (side 400) pixel
// (c, r) is the world point (225c − 45000, 225r − 45000, +0), and a craft at that point plus 100 projects onto it.

const SIDE = 400;
const pointAt = (operation: 'hover' | 'select', right: number, down: number): Command => ({ type: 'map-point', operation, right, down });
/** The command at the centre of pixel (column, row). */
const pixelCommand = (operation: 'hover' | 'select', column: number, row: number): Command => pointAt(operation, (column + 0.5) / SIDE, (row + 0.5) / SIDE);
const select = (column: number, row: number) => pixelCommand('select', column, row);
const hover = (column: number, row: number) => pixelCommand('hover', column, row);
const worldOf = (column: number, row: number) => ({ x: 225 * column - 45000, y: 225 * row - 45000, z: 0 });
const craftAt = (column: number, row: number, z: number) => ({ x: 225 * column - 45000 + 100, y: 225 * row - 45000 + 100, z });
const markers = (state: WorldState) => [...state.entities.walk(1 << 25)];
const destinationSet = (tick: number, player: Entity, column: number, row: number, destination: object, icon: object | null, marker: object, commandIndex = 0): DomainEvent =>
  ({ type: 'warp-destination-set', tick, playerEntityId: player.id, destination, pixel: { column, row }, icon, marker, commandIndex } as DomainEvent);

describe('map-point: gate and quantisation (MW-04)', () => {
  it('quantises to ⌊fraction × s⌋, a pixel\'s centre and edge onto that pixel, 1 onto the last', () => {
    const cases: [number, number, number, number][] = [
      [0, 0, 0, 0], [1, 1, 399, 399], [178 / SIDE, 154 / SIDE, 178, 154], [(178.5) / SIDE, (154.5) / SIDE, 178, 154],
      [Math.fround(178 / SIDE) - 1e-9, 0.999999, 177, 399], [0.0025, 0.0024999, 1, 0],
    ];
    for (const [right, down, column, row] of cases) {
      const { state, world } = setUp(MAP);
      const events = step(world, [pointAt('hover', right, down)]);
      expect(results(events)).toEqual([[0, 'map-point', 'accepted', null]]);
      expect(state.player.map.cursor).toEqual({ column, row });
    }
  });

  it('lands P3-05\'s start position, the start pixel\'s centre, on the cursor the opening set', () => {
    // mapStartPosition (render/map/map-input-geometry.ts) for the main map 21…421 × 45…445: column ⌊399 / 2⌋ = 199 and
    // row 199 from the screen origin, normalised at the centre: ((199.5 − 21) / 400, (199.5 − 45) / 400).
    const { state, world } = setUp();
    step(world, [toggle]);
    step(world, [pointAt('hover', (199.5 - 21) / SIDE, (199.5 - 45) / SIDE)]);
    expect(state.player.map.cursor).toEqual(START);
  });

  it('is wrong-context outside the map and player-unavailable without an available player, changing nothing', () => {
    for (const viewMode of [FLIGHT, WARP, BASE]) {
      const { state, world } = setUp(viewMode);
      const before = JSON.stringify(state.player.map);
      const events = step(world, [hover(1, 2), select(3, 4)]);
      expect(results(events)).toEqual([[0, 'map-point', 'ignored', 'wrong-context'], [1, 'map-point', 'ignored', 'wrong-context']]);
      expect(JSON.stringify(state.player.map)).toBe(before);
      expect(markers(state)).toEqual([]);
    }
    const { state, world, player } = setUp(MAP);
    player.destroyed = true;
    const events = step(world, [select(3, 4)]);
    expect(events).toEqual([{ type: 'command-result', tick: 1, commandIndex: 0, commandType: 'map-point', outcome: 'ignored', reason: 'player-unavailable' }]);
    expect(state.player.map.destination).toBeNull();
  });
});

describe('hover (MW-04)', () => {
  it('moves only the cursor: no event, no draw, no destination or marker', () => {
    const { state, world } = setUp(MAP);
    const rng = state.rngState;
    const events = step(world, [hover(0, 399)]);
    expect(others(events)).toEqual([]);
    expect(state.player.map).toEqual({ cursor: { column: 0, row: 399 }, destination: null });
    expect(mapPixelToWorld(state.ruleData.map, state.player.map.cursor)).toEqual({ x: -45000, y: 44775, z: 0 });
    expect(state.rngState).toEqual(rng);
    expect(markers(state)).toEqual([]);
  });

  it('never changes the committed destination or the marker', () => {
    const { state, world } = setUp(MAP);
    step(world, [select(10, 20)]);
    const [marker] = markers(state);
    step(world, [hover(300, 300)]);
    expect(state.player.map).toEqual({ cursor: { column: 300, row: 300 }, destination: worldOf(10, 20) });
    expect([marker.position, marker.placementSerial]).toEqual([worldOf(10, 20), 0]);
  });
});

describe('select: destination and marker (MW-03, MW-04, MW-05)', () => {
  it('creates the marker at the first select with one world draw for its start-up rotation, and emits no instantiation', () => {
    const { state, world, player } = setUp(MAP);
    const rng = state.rngState;
    const [draw] = randValues(rng, 1);
    const events = step(world, [select(10, 20)]);
    const [marker] = markers(state);
    expect(results(events)).toEqual([[0, 'map-point', 'accepted', null]]);
    expect(others(events)).toEqual([destinationSet(1, player, 10, 20, worldOf(10, 20), null, { type: 'created', entityId: marker.id })]);
    expect(state.player.map).toEqual({ cursor: { column: 10, row: 20 }, destination: worldOf(10, 20) });
    expect(Object.is(state.player.map.destination!.z, 0)).toBe(true);
    expect(marker).toMatchObject({
      kindBit: 25, position: worldOf(10, 20), orientation: STARTUP_ROTATIONS[draw % 64], placementSerial: 0, state: 'presentation-ready', activity: 'active',
      name: { type: 'map-marker' }, presentation: { type: 'map-marker' }, combat: { type: 'marker' }, movement: { mode: 'marker', speed: 0 }, mapVisible: false,
    });
    expect(state.rngState).toEqual(rngStateAfter(rng, 1));
  });

  it('moves the marker at every later select, at an unchanged point too, without a draw', () => {
    const { state, world, player } = setUp(MAP);
    step(world, [select(10, 20)]);
    const [marker] = markers(state);
    const rng = state.rngState;
    let events = step(world, [select(0, 0)]);
    expect(others(events)).toEqual([destinationSet(2, player, 0, 0, worldOf(0, 0), null, { type: 'moved', entityId: marker.id })]);
    events = step(world, [select(0, 0), select(399, 399)]);
    expect(others(events)).toEqual([
      destinationSet(3, player, 0, 0, worldOf(0, 0), null, { type: 'moved', entityId: marker.id }, 0),
      destinationSet(3, player, 399, 399, { x: 44775, y: 44775, z: 0 }, null, { type: 'moved', entityId: marker.id }, 1),
    ]);
    expect([marker.position, marker.placementSerial, markers(state).length]).toEqual([{ x: 44775, y: 44775, z: 0 }, 3, 1]);
    expect(state.rngState).toEqual(rng);
  });

  it('keeps the destination and marker across closing and reopening the map', () => {
    const { state, world } = setUp(MAP);
    step(world, [select(10, 20)]);
    step(world, [toggle]);
    step(world, [toggle]);
    expect(state.player.map).toEqual({ cursor: START, destination: worldOf(10, 20) });
    expect(markers(state).map(({ position }) => position)).toEqual([worldOf(10, 20)]);
  });

  it('reports a missing marker without creating one: the destination still changes', () => {
    const { state, world, player } = setUp(MAP);
    state.player.map.destination = worldOf(1, 1);
    const rng = state.rngState;
    const events = step(world, [select(10, 20)]);
    expect(others(events)).toEqual([destinationSet(1, player, 10, 20, worldOf(10, 20), null, { type: 'missing' })]);
    expect(markers(state)).toEqual([]);
    expect(state.rngState).toEqual(rng);
  });

  it('faults rather than create a second marker', () => {
    const { state, world } = setUp(MAP);
    state.entities.allocate(entityInit(25));
    expect(() => step(world, [select(10, 20)])).toThrow(expect.objectContaining({ code: 'invariant-violated', site: 'map.marker' }));
  });

  it('lets the marker go active through its own update and keeps it unmoved, unparked and off the map list', () => {
    const { state, world } = setUp(MAP);
    // Far from the player, outside any active area around it.
    step(world, [select(0, 0)]);
    const [marker] = markers(state);
    step(world);
    expect([marker.state, marker.activity]).toEqual(['active', 'active']);
    for (let tick = 0; tick < 5; tick++) step(world);
    expect([marker.state, marker.activity, marker.position, marker.placementSerial]).toEqual(['active', 'active', worldOf(0, 0), 0]);
    expect(state.mapIcons.some(({ entityId }) => entityId === marker.id)).toBe(false);
  });
});

describe('the icon list and the pick (MW-02, MW-07)', () => {
  /** A map world whose friendly kind-3 craft stands at pixel (10, 20) with z 777.25. */
  function withCraft() {
    const setup = setUp(MAP);
    const craft = setup.state.entities.allocate(stillEntityInit(3, { position: craftAt(10, 20, 777.25) }));
    craft.state = 'active';
    return { ...setup, craft };
  }

  it('builds the list at the frame end of a tick in the map and clears it in any other view', () => {
    const { state, world, player, craft } = withCraft();
    step(world);
    expect(state.mapIcons.map(({ entityId, pixel, inWorld }) => [entityId, pixel, inWorld])).toEqual([
      [player.id, { column: 200, row: 200 }, true],
      [craft.id, { column: 10, row: 20 }, true],
    ]);
    step(world, [toggle]);
    expect(state.mapIcons).toEqual([]);
  });

  it('takes the z of the icon within 3 pixels from the previous tick\'s list, and +0 without one', () => {
    const { state, world, player, craft } = withCraft();
    step(world);
    let events = step(world, [select(13, 17)]);
    const [marker] = markers(state);
    expect(others(events)).toEqual([destinationSet(2, player, 13, 17, { ...worldOf(13, 17), z: 777.25 }, { entityId: craft.id, kindBit: 3 }, { type: 'created', entityId: marker.id })]);
    events = step(world, [select(14, 20)]);
    expect(others(events)).toEqual([destinationSet(3, player, 14, 20, worldOf(14, 20), null, { type: 'moved', entityId: marker.id })]);
    expect(Object.is(state.player.map.destination!.z, 0)).toBe(true);
    expect(marker.position).toEqual(worldOf(14, 20));
  });

  it('never picks the player\'s own icon', () => {
    const { state, world, player } = setUp(MAP);
    step(world);
    step(world, [select(200, 200)]);
    expect(state.mapIcons.map(({ entityId }) => entityId)).toEqual([player.id]);
    expect(state.player.map.destination).toEqual(worldOf(200, 200));
  });

  it('reads the list of the previous frame end, not the entities now', () => {
    const { state, world, player, craft } = withCraft();
    step(world);
    craft.position = craftAt(100, 100, -5);
    let events = step(world, [select(10, 20)]);
    expect(others(events)).toMatchObject([{ destination: { ...worldOf(10, 20), z: 777.25 }, icon: { entityId: craft.id } }]);
    events = step(world, [select(10, 20)]);
    expect(others(events)).toMatchObject([{ destination: worldOf(10, 20), icon: null }]);
    events = step(world, [select(100, 100)]);
    expect(others(events)).toEqual([destinationSet(4, player, 100, 100, { ...worldOf(100, 100), z: -5 }, { entityId: craft.id, kindBit: 3 }, { type: 'moved', entityId: markers(state)[0].id })]);
  });

  it('has no list in the tick that opens the map (MW-12 difference 1)', () => {
    const { state, world, craft } = withCraft();
    state.player.viewMode = FLIGHT;
    step(world);
    expect(state.mapIcons).toEqual([]);
    const events = step(world, [toggle, select(10, 20)]);
    expect(results(events)).toEqual([[0, 'toggle-map', 'accepted', null], [1, 'map-point', 'accepted', null]]);
    expect(others(events)).toMatchObject([{ type: 'map-toggled' }, { icon: null, destination: worldOf(10, 20) }]);
    expect(state.mapIcons.map(({ entityId }) => entityId)).toContain(craft.id);
  });

  it('picks by the de-overlapped pixels: of two coincident icons after the player\'s, the first moves', () => {
    const { state, world, player, craft } = withCraft();
    const second = state.entities.allocate(stillEntityInit(4, { position: craftAt(10, 20, 3.5) }));
    second.state = 'active';
    step(world);
    // Entry 0 (the player) never moves; entry 1 meets entry 2 and takes its first step, entry 2 then stays.
    expect(state.mapIcons.map(({ entityId, pixel }) => [entityId, pixel])).toEqual([
      [player.id, { column: 200, row: 200 }], [craft.id, { column: 13, row: 23 }], [second.id, { column: 10, row: 20 }],
    ]);
    let events = step(world, [select(14, 24)]);
    expect(others(events)).toMatchObject([{ icon: { entityId: craft.id, kindBit: 3 }, destination: { z: 777.25 } }]);
    events = step(world, [select(11, 21)]);
    expect(others(events)).toMatchObject([{ icon: { entityId: second.id, kindBit: 4 }, destination: { z: 3.5 } }]);
  });
});

describe('select in ordered commands (MW-04, MW-12 difference 1)', () => {
  it('is wrong-context after a same-tick closing, and the selects before it apply before the closing', () => {
    const { state, world, player } = setUp(MAP);
    const events = step(world, [select(1, 2), toggle, select(3, 4)]);
    expect(results(events)).toEqual([[0, 'map-point', 'accepted', null], [1, 'toggle-map', 'accepted', null], [2, 'map-point', 'ignored', 'wrong-context']]);
    expect(others(events)).toMatchObject([{ type: 'warp-destination-set', playerEntityId: player.id, pixel: { column: 1, row: 2 } }, { type: 'map-toggled', open: false }]);
    expect(state.player.map.destination).toEqual(worldOf(1, 2));
  });

  it('sets the command view\'s destination at an accepted select, for the commands after it', () => {
    const { state } = setUp(MAP);
    const context = registerTick(state, readTickInput({ axes: { ...NEUTRAL }, commands: [select(10, 20), hover(5, 5), select(7, 8)] }));
    expect(context.commandView.destination).toBeNull();
    for (const { id, run } of PIPELINE) {
      run?.(context);
      if (id === 'object-update') break;
    }
    expect(context.commandView.destination).toEqual(worldOf(7, 8));
    // Committed only in request handling.
    expect(state.player.map.destination).toBeNull();
  });
});
