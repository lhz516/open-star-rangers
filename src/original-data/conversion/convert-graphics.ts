import { readAssetDescriptor, type AssetDescriptor } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { chargeBudget, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import { encodeFontPayload, fontPayloadLength, type CharMapEntry } from '../../content/graphics/font-payload.ts';
import { imagePalettes, layoutImages } from '../../content/graphics/graphics-binding.ts';
import { GRAPHICS_LIMITS, GRAPHICS_SCHEMA_VERSION } from '../../content/graphics/graphics-format.ts';
import { encodeImagePayload, imagePayloadLength, maskStride } from '../../content/graphics/image-payload.ts';
import { encodeLayoutPayload, layoutPayloadLength, type LayoutElement } from '../../content/graphics/layout-payload.ts';
import { encodePalettePayload, palettePayloadLength } from '../../content/graphics/palette-payload.ts';
import type { PayloadRecord } from '../../content/payload.ts';
import { sha256Fingerprint } from '../../content/sha256.ts';
import { SourceError } from '../source-error.ts';
import { readConversionUsage } from './conversion-budget.ts';
import {
  declaredGlyphCount, readGraphicsDeclarations, type FontDeclaration, type GraphicsDeclaration, type GraphicsKind, type ImageDeclaration,
  type LayoutDeclaration, type PaletteDeclaration,
} from './graphics-declarations.ts';
import {
  checkPaletteIndices, cockpitElementRecordOffset, decodeImageRecord, mfdRecordOffset, readCockpitFont, readCockpitGroup, readCockpitGroupPalette, readDataPalette,
  readEmbeddedPalette, readImageRecordHeader, tableRecordOffset,
} from './source-graphics.ts';

/** The graphics converter's component of the production `ConverterVersion`; bump it when graphics output changes. */
export const GRAPHICS_CONVERTER_COMPONENT = 'graphics-2';

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

/** The source bytes of one Asset, already read from its mapped entry. */
export type GraphicsSource = PaletteSource | ImageSource | FontSource | LayoutSource;

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

const SOURCE_TYPES: Readonly<Record<GraphicsKind, readonly GraphicsSource['type'][]>> =
  Object.freeze({ palette: ['data-palette', 'embedded-palette', 'cockpit-group-palette'], image: ['image-record'], font: ['cockpit-font'], layout: ['cockpit-group'] });
const SOURCE_FIELDS = Object.freeze({ palette: 'palette', image: 'record', font: 'fonts', layout: 'groups' });
/** The field a budget rejection is reported at, per kind. */
const BUDGET_FIELDS = Object.freeze({ palette: 'palette', image: 'pixels', font: 'glyphs', layout: 'elements' });

/** Block offset of the image record a source selects: 0 for a whole-entry record. */
function recordOffset(block: Uint8Array, record: RecordSelector | undefined, at: string): number {
  switch (record?.container) {
    case undefined: return 0;
    case 'cockpit-element': return cockpitElementRecordOffset(block, record.slot, record.index, at);
    case 'mfd-record': return mfdRecordOffset(block, record.list, record.index, at);
    case 'table-record': return tableRecordOffset(block, record.index, at);
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

  #add(declaration: GraphicsDeclaration, dependencies: readonly AssetId[], bytes: Uint8Array, dependencyKind: 'palette' | 'image' = 'palette'): void {
    const { asset: { id, kind }, role, group } = declaration;
    const descriptor = readAssetDescriptor({
      id, kind, role, group,
      dependencies: dependencies.map(dependency => ({ id: dependency, kind: dependencyKind })),
      payloadIdentity: { schemaVersion: GRAPHICS_SCHEMA_VERSION, byteLength: bytes.length, fingerprint: sha256Fingerprint(bytes) },
    });
    this.assets.push(Object.freeze({ descriptor, payload: Object.freeze({ id, schemaVersion: GRAPHICS_SCHEMA_VERSION, bytes }) }));
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

  image(declaration: ImageDeclaration, { block, record }: ImageSource): void {
    const { asset: { id }, palette, display, alpha, rowOrder } = declaration;
    const at = `graphics[${id}]`;
    const offset = recordOffset(block, record, at);
    const { encoding, width, height } = readImageRecordHeader(block, offset, at);
    if (alpha !== 'encoding' && encoding !== 'raw') throw new SourceError('invalid-declaration', `${at}.alpha`, 'a colour key applies only to raw images');
    const masked = encoding === 'sprite-rle' || alpha !== 'encoding';
    const dependencies = imagePalettes(declaration);
    this.#charge(declaration, {
      dependencyEdges: dependencies.length,
      imagePixels: width * height,
      payloadBytes: imagePayloadLength({ width, height, palette, display }, masked),
    });
    const decoded = decodeImageRecord(block, offset, at);
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

  /** A layout of checked elements; the element images themselves are converted as images. */
  layout(declaration: LayoutDeclaration, elements: readonly LayoutElement[]): void {
    const at = `graphics[${declaration.asset.id}]`;
    this.#charge(declaration, { dependencyEdges: elements.length, payloadBytes: layoutPayloadLength({ elements }) });
    this.#add(declaration, layoutImages({ elements }), encodeLayoutPayload({ frame: declaration.frame, elements }, at), 'image');
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
 * Converts a declaration set from its Assets' source bytes: palettes first, then images, fonts and layouts, each kind in
 * Asset ID order. Layouts are checked against their groups before anything is converted, so an element the group lacks
 * is reported as the layout's count mismatch rather than as its image's missing record. Every Asset is charged against
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
    const { id, kind } = declaration.asset;
    const source = sources.get(id);
    if (!source) {
      throw new SourceError('invalid-declaration', `graphics.declarations[${checked.indexOf(declaration)}]`, 'the Asset has no source');
    }
    if (!SOURCE_TYPES[kind].includes(source.type)) {
      throw new SourceError('invalid-declaration', `graphics[${id}].${SOURCE_FIELDS[kind]}`, 'the source does not supply this kind');
    }
    return source;
  };
  const layouts = order('layout') as LayoutDeclaration[];
  const layoutElements = layouts.map(declaration => conversion.layoutElements(declaration, sourceOf(declaration) as LayoutSource));
  for (const declaration of [...order('palette'), ...order('image'), ...order('font')]) {
    const source = sourceOf(declaration);
    if (declaration.asset.kind === 'palette') conversion.palette(declaration as PaletteDeclaration, source as PaletteSource);
    else if (declaration.asset.kind === 'image') conversion.image(declaration as ImageDeclaration, source as ImageSource);
    else conversion.font(declaration as FontDeclaration, source as FontSource);
  }
  layouts.forEach((declaration, index) => conversion.layout(declaration, layoutElements[index]));
  return Object.freeze({
    assets: Object.freeze(conversion.assets.sort((left, right) => compareText(left.descriptor.id, right.descriptor.id))),
    usage: conversion.usage,
  });
}
