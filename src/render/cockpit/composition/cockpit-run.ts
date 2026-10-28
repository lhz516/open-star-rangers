/**
 * One run's cockpit presentation with its real modules (docs/plan/p3/13/spec.md, 接线与生命周期, D-01 定稿 DC-04/DC-07/
 * DC-08/DC-10/DC-12): created while the run is held at tick 0, before any GPU allocation, so content or copy a module
 * refuses rejects the start first. Every module is new for each run (a retry or a new run starts from the initial
 * state, Δ-04); a rescue keeps the run and so its map picture and right-button state (DC-09).
 *
 * - **Registration order** is the order of the global callbacks the original registers, types 8, 6, 9 and 12: the
 *   message line, the left display, the type-9 strip, then the Warp lamp; the gauges, radar, frame (the one element
 *   painter), target display, flight overlay and map picture follow.
 * - **Shared per run:** one interference picture for the left and right displays (their shared "last frame", DC-10),
 *   and the radar's cached directions for the overlay's off-centre pointer (DC-12).
 * - **Advance:** the run wiring gives each frame's ticks after P3-12's presentation module advanced by all of them, so
 *   the cockpit reads each tick's own camera and projection (DC-03, DC-04); D-02 has no shared cue model (DD-05).
 *
 * Nothing here reads the DOM, host time or the app; the app decodes and checks the content and resolves names and copy.
 */
import type { AssetId } from '../../../content/asset-id.ts';
import type { FontPayload } from '../../../content/graphics/font-payload.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { LayoutPayload } from '../../../content/graphics/layout-payload.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import type { HudText } from '../../../content/hud/hud-text-payload.ts';
import type { CockpitInstruments } from '../../../content/hud/instruments-payload.ts';
import type { MapGeometry } from '../../../content/hud/map-geometry-payload.ts';
import type { ViewLabels } from '../../../content/hud/view-labels-payload.ts';
import type { CommMenus } from '../../../content/rule-data/comm-menus.ts';
import type { CraftInfo } from '../../../content/rule-data/craft-info.ts';
import type { FlightMessages } from '../../../content/rule-data/flight-messages.ts';
import type { RenderState } from '../../../core/projections/render-state.ts';
import type { NameReference } from '../../../core/world/entity-table.ts';
import { createCommunicationPages } from '../communications/communication-pages.ts';
import { createCockpitFrame } from '../frame/cockpit-frame.ts';
import { createCornerGauges } from '../gauges/corner-gauges.ts';
import { createDisplayInterference } from '../interference/display-interference.ts';
import { communicationPageDrawers, createLeftDisplay } from '../left-display/left-display.ts';
import type { LeftDisplayContent } from '../left-display/left-display-content.ts';
import { createMapPicture, type MapPictureModule } from '../map-picture/map-picture.ts';
import { mapPictureGeometry, type MapPictureGeometry } from '../map-picture/map-picture-geometry.ts';
import type { IncomingCopy } from '../messages/message-copy.ts';
import { createMessageLine, type MessageLineModule } from '../messages/message-line.ts';
import { createFlightOverlay } from '../overlay/flight-overlay.ts';
import { createIndicatorStrip } from '../overlay/indicator-strip.ts';
import type { CockpitInitial, CockpitPresentation } from '../presentation/cockpit-contract.ts';
import { createCockpitPresentation } from '../presentation/cockpit-presentation.ts';
import { createRadar } from '../radar/radar.ts';
import { hudFont } from '../raster/glyph-text.ts';
import { createTargetDisplay, type TargetModels } from '../target-display/target-display.ts';
import { createWarpLamp } from '../warp-display/warp-lamp.ts';
import { createWarpPage } from '../warp-display/warp-page.ts';

/** The corner gauges' label font: fonts/0 at advance 8, no upper-casing (hud §4.2). */
const GAUGE_ADVANCE = 8;

/**
 * The checked HUD content of one package (the app's `cockpitContentOf`), bound to the package's generation and complete
 * content identity: a run of another binding refuses it.
 */
export interface CockpitContent {
  readonly binding: { readonly generation: number; readonly identity: string };
  /** `data/hud/instruments`, read and cross-checked against its layouts and the map geometry. */
  readonly instruments: CockpitInstruments;
  /** The layouts the slots name, by Asset ID. */
  readonly layouts: ReadonlyMap<AssetId, LayoutPayload>;
  /** Every element image of those layouts, by Asset ID. */
  readonly elementImages: ReadonlyMap<AssetId, ImagePayload>;
  /**
   * `palette/flight/cockpit-hud-map` (F1, Warp and the destruction view), `palette/map/screen` (the map screen) and
   * every palette of the group, by Asset ID.
   */
  readonly palettes: { readonly flight: PalettePayload; readonly map: PalettePayload; readonly byId: ReadonlyMap<AssetId, PalettePayload> };
  /** fonts/0 `font/hud/8x8-1` and fonts/1 `font/hud/8x8-2`. */
  readonly fonts: { readonly regular: FontPayload; readonly small: FontPayload };
  readonly hudText: HudText;
  readonly viewLabels: ViewLabels;
  readonly mapGeometry: MapGeometry;
  /** The left display's status, energy and DIAG content. */
  readonly leftDisplay: LeftDisplayContent;
  /** `image/hud/display-interference/frame-*`, SNIP. */
  readonly interferenceFrames: readonly ImagePayload[];
  /** TABL 10461 and 11401, 29 records each. */
  readonly unitMarkers: readonly ImagePayload[];
  readonly zoomIcons: readonly ImagePayload[];
  /** TEX 11089, the right display's background. */
  readonly targetBackground: ImagePayload;
  readonly flightMessages: FlightMessages;
  readonly commMenus: { readonly id: AssetId; readonly content: CommMenus };
  readonly craftInfo: { readonly id: AssetId; readonly content: CraftInfo };
  /** The byte string of a name reference, from the mission setup, the craft info and `mapMarkerName`. */
  readonly names: (name: NameReference) => string;
}

/** The project copy the cockpit draws, injected by the app (spec, 缺省与标注; DC-07, DC-09). */
export interface CockpitCopy {
  /** G-03 summaries and page-5 labels, with the uncovered feedback. */
  readonly incoming: IncomingCopy;
  /** `MAP_COST_UNAVAILABLE`. */
  readonly costUnavailable: string;
}

export interface CockpitRunInput {
  readonly ownerId: number;
  readonly runId: number;
  readonly content: CockpitContent;
  readonly copy: CockpitCopy;
  /** The run's tick-0 Render State, projection and P3-12 camera. */
  readonly initial: CockpitInitial;
  /** The run's host presentation seed (the cockpit stream derives its own from it, DC-04). */
  readonly seed: number;
  /** The run's model payloads, for the right display. */
  readonly models: TargetModels;
  /** P3-12's back plane B of a Render State (PV4). */
  readonly backPlane: (render: RenderState) => number;
  /** The P3-05 local map pointer, read at each map draw; null draws it at the confirmed cursor. */
  readonly pointer: () => { readonly right: number; readonly down: number } | null;
}

/** The development summary of the cockpit (spec, 接线与生命周期 诊断). */
export interface CockpitDiagnostics {
  readonly tick: number;
  readonly viewMode: number;
  readonly leftPage: number;
  /** Message line items queued, the head included, and new items dropped at the bound (Δ-05). */
  readonly messages: number;
  readonly messageDrops: number;
  /** Radar noise and fake boxes past 120 entries (`radarNoiseDropped`, DC-08). */
  readonly radarNoiseDropped: number;
  /** Per content slot, each record's last draw sample. */
  readonly lastDraw: readonly (readonly number[])[];
  readonly randomDraws: number;
}

export interface CockpitRun {
  readonly presentation: CockpitPresentation;
  /** For the base page's bridge (25): `snapshot()` and `subscribe()`. */
  readonly messageLine: MessageLineModule;
  /** Its `drawn()` is the map's ready credential (DC-09). */
  readonly mapPicture: MapPictureModule;
  /** The map picture's geometry, from the same `data/hud/map-geometry`. */
  readonly mapGeometry: MapPictureGeometry;
  /** The development summary after the last processed tick. */
  diagnostics(): CockpitDiagnostics;
}

/** The run's modules in registration order, and the presentation over them; `presentation.dispose` disposes them all. */
export function createCockpitRun({ ownerId, runId, content, copy, initial, seed, models, backPlane, pointer }: CockpitRunInput): CockpitRun {
  const { fonts, hudText, names } = content;
  const { entries } = hudText;
  const interference = createDisplayInterference(content.interferenceFrames);
  const messageLine = createMessageLine({ font: fonts.regular, flightMessages: content.flightMessages, copy: copy.incoming });
  const communication = createCommunicationPages({
    font: fonts.small, background: content.leftDisplay.pageBackground, hudText: entries, commMenus: content.commMenus, names, copy: copy.incoming,
  });
  const warpPage = createWarpPage({ font: fonts.regular, background: content.leftDisplay.pageBackground, hudText: entries });
  const leftDisplay = createLeftDisplay({
    content: content.leftDisplay, interference, initial: initial.projection,
    pages: { ...communicationPageDrawers(communication), 6: warpPage.drawWarpPage },
  });
  const radar = createRadar();
  const mapPicture = createMapPicture({
    font: fonts.small, unitMarkers: content.unitMarkers, zoomIcons: content.zoomIcons, hudText, names, costUnavailable: copy.costUnavailable, pointer,
  });
  const modules = [
    messageLine,
    leftDisplay,
    createIndicatorStrip({ font: fonts.small, hudText: entries }),
    createWarpLamp({ font: fonts.small, hudText: entries }),
    createCornerGauges({
      font: hudFont(fonts.regular, GAUGE_ADVANCE, false),
      labels: { 0: entries.barGauge0Label, 1: entries.barGauge1Label, 2: entries.barGauge2Label, 3: entries.barGauge3Label },
    }),
    radar,
    createCockpitFrame({ content: content.instruments, layouts: content.layouts, images: content.elementImages }),
    createTargetDisplay({
      font: fonts.regular, background: content.targetBackground, palettes: content.palettes.byId, hudText: entries, interference, models, names,
    }),
    createFlightOverlay({
      font: fonts.small, hudText: entries, viewLabels: content.viewLabels, craftInfo: content.craftInfo, names,
      radar: { cachedDirection: (entityId) => radar.cachedDirection(entityId) }, backPlane,
    }),
    mapPicture,
  ];
  const presentation = createCockpitPresentation({ ownerId, runId, content: content.instruments, modules, initial, seed });
  return Object.freeze({
    presentation,
    messageLine,
    mapPicture,
    mapGeometry: mapPictureGeometry(content.mapGeometry),
    diagnostics(): CockpitDiagnostics {
      const { tick, viewMode, lastDraw, randomDraws } = presentation.schedule();
      const { length, messageDrops } = messageLine.snapshot();
      return Object.freeze({
        tick, viewMode, leftPage: leftDisplay.state().page, messages: length, messageDrops, radarNoiseDropped: radar.state().noiseDropped, lastDraw, randomDraws,
      });
    },
  });
}
