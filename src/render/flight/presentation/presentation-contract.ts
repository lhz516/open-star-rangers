/**
 * The read-only interface of the flight presentation module (docs/plan/p3/02/spec.md, FS-07; docs/plan/p3/12/spec.md,
 * 表现层契约 and 表现层效果与会话级选择者; docs/plan/p3/14/spec.md, DW-02): what the renderer and P3-14 read, the per-tick
 * input it consumes, and the two seams through which the presentation effects and the destruction-view camera join one
 * run's module. None of it enters Core, a snapshot or a replay.
 */
import type { DomainEvent, Vec3 } from '../../../core/contracts/domain-events.ts';
import type { RenderState } from '../../../core/projections/render-state.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import type { EntityId, ExplosionVariant, Matrix3 } from '../../../core/world/entity-table.ts';

/** `item` is the zero-based index into the original `ExplosionTable.lists[list - 1]`, not into the run's subset. */
export interface ExplosionSelection {
  readonly list: 1 | 2 | 3;
  readonly item: number;
}

/** A Core explosion's EntityId. */
export type CoreExplosionKey = `core:${number}`;
/** Numbered from 1 within the run, as are the other presentation keys. */
export type ExtraExplosionKey = `extra:${number}`;
export type FragmentExplosionKey = `fragment-explosion:${number}`;
/** A discriminator-1/2 fragment. */
export type FragmentKey = `fragment:${number}`;
export type ExplosionKey = CoreExplosionKey | ExtraExplosionKey | FragmentExplosionKey;

export type ExplosionOrigin =
  /** `eventIndex`: its `explosion-started` event's index in that tick's events. */
  | { readonly type: 'core'; readonly entityId: EntityId; readonly eventIndex: number }
  | { readonly type: 'extra'; readonly parentExplosionKey: CoreExplosionKey; readonly ordinal: 0 | 1 | 2 | 3 | 4 }
  | { readonly type: 'fragment'; readonly fragmentKey: FragmentKey };

/** Logical pixels of the 640 × 480 screen, ends included (`0x175200`). */
export interface PresentationViewport {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Core's rows: row 0 right, row 1 up, row 2 forward. */
export interface CameraPose {
  readonly position: Vec3;
  readonly rows: Matrix3;
}

export interface PresentationCamera extends CameraPose {
  readonly tick: number;
  readonly viewMode: number;
  readonly subMode: number;
  readonly viewport: PresentationViewport;
}

export interface ExplosionActivation {
  readonly key: ExplosionKey;
  readonly origin: ExplosionOrigin;
  /** Null for an extra explosion. */
  readonly sourceKindBit: number | null;
  readonly variant: ExplosionVariant;
  readonly selection: ExplosionSelection;
  readonly tick: number;
  readonly clock: number;
  /** At activation, before any move. */
  readonly position: Vec3;
}

export interface PresentationTick {
  readonly ownerId: number;
  readonly runId: number;
  readonly tick: number;
  readonly clock: number;
  /** The previous tick's `afterStep`: the camera of the explosion choices, gates and flash checks. */
  readonly beforeStep: PresentationCamera;
  /** The camera at the tick's end, in every view. */
  readonly afterStep: PresentationCamera;
  /** Core explosions in `explosion-started` order, then presentation explosions in production order. */
  readonly activations: readonly ExplosionActivation[];
  /** The explosions activated and not ended at the tick's end: what `explosions()` gives right after the tick (DW-02). */
  readonly explosions: readonly PresentationExplosion[];
}

/** An explosion's mode-1 movement block (DW-02), which its drift never changes. */
export interface ExplosionMotion {
  /** The block's third row (R2). */
  readonly forward: Vec3;
  /** The block's +0x08, f32 runtime units per second. */
  readonly speed: number;
}

/**
 * One activated explosion that has not ended. Its motion (DW-02) is a Core explosion's in the tick's Render State, an
 * extra's Core explosion's at its construction, and a fragment explosion's R2′ and s of its drift F(R2′ × s).
 */
export interface PresentationExplosion extends ExplosionMotion {
  readonly key: ExplosionKey;
  readonly origin: ExplosionOrigin;
  readonly sourceKindBit: number | null;
  readonly variant: ExplosionVariant;
  readonly selection: ExplosionSelection;
  readonly activationTick: number;
  readonly activationClock: number;
  /** At the end of the last processed tick. */
  readonly position: Vec3;
}

/** One successful tick as the Runtime reports it (its `TickOutput`, structurally). */
export interface PresentationTickInput {
  readonly tick: number;
  readonly clock: number;
  readonly render: RenderState;
  readonly events: readonly { readonly event: DomainEvent }[];
}

/** One frame's successful ticks, in ascending order, for the module's owner and run. */
export interface PresentationFrameInput {
  readonly ownerId: number;
  readonly runId: number;
  readonly outputs: readonly PresentationTickInput[];
}

/** What every per-tick seam sees: the tick, its Render State and events, and the camera before it. */
export interface PresentationStep {
  readonly tick: number;
  readonly clock: number;
  readonly render: RenderState;
  readonly events: readonly DomainEvent[];
  readonly beforeStep: PresentationCamera;
}

/**
 * The destruction-view camera (P3-12/14), stepped once per tick, tick 0 included, before the tick's camera is formed.
 * It returns the camera at the tick's end in view 0x11, sub-mode 8, and null in every other view.
 */
export interface DestructionCamera {
  step(step: PresentationStep): CameraPose | null;
}

/** One counted presentation object: a waiting or live extra explosion, a fragment, or a fragment's explosion. */
export interface PresentationObjectSlot {
  readonly __presentationObjectSlot: never;
}

/**
 * A presentation explosion to activate on a slot reserved for it (X3; X5, X7): an extra explosion of an activated Core
 * explosion, `large` or `other` as its source; or the `other` explosion of an expiring flagged fragment. `motion` is
 * its movement block (DW-02).
 */
export type PresentationActivationRequest = { readonly position: Vec3; readonly motion: ExplosionMotion; readonly slot: PresentationObjectSlot } & (
  | {
    readonly origin: { readonly type: 'extra'; readonly parentExplosionKey: CoreExplosionKey; readonly ordinal: 0 | 1 | 2 | 3 | 4 };
    readonly variant: 'large' | 'other';
  }
  | { readonly origin: { readonly type: 'fragment'; readonly fragmentKey: FragmentKey }; readonly variant: 'other' });

/** The per-tick context of the presentation effects (P3-12/13), after the tick's Core activations. */
export interface PresentationEffectsStep extends PresentationStep {
  readonly afterStep: PresentationCamera;
  /** This tick's Core activations, in order. */
  readonly activations: readonly ExplosionActivation[];
  /** The run's presentation random source, never the world's. */
  readonly random: RandSource;
  /** Counts one presentation object (waiting ones included) before it is allocated; `presentation-capacity` beyond the limit. */
  reserveObject(): PresentationObjectSlot;
  /** Frees a slot no explosion holds; an explosion's slot is freed by `end`. */
  releaseObject(slot: PresentationObjectSlot): void;
  /** The run's next fragment key. */
  nextFragmentKey(): FragmentKey;
  /** Selects once with `beforeStep` on the request's slot and lists the activation after the tick's Core ones. */
  activate(request: PresentationActivationRequest): ExplosionActivation;
  /** The explosion's position at this tick's end. */
  move(key: ExtraExplosionKey | FragmentExplosionKey, position: Vec3): void;
  /** Ends the explosion's life: it leaves the query, and its selection and slot are freed. */
  end(key: ExtraExplosionKey | FragmentExplosionKey): void;
}

/** `step` is synchronous: a returned promise is a contract violation. */
export interface PresentationEffects {
  step(step: PresentationEffectsStep): void;
}
