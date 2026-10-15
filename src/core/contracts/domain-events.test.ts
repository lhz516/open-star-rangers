import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  COMMAND_OUTCOMES,
  COMMAND_RESULT_REASONS,
  type Attacker,
  type CommandResultEvent,
  type DepartedEvent,
  type DomainEvent,
  type EntitySource,
  type HitEvent,
  type ObjectInstantiatedEvent,
  type ObjectLeftWorldEvent,
  type ShotTrigger,
  type SpeedAssistReleasedEvent,
  type SpeedAssistToggledEvent,
  type SpeedMatchedEvent,
  type TargetChangedEvent,
  type WarpCompletedEvent,
  type WarpDestinationSetEvent,
  type WeaponSelectedEvent,
  type WingmanCommandConsumedEvent,
  type WingmanCommandOutcome,
  isWingmanCommandReply,
  WINGMAN_COMMAND_OUTCOMES,
} from './domain-events.ts';
import { COMMAND_TYPES, type CommandType } from './tick-input.ts';

const rejected: CommandResultEvent = { type: 'command-result', tick: 3, commandIndex: 0, commandType: 'fire', outcome: 'rejected', reason: 'not-implemented' };
const instantiated: ObjectInstantiatedEvent = {
  type: 'object-instantiated',
  tick: 1,
  entityId: 2,
  kindBit: 7,
  source: { collection: 'mission', index: 4, group: { index: 1, request: 0, member: 2 } },
  position: { x: 1.5, y: -2, z: 0 },
};
const toggled: SpeedAssistToggledEvent = { type: 'speed-assist-toggled', tick: 4, commandIndex: 1, enabled: true };
const matchedByCommand: SpeedMatchedEvent = { type: 'speed-matched', tick: 4, targetEntityId: 9, origin: 'command', commandIndex: 2 };
const matchedByAssist: SpeedMatchedEvent = { type: 'speed-matched', tick: 5, targetEntityId: 9, origin: 'assist', speedDifferenceExceeded: false };
const released: SpeedAssistReleasedEvent = { type: 'speed-assist-released', tick: 6 };
const leftWorld: ObjectLeftWorldEvent = { type: 'object-left-world', tick: 7, entityId: 3, kindBit: 8, source: { collection: 'mission', index: 6, group: null } };

// P3-07's events (docs/plan/p3/02/spec.md, CR-06), one of each type.
const at = { x: 1, y: -2, z: 0.5 };
const shooter: Attacker = { type: 'shooter', entityId: 1, kindBit: 0 };
const combatEvents: DomainEvent[] = [
  { type: 'target-changed', tick: 8, playerEntityId: 1, previousTarget: null, target: 5, targetKindBit: 7, mode: 'enemy', origin: 'command', commandIndex: 0 },
  { type: 'target-changed', tick: 8, playerEntityId: 1, previousTarget: 5, target: 6, targetKindBit: 8, mode: 'enemy', origin: 'automatic', commandIndex: null },
  { type: 'target-cleared', tick: 8, playerEntityId: 1, previousTarget: 6, cause: 'warp' },
  { type: 'weapon-selected', tick: 8, entityId: 1, list: 1, index: -1, mount: null, changed: false, commandIndex: 1 },
  { type: 'shot-fired', tick: 8, shooterEntityId: 1, shooterKindBit: 0, shooterPosition: at, entityId: 9, family: 'gun', weapon: 2, mount: 3, position: at,
    trigger: { type: 'command', channel: 'primary', commandIndex: 2 } },
  { type: 'hit', tick: 8, victimEntityId: 5, victimKindBit: 7, victimPosition: at, cause: 'projectile', sourceEntityId: 9, attacker: shooter, damage: 40, gated: false,
    shield: { before: 30, after: 0 }, hull: { before: 100, after: 90 }, shieldWasEmpty: false, impact: { point: at, local: at, face: 5 }, projectile: 'removed' },
  { type: 'object-destroyed', tick: 8, entityId: 5, kindBit: 7, source: null, position: at, activity: 'active', attacker: { type: 'lost-shooter' }, eventClass: 1,
    outcome: 'explodes' },
  { type: 'explosion-started', tick: 9, entityId: 10, sourceEntityId: 5, sourceKindBit: 7, variant: 'other', position: at, activationClock: 18 },
  { type: 'missile-ended', tick: 9, entityId: 11, shooterEntityId: null, outcome: 'fizzled', position: at, orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
  { type: 'fragment-expired', tick: 9, entityId: 12, sourceKindBit: 1, part: 0, position: at, outcome: 'escape-pod' },
  { type: 'source-released', tick: 9, entityId: 1, kindBit: 0, fragmentEntityId: 12, removed: false },
  { type: 'energy-depleted', tick: 9, entityId: 1, kindBit: 0, position: at },
  { type: 'energy-allocation-changed', tick: 9, entityId: 1, shieldLevel: 3, chargeLevel: 0, commandIndex: 0 },
  { type: 'left-page-changed', tick: 9, page: 1, previousPage: 0, commandIndex: null },
];

// P3-09's events (docs/plan/p3/02/spec.md, MW-05), with both forms of the marker change and the arrival.
const mapWarpEvents: DomainEvent[] = [
  { type: 'map-toggled', tick: 10, open: true, viewMode: 8, previousViewMode: 0xc, commandIndex: 0 },
  { type: 'warp-destination-set', tick: 11, playerEntityId: 1, destination: { x: -45000, y: 2250, z: 0 }, pixel: { column: 0, row: 210 }, icon: null,
    marker: { type: 'created', entityId: 13 }, commandIndex: 0 },
  { type: 'warp-destination-set', tick: 12, playerEntityId: 1, destination: at, pixel: { column: 3, row: 4 }, icon: { entityId: 5, kindBit: 7 },
    marker: { type: 'missing' }, commandIndex: 1 },
  { type: 'warp-started', tick: 13, playerEntityId: 1, serial: 1, origin: at, destination: at, distance: 0, check: { cost: 0, energy: 1000 },
    transitLength: 0.5, fromViewMode: 8, commandIndex: 0 },
  { type: 'warp-completed', tick: 14, serial: 1, viewMode: 0xc, previousViewMode: 1, arrival: null },
  { type: 'warp-completed', tick: 20, serial: 2, viewMode: 0xc, previousViewMode: 1, arrival: { playerEntityId: 1, origin: at, destination: at, position: at,
    orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1], error: 0.25, snapped: 13, charge: { distance: 0, cost: 0, energyBefore: 1000, energyAfter: 1000 },
    warpClock: 1280, hostileNear: true } },
];

// P3-10's events (docs/plan/p3/02/spec.md, CB-13), one of each type.
const speaker = { entityId: 4, kindBit: 15, name: { type: 'candidate', declaration: { collection: 'mission', index: 2 }, candidate: 1 } } as const;
const reply = { table: 20011, face: 2, index: 3 } as const;
const communicationsEvents: DomainEvent[] = [
  { type: 'command-delivered', tick: 10, receiverEntityId: 4, receiverKindBit: 15, code: 9, senderEntityId: 1, commandIndex: 2 },
  { type: 'radio-queued', tick: 10, message: reply, callback: 'docking-reply', speaker, position: 'head', length: 1 },
  { type: 'radio-taken', tick: 10, message: { table: 20983, face: null, index: 6 }, speaker: null },
  { type: 'incoming-started', tick: 11, message: reply, speaker, frameDurations: [5, 8, 5], shown: true },
  { type: 'incoming-ended', tick: 12, message: reply, speaker, callback: 'docking-reply', countdownStarted: true },
  { type: 'radio-flushed', tick: 12, cause: 'docking-cancel', removed: 2, interrupted: 'playing' },
  { type: 'docking-requested', tick: 12, playerEntityId: 1, dockingObject: 4, previousSubState: 0, deadlineClock: 0x790, commandIndex: 0 },
  { type: 'docking-cancelled', tick: 13, playerEntityId: 1, dockingObject: 4, cause: 'gate' },
  { type: 'docked', tick: 13, playerEntityId: 1, baseEntityId: 4, wingmanEntityId: null, previousViewMode: 0xc },
  { type: 'departed', tick: 14, playerEntityId: 1, origin: 'automatic', commandIndex: null, viewMode: 0xc, previousViewMode: 6, position: at,
    orientation: [0, 0, -1, 0, 1, 0, 1, 0, 0], wingmanEntityId: 2 },
  { type: 'transition', tick: 14, gap: 'G-02/4' },
  { type: 'base-navigated', tick: 14, direction: 'next', row: null, moved: false, commandIndex: 1 },
  { type: 'base-confirmed', tick: 14, row: 3, record: 7, moved: true, commandIndex: 2 },
];

// P3-08's events (docs/plan/p3/02/spec.md, CR-22), one of each type and a consumption without a reply.
const aiEvents: DomainEvent[] = [
  { type: 'wingman-command-consumed', tick: 15, wingmanEntityId: 2, code: 6, issuedTick: 14, path: 'active', outcome: 'fallback', replyLine: 0x15 },
  { type: 'wingman-command-consumed', tick: 16, wingmanEntityId: 2, code: 3, issuedTick: 14, path: 'parked', outcome: 'refused', replyLine: null },
  { type: 'transponder-deployed', tick: 16, entityId: 20, creatorEntityId: 1, position: at, orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
];

describe('domain event envelopes (P3-02 S-04, 任务实例化; P3-06 D-04, D-06; P3-07 CR-05, CR-06)', () => {
  it('has closed, frozen outcome and reason lists', () => {
    expect(COMMAND_OUTCOMES).toEqual(['accepted', 'rejected', 'ignored']);
    expect(COMMAND_RESULT_REASONS).toEqual([
      'not-implemented', 'player-unavailable', 'wrong-context', 'no-target',
      // P3-07 (CR-05).
      'no-candidate', 'no-change', 'no-weapon', 'weapon-disabled', 'no-ammunition', 'insufficient-charge', 'cooldown', 'misfire', 'out-of-arc',
      // P3-09 (MW-04).
      'no-destination', 'insufficient-energy',
      // P3-10 (CB-07).
      'subsystem-disabled',
    ]);
    expect(Object.isFrozen(COMMAND_OUTCOMES) && Object.isFrozen(COMMAND_RESULT_REASONS)).toBe(true);
    // P3-08 (CR-22) adds no command reason; a wingman's consumption has its own closed outcomes.
    expect(WINGMAN_COMMAND_OUTCOMES).toEqual(['applied', 'fallback', 'refused', 'acknowledged', 'status', 'unknown-code']);
    expect(Object.isFrozen(WINGMAN_COMMAND_OUTCOMES)).toBe(true);
    // The outcome table itself is exercised through the comparator (compare.test.ts); a code below 1 has no outcome.
    expect([isWingmanCommandReply('active', 1, 'applied', 0x10), isWingmanCommandReply('active', 0, 'refused', 0)]).toEqual([true, false]);
  });

  it('is plain data that survives a JSON round trip unchanged', () => {
    const events: DomainEvent[] = [
      rejected, instantiated, toggled, matchedByCommand, matchedByAssist, released, leftWorld, ...combatEvents, ...mapWarpEvents, ...communicationsEvents,
      ...aiEvents,
    ];
    expect(JSON.parse(JSON.stringify(events))).toEqual(events);
    expect(Object.keys(rejected)).toEqual(['type', 'tick', 'commandIndex', 'commandType', 'outcome', 'reason']);
    expect(Object.keys(instantiated)).toEqual(['type', 'tick', 'entityId', 'kindBit', 'source', 'position']);
  });

  it('types the union, command types and sources exactly', () => {
    expectTypeOf<DomainEvent['type']>().toEqualTypeOf<
      | 'command-result' | 'object-instantiated' | 'speed-assist-toggled' | 'speed-matched' | 'speed-assist-released' | 'object-left-world'
      | 'target-changed' | 'target-cleared' | 'weapon-selected' | 'shot-fired' | 'hit' | 'object-destroyed' | 'explosion-started' | 'missile-ended'
      | 'fragment-expired' | 'source-released' | 'energy-depleted' | 'energy-allocation-changed' | 'left-page-changed'
      | 'map-toggled' | 'warp-destination-set' | 'warp-started' | 'warp-completed'
      | 'command-delivered' | 'radio-queued' | 'radio-taken' | 'incoming-started' | 'incoming-ended' | 'radio-flushed' | 'docking-requested'
      | 'docking-cancelled' | 'docked' | 'departed' | 'transition' | 'base-navigated' | 'base-confirmed'
      | 'wingman-command-consumed' | 'transponder-deployed'
    >();
    expect(new Set(combatEvents.map(({ type }) => type)).size).toBe(13);
    expect(new Set(mapWarpEvents.map(({ type }) => type)).size).toBe(4);
    expectTypeOf<WarpDestinationSetEvent['marker']['type']>().toEqualTypeOf<'created' | 'moved' | 'missing'>();
    expectTypeOf<WarpCompletedEvent['previousViewMode']>().toEqualTypeOf<1>();
    expect(new Set(communicationsEvents.map(({ type }) => type)).size).toBe(13);
    expectTypeOf<DepartedEvent['origin']>().toEqualTypeOf<'command' | 'automatic'>();
    expect(new Set(aiEvents.map(({ type }) => type)).size).toBe(2);
    expectTypeOf<WingmanCommandConsumedEvent['path']>().toEqualTypeOf<'active' | 'parked'>();
    expectTypeOf<WingmanCommandConsumedEvent['outcome']>().toEqualTypeOf<WingmanCommandOutcome>();
    expectTypeOf<WingmanCommandConsumedEvent['replyLine']>().toEqualTypeOf<number | null>();
    expectTypeOf<Attacker['type']>().toEqualTypeOf<'shooter' | 'lost-shooter' | 'none'>();
    expectTypeOf<ShotTrigger['type']>().toEqualTypeOf<'command' | 'ai' | 'automatic'>();
    expectTypeOf<HitEvent['cause']>().toEqualTypeOf<'projectile' | 'missile' | 'collision' | 'area' | 'parked'>();
    expectTypeOf<WeaponSelectedEvent['commandIndex']>().toEqualTypeOf<number | null>();
    expectTypeOf<SpeedMatchedEvent['origin']>().toEqualTypeOf<'command' | 'assist'>();
    expectTypeOf<ObjectLeftWorldEvent['source']>().toEqualTypeOf<EntitySource | null>();
    expectTypeOf<CommandResultEvent['commandType']>().toEqualTypeOf<CommandType>();
    expectTypeOf<EntitySource['collection']>().toEqualTypeOf<'mission' | 'wingman'>();
    expect(COMMAND_TYPES).toContain(rejected.commandType);
  });
});

function checkTypes(): unknown[] {
  const accepted: CommandResultEvent = { type: 'command-result', tick: 1, commandIndex: 0, commandType: 'launch', outcome: 'accepted', reason: null };
  const ignored: CommandResultEvent = { type: 'command-result', tick: 1, commandIndex: 1, commandType: 'launch', outcome: 'ignored', reason: 'not-implemented' };
  const wingman: EntitySource = { collection: 'wingman', index: 0, group: null };
  // @ts-expect-error An accepted command has no reason.
  const acceptedWithReason: CommandResultEvent = { ...accepted, reason: 'not-implemented' };
  // @ts-expect-error A rejected command needs a reason.
  const rejectedWithoutReason: CommandResultEvent = { ...rejected, reason: null };
  // @ts-expect-error Reasons are closed: P3-07 reuses player-unavailable instead.
  const unknownReason: CommandResultEvent = { ...rejected, reason: 'no-player' };
  const cooldown: CommandResultEvent = { ...rejected, outcome: 'ignored', reason: 'cooldown' };
  const command = { type: 'target-changed', tick: 1, playerEntityId: 1, previousTarget: null, target: 2, targetKindBit: 7, mode: 'enemy' } as const;
  // @ts-expect-error A command's selection names its command.
  const commandWithoutIndex: TargetChangedEvent = { ...command, origin: 'command', commandIndex: null };
  // @ts-expect-error An automatic selection has no command.
  const automaticWithIndex: TargetChangedEvent = { ...command, origin: 'automatic', commandIndex: 0 };
  // @ts-expect-error A lost shooter has no entity.
  const lostWithEntity: Attacker = { type: 'lost-shooter', entityId: 1, kindBit: 0 };
  // @ts-expect-error An automatic mount's shot has no channel.
  const automaticWithChannel: ShotTrigger = { type: 'automatic', channel: 0 };
  // @ts-expect-error Command types are those of the TickInput union.
  const unknownCommand: CommandResultEvent = { ...rejected, commandType: 'add-marker' };
  // @ts-expect-error Sources have a closed namespace.
  const unknownCollection: EntitySource = { collection: 'runtime', index: 0, group: null };
  // @ts-expect-error The group of a non-member is null, never omitted.
  const omittedGroup: EntitySource = { collection: 'mission', index: 0 };
  const noTarget: CommandResultEvent = { ...rejected, outcome: 'ignored', reason: 'no-target' };
  // @ts-expect-error A manual match names its command, not a speed difference.
  const commandWithDifference: SpeedMatchedEvent = { type: 'speed-matched', tick: 1, targetEntityId: 2, origin: 'command', speedDifferenceExceeded: true };
  // @ts-expect-error An assisted match has no command.
  const assistWithCommand: SpeedMatchedEvent = { type: 'speed-matched', tick: 1, targetEntityId: 2, origin: 'assist', commandIndex: 0 };
  // @ts-expect-error A source that left is a snapshot or null, never omitted.
  const omittedSource: ObjectLeftWorldEvent = { type: 'object-left-world', tick: 1, entityId: 2, kindBit: 7 };
  // @ts-expect-error A missing marker has no entity.
  const missingWithEntity: WarpDestinationSetEvent['marker'] = { type: 'missing', entityId: 3 };
  // @ts-expect-error A completion always leaves view mode 1.
  const completedFromMap: WarpCompletedEvent = { type: 'warp-completed', tick: 1, serial: 1, viewMode: 0xc, previousViewMode: 8, arrival: null };
  const noDestination: CommandResultEvent = { ...rejected, outcome: 'ignored', reason: 'no-destination' };
  const launch = { type: 'departed', tick: 1, playerEntityId: 1, viewMode: 0xc, previousViewMode: 6, position: at, orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    wingmanEntityId: null } as const;
  // @ts-expect-error A command's launch names its command.
  const commandLaunchWithoutIndex: DepartedEvent = { ...launch, origin: 'command', commandIndex: null };
  // @ts-expect-error An automatic launch has no command.
  const automaticLaunchWithIndex: DepartedEvent = { ...launch, origin: 'automatic', commandIndex: 0 };
  // @ts-expect-error The direct list has no portrait.
  const directWithFace: DomainEvent = { type: 'radio-taken', tick: 1, message: { table: 20983, face: 0, index: 0 }, speaker: null };
  // @ts-expect-error A portrait table needs a portrait.
  const portraitWithoutFace: DomainEvent = { type: 'radio-taken', tick: 1, message: { table: 20011, face: null, index: 0 }, speaker: null };
  // @ts-expect-error Sub-states are closed: P3-11 adds 1, 2 and 6.
  const unknownSubState: DomainEvent = { type: 'docking-requested', tick: 1, playerEntityId: 1, dockingObject: 2, previousSubState: 2, deadlineClock: 0, commandIndex: 0 };
  // @ts-expect-error Events are read-only.
  instantiated.position.x = 0;
  return [
    missingWithEntity, completedFromMap, noDestination,
    commandLaunchWithoutIndex, automaticLaunchWithIndex, directWithFace, portraitWithoutFace, unknownSubState,
    accepted, ignored, wingman, acceptedWithReason, rejectedWithoutReason, unknownReason, unknownCommand, unknownCollection, omittedGroup, noTarget,
    commandWithDifference, assistWithCommand, omittedSource, cooldown, commandWithoutIndex, automaticWithIndex, lostWithEntity, automaticWithChannel,
  ];
}
void checkTypes;
