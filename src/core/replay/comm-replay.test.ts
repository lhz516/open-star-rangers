import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import type { Command, TickInput } from '../contracts/tick-input.ts';
import { CoreFaultError, CoreInputError } from '../errors.ts';
import type * as Pipeline from '../systems/pipeline.ts';
import type { Request } from '../systems/pipeline.ts';
import { initialWorldState } from '../world/create-world.ts';
import {
  asCreateInput, commMenusContent, commMessagesContent, craftInfoContent, declaration, missionFrame, worldInput, type WorldInputParts,
} from '../world/create-world.test-support.ts';
import { constructWorld } from '../world/world.ts';
import { expectFault, thrownBy, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { compareReplayResults } from './compare.ts';
import { createRecordingSession, GAME_REPLAY_VERSION, type Recording, type RecordingSession } from './recording.ts';
import { replayRecord } from './replay.ts';
import { contentOf, PRODUCER, roundTrip } from './replay.test-support.ts';
import { RULES_VERSION } from './rules-version.ts';
import { snapshotHash, type GameSnapshot } from './snapshot.ts';

/**
 * A watch on the formal step's first change, registerTick: it counts the ticks begun, and while `prefill` is set it
 * puts that many placeholder events and no-op requests ahead of the rules' and lists the requests the tick posts.
 */
const PIPELINE_HOOK = vi.hoisted(() => ({
  registered: 0,
  prefill: null as { readonly events: number; readonly requests: number } | null,
  posted: [] as Request[],
}));

vi.mock('../systems/pipeline.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof Pipeline>();
  return {
    ...actual,
    registerTick(world: WorldState, input: TickInput): Pipeline.TickContext {
      PIPELINE_HOOK.registered++;
      const context = actual.registerTick(world, input);
      const { prefill } = PIPELINE_HOOK;
      if (prefill === null) return context;
      for (let index = 0; index < prefill.events; index++) context.events.push({ type: 'speed-assist-released', tick: context.time.tick });
      for (let index = 0; index < prefill.requests; index++) context.requests.post({ type: 'leave', entityId: Number.MAX_SAFE_INTEGER });
      for (const method of ['post', 'defer'] as const) {
        const original = context.requests[method].bind(context.requests);
        context.requests[method] = (request: Request) => {
          PIPELINE_HOOK.posted.push(request);
          original(request);
        };
      }
      return context;
    },
  };
});

// P3-10 AC-12 (docs/plan/p3/10/spec.md, S-01 and 持久化与兼容; docs/plan/p3/02/spec.md, CB-16): synthetic runs
// (code-generated content and inputs, never original data) recorded and replayed through the formal entries. The
// docking run docks twice and launches twice in one world; the flood run fills the radio queue to its limit with
// status replies. A tick is the default 2 clock units.

const open: Command = { type: 'communications', operation: 'open' };
const digit = (value: number): Command => ({ type: 'select-number', value });
const LAUNCH: Command = { type: 'launch' };
const BASE_KEYS: readonly Command[] = [{ type: 'navigate-selection', direction: 'next' }, { type: 'confirm-selection' }];

const frames = (...frameDurations: number[]) => ({ present: true, frameDurations });

/**
 * The communications messages with five base faces (the base pool's size), each with the docking reply at index 0 and
 * the status reply at index 1: 3 + 9 and `status` eighths.
 */
function messagesContent(status: readonly number[]) {
  const messages = commMessagesContent();
  messages.faceTables[0] = Array.from({ length: 5 }, () => [frames(3, 9), frames(...status)]) as never;
  return messages;
}

/**
 * The synthetic craft info with the player and the base kinds 17 and 18 without speed, so nothing moves: the bases'
 * +0xB8 is 0; the player's is the smallest positive f32 (2^-149), positive as P3-09's Warp check requires (MW-01 check
 * 4), whose movement in a tick rounds to 0.
 */
function stillCraftInfo() {
  const info = craftInfoContent();
  for (const kindBit of [17, 18]) info.craft[kindBit].atB8 = 0;
  info.craft[0].atB8 = 2 ** -149;
  return info;
}

const input = (mission: ReturnType<typeof missionFrame>, status: readonly number[], parts: WorldInputParts = {}) =>
  asCreateInput(worldInput({ mission, commMessages: messagesContent(status), craftInfo: stillCraftInfo(), ...parts }));

// ---- The docking run --------------------------------------------------------------------------------------------

/**
 * The player at runtime (187.5, 375, 0); base A of kind 18 (category N, key 2) 375 ahead of it, within the docking
 * range; base B of kind 17 (category B, key 1) out of the player's range at the start but 61 from where launching
 * from A places the player (1000 along A's row 1). Kind 17 is walked before 18, so B never stands in A's docking.
 */
function dockingMission() {
  const mission = missionFrame();
  mission.declarations = [
    declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
    declaration(1, { craftType: 18, position: { x: 100, y: 200, z: 200 }, nameCandidates: ['base-a'] }),
    declaration(2, { craftType: 17, position: { x: -300, y: 600, z: 200 }, nameCandidates: ['base-b'] }),
  ];
  return mission;
}

const DOCKING_INPUT = input(dockingMission(), [2, 2]);
const DOCKING_CONTENT = contentOf(DOCKING_INPUT);
const PLAYER = 1;
const BASE_A = 2;
const BASE_B = 3;

interface Reading {
  readonly recording: Recording;
  /** The session's snapshot after every tick, tick 1 first. */
  readonly snapshots: readonly GameSnapshot[];
}

/**
 * Records the docking run, choosing each tick's commands from the events so far; the record keeps the inputs. Tick 4
 * asks both bases for their status in one batch; ticks 60–62 open the menu, choose A and request docking one key per
 * tick. Five ticks after each docking come two base keys, 30 after it the launch. Three ticks after the first launch
 * one batch requests docking at B; the run ends 10 ticks after the second launch. Every tick reads the projection,
 * the Render State and the snapshot.
 */
function recordDocking(): Reading {
  const session = createRecordingSession(DOCKING_INPUT, { producer: PRODUCER, checkpointInterval: 1 });
  const script = new Map<number, readonly Command[]>([
    [4, [open, digit(1), digit(1), open, digit(2), digit(1)]],
    [60, [open]],
    [61, [digit(2)]],
    [62, [digit(2)]],
  ]);
  const snapshots: GameSnapshot[] = [];
  let launches = 0;
  let end = 2000;
  for (let tick = 1; tick <= end; tick++) {
    for (const event of session.step(tickInput(script.get(tick) ?? []))) {
      if (event.type === 'docked') {
        script.set(tick + 5, BASE_KEYS);
        script.set(tick + 30, [LAUNCH]);
      } else if (event.type === 'departed' && ++launches === 1) {
        script.set(tick + 3, [open, digit(1), digit(2)]);
      } else if (event.type === 'departed') {
        end = tick + 10;
      }
    }
    session.projection();
    session.renderState();
    snapshots.push(session.snapshot());
  }
  return { recording: session.exportRecording(), snapshots };
}

const READ = recordDocking();
const RECORDING = READ.recording;
const TICKS = RECORDING.record.ticks.length;

const of = <Type extends DomainEvent['type']>(type: Type) =>
  RECORDING.result.events.filter((event): event is Extract<DomainEvent, { type: Type }> => event.type === type);
const ticksOf = (type: DomainEvent['type']): number[] => of(type).map(({ tick }) => tick);

type Mutable = Record<string, unknown>;

function expectRejected(work: () => unknown, path: string, reason?: string): void {
  const error = thrownBy(work);
  expect(error).toBeInstanceOf(CoreInputError);
  expect(error).toMatchObject(reason === undefined ? { path } : { path, reason });
}

/** A JSON copy of `recording`'s record, changed by `change`. */
function recordWith(change: (record: Mutable & { ticks: Mutable[] }) => void, recording: Recording = RECORDING): unknown {
  const record = roundTrip(recording.record) as Mutable & { ticks: Mutable[] };
  change(record);
  return record;
}

type Reader = (session: RecordingSession) => void;

/** Each read entry alone and all of them; replayRecord, which reads nothing, covers no reads. */
const READERS: Readonly<Record<string, Reader>> = {
  projection: (session) => void session.projection(),
  renderState: (session) => void session.renderState(),
  snapshot: (session) => void session.snapshot(),
  'all, in reverse order': (session) => {
    session.snapshot();
    session.renderState();
    session.projection();
  },
};

/**
 * Steps `inputs` on a new session of the docking run's input, calling `read` after every `group` ticks and after each
 * tick that ends in a `transition`, there `hold` times more, as a Runtime that ends a frame at a transition and holds
 * at a placeholder of that length would.
 */
function rerun(inputs: readonly TickInput[], read: Reader, group: number, hold: number): Recording {
  const session = createRecordingSession(DOCKING_INPUT, { producer: PRODUCER, checkpointInterval: 1 });
  inputs.forEach((given, index) => {
    const transition = session.step(given).some(({ type }) => type === 'transition');
    const reads = transition ? 1 + hold : Number((index + 1) % group === 0);
    for (let count = 0; count < reads; count++) read(session);
  });
  return session.exportRecording();
}

// Whole runs of several hundred ticks: like the other limit-sized replay tests, longer than the default timeout under load.
describe('communications replay (P3-10 AC-12, CB-16)', { timeout: 60_000 }, () => {
  it('runs the docking chain twice in one world: wait, reply, countdown, docking, base keys and launch', () => {
    expect(of('docking-requested').map(({ tick, dockingObject, previousSubState }) => [tick, dockingObject, previousSubState])).toEqual([
      [62, BASE_A, 0], [ticksOf('departed')[0] + 3, BASE_B, 0],
    ]);
    expect(of('command-delivered').map(({ receiverEntityId, code }) => [receiverEntityId, code])).toEqual([
      [BASE_B, 7], [BASE_A, 7], [BASE_A, 9], [BASE_B, 9],
    ]);
    expect(of('radio-queued').map(({ callback, position }) => [callback, position])).toEqual([
      ['none', 'sorted'], ['none', 'sorted'], ['docking-reply', 'head'], ['docking-reply', 'head'],
    ]);
    expect(of('incoming-ended').map(({ callback, countdownStarted }) => [callback, countdownStarted])).toEqual([
      ['none', false], ['none', false], ['docking-reply', true], ['docking-reply', true],
    ]);
    expect(of('docked').map(({ baseEntityId, playerEntityId }) => [baseEntityId, playerEntityId])).toEqual([[BASE_A, PLAYER], [BASE_B, PLAYER]]);
    expect(of('departed').map(({ origin, viewMode, previousViewMode }) => [origin, viewMode, previousViewMode])).toEqual([
      ['command', 0xc, 6], ['command', 0xc, 6],
    ]);
    // Each docking and launch is followed at once by its transition, and nothing cancels a docking.
    expect(of('transition').map(({ tick, gap }) => [tick, gap])).toEqual([
      [ticksOf('docked')[0], 'G-02/3'], [ticksOf('departed')[0], 'G-02/4'], [ticksOf('docked')[1], 'G-02/3'], [ticksOf('departed')[1], 'G-02/4'],
    ]);
    expect(ticksOf('docking-cancelled')).toEqual([]);
    expect(ticksOf('base-navigated')).toEqual(ticksOf('docked').map((tick) => tick + 5));
    expect(ticksOf('base-confirmed')).toEqual(ticksOf('docked').map((tick) => tick + 5));
    // The countdown after each reply is 0x200 units, 256 ticks.
    expect(ticksOf('docked')).toEqual(of('incoming-ended').filter(({ countdownStarted }) => countdownStarted).map(({ tick }) => tick + 257));
  });

  it('reproduces every event and the snapshot at every checkpoint after a JSON round trip', () => {
    const { record, result } = roundTrip(RECORDING) as Recording;
    const replayed = replayRecord(record, DOCKING_CONTENT);
    expect(replayed).toEqual(RECORDING.result);
    expect(compareReplayResults(result, replayed)).toEqual({ match: true });
    expect(replayed.checkpoints.map(({ tick }) => tick)).toEqual(Array.from({ length: TICKS + 1 }, (_, tick) => tick));
    expect(RECORDING.result.checkpoints.slice(1).map(({ hash }) => hash)).toEqual(READ.snapshots.map(snapshotHash));
  });

  it('has every new future-relevant state in its checkpoints (CB-16): menus, sub-states and deadlines, pose, service, queue, channel, faces and commands', () => {
    const states = READ.snapshots.map(({ state }) => state);
    const at = (tick: number) => states[tick - 1];
    const has = (name: string, test: (state: (typeof states)[number]) => boolean) => expect(states.some(test), name).toBe(true);
    // The menu one key per tick: its levels, the partner and the saved page.
    expect(at(60).player.communications.menu).toMatchObject({ level: 2, table: 'categories' });
    expect(at(61).player.communications).toMatchObject({ menu: { level: 4, table: 'gated' }, partner: BASE_A, menuSavedPage: 0 });
    expect(at(62).player.communications.menu).toBeNull();
    // The delivered command waits in its receiver until the receiver's next update.
    expect(at(62).entities.find(({ id }) => id === BASE_A)?.ai.pendingCommand).toEqual({ code: 9, issuedTick: 62 });
    expect(at(63).entities.find(({ id }) => id === BASE_A)?.ai.pendingCommand).toBeNull();
    // Both status replies queued at tick 5, one taken: the other waits in the queue while the first loads, then plays.
    expect(at(5).communications.queue).toHaveLength(1);
    expect(at(5).communications.channel.phase).toBe('loading');
    expect(at(6).communications.channel.phase).toBe('playing');
    has('both base faces taken', ({ communications }) => communications.facePools.base.filter(Boolean).length === 2);
    has('a face on each base', ({ entities }) => entities.filter(({ communications }) => communications.face !== null).length === 2);
    has('the incoming page', ({ player }) => player.leftDisplay.page === 5);
    // Each sub-state of the docking wait with its deadline and object, the saved pose and the base service.
    for (const subState of [3, 4, 5] as const) has(`sub-state ${subState}`, ({ flow, player }) => flow.subState === subState && player.dockingObject !== null);
    expect(new Set(states.map(({ flow }) => flow.dockingDeadline)).size).toBeGreaterThanOrEqual(5);
    has('a saved pose', ({ player }) => player.docking.savedPose !== null);
    has('a moved service row', ({ baseService }) => baseService !== null && baseService.cursor === 1);
    expect(at(ticksOf('departed')[1]).baseService).toBeNull();
  });

  // Reads after every tick, every 5, 60 or all ticks, holding 0 to 300 more at each transition.
  it.each([
    ['projection', 1, 0],
    ['renderState', 1, 0],
    ['snapshot', 5, 30],
    ['all, in reverse order', 60, 300],
    ['all, in reverse order', TICKS, 1],
  ] as const)('gives the same record and result whatever reads of %s, every %i ticks and %i more at a transition, hold or group the ticks (P3-04 运行中衔接)', (name, group, hold) => {
    const variant = rerun(RECORDING.record.ticks, READERS[name], group, hold);
    expect(variant.result).toEqual(RECORDING.result);
    expect(variant.record).toEqual(RECORDING.record);
  });

  it('diverges at the first tick a communications input changes', () => {
    const second = ticksOf('docking-requested')[1];
    const noRequest = replayRecord(recordWith(({ ticks }) => { ticks[second - 1] = tickInput() as never; }), DOCKING_CONTENT);
    expect(compareReplayResults(RECORDING.result, noRequest)).toEqual({ match: false, tick: second, kind: 'events' });
    const launch = ticksOf('departed')[0];
    const late = replayRecord(recordWith(({ ticks }) => { [ticks[launch - 1], ticks[launch]] = [ticks[launch], ticks[launch - 1]]; }), DOCKING_CONTENT);
    expect(compareReplayResults(RECORDING.result, late)).toEqual({ match: false, tick: launch, kind: 'events' });
  });

  it('reports a forged docking event and a forged checkpoint at their tick', () => {
    const [docked] = ticksOf('docked');
    const forged = roundTrip(RECORDING.result) as { events: Mutable[]; checkpoints: Mutable[] };
    forged.events.find(({ type }) => type === 'docked')!.baseEntityId = BASE_B;
    expect(compareReplayResults(RECORDING.result, forged)).toEqual({ match: false, tick: docked, kind: 'events' });
    const checkpoint = roundTrip(RECORDING.result) as { checkpoints: { tick: number; hash: string }[] };
    checkpoint.checkpoints[docked].hash = '0000000000000000';
    expect(compareReplayResults(RECORDING.result, checkpoint)).toEqual({ match: false, tick: docked, kind: 'checkpoint' });
  });
});

// ---- The flood run ----------------------------------------------------------------------------------------------

const BASES = 9;
const RADIO_ITEMS = CORE_LIMITS.radioQueueItems;

/** The player at runtime (187.5, 375, 0) and nine bases of kind 17, the most a category may list, all out of its range. */
function floodMission() {
  const mission = missionFrame();
  mission.declarations = [
    declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
    ...Array.from({ length: BASES }, (_, index) =>
      declaration(index + 1, { craftType: 17, position: { x: 1000 + 100 * index, y: 200, z: 1000 }, nameCandidates: [`base-${index}`] })),
  ];
  return mission;
}

/** A status reply far longer than the run: the channel takes the first and is busy from then on. */
const FLOOD_INPUT = input(floodMission(), [1_000_000]);
const FLOOD_CONTENT = contentOf(FLOOD_INPUT);

/** Status requests to the first `count` bases of category B, wrapping: open, B, the base, status, one command each. */
const statusRequests = (count: number): Command[] =>
  Array.from({ length: count }, (_, index) => [open, digit(1), digit((index % BASES) + 1), digit(1)]).flat();

/** Sixteen status requests, 64 commands: the most a tick takes. */
const FULL_TICK = CORE_LIMITS.commandsPerTick / 4;

/**
 * Tick 3 makes sixteen status requests, of which each base keeps the last it receives. From then on every tick asks
 * each base once, and as the queue nears its limit only as many as fill it exactly. Requests delivered in one tick are
 * answered in the next; the first answer is taken and plays for the rest of the run.
 */
function recordFlood() {
  const session = createRecordingSession(FLOOD_INPUT, { producer: PRODUCER, checkpointInterval: 1000 });
  let length = 0;
  let pending = 0;
  for (let tick = 1; tick <= RADIO_ITEMS; tick++) {
    const requests = tick < 3 ? 0 : Math.min(BASES, RADIO_ITEMS - length - pending);
    for (const event of session.step(tickInput(statusRequests(tick === 3 ? FULL_TICK : requests)))) {
      if (event.type === 'radio-queued') length = event.length;
      if (event.type === 'radio-taken') length--;
    }
    pending = requests;
    if (length === RADIO_ITEMS) return { session, recording: session.exportRecording() };
  }
  throw new Error('the flood never filled the radio queue');
}

const FLOOD = recordFlood();
const FLOOD_RECORDING = FLOOD.recording;
/** The flood's record with one status request and one tick more: its answer is the item past the limit. */
const OVER = recordWith(({ ticks }) => void ticks.push(tickInput(statusRequests(1)) as never, tickInput() as never), FLOOD_RECORDING) as Mutable & { ticks: Mutable[] };

describe('capacity and faults (P3-10 AC-12, CB-16)', { timeout: 60_000 }, () => {
  it(`fills the radio queue to ${RADIO_ITEMS} items through menus of nine objects and 64 commands in a tick, and replays it`, () => {
    const { record, result } = FLOOD_RECORDING;
    expect(record.ticks[2].commands).toHaveLength(CORE_LIMITS.commandsPerTick);
    expect(result.events.filter((event) => event.type === 'command-result' && event.tick === 3)).toHaveLength(CORE_LIMITS.commandsPerTick);
    // Digit 9 chooses the ninth base, the last generated key.
    expect(result.events.some((event) => event.type === 'command-delivered' && event.receiverEntityId === BASES + 1)).toBe(true);
    expect(result.events.findLast((event) => event.type === 'radio-queued')).toMatchObject({ length: RADIO_ITEMS });
    const final = FLOOD.session.snapshot().state;
    expect(final.communications.queue).toHaveLength(RADIO_ITEMS);
    expect(final.communications.channel.phase).toBe('playing');
    const replayed = replayRecord(roundTrip(record), FLOOD_CONTENT);
    expect(compareReplayResults(roundTrip(result), replayed)).toEqual({ match: true });
  });

  it('faults at the item past the limit rather than drop it, latching the session, and a replay of it fails whole', () => {
    const { session } = FLOOD;
    expect(session.step(tickInput(statusRequests(1)))).not.toContainEqual(expect.objectContaining({ type: 'radio-queued' }));
    const fault = expectFault(() => session.step(tickInput()), 'budget-exhausted', 'radio.queue');
    for (const call of [() => session.step(tickInput()), () => session.snapshot(), () => session.projection(), () => session.renderState(), () => session.exportRecording()]) {
      expect(thrownBy(call)).toBe(fault);
    }
    PIPELINE_HOOK.registered = 0;
    const error = thrownBy(() => replayRecord(OVER, FLOOD_CONTENT));
    // Every tick began, the last one faulting.
    expect(PIPELINE_HOOK.registered).toBe(OVER.ticks.length);
    expect(error).toBeInstanceOf(CoreFaultError);
    expect(error).toMatchObject({ code: 'budget-exhausted', site: 'radio.queue' });
  });

  // OVER would fault at its last tick; the pipeline hook shows that no tick begins.
  describe('rejection before any tick of a record that would fault', () => {
    function expectRejectedBeforeAnyTick(work: () => unknown, path: string, reason?: string): void {
      PIPELINE_HOOK.registered = 0;
      expectRejected(work, path, reason);
      expect(PIPELINE_HOOK.registered).toBe(0);
    }

    const over = (change: (record: Mutable & { ticks: Mutable[]; content: Mutable }) => void): unknown => {
      const record = roundTrip(OVER) as Mutable & { ticks: Mutable[]; content: Mutable };
      change(record);
      return record;
    };
    /** Appends a tick of `commands` after the faulting one. */
    const appendTick = (commands: readonly unknown[]) => (record: Mutable & { ticks: Mutable[] }) => void record.ticks.push(tickInput(commands as Command[]) as never);
    const appended = `record.ticks[${OVER.ticks.length}].commands[0]`;

    it.each([
      ['a later replay format', (record: Mutable) => { record.version = GAME_REPLAY_VERSION + 1; }, 'record.version'],
      ['the rules version before P3-10', (record: Mutable) => { record.rulesVersion = RULES_VERSION - 1; }, 'record.rulesVersion'],
      ['a later rules version', (record: Mutable) => { record.rulesVersion = RULES_VERSION + 1; }, 'record.rulesVersion'],
      ['another setupHash', (record: Mutable) => { record.setupHash = '0123456789abcdef'; }, 'record.setupHash'],
      ['a communications operation it does not know, after the fault', appendTick([{ type: 'communications', operation: 'toggle' }]), `${appended}.operation`],
      ['a digit out of range, after the fault', appendTick([digit(10)]), `${appended}.value`],
      ['a launch with a field, after the fault', appendTick([{ type: 'launch', base: 1 }]), appended],
      [`${CORE_LIMITS.commandsPerTick + 1} commands in a tick`, (record: Mutable & { ticks: { commands: Command[] }[] }) => {
        record.ticks[2].commands.push(open);
      }, 'record.ticks[2].commands'],
    ])('rejects %s', (_, change, path) => {
      expectRejectedBeforeAnyTick(() => replayRecord(over(change as never), FLOOD_CONTENT), path);
    });

    it('rejects another content identity, and content changed under the same identity', () => {
      const otherIdentity = { ...FLOOD_CONTENT, identity: { ...FLOOD_CONTENT.identity, manifestIdentity: 'manifest:other' } };
      expectRejectedBeforeAnyTick(() => replayRecord(OVER, otherIdentity as never), 'record.content', 'must be the identity of the replayed content');
      // The status reply an eighth longer; the far menu's status item asking for docking instead.
      const menus = commMenusContent();
      menus.otherTargetCommands[0].command = 9;
      const forgeries: WorldInputParts[] = [{ commMessages: messagesContent([1_000_001]) }, { commMenus: menus }];
      for (const parts of forgeries) {
        const forged = input(floodMission(), [1_000_000], parts);
        expect(forged.identity).toEqual(FLOOD_INPUT.identity);
        expectRejectedBeforeAnyTick(() => replayRecord(OVER, contentOf(forged)), 'record.setupHash', 'must be the setup hash of the replayed content');
      }
    });

    it('rejects content with a tenth base in the category, which no generated key reaches, at the content', () => {
      const mission = floodMission();
      mission.declarations.push(declaration(10, { craftType: 17, position: { x: 0, y: 0, z: 2000 }, nameCandidates: ['base-9'] }));
      expectRejectedBeforeAnyTick(() => replayRecord(OVER, contentOf(input(mission, [1_000_000]))), 'content.commMenus.content.categories[1].kindMask');
    });
  });

  /**
   * The world of the docking run just before `tick`, whose step of `tick` gets `events` placeholder events and
   * `requests` no-op requests ahead of the rules' (PIPELINE_HOOK); the step returns the rules' events and requests.
   */
  function prefilledStep(tick: number, events: number, requests: number) {
    const world = constructWorld(initialWorldState(DOCKING_INPUT));
    for (const earlier of RECORDING.record.ticks.slice(0, tick - 1)) world.step(earlier);
    const step = () => {
      PIPELINE_HOOK.prefill = { events, requests };
      PIPELINE_HOOK.posted = [];
      try {
        return { events: world.step(RECORDING.record.ticks[tick - 1]).slice(events), posted: PIPELINE_HOOK.posted.map(({ type }) => type) };
      } finally {
        PIPELINE_HOOK.prefill = null;
      }
    };
    return { world, step };
  }

  // The docking request batch (menu events and a delivery), a docking and a launch, each against both budgets.
  const BUDGETS = [
    ['events', CORE_LIMITS.eventsPerTick, 'pipeline.events'],
    ['requests', CORE_LIMITS.requestsPerTick, 'pipeline.requests'],
  ] as const;
  const BUDGET_CASES = [ticksOf('docking-requested')[1], ticksOf('docked')[0], ticksOf('departed')[0]].flatMap((tick) => BUDGETS.map((budget) => [tick, ...budget] as const));

  it.each(BUDGET_CASES)('counts the P3-10 work of tick %i against the %s budget of %i: exactly full passes, one more faults and latches', (tick, budget, limit, site) => {
    const prefilled = (count: number) => prefilledStep(tick, budget === 'events' ? count : 0, budget === 'requests' ? count : 0);
    const alone = prefilled(0).step();
    expect(alone.events).toEqual(RECORDING.result.events.filter((event) => event.tick === tick));
    // Each of these ticks posts its own P3-10 request: a delivery, a docking or a launch.
    expect(alone.posted).toContainEqual(expect.stringMatching(/^(deliver-command|dock|depart)$/));
    const own = budget === 'events' ? alone.events.length : alone.posted.length;
    expect(prefilled(limit - own).step()).toEqual(alone);
    const over = prefilled(limit - own + 1);
    const fault = expectFault(over.step, 'budget-exhausted', site);
    for (const call of [() => over.world.step(tickInput()), () => over.world.snapshot(), () => over.world.projection(), () => over.world.renderState()]) {
      expect(thrownBy(call)).toBe(fault);
    }
  });
});
