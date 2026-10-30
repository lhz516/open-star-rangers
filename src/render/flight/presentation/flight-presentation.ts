/**
 * The flight presentation module (docs/plan/p3/02/spec.md, FS-07; docs/plan/p3/12/spec.md, 表现层契约 and
 * 表现层效果与会话级选择者): one per run, free of DOM, Three.js and WebGL. The renderer and P3-14 read the same instance.
 *
 * - **Start:** created at tick 0, before the first frame, for one owner and run, from the run's checked content, the
 *   tick-0 Render State and a presentation random source that is never the world's. It checks the content, draws the
 *   EXPL subset and forms tick 0's camera from the origin and the identity rows.
 * - **Advance:** each frame's successful ticks, in order and without a gap, for its owner and run; anything else is
 *   rejected unchanged. Per tick: the camera after the step; the Core explosions of its `explosion-started` events,
 *   each chosen once with the camera before the step; the presentation effects, whose explosions follow; then the Core
 *   choices whose explosion left the Render State are dropped, and the others take their pose and movement block from
 *   it. Each tick's notification carries the explosions it ended with (P3-14 DW-02). Only after the whole frame are the
 *   ticks notified, each to every subscriber once, in tick order. A failure while advancing leaves the module failed.
 * - **Queries:** `camera()` and `explosions()` read the state after the last processed tick without drawing or
 *   advancing anything; a consumer that subscribes late resumes from them, and nothing earlier is notified again.
 * - **Lifetime:** a retry or a new run creates a new instance; nothing carries over. `dispose` is idempotent, stops
 *   every notification and rejects every later use.
 */
import type { DomainEvent, ExplosionStartedEvent, Vec3 } from '../../../core/contracts/domain-events.ts';
import type { RenderEntity, RenderState } from '../../../core/projections/render-state.ts';
import { rowOf } from '../../../core/rules/movement-builders.ts';
import { RandStream, type RandSource } from '../../../core/rules/original-random.ts';
import { FRAGMENT_KIND_BIT, frozenVec, type EntityId, type Matrix3 } from '../../../core/world/entity-table.ts';
import { checkPresentationContent, drawExplosionSubset, selectExplosion, type ExplosionSubset, type PresentationContent } from './explosion-selection.ts';
import { checkCapacity, PRESENTATION_LIMITS, PresentationError } from './presentation-budget.ts';
import { cameraAfterStep, INITIAL_CAMERA_POSE, presentationViewport } from './presentation-camera.ts';
import type {
  CameraPose, CoreExplosionKey, DestructionCamera, ExplosionActivation, ExplosionKey, ExplosionMotion, ExplosionOrigin,
  ExtraExplosionKey, FragmentExplosionKey, FragmentKey, PresentationActivationRequest, PresentationCamera, PresentationObjectSlot,
  PresentationEffects, PresentationExplosion, PresentationFrameInput, PresentationStep, PresentationTick, PresentationTickInput,
} from './presentation-contract.ts';

export interface FlightPresentationInput {
  readonly ownerId: number;
  readonly runId: number;
  readonly content: PresentationContent;
  /** The run's Render State at tick 0. */
  readonly initial: RenderState;
  readonly random: RandSource;
  readonly effects?: PresentationEffects;
  readonly destructionCamera?: DestructionCamera;
}

export type PresentationListener = (tick: PresentationTick) => void;

export interface FlightPresentation {
  readonly ownerId: number;
  readonly runId: number;
  /** The camera the last processed tick ended with; tick 0's before any frame. */
  camera(): PresentationCamera;
  /** Activated explosions that have not ended, in activation order. */
  explosions(): readonly PresentationExplosion[];
  /** Notifies `listener` of every later tick; the returned function unsubscribes and is idempotent. */
  subscribe(listener: PresentationListener): () => void;
  advance(frame: PresentationFrameInput): void;
  dispose(): void;
}

/**
 * A kept choice: a Core explosion's, whose life ends when it leaves the Render State, or a presentation explosion's,
 * whose `slot` is freed when the effects end it.
 */
interface LiveExplosion {
  readonly activation: ExplosionActivation;
  readonly slot: PresentationObjectSlot | null;
  position: Vec3;
  /** Null only for a Core explosion until its tick's end reads its block from the Render State (`#settleCore`). */
  motion: ExplosionMotion | null;
}

/** When and from where an explosion activates. */
interface ActivationTime {
  readonly tick: number;
  readonly clock: number;
  readonly beforeStep: PresentationCamera;
}

const PATH = 'presentation';

const isSafeCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isFiniteVec = (vec: Vec3): boolean => Number.isFinite(vec.x) && Number.isFinite(vec.y) && Number.isFinite(vec.z);

function invalidInput(path: string, reason: string): never {
  throw new PresentationError('invalid-input', `${PATH}.${path}`, reason);
}

function invariant(path: string, reason: string): never {
  throw new PresentationError('invariant-violated', `${PATH}.${path}`, reason);
}

/** A run-wide sequence of keys from 1. */
class KeySequence<Key extends string> {
  readonly #prefix: string;
  #last = 0;

  constructor(prefix: string) {
    this.#prefix = prefix;
  }

  next(): Key {
    if (this.#last >= Number.MAX_SAFE_INTEGER) throw new PresentationError('presentation-capacity', `${PATH}.keys.${this.#prefix}`, 'ran out of safe integers');
    return `${this.#prefix}:${++this.#last}` as Key;
  }
}

function destructionPose(pose: CameraPose | null): CameraPose | null {
  if (pose === null) return null;
  const { position, rows } = pose;
  if (!isFiniteVec(position) || rows.length !== 9 || !rows.every(Number.isFinite)) invariant('destructionCamera', 'must give a finite position and nine finite row values');
  return Object.freeze({ position: frozenVec(position), rows: Object.freeze([...rows]) as unknown as Matrix3 });
}

class Presentation implements FlightPresentation {
  readonly ownerId: number;
  readonly runId: number;
  readonly #subset: ExplosionSubset;
  readonly #random: RandSource;
  readonly #effects: PresentationEffects | null;
  readonly #destructionCamera: DestructionCamera | null;
  readonly #extraKeys = new KeySequence<ExtraExplosionKey>('extra');
  readonly #fragmentExplosionKeys = new KeySequence<FragmentExplosionKey>('fragment-explosion');
  readonly #fragmentKeys = new KeySequence<FragmentKey>('fragment');
  /** The kept choices by key, in activation order, at most PRESENTATION_LIMITS.selections. */
  readonly #live = new Map<ExplosionKey, LiveExplosion>();
  /** Each reserved object slot, at most PRESENTATION_LIMITS.objects, with the key of the explosion that holds it. */
  readonly #slots = new Map<PresentationObjectSlot, ExplosionKey | null>();
  /** Run-wide histories: every key activates once, and each extra ordinal and fragment explodes once. */
  readonly #activatedCore = new Set<CoreExplosionKey>();
  readonly #extraOrigins = new Set<string>();
  /** Every issued fragment key, and whether it has exploded. */
  readonly #fragments = new Map<FragmentKey, boolean>();
  readonly #listeners = new Map<number, PresentationListener>();
  #nextListener = 0;
  /** `explosions()` after the last processed tick. */
  #explosions: readonly PresentationExplosion[] = Object.freeze([]);
  #camera: PresentationCamera;
  #clock: number;
  #state: 'ready' | 'failed' | 'disposed' = 'ready';

  constructor({ ownerId, runId, content, initial, random, effects, destructionCamera }: FlightPresentationInput) {
    if (!isSafeCount(ownerId)) invalidInput('ownerId', 'must be a non-negative safe integer');
    if (!isSafeCount(runId)) invalidInput('runId', 'must be a non-negative safe integer');
    if (initial.tick !== 0) invalidInput('initial.tick', 'must be 0: a module starts with its run');
    checkPresentationContent(content);
    this.ownerId = ownerId;
    this.runId = runId;
    this.#random = random;
    this.#effects = effects ?? null;
    this.#destructionCamera = destructionCamera ?? null;
    this.#subset = drawExplosionSubset(content.explosions, random);
    const { viewMode, subMode } = initial;
    const start: PresentationCamera = Object.freeze({ tick: 0, ...INITIAL_CAMERA_POSE, viewMode, subMode, viewport: presentationViewport(viewMode, subMode) });
    this.#camera = this.#cameraAfter({ tick: 0, clock: initial.clock, render: initial, events: [], beforeStep: start });
    this.#clock = initial.clock;
  }

  camera(): PresentationCamera {
    this.#require('camera');
    return this.#camera;
  }

  explosions(): readonly PresentationExplosion[] {
    this.#require('explosions');
    return this.#explosions;
  }

  subscribe(listener: PresentationListener): () => void {
    this.#require('subscribe');
    if (typeof listener !== 'function') invalidInput('subscribe', 'needs a function');
    const id = this.#nextListener++;
    this.#listeners.set(id, listener);
    return () => {
      this.#listeners.delete(id);
    };
  }

  advance(frame: PresentationFrameInput): void {
    this.#require('advance');
    this.#check(frame);
    const ticks: PresentationTick[] = [];
    try {
      for (const output of frame.outputs) ticks.push(this.#step(output));
    } catch (error) {
      this.#state = 'failed';
      this.#listeners.clear();
      throw error;
    }
    this.#notify(ticks);
  }

  dispose(): void {
    if (this.#state === 'disposed') return;
    this.#state = 'disposed';
    this.#listeners.clear();
    this.#live.clear();
  }

  #require(operation: string): void {
    if (this.#state !== 'ready') throw new PresentationError('invalid-state', `${PATH}.${operation}`, `is not allowed once the module is ${this.#state}`);
  }

  /** Rejects, before any change, a frame of another owner or run, or ticks that do not continue from the last one. */
  #check({ ownerId, runId, outputs }: PresentationFrameInput): void {
    if (ownerId !== this.ownerId || runId !== this.runId) invalidInput('frame', `belongs to owner ${ownerId}, run ${runId}, not owner ${this.ownerId}, run ${this.runId}`);
    if (!Array.isArray(outputs)) invalidInput('frame.outputs', 'must be an array');
    let expected = this.#camera.tick + 1;
    let clock = this.#clock;
    outputs.forEach(({ tick, clock: tickClock, render, events }: PresentationTickInput, at: number) => {
      const path = `frame.outputs[${at}]`;
      if (tick !== expected) invalidInput(`${path}.tick`, `must be ${expected}: ticks continue from the last processed one without a gap`);
      if (render?.tick !== tick || render.clock !== tickClock) invalidInput(`${path}.render`, 'must be the Render State of its tick');
      if (!isSafeCount(tickClock) || tickClock < clock) invalidInput(`${path}.clock`, 'must not go back');
      if (!Array.isArray(events)) invalidInput(`${path}.events`, 'must be an array');
      expected++;
      clock = tickClock;
    });
  }

  #cameraAfter(step: PresentationStep): PresentationCamera {
    const destruction = destructionPose(this.#destructionCamera?.step(step) ?? null);
    return cameraAfterStep(step.render, step.beforeStep, destruction);
  }

  #step({ tick, clock, render, events: deliveries }: PresentationTickInput): PresentationTick {
    const events: readonly DomainEvent[] = Object.freeze(deliveries.map(({ event }) => event));
    const beforeStep = this.#camera;
    const afterStep = this.#cameraAfter({ tick, clock, render, events, beforeStep });
    this.#camera = afterStep;
    this.#clock = clock;
    const core: ExplosionActivation[] = [];
    events.forEach((event, eventIndex) => {
      if (event.type === 'explosion-started') core.push(this.#activateCore(event, eventIndex, tick, beforeStep));
    });
    const activations = [...core];
    if (this.#effects !== null) this.#stepEffects(this.#effects, { tick, clock, render, events, beforeStep, afterStep }, Object.freeze(core), activations);
    this.#settleCore(render);
    this.#explosions = Object.freeze([...this.#live.values()].map(({ activation: { key, origin, sourceKindBit, variant, selection, tick: at, clock: since }, position, motion }) =>
      Object.freeze({ key, origin, sourceKindBit, variant, selection, activationTick: at, activationClock: since, position, ...(motion ?? invariant(key, 'has no movement block')) })));
    return Object.freeze({
      ownerId: this.ownerId, runId: this.runId, tick, clock, beforeStep, afterStep, activations: Object.freeze(activations), explosions: this.#explosions,
    });
  }

  #activateCore(event: ExplosionStartedEvent, eventIndex: number, tick: number, beforeStep: PresentationCamera): ExplosionActivation {
    const { entityId, sourceKindBit, variant, position, activationClock } = event;
    const key: CoreExplosionKey = `core:${entityId}`;
    if (this.#activatedCore.has(key)) invariant(`events[${eventIndex}]`, `activates explosion ${entityId} a second time in the run`);
    this.#activatedCore.add(key);
    const origin: ExplosionOrigin = Object.freeze({ type: 'core', entityId, eventIndex });
    return this.#activate(key, origin, sourceKindBit, variant, position, null, null, { tick, clock: activationClock, beforeStep });
  }

  /** Chooses once and keeps the choice, after checking the selection budget. */
  #activate(key: ExplosionKey, origin: ExplosionOrigin, sourceKindBit: number | null, variant: ExplosionActivation['variant'], position: Vec3,
    motion: ExplosionMotion | null, slot: PresentationObjectSlot | null, { tick, clock, beforeStep }: ActivationTime): ExplosionActivation {
    checkCapacity(this.#live.size, PRESENTATION_LIMITS.selections, `${PATH}.selections`);
    const at = frozenVec(position);
    const selection = selectExplosion(this.#subset, variant, at, beforeStep.position, this.#random);
    const activation: ExplosionActivation = Object.freeze({ key, origin, sourceKindBit, variant, selection, tick, clock, position: at });
    this.#live.set(key, { activation, slot, position: at, motion });
    return activation;
  }

  /** Steps the effects; their requests are honoured only during the step. */
  #stepEffects(effects: PresentationEffects, step: PresentationStep & { readonly afterStep: PresentationCamera },
    core: readonly ExplosionActivation[], activations: ExplosionActivation[]): void {
    let open = true;
    const during = (operation: string): void => {
      if (!open) invariant(`effects.${operation}`, 'is only allowed during the effects step');
    };
    const own = (key: string, operation: string): { live: LiveExplosion; slot: PresentationObjectSlot } => {
      during(operation);
      const live = this.#live.get(key as ExplosionKey);
      if (live?.slot == null) return invariant(`effects.${operation}`, `names ${key}, which is no live presentation explosion`);
      return { live, slot: live.slot };
    };
    const free = (slot: PresentationObjectSlot, operation: string): void => {
      during(operation);
      if (this.#slots.get(slot) !== null) invariant(`effects.${operation}`, 'needs a reserved slot no explosion holds');
    };
    try {
      const result: unknown = effects.step({
        ...step,
        activations: core,
        random: this.#random,
        reserveObject: () => {
          during('reserveObject');
          checkCapacity(this.#slots.size, PRESENTATION_LIMITS.objects, `${PATH}.objects`);
          const slot = Object.freeze({}) as PresentationObjectSlot;
          this.#slots.set(slot, null);
          return slot;
        },
        releaseObject: (slot) => {
          free(slot, 'releaseObject');
          this.#slots.delete(slot);
        },
        nextFragmentKey: () => {
          during('nextFragmentKey');
          const key = this.#fragmentKeys.next();
          this.#fragments.set(key, false);
          return key;
        },
        activate: (request: PresentationActivationRequest) => {
          free(request.slot, 'activate');
          const activation = this.#activatePresentation(request, step);
          this.#slots.set(request.slot, activation.key);
          activations.push(activation);
          return activation;
        },
        move: (key, position) => {
          const { live } = own(key, 'move');
          if (!isFiniteVec(position)) invariant('effects.move', 'needs a finite position');
          live.position = frozenVec(position);
        },
        end: (key) => {
          const { slot } = own(key, 'end');
          this.#live.delete(key);
          this.#slots.delete(slot);
        },
      });
      if (typeof (result as { then?: unknown } | null | undefined)?.then === 'function') invariant('effects.step', 'must be synchronous');
    } finally {
      open = false;
    }
  }

  #activatePresentation({ origin, variant, position, motion: { forward, speed }, slot }: PresentationActivationRequest, at: ActivationTime): ExplosionActivation {
    if (!isFiniteVec(position)) invariant('effects.activate', 'needs a finite position');
    if (!isFiniteVec(forward) || !Number.isFinite(speed)) invariant('effects.activate', 'needs a finite movement block');
    const motion: ExplosionMotion = Object.freeze({ forward: frozenVec(forward), speed });
    if (origin.type === 'extra') {
      const { parentExplosionKey, ordinal } = origin;
      if (!this.#activatedCore.has(parentExplosionKey)) invariant('effects.activate', `names ${parentExplosionKey}, which is no activated Core explosion of this run`);
      if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal > 4) invariant('effects.activate', 'needs an ordinal from 0 to 4');
      if (variant !== 'large' && variant !== 'other') invariant('effects.activate', 'needs a large or other extra explosion');
      const extra = `${parentExplosionKey}/${ordinal}`;
      if (this.#extraOrigins.has(extra)) invariant('effects.activate', `activates extra ${ordinal} of ${parentExplosionKey} a second time`);
      this.#extraOrigins.add(extra);
      return this.#activate(this.#extraKeys.next(), Object.freeze({ type: 'extra', parentExplosionKey, ordinal }), null, variant, position, motion, slot, at);
    }
    if (origin.type === 'fragment') {
      const { fragmentKey } = origin;
      const exploded = this.#fragments.get(fragmentKey);
      if (exploded === undefined) invariant('effects.activate', `names ${fragmentKey}, which was never issued`);
      if (exploded) invariant('effects.activate', `explodes ${fragmentKey} a second time`);
      if (variant !== 'other') invariant('effects.activate', 'needs an other explosion for a fragment');
      this.#fragments.set(fragmentKey, true);
      return this.#activate(this.#fragmentExplosionKeys.next(), Object.freeze({ type: 'fragment', fragmentKey }), FRAGMENT_KIND_BIT, variant, position, motion, slot, at);
    }
    return invariant('effects.activate', 'needs an extra or fragment origin');
  }

  /**
   * Gives the kept Core explosions their position and movement block (`orientation` 6–8 and `speed`, FA-04) at the
   * tick's end, and drops those that left the Render State.
   */
  #settleCore({ entities }: RenderState): void {
    let listed: ReadonlyMap<EntityId, RenderEntity> | null = null;
    for (const [key, live] of this.#live) {
      const { origin } = live.activation;
      if (origin.type !== 'core') continue;
      listed ??= new Map(entities.map((entity) => [entity.id, entity] as const));
      const entity = listed.get(origin.entityId);
      if (entity === undefined) {
        this.#live.delete(key);
        continue;
      }
      live.position = entity.position;
      live.motion = Object.freeze({ forward: rowOf(entity.orientation, 2), speed: entity.speed });
    }
  }

  #notify(ticks: readonly PresentationTick[]): void {
    if (ticks.length === 0) return;
    const listeners = [...this.#listeners];
    const errors: unknown[] = [];
    for (const tick of ticks) {
      for (const [id, listener] of listeners) {
        if (!this.#listeners.has(id)) continue;
        try {
          listener(tick);
        } catch (error) {
          errors.push(error);
        }
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'presentation listeners failed');
  }
}

/**
 * A run's presentation random source from the host's uint32 seed: a stream of its own, so presentation draws never
 * touch the world RNG. Draw order need not match the original's, only each draw's support and mapping.
 */
export function presentationRandom(seed: number): RandSource {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) invalidInput('seed', 'must be a uint32');
  return new RandStream(seed);
}

export function createFlightPresentation(input: FlightPresentationInput): FlightPresentation {
  return new Presentation(input);
}
