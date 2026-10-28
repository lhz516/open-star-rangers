import type { DomainEvent, ExplosionCreatedEvent, ExplosionStartedEvent, PipelineStageName, Vec3 } from '../../../../core/contracts/domain-events.ts';
import type { RenderDisplay, RenderEntity, RenderState } from '../../../../core/projections/render-state.ts';
import type { RandSource } from '../../../../core/rules/original-random.ts';
import type { EntityId, ExplosionVariant, Matrix3 } from '../../../../core/world/entity-table.ts';
import { createFlightPresentation, type FlightPresentation } from '../flight-presentation.ts';
import type { PresentationTick } from '../presentation-contract.ts';
import { CLOCK_STEP, frame, IDENTITY, presentationContent, renderEntity, renderState, tickInput, vec } from '../presentation.test-support.ts';
import { createPresentationEffects, type FlightPresentationEffects } from './presentation-effects.ts';

// Code-generated synthetic Render States and events for the effects tests; never original data.

export { IDENTITY, vec };

export const PLAYER = 1;

/** A rand source that gives queued values first, then `constant`, and counts its draws. */
export function controlledRand(constant: number): RandSource & { readonly used: number; queue(...values: number[]): void } {
  const queued: number[] = [];
  let used = 0;
  return {
    next() {
      used++;
      return queued.length > 0 ? queued.shift() as number : constant;
    },
    queue(...values) {
      queued.push(...values);
    },
    get used() {
      return used;
    },
  };
}

export interface ExplosionEntityOptions {
  readonly position?: Vec3;
  readonly orientation?: Matrix3;
  readonly sourceKindBit?: number;
  readonly display?: RenderDisplay;
  readonly variant?: ExplosionVariant;
}

/** A Core explosion as the Render State lists it. */
export function explosionEntity(id: number, { position = vec(0), orientation = IDENTITY, sourceKindBit = 7, display = 'shown', variant = 'other' }: ExplosionEntityOptions = {}): RenderEntity {
  return Object.freeze({ ...renderEntity(id, { position, orientation, explosion: variant }), sourceKindBit, display });
}

export const player = (position = vec(0), orientation = IDENTITY): RenderEntity => renderEntity(PLAYER, { position, orientation });

export interface CreatedOptions {
  readonly sourceKindBit?: number;
  readonly stage?: ExplosionCreatedEvent['stage'];
  readonly position?: Vec3;
  readonly velocity?: Vec3;
  readonly variant?: ExplosionVariant;
}

export function explosionCreated(tick: number, entityId: number, { sourceKindBit = 7, stage = 'collision', position = vec(0), velocity = vec(0), variant = 'other' }: CreatedOptions = {}): ExplosionCreatedEvent {
  return Object.freeze({
    type: 'explosion-created', tick, entityId: entityId as EntityId, sourceEntityId: 500 as EntityId, sourceKindBit, variant, stage, position, velocity,
  });
}

export function explosionStarted(tick: number, entityId: number, position: Vec3, { sourceKindBit = 7, variant = 'other' as ExplosionVariant } = {}): ExplosionStartedEvent {
  return Object.freeze({
    type: 'explosion-started', tick, entityId: entityId as EntityId, sourceEntityId: 500 as EntityId, sourceKindBit, variant, position, activationClock: tick * CLOCK_STEP,
  });
}

export function viewSwitched(tick: number, viewMode: number, subMode: number, stage: PipelineStageName): DomainEvent {
  return Object.freeze({ type: 'view-switched', tick, fromViewMode: 0x0c, fromSubMode: 0, viewMode, subMode, stage, player: null }) as DomainEvent;
}

export interface SceneOptions {
  readonly viewMode?: number;
  readonly subMode?: number;
  readonly activeAreaCentre?: Vec3 | null;
  /** The tick's clock, tick × 2 by default. */
  readonly clock?: number;
}

/** A tick's Render State: the given entities, the player observed, and the area centred on the origin by default. */
export function scene(tick: number, entities: readonly RenderEntity[], { viewMode = 0x0c, subMode = 0, activeAreaCentre = vec(0), clock = tick * CLOCK_STEP }: SceneOptions = {}): RenderState {
  return Object.freeze({ ...renderState(tick, { viewMode, subMode, observedEntityId: PLAYER, entities }), activeAreaCentre, clock });
}

/** One run's presentation with the effects, advanced one tick per frame. */
export class EffectsRun {
  readonly random: ReturnType<typeof controlledRand>;
  readonly effects: FlightPresentationEffects;
  readonly presentation: FlightPresentation;
  readonly ticks: PresentationTick[] = [];
  tick = 0;

  /** Every synthetic animation gets `frames` frames: 12 as every shipped list-1 and list-2 animation has. */
  constructor(constant = 1, frames = 12) {
    this.random = controlledRand(constant);
    const ids = [1, 2, 3, 4, 5].map((at) => `data/synthetic-animation/0${at}`);
    const content = presentationContent({ frames: new Map(ids.map((id) => [id, frames])) });
    this.effects = createPresentationEffects({ content });
    this.presentation = createFlightPresentation({ ownerId: 1, runId: 1, content, initial: scene(0, [player()]), random: this.random, effects: this.effects });
    this.presentation.subscribe((tick) => { this.ticks.push(tick); });
  }

  /** The next tick, with the player at the origin unless `entities` lists it. */
  step(entities: readonly RenderEntity[] = [], events: readonly DomainEvent[] = [], options: SceneOptions = {}): PresentationTick {
    this.tick++;
    const listed = entities.some(({ id }) => id === PLAYER) ? entities : [player(), ...entities];
    this.presentation.advance(frame([tickInput(scene(this.tick, listed, options), events)]));
    return this.ticks[this.ticks.length - 1];
  }

  /** Steps until (and including) `tick` with the same entities and no events. */
  stepTo(tick: number, entities: (tick: number) => readonly RenderEntity[] = () => [], options: SceneOptions = {}): void {
    while (this.tick < tick) this.step(entities(this.tick + 1), [], options);
  }
}
