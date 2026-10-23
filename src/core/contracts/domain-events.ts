/**
 * Domain event envelopes of formal Core (docs/plan/p3/02/spec.md, 输入与命令, 任务实例化; ADR-0006). step() returns
 * the events of one tick as deeply frozen plain data in emission order, without object references. This module owns
 * the shapes; the pipeline (subtask 05) emits command results and instantiation (subtask 07) emits
 * object-instantiated. The speed and world-exit events are P3-06's (docs/plan/p3/06/spec.md, 检查点 A 定稿的状态与契约):
 * the player update emits the speed assist's events before the tick's command results and `speed-assist-toggled` right
 * after its command's result, request handling a manual match's `speed-matched`, and the parked update
 * `object-left-world`. P3-07's combat events and reasons follow (docs/plan/p3/02/spec.md, CR-05, CR-06), then P3-09's
 * map and Warp events and reasons (MW-04, MW-05), then P3-10's communications, docking and base events and reason
 * (CB-07, CB-13), then P3-08's wingman command and transponder events (CR-22), then P3-11's mission flow, loss, rescue,
 * result and teardown events and reason (ME-12, ME-13). New event types or reasons are added by revising the spec, not
 * by consumers.
 */
import type { Activity, EntityId, ExplosionVariant, Level, Matrix3 } from '../world/entity-table.ts';
import type { MapPixel } from '../world/map-rule-data.ts';
import type { LeftPage, TargetMode } from '../world/player-state.ts';
import type {
  MessageIdentity,
  MissionResult,
  MissionSubState,
  PlayerLoss,
  RadioCallback,
  SpeakerSnapshot,
  SummaryReference,
} from '../world/world-state.ts';
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
 * P3-09's (docs/plan/p3/02/spec.md, MW-04), both `ignored`; a Warp's interval reuses `cooldown`:
 * - `no-destination`: a Warp request without a selected destination;
 * - `insufficient-energy`: the Warp's cost exceeds the player's energy.
 * P3-10's (CB-07):
 * - `subsystem-disabled`: a player subsystem the command needs is in state 2;
 * `no-candidate` also covers a communications menu without a qualifying object or item.
 * P3-11's (ME-12), always `ignored`:
 * - `mission-ended`: the result is latched (main state 0 or 1), ahead of every other judgement.
 */
export const COMMAND_RESULT_REASONS = Object.freeze([
  'not-implemented', 'player-unavailable', 'wrong-context', 'no-target',
  'no-candidate', 'no-change', 'no-weapon', 'weapon-disabled', 'no-ammunition', 'insufficient-charge', 'cooldown', 'misfire', 'out-of-arc',
  'no-destination', 'insufficient-energy',
  'subsystem-disabled',
  'mission-ended',
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

// P3-09's events (docs/plan/p3/02/spec.md, MW-05): detached fact snapshots like P3-07's, in finite runtime units.

/** When request handling applies a `map-toggle`: the map opened or closed. The map itself has no original sound. */
export interface MapToggledEvent extends DomainEventBase<'map-toggled'> {
  readonly open: boolean;
  /** The view mode and previous view mode after the toggle. */
  readonly viewMode: number;
  readonly previousViewMode: number;
  readonly commandIndex: number;
}

/** What a select did to the map marker: created or moved it, or found none (MW-03). */
export type WarpMarkerChange =
  | { readonly type: 'created' | 'moved'; readonly entityId: EntityId }
  | { readonly type: 'missing' };

/** When request handling applies each select, even at an unchanged point (the click sound 10463); a hover never emits it. */
export interface WarpDestinationSetEvent extends DomainEventBase<'warp-destination-set'> {
  readonly playerEntityId: EntityId;
  readonly destination: Vec3;
  readonly pixel: MapPixel;
  /** The icon the select hit, whose z the destination took; null for none. */
  readonly icon: { readonly entityId: EntityId; readonly kindBit: number } | null;
  readonly marker: WarpMarkerChange;
  readonly commandIndex: number;
}

/** When request handling applies a `warp-start`, before its `left-page-changed`; the charge comes only at the completion. */
export interface WarpStartedEvent extends DomainEventBase<'warp-started'> {
  readonly playerEntityId: EntityId;
  readonly serial: number;
  readonly origin: Vec3;
  readonly destination: Vec3;
  /** R(d): the f32 start distance. */
  readonly distance: number;
  /** The gate's c and E (i32): the check, not a charge. */
  readonly check: { readonly cost: number; readonly energy: number };
  readonly transitLength: number;
  readonly fromViewMode: number;
  readonly commandIndex: number;
}

/** The arrival of a completed Warp whose player entity exists. */
export interface WarpArrival {
  readonly playerEntityId: EntityId;
  readonly origin: Vec3;
  readonly destination: Vec3;
  readonly position: Vec3;
  readonly orientation: Matrix3;
  /** s at the completion. */
  readonly error: number;
  /** The object the nearest-object snap took (possibly the player itself or the marker); null without a snap. */
  readonly snapped: EntityId | null;
  /** trunc(D), c and the energy before and after the charge (i32). */
  readonly charge: { readonly distance: number; readonly cost: number; readonly energyBefore: number; readonly energyAfter: number };
  /** The new +0xC8. */
  readonly warpClock: number;
  /** `0x3c040`: a hostile object, not destroyed, in state ≥ 7 or 4, strictly nearer than the player craft's +0x0C (sound 10181). */
  readonly hostileNear: boolean;
}

/**
 * Once per Warp, in the `warp-completion` stage, before the `left-page-changed` that restores the page. A depletion by
 * the charge is the next energy update's `energy-depleted`, not part of it.
 */
export interface WarpCompletedEvent extends DomainEventBase<'warp-completed'> {
  readonly serial: number;
  readonly viewMode: number;
  readonly previousViewMode: 1;
  /** Null when the player entity does not exist: only the view and page are restored. */
  readonly arrival: WarpArrival | null;
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

/** A flush, after its `left-page-changed`: P3-10's docking cancellation and P3-11's four callers (ME-13). */
export interface RadioFlushedEvent extends DomainEventBase<'radio-flushed'> {
  readonly cause: 'docking-cancel' | 'player-destroyed' | 'beacon-expired' | 'completion-message' | 'result-due';
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

/**
 * Right after `docked` (G-02/3), each `departed` (G-02/4) or `player-rescued` (G-02/5 for a destruction, G-02/6 for an
 * energy loss; ME-13): Runtime cuts the frame after this tick and holds.
 */
export interface TransitionEvent extends DomainEventBase<'transition'> {
  readonly gap: 'G-02/3' | 'G-02/4' | 'G-02/5' | 'G-02/6';
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

// P3-08's events (docs/plan/p3/02/spec.md, CR-22): detached fact snapshots like P3-07's and P3-10's.

export const WINGMAN_COMMAND_OUTCOMES = Object.freeze(['applied', 'fallback', 'refused', 'acknowledged', 'status', 'unknown-code'] as const);
export type WingmanCommandOutcome = (typeof WINGMAN_COMMAND_OUTCOMES)[number];

/** The status reply's lines, by hull percentage (WB3, WB4). */
const STATUS_LINES: readonly number[] = [0xb, 0xc, 0xd];

/**
 * The outcomes and reply lines each path gives codes 1–6 (CR-22's 结果映射, WB3, WB4): outcome → line, null for no
 * reply. Code 7 is `status` with a status line and every higher code `unknown-code` with line 3, on both paths.
 */
const WINGMAN_REPLIES: Readonly<Record<'active' | 'parked', readonly Partial<Record<WingmanCommandOutcome, number | null>>[]>> = {
  active: [
    { applied: 0x10, fallback: 0, refused: 0 },
    { applied: 3, refused: 0 },
    { applied: 0xe },
    { applied: 0x14, fallback: 0 },
    { applied: 0x12, fallback: 0 },
    { applied: 0x12, fallback: 0x15 },
  ],
  parked: [
    { applied: 0x10, refused: 0 },
    { acknowledged: 3, refused: 0 },
    { applied: 0xe, refused: null },
    { applied: 0xe, refused: null },
    { applied: 0x12, refused: 0 },
    { applied: 0x12, refused: 0x15 },
  ],
};

/** Whether a consumption of `code` on `path` may have `outcome` with `replyLine` (CR-22); `code` is a u32 from 1. */
export function isWingmanCommandReply(path: 'active' | 'parked', code: number, outcome: WingmanCommandOutcome, replyLine: number | null): boolean {
  if (!Number.isInteger(code) || code < 1) return false;
  if (code === 7) return outcome === 'status' && replyLine !== null && STATUS_LINES.includes(replyLine);
  if (code > 7) return outcome === 'unknown-code' && replyLine === 3;
  return WINGMAN_REPLIES[path][code - 1][outcome] === replyLine;
}

/**
 * A wingman consumed its pending command (`0x614a8` active, `0x61f20` parked), once, after the effect and the reply
 * call and as the slot is cleared; a blocked or overwritten command has none. `issuedTick` is the tick of the
 * delivery's `command-delivered`; `replyLine` is the line the reply call asked for (the drawn line and the message are
 * in its `radio-queued`), null when the parked refusal of codes 3 and 4 does not reply.
 */
export interface WingmanCommandConsumedEvent extends DomainEventBase<'wingman-command-consumed'> {
  readonly wingmanEntityId: EntityId;
  /** A u32 from 1. */
  readonly code: number;
  readonly issuedTick: number;
  readonly path: 'active' | 'parked';
  readonly outcome: WingmanCommandOutcome;
  readonly replyLine: number | null;
}

/** A `create-transponder` request constructed an active transponder (CR-20); a parked one, or a wingman's drop, has none. */
export interface TransponderDeployedEvent extends DomainEventBase<'transponder-deployed'> {
  readonly entityId: EntityId;
  readonly creatorEntityId: EntityId;
  readonly position: Vec3;
  readonly orientation: Matrix3;
}

// P3-11's events (docs/plan/p3/02/spec.md, ME-13): detached fact snapshots like P3-07's, without a clock or content text.

/** The object whose event (`0x6977c`, types 0–2) found no enemy left: the mission status became `ended`. */
export interface AllClearEvent extends DomainEventBase<'all-clear'> {
  readonly entityId: EntityId;
  readonly kindBit: number;
  /** The object event's type: 0 or 1 a destruction (its `eventClass`), 2 a world exit. */
  readonly eventClass: 0 | 1 | 2;
}

/** The mission flow's 3→4 step: the pre-settlement and state 4's due clock. */
export interface SettlementStartedEvent extends DomainEventBase<'settlement-started'> {
  readonly outcome: 'success' | 'failure';
  readonly summary: SummaryReference | null;
  /** i8; −1 without a matched range. */
  readonly summarySelector: number;
  readonly dueClock: number;
}

/** State 4 expired in the Warp view: its due clock moved on. */
export interface SettlementDeferredEvent extends DomainEventBase<'settlement-deferred'> {
  readonly dueClock: number;
}

/** A message-line message by its `data/flight-messages` field name: the completion (state 4) or the beacon (`0x33464`). */
export interface FlightMessageEvent extends DomainEventBase<'flight-message'> {
  readonly message: 'missionComplete' | 'beacon';
}

interface PlayerLossStartedFields extends DomainEventBase<'player-loss-started'> {
  readonly playerEntityId: EntityId;
}

/** The player's destruction entry `0x32d74` or energy entry `0x33464` took effect. */
export type PlayerLossStartedEvent =
  | (PlayerLossStartedFields & {
      readonly loss: 'destroyed';
      readonly previousSubState: MissionSubState;
      readonly previousViewMode: number;
      /** Whether step 4 switched to the destruction view (it is skipped in view 0x11 with sub-mode 8). */
      readonly viewSwitched: boolean;
    })
  | (PlayerLossStartedFields & { readonly loss: 'energy'; readonly previousSubState: 0; readonly deadlineClock: number });

/** A rescue (`0x67b98`), after its `weapon-selected` events and before its `transition`. */
export interface PlayerRescuedEvent extends DomainEventBase<'player-rescued'> {
  readonly playerEntityId: EntityId;
  readonly loss: PlayerLoss;
  /** The rescue count after it. */
  readonly rescues: 1 | 2;
  /** The selected base; null when no base-class entity existed. */
  readonly baseEntityId: EntityId | null;
  /** The base-class entities the selection drew from. */
  readonly candidates: number;
  readonly position: Vec3;
  readonly orientation: Matrix3;
}

/** The result latch; `result` is a frozen copy of the flow's. */
export interface ResultLatchedEvent extends DomainEventBase<'result-latched'> {
  readonly result: MissionResult;
}

/** The teardown started (`0x334bc`): every entity is pending removal. */
export interface TeardownStartedEvent extends DomainEventBase<'teardown-started'> {
  readonly entities: number;
}

/** The teardown completed: the run's last tick. */
export interface MissionCompletedEvent extends DomainEventBase<'mission-completed'> {
  readonly outcome: 'success' | 'failure';
}

/** A wingman's destruction (`0x32dec`) started the loss message's timer. */
export interface WingmanLossTimerStartedEvent extends DomainEventBase<'wingman-loss-timer-started'> {
  readonly wingmanEntityId: EntityId;
  readonly dueClock: number;
}

/** The wingman loss timer expired; `queued` says whether a message was found and queued. */
export interface WingmanLossTimerExpiredEvent extends DomainEventBase<'wingman-loss-timer-expired'> {
  readonly queued: boolean;
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
  | MapToggledEvent
  | WarpDestinationSetEvent
  | WarpStartedEvent
  | WarpCompletedEvent
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
  | BaseConfirmedEvent
  | WingmanCommandConsumedEvent
  | TransponderDeployedEvent
  | AllClearEvent
  | SettlementStartedEvent
  | SettlementDeferredEvent
  | FlightMessageEvent
  | PlayerLossStartedEvent
  | PlayerRescuedEvent
  | ResultLatchedEvent
  | TeardownStartedEvent
  | MissionCompletedEvent
  | WingmanLossTimerStartedEvent
  | WingmanLossTimerExpiredEvent;
