import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  COMMAND_OUTCOMES,
  COMMAND_RESULT_REASONS,
  type CommandResultEvent,
  type DomainEvent,
  type EntitySource,
  type ObjectInstantiatedEvent,
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

describe('domain event envelopes (P3-02 S-04, 任务实例化)', () => {
  it('has closed, frozen outcome and reason lists', () => {
    expect(COMMAND_OUTCOMES).toEqual(['accepted', 'rejected', 'ignored']);
    expect(COMMAND_RESULT_REASONS).toEqual(['not-implemented']);
    expect(Object.isFrozen(COMMAND_OUTCOMES) && Object.isFrozen(COMMAND_RESULT_REASONS)).toBe(true);
  });

  it('is plain data that survives a JSON round trip unchanged', () => {
    const events: DomainEvent[] = [rejected, instantiated];
    expect(JSON.parse(JSON.stringify(events))).toEqual(events);
    expect(Object.keys(rejected)).toEqual(['type', 'tick', 'commandIndex', 'commandType', 'outcome', 'reason']);
    expect(Object.keys(instantiated)).toEqual(['type', 'tick', 'entityId', 'kindBit', 'source', 'position']);
  });

  it('types the union, command types and sources exactly', () => {
    expectTypeOf<DomainEvent['type']>().toEqualTypeOf<'command-result' | 'object-instantiated'>();
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
  // @ts-expect-error Reasons are closed.
  const unknownReason: CommandResultEvent = { ...rejected, reason: 'cooldown' };
  // @ts-expect-error Command types are those of the TickInput union.
  const unknownCommand: CommandResultEvent = { ...rejected, commandType: 'add-marker' };
  // @ts-expect-error Sources have a closed namespace.
  const unknownCollection: EntitySource = { collection: 'runtime', index: 0, group: null };
  // @ts-expect-error The group of a non-member is null, never omitted.
  const omittedGroup: EntitySource = { collection: 'mission', index: 0 };
  // @ts-expect-error Events are read-only.
  instantiated.position.x = 0;
  return [accepted, ignored, wingman, acceptedWithReason, rejectedWithoutReason, unknownReason, unknownCommand, unknownCollection, omittedGroup];
}
void checkTypes;
