import { describe, expect, it } from 'vitest';
import { mount, script, scriptItem } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent } from '../contracts/domain-events.ts';
import type { TickInput } from '../contracts/tick-input.ts';
import {
  aiProgramsContent, asCreateInput, commMenusContent, commMessagesContent, craftInfoContent, declaration, missionFrame, worldInput,
} from '../world/create-world.test-support.ts';
import { compareReplayResults } from './compare.ts';
import { createRecordingSession } from './recording.ts';
import { replayRecord } from './replay.ts';
import { contentOf, PRODUCER, roundTrip } from './replay.test-support.ts';
import type { GameSnapshot } from './snapshot.ts';

// P3-14 FA-01, FA-05 and FA-07 (docs/plan/p3/02/spec.md): a recorded run in which CR-16's AI lock update, not a test
// write, takes a hostile's missile lock 0 → 2 → 3 → 4 on the player, the tail check finds it at level 3, lights
// `attackerOnTail` and lets the wingman warn (`0x38c30`, line 0xA), replayed with the unmodified replayRecord after a
// JSON round trip. The run takes only normal TickInput. (The other formal replays carry FA-05's fields and FA-07's
// event: combat-replay.test.ts and ai-replay.test.ts.)
//
// Synthetic content only. The player (1) starts at (100, 200, 0); the wingman (2) is roster entry 0; one kind-7 hostile
// (3) starts behind the player. Table record 0 runs the interpreter for kind 7 with the AI lock switched on once at the
// install (+0x34, +0x38; +0x50 off, so that no skill adjustment switches it on again); its state-1 script waits in a
// loop. Kind 7 carries a guided missile mount in list 1 whose range (+0x44 lifetime at the body's +0xB8) covers the
// run. The player turns (yaw, then pitch) until its third row and the hostile's are aligned (dot > 0.707), so that the
// wingman's warning is not gated by the alignment; it then flies straight.

const PLAYER = 1;
const WINGMAN = 2;
const HOSTILE = 3;
const TICKS = 200;

function craftInfo() {
  const info = craftInfoContent();
  info.missiles[0].at44 = 64_000;
  for (const kindBit of [1, 7]) {
    Object.assign(info.craft[kindBit], { mounts: [mount({ weapon: 0, at20: 0, at34: 0 }), mount({ at10: 1, weapon: 0, at0C: 4 })], mountLists: [[0], [1], []] });
  }
  return info;
}

function aiPrograms() {
  const programs = aiProgramsContent();
  Object.assign(programs.programs[0], { at34: 1, at38: 1, at50: 0 });
  programs.entries[2] = script([scriptItem(1000, '4'), scriptItem(104, '1.0', 0), scriptItem(10000, '0')]) as never;
  return programs;
}

function mission() {
  const frame = missionFrame();
  frame.declarations = [
    declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
    declaration(1, { craftType: 7, position: { x: 100, y: 200, z: -200 } }),
  ];
  return frame;
}

/** The wingman's replies (table 20985) have every line for its face 2, so its warning queues. */
function messages() {
  const content = commMessagesContent();
  content.faceTables[2] = Array.from({ length: 5 }, () => Array.from({ length: 0x17 }, () => ({ present: true, frameDurations: [2] }))) as never;
  return content;
}

const INPUT = asCreateInput(worldInput({
  mission: mission(), craftInfo: craftInfo(), aiPrograms: aiPrograms(), commMessages: messages(), commMenus: commMenusContent(), run: { wingman: 0 },
}));
const CONTENT = contentOf(INPUT);

/** Yaw for 39 ticks, pitch for 53, then straight on. */
const script_ = (tick: number): TickInput => ({
  axes: tick < 40 ? { pitch: 0, yaw: 1, roll: 0 } : tick < 93 ? { pitch: 1, yaw: 0, roll: 0 } : { pitch: 0, yaw: 0, roll: 0 },
  commands: [],
});

function record() {
  const session = createRecordingSession(INPUT, { producer: PRODUCER, checkpointInterval: 1 });
  const snapshots: GameSnapshot[] = [];
  const warnings: boolean[] = [];
  for (let tick = 1; tick <= TICKS; tick++) {
    session.step(script_(tick));
    const { communications } = session.projection();
    if (communications.readiness !== 'ready') throw new Error('communications not ready');
    warnings.push(communications.warnings.attackerOnTail);
    snapshots.push(session.snapshot());
  }
  return { recording: session.exportRecording(), snapshots, warnings };
}

const READ = record();
const RECORDING = READ.recording;
const stateAt = (tick: number) => READ.snapshots[tick - 1].state;
const entityAt = (tick: number, id: number) => stateAt(tick).entities.find((entity) => entity.id === id)!;
const lockAt = (tick: number): number => {
  const { combat } = entityAt(tick, HOSTILE);
  if (combat.type !== 'craft') throw new Error('not a craft');
  return combat.weapons.lock.level;
};
const eventsAt = (tick: number): readonly DomainEvent[] => RECORDING.result.events.filter((event) => event.tick === tick);
/** The ticks at which the value changes, with the new value. */
function changes<Value>(read: (tick: number) => Value): [number, Value][] {
  const seen: [number, Value][] = [];
  for (let tick = 1; tick <= TICKS; tick++) {
    const value = read(tick);
    if (seen.length === 0 || JSON.stringify(seen.at(-1)![1]) !== JSON.stringify(value)) seen.push([tick, value]);
  }
  return seen;
}

describe('the tail warning driven by the AI lock in a formal replay (P3-14 FA-01, FA-08)', { timeout: 60_000 }, () => {
  it('locks on through CR-16\'s update 0 → 2 → 3 → 4 while aiming at the player, without any state written from outside', () => {
    expect(RECORDING.record.ticks).toEqual(Array.from({ length: TICKS }, (_, index) => script_(index + 1)));
    expect(entityAt(2, HOSTILE)).toMatchObject({ kindBit: 7, ai: { objectTarget: PLAYER } });
    expect(changes(lockAt).map(([, level]) => level)).toEqual([0, 2, 3, 4]);
  });

  it('lights attackerOnTail at the first check that finds level 3, and the wingman warns once in that tick', () => {
    const lit = READ.warnings.indexOf(true) + 1;
    const level3 = changes(lockAt).find(([, level]) => level === 3)![0];
    // The check before (due at 0x82) found level 2; the next one (due 0x80 later) finds level 3 and is lit.
    expect(lit).toBeGreaterThan(level3);
    expect(lockAt(lit)).toBeGreaterThanOrEqual(3);
    const sample = stateAt(lit).clock;
    expect(stateAt(lit).communications.tailCheck).toEqual({ dueClock: sample + 0x40, attackerOnTail: true, missileIncoming: false });
    expect(stateAt(lit - 1).communications.tailCheck).toMatchObject({ attackerOnTail: false, dueClock: sample - 2 });
    expect(stateAt(lit).communications.limits.tailWarning).toBe(sample + 0x640);
    expect(eventsAt(lit).filter((event) => event.type === 'radio-queued')).toEqual([expect.objectContaining({
      message: { table: 20985, face: 2, index: 0xa }, speaker: expect.objectContaining({ entityId: WINGMAN }),
    })]);
    // It stays lit, checked 0x40 apart, while the lock holds; the projection reads the same flag.
    expect(READ.warnings.slice(lit - 1).every(Boolean)).toBe(true);
    // The next check is the first sample strictly past sample + 0x40, one tick (2 units) later.
    expect(stateAt(lit + 32).communications.tailCheck.dueClock).toBe(sample + 0x40);
    expect(stateAt(lit + 33).communications.tailCheck.dueClock).toBe(sample + 0x42 + 0x40);
  });

  it('reproduces every event and checkpoint after a JSON round trip', () => {
    const replayed = replayRecord(roundTrip(RECORDING.record) as typeof RECORDING.record, roundTrip(CONTENT) as typeof CONTENT);
    expect(replayed).toEqual(RECORDING.result);
    expect(compareReplayResults(roundTrip(RECORDING.result) as typeof RECORDING.result, replayed)).toEqual({ match: true });
  });
});
