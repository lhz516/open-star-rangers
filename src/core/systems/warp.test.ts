import { describe, expect, it } from 'vitest';
import type { DomainEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput, type Command, type TickAxes } from '../contracts/tick-input.ts';
import { mapPixelToWorld } from '../rules/map-frame.ts';
import { randValues, rngStateAfter } from '../rules/rand.test-support.ts';
import type { CraftCombat, Entity, SteeredMovementBlock } from '../world/entity-table.ts';
import { initialPlayerControl } from '../world/player-state.ts';
import { constructWorld } from '../world/world.ts';
import { addPlayerEntity, entityInit, expectFault, stateText, testState } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { committedView, PIPELINE, registerTick, type TickContext } from './pipeline.ts';
import { judgeWarpRequest } from './warp.ts';

// P3-09 S-08, AC-08 and AC-07's start part (docs/plan/p3/09/spec.md, Warp 开始) in the real pipeline, against the
// contract of docs/plan/p3/02/spec.md, MW-04 (the gate table, the command view, the warp-start request and its writes),
// MW-05 (warp-started), MW-09 (page 6 and the saved page; no status-display redraw) and MW-12 (20 world draws). The
// expectations are worked out by hand from that contract and docs/original/formats/executable.md (Warp cost and Warp
// start, transit length, the tunnel path of P3-09/28), not from the code.
//
// The player's record here (a synthetic one) has the pairs (10, 100), (1000, 200), the interval +0xA4 = 2 s (128 clock
// units), +0xA8 = 14 and +0xB8 = 64. From (1000, 2000, 300) to the destination (31000, 42000, 300) the distance is
// exactly 50000: q = 50, so the second pair, and c = 200 × 50000 ÷ 1000 = 10000. With S = 15000 the transit ratio is
// 50000 ÷ (15000 × 8 × 1.414) = 50000 ÷ 169680 ≈ 0.295 ≤ 0.5, so f = 0.5 and L = 0.5 × 14 = 7.

const FLIGHT = 0x0c;
const WARP = 1;
const BASE = 6;
const MAP = 8;
const NEUTRAL: TickAxes = Object.freeze({ pitch: 0, yaw: 0, roll: 0 });
const POSITION: Vec3 = Object.freeze({ x: 1000, y: 2000, z: 300 });
const DESTINATION: Vec3 = Object.freeze({ x: 31000, y: 42000, z: 300 });
const COST = 10000;
const INTERVAL = 128;

const warp: Command = { type: 'request-warp' };
const toggle: Command = { type: 'toggle-map' };

interface Options {
  readonly viewMode?: number;
  readonly previousViewMode?: number;
  readonly energy?: number;
  readonly destination?: Vec3 | null;
  readonly warpClock?: number;
}

/** A world with an available player at POSITION in `viewMode`, its record as above, the automatic selection not due. */
function setUp({ viewMode = FLIGHT, previousViewMode = FLIGHT, energy = COST, destination = DESTINATION, warpClock = 0 }: Options = {}): { state: WorldState; player: Entity } {
  const base = testState();
  const { content } = base.craftInfo;
  const craft = content.craft.map((record, kindBit) => (kindBit === 0 ? { ...record, pairs: [{ at00: 10, at04: 100 }, { at00: 1000, at04: 200 }], atA4: 2, atA8: 14, atB8: 64 } : record));
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content: { ...content, craft } } };
  const player = addPlayerEntity(state, { position: POSITION, warpClock });
  player.state = 'active';
  combat(player).energy = energy;
  state.player.control = initialPlayerControl(1);
  state.player.targeting!.autoTargetDueClock = 1e9;
  state.player.viewMode = viewMode;
  state.player.previousViewMode = previousViewMode;
  state.player.map.destination = destination;
  return { state, player };
}

const combat = (player: Entity) => player.combat as CraftCombat;
const block = (player: Entity) => player.movement as SteeredMovementBlock;
/** The clock of the next tick. */
const nextClock = (state: WorldState) => state.clock + state.config.clockUnitsPerTick;
const input = (commands: readonly Command[], axes: TickAxes = NEUTRAL) => readTickInput({ axes: { ...axes }, commands: [...commands] });
const step = (state: WorldState, commands: readonly Command[] = []) => constructWorld(state).step(input(commands));
const results = (events: readonly DomainEvent[]) => events.flatMap((event) => (event.type === 'command-result' ? [[event.commandIndex, event.commandType, event.outcome, event.reason]] : []));
const others = (events: readonly DomainEvent[]) => events.filter(({ type }) => type !== 'command-result');

/** One tick's real stages up to request handling, so that movement does not blur what the start wrote. */
function stepRequests(state: WorldState, commands: readonly Command[], hooks: Readonly<Record<string, (context: TickContext) => void>> = {}): readonly DomainEvent[] {
  const context = registerTick(state, input(commands));
  for (const stage of PIPELINE) {
    if (stage.id === 'movement') break;
    hooks[stage.id]?.(context);
    stage.run?.(context);
  }
  return context.events;
}

/** The path set-up's points from the world's next 20 rand values, by 0x51618's rule (P3-09/28). */
function expectedPath(values: readonly number[]): Vec3[] {
  const points: Vec3[] = [{ x: 0, y: 0, z: 10000 }];
  const lateral = (previous: number, r: number) => Math.fround((((r % 20000) * 1e-4) - 1) * 600 + previous - 300);
  for (let index = 1; index < 15; index++) {
    const z = index === 1 ? 10000 : 10000 + 2000 * (index - 1);
    const previous = points[index - 1];
    const draw = (index - 5) * 2;
    points.push(index < 5 ? { x: 0, y: 0, z } : { x: lateral(previous.x, values[draw]), y: lateral(previous.y, values[draw + 1]), z });
  }
  return points;
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('the gate table of request-warp (MW-04)', () => {
  type Change = (state: WorldState, player: Entity) => void;
  const none: Change = () => {};
  it.each<[string, Options, Change, string]>([
    ['no player entity', {}, (state) => void (state.player.entityId = null), 'player-unavailable'],
    ['a destroyed player', {}, (_, player) => void (player.destroyed = true), 'player-unavailable'],
    ['a player not yet active', {}, (_, player) => void (player.state = 'presentation-ready'), 'player-unavailable'],
    ['an unavailable player before the Warp context', { viewMode: WARP }, (_, player) => void (player.destroyed = true), 'player-unavailable'],
    ['the Warp context', { viewMode: WARP }, none, 'wrong-context'],
    ['another Warp-context view (3)', { viewMode: 3 }, none, 'wrong-context'],
    ['the base', { viewMode: BASE }, none, 'wrong-context'],
    ['a map opened from the base', { viewMode: MAP, previousViewMode: BASE }, none, 'wrong-context'],
    ['the base before no destination', { viewMode: BASE, destination: null }, none, 'wrong-context'],
    ['no destination in flight', { destination: null }, none, 'no-destination'],
    ['no destination in the map', { viewMode: MAP, destination: null }, none, 'no-destination'],
    ['no destination before the interval and the energy', { destination: null, energy: 0 }, (state, player) => void (player.warpClock = nextClock(state)), 'no-destination'],
    ['the interval one unit short', {}, (state, player) => void (player.warpClock = nextClock(state) - INTERVAL + 1), 'cooldown'],
    ['the interval before the energy', { energy: COST - 1 }, (state, player) => void (player.warpClock = nextClock(state)), 'cooldown'],
    ['the cost one above the energy', { energy: COST - 1 }, none, 'insufficient-energy'],
    ['any cost against a negative energy', { destination: POSITION, energy: -1 }, none, 'insufficient-energy'],
  ])('refuses with %s as ignored, changing nothing and drawing nothing', (_, options, change, reason) => {
    const refused = setUp(options);
    const idle = setUp(options);
    change(refused.state, refused.player);
    change(idle.state, idle.player);
    const events = step(refused.state, [warp]);
    step(idle.state);
    expect(events).toEqual([{ type: 'command-result', tick: 1, commandIndex: 0, commandType: 'request-warp', outcome: 'ignored', reason }]);
    expect(stateText(refused.state)).toBe(stateText(idle.state));
  });

  it.each<[string, Options, Change]>([
    ['the cost exactly the energy', {}, none],
    ['the interval exactly passed (equality passes)', {}, (state, player) => void (player.warpClock = nextClock(state) - INTERVAL)],
    ['a zero warpClock, whatever the clock', {}, (_, player) => void (player.warpClock = 0)],
    ['a zero distance at zero energy (c = 0)', { destination: POSITION, energy: 0 }, none],
    ['the map opened from flight', { viewMode: MAP }, none],
    ['a docked player', {}, (_, player) => void (player.activity = 'docked')],
  ])('accepts with %s', (_, options, change) => {
    const { state, player } = setUp(options);
    change(state, player);
    expect(results(step(state, [warp]))).toEqual([[0, 'request-warp', 'accepted', null]]);
    expect(state.player.viewMode).toBe(WARP);
  });

  it('judges in the committed view for a reader without changing anything', () => {
    const { state } = setUp();
    const before = stateText(state);
    expect(judgeWarpRequest(state, committedView(state), nextClock(state))).toEqual({ distance: 50000, cost: COST, energy: COST, affordable: true });
    expect(judgeWarpRequest(state, { ...committedView(state), destination: null }, nextClock(state))).toBe('no-destination');
    expect(stateText(state)).toBe(before);
  });
});

describe('the Warp start (MW-04 warp-start, MW-05, MW-09)', () => {
  it('commits every write of the start in request handling, and no energy, warpClock or redraw', () => {
    const { state, player } = setUp();
    const target = state.entities.allocate(entityInit(7));
    state.player.target = target.id;
    state.player.leftDisplay.page = 1;
    state.player.statusDisplay.redraw = false;
    player.warpClock = 5;
    const placement = player.placementSerial;
    const rng = state.rngState;
    const draws = randValues(rng, 20);
    const clock = nextClock(state);
    player.warpClock = clock - INTERVAL;
    stepRequests(state, [warp]);

    // 0x2be00: inWarp, the target cleared, mode 3; the origin and L in the transit.
    expect(player.inWarp).toBe(true);
    expect(state.player.target).toBeNull();
    expect(block(player).mode).toBe('warp');
    // The view write and 0x3f158(1, old): the page saved and page 6 shown; no redraw.
    expect([state.player.viewMode, state.player.previousViewMode]).toEqual([WARP, FLIGHT]);
    expect([state.player.leftDisplay.page, state.player.savedLeftPage, state.player.statusDisplay.redraw]).toEqual([6, 1, false]);
    // 0x50188: 20 world draws, the constant start pose in the path's frame, a new placement, speed 0, commanded +0xB8.
    expect(state.rngState).toEqual(rngStateAfter(rng, 20));
    expect(player.position).toEqual({ x: 0, y: 0, z: 10000 });
    expect(player.orientation).toEqual(IDENTITY);
    expect(player.placementSerial).toBe(placement + 1);
    expect([block(player).atCommandedSpeed, block(player).speed, block(player).commandedSpeed]).toEqual([false, 0, 64]);
    expect(state.player.warp).toEqual({
      serial: 1, origin: POSITION, length: 7, segments: 1, fraction: 0, error: 0, angle: 0, centring: 0,
      frame: { position: { x: 0, y: 0, z: 10000 }, orientation: IDENTITY },
      path: expectedPath(draws),
    });
    // Nothing charged and no interval written at the start: both are the completion's.
    expect([combat(player).energy, combat(player).depleted, player.warpClock]).toEqual([COST, false, clock - INTERVAL]);
    expect(state.player.map.destination).toEqual(DESTINATION);
  });

  it('emits warp-started after the result, then the page change without a command, and no target-changed', () => {
    const { state, player } = setUp();
    state.player.target = state.entities.allocate(entityInit(7)).id;
    state.player.leftDisplay.page = 1;
    const events = step(state, [warp]);
    expect(results(events)).toEqual([[0, 'request-warp', 'accepted', null]]);
    expect(others(events)).toEqual([
      {
        type: 'warp-started', tick: 1, playerEntityId: player.id, serial: 1, origin: POSITION, destination: DESTINATION,
        distance: 50000, check: { cost: COST, energy: COST }, transitLength: 7, fromViewMode: FLIGHT, commandIndex: 0,
      },
      { type: 'left-page-changed', tick: 1, page: 6, previousPage: 1, commandIndex: null },
    ]);
  });

  it('emits no page change when page 6 was already shown, and saves it', () => {
    const { state } = setUp();
    state.player.leftDisplay.page = 6;
    const events = step(state, [warp]);
    expect(others(events).map(({ type }) => type)).toEqual(['warp-started']);
    expect(state.player.savedLeftPage).toBe(6);
  });

  it('starts once in a tick: a second request is judged in the Warp context and draws nothing more', () => {
    const { state } = setUp();
    const rng = state.rngState;
    const events = stepRequests(state, [warp, warp]);
    expect(results(events)).toEqual([[0, 'request-warp', 'accepted', null], [1, 'request-warp', 'ignored', 'wrong-context']]);
    expect(events.filter(({ type }) => type === 'warp-started')).toHaveLength(1);
    expect(state.rngState).toEqual(rngStateAfter(rng, 20));
    expect(state.player.warp?.serial).toBe(1);
  });

  it('starts from the map with the map as the previous view, and judges the map commands after it in the Warp context', () => {
    const { state } = setUp({ viewMode: MAP });
    const events = step(state, [warp, toggle, { type: 'map-point', operation: 'select', right: 0.5, down: 0.5 }, { type: 'speed', operation: 'zero' }]);
    expect(results(events)).toEqual([
      [0, 'request-warp', 'accepted', null],
      [1, 'toggle-map', 'ignored', 'wrong-context'],
      [2, 'map-point', 'ignored', 'wrong-context'],
      [3, 'speed', 'ignored', 'wrong-context'],
    ]);
    expect(others(events).find(({ type }) => type === 'warp-started')).toMatchObject({ fromViewMode: MAP, destination: DESTINATION });
    expect([state.player.viewMode, state.player.previousViewMode]).toEqual([WARP, MAP]);
  });

  it('opens the map, selects and starts in one tick, on the batch\'s destination (MW-12 difference 1)', () => {
    const { state } = setUp({ destination: null, energy: 1e6 });
    const rng = state.rngState;
    const events = stepRequests(state, [toggle, { type: 'map-point', operation: 'select', right: 0.5, down: 0.5 }, warp]);
    expect(results(events)).toEqual([[0, 'toggle-map', 'accepted', null], [1, 'map-point', 'accepted', null], [2, 'request-warp', 'accepted', null]]);
    // The select at (200, 200) of the side-400 map, without icons: its world point, z = +0.
    const destination = mapPixelToWorld(state.ruleData.map, { column: 200, row: 200 });
    expect(others(events).map(({ type }) => type)).toEqual(['map-toggled', 'warp-destination-set', 'warp-started', 'left-page-changed']);
    expect(others(events)[2]).toMatchObject({ destination, fromViewMode: MAP, commandIndex: 2 });
    // The marker's 1 draw, then the start's 20.
    expect(state.rngState).toEqual(rngStateAfter(rng, 21));
    expect([state.player.viewMode, state.player.previousViewMode]).toEqual([WARP, MAP]);
  });

  // MW-04 and MW-12 difference 9: the batch's control, match and launch requests judged before the start apply before it.
  it('lets the start\'s set-up win over a zero throttle judged before it, without a fault', () => {
    const commands: Command[] = [{ type: 'speed', operation: 'zero' }, warp];
    const { state, player } = setUp();
    expect(results(stepRequests(state, commands))).toEqual([[0, 'speed', 'accepted', null], [1, 'request-warp', 'accepted', null]]);
    expect([block(player).mode, block(player).speed, block(player).commandedSpeed, block(player).atCommandedSpeed]).toEqual(['warp', 0, 64, false]);
    // The whole tick runs: mode 3 accelerates towards +0xB8 rather than dividing 0 by 0.
    const whole = setUp();
    expect(() => step(whole.state, commands)).not.toThrow();
    expect(block(whole.player).commandedSpeed).toBe(64);
  });

  it('applies a match judged before the start first, then the set-up\'s speed', () => {
    const { state, player } = setUp();
    const target = state.entities.allocate(entityInit(7, { position: { x: 1000, y: 2000, z: 500 } }));
    target.state = 'active';
    block(target).speed = 0;
    state.player.target = target.id;
    const events = stepRequests(state, [{ type: 'speed', operation: 'match-target' }, warp]);
    expect(results(events)).toEqual([[0, 'speed', 'accepted', null], [1, 'request-warp', 'accepted', null]]);
    expect(others(events).map(({ type }) => type)).toEqual(['speed-matched', 'warp-started', 'left-page-changed']);
    expect([block(player).speed, block(player).commandedSpeed, state.player.target]).toEqual([0, 64, null]);
  });

  it('builds a launch judged before the start from the pre-Warp pose and applies it first', () => {
    const { state } = setUp();
    combat(state.entities.get(state.player.entityId!)!).charge = 0x7fffffff;
    const events = stepRequests(state, [{ type: 'fire', channel: 'primary' }, warp]);
    expect(results(events)).toEqual([[0, 'fire', 'accepted', null], [1, 'request-warp', 'accepted', null]]);
    expect(others(events).map(({ type }) => type)).toEqual(['shot-fired', 'warp-started', 'left-page-changed']);
    const shot = others(events)[0];
    if (shot.type !== 'shot-fired') throw new Error('expected a shot');
    expect(shot.shooterPosition).toEqual(POSITION);
    expect(Math.abs(shot.position.z - POSITION.z)).toBeLessThan(100);
  });

  it('judges the commands after the start in the Warp context', () => {
    const { state, player } = setUp();
    const events = stepRequests(state, [warp, { type: 'speed', operation: 'zero' }, { type: 'fire', channel: 'primary' }]);
    expect(results(events)).toEqual([[0, 'request-warp', 'accepted', null], [1, 'speed', 'ignored', 'wrong-context'], [2, 'fire', 'ignored', 'wrong-context']]);
    expect(block(player).commandedSpeed).toBe(64);
  });

  it('numbers each start and resets the transit whole', () => {
    const { state, player } = setUp();
    step(state, [warp]);
    // A synthetic end of the first Warp (the completion is P3-09/18's): back in flight at POSITION.
    Object.assign(state.player, { viewMode: FLIGHT, previousViewMode: WARP });
    Object.assign(state.player.warp!, { segments: 4, fraction: 0.5, error: 0.25, angle: 0.5, centring: 0.75 });
    Object.assign(player, { position: POSITION, inWarp: false });
    Object.assign(block(player), { mode: 'craft' });
    combat(player).energy = COST;
    const events = step(state, [warp]);
    expect(others(events)[0]).toMatchObject({ type: 'warp-started', serial: 2 });
    expect(state.player.warp).toMatchObject({ serial: 2, segments: 1, fraction: 0, error: 0, angle: 0, centring: 0, origin: POSITION });
  });

  it('faults when the start no longer passes the check it was accepted on', () => {
    const { state, player } = setUp();
    expectFault(() => stepRequests(state, [warp], { 'request-handling': () => void (combat(player).energy = COST - 1) }), 'invariant-violated', 'warp.start-check');
  });
});
