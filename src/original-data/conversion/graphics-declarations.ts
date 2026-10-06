import { readAssetReference, readResourceGroup, readRole, type ResourceGroup } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { ContentContractError, fail, readArray, readRecord, requireFields } from '../../content/contract-validation.ts';
import { GRAPHICS_LIMITS, readPaletteReference, requireInteger as integer } from '../../content/graphics/graphics-format.ts';
import type { ImageDisplay } from '../../content/graphics/image-payload.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { SourceError } from '../source-error.ts';

// Graphics conversion declarations (docs/plan/p2/05/spec.md, graphics conversion declarations): plain data paired
// one to one with source mappings but without locators. Non-default choices (nearest display, colour keys, reversed
// rows and character map ranges) need evidence linked from the Asset's mapping.

export type GraphicsKind = 'palette' | 'image' | 'font';

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
  /** Ranges with disjoint codes, all inside 0–255. */
  readonly charMap: readonly CharMapRange[];
}

export type GraphicsDeclaration = PaletteDeclaration | ImageDeclaration | FontDeclaration;

const FIELDS: Readonly<Record<GraphicsKind, readonly string[]>> = {
  palette: ['asset', 'role', 'group'],
  image: ['asset', 'role', 'group', 'palette', 'display', 'alpha', 'rowOrder'],
  font: ['asset', 'role', 'group', 'cell', 'charMap'],
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

function readCharMap(value: unknown, path: string): readonly CharMapRange[] {
  const used = new Uint8Array(256);
  return readArray(value, path, 'invalid-record', (item, at) => {
    const record = readRecord(item, at);
    requireFields(record, at, ['firstCode', 'firstGlyph', 'count']);
    const firstCode = integer(record.firstCode, 0, 255, `${at}.firstCode`);
    const firstGlyph = integer(record.firstGlyph, 0, 255, `${at}.firstGlyph`);
    const count = integer(record.count, 1, 256, `${at}.count`);
    if (count > 256 - firstCode || count > 256 - firstGlyph) fail('invalid-record', `${at}.count`, 'must keep codes and glyphs inside 0–255');
    if (used.subarray(firstCode, firstCode + count).includes(1)) fail('invalid-record', at, 'must not overlap the codes of another range');
    used.fill(1, firstCode, firstCode + count);
    return Object.freeze({ firstCode, firstGlyph, count });
  });
}

function readDeclaration(value: unknown, path: string): GraphicsDeclaration {
  const record = readRecord(value, path);
  const asset = readAssetReference(record.asset, `${path}.asset`);
  if (!isGraphicsKind(asset.kind)) fail('invalid-kind', `${path}.asset.kind`, 'must be palette, image or font');
  requireFields(record, path, FIELDS[asset.kind]);
  const base = { asset, role: readRole(record.role, `${path}.role`), group: readResourceGroup(record.group, `${path}.group`) };
  if (!CLASSIC_P2_SLICE.groupKinds[base.group].includes(asset.kind)) fail('kind-mismatch', `${path}.group`, 'must own the Asset kind');
  if (asset.kind === 'palette') return Object.freeze(base as PaletteDeclaration);
  if (asset.kind === 'font') {
    const cell = readRecord(record.cell, `${path}.cell`);
    requireFields(cell, `${path}.cell`, ['width', 'height']);
    return Object.freeze({
      ...base as DeclarationBase<'font'>,
      cell: Object.freeze({
        width: integer(cell.width, 1, GRAPHICS_LIMITS.fontCellWidth, `${path}.cell.width`),
        height: integer(cell.height, 1, GRAPHICS_LIMITS.fontHeight, `${path}.cell.height`),
      }),
      charMap: readCharMap(record.charMap, `${path}.charMap`),
    });
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

/** Checks that every palette an image names is declared in the same set and group. */
function checkBindings(declarations: readonly GraphicsDeclaration[], path: string): void {
  const palettes = new Map<string, ResourceGroup>(declarations.filter(({ asset }) => asset.kind === 'palette').map(({ asset, group }) => [asset.id, group]));
  declarations.forEach((declaration, index) => {
    if (declaration.asset.kind !== 'image') return;
    const { palette, display, group } = declaration as ImageDeclaration;
    const at = `${path}[${index}]`;
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
