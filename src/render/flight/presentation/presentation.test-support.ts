import type { AssetId } from '../../../content/asset-id.ts';
import type { ExplosionAnimation } from '../../../content/flight/flight-data-content.ts';
import { readExplosionAnimation, readExplosionTable, readNebulaBackgrounds } from '../../../content/flight/flight-data-readers.ts';
import { syntheticExplosionAnimation, syntheticExplosionTable, syntheticNebulaBackgrounds } from '../../../content/flight/flight-data.test-support.ts';
import type { DomainEvent, ExplosionStartedEvent, Vec3 } from '../../../core/contracts/domain-events.ts';
import type { RenderEntity, RenderState } from '../../../core/projections/render-state.ts';
import type { EntityId, ExplosionVariant, Matrix3 } from '../../../core/world/entity-table.ts';
import type { PresentationContent } from './explosion-selection.ts';
import { INITIAL_CAMERA_POSE } from './presentation-camera.ts';
import type { PresentationFrameInput, PresentationTickInput } from './presentation-contract.ts';

// Code-generated synthetic Render States, events and content for the presentation tests; never original data.

export const IDENTITY: Matrix3 = INITIAL_CAMERA_POSE.rows;
export const vec = (x: number, y = 0, z = 0): Vec3 => Object.freeze({ x, y, z });
/** The synthetic run's clock step. */
export const CLOCK_STEP = 2;

/**
 * The synthetic table (lists of 3, 2 and 1 entries) read by the canonical reader, its animations with `frames` frames
 * each (the synthetic animation's 3 by default), and the synthetic nebula list.
 */
export function presentationContent({ table = syntheticExplosionTable() as unknown, frames = new Map<string, number>() } = {}): PresentationContent {
  const explosions = readExplosionTable(table);
  const animations = new Map<AssetId, ExplosionAnimation>();
  const base = syntheticExplosionAnimation();
  for (const { animation: { id } } of explosions.lists.flat()) {
    const count = frames.get(id) ?? base.frames.length;
    animations.set(id, readExplosionAnimation({ frames: Array.from({ length: count }, (_, at) => base.frames[at % base.frames.length]) }));
  }
  return { explosions, animations, nebula: readNebulaBackgrounds(syntheticNebulaBackgrounds()) };
}

export interface EntityOptions {
  readonly position?: Vec3;
  readonly orientation?: Matrix3;
  readonly explosion?: ExplosionVariant;
  /** The movement block's speed, runtime units/s. */
  readonly speed?: number;
}

export function renderEntity(id: number, { position = vec(0), orientation = IDENTITY, explosion, speed = 0 }: EntityOptions = {}): RenderEntity {
  return Object.freeze({
    id: id as EntityId,
    kindBit: explosion === undefined ? 1 : 22,
    presentation: explosion === undefined ? Object.freeze({ type: 'model', model: 'model/synthetic' as AssetId }) : Object.freeze({ type: 'explosion', variant: explosion }),
    position,
    orientation,
    placementSerial: 0,
    hitShimmerStart: null,
    explosionStart: null,
    inWarp: false,
    sourceKindBit: explosion === undefined ? null : 3,
    display: 'shown',
    state: 'active',
    speed,
  });
}

export interface RenderOptions {
  readonly viewMode?: number;
  readonly subMode?: number;
  readonly observedEntityId?: number | null;
  readonly entities?: readonly RenderEntity[];
}

export function renderState(tick: number, { viewMode = 0x0c, subMode = 0, observedEntityId = null, entities = [] }: RenderOptions = {}): RenderState {
  return Object.freeze({
    tick,
    clock: tick * CLOCK_STEP,
    viewMode,
    observedEntityId: observedEntityId as EntityId | null,
    entities: Object.freeze([...entities]),
    warp: null,
    subMode,
    followedEntityId: null,
    activeAreaCentre: null,
    speedShare: 0,
  });
}

export function explosionStarted(tick: number, entityId: number, variant: ExplosionVariant, position: Vec3): ExplosionStartedEvent {
  return Object.freeze({
    type: 'explosion-started', tick, entityId: entityId as EntityId, sourceEntityId: 1000 as EntityId, sourceKindBit: 3, variant,
    position, activationClock: tick * CLOCK_STEP,
  });
}

/** An event no presentation rule reads. */
export const otherEvent = (tick: number): DomainEvent => Object.freeze({ type: 'energy-depleted', tick }) as unknown as DomainEvent;

export function tickInput(render: RenderState, events: readonly DomainEvent[] = []): PresentationTickInput {
  return Object.freeze({ tick: render.tick, clock: render.clock, render, events: Object.freeze(events.map((event) => Object.freeze({ event, commandId: null }))) });
}

export const frame = (outputs: readonly PresentationTickInput[], ownerId = 1, runId = 1): PresentationFrameInput => ({ ownerId, runId, outputs });
