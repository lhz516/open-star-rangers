import { describe, expect, it } from 'vitest';
import type { DomainEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput, type Command, type TickAxes } from '../contracts/tick-input.ts';
import { activeAreaCentre } from '../rules/active-area.ts';
import { mapPixelToWorld } from '../rules/map-frame.ts';
import { randValues, rngStateAfter } from '../rules/rand.test-support.ts';
import { STARTUP_ROTATIONS } from '../rules/startup-rotations.ts';
import type { CraftCombat, Entity, SteeredMovementBlock } from '../world/entity-table.ts';
import { initialPlayerControl } from '../world/player-state.ts';
import { constructWorld } from '../world/world.ts';
import { addPlayerEntity, entityInit, expectFault, stateText, testState } from '../world/world.test-support.ts';
import { enterBaseView } from './base-interior.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { committedView, PIPELINE, registerTick, type TickContext } from './pipeline.ts';
import { switchView } from './view-switch.ts';
import { judgeWarpRequest, runWarpStep } from './warp.ts';

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
  /** Craft +0xA8 of the player's record (14: L = 7 here; 1: L = 0.5, a Warp that completes in its start's tick). */
  readonly transitSeconds?: number;
  /** Craft +0x0C of the player's record, the radius of 0x3c040. */
  readonly radius?: number;
}

/** A world with an available player at POSITION in `viewMode`, its record as above, the automatic selection not due. */
function setUp({ viewMode = FLIGHT, previousViewMode = FLIGHT, energy = COST, destination = DESTINATION, warpClock = 0, transitSeconds = 14, radius = 0 }: Options = {}): { state: WorldState; player: Entity } {
  const base = testState();
  const { content } = base.craftInfo;
  const craft = content.craft.map((record, kindBit) => (kindBit === 0 ? { ...record, pairs: [{ at00: 10, at04: 100 }, { at00: 1000, at04: 200 }], atA4: 2, atA8: transitSeconds, atB8: 64, at0C: radius } : record));
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content: { ...content, craft } } };
  const player = addPlayerEntity(state, { position: POSITION, warpClock });
  player.state = 'active';
  combat(player).energy = energy;
  state.player.control = initialPlayerControl(1);
  state.player.targeting!.autoTargetDueClock = 1e9;
  // View 6 has P3-10's base service and saved pose, as only docking enters it (CB-10, CB-11).
  if (viewMode === BASE) enterBaseView(state);
  else state.player.viewMode = viewMode;
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
    context.stage = stage.id;
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
    const orientation = [...player.orientation];
    const events = step(state, [warp]);
    expect(results(events)).toEqual([[0, 'request-warp', 'accepted', null]]);
    // The area now centres on the destination, which retires the old target at the end of the tick (MW-10, P3-14 FA-07).
    expect(others(events).filter(({ type }) => type !== 'object-retired')).toEqual([
      // P3-12 FS-03: the switch to view 1 first, at the pose before the set-up moved the player into the tunnel.
      {
        type: 'view-switched', tick: 1, fromViewMode: FLIGHT, fromSubMode: 0, viewMode: WARP, subMode: 0, stage: 'request-handling',
        player: { entityId: player.id, position: POSITION, orientation },
      },
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
    expect(others(events).map(({ type }) => type)).toEqual(['view-switched', 'warp-started']);
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
    expect(others(events).map(({ type }) => type)).toEqual(['view-switched', 'map-toggled', 'warp-destination-set', 'view-switched', 'warp-started', 'left-page-changed']);
    expect(others(events)[3]).toMatchObject({ fromViewMode: MAP, viewMode: WARP });
    expect(others(events)[4]).toMatchObject({ destination, fromViewMode: MAP, commandIndex: 2 });
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
    expect(others(events).map(({ type }) => type)).toEqual(['speed-matched', 'view-switched', 'warp-started', 'left-page-changed']);
    expect([block(player).speed, block(player).commandedSpeed, state.player.target]).toEqual([0, 64, null]);
  });

  it('builds a launch judged before the start from the pre-Warp pose and applies it first', () => {
    const { state } = setUp();
    combat(state.entities.get(state.player.entityId!)!).charge = 0x7fffffff;
    const events = stepRequests(state, [{ type: 'fire', channel: 'primary' }, warp]);
    expect(results(events)).toEqual([[0, 'fire', 'accepted', null], [1, 'request-warp', 'accepted', null]]);
    expect(others(events).map(({ type }) => type)).toEqual(['shot-fired', 'view-switched', 'warp-started', 'left-page-changed']);
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
    const events = stepRequests(state, [warp]);
    expect(others(events)[1]).toMatchObject({ type: 'warp-started', serial: 2 });
    expect(state.player.warp).toMatchObject({ serial: 2, segments: 1, fraction: 0, error: 0, angle: 0, centring: 0, origin: POSITION });
  });

  it('faults when the start no longer passes the check it was accepted on', () => {
    const { state, player } = setUp();
    expectFault(() => stepRequests(state, [warp], { 'request-handling': () => void (combat(player).energy = COST - 1) }), 'invariant-violated', 'warp.start-check');
  });
});

// P3-09 S-09, AC-09 and AC-07's progress and completion parts (docs/plan/p3/09/spec.md, Warp 过程与到达) against
// docs/plan/p3/02/spec.md, MW-05, MW-07 (the Warp step in frame-end), MW-08 (warp-completion), MW-09 and MW-10, and
// docs/original/formats/executable.md (Warp progress, completion and interruptions). With +0xA8 = 14, L = 7; with
// +0xA8 = 1, L = F(0.5 × 1) = 0.5 and the start's reset progress F(1 × F(1 ÷ 0.5)) = 2 is already 1.0.

const MAXIMUM_SPEED = 100;
const ARRIVAL_EVENTS = ['view-switched', 'warp-completed', 'left-page-changed'];
const types = (events: readonly DomainEvent[]) => others(events).map(({ type }) => type);
const completions = (events: readonly DomainEvent[]) => events.filter(({ type }) => type === 'warp-completed');

/** A started Warp: the start's tick has run whole (one Warp step at its frame-end). */
function started(options: Options = {}): { state: WorldState; player: Entity } {
  const world = setUp(options);
  world.player.maximumSpeed = MAXIMUM_SPEED;
  step(world.state, [warp]);
  return world;
}

/** Puts the transit one Warp step from its end: n = L − 1 and u just short of 1, with a speed that crosses it. */
function nearTheEnd({ state, player }: { state: WorldState; player: Entity }): void {
  Object.assign(state.player.warp!, { segments: 6, fraction: Math.fround(0.999) });
  Object.assign(block(player), { speed: 64, commandedSpeed: 64 });
}

describe('the Warp step in frame-end (MW-07)', () => {
  it('advances the transit once per tick from the block speed after movement, writing the pose and G, not the placement', () => {
    const { state, player } = started();
    const before = { ...state.player.warp! };
    const placement = player.placementSerial;
    const rng = state.rngState;
    step(state);
    const transit = state.player.warp!;
    // u := F(u + speed × step ÷ +0xB8); no segment completed, so no draws.
    const seconds = state.config.clockUnitsPerTick / 64;
    expect(transit.fraction).toBe(Math.fround(before.fraction + (block(player).speed * seconds) / 64));
    expect(transit.fraction).toBeGreaterThan(before.fraction);
    expect(state.rngState).toEqual(rng);
    expect(transit.frame.position.z).toBeGreaterThan(10000);
    expect(player.position).not.toEqual(before.frame.position);
    expect(player.placementSerial).toBe(placement);
    expect(transit.angle).toBeGreaterThan(0);
    expect(transit.centring).toBeGreaterThan(0.9);
  });

  it('does not run outside view 1 or without a player entity', () => {
    const { state } = started();
    state.player.viewMode = FLIGHT;
    const transit = JSON.stringify(state.player.warp);
    step(state);
    expect(JSON.stringify(state.player.warp)).toBe(transit);
    const other = started();
    const fraction = other.state.player.warp!.fraction;
    other.state.entities.remove(other.player);
    Object.assign(other.state.player, { entityId: null, control: null, targeting: null });
    step(other.state);
    expect(other.state.player.warp!.fraction).toBe(fraction);
  });
});

// P3-12 FS-03: the Warp step's wall contact inside the error window is the one fact `warp-wall-contact` reports.
describe('the Warp step\'s wall contact (P3-12 FS-03)', () => {
  /** One Warp step of frame-end with the player `offset` sideways from the last path pose G, at n = `segments`. */
  function wallStep(offset: number, segments = 1): { events: readonly DomainEvent[]; tick: number; error: number; before: number } {
    const { state, player } = started();
    const transit = state.player.warp!;
    transit.segments = segments;
    const before = transit.error;
    const { position } = transit.frame;
    player.position = { x: position.x + offset, y: position.y, z: position.z };
    player.orientation = transit.frame.orientation;
    const context = registerTick(state, input([]));
    state.clock = context.time.clock;
    context.stage = 'frame-end';
    runWarpStep(context);
    return { events: context.events, tick: context.time.tick, error: state.player.warp!.error, before };
  }

  it('reports a contact in the window once, with the Warp\'s serial, where the error takes 0.01', () => {
    const { events, tick, error, before } = wallStep(60);
    expect(events).toEqual([{ type: 'warp-wall-contact', tick, serial: 1 }]);
    expect(error).toBeGreaterThanOrEqual(Math.fround(before + 0.01));
  });

  it('reports nothing inside the tube or outside the window', () => {
    expect(wallStep(10).events).toEqual([]);
    // (n + u) ÷ L ≥ 0.95 with L = 7.
    const outside = wallStep(60, 7);
    expect([outside.events, outside.error]).toEqual([[], outside.before]);
  });
});

describe('the Warp completion (MW-08) and its tick boundary (AC-09)', () => {
  it('completes in the tick after the frame-end that reached the end, once, with exactly its draws', () => {
    const world = started();
    const { state } = world;
    nearTheEnd(world);
    const rng = state.rngState;
    // Tick T: the frame-end's step completes the last segment (2 draws), n = 7 = L, so p = 1.0; nothing completes yet.
    const reached = step(state);
    expect(completions(reached)).toEqual([]);
    expect(state.player.warp).toMatchObject({ segments: 7, fraction: 0 });
    expect(state.player.viewMode).toBe(WARP);
    expect(state.rngState).toEqual(rngStateAfter(rng, 2));
    // Tick T + 1: the completion reads that progress before any step (2 draws, sign and rotation); no Warp step follows.
    const completed = step(state);
    expect(types(completed)).toEqual(ARRIVAL_EVENTS);
    expect(state.rngState).toEqual(rngStateAfter(rng, 4));
    expect(state.player.viewMode).toBe(FLIGHT);
    // Never again.
    for (let tick = 0; tick < 3; tick++) expect(completions(step(state))).toEqual([]);
  });

  it('completes in the start\'s own tick when L ≤ 1, before any Warp step, after the start\'s events', () => {
    const { state, player } = setUp({ transitSeconds: 1 });
    player.maximumSpeed = MAXIMUM_SPEED;
    state.player.leftDisplay.page = 1;
    const rng = state.rngState;
    const events = step(state, [warp]);
    expect(types(events)).toEqual(['view-switched', 'warp-started', 'left-page-changed', 'view-switched', 'warp-completed', 'left-page-changed']);
    expect(others(events).filter(({ type }) => type === 'left-page-changed')).toEqual([
      { type: 'left-page-changed', tick: 1, page: 6, previousPage: 1, commandIndex: null },
      { type: 'left-page-changed', tick: 1, page: 1, previousPage: 6, commandIndex: null },
    ]);
    // 20 path draws and the 2 arrival draws; the frame-end, back in flight, does not step the Warp.
    expect(state.rngState).toEqual(rngStateAfter(rng, 22));
    expect(state.player.warp).toMatchObject({ segments: 1, fraction: 0, error: 0 });
  });

  it('places an error-free arrival 600 above the player itself at the destination, then charges and resets the block', () => {
    const { state, player } = setUp({ transitSeconds: 1 });
    player.maximumSpeed = MAXIMUM_SPEED;
    const placement = player.placementSerial;
    const draws = randValues(state.rngState, 22);
    const clock = nextClock(state);
    const events = step(state, [warp]);
    // s = 0: the destination unchanged by the pull and the height; the snap's nearest is the player there (score 0).
    const position = { x: DESTINATION.x, y: DESTINATION.y, z: DESTINATION.z + 600 };
    // D = √(30000² + 40000² + 600²) = 50003.59…; trunc 50003, q = 50: the second pair, c = 200 × 50003 ÷ 1000 = 10000.
    const distance = Math.fround(Math.sqrt(30000 ** 2 + 40000 ** 2 + 600 ** 2));
    expect(Math.trunc(distance)).toBe(50003);
    const orientation = STARTUP_ROTATIONS[draws[21] % 64];
    // t = trunc(64 × 2 × min(1, D ÷ 30000)) = 128, raised to 0x280.
    const warpClock = clock + 0x280;
    const completed = others(events).find(({ type }) => type === 'warp-completed');
    // The energy stage runs before the completion, so E is the energy at the completion; s = 0 charges c exactly.
    const energyBefore = completed?.type === 'warp-completed' ? completed.arrival!.charge.energyBefore : NaN;
    expect(completed).toEqual({
      type: 'warp-completed', tick: 1, serial: 1, viewMode: FLIGHT, previousViewMode: WARP,
      arrival: {
        playerEntityId: player.id, origin: POSITION, destination: DESTINATION, position, orientation, error: 0, snapped: player.id,
        charge: { distance: 50003, cost: 10000, energyBefore, energyAfter: energyBefore - 10000 }, warpClock, hostileNear: false,
      },
    });
    expect([player.position, player.orientation, player.placementSerial, player.warpClock, player.inWarp]).toEqual([position, orientation, placement + 2, warpClock, false]);
    expect(block(player)).toMatchObject({ mode: 'craft', atCommandedSpeed: true, speed: MAXIMUM_SPEED, commandedSpeed: MAXIMUM_SPEED });
    expect(combat(player).energy).toBe(energyBefore - 10000);
    // Not written: the destination, the target (cleared at the start) and the transit.
    expect([state.player.map.destination, state.player.target, state.player.warp?.serial]).toEqual([DESTINATION, null, 1]);
    // The area check after the completion already centres on the arrival.
    expect(activeAreaCentre(state)).toBe(player.position);
  });

  it('pulls a Warp with error s toward the sector corner, offsets z by s × ±5000 and snaps to a nearer object', () => {
    const { state, player } = setUp({ transitSeconds: 1 });
    player.maximumSpeed = MAXIMUM_SPEED;
    const sign = randValues(state.rngState, 21)[20] % 2 === 1 ? 1 : -1;
    // With s = 0.5: corner (30000, 45000, 0), so (30500, 43500, 150 ± 2500); an object 100 below that is the nearest.
    const arrival = { x: 30500, y: 43500, z: 150 + sign * 2500 };
    const near = state.entities.allocate(entityInit(7, { position: { ...arrival, z: arrival.z - 100 } }));
    near.destroyed = true;
    stepRequests(state, [warp]);
    state.player.warp!.error = 0.5;
    const context = registerTick(state, input([]));
    PIPELINE.find(({ id }) => id === 'warp-completion')!.run!(context);
    const completed = context.events.find(({ type }) => type === 'warp-completed');
    if (completed?.type !== 'warp-completed') throw new Error('expected a completion');
    expect(completed.arrival).toMatchObject({ error: 0.5, snapped: near.id, position: { ...arrival, z: arrival.z - 100 + 600 } });
  });

  it('reports a live hostile strictly within the player craft\'s +0x0C of the arrival', () => {
    const near = (destroyed: boolean) => {
      const { state, player } = setUp({ transitSeconds: 1, radius: 1000 });
      player.maximumSpeed = MAXIMUM_SPEED;
      const hostile = state.entities.allocate(entityInit(7, { position: { x: DESTINATION.x + 999, y: DESTINATION.y, z: DESTINATION.z + 600 } }));
      Object.assign(hostile, { state: 'active', destroyed });
      const completed = step(state, [warp]).find(({ type }) => type === 'warp-completed');
      return completed?.type === 'warp-completed' ? completed.arrival?.hostileNear : undefined;
    };
    expect([near(false), near(true)]).toEqual([true, false]);
  });

  it.each([
    ['from the map, back to 0xC; saved page 5 restores as 0', MAP, 5, FLIGHT, 0],
    ['from flight; page 6 kept emits no page change', FLIGHT, 6, FLIGHT, null],
  ])('restores the view and page %s', (_, viewMode, page, restored, restoredPage) => {
    const { state, player } = setUp({ viewMode, transitSeconds: 1 });
    player.maximumSpeed = MAXIMUM_SPEED;
    state.player.leftDisplay.page = page as 5 | 6;
    const events = others(step(state, [warp]));
    const completedAt = events.findIndex(({ type }) => type === 'warp-completed');
    expect(events[completedAt]).toMatchObject({ viewMode: restored, previousViewMode: WARP });
    expect([state.player.viewMode, state.player.previousViewMode]).toEqual([restored, WARP]);
    expect(events.slice(completedAt + 1)).toEqual(restoredPage === null ? [] : [{ type: 'left-page-changed', tick: 1, page: restoredPage, previousPage: 6, commandIndex: null }]);
  });

  it('without a player entity only restores the view and page, with no arrival and no draws', () => {
    const world = started();
    const { state } = world;
    nearTheEnd(world);
    step(state);
    state.entities.remove(world.player);
    Object.assign(state.player, { entityId: null, control: null, targeting: null });
    const rng = state.rngState;
    const events = step(state);
    expect(others(events)).toEqual([
      // P3-12 FS-03: the switch has no player pose without a player entity.
      { type: 'view-switched', tick: state.tick, fromViewMode: WARP, fromSubMode: 0, viewMode: FLIGHT, subMode: 0, stage: 'warp-completion', player: null },
      { type: 'warp-completed', tick: state.tick, serial: 1, viewMode: FLIGHT, previousViewMode: WARP, arrival: null },
      { type: 'left-page-changed', tick: state.tick, page: 0, previousPage: 6, commandIndex: null },
    ]);
    expect(state.rngState).toEqual(rng);
  });

  it('keeps going at zero energy (mode 3 has no energy lock) and clamps the charge at 0 without a depletion of its own', () => {
    const world = started();
    const { state, player } = world;
    combat(player).energy = 0;
    const fraction = state.player.warp!.fraction;
    step(state);
    expect(state.player.warp!.fraction).toBeGreaterThan(fraction);
    nearTheEnd(world);
    step(state);
    const events = step(state);
    const completed = events.find(({ type }) => type === 'warp-completed');
    expect(completed?.type === 'warp-completed' && completed.arrival?.charge).toMatchObject({ energyBefore: 0, energyAfter: 0 });
    expect(events.filter(({ type }) => type === 'energy-depleted')).toEqual([]);
  });
});

// Q-10 and MW-09: P3-11's destruction and rescue are not integrated yet; their internal static call boundary is the view
// switch, checked here from synthetic pre-states. Nothing here claims the joint P3-11 flow.
describe('a Warp abandoned at P3-11\'s boundary (MW-09, synthetic pre-states)', () => {
  const DESTROYED = 0x11;

  /** P3-11's destruction from a Warp: view 0x11 with previous view 1, through switchView. */
  function destroyedInWarp() {
    const world = started();
    const { state } = world;
    state.player.leftDisplay.page = 6;
    state.player.savedLeftPage = 2;
    Object.assign(state.player, { viewMode: DESTROYED, previousViewMode: WARP });
    expect(switchView(state, DESTROYED, WARP)).toEqual({ page: 2, previousPage: 6 });
    // Even a transit at its end does not complete outside view 1.
    nearTheEnd(world);
    state.player.warp!.segments = 7;
    return world;
  }

  it('neither steps nor completes: no arrival, no charge, warpClock and the transit unchanged, inWarp kept', () => {
    const { state, player } = destroyedInWarp();
    const transit = JSON.stringify(state.player.warp);
    const warpClock = player.warpClock;
    for (let tick = 0; tick < 3; tick++) expect(completions(step(state))).toEqual([]);
    expect(JSON.stringify(state.player.warp)).toBe(transit);
    expect([player.warpClock, player.inWarp, block(player).mode]).toEqual([warpClock, true, 'warp']);
    // The stuck flag keeps the active area on the destination.
    expect(activeAreaCentre(state)).toBe(state.player.map.destination);
  });

  it('after a synthetic rescue keeps inWarp until the next Warp completes, which the start does not check', () => {
    const { state, player } = destroyedInWarp();
    Object.assign(state.player, { viewMode: FLIGHT, previousViewMode: FLIGHT });
    Object.assign(block(player), { mode: 'craft', speed: 0, commandedSpeed: 0, atCommandedSpeed: true });
    Object.assign(player, { position: POSITION });
    combat(player).energy = COST;
    step(state);
    expect([player.inWarp, activeAreaCentre(state)]).toEqual([true, DESTINATION]);
    const events = step(state, [warp]);
    expect(results(events)).toEqual([[0, 'request-warp', 'accepted', null]]);
    expect(state.player.warp?.serial).toBe(2);
    nearTheEnd({ state, player });
    step(state);
    expect(completions(step(state))).toHaveLength(1);
    expect(player.inWarp).toBe(false);
  });
});
