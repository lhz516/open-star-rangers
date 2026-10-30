/**
 * The presentation effects of one run (docs/plan/p3/12/spec.md, 表现层效果与会话级选择者; docs/plan/p3/02/spec.md,
 * FS-03, FS-05 and FS-07; docs/original/formats/executable.md, X2–X5, X7, X9 and PV7): the extra explosions of craft
 * explosions, event 0x10 with its discriminator-1/2 fragments, the explosions of flagged fragments, and the flash check.
 * It joins the flight presentation through its `effects` seam, which steps it once per tick after the tick's Core
 * activations; nothing here enters Core, a snapshot or a replay.
 *
 * Each tick is replayed in the original's pass order (PV7), with the clock of the tick as the sample:
 * 1. **Construction:** each `explosion-created` of a craft source makes its extras with the camera before the step;
 *    they wait for their first callback, in the same tick when built in object update, otherwise in the next (X9).
 * 2. **Object update:** a craft explosion's first callback is its activation tick (`explosion-started`); it sets the
 *    fragment events 0xC and 0x10 later, gated with the camera before the step, its position before any move and the
 *    viewport as the previous tick left it or a mission-flow switch of this tick set it. A craft explosion still active
 *    at the previous tick's end posts its due events. Extras draw their delay at their first callback; fragments set
 *    their expiry at theirs and become active; anything in state 6 leaves.
 * 3. **Request handling:** a craft explosion's first update (the tick after its activation) runs the flash check with
 *    its position after that move; extras whose delay has passed, and fragment explosions at their first callback,
 *    activate; active presentation explosions update (release of the held fragment, removal); due events produce
 *    fragments at the explosion's position and with its velocity as the previous tick ended it; due expiries explode a
 *    flagged fragment, which then drifts as the explosion's held source, or remove it.
 * 4. **Movement:** active explosions drift, active and held fragments spin; nothing moves in the tick it is made.
 * 5. **Area check:** active presentation objects outside the run's active area (FS-01) are removed, never by the camera.
 */
import type { DomainEvent, ExplosionCreatedEvent, Vec3 } from '../../../../core/contracts/domain-events.ts';
import type { RenderEntity } from '../../../../core/projections/render-state.ts';
import { isWithinActiveArea } from '../../../../core/rules/active-area.ts';
import { explosionFrame } from '../../../../core/rules/explosions.ts';
import { motionStep, type MotionStep } from '../../../../core/rules/flight-motion.ts';
import { isLargeKind, spinFragment } from '../../../../core/rules/fragments.ts';
import { linearBlock, linearItem, rowOf } from '../../../../core/rules/movement-builders.ts';
import type { EntityId, Matrix3 } from '../../../../core/world/entity-table.ts';
import { checkPresentationContent, type PresentationContent } from '../explosion-selection.ts';
import { PresentationError } from '../presentation-budget.ts';
import { presentationViewport } from '../presentation-camera.ts';
import type {
  CoreExplosionKey, ExplosionActivation, ExplosionMotion, ExtraExplosionKey, FragmentExplosionKey, FragmentKey, PresentationActivationRequest,
  PresentationEffects, PresentationEffectsStep, PresentationObjectSlot, PresentationViewport,
} from '../presentation-contract.ts';
import {
  explosionSpeed, extraActivationDelay, extraExplosionPositions, FRAGMENT_EVENT_DELAYS, fragmentEventCount, fragmentInit, fragmentLifetime,
  flashChecks, isCraftKind, keptFragmentEvents, type FragmentDiscriminator, type FragmentEventMode, type FragmentInit,
} from './effect-rules.ts';

/** An explosion asks for its removal at the first update with the clock past its activation + 0x60 (X4). */
const REMOVAL_DELAY = 0x60;
/**
 * How many of the latest ticks keep their flash requests: one frame's ticks at most (FS-07: MAX_TICKS_PER_FRAME), so a
 * subscriber of the frame's PresentationTicks reads each of them.
 */
export const FLASH_REQUEST_TICKS = 5;

const PATH = 'presentation.effects';

function invariant(path: string, reason: string): never {
  throw new PresentationError('invariant-violated', `${PATH}.${path}`, reason);
}

/** A screen-flash request of `0x24314` (item (2, 6) on the player): screen flash 1 starts at this tick's render (SF2). */
export interface ExplosionFlashRequest {
  readonly tick: number;
  readonly clock: number;
  readonly explosionKey: CoreExplosionKey;
  readonly sourceKindBit: number;
}

/** As Render State's `display`: `pending` before the first move, `shown` while active or held, `released` in state 6. */
export type FragmentDisplay = 'pending' | 'shown' | 'released';

/** One discriminator-1/2 fragment that has not left, at the end of the last processed tick. */
export interface PresentationFragment {
  readonly key: FragmentKey;
  readonly discriminator: FragmentDiscriminator;
  /** Discriminator 2's index i (MODL 10383's list-1 part is i mod its count); null for discriminator 1. */
  readonly part: number | null;
  /** Discriminator 1's TEX 10151 shape, 0 or 1; null for discriminator 2. */
  readonly shape: 0 | 1 | null;
  readonly explodesOnExpiry: boolean;
  /** The Core explosion whose event made it, and that explosion's source kind. */
  readonly parentExplosionKey: CoreExplosionKey;
  readonly sourceKindBit: number;
  readonly display: FragmentDisplay;
  readonly position: Vec3;
  readonly rows: Matrix3;
  readonly createdTick: number;
  /** Its first state-7 tick, which is also its first move; null before. */
  readonly activeTick: number | null;
  /** Its explosion once activated: the fragment is that explosion's held source until released. */
  readonly explosionKey: FragmentExplosionKey | null;
  /** The tick it went to state 6 (expiry, release by its explosion or the area check); it leaves at the next. */
  readonly releasedTick: number | null;
}

/** The effects seam, and what the renderer reads of it. */
export interface FlightPresentationEffects extends PresentationEffects {
  /** Fragments that have not left, in creation order. */
  fragments(): readonly PresentationFragment[];
  /** The flash requests of `tick`, one of the latest FLASH_REQUEST_TICKS processed ticks. */
  flashRequests(tick: number): readonly ExplosionFlashRequest[];
}

export interface PresentationEffectsInput {
  /** The run's checked content: the frame count of lists 1 and 2 times the presentation explosions. */
  readonly content: PresentationContent;
}

/** A craft source's Core explosion, from `explosion-created` until its last fragment event and flash check. */
interface CraftExplosion {
  readonly key: CoreExplosionKey;
  readonly entityId: EntityId;
  readonly sourceKindBit: number;
  readonly velocity: Vec3;
  readonly firstCallbackTick: number;
  readonly extras: EffectExplosion[];
  activated: boolean;
  /** Due clocks of the kept events, in posting order. */
  events: { readonly mode: FragmentEventMode; readonly due: number }[];
  flashPending: boolean;
}

type Origin = PresentationActivationRequest['origin'];
type ExplosionPhase = 'new' | 'waiting' | 'active' | 'released';

/** An extra explosion or a fragment's explosion, from its construction until it leaves. */
interface EffectExplosion {
  readonly origin: Origin;
  readonly variant: 'large' | 'other';
  readonly slot: PresentationObjectSlot;
  readonly firstCallbackTick: number;
  /** Its mode-1 drift: the Core explosion's for an extra (X3), F(R2′ × s) from its fragment's frame otherwise. */
  readonly velocity: Vec3;
  /**
   * The R2 and speed of that block (P3-14 DW-02): the Core explosion's at its construction for an extra, R2′ and s for
   * a fragment's. Null only for the extras of a Core explosion the Render State did not list at its construction, which
   * leave at their first callback without activating.
   */
  readonly motion: ExplosionMotion | null;
  position: Vec3;
  phase: ExplosionPhase;
  due: number | null;
  key: ExtraExplosionKey | FragmentExplosionKey | null;
  activationClock: number;
  held: EffectFragment | null;
}

type FragmentPhase = 'new' | 'active' | 'held' | 'released';

interface EffectFragment {
  readonly key: FragmentKey;
  readonly init: FragmentInit;
  readonly parentExplosionKey: CoreExplosionKey;
  readonly sourceKindBit: number;
  readonly slot: PresentationObjectSlot;
  readonly createdTick: number;
  position: Vec3;
  rows: Matrix3;
  phase: FragmentPhase;
  expiry: number | null;
  activeTick: number | null;
  explosion: EffectExplosion | null;
  releasedTick: number | null;
}

/** The viewport the gate reads: the previous tick's, or the one a mission-flow switch of this tick set (PV7, FS-05). */
function gateViewport(events: readonly DomainEvent[], previous: PresentationViewport): PresentationViewport {
  let viewport = previous;
  for (const event of events) {
    if (event.type === 'view-switched' && event.stage === 'mission-flow') viewport = presentationViewport(event.viewMode, event.subMode);
  }
  return viewport;
}

/** `value` + `delay` as a tick or clock; past the safe integers is a capacity fault, before anything changes. */
function after(value: number, delay: number, path: string): number {
  const sum = value + delay;
  if (!Number.isSafeInteger(sum)) throw new PresentationError('presentation-capacity', `${PATH}.${path}`, 'ran out of safe integers');
  return sum;
}

class Effects implements FlightPresentationEffects {
  /** The frame count n₁₂ of every list-1 and list-2 animation (checked equal). */
  readonly #frames: number;
  readonly #crafts = new Map<EntityId, CraftExplosion>();
  /** Compacted in place at each object update. */
  readonly #explosions: EffectExplosion[] = [];
  readonly #fragments: EffectFragment[] = [];
  readonly #flashes = new Map<number, readonly ExplosionFlashRequest[]>();
  #previous: { readonly tick: number; readonly clock: number; readonly entities: readonly RenderEntity[] } | null = null;

  constructor({ content }: PresentationEffectsInput) {
    checkPresentationContent(content);
    const [first] = content.explosions.lists[0];
    this.#frames = content.animations.get(first.animation.id)?.frames.length ?? invariant('content', 'lacks the list-1 animation');
  }

  fragments(): readonly PresentationFragment[] {
    return Object.freeze(this.#fragments.map((fragment) => {
      const { key, init: { discriminator, part, shape, explodesOnExpiry }, parentExplosionKey, sourceKindBit, position, rows, createdTick, activeTick, releasedTick } = fragment;
      const display: FragmentDisplay = fragment.phase === 'new' ? 'pending' : fragment.phase === 'released' ? 'released' : 'shown';
      const explosionKey = (fragment.explosion?.key ?? null) as FragmentExplosionKey | null;
      return Object.freeze({
        key, discriminator, part, shape, explodesOnExpiry, parentExplosionKey, sourceKindBit, display, position, rows, createdTick, activeTick, explosionKey, releasedTick,
      });
    }));
  }

  flashRequests(tick: number): readonly ExplosionFlashRequest[] {
    const requests = this.#flashes.get(tick);
    if (requests === undefined) throw new PresentationError('invalid-input', `${PATH}.flashRequests`, `keeps only the latest ${FLASH_REQUEST_TICKS} processed ticks, not tick ${tick}`);
    return requests;
  }

  step(step: PresentationEffectsStep): void {
    const previous = this.#previous;
    if (previous !== null && step.tick !== previous.tick + 1) invariant('step', `must follow tick ${previous.tick}, not tick ${step.tick}`);
    const motion = previous === null ? null : motionStep(step.clock - previous.clock, step.clock);
    // The previous tick's end, which the callbacks of craft explosions read.
    const before = new Map(this.#crafts.size === 0 ? [] : previous?.entities.map((entity) => [entity.id, entity] as const));
    const flashes: ExplosionFlashRequest[] = [];

    this.#construct(step);
    const due = this.#objectUpdate(step, before, flashes);
    this.#requestHandling(step, due);
    this.#move(step, motion);
    this.#checkArea(step);

    this.#flashes.set(step.tick, Object.freeze(flashes));
    this.#flashes.delete(step.tick - FLASH_REQUEST_TICKS);
    this.#previous = { tick: step.tick, clock: step.clock, entities: step.render.entities };
  }

  /** 1: the extras of each craft explosion built this tick, with the camera before the step. */
  #construct(step: PresentationEffectsStep): void {
    for (const event of step.events) {
      if (event.type !== 'explosion-created' || !isCraftKind(event.sourceKindBit)) continue;
      if (this.#crafts.has(event.entityId)) invariant('explosion-created', `builds explosion ${event.entityId} a second time`);
      this.#crafts.set(event.entityId, this.#craftExplosion(step, event));
    }
  }

  #craftExplosion(step: PresentationEffectsStep, { entityId, sourceKindBit, stage, position, velocity }: ExplosionCreatedEvent): CraftExplosion {
    const key: CoreExplosionKey = `core:${entityId}`;
    const firstCallbackTick = stage === 'object-update' ? step.tick : after(step.tick, 1, 'first-callback');
    const variant = isLargeKind(sourceKindBit) ? 'large' : 'other';
    // X3 builds each extra's block as the Core explosion's (X2 step 5), which its mode-1 drift never changes.
    const core = step.render.entities.find(({ id }) => id === entityId);
    const motion: ExplosionMotion | null = core === undefined ? null : Object.freeze({ forward: rowOf(core.orientation, 2), speed: core.speed });
    const extras = extraExplosionPositions(sourceKindBit, position, step.beforeStep, step.random).map((at, ordinal): EffectExplosion => {
      const extra: EffectExplosion = {
        origin: { type: 'extra', parentExplosionKey: key, ordinal: ordinal as 0 | 1 | 2 | 3 | 4 }, variant, slot: step.reserveObject(), firstCallbackTick,
        velocity, motion, position: at, phase: 'new', due: null, key: null, activationClock: 0, held: null,
      };
      this.#explosions.push(extra);
      return extra;
    });
    return { key, entityId, sourceKindBit, velocity, firstCallbackTick, extras, activated: false, events: [], flashPending: false };
  }

  /** 2: the callbacks; returns the requests they post for request handling. */
  #objectUpdate(step: PresentationEffectsStep, before: ReadonlyMap<EntityId, RenderEntity>, flashes: ExplosionFlashRequest[]): Due {
    const due: Due = { activations: [], updates: [], events: [], expiries: [] };
    this.#craftCallbacks(step, before, flashes, due);
    // Fragments first, so one its explosion releases in this tick leaves only at the next.
    let kept = 0;
    for (const fragment of this.#fragments) {
      if (fragment.phase === 'released') {
        step.releaseObject(fragment.slot);
        continue;
      }
      this.#fragments[kept++] = fragment;
      if (fragment.phase === 'new' && fragment.createdTick < step.tick) {
        fragment.expiry = after(step.clock, fragmentLifetime(fragment.init.discriminator, step.random), 'expiry');
        fragment.phase = 'active';
        fragment.activeTick = step.tick;
      } else if (fragment.phase === 'active' && fragment.expiry !== null && fragment.expiry <= step.clock) {
        fragment.expiry = null;
        due.expiries.push(fragment);
      }
    }
    this.#fragments.length = kept;
    kept = 0;
    for (const explosion of this.#explosions) {
      if (explosion.phase === 'released') {
        // Its own callback in state 6 lets the held fragment go (message 0x40) and leaves.
        if (explosion.held !== null) this.#release(explosion.held, step.tick);
        continue;
      }
      this.#explosions[kept++] = explosion;
      if (explosion.phase === 'new' && explosion.firstCallbackTick === step.tick) {
        // The first callback draws an extra's delay, then asks for state 7 at once if it has passed, as later ones do.
        explosion.phase = 'waiting';
        explosion.due = explosion.origin.type === 'extra' ? after(step.clock, extraActivationDelay(step.random), 'delay') : null;
      }
      if (explosion.phase === 'waiting' && (explosion.due === null || step.clock > explosion.due)) due.activations.push(explosion);
      else if (explosion.phase === 'active') due.updates.push(explosion);
    }
    this.#explosions.length = kept;
    return due;
  }

  /** The craft explosions' first callbacks (the gate) and state-7 callbacks (due events and the first update's flash). */
  #craftCallbacks(step: PresentationEffectsStep, before: ReadonlyMap<EntityId, RenderEntity>, flashes: ExplosionFlashRequest[], due: Due): void {
    for (const craft of this.#crafts.values()) {
      if (!craft.activated) {
        if (craft.firstCallbackTick === step.tick) {
          const { entityId } = craft;
          this.#firstCallback(step, craft, step.activations.find(({ origin }) => origin.type === 'core' && origin.entityId === entityId));
        }
        continue;
      }
      const entity = before.get(craft.entityId);
      if (entity?.display !== 'shown') {
        // Out of state 7 (removed by the area check): no callback posts events or updates any more.
        this.#crafts.delete(craft.entityId);
        continue;
      }
      if (craft.flashPending) {
        craft.flashPending = false;
        if (flashChecks(craft.sourceKindBit, entity.position, step.beforeStep)) {
          flashes.push(Object.freeze({ tick: step.tick, clock: step.clock, explosionKey: craft.key, sourceKindBit: craft.sourceKindBit }));
        }
      }
      const posted = craft.events.filter((event) => event.due <= step.clock);
      craft.events = craft.events.filter((event) => event.due > step.clock);
      for (const { mode } of posted) due.events.push({ craft, mode, explosion: entity });
      if (craft.events.length === 0) this.#crafts.delete(craft.entityId);
    }
    for (const activation of step.activations) {
      const { origin, sourceKindBit } = activation;
      if (origin.type === 'core' && sourceKindBit !== null && isCraftKind(sourceKindBit) && this.#crafts.get(origin.entityId)?.activated !== true) {
        invariant('explosion-started', `starts ${activation.key} in tick ${step.tick}, not at the first callback its construction gives`);
      }
    }
  }

  /** A craft explosion's first callback: the activation of this tick, the fragment events and their gate (X4, X5). */
  #firstCallback(step: PresentationEffectsStep, craft: CraftExplosion, activation: ExplosionActivation | undefined): void {
    if (activation === undefined) {
      // Removed before its first callback (only a whole-world removal can do that): its extras go with it.
      if (step.render.entities.some(({ id }) => id === craft.entityId)) invariant('explosion-started', `misses ${craft.key} at its first callback in tick ${step.tick}`);
      for (const extra of craft.extras) {
        step.releaseObject(extra.slot);
        extra.phase = 'released';
      }
      this.#crafts.delete(craft.entityId);
      return;
    }
    craft.activated = true;
    craft.flashPending = true;
    const viewport = gateViewport(step.events, step.beforeStep.viewport);
    craft.events = keptFragmentEvents(craft.sourceKindBit, activation.position, step.beforeStep, viewport)
      .map((mode) => ({ mode, due: after(activation.clock, FRAGMENT_EVENT_DELAYS[mode], 'event') }));
  }

  /** 3: the requests, in the order the callbacks posted them by kind. */
  #requestHandling(step: PresentationEffectsStep, due: Due): void {
    for (const explosion of due.activations) {
      const { origin, variant, position, slot } = explosion;
      const motion = explosion.motion ?? invariant('activate', 'has no movement block of its Core explosion');
      const activation = step.activate({ origin, variant, position, motion, slot } as PresentationActivationRequest);
      explosion.key = activation.key as ExtraExplosionKey | FragmentExplosionKey;
      explosion.phase = 'active';
      explosion.activationClock = step.clock;
      explosion.due = null;
    }
    for (const explosion of due.updates) this.#update(explosion, step);
    for (const { craft, mode, explosion } of due.events) this.#produce(step, craft, mode, explosion);
    for (const fragment of due.expiries) this.#expire(step, fragment);
  }

  /** `0x2409c`'s update: at the animation's end the held fragment is released, and after +0x60 the explosion asks to leave. */
  #update(explosion: EffectExplosion, step: PresentationEffectsStep): void {
    const { tick, clock } = step;
    if (explosionFrame(clock, explosion.activationClock) < this.#frames) return;
    if (after(explosion.activationClock, REMOVAL_DELAY, 'removal') < clock) {
      this.#leave(explosion, step);
      return;
    }
    if (explosion.held !== null) this.#release(explosion.held, tick);
    explosion.held = null;
  }

  /** The producer for one due event: the fragments start where the explosion ended the previous tick, at its velocity. */
  #produce(step: PresentationEffectsStep, craft: CraftExplosion, mode: FragmentEventMode, explosion: RenderEntity): void {
    const count = fragmentEventCount(mode, craft.sourceKindBit, step.random);
    // The block keeps the explosion's speed s, the velocity's component along the explosion's R2 (velocity = F(R2 × s)).
    const speed = explosionSpeed(explosion.orientation, craft.velocity);
    for (let index = 0; index < count; index++) {
      const slot = step.reserveObject();
      const init = fragmentInit(mode, index, explosion.position, craft.velocity, speed, step.random);
      this.#fragments.push({
        key: step.nextFragmentKey(), init, parentExplosionKey: craft.key, sourceKindBit: craft.sourceKindBit, slot, createdTick: step.tick,
        position: init.position, rows: init.rows, phase: 'new', expiry: null, activeTick: null, explosion: null, releasedTick: null,
      });
    }
  }

  /** `0x256e4`: a flagged fragment becomes the held source of an `other` explosion; any other one goes to state 6. */
  #expire(step: PresentationEffectsStep, fragment: EffectFragment): void {
    if (!fragment.init.explodesOnExpiry) {
      this.#release(fragment, step.tick);
      return;
    }
    // R2′ is the fragment's frame completed with its velocity (`0x218e8`), s its block's speed.
    const item = linearItem(fragment.position, fragment.rows, fragment.init.block);
    const explosion: EffectExplosion = {
      origin: { type: 'fragment', fragmentKey: fragment.key }, variant: 'other', slot: step.reserveObject(), firstCallbackTick: after(step.tick, 1, 'first-callback'),
      velocity: linearBlock(item, false).velocity, motion: Object.freeze({ forward: rowOf(item.orientation, 2), speed: item.speed }), position: fragment.position,
      phase: 'new', due: null, key: null, activationClock: 0, held: fragment,
    };
    this.#explosions.push(explosion);
    fragment.phase = 'held';
    fragment.explosion = explosion;
  }

  /**
   * State 6 (`0x21650` or the area check): the explosion's visual goes in this tick's render (PV6), so it leaves the
   * presentation's query now; the object stays until its next callback, which releases a fragment it still holds.
   */
  #leave(explosion: EffectExplosion, step: PresentationEffectsStep): void {
    explosion.phase = 'released';
    step.end(liveKey(explosion));
  }

  #release(fragment: EffectFragment, tick: number): void {
    fragment.phase = 'released';
    fragment.releasedTick = tick;
  }

  /** 4: active explosions drift (`0x22818`), active and held fragments move and spin (`0x2285c`). */
  #move(step: PresentationEffectsStep, motion: MotionStep | null): void {
    for (const explosion of this.#explosions) {
      if (explosion.phase !== 'active') continue;
      explosion.position = drift(explosion.position, explosion.velocity, motion ?? invariant('move', 'has no previous tick'));
      step.move(liveKey(explosion), explosion.position);
    }
    for (const fragment of this.#fragments) {
      if (fragment.phase !== 'active' && fragment.phase !== 'held') continue;
      const moved = spinFragment(fragment.position, fragment.rows, fragment.init.block, motion ?? invariant('move', 'has no previous tick'));
      fragment.position = moved.position;
      fragment.rows = moved.orientation;
    }
  }

  /** 5: the area check (`0x3a468`) on presentation objects in state 7, with the area centre the Render State gives. */
  #checkArea(step: PresentationEffectsStep): void {
    const { tick, render } = step;
    const centre = render.activeAreaCentre;
    for (const explosion of this.#explosions) {
      if (explosion.phase === 'active' && !isWithinActiveArea(centre, explosion.position)) this.#leave(explosion, step);
    }
    for (const fragment of this.#fragments) {
      if (fragment.phase === 'active' && !isWithinActiveArea(centre, fragment.position)) this.#release(fragment, tick);
    }
  }
}

/** The callbacks' requests for request handling. */
interface Due {
  readonly activations: EffectExplosion[];
  readonly updates: EffectExplosion[];
  readonly events: { readonly craft: CraftExplosion; readonly mode: FragmentEventMode; readonly explosion: RenderEntity }[];
  readonly expiries: EffectFragment[];
}

/** `0x22818`, an explosion's mode-1 move: F(v × step + P) per axis (projectile-motion.ts's moveLinear without a block). */
const drift = (position: Vec3, velocity: Vec3, { seconds }: MotionStep): Vec3 => Object.freeze({
  x: Math.fround(velocity.x * seconds + position.x),
  y: Math.fround(velocity.y * seconds + position.y),
  z: Math.fround(velocity.z * seconds + position.z),
});

function liveKey({ key }: EffectExplosion): ExtraExplosionKey | FragmentExplosionKey {
  return key ?? invariant('explosion', 'has no key before its activation');
}

export function createPresentationEffects(input: PresentationEffectsInput): FlightPresentationEffects {
  return new Effects(input);
}

