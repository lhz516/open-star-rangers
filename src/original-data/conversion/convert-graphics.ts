import { readAssetDescriptor, type AssetDescriptor } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { chargeBudget, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { ContentContractError, compareText } from '../../content/contract-validation.ts';
import { encodeFontPayload, fontPayloadLength, type CharMapEntry } from '../../content/graphics/font-payload.ts';
import { imagePalettes, layoutImages } from '../../content/graphics/graphics-binding.ts';
import { GRAPHICS_LIMITS, GRAPHICS_SCHEMA_VERSION } from '../../content/graphics/graphics-format.ts';
import { encodeImagePayload, imagePayloadLength, maskStride } from '../../content/graphics/image-payload.ts';
import { encodeLayoutPayload, layoutPayloadLength, type LayoutElement, type LayoutPayload } from '../../content/graphics/layout-payload.ts';
import { encodePalettePayload, palettePayloadLength } from '../../content/graphics/palette-payload.ts';
import { HUD_TEXT_SCHEMA_VERSION, encodeHudTextPayload, type HudText } from '../../content/hud/hud-text-payload.ts';
import {
  checkCockpitInstruments, COCKPIT_INSTRUMENTS_FORMAT, COCKPIT_INSTRUMENTS_SCHEMA_VERSION, encodeCockpitInstrumentsPayload, readCockpitInstruments,
  type CockpitInstruments,
} from '../../content/hud/instruments-payload.ts';
import { MAP_GEOMETRY_SCHEMA_VERSION, encodeMapGeometryPayload, type MapGeometry } from '../../content/hud/map-geometry-payload.ts';
import { STATUS_MESSAGES_SCHEMA_VERSION, encodeStatusMessagesPayload } from '../../content/hud/status-messages-payload.ts';
import { VIEW_LABELS_SCHEMA_VERSION, encodeViewLabelsPayload } from '../../content/hud/view-labels-payload.ts';
import type { PayloadRecord } from '../../content/payload.ts';
import { sha256Fingerprint } from '../../content/sha256.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { decodeAnimationFrame, readAnimationFrames, type AnimationFrame } from '../formats/anim.ts';
import { entryLocation } from '../formats/payload-block.ts';
import { parseViewLabels } from '../formats/view-labels.ts';
import { SourceError } from '../source-error.ts';
import { readConversionUsage } from './conversion-budget.ts';
import {
  declaredGlyphCount, GRAPHICS_DATA_SOURCES, readGraphicsDeclarations, type DataDeclaration, type FontDeclaration, type GraphicsDeclaration, type GraphicsKind,
  type ImageDeclaration, type LayoutDeclaration, type PaletteDeclaration,
} from './graphics-declarations.ts';
import {
  checkPaletteIndices, cockpitElementRecordOffset, decodeImageRecord, decodeSnipFrame, mfdRecordOffset, readCockpitFont, readCockpitGroup,
  readCockpitGroupPalette, readCockpitInstrument, readCockpitInstrumentSlot, readDataPalette, readEmbeddedPalette, readImageRecordHeader, readSnipFrames,
  tableRecordOffset, type RelocatedBlock, type SourceImage,
} from './source-graphics.ts';
import { readStatusMessages } from './source-messages.ts';

/**
 * The graphics converter's component of the production `ConverterVersion`; bump it when graphics output changes. Version 4
 * adds the P3-03 flight images and view labels, version 5 the map geometry (P3-03 spec, P3-09 的修订：地图几何（修订 2）),
 * version 6 the cockpit instruments (P3-03 spec, 修订 4).
 */
export const GRAPHICS_CONVERTER_COMPONENT = 'graphics-6';

/**
 * An image record inside a container entry: a CCKD element (`groups/<s>/elements/<i>`), an MFDD list record
 * (`lists/<l>/records/<i>`) or a TABL image list record (`records/<i>`).
 */
export type RecordSelector =
  | { readonly container: 'cockpit-element'; readonly slot: number; readonly index: number }
  | { readonly container: 'mfd-record'; readonly list: number; readonly index: number }
  | { readonly container: 'table-record'; readonly index: number };

interface DataPaletteSource {
  /** A whole DATA entry. */
  readonly type: 'data-palette';
  readonly block: Uint8Array;
}

interface EmbeddedPaletteSource {
  /** The embedded palette of an image record, a `…palette` subresource. */
  readonly type: 'embedded-palette';
  readonly block: Uint8Array;
  /** The container record; absent for a whole-entry record at offset 0. */
  readonly record?: RecordSelector;
}

interface CockpitGroupPaletteSource {
  /** The `groups/<slot>/palette` subresource of a CCKD entry: a DATA-format palette the directory record points to. */
  readonly type: 'cockpit-group-palette';
  readonly block: Uint8Array;
  readonly slot: number;
}

type PaletteSource = DataPaletteSource | EmbeddedPaletteSource | CockpitGroupPaletteSource;

interface ImageSource {
  /** An image record: a whole entry at offset 0, or the container record `record` selects. */
  readonly type: 'image-record';
  readonly block: Uint8Array;
  readonly record?: RecordSelector;
}

interface SnipFrameSource {
  /** The `frames/<index>` subresource of a SNIP entry with its relocations, and the colour table of the mapping's region part. */
  readonly type: 'snip-frame';
  readonly block: Uint8Array;
  readonly relocations: readonly number[];
  readonly index: number;
  readonly colours: Uint8Array;
}

interface AnimFrameSource {
  /** The `frames/<index>` subresource of an ANIM entry, read whole with its relocations (textures §6). */
  readonly type: 'anim-frame';
  readonly archive: DiscPath;
  readonly read: ArchiveEntryRead;
  readonly index: number;
}

interface FontSource {
  /** The `fonts/<index>` subresource of a CCKD entry. */
  readonly type: 'cockpit-font';
  readonly block: Uint8Array;
  readonly index: number;
}

interface LayoutSource {
  /** The `groups/<slot>` subresource of a CCKD entry. */
  readonly type: 'cockpit-group';
  readonly block: Uint8Array;
  readonly slot: number;
}

interface MessagesSource {
  /** A whole DIAG entry with its relocations, and the lower line's format from the mapping's region part. */
  readonly type: 'status-messages';
  readonly block: Uint8Array;
  readonly relocations: readonly number[];
  readonly format: Uint8Array;
}

interface ViewLabelsSource {
  /** The `labels/8` subresource of a TABL view label entry, read whole with its relocations (hud, TABL 10399). */
  readonly type: 'view-labels';
  readonly archive: DiscPath;
  readonly read: ArchiveEntryRead;
}

interface MapGeometrySource {
  /**
   * The `layouts/<layout>/instruments/type-<instrumentType>` and `fonts/<font>` subresources of one CCKD entry: the
   * instrument record's rectangle and redraw interval and the font's glyph height (P3-03 spec, P3-09 的修订).
   */
  readonly type: 'map-geometry';
  readonly block: Uint8Array;
  readonly layout: number;
  readonly instrumentType: number;
  readonly font: number;
}

interface CockpitInstrumentsSource {
  /**
   * The `layouts/<n>` subresources of one CCKD entry for the slots of `COCKPIT_INSTRUMENTS_FORMAT`, read with the entry's
   * relocations, and the bytes of the target view distance region of the executable (P3-03 spec, 修订 4).
   */
  readonly type: 'cockpit-instruments';
  readonly entry: RelocatedBlock;
  readonly distances: Uint8Array;
  /** Per format slot, the declared images of its elements `groups/<slot>/elements/<i>` in element order. */
  readonly elementImages: readonly (readonly AssetId[])[];
}

interface HudTextSource {
  /** The HUD text, already read from the mapping's EXE regions and checked against the schema (`parseHudText`). */
  readonly type: 'hud-text';
  readonly content: HudText;
}

/**
 * The source bytes of one Asset, already read from its mapped entry and, for SNIP frames and DIAG, its region; ANIM
 * frames and view labels keep their whole entry read for the format readers, and the HUD text is already read from its
 * regions.
 */
export type GraphicsSource =
  | PaletteSource | ImageSource | SnipFrameSource | AnimFrameSource | FontSource | LayoutSource | MessagesSource | ViewLabelsSource | HudTextSource
  | MapGeometrySource | CockpitInstrumentsSource;

export interface ConvertedGraphic {
  readonly descriptor: AssetDescriptor;
  /** Owns its whole ArrayBuffer. */
  readonly payload: PayloadRecord;
}

export interface GraphicsConversion {
  /** In ascending Asset ID order. */
  readonly assets: readonly ConvertedGraphic[];
  /** Conversion usage after the starting usage; `sourceReadBytes` is never charged here. */
  readonly usage: BudgetRecord;
}

/** The source types of each kind but `data`, whose role selects its one source type (`GRAPHICS_DATA_SOURCES`). */
const SOURCE_TYPES: Readonly<Record<Exclude<GraphicsKind, 'data'>, readonly GraphicsSource['type'][]>> = Object.freeze({
  palette: ['data-palette', 'embedded-palette', 'cockpit-group-palette'], image: ['image-record', 'snip-frame', 'anim-frame'], font: ['cockpit-font'],
  layout: ['cockpit-group'],
});
export const SOURCE_FIELDS: Readonly<Record<GraphicsKind, string>> = Object.freeze({ palette: 'palette', image: 'record', font: 'fonts', layout: 'groups', data: 'messages' });
/** The field a budget rejection is reported at, per kind. */
const BUDGET_FIELDS = Object.freeze({ palette: 'palette', image: 'pixels', font: 'glyphs', layout: 'elements', data: 'messages' });

/** Block offset of the image record a source selects: 0 for a whole-entry record. */
function recordOffset(block: Uint8Array, record: RecordSelector | undefined, at: string): number {
  switch (record?.container) {
    case undefined: return 0;
    case 'cockpit-element': return cockpitElementRecordOffset(block, record.slot, record.index, at);
    case 'mfd-record': return mfdRecordOffset(block, record.list, record.index, at);
    case 'table-record': return tableRecordOffset(block, record.index, at);
  }
}

/**
 * Frame `index` of an ANIM source after the whole entry's structure is checked, without decoding any frame data; a frame
 * past the array is `subresource-not-found` at the entry's frame array, as the frame decoder reports it.
 */
function animationFrame({ archive, read, index }: AnimFrameSource): AnimationFrame {
  const frames = readAnimationFrames(archive, read);
  if (!Number.isInteger(index) || index < 0 || index >= frames.length) {
    throw new SourceError('subresource-not-found', `${entryLocation(archive, read.entry)}/frames`, 'the ANIM has no such frame');
  }
  return frames[index];
}

type ImageSourceOf = ImageSource | SnipFrameSource | AnimFrameSource;

/**
 * The encoding and size of an image source, checked without decoding its pixels; `offset` locates an image record. A
 * SNIP frame is drawn whole (hud, SNIP 10487), like an opaque raw record; an ANIM frame is byte-run sprite RLE, whose
 * transparent runs are its mask (textures §6).
 */
function imageHeader(source: ImageSourceOf, offset: number, at: string): { readonly encoding: string; readonly width: number; readonly height: number } {
  switch (source.type) {
    case 'image-record': return readImageRecordHeader(source.block, offset, at);
    case 'anim-frame': return { encoding: 'byte-run', ...animationFrame(source) };
    case 'snip-frame': return { encoding: 'snip', ...readSnipFrames({ bytes: source.block, relocations: source.relocations }, at) };
  }
}

/** The pixels of an image source, decoded into new buffers in stored row order. */
function decodeImage(source: ImageSourceOf, offset: number, at: string): SourceImage {
  switch (source.type) {
    case 'image-record': return decodeImageRecord(source.block, offset, at);
    case 'anim-frame': return decodeAnimationFrame(source.archive, source.read, source.index);
    case 'snip-frame': return decodeSnipFrame({ bytes: source.block, relocations: source.relocations }, source.index, source.colours, at);
  }
}

/** The 8-bit RGB entries of a palette source; `offset` locates an embedded palette's image record. */
function paletteEntries(source: PaletteSource, offset: number, at: string): Uint8Array<ArrayBuffer> {
  switch (source.type) {
    case 'data-palette': return readDataPalette(source.block, at);
    case 'cockpit-group-palette': return readCockpitGroupPalette(source.block, source.slot, at);
    case 'embedded-palette': return readEmbeddedPalette(source.block, offset, at);
  }
}

class Conversion {
  readonly #limits: unknown;
  #usage: BudgetRecord;
  /** Entry counts of the palettes converted so far. */
  readonly #paletteEntries = new Map<AssetId, number>();
  /** The converted map geometry and cockpit instruments, which `checkInstruments` compares. */
  #mapGeometry: MapGeometry | null = null;
  #instruments: { readonly at: string; readonly content: CockpitInstruments } | null = null;
  readonly assets: ConvertedGraphic[] = [];

  constructor(limits: unknown, usage: unknown) {
    this.#limits = limits;
    this.#usage = readConversionUsage(usage);
  }

  get usage(): BudgetRecord {
    return this.#usage;
  }

  /** Charges an Asset before anything sized by it is read or allocated; a rejected charge changes nothing. */
  #charge(declaration: GraphicsDeclaration, increment: Partial<BudgetRecord>): void {
    const result = chargeBudget(this.#limits, this.#usage, { ...EMPTY_BUDGET_USAGE, assets: 1, ...increment });
    if (result.status === 'over-budget') {
      const [{ dimension, limit, observed }] = result.violations;
      const location = `graphics[${declaration.asset.id}].${BUDGET_FIELDS[declaration.asset.kind]}`;
      throw new SourceError('budget-exceeded', location, 'the conversion budget is exhausted', { name: dimension, limit, observed });
    }
    this.#usage = result.usage;
  }

  #add(
    declaration: GraphicsDeclaration, dependencies: readonly AssetId[], bytes: Uint8Array, dependencyKind: 'palette' | 'image' = 'palette',
    schemaVersion = GRAPHICS_SCHEMA_VERSION,
  ): void {
    const { asset: { id, kind }, role, group } = declaration;
    const descriptor = readAssetDescriptor({
      id, kind, role, group,
      dependencies: dependencies.map(dependency => ({ id: dependency, kind: dependencyKind })),
      payloadIdentity: { schemaVersion, byteLength: bytes.length, fingerprint: sha256Fingerprint(bytes) },
    });
    this.assets.push(Object.freeze({ descriptor, payload: Object.freeze({ id, schemaVersion, bytes }) }));
  }

  palette(declaration: PaletteDeclaration, source: PaletteSource): void {
    const at = `graphics[${declaration.asset.id}]`;
    // DATA-format palettes always have 256 entries; an embedded palette's count is in its record header.
    const offset = source.type === 'embedded-palette' ? recordOffset(source.block, source.record, at) : 0;
    const entryCount = source.type === 'embedded-palette' ? readImageRecordHeader(source.block, offset, at).paletteCount : GRAPHICS_LIMITS.paletteEntryCount;
    this.#charge(declaration, { paletteEntries: entryCount, payloadBytes: palettePayloadLength(entryCount) });
    const entries = paletteEntries(source, offset, at);
    this.#paletteEntries.set(declaration.asset.id, entries.length / 3);
    this.#add(declaration, [], encodePalettePayload({ entries }, at));
  }

  image(declaration: ImageDeclaration, source: ImageSourceOf): void {
    const { asset: { id }, palette, display, alpha, rowOrder } = declaration;
    const at = `graphics[${id}]`;
    const offset = source.type === 'image-record' ? recordOffset(source.block, source.record, at) : 0;
    const { encoding, width, height } = imageHeader(source, offset, at);
    if (alpha !== 'encoding' && encoding !== 'raw') throw new SourceError('invalid-declaration', `${at}.alpha`, 'a colour key applies only to raw images');
    const masked = encoding === 'sprite-rle' || encoding === 'byte-run' || alpha !== 'encoding';
    const dependencies = imagePalettes(declaration);
    this.#charge(declaration, {
      dependencyEdges: dependencies.length,
      imagePixels: width * height,
      payloadBytes: imagePayloadLength({ width, height, palette, display }, masked),
    });
    const decoded = decodeImage(source, offset, at);
    const indices = decoded.indices;
    const mask = alpha === 'encoding' ? decoded.mask : colourKeyMask(indices, width, height, alpha.colourKey);
    checkPaletteIndices({ width, height, indices, mask }, this.#paletteEntries.get(palette)!, at);
    const reversed = rowOrder === 'reversed';
    this.#add(declaration, dependencies, encodeImagePayload({
      width, height, palette, display,
      indices: reversed ? reverseRows(indices, width, height) : indices,
      mask: mask && reversed ? reverseRows(mask, maskStride(width), height) : mask,
    }, at));
  }

  font(declaration: FontDeclaration, source: FontSource): void {
    const { asset: { id }, cell, glyphRows, charMap } = declaration;
    const at = `graphics[${id}]`;
    const entryCount = charMap.reduce((total, { count }) => total + count, 0);
    const glyphCount = declaredGlyphCount(declaration);
    // The declared cell bounds the charge; a source of another size is rejected below.
    this.#charge(declaration, { glyphs: glyphCount, payloadBytes: fontPayloadLength(glyphCount, glyphRows, entryCount) });
    const entries: CharMapEntry[] = charMap
      .flatMap(({ firstCode, firstGlyph, count }) => Array.from({ length: count }, (_, offset) => ({ code: firstCode + offset, glyph: firstGlyph + offset })))
      .sort((left, right) => left.code - right.code);
    const font = readCockpitFont(source.block, source.index, at);
    if (font.cellWidth !== cell.width || font.height !== cell.height) {
      throw new SourceError('geometry-mismatch', `${at}.glyphs`, 'the font cell differs from the declared cell');
    }
    // The same bytes, split into glyphs of the declared rows.
    this.#add(declaration, [], encodeFontPayload({ cellWidth: font.cellWidth, height: font.height, glyphRows, glyphs: font.glyphs, charMap: entries }, at));
  }

  /**
   * A layout's elements from its CCKD group, pairing declared image i with stored element i: the stored element count
   * must equal the declared one and every element must lie inside the declared frame at its record's image size.
   */
  layoutElements(declaration: LayoutDeclaration, { block, slot }: LayoutSource): readonly LayoutElement[] {
    const { asset: { id }, frame, elements: images } = declaration;
    const at = `graphics[${id}]`;
    const stored = readCockpitGroup(block, slot, at);
    if (stored.length !== images.length) throw new SourceError('geometry-mismatch', `${at}.elements`, 'the group element count differs from the declared one');
    stored.forEach(({ recordOffset: offset, x, y }, index) => {
      const { width, height } = readImageRecordHeader(block, offset, at);
      const element = `${at}.elements[${index}]`;
      if (x < 0 || x + width > frame.width) throw new SourceError('geometry-mismatch', `${element}.x`, 'the element lies outside the declared frame');
      if (y < 0 || y + height > frame.height) throw new SourceError('geometry-mismatch', `${element}.y`, 'the element lies outside the declared frame');
    });
    return images.map((image, index) => ({ image, x: stored[index].x, y: stored[index].y }));
  }

  /** The status display messages of a DIAG entry, charged once their structure is checked and before any text is copied. */
  messages(declaration: DataDeclaration, { block, relocations, format }: MessagesSource): void {
    const at = `graphics[${declaration.asset.id}]`;
    const payload = readStatusMessages({ bytes: block, relocations }, format, at, payloadBytes => this.#charge(declaration, { payloadBytes }));
    this.#add(declaration, [], encodeStatusMessagesPayload(payload, at), 'palette', STATUS_MESSAGES_SCHEMA_VERSION);
  }

  /** The view labels of a TABL view label entry, charged before their payload is allocated. */
  viewLabels(declaration: DataDeclaration, { archive, read }: ViewLabelsSource): void {
    const bytes = encodeViewLabelsPayload(parseViewLabels(archive, read), payloadBytes => this.#charge(declaration, { payloadBytes }));
    this.#add(declaration, [], bytes, 'palette', VIEW_LABELS_SCHEMA_VERSION);
  }

  /** The HUD text, charged before its payload is allocated. */
  hudText(declaration: DataDeclaration, { content }: HudTextSource): void {
    const bytes = encodeHudTextPayload(content, payloadBytes => this.#charge(declaration, { payloadBytes }));
    this.#add(declaration, [], bytes, 'palette', HUD_TEXT_SCHEMA_VERSION);
  }

  /**
   * The map geometry from its CCKD instrument record and font. The encoder reads it strictly before it is charged and
   * allocated; content the reader rejects is `unsupported-payload` at the reader's structural path.
   */
  mapGeometry(declaration: DataDeclaration, { block, layout, instrumentType, font }: MapGeometrySource): void {
    const at = `graphics[${declaration.asset.id}]`;
    const content = { ...readCockpitInstrument(block, layout, instrumentType, at), informationLineHeight: readCockpitFont(block, font, at).height };
    const bytes = unsupportedContent(at, () => encodeMapGeometryPayload(content, payloadBytes => this.#charge(declaration, { payloadBytes })));
    this.#mapGeometry = content;
    this.#add(declaration, [], bytes, 'palette', MAP_GEOMETRY_SCHEMA_VERSION);
  }

  /**
   * The cockpit instruments (P3-13 spec, DC-02) from the CCKD slots of the format's layout numbers and the target view
   * distance region: each slot must be at the format's directory index, and each element is paired with its declared
   * image, so every element needs one. The encoder reads the content strictly before it is charged and allocated;
   * content the reader rejects is `unsupported-payload` at the reader's structural path.
   */
  instruments(declaration: DataDeclaration, { entry, distances, elementImages }: CockpitInstrumentsSource): void {
    const at = `graphics[${declaration.asset.id}]`;
    const { slots: formats, targetViewDistances: distanceCount } = COCKPIT_INSTRUMENTS_FORMAT;
    if (distances.length !== distanceCount * 4) {
      throw new SourceError('unsupported-payload', `${at}.targetViewDistances`, 'the target view distance region must hold exactly 20 f32 values');
    }
    const slots = formats.map((format, index) => {
      const slot = readCockpitInstrumentSlot(entry, format.layoutNumber, at);
      if (slot.slot !== format.slot) throw new SourceError('unsupported-payload', `${at}.groups`, 'the slot of the layout number must be at its directory index');
      const images = elementImages[index];
      if (slot.elements.length !== images.length) throw new SourceError('invalid-declaration', `${at}.elements`, 'every element of the slot must have its declared image');
      return {
        slot: format.slot, layoutNumber: format.layoutNumber, alwaysRedraw: slot.alwaysRedraw, layout: format.layout,
        elements: slot.elements.map(({ flags: [pass, everyFrame] }, index) => ({ image: images[index], pass, everyFrame: everyFrame !== 0 })),
        instruments: slot.instruments,
      };
    });
    const view = new DataView(distances.buffer, distances.byteOffset, distances.byteLength);
    const targetViewDistances = Array.from({ length: distanceCount }, (_, index) => view.getFloat32(index * 4, true));
    const content = unsupportedContent(at, () => readCockpitInstruments({ slots, targetViewDistances }));
    const bytes = unsupportedContent(at, () => encodeCockpitInstrumentsPayload(content, payloadBytes => this.#charge(declaration, { payloadBytes })));
    this.#instruments = { at, content };
    this.#add(declaration, [], bytes, 'palette', COCKPIT_INSTRUMENTS_SCHEMA_VERSION);
  }

  /**
   * Checks the converted cockpit instruments against the converted layouts and map geometry they share facts with
   * (checkCockpitInstruments), when the set holds all three; a disagreement between the source records is
   * `unsupported-payload`. A set without them is an incomplete group, which package validation reports.
   */
  checkInstruments(layouts: ReadonlyMap<string, LayoutPayload>): void {
    if (!this.#instruments || !this.#mapGeometry) return;
    const { at, content } = this.#instruments;
    const [front, mapFrame] = COCKPIT_INSTRUMENTS_FORMAT.slots.map(({ layout }) => layouts.get(layout ?? ''));
    const mapGeometry = this.#mapGeometry;
    if (front && mapFrame) unsupportedContent(at, () => checkCockpitInstruments(content, { front, mapFrame, mapGeometry }));
  }

  /** A layout of checked elements; the element images themselves are converted as images. */
  layout(declaration: LayoutDeclaration, elements: readonly LayoutElement[]): void {
    const at = `graphics[${declaration.asset.id}]`;
    this.#charge(declaration, { dependencyEdges: elements.length, payloadBytes: layoutPayloadLength({ elements }) });
    this.#add(declaration, layoutImages({ elements }), encodeLayoutPayload({ frame: declaration.frame, elements }, at), 'image');
  }
}

/** The result of `read`, whose content contract errors are source content the readers reject at `at`. */
function unsupportedContent<T>(at: string, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof ContentContractError) throw new SourceError('unsupported-payload', `${at}.${error.path}`, error.reason);
    throw error;
  }
}

/** Makes every pixel of index `key` transparent (index 0) and returns the packed mask. */
function colourKeyMask(indices: Uint8Array, width: number, height: number, key: number): Uint8Array<ArrayBuffer> {
  const stride = maskStride(width);
  const mask = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (indices[y * width + x] === key) indices[y * width + x] = 0;
      else mask[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return mask;
}

function reverseRows(rows: Uint8Array, rowBytes: number, height: number): Uint8Array<ArrayBuffer> {
  const reversed = new Uint8Array(rows.length);
  for (let y = 0; y < height; y++) reversed.set(rows.subarray(y * rowBytes, (y + 1) * rowBytes), (height - 1 - y) * rowBytes);
  return reversed;
}

/**
 * Converts a declaration set from its Assets' source bytes: palettes first, then images, fonts, data (status messages,
 * view labels, the HUD text, the map geometry and the cockpit instruments, a `data` Asset's role selecting its source)
 * and layouts, each kind in Asset ID order. Layouts are checked against their groups before anything is converted, so an
 * element the group lacks is reported as the layout's count mismatch rather than as its image's missing record. The
 * cockpit instruments are checked last against their layouts and the map geometry when the set holds them. Every Asset is charged against
 * `limits` on top of `usage`, the conversion usage of earlier steps (never source reads), before anything sized by it
 * is read or allocated. Any failure rejects the whole set without results; a rejected charge leaves the caller's usage
 * as it was.
 */
export function convertGraphics(
  declarations: unknown,
  sources: ReadonlyMap<string, GraphicsSource>,
  limits: unknown,
  usage: unknown = EMPTY_BUDGET_USAGE,
): GraphicsConversion {
  const checked = readGraphicsDeclarations(declarations);
  const conversion = new Conversion(limits, usage);
  const order = (kind: GraphicsDeclaration['asset']['kind']) =>
    checked.filter(({ asset }) => asset.kind === kind).sort((left, right) => compareText(left.asset.id, right.asset.id));
  const sourceOf = (declaration: GraphicsDeclaration): GraphicsSource => {
    const { asset: { id, kind }, role } = declaration;
    const source = sources.get(id);
    if (!source) {
      throw new SourceError('invalid-declaration', `graphics.declarations[${checked.indexOf(declaration)}]`, 'the Asset has no source');
    }
    if (kind === 'data' ? source.type !== GRAPHICS_DATA_SOURCES[role] : !SOURCE_TYPES[kind].includes(source.type)) {
      throw new SourceError('invalid-declaration', `graphics[${id}].${SOURCE_FIELDS[kind]}`, 'the source does not supply this kind');
    }
    return source;
  };
  const layouts = order('layout') as LayoutDeclaration[];
  const layoutElements = layouts.map(declaration => conversion.layoutElements(declaration, sourceOf(declaration) as LayoutSource));
  for (const declaration of [...order('palette'), ...order('image'), ...order('font'), ...order('data')]) {
    const source = sourceOf(declaration);
    if (declaration.asset.kind === 'palette') conversion.palette(declaration as PaletteDeclaration, source as PaletteSource);
    else if (declaration.asset.kind === 'image') conversion.image(declaration as ImageDeclaration, source as ImageSourceOf);
    else if (declaration.asset.kind === 'font') conversion.font(declaration as FontDeclaration, source as FontSource);
    else if (source.type === 'view-labels') conversion.viewLabels(declaration as DataDeclaration, source);
    else if (source.type === 'hud-text') conversion.hudText(declaration as DataDeclaration, source);
    else if (source.type === 'map-geometry') conversion.mapGeometry(declaration as DataDeclaration, source);
    else if (source.type === 'cockpit-instruments') conversion.instruments(declaration as DataDeclaration, source);
    else conversion.messages(declaration as DataDeclaration, source as MessagesSource);
  }
  layouts.forEach((declaration, index) => conversion.layout(declaration, layoutElements[index]));
  conversion.checkInstruments(new Map(layouts.map((declaration, index) =>
    [declaration.asset.id as string, { kind: 'layout', frame: declaration.frame, elements: layoutElements[index] } as const])));
  return Object.freeze({
    assets: Object.freeze(conversion.assets.sort((left, right) => compareText(left.descriptor.id, right.descriptor.id))),
    usage: conversion.usage,
  });
}
