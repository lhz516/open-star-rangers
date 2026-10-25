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
    expect(summary({ type: 'hit', tick: 5, victimEntityId: 3, victimKindBit: 1, victimPosition: { x: 0, y: 0, z: 0 }, victimForward: { x: 0, y: 0, z: 1 },
      victimSpeed: null, cause: 'collision', sourceEntityId: null,
      attacker: { type: 'lost-shooter' }, damage: 1, gated: true, shield: { before: 0, after: 0 }, hull: { before: 2, after: 1 }, shieldWasEmpty: true,
      impact: null, projectile: null }).find(([name]) => name === 'attacker')).toEqual(['attacker', 'lost-shooter']);
    expect(summary({ ...(COMBAT_EVENTS[3] as Extract<DomainEvent, { type: 'shot-fired' }>), trigger: { type: 'ai', channel: 2 } })
      .find(([name]) => name === 'trigger')).toEqual(['trigger', 'ai 2']);
    expect(summary({ ...(COMBAT_EVENTS[3] as Extract<DomainEvent, { type: 'shot-fired' }>), trigger: { type: 'automatic' } })
      .find(([name]) => name === 'trigger')).toEqual(['trigger', 'automatic']);
  });

  it('summarizes P3-09\'s map and Warp events by every field, in a fixed order', () => {
    const summaries = MAP_WARP_EVENTS.map((event) => summarizeEvent(event, NO_COMMAND, 1).fields);
    expect(summaries).toEqual([
      [['open', true], ['viewMode', 8], ['previousViewMode', 0xc], ['commandIndex', 0]],
      [
        ['playerEntityId', 1], ['column', 0], ['row', 210], ['iconEntityId', 14], ['iconKindBit', 7], ['marker', 'created'], ['markerEntityId', 30],
        ['commandIndex', 1], ['x', -45000], ['y', 2250], ['z', 3],
      ],
      [
        ['playerEntityId', 1], ['serial', 1], ['distance', 45100.5], ['cost', 90], ['energy', 1000], ['transitLength', 3.5], ['fromViewMode', 8],
        ['commandIndex', 0], ['originX', 1], ['originY', 2], ['originZ', 3], ['destinationX', -45000], ['destinationY', 2250], ['destinationZ', 3],
      ],
      [['serial', 1], ['viewMode', 0xc], ['previousViewMode', 1], ['arrived', false]],
    ]);
    const destinationSet = MAP_WARP_EVENTS[1] as Extract<DomainEvent, { type: 'warp-destination-set' }>;
    expect(summarizeEvent({ ...destinationSet, icon: null, marker: { type: 'missing' } }, NO_COMMAND, 1).fields.slice(3, 7)).toEqual([
      ['iconEntityId', null], ['iconKindBit', null], ['marker', 'missing'], ['markerEntityId', null],
    ]);
    const completed = MAP_WARP_EVENTS[3] as Extract<DomainEvent, { type: 'warp-completed' }>;
    const arrival = {
      playerEntityId: 1, origin: { x: 0, y: 0, z: 0 }, destination: { x: 9, y: 9, z: 0 }, position: { x: 9, y: 9, z: 600 },
      orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] as const, error: 0.25, snapped: 30,
      charge: { distance: 12, cost: 3, energyBefore: 1000, energyAfter: 996 }, warpClock: 640, hostileNear: true,
    };
    expect(summarizeEvent({ ...completed, arrival }, NO_COMMAND, 1).fields).toEqual([
      ['serial', 1], ['viewMode', 0xc], ['previousViewMode', 1], ['arrived', true], ['playerEntityId', 1], ['error', 0.25], ['snapped', 30],
      ['chargeDistance', 12], ['chargeCost', 3], ['energyBefore', 1000], ['energyAfter', 996], ['warpClock', 640], ['hostileNear', true],
      ['x', 9], ['y', 9], ['z', 600], ['orientation', '1 0 0 0 1 0 0 0 1'], ['originX', 0], ['originY', 0], ['originZ', 0],
      ['destinationX', 9], ['destinationY', 9], ['destinationZ', 0],
    ]);
  });

  it('summarizes P3-10\'s communications, docking and base events by their own scalar fields, in a fixed order', () => {
    const summary = (event: DomainEvent) => summarizeEvent(event, NO_COMMAND, 1).fields;
    const speaker = { entityId: 4, kindBit: 15, name: { type: 'none' } } as const;
    const reply = { table: 20011, face: 2, index: 3 } as const;
    const direct = { table: 20983, face: null, index: 6 } as const;
    expect([
      { type: 'command-delivered', tick: 5, receiverEntityId: 4, receiverKindBit: 15, code: 9, senderEntityId: 1, commandIndex: 2 },
      { type: 'radio-queued', tick: 5, message: reply, callback: 'docking-reply', speaker, position: 'head', length: 1 },
      { type: 'radio-taken', tick: 5, message: direct, speaker: null },
      { type: 'incoming-started', tick: 5, message: reply, speaker, frameDurations: [5, 8, 5], shown: true },
      { type: 'incoming-ended', tick: 5, message: reply, speaker, callback: 'docking-reply', countdownStarted: true },
      { type: 'radio-flushed', tick: 5, cause: 'docking-cancel', removed: 2, interrupted: 'playing' },
      { type: 'docking-requested', tick: 5, playerEntityId: 1, dockingObject: 4, previousSubState: 0, deadlineClock: 0x782, commandIndex: 0 },
      { type: 'docking-cancelled', tick: 5, playerEntityId: 1, dockingObject: 4, cause: 'gate' },
      { type: 'docked', tick: 5, playerEntityId: 1, baseEntityId: 4, wingmanEntityId: null, previousViewMode: 12 },
      { type: 'departed', tick: 5, playerEntityId: 1, origin: 'command', commandIndex: 1, viewMode: 12, previousViewMode: 6, position: { x: 1, y: 2, z: 3 },
        orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1], wingmanEntityId: 2 },
      { type: 'transition', tick: 5, gap: 'G-02/4' },
      { type: 'base-navigated', tick: 5, direction: 'next', row: null, moved: false, commandIndex: 2 },
      { type: 'base-confirmed', tick: 5, row: 3, record: 7, moved: true, commandIndex: 3 },
    ].map((event) => summary(event as DomainEvent))).toEqual([
      [['receiverEntityId', 4], ['receiverKindBit', 15], ['code', 9], ['senderEntityId', 1], ['commandIndex', 2]],
      [['message', '20011/2#3'], ['callback', 'docking-reply'], ['speaker', 'entity 4 kind 15 none'], ['position', 'head'], ['length', 1]],
      [['message', '20983#6'], ['speaker', null]],
      [['message', '20011/2#3'], ['speaker', 'entity 4 kind 15 none'], ['frameDurations', '5 8 5'], ['shown', true]],
      [['message', '20011/2#3'], ['speaker', 'entity 4 kind 15 none'], ['callback', 'docking-reply'], ['countdownStarted', true]],
      [['cause', 'docking-cancel'], ['removed', 2], ['interrupted', 'playing']],
      [['dockingObject', 4], ['previousSubState', 0], ['deadlineClock', 0x782], ['commandIndex', 0]],
      [['dockingObject', 4], ['cause', 'gate']],
      [['baseEntityId', 4], ['wingmanEntityId', null], ['previousViewMode', 12]],
      [['origin', 'command'], ['commandIndex', 1], ['viewMode', 12], ['previousViewMode', 6], ['wingmanEntityId', 2], ['x', 1], ['y', 2], ['z', 3]],
      [['gap', 'G-02/4']],
      [['direction', 'next'], ['row', null], ['moved', false], ['commandIndex', 2]],
      [['row', 3], ['record', 7], ['moved', true], ['commandIndex', 3]],
    ]);
  });

  it('summarizes P3-08\'s wingman command and transponder events by their own scalar fields, in a fixed order', () => {
    const summary = (event: DomainEvent) => summarizeEvent(event, NO_COMMAND, 1).fields;
    expect([
      { type: 'wingman-command-consumed', tick: 6, wingmanEntityId: 2, code: 3, issuedTick: 5, path: 'parked', outcome: 'refused', replyLine: null },
      { type: 'transponder-deployed', tick: 6, entityId: 9, creatorEntityId: 1, position: { x: 1, y: -15, z: 2 }, orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
    ].map((event) => summary(event as DomainEvent))).toEqual([
      [['wingmanEntityId', 2], ['code', 3], ['issuedTick', 5], ['path', 'parked'], ['outcome', 'refused'], ['replyLine', null]],
      [['entityId', 9], ['creatorEntityId', 1], ['x', 1], ['y', -15], ['z', 2]],
    ]);
  });

  it('summarizes P3-11\'s mission flow, loss, rescue, result and teardown events by their own scalar fields, in a fixed order', () => {
    const summary = (event: DomainEvent) => summarizeEvent(event, NO_COMMAND, 1).fields;
    const reference = { mission: 'mission/first-campaign', trigger: 1, range: 0 };
    expect([
      { type: 'all-clear', tick: 7, entityId: 5, kindBit: 7, eventClass: 2 },
      { type: 'settlement-started', tick: 7, outcome: 'success', summary: reference, summarySelector: 16, dueClock: 0x14a },
      { type: 'settlement-deferred', tick: 7, dueClock: 0x28a },
      { type: 'flight-message', tick: 7, message: 'beacon' },
      { type: 'player-loss-started', tick: 7, playerEntityId: 1, loss: 'destroyed', previousSubState: 4, previousViewMode: 12, viewSwitched: true },
      { type: 'player-loss-started', tick: 7, playerEntityId: 1, loss: 'energy', previousSubState: 0, deadlineClock: 0x3c6 },
      {
        type: 'player-rescued', tick: 7, playerEntityId: 1, loss: 'energy', rescues: 2, baseEntityId: null, candidates: 0, position: { x: 1, y: 2, z: 3 },
        orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      },
      {
        type: 'result-latched', tick: 7, result: {
          outcome: 'success', reason: { type: 'all-clear' }, summary: reference, rescuesUsed: 1,
          endingGaps: [{ gap: 'G-02/8', variant: 'wingman' }, { gap: 'G-02/9', row: 16 }], playerKills: 4, latchTick: 7,
        },
      },
      {
        type: 'result-latched', tick: 7, result: {
          outcome: 'failure', reason: { type: 'third-loss', loss: 'energy' }, summary: null, rescuesUsed: 2, endingGaps: [{ gap: 'G-02/7', variant: 'energy' }],
          playerKills: 0, latchTick: 7,
        },
      },
      { type: 'teardown-started', tick: 7, entities: 3 },
      { type: 'mission-completed', tick: 8, outcome: 'failure' },
      { type: 'wingman-loss-timer-started', tick: 7, wingmanEntityId: 2, dueClock: 0x782 },
      { type: 'wingman-loss-timer-expired', tick: 7, queued: false },
    ].map((event) => summary(event as DomainEvent))).toEqual([
      [['entityId', 5], ['kindBit', 7], ['eventClass', 2]],
      [['outcome', 'success'], ['summary', 'mission/first-campaign 1/0'], ['summarySelector', 16], ['dueClock', 0x14a]],
      [['dueClock', 0x28a]],
      [['message', 'beacon']],
      [['playerEntityId', 1], ['loss', 'destroyed'], ['previousSubState', 4], ['previousViewMode', 12], ['viewSwitched', true]],
      [['playerEntityId', 1], ['loss', 'energy'], ['previousSubState', 0], ['deadlineClock', 0x3c6]],
      [['playerEntityId', 1], ['loss', 'energy'], ['rescues', 2], ['baseEntityId', null], ['candidates', 0], ['x', 1], ['y', 2], ['z', 3]],
      [
        ['outcome', 'success'], ['reason', 'all-clear'], ['summary', 'mission/first-campaign 1/0'], ['rescuesUsed', 1],
        ['endingGaps', 'G-02/8 wingman, G-02/9 16'], ['playerKills', 4],
      ],
      [['outcome', 'failure'], ['reason', 'third-loss energy'], ['summary', null], ['rescuesUsed', 2], ['endingGaps', 'G-02/7 energy'], ['playerKills', 0]],
      [['entities', 3]],
      [['outcome', 'failure']],
      [['wingmanEntityId', 2], ['dueClock', 0x782]],
      [['queued', false]],
    ]);
  });

  it('summarizes P3-14\'s retirement event by its own fields, in a fixed order', () => {
    expect(summarizeEvent({ type: 'object-retired', tick: 6, entityId: 9, kindBit: 7, state: 'area-switch' }, NO_COMMAND, 1).fields)
      .toEqual([['entityId', 9], ['kindBit', 7], ['state', 'area-switch']]);
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
