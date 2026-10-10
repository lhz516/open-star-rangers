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
  | { readonly type: 'craft-type'; readonly kindBit: number };

/**
 * What a renderer draws: the model Asset of a declared craft. Runtime kinds without a model (projectiles, missiles,
 * explosions, debris, map markers) get their own variants from the tasks that implement them and cannot be created
 * before. Model Asset IDs, craft-type slots and presentation selectors are never merged into one number.
 */
export type EntityPresentation = { readonly type: 'model'; readonly model: AssetId };

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
 * The movement block (object +8) of an active or docked entity; null while parked or removed. A union discriminated by
 * `mode`: P3-06 has the steered variant of the original's modes 0 and 3, and P3-07 and P3-09 add the variants of the
 * other modes beside it through the extension rules.
 */
export type MovementBlock = SteeredMovementBlock;

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

/** AI modes (+0xC4) with the original values that instantiation writes; P3-08 adds the others through the extension rules. */
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
  /** +0x8C of a non-player object, written by P3-08's AI; the player's +0x8C is PlayerState.target, so the player's stays null. */
  objectTarget: EntityId | null;
}

/** AI mode 5, the allocator's default and the mode of kinds 0x2000 and 0x4000. */
const ALLOCATOR_AI_MODE = 5;

/**
 * The AI state the allocator leaves (mode 5, no targets, zero vectors): an entity's until `0x68050` runs, and the state
 * of runtime entities that never run it (P3-07's projectiles and others).
 */
export function allocatorAiState(): AiState {
  return { mode: ALLOCATOR_AI_MODE, target: null, goal: ZERO_VECTOR, targetOffset: ZERO_VECTOR, objectTarget: null };
}

const ZERO_VECTOR: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });

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
  readonly ruleInputs: EntityRuleInputs;
  state: ObjectState;
  activity: Activity;
  /** The original dead flag +0xD8, written by the rules. Destroyed is not removed: the rescue reuses the player's entity. */
  destroyed: boolean;
  /**
   * +0x78, f32 runtime units/s: the rule-computed current maximum, apart from the craft record's base +0xB8. Written at
   * instantiation; recomputed by P3-07 and P3-11.
   */
  maximumSpeed: number;
  /** +0x18, clock units: the last parked update; the instantiation clock until the parked update rewrites it. */
  lastParkedUpdateClock: number;
  /** +0xC8, clock units, 0 when unset: postpones Warps and times a Warp transit (P3-06 parked path, P3-09). */
  warpClock: number;
  /** +0xCC: in Warp. */
  inWarp: boolean;
  /** Present exactly while the entity is not parked: instantiation and resuming build it, parking releases it. */
  movement: MovementBlock | null;
  ai: AiState;
  formation: Formation | null;
}

/** What instantiation supplies; the table assigns the ID, the state, the placement serial and the destroyed flag. */
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
  if ((activity === 'parked') !== (movement === null) || (movement !== null && !isValidMovement(movement))) {
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

const frozenVec = ({ x, y, z }: Vec3): Vec3 => Object.freeze({ x, y, z });
const isFloat32Vec = ({ x, y, z }: Vec3): boolean => isFiniteFloat32(x) && isFiniteFloat32(y) && isFiniteFloat32(z);
const isClock = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
const AI_MODES: readonly number[] = [0, 1, 2, 4, 5];

function isValidMovement(block: SteeredMovementBlock): boolean {
  const { steering, timedRotation, impulse, disturbance } = block;
  return (block.mode === 'craft' || block.mode === 'warp')
    && [block.speed, block.commandedSpeed, block.speedRatio].every(isFiniteFloat32)
    && ROTATION_AXES.every((axis) => {
      const timed = timedRotation[axis];
      return isFiniteFloat32(steering[axis].rate) && (timed === null || [timed.rate, timed.decay, timed.end].every(isFiniteFloat32));
    })
    && (impulse === null || (isFloat32Vec(impulse.direction) && isFiniteFloat32(impulse.magnitude)))
    && (disturbance === null || disturbance.level === 1 || (disturbance.level === 2 && disturbance.biases.every(Number.isSafeInteger)));
}

/** The flight state's invariants (docs/plan/p3/06/spec.md, 检查点 A 定稿的状态与契约): f32 values, clocks and modes. */
function isValidFlightState(init: EntityInit): boolean {
  const { movement, ai, formation } = init;
  return isFiniteFloat32(init.maximumSpeed) && isClock(init.lastParkedUpdateClock) && isClock(init.warpClock)
    && (movement === null || isValidMovement(movement))
    && AI_MODES.includes(ai.mode) && isFloat32Vec(ai.goal) && isFloat32Vec(ai.targetOffset)
    && (formation === null || isFloat32Vec(formation.offset));
}

/** A detached, mutable copy whose immutable parts are frozen. */
function copyMovement(block: SteeredMovementBlock): SteeredMovementBlock {
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
    const { kindBit, activity, movement, ai, formation } = init;
    if (!Number.isInteger(kindBit) || kindBit < 0 || kindBit >= KIND_BITS) throw new CoreFaultError('invariant-violated', 'entities.kind');
    if (!isFiniteVec(init.position) || init.orientation.length !== 9 || !init.orientation.every(Number.isFinite)) {
      throw new CoreFaultError('invariant-violated', 'entities.pose');
    }
    if ((activity === 'parked') !== (movement === null)) throw new CoreFaultError('invariant-violated', 'entities.movement');
    if (!isValidFlightState(init)) throw new CoreFaultError('invariant-violated', 'entities.flight');
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
      presentation: Object.freeze({ type: init.presentation.type, model: init.presentation.model }),
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
      movement: movement && copyMovement(movement),
      ai: { mode: ai.mode, target: ai.target, goal: frozenVec(ai.goal), targetOffset: frozenVec(ai.targetOffset), objectTarget: ai.objectTarget },
      formation: formation && Object.freeze({ leader: formation.leader, offset: frozenVec(formation.offset) }),
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
