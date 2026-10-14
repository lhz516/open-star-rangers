import { describe, expect, it } from 'vitest';
import type { CommandResultEvent, DomainEvent, ObjectInstantiatedEvent } from '../../core/contracts/domain-events.ts';
import { COMBAT_EVENTS, MAP_WARP_EVENTS } from '../../app/runtime/combat-events.test-support.ts';
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

  it('summarizes P3-06\'s speed and world-exit events by their own fields, in a fixed order', () => {
    const summary = (event: DomainEvent) => summarizeEvent(event, NO_COMMAND, 1).fields;
    expect(summary({ type: 'speed-assist-toggled', tick: 5, commandIndex: 2, enabled: false })).toEqual([['commandIndex', 2], ['enabled', false]]);
    expect(summary({ type: 'speed-matched', tick: 5, targetEntityId: 7, origin: 'command', commandIndex: 1 }))
      .toEqual([['targetEntityId', 7], ['origin', 'command'], ['commandIndex', 1]]);
    expect(summary({ type: 'speed-matched', tick: 5, targetEntityId: 7, origin: 'assist', speedDifferenceExceeded: true }))
      .toEqual([['targetEntityId', 7], ['origin', 'assist'], ['speedDifferenceExceeded', true]]);
    expect(summary({ type: 'speed-assist-released', tick: 5 })).toEqual([]);
    expect(summary({ type: 'object-left-world', tick: 5, entityId: 12, kindBit: 4, source: instantiated.source }))
      .toEqual([['entityId', 12], ['kindBit', 4], ['source', 'mission#2 group 1 request 0 member 3']]);
    expect(summary({ type: 'object-left-world', tick: 5, entityId: 13, kindBit: 9, source: null })).toEqual([['entityId', 13], ['kindBit', 9], ['source', 'rules']]);
    const entry = summarizeEvent({ type: 'speed-assist-released', tick: 6 }, NO_COMMAND, 3);
    expect(entry).toEqual({ sequence: 3, tick: 6, type: 'speed-assist-released', commandId: null, fields: [] });
    expect(Object.isFrozen(entry.fields)).toBe(true);
  });

  it('summarizes P3-07\'s combat events by their own scalar fields, in a fixed order', () => {
    const summaries = Object.fromEntries(COMBAT_EVENTS.map((event) => [event.type, summarizeEvent(event, NO_COMMAND, 1).fields]));
    expect(summaries).toEqual({
      'target-changed': [['target', 14], ['targetKindBit', 7], ['previousTarget', null], ['mode', 'enemy'], ['origin', 'command'], ['commandIndex', 2]],
      'target-cleared': [['previousTarget', 14], ['cause', 'invalid']],
      'weapon-selected': [['entityId', 1], ['list', 1], ['index', 0], ['mount', 2], ['changed', false], ['commandIndex', null]],
      'shot-fired': [
        ['shooterEntityId', 1], ['shooterKindBit', 0], ['entityId', 20], ['family', 'gun'], ['weapon', 1], ['mount', 0], ['trigger', 'command primary #0'],
        ['x', 1.5], ['y', 2], ['z', 3],
      ],
      hit: [
        ['victimEntityId', 14], ['victimKindBit', 7], ['cause', 'projectile'], ['sourceEntityId', 20], ['attacker', 'shooter 1 kind 0'], ['damage', 12],
        ['gated', false], ['shieldBefore', 30], ['shieldAfter', 18], ['hullBefore', 50], ['hullAfter', 50], ['projectile', 'removed'],
      ],
      'object-destroyed': [
        ['entityId', 14], ['kindBit', 7], ['source', 'mission#2'], ['activity', 'active'], ['attacker', 'shooter 1 kind 0'], ['outcome', 'explodes'],
        ['x', 4], ['y', 5], ['z', 6],
      ],
      'explosion-started': [['entityId', 21], ['sourceEntityId', 14], ['sourceKindBit', 7], ['variant', 'large'], ['x', 4], ['y', 5], ['z', 6]],
      'missile-ended': [['entityId', 22], ['shooterEntityId', null], ['outcome', 'fizzled'], ['x', 7], ['y', 8], ['z', 9]],
      'fragment-expired': [['entityId', 23], ['sourceKindBit', 0], ['part', 0], ['outcome', 'escape-pod'], ['x', 1], ['y', 1], ['z', 1]],
      'source-released': [['entityId', 1], ['kindBit', 0], ['fragmentEntityId', 23], ['removed', false]],
      'energy-depleted': [['entityId', 1], ['kindBit', 0], ['x', 1], ['y', 2], ['z', 3]],
      'energy-allocation-changed': [['entityId', 1], ['shieldLevel', 2], ['chargeLevel', 1], ['commandIndex', 3]],
      'left-page-changed': [['page', 1], ['previousPage', 0], ['commandIndex', null]],
    });
    const summary = (event: DomainEvent) => summarizeEvent(event, NO_COMMAND, 1).fields;
    expect(summary({ type: 'hit', tick: 5, victimEntityId: 3, victimKindBit: 1, victimPosition: { x: 0, y: 0, z: 0 }, cause: 'collision', sourceEntityId: null,
      attacker: { type: 'lost-shooter' }, damage: 1, gated: true, shield: { before: 0, after: 0 }, hull: { before: 2, after: 1 }, shieldWasEmpty: true,
      impact: null, projectile: null }).find(([name]) => name === 'attacker')).toEqual(['attacker', 'lost-shooter']);
    expect(summary({ ...(COMBAT_EVENTS[3] as Extract<DomainEvent, { type: 'shot-fired' }>), trigger: { type: 'ai', channel: 2 } })
      .find(([name]) => name === 'trigger')).toEqual(['trigger', 'ai 2']);
    expect(summary({ ...(COMBAT_EVENTS[3] as Extract<DomainEvent, { type: 'shot-fired' }>), trigger: { type: 'automatic' } })
      .find(([name]) => name === 'trigger')).toEqual(['trigger', 'automatic']);
  });

  it('summarizes P3-09\'s map and Warp events by their own scalar fields, in a fixed order', () => {
    const summaries = MAP_WARP_EVENTS.map((event) => summarizeEvent(event, NO_COMMAND, 1).fields);
    expect(summaries).toEqual([
      [['open', true], ['viewMode', 8], ['previousViewMode', 0xc], ['commandIndex', 0]],
      [['column', 0], ['row', 210], ['iconEntityId', 14], ['marker', 'created'], ['commandIndex', 1], ['x', -45000], ['y', 2250], ['z', 3]],
      [['serial', 1], ['distance', 45100.5], ['cost', 90], ['energy', 1000], ['transitLength', 3.5], ['fromViewMode', 8], ['commandIndex', 0]],
      [['serial', 1], ['viewMode', 0xc], ['arrived', false]],
    ]);
    const completed = MAP_WARP_EVENTS[3] as Extract<DomainEvent, { type: 'warp-completed' }>;
    const arrival = {
      playerEntityId: 1, origin: { x: 0, y: 0, z: 0 }, destination: { x: 9, y: 9, z: 0 }, position: { x: 9, y: 9, z: 600 },
      orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] as const, error: 0.25, snapped: 30,
      charge: { distance: 12, cost: 3, energyBefore: 1000, energyAfter: 996 }, warpClock: 640, hostileNear: true,
    };
    expect(summarizeEvent({ ...completed, arrival }, NO_COMMAND, 1).fields).toEqual([
      ['serial', 1], ['viewMode', 0xc], ['arrived', true], ['error', 0.25], ['snapped', 30], ['charge', 3], ['energyAfter', 996], ['hostileNear', true],
      ['x', 9], ['y', 9], ['z', 600],
    ]);
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
