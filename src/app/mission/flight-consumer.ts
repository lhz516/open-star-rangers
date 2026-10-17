/**
 * The mission owner's flight picture (docs/plan/p3/12/spec.md: 渲染器生命周期; docs/plan/p3/04/spec.md: 消费者接线与释放):
 * an owner-level consumer at the `media` stage. Connecting creates the owner's one flight surface and its renderer, and
 * binds the package the owner bound, which the holder holds while the owner is created. Each run is wired at tick 0,
 * while held for its departure, to a presentation module of its own and the renderer (`wireFlightRun`), from that
 * package's content and scene settings, checked to be still held and decoded once, and a presentation seed drawn for
 * it; the run's end releases both.
 * Releasing the owner disposes the renderer and its surface after the session.
 *
 * Failures: a surface the device cannot provide (`GraphicsUnavailableError`) leaves an `unavailable` renderer and the
 * session runs; any other creation failure, an undo that failed included, fails the owner's creation. Content, seed,
 * binding or budget errors of a run fail its start, which the owner rolls back.
 */
import { contentIdentityKey } from '../../content/content-identity.ts';
import type { FlightRunBinding } from '../../render/flight/renderer/flight-gpu-cache.ts';
import { FlightRenderError } from '../../render/flight/renderer/flight-render-error.ts';
import { createFlightRenderer, type FlightRenderer, type FlightRendererOptions } from '../../render/flight/renderer/flight-renderer.ts';
import { wireFlightRun } from '../../render/flight/renderer/flight-run.ts';
import { GraphicsUnavailableError, type RenderSurface } from '../../render/scene/render-surface.ts';
import type { ResourceHolder } from '../resources/resource-holder.ts';
import { flightContentOf, type FlightContent } from './flight-content.ts';
import type { MissionConsumerConnection, MissionOwnerConsumer, MissionOwnerContext } from './mission-owner.ts';
import type { SeedSource } from './mission-ports.ts';

export interface FlightConsumerOptions {
  /** The owner's holder. */
  readonly holder: Pick<ResourceHolder, 'current'>;
  /**
   * Creates the owner's flight surface. Throws a GraphicsUnavailableError when the device provides no WebGL 2, leaving
   * nothing behind; a RollbackError says its failed creation could not be undone.
   */
  readonly createSurface: () => RenderSurface;
  /** Draws each run's presentation seed, a uint32. */
  readonly seed: SeedSource;
  readonly reportError: (error: unknown) => void;
}

export interface FlightConsumer extends MissionOwnerConsumer<'media'> {
  /** The renderer of the owner that connected this consumer; null before. */
  renderer(): FlightRenderer | null;
}


/** A consumer for one owner. */
export function createFlightConsumer({ holder, createSurface, seed, reportError }: FlightConsumerOptions): FlightConsumer {
  let renderer: FlightRenderer | null = null;
  const connect = ({ ownerId }: MissionOwnerContext): MissionConsumerConnection => {
    if (renderer) throw new TypeError('A flight consumer connects one owner');
    const held = holder.current();
    if (held?.completeness.status !== 'complete') throw new FlightRenderError('invalid-state', 'flightConsumer.package', 'needs a complete held package');
    const identity = contentIdentityKey(held.completeness.identity);
    let options: FlightRendererOptions;
    try {
      options = { ownerId, surface: createSurface(), reportError };
    } catch (error) {
      if (!(error instanceof GraphicsUnavailableError)) throw error;
      options = { ownerId, unavailable: error, reportError };
    }
    const created = createFlightRenderer(options);
    renderer = created;
    // Decoded once, by the first run that starts; a failed decoding is tried again by the next start.
    let content: FlightContent | null = null;
    return {
      release: () => { created.dispose(); },
      attachRun(run, { runId }) {
        // A held package never changes, so the same object is the same generation and content identity.
        if (holder.current() !== held) throw new FlightRenderError('invalid-state', 'flightConsumer.package', 'is no longer the package the owner bound');
        content ??= flightContentOf(held.groups);
        const binding: FlightRunBinding = { ownerId, runId, generation: held.generation, identity };
        wireFlightRun(run, { renderer: created, binding, content: content.presentation, settings: content.settings, seed: seed() });
      },
    };
  };
  return Object.freeze({ stage: 'media', renderer: () => renderer, connect });
}
