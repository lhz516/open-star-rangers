/**
 * The cockpit's content from a held package (docs/plan/p3/13/spec.md, 内容输入与校验, 接线与生命周期 内容准备; D-01 定稿
 * DC-02, DC-07, DC-08), decoded strictly and checked once per package before any run of it is wired, so a run never
 * starts on HUD content a layer cannot draw:
 *
 * - from the cockpit-hud-map group, by the converter's canonical Asset IDs and roles: `data/hud/instruments`
 *   cross-checked against the two layouts its slots name and `data/hud/map-geometry` (`checkCockpitInstruments`); the
 *   layouts' element images; the flight and map palettes, and every palette of the group for the right display; fonts/0
 *   and fonts/1; `data/hud/text`, `data/hud/view-labels` and the DIAG messages; the left display's status, page and level
 *   images (`prepareLeftDisplayContent`); the interference frames; the map's unit markers and zoom icons; TEX 11089.
 *   Every image keeps its layout's palette (F1 and Warp: `palette/flight/cockpit-hud-map`, the map:
 *   `palette/map/screen`), and their indexed pixels stay within `COCKPIT_LIMITS.imagePixels`, checked from the payload
 *   headers before any image is decoded;
 * - from the logic group: the flight messages, the communication menus and the craft info with their Asset IDs, and the
 *   mission setup the names resolve from (candidates, the name pool, craft names; the map marker's is `mapMarkerName`);
 * - the app's project copy (`CockpitCopySource`): every G-03 summary within 58 bytes in fonts/0 and every page-5 label
 *   within 2 × 16 bytes in fonts/1, the uncovered feedback included (DC-07), a violation refusing the start.
 *
 * The result is bound to the package's generation and complete content identity; a run of another binding refuses it
 * (flight-run.ts). Errors are ContentContractErrors at `cockpit-hud-map[<Asset ID>].<path>` or a structural path, or
 * the readers' and checks' own errors.
 */
import type { AssetDescriptor } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { ContentContractError, fail } from '../../content/contract-validation.ts';
import { readFontPayload, type FontPayload } from '../../content/graphics/font-payload.ts';
import { checkGraphicsBinding } from '../../content/graphics/graphics-binding.ts';
import { readImagePayload, type ImagePayload } from '../../content/graphics/image-payload.ts';
import { readLayoutPayload, type LayoutPayload } from '../../content/graphics/layout-payload.ts';
import { readPalettePayload, type PalettePayload } from '../../content/graphics/palette-payload.ts';
import { decodeHudTextPayload, HUD_TEXT_ROLE } from '../../content/hud/hud-text-payload.ts';
import { checkCockpitInstruments, COCKPIT_INSTRUMENTS_ROLE, decodeCockpitInstrumentsPayload } from '../../content/hud/instruments-payload.ts';
import { decodeMapGeometryPayload, MAP_GEOMETRY_ROLE } from '../../content/hud/map-geometry-payload.ts';
import { checkStatusMessagesBinding, readStatusMessagesPayload, STATUS_MESSAGES_ROLE } from '../../content/hud/status-messages-payload.ts';
import { decodeViewLabelsPayload, VIEW_LABELS_ROLE } from '../../content/hud/view-labels-payload.ts';
import { readGroupManifest } from '../../content/manifest.ts';
import { readPayloadRecords } from '../../content/payload.ts';
import type { CommMenus } from '../../content/rule-data/comm-menus.ts';
import type { CraftInfo } from '../../content/rule-data/craft-info.ts';
import type { FlightMessages } from '../../content/rule-data/flight-messages.ts';
import { loadMission, type MissionSetup } from '../../core/mission/load-mission.ts';
import type { NameReference } from '../../core/world/entity-table.ts';
import type { CockpitContent, CockpitCopy } from '../../render/cockpit/composition/cockpit-run.ts';
import { prepareLeftDisplayContent } from '../../render/cockpit/left-display/left-display-content.ts';
import { checkLabelLines, checkSummaryText } from '../../render/cockpit/messages/message-copy.ts';
import { checkImagePixels, PresentationError } from '../../render/cockpit/presentation/cockpit-limits.ts';
import { craftInfoInput, flightMessagesInput, missionInput, ruleDataInputs, type PackageGroup } from '../resources/mission-input.ts';

const GROUP = 'cockpit-hud-map';

/** The app's project copy for the cockpit, with every text `incoming` can return so they are checked before a start. */
export interface CockpitCopySource extends CockpitCopy {
  /** Every summary `incoming.summary` returns. */
  readonly summaries: readonly string[];
  /** Every label `incoming.label` returns. */
  readonly labels: readonly (readonly string[])[];
}

/** The package the content comes from: its groups, generation and `contentIdentityKey`. */
export interface CockpitPackage {
  readonly groups: readonly PackageGroup[];
  readonly generation: number;
  readonly identity: string;
}

/** `prefix0` … `prefix<count − 1>`. */
const series = (prefix: string, count: number): AssetId[] => Array.from({ length: count }, (_, index) => `${prefix}${index}` as AssetId);

/** The converter's canonical Asset IDs of the cockpit-hud-map group (P2-07, P3-03; production-graphics.ts). */
export const COCKPIT_ASSET_IDS = Object.freeze({
  flightPalette: 'palette/flight/cockpit-hud-map' as AssetId,
  mapPalette: 'palette/map/screen' as AssetId,
  regularFont: 'font/hud/8x8-1' as AssetId,
  smallFont: 'font/hud/8x8-2' as AssetId,
  statusBackgrounds: Object.freeze(series('image/hud/status-display/background-', 3)),
  statusOverlays: Object.freeze(series('image/hud/status-display/overlay-', 9)),
  pageBackground: 'image/hud/display-page/background' as AssetId,
  levelImages: Object.freeze(series('image/hud/gauge-bar-1/', 4)),
  interferenceFrames: Object.freeze(series('image/hud/display-interference/frame-', 9)),
  unitMarkers: Object.freeze(series('image/map/unit-marker/', 29)),
  zoomIcons: Object.freeze(series('image/map/zoom-icon/', 29)),
});

/** The group's Assets and a strict reader of each, a reading error moved to `cockpit-hud-map[<Asset ID>]`. */
function groupReader(groups: readonly PackageGroup[]) {
  const group = groups.find(({ group: name }) => name === GROUP);
  if (!group) fail('invalid-resource-group', GROUP, 'the package holds no complete cockpit-hud-map group');
  const { assets } = readGroupManifest(group.manifest, `groups.${GROUP}.manifest`);
  const payloads = new Map(readPayloadRecords(group.payloads, `groups.${GROUP}.payloads`).map(({ id, bytes }) => [id, bytes]));
  const byId = new Map(assets.map((descriptor) => [descriptor.id, descriptor]));
  const bytesOf = (descriptor: AssetDescriptor): Uint8Array =>
    payloads.get(descriptor.id) ?? fail('invalid-record', `${GROUP}[${descriptor.id}]`, 'has no payload');
  const asset = (id: AssetId, kind: AssetDescriptor['kind']): AssetDescriptor => {
    const descriptor = byId.get(id);
    if (descriptor?.kind !== kind) fail('invalid-resource-group', GROUP, `must hold the ${kind} Asset ${id}`);
    return descriptor;
  };
  const only = (role: string): AssetDescriptor => {
    const found = assets.filter((descriptor) => descriptor.role === role);
    if (found.length !== 1) fail('invalid-role', GROUP, `must hold exactly one Asset of role ${role}`);
    return found[0];
  };
  const read = <T>(descriptor: AssetDescriptor, decode: (bytes: Uint8Array, descriptor: AssetDescriptor) => T): T => {
    try {
      return decode(bytesOf(descriptor), descriptor);
    } catch (error) {
      if (error instanceof ContentContractError) throw new ContentContractError(error.code, `${GROUP}[${descriptor.id}].${error.path}`, error.reason);
      throw error;
    }
  };
  /** A graphics payload read with `reader` and checked against its descriptor. */
  const graphics = <T extends ImagePayload | PalettePayload | FontPayload | LayoutPayload>(
    reader: (bytes: Uint8Array, schemaVersion: number, path: string) => T,
  ) => (descriptor: AssetDescriptor): T => read(descriptor, (bytes) => {
    const payload = reader(bytes, descriptor.payloadIdentity.schemaVersion, 'payload');
    checkGraphicsBinding(descriptor, payload, 'descriptor');
    return payload;
  });
  /** The width and height an image payload's header states, read before the image is decoded. */
  const imageSize = (descriptor: AssetDescriptor): { readonly width: number; readonly height: number } => {
    const bytes = bytesOf(descriptor);
    if (bytes.length < 4) return { width: 0, height: 0 };
    const view = new DataView(bytes.buffer, bytes.byteOffset, 4);
    return { width: view.getUint16(0, true), height: view.getUint16(2, true) };
  };
  return { assets, asset, only, read, graphics, imageSize };
}

/** Requires every image to be shown directly in `palette`, the palette of the screen it is drawn on. */
function requirePalette(images: Iterable<readonly [AssetId, ImagePayload]>, palette: AssetId): void {
  for (const [id, image] of images) {
    if (image.display !== 'direct' || image.palette !== palette) fail('binding-mismatch', `${GROUP}[${id}].palette`, `must be shown directly in ${palette}`);
  }
}

/** The byte string of a name reference in the run's mission setup (entity-table.ts, NameReference). */
function nameResolver(setup: MissionSetup, craftInfo: CraftInfo, mapMarkerName: string): (name: NameReference) => string {
  const missing = (name: NameReference): never => {
    throw new PresentationError('invariant-violated', 'cockpit.names', `has no ${name.type} name the reference names`);
  };
  return (name) => {
    switch (name.type) {
      case 'none':
        return '';
      case 'candidate': {
        const { collection, index } = name.declaration;
        const declarations = collection === 'mission' ? setup.declarations : setup.wingmanOptions;
        return declarations[index]?.nameCandidates[name.candidate] ?? missing(name);
      }
      case 'pool':
        return setup.namePool[name.index] ?? missing(name);
      case 'craft-type':
        return craftInfo.craft[name.kindBit]?.name ?? missing(name);
      case 'map-marker':
        return mapMarkerName;
    }
  };
}

/** The logic group's inputs the cockpit reads; a missing one refuses the start at its role. */
function logicInputs(groups: readonly PackageGroup[]) {
  const logic = groups.find(({ group }) => group === 'logic') ?? fail('invalid-resource-group', 'logic', 'the package holds no complete logic group');
  const required = <T>(input: { readonly id: AssetId; readonly content: unknown } | undefined, role: string) => {
    if (!input) fail('invalid-role', 'logic', `must hold exactly one Asset of role ${role}`);
    return Object.freeze({ id: input.id, content: input.content as T });
  };
  return {
    flightMessages: required<FlightMessages>(flightMessagesInput(logic), 'flight-messages').content,
    commMenus: required<CommMenus>(ruleDataInputs(groups).commMenus, 'comm-menus'),
    craftInfo: required<CraftInfo>(craftInfoInput(logic), 'craft-info'),
    setup: loadMission(missionInput(logic)),
  };
}

/** Checks the copy's every text in the fonts that draw it (DC-07): summaries in fonts/0, labels in fonts/1. */
function checkCopy(copy: CockpitCopySource, { regular, small }: { readonly regular: FontPayload; readonly small: FontPayload }): void {
  const path = 'cockpitCopy';
  checkSummaryText(copy.incoming.uncoveredSummary, regular, `${path}.uncoveredSummary`);
  checkLabelLines(copy.incoming.uncoveredLabel, small, `${path}.uncoveredLabel`);
  copy.summaries.forEach((summary, index) => { checkSummaryText(summary, regular, `${path}.summaries[${index}]`); });
  copy.labels.forEach((label, index) => { checkLabelLines(label, small, `${path}.labels[${index}]`); });
}

/** The cockpit content of `held`, decoded and checked; see the module comment. */
export function cockpitContentOf({ groups, generation, identity }: CockpitPackage, copy: CockpitCopySource): CockpitContent {
  const group = groupReader(groups);
  const { asset, only, read, graphics } = group;
  const instruments = read(only(COCKPIT_INSTRUMENTS_ROLE), decodeCockpitInstrumentsPayload);
  const mapGeometry = read(only(MAP_GEOMETRY_ROLE), decodeMapGeometryPayload);
  const readLayout = graphics(readLayoutPayload);
  const layouts = new Map<AssetId, LayoutPayload>();
  for (const { layout } of instruments.slots) if (layout !== null) layouts.set(layout, readLayout(asset(layout, 'layout')));
  // The reader gives slots 0 and 2 their layouts (DC-02).
  const [frontLayout, mapLayout] = instruments.slots.map(({ layout }) => layouts.get(layout!)!);
  checkCockpitInstruments(instruments, { front: frontLayout, mapFrame: mapLayout, mapGeometry });
  const elementsOf = ({ elements }: LayoutPayload): AssetId[] => elements.map(({ image }) => image);

  const ids = COCKPIT_ASSET_IDS;
  const elementIds = [...layouts.values()].flatMap(elementsOf);
  const imageIds = [
    ...elementIds, ...ids.statusBackgrounds, ...ids.statusOverlays, ids.pageBackground, ...ids.levelImages, ...ids.interferenceFrames,
    ...ids.unitMarkers, ...ids.zoomIcons,
  ];
  const targetDescriptor = only('target-display');
  const imageDescriptors = [...imageIds.map((id) => asset(id, 'image')), targetDescriptor];
  checkImagePixels(imageDescriptors.map(group.imageSize), 'cockpit.images');
  const readImage = graphics(readImagePayload);
  const images = new Map(imageDescriptors.map((descriptor) => [descriptor.id, readImage(descriptor)]));
  const imagesOf = (list: readonly AssetId[]): ImagePayload[] => list.map((id) => images.get(id)!);

  const palettes = new Map(group.assets.filter(({ kind }) => kind === 'palette').map((descriptor) => [descriptor.id, graphics(readPalettePayload)(descriptor)]));
  const flight = palettes.get(asset(ids.flightPalette, 'palette').id)!;
  const mapPalette = palettes.get(asset(ids.mapPalette, 'palette').id)!;
  const pick = (list: readonly AssetId[]) => list.map((id) => [id, images.get(id)!] as const);
  requirePalette(pick([
    ...elementsOf(frontLayout), ...ids.statusBackgrounds, ...ids.statusOverlays, ids.pageBackground, ...ids.levelImages, ...ids.interferenceFrames,
  ]), ids.flightPalette);
  requirePalette(pick([...elementsOf(mapLayout), ...ids.unitMarkers, ...ids.zoomIcons]), ids.mapPalette);

  const readFont = graphics(readFontPayload);
  const fonts = Object.freeze({ regular: readFont(asset(ids.regularFont, 'font')), small: readFont(asset(ids.smallFont, 'font')) });
  const hudText = read(only(HUD_TEXT_ROLE), decodeHudTextPayload);
  const statusMessages = read(only(STATUS_MESSAGES_ROLE), (bytes, descriptor) => {
    checkStatusMessagesBinding(descriptor, 'descriptor');
    return readStatusMessagesPayload(bytes, descriptor.payloadIdentity.schemaVersion);
  });
  const leftDisplay = Object.freeze({
    statusBackgrounds: imagesOf(ids.statusBackgrounds), statusOverlays: imagesOf(ids.statusOverlays), statusMessages,
    pageBackground: images.get(ids.pageBackground)!, levelImages: imagesOf(ids.levelImages), hudText, fonts,
  });
  prepareLeftDisplayContent(leftDisplay);
  checkCopy(copy, fonts);
  const { flightMessages, commMenus, craftInfo, setup } = logicInputs(groups);
  return Object.freeze({
    binding: Object.freeze({ generation, identity }),
    instruments,
    layouts,
    elementImages: new Map(elementIds.map((id) => [id, images.get(id)!])),
    palettes: Object.freeze({ flight, map: mapPalette, byId: palettes }),
    fonts,
    hudText,
    viewLabels: read(only(VIEW_LABELS_ROLE), decodeViewLabelsPayload),
    mapGeometry,
    leftDisplay,
    interferenceFrames: imagesOf(ids.interferenceFrames),
    unitMarkers: imagesOf(ids.unitMarkers),
    zoomIcons: imagesOf(ids.zoomIcons),
    targetBackground: images.get(targetDescriptor.id)!,
    flightMessages,
    commMenus,
    craftInfo,
    names: nameResolver(setup, craftInfo.content, hudText.entries.mapMarkerName),
  });
}
