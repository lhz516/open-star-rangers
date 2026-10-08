import { readAssetReference, readResourceGroup, readRole, type ResourceGroup } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { ContentContractError, fail, readArray, readRecord, requireFields } from '../../content/contract-validation.ts';
import { GRAPHICS_LIMITS, readPaletteReference, readReference, requireInteger as integer } from '../../content/graphics/graphics-format.ts';
import type { ImageDisplay } from '../../content/graphics/image-payload.ts';
import { layoutFrame, type LayoutFrame } from '../../content/graphics/layout-payload.ts';
import { STATUS_MESSAGES_ROLE } from '../../content/hud/status-messages-payload.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { SourceError } from '../source-error.ts';

// Graphics conversion declarations (docs/plan/p2/05/spec.md, graphics conversion declarations, and
// docs/plan/p2/07/spec.md, layout conversion declarations and status display messages): plain data paired one to one
// with source mappings but without locators. Non-default choices (nearest display, colour keys, reversed rows and
// character map ranges) need evidence linked from the Asset's mapping.

/** The kinds the graphics step converts; its only `data` Asset kind is the status display messages. */
export type GraphicsKind = 'palette' | 'image' | 'font' | 'layout' | 'data';

interface DeclarationBase<Kind extends GraphicsKind> {
  readonly asset: { readonly id: AssetId; readonly kind: Kind };
  readonly role: string;
  readonly group: ResourceGroup;
}

/** The source format is never declared: a DATA entry is a 6-bit VGA palette, a `palette` subresource embedded BGR. */
export type PaletteDeclaration = DeclarationBase<'palette'>;

export interface ImageDeclaration extends DeclarationBase<'image'> {
  /** A palette declared in the same set and group. */
  readonly palette: AssetId;
  /** `nearest` names another palette declared in the same set and group. */
  readonly display: ImageDisplay;
  /** Transparency from the encoding, or every pixel of one index in a raw image. */
  readonly alpha: 'encoding' | { readonly colourKey: number };
  readonly rowOrder: 'stored' | 'reversed';
}

/** Codes firstCode … firstCode + count − 1 map to glyphs firstGlyph … firstGlyph + count − 1. */
export interface CharMapRange {
  readonly firstCode: number;
  readonly firstGlyph: number;
  readonly count: number;
}

export interface FontDeclaration extends DeclarationBase<'font'> {
  /** The expected glyph cell. */
  readonly cell: { readonly width: number; readonly height: number };
  /**
   * Rows stored per glyph, from the cell height to 8; the source table's 256 × height glyph bytes are split into
   * glyphs of this many rows. A value other than the cell height needs evidence.
   */
  readonly glyphRows: number;
  /** Ranges with disjoint codes, all inside 0–255, whose glyphs are below the glyph count. */
  readonly charMap: readonly CharMapRange[];
}

/** The status display messages; their format comes from the source (P2-07 spec, status display messages). */
export type MessagesDeclaration = DeclarationBase<'data'>;

export interface LayoutDeclaration extends DeclarationBase<'layout'> {
  readonly frame: LayoutFrame;
  /** 1–16 distinct images in stored element order, each declared in the same set and group. */
  readonly elements: readonly AssetId[];
}

/** Glyphs of a declared font: its source table holds 256 × cell height bytes. */
export const declaredGlyphCount = ({ cell, glyphRows }: Pick<FontDeclaration, 'cell' | 'glyphRows'>): number =>
  GRAPHICS_LIMITS.glyphCount * cell.height / glyphRows;

export type GraphicsDeclaration = PaletteDeclaration | ImageDeclaration | FontDeclaration | LayoutDeclaration | MessagesDeclaration;

const FIELDS: Readonly<Record<GraphicsKind, readonly string[]>> = {
  palette: ['asset', 'role', 'group'],
  image: ['asset', 'role', 'group', 'palette', 'display', 'alpha', 'rowOrder'],
  font: ['asset', 'role', 'group', 'cell', 'glyphRows', 'charMap'],
  layout: ['asset', 'role', 'group', 'frame', 'elements'],
  data: ['asset', 'role', 'group'],
};

const isGraphicsKind = (kind: string): kind is GraphicsKind => Object.hasOwn(FIELDS, kind);

function readDisplay(value: unknown, path: string): ImageDisplay {
  if (value === 'direct') return value;
  const record = readRecord(value, path);
  requireFields(record, path, ['nearest']);
  return Object.freeze({ nearest: readPaletteReference(record.nearest, `${path}.nearest`) });
}

function readAlpha(value: unknown, path: string): ImageDeclaration['alpha'] {
  if (value === 'encoding') return value;
  const record = readRecord(value, path);
  requireFields(record, path, ['colourKey']);
  return Object.freeze({ colourKey: integer(record.colourKey, 0, 255, `${path}.colourKey`) });
}

function readCharMap(value: unknown, glyphCount: number, path: string): readonly CharMapRange[] {
  const used = new Uint8Array(256);
  return readArray(value, path, 'invalid-record', (item, at) => {
    const record = readRecord(item, at);
    requireFields(record, at, ['firstCode', 'firstGlyph', 'count']);
    const firstCode = integer(record.firstCode, 0, 255, `${at}.firstCode`);
    const firstGlyph = integer(record.firstGlyph, 0, glyphCount - 1, `${at}.firstGlyph`);
    const count = integer(record.count, 1, 256, `${at}.count`);
    if (count > 256 - firstCode || count > glyphCount - firstGlyph) fail('invalid-record', `${at}.count`, 'must keep codes inside 0 to 255 and glyphs below the glyph count');
    if (used.subarray(firstCode, firstCode + count).includes(1)) fail('invalid-record', at, 'must not overlap the codes of another range');
    used.fill(1, firstCode, firstCode + count);
    return Object.freeze({ firstCode, firstGlyph, count });
  });
}

function readLayout(record: Record<string, unknown>, base: DeclarationBase<'layout'>, path: string): LayoutDeclaration {
  const fields = readRecord(record.frame, `${path}.frame`);
  requireFields(fields, `${path}.frame`, ['width', 'height']);
  const frame = layoutFrame(fields.width, fields.height, `${path}.frame`);
  const elements = readArray(record.elements, `${path}.elements`, 'invalid-record', (item, at) => readReference(item, 'image', at));
  if (elements.length < 1 || elements.length > GRAPHICS_LIMITS.layoutElements) fail('invalid-record', `${path}.elements`, 'must list 1 to 16 images');
  elements.forEach((image, index) => {
    if (elements.indexOf(image) !== index) fail('invalid-record', `${path}.elements[${index}]`, 'must differ from every other element image');
  });
  return Object.freeze({ ...base, frame, elements });
}

function readDeclaration(value: unknown, path: string): GraphicsDeclaration {
  const record = readRecord(value, path);
  const asset = readAssetReference(record.asset, `${path}.asset`);
  if (!isGraphicsKind(asset.kind)) fail('invalid-kind', `${path}.asset.kind`, 'must be palette, image, font, layout or data');
  requireFields(record, path, FIELDS[asset.kind]);
  const base = { asset, role: readRole(record.role, `${path}.role`), group: readResourceGroup(record.group, `${path}.group`) };
  if (!CLASSIC_P2_SLICE.groupKinds[base.group].includes(asset.kind)) fail('kind-mismatch', `${path}.group`, 'must own the Asset kind');
  if (asset.kind === 'data' && base.role !== STATUS_MESSAGES_ROLE) fail('invalid-record', `${path}.role`, 'a data Asset must have the status messages role');
  if (asset.kind === 'palette' || asset.kind === 'data') return Object.freeze(base as PaletteDeclaration | MessagesDeclaration);
  if (asset.kind === 'layout') return readLayout(record, base as DeclarationBase<'layout'>, path);
  if (asset.kind === 'font') {
    const fields = readRecord(record.cell, `${path}.cell`);
    requireFields(fields, `${path}.cell`, ['width', 'height']);
    const cell = Object.freeze({
      width: integer(fields.width, 1, GRAPHICS_LIMITS.fontCellWidth, `${path}.cell.width`),
      height: integer(fields.height, 1, GRAPHICS_LIMITS.fontHeight, `${path}.cell.height`),
    });
    const glyphRows = integer(record.glyphRows, cell.height, GRAPHICS_LIMITS.fontHeight, `${path}.glyphRows`);
    const glyphCount = declaredGlyphCount({ cell, glyphRows });
    if (!Number.isInteger(glyphCount)) fail('invalid-record', `${path}.glyphRows`, 'must split the table into whole glyphs');
    return Object.freeze({ ...base as DeclarationBase<'font'>, cell, glyphRows, charMap: readCharMap(record.charMap, glyphCount, `${path}.charMap`) });
  }
  if (record.rowOrder !== 'stored' && record.rowOrder !== 'reversed') fail('invalid-record', `${path}.rowOrder`, 'must be stored or reversed');
  return Object.freeze({
    ...base as DeclarationBase<'image'>,
    palette: readPaletteReference(record.palette, `${path}.palette`),
    display: readDisplay(record.display, `${path}.display`),
    alpha: readAlpha(record.alpha, `${path}.alpha`),
    rowOrder: record.rowOrder,
  });
}

/** Checks that every palette an image names, and every image a layout lists, is declared in the same set and group. */
function checkBindings(declarations: readonly GraphicsDeclaration[], path: string): void {
  const groupsOf = (kind: GraphicsKind) =>
    new Map<string, ResourceGroup>(declarations.filter(({ asset }) => asset.kind === kind).map(({ asset, group }) => [asset.id, group]));
  const [palettes, images] = [groupsOf('palette'), groupsOf('image')];
  declarations.forEach((declaration, index) => {
    const at = `${path}[${index}]`;
    if (declaration.asset.kind === 'layout') {
      const { elements, group } = declaration as LayoutDeclaration;
      elements.forEach((image, element) => {
        if (images.get(image) !== group) fail('invalid-record', `${at}.elements[${element}]`, 'must be an image declared in the same group');
      });
    }
    if (declaration.asset.kind !== 'image') return;
    const { palette, display, group } = declaration as ImageDeclaration;
    if (palettes.get(palette) !== group) fail('invalid-record', `${at}.palette`, 'must be a palette declared in the same group');
    if (display !== 'direct' && palettes.get(display.nearest) !== group) {
      fail('invalid-record', `${at}.display.nearest`, 'must be a palette declared in the same group');
    }
  });
}

/**
 * Strictly reads a set of graphics declarations into frozen data. Any problem, including an unknown or missing field,
 * a duplicate Asset ID or a binding outside the set, is `invalid-declaration` at its structural path.
 */
export function readGraphicsDeclarations(value: unknown, path = 'graphics.declarations'): readonly GraphicsDeclaration[] {
  try {
    const seen = new Set<string>();
    const declarations = readArray(value, path, 'invalid-record', (item, at) => {
      const declaration = readDeclaration(item, at);
      if (seen.has(declaration.asset.id)) fail('duplicate-asset', `${at}.asset.id`, 'must be unique in the set');
      seen.add(declaration.asset.id);
      return declaration;
    });
    checkBindings(declarations, path);
    return declarations;
  } catch (error) {
    // The content readers' reasons are fixed safe text that never echoes the rejected value.
    if (error instanceof ContentContractError) throw new SourceError('invalid-declaration', error.path, error.reason);
    throw error;
  }
}
