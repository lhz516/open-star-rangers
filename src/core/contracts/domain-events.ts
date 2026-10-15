/**
 * Domain event envelopes of formal Core (docs/plan/p3/02/spec.md, 输入与命令, 任务实例化; ADR-0006). step() returns
 * the events of one tick as deeply frozen plain data in emission order, without object references. This module owns
 * the shapes; the pipeline (subtask 05) emits command results and instantiation (subtask 07) emits
 * object-instantiated. The speed and world-exit events are P3-06's (docs/plan/p3/06/spec.md, 检查点 A 定稿的状态与契约):
 * the player update emits the speed assist's events before the tick's command results and `speed-assist-toggled` right
 * after its command's result, request handling a manual match's `speed-matched`, and the parked update
 * `object-left-world`. P3-07's combat events and reasons follow (docs/plan/p3/02/spec.md, CR-05, CR-06), then P3-10's
 * communications, docking and base events and reason (CB-07, CB-13). New event types or reasons are added by revising
 * the spec, not by consumers.
 */
import type { Activity, EntityId, ExplosionVariant, Level, Matrix3 } from '../world/entity-table.ts';
import type { LeftPage, TargetMode } from '../world/player-state.ts';
import type { MessageIdentity, MissionSubState, RadioCallback, SpeakerSnapshot } from '../world/world-state.ts';
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
 * P3-07's (docs/plan/p3/02/spec.md, CR-05):
 * - `no-candidate`: no object qualifies for the target selection;
 * - `no-change`: the selection or page is already the requested one, or a level would leave 0–3;
 * - `no-weapon`: the craft has no mounts, or the list's current mount is empty;
 * - `weapon-disabled`: the mount is destroyed;
 * - `no-ammunition`: the missile mount is empty;
 * - `insufficient-charge`: the player's gun charge does not cover the shot;
 * - `cooldown`: the mount's interval has not passed;
 * - `misfire`: the damaged mount's draw failed;
 * - `out-of-arc`: an aimed gun has no solution towards its target.
 * P3-10's (CB-07):
 * - `subsystem-disabled`: a player subsystem the command needs is in state 2;
 * `no-candidate` also covers a communications menu without a qualifying object or item.
 */
export const COMMAND_RESULT_REASONS = Object.freeze([
  'not-implemented', 'player-unavailable', 'wrong-context', 'no-target',
  'no-candidate', 'no-change', 'no-weapon', 'weapon-disabled', 'no-ammunition', 'insufficient-charge', 'cooldown', 'misfire', 'out-of-arc',
  'subsystem-disabled',
] as const);
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

// P3-07's events (docs/plan/p3/02/spec.md, CR-06): detached fact snapshots. None carries a clock, which is always tick ×
// clockUnitsPerTick; positions and orientations are the entity's at emission.

/** Who a hit or a destruction is attributed to. */
export type Attacker =
  /** The shooter, still valid at the hit, or a parked engagement's attacker. */
  | { readonly type: 'shooter'; readonly entityId: EntityId; readonly kindBit: number }
  /** The shooter was no longer valid: the original falls back to the class mask 0x93780 and counts no kill (H4). */
  | { readonly type: 'lost-shooter' }
  /** Collisions and AI area damage. */
  | { readonly type: 'none' };

/** What fired a shot: a command's channel, an AI trigger channel or an automatic mount. */
export type ShotTrigger =
  | { readonly type: 'command'; readonly channel: 'primary' | 'secondary'; readonly commandIndex: number }
  | { readonly type: 'ai'; readonly channel: 0 | 1 | 2 }
  | { readonly type: 'automatic' };

interface TargetChangedFields extends DomainEventBase<'target-changed'> {
  readonly playerEntityId: EntityId;
  readonly previousTarget: EntityId | null;
  readonly target: EntityId;
  readonly targetKindBit: number;
  readonly mode: TargetMode;
}

/** Once per `select-target` request handling applies (T1); clearing a target never emits it. */
export type TargetChangedEvent =
  | (TargetChangedFields & { readonly origin: 'command'; readonly commandIndex: number })
  | (TargetChangedFields & { readonly origin: 'automatic'; readonly commandIndex: null });

/** The right display's clearing at the end of the frame (CR-10); `warp` is the original's departure notice. */
export interface TargetClearedEvent extends DomainEventBase<'target-cleared'> {
  readonly playerEntityId: EntityId;
  readonly previousTarget: EntityId;
  readonly cause: 'invalid' | 'base-view' | 'warp';
}

/** Right after an accepted selection command's result; `changed` says whether the current mount changed. */
export interface WeaponSelectedEvent extends DomainEventBase<'weapon-selected'> {
  readonly entityId: EntityId;
  readonly list: 0 | 1;
  /** i32; −1 for an empty list. */
  readonly index: number;
  readonly mount: number | null;
  readonly changed: boolean;
  /** Null for a selection without a command (P3-10's base resupply). */
  readonly commandIndex: number | null;
}

/** After request handling built a projectile or missile; consumers choose the sound by `family`. */
export interface ShotFiredEvent extends DomainEventBase<'shot-fired'> {
  readonly shooterEntityId: EntityId;
  readonly shooterKindBit: number;
  readonly shooterPosition: Vec3;
  /** The new projectile or missile. */
  readonly entityId: EntityId;
  readonly family: 'gun' | 'missile';
  /** The gun or missile record. */
  readonly weapon: number;
  readonly mount: number;
  readonly position: Vec3;
  readonly trigger: ShotTrigger;
}

/**
 * Once per hit feedback item the original posts (`0x2a40c`, `0x2a5fc`) or damage a parked engagement applies, after
 * the shield and hull and before the destruction. Integers are i32.
 */
export interface HitEvent extends DomainEventBase<'hit'> {
  readonly victimEntityId: EntityId;
  readonly victimKindBit: number;
  readonly victimPosition: Vec3;
  readonly cause: 'projectile' | 'missile' | 'collision' | 'area' | 'parked';
  /** The projectile or missile; null for the other causes. */
  readonly sourceEntityId: EntityId | null;
  readonly attacker: Attacker;
  readonly damage: number;
  /** The player's destruction-view gate stopped the damage; the original still posts the feedback. */
  readonly gated: boolean;
  readonly shield: { readonly before: number; readonly after: number };
  readonly hull: { readonly before: number; readonly after: number };
  /** Feedback item +0x0C: the shield was ≤ 0 before the hit. */
  readonly shieldWasEmpty: boolean;
  readonly impact: { readonly point: Vec3; readonly local: Vec3; readonly face: 0 | 1 | 2 | 3 | 4 | 5 } | null;
  /** A projectile's outcome; null for missiles and the other causes. */
  readonly projectile: 'ricochet' | 'removed' | null;
}

/** Once in an object's life, when its destroyed flag is set, after its hit. */
export interface ObjectDestroyedEvent extends DomainEventBase<'object-destroyed'> {
  readonly entityId: EntityId;
  readonly kindBit: number;
  readonly source: EntitySource | null;
  readonly position: Vec3;
  readonly activity: Activity;
  readonly attacker: Attacker;
  /** The original object event's class: 0 when the attacker's kind is 1, otherwise 1. */
  readonly eventClass: 0 | 1;
  readonly outcome: 'explodes' | 'delayed' | 'removed';
}

/** When an explosion activates in request handling; the presentation layer selects its EXPL item once on it (CR-11). */
export interface ExplosionStartedEvent extends DomainEventBase<'explosion-started'> {
  readonly entityId: EntityId;
  readonly sourceEntityId: EntityId;
  readonly sourceKindBit: number;
  readonly variant: ExplosionVariant;
  /** At activation, before any move: the construction position. */
  readonly position: Vec3;
  readonly activationClock: number;
}

/** When a missile's expiry request is handled. */
export interface MissileEndedEvent extends DomainEventBase<'missile-ended'> {
  readonly entityId: EntityId;
  readonly shooterEntityId: EntityId | null;
  readonly outcome: 'detonated' | 'fizzled';
  readonly position: Vec3;
  readonly orientation: Matrix3;
}

/** When a fragment's expiry request is handled (X7). */
export interface FragmentExpiredEvent extends DomainEventBase<'fragment-expired'> {
  readonly entityId: EntityId;
  readonly sourceKindBit: number;
  readonly part: number;
  readonly position: Vec3;
  readonly outcome: 'explodes' | 'escape-pod' | 'wingman-pod' | 'removed';
}

/** When a part-0 fragment's hand-off request is handled; `removed` is false only for the player. */
export interface SourceReleasedEvent extends DomainEventBase<'source-released'> {
  readonly entityId: EntityId;
  readonly kindBit: number;
  readonly fragmentEntityId: EntityId;
  readonly removed: boolean;
}

/** When an energy update enters the depleted branch with the latch clear. */
export interface EnergyDepletedEvent extends DomainEventBase<'energy-depleted'> {
  readonly entityId: EntityId;
  readonly kindBit: number;
  readonly position: Vec3;
}

/** Right after an accepted level command's result. */
export interface EnergyAllocationChangedEvent extends DomainEventBase<'energy-allocation-changed'> {
  readonly entityId: EntityId;
  readonly shieldLevel: Level;
  readonly chargeLevel: Level;
  readonly commandIndex: number;
}

/**
 * Right after an accepted page command's result, including every communications menu command (CB-03); a page write
 * without a command (a flush, an incoming message, the left display handler) emits it only when the page changes.
 */
export interface LeftPageChangedEvent extends DomainEventBase<'left-page-changed'> {
  readonly page: LeftPage;
  readonly previousPage: LeftPage;
  readonly commandIndex: number | null;
}

// P3-10's events (docs/plan/p3/02/spec.md, CB-13): detached fact snapshots like P3-07's, without a clock, names or
// content bytes.

/** Request handling wrote the receiver's pending command; it does not say the receiver acted on it. */
export interface CommandDeliveredEvent extends DomainEventBase<'command-delivered'> {
  readonly receiverEntityId: EntityId;
  readonly receiverKindBit: number;
  /** A u32 from 1. */
  readonly code: number;
  readonly senderEntityId: EntityId;
  readonly commandIndex: number;
}

/** Every queuing; `length` is the queue's after it. */
export interface RadioQueuedEvent extends DomainEventBase<'radio-queued'> {
  readonly message: MessageIdentity;
  readonly callback: RadioCallback;
  readonly speaker: SpeakerSnapshot | null;
  /** A docking reply goes to the head, every other item in due order. */
  readonly position: 'head' | 'sorted';
  readonly length: number;
}

/** The `communications-reply` stage took the queue's head: the channel is loading. */
export interface RadioTakenEvent extends DomainEventBase<'radio-taken'> {
  readonly message: MessageIdentity;
  readonly speaker: SpeakerSnapshot | null;
}

/** The presentation sub-step started playing a message. */
export interface IncomingStartedEvent extends DomainEventBase<'incoming-started'> {
  readonly message: MessageIdentity;
  readonly speaker: SpeakerSnapshot | null;
  /** i32, in 1/8 s. */
  readonly frameDurations: readonly number[];
  /** Page 5 shows it: the view mode is not 1. */
  readonly shown: boolean;
}

/** The presentation sub-step ended a message and ran its callback. */
export interface IncomingEndedEvent extends DomainEventBase<'incoming-ended'> {
  readonly message: MessageIdentity;
  readonly speaker: SpeakerSnapshot | null;
  readonly callback: RadioCallback;
  /** The callback moved sub-state 3 to 4. */
  readonly countdownStarted: boolean;
}

/** A flush, after its `left-page-changed`; P3-11 adds its causes. */
export interface RadioFlushedEvent extends DomainEventBase<'radio-flushed'> {
  readonly cause: 'docking-cancel';
  readonly removed: number;
  readonly interrupted: 'none' | 'loading' | 'playing';
}

/** Command code 9's selection started the docking wait, after its command's result. */
export interface DockingRequestedEvent extends DomainEventBase<'docking-requested'> {
  readonly playerEntityId: EntityId;
  readonly dockingObject: EntityId;
  readonly previousSubState: MissionSubState;
  readonly deadlineClock: number;
  readonly commandIndex: number;
}

/** One of the three cancellations (DK1, DK2); the original gives no feedback. */
export interface DockingCancelledEvent extends DomainEventBase<'docking-cancelled'> {
  readonly playerEntityId: EntityId;
  readonly dockingObject: EntityId;
  readonly cause: 'timeout' | 'invalid-object' | 'gate';
}

/** A docking request handling applied; a gate failure has only its `docking-cancelled`. */
export interface DockedEvent extends DomainEventBase<'docked'> {
  readonly playerEntityId: EntityId;
  readonly baseEntityId: EntityId;
  readonly wingmanEntityId: EntityId | null;
  readonly previousViewMode: number;
}

interface DepartedFields extends DomainEventBase<'departed'> {
  readonly playerEntityId: EntityId;
  readonly viewMode: number;
  readonly previousViewMode: number;
  readonly position: Vec3;
  readonly orientation: Matrix3;
  readonly wingmanEntityId: EntityId | null;
}

/** A launch request handling applied: the player's `l`, or sub-state 5's automatic launch. */
export type DepartedEvent =
  | (DepartedFields & { readonly origin: 'command'; readonly commandIndex: number })
  | (DepartedFields & { readonly origin: 'automatic'; readonly commandIndex: null });

/** Right after `docked` (G-02/3) or each `departed` (G-02/4): Runtime cuts the frame after this tick and holds. */
export interface TransitionEvent extends DomainEventBase<'transition'> {
  readonly gap: 'G-02/3' | 'G-02/4';
}

/** One per base navigation request; `row` is the cursor after it, null without a base service. */
export interface BaseNavigatedEvent extends DomainEventBase<'base-navigated'> {
  readonly direction: 'previous' | 'next';
  readonly row: number | null;
  readonly moved: boolean;
  readonly commandIndex: number;
}

/** One per base confirmation request; `record` is the confirmed row's record, null without a base service. */
export interface BaseConfirmedEvent extends DomainEventBase<'base-confirmed'> {
  readonly row: number | null;
  readonly record: number | null;
  readonly moved: boolean;
  readonly commandIndex: number;
}

export type DomainEvent =
  | CommandResultEvent
  | ObjectInstantiatedEvent
  | SpeedAssistToggledEvent
  | SpeedMatchedEvent
  | SpeedAssistReleasedEvent
  | ObjectLeftWorldEvent
  | TargetChangedEvent
  | TargetClearedEvent
  | WeaponSelectedEvent
  | ShotFiredEvent
  | HitEvent
  | ObjectDestroyedEvent
  | ExplosionStartedEvent
  | MissileEndedEvent
  | FragmentExpiredEvent
  | SourceReleasedEvent
  | EnergyDepletedEvent
  | EnergyAllocationChangedEvent
  | LeftPageChangedEvent
  | CommandDeliveredEvent
  | RadioQueuedEvent
  | RadioTakenEvent
  | IncomingStartedEvent
  | IncomingEndedEvent
  | RadioFlushedEvent
  | DockingRequestedEvent
  | DockingCancelledEvent
  | DockedEvent
  | DepartedEvent
  | TransitionEvent
  | BaseNavigatedEvent
  | BaseConfirmedEvent;
