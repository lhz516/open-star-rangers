import { describe, expect, it } from 'vitest';
import { isWingmanCommandReply, type DomainEvent, type WingmanCommandConsumedEvent } from '../contracts/domain-events.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import { compareReplayResults } from '../replay/compare.ts';
import { createRecordingSession, type Recording } from '../replay/recording.ts';
import { replayRecord } from '../replay/replay.ts';
import { contentOf, PRODUCER, roundTrip } from '../replay/replay.test-support.ts';
import type { GameSnapshot } from '../replay/snapshot.ts';
import { initialWorldState } from '../world/create-world.ts';
import { mount } from '../../content/rule-data/rule-data.test-support.ts';
import { asCreateInput, commMenusContent, commMessagesContent, craftInfoContent, menuText, worldInput } from '../world/create-world.test-support.ts';
import type { Entity } from '../world/entity-table.ts';
import { constructWorld, type World } from '../world/world.ts';
import { entityInit, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { RandStream } from '../rules/original-random.ts';
import { randValues } from '../rules/rand.test-support.ts';
import { updateController } from './ai.ts';
import { applyShotHit } from './damage.ts';
import { PIPELINE, registerTick, type RequestOf } from './pipeline.ts';

// P3-08/20's contract and joint tests (docs/plan/p3/08/spec.md, 僚机命令, AC-08; docs/plan/p3/02/spec.md, CR-18, CR-22,
// CR-27, CR-28): P3-10's menu delivers through `deliver-command` (CB-08), request handling writes the single slot, the
// wingman's handler consumes it in a later object update (active `0x614a8`, parked `0x61f20`) and replies through
// P3-10's `queueLine` (CB-06). Expectations come from the WB2–WB5 records and CR-22's table, not from the modules.
//
// Synthetic content only (code-generated, never original data): the default slice-shaped world of
// create-world.test-support.ts with roster entry 0 as the wingman (entity 2, kind bit 1, face 2), the player (entity 1),
// two active kind-7 hostiles (3, 4) and four active bases of kind 17 (5–8, walk order). The wingman's reply table 20985
// has every line for every face, so each reply call queues. The wingman's craft has one list-0 gun (gun 0: speed 100),
// which its pursuit's lead needs. The menus are commMenusContent()'s with an extra wingman item
// '8' → code 8, so every code reaches the wingman through the menu: on page 2 the wingman category is key 1 and the
// bases' key 2, and with one wingman page 4 follows at once, where key n is code n; the four bases get the object list
// page 3 first.
//
// The internal-request tests post `deliver-command` on the tick's own request queue before the real request handling;
// they are mechanism evidence only, never a replay record (CR-28). The joint run uses normal TickInput menu commands and
// is replayed with the unmodified replayRecord; it is not the production menu's browser loop (P3-15).

const WINGMAN = 2;
const HOSTILES = [3, 4] as const;
const FIRST_BASE = 5;
/** The friendly-fire threshold AICO +0x28 of the synthetic programs. */
const THRESHOLD = 4;

const open: Command = { type: 'communications', operation: 'open' };
const digit = (value: number): Command => ({ type: 'select-number', value });
/** Page 2 → the wingman (key 1), page 4 → code `code`. */
const order = (code: number): Command[] => [open, digit(1), digit(code)];
/** Page 2 → the bases (key 2, or key 1 without a wingman), page 3 → the first base, page 4 → its status, code 7. */
const baseStatus = (category: number): Command[] => [open, digit(category), digit(1), digit(1)];
const targetEnemy: Command = { type: 'target', operation: 'enemy' };
const targetNext: Command = { type: 'target', operation: 'next' };

const frames = (...frameDurations: number[]) => ({ present: true, frameDurations });

function contentParts(wingman: number | null = 0) {
  const commMessages = commMessagesContent();
  commMessages.faceTables[2] = Array.from({ length: 5 }, () => Array.from({ length: 0x17 }, () => frames(2))) as never;
  const commMenus = commMenusContent();
  commMenus.kind2TargetCommands.splice(7, 0, { text: menuText('8'), command: 8 });
  const craftInfo = craftInfoContent();
  Object.assign(craftInfo.guns[0], { at08: 100, at24: 3200 });
  Object.assign(craftInfo.craft[1], { mounts: [mount({ weapon: 0, at20: 0, at34: 0 })], mountLists: [[0], [], []] });
  return { commMessages, commMenus, craftInfo, run: { wingman } };
}

const INPUT = asCreateInput(worldInput(contentParts()));
/** The wingman's synthetic hull capacity +0x9C. */
const CAPACITY = craftInfoContent().craft[1].at9C;

function newWorld(wingman: number | null = 0): { readonly state: WorldState; readonly world: World } {
  const state = initialWorldState(asCreateInput(worldInput(contentParts(wingman))));
  const world = constructWorld(state);
  // The player is available for the menu from its first active update.
  for (let tick = 1; tick < PAUSE; tick++) world.step(tickInput());
  return { state, world };
}

const consumptions = (events: readonly DomainEvent[]) =>
  events.filter((event): event is WingmanCommandConsumedEvent => event.type === 'wingman-command-consumed');

/** Steps up to `limit` ticks until a wingman consumption, returning every event on the way. */
function stepToConsumption(world: World, limit = 200): DomainEvent[] {
  const events: DomainEvent[] = [];
  for (let tick = 0; tick < limit; tick++) {
    const stepped = world.step(tickInput());
    events.push(...stepped);
    if (consumptions(stepped).length > 0) return events;
  }
  return events;
}

/**
 * One tick through the real pipeline, with `deliveries` posted on its request queue just before request handling: the
 * internal-request stand-in for P3-10's menu (no production injection API; CR-28).
 */
function stepDelivering(state: WorldState, deliveries: readonly Omit<RequestOf<'deliver-command'>, 'type'>[]): readonly DomainEvent[] {
  const context = registerTick(state, readTickInput(tickInput()));
  for (const stage of PIPELINE) {
    context.stage = stage.id;
    if (stage.id === 'request-handling') for (const delivery of deliveries) context.requests.post({ type: 'deliver-command', ...delivery });
    stage.run?.(context);
  }
  return context.events;
}

describe('the slot from delivery to consumption, with internal deliveries (AC-08 mechanism; CR-18, WB2)', () => {
  it('stores in request handling, last write wins, and the next due update consumes only the last code, once', () => {
    const { state, world } = newWorld();
    const events = stepDelivering(state, [
      { receiver: WINGMAN, code: 3, sender: 1, commandIndex: 0 },
      { receiver: WINGMAN, code: 0xffff_ffff, sender: 1, commandIndex: 1 },
    ]);
    const tick = state.tick;
    expect(events.filter(({ type }) => type === 'command-delivered')).toHaveLength(2);
    expect(state.entities.get(WINGMAN)?.ai.pendingCommand).toEqual({ code: 0xffff_ffff, issuedTick: tick });
    expect(consumptions(events)).toEqual([]);
    const after = stepToConsumption(world);
    expect(consumptions(after)).toEqual([
      { type: 'wingman-command-consumed', tick: state.tick, wingmanEntityId: WINGMAN, code: 0xffff_ffff, issuedTick: tick, path: 'active', outcome: 'unknown-code', replyLine: 3 },
    ]);
    // The reply's radio-queued (line 3 draws 3 + rand % 2) comes just before the fact.
    const at = after.findIndex(({ type }) => type === 'wingman-command-consumed');
    expect(after[at - 1]).toMatchObject({ type: 'radio-queued', message: { table: 20985, face: 2 }, speaker: { entityId: WINGMAN } });
    expect([3, 4]).toContain((after[at - 1] as Extract<DomainEvent, { type: 'radio-queued' }>).message.index);
    expect(state.entities.get(WINGMAN)?.ai.pendingCommand).toBeNull();
    expect(consumptions(stepToConsumption(world, 100))).toEqual([]);
  });

  it('drops a delivery to a removed wingman, and a stored command goes with a wingman removed before its update: no fact', () => {
    const { state, world } = newWorld();
    stepDelivering(state, [{ receiver: WINGMAN, code: 3, sender: 1, commandIndex: 0 }]);
    state.entities.remove(state.entities.get(WINGMAN) as Entity);
    expect(consumptions(stepDelivering(state, [{ receiver: WINGMAN, code: 7, sender: 1, commandIndex: 0 }]))).toEqual([]);
    expect(consumptions(stepToConsumption(world, 100))).toEqual([]);
  });
});

describe('the reply\'s draw in the handler\'s call: installs and parked steps (WB2, WB5; CR-22)', () => {
  /** Runs `entity`'s controller call `0x20c18` alone in a fresh tick; its events. */
  function controllerTick(state: WorldState, entity: Entity): readonly DomainEvent[] {
    const context = registerTick(state, readTickInput(tickInput()));
    state.clock = context.time.clock;
    updateController(context, entity);
    return context.events;
  }

  /** The number of draws between two RNG states (the world's stream is the only one). */
  function drawsBetween(from: WorldState['rngState'], to: WorldState['rngState']): number {
    const stream = new RandStream(from);
    for (let count = 0; count < 10_000; count++) {
      if (JSON.stringify(stream.state) === JSON.stringify(to)) return count;
      stream.next();
    }
    throw new Error('not on the stream');
  }

  /**
   * Two twin worlds whose wingman gets the same controller call, one with `code` pending: the call's draws without the
   * command, and with it the reply's index, the draws and the events.
   */
  function twins(prepare: (state: WorldState, wingman: Entity) => void, code: number | null) {
    const run = (pending: number | null) => {
      const { state } = newWorld();
      const wingman = state.entities.get(WINGMAN) as Entity;
      prepare(state, wingman);
      if (pending !== null) wingman.ai.pendingCommand = { code: pending, issuedTick: state.tick };
      const start = state.rngState;
      const events = controllerTick(state, wingman);
      return { state, wingman, start, events, draws: drawsBetween(start, state.rngState) };
    };
    return { without: run(null), with: run(code) };
  }

  /** The wingman's controller removed (state 5) and then `activity`, back in state 0: its next call installs. */
  const reinstalling = (activity: 'active' | 'parked') => (state: WorldState, wingman: Entity) => {
    wingman.state = 'area-switch';
    controllerTick(state, wingman);
    Object.assign(wingman, { state: 'new', activity });
  };

  it('an active (re)install consumes the pending command in its own call: the reply\'s draw is its first, one more than without', () => {
    const { without, with: commanded } = twins(reinstalling('active'), 8);
    const facts = consumptions(commanded.events);
    expect(facts).toMatchObject([{ code: 8, path: 'active', outcome: 'unknown-code', replyLine: 3 }]);
    const queued = commanded.events.find((event) => event.type === 'radio-queued');
    expect(commanded.events.indexOf(queued!)).toBe(commanded.events.indexOf(facts[0]) - 1);
    // Nothing draws before the consumer in the install (initial behaviour and its apply draw nothing), so line 3 takes the call's first draw.
    expect(queued).toMatchObject({ message: { index: 3 + (randValues(commanded.start, 1)[0] % 2) } });
    expect(commanded.draws).toBe(without.draws + 1);
    expect(commanded.wingman.ai.pendingCommand).toBeNull();
    const controllerOf = (entity: Entity) => (entity.ai.program.type === 'none' ? null : entity.ai.program.controller);
    expect(controllerOf(commanded.wingman)).toMatchObject({ handler: 'wingman', nextUpdateClock: controllerOf(without.wingman)?.nextUpdateClock });
  });

  /** A parked wingman whose parked controller is installed and due at the next call. */
  const parkedAndDue = (state: WorldState, wingman: Entity) => {
    reinstalling('parked')(state, wingman);
    controllerTick(state, wingman);
    wingman.state = 'active';
    const { program } = wingman.ai;
    if (program.type === 'none' || program.controller?.handler !== 'parked') throw new Error('a parked controller');
    program.controller.nextUpdateClock = state.clock;
  };

  it('a parked step replies before its drop, search and final draw: one draw more than without, the reply\'s first', () => {
    const { without, with: commanded } = twins(parkedAndDue, 8);
    expect(consumptions(commanded.events)).toMatchObject([{ code: 8, path: 'parked', outcome: 'unknown-code', replyLine: 3 }]);
    const queued = commanded.events.find((event) => event.type === 'radio-queued');
    expect(queued).toMatchObject({ message: { index: 3 + (randValues(commanded.start, 1)[0] % 2) } });
    expect(commanded.draws).toBe(without.draws + 1);
  });

  it('parked codes 3 and 4 without a player clear silently: a refused fact with no line, no reply, and the unchanged step goes on', () => {
    for (const code of [3, 4]) {
      const noPlayer = (state: WorldState, wingman: Entity) => {
        parkedAndDue(state, wingman);
        state.player.entityId = null;
      };
      const { without, with: commanded } = twins(noPlayer, code);
      expect(consumptions(commanded.events)).toMatchObject([{ code, path: 'parked', outcome: 'refused', replyLine: null }]);
      expect(commanded.events.filter(({ type }) => type === 'radio-queued')).toEqual([]);
      expect(commanded.wingman.ai.pendingCommand).toBeNull();
      // Not a state change: the drop, the reveal and the search run as without the command, with the same draws and result.
      expect(commanded.draws).toBe(without.draws);
      expect(commanded.wingman.ai).toEqual({ ...without.wingman.ai });
    }
  });
});

describe('the menu chain without replay: removal, friendly fire, bases and no wingman (AC-08; CR-27, CR-28)', () => {
  it('a menu command to a wingman removed before its update has no fact and no reply', () => {
    const { state, world } = newWorld();
    world.step(tickInput(order(3)));
    expect(state.entities.get(WINGMAN)?.ai.pendingCommand).toEqual({ code: 3, issuedTick: state.tick });
    state.entities.remove(state.entities.get(WINGMAN) as Entity);
    const events = stepToConsumption(world, 100);
    expect(consumptions(events)).toEqual([]);
    expect(events.filter(({ type }) => type === 'radio-queued')).toEqual([]);
  });

  it('keeps a command while real player hits hold the accumulator above +0x28, and runs it after a new hit past the window', () => {
    const { state, world } = newWorld();
    const wingman = state.entities.get(WINGMAN) as Entity;
    const player = state.entities.get(1) as Entity;
    if (wingman.combat.type !== 'craft') throw new Error('a craft wingman');
    Object.assign(wingman.combat, { shield: 0, hull: 1000 });
    /** The player's projectile hits the wingman through P3-07's damage entry, where P3-10's `0x38f20` counts it (CB-12). */
    const hit = (damage: number): void => {
      const projectile = state.entities.allocate(entityInit(21, { combat: { type: 'projectile', gun: 0, shooter: player.id, expiry: null } }));
      const context = registerTick(state, readTickInput(tickInput()));
      applyShotHit(context, projectile, wingman, damage, null);
      state.entities.remove(projectile);
    };
    // At the threshold (3 + 1 = 4, each hit once) a command still runs.
    hit(3);
    hit(1);
    expect(state.ai.friendlyFire.accumulated).toBe(THRESHOLD);
    world.step(tickInput(order(7)));
    expect(consumptions(stepToConsumption(world))).toMatchObject([{ code: 7, outcome: 'status' }]);
    // Above it the next command waits: several due updates pass with no fact and no reply, and the wingman turns angry.
    hit(1);
    world.step(tickInput(order(3)));
    const issuedTick = state.tick;
    const blocked: DomainEvent[] = [];
    for (let tick = 0; tick < 150; tick++) blocked.push(...world.step(tickInput()));
    expect(consumptions(blocked)).toEqual([]);
    expect(blocked.filter((event) => event.type === 'radio-queued' && event.speaker?.entityId === WINGMAN)).toEqual([]);
    expect(wingman.ai.pendingCommand).toEqual({ code: 3, issuedTick });
    const { program } = wingman.ai;
    const controller = program.type === 'built-in' && program.controller?.handler === 'wingman' ? program.controller : null;
    expect(controller?.wingman.behaviour).toBe(5);
    // A hit after the window end restarts the accumulator at its damage, below the threshold: the command runs and ends the anger.
    while (state.clock <= state.ai.friendlyFire.windowEnd) world.step(tickInput());
    hit(1);
    expect(state.ai.friendlyFire.accumulated).toBe(1);
    expect(consumptions(stepToConsumption(world))).toMatchObject([{ code: 3, issuedTick, path: 'active', outcome: 'applied', replyLine: 0xe }]);
    expect(controller?.wingman.behaviour).toBe(2);
  });

  it('a base receiver is P3-10\'s: delivered and answered by the base, never a wingman fact', () => {
    const { state, world } = newWorld();
    const events = [...world.step(tickInput(baseStatus(2)))];
    expect(events.filter(({ type }) => type === 'command-delivered')).toMatchObject([{ receiverEntityId: FIRST_BASE, receiverKindBit: 17, code: 7 }]);
    for (let tick = 0; tick < 100; tick++) events.push(...world.step(tickInput()));
    expect(state.entities.get(FIRST_BASE)?.ai.pendingCommand).toBeNull();
    expect(consumptions(events)).toEqual([]);
  });

  it('without a wingman there is no wingman category, entity or fact: key 1 is the bases\'', () => {
    const { state, world } = newWorld(null);
    expect(state.entities.get(WINGMAN)?.kindBit).not.toBe(1);
    const events = [...world.step(tickInput(baseStatus(1)))];
    expect(events.filter(({ type }) => type === 'command-delivered')).toMatchObject([{ receiverKindBit: 17, code: 7 }]);
    for (let tick = 0; tick < 100; tick++) events.push(...world.step(tickInput()));
    expect(consumptions(events)).toEqual([]);
  });
});

// ---- The joint run (CR-28): menu → deliver-command → consumption → queueLine, recorded and replayed -------------

/** One scripted menu step: its batch and, on the tick after, an optional follow-up batch. */
interface Step {
  readonly name: string;
  readonly commands: readonly Command[];
  readonly next?: readonly Command[];
  /** Whether the step ends in a wingman consumption; otherwise the run moves on after a fixed pause. */
  readonly consumes: boolean;
}

const STEPS: readonly Step[] = [
  { name: 'active 1, the target changed before consumption', commands: [targetEnemy, ...order(1)], next: [targetNext], consumes: true },
  { name: 'active 2', commands: order(2), consumes: true },
  { name: 'active 4', commands: order(4), consumes: true },
  { name: 'active 5', commands: order(5), consumes: true },
  { name: 'active 7', commands: order(7), consumes: true },
  { name: 'active 8', commands: order(8), consumes: true },
  { name: 'active, two choices in one batch', commands: [...order(3), ...order(7)], consumes: true },
  { name: 'active 3', commands: order(3), consumes: true },
  { name: 'base status', commands: baseStatus(2), consumes: false },
  { name: 'map open', commands: [{ type: 'toggle-map' }], consumes: false },
  { name: 'destination', commands: [{ type: 'map-point', operation: 'select', right: 0.95, down: 0.95 }], consumes: false },
  { name: 'map closed', commands: [{ type: 'toggle-map' }], consumes: false },
  { name: 'active 6, the departure', commands: order(6), consumes: true },
  { name: 'parked 7', commands: order(7), consumes: true },
  { name: 'parked 2', commands: [targetEnemy, ...order(2)], consumes: true },
  { name: 'parked 8', commands: order(8), consumes: true },
  { name: 'parked 6', commands: order(6), consumes: true },
  { name: 'parked 4', commands: order(4), consumes: true },
  { name: 'parked 3', commands: order(3), consumes: true },
  { name: 'parked 5', commands: order(5), consumes: true },
  { name: 'parked 1', commands: [targetEnemy, ...order(1)], consumes: true },
];
const PAUSE = 4;
/** After a step without a consumption: long enough for the base's reply to finish playing on the left display. */
const LONG_PAUSE = 60;
const LIMIT = 3000;

interface Run {
  readonly recording: Recording;
  /** Snapshots after the ticks the tests read: each step's tick and the one after it, and every consumption's. */
  readonly snapshots: ReadonlyMap<number, GameSnapshot>;
  /** The tick each step's batch was sent on. */
  readonly sent: readonly number[];
}

/** Records the joint run: each step PAUSE ticks after the previous step's consumption, or LONG_PAUSE after its batch. */
function recordRun(): Run {
  const session = createRecordingSession(INPUT, { producer: PRODUCER, checkpointInterval: 50 });
  const snapshots = new Map<number, GameSnapshot>();
  const sent: number[] = [];
  let due = PAUSE;
  let follow: readonly Command[] = [];
  let waiting = false;
  for (let tick = 1; tick <= LIMIT && (sent.length < STEPS.length || waiting); tick++) {
    let commands = follow;
    follow = [];
    if (tick === due && !waiting) {
      const step = STEPS[sent.length];
      sent.push(tick);
      commands = step.commands;
      follow = step.next ?? [];
      waiting = step.consumes;
      if (!step.consumes) due = tick + LONG_PAUSE;
    }
    const events = session.step(tickInput(commands));
    const consumed = consumptions(events).length > 0;
    if (waiting && consumed) {
      waiting = false;
      due = tick + PAUSE;
    }
    if (consumed || sent.at(-1) === tick || sent.at(-1) === tick - 1) snapshots.set(tick, session.snapshot());
  }
  if (sent.length !== STEPS.length || waiting) throw new Error(`the run stopped at step ${sent.length}: ${STEPS[sent.length - 1]?.name}`);
  return { recording: session.exportRecording(), snapshots, sent };
}

describe('the joint menu → consumption → reply run, replayed (AC-08, AC-11 part; CR-28)', { timeout: 120_000 }, () => {
  const RUN = recordRun();
  const { events } = RUN.recording.result;
  const facts = consumptions(events);
  const stateAt = (tick: number) => RUN.snapshots.get(tick)!.state;
  const wingmanAt = (tick: number) => stateAt(tick).entities.find(({ id }) => id === WINGMAN)!;
  const consumingSteps = STEPS.filter(({ consumes }) => consumes);
  const factOf = (name: string) => facts[consumingSteps.findIndex((step) => step.name === name)];

  it('consumes each consuming step once, in a later tick, with an outcome and line of its code and path', () => {
    expect(facts).toHaveLength(consumingSteps.length);
    for (const fact of facts) {
      expect(isWingmanCommandReply(fact.path, fact.code, fact.outcome, fact.replyLine)).toBe(true);
      expect(fact.tick).toBeGreaterThan(fact.issuedTick);
      // The command-delivered of its issuing tick carries the same code to the same wingman.
      expect(events).toContainEqual(expect.objectContaining({ type: 'command-delivered', tick: fact.issuedTick, receiverEntityId: WINGMAN, code: fact.code }));
    }
    expect(facts.map(({ code, path }) => `${path} ${code}`)).toEqual([
      'active 1', 'active 2', 'active 4', 'active 5', 'active 7', 'active 8', 'active 7', 'active 3', 'active 6',
      'parked 7', 'parked 2', 'parked 8', 'parked 6', 'parked 4', 'parked 3', 'parked 5', 'parked 1',
    ]);
  });

  it('replies through queueLine just before each fact: radio-queued of table 20985, the wingman\'s face and the line\'s draw', () => {
    // WB5: lines 0 → rand % 3; 3, 5, 8, 0xE, 0x10 → line + rand % 2; 7 → 5 + rand % 3; the others as they are.
    const drawn = (line: number): number[] => {
      if (line === 0) return [0, 1, 2];
      if ([3, 5, 8, 0xe, 0x10].includes(line)) return [line, line + 1];
      return line === 7 ? [5, 6, 7] : [line];
    };
    for (const fact of facts) {
      const at = events.indexOf(fact);
      const queued = events[at - 1];
      expect(queued).toMatchObject({ type: 'radio-queued', tick: fact.tick, message: { table: 20985, face: 2 }, speaker: { entityId: WINGMAN } });
      expect(drawn(fact.replyLine as number)).toContain((queued as Extract<DomainEvent, { type: 'radio-queued' }>).message.index);
    }
  });

  it('the menu result, the delivery and the consumption are three facts: one command-result per command in the input tick only', () => {
    RUN.sent.forEach((tick, index) => {
      const results = events.filter((event): event is Extract<DomainEvent, { type: 'command-result' }> => event.tick === tick && event.type === 'command-result');
      expect(results).toHaveLength(STEPS[index].commands.length);
      // The menu keys are all accepted (a target command may be a no-change: the automatic selection got there first).
      for (const result of results) if (result.commandType !== 'target') expect(result).toMatchObject({ outcome: 'accepted' });
    });
    for (const fact of facts) expect(events.filter((event) => event.tick === fact.tick && event.type === 'command-result')).toEqual([]);
  });

  it('active code 1 reads the player\'s target at consumption: the target changed after the delivery is the one attacked', () => {
    const fact = factOf('active 1, the target changed before consumption');
    const [sentTick] = RUN.sent;
    const delivered = stateAt(sentTick).player.target;
    const changed = stateAt(sentTick + 1).player.target;
    expect(HOSTILES).toContain(delivered);
    expect(HOSTILES).toContain(changed);
    expect(changed).not.toBe(delivered);
    expect(fact).toMatchObject({ code: 1, path: 'active', outcome: 'applied', replyLine: 0x10 });
    expect(wingmanAt(fact.tick).ai).toMatchObject({ mode: 0, target: changed });
  });

  it('active codes take their WB3 effects: 2 marks PT and 4 clears it, 5 a base, 7 the hull\'s status, 8 nothing, 3 the formation', () => {
    const controllerAt = (tick: number) => {
      const { program } = wingmanAt(tick).ai;
      if (program.type !== 'built-in' || program.controller?.handler !== 'wingman') throw new Error('an active wingman controller');
      return program.controller.wingman;
    };
    const mark = factOf('active 2');
    expect(mark).toMatchObject({ outcome: 'applied', replyLine: 3 });
    expect(controllerAt(mark.tick).doNotAttack).toBe(stateAt(mark.tick).player.target);
    const engage = factOf('active 4');
    expect(['applied', 'fallback']).toContain(engage.outcome);
    expect(controllerAt(engage.tick).doNotAttack).toBeNull();
    expect(factOf('active 5')).toMatchObject({ outcome: 'applied', replyLine: 0x12 });
    expect(wingmanAt(factOf('active 5').tick).ai).toMatchObject({ mode: 2, target: FIRST_BASE });
    // The status line from the hull at consumption over the synthetic capacity +0x9C: ≥ 80 % 0xB, ≥ 50 % 0xC, else 0xD.
    for (const name of ['active 7', 'parked 7']) {
      const status = factOf(name);
      const { combat } = wingmanAt(status.tick);
      if (combat.type !== 'craft') throw new Error('a craft wingman');
      const percent = Math.trunc((combat.hull * 100) / CAPACITY);
      expect(status).toMatchObject({ outcome: 'status', replyLine: percent >= 80 ? 0xb : percent >= 50 ? 0xc : 0xd });
    }
    expect(factOf('active 8')).toMatchObject({ outcome: 'unknown-code', replyLine: 3 });
    expect(factOf('active 3')).toMatchObject({ outcome: 'applied', replyLine: 0xe });
    expect(wingmanAt(factOf('active 3').tick).ai).toMatchObject({ mode: 2, target: 1 });
  });

  it('two choices in one batch: both delivered, the last overwrites, only it is consumed and answered', () => {
    const index = STEPS.findIndex(({ name }) => name === 'active, two choices in one batch');
    const tick = RUN.sent[index];
    expect(events.filter((event) => event.tick === tick && event.type === 'command-delivered').map((event) => (event as { code: number }).code)).toEqual([3, 7]);
    expect(facts.filter(({ issuedTick }) => issuedTick === tick)).toMatchObject([{ code: 7, outcome: 'status' }]);
  });

  it('the base\'s status goes to the base, with no wingman fact', () => {
    const tick = RUN.sent[STEPS.findIndex(({ name }) => name === 'base status')];
    expect(events.filter((event) => event.tick === tick && event.type === 'command-delivered')).toMatchObject([{ receiverEntityId: FIRST_BASE, code: 7 }]);
    expect(facts.filter(({ issuedTick }) => issuedTick === tick)).toEqual([]);
  });

  it('code 6 with a destination outside the active area departs by Warp; the parked wingman then consumes with WB4', () => {
    const departure = factOf('active 6, the departure');
    expect(departure).toMatchObject({ outcome: 'applied', replyLine: 0x12 });
    const destination = stateAt(departure.tick).player.map.destination;
    expect(wingmanAt(departure.tick)).toMatchObject({ state: 'area-switch', ai: { mode: 2, target: null, goal: destination } });
    for (const fact of facts.filter(({ path }) => path === 'parked')) expect(wingmanAt(fact.tick).activity).toBe('parked');
    expect(factOf('parked 2')).toMatchObject({ outcome: 'acknowledged', replyLine: 3 });
    expect(factOf('parked 8')).toMatchObject({ outcome: 'unknown-code', replyLine: 3 });
    expect(factOf('parked 6')).toMatchObject({ outcome: 'applied', replyLine: 0x12 });
    expect(wingmanAt(factOf('parked 6').tick).ai).toMatchObject({ mode: 2, target: null, goal: destination });
    // Code 4 is code 3 when parked (revision ⑤): the player in mode 2, line 0xE.
    for (const name of ['parked 4', 'parked 3']) {
      expect(factOf(name)).toMatchObject({ outcome: 'applied', replyLine: 0xe });
      expect(wingmanAt(factOf(name).tick).ai).toMatchObject({ mode: 2, target: 1 });
    }
    expect(factOf('parked 5')).toMatchObject({ outcome: 'applied', replyLine: 0x12 });
    expect(wingmanAt(factOf('parked 5').tick).ai).toMatchObject({ mode: 2, target: FIRST_BASE });
    const attack = factOf('parked 1');
    expect(attack).toMatchObject({ outcome: 'applied', replyLine: 0x10 });
    expect(wingmanAt(attack.tick).ai).toMatchObject({ mode: 0, target: stateAt(attack.tick).player.target });
  });

  it('replays with the unmodified replayRecord after a JSON round trip: the same events and checkpoints', () => {
    const { record, result } = roundTrip(RUN.recording) as Recording;
    const replayed = replayRecord(record, contentOf(INPUT));
    expect(replayed).toEqual(RUN.recording.result);
    expect(compareReplayResults(result, replayed)).toEqual({ match: true });
  });
});
