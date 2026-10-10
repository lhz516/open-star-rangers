/**
 * Domain event envelopes of formal Core (docs/plan/p3/02/spec.md, 输入与命令, 任务实例化; ADR-0006). step() returns
 * the events of one tick as deeply frozen plain data in emission order, without object references. This module owns
 * the shapes; the pipeline (subtask 05) emits command results and instantiation (subtask 07) emits
 * object-instantiated. New event types or reasons are added by revising the spec, not by consumers.
 */
import type { CommandType } from './tick-input.ts';

/** Fields every domain event has. */
export interface DomainEventBase<Type extends string> {
  readonly type: Type;
  /** The number of the step that emitted the event. */
  readonly tick: number;
}

/** A Core vector in original runtime units. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const COMMAND_OUTCOMES = Object.freeze(['accepted', 'rejected', 'ignored'] as const);
export type CommandOutcome = (typeof COMMAND_OUTCOMES)[number];

/**
 * Closed reason codes of rejected and ignored commands. `not-implemented`: no rule handles this command yet; it is
 * a development-stage result, not the original's no-op.
 */
export const COMMAND_RESULT_REASONS = Object.freeze(['not-implemented'] as const);
export type CommandResultReason = (typeof COMMAND_RESULT_REASONS)[number];

interface CommandResultFields extends DomainEventBase<'command-result'> {
  /** Index of the command in the tick's input. */
  readonly commandIndex: number;
  readonly commandType: CommandType;
}

export interface AcceptedCommandResult extends CommandResultFields {
  readonly outcome: 'accepted';
  readonly reason: null;
}

export interface UnacceptedCommandResult extends CommandResultFields {
  readonly outcome: 'rejected' | 'ignored';
  readonly reason: CommandResultReason;
}

/** Exactly one per structurally valid command, in command order: `{ type, tick, commandIndex, commandType, outcome, reason }`. */
export type CommandResultEvent = AcceptedCommandResult | UnacceptedCommandResult;

/** Where a group member came from. */
export interface GroupMembership {
  /** Indexes `MissionSetup.groups`. */
  readonly index: number;
  /** Zero-based number of the group's spawn request that created the member. */
  readonly request: number;
  /** Position in the group's member list; a declaration listed twice gives two members. */
  readonly member: number;
}

/** The declaration an entity was instantiated from, in its namespace. */
export interface EntitySource {
  /** `mission` indexes `MissionSetup.declarations`; `wingman` indexes `MissionSetup.wingmanOptions`. */
  readonly collection: 'mission' | 'wingman';
  readonly index: number;
  /** Null unless the entity is a section-5 group member. */
  readonly group: GroupMembership | null;
}

/** One per instantiated object, in instantiation order: `{ type, tick, entityId, kindBit, source, position }`. */
export interface ObjectInstantiatedEvent extends DomainEventBase<'object-instantiated'> {
  readonly entityId: number;
  /** Bit position 0–31 of the original runtime kind, as in the content's `craftType`. */
  readonly kindBit: number;
  readonly source: EntitySource;
  /** A snapshot at instantiation, detached from the world. */
  readonly position: Vec3;
}

export type DomainEvent = CommandResultEvent | ObjectInstantiatedEvent;
