/**
 * Domain event envelopes of formal Core (docs/plan/p3/02/spec.md, 输入与命令, 任务实例化; ADR-0006). step() returns
 * the events of one tick as deeply frozen plain data in emission order, without object references. This module owns
 * the shapes; the pipeline (subtask 05) emits command results and instantiation (subtask 07) emits
 * object-instantiated. The speed and world-exit events are P3-06's (docs/plan/p3/06/spec.md, 检查点 A 定稿的状态与契约):
 * the player update emits the speed assist's events before the tick's command results and `speed-assist-toggled` right
 * after its command's result, request handling a manual match's `speed-matched`, and the parked update
 * `object-left-world`. New event types or reasons are added by revising the spec, not by consumers.
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
 * Closed reason codes of rejected and ignored commands; any rule task may use them.
 * - `not-implemented`: no rule handles this command yet; a development-stage result, not the original's no-op.
 * - `player-unavailable`: no player entity can take it: none, destroyed, not yet active or being removed.
 * - `wrong-context`: the original does not handle it in the current interaction context.
 * - `no-target`: it needs a valid target, and there is none.
 */
export const COMMAND_RESULT_REASONS = Object.freeze(['not-implemented', 'player-unavailable', 'wrong-context', 'no-target'] as const);
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

/** The speed assist switched by a command (Ctrl+Enter), right after that command's result. */
export interface SpeedAssistToggledEvent extends DomainEventBase<'speed-assist-toggled'> {
  readonly commandIndex: number;
  /** The switch after the toggle. */
  readonly enabled: boolean;
}

interface SpeedMatchedFields extends DomainEventBase<'speed-matched'> {
  /** The entity whose speed the player's was matched to. */
  readonly targetEntityId: number;
}

/** A manual match (Enter, or its alias) that request handling applied. */
export interface CommandSpeedMatchedEvent extends SpeedMatchedFields {
  readonly origin: 'command';
  readonly commandIndex: number;
}

/** A match by the speed assist. */
export interface AssistSpeedMatchedEvent extends SpeedMatchedFields {
  readonly origin: 'assist';
  /** Whether the two speeds differed by more than the original's flash constant before the match. */
  readonly speedDifferenceExceeded: boolean;
}

/** Emitted only when the match was written. */
export type SpeedMatchedEvent = CommandSpeedMatchedEvent | AssistSpeedMatchedEvent;

/** The speed assist lost its target after a match and restored full throttle. */
export type SpeedAssistReleasedEvent = DomainEventBase<'speed-assist-released'>;

/** A parked object's true exit from the world, once in its life: `{ type, tick, entityId, kindBit, source }`. */
export interface ObjectLeftWorldEvent extends DomainEventBase<'object-left-world'> {
  readonly entityId: number;
  /** Bit position 0–31 of the original runtime kind. */
  readonly kindBit: number;
  /** A snapshot of the entity's source as it left; null for an entity created at run time. */
  readonly source: EntitySource | null;
}

export type DomainEvent =
  | CommandResultEvent
  | ObjectInstantiatedEvent
  | SpeedAssistToggledEvent
  | SpeedMatchedEvent
  | SpeedAssistReleasedEvent
  | ObjectLeftWorldEvent;
