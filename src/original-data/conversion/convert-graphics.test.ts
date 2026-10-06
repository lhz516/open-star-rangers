import { describe, expect, it } from 'vitest';
import { BUDGET_DIMENSIONS, EMPTY_BUDGET_USAGE, type BudgetDimension, type BudgetRecord } from '../../content/budget.ts';
import { readFontPayload } from '../../content/graphics/font-payload.ts';
import { checkGraphicsBinding } from '../../content/graphics/graphics-binding.ts';
import { readImagePayload } from '../../content/graphics/image-payload.ts';
import { readPalettePayload } from '../../content/graphics/palette-payload.ts';
import { payloadTransferList } from '../../content/ownership.ts';
import { payloadMismatch } from '../../content/payload.ts';
import type { SourceError } from '../source-error.ts';
import {
  cockpitBlock, dataPaletteBlock, expectSourceError, fontDeclaration, hudFontTables, imageDeclaration, paletteDeclaration,
  rawImageBlock, spriteImageBlock,
} from './conversion.test-support.ts';
import { convertGraphics, type GraphicsSource } from './convert-graphics.ts';
import { readDataPalette } from './source-graphics.ts';

const SIXTEEN_BGR = Array.from({ length: 48 }, (_, index) => (index * 5) & 0xff);
const TEXTURE = rawImageBlock(3, 2, [1, 2, 3, 4, 5, 6], SIXTEEN_BGR);
// 5×3 sprite. Row 0: transparent 0, opaque 2 (1, 2), transparent 3. Row 1: transparent 5. Row 2: 1, opaque 3, 1.
const SPRITE = spriteImageBlock(5, 3, [0, 0, 2, 0, 1, 2, 3, 0, 5, 0, 1, 0, 3, 0, 3, 4, 5, 1, 0]);
const FONTS = hudFontTables();
const DATA = dataPaletteBlock();

const LIMITS: BudgetRecord = { ...EMPTY_BUDGET_USAGE, assets: 100, dependencyEdges: 100, paletteEntries: 1000, imagePixels: 1000, glyphs: 1000, payloadBytes: 100_000 };

function declarations(overrides: Record<string, Record<string, unknown>> = {}) {
  return [
    paletteDeclaration('palette/flight'),
    paletteDeclaration('palette/texture'),
    imageDeclaration('image/panel', 'palette/texture', { display: { nearest: 'palette/flight' }, ...overrides['image/panel'] }),
    imageDeclaration('image/sprite', 'palette/flight', overrides['image/sprite']),
    fontDeclaration('font/hud', {
      cell: { width: 4, height: 6 }, glyphRows: 6, charMap: [{ firstCode: 0x41, firstGlyph: 33, count: 2 }, { firstCode: 0x20, firstGlyph: 0, count: 1 }],
      ...overrides['font/hud'],
    }),
  ];
}

function sources(overrides: Record<string, GraphicsSource | undefined> = {}): Map<string, GraphicsSource> {
  const all: Record<string, GraphicsSource | undefined> = {
    'palette/flight': { type: 'data-palette', block: DATA },
    'palette/texture': { type: 'embedded-palette', block: TEXTURE },
    'image/panel': { type: 'image-record', block: TEXTURE },
    'image/sprite': { type: 'image-record', block: SPRITE },
    'font/hud': { type: 'cockpit-font', block: cockpitBlock(FONTS), index: 2 },
    ...overrides,
  };
  return new Map(Object.entries(all).filter((entry): entry is [string, GraphicsSource] => entry[1] !== undefined));
}

const convert = (overrides: Record<string, Record<string, unknown>> = {}, sourceOverrides: Record<string, GraphicsSource | undefined> = {}, limits: unknown = LIMITS) =>
  convertGraphics(declarations(overrides), sources(sourceOverrides), limits);

const payloadOf = (result: ReturnType<typeof convert>, id: string) => result.assets.find(({ descriptor }) => descriptor.id === id)!.payload;
const imageOf = (result: ReturnType<typeof convert>, id: string) => readImagePayload(payloadOf(result, id).bytes, 1);

describe('graphics conversion', () => {
  it('converts palettes, images and a font into canonical payloads with matching descriptors', () => {
    const result = convert();
    expect(result.assets.map(({ descriptor: { id, kind, role, group, dependencies } }) => ({ id, kind, role, group, dependencies: dependencies.map(dependency => dependency.id) }))).toEqual([
      { id: 'font/hud', kind: 'font', role: 'font', group: 'cockpit-hud-map', dependencies: [] },
      { id: 'image/panel', kind: 'image', role: 'hud-mfd', group: 'cockpit-hud-map', dependencies: ['palette/flight', 'palette/texture'] },
      { id: 'image/sprite', kind: 'image', role: 'hud-mfd', group: 'cockpit-hud-map', dependencies: ['palette/flight'] },
      { id: 'palette/flight', kind: 'palette', role: 'flight-palette', group: 'cockpit-hud-map', dependencies: [] },
      { id: 'palette/texture', kind: 'palette', role: 'flight-palette', group: 'cockpit-hud-map', dependencies: [] },
    ]);
    const readers = { font: readFontPayload, image: readImagePayload, palette: readPalettePayload } as const;
    for (const { descriptor, payload } of result.assets) {
      expect(payloadMismatch(descriptor.payloadIdentity, payload)).toBeNull();
      expect(() => checkGraphicsBinding(descriptor, readers[descriptor.kind as keyof typeof readers](payload.bytes, payload.schemaVersion))).not.toThrow();
    }
    expect(payloadTransferList(result.assets.map(({ payload }) => payload.bytes))).toHaveLength(5);
    expect(readPalettePayload(payloadOf(result, 'palette/flight').bytes, 1).entries).toEqual(readDataPalette(DATA));
    expect([...readPalettePayload(payloadOf(result, 'palette/texture').bytes, 1).entries.subarray(0, 6)]).toEqual([10, 5, 0, 25, 20, 15]);
    expect(imageOf(result, 'image/panel')).toMatchObject({ width: 3, height: 2, display: { nearest: 'palette/flight' }, mask: null, indices: new Uint8Array([1, 2, 3, 4, 5, 6]) });
    expect(imageOf(result, 'image/sprite')).toMatchObject({ display: 'direct', indices: new Uint8Array([1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 4, 5, 0]), mask: new Uint8Array([0b1100_0000, 0, 0b0111_0000]) });
    const font = readFontPayload(payloadOf(result, 'font/hud').bytes, 1);
    expect(font).toMatchObject({ cellWidth: 4, height: 6, glyphRows: 6, glyphs: FONTS[2].subarray(4), charMap: [{ code: 0x20, glyph: 0 }, { code: 0x41, glyph: 33 }, { code: 0x42, glyph: 34 }] });
    const payloadBytes = result.assets.reduce((total, { payload }) => total + payload.bytes.length, 0);
    expect(result.usage).toEqual({ ...EMPTY_BUDGET_USAGE, assets: 5, dependencyEdges: 3, paletteEntries: 272, imagePixels: 21, glyphs: 256, payloadBytes });
  });

  it('splits the unchanged table bytes into glyphs of the declared rows and charges their count', () => {
    const result = convert({ 'font/hud': { glyphRows: 8, charMap: [{ firstCode: 0x41, firstGlyph: 191, count: 1 }] } });
    expect(readFontPayload(payloadOf(result, 'font/hud').bytes, 1)).toEqual({
      kind: 'font', cellWidth: 4, height: 6, glyphRows: 8, glyphs: FONTS[2].subarray(4), charMap: [{ code: 0x41, glyph: 191 }],
    });
    expect(result.usage.glyphs).toBe(192);
  });

  it('converts the same input to the same bytes and identities', () => {
    const [first, second] = [convert(), convert()];
    expect(second.assets.map(({ descriptor }) => descriptor)).toEqual(first.assets.map(({ descriptor }) => descriptor));
    second.assets.forEach(({ payload }, index) => expect(payload.bytes).toEqual(first.assets[index].payload.bytes));
  });

  it('reverses rows only when declared', () => {
    const result = convert({ 'image/panel': { rowOrder: 'reversed' }, 'image/sprite': { rowOrder: 'reversed' } });
    expect([...imageOf(result, 'image/panel').indices]).toEqual([4, 5, 6, 1, 2, 3]);
    expect(imageOf(result, 'image/sprite')).toMatchObject({
      indices: new Uint8Array([0, 3, 4, 5, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0]), mask: new Uint8Array([0b0111_0000, 0, 0b1100_0000]),
    });
  });

  it('makes a declared colour key transparent in a raw image and leaves other pixels unchanged', () => {
    expect(imageOf(convert({ 'image/panel': { alpha: { colourKey: 2 } } }), 'image/panel')).toMatchObject({
      indices: new Uint8Array([1, 0, 3, 4, 5, 6]), mask: new Uint8Array([0b1010_0000, 0b1110_0000]),
    });
    expectSourceError(() => convert({ 'image/sprite': { alpha: { colourKey: 0 } } }), 'invalid-declaration', 'graphics[image/sprite].alpha');
  });

  it('rejects an opaque index beyond the bound palette but not the same index made transparent', () => {
    const outOfRange = rawImageBlock(3, 2, [1, 16, 3, 4, 5, 6], SIXTEEN_BGR);
    const blocks = { 'palette/texture': { type: 'embedded-palette', block: outOfRange }, 'image/panel': { type: 'image-record', block: outOfRange } } as const;
    expectSourceError(() => convert({}, blocks), 'palette-index-out-of-range', 'graphics[image/panel].pixels');
    expect(imageOf(convert({ 'image/panel': { alpha: { colourKey: 16 } } }, blocks), 'image/panel').indices[1]).toBe(0);
  });

  it('checks the declared font cell and the font index', () => {
    expectSourceError(() => convert({ 'font/hud': { cell: { width: 8, height: 8 }, glyphRows: 8 } }), 'geometry-mismatch', 'graphics[font/hud].glyphs');
    expectSourceError(() => convert({}, { 'font/hud': { type: 'cockpit-font', block: cockpitBlock(FONTS), index: 3 } }), 'subresource-not-found', 'graphics[font/hud].fonts');
  });

  it.each<[string, Record<string, GraphicsSource | undefined>, string, string]>([
    ['a palette from an image record', { 'palette/flight': { type: 'image-record', block: TEXTURE } }, 'invalid-declaration', 'graphics[palette/flight].palette'],
    ['an image from a font', { 'image/sprite': { type: 'cockpit-font', block: cockpitBlock(FONTS), index: 0 } }, 'invalid-declaration', 'graphics[image/sprite].record'],
    ['a font from a palette', { 'font/hud': { type: 'data-palette', block: DATA } }, 'invalid-declaration', 'graphics[font/hud].fonts'],
    ['a missing source', { 'image/sprite': undefined }, 'invalid-declaration', 'graphics.declarations[3]'],
    ['a malformed DATA entry', { 'palette/flight': { type: 'data-palette', block: DATA.subarray(1) } }, 'invalid-payload', 'graphics[palette/flight].palette'],
    ['a record without an embedded palette', { 'palette/texture': { type: 'embedded-palette', block: SPRITE } }, 'subresource-not-found', 'graphics[palette/texture].palette'],
    ['a truncated sprite', { 'image/sprite': { type: 'image-record', block: SPRITE.subarray(0, -1) } }, 'invalid-payload', 'graphics[image/sprite].pixels'],
  ])('rejects %s with a located source error', (_, overrides, code, location) => expectSourceError(() => convert({}, overrides), code, location));

  describe('budget', () => {
    const exact = convert().usage;
    const charged: BudgetDimension[] = ['assets', 'dependencyEdges', 'paletteEntries', 'imagePixels', 'glyphs', 'payloadBytes'];

    it('passes when the usage reaches each limit exactly and never charges source reads', () => {
      expect(convert({}, {}, exact).usage).toEqual(exact);
      expect(exact.sourceReadBytes).toBe(0);
      expect(BUDGET_DIMENSIONS.filter(dimension => !charged.includes(dimension)).map(dimension => exact[dimension])).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it.each(charged)('rejects the whole set when %s would exceed its limit', dimension => {
      const limits = { ...exact, [dimension]: exact[dimension] - 1 };
      let error: SourceError | undefined;
      try {
        convert({}, {}, limits);
      } catch (thrown) {
        error = thrown as SourceError;
      }
      expect(error).toMatchObject({ code: 'budget-exceeded', limit: { name: dimension, limit: exact[dimension] - 1, observed: exact[dimension] } });
      expect(error!.location).toMatch(/^graphics\[[a-z/-]+\]\.(palette|pixels|glyphs)$/);
    });

    it('charges an image before decoding it and leaves the caller usage unchanged', () => {
      const usage = { ...EMPTY_BUDGET_USAGE, imagePixels: 10 };
      expectSourceError(
        // The record is well formed but its first run overflows the row, which only decoding would find.
        () => convertGraphics(declarations(), sources({ 'image/sprite': { type: 'image-record', block: spriteImageBlock(5, 3, [6, 0]) } }), { ...LIMITS, imagePixels: 21 }, usage),
        'budget-exceeded', 'graphics[image/sprite].pixels', { name: 'imagePixels', limit: 21, observed: 31 },
      );
      expect(usage).toEqual({ ...EMPTY_BUDGET_USAGE, imagePixels: 10 });
      expectSourceError(() => convert({}, { 'image/sprite': { type: 'image-record', block: spriteImageBlock(5, 3, [6, 0]) } }), 'invalid-payload', 'graphics[image/sprite].pixels');
      expect(convertGraphics(declarations(), sources(), LIMITS, usage).usage.imagePixels).toBe(31);
    });

    it('refuses a starting usage that includes source reads', () => {
      expect(() => convertGraphics(declarations(), sources(), LIMITS, { ...EMPTY_BUDGET_USAGE, sourceReadBytes: 1 }))
        .toThrowError(expect.objectContaining({ code: 'invalid-budget-value', path: 'usage.sourceReadBytes' }));
    });

    it('reports a total beyond the safe integer range with a null observation', () => {
      const usage = { ...EMPTY_BUDGET_USAGE, payloadBytes: Number.MAX_SAFE_INTEGER };
      expectSourceError(() => convertGraphics(declarations(), sources(), { ...LIMITS, payloadBytes: Number.MAX_SAFE_INTEGER }, usage),
        'budget-exceeded', 'graphics[palette/flight].palette', { name: 'payloadBytes', limit: Number.MAX_SAFE_INTEGER, observed: null });
    });
  });
});
