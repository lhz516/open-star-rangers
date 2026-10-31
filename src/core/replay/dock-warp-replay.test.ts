import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import type { Command } from '../contracts/tick-input.ts';
import { CoreInputError } from '../errors.ts';
import {
  asCreateInput, commMessagesContent, craftInfoContent, declaration, missionFrame, worldInput,
} from '../world/create-world.test-support.ts';
import { thrownBy, tickInput } from '../world/world.test-support.ts';
import { compareReplayResults } from './compare.ts';
import { createRecordingSession, GAME_REPLAY_VERSION, type Recording } from './recording.ts';
import { replayRecord } from './replay.ts';
import { contentOf, PRODUCER, roundTrip } from './replay.test-support.ts';
import { RULES_VERSION } from './rules-version.ts';

// P3-16/04 (docs/plan/p3/16/spec.md, 技术决定 4, AC-08; docs/plan/p3/02/spec.md, MW-04 step 1a and CB-07 as revised on
// 2026-10-30): the two Warp requests that conflict with a pending player transition, in one synthetic run (code-generated
// content and inputs, never original data) recorded and replayed through the formal entries. Before the gate the first
// request started a Warp in the docking's own tick and the next tick faulted at `docking.view-switch`, as the base the
// Warp left behind retired and sub-state 5's automatic launch left view 1; the second, after an accepted launch in its
// batch, started the Warp from where the launch placed the player rather than where it was judged. Both are now
// `ignored`/`wrong-context`, the transition applies, and the Warp requested in the next tick starts from the launch.

const open: Command = { type: 'communications', operation: 'open' };
const digit = (value: number): Command => ({ type: 'select-number', value });
const WARP: Command = { type: 'request-warp' };
const LAUNCH: Command = { type: 'launch' };
/** A select at map pixel (390, 390): runtime (42750, 42750), far from the base, which leaves the active area in a Warp. */
const SELECT_FAR: Command = { type: 'map-point', operation: 'select', right: 390.5 / 400, down: 390.5 / 400 };

/** The player at runtime (187.5, 375, 0); a base of kind 18 (the menu's one category, key 1) 375 ahead of it, within the docking range. */
function mission() {
  const frame = missionFrame();
  frame.declarations = [
    declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
    declaration(1, { craftType: 18, position: { x: 100, y: 200, z: 200 }, nameCandidates: ['base-a'] }),
  ];
  return frame;
}

/** Five base faces with the docking reply (3 + 9 eighths) at index 0 and a status reply at index 1 (comm-replay.test.ts's). */
function messages() {
  const content = commMessagesContent();
  content.faceTables[0] = Array.from({ length: 5 }, () => [{ present: true, frameDurations: [3, 9] }, { present: true, frameDurations: [2, 2] }]) as never;
  return content;
}

/**
 * The player and the base without speed (comm-replay.test.ts's still craft info), and the player's Warp fields: one
 * cost pair of 1 per 1000 units, so the energy always covers it; the interval 2 s; +0xA8 14.
 */
function craftInfo() {
  const info = craftInfoContent();
  info.craft[18].atB8 = 0;
  Object.assign(info.craft[0], { atB8: 1, at88: 2 ** 30, pairs: [{ at00: 0x7fffffff, at04: 1 }], atA4: 2, atA8: 14 });
  return info;
}

const INPUT = asCreateInput(worldInput({ mission: mission(), commMessages: messages(), craftInfo: craftInfo() }));
const CONTENT = contentOf(INPUT);

/**
 * Ticks 4–6 open the map, select the far point and close it; ticks 10–12 open the menu, choose the base and request
 * docking. The docking's tick (257 after the reply's end starts the countdown) also requests the Warp; five ticks after
 * the docking one batch launches and requests it; the tick after the launch requests it alone. The run ends 20 ticks on.
 */
function record(): Recording {
  const session = createRecordingSession(INPUT, { producer: PRODUCER, checkpointInterval: 1 });
  const script = new Map<number, readonly Command[]>([
    [4, [{ type: 'toggle-map' }]], [5, [SELECT_FAR]], [6, [{ type: 'toggle-map' }]],
    [10, [open]], [11, [digit(1)]], [12, [digit(2)]],
  ]);
  let end = 1000;
  for (let tick = 1; tick <= end; tick++) {
    for (const event of session.step(tickInput(script.get(tick) ?? []))) {
      if (event.type === 'incoming-ended' && event.countdownStarted) script.set(tick + 257, [WARP]);
      else if (event.type === 'docked') script.set(tick + 5, [LAUNCH, WARP]);
      else if (event.type === 'departed') {
        script.set(tick + 1, [WARP]);
        end = tick + 20;
      }
    }
  }
  return session.exportRecording();
}

const RECORDING = record();
const events = RECORDING.result.events;
const at = (tick: number) => events.filter((event) => event.tick === tick);
const tickOf = (type: DomainEvent['type']): number => {
  const found = events.filter((event) => event.type === type);
  expect(found, type).toHaveLength(1);
  return found[0].tick;
};
const results = (tick: number) => at(tick).flatMap((event) => (event.type === 'command-result' ? [[event.commandType, event.outcome, event.reason]] : []));

type Mutable = Record<string, unknown>;

function expectRejected(work: () => unknown, path: string): void {
  const error = thrownBy(work);
  expect(error).toBeInstanceOf(CoreInputError);
  expect(error).toMatchObject({ path });
}

// A run of a few hundred ticks, recorded and replayed: longer than the default timeout under load.
describe('the Warp requests against a pending docking and launch, replayed (P3-16 AC-08; MW-04 step 1a, CB-07)', { timeout: 60_000 }, () => {
  it('ignores the request in the docking\'s tick, and the docking applies', () => {
    const docked = tickOf('docked');
    expect(results(docked)).toEqual([['request-warp', 'ignored', 'wrong-context']]);
    expect(at(docked).map(({ type }) => type)).toEqual(['command-result', 'view-switched', 'docked', 'transition']);
  });

  it('ignores the request after the launch in its batch, the launch applies, and the next tick\'s request starts the Warp from the launch', () => {
    const departed = tickOf('departed');
    expect(results(departed)).toEqual([['launch', 'accepted', null], ['request-warp', 'ignored', 'wrong-context']]);
    expect(at(departed).map(({ type }) => type)).toEqual(['command-result', 'command-result', 'view-switched', 'departed', 'transition']);
    const launch = at(departed).find((event) => event.type === 'departed');
    const started = events.filter((event) => event.type === 'warp-started');
    expect(started.map(({ tick }) => tick)).toEqual([departed + 1]);
    expect(results(departed + 1)).toEqual([['request-warp', 'accepted', null]]);
    expect(started[0]).toMatchObject({ origin: launch?.type === 'departed' ? launch.position : null, fromViewMode: 0x0c });
  });

  it('records the rules version of the gate in the unchanged replay format', () => {
    expect(RECORDING.record).toMatchObject({ version: GAME_REPLAY_VERSION, rulesVersion: RULES_VERSION });
    expect([GAME_REPLAY_VERSION, RULES_VERSION]).toEqual([3, 12]);
  });

  it('reproduces every event and the snapshot at every checkpoint after a JSON round trip', () => {
    const { record: given, result } = roundTrip(RECORDING) as Recording;
    const replayed = replayRecord(given, roundTrip(CONTENT) as typeof CONTENT);
    expect(replayed).toEqual(RECORDING.result);
    expect(compareReplayResults(result, replayed)).toEqual({ match: true });
    expect(replayed.checkpoints).toHaveLength(RECORDING.record.ticks.length + 1);
  });

  it.each([
    ['the rules version before the gate', RULES_VERSION - 1],
    ['a later rules version', RULES_VERSION + 1],
  ])('rejects a record of %s before running anything', (_, rulesVersion) => {
    const changed = { ...(roundTrip(RECORDING.record) as Mutable), rulesVersion };
    expectRejected(() => replayRecord(changed, CONTENT), 'record.rulesVersion');
  });
});
