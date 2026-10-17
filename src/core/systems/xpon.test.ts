import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import { applyFloatControl } from '../rules/flight-control.ts';
import { RandStream } from '../rules/original-random.ts';
import { randValues, rngStateAfter } from '../rules/rand.test-support.ts';
import { TRANSPONDER_KIND_BIT, type Entity, type SteeredMovementBlock, type TransponderState } from '../world/entity-table.ts';
import { constructWorld } from '../world/world.ts';
import { addPlayerEntity, entityInit, expectFault, stateText, testState, tickInput, TEST_ORIENTATION } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { registerTick, type Request, type TickContext } from './pipeline.ts';
import { constructTransponder, createTransponder, judgeDropTransponder, updateTransponder } from './xpon.ts';

// docs/plan/p3/02/spec.md, CR-20 to CR-23, and docs/plan/p3/08/spec.md, AC-10 (Node part); the expectations follow
// docs/original/formats/executable.md, X2 (constructor `0x38780`), X3 (callback `0x3897c`) and X4 (timing), and D13
// (`0x3060c`), worked out by hand for the synthetic craft info: every craft record has +0xB8 64, rates +0xAC 0.75,
// +0xB0 0.5 and +0xB4 0.25, +0x54 1000, +0x58 200, +0x64[0] 1, +0x78[0] 6 and +0x88 10; kind 14's has no mounts.

const DROP: Command = { type: 'drop-transponder' };
const XPON_MASK = 2 ** TRANSPONDER_KIND_BIT;
/** f32(1 ÷ 32767), X3's K (f32 `0x171438`). */
const K = Math.fround(1 / 32767);

const xpons = (state: WorldState): Entity[] => [...state.entities.walk(XPON_MASK)];
const blockOf = (entity: Entity): SteeredMovementBlock => entity.movement as SteeredMovementBlock;
const transponderOf = (entity: Entity): TransponderState => entity.transponder as TransponderState;
const result = (tick: number, commandIndex: number, outcome: 'accepted' | 'ignored', reason: string | null): DomainEvent =>
  ({ type: 'command-result', tick, commandIndex, commandType: 'drop-transponder', outcome, reason } as DomainEvent);

/**
 * A world whose player stands active in flight at (0.1, 2, 3) with TEST_ORIENTATION, its block at `speed`; the player's
 * craft record has +0xB8 80, so that its ratio and the transponder's throttle (kind 14's 64) read different records.
 */
function flightScene(speed = 50): { state: WorldState; player: Entity } {
  const base = testState();
  const { content } = base.craftInfo;
  const craft = content.craft.map((record, kindBit) => (kindBit === 0 ? { ...record, atB8: 80 } : record));
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content: { ...content, craft } } };
  const player = addPlayerEntity(state, { position: { x: Math.fround(0.1), y: 2, z: 3 } });
  player.state = 'active';
  blockOf(player).speed = speed;
  blockOf(player).speedRatio = Math.fround(0.1);
  return { state, player };
}

/** A tick registered at `clock`, without running any stage: for direct calls into the rules. */
function contextAt(state: WorldState, clock: number): TickContext {
  state.clock = clock;
  return registerTick(state, readTickInput(tickInput()));
}

/** A declared kind-0x4000 entity (CR-20: creator `declaration`), active with TEST_MAXIMUM_SPEED's block unless overridden. */
const declaredXpon = (state: WorldState, overrides: Parameters<typeof entityInit>[1] = {}): Entity =>
  state.entities.allocate(entityInit(TRANSPONDER_KIND_BIT, { side: null, ...overrides }));

describe('drop-transponder (CR-20, CR-05)', () => {
  it('is accepted in flight with no count gate, each command constructing one transponder in the same tick', () => {
    const { state, player } = flightScene();
    const events = constructWorld(state).step(tickInput([DROP, DROP]));
    const created = xpons(state);
    expect(created).toHaveLength(2);
    expect(events).toEqual([
      result(1, 0, 'accepted', null),
      result(1, 1, 'accepted', null),
      ...created.map((xpon) => ({
        type: 'transponder-deployed', tick: 1, entityId: xpon.id, creatorEntityId: player.id, position: xpon.position, orientation: TEST_ORIENTATION,
      })),
    ]);
    // Constructed in request handling as presentation-ready: it moves only from its first callback (X4).
    expect(created.map(({ state: objectState, activity }) => [objectState, activity])).toEqual([['presentation-ready', 'active'], ['presentation-ready', 'active']]);
    expect(created[0].position).toEqual({ x: Math.fround(1.1), y: 2, z: -12 });
  });

  it.each([
    ['without a player entity', (state: WorldState) => { state.player.entityId = null; }, 'player-unavailable'],
    ['with a destroyed player', (_: WorldState, player: Entity) => { player.destroyed = true; }, 'player-unavailable'],
    ['with a player not active yet', (_: WorldState, player: Entity) => { player.state = 'presentation-ready'; }, 'player-unavailable'],
    ['in the map', (state: WorldState) => { state.player.viewMode = 8; }, 'wrong-context'],
    ['in Warp', (state: WorldState) => { state.player.viewMode = 0; }, 'wrong-context'],
    ['in the base', (state: WorldState) => { state.player.viewMode = 6; }, 'wrong-context'],
  ] as const)('is ignored %s, posting nothing', (_, change, reason) => {
    const { state, player } = flightScene();
    change(state, player);
    const context = contextAt(state, 2);
    judgeDropTransponder(context, { type: 'drop-transponder' }, 0);
    expect(context.events).toEqual([result(context.time.tick, 0, 'ignored', reason)]);
    expect(context.requests.findLastPending((_request): _request is Request => true)).toBeUndefined();
  });

  it('is judged in the batch\'s view: after an accepted toggle-map it is wrong-context', () => {
    const { state } = flightScene();
    const events = constructWorld(state).step(tickInput([{ type: 'toggle-map' }, DROP]));
    expect(events.filter((event) => event.type === 'command-result' && event.commandType === 'drop-transponder')).toEqual([result(1, 1, 'ignored', 'wrong-context')]);
    expect(xpons(state)).toEqual([]);
  });

  it('is still judged while the communications menu is open, which never takes b in the slice (CR-30, CB-07)', () => {
    const { state } = flightScene();
    state.player.communications.menu = { level: 4, table: 'other', items: [{ key: 'x'.charCodeAt(0), value: { type: 'exit' } }] };
    const events = constructWorld(state).step(tickInput([DROP]));
    expect(events.slice(0, 1)).toEqual([result(1, 0, 'accepted', null)]);
    expect(xpons(state)).toHaveLength(1);
  });
});

describe('the constructor 0x38780 (X2, CR-20)', () => {
  it('builds the player\'s transponder behind it at 0.75 of its speed, with one draw, and reports it', () => {
    const { state, player } = flightScene(50);
    const context = contextAt(state, 40);
    const before = state.rngState;
    createTransponder(context, player);
    const [xpon] = xpons(state);
    expect(state.rngState).toEqual(rngStateAfter(before, 1));
    expect(xpon).toMatchObject({
      kindBit: TRANSPONDER_KIND_BIT, source: null, name: { type: 'none' }, side: null, baseInteraction: false,
      presentation: { type: 'model', model: 'model/craft-14' },
      // One unit along −row 2 (−1, 0, 0) and fifteen along −row 3 (0, 0, 1), each step stored as f32.
      position: { x: Math.fround(1.1), y: 2, z: -12 },
      orientation: TEST_ORIENTATION,
      state: 'presentation-ready', activity: 'active', destroyed: false,
      ruleInputs: { percentB: 0, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: 0, aiValueC: 0 },
      maximumSpeed: 64, lastParkedUpdateClock: 40, warpClock: 0, inWarp: false, formation: null,
      ai: { mode: 5, target: null, objectTarget: null, pendingCommand: null, program: { type: 'none' } },
      transponder: { creator: 'player', callback: { phase: 'first-update' } },
    });
    // t = chop(50 × 0.75 ÷ 64 × 128) = 75, the table index 64 + (75 SAR 1) = 101, 37/64 of the maximum 64: 37. The
    // old-ratio throttle of 0x218e8 would give 100 and 50.
    expect(xpon.movement).toMatchObject({ mode: 'craft', speed: 37, commandedSpeed: 37, atCommandedSpeed: true, speedRatio: 37 / 64, impulse: null, locked: false, disturbance: null });
    for (const axis of ['pitch', 'yaw', 'roll'] as const) expect(blockOf(xpon).steering[axis]).toEqual({ rate: 0, enabled: false });
    // 0x3060c(new, record, 100, 0, 0): energy 1000 ÷ 100 × 100, no shield or charge, levels 0, E = 200 − (1 + 6),
    // T = 64 × 10 ÷ 1000 = 0; the next energy update 0x80 + rand % 64 later; hull 0, no mounts.
    const [draw] = randValues(before, 1);
    expect(xpon.combat).toMatchObject({
      type: 'craft', energy: 1000, shield: 0, charge: 0, shieldLevel: 0, chargeLevel: 0, sparePower: 193, fullSpeedPower: 0,
      lastEnergyClock: 40, nextEnergyClock: 40 + 0x80 + (draw % 64), depleted: false, hull: 0,
      weapons: { mounts: [] },
    });
    // 0x218e8 refreshes the source block's speed ratio by the source's own record: f32(50 ÷ 80).
    expect(blockOf(player).speedRatio).toBe(0.625);
    expect(context.events).toEqual([{
      type: 'transponder-deployed', tick: context.time.tick, entityId: xpon.id, creatorEntityId: player.id, position: xpon.position, orientation: TEST_ORIENTATION,
    }]);
  });

  it('chops the throttle toward zero and shifts it arithmetically', () => {
    const { state, player } = flightScene(50.5);
    createTransponder(contextAt(state, 40), player);
    // chop(50.5 × 0.75 ÷ 64 × 128) = chop(75.75) = 75: speed 37 as above.
    expect(blockOf(xpons(state)[0]).speed).toBe(37);
    const reversing = flightScene(-3);
    createTransponder(contextAt(reversing.state, 40), reversing.player);
    // chop(−4.5) = −4, index 64 + (−4 SAR 1) = 62: −2/64 of 64.
    expect(blockOf(xpons(reversing.state)[0]).speed).toBe(-2);
  });

  it('faults on a throttle whose table index leaves the table, rather than clamping it', () => {
    const { state, player } = flightScene(200);
    expectFault(() => createTransponder(contextAt(state, 40), player), 'invariant-violated', 'xpon.throttle');
  });

  it('follows an inactive source: a docked player\'s is parked, without a block, a callback or an event', () => {
    const { state, player } = flightScene(50);
    player.activity = 'docked';
    const context = contextAt(state, 40);
    const before = state.rngState;
    createTransponder(context, player);
    const [xpon] = xpons(state);
    expect(xpon).toMatchObject({ state: 'new', activity: 'parked', movement: null, transponder: { creator: 'player', callback: { phase: 'none' } } });
    expect(state.rngState).toEqual(rngStateAfter(before, 1));
    expect(context.events).toEqual([]);
    // The docked source still has its block, whose ratio 0x218e8 refreshes.
    expect(blockOf(player).speedRatio).toBe(0.625);
  });

  it('builds a wingman\'s drop from its parked step parked, without a block and with one draw (X2, X4)', () => {
    const { state } = flightScene();
    const wingman = state.entities.allocate(entityInit(1, { activity: 'parked', position: { x: 4, y: 5, z: 6 } }));
    const context = contextAt(state, 40);
    const before = state.rngState;
    const xpon = constructTransponder(context, wingman, 'wingman');
    expect(xpon).toMatchObject({
      activity: 'parked', movement: null, lastParkedUpdateClock: 40, position: { x: 5, y: 5, z: -9 },
      transponder: { creator: 'wingman', callback: { phase: 'none' } },
    });
    expect(state.rngState).toEqual(rngStateAfter(before, 1));
    expect(context.events).toEqual([]);
  });
});

describe('the callback 0x3897c (X3)', () => {
  /** The player's fresh transponder, constructed at clock 40. */
  function dropped(): { state: WorldState; xpon: Entity } {
    const { state, player } = flightScene(50);
    createTransponder(contextAt(state, 40), player);
    return { state, xpon: xpons(state)[0] };
  }

  it('tumbles at its first callback: row 3, then row 1, at 0.8 to 1 of the craft rates (two draws)', () => {
    const { state, xpon } = dropped();
    const context = contextAt(state, 42);
    const before = state.rngState;
    updateTransponder(context, xpon, transponderOf(xpon));
    const [roll, pitch] = randValues(before, 2).map((rand) => Math.fround(rand * K * -0.2 + -0.8));
    expect(state.rngState).toEqual(rngStateAfter(before, 2));
    expect(transponderOf(xpon).callback).toEqual({ phase: 'tumbling', since: 42 });
    const { steering, commandedSpeed } = blockOf(xpon);
    expect(steering.roll).toEqual({ rate: Math.fround(0.5 * -1 * roll), enabled: true });
    expect(steering.pitch).toEqual({ rate: Math.fround(0.75 * -1 * pitch), enabled: true });
    expect(steering.yaw).toEqual({ rate: 0, enabled: false });
    expect(commandedSpeed).toBe(37);
    expect(context.events).toEqual([]);
  });

  it('draws the tumble\'s two values before 0x21fd8\'s five disturbance draws', () => {
    const { state, xpon } = dropped();
    blockOf(xpon).disturbance = { level: 1 };
    const expected = structuredClone(blockOf(xpon));
    const before = state.rngState;
    updateTransponder(contextAt(state, 42), xpon, transponderOf(xpon));
    expect(state.rngState).toEqual(rngStateAfter(before, 7));
    // P3-06's float path on a copy, given the tumble values of draws 1 and 2 and the generator after them.
    const [roll, pitch] = randValues(before, 2).map((rand) => Math.fround(rand * K * -0.2 + -0.8));
    applyFloatControl(expected, state.craftInfo.content.craft[TRANSPONDER_KIND_BIT], xpon.maximumSpeed,
      { scale: 1, axes: { pitch, yaw: null, roll }, speedFactor: null }, new RandStream(rngStateAfter(before, 2)));
    expect(blockOf(xpon)).toEqual(expected);
  });

  it('holds in states 0–3 otherwise: yaw at −craft +0xB4 and speed 0, without a draw', () => {
    const state = testState();
    const xpon = declaredXpon(state);
    expect(xpon.state).toBe('presentation-ready');
    const before = state.rngState;
    updateTransponder(contextAt(state, 40), xpon, transponderOf(xpon));
    expect(state.rngState).toBe(before);
    expect(transponderOf(xpon)).toEqual({ creator: 'declaration', callback: { phase: 'none' } });
    expect(blockOf(xpon)).toMatchObject({ commandedSpeed: 0, atCommandedSpeed: false });
    expect(blockOf(xpon).steering).toEqual({ pitch: { rate: 0, enabled: false }, yaw: { rate: -0.25, enabled: true }, roll: { rate: 0, enabled: false } });
  });

  it('passes through 0x21fd8\'s gate: no change or draw parked or locked, five draws under a disturbance', () => {
    const state = testState();
    const parked = declaredXpon(state, { activity: 'parked' });
    const locked = declaredXpon(state);
    blockOf(locked).locked = true;
    const disturbed = declaredXpon(state);
    blockOf(disturbed).disturbance = { level: 1 };
    const context = contextAt(state, 40);
    const text = stateText(state);
    const before = state.rngState;
    updateTransponder(context, parked, transponderOf(parked));
    updateTransponder(context, locked, transponderOf(locked));
    expect(stateText(state)).toBe(text);
    updateTransponder(context, disturbed, transponderOf(disturbed));
    expect(state.rngState).toEqual(rngStateAfter(before, 5));
    expect(blockOf(disturbed).steering.yaw.enabled).toBe(true);
  });

  it('settles at the first state-7 callback strictly past F₀ + 0x80, without a draw', () => {
    const { state, xpon } = dropped();
    updateTransponder(contextAt(state, 42), xpon, transponderOf(xpon));
    xpon.state = 'active';
    const tumbling = { ...blockOf(xpon).steering.pitch };
    const before = state.rngState;
    updateTransponder(contextAt(state, 42 + 0x80), xpon, transponderOf(xpon));
    expect(transponderOf(xpon).callback).toEqual({ phase: 'tumbling', since: 42 });
    expect(blockOf(xpon).steering.pitch).toEqual(tumbling);
    updateTransponder(contextAt(state, 42 + 0x80 + 1), xpon, transponderOf(xpon));
    expect(transponderOf(xpon).callback).toEqual({ phase: 'none' });
    const { steering, commandedSpeed, atCommandedSpeed } = blockOf(xpon);
    // Rows 1 and 3 set to 0 (rate −0, as the original's f32 product), row 2 to 1.0; speed factor 0.
    expect([steering.pitch.rate === 0, steering.pitch.enabled, steering.roll.rate === 0, steering.roll.enabled]).toEqual([true, true, true, true]);
    expect(steering.yaw).toEqual({ rate: -0.25, enabled: true });
    expect([commandedSpeed, atCommandedSpeed]).toEqual([0, false]);
    expect(state.rngState).toBe(before);
    // Settled, later state-7 callbacks do nothing.
    const text = stateText(state);
    updateTransponder(contextAt(state, 1000), xpon, transponderOf(xpon));
    expect(stateText(state).replace(/"clock":\d+/, '')).toBe(text.replace(/"clock":\d+/, ''));
  });

  it.each(['area-switch', 'pending-removal'] as const)('drops a pending settle in %s, changing nothing else', (objectState) => {
    const { state, xpon } = dropped();
    updateTransponder(contextAt(state, 42), xpon, transponderOf(xpon));
    xpon.state = objectState;
    const steering = JSON.stringify(blockOf(xpon).steering);
    const before = state.rngState;
    updateTransponder(contextAt(state, 300), xpon, transponderOf(xpon));
    expect(transponderOf(xpon).callback).toEqual({ phase: 'none' });
    expect(JSON.stringify(blockOf(xpon).steering)).toBe(steering);
    expect(state.rngState).toBe(before);
  });
});

describe('the transponder in the pipeline (CR-23, X4)', () => {
  it('tumbles from the tick after its drop, moves from then on, and settles about 2 s later', () => {
    const { state } = flightScene(50);
    const world = constructWorld(state);
    world.step(tickInput([DROP]));
    const [xpon] = xpons(state);
    const created = xpon.position;
    world.step(tickInput());
    // Tick 2 (clock 4): the first callback tumbles and asks for state 7; movement moves it in the same tick.
    expect(transponderOf(xpon).callback).toEqual({ phase: 'tumbling', since: 4 });
    expect(xpon.state).toBe('active');
    expect(xpon.position).not.toEqual(created);
    // The settle is due at the first clock strictly past 4 + 0x80: clock 134, tick 67.
    while (state.tick < 66) world.step(tickInput());
    expect(transponderOf(xpon).callback.phase).toBe('tumbling');
    world.step(tickInput());
    expect(transponderOf(xpon).callback).toEqual({ phase: 'none' });
    expect(blockOf(xpon)).toMatchObject({ commandedSpeed: 0 });
    expect(blockOf(xpon).steering.yaw).toEqual({ rate: -0.25, enabled: true });
  });

  it('has no Warp-transit check: a transponder in Warp still asks for its next state, where another craft waits', () => {
    const { state } = flightScene();
    const xpon = declaredXpon(state, { inWarp: true, warpClock: 1000 });
    const craft = state.entities.allocate(entityInit(13, { inWarp: true, warpClock: 1000 }));
    constructWorld(state).step(tickInput());
    expect([xpon.state, craft.state]).toEqual(['active', 'presentation-ready']);
  });
});
