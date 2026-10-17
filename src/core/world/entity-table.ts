/**
 * Entities and the entity table of formal Core (docs/plan/p3/02/spec.md, 实体与生命周期), following the original object
 * table (Q-08, docs/original/formats/executable.md#runtime-object-table-p3-0201):
 * - IDs start at 1, follow allocation order and are never reused within a world;
 * - every kind bit has its own list in allocation order (the original's tail append in `0x520d4`);
 * - a walk over a kind mask visits the bits in ascending order and each list from head to tail, and it is live like the
 *   original iterator `0x5261c`: an entity appended during the walk to the current or a higher bit is visited in the
 *   same walk, one appended to a lower bit is not;
 * - an entity keeps the original object state (+3) and activity (+2); destroyed (+0xD8) is a separate flag, and neither
 *   destruction nor a removal state takes it out of its list: only request handling removes, never during a walk.
 * Rule tasks add their own entity fields through the instantiation extension point (spec 实体与生命周期). P3-06 adds
 * the flight state (docs/plan/p3/06/spec.md, 检查点 A 定稿的状态与契约; D-02): the maximum speed, the parked-update and
 * Warp timers, the movement block, the initial AI state and the formation.
 */
import type { AssetId } from '../../content/asset-id.ts';
import type { CraftSide } from '../../content/logic/logic-content.ts';
import type { EntitySource, Vec3 } from '../contracts/domain-events.ts';
import { fitsLimit } from '../contracts/limits.ts';
import { CoreFaultError } from '../errors.ts';
import { isFiniteFloat32 } from '../rules/float32.ts';
import { toInt32 } from '../rules/record-defaults.ts';
import type { ControlBlock } from '../systems/pipeline.ts';

/** Positive safe integer, allocated from 1 in creation order and never reused within a world. */
export type EntityId = number;

const KIND_BITS = 32;
/** A mask with every kind bit set. */
export const ALL_KINDS = 0xffffffff;

/**
 * The original object state, byte +3 (Q-08), with the original values:
 * - `new` (0): every entity starts here at allocation;
 * - `presentation-ready` (1, 3): the original renderer's completion callbacks set it. Core has no renderer callback and
 *   counts a presentation as ready as soon as the entity gets one, when it is instantiated active or leaves the parked
 *   state (project choice, spec 实体与生命周期); a parked entity has no presentation and stays `new`;
 * - `awaiting-presentation` (2): the original waits for an asynchronous load; Core never enters it;
 * - `destroyed-source` (4): the object an explosion was made from; not updated, still moved;
 * - `area-switch` (5): leaves or re-enters the active area at its next update;
 * - `pending-removal` (6): removed at its next update;
 * - `active` (7);
 * - `projectile-hit` (8): a projectile that has hit; the systems that need state 7 and above still include it.
 * Rule tasks write destroyed-source, area-switch, pending-removal and projectile-hit.
 */
export type ObjectState =
  | 'new'
  | 'presentation-ready'
  | 'awaiting-presentation'
  | 'destroyed-source'
  | 'area-switch'
  | 'pending-removal'
  | 'active'
  | 'projectile-hit';

/** The original activity, byte +2: parked outside the active area (0), active (1) or docked (3). */
export type Activity = 'parked' | 'active' | 'docked';

/** A declaration in its namespace; see EntitySource. */
export type DeclarationReference = Pick<EntitySource, 'collection' | 'index'>;

/**
 * Where an entity's name comes from; `none` is the original's explicit no-name branch, not a missing resource. The
 * assignment rules (Q-05) belong to instantiation; candidate and pool text resolve from the mission setup.
 */
export type NameReference =
  | { readonly type: 'none' }
  | { readonly type: 'candidate'; readonly declaration: DeclarationReference; readonly candidate: number }
  | { readonly type: 'pool'; readonly index: number }
  | { readonly type: 'craft-type'; readonly kindBit: number }
  /** The kind-25 map marker's (MW-03): consumers resolve it to `hud-text`'s `mapMarkerName`; never assigned from a pool. */
  | { readonly type: 'map-marker' };

/** The three explosion variants Core creates (mb +0xF0 = 0, 2, 3); variant 1 is the presentation layer's (CR-11). */
export type ExplosionVariant = 'large' | 'other' | 'missile';

/**
 * What a renderer draws, a closed union fixed at allocation (docs/plan/p3/02/spec.md, CR-02): the model Asset of a
 * craft; a missile record, whose look the presentation layer resolves from content; a projectile-visuals record; an
 * explosion variant, whose EXPL list and item the presentation layer selects (CR-11); one part of the first part list
 * of a source model, or for a kind 1 or 2 source's part 0 its parts 0–2; the kind-25 map marker, which has no 3D
 * visual but is still listed (docs/plan/p3/02/spec.md, MW-03). Model Asset IDs, craft-type slots and record indexes are
 * never merged into one number.
 */
export type EntityPresentation =
  | { readonly type: 'model'; readonly model: AssetId }
  | { readonly type: 'missile'; readonly missile: number }
  | { readonly type: 'projectile'; readonly visuals: AssetId; readonly record: number }
  | { readonly type: 'explosion'; readonly variant: ExplosionVariant }
  | { readonly type: 'fragment'; readonly model: AssetId; readonly part: number; readonly display: 'part' | 'parts-0-2' }
  | { readonly type: 'map-marker' };

/**
 * A 3×3 matrix in row order: the original's three attitude rows (object +0x48, +0x54, +0x60), the third of which
 * movement advances along. Instantiation gives the player the identity and every other entity its placement attitude
 * (Q-07, Q-11).
 */
export type Matrix3 = readonly [number, number, number, number, number, number, number, number, number];

/**
 * The rule inputs instantiation copies from the entity's record after the record's defaults (Q-04, Q-07), i32 each,
 * named as in the content's `RuleInputs`: +0x70, +0x74 and +0x78 become the runtime +0xDC, +0xE0 and +0xE4; +0x60,
 * +0x64 and +0x68 scale craft-record values, which P3-07 derives once the craft records are imported.
 */
export interface EntityRuleInputs {
  /** +0x60. */
  readonly percentB: number;
  /** +0x64. */
  readonly percentC: number;
  /** +0x68. */
  readonly percentD: number;
  /** +0x70, runtime +0xDC. */
  readonly aiValueA: number;
  /** +0x74, runtime +0xE0. */
  readonly aiValueB: number;
  /** +0x78, runtime +0xE4. */
  readonly aiValueC: number;
}

/**
 * The three rotation axes of a movement block, about the attitude's first, second and third row (original axes 1, 2
 * and 3: pitch, yaw and roll).
 */
export const ROTATION_AXES = Object.freeze(['pitch', 'yaw', 'roll'] as const);
export type RotationAxis = (typeof ROTATION_AXES)[number];

/** Steady rotation about one row: block +0x60–+0x68 and the enable flag +0x7C–+0x84. */
export interface SteeringAxis {
  /** f32, rad/s (unit Likely); kept but not applied while disabled. */
  rate: number;
  enabled: boolean;
}

/** A timed rotation about one row (block +0x2C–+0x58), written by P3-07's impulse writers and decayed by movement. */
export interface TimedRotation {
  /** f32, rad/s. */
  rate: number;
  /** f32, rad/s², with the sign of the rate. */
  readonly decay: number;
  /** f32 mission seconds after which it ends. */
  readonly end: number;
}

/** An impulse (block +0x18–+0x28), written by P3-07 and decayed by movement until its magnitude falls below 0. */
export interface Impulse {
  readonly direction: Vec3;
  /** f32, runtime units/s. */
  magnitude: number;
}

/**
 * The control disturbance (block +0x88 with its integer biases +0x98–+0xA0), written by P3-07's damage. The float biases
 * the original also stores follow from the integer ones and are not kept.
 */
export type Disturbance = { readonly level: 1 } | { readonly level: 2; readonly biases: readonly [number, number, number] };

/**
 * The movement block (object +8) of an active or docked entity; null while parked or removed. A closed union
 * discriminated by `mode` (docs/plan/p3/02/spec.md, CR-03): P3-06's steered variant of the original's modes 0 and 3
 * (craft and missiles), P3-07's linear (mode 1: projectiles and explosions) and spinning (mode 2: fragments) variants,
 * and P3-09's map marker (mode 4, MW-03). Every variant has `speed` (+8), which aiming, speed matching and `0x218e8` read.
 */
export type MovementBlock = SteeredMovementBlock | LinearMovementBlock | SpinningMovementBlock | MarkerMovementBlock;

/**
 * The block of the original's modes 0 (`craft`) and 3 (`warp`), which share their fields; the Warp start and completion
 * (P3-09) switch the mode in place. Its f32 fields hold `Math.fround` values. The reference maximum speed the original
 * copies into it (+0x70) always equals the craft record's +0xB8, which Core reads from the craft info instead.
 */
export interface SteeredMovementBlock {
  mode: 'craft' | 'warp';
  /** +8, f32 runtime units/s; movement never caps it at the maximum speed. */
  speed: number;
  /** +0x6C, f32 runtime units/s. */
  commandedSpeed: number;
  /** +0x78: while set, movement changes neither the speed nor the speed ratio. */
  atCommandedSpeed: boolean;
  /** +0x74, f32. */
  speedRatio: number;
  readonly steering: { readonly [Axis in RotationAxis]: SteeringAxis };
  readonly timedRotation: { [Axis in RotationAxis]: TimedRotation | null };
  impulse: Impulse | null;
  /** +0x5C: while set, both control paths drop their requests. */
  locked: boolean;
  disturbance: Disturbance | null;
}

/** The original's mode 1 (`0x22818`): projectiles and explosions move in a straight line. Its f32 fields hold `Math.fround` values. */
export interface LinearMovementBlock {
  readonly mode: 'linear';
  /** +8, f32 runtime units/s: a projectile's gun +0x08, an explosion's source speed at the time. */
  speed: number;
  /** +0x5C–+0x64, f32 runtime units/s: fixed at construction; a ricochet rewrites it. */
  velocity: Vec3;
  /** +0x0C–+0x14, f32: the position before the last move; the birth position at construction. */
  previousPosition: Vec3;
  /** +0x68: true for a projectile, false for an explosion. */
  hitTest: boolean;
}

/** The original's mode 2 (`0x2285c`): fragments move in a straight line and spin. Its f32 fields hold `Math.fround` values. */
export interface SpinningMovementBlock {
  readonly mode: 'spinning';
  /** +8, f32 runtime units/s. */
  speed: number;
  /** +0x5C–+0x64, f32 runtime units/s. */
  velocity: Vec3;
  /** +0x68, f32 radians per move, not scaled by the step. */
  spin: number;
  /** +0x6C: the row rotation it applies, 2 → `0x228cc`, 1 → `0x22a50`, 0 → `0x22990`. */
  spinAxis: 0 | 1 | 2;
}

/**
 * The original's mode 4, the kind-25 map marker's (MW-03): `0x21794` clears block +4–+0xA3, so the speed is 0, and
 * movement never integrates it. The creation position the original copies to +0x0C has no reader and is not kept.
 */
export interface MarkerMovementBlock {
  readonly mode: 'marker';
  readonly speed: 0;
}

const MARKER_MOVEMENT: MarkerMovementBlock = Object.freeze({ mode: 'marker', speed: 0 });

/**
 * AI modes (+0xC4) with their original values. P3-08 keeps the set (docs/plan/p3/02/spec.md, CR-18): mode 3 has no
 * writer in the supported closure, and the wingman's anger is its private behaviour 5, not an object mode.
 */
export type AiMode = 0 | 1 | 2 | 4 | 5;

/**
 * The AI state `0x68050` sets at instantiation; the AI programs that change it afterwards belong to P3-08. A target ID
 * that no longer resolves is invalid.
 */
export interface AiState {
  /** +0xC4. */
  mode: AiMode;
  /** +0x90, the AI target. */
  target: EntityId | null;
  /** +0xAC–+0xB4, f32 runtime units. */
  goal: Vec3;
  /** +0xB8–+0xC0, f32 runtime units. */
  targetOffset: Vec3;
  /**
   * +0x8C of a craft other than the player: its target, which aimed guns, guided missiles and the parked engagement
   * read and P3-08's AI and multi-target engagement write. The player's +0x8C is PlayerState.target, so the player's
   * stays null; the runtime kinds keep their +0x8C in their combat state, so theirs is always null (CR-02).
   */
  objectTarget: EntityId | null;
  /**
   * +0x184 (docs/plan/p3/02/spec.md, CB-04): the command a `deliver-command` request wrote last, null for 0. The
   * allocator and instantiation write null; P3-10's `0x3bed0` and P3-08's wingman handlers consume and clear it.
   */
  pendingCommand: PendingCommand | null;
  /**
   * +0x10 and +0x14, the AI program slot (CR-16). The allocator and every constructor leave `none`; instantiation's
   * selection (`0x20990`) writes the selected record, and the first callback installs its controller.
   */
  program: AiProgramSlot;
}

/** A delivered command: `code` is a u32 from 1; `issuedTick` is the tick that wrote it, a project field no rule reads. */
export interface PendingCommand {
  readonly code: number;
  readonly issuedTick: number;
}

/**
 * The AI program slot (CR-16): +0x10 is the selected record, +0x14 the controller. `none` is +0x10 = 0, for the kinds
 * the selection skips (the player, kind 0x4000 and the runtime kinds) or when neither table matched. A null controller
 * is +0x14 = 0: selected but not yet installed, or removed in state 5 or 6 until the next state 0–3 callback installs
 * it again.
 */
export type AiProgramSlot =
  | { readonly type: 'none' }
  /** A record of TABL 6003. */
  | { readonly type: 'table'; readonly record: number; controller: TableController | null }
  /** A record of the built-in table. */
  | { readonly type: 'built-in'; readonly record: number; controller: BuiltInController | null };

/** The installed controller of a table record: the interpreter while active or docked, `0x62250` while parked. */
export type TableController = AiControllerCommon & ({ readonly handler: 'interpreter'; readonly interpreter: InterpreterState } | { readonly handler: 'parked' });

/** The installed controller of a built-in record (wingman `0x610c8`, base `0x62c10`), or `0x62250` while parked. */
export type BuiltInController = AiControllerCommon & (
  | { readonly handler: 'wingman'; readonly wingman: WingmanState }
  | { readonly handler: 'base'; readonly base: BaseState }
  | { readonly handler: 'parked' }
);

export type AiController = TableController | BuiltInController;
export type AiHandler = AiController['handler'];

/**
 * The 0x16C-byte controller C (ai §1.1; CR-16) but for the entity itself (+0x00) and the handler's private state
 * (+0x168). Clocks are mission clock units; the installation (`0x5dc0c`, `0x5c530`, the handler's mode 0) writes the
 * initial values and the removal in state 5 or 6 discards the controller, with no other reset.
 */
export interface AiControllerCommon {
  /** +0xF0, a clock: the AI step runs the handler when the sample is above it (unsigned, strict). */
  nextUpdateClock: number;
  /** +0xF4, i32 ≥ 0: the record's +0x14, scaled by `0x5e4d0`. */
  period: number;
  /** +0x100–+0x118, from the record (a table record after the load transform). */
  readonly limits: ControllerLimits;
  /** +0x120–+0x134: channels 0, 1 and 2. */
  readonly triggers: readonly [ChannelTrigger, ChannelTrigger, ChannelTrigger];
  /** +0x138. */
  aiLock: boolean;
  /** +0x13C. */
  missileReady: boolean;
  /** +0x140: set by the base's installation `0x5e1f4`. */
  automaticMounts: boolean;
  /** +0x144–+0x14C. */
  readonly engagement: EngagementTimer;
  /** +0x150–+0x15C, the attack pass `0x63c00` (WA7). */
  readonly attackPass: AttackPass;
  /** +0x04–+0xEF, the steering block S (A1). */
  readonly steering: SteeringBlock;
}

/** +0x100–+0x118, f32 each; the original also stores −turn, −speed and −saturation, which follow from these. */
export interface ControllerLimits {
  /** +0x104, a = F(D(D(record +0x24 × f64 0x17232c) × f64 0x172334)). */
  turn: number;
  /** +0x10C, likewise from record +0x28; `0x5e4d0` rewrites it. */
  speed: number;
  /** +0x114, a bit copy of record +0x2C. */
  saturation: number;
  /** +0x118, a bit copy of record +0x30. */
  rollMatchThreshold: number;
}

/** One trigger channel: pressed (+0x120 + 4k, only 0 or 1) and its hold deadline (+0x12C + 4k, a clock; 0 holds 0). */
export interface ChannelTrigger {
  pressed: boolean;
  holdDeadline: number;
}

/** The engagement timer (+0x144–+0x14C). */
export interface EngagementTimer {
  /** +0x144: 0 when off, otherwise a clock. */
  dueClock: number;
  /** +0x148, i32 ≥ 0. */
  period: number;
  /** +0x14C, a u32 kind mask (a 0 is written as 0xfbfff). */
  mask: number;
}

/** The attack pass (`0x63c00`, WA7). */
export interface AttackPass {
  /** +0x150. */
  phase: 0 | 1 | 2;
  /** +0x154, a clock. */
  deadline: number;
  /** +0x158, u8. */
  savedSizeClass: number;
  /** +0x15C, u8. */
  savedLeadMode: number;
}

/** A noise routine's parameters (`0x5d490`, `0x5d6a8`): S+0xD4–+0xDC and S+0xE0–+0xE8, the bounds f32. */
export interface NoiseSettings {
  enabled: boolean;
  low: number;
  high: number;
}

/**
 * The steering block S = C+4 (A1; CR-16). S+0x00 (the subject), S+0x04 (the pointing limit) and S+0x08 (the subject's
 * craft record) follow from the entity and the static data and are not kept. Floats are f32.
 */
export interface SteeringBlock {
  /** S+0x0C. */
  targetValid: boolean;
  /** S+0x10: null with `targetValid` for point steering (`0x5c658`). */
  target: EntityId | null;
  /** S+0x14, a clock: the sample of the last `0x5c8b0`, a once-per-sample cache. */
  targetSample: number;
  /** S+0x18, a clock: the sample of the last `0x5cc6c`. */
  relativeSample: number;
  /** S+0x1C–+0x24. */
  point: Vec3;
  /** S+0x28. */
  distance: number;
  /** S+0x2C. */
  targetSpeed: number;
  /** S+0x30, S+0x34 and S+0x38–+0x40. */
  offset: { readonly enabled: boolean; readonly frame: 0 | 1; readonly vector: Vec3 };
  /** S+0x44, u8. */
  sizeClass: number;
  /** S+0x48. */
  approachRadius: number;
  /** S+0x4C. */
  speedLimit: number;
  /** S+0x50. */
  halfSpeedLimit: number;
  /** S+0x54, +0x58, +0x5C. */
  turnRates: readonly [number, number, number];
  /** S+0x60, u8. */
  leadMode: number;
  /** S+0x64. */
  leadConstant: number;
  /** S+0x68, bits 0–2. */
  relativeFlags: number;
  /** S+0x6C–+0x74. */
  relative: Vec3;
  /** S+0x78, bits 0–2. */
  reverseFlags: number;
  /** S+0x7C–+0x84. */
  reverse: Vec3;
  /** S+0x88, +0x8C. */
  angles: readonly [number, number];
  /**
   * S+0x90–+0xBC, the control block CB: it persists between steps, since the noise routines change it in place and
   * `0x5d014` posts it as left, so every axis keeps its `value` even while `set` is false.
   */
  control: ControlBlock;
  /** S+0xC0 (C+0xC4, not the object's AI mode +0xC4). */
  coneBits: 0 | 1 | 2 | 3;
  /** S+0xC8. */
  speedFraction: number;
  /** S+0xCC. */
  turnFraction: number;
  /** S+0xD0. */
  rollMatch: boolean;
  /** S+0xD4–+0xDC. */
  readonly throttleNoise: NoiseSettings;
  /** S+0xE0–+0xE8. */
  readonly steeringNoise: NoiseSettings;
}

/** The interpreter's private state, the 0x18-byte I at C+0x168 (ai §11.1; CR-17). */
export interface InterpreterState {
  /** I+0x00, u8: 0 until the state machine first chooses. */
  state: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** I+0x04: the current script's execution; null only in state 0 or state 3 with an empty list. */
  execution: ExecutionState | null;
  /** I+0x08: whether the last executor run ended (true) or yielded (false); not cleared by a script change. */
  lastRunEnded: boolean;
  /** I+0x0C, a clock: the sample after each update with cone bits 3. */
  steadyClock: number;
  /** I+0x10, a clock: set on entering state 3, 4 or 5 from outside them. */
  stateDeadline: number;
  /** I+0x14, a clock; 0 when unset. */
  state4Deadline: number;
}

/**
 * The execution state of one loaded script, the 0x60-byte X (ai §5.1; CR-17): every load has its own, while the
 * parsed arguments are shared in WorldAiState.parseCache. The exit value X+0x00 has no reader and is not kept.
 */
export interface ExecutionState {
  /** The script's entry index in the AI programs (X+0x24's first entry). */
  readonly script: number;
  /** X+0x28: the current item, below the script's item count. */
  item: number;
  /** X+0x04–+0x10, i32. */
  variables: readonly [number, number, number, number];
  /** X+0x14–+0x20, clocks. */
  timers: readonly [number, number, number, number];
  /** X+0x2C–+0x48: item indexes; the length is the depth X+0x4C, 0–8. */
  returnStack: readonly number[];
  /** X+0x50, X+0x54. */
  wait: ScriptDeadline;
  /** X+0x58, X+0x5C. */
  hold: ScriptDeadline;
}

/** A script's wait or hold: whether it is set, and its clock. */
export interface ScriptDeadline {
  readonly active: boolean;
  readonly until: number;
}

/** The deepest return stack: the original's eight slots X+0x2C–+0x48. */
export const RETURN_STACK_DEPTH = 8;

/** The wingman's private state, the 0x14-byte B at C+0x168 (WA1; CR-17). */
export interface WingmanState {
  /** B+0x00, the behaviour b; 5 is its anger. */
  behaviour: 0 | 1 | 2 | 3 | 4 | 5;
  /** B+0x04. */
  doNotAttack: EntityId | null;
  /** B+0x08. */
  attackTarget: EntityId | null;
  /** B+0x0C, a clock. */
  nextGunSwitchClock: number;
  /** B+0x10, a clock. */
  nextEngageSearchClock: number;
}

/** The base's private state: the kind mask stored at C+0x168 (A14; CR-17); a base (kind 0x20000) gets 0x93780. */
export interface BaseState {
  readonly targetMask: 0x93780 | 0x6c87f;
}

/** The slot every entity is allocated with. */
export const NO_AI_PROGRAM: AiProgramSlot = Object.freeze({ type: 'none' });

/**
 * The common controller fields as the installation's clearing (`0x5dc0c`) leaves them, before it writes the record's
 * configuration and `0x5c530` initialises the steering block: every number 0, every flag false, no target and no
 * speed factor. Not a state any rule reads; the installation overwrites what it uses.
 */
export function clearedControllerCommon(): AiControllerCommon {
  const zero = ZERO_VECTOR;
  const axis = Object.freeze({ clear: false, set: false, value: 0 });
  const trigger = (): ChannelTrigger => ({ pressed: false, holdDeadline: 0 });
  return {
    nextUpdateClock: 0,
    period: 0,
    limits: { turn: 0, speed: 0, saturation: 0, rollMatchThreshold: 0 },
    triggers: [trigger(), trigger(), trigger()],
    aiLock: false,
    missileReady: false,
    automaticMounts: false,
    engagement: { dueClock: 0, period: 0, mask: 0 },
    attackPass: { phase: 0, deadline: 0, savedSizeClass: 0, savedLeadMode: 0 },
    steering: {
      targetValid: false,
      target: null,
      targetSample: 0,
      relativeSample: 0,
      point: zero,
      distance: 0,
      targetSpeed: 0,
      offset: Object.freeze({ enabled: false, frame: 0, vector: zero }),
      sizeClass: 0,
      approachRadius: 0,
      speedLimit: 0,
      halfSpeedLimit: 0,
      turnRates: Object.freeze([0, 0, 0] as const),
      leadMode: 0,
      leadConstant: 0,
      relativeFlags: 0,
      relative: zero,
      reverseFlags: 0,
      reverse: zero,
      angles: Object.freeze([0, 0] as const),
      control: Object.freeze({ scale: 0, axes: Object.freeze([axis, axis, axis] as const), speedFactor: null }),
      coneBits: 0,
      speedFraction: 0,
      turnFraction: 0,
      rollMatch: false,
      throttleNoise: { enabled: false, low: 0, high: 0 },
      steeringNoise: { enabled: false, low: 0, high: 0 },
    },
  };
}

/** The kind bit of kind 0x4000, the transponder (Xpon; CR-20). */
export const TRANSPONDER_KIND_BIT = 14;

/**
 * Kind 0x4000's own state (CR-20); null for every other kind. `creator` is the creation path: a declaration, the
 * player's `b` or a wingman's drop. `callback` is the reuse of object +0x14 by the callback `0x3897c`: `first-update`
 * (+0x14 = 1) marks a `b` transponder created active, `tumbling.since` is the clock F₀ of its 4-byte block, `none` is 0.
 */
export interface TransponderState {
  readonly creator: 'declaration' | 'player' | 'wingman';
  callback: TransponderCallback;
}

export type TransponderCallback =
  | { readonly phase: 'none' }
  | { readonly phase: 'first-update' }
  | { readonly phase: 'tumbling'; readonly since: number };

/**
 * An object's communications fields (CB-04), allocated unset for every kind; runtime kinds have no writer. The
 * original's allocator writes −1 and 0 for them.
 */
export interface EntityCommunications {
  /** +0x180: the portrait `0x3c894` assigns once, only to kinds in 0x87c and 0x68000. */
  face: number | null;
  /** +0x17C: a clock, the threat stamp of `0x3c208` step 3, `0x3c3b0` and `0x3bed0`. */
  threatStamp: number | null;
}

/** AI mode 5, the allocator's default and the mode of kinds 0x2000 and 0x4000. */
const ALLOCATOR_AI_MODE = 5;

/**
 * The AI state the allocator leaves (mode 5, no targets, zero vectors): an entity's until `0x68050` runs, and the state
 * of runtime entities that never run it (P3-07's projectiles and others).
 */
export function allocatorAiState(): AiState {
  return {
    mode: ALLOCATOR_AI_MODE, target: null, goal: ZERO_VECTOR, targetOffset: ZERO_VECTOR, objectTarget: null, pendingCommand: null, program: NO_AI_PROGRAM,
  };
}

export const ZERO_VECTOR: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });

/**
 * The flight fields the allocator gives every new object (no Warp timer, not in Warp, the allocator's AI state, no
 * formation), for the constructors of runtime kinds; instantiation then writes its own. The parked-update clock is not
 * among them: the allocator leaves the reused slot's value, so each constructor defines it.
 */
export function allocatorFlightState(): Pick<EntityInit, 'warpClock' | 'inWarp' | 'ai' | 'formation'> {
  return { warpClock: 0, inWarp: false, ai: allocatorAiState(), formation: null };
}

/**
 * A section-5 formation (+0x7C and +0x80–+0x88): the later members of a layout cycle follow the cycle's first member at
 * an f32 offset, in runtime units along the leader's rows.
 */
export interface Formation {
  readonly leader: EntityId;
  readonly offset: Vec3;
}

/** The kind bits of P3-07's runtime kinds (docs/plan/p3/02/spec.md, CR-02); craft are kind bits 0–19 (mask 0xfffff). */
export const MISSILE_KIND_BIT = 20;
export const PROJECTILE_KIND_BIT = 21;
export const EXPLOSION_KIND_BIT = 22;
export const FRAGMENT_KIND_BIT = 24;
/** The map/Warp marker, kind `0x2000000` (MW-03). */
export const MARKER_KIND_BIT = 25;
const CRAFT_KIND_BITS = 20;

/** A two-bit subsystem field: damage writes 0–2, and only other writers 3. */
export type SubsystemState = 0 | 1 | 2 | 3;
/** An energy allocation level. */
export type Level = 0 | 1 | 2 | 3;
/** The two-bit subsystem fields 0–18 (+0xE8/+0xEC). */
export const SUBSYSTEM_COUNT = 19;

/**
 * A craft's combat state (docs/plan/p3/02/spec.md, CR-02: original object +0x20–+0x47, +0xD0, +0xE8/+0xEC,
 * +0xF4–+0x158, +0x94–+0xA8). Integers are i32, clocks mission clock units. Instantiation writes the initial values
 * (`0x2d400`, `0x3060c`, CR-07); the spec's table of ranges and lifetimes says which rule changes each field later.
 */
export interface CraftCombat {
  readonly type: 'craft';
  /** +0x28. */
  energy: number;
  /** +0x2C. */
  shield: number;
  /** +0x30. */
  charge: number;
  /** +0x34 (L1). */
  shieldLevel: Level;
  /** +0x38 (L2). */
  chargeLevel: Level;
  /** +0x3C (E). */
  sparePower: number;
  /** +0x40 (T). */
  fullSpeedPower: number;
  /** +0x20. */
  lastEnergyClock: number;
  /** +0x24. */
  nextEnergyClock: number;
  /** Project latch: the last energy update ended in the depleted branch, so `energy-depleted` is emitted once per transition. */
  depleted: boolean;
  /** +0xD0; may be negative. */
  hull: number;
  /** Fields 0–18 of +0xE8/+0xEC, exactly SUBSYSTEM_COUNT. */
  subsystems: readonly SubsystemState[];
  weapons: WeaponBlock;
  /** The clock of the latest hit feedback item (`0x2a40c`, `0x2a5fc`); Render State's hitShimmerStart. */
  hitFeedbackClock: number | null;
  /** +0x94/+0x98: written by the two collision passes, read by P3-08; the distance squared is f32. */
  proximity: { readonly entity: EntityId; readonly distanceSquared: number } | null;
  /** +0x9C/+0xA0: written on the shooter when its projectile or missile hits while it is valid; read by P3-08. */
  lastVictim: { readonly entity: EntityId; readonly clock: number } | null;
  /** +0xA4/+0xA8: written on the victim of such a hit; read by P3-08. */
  lastAttacker: { readonly entity: EntityId; readonly clock: number } | null;
}

/** The weapon block `0x2d400` builds (W1). */
export interface WeaponBlock {
  /** Lists 0, 1 and 2 (+0x100–+0x114). */
  selections: readonly [ListSelection, ListSelection, ListSelection];
  /** +0x118–+0x128: the player's lock machine (W8) and, for AI craft, the AI lock update `0x5dfec` write it (CR-16). */
  lock: MissileLock;
  /** +0x154/+0x158: one per craft mount, in mount order; empty for a craft without mounts. */
  mounts: readonly MountState[];
}

export interface ListSelection {
  /** i32; −1 for an empty list (W3). */
  index: number;
  /** The current mount's index; null for an empty list. */
  mount: number | null;
}

export interface MissileLock {
  level: 0 | 1 | 2 | 3 | 4;
  /** 0 initially; compared as usual. */
  stageDueClock: number;
  losing: boolean;
  graceDueClock: number;
  nextUpdateClock: number;
}

export interface MountState {
  /** +0x04; null when never written (the original's 0): a cooldown has expired, and alternation puts it before any clock. */
  lastShotClock: number | null;
  /** +0x08. */
  ammunition: number;
  /** +0x0C. */
  damage: 0 | 1 | 2;
  /** +0x20: an automatic mount's burst count. */
  burst: number;
  /** +0x24–+0x44, f32 rows: an automatic mount's aim, all zero initially. */
  aim: Matrix3;
  /** +0x48: an automatic mount's target (P3-08 selects it). */
  autoTarget: EntityId | null;
  /** +0x4C: the hold value P3-08 writes as it is (W9); a non-negative integer. */
  retargetClock: number;
}

/** A missile's flight program, fixed at construction. */
export type MissileProgram = 'unguided' | 'heat-seeker' | 'homing';

/** Kind bit 20 (`0x2b00c`, `0x2aa40`/`0x2ab00`, `0x2ac10`; W11, H5). */
export interface MissileCombat {
  readonly type: 'missile';
  /** mb +0xF4: the missile record; its +0x14 is the body record. */
  readonly missile: number;
  /** mb +0xFC: attribution and the proximity fuse's side; cleared when it fizzles. */
  shooter: EntityId | null;
  /** Missile +0x8C: the launch request's saved target when it resolves at construction; the homing program rewrites it. */
  target: EntityId | null;
  /** mb +0x100. */
  readonly launchByte: 0 | 1 | 2 | 3 | 4;
  readonly program: MissileProgram;
  /** mb +0xF8: the kind of the expiry request, detonation (true) or fizzling (false). */
  detonate: boolean;
  /** mb +0x104: the object a contact fuse fired on. */
  contact: EntityId | null;
  /** Guidance block G; null before the first callback. */
  guidance: MissileGuidance | null;
  /** Non-null for a homing program after its first callback; always null for an unguided missile. */
  homing: HomingState | null;
}

/** Guidance block G: the four times are relative values until phase 0 adds the clock to them. */
export interface MissileGuidance {
  /** G+0x14. */
  phase: 0 | 1 | 2 | 3 | 4;
  /** G+0. */
  lifetimeClock: number;
  /** G+4. */
  armClock: number;
  /** G+8, f32. */
  fuseRadiusSquared: number;
  /** G+0x0C: the proximity fuse adds the clock; a contact sets it to 0. */
  detonationClock: number;
  /** G+0x10, i32. */
  checkInterval: number;
  /** G+0x18. */
  nextCheckClock: number;
}

/** The part of the homing controller the missile path uses (H5). */
export interface HomingState {
  /** C+0xF4, clock units. */
  period: number;
  /** C+0xF0. */
  nextUpdateClock: number;
  /** S+0xCC, f32. */
  turnFraction: number;
  /** S+0xC8, f32. */
  speedFraction: number;
  /** S+0x0C. */
  targetValid: boolean;
  /** S+0x28, f32: selects the lifetime and the fuse interval. */
  targetDistance: number;
}

/** Kind bit 21 (`0x25b0c`, `0x259b0`, `0x25f48`; W11, H2). */
export interface ProjectileCombat {
  readonly type: 'projectile';
  /** mb +0xF4: the gun record. */
  readonly gun: number;
  /** mb +0xFC; cleared by the removal request. */
  shooter: EntityId | null;
  /** The timer block: null before the first callback; a ricochet's first state-8 callback clears `firstHitPending`. */
  expiry: { clock: number; firstHitPending: boolean } | null;
}

/** Kind bit 22 (`0x23ac8`, `0x23838`, `0x2409c`; X2, X4). */
export interface ExplosionCombat {
  readonly type: 'explosion';
  /** The destroyed source it was made from, not held: only its identity, for `explosion-started`. */
  readonly source: EntityId;
  /** mb +0x104: a craft kind bit 0–19, 20 or 24. */
  readonly sourceKindBit: number;
  /** mb +0xF0. */
  readonly variant: ExplosionVariant;
  /** +0x8C: the source it holds, when the source is no craft or making fragments failed. */
  heldSource: EntityId | null;
  /** +0xFC (t₀); null before activation. */
  activationClock: number | null;
  /** +0x10C = t₀ + 0x60. */
  removalAfterClock: number | null;
}

/** When a fragment expires: pending before its first callback; never for a large source or once triggered. */
export type FragmentExpiry = { readonly type: 'pending' } | { readonly type: 'never' } | { readonly type: 'at'; readonly clock: number };

/** Kind bit 24 with discriminator 3 (`0x25124`, `0x24ac4`, `0x256e4`; X6, X7); discriminators 1 and 2 are the presentation layer's. */
export interface FragmentCombat {
  readonly type: 'fragment';
  /** mb +0xF0: a craft kind bit 0–19. */
  readonly sourceKindBit: number;
  /** mb +0xF5: the part's index in the source model's first part list. */
  readonly part: number;
  /** Index in the source kind's DEBRIS parameter table (craft §4.1); null for part 0 of kinds 1 and 2. */
  readonly debris: number | null;
  /** +0xD0, i32. */
  durability: number;
  /** mb +0xF6. */
  explodeOnExpiry: boolean;
  /** Timer block +8. */
  expiry: FragmentExpiry;
  /** +0x8C: only part 0 holds its source, until the hand-off. */
  handOff: EntityId | null;
}

/** The map marker's (MW-03): it has no combat fields. */
export interface MarkerCombat {
  readonly type: 'marker';
}

const MARKER_COMBAT: MarkerCombat = Object.freeze({ type: 'marker' });

/** An entity's combat state, a closed union by runtime kind (CR-02); its type must match the entity's kind bit. */
export type EntityCombat = CraftCombat | MissileCombat | ProjectileCombat | ExplosionCombat | FragmentCombat | MarkerCombat;
export type CombatType = EntityCombat['type'];

/** The combat type an entity of `kindBit` must have; null for a kind no task has given one (CR-02). */
export function combatTypeOf(kindBit: number): CombatType | null {
  if (Number.isInteger(kindBit) && kindBit >= 0 && kindBit < CRAFT_KIND_BITS) return 'craft';
  switch (kindBit) {
    case MISSILE_KIND_BIT:
      return 'missile';
    case PROJECTILE_KIND_BIT:
      return 'projectile';
    case EXPLOSION_KIND_BIT:
      return 'explosion';
    case FRAGMENT_KIND_BIT:
      return 'fragment';
    case MARKER_KIND_BIT:
      return 'marker';
    default:
      return null;
  }
}

/**
 * The combat state a craft is allocated with, before instantiation's extension point writes its initial values
 * (CR-07): every number and level 0, every subsystem 0, the selections of a craft without mounts, an initial lock and
 * no references. It is not an original value; no rule reads these fields before instantiation writes them.
 */
export function blankCraftCombat(): CraftCombat {
  const emptyList = (): ListSelection => ({ index: -1, mount: null });
  return {
    type: 'craft',
    energy: 0,
    shield: 0,
    charge: 0,
    shieldLevel: 0,
    chargeLevel: 0,
    sparePower: 0,
    fullSpeedPower: 0,
    lastEnergyClock: 0,
    nextEnergyClock: 0,
    depleted: false,
    hull: 0,
    subsystems: Object.freeze(Array.from({ length: SUBSYSTEM_COUNT }, (): SubsystemState => 0)),
    weapons: {
      selections: Object.freeze([emptyList(), emptyList(), emptyList()] as const),
      lock: { level: 0, stageDueClock: 0, losing: false, graceDueClock: 0, nextUpdateClock: 0 },
      mounts: Object.freeze([]),
    },
    hitFeedbackClock: null,
    proximity: null,
    lastVictim: null,
    lastAttacker: null,
  };
}

export interface Entity {
  readonly id: EntityId;
  /** Bit position 0–31 of the original runtime kind, as in the content's `craftType`; fixed at allocation. */
  readonly kindBit: number;
  /** The declaration the entity was instantiated from; null for entities the rules create at run time. */
  readonly source: EntitySource | null;
  readonly name: NameReference;
  /** The player-relative side of the declared craft type; null for an entity the rules create without a declaration. */
  readonly side: CraftSide | null;
  /** Whether the declared craft type is in the interaction category (mask 0x68000, Likely base interaction, U-022). */
  readonly baseInteraction: boolean;
  readonly presentation: EntityPresentation;
  /** Original runtime units. */
  position: Vec3;
  orientation: Matrix3;
  /** 0 at allocation; the rules add 1 at every discontinuous move (Warp arrival, rescue, launch) so renderers do not interpolate across it. */
  placementSerial: number;
  /**
   * Replaced as a whole, never changed in place: only `0x5e4d0` rewrites one input, a negative +0xE0 (`aiValueB`) as
   * its i32 negation (CR-16); the other five never change.
   */
  ruleInputs: EntityRuleInputs;
  state: ObjectState;
  activity: Activity;
  /** The original dead flag +0xD8, written by the rules. Destroyed is not removed: the rescue reuses the player's entity. */
  destroyed: boolean;
  /**
   * +0x78, f32 runtime units/s: the rule-computed current maximum, apart from the craft record's base +0xB8. Written at
   * instantiation; recomputed by P3-07 and P3-11.
   */
  maximumSpeed: number;
  /**
   * +0x18, clock units: the last parked update; the instantiation clock until the parked update rewrites it. At least
   * −0x80: a Warp departure (CR-21) sets it to clock − 0x80, which is negative early in a mission.
   */
  lastParkedUpdateClock: number;
  /** +0xC8, clock units, 0 when unset: postpones Warps and times a Warp transit (P3-06 parked path, P3-09). */
  warpClock: number;
  /** +0xCC: in Warp. */
  inWarp: boolean;
  /**
   * +0xD4, the map visibility flag (MW-02, MW-06): only the `object-sets` stage and the reveal write it, for craft kinds
   * (bits 0–19); false for every other kind and at allocation.
   */
  mapVisible: boolean;
  /** Present exactly while the entity is not parked: instantiation and resuming build it, parking releases it. */
  movement: MovementBlock | null;
  ai: AiState;
  formation: Formation | null;
  /** Fixed in type at allocation; its contents change by the rules of CR-02. */
  readonly combat: EntityCombat;
  /** P3-10's fields (CB-04), unset at allocation. */
  readonly communications: EntityCommunications;
  /** Kind 0x4000's state (CR-20), null for every other kind. */
  readonly transponder: TransponderState | null;
}

/**
 * What instantiation supplies; the table assigns the ID, the state, the placement serial, the destroyed flag and the
 * unset communications fields.
 */
export interface EntityInit {
  readonly kindBit: number;
  readonly source: EntitySource | null;
  readonly name: NameReference;
  readonly side: CraftSide | null;
  readonly baseInteraction: boolean;
  readonly presentation: EntityPresentation;
  readonly position: Vec3;
  readonly orientation: Matrix3;
  /** Instantiation parks an entity other than the player outside the active area (Q-07, `0x67938`). */
  readonly activity: 'parked' | 'active';
  readonly ruleInputs: EntityRuleInputs;
  readonly maximumSpeed: number;
  readonly lastParkedUpdateClock: number;
  readonly warpClock: number;
  readonly inWarp: boolean;
  /** Required for an active entity, null for a parked one. */
  readonly movement: MovementBlock | null;
  readonly ai: AiState;
  readonly formation: Formation | null;
  /** Of the type combatTypeOf(kindBit) gives. */
  readonly combat: EntityCombat;
  /**
   * Kind 0x4000's state for a transponder the rules construct (`creator` `player` or `wingman`, CR-20). Omitted
   * otherwise: a declared kind-0x4000 entity gets `{ creator: 'declaration', callback: none }`, every other kind null.
   */
  readonly transponder?: TransponderState;
}

const NO_RULE_INPUTS: EntityRuleInputs = Object.freeze({ percentB: 0, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: 0, aiValueC: 0 });

/**
 * The map marker `0x3cb80` allocates (MW-03) at `position` with `orientation`: kind 25, its own name and presentation,
 * active (allocated presentation-ready), the mode-4 block and otherwise the allocator's defaults: no source, side,
 * interaction or rule inputs, a maximum speed of 0, no Warp or formation. It has no craft record (`0x2d2d8` gives null
 * beyond the craft count), so nothing may read one for it.
 */
export function markerInit(position: Vec3, orientation: Matrix3): EntityInit {
  return {
    kindBit: MARKER_KIND_BIT,
    source: null,
    name: Object.freeze({ type: 'map-marker' }),
    side: null,
    baseInteraction: false,
    presentation: Object.freeze({ type: 'map-marker' }),
    position,
    orientation,
    activity: 'active',
    ruleInputs: NO_RULE_INPUTS,
    maximumSpeed: 0,
    lastParkedUpdateClock: 0,
    ...allocatorFlightState(),
    movement: MARKER_MOVEMENT,
    combat: MARKER_COMBAT,
  };
}

/** The state an entity starts in on `activity`, at allocation and whenever its parking switches. */
export function initialState(activity: Activity): ObjectState {
  return activity === 'parked' ? 'new' : 'presentation-ready';
}

/**
 * Sets an entity's activity with the movement block it holds then (instantiation's activity step, the parking switch):
 * its state starts again, and the block is present exactly while not parked. The block becomes the entity's own.
 */
export function setActivity(entity: Entity, activity: Activity, movement: MovementBlock | null): void {
  if ((activity === 'parked') !== (movement === null) || (movement !== null && !(movementFits(movement, entity.combat) && isValidMovement(movement)))) {
    throw new CoreFaultError('invariant-violated', 'entities.movement');
  }
  entity.activity = activity;
  entity.state = initialState(activity);
  entity.movement = movement;
}

/**
 * Original states 7 and above. Movement (which also moves destroyed sources), collisions, the parked-object update,
 * the area check and the energy of active entities act only on these (Q-09), so an entity instantiated in request
 * handling takes no part in them until its next update has made it active.
 */
export function isActiveState(state: ObjectState): boolean {
  return state === 'active' || state === 'projectile-hit';
}

/**
 * Whether queries count the entity as alive: not flagged destroyed and not waiting for removal, the filter of the
 * original's live-enemy check `0x69a70`. Still being in a kind list proves nothing.
 */
export function isLive(entity: Entity): boolean {
  return !entity.destroyed && entity.state !== 'pending-removal';
}

const isFiniteVec = ({ x, y, z }: Vec3): boolean => Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);

function copySource(source: EntitySource | null): EntitySource | null {
  if (source === null) return null;
  const { collection, index, group } = source;
  return Object.freeze({ collection, index, group: group && Object.freeze({ index: group.index, request: group.request, member: group.member }) });
}

function copyRuleInputs({ percentB, percentC, percentD, aiValueA, aiValueB, aiValueC }: EntityRuleInputs): EntityRuleInputs {
  return Object.freeze({ percentB, percentC, percentD, aiValueA, aiValueB, aiValueC });
}

function copyName(name: NameReference): NameReference {
  if (name.type !== 'candidate') return Object.freeze({ ...name });
  const { declaration: { collection, index }, candidate } = name;
  return Object.freeze({ type: 'candidate', declaration: Object.freeze({ collection, index }), candidate });
}

/** A frozen copy of a vector. */
export const frozenVec = ({ x, y, z }: Vec3): Vec3 => Object.freeze({ x, y, z });
const isFloat32Vec = ({ x, y, z }: Vec3): boolean => isFiniteFloat32(x) && isFiniteFloat32(y) && isFiniteFloat32(z);
const isClock = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
const AI_MODES: readonly number[] = [0, 1, 2, 4, 5];

function isValidSteeredMovement(block: SteeredMovementBlock): boolean {
  const { steering, timedRotation, impulse, disturbance } = block;
  return [block.speed, block.commandedSpeed, block.speedRatio].every(isFiniteFloat32)
    && ROTATION_AXES.every((axis) => {
      const timed = timedRotation[axis];
      return isFiniteFloat32(steering[axis].rate) && (timed === null || [timed.rate, timed.decay, timed.end].every(isFiniteFloat32));
    })
    && (impulse === null || (isFloat32Vec(impulse.direction) && isFiniteFloat32(impulse.magnitude)))
    && (disturbance === null || disturbance.level === 1 || (disturbance.level === 2 && disturbance.biases.every(Number.isSafeInteger)));
}

const SPIN_AXES: readonly number[] = [0, 1, 2];

function isValidMovement(block: MovementBlock): boolean {
  switch (block.mode) {
    case 'craft':
    case 'warp':
      return isValidSteeredMovement(block);
    case 'linear':
      return isFiniteFloat32(block.speed) && isFloat32Vec(block.velocity) && isFloat32Vec(block.previousPosition) && isBoolean(block.hitTest);
    case 'spinning':
      return isFiniteFloat32(block.speed) && isFloat32Vec(block.velocity) && isFiniteFloat32(block.spin) && SPIN_AXES.includes(block.spinAxis);
    case 'marker':
      return block.speed === 0;
    default:
      return false;
  }
}

/**
 * Whether an entity with `combat` moves with `block`'s variant (CR-03, H1): a craft steered (modes 0 and 3), a missile
 * in mode 0, a projectile linear with its hit test, an explosion linear without, a fragment spinning, a map marker in
 * mode 4 (MW-03).
 */
function movementFits(block: MovementBlock, combat: EntityCombat): boolean {
  switch (combat.type) {
    case 'craft':
      return block.mode === 'craft' || block.mode === 'warp';
    case 'missile':
      return block.mode === 'craft';
    case 'projectile':
      return block.mode === 'linear' && block.hitTest === true;
    case 'explosion':
      return block.mode === 'linear' && block.hitTest === false;
    case 'fragment':
      return block.mode === 'spinning';
    case 'marker':
      return block.mode === 'marker';
  }
}

/**
 * The flight state's invariants (docs/plan/p3/06/spec.md, 检查点 A 定稿的状态与契约): f32 values, clocks and modes; no
 * command pending and no AI program, as the allocator and instantiation write none (CB-04, CR-16).
 */
function isValidFlightState(init: EntityInit): boolean {
  const { movement, ai, formation } = init;
  return isFiniteFloat32(init.maximumSpeed) && isClock(init.lastParkedUpdateClock) && isClock(init.warpClock)
    && (movement === null || isValidMovement(movement))
    && AI_MODES.includes(ai.mode) && isFloat32Vec(ai.goal) && isFloat32Vec(ai.targetOffset) && ai.pendingCommand === null && ai.program.type === 'none'
    && (formation === null || isFloat32Vec(formation.offset));
}

const isZeroVec = ({ x, y, z }: Vec3): boolean => x === 0 && y === 0 && z === 0;

/**
 * The fields a runtime kind (CR-02) takes from the allocator rather than a declaration and keeps: created active; no
 * source, side, name or interaction; zero rule inputs; the allocator's AI state with its object target null, as the
 * runtime kinds keep their +0x8C in their combat state; no formation, parked-update clock or Warp; and a maximum speed
 * of 0 but for a missile, whose body record's +0xB8 the missile constructor checks. The map marker's name is its own
 * (MW-03); every other runtime kind has none.
 */
function hasRuntimeKindDefaults(init: EntityInit): boolean {
  const { ruleInputs: inputs, ai } = init;
  return init.activity === 'active' && init.source === null && init.side === null && !init.baseInteraction
    && init.name.type === (init.combat.type === 'marker' ? 'map-marker' : 'none')
    && [inputs.percentB, inputs.percentC, inputs.percentD, inputs.aiValueA, inputs.aiValueB, inputs.aiValueC].every((value) => value === 0)
    && ai.mode === ALLOCATOR_AI_MODE && ai.target === null && ai.objectTarget === null && isZeroVec(ai.goal) && isZeroVec(ai.targetOffset)
    && init.formation === null && init.lastParkedUpdateClock === 0 && init.warpClock === 0 && !init.inWarp
    && (init.combat.type === 'missile' || init.maximumSpeed === 0);
}

/** A detached, mutable copy of any movement block variant whose immutable parts are frozen. */
function copyMovementBlock(block: MovementBlock): MovementBlock {
  switch (block.mode) {
    case 'craft':
    case 'warp':
      return copyMovement(block);
    case 'linear':
      return { mode: 'linear', speed: block.speed, velocity: frozenVec(block.velocity), previousPosition: frozenVec(block.previousPosition), hitTest: block.hitTest };
    case 'spinning':
      return { mode: 'spinning', speed: block.speed, velocity: frozenVec(block.velocity), spin: block.spin, spinAxis: block.spinAxis };
    case 'marker':
      return MARKER_MOVEMENT;
  }
}

/** A detached, mutable copy of a steered movement block whose immutable parts are frozen; also for the movement rules. */
export function copyMovement(block: SteeredMovementBlock): SteeredMovementBlock {
  const steering = (axis: RotationAxis): SteeringAxis => ({ rate: block.steering[axis].rate, enabled: block.steering[axis].enabled });
  const timed = (axis: RotationAxis): TimedRotation | null => {
    const rotation = block.timedRotation[axis];
    return rotation && { rate: rotation.rate, decay: rotation.decay, end: rotation.end };
  };
  const { impulse, disturbance } = block;
  return {
    mode: block.mode,
    speed: block.speed,
    commandedSpeed: block.commandedSpeed,
    atCommandedSpeed: block.atCommandedSpeed,
    speedRatio: block.speedRatio,
    steering: Object.freeze({ pitch: steering('pitch'), yaw: steering('yaw'), roll: steering('roll') }),
    timedRotation: { pitch: timed('pitch'), yaw: timed('yaw'), roll: timed('roll') },
    impulse: impulse && { direction: frozenVec(impulse.direction), magnitude: impulse.magnitude },
    locked: block.locked,
    disturbance: disturbance && copyDisturbance(disturbance),
  };
}

function copyDisturbance(disturbance: Disturbance): Disturbance {
  if (disturbance.level === 1) return Object.freeze({ level: 1 });
  const [first, second, third] = disturbance.biases;
  return Object.freeze({ level: 2, biases: Object.freeze([first, second, third] as const) });
}

const isBoolean = (value: boolean): boolean => typeof value === 'boolean';
const isInt32 = (value: number): boolean => toInt32(value) === value;
const isIndex = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
const isEntityId = (value: number): boolean => Number.isSafeInteger(value) && value >= 1;
const isNullableId = (value: EntityId | null): boolean => value === null || isEntityId(value);
const isNullableClock = (value: number | null): boolean => value === null || isClock(value);
const isUpTo = (value: number, maximum: number): boolean => Number.isInteger(value) && value >= 0 && value <= maximum;
const isFloat32Matrix = (matrix: Matrix3): boolean => matrix.length === 9 && matrix.every(isFiniteFloat32);
const isCraftKindBit = (kindBit: number): boolean => combatTypeOf(kindBit) === 'craft';
/**
 * Whether a fragment is the escape pod: part 0 of a kind 1 (player, kind bit 0) or kind 2 (wingman, kind bit 1) source,
 * which has no DEBRIS parameters and draws the source model's parts 0–2 (X6).
 */
export const isEscapePod = (sourceKindBit: number, part: number): boolean => (sourceKindBit === 0 || sourceKindBit === 1) && part === 0;
const isClockReference = (reference: { readonly entity: EntityId; readonly clock: number } | null): boolean =>
  reference === null || (isEntityId(reference.entity) && isClock(reference.clock));

function isValidMount(mount: MountState): boolean {
  return isNullableClock(mount.lastShotClock) && isInt32(mount.ammunition) && isUpTo(mount.damage, 2) && isInt32(mount.burst)
    && isFloat32Matrix(mount.aim) && isNullableId(mount.autoTarget) && isIndex(mount.retargetClock);
}

function isValidWeapons({ selections, lock, mounts }: WeaponBlock): boolean {
  return selections.length === 3
    && selections.every(({ index, mount }) => isInt32(index) && index >= -1 && (mount === null || (isIndex(mount) && mount < mounts.length)))
    && isUpTo(lock.level, 4) && isClock(lock.stageDueClock) && isBoolean(lock.losing) && isClock(lock.graceDueClock) && isClock(lock.nextUpdateClock)
    && mounts.every(isValidMount);
}

function isValidCraftCombat(combat: CraftCombat): boolean {
  const { proximity } = combat;
  return [combat.energy, combat.shield, combat.charge, combat.sparePower, combat.fullSpeedPower, combat.hull].every(isInt32)
    && isUpTo(combat.shieldLevel, 3) && isUpTo(combat.chargeLevel, 3)
    && isClock(combat.lastEnergyClock) && isClock(combat.nextEnergyClock) && isBoolean(combat.depleted)
    && combat.subsystems.length === SUBSYSTEM_COUNT && combat.subsystems.every((state) => isUpTo(state, 3))
    && isValidWeapons(combat.weapons)
    && isNullableClock(combat.hitFeedbackClock)
    && (proximity === null || (isEntityId(proximity.entity) && isFiniteFloat32(proximity.distanceSquared)))
    && isClockReference(combat.lastVictim) && isClockReference(combat.lastAttacker);
}

const MISSILE_PROGRAMS: readonly string[] = ['unguided', 'heat-seeker', 'homing'];
const EXPLOSION_VARIANTS: readonly string[] = ['large', 'other', 'missile'];

function isValidMissileCombat({ missile, shooter, target, launchByte, program, detonate, contact, guidance, homing }: MissileCombat): boolean {
  return isIndex(missile) && isNullableId(shooter) && isNullableId(target) && isUpTo(launchByte, 4) && MISSILE_PROGRAMS.includes(program)
    && isBoolean(detonate) && isNullableId(contact)
    && (guidance === null || (isUpTo(guidance.phase, 4) && isFiniteFloat32(guidance.fuseRadiusSquared) && isInt32(guidance.checkInterval)
      && [guidance.lifetimeClock, guidance.armClock, guidance.detonationClock, guidance.nextCheckClock].every(isClock)))
    && (homing === null || (isClock(homing.period) && isClock(homing.nextUpdateClock) && isBoolean(homing.targetValid)
      && [homing.turnFraction, homing.speedFraction, homing.targetDistance].every(isFiniteFloat32)));
}

function isValidCombat(combat: EntityCombat): boolean {
  switch (combat.type) {
    case 'craft':
      return isValidCraftCombat(combat);
    case 'missile':
      return isValidMissileCombat(combat);
    case 'projectile':
      return isIndex(combat.gun) && isNullableId(combat.shooter)
        && (combat.expiry === null || (isClock(combat.expiry.clock) && isBoolean(combat.expiry.firstHitPending)));
    case 'explosion':
      return isEntityId(combat.source)
        && (isCraftKindBit(combat.sourceKindBit) || combat.sourceKindBit === MISSILE_KIND_BIT || combat.sourceKindBit === FRAGMENT_KIND_BIT)
        && EXPLOSION_VARIANTS.includes(combat.variant) && isNullableId(combat.heldSource)
        && isNullableClock(combat.activationClock) && isNullableClock(combat.removalAfterClock);
    case 'fragment':
      // Only part 0 of a kind 1 or 2 source, the escape pod, has no DEBRIS parameters (craft §4.1).
      return isCraftKindBit(combat.sourceKindBit) && isIndex(combat.part)
        && (isEscapePod(combat.sourceKindBit, combat.part) ? combat.debris === null : combat.debris !== null && isIndex(combat.debris))
        && isInt32(combat.durability) && isBoolean(combat.explodeOnExpiry) && isNullableId(combat.handOff)
        && (combat.expiry.type === 'pending' || combat.expiry.type === 'never' || (combat.expiry.type === 'at' && isClock(combat.expiry.clock)));
    case 'marker':
      return true;
    default:
      return false;
  }
}

// P3-08's AI state (docs/plan/p3/02/spec.md, CR-16 to CR-18, CR-20).

const isNonNegativeInt32 = (value: number): boolean => isInt32(value) && value >= 0;

function isValidControlBlock({ scale, axes, speedFactor }: ControlBlock): boolean {
  return isFiniteFloat32(scale) && axes.length === 3
    && axes.every(({ clear, set, value }) => isBoolean(clear) && isBoolean(set) && isFiniteFloat32(value))
    && (speedFactor === null || isFiniteFloat32(speedFactor));
}

const isValidNoise = ({ enabled, low, high }: NoiseSettings): boolean => isBoolean(enabled) && isFiniteFloat32(low) && isFiniteFloat32(high);

function isValidSteeringBlock(block: SteeringBlock): boolean {
  const { offset } = block;
  return isBoolean(block.targetValid) && isNullableId(block.target) && isClock(block.targetSample) && isClock(block.relativeSample)
    && isFloat32Vec(block.point) && isBoolean(offset.enabled) && (offset.frame === 0 || offset.frame === 1) && isFloat32Vec(offset.vector)
    && isUpTo(block.sizeClass, 0xff) && isUpTo(block.leadMode, 0xff) && isUpTo(block.relativeFlags, 7) && isUpTo(block.reverseFlags, 7)
    && isFloat32Vec(block.relative) && isFloat32Vec(block.reverse)
    && [
      block.distance, block.targetSpeed, block.approachRadius, block.speedLimit, block.halfSpeedLimit, block.leadConstant, block.speedFraction,
      block.turnFraction,
    ].every(isFiniteFloat32)
    && block.turnRates.length === 3 && block.turnRates.every(isFiniteFloat32) && block.angles.length === 2 && block.angles.every(isFiniteFloat32)
    && isValidControlBlock(block.control) && isUpTo(block.coneBits, 3) && isBoolean(block.rollMatch)
    && isValidNoise(block.throttleNoise) && isValidNoise(block.steeringNoise);
}

function isValidControllerCommon(controller: AiControllerCommon): boolean {
  const { limits, triggers, engagement, attackPass } = controller;
  return isClock(controller.nextUpdateClock) && isNonNegativeInt32(controller.period)
    && [limits.turn, limits.speed, limits.saturation, limits.rollMatchThreshold].every(isFiniteFloat32)
    && triggers.length === 3 && triggers.every(({ pressed, holdDeadline }) => isBoolean(pressed) && isClock(holdDeadline))
    && [controller.aiLock, controller.missileReady, controller.automaticMounts].every(isBoolean)
    && isClock(engagement.dueClock) && isNonNegativeInt32(engagement.period) && isUpTo(engagement.mask, 0xffffffff)
    && isUpTo(attackPass.phase, 2) && isClock(attackPass.deadline) && isUpTo(attackPass.savedSizeClass, 0xff) && isUpTo(attackPass.savedLeadMode, 0xff)
    && isValidSteeringBlock(controller.steering);
}

function isValidExecution(execution: ExecutionState): boolean {
  const { variables, timers, returnStack, wait, hold } = execution;
  return isIndex(execution.script) && isIndex(execution.item)
    && variables.length === 4 && variables.every(isInt32) && timers.length === 4 && timers.every(isClock)
    && returnStack.length <= RETURN_STACK_DEPTH && returnStack.every(isIndex)
    && isBoolean(wait.active) && isClock(wait.until) && isBoolean(hold.active) && isClock(hold.until);
}

function isValidInterpreter(interpreter: InterpreterState): boolean {
  const { state, execution } = interpreter;
  return isUpTo(state, 6) && (execution === null ? state === 0 || state === 3 : isValidExecution(execution))
    && isBoolean(interpreter.lastRunEnded) && [interpreter.steadyClock, interpreter.stateDeadline, interpreter.state4Deadline].every(isClock);
}

function isValidWingman(wingman: WingmanState): boolean {
  return isUpTo(wingman.behaviour, 5) && isNullableId(wingman.doNotAttack) && isNullableId(wingman.attackTarget)
    && isClock(wingman.nextGunSwitchClock) && isClock(wingman.nextEngageSearchClock);
}

/** The handlers each slot type may install: a table record runs the interpreter, a built-in record its own handler. */
function isValidController(type: 'table' | 'built-in', controller: AiController): boolean {
  if (!isValidControllerCommon(controller)) return false;
  switch (controller.handler) {
    case 'parked':
      return true;
    case 'interpreter':
      return type === 'table' && isValidInterpreter(controller.interpreter);
    case 'wingman':
      return type === 'built-in' && isValidWingman(controller.wingman);
    case 'base':
      return type === 'built-in' && (controller.base.targetMask === 0x93780 || controller.base.targetMask === 0x6c87f);
    default:
      return false;
  }
}

/**
 * Whether `program` is a valid AI program slot for an entity of `kindBit` (CR-16): the player, kind 0x4000 and the
 * runtime kinds have none; a selected record is an index; an installed controller has the handler its slot type allows
 * and every field in its range. A rule that writes the slot checks it with this and faults otherwise.
 */
export function isValidAiProgram(kindBit: number, program: AiProgramSlot): boolean {
  if (program.type === 'none') return true;
  if (!isCraftKindBit(kindBit) || kindBit === 0 || kindBit === TRANSPONDER_KIND_BIT) return false;
  if (program.type !== 'table' && program.type !== 'built-in') return false;
  return isIndex(program.record) && (program.controller === null || isValidController(program.type, program.controller));
}

const NO_TRANSPONDER_CALLBACK: TransponderCallback = Object.freeze({ phase: 'none' });

/**
 * The transponder state an allocation gives (CR-20), or undefined when `init` breaks its rules: kind 0x4000 has one
 * and every other kind none. Without a supplied state it is the declaration's, with no callback. A supplied one is a
 * construction's (`0x38780`): no source and the allocator's other fields; the player's `b` follows its source's activity,
 * starting at `first-update` exactly while active, and a wingman drops one only from its parked step, parked and with no
 * callback.
 *
 * CR-20 also makes every craft without a source a constructed transponder; the table does not check that yet, since
 * the shared test entities (world.test-support.ts) are sourceless craft of every kind.
 */
function transponderOf(init: EntityInit): TransponderState | null | undefined {
  const { transponder } = init;
  if (init.kindBit !== TRANSPONDER_KIND_BIT) return transponder === undefined ? null : undefined;
  if (transponder === undefined) return { creator: 'declaration', callback: NO_TRANSPONDER_CALLBACK };
  const { creator, callback } = transponder;
  const active = init.activity === 'active';
  const path = creator === 'player'
    ? (callback.phase === 'first-update' && active) || (callback.phase === 'none' && !active)
    : creator === 'wingman' && callback.phase === 'none' && !active;
  const fits = init.source === null && path && hasConstructedTransponderDefaults(init);
  return fits ? { creator, callback: Object.freeze({ ...callback }) } : undefined;
}

/**
 * The fields `0x38780` gives a transponder it constructs (CR-20 step 1), as the allocator leaves them: no name, side,
 * interaction or rule inputs, the allocator's AI state, no formation and no Warp. The model, activity, maximum speed,
 * parked-update clock and combat state are its own.
 */
function hasConstructedTransponderDefaults(init: EntityInit): boolean {
  const { ruleInputs: inputs, ai } = init;
  return init.name.type === 'none' && init.side === null && !init.baseInteraction
    && [inputs.percentB, inputs.percentC, inputs.percentD, inputs.aiValueA, inputs.aiValueB, inputs.aiValueC].every((value) => value === 0)
    && ai.mode === ALLOCATOR_AI_MODE && ai.target === null && ai.objectTarget === null && isZeroVec(ai.goal) && isZeroVec(ai.targetOffset)
    && init.formation === null && init.warpClock === 0 && !init.inWarp;
}

/** Whether `presentation` is the variant of `combat`'s type and names the same record, variant or part (CR-02). */
function presentationFits(presentation: EntityPresentation, combat: EntityCombat): boolean {
  switch (presentation.type) {
    case 'model':
      return combat.type === 'craft';
    case 'missile':
      return combat.type === 'missile' && presentation.missile === combat.missile;
    case 'projectile':
      return combat.type === 'projectile' && presentation.record === combat.gun;
    case 'explosion':
      return combat.type === 'explosion' && presentation.variant === combat.variant;
    case 'fragment':
      return combat.type === 'fragment' && presentation.part === combat.part && presentation.display === (isEscapePod(combat.sourceKindBit, combat.part) ? 'parts-0-2' : 'part');
    case 'map-marker':
      return combat.type === 'marker';
    default:
      return false;
  }
}

function copyPresentation(presentation: EntityPresentation): EntityPresentation {
  switch (presentation.type) {
    case 'model':
      return Object.freeze({ type: 'model', model: presentation.model });
    case 'missile':
      return Object.freeze({ type: 'missile', missile: presentation.missile });
    case 'projectile':
      return Object.freeze({ type: 'projectile', visuals: presentation.visuals, record: presentation.record });
    case 'explosion':
      return Object.freeze({ type: 'explosion', variant: presentation.variant });
    case 'fragment':
      return Object.freeze({ type: 'fragment', model: presentation.model, part: presentation.part, display: presentation.display });
    case 'map-marker':
      return Object.freeze({ type: 'map-marker' });
  }
}

const frozenMatrix = (matrix: Matrix3): Matrix3 => Object.freeze([...matrix]) as unknown as Matrix3;

function copyMount(mount: MountState): MountState {
  const { lastShotClock, ammunition, damage, burst, aim, autoTarget, retargetClock } = mount;
  return { lastShotClock, ammunition, damage, burst, aim: frozenMatrix(aim), autoTarget, retargetClock };
}

function copyCraftCombat(combat: CraftCombat): CraftCombat {
  const { selections, lock, mounts } = combat.weapons;
  const selection = ({ index, mount }: ListSelection): ListSelection => ({ index, mount });
  const { proximity, lastVictim, lastAttacker } = combat;
  return {
    type: 'craft',
    energy: combat.energy,
    shield: combat.shield,
    charge: combat.charge,
    shieldLevel: combat.shieldLevel,
    chargeLevel: combat.chargeLevel,
    sparePower: combat.sparePower,
    fullSpeedPower: combat.fullSpeedPower,
    lastEnergyClock: combat.lastEnergyClock,
    nextEnergyClock: combat.nextEnergyClock,
    depleted: combat.depleted,
    hull: combat.hull,
    subsystems: Object.freeze([...combat.subsystems]),
    weapons: {
      selections: Object.freeze([selection(selections[0]), selection(selections[1]), selection(selections[2])] as const),
      lock: { level: lock.level, stageDueClock: lock.stageDueClock, losing: lock.losing, graceDueClock: lock.graceDueClock, nextUpdateClock: lock.nextUpdateClock },
      mounts: Object.freeze(mounts.map(copyMount)),
    },
    hitFeedbackClock: combat.hitFeedbackClock,
    proximity: proximity && Object.freeze({ entity: proximity.entity, distanceSquared: proximity.distanceSquared }),
    lastVictim: lastVictim && Object.freeze({ entity: lastVictim.entity, clock: lastVictim.clock }),
    lastAttacker: lastAttacker && Object.freeze({ entity: lastAttacker.entity, clock: lastAttacker.clock }),
  };
}

function copyMissileCombat(combat: MissileCombat): MissileCombat {
  const { guidance, homing } = combat;
  return {
    type: 'missile',
    missile: combat.missile,
    shooter: combat.shooter,
    target: combat.target,
    launchByte: combat.launchByte,
    program: combat.program,
    detonate: combat.detonate,
    contact: combat.contact,
    guidance: guidance && {
      phase: guidance.phase,
      lifetimeClock: guidance.lifetimeClock,
      armClock: guidance.armClock,
      fuseRadiusSquared: guidance.fuseRadiusSquared,
      detonationClock: guidance.detonationClock,
      checkInterval: guidance.checkInterval,
      nextCheckClock: guidance.nextCheckClock,
    },
    homing: homing && {
      period: homing.period,
      nextUpdateClock: homing.nextUpdateClock,
      turnFraction: homing.turnFraction,
      speedFraction: homing.speedFraction,
      targetValid: homing.targetValid,
      targetDistance: homing.targetDistance,
    },
  };
}

function copyFragmentExpiry(expiry: FragmentExpiry): FragmentExpiry {
  return Object.freeze(expiry.type === 'at' ? { type: 'at', clock: expiry.clock } : { type: expiry.type });
}

/** A detached, mutable copy whose immutable parts are frozen. */
function copyCombat(combat: EntityCombat): EntityCombat {
  switch (combat.type) {
    case 'craft':
      return copyCraftCombat(combat);
    case 'missile':
      return copyMissileCombat(combat);
    case 'projectile': {
      const { expiry } = combat;
      return { type: 'projectile', gun: combat.gun, shooter: combat.shooter, expiry: expiry && { clock: expiry.clock, firstHitPending: expiry.firstHitPending } };
    }
    case 'explosion': {
      const { source, sourceKindBit, variant, heldSource, activationClock, removalAfterClock } = combat;
      return { type: 'explosion', source, sourceKindBit, variant, heldSource, activationClock, removalAfterClock };
    }
    case 'fragment': {
      const { sourceKindBit, part, debris, durability, explodeOnExpiry, expiry, handOff } = combat;
      return { type: 'fragment', sourceKindBit, part, debris, durability, explodeOnExpiry, expiry: copyFragmentExpiry(expiry), handOff };
    }
    case 'marker':
      return MARKER_COMBAT;
  }
}

/**
 * The entities of one world. Internal to the world's pipeline: it never leaves Core, and outputs copy what they read.
 * Allocation and removal check their invariants and budgets and throw CoreFaultError when Core broke them.
 */
export class EntityTable {
  #nextId: EntityId = 1;
  /** Every entity in ID order, since IDs only grow and a Map keeps insertion order. */
  readonly #byId = new Map<EntityId, Entity>();
  readonly #kinds: Entity[][] = Array.from({ length: KIND_BITS }, () => []);
  #walks = 0;

  /** The ID the next allocation gets; it never decreases. */
  get nextId(): EntityId {
    return this.#nextId;
  }

  /** Entities in the table; removed ones are gone. */
  get size(): number {
    return this.#byId.size;
  }

  /**
   * Appends a new entity at the tail of its kind's list. Exceeding CORE_LIMITS.entities is a budget fault, not an
   * original outcome: the original allocator has no rule-level limit.
   */
  allocate(init: EntityInit): Entity {
    const { kindBit, activity, movement, ai, formation, combat } = init;
    if (!Number.isInteger(kindBit) || kindBit < 0 || kindBit >= KIND_BITS) throw new CoreFaultError('invariant-violated', 'entities.kind');
    if (!isFiniteVec(init.position) || init.orientation.length !== 9 || !init.orientation.every(Number.isFinite)) {
      throw new CoreFaultError('invariant-violated', 'entities.pose');
    }
    if (combat.type !== combatTypeOf(kindBit) || !isValidCombat(combat)) throw new CoreFaultError('invariant-violated', 'entities.combat');
    if (!presentationFits(init.presentation, combat)) throw new CoreFaultError('invariant-violated', 'entities.presentation');
    if (combat.type === 'craft' && init.name.type === 'map-marker') throw new CoreFaultError('invariant-violated', 'entities.name');
    if ((activity === 'parked') !== (movement === null) || (movement !== null && !movementFits(movement, combat))) {
      throw new CoreFaultError('invariant-violated', 'entities.movement');
    }
    if (!isValidFlightState(init)) throw new CoreFaultError('invariant-violated', 'entities.flight');
    if (combat.type !== 'craft' && !hasRuntimeKindDefaults(init)) throw new CoreFaultError('invariant-violated', 'entities.runtime-kind');
    const transponder = transponderOf(init);
    if (transponder === undefined) throw new CoreFaultError('invariant-violated', 'entities.transponder');
    if (!fitsLimit('entities', this.#byId.size, 1)) throw new CoreFaultError('budget-exhausted', 'entities.count');
    const id = this.#nextId;
    if (!Number.isSafeInteger(id + 1)) throw new CoreFaultError('budget-exhausted', 'entities.id');
    const { x, y, z } = init.position;
    const entity: Entity = {
      id,
      kindBit,
      source: copySource(init.source),
      name: copyName(init.name),
      side: init.side,
      baseInteraction: init.baseInteraction,
      presentation: copyPresentation(init.presentation),
      position: Object.freeze({ x, y, z }),
      orientation: Object.freeze([...init.orientation]) as unknown as Matrix3,
      placementSerial: 0,
      ruleInputs: copyRuleInputs(init.ruleInputs),
      state: initialState(activity),
      activity,
      destroyed: false,
      maximumSpeed: init.maximumSpeed,
      lastParkedUpdateClock: init.lastParkedUpdateClock,
      warpClock: init.warpClock,
      inWarp: init.inWarp,
      mapVisible: false,
      movement: movement && copyMovementBlock(movement),
      ai: {
        mode: ai.mode,
        target: ai.target,
        goal: frozenVec(ai.goal),
        targetOffset: frozenVec(ai.targetOffset),
        objectTarget: ai.objectTarget,
        pendingCommand: null,
        program: NO_AI_PROGRAM,
      },
      formation: formation && Object.freeze({ leader: formation.leader, offset: frozenVec(formation.offset) }),
      combat: copyCombat(combat),
      communications: { face: null, threatStamp: null },
      transponder,
    };
    this.#nextId = id + 1;
    this.#byId.set(id, entity);
    this.#kinds[kindBit].push(entity);
    return entity;
  }

  /** The entity with this ID, or undefined once it has been removed: references to a removed entity are invalid. */
  get(id: EntityId): Entity | undefined {
    return this.#byId.get(id);
  }

  /** Unlinks an entity from its kind list and makes its ID unresolvable. Only request handling removes, never during a walk. */
  remove(entity: Entity): void {
    if (this.#walks > 0) throw new CoreFaultError('invariant-violated', 'entities.remove-during-walk');
    if (this.#byId.get(entity.id) !== entity) throw new CoreFaultError('invariant-violated', 'entities.remove');
    this.#byId.delete(entity.id);
    const list = this.#kinds[entity.kindBit];
    list.splice(list.indexOf(entity), 1);
  }

  /**
   * Walks the kinds of `mask` (uint32) in ascending bit order, each list in allocation order. The walk is live; see
   * the module comment. Iterate it with for…of, so that leaving the loop early also ends the walk.
   */
  *walk(mask: number): Generator<Entity, void, undefined> {
    this.#walks++;
    try {
      for (let bit = 0; bit < KIND_BITS; bit++) {
        if (((mask >>> bit) & 1) === 0) continue;
        const list = this.#kinds[bit];
        // The length is read again after every visit, so entities appended to this list meanwhile are visited too.
        for (let index = 0; index < list.length; index++) yield list[index];
      }
    } finally {
      this.#walks--;
    }
  }

  /** Every entity in ascending ID order. */
  byId(): Iterable<Entity> {
    return this.#byId.values();
  }
}
