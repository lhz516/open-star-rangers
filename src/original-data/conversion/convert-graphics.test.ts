import { describe, expect, it } from 'vitest';
import { BUDGET_DIMENSIONS, EMPTY_BUDGET_USAGE, type BudgetDimension, type BudgetRecord } from '../../content/budget.ts';
import { readFontPayload } from '../../content/graphics/font-payload.ts';
import { checkGraphicsBinding } from '../../content/graphics/graphics-binding.ts';
import { readImagePayload } from '../../content/graphics/image-payload.ts';
import { readLayoutPayload } from '../../content/graphics/layout-payload.ts';
import { readPalettePayload } from '../../content/graphics/palette-payload.ts';
import { decodeViewLabelsPayload } from '../../content/hud/view-labels-payload.ts';
import { payloadTransferList } from '../../content/ownership.ts';
import { payloadMismatch } from '../../content/payload.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { decodeAnimationFrame } from '../formats/anim.ts';
import { animFrame, expectedFrame, patternFrame, syntheticAnimation } from '../formats/anim.test-support.ts';
import { entryRead } from '../formats/formats.test-support.ts';
import type { SourceError } from '../source-error.ts';
import { syntheticDiag } from '../synthetic.test-support.ts';
import {
  cockpitBlock, cockpitLayoutBlock, dataPaletteBlock, expectSourceError, fontDeclaration, hudFontTables, imageDeclaration, layoutDeclaration,
  mfdBlock, paletteDeclaration, rawImageBlock, spriteImageBlock, tableBlock, viewLabelTable, type SyntheticElement,
} from './conversion.test-support.ts';
import { convertGraphics, type GraphicsSource, type RecordSelector } from './convert-graphics.ts';
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

describe('layout and container record conversion', () => {
  const FRONT_RAW = rawImageBlock(4, 2, [1, 2, 3, 4, 5, 6, 7, 8]);
  const MAP_RECORD = rawImageBlock(2, 3, [0, 1, 2, 3, 0, 1], SIXTEEN_BGR);
  // Slot 0 touches the right edge (3 + 5 = 8) and the bottom edge (6 + 2 = 8) of an 8×8 frame; slot 1 is empty.
  const FRONT: readonly SyntheticElement[] = [{ record: FRONT_RAW, x: 0, y: 6 }, { record: SPRITE, x: 3, y: 0 }];
  const cockpitWith = (front: readonly SyntheticElement[] = FRONT) => cockpitLayoutBlock([front, [], [{ record: MAP_RECORD, x: 1, y: 1, flags: [1, 0] }]]);
  const COCKPIT = cockpitWith();
  const MFD = mfdBlock([[TEXTURE], [SPRITE]]);
  const element = (slot: number, index: number): RecordSelector => ({ container: 'cockpit-element', slot, index });
  const mfd = (list: number, index: number): RecordSelector => ({ container: 'mfd-record', list, index });

  const layoutDeclarations = (overrides: Record<string, Record<string, unknown>> = {}) => [
    paletteDeclaration('palette/flight'),
    paletteDeclaration('palette/map'),
    paletteDeclaration('palette/mfd'),
    imageDeclaration('image/front/element-0', 'palette/flight', { role: 'cockpit-element' }),
    imageDeclaration('image/front/element-1', 'palette/flight', { role: 'cockpit-element' }),
    imageDeclaration('image/map/element-0', 'palette/map', { role: 'map-frame-element' }),
    imageDeclaration('image/mfd/background-0', 'palette/mfd'),
    imageDeclaration('image/mfd/overlay-0', 'palette/flight'),
    layoutDeclaration('layout/front', ['image/front/element-0', 'image/front/element-1'], { frame: { width: 8, height: 8 }, ...overrides['layout/front'] }),
    layoutDeclaration('layout/map', ['image/map/element-0'], { role: 'strategic-map', frame: { width: 4, height: 4 } }),
  ];

  const containerSources = (overrides: Record<string, GraphicsSource> = {}): Map<string, GraphicsSource> => new Map(Object.entries({
    'palette/flight': { type: 'data-palette', block: DATA },
    'palette/map': { type: 'embedded-palette', block: COCKPIT, record: element(2, 0) },
    'palette/mfd': { type: 'embedded-palette', block: MFD, record: mfd(0, 0) },
    'image/front/element-0': { type: 'image-record', block: COCKPIT, record: element(0, 0) },
    'image/front/element-1': { type: 'image-record', block: COCKPIT, record: element(0, 1) },
    'image/map/element-0': { type: 'image-record', block: COCKPIT, record: element(2, 0) },
    'image/mfd/background-0': { type: 'image-record', block: MFD, record: mfd(0, 0) },
    'image/mfd/overlay-0': { type: 'image-record', block: MFD, record: mfd(1, 0) },
    'layout/front': { type: 'cockpit-group', block: COCKPIT, slot: 0 },
    'layout/map': { type: 'cockpit-group', block: COCKPIT, slot: 2 },
    ...overrides,
  } satisfies Record<string, GraphicsSource>));

  const convertLayouts = (overrides: Record<string, Record<string, unknown>> = {}, sourceOverrides: Record<string, GraphicsSource> = {}, limits: unknown = LIMITS) =>
    convertGraphics(layoutDeclarations(overrides), containerSources(sourceOverrides), limits);

  it('converts CCKD groups into layouts of the stored elements that depend on their element images', () => {
    const result = convertLayouts();
    const layout = (id: string) => result.assets.find(({ descriptor }) => descriptor.id === id)!;
    expect(readLayoutPayload(layout('layout/front').payload.bytes, 1)).toEqual({
      kind: 'layout', frame: { width: 8, height: 8 },
      elements: [{ image: 'image/front/element-0', x: 0, y: 6 }, { image: 'image/front/element-1', x: 3, y: 0 }],
    });
    expect(readLayoutPayload(layout('layout/map').payload.bytes, 1).elements).toEqual([{ image: 'image/map/element-0', x: 1, y: 1 }]);
    expect(layout('layout/front').descriptor).toMatchObject({
      kind: 'layout', role: 'front-cockpit', group: 'cockpit-hud-map',
      dependencies: [{ id: 'image/front/element-0', kind: 'image' }, { id: 'image/front/element-1', kind: 'image' }],
    });
    for (const { descriptor, payload } of result.assets.filter(({ descriptor }) => descriptor.kind === 'layout')) {
      expect(payloadMismatch(descriptor.payloadIdentity, payload)).toBeNull();
      expect(() => checkGraphicsBinding(descriptor, readLayoutPayload(payload.bytes, 1))).not.toThrow();
    }
    const payloadBytes = result.assets.reduce((total, { payload }) => total + payload.bytes.length, 0);
    expect(result.usage).toMatchObject({ assets: 10, dependencyEdges: 5 + 3, imagePixels: 8 + 15 + 6 + 6 + 15, paletteEntries: 256 + 16 + 16, payloadBytes });
  });

  it('pairs the declared images with the stored elements in order', () => {
    const swapped = convertLayouts({ 'layout/front': { elements: ['image/front/element-1', 'image/front/element-0'] } });
    expect(readLayoutPayload(swapped.assets.find(({ descriptor }) => descriptor.id === 'layout/front')!.payload.bytes, 1).elements)
      .toEqual([{ image: 'image/front/element-1', x: 0, y: 6 }, { image: 'image/front/element-0', x: 3, y: 0 }]);
  });

  it('converts container records and their embedded palettes exactly like the same records as whole entries', () => {
    const contained = convertLayouts();
    const whole = convertGraphics(layoutDeclarations(), containerSources({
      'palette/map': { type: 'embedded-palette', block: MAP_RECORD },
      'palette/mfd': { type: 'embedded-palette', block: TEXTURE },
      'image/front/element-0': { type: 'image-record', block: FRONT_RAW },
      'image/front/element-1': { type: 'image-record', block: SPRITE },
      'image/map/element-0': { type: 'image-record', block: MAP_RECORD },
      'image/mfd/background-0': { type: 'image-record', block: TEXTURE },
      'image/mfd/overlay-0': { type: 'image-record', block: SPRITE },
    }), LIMITS);
    expect(contained.assets.map(({ payload }) => payload)).toEqual(whole.assets.map(({ payload }) => payload));
    expect(imageOf(contained, 'image/front/element-1').mask).not.toBeNull();
  });

  it('converts a TABL list record exactly like the same record as a whole entry, and locates a missing record', () => {
    const gauge = rawImageBlock(2, 3, [1, 2, 3, 4, 5, 6]);
    const table = tableBlock([rawImageBlock(1, 1, [9]), gauge]);
    const set = [...layoutDeclarations(), imageDeclaration('image/hud/gauge-bar-1/1', 'palette/flight')];
    const listed = convertGraphics(set, new Map([...containerSources(), ['image/hud/gauge-bar-1/1', { type: 'image-record', block: table, record: { container: 'table-record', index: 1 } }]]), LIMITS);
    const whole = convertGraphics(set, new Map([...containerSources(), ['image/hud/gauge-bar-1/1', { type: 'image-record', block: gauge }]]), LIMITS);
    expect(payloadOf(listed, 'image/hud/gauge-bar-1/1')).toEqual(payloadOf(whole, 'image/hud/gauge-bar-1/1'));
    expectSourceError(
      () => convertGraphics(set, new Map([...containerSources(), ['image/hud/gauge-bar-1/1', { type: 'image-record', block: table, record: { container: 'table-record', index: 2 } }]]), LIMITS),
      'subresource-not-found', 'graphics[image/hud/gauge-bar-1/1].record',
    );
  });

  it.each<[string, () => ReturnType<typeof convertLayouts>, string]>([
    ['fewer declared images than stored elements', () => convertLayouts({ 'layout/front': { elements: ['image/front/element-0'] } }), 'graphics[layout/front].elements'],
    ['more declared images than stored elements', () => convertGraphics(
      [...layoutDeclarations({ 'layout/front': { elements: ['image/front/element-0', 'image/front/element-1', 'image/front/element-2'] } }),
        imageDeclaration('image/front/element-2', 'palette/flight', { role: 'cockpit-element' })],
      new Map([...containerSources(), ['image/front/element-2', { type: 'image-record', block: COCKPIT, record: element(0, 2) }]]),
      LIMITS,
    ), 'graphics[layout/front].elements'],
    ['an element past the right edge', () => convertLayouts({ 'layout/front': { frame: { width: 7, height: 8 } } }), 'graphics[layout/front].elements[1].x'],
    ['an element past the bottom edge', () => convertLayouts({ 'layout/front': { frame: { width: 8, height: 7 } } }), 'graphics[layout/front].elements[0].y'],
    ['a negative x', () => negativeAt({ x: -1 }), 'graphics[layout/front].elements[0].x'],
    ['a negative y', () => negativeAt({ y: -1 }), 'graphics[layout/front].elements[0].y'],
  ])('reports geometry-mismatch for %s', (_, run, location) => expectSourceError(run, 'geometry-mismatch', location));

  /** The front layout read from a block whose first element is moved; layouts are checked before anything converts. */
  const negativeAt = (position: { x?: number; y?: number }) =>
    convertLayouts({}, { 'layout/front': { type: 'cockpit-group', block: cockpitWith([{ ...FRONT[0], ...position }, FRONT[1]]), slot: 0 } });

  it.each<[string, Record<string, GraphicsSource>, string, string]>([
    ['a layout from an empty slot', { 'layout/front': { type: 'cockpit-group', block: COCKPIT, slot: 1 } }, 'subresource-not-found', 'graphics[layout/front].groups'],
    ['a layout from a slot past the directory', { 'layout/front': { type: 'cockpit-group', block: COCKPIT, slot: 3 } }, 'subresource-not-found', 'graphics[layout/front].groups'],
    ['an element past its group', { 'image/front/element-1': { type: 'image-record', block: COCKPIT, record: element(0, 2) } }, 'subresource-not-found', 'graphics[image/front/element-1].elements'],
    ['MFDD list 2', { 'image/mfd/overlay-0': { type: 'image-record', block: MFD, record: mfd(2, 0) } }, 'subresource-not-found', 'graphics[image/mfd/overlay-0].record'],
    ['an element record without an embedded palette', { 'palette/map': { type: 'embedded-palette', block: COCKPIT, record: element(0, 0) } }, 'subresource-not-found', 'graphics[palette/map].palette'],
    ['a layout from an image record', { 'layout/front': { type: 'image-record', block: COCKPIT, record: element(0, 0) } }, 'invalid-declaration', 'graphics[layout/front].groups'],
    ['an image from a CCKD group', { 'image/front/element-0': { type: 'cockpit-group', block: COCKPIT, slot: 0 } }, 'invalid-declaration', 'graphics[image/front/element-0].record'],
  ])('rejects %s with a located source error', (_, overrides, code, location) => expectSourceError(() => convertLayouts({}, overrides), code, location));

  describe('budget', () => {
    const exact = convertLayouts().usage;

    it('passes at the exact usage', () => expect(convertLayouts({}, {}, exact).usage).toEqual(exact));

    it.each(['assets', 'dependencyEdges', 'payloadBytes'] as const)('charges the last layout before encoding it when %s runs out', dimension => {
      expectSourceError(() => convertLayouts({}, {}, { ...exact, [dimension]: exact[dimension] - 1 }), 'budget-exceeded', 'graphics[layout/map].elements',
        { name: dimension, limit: exact[dimension] - 1, observed: exact[dimension] });
    });
  });
});

// P3-03: ANIM frames and the view label read whole from their entries (spec S-08, S-10); generated in code.
describe('ANIM frame and view label conversion', () => {
  const ARCHIVE = 'MAIN/SR.NOB' as DiscPath;
  const FRAMES = [patternFrame(11, 7, 5), patternFrame(6, 3, 9)];
  const ANIM = entryRead(30_017, 'ANIM', syntheticAnimation(FRAMES.map(animFrame)));
  const LABEL = String.fromCharCode(0x80, 0x41, 0xfe);
  const LABELS = entryRead(30_019, 'TABL', viewLabelTable(LABEL));
  const DIAG = syntheticDiag({
    timings: [1, 2, 3, 4], statusFormats: ['a', 'b', 'c', 'd'], ratings: [['q', 4], ['r', 3], ['s', 2], ['t', 1], ['u', 0]],
    subsystemNames: Array.from({ length: 15 }, (_, index) => `n${index}`), stateWords: ['x', 'y', 'z'], startupMessages: [],
  });

  const set = (labelsRole = 'view-labels') => [
    paletteDeclaration('palette/flight', 'models'),
    imageDeclaration('image/explosion/01/01', 'palette/flight', { role: 'explosion-frame', group: 'models' }),
    imageDeclaration('image/explosion/01/02', 'palette/flight', { role: 'explosion-frame', group: 'models' }),
    { asset: { id: 'data/hud/view-labels', kind: 'data' }, role: labelsRole, group: 'cockpit-hud-map' },
  ];
  const frameSources = (overrides: Record<string, GraphicsSource> = {}): Map<string, GraphicsSource> => new Map(Object.entries({
    'palette/flight': { type: 'data-palette', block: DATA },
    'image/explosion/01/01': { type: 'anim-frame', archive: ARCHIVE, read: ANIM, index: 0 },
    'image/explosion/01/02': { type: 'anim-frame', archive: ARCHIVE, read: ANIM, index: 1 },
    'data/hud/view-labels': { type: 'view-labels', archive: ARCHIVE, read: LABELS },
    ...overrides,
  } satisfies Record<string, GraphicsSource>));

  it('decodes each frame into a masked image of the bound palette and the label into a view labels payload', () => {
    const result = convertGraphics(set(), frameSources(), LIMITS);
    FRAMES.forEach((frame, index) => {
      const image = imageOf(result, `image/explosion/01/0${index + 1}`);
      const expected = expectedFrame(frame);
      expect({ width: image.width, height: image.height, palette: image.palette, display: image.display, indices: [...image.indices], mask: [...image.mask!] })
        .toEqual({ ...expected, palette: 'palette/flight', display: 'direct' });
    });
    const { descriptor, payload } = result.assets.find(({ descriptor: { id } }) => id === 'data/hud/view-labels')!;
    expect(payloadMismatch(descriptor.payloadIdentity, payload)).toBeNull();
    expect(decodeViewLabelsPayload(payload.bytes, descriptor)).toEqual({ labels: [{ subMode: 8, text: LABEL }] });
    const payloadBytes = result.assets.reduce((total, { payload: { bytes } }) => total + bytes.length, 0);
    expect(result.usage).toEqual({ ...EMPTY_BUDGET_USAGE, assets: 4, dependencyEdges: 2, paletteEntries: 256, imagePixels: 77 + 18, payloadBytes });
  });

  it.each<[string, () => ReturnType<typeof convertGraphics>, string, string]>([
    ['a palette from an ANIM frame', () => convertGraphics(set(), frameSources({ 'palette/flight': { type: 'anim-frame', archive: ARCHIVE, read: ANIM, index: 0 } }), LIMITS),
      'invalid-declaration', 'graphics[palette/flight].palette'],
    ['an image from the view labels', () => convertGraphics(set(), frameSources({ 'image/explosion/01/01': { type: 'view-labels', archive: ARCHIVE, read: LABELS } }), LIMITS),
      'invalid-declaration', 'graphics[image/explosion/01/01].record'],
    ['view labels from DIAG messages', () => convertGraphics(set(), frameSources({
      'data/hud/view-labels': { type: 'status-messages', block: DIAG.data, relocations: DIAG.relocations, format: Uint8Array.of(0x25, 0x73, 0) },
    }), LIMITS), 'invalid-declaration', 'graphics[data/hud/view-labels].messages'],
    ['status messages from the view labels', () => convertGraphics(set('status-messages'), frameSources(), LIMITS), 'invalid-declaration', 'graphics[data/hud/view-labels].messages'],
    ['a colour key on a frame', () => convertGraphics(set().map((declaration, index) => (index === 1 ? { ...declaration, alpha: { colourKey: 3 } } : declaration)), frameSources(), LIMITS),
      'invalid-declaration', 'graphics[image/explosion/01/01].alpha'],
    ...[2, -1, 0.5, Number.NaN].map((index): [string, () => ReturnType<typeof convertGraphics>, string, string] => [
      `frame index ${index}`, () => convertGraphics(set(), frameSources({ 'image/explosion/01/02': { type: 'anim-frame', archive: ARCHIVE, read: ANIM, index } }), LIMITS),
      'subresource-not-found', 'archive:/MAIN/SR.NOB#30017/frames',
    ]),
  ])('rejects %s', (_, run, code, location) => expectSourceError(run, code, location));

  it('reports a missing frame exactly as the ANIM frame decoder does', () => {
    const failure = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        const { name, code, location, reason, limit } = error as SourceError;
        return { name, code, location, reason, limit };
      }
      return null;
    };
    const converted = failure(() => convertGraphics(set(), frameSources({ 'image/explosion/01/02': { type: 'anim-frame', archive: ARCHIVE, read: ANIM, index: 2 } }), LIMITS));
    expect(converted).toEqual(failure(() => decodeAnimationFrame(ARCHIVE, ANIM, 2)));
    expect(converted).toMatchObject({ code: 'subresource-not-found' });
  });

  it('charges a frame before decoding it', () => {
    const broken = entryRead(30_017, 'ANIM', syntheticAnimation([animFrame(FRAMES[0]), { ...animFrame(FRAMES[1]), data: animFrame(FRAMES[1]).data.subarray(0, 4) }]));
    const sources = frameSources({ 'image/explosion/01/02': { type: 'anim-frame', archive: ARCHIVE, read: broken, index: 1 } });
    expectSourceError(() => convertGraphics(set(), sources, { ...LIMITS, imagePixels: 77 + 17 }), 'budget-exceeded', 'graphics[image/explosion/01/02].pixels',
      { name: 'imagePixels', limit: 94, observed: 95 });
    expectSourceError(() => convertGraphics(set(), sources, LIMITS), 'invalid-payload', 'archive:/MAIN/SR.NOB#30017/frames[1]/pixels');
  });
});
