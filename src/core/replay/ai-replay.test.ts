import { describe, expect, it } from 'vitest';
import { mount } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent } from '../contracts/domain-events.ts';
import type { Command, TickInput } from '../contracts/tick-input.ts';
import {
  aiProgramsContent, asCreateInput, commMenusContent, commMessagesContent, craftInfoContent, declaration, missionFrame, worldInput,
} from '../world/create-world.test-support.ts';
import { tickInput } from '../world/world.test-support.ts';
import { compareReplayResults } from './compare.ts';
import { createRecordingSession, GAME_REPLAY_VERSION, type Recording } from './recording.ts';
import { replayRecord } from './replay.ts';
import { contentOf, gameplayDigest, PRODUCER, recordScript, roundTrip } from './replay.test-support.ts';
import { RULES_VERSION } from './rules-version.ts';
import { snapshotHash, snapshotText, type GameSnapshot } from './snapshot.ts';

// P3-08 AC-11 (docs/plan/p3/08/spec.md, 验证策略; docs/plan/p3/02/spec.md, CR-25): the standard recording of a world
// whose AI runs on its own, replayed with the unmodified replayRecord after a JSON round trip. The run takes only normal
// TickInput; nothing writes the world state and no internal request is posted from outside. The internal-request tests
// (ai-commands.test.ts's deliveries, motion-replay.test.ts's stand-ins) are mechanism evidence and do not count here.
//
// Synthetic content only (code-generated, never original data). The player (entity 1) faces two kind-7 hostiles 750
// ahead (3, 4) and has a friendly base of kind 17 (5) beside it; two kind-8 hostiles (6, 7) wait parked far away at
// runtime (33750, 33750); the wingman (2) is roster entry 0. Table record 0 runs the interpreter for kinds 7 and 8
// (DFPG 0, its distances moved to 800 and 400 so the state machine changes state as they close in); the wingman and the
// base run their built-in handlers. The hostiles and the wingman carry a fixed gun, the base two automatic mounts and a
// fixed one, the player a fast fixed gun. The player's Warp costs almost nothing and its transit lasts F(0.5 × 1).
//
// Normal input: the wingman is ordered to attack (menu code 1) at tick 20, the player fires at 30 and 50 and drops a
// transponder (`b`) at 40; the map opens, a destination near the far hostiles is chosen and the map closes at 200–202;
// the wingman is ordered to that destination (code 6, a Warp departure) at 205; the player Warps there at 300, which
// parks the near objects and brings the far hostiles in, whose controllers are installed again.

const PLAYER = 1;
const WINGMAN = 2;
const NEAR_HOSTILES = [3, 4];
const BASE = 5;
const FAR_HOSTILES = [6, 7];

const ORDER_TICK = 20;
const DROP_TICK = 40;
const DEPART_TICK = 205;
const WARP_TICK = 300;
const TICKS = 420;

function aiCraftInfo() {
  const info = craftInfoContent();
  Object.assign(info.guns[0], { at08: 100, at24: 3200, at2C: 3 });
  Object.assign(info.guns[1], { at08: 2000, at14: 8, at18: 5, at1C: 10, at24: 160, at28: 0 });
  for (const kindBit of [1, 7, 8]) Object.assign(info.craft[kindBit], { mounts: [mount({ weapon: 0, at20: 0, at34: 0 })], mountLists: [[0], [], []] });
  const automatic = () => mount({ weapon: 0, at20: 0, at24: [0, 0, 0], at34: 0 });
  Object.assign(info.craft[17], { mounts: [automatic(), automatic(), mount({ weapon: 1, at20: 0, at34: 0 })], mountLists: [[2], [], []] });
  Object.assign(info.craft[0], {
    pairs: [{ at00: 1_000_000, at04: 1 }], at74: 100, at9C: 400, atA8: 1, mounts: [mount({ weapon: 1, at20: 0, at34: 0 })], mountLists: [[0], [], []],
  });
  return info;
}

function aiPrograms() {
  const programs = aiProgramsContent();
  Object.assign(programs.entries[0], { at10: 800, at14: 400 });
  return programs;
}

function aiMission() {
  const mission = missionFrame();
  mission.declarations = [
    declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
    declaration(1, { craftType: 7, position: { x: 100, y: 200, z: 400 } }),
    declaration(2, { craftType: 7, position: { x: 160, y: 200, z: 400 } }),
    declaration(3, { craftType: 17, position: { x: 300, y: 200, z: 200 }, nameCandidates: ['base-a'] }),
    declaration(4, { craftType: 8, position: { x: 18_000, y: 18_000, z: 0 } }),
    declaration(5, { craftType: 8, position: { x: 18_060, y: 18_000, z: 0 } }),
  ];
  return mission;
}

const frames = (...frameDurations: number[]) => ({ present: true, frameDurations });

/** The wingman's replies (table 20985) have every line for its face 2, so each reply queues. */
function aiMessages() {
  const messages = commMessagesContent();
  messages.faceTables[2] = Array.from({ length: 5 }, () => Array.from({ length: 0x17 }, () => frames(2))) as never;
  return messages;
}

const INPUT = asCreateInput(worldInput({
  mission: aiMission(), craftInfo: aiCraftInfo(), aiPrograms: aiPrograms(), commMessages: aiMessages(), commMenus: commMenusContent(), run: { wingman: 0 },
}));
const CONTENT = contentOf(INPUT);

const open: Command = { type: 'communications', operation: 'open' };
const digit = (value: number): Command => ({ type: 'select-number', value });
/** P3-10's menu: page 2 → the wingman (key 1), page 4 → code `code`. */
const order = (code: number): Command[] => [open, digit(1), digit(code)];
const fire: Command = { type: 'fire', channel: 'primary' };
/** Map pixel (350, 350): runtime (33,750 + 112.5, 33,750 + 112.5), beside the far hostiles. */
const FAR_POINT: Command = { type: 'map-point', operation: 'select', right: 350.5 / 400, down: 350.5 / 400 };

const COMMANDS: Readonly<Record<number, readonly Command[]>> = {
  [ORDER_TICK]: order(1),
  30: [fire],
  [DROP_TICK]: [{ type: 'drop-transponder' }],
  50: [fire],
  200: [{ type: 'toggle-map' }],
  201: [FAR_POINT],
  202: [{ type: 'toggle-map' }],
  [DEPART_TICK]: order(6),
  [WARP_TICK]: [{ type: 'request-warp' }],
};
const aiScript = (tick: number): TickInput => tickInput(COMMANDS[tick] ?? []);

/** The run with a checkpoint every tick, reading projection, Render State and snapshot after every step. */
function recordReading(): { readonly recording: Recording; readonly snapshots: readonly GameSnapshot[] } {
  const session = createRecordingSession(INPUT, { producer: PRODUCER, checkpointInterval: 1 });
  const snapshots: GameSnapshot[] = [];
  for (let tick = 1; tick <= TICKS; tick++) {
    session.step(aiScript(tick));
    session.projection();
    session.renderState();
    snapshots.push(session.snapshot());
  }
  return { recording: session.exportRecording(), snapshots };
}

const READ = recordReading();
const RECORDING = READ.recording;
const { events } = RECORDING.result;

type SnapshotEntity = GameSnapshot['state']['entities'][number];
const stateAt = (tick: number) => READ.snapshots[tick - 1].state;
const entityAt = (tick: number, id: number): SnapshotEntity => stateAt(tick).entities.find((entity) => entity.id === id)!;
const controllerAt = (tick: number, id: number) => {
  const { program } = entityAt(tick, id).ai;
  return program.type === 'none' ? null : program.controller;
};
/** The handler an entity's controller runs, `none` without a program, `null` while selected but not installed. */
const handlerAt = (tick: number, id: number): string | null =>
  (entityAt(tick, id).ai.program.type === 'none' ? 'none' : (controllerAt(tick, id)?.handler ?? null));
/** An entity's distinct installed handlers over the run, in order. */
function handlersOf(id: number): string[] {
  const handlers: string[] = [];
  for (let tick = 1; tick <= TICKS; tick++) {
    const handler = handlerAt(tick, id);
    if (handler !== null && handlers.at(-1) !== handler) handlers.push(handler);
  }
  return handlers;
}
const interpreterOf = (tick: number, id: number) => {
  const controller = controllerAt(tick, id);
  return controller?.handler === 'interpreter' ? controller.interpreter : null;
};
const of = <Type extends DomainEvent['type']>(type: Type) => events.filter((event): event is Extract<DomainEvent, { type: Type }> => event.type === type);

type Mutable = Record<string, unknown>;
/** The record with tick `tick`'s commands replaced. */
function withCommands(tick: number, commands: readonly Command[]): unknown {
  const record = roundTrip(RECORDING.record) as Mutable & { ticks: Mutable[] };
  record.ticks[tick - 1] = tickInput(commands) as never;
  return record;
}

// Whole runs of 420 ticks recorded or replayed with a checkpoint every tick: 1.6–6.5 s per case alone.
describe('autonomous AI replay (P3-08 AC-11; CR-25)', { timeout: 120_000 }, () => {
  // P3-12/10 (docs/plan/p3/02/spec.md, FS-08): the presentation facts change no rule outcome or draw; the digest is the
  // one this run had before them (replay.test-support.ts).
  // P3-03 修订 4 (P3-13/11) raised the slice definition version to 7, which the synthetic identity in the snapshot carries;
  // the rules and draws are unchanged.
  // P3-13/24 gave the synthetic package the shapes of the shipped HUD content and texts (drawable by the cockpit), which
  // the synthetic identity in the snapshot carries; the rules and draws are unchanged.
  it('keeps the gameplay of the run from before P3-12\'s presentation facts', () => {
    expect(gameplayDigest(INPUT, RECORDING.record.ticks)).toBe('be030d7711f2e82d');
  });

  it('records only the normal input of the run, in the current formats', () => {
    expect(RECORDING.record).toMatchObject({ version: GAME_REPLAY_VERSION, rulesVersion: RULES_VERSION, checkpointInterval: 1 });
    expect(RECORDING.record.ticks).toEqual(Array.from({ length: TICKS }, (_, index) => aiScript(index + 1)));
    expect(RECORDING.result.finalTick).toBe(TICKS);
  });

  it('selects and fires on its own: the hostiles take the player before any input and shoot, the base shoots automatically', () => {
    // Tick 2, the first callbacks: no command has been given yet.
    for (const id of NEAR_HOSTILES) {
      expect(entityAt(2, id).ai.objectTarget, `hostile ${id}`).toBe(PLAYER);
      expect(interpreterOf(2, id)?.execution, `hostile ${id}`).not.toBeNull();
    }
    const shots = of('shot-fired');
    for (const id of NEAR_HOSTILES) expect(shots.some((shot) => shot.shooterEntityId === id && shot.trigger.type === 'ai' && shot.tick < ORDER_TICK), `hostile ${id}`).toBe(true);
    expect(shots.some((shot) => shot.shooterEntityId === BASE && shot.trigger.type === 'automatic')).toBe(true);
    for (const id of FAR_HOSTILES) expect(shots.some((shot) => shot.shooterEntityId === id && shot.trigger.type === 'ai' && shot.tick > WARP_TICK), `hostile ${id}`).toBe(true);
    // The player's own shots are its fire commands.
    expect(shots.filter(({ trigger }) => trigger.type === 'command').map(({ tick, shooterEntityId }) => [tick, shooterEntityId])).toEqual([[30, PLAYER], [50, PLAYER]]);
  });

  it('switches scripts through the parse cache: its uses always count the live execution states, and a state change releases a script', () => {
    const states: string[] = [];
    for (let tick = 1; tick <= TICKS; tick++) {
      const { ai, entities } = stateAt(tick);
      const executions = entities.flatMap(({ id }) => {
        const execution = interpreterOf(tick, id)?.execution;
        return execution ? [execution.script] : [];
      });
      const uses = new Map(ai.parseCache.map(({ script, uses }) => [script, uses]));
      const counted = new Map<number, number>();
      for (const script of executions) counted.set(script, (counted.get(script) ?? 0) + 1);
      expect(uses, `tick ${tick}`).toEqual(counted);
      const text = JSON.stringify([...uses]);
      if (states.at(-1) !== text) states.push(text);
    }
    // Two scripts (DFPG 0's every-opcode script 2 and short script 3) loaded, shared, released to nothing at the Warp
    // and loaded again by the far hostiles.
    expect(states).toEqual(['[]', '[[2,2]]', '[]', '[[2,1],[3,1]]', '[[2,2]]']);
    const changes = FAR_HOSTILES.map((id) => {
      const seen: number[] = [];
      for (let tick = WARP_TICK; tick <= TICKS; tick++) {
        const state = interpreterOf(tick, id)?.state;
        if (state !== undefined && seen.at(-1) !== state) seen.push(state);
      }
      return seen;
    });
    expect(changes.some((seen) => seen.length > 1)).toBe(true);
  });

  it('parks and installs again: the Warp parks the near objects and brings the far hostiles in; the wingman departs by Warp', () => {
    for (const id of NEAR_HOSTILES) expect(handlersOf(id), `hostile ${id}`).toEqual(['interpreter', 'parked']);
    expect(handlersOf(BASE)).toEqual(['base', 'parked']);
    for (const id of FAR_HOSTILES) {
      expect(handlersOf(id), `hostile ${id}`).toEqual(['parked', 'interpreter']);
      expect(entityAt(TICKS, id).ai.objectTarget, `hostile ${id}`).toBe(PLAYER);
    }
    expect(handlersOf(WINGMAN)).toEqual(['wingman', 'parked']);
    expect(of('warp-started').map(({ tick }) => tick)).toEqual([WARP_TICK]);
    expect(of('warp-completed')).toHaveLength(1);
  });

  it('takes P3-10\'s menu commands and the `b` drop as normal input', () => {
    expect(of('command-delivered').map(({ tick, receiverEntityId, code }) => [tick, receiverEntityId, code])).toEqual([[ORDER_TICK, WINGMAN, 1], [DEPART_TICK, WINGMAN, 6]]);
    const consumed = of('wingman-command-consumed');
    expect(consumed.map(({ issuedTick, code, path, outcome }) => [issuedTick, code, path, outcome])).toEqual([
      [ORDER_TICK, 1, 'active', 'applied'], [DEPART_TICK, 6, 'active', 'applied'],
    ]);
    // Code 1 attacks the player's target, a hostile its automatic selection took.
    const attack = consumed[0].tick;
    const target = stateAt(attack).player.target;
    expect(NEAR_HOSTILES).toContain(target);
    expect(entityAt(attack, WINGMAN).ai).toMatchObject({ mode: 0, target });
    const deployments = of('transponder-deployed');
    expect(deployments).toHaveLength(1);
    const [deployed] = deployments;
    expect(deployed).toMatchObject({ tick: DROP_TICK, creatorEntityId: PLAYER });
    expect(entityAt(DROP_TICK, deployed.entityId).transponder).toMatchObject({ creator: 'player' });
  });

  it('reproduces every event and the snapshot at every checkpoint after a JSON round trip', () => {
    const { record, result } = roundTrip(RECORDING) as Recording;
    const replayed = replayRecord(record, roundTrip(CONTENT) as typeof CONTENT);
    expect(replayed).toEqual(RECORDING.result);
    expect(compareReplayResults(result, replayed)).toEqual({ match: true });
    expect(replayed.checkpoints.map(({ tick }) => tick)).toEqual(Array.from({ length: TICKS + 1 }, (_, tick) => tick));
    expect(RECORDING.result.checkpoints.slice(1).map(({ hash }) => hash)).toEqual(READ.snapshots.map(snapshotHash));
  });

  it('gives the same record and result whether projection, Render State and snapshot are read every tick, now and then or never', () => {
    expect(recordScript(INPUT, TICKS, 1, aiScript)).toEqual(RECORDING);
    const session = createRecordingSession(INPUT, { producer: PRODUCER, checkpointInterval: 16 });
    for (let tick = 1; tick <= TICKS; tick++) {
      session.step(aiScript(tick));
      if (tick % 7 === 0) session.projection();
      if (tick % 13 === 0) {
        session.renderState();
        session.snapshot();
        session.projection();
      }
    }
    const sparse = session.exportRecording();
    expect(sparse.record).toEqual({ ...RECORDING.record, checkpointInterval: 16 });
    expect(sparse.result.events).toEqual(RECORDING.result.events);
    const hashes = new Map(RECORDING.result.checkpoints.map(({ tick, hash }) => [tick, hash]));
    for (const { tick, hash } of sparse.result.checkpoints) expect(hash, `tick ${tick}`).toBe(hashes.get(tick));
  });

  it('writes the AI state the coming ticks read, and no static AI data', () => {
    // Between the departure order's delivery and its consumption the wingman holds it.
    const consumed = of('wingman-command-consumed')[1].tick;
    expect(consumed).toBeGreaterThan(DEPART_TICK + 1);
    expect(entityAt(DEPART_TICK + 1, WINGMAN).ai.pendingCommand).toEqual({ code: 6, issuedTick: DEPART_TICK });
    expect(entityAt(consumed, WINGMAN).ai.pendingCommand).toBeNull();
    const tick = ORDER_TICK;
    const state = stateAt(tick);
    expect(Object.keys(state.ai)).toEqual(['friendlyFire', 'parseCache']);
    expect(state.objectSets.hostile).toEqual(expect.arrayContaining(NEAR_HOSTILES));
    expect(entityAt(tick, NEAR_HOSTILES[0]).mapVisible).toBeTypeOf('boolean');
    const interpreter = interpreterOf(tick, NEAR_HOSTILES[0])!;
    expect(Object.keys(interpreter.execution!)).toEqual(['script', 'item', 'variables', 'timers', 'returnStack', 'wait', 'hold']);
    const text = snapshotText(READ.snapshots[tick - 1]);
    for (const key of ['stateScripts', 'installScript', 'keywordTables', 'tablePrograms', 'thresholdsSquared']) expect(text.includes(`"${key}"`), key).toBe(false);
  });

  it('diverges at the first tick an input the AI reads changes', () => {
    const cases: [number, readonly Command[]][] = [[ORDER_TICK, order(5)], [DROP_TICK, []], [DEPART_TICK, []], [WARP_TICK, []]];
    for (const [tick, commands] of cases) {
      expect(compareReplayResults(RECORDING.result, replayRecord(withCommands(tick, commands), CONTENT)), `tick ${tick}`).toEqual({ match: false, tick, kind: 'events' });
    }
  });
});
