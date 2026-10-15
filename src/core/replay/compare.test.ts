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
});
