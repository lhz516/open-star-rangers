import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { readTickInput, type Command, type TickAxes } from '../contracts/tick-input.ts';
import { mapPixelToWorld, zoomBounds } from '../rules/map-frame.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, sliceMission, worldInput } from '../world/create-world.test-support.ts';
import type { Entity, SteeredMovementBlock } from '../world/entity-table.ts';
import { initialPlayerControl } from '../world/player-state.ts';
import { constructWorld, type World } from '../world/world.ts';
import { addPlayerEntity, entityInit, testState } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';

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
  state.player.viewMode = viewMode;
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
    let events = step(world, [toggle]);
    expect(results(events)).toEqual([[0, 'toggle-map', 'accepted', null]]);
    expect(others(events)).toEqual([toggled(1, true, MAP, BASE, 0)]);
    expect(view(state)).toEqual([MAP, BASE]);
    expect(state.player.map.cursor).toEqual(START);
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
      // P3-10's commands and the cursor and Warp commands of P3-09/14 and /17 are not implemented yet.
      [1, 'communications', 'rejected', 'not-implemented'],
      [2, 'launch', 'rejected', 'not-implemented'],
      [3, 'map-point', 'rejected', 'not-implemented'],
      [4, 'request-warp', 'rejected', 'not-implemented'],
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
