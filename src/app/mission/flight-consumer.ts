/**
 * The mission owner's flight picture (docs/plan/p3/12/spec.md: 渲染器生命周期; docs/plan/p3/04/spec.md: 消费者接线与释放):
 * an owner-level consumer at the `media` stage. Connecting creates the owner's one flight surface and its renderer, and
 * binds the package the owner bound, which the holder holds while the owner is created. Each run is wired at tick 0,
 * while held for its departure, to a presentation module of its own, the renderer and its drawing passes
 * (`wireFlightRun`), from that package's content and scene settings, checked to be still held, decoded and prepared
 * once (`flightContentOf`, `prepareFlightContent`), and a presentation seed drawn for it; the run's end releases them.
 * Releasing the owner disposes the renderer and its surface after the session.
 *
 * The cockpit, HUD and map (docs/plan/p3/13/spec.md, 接线与生命周期, 地图输入几何与指针): the package's HUD content is
 * decoded and checked with the app's copy once (`cockpitContentOf`), bound to the package's generation and content
 * identity, and each run's cockpit is wired with it at tick 0 from the run's tick-0 projection. The consumer exposes the
 * map geometry of that content (`mapGeometry`, for the input's geometry port) and the current run's map presentation
 * cursor (`mapCursor`, the map input's production cursor), which the run's end withdraws; and the current run's cockpit
 * (`cockpit`), whose message line the base page bridges.
 *
 * Failures: a surface the device cannot provide (`GraphicsUnavailableError`) leaves an `unavailable` renderer and the
 * session runs, the cockpit advancing without a picture; any other creation failure, an undo that failed included,
 * fails the owner's creation. Content, copy, seed, binding or budget errors of a run fail its start, which the owner
 * rolls back.
 */
import { contentIdentityKey } from '../../content/content-identity.ts';
import type { FlightRunBinding } from '../../render/flight/renderer/flight-gpu-cache.ts';
import { prepareFlightContent, type PreparedFlightContent } from '../../render/flight/renderer/flight-passes.ts';
import { FlightRenderError } from '../../render/flight/renderer/flight-render-error.ts';
import { createFlightRenderer, type FlightRenderer, type FlightRendererOptions } from '../../render/flight/renderer/flight-renderer.ts';
import type { CockpitContent, CockpitRun } from '../../render/cockpit/composition/cockpit-run.ts';
import { mapPictureGeometry, type MapPictureGeometry } from '../../render/cockpit/map-picture/map-picture-geometry.ts';
import { wireFlightRun, type FlightRunMap } from '../../render/flight/renderer/flight-run.ts';
import type { MapCursorDrawer } from '../../render/map/map-cursor.ts';
import { GraphicsUnavailableError, type RenderSurface } from '../../render/scene/render-surface.ts';
import type { ResourceHolder } from '../resources/resource-holder.ts';
import { cockpitContentOf, type CockpitCopySource } from './cockpit-content.ts';
import { flightContentOf } from './flight-content.ts';
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
  /**
   * The cockpit's project copy and the map input's side of each run's map presentation; the app always gives it. Without
   * it, as in tests of the flight picture alone, runs have no cockpit.
   */
  readonly cockpit?: { readonly copy: CockpitCopySource; readonly map: FlightRunMap };
}

export interface FlightConsumer extends MissionOwnerConsumer<'media'> {
  /** The renderer of the owner that connected this consumer; null before. */
  renderer(): FlightRenderer | null;
  /** The map picture's geometry of the bound package's HUD content; null until a run prepared it. */
  mapGeometry(): MapPictureGeometry | null;
  /** The current run's map presentation cursor (`MapInputOptions.cursor`); null without a wired run. */
  mapCursor(): Pick<MapCursorDrawer, 'draw' | 'ready'> | null;
  /** The current run's cockpit; null without a wired run. */
  cockpit(): CockpitRun | null;
}

/** A consumer for one owner. */
export function createFlightConsumer({ holder, createSurface, seed, reportError, cockpit: links }: FlightConsumerOptions): FlightConsumer {
  let renderer: FlightRenderer | null = null;
  let mapGeometry: MapPictureGeometry | null = null;
  let current: { readonly cockpit: CockpitRun; readonly cursor: Pick<MapCursorDrawer, 'draw' | 'ready'> } | null = null;
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
    // Decoded and prepared once, by the first run that starts; a failure is tried again by the next start.
    let content: PreparedFlightContent | null = null;
    let hud: CockpitContent | null = null;
    return {
      release: () => { created.dispose(); },
      attachRun(run, { runId }) {
        // A held package never changes, so the same object is the same generation and content identity.
        if (holder.current() !== held) throw new FlightRenderError('invalid-state', 'flightConsumer.package', 'is no longer the package the owner bound');
        content ??= prepareFlightContent(flightContentOf(held.groups));
        const binding: FlightRunBinding = { ownerId, runId, generation: held.generation, identity };
        if (links) {
          hud ??= cockpitContentOf({ groups: held.groups, generation: held.generation, identity }, links.copy);
          mapGeometry = mapPictureGeometry(hud.mapGeometry);
        }
        const { cockpit } = wireFlightRun(run, {
          renderer: created, binding, content, seed: seed(),
          cockpit: links && hud ? { content: hud, copy: links.copy, projection: run.projection(), map: links.map } : undefined,
        });
        if (!cockpit) return;
        const entry = Object.freeze({ cockpit: cockpit.run, cursor: cockpit.mapPort.cursor });
        run.ownCleanup(() => {
          if (current === entry) current = null;
          return undefined;
        });
        current = entry;
      },
    };
  };
  return Object.freeze({
    stage: 'media', renderer: () => renderer, connect,
    mapGeometry: () => mapGeometry,
    mapCursor: () => current?.cursor ?? null,
    cockpit: () => current?.cockpit ?? null,
  });
}
