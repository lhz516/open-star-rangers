import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import type { Command, TickAxes, TickInput } from '../contracts/tick-input.ts';
import { CoreInputError } from '../errors.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, craftInfoContent, declaration, missionFrame, worldInput } from '../world/create-world.test-support.ts';
import { thrownBy } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { compareReplayResults } from './compare.ts';
import { recordState, type Recording, type ReplayResult } from './recording.ts';
import { replayRecord, startReplay } from './replay.ts';
import { contentOf, PRODUCER, roundTrip } from './replay.test-support.ts';
import { RULES_VERSION } from './rules-version.ts';

// A synthetic flight (code-generated content and inputs, never original data) whose run has every P3-06 rule with an
// observable effect: docs/plan/p3/06/spec.md, S-08 and AC-08. When P3-06 was done no production entry set a target or
// an AI goal, so the rule tasks that now do (P3-07's target selection and destruction, P3-08's AI) are stood in for by
// writes to the world state before a tick, the same in the recording and in the replay. This stays P3-06's mechanism
// evidence; P3-08's standard replay of the autonomous AI, without stand-ins, is ai-replay.test.ts (P3-08 AC-11).

const PLAYER = 1;
const ENEMY = 2;
const PARKED = 3;
const TICKS = 160;

/**
 * Instantiated in this order at tick 1: the player; an enemy of assist kind 7 beside it, moving away along its
 * diagonal while the player flies along +z; a friendly of kind 14 placed beyond the world's inset rectangle, parked and
 * in AI mode 5, which does not travel.
 */
function flightMission() {
  const mission = missionFrame();
  mission.declarations = [
    declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
    declaration(1, { craftType: 7, position: { x: 120, y: 200, z: 0 } }),
    declaration(2, { craftType: 14, position: { x: 24160, y: 100, z: 0 } }),
  ];
  return mission;
}

/** The player's craft decelerates (the synthetic default rate is negative), so that an assisted match finds a speed difference. */
function flightInput() {
  const craftInfo = craftInfoContent();
  Object.assign(craftInfo.craft[0], { atBC: 16, atC0: 32 });
  return asCreateInput(worldInput({ mission: flightMission(), craftInfo }));
}

const INPUT = flightInput();
const CONTENT = contentOf(INPUT);

const speed = (operation: 'increase' | 'decrease' | 'zero' | 'maximum' | 'match-target' | 'toggle-auto-match'): Command => ({ type: 'speed', operation });

/** Same-tick commands at tick 20 (two toggles of the assist and a manual match among them), zero throttle at 22, a match without a target at 62. */
const COMMANDS: Readonly<Record<number, readonly Command[]>> = {
  20: [speed('decrease'), speed('decrease'), { type: 'speed-preset', level: 4 }, speed('match-target'), speed('toggle-auto-match'), speed('toggle-auto-match'), { type: 'fire', channel: 'primary' }],
  22: [speed('zero')],
  62: [{ type: 'confirm-selection' }],
};

/** A yaw held over ticks 5–12, pitch added at 13, both released at 14; a roll at 30 released at 31. */
function axesAt(tick: number): TickAxes {
  if (tick >= 5 && tick <= 12) return { pitch: 0, yaw: 0.5, roll: 0 };
  if (tick === 13) return { pitch: -1, yaw: 0.5, roll: 0 };
  if (tick === 30) return { pitch: 0, yaw: 0, roll: -1 };
  return { pitch: 0, yaw: 0, roll: 0 };
}

const flightScript = (tick: number): TickInput => ({ axes: axesAt(tick), commands: [...(COMMANDS[tick] ?? [])] });

/**
 * The stand-ins, before tick `tick`: P3-07 selects the enemy as the player's target at 3 and again at 70, leaves an ID
 * no entity has at 60 and destroys the enemy at 90 (pending removal); P3-08 stops the parked friendly where it stands
 * at 100 (AI mode 4 with its own position as the goal).
 */
function standIn(state: WorldState, tick: number): void {
  if (tick === 3 || tick === 70) state.player.target = ENEMY;
  if (tick === 60) state.player.target = 999;
  if (tick === 90) state.entities.get(ENEMY)!.state = 'pending-removal';
  if (tick === 100) {
    const parked = state.entities.get(PARKED)!;
    Object.assign(parked.ai, { mode: 4, goal: parked.position });
  }
}

function recordFlight(checkpointInterval: number): Recording {
  const state = initialWorldState(INPUT);
  const session = recordState(state, { producer: PRODUCER, checkpointInterval });
  for (let tick = 1; tick <= TICKS; tick++) {
    standIn(state, tick);
    session.step(flightScript(tick));
  }
  return session.exportRecording();
}

/** replayRecord with the stand-ins: the record still passes replay's own validation and binding to the content. */
function replayFlight(record: unknown): ReplayResult {
  const { record: replayed, state } = startReplay(record, CONTENT);
  const session = recordState(state, { producer: replayed.producer, checkpointInterval: replayed.checkpointInterval });
  replayed.ticks.forEach((input, index) => {
    standIn(state, index + 1);
    session.step(input);
  });
  return session.exportRecording().result;
}

/** Every checkpoint: a state difference shows at the tick it starts. */
const RECORDING = recordFlight(1);

type MutableRecord = { version: unknown; rulesVersion: unknown; ticks: { axes: Record<string, number>; commands: unknown[] }[] };

/** A JSON copy of the record, changed by `change`. */
function recordWith(change: (record: MutableRecord) => void): unknown {
  const record = roundTrip(RECORDING.record) as MutableRecord;
  change(record);
  return record;
}

const of = <Type extends DomainEvent['type']>(type: Type) =>
  RECORDING.result.events.filter((event): event is Extract<DomainEvent, { type: Type }> => event.type === type);

describe('motion replay (P3-06 S-08, AC-08)', () => {
  it('reproduces every event and every checkpoint after a JSON round trip, and the comparison accepts the new events', () => {
    const { record, result } = roundTrip(RECORDING) as Recording;
    const replayed = replayFlight(record);
    expect(replayed).toEqual(RECORDING.result);
    expect(compareReplayResults(result, replayed)).toEqual({ match: true });
    expect(replayed.checkpoints.map(({ tick }) => tick)).toEqual(Array.from({ length: TICKS + 1 }, (_, tick) => tick));
  });

  it('has the speed rules and the world exit in the run', () => {
    const matched = of('speed-matched');
    const assisted = matched.filter((event) => event.origin === 'assist');
    // Repeated assisted matches on the enemy, with and without a speed difference past the original's flash constant.
    expect(assisted.length).toBeGreaterThan(3);
    expect(new Set(assisted.map(({ targetEntityId }) => targetEntityId))).toEqual(new Set([ENEMY]));
    expect(new Set(assisted.map((event) => event.speedDifferenceExceeded))).toEqual(new Set([false, true]));
    expect(matched.filter(({ origin }) => origin === 'command')).toEqual([{ type: 'speed-matched', tick: 20, targetEntityId: ENEMY, origin: 'command', commandIndex: 3 }]);
    expect(of('speed-assist-toggled')).toEqual([
      { type: 'speed-assist-toggled', tick: 20, commandIndex: 4, enabled: false },
      { type: 'speed-assist-toggled', tick: 20, commandIndex: 5, enabled: true },
    ]);
    // Switching on again made the assist due at once.
    expect(assisted.some(({ tick }) => tick === 21)).toBe(true);
    // The invalid ID is dropped in the tick it was set; the destroyed enemy is gone the tick after.
    expect(of('speed-assist-released')).toEqual([{ type: 'speed-assist-released', tick: 60 }, { type: 'speed-assist-released', tick: 91 }]);
    expect(of('command-result').filter(({ reason }) => reason === 'no-target')).toEqual([
      { type: 'command-result', tick: 62, commandIndex: 0, commandType: 'confirm-selection', outcome: 'ignored', reason: 'no-target' },
    ]);
    expect(of('object-left-world')).toEqual([
      { type: 'object-left-world', tick: expect.any(Number), entityId: PARKED, kindBit: 14, source: { collection: 'mission', index: 2, group: null } },
    ]);
    expect(of('object-left-world')[0].tick).toBeGreaterThanOrEqual(100);
    expect(of('object-instantiated').map(({ entityId, kindBit }) => [entityId, kindBit])).toEqual([[PLAYER, 0], [ENEMY, 7], [PARKED, 14]]);
  });

  it('applies only axis changes: a held axis read again at the same deflection changes nothing, another deflection diverges at once', () => {
    // 0.5 × 128 = 64 and 0.507 × 128 = 64.9, which truncates to 64 as well; 0.51 × 128 truncates to 65.
    const same = recordWith(({ ticks }) => { for (let index = 5; index < 12; index++) ticks[index].axes.yaw = 0.507; });
    expect(compareReplayResults(RECORDING.result, replayFlight(same))).toEqual({ match: true });
    const other = recordWith(({ ticks }) => { ticks[7].axes.yaw = 0.51; });
    expect(compareReplayResults(RECORDING.result, replayFlight(other))).toEqual({ match: false, tick: 8, kind: 'checkpoint' });
  });

  it('reports changed same-tick commands at their tick as an event difference', () => {
    const untoggled = recordWith(({ ticks }) => { ticks[19].commands.splice(4, 2); });
    expect(compareReplayResults(RECORDING.result, replayFlight(untoggled))).toEqual({ match: false, tick: 20, kind: 'events' });
  });

  it('diverges without the stand-ins where the first target was set', () => {
    expect(compareReplayResults(RECORDING.result, replayRecord(roundTrip(RECORDING.record), CONTENT))).toEqual({ match: false, tick: 3, kind: 'events' });
  });

  // Rules version 1 is before P3-06; rules version 2 and format version 1 are before P3-05's speed-preset (the current
  // versions are pinned in recording.test.ts and snapshot.test.ts).
  it.each([
    ['rules version 1', { rulesVersion: 1 }, 'record.rulesVersion'],
    ['rules version 2', { rulesVersion: 2 }, 'record.rulesVersion'],
    ['the next rules version', { rulesVersion: RULES_VERSION + 1 }, 'record.rulesVersion'],
    ['format version 1', { version: 1 }, 'record.version'],
    ['both versions before speed-preset', { version: 1, rulesVersion: 2 }, 'record.version'],
  ])('rejects the record under %s before running anything', (_, versions, path) => {
    // As the code before the speed preset recorded the preset at tick 20.
    const record = recordWith((value) => {
      Object.assign(value, versions);
      value.ticks[19].commands[2] = { type: 'select-number', value: 4 };
    });
    for (const replay of [() => replayFlight(record), () => replayRecord(record, CONTENT)]) {
      const error = thrownBy(replay);
      expect(error).toBeInstanceOf(CoreInputError);
      expect(error).toMatchObject({ path });
    }
  });
});
