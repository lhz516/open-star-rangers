/**
 * The hit shimmer's state (docs/original/formats/executable.md, HS1–HS5; docs/plan/p3/12/spec.md, 模型、光照与第 2 列表;
 * AC-08): one per run, free of DOM, Three.js and WebGL, advanced by each successful tick's Render State and events, in
 * order and without a gap, from the run's tick-0 Render State. The original handles its render items after the whole
 * dispatcher pass, so every rule reads the tick's end: the view mode, the player object and its +0xCC (`inWarp`), and
 * which visuals exist. Per tick:
 *
 * 1. **Visuals** (HS2, HS5): an entity has a visual while its display is `shown` or `hidden` (its model completed; a
 *    `pending` one has none yet, a `released` one lost it this pass, an unlisted one has none). A new visual of a model
 *    with a list 2 gets a block: kinds of `0x383` their own shell, whose wrap index is one presentation draw modulo the
 *    family's wrap count; kinds of `0xf9c7c` a record list, the run's first such visual fixing the model of the 16
 *    shared shells; other kinds none. Hiding a shown visual (player kinds) removes its shell.
 * 2. **Hits** (HS1, HS3), in event order, each `hit` but the parked engagement's (which posts no item), of a listed
 *    victim: the player's victim entity outside view 0x11 gets the screen flash instead (P3-12/21); a hit with the
 *    shield already empty starts nothing; otherwise, unless the player object is in Warp, the shimmer starts. An own
 *    shell restarts its band and steps at t = 0; a shared hit needs its impact and restarts the first record (newest
 *    first) within (Δx² + Δy²) + Δz² < 100 of its local point, else, below 16 records, inserts a newest record at the
 *    impact's local point oriented by its face, and steps; with 16 it is dropped without a step.
 * 3. **Poses** (HS4): every `shown` visual steps when the player object exists and is not in Warp. t is the band
 *    position of the tick's clock against the record's start (shimmer-band.ts), 0 for the first record of a start's
 *    step. An own shell past t = 250 ends; otherwise its wrap index advances by one, wrapping to 0, and its band is t. A
 *    shared record past 250 ends with every later record; otherwise its step is min(t ÷ 15, 15), the shared shell drawn.
 *    Frozen shells keep their last band, wrap and step.
 *
 * Without a player object (after the player's removal, e.g. between the hand-off and the rescue) the original's hit
 * handling reads +0xCC through the null handle (`0x3d7ff`, unlike the pose path's check at `0x3d6fd`). Under the flat
 * DOS extender linear 0 is the real-mode interrupt table, readable, so it reads a stray dword whose value is 1 only by
 * chance: the shimmer starts (Likely, U-027; a runtime read of [[0] + 0xCC] in the baseline would settle it). A start
 * on a hidden visual, believed unreachable, is refused and faults the consumer.
 */
import type { DomainEvent, HitEvent, Vec3 } from '../../../core/contracts/domain-events.ts';
import type { RenderEntity, RenderState } from '../../../core/projections/render-state.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import type { EntityId, Matrix3 } from '../../../core/world/entity-table.ts';
import type { AssetId } from '../../../content/asset-id.ts';
import { fail } from '../../../content/contract-validation.ts';
import { DESTRUCTION_VIEW_MODE } from '../presentation/presentation-camera.ts';
import { libraryOrientation } from '../scene/drawn-pose.ts';
import { bandPosition, LAST_BAND, SHARED_STEP_BAND } from './shimmer-band.ts';
import type { ShimmerShell } from './shimmer-surfaces.ts';
import { wrapFamily, type WrapFamily } from './shimmer-wraps.ts';

const PATH = 'shimmer';

export type HitShimmerErrorKind =
  /** A tick out of order or a malformed input; the state is unchanged. */
  | 'invalid-input'
  /** A branch the research has not settled. */
  | 'unsupported-branch'
  /** The state failed earlier. */
  | 'invalid-state';

export class HitShimmerError extends Error {
  readonly kind: HitShimmerErrorKind;
  readonly path: string;
  readonly reason: string;

  constructor(kind: HitShimmerErrorKind, path: string, reason: string) {
    super(`${kind}: ${path} ${reason}`);
    this.name = 'HitShimmerError';
    this.kind = kind;
    this.path = path;
    this.reason = reason;
  }
}

/** One tick as the Runtime reports it (game-runtime.ts's TickOutput). */
export interface ShimmerTick {
  readonly tick: number;
  readonly render: RenderState;
  readonly events: readonly { readonly event: DomainEvent }[];
}

interface DrawingBase {
  readonly entityId: EntityId;
  /** The shell's model: the entity's own, or the shared shells' for a record. */
  readonly model: AssetId;
  readonly family: WrapFamily;
  /** The wrap index, a shared record's step. */
  readonly wrap: number;
  /** The band position of its opacity image: 0–250 (15 × a shared record's step), or negative (no texel drawn). */
  readonly band: number;
}

/** A drawn shell: an own shell at its entity's pose, or a shared shell at a record's place in its entity's frame. */
export type ShimmerDrawing =
  | DrawingBase & { readonly type: 'own' }
  | DrawingBase & {
    readonly type: 'shared';
    /** The record's place and orientation in its entity's model axes. */
    readonly local: Vec3;
    readonly rows: Matrix3;
  };

export interface HitShimmerInput {
  /** Which models have a shell (shimmer-surfaces.ts). */
  readonly models: ReadonlyMap<AssetId, ShimmerShell | null>;
  /** The run's Render State at tick 0. */
  readonly initial: RenderState;
  /** The presentation random source the wrap indices are drawn from; never the world's. */
  readonly random: RandSource;
}

const SHARED_RECORDS = 16;
const LAST_SHARED_STEP = 15;
/** The f32 100.0 (`0x171a24`), exact. */
const MERGE_DISTANCE_SQUARED = 100;

interface OwnBlock {
  readonly type: 'own';
  readonly model: AssetId;
  readonly family: 'turning' | 'bounds';
  readonly wraps: number;
  attached: boolean;
  start: number;
  wrap: number;
  band: number;
}

interface SharedRecord {
  start: number;
  step: number;
  readonly local: Vec3;
  readonly rows: Matrix3;
}

interface SharedBlock {
  readonly type: 'shared';
  /** Newest first. */
  readonly records: SharedRecord[];
}

interface Visual {
  display: 'shown' | 'hidden';
  readonly block: OwnBlock | SharedBlock;
}

const hasVisual = (entity: RenderEntity): entity is RenderEntity & { readonly display: 'shown' | 'hidden' } =>
  entity.display === 'shown' || entity.display === 'hidden';

/** The impact face's outward axis (direction) and second basis vector (up) in model axes, by face code (HS1). */
const FACE_AXES: readonly (readonly [Vec3, Vec3])[] = Object.freeze([
  [{ x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
  [{ x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }],
  [{ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }],
  [{ x: 1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }],
  [{ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }],
  [{ x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }],
]);

/** The record frame's orientation `0x7abf0` gives per face, for direction = the face axis, up = its second vector. */
const FACE_ROWS: readonly Matrix3[] = Object.freeze(FACE_AXES.map(([direction, up]) =>
  libraryOrientation([0, 0, 0, up.x, up.y, up.z, direction.x, direction.y, direction.z] as unknown as Matrix3)!));

export class HitShimmer {
  readonly #models: ReadonlyMap<AssetId, ShimmerShell | null>;
  readonly #random: RandSource;
  readonly #visuals = new Map<EntityId, Visual>();
  #sharedModel: AssetId | null = null;
  #drawings: readonly ShimmerDrawing[] | null = null;
  #tick: number;
  #failed = false;

  constructor({ models, initial, random }: HitShimmerInput) {
    this.#models = models;
    this.#random = random;
    this.#tick = initial.tick;
  }

  /** The last processed tick; the initial Render State's before any. */
  get tick(): number {
    return this.#tick;
  }

  /** Processes `ticks`, which must continue from the last processed tick without a gap. */
  advance(ticks: readonly ShimmerTick[]): void {
    if (this.#failed) throw new HitShimmerError('invalid-state', `${PATH}.advance`, 'is not allowed after a failure');
    ticks.forEach(({ tick }, index) => {
      if (tick !== this.#tick + index + 1) throw new HitShimmerError('invalid-input', `${PATH}.advance`, `gives tick ${tick} after tick ${this.#tick + index}`);
    });
    this.#drawings = null;
    try {
      for (const tick of ticks) {
        this.#step(tick);
        this.#tick = tick.tick;
      }
    } catch (cause) {
      this.#failed = true;
      throw cause;
    }
  }

  /** The shells drawn after the last processed tick, by ascending entity ID, records newest first. */
  drawings(): readonly ShimmerDrawing[] {
    if (this.#drawings) return this.#drawings;
    const drawings: ShimmerDrawing[] = [];
    for (const [entityId, { block }] of [...this.#visuals].sort(([a], [b]) => a - b)) {
      if (block.type === 'own') {
        if (block.attached) drawings.push(Object.freeze({ type: 'own', entityId, model: block.model, family: block.family, wrap: block.wrap, band: block.band }));
        continue;
      }
      for (const { step, local, rows } of block.records) {
        drawings.push(Object.freeze({ type: 'shared', entityId, model: this.#sharedModel!, family: 'shared', wrap: step, band: SHARED_STEP_BAND * step, local, rows }));
      }
    }
    this.#drawings = Object.freeze(drawings);
    return this.#drawings;
  }

  #step({ render, events }: ShimmerTick): void {
    const listed = new Map(render.entities.map((entity) => [entity.id, entity]));
    this.#syncVisuals(render.entities, listed);
    const player = render.observedEntityId === null ? undefined : listed.get(render.observedEntityId);
    const sample = render.clock;
    for (const { event } of events) {
      if (event.type === 'hit') this.#hit(event, render, listed, player, sample);
    }
    if (player === undefined || player.inWarp) return;
    for (const [id, visual] of this.#visuals) if (visual.display === 'shown') this.#pose(visual.block, sample, false, id);
  }

  #syncVisuals(entities: readonly RenderEntity[], listed: ReadonlyMap<EntityId, RenderEntity>): void {
    for (const [id, visual] of this.#visuals) {
      const entity = listed.get(id);
      if (entity === undefined || !hasVisual(entity)) {
        this.#visuals.delete(id);
        continue;
      }
      if (visual.display === 'shown' && entity.display === 'hidden') {
        if (visual.block.type === 'own') visual.block.attached = false;
        else visual.block.records.length = 0;
      }
      visual.display = entity.display;
    }
    for (const entity of entities) {
      if (!hasVisual(entity) || this.#visuals.has(entity.id) || entity.presentation.type !== 'model') continue;
      const { model } = entity.presentation;
      if (!this.#models.has(model)) fail('binding-mismatch', `${PATH}.models[${model}]`, 'is drawn but was not prepared');
      const family = wrapFamily(entity.kindBit);
      if (this.#models.get(model) === null || family === null) continue;
      if (family === 'shared') {
        this.#sharedModel ??= model;
        this.#visuals.set(entity.id, { display: entity.display, block: { type: 'shared', records: [] } });
        continue;
      }
      const { wraps } = this.#models.get(model)!.tables[family];
      const wrap = this.#random.next() % wraps;
      this.#visuals.set(entity.id, { display: entity.display, block: { type: 'own', model, family, wraps, attached: false, start: 0, wrap, band: 0 } });
    }
  }

  #hit(event: HitEvent, render: RenderState, listed: ReadonlyMap<EntityId, RenderEntity>, player: RenderEntity | undefined, sample: number): void {
    if (event.cause === 'parked') return;
    const victim = listed.get(event.victimEntityId);
    if (victim === undefined) return;
    if (victim.id === render.observedEntityId && render.viewMode !== DESTRUCTION_VIEW_MODE) return;
    if (event.shieldWasEmpty) return;
    const visual = this.#visuals.get(victim.id);
    // The start returns at once without a block, or for a shared one without an impact: +0xCC changes nothing then.
    if (visual === undefined || (visual.block.type === 'shared' && event.impact === null)) return;
    // Without a player object the stray +0xCC read is taken as ≠ 1 (Likely, see above).
    if (player?.inWarp === true) return;
    if (visual.display === 'hidden') throw new HitShimmerError('unsupported-branch', `${PATH}.hit[${event.victimEntityId}]`, 'starts a shimmer on a hidden visual');
    const { block } = visual;
    if (block.type === 'own') {
      block.attached = true;
      block.start = sample;
      this.#pose(block, sample, true, victim.id);
      return;
    }
    const { local, face } = event.impact!;
    const near = block.records.find((record) => {
      const dx = record.local.x - local.x;
      const dy = record.local.y - local.y;
      const dz = record.local.z - local.z;
      return dx * dx + dy * dy + dz * dz < MERGE_DISTANCE_SQUARED;
    });
    if (near) {
      near.start = sample;
    } else {
      if (block.records.length === SHARED_RECORDS) return;
      block.records.unshift({ start: sample, step: 0, local: Object.freeze({ ...local }), rows: FACE_ROWS[face] });
    }
    this.#pose(block, sample, true, victim.id);
  }

  /** `0x42664`: steps the block's shells at `sample`; `start` gives the first record t = 0. */
  #pose(block: OwnBlock | SharedBlock, sample: number, start: boolean, id: EntityId): void {
    if (block.type === 'own') {
      if (!block.attached) return;
      const t = start ? 0 : bandPosition(sample, block.start);
      if (t > LAST_BAND) {
        block.attached = false;
        return;
      }
      block.wrap = (block.wrap + 1) % block.wraps;
      block.band = t;
      return;
    }
    for (const [index, record] of block.records.entries()) {
      const t = start && index === 0 ? 0 : bandPosition(sample, record.start);
      if (t > LAST_BAND) {
        block.records.length = index;
        return;
      }
      if (t < 0) throw new HitShimmerError('unsupported-branch', `${PATH}.records[${id}]`, 'reaches a band position past i32, whose shared step the original reads outside its table');
      record.step = Math.min(Math.trunc(t / SHARED_STEP_BAND), LAST_SHARED_STEP);
    }
  }
}
