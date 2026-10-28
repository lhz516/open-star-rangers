import type { AssetId } from '../../../content/asset-id.ts';
import { readAssetId } from '../../../content/asset-id.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import { readHudText } from '../../../content/hud/hud-text-payload.ts';
import { readViewLabels } from '../../../content/hud/view-labels-payload.ts';
import { syntheticHudText } from '../../../content/hud/hud-text.test-support.ts';
import { readCockpitInstruments } from '../../../content/hud/instruments-payload.ts';
import { syntheticCockpitInstruments, syntheticInstrumentAssets } from '../../../content/hud/instruments.test-support.ts';
import { readRuleDataContent } from '../../../content/rule-data/rule-data-payload.ts';
import { syntheticCommMenus } from '../../../content/rule-data/rule-data.test-support.ts';
import type { CommMenus } from '../../../content/rule-data/comm-menus.ts';
import type { NameReference } from '../../../core/world/entity-table.ts';
import { interferenceFrames, leftDisplayContent, regularFont, smallFont, syntheticImage } from '../left-display/left-display.test-support.ts';
import { MAP_TEXTS, unitMarker, zoomIcon } from '../map-picture/map-picture.test-support.ts';
import { FLIGHT_MESSAGES, syntheticCopy } from '../messages/messages.test-support.ts';
import { CRAFT_INFO_ID, LABEL, OVERLAY_TEXT, overlayInput } from '../overlay/overlay.test-support.ts';
import { MODEL_ID, syntheticModel, targetBackground } from '../target-display/target-display.test-support.ts';
import type { CockpitContent, CockpitCopy } from './cockpit-run.ts';

// Code-generated synthetic HUD content that every real cockpit module accepts, for the run composition tests; never
// original data. Each module's own fixtures are reused where they exist.

export const FLIGHT_PALETTE = 'palette/flight/cockpit-hud-map' as AssetId;
export const MAP_PALETTE = 'palette/map/screen' as AssetId;

/** A 256-entry palette whose entry i is (i, (i + seed) & 0xff, 255 − i). */
export function syntheticPalette(seed: number): PalettePayload {
  const entries = new Uint8Array(256 * 3);
  for (let index = 0; index < 256; index++) entries.set([index, (index + seed) & 0xff, 255 - index], index * 3);
  return Object.freeze({ kind: 'palette', entries });
}

/** The HI rectangle of the right display, which fits its 100 × 100 device with one more column and row. */
const TARGET_RECTANGLE = Object.freeze({ x0: 491, y0: 346, x1: 586, y1: 442 });

/** `N<index>` for a pool name, `MARKER` for the map marker, nothing for every other. */
export const syntheticNames = (name: NameReference): string => (name.type === 'pool' ? `N${name.index}` : name.type === 'map-marker' ? 'MARKER' : '');

/**
 * The synthetic instruments (instruments.test-support.ts) with the right display at its HI rectangle, their layouts
 * (each element i of a slot at (i, i)), an 8 × 4 image of index 0x20 + i·8 + row for each element, and the module
 * fixtures for everything else.
 */
export function syntheticCockpitContent(binding: CockpitContent['binding'] = { generation: 1, identity: 'identity' }): CockpitContent {
  const mutable = syntheticCockpitInstruments();
  const target = mutable.slots[0].instruments.find(({ type }) => type === 7)!;
  target.rectangle = { ...TARGET_RECTANGLE };
  const instruments = readCockpitInstruments(mutable);
  const { front, mapFrame, mapGeometry } = syntheticInstrumentAssets(mutable);
  const layouts = new Map(instruments.slots.flatMap(({ layout }, at) => (layout === null ? [] : [[layout, [front, mapFrame][at]] as const])));
  const elementImages = new Map<AssetId, ImagePayload>([...layouts.values()].flatMap(({ elements }) => elements).map(({ image }, at) =>
    [image, syntheticImage(8, 4, (_x, y) => 0x20 + at * 8 + y)]));
  const hudText = readHudText({
    entries: { ...syntheticHudText('c').entries, ...OVERLAY_TEXT, ...MAP_TEXTS, indicatorMissileAimed: 'MSL!', indicatorCraftAimed: 'CRF!' },
  });
  const flight = syntheticPalette(1);
  const { craftInfo } = overlayInput();
  return Object.freeze({
    binding,
    instruments,
    layouts,
    elementImages,
    palettes: Object.freeze({ flight, map: syntheticPalette(2), byId: new Map([[FLIGHT_PALETTE, flight]]) }),
    fonts: Object.freeze({ regular: regularFont(), small: smallFont() }),
    hudText,
    viewLabels: readViewLabels({ labels: [{ subMode: 8, text: LABEL }] }),
    mapGeometry,
    leftDisplay: leftDisplayContent({ hudText }),
    interferenceFrames: interferenceFrames(),
    unitMarkers: Array.from({ length: 29 }, (_, record) => unitMarker(record)),
    zoomIcons: Array.from({ length: 29 }, (_, record) => zoomIcon(record)),
    targetBackground: targetBackground(),
    flightMessages: FLIGHT_MESSAGES,
    commMenus: Object.freeze({ id: readAssetId('data/comm-menus'), content: readRuleDataContent('comm-menus', syntheticCommMenus()).content as CommMenus }),
    craftInfo: Object.freeze({ id: CRAFT_INFO_ID, content: craftInfo.content }),
    names: syntheticNames,
  });
}

export const syntheticCockpitCopy = (): CockpitCopy => Object.freeze({ incoming: syntheticCopy(), costUnavailable: 'n/a' });

/** The right display's model lookup: the target fixture's model. */
export const syntheticModels = () => new Map([[MODEL_ID, syntheticModel()]]);
