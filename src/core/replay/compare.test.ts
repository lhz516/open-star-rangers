import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { COMM_MESSAGES_LIMITS } from '../../content/rule-data/comm-messages.ts';
import { COMMAND_RESULT_REASONS } from '../contracts/domain-events.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import { CoreInputError } from '../errors.ts';
import { thrownBy } from '../world/world.test-support.ts';
import { compareReplayResults } from './compare.ts';

type Mutable = Record<string, unknown>;
type Result = { events: Mutable[]; checkpoints: { tick: number; hash: string }[]; finalTick: number };

const hashOf = (tick: number, salt = 0): string => (tick * 16 + salt).toString(16).padStart(16, '0');

const commandResult = (tick: number, commandIndex: number, overrides: Mutable = {}): Mutable => ({
  type: 'command-result', tick, commandIndex, commandType: 'launch', outcome: 'rejected', reason: 'not-implemented', ...overrides,
});

const instantiated = (tick: number, entityId: number, overrides: Mutable = {}): Mutable => ({
  type: 'object-instantiated',
  tick,
  entityId,
  kindBit: 7,
  source: { collection: 'mission', index: 3, group: { index: 0, request: 1, member: 2 } },
  position: { x: 1.5, y: -2, z: 0 },
  ...overrides,
});

/** A run of `finalTick` ticks: a command result every tick, an object on every third, checkpoints every `interval`. */
function run(finalTick: number, interval: number): Result {
  const events: Mutable[] = [];
  for (let tick = 1; tick <= finalTick; tick++) {
    events.push(commandResult(tick, 0));
    if (tick % 3 === 0) events.push(instantiated(tick, tick));
  }
  const ticks = [0];
  for (let tick = interval; tick <= finalTick; tick += interval) ticks.push(tick);
  if (ticks.at(-1) !== finalTick) ticks.push(finalTick);
  return { events, checkpoints: ticks.map((tick) => ({ tick, hash: hashOf(tick) })), finalTick };
}

/** Asserts that a result `make` builds and `change` breaks is rejected at `path`, as either side of a comparison. */
function expectInvalidOnEitherSide<R extends Result>(make: () => R, change: (result: R) => void, path: string): void {
  for (const side of ['expected', 'actual'] as const) {
    const broken = make();
    change(broken);
    const error = thrownBy(() => (side === 'expected' ? compareReplayResults(broken, make()) : compareReplayResults(make(), broken)));
    expect(error).toBeInstanceOf(CoreInputError);
    expect(error).toMatchObject({ path: `${side}${path}` });
  }
}

const eventAt = (result: Result, tick: number, type = 'command-result'): Mutable => result.events.find((event) => event.tick === tick && event.type === type)!;
const checkpointAt = (result: Result, tick: number) => result.checkpoints.find((checkpoint) => checkpoint.tick === tick)!;

describe('replay result comparison (P3-02 AC-12, 快照、哈希与 replay)', () => {
  it('matches equal results, treating -0 as 0, and returns frozen data', () => {
    const [expected, actual] = [run(12, 4), run(12, 4)];
    (eventAt(actual, 3, 'object-instantiated').position as Mutable).z = -0;
    const comparison = compareReplayResults(expected, actual);
    expect(comparison).toEqual({ match: true });
    expect(deepFrozen(comparison)).toBe(true);
    expect(compareReplayResults(run(0, 1), run(0, 5))).toEqual({ match: true });
  });

  describe('events', () => {
    it.each([
      ['an extra event', (result: Result) => result.events.splice(3, 0, commandResult(3, 1))],
      ['a missing event', (result: Result) => result.events.splice(result.events.indexOf(eventAt(result, 3, 'object-instantiated')), 1)],
      ['a different field', (result: Result) => { (eventAt(result, 3, 'object-instantiated').source as Mutable).index = 4; }],
      ['a different position', (result: Result) => { (eventAt(result, 3, 'object-instantiated').position as Mutable).x = 1.25; }],
      ['a different outcome', (result: Result) => Object.assign(eventAt(result, 3), { outcome: 'accepted', reason: null })],
      ['another order', (result: Result) => result.events.splice(result.events.indexOf(eventAt(result, 3)), 2, eventAt(result, 3, 'object-instantiated'), eventAt(result, 3))],
    ])('reports %s at its tick', (_, change) => {
      const actual = run(12, 4);
      change(actual);
      expect(compareReplayResults(run(12, 4), actual)).toEqual({ match: false, tick: 3, kind: 'events' });
    });

    it('reads a speed-preset command result and tells it from a select-number one at its tick (P3-05 S-06)', () => {
      const judged = (commandType: string, outcome: string, reason: string | null): Result => {
        const result = run(12, 4);
        Object.assign(eventAt(result, 5), { commandType, outcome, reason });
        return result;
      };
      const preset = judged('speed-preset', 'accepted', null);
      expect(compareReplayResults(preset, JSON.parse(JSON.stringify(preset)))).toEqual({ match: true });
      for (const other of [judged('select-number', 'accepted', null), judged('select-number', 'ignored', 'wrong-context')]) {
        expect(compareReplayResults(preset, other)).toEqual({ match: false, tick: 5, kind: 'events' });
      }
    });

    it('reports an event moved to a later tick at the earlier one', () => {
      const actual = run(12, 4);
      const moved = eventAt(actual, 6, 'object-instantiated');
      actual.events.splice(actual.events.indexOf(moved), 1);
      actual.events.splice(actual.events.indexOf(eventAt(actual, 7)) + 1, 0, { ...moved, tick: 7 });
      expect(compareReplayResults(run(12, 4), actual)).toEqual({ match: false, tick: 6, kind: 'events' });
    });

    it('wins over a checkpoint difference at the same tick, but not over an earlier one', () => {
      const actual = run(12, 4);
      eventAt(actual, 8).commandType = 'toggle-map';
      checkpointAt(actual, 8).hash = hashOf(8, 1);
      expect(compareReplayResults(run(12, 4), actual)).toEqual({ match: false, tick: 8, kind: 'events' });
      checkpointAt(actual, 4).hash = hashOf(4, 1);
      expect(compareReplayResults(run(12, 4), actual)).toEqual({ match: false, tick: 4, kind: 'checkpoint' });
    });
  });

  describe('checkpoints', () => {
    it('reports a different hash', () => {
      const actual = run(12, 4);
      checkpointAt(actual, 8).hash = hashOf(8, 3);
      expect(compareReplayResults(run(12, 4), actual)).toEqual({ match: false, tick: 8, kind: 'checkpoint' });
    });

    it('reports a checkpoint only one side took, other than the shorter run\'s final one', () => {
      expect(compareReplayResults(run(12, 4), run(12, 2))).toEqual({ match: false, tick: 2, kind: 'checkpoint' });
      expect(compareReplayResults(run(12, 2), run(12, 4))).toEqual({ match: false, tick: 2, kind: 'checkpoint' });
    });
  });

  describe('length', () => {
    it('reports the shorter run\'s first missing tick, not its final checkpoint off the interval nor the longer run\'s events', () => {
      const [shorter, longer] = [run(10, 4), run(15, 4)];
      expect(shorter.checkpoints.map(({ tick }) => tick)).toEqual([0, 4, 8, 10]);
      expect(longer.checkpoints.map(({ tick }) => tick)).toEqual([0, 4, 8, 12, 15]);
      expect(compareReplayResults(shorter, longer)).toEqual({ match: false, tick: 11, kind: 'length' });
      expect(compareReplayResults(longer, shorter)).toEqual({ match: false, tick: 11, kind: 'length' });
      expect(compareReplayResults(run(0, 4), longer)).toEqual({ match: false, tick: 1, kind: 'length' });
    });

    it('still compares the shorter run\'s final checkpoint where the longer run sampled too', () => {
      const [shorter, longer] = [run(8, 4), run(15, 4)];
      checkpointAt(shorter, 8).hash = hashOf(8, 5);
      expect(compareReplayResults(shorter, longer)).toEqual({ match: false, tick: 8, kind: 'checkpoint' });
    });

    it('comes after an earlier difference', () => {
      const shorter = run(10, 4);
      eventAt(shorter, 9).outcome = 'ignored';
      expect(compareReplayResults(shorter, run(15, 4))).toEqual({ match: false, tick: 9, kind: 'events' });
    });
  });

  describe('validation', () => {
    const invalid: [string, (result: Result & Mutable) => void, string][] = [
      ['an extra field', (result) => { result.seed = 1; }, ''],
      ['a missing final tick', (result) => { delete (result as Mutable).finalTick; }, '.finalTick'],
      ['a negative final tick', (result) => { result.finalTick = -1; }, '.finalTick'],
      ['a final tick beyond the recording capacity', (result) => { result.finalTick = CORE_LIMITS.recordedTicks + 1; }, '.finalTick'],
      ['no checkpoints', (result) => { result.checkpoints = []; }, '.checkpoints'],
      ['a first checkpoint after tick 0', (result) => { result.checkpoints.shift(); }, '.checkpoints[0].tick'],
      ['checkpoints out of order', (result) => { result.checkpoints.reverse(); }, '.checkpoints[0].tick'],
      ['a repeated checkpoint', (result) => { result.checkpoints.splice(1, 0, { tick: 0, hash: hashOf(0) }); }, '.checkpoints[1].tick'],
      ['a last checkpoint before the final tick', (result) => { result.checkpoints.pop(); }, '.checkpoints[2].tick'],
      ['an uppercase hash', (result) => { result.checkpoints[1].hash = 'ABCDEF0123456789'; }, '.checkpoints[1].hash'],
      ['a short hash', (result) => { result.checkpoints[1].hash = 'abc'; }, '.checkpoints[1].hash'],
      ['a checkpoint with an extra field', (result) => { Object.assign(result.checkpoints[1], { state: {} }); }, '.checkpoints[1]'],
      ['a hole in the checkpoints', (result) => { delete (result.checkpoints as unknown[])[1]; }, '.checkpoints'],
      ['a hole in the events', (result) => { delete (result.events as unknown[])[1]; }, '.events'],
      ['an event at tick 0', (result) => { result.events[0].tick = 0; }, '.events[0].tick'],
      ['an event after the final tick', (result) => { result.events.push(commandResult(13, 0)); }, '.events[16].tick'],
      ['events out of tick order', (result) => { result.events.reverse(); }, '.events[2].tick'],
      ['an event without a type', (result) => { delete result.events[0].type; }, '.events[0].type'],
      ['an unknown event type', (result) => { result.events[0].type = 'marker-added'; }, '.events[0].type'],
      ['an event with an extra field', (result) => { result.events[0].note = ''; }, '.events[0]'],
      ['an unknown command type', (result) => { result.events[0].commandType = 'eject'; }, '.events[0].commandType'],
      ['an unknown outcome', (result) => { result.events[0].outcome = 'deferred'; }, '.events[0].outcome'],
      ['an accepted command with a reason', (result) => { result.events[0].outcome = 'accepted'; }, '.events[0].reason'],
      ['a rejected command without a reason', (result) => { result.events[0].reason = null; }, '.events[0].reason'],
      ['an unknown reason', (result) => { result.events[0].reason = 'no-player'; }, '.events[0].reason'],
      ['a command index out of sequence', (result) => { result.events[0].commandIndex = 1; }, '.events[0].commandIndex'],
      ['a command index beyond a tick\'s commands', (result) => { result.events[0].commandIndex = CORE_LIMITS.commandsPerTick; }, '.events[0].commandIndex'],
      ['an entity ID of 0', (result) => { eventAt(result, 3, 'object-instantiated').entityId = 0; }, '.events[3].entityId'],
      ['a kind bit of 32', (result) => { eventAt(result, 3, 'object-instantiated').kindBit = 32; }, '.events[3].kindBit'],
      ['an unknown source collection', (result) => { (eventAt(result, 3, 'object-instantiated').source as Mutable).collection = 'runtime'; }, '.events[3].source.collection'],
      ['a negative group member', (result) => { ((eventAt(result, 3, 'object-instantiated').source as Mutable).group as Mutable).member = -1; }, '.events[3].source.group.member'],
      ['a non-finite position', (result) => { (eventAt(result, 3, 'object-instantiated').position as Mutable).y = Number.NaN; }, '.events[3].position.y'],
      ['a position that is not a number', (result) => { (eventAt(result, 3, 'object-instantiated').position as Mutable).z = '0'; }, '.events[3].position.z'],
      ['more events than a recording holds', (result) => { result.events = new Array(CORE_LIMITS.recordedEvents + 1); }, '.events'],
      ['more checkpoints than a recording holds', (result) => { result.checkpoints = new Array(CORE_LIMITS.recordedCheckpoints + 1); }, '.checkpoints'],
    ];

    it.each(invalid)('rejects %s on either side', (_, change, path) => {
      expectInvalidOnEitherSide(() => run(12, 4) as Result & Mutable, change, path);
    });

    it(`accepts ${CORE_LIMITS.eventsPerTick} events in a tick and rejects one more`, () => {
      const tick = (count: number): Result => ({
        events: Array.from({ length: count }, (_, index) => (index < CORE_LIMITS.commandsPerTick ? commandResult(1, index) : instantiated(1, index))),
        checkpoints: [{ tick: 0, hash: hashOf(0) }, { tick: 1, hash: hashOf(1) }],
        finalTick: 1,
      });
      expect(compareReplayResults(tick(CORE_LIMITS.eventsPerTick), tick(CORE_LIMITS.eventsPerTick))).toEqual({ match: true });
      expect(thrownBy(() => compareReplayResults(tick(CORE_LIMITS.eventsPerTick + 1), run(1, 1))))
        .toMatchObject({ path: `expected.events[${CORE_LIMITS.eventsPerTick}]`, reason: `must not be one of more than ${CORE_LIMITS.eventsPerTick} events of a tick` });
    });

    // Each case builds and reads one result of over 260,000 events: about 0.33 s alone at load 5. Subtask 13 measured
    // CPU-bound cases up to 19 times slower at load 90.
    describe('limit-sized results', { timeout: 30_000 }, () => {
      const commands = (ticks: number): Result => ({
        events: Array.from({ length: ticks * CORE_LIMITS.commandsPerTick }, (_, index) => commandResult(Math.floor(index / CORE_LIMITS.commandsPerTick) + 1, index % CORE_LIMITS.commandsPerTick)),
        checkpoints: [{ tick: 0, hash: hashOf(0) }, { tick: ticks, hash: hashOf(ticks) }],
        finalTick: ticks,
      });
      const fullTicks = CORE_LIMITS.recordedCommands / CORE_LIMITS.commandsPerTick;

      it(`accepts ${CORE_LIMITS.recordedCommands} command results`, () => {
        expect(compareReplayResults(commands(fullTicks), commands(1))).toEqual({ match: false, tick: 2, kind: 'length' });
      });

      it('rejects one more command result', () => {
        expect(thrownBy(() => compareReplayResults(run(1, 1), commands(fullTicks + 1))))
          .toMatchObject({ path: `actual.events[${CORE_LIMITS.recordedCommands}]`, reason: `must not be one of more than ${CORE_LIMITS.recordedCommands} command results` });
      });
    });

    it('rejects a result that is not a plain object', () => {
      for (const value of [null, [], 'result', new Map()]) {
        expect(thrownBy(() => compareReplayResults(value, run(1, 1)))).toMatchObject({ path: 'expected' });
        expect(thrownBy(() => compareReplayResults(run(1, 1), value))).toMatchObject({ path: 'actual' });
      }
    });

    it('accepts every command result reason', () => {
      const result = run(COMMAND_RESULT_REASONS.length, 1);
      COMMAND_RESULT_REASONS.forEach((reason, index) => Object.assign(eventAt(result, index + 1), { outcome: 'ignored', reason }));
      expect(compareReplayResults(result, structuredClone(result))).toEqual({ match: true });
    });

    it('accepts accepted and ignored results, wingman sources and events without a group', () => {
      const result = run(3, 1);
      Object.assign(result.events[0], { outcome: 'accepted', reason: null });
      Object.assign(result.events[1], { outcome: 'ignored' });
      Object.assign(eventAt(result, 3, 'object-instantiated'), { source: { collection: 'wingman', index: 0, group: null } });
      expect(compareReplayResults(result, structuredClone(result))).toEqual({ match: true });
    });
  });

  describe('P3-06 speed and world-exit events (D-06)', () => {
    const accepted = (tick: number, commandIndex: number, commandType: string): Mutable =>
      commandResult(tick, commandIndex, { commandType, outcome: 'accepted', reason: null });
    const assisted = (tick: number, overrides: Mutable = {}): Mutable =>
      ({ type: 'speed-matched', tick, targetEntityId: 5, origin: 'assist', speedDifferenceExceeded: true, ...overrides });
    const toggled = (tick: number, commandIndex: number, overrides: Mutable = {}): Mutable =>
      ({ type: 'speed-assist-toggled', tick, commandIndex, enabled: true, ...overrides });
    const matched = (tick: number, commandIndex: number, overrides: Mutable = {}): Mutable =>
      ({ type: 'speed-matched', tick, targetEntityId: 5, origin: 'command', commandIndex, ...overrides });
    const released = (tick: number): Mutable => ({ type: 'speed-assist-released', tick });
    const left = (tick: number, overrides: Mutable = {}): Mutable =>
      ({ type: 'object-left-world', tick, entityId: 4, kindBit: 8, source: null, ...overrides });

    /**
     * Two ticks in the contract's order: the assist's event, the command results with a toggle right after its own,
     * then from request handling an instantiation and a manual match, and from the parked update a world exit.
     */
    function speedRun(): Result {
      const events = [
        assisted(1),
        accepted(1, 0, 'speed'),
        toggled(1, 0),
        accepted(1, 1, 'confirm-selection'),
        commandResult(1, 2, { commandType: 'speed', outcome: 'ignored', reason: 'no-target' }),
        instantiated(1, 9),
        matched(1, 1),
        left(1),
        released(2),
        accepted(2, 0, 'speed'),
        left(2, { entityId: 6, kindBit: 7, source: { collection: 'mission', index: 3, group: { index: 0, request: 1, member: 2 } } }),
      ];
      return { events, checkpoints: [{ tick: 0, hash: hashOf(0) }, { tick: 2, hash: hashOf(2) }], finalTick: 2 };
    }

    it('accepts and matches them in the contract\'s order, after a JSON round trip', () => {
      expect(compareReplayResults(speedRun(), JSON.parse(JSON.stringify(speedRun())))).toEqual({ match: true });
    });

    it.each([
      ['a speed difference flag', 1, (result: Result) => { result.events[0].speedDifferenceExceeded = false; }],
      ['a toggle\'s switch', 1, (result: Result) => { result.events[2].enabled = false; }],
      ['a matched target', 1, (result: Result) => { result.events[6].targetEntityId = 6; }],
      ['a source that left', 2, (result: Result) => { result.events[10].source = null; }],
      ['a missing release', 2, (result: Result) => void result.events.splice(8, 1)],
    ])('reports a different %s at its tick', (_, tick, change) => {
      const actual = speedRun();
      change(actual);
      expect(compareReplayResults(speedRun(), actual)).toEqual({ match: false, tick, kind: 'events' });
    });

    const invalid: [string, (result: Result) => void, string][] = [
      ['an assisted match with a command index', (result) => { result.events[0].commandIndex = 0; }, '.events[0]'],
      ['a manual match without its command index', (result) => { delete result.events[6].commandIndex; }, '.events[6].commandIndex'],
      ['a match of an unknown origin', (result) => { result.events[0].origin = 'autopilot'; }, '.events[0].origin'],
      ['a match without an origin', (result) => { delete result.events[0].origin; }, '.events[0].origin'],
      ['a match of entity 0', (result) => { result.events[6].targetEntityId = 0; }, '.events[6].targetEntityId'],
      ['a speed difference flag that is not a boolean', (result) => { result.events[0].speedDifferenceExceeded = 1; }, '.events[0].speedDifferenceExceeded'],
      ['a toggle whose switch is not a boolean', (result) => { result.events[2].enabled = 'on'; }, '.events[2].enabled'],
      ['a toggle of a command index beyond a tick\'s commands', (result) => { result.events[2].commandIndex = CORE_LIMITS.commandsPerTick; }, '.events[2].commandIndex'],
      ['a release with an extra field', (result) => { result.events[8].entityId = 1; }, '.events[8]'],
      ['a world exit of kind bit 32', (result) => { result.events[7].kindBit = 32; }, '.events[7].kindBit'],
      ['a world exit without a source', (result) => { delete result.events[7].source; }, '.events[7].source'],
      ['a world exit of an unknown source collection', (result) => { (result.events[10].source as Mutable).collection = 'runtime'; }, '.events[10].source.collection'],
      ['an assist event after a command result', (result) => void result.events.splice(1, 0, result.events.splice(0, 1)[0]), '.events[1]'],
      ['a second assist event in a tick', (result) => void result.events.splice(1, 0, released(1)), '.events[1]'],
      ['a toggle of another command than the result before it', (result) => { result.events[2].commandIndex = 1; }, '.events[2].commandIndex'],
      ['a toggle that does not follow its result', (result) => void result.events.splice(5, 0, toggled(1, 1)), '.events[5].commandIndex'],
      ['a toggle at the start of a tick', (result) => void result.events.splice(8, 0, toggled(2, 0)), '.events[8].commandIndex'],
      ['a manual match before its command\'s result', (result) => { result.events[6].commandIndex = 3; }, '.events[6].commandIndex'],
      ['a manual match of a toggled command', (result) => { result.events[6].commandIndex = 0; }, '.events[6].commandIndex'],
      ['a second manual match of a command', (result) => void result.events.splice(7, 0, matched(1, 1)), '.events[7].commandIndex'],
      ['a command result after a manual match', (result) => void result.events.splice(7, 0, commandResult(1, 3)), '.events[7]'],
      ['a toggle after a manual match', (result) => void result.events.splice(7, 0, toggled(1, 2)), '.events[7]'],
      ['a manual match after a world exit', (result) => void result.events.splice(6, 2, left(1), matched(1, 1)), '.events[7]'],
      ['a world exit before a command result', (result) => void result.events.splice(9, 2, result.events[10], result.events[9]), '.events[10]'],
    ];

    it('leaves instantiations unordered against them', () => {
      const result = speedRun();
      result.events.splice(5, 1);
      result.events.splice(7, 0, instantiated(1, 9));
      result.events.unshift(instantiated(1, 8));
      expect(compareReplayResults(result, structuredClone(result))).toEqual({ match: true });
    });

    it.each(invalid)('rejects %s on either side', (_, change, path) => {
      expectInvalidOnEitherSide(speedRun, change, path);
    });
  });

  describe('P3-07 combat events (docs/plan/p3/02/spec.md, CR-06)', () => {
    const point = () => ({ x: 1, y: -2, z: 0.5 });
    const accepted = (tick: number, commandIndex: number, commandType: string): Mutable =>
      commandResult(tick, commandIndex, { commandType, outcome: 'accepted', reason: null });
    const shooter = { type: 'shooter', entityId: 1, kindBit: 0 };
    const targetChanged = (commandIndex: number | null): Mutable => ({
      type: 'target-changed', tick: 1, playerEntityId: 1, previousTarget: null, target: 5, targetKindBit: 7, mode: 'enemy',
      origin: commandIndex === null ? 'automatic' : 'command', commandIndex,
    });
    const shot = (tick: number, trigger: Mutable): Mutable => ({
      type: 'shot-fired', tick, shooterEntityId: 1, shooterKindBit: 0, shooterPosition: point(), entityId: 9, family: 'gun', weapon: 2, mount: 3, position: point(), trigger,
    });
    const hit = (tick: number): Mutable => ({
      type: 'hit', tick, victimEntityId: 5, victimKindBit: 7, victimPosition: point(), cause: 'projectile', sourceEntityId: 9, attacker: shooter, damage: 40,
      gated: false, shield: { before: 30, after: 0 }, hull: { before: 100, after: 90 }, shieldWasEmpty: false,
      impact: { point: point(), local: { x: 0, y: 0, z: -1 }, face: 5 }, projectile: 'removed',
    });
    const destroyed = (tick: number): Mutable => ({
      type: 'object-destroyed', tick, entityId: 5, kindBit: 7, source: null, position: point(), activity: 'active', attacker: shooter, eventClass: 0, outcome: 'explodes',
    });
    const weaponSelected = (tick: number, commandIndex: number | null): Mutable =>
      ({ type: 'weapon-selected', tick, entityId: 1, list: 1, index: -1, mount: null, changed: false, commandIndex });
    const pageChanged = (tick: number, commandIndex: number | null): Mutable => ({ type: 'left-page-changed', tick, page: 0, previousPage: 1, commandIndex });

    /**
     * Two ticks in the contract's order. Tick 1: in the player's update the command results, each command's additional
     * event right after its result; in request handling the applied selections, a shot, an explosion's activation, a
     * missile's and a fragment's ends with their hits and a destruction, a source's release; a depletion in the energy
     * stage; a world exit in the parked update; the right display's clearing at the end. Tick 2: an AI shot, a hit
     * and events of selections and pages without a command.
     */
    function combatRun(): Result {
      const events = [
        accepted(1, 0, 'target'),
        accepted(1, 1, 'cycle-main-weapon'),
        weaponSelected(1, 1),
        accepted(1, 2, 'fire'),
        accepted(1, 3, 'energy'),
        { type: 'energy-allocation-changed', tick: 1, entityId: 1, shieldLevel: 2, chargeLevel: 1, commandIndex: 3 },
        accepted(1, 4, 'damage-report'),
        pageChanged(1, 4),
        targetChanged(0),
        shot(1, { type: 'command', channel: 'primary', commandIndex: 2 }),
        { type: 'explosion-started', tick: 1, entityId: 10, sourceEntityId: 5, sourceKindBit: 7, variant: 'large', position: point(), activationClock: 2 },
        { type: 'missile-ended', tick: 1, entityId: 11, shooterEntityId: 1, outcome: 'detonated', position: point(), orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
        hit(1),
        destroyed(1),
        { type: 'fragment-expired', tick: 1, entityId: 12, sourceKindBit: 7, part: 4, position: point(), outcome: 'explodes' },
        { type: 'source-released', tick: 1, entityId: 5, kindBit: 7, fragmentEntityId: 13, removed: true },
        targetChanged(null),
        { type: 'energy-depleted', tick: 1, entityId: 1, kindBit: 0, position: point() },
        { type: 'object-left-world', tick: 1, entityId: 4, kindBit: 8, source: null },
        { type: 'target-cleared', tick: 1, playerEntityId: 1, previousTarget: 5, cause: 'invalid' },
        weaponSelected(2, null),
        shot(2, { type: 'ai', channel: 2 }),
        { ...hit(2), cause: 'collision', sourceEntityId: null, attacker: { type: 'none' }, impact: null, projectile: null },
        { ...shot(2, { type: 'automatic' }), family: 'missile' },
        pageChanged(2, null),
        { ...destroyed(2), attacker: { type: 'lost-shooter' }, eventClass: 1, outcome: 'removed', activity: 'parked' },
      ];
      return { events, checkpoints: [{ tick: 0, hash: hashOf(0) }, { tick: 2, hash: hashOf(2) }], finalTick: 2 };
    }

    it('accepts and matches every type in the contract\'s order, after a JSON round trip', () => {
      const types = new Set(combatRun().events.map(({ type }) => type));
      expect(types.size).toBe(13 + 2);
      expect(compareReplayResults(combatRun(), JSON.parse(JSON.stringify(combatRun())))).toEqual({ match: true });
    });

    it.each([
      ['selected weapon', 2, (event: Mutable) => { event.changed = true; }],
      ['allocation', 5, (event: Mutable) => { event.chargeLevel = 2; }],
      ['page', 7, (event: Mutable) => { event.previousPage = 2; }],
      ['target', 8, (event: Mutable) => { event.target = 6; }],
      ['shot position', 9, (event: Mutable) => { (event.position as Mutable).y = 0; }],
      ['activation clock', 10, (event: Mutable) => { event.activationClock = 4; }],
      ['missile orientation', 11, (event: Mutable) => { (event.orientation as number[])[4] = -1; }],
      ['hit impact face', 12, (event: Mutable) => { (event.impact as Mutable).face = 4; }],
      ['hit shield', 12, (event: Mutable) => { (event.shield as Mutable).after = 1; }],
      ['destruction attacker', 13, (event: Mutable) => { event.attacker = { type: 'none' }; }],
      ['fragment outcome', 14, (event: Mutable) => { event.outcome = 'removed'; }],
      ['release', 15, (event: Mutable) => { event.removed = false; }],
      ['depletion position', 17, (event: Mutable) => { (event.position as Mutable).x = 2; }],
      ['clearing cause', 19, (event: Mutable) => { event.cause = 'warp'; }],
      ['AI shot channel', 21, (event: Mutable) => { (event.trigger as Mutable).channel = 1; }],
    ])('reports a different %s at its tick', (_, index, change) => {
      const actual = combatRun();
      change(actual.events[index]);
      expect(compareReplayResults(combatRun(), actual)).toEqual({ match: false, tick: actual.events[index].tick, kind: 'events' });
    });

    const invalid: [string, (result: Result) => void, string][] = [
      ['an automatic selection with a command', (result) => { result.events[16].commandIndex = 0; }, '.events[16].commandIndex'],
      ['a command\'s selection without a command', (result) => { result.events[8].commandIndex = null; }, '.events[8].commandIndex'],
      ['a selection of target 0', (result) => { result.events[8].target = 0; }, '.events[8].target'],
      ['a selection of an unknown mode', (result) => { result.events[8].mode = 'neutral'; }, '.events[8].mode'],
      ['a clearing for an unknown cause', (result) => { result.events[19].cause = 'map'; }, '.events[19].cause'],
      ['a weapon list of 2', (result) => { result.events[2].list = 2; }, '.events[2].list'],
      ['a weapon index below −1', (result) => { result.events[2].index = -2; }, '.events[2].index'],
      ['a selected mount of −1', (result) => { result.events[2].mount = -1; }, '.events[2].mount'],
      ['a shot of an unknown family', (result) => { result.events[9].family = 'laser'; }, '.events[9].family'],
      ['a command shot without its channel', (result) => { delete (result.events[9].trigger as Mutable).channel; }, '.events[9].trigger.channel'],
      ['an automatic shot with a channel', (result) => { (result.events[23].trigger as Mutable).channel = 0; }, '.events[23].trigger'],
      ['an AI channel of 3', (result) => { (result.events[21].trigger as Mutable).channel = 3; }, '.events[21].trigger.channel'],
      ['a hit of an unknown cause', (result) => { result.events[12].cause = 'ram'; }, '.events[12].cause'],
      ['a fractional damage', (result) => { result.events[12].damage = 0.5; }, '.events[12].damage'],
      ['a hull beyond i32', (result) => { (result.events[12].hull as Mutable).after = 2 ** 31; }, '.events[12].hull.after'],
      ['an impact face of 6', (result) => { (result.events[12].impact as Mutable).face = 6; }, '.events[12].impact.face'],
      ['an impact without a local point', (result) => { delete (result.events[12].impact as Mutable).local; }, '.events[12].impact.local'],
      ['a lost shooter with an entity', (result) => { result.events[25].attacker = { type: 'lost-shooter', entityId: 1 }; }, '.events[25].attacker'],
      ['a shooter without a kind', (result) => { result.events[12].attacker = { type: 'shooter', entityId: 1 }; }, '.events[12].attacker.kindBit'],
      ['an unknown projectile outcome', (result) => { result.events[12].projectile = 'stuck'; }, '.events[12].projectile'],
      ['a destruction of an unknown activity', (result) => { result.events[13].activity = 'warping'; }, '.events[13].activity'],
      ['an event class of 2', (result) => { result.events[13].eventClass = 2; }, '.events[13].eventClass'],
      ['an explosion of an unknown variant', (result) => { result.events[10].variant = 'small'; }, '.events[10].variant'],
      ['a negative activation clock', (result) => { result.events[10].activationClock = -1; }, '.events[10].activationClock'],
      ['a missile orientation of 8 items', (result) => { (result.events[11].orientation as number[]).pop(); }, '.events[11].orientation'],
      ['a non-finite missile orientation', (result) => { (result.events[11].orientation as number[])[0] = Number.NaN; }, '.events[11].orientation[0]'],
      ['a fragment of an unknown outcome', (result) => { result.events[14].outcome = 'lost'; }, '.events[14].outcome'],
      ['a release that is not a boolean', (result) => { result.events[15].removed = 0; }, '.events[15].removed'],
      ['a level of 4', (result) => { result.events[5].shieldLevel = 4; }, '.events[5].shieldLevel'],
      ['a page of 7', (result) => { result.events[7].page = 7; }, '.events[7].page'],
      ['a depletion with an extra field', (result) => { result.events[17].energy = 0; }, '.events[17]'],
      ['an additional event of another command than the result before it', (result) => { result.events[2].commandIndex = 0; }, '.events[2].commandIndex'],
      ['an additional event that does not follow its result', (result) => void result.events.splice(4, 0, weaponSelected(1, 1)), '.events[4].commandIndex'],
      ['a second additional event of a command', (result) => void result.events.splice(8, 0, pageChanged(1, 4)), '.events[8].commandIndex'],
      ['a command\'s selection before its command\'s result', (result) => { result.events[8].commandIndex = 5; }, '.events[8].commandIndex'],
      ['a command\'s selection of a command with an additional event', (result) => { result.events[8].commandIndex = 1; }, '.events[8].commandIndex'],
      ['a command\'s shot before its command\'s result', (result) => { (result.events[9].trigger as Mutable).commandIndex = 5; }, '.events[9].trigger.commandIndex'],
      ['a command result after a shot', (result) => void result.events.splice(10, 0, commandResult(1, 5)), '.events[10]'],
      ['an explosion\'s activation in the player\'s update', (result) => void result.events.splice(3, 0, result.events.splice(10, 1)[0]), '.events[4]'],
      ['a source\'s release after a depletion', (result) => void result.events.splice(17, 0, result.events.splice(15, 1)[0]), '.events[17]'],
      ['a depletion after a world exit', (result) => void result.events.splice(17, 2, result.events[18], result.events[17]), '.events[18]'],
      ['a world exit after the clearing', (result) => void result.events.splice(18, 2, result.events[19], result.events[18]), '.events[19]'],
      ['a second clearing', (result) => void result.events.splice(20, 0, { ...result.events[19] }), '.events[20]'],
      ['a command result after a hit', (result) => void result.events.splice(1, 0, hit(1)), '.events[2]'],
      ['a destruction before its hit', (result) => void result.events.splice(12, 2, result.events[13], result.events[12]), '.events[12].entityId'],
      ['a destruction of another entity than the one hit', (result) => { result.events[13].entityId = 6; }, '.events[13].entityId'],
      ['a second destruction of an entity', (result) => void result.events.splice(14, 0, destroyed(1)), '.events[14].entityId'],
      ['a hit of an entity destroyed earlier in the tick', (result) => void result.events.splice(14, 0, { ...hit(1), cause: 'collision', sourceEntityId: null,
        attacker: { type: 'none' }, impact: null, projectile: null }), '.events[14].victimEntityId'],
      ['a missile\'s hit before its detonation', (result) => void result.events.splice(11, 0, { ...hit(1), cause: 'missile', sourceEntityId: 11, projectile: null }), '.events[11].sourceEntityId'],
      ['a hit of a missile that fizzled', (result) => { Object.assign(result.events[11], { outcome: 'fizzled' }); Object.assign(result.events[12], { cause: 'missile', sourceEntityId: 11 }); }, '.events[12].sourceEntityId'],
    ];

    it.each(invalid)('rejects %s on either side', (_, change, path) => {
      expectInvalidOnEitherSide(combatRun, change, path);
    });

    it('leaves command-less selections and pages unordered, and hits and destructions in any stage from the object updates on', () => {
      const result = combatRun();
      result.events.unshift(weaponSelected(1, null), pageChanged(1, null));
      // Damage in the parked update after the depletion and the world exit (a parked engagement), and a missile's hit
      // after its detonation.
      result.events.splice(result.events.indexOf(eventAt(result, 1, 'target-cleared')), 0, { ...hit(1), victimEntityId: 8, cause: 'parked', sourceEntityId: null,
        impact: null, projectile: null }, { ...destroyed(1), entityId: 8, activity: 'parked', outcome: 'removed' });
      result.events.splice(result.events.indexOf(eventAt(result, 1, 'missile-ended')) + 1, 0, { ...hit(1), cause: 'missile', sourceEntityId: 11, projectile: null });
      expect(compareReplayResults(result, structuredClone(result))).toEqual({ match: true });
    });
  });

  describe('P3-09 map and Warp events (docs/plan/p3/02/spec.md, MW-05)', () => {
    const point = (x = 1) => ({ x, y: -2, z: 0.5 });
    const accepted = (tick: number, commandIndex: number, commandType: string): Mutable =>
      commandResult(tick, commandIndex, { commandType, outcome: 'accepted', reason: null });
    const toggled = (tick: number, commandIndex: number): Mutable =>
      ({ type: 'map-toggled', tick, open: true, viewMode: 8, previousViewMode: 0xc, commandIndex });
    const destinationSet = (tick: number, commandIndex: number, marker: Mutable = { type: 'created', entityId: 30 }): Mutable => ({
      type: 'warp-destination-set', tick, playerEntityId: 1, destination: point(), pixel: { column: 0, row: 399 }, icon: { entityId: 5, kindBit: 7 },
      marker, commandIndex,
    });
    const started = (tick: number, commandIndex: number): Mutable => ({
      type: 'warp-started', tick, playerEntityId: 1, serial: 1, origin: point(0), destination: point(), distance: 1.5, check: { cost: 0, energy: 900 },
      transitLength: 0.5, fromViewMode: 8, commandIndex,
    });
    const arrival = (): Mutable => ({
      playerEntityId: 1, origin: point(0), destination: point(), position: point(2), orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1], error: 0.25, snapped: null,
      charge: { distance: 2, cost: 0, energyBefore: 900, energyAfter: 900 }, warpClock: 640, hostileNear: false,
    });
    const completed = (tick: number, withArrival = true): Mutable =>
      ({ type: 'warp-completed', tick, serial: 1, viewMode: 0xc, previousViewMode: 1, arrival: withArrival ? arrival() : null });
    const pageChanged = (tick: number): Mutable => ({ type: 'left-page-changed', tick, page: 6, previousPage: 0, commandIndex: null });

    /**
     * Tick 1: the results of a toggle, a hover (no event), a select and a Warp request; in request handling the toggle,
     * the select and the start with its page change, in command order; the completion in its stage with the page
     * restored, before the end of the frame. Tick 2: a completion without a player entity, and a select that found no
     * marker.
     */
    function mapWarpRun(): Result {
      const events = [
        accepted(1, 0, 'toggle-map'),
        accepted(1, 1, 'map-point'),
        accepted(1, 2, 'map-point'),
        accepted(1, 3, 'request-warp'),
        toggled(1, 0),
        destinationSet(1, 2),
        started(1, 3),
        pageChanged(1),
        { type: 'energy-depleted', tick: 1, entityId: 1, kindBit: 0, position: point() },
        completed(1),
        { ...pageChanged(1), page: 0, previousPage: 6 },
        { type: 'target-cleared', tick: 1, playerEntityId: 1, previousTarget: 5, cause: 'invalid' },
        accepted(2, 0, 'map-point'),
        destinationSet(2, 0, { type: 'missing' }),
        completed(2, false),
      ];
      return { events, checkpoints: [{ tick: 0, hash: hashOf(0) }, { tick: 2, hash: hashOf(2) }], finalTick: 2 };
    }

    it('accepts and matches every type in the contract\'s order, after a JSON round trip', () => {
      expect(new Set(mapWarpRun().events.map(({ type }) => type)).size).toBe(4 + 4);
      expect(compareReplayResults(mapWarpRun(), JSON.parse(JSON.stringify(mapWarpRun())))).toEqual({ match: true });
    });

    it.each([
      ['toggle', 4, (event: Mutable) => { event.open = false; }],
      ['destination', 5, (event: Mutable) => { (event.destination as Mutable).z = 0; }],
      ['cursor pixel', 5, (event: Mutable) => { (event.pixel as Mutable).row = 398; }],
      ['icon', 5, (event: Mutable) => { event.icon = null; }],
      ['marker change', 5, (event: Mutable) => { event.marker = { type: 'moved', entityId: 30 }; }],
      ['start check', 6, (event: Mutable) => { (event.check as Mutable).energy = 899; }],
      ['transit length', 6, (event: Mutable) => { event.transitLength = 0.75; }],
      ['arrival orientation', 9, (event: Mutable) => { ((event.arrival as Mutable).orientation as number[])[8] = -1; }],
      ['charge', 9, (event: Mutable) => { ((event.arrival as Mutable).charge as Mutable).energyAfter = 0; }],
      ['hostile flag', 9, (event: Mutable) => { (event.arrival as Mutable).hostileNear = true; }],
      ['arrival', 14, (event: Mutable) => { event.arrival = arrival(); }],
    ])('reports a different %s at its tick', (_, index, change) => {
      const actual = mapWarpRun();
      change(actual.events[index]);
      expect(compareReplayResults(mapWarpRun(), actual)).toEqual({ match: false, tick: actual.events[index].tick, kind: 'events' });
    });

    it('accepts the bounds of view modes, pixels, serials and i32 values, and rejects one past them', () => {
      const bounded = mapWarpRun();
      Object.assign(bounded.events[4], { viewMode: 0xff, previousViewMode: 0 });
      Object.assign(bounded.events[5], { pixel: { column: 479, row: 0 } });
      Object.assign(bounded.events[6], { serial: Number.MAX_SAFE_INTEGER, check: { cost: -(2 ** 31), energy: 2 ** 31 - 1 }, commandIndex: 3 });
      expect(compareReplayResults(bounded, structuredClone(bounded))).toEqual({ match: true });
      for (const [change, path] of [
        [(result: Result) => { result.events[4].viewMode = 0x100; }, '.events[4].viewMode'],
        [(result: Result) => { (result.events[5].pixel as Mutable).column = 480; }, '.events[5].pixel.column'],
        [(result: Result) => { (result.events[5].pixel as Mutable).row = -1; }, '.events[5].pixel.row'],
        [(result: Result) => { result.events[6].serial = 0; }, '.events[6].serial'],
        [(result: Result) => { (result.events[6].check as Mutable).energy = 2 ** 31; }, '.events[6].check.energy'],
        [(result: Result) => { ((result.events[9].arrival as Mutable).charge as Mutable).cost = -(2 ** 31) - 1; }, '.events[9].arrival.charge.cost'],
      ] as [(result: Result) => void, string][]) {
        expectInvalidOnEitherSide(mapWarpRun, change, path);
      }
    });

    const invalid: [string, (result: Result) => void, string][] = [
      ['a toggle that is not a boolean', (result) => { result.events[4].open = 1; }, '.events[4].open'],
      ['a fractional view mode', (result) => { result.events[4].previousViewMode = 0.5; }, '.events[4].previousViewMode'],
      ['a pixel with an extra field', (result) => { (result.events[5].pixel as Mutable).z = 0; }, '.events[5].pixel'],
      ['an icon without a kind', (result) => { delete (result.events[5].icon as Mutable).kindBit; }, '.events[5].icon.kindBit'],
      ['an unknown marker change', (result) => { result.events[5].marker = { type: 'removed', entityId: 30 }; }, '.events[5].marker.type'],
      ['a missing marker with an entity', (result) => { result.events[13].marker = { type: 'missing', entityId: 30 }; }, '.events[13].marker'],
      ['a created marker without an entity', (result) => { result.events[5].marker = { type: 'created' }; }, '.events[5].marker.entityId'],
      ['a non-finite start distance', (result) => { result.events[6].distance = Number.POSITIVE_INFINITY; }, '.events[6].distance'],
      ['a start check without its energy', (result) => { result.events[6].check = { cost: 0 }; }, '.events[6].check.energy'],
      ['a completion from another view mode', (result) => { result.events[9].previousViewMode = 8; }, '.events[9].previousViewMode'],
      ['an arrival with an extra field', (result) => { (result.events[9].arrival as Mutable).cost = 0; }, '.events[9].arrival'],
      ['an arrival snapped to entity 0', (result) => { (result.events[9].arrival as Mutable).snapped = 0; }, '.events[9].arrival.snapped'],
      ['a negative new Warp clock', (result) => { (result.events[9].arrival as Mutable).warpClock = -1; }, '.events[9].arrival.warpClock'],
      ['an arrival orientation of 8 items', (result) => { ((result.events[9].arrival as Mutable).orientation as number[]).pop(); }, '.events[9].arrival.orientation'],
      ['a toggle before its command\'s result', (result) => { result.events[4].commandIndex = 5; }, '.events[4].commandIndex'],
      ['a select in the player\'s update', (result) => void result.events.splice(3, 0, destinationSet(1, 2)), '.events[4]'],
      ['a second additional event of a command', (result) => void result.events.splice(6, 0, destinationSet(1, 0)), '.events[6].commandIndex'],
      ['a start after the completion', (result) => void result.events.splice(10, 0, started(1, 1)), '.events[10]'],
      ['a completion after the clearing', (result) => void result.events.splice(9, 3, result.events[10], result.events[11], result.events[9]), '.events[11]'],
      ['a completion before a depletion', (result) => void result.events.splice(8, 2, result.events[9], result.events[8]), '.events[9]'],
      ['a second completion', (result) => void result.events.splice(10, 0, completed(1, false)), '.events[10]'],
    ];

    it.each(invalid)('rejects %s on either side', (_, change, path) => {
      expectInvalidOnEitherSide(mapWarpRun, change, path);
    });
  });

  describe('P3-10 communications, docking and base events (docs/plan/p3/02/spec.md, CB-13)', () => {
    const accepted = (tick: number, commandIndex: number, commandType: string): Mutable =>
      commandResult(tick, commandIndex, { commandType, outcome: 'accepted', reason: null });
    const pageChanged = (tick: number, commandIndex: number | null): Mutable => ({ type: 'left-page-changed', tick, page: 0, previousPage: 4, commandIndex });
    const speaker = (): Mutable => ({ entityId: 4, kindBit: 15, name: { type: 'candidate', declaration: { collection: 'mission', index: 2 }, candidate: 1 } });
    const reply = (): Mutable => ({ table: 20011, face: 2, index: 3 });
    const departed = (tick: number, commandIndex: number | null): Mutable => ({
      type: 'departed', tick, playerEntityId: 1, origin: commandIndex === null ? 'automatic' : 'command', commandIndex, viewMode: 0xc, previousViewMode: 6,
      position: { x: 1, y: 2, z: 3 }, orientation: [0, 0, -1, 0, 1, 0, 1, 0, 0], wingmanEntityId: null,
    });
    const transition = (tick: number, gap: string): Mutable => ({ type: 'transition', tick, gap });
    const cancelled = (tick: number, cause: string): Mutable => ({ type: 'docking-cancelled', tick, playerEntityId: 1, dockingObject: 4, cause });
    const queued = (tick: number, overrides: Mutable = {}): Mutable => ({
      type: 'radio-queued', tick, message: reply(), callback: 'docking-reply', speaker: speaker(), position: 'head', length: 1, ...overrides,
    });
    const docked = (tick: number): Mutable => ({ type: 'docked', tick, playerEntityId: 1, baseEntityId: 4, wingmanEntityId: 2, previousViewMode: 0xc });
    const started = (tick: number, frameDurations = [5, 8, 5]): Mutable =>
      ({ type: 'incoming-started', tick, message: reply(), speaker: speaker(), frameDurations, shown: true });
    const ended = (tick: number): Mutable =>
      ({ type: 'incoming-ended', tick, message: reply(), speaker: speaker(), callback: 'docking-reply', countdownStarted: true });

    /**
     * Three ticks in the contract's order. Tick 1: the mission flow's flush with its page write and the invalid-object
     * cancellation; in the player's update a menu selection with its page write and docking request, a launch and two
     * base keys; a reply queued in the object updates and taken in the communications reply; in request handling the
     * delivery, the commanded launch with its transition, the base keys and the automatic launch with its transition;
     * a tail warning queued at the end of the frame. Tick 2: the timeout in the mission flow, a docking with its
     * transition and the taken message's start. Tick 3: a gate cancellation, a queued direct message and the message's
     * end.
     */
    function communicationsRun(): Result {
      const events = [
        pageChanged(1, null),
        { type: 'radio-flushed', tick: 1, cause: 'docking-cancel', removed: 1, interrupted: 'loading' },
        cancelled(1, 'invalid-object'),
        accepted(1, 0, 'select-number'),
        pageChanged(1, 0),
        { type: 'docking-requested', tick: 1, playerEntityId: 1, dockingObject: 4, previousSubState: 0, deadlineClock: 0x782, commandIndex: 0 },
        accepted(1, 1, 'launch'),
        accepted(1, 2, 'navigate-selection'),
        accepted(1, 3, 'confirm-selection'),
        queued(1),
        { type: 'radio-taken', tick: 1, message: reply(), speaker: speaker() },
        { type: 'command-delivered', tick: 1, receiverEntityId: 4, receiverKindBit: 15, code: 9, senderEntityId: 1, commandIndex: 0 },
        departed(1, 1),
        transition(1, 'G-02/4'),
        { type: 'base-navigated', tick: 1, direction: 'next', row: null, moved: false, commandIndex: 2 },
        { type: 'base-confirmed', tick: 1, row: 3, record: 7, moved: true, commandIndex: 3 },
        departed(1, null),
        transition(1, 'G-02/4'),
        queued(1, { callback: 'none', position: 'sorted', length: 2 }),
        cancelled(2, 'timeout'),
        docked(2),
        transition(2, 'G-02/3'),
        started(2),
        cancelled(3, 'gate'),
        queued(3, { message: { table: 20983, face: null, index: 6 }, callback: 'music-step', speaker: null, position: 'sorted' }),
        ended(3),
      ];
      return { events, checkpoints: [{ tick: 0, hash: hashOf(0) }, { tick: 3, hash: hashOf(3) }], finalTick: 3 };
    }

    it('accepts and matches every type in the contract\'s order, after a JSON round trip', () => {
      const types = new Set(communicationsRun().events.map(({ type }) => type));
      expect(types.size).toBe(13 + 2);
      expect(compareReplayResults(communicationsRun(), JSON.parse(JSON.stringify(communicationsRun())))).toEqual({ match: true });
    });

    it.each([
      ['flush', 1, (event: Mutable) => { event.removed = 2; }],
      ['docking deadline', 5, (event: Mutable) => { event.deadlineClock = 0x784; }],
      ['queued speaker name', 9, (event: Mutable) => { ((event.speaker as Mutable).name as Mutable).candidate = 0; }],
      ['taken message', 10, (event: Mutable) => { (event.message as Mutable).index = 4; }],
      ['delivered code', 11, (event: Mutable) => { event.code = 7; }],
      ['launch orientation', 12, (event: Mutable) => { (event.orientation as number[])[2] = 1; }],
      ['base row', 14, (event: Mutable) => { event.row = 0; }],
      ['docked wingman', 20, (event: Mutable) => { event.wingmanEntityId = null; }],
      ['frame durations', 22, (event: Mutable) => { (event.frameDurations as number[])[1] = 7; }],
      ['cancelled docking object', 23, (event: Mutable) => { event.dockingObject = 5; }],
      ['countdown', 25, (event: Mutable) => { event.countdownStarted = false; }],
    ])('reports a different %s at its tick', (_, index, change) => {
      const actual = communicationsRun();
      change(actual.events[index]);
      expect(compareReplayResults(communicationsRun(), actual)).toEqual({ match: false, tick: actual.events[index].tick, kind: 'events' });
    });

    const invalid: [string, (result: Result) => void, string][] = [
      ['a command code of 0', (result) => { result.events[11].code = 0; }, '.events[11].code'],
      ['a command code beyond u32', (result) => { result.events[11].code = 2 ** 32; }, '.events[11].code'],
      ['a queue length of 0', (result) => { result.events[9].length = 0; }, '.events[9].length'],
      ['a queue longer than its limit', (result) => { result.events[9].length = CORE_LIMITS.radioQueueItems + 1; }, '.events[9].length'],
      ['an unknown callback', (result) => { result.events[9].callback = 'music'; }, '.events[9].callback'],
      ['an unknown queue position', (result) => { result.events[9].position = 'tail'; }, '.events[9].position'],
      ['a docking reply queued in due order', (result) => { result.events[9].position = 'sorted'; }, '.events[9].position'],
      ['another item queued at the head', (result) => { result.events[18].position = 'head'; }, '.events[18].position'],
      ['an unknown message table', (result) => { result.events[10].message = { ...reply(), table: 20012 }; }, '.events[10].message.table'],
      ['a direct message with a portrait', (result) => { (result.events[24].message as Mutable).face = 0; }, '.events[24].message.face'],
      ['a portrait message without a portrait', (result) => { result.events[10].message = { ...reply(), face: null }; }, '.events[10].message.face'],
      ['a portrait beyond the reader\'s limit', (result) => { result.events[10].message = { ...reply(), face: COMM_MESSAGES_LIMITS.faces }; }, '.events[10].message.face'],
      ['a portrait message beyond the reader\'s limit', (result) => { result.events[10].message = { ...reply(), index: COMM_MESSAGES_LIMITS.faceMessages }; },
        '.events[10].message.index'],
      ['a direct message beyond the reader\'s limit', (result) => { (result.events[24].message as Mutable).index = COMM_MESSAGES_LIMITS.directMessages; },
        '.events[24].message.index'],
      ['a speaker of an unknown name type', (result) => { result.events[10].speaker = { ...speaker(), name: { type: 'text' } }; }, '.events[10].speaker.name.type'],
      ['a speaker without a kind', (result) => { result.events[10].speaker = { entityId: 4, name: { type: 'none' } }; }, '.events[10].speaker.kindBit'],
      ['a message without frames', (result) => { result.events[22].frameDurations = []; }, '.events[22].frameDurations'],
      ['a negative frame duration', (result) => { (result.events[22].frameDurations as number[])[0] = -1; }, '.events[22].frameDurations[0]'],
      ['a message of 33 frames', (result) => { result.events[22].frameDurations = Array.from({ length: 33 }, () => 1); }, '.events[22].frameDurations'],
      ['a countdown without a docking reply', (result) => { result.events[25].callback = 'none'; }, '.events[25].countdownStarted'],
      ['a flush for an unknown cause', (result) => { result.events[1].cause = 'rescue'; }, '.events[1].cause'],
      ['a flush removing more than the queue holds', (result) => { result.events[1].removed = CORE_LIMITS.radioQueueItems + 1; }, '.events[1].removed'],
      ['a docking request from sub-state 2', (result) => { result.events[5].previousSubState = 2; }, '.events[5].previousSubState'],
      ['a cancellation for an unknown cause', (result) => { result.events[23].cause = 'refused'; }, '.events[23].cause'],
      ['a view mode beyond a byte', (result) => { result.events[20].previousViewMode = 0x100; }, '.events[20].previousViewMode'],
      ['an automatic launch with a command', (result) => { result.events[16].commandIndex = 0; }, '.events[16].commandIndex'],
      ['a commanded launch without a command', (result) => { result.events[12].commandIndex = null; }, '.events[12].commandIndex'],
      ['an unknown transition', (result) => { result.events[13].gap = 'G-02/2'; }, '.events[13].gap'],
      ['a base row of 11', (result) => { result.events[14].row = 11; }, '.events[14].row'],
      ['a confirmed row without its record', (result) => { result.events[15].record = null; }, '.events[15].record'],
      ['a docking request away from its command\'s page change', (result) => void result.events.splice(6, 0, result.events.splice(5, 1)[0]), '.events[6].commandIndex'],
      ['a docking request after another command\'s page change', (result) => { result.events[5].commandIndex = 1; }, '.events[5].commandIndex'],
      ['a delivery before its command\'s result', (result) => { result.events[11].commandIndex = 5; }, '.events[11].commandIndex'],
      ['a second request event of a command', (result) => { result.events[14].commandIndex = 0; }, '.events[14].commandIndex'],
      ['a docking followed by another event than its transition', (result) => void result.events.splice(21, 1), '.events[21]'],
      ['a launch without its transition at the end of its tick', (result) => void result.events.splice(17, 2), '.events[16]'],
      ['a transition without a docking or launch', (result) => void result.events.splice(19, 0, transition(2, 'G-02/3')), '.events[19]'],
      ['a transition of the other gap', (result) => { result.events[13].gap = 'G-02/3'; }, '.events[13]'],
      ['an event between a launch and its transition', (result) => void result.events.splice(13, 0, instantiated(1, 9)), '.events[13]'],
      ['a third launch', (result) => void result.events.splice(18, 0, departed(1, null), transition(1, 'G-02/4')), '.events[18]'],
      ['a third transition', (result) => void result.events.splice(18, 0, docked(1), transition(1, 'G-02/3')), '.events[19]'],
      ['a second docking', (result) => void result.events.splice(22, 0, docked(2), transition(2, 'G-02/3')), '.events[22]'],
      ['a take after request handling', (result) => void result.events.splice(11, 0, result.events.splice(10, 1)[0]), '.events[11]'],
      ['a second take', (result) => void result.events.splice(11, 0, { ...result.events[10] }), '.events[11]'],
      ['a start in the tick of a take', (result) => void result.events.splice(19, 0, started(1)), '.events[19]'],
      ['an end in the tick of a take', (result) => void result.events.splice(19, 0, ended(1)), '.events[19]'],
      ['a start after the end', (result) => void result.events.splice(22, 0, ended(2)), '.events[23]'],
      ['an end of a message that started in its tick with frames that take time', (result) => void result.events.splice(23, 0, ended(2)), '.events[23]'],
      ['an end of another message than the one started in its tick', (result) => {
        (result.events[22].frameDurations as number[]).fill(0);
        result.events.splice(23, 0, { ...ended(2), message: { table: 20011, face: 1, index: 3 } });
      }, '.events[23]'],
      ['a second end', (result) => void result.events.splice(26, 0, ended(3)), '.events[26]'],
      ['a clearing after an incoming message', (result) => void result.events.splice(23, 0, { type: 'target-cleared', tick: 2, playerEntityId: 1, previousTarget: 4,
        cause: 'base-view' }), '.events[23]'],
      ['a third flush', (result) => void result.events.splice(2, 0, { ...result.events[1] }, { ...result.events[1] }), '.events[3]'],
      ['an invalid-object cancellation without its flush', (result) => void result.events.splice(1, 1), '.events[1]'],
      ['a flush after the commands', (result) => void result.events.splice(2, 0, ...result.events.splice(1, 2)), '.events[2]'],
      ['a second cancellation in the mission flow', (result) => void result.events.splice(20, 0, cancelled(2, 'timeout')), '.events[20]'],
      ['a mission-flow cancellation after the commands', (result) => void result.events.splice(4, 0, cancelled(1, 'timeout')), '.events[4]'],
      ['a second gate cancellation', (result) => void result.events.splice(24, 0, cancelled(3, 'gate')), '.events[24]'],
    ];

    it.each(invalid)('rejects %s on either side', (_, change, path) => {
      expectInvalidOnEitherSide(communicationsRun, change, path);
    });

    it('accepts two flushes, a message of 32 frames, and a message of frames without time that starts and ends in one tick', () => {
      const result = communicationsRun();
      result.events.splice(2, 0, { ...result.events[1] });
      // 23 after the insertion: the start of tick 2.
      result.events[23].frameDurations = Array.from({ length: 32 }, () => 0x7fffffff);
      const instant = communicationsRun();
      instant.events[22].frameDurations = [0, 0, 0];
      instant.events.splice(23, 0, { ...ended(2), callback: 'none', countdownStarted: false });
      instant.events.pop();
      for (const run of [result, instant]) expect(compareReplayResults(run, structuredClone(run))).toEqual({ match: true });
      // The comm-messages reader never gives a message more frames than an event may carry.
      expect(COMM_MESSAGES_LIMITS.frames).toBeLessThanOrEqual(32);
    });

    it('leaves queuing unordered, in every stage', () => {
      const result = communicationsRun();
      result.events.unshift(queued(1, { length: 3 }));
      result.events.splice(result.events.indexOf(eventAt(result, 1, 'radio-taken')) + 1, 0, queued(1, { length: 4 }));
      expect(compareReplayResults(result, structuredClone(result))).toEqual({ match: true });
    });
  });

  describe('P3-08 wingman command and transponder events (docs/plan/p3/02/spec.md, CR-22)', () => {
    const consumed = (tick: number, overrides: Mutable = {}): Mutable => ({
      type: 'wingman-command-consumed', tick, wingmanEntityId: 2, code: 1, issuedTick: 1, path: 'active', outcome: 'applied', replyLine: 0x10, ...overrides,
    });
    const deployed = (tick: number, overrides: Mutable = {}): Mutable => ({
      type: 'transponder-deployed', tick, entityId: 9, creatorEntityId: 1, position: { x: 1, y: -15, z: 2 }, orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      ...overrides,
    });
    const accepted = (tick: number, commandIndex: number): Mutable => commandResult(tick, commandIndex, { outcome: 'accepted', reason: null });

    /**
     * Two ticks in the contract's order. Tick 1: the delivery's command and its delivery in request handling. Tick 2:
     * two commands, the wingman consuming the command in the object updates after its reply's queuing, a second
     * wingman's parked consumption, and one transponder deployment in request handling.
     */
    function aiRun(): Result {
      const events = [
        accepted(1, 0),
        { type: 'command-delivered', tick: 1, receiverEntityId: 2, receiverKindBit: 1, code: 1, senderEntityId: 1, commandIndex: 0 },
        accepted(2, 0),
        accepted(2, 1),
        { type: 'radio-queued', tick: 2, message: { table: 20985, face: 1, index: 4 }, callback: 'none', speaker: null, position: 'sorted', length: 1 },
        consumed(2),
        consumed(2, { wingmanEntityId: 3, code: 3, path: 'parked', outcome: 'refused', replyLine: null }),
        deployed(2),
      ];
      return { events, checkpoints: [{ tick: 0, hash: hashOf(0) }, { tick: 2, hash: hashOf(2) }], finalTick: 2 };
    }

    it('accepts and matches both types in the contract\'s order, after a JSON round trip, and compares every field', () => {
      expect(compareReplayResults(aiRun(), JSON.parse(JSON.stringify(aiRun())))).toEqual({ match: true });
      const changes: [number, (event: Mutable) => void][] = [
        [5, (event) => { event.wingmanEntityId = 4; }],
        [5, (event) => Object.assign(event, { path: 'parked' })],
        [6, (event) => Object.assign(event, { code: 4 })],
        [6, (event) => Object.assign(event, { outcome: 'applied', replyLine: 0xe })],
        [7, (event) => { event.entityId = 10; }],
        [7, (event) => { event.creatorEntityId = 2; }],
        [7, (event) => { (event.position as Mutable).y = -16; }],
        [7, (event) => { (event.orientation as number[])[8] = -1; }],
      ];
      for (const [index, change] of changes) {
        const actual = aiRun();
        change(actual.events[index]);
        expect(compareReplayResults(aiRun(), actual)).toEqual({ match: false, tick: 2, kind: 'events' });
      }
      // The issuing tick is compared too.
      const later = { ...aiRun(), finalTick: 3, checkpoints: [{ tick: 0, hash: hashOf(0) }, { tick: 3, hash: hashOf(3) }] };
      for (const event of later.events) if (event.tick === 2) event.tick = 3;
      const issued = structuredClone(later);
      issued.events[5].issuedTick = 2;
      expect(compareReplayResults(later, issued)).toEqual({ match: false, tick: 3, kind: 'events' });
    });

    // The outcomes and reply lines of WB3 and WB4, as CR-22's table gives them.
    it.each([
      ['active', 1, 'applied', 0x10], ['active', 1, 'fallback', 0], ['active', 1, 'refused', 0],
      ['active', 2, 'applied', 3], ['active', 2, 'refused', 0], ['active', 3, 'applied', 0xe],
      ['active', 4, 'applied', 0x14], ['active', 4, 'fallback', 0], ['active', 5, 'applied', 0x12], ['active', 5, 'fallback', 0],
      ['active', 6, 'applied', 0x12], ['active', 6, 'fallback', 0x15],
      ['parked', 1, 'applied', 0x10], ['parked', 1, 'refused', 0], ['parked', 2, 'acknowledged', 3], ['parked', 2, 'refused', 0],
      ['parked', 3, 'applied', 0xe], ['parked', 3, 'refused', null], ['parked', 4, 'applied', 0xe], ['parked', 4, 'refused', null],
      ['parked', 5, 'applied', 0x12], ['parked', 5, 'refused', 0], ['parked', 6, 'applied', 0x12], ['parked', 6, 'refused', 0x15],
      ['active', 7, 'status', 0xb], ['parked', 7, 'status', 0xd], ['active', 8, 'unknown-code', 3], ['parked', 0xffffffff, 'unknown-code', 3],
    ] as const)('accepts %s code %d %s with reply line %s', (path, code, outcome, replyLine) => {
      const result = aiRun();
      Object.assign(result.events[5], { path, code, outcome, replyLine });
      expect(compareReplayResults(result, structuredClone(result))).toEqual({ match: true });
    });

    const invalid: [string, (result: Result) => void, string][] = [
      ['a command code of 0', (result) => { result.events[5].code = 0; }, '.events[5].code'],
      ['an unknown path', (result) => { result.events[5].path = 'docked'; }, '.events[5].path'],
      ['an unknown outcome', (result) => { result.events[5].outcome = 'ignored'; }, '.events[5].outcome'],
      ['a reply line beyond a byte', (result) => { result.events[5].replyLine = 0x100; }, '.events[5].replyLine'],
      ['an active fallback of code 2', (result) => void Object.assign(result.events[5], { code: 2, outcome: 'fallback', replyLine: 0 }), '.events[5].outcome'],
      ['an active acknowledgement', (result) => void Object.assign(result.events[5], { code: 2, outcome: 'acknowledged', replyLine: 3 }), '.events[5].outcome'],
      ['an active refusal without a reply', (result) => void Object.assign(result.events[5], { code: 3, outcome: 'refused', replyLine: null }), '.events[5].outcome'],
      ['another reply line', (result) => { result.events[5].replyLine = 0x11; }, '.events[5].outcome'],
      ['a parked fallback', (result) => void Object.assign(result.events[6], { code: 4, outcome: 'fallback', replyLine: 0 }), '.events[6].outcome'],
      ['a status of another code', (result) => void Object.assign(result.events[5], { outcome: 'status', replyLine: 0xb }), '.events[5].outcome'],
      ['a status line outside 0xB–0xD', (result) => void Object.assign(result.events[5], { code: 7, outcome: 'status', replyLine: 0xe }), '.events[5].outcome'],
      ['code 7 applied', (result) => void Object.assign(result.events[5], { code: 7, replyLine: 0xb }), '.events[5].outcome'],
      ['an unknown code with another line', (result) => void Object.assign(result.events[5], { code: 9, outcome: 'unknown-code', replyLine: 0 }), '.events[5].outcome'],
      ['a command issued in its tick', (result) => { result.events[5].issuedTick = 2; }, '.events[5].issuedTick'],
      ['a command issued at tick 0', (result) => { result.events[5].issuedTick = 0; }, '.events[5].issuedTick'],
      ['a second consumption of a wingman', (result) => { result.events[6].wingmanEntityId = 2; }, '.events[6].wingmanEntityId'],
      ['a consumption in request handling', (result) => void result.events.splice(5, 3, result.events[7], result.events[5], result.events[6]), '.events[6]'],
      ['a deployment before any command result', (result) => void result.events.splice(2, 0, deployed(2)), '.events[2]'],
      ['a deployment before a command result', (result) => void result.events.splice(3, 0, deployed(2)), '.events[4]'],
      ['more deployments than command results', (result) => void result.events.push(deployed(2, { entityId: 10 }), deployed(2, { entityId: 11 })), '.events[9]'],
      ['a deployment without a creator', (result) => { result.events[7].creatorEntityId = null; }, '.events[7].creatorEntityId'],
      ['a deployment with an orientation of 8 rows', (result) => { (result.events[7].orientation as number[]).pop(); }, '.events[7].orientation'],
      ['a deployment at a position that is not an f32', (result) => { (result.events[7].position as Mutable).z = 0.1; }, '.events[7].position.z'],
      ['a deployment with an orientation that is not an f32', (result) => { (result.events[7].orientation as number[])[4] = 0.1; }, '.events[7].orientation[4]'],
    ];

    it.each(invalid)('rejects %s on either side', (_, change, path) => {
      expectInvalidOnEitherSide(aiRun, change, path);
    });
  });

  describe('P3-11 mission flow, loss, rescue, result and teardown events (docs/plan/p3/02/spec.md, ME-13)', () => {
    const point = () => ({ x: 1, y: -2, z: 0.5 });
    const orientation = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const summary = (): Mutable => ({ mission: 'mission/first-campaign', trigger: 1, range: 7 });
    const pageChanged = (tick: number): Mutable => ({ type: 'left-page-changed', tick, page: 0, previousPage: 5, commandIndex: null });
    const flushed = (tick: number, cause: string): Mutable => ({ type: 'radio-flushed', tick, cause, removed: 0, interrupted: 'none' });
    const hit = (tick: number, victimEntityId: number, victimKindBit: number): Mutable => ({
      type: 'hit', tick, victimEntityId, victimKindBit, victimPosition: point(), cause: 'collision', sourceEntityId: null, attacker: { type: 'none' }, damage: 40,
      gated: false, shield: { before: 0, after: 0 }, hull: { before: 10, after: -30 }, shieldWasEmpty: true, impact: null, projectile: null,
    });
    const destroyed = (tick: number, entityId: number, kindBit: number): Mutable => ({
      type: 'object-destroyed', tick, entityId, kindBit, source: null, position: point(), activity: 'active', attacker: { type: 'none' }, eventClass: 1,
      outcome: 'explodes',
    });
    const destroyedLoss = (tick: number): Mutable =>
      ({ type: 'player-loss-started', tick, playerEntityId: 1, loss: 'destroyed', previousSubState: 0, previousViewMode: 0xc, viewSwitched: true });
    const energyLoss = (tick: number): Mutable =>
      ({ type: 'player-loss-started', tick, playerEntityId: 1, loss: 'energy', previousSubState: 0, deadlineClock: 0x3c6 });
    const weaponSelected = (tick: number): Mutable => ({ type: 'weapon-selected', tick, entityId: 1, list: 0, index: 0, mount: 1, changed: true, commandIndex: null });
    const rescued = (tick: number, loss: string, overrides: Mutable = {}): Mutable => ({
      type: 'player-rescued', tick, playerEntityId: 1, loss, rescues: 1, baseEntityId: 4, candidates: 2, position: point(), orientation: orientation(), ...overrides,
    });
    const result = (overrides: Mutable = {}): Mutable => ({
      outcome: 'success', reason: { type: 'all-clear' }, summary: summary(), rescuesUsed: 2,
      endingGaps: [{ gap: 'G-02/8', variant: 'solo' }, { gap: 'G-02/9', row: 16 }], playerKills: 9, latchTick: 8, ...overrides,
    });
    const settlement = (tick: number, overrides: Mutable = {}): Mutable =>
      ({ type: 'settlement-started', tick, outcome: 'success', summary: summary(), summarySelector: 16, dueClock: 0x14a, ...overrides });

    /**
     * Nine ticks in the contract's order. Tick 1: the wingman loss message queued and its timer's expiry in the mission
     * flow; the player's destruction with its flush and loss, the wingman's with its timer, and a world exit with the
     * all-clear. Tick 2: the escape pod's expiry and the rescue's weapon selection, rescue and G-02/5. Tick 3: the beacon
     * and the energy loss in the energy stage. Tick 4: the beacon's expiry in the mission flow, its rescue and G-02/6.
     * Tick 5: the settlement; tick 6 its deferral; tick 7 the completion message; tick 8 the result's due, its latch, a
     * command ignored after it and the teardown; tick 9 the completion.
     */
    function missionRun(): Result {
      const events = [
        { type: 'radio-queued', tick: 1, message: { table: 20983, face: null, index: 6 }, callback: 'none', speaker: null, position: 'sorted', length: 1 },
        { type: 'wingman-loss-timer-expired', tick: 1, queued: true },
        hit(1, 1, 0),
        destroyed(1, 1, 0),
        pageChanged(1),
        flushed(1, 'player-destroyed'),
        destroyedLoss(1),
        hit(1, 2, 1),
        destroyed(1, 2, 1),
        { type: 'wingman-loss-timer-started', tick: 1, wingmanEntityId: 2, dueClock: 0x782 },
        { type: 'object-left-world', tick: 1, entityId: 5, kindBit: 7, source: null },
        { type: 'all-clear', tick: 1, entityId: 5, kindBit: 7, eventClass: 2 },
        { type: 'fragment-expired', tick: 2, entityId: 12, sourceKindBit: 0, part: 0, position: point(), outcome: 'escape-pod' },
        weaponSelected(2),
        rescued(2, 'destroyed'),
        { type: 'transition', tick: 2, gap: 'G-02/5' },
        { type: 'flight-message', tick: 3, message: 'beacon' },
        energyLoss(3),
        pageChanged(4),
        flushed(4, 'beacon-expired'),
        weaponSelected(4),
        rescued(4, 'energy', { rescues: 2, baseEntityId: null, candidates: 0 }),
        { type: 'transition', tick: 4, gap: 'G-02/6' },
        settlement(5),
        { type: 'settlement-deferred', tick: 6, dueClock: 0x28a },
        pageChanged(7),
        flushed(7, 'completion-message'),
        { type: 'flight-message', tick: 7, message: 'missionComplete' },
        pageChanged(8),
        flushed(8, 'result-due'),
        { type: 'result-latched', tick: 8, result: result() },
        commandResult(8, 0, { commandType: 'fire', outcome: 'ignored', reason: 'mission-ended' }),
        { type: 'teardown-started', tick: 8, entities: 3 },
        { type: 'mission-completed', tick: 9, outcome: 'success' },
      ];
      return { events, checkpoints: [{ tick: 0, hash: hashOf(0) }, { tick: 9, hash: hashOf(9) }], finalTick: 9 };
    }

    it('accepts and matches every type in the contract\'s order, after a JSON round trip', () => {
      const types = new Set(missionRun().events.map(({ type }) => type));
      expect([...types].filter((type) => [
        'all-clear', 'settlement-started', 'settlement-deferred', 'flight-message', 'player-loss-started', 'player-rescued', 'result-latched',
        'teardown-started', 'mission-completed', 'wingman-loss-timer-started', 'wingman-loss-timer-expired',
      ].includes(String(type)))).toHaveLength(11);
      expect(compareReplayResults(missionRun(), JSON.parse(JSON.stringify(missionRun())))).toEqual({ match: true });
    });

    it.each([
      ['loss view', 6, (event: Mutable) => { event.previousViewMode = 0x11; }],
      ['wingman due clock', 9, (event: Mutable) => { event.dueClock = 0x784; }],
      ['rescue position', 14, (event: Mutable) => { (event.position as Mutable).z = 2000.5; }],
      ['rescue orientation', 14, (event: Mutable) => { (event.orientation as number[])[0] = -1; }],
      ['beacon deadline', 17, (event: Mutable) => { event.deadlineClock = 0x3c8; }],
      ['settlement range', 23, (event: Mutable) => { (event.summary as Mutable).range = 6; }],
      ['deferred due clock', 24, (event: Mutable) => { event.dueClock = 0x28c; }],
      ['result kills', 30, (event: Mutable) => { (event.result as Mutable).playerKills = 10; }],
      ['result ending', 30, (event: Mutable) => { ((event.result as Mutable).endingGaps as Mutable[])[0].variant = 'wingman'; }],
      ['teardown entities', 32, (event: Mutable) => { event.entities = 2; }],
    ])('reports a different %s at its tick', (_, index, change) => {
      const actual = missionRun();
      change(actual.events[index]);
      expect(compareReplayResults(missionRun(), actual)).toEqual({ match: false, tick: actual.events[index].tick, kind: 'events' });
    });

    it('accepts the bounds of selectors, indexes, rescues and ending gaps, and two losses in one tick', () => {
      const accepts = (change: (result: Result) => void): void => {
        const changed = missionRun();
        change(changed);
        expect(compareReplayResults(changed, structuredClone(changed))).toEqual({ match: true });
      };
      for (const summarySelector of [13, 19, 0, -0x80]) accepts((run) => { run.events[23].summarySelector = summarySelector; });
      accepts((run) => Object.assign(run.events[23], { outcome: 'failure', summary: null, summarySelector: -1 }));
      accepts((run) => Object.assign(run.events[23], { summary: null, summarySelector: -1 }));
      accepts((run) => { (run.events[23].summary as Mutable).trigger = 0; (run.events[23].summary as Mutable).range = 0; });
      // A success without a mission cutscene has its one gap; a failed settlement's is destroyed, a third loss's its loss.
      accepts((run) => { run.events[30].result = result({ endingGaps: [{ gap: 'G-02/8', variant: 'wingman' }], rescuesUsed: 0, summary: null }); });
      accepts((run) => {
        run.events[30].result = result({
          outcome: 'failure', reason: { type: 'settlement-failed' }, summary: null, endingGaps: [{ gap: 'G-02/7', variant: 'destroyed' }],
        });
        run.events[33].outcome = 'failure';
      });
      // A third energy loss latches after the beacon's flush; a third destruction at the escape pod's expiry.
      accepts((run) => {
        run.events[29].cause = 'beacon-expired';
        run.events[30].result = result({
          outcome: 'failure', reason: { type: 'third-loss', loss: 'energy' }, summary: null, endingGaps: [{ gap: 'G-02/7', variant: 'energy' }],
        });
        run.events[33].outcome = 'failure';
      });
      accepts((run) => {
        const latch = { ...run.events[30], result: result({
          outcome: 'failure', reason: { type: 'third-loss', loss: 'destroyed' }, summary: null, endingGaps: [{ gap: 'G-02/7', variant: 'destroyed' }],
        }) };
        run.events.splice(28, 4, commandResult(8, 0, { commandType: 'fire' }), { ...run.events[12], tick: 8 }, latch);
        run.events[32].outcome = 'failure';
      });
      // The destruction and the energy entries in one tick: two losses, the limit.
      accepts((run) => void run.events.splice(16, 0, hit(3, 1, 0), destroyed(3, 1, 0), pageChanged(3), flushed(3, 'player-destroyed'), destroyedLoss(3)));
      accepts((run) => Object.assign(run.events[6], { previousSubState: 1 }));
      // The destruction view kept, from view 0x11 with sub-mode 8.
      accepts((run) => Object.assign(run.events[6], { previousViewMode: 0x11, viewSwitched: false }));
      accepts((run) => { run.events[14].candidates = CORE_LIMITS.entities; });
      accepts((run) => { run.events[32].entities = CORE_LIMITS.entities; });
      accepts((run) => { (run.events[30].result as Mutable).playerKills = 0x7fffffff; });
    });

    const invalid: [string, (result: Result) => void, string][] = [
      ['a radio flush of an unknown cause', (run) => { run.events[5].cause = 'player-rescued'; }, '.events[5].cause'],
      ['an all-clear of a kind outside the entry set', (run) => { run.events[11].kindBit = 1; }, '.events[11].kindBit'],
      ['an all-clear of another object', (run) => { run.events[11].entityId = 6; }, '.events[11]'],
      ['an all-clear of a destruction class', (run) => { run.events[11].eventClass = 1; }, '.events[11]'],
      ['an all-clear without its object event', (run) => void run.events.splice(10, 1), '.events[10]'],
      ['a destruction loss without its flush', (run) => void run.events.splice(5, 1), '.events[5]'],
      ['a destruction loss from sub-state 2', (run) => { run.events[6].previousSubState = 2; }, '.events[6].previousSubState'],
      ['a destruction loss with a beacon deadline', (run) => { run.events[6].deadlineClock = 0; }, '.events[6]'],
      ['an energy loss from sub-state 3', (run) => { run.events[17].previousSubState = 3; }, '.events[17].previousSubState'],
      ['an energy loss without its beacon', (run) => void run.events.splice(16, 1), '.events[16]'],
      ['a third loss in a tick', (run) => void run.events.splice(
        16, 0, hit(3, 1, 0), destroyed(3, 1, 0), pageChanged(3), flushed(3, 'player-destroyed'), destroyedLoss(3),
        hit(3, 3, 0), destroyed(3, 3, 0), flushed(3, 'player-destroyed'), { ...destroyedLoss(3), playerEntityId: 3 },
      ), '.events[26]'],
      ['a destruction loss of another player entity', (run) => { run.events[6].playerEntityId = 3; }, '.events[6]'],
      ['a destruction loss apart from the destruction', (run) => void run.events.splice(4, 0, { ...run.events[0], length: 2 }), '.events[7]'],
      ['a kept view outside view 0x11', (run) => { run.events[6].viewSwitched = false; }, '.events[6].viewSwitched'],
      ['a wingman timer after another kind\'s destruction', (run) => {
        Object.assign(run.events[7], { victimKindBit: 7 });
        Object.assign(run.events[8], { kindBit: 7 });
      }, '.events[9]'],
      ['a wingman timer apart from its destruction', (run) => void run.events.splice(9, 0, pageChanged(1)), '.events[10]'],
      ['a queued expiry without its message', (run) => void run.events.splice(0, 1), '.events[0]'],
      ['a rescue without its transition', (run) => void run.events.splice(15, 1), '.events[14]'],
      ['a destruction rescue with G-02/6', (run) => { run.events[15].gap = 'G-02/6'; }, '.events[15]'],
      ['a transition without its event', (run) => void run.events.splice(14, 1), '.events[14]'],
      ['a third rescue', (run) => { run.events[21].rescues = 3; }, '.events[21].rescues'],
      ['a rescue base without candidates', (run) => { run.events[21].baseEntityId = 4; }, '.events[21].baseEntityId'],
      ['a rescue with more candidates than entities', (run) => { run.events[14].candidates = CORE_LIMITS.entities + 1; }, '.events[14].candidates'],
      ['a summary selector of 12', (run) => { run.events[23].summarySelector = 12; }, '.events[23].summarySelector'],
      ['a summary selector of 20', (run) => { run.events[23].summarySelector = 20; }, '.events[23].summarySelector'],
      ['a summary selector below an i8', (run) => { run.events[23].summarySelector = -0x81; }, '.events[23].summarySelector'],
      ['a selector without a summary', (run) => { run.events[23].summary = null; }, '.events[23].summarySelector'],
      ['a failed settlement with a summary', (run) => { run.events[23].outcome = 'failure'; }, '.events[23].summary'],
      ['a summary of a third trigger', (run) => { (run.events[23].summary as Mutable).trigger = 2; }, '.events[23].summary.trigger'],
      ['a summary of a ninth range', (run) => { (run.events[23].summary as Mutable).range = 8; }, '.events[23].summary.range'],
      ['a summary of another Asset kind', (run) => { (run.events[23].summary as Mutable).mission = 'data/first-campaign'; }, '.events[23].summary.mission'],
      ['a summary of an invalid Asset ID', (run) => { (run.events[23].summary as Mutable).mission = 'Mission'; }, '.events[23].summary.mission'],
      ['a second settlement in a tick', (run) => void run.events.splice(24, 0, settlement(5)), '.events[24]'],
      ['a completion message without its flush', (run) => void run.events.splice(26, 1), '.events[26]'],
      ['a result latched in another tick', (run) => { (run.events[30].result as Mutable).latchTick = 7; }, '.events[30].result.latchTick'],
      ['an all-clear reason for a failure', (run) => { (run.events[30].result as Mutable).outcome = 'failure'; }, '.events[30].result.reason.type'],
      ['a failure with a summary', (run) => { run.events[30].result = result({ outcome: 'failure', reason: { type: 'settlement-failed' } }); }, '.events[30].result.summary'],
      ['a third loss with one rescue used', (run) => {
        run.events[30].result = result({
          outcome: 'failure', reason: { type: 'third-loss', loss: 'energy' }, summary: null, rescuesUsed: 1, endingGaps: [{ gap: 'G-02/7', variant: 'energy' }],
        });
      }, '.events[30].result.rescuesUsed'],
      ['three rescues used', (run) => { (run.events[30].result as Mutable).rescuesUsed = 3; }, '.events[30].result.rescuesUsed'],
      ['a third loss of another variant', (run) => {
        run.events[30].result = result({
          outcome: 'failure', reason: { type: 'third-loss', loss: 'energy' }, summary: null, endingGaps: [{ gap: 'G-02/7', variant: 'destroyed' }],
        });
      }, '.events[30].result.endingGaps'],
      ['a success without G-02/8 first', (run) => { ((run.events[30].result as Mutable).endingGaps as Mutable[]).reverse(); }, '.events[30].result.endingGaps'],
      ['a mission cutscene without a summary', (run) => { (run.events[30].result as Mutable).summary = null; }, '.events[30].result.endingGaps[1]'],
      ['a mission cutscene row of 12', (run) => { ((run.events[30].result as Mutable).endingGaps as Mutable[])[1].row = 12; }, '.events[30].result.endingGaps[1].row'],
      ['three ending gaps', (run) => { ((run.events[30].result as Mutable).endingGaps as Mutable[]).push({ gap: 'G-02/9', row: 13 }); }, '.events[30].result.endingGaps'],
      ['negative kills', (run) => { (run.events[30].result as Mutable).playerKills = -1; }, '.events[30].result.playerKills'],
      ['kills beyond an i32', (run) => { (run.events[30].result as Mutable).playerKills = 0x80000000; }, '.events[30].result.playerKills'],
      ['a teardown of more entities than the limit', (run) => { run.events[32].entities = CORE_LIMITS.entities + 1; }, '.events[32].entities'],
      ['a latch without its due flush', (run) => { run.events[29].cause = 'beacon-expired'; }, '.events[30]'],
      ['a third energy loss after the result\'s due', (run) => {
        run.events[30].result = result({
          outcome: 'failure', reason: { type: 'third-loss', loss: 'energy' }, summary: null, endingGaps: [{ gap: 'G-02/7', variant: 'energy' }],
        });
      }, '.events[30]'],
      ['a latch without its teardown', (run) => void run.events.splice(32, 1), '.events[30]'],
      ['a teardown without a latch', (run) => void run.events.splice(30, 1), '.events[31]'],
      ['a completion of another outcome', (run) => { run.events[33].outcome = 'failure'; }, '.events[33].outcome'],
      ['a completion before the final tick', (run) => Object.assign(run, { finalTick: 10, checkpoints: [{ tick: 0, hash: hashOf(0) }, { tick: 10, hash: hashOf(10) }] }), '.finalTick'],
      ['a result latched after request handling', (run) => void run.events.splice(30, 0, { type: 'energy-depleted', tick: 8, entityId: 1, kindBit: 0, position: point() }), '.events[31]'],
      ['a teardown before the commands', (run) => void run.events.splice(31, 2, run.events[32], run.events[31]), '.events[32]'],
      ['a completion in the teardown\'s tick', (run) => { run.events[33].tick = 8; }, '.events[33]'],
      ['an event after the completion', (run) => void run.events.push({ type: 'flight-message', tick: 9, message: 'beacon' }), '.events[34]'],
      ['a docking request from sub-state 2', (run) => void run.events.splice(31, 1, commandResult(8, 0, { commandType: 'select-number', outcome: 'accepted', reason: null }),
        pageChanged(8), { ...pageChanged(8), commandIndex: 0 },
        { type: 'docking-requested', tick: 8, playerEntityId: 1, dockingObject: 4, previousSubState: 2, deadlineClock: 0x782, commandIndex: 0 }), '.events[34].previousSubState'],
    ];

    it.each(invalid)('rejects %s on either side', (_, change, path) => {
      expectInvalidOnEitherSide(missionRun, change, path);
    });
  });
});
