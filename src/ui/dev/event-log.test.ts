import { describe, expect, it } from 'vitest';
import type { CommandResultEvent, ObjectInstantiatedEvent } from '../../core/contracts/domain-events.ts';
import { EVENT_LOG_LIMIT, EventLog, summarizeEvent } from './event-log.ts';

// P3-04 AC-22, the event log window (docs/plan/p3/04/spec.md: 开发诊断, 事件日志): the latest 500 structured summaries,
// the oldest dropped beyond that with a truncation flag, and a clear.

const result = (tick: number, commandIndex = 0): CommandResultEvent => Object.freeze({
  type: 'command-result', tick, commandIndex, commandType: 'launch', outcome: 'rejected', reason: 'not-implemented',
});

const instantiated: ObjectInstantiatedEvent = Object.freeze({
  type: 'object-instantiated', tick: 3, entityId: 12, kindBit: 4,
  source: Object.freeze({ collection: 'mission', index: 2, group: Object.freeze({ index: 1, request: 0, member: 3 }) }),
  position: Object.freeze({ x: 1.5, y: -2, z: 0 }),
});

const NO_COMMAND = Object.freeze({ commandId: null });

describe('event log', () => {
  it('summarizes each event type by its tick, type, main fields and commandId', () => {
    expect(summarizeEvent(result(4, 1), { commandId: 9 }, 1)).toEqual({
      sequence: 1, tick: 4, type: 'command-result', commandId: 9,
      fields: [['commandIndex', 1], ['commandType', 'launch'], ['outcome', 'rejected'], ['reason', 'not-implemented']],
    });
    const entry = summarizeEvent(instantiated, NO_COMMAND, 2);
    expect(entry).toEqual({
      sequence: 2, tick: 3, type: 'object-instantiated', commandId: null,
      fields: [['entityId', 12], ['kindBit', 4], ['source', 'mission#2 group 1 request 0 member 3'], ['x', 1.5], ['y', -2], ['z', 0]],
    });
    expect(Object.isFrozen(entry) && Object.isFrozen(entry.fields) && Object.isFrozen(entry.fields[0])).toBe(true);
  });

  it('keeps 500 events untruncated and drops the oldest of 501', () => {
    const log = new EventLog();
    for (let tick = 1; tick <= EVENT_LOG_LIMIT; tick++) log.append(result(tick), NO_COMMAND);
    expect(EVENT_LOG_LIMIT).toBe(500);
    expect(log.view()).toMatchObject({ total: 500, truncated: false });
    expect(log.view().entries.map((entry) => entry.tick)).toEqual(Array.from({ length: 500 }, (_, index) => index + 1));
    log.append(result(501), NO_COMMAND);
    const { entries, total, truncated } = log.view();
    expect({ total, truncated, length: entries.length }).toEqual({ total: 501, truncated: true, length: 500 });
    expect([entries[0].sequence, entries[0].tick, entries[499].tick]).toEqual([2, 2, 501]);
  });

  it('keeps the latest 500 in order however many arrive', () => {
    const log = new EventLog();
    for (let tick = 1; tick <= 2_345; tick++) log.append(result(tick), { commandId: tick });
    const { entries, total } = log.view();
    expect(total).toBe(2_345);
    expect(entries.map((entry) => entry.commandId)).toEqual(Array.from({ length: 500 }, (_, index) => 1_846 + index));
  });

  it('returns one frozen view until the log changes, and clears to empty', () => {
    const log = new EventLog();
    const empty = log.view();
    expect(empty).toEqual({ entries: [], total: 0, truncated: false });
    log.append(instantiated, NO_COMMAND);
    const view = log.view();
    expect(log.view()).toBe(view);
    expect(Object.isFrozen(view) && Object.isFrozen(view.entries)).toBe(true);
    for (let tick = 0; tick < 600; tick++) log.append(result(tick), NO_COMMAND);
    log.clear();
    expect(log.view()).toEqual({ entries: [], total: 0, truncated: false });
    log.append(result(9), NO_COMMAND);
    expect(log.view().entries.map((entry) => entry.sequence)).toEqual([1]);
  });
});
