import { describe, expect, it } from 'vitest';
import { expectSourceError, fontDeclaration, imageDeclaration, layoutDeclaration, paletteDeclaration } from './conversion.test-support.ts';
import { readGraphicsDeclarations, type LayoutDeclaration } from './graphics-declarations.ts';

const validSet = () => [
  paletteDeclaration('palette/flight'),
  paletteDeclaration('palette/texture'),
  imageDeclaration('image/panel', 'palette/texture', {
    display: { nearest: 'palette/flight' }, alpha: { colourKey: 0 }, rowOrder: 'reversed',
  }),
  fontDeclaration('font/hud', {
    cell: { width: 4, height: 6 }, glyphRows: 8, charMap: [{ firstCode: 0x41, firstGlyph: 10, count: 26 }, { firstCode: 0x30, firstGlyph: 181, count: 11 }],
  }),
];

type Mutation = (set: Record<string, unknown>[]) => unknown;

describe('graphics conversion declarations', () => {
  it('reads a valid set into frozen data equal to the input', () => {
    const input = validSet();
    const declarations = readGraphicsDeclarations(input);
    expect(declarations).toEqual(input);
    for (const declaration of declarations) expect(Object.isFrozen(declaration)).toBe(true);
    expect(Object.isFrozen(declarations)).toBe(true);
    expect(readGraphicsDeclarations([])).toEqual([]);
  });

  it.each<[string, Mutation, string]>([
    ['a non-array set', () => ({}), 'graphics.declarations'],
    ['an unknown field', set => { set[2].secretField = 1; }, 'graphics.declarations[2]'],
    ['a missing field', set => { delete set[2].rowOrder; }, 'graphics.declarations[2].rowOrder'],
    ['a non-graphics kind', set => { set[0] = { ...set[0], asset: { id: 'model/flight', kind: 'model' } }; }, 'graphics.declarations[0].asset.kind'],
    ['a kind that differs from its ID', set => { set[0].asset = { id: 'palette/flight', kind: 'image' }; }, 'graphics.declarations[0].asset.kind'],
    ['an invalid role', set => { set[0].role = 'Flight'; }, 'graphics.declarations[0].role'],
    ['an unknown group', set => { set[0].group = 'hud'; }, 'graphics.declarations[0].group'],
    ['a group that does not own the kind', set => { set[3].group = 'models'; }, 'graphics.declarations[3].group'],
    ['a duplicate Asset ID', set => { set.push(paletteDeclaration('palette/flight')); }, 'graphics.declarations[4].asset.id'],
    ['a binding to a non-palette Asset', set => { set[2].palette = 'font/hud'; }, 'graphics.declarations[2].palette'],
    ['a binding outside the set', set => { set[2].palette = 'palette/other'; }, 'graphics.declarations[2].palette'],
    ['a binding to another group', set => { set[1].group = 'models'; }, 'graphics.declarations[2].palette'],
    ['a nearest target outside the set', set => { set[2].display = { nearest: 'palette/other' }; }, 'graphics.declarations[2].display.nearest'],
    ['an unknown display', set => { set[2].display = 'nearest'; }, 'graphics.declarations[2].display'],
    ['a colour key of 256', set => { set[2].alpha = { colourKey: 256 }; }, 'graphics.declarations[2].alpha.colourKey'],
    ['an unknown alpha', set => { set[2].alpha = 'mask'; }, 'graphics.declarations[2].alpha'],
    ['an unknown row order', set => { set[2].rowOrder = 'flipped'; }, 'graphics.declarations[2].rowOrder'],
    ['a cell width of 0', set => { set[3].cell = { width: 0, height: 6 }; }, 'graphics.declarations[3].cell.width'],
    ['a cell height of 9', set => { set[3].cell = { width: 4, height: 9 }; }, 'graphics.declarations[3].cell.height'],
    ['overlapping ranges', set => { set[3].charMap = [{ firstCode: 0x41, firstGlyph: 0, count: 2 }, { firstCode: 0x42, firstGlyph: 5, count: 1 }]; }, 'graphics.declarations[3].charMap[1]'],
    ['codes past 255', set => { set[3].charMap = [{ firstCode: 250, firstGlyph: 0, count: 10 }]; }, 'graphics.declarations[3].charMap[0].count'],
    ['a missing glyph row count', set => { delete set[3].glyphRows; }, 'graphics.declarations[3].glyphRows'],
    ['glyph rows below the cell height', set => { set[3].glyphRows = 5; }, 'graphics.declarations[3].glyphRows'],
    ['glyph rows of 9', set => { set[3].glyphRows = 9; }, 'graphics.declarations[3].glyphRows'],
    ['glyph rows that leave a partial glyph', set => { set[3].cell = { width: 4, height: 5 }; set[3].glyphRows = 6; }, 'graphics.declarations[3].glyphRows'],
    ['a first glyph past the glyph count', set => { set[3].charMap = [{ firstCode: 0, firstGlyph: 192, count: 1 }]; }, 'graphics.declarations[3].charMap[0].firstGlyph'],
    ['glyphs past the glyph count', set => { set[3].charMap = [{ firstCode: 0, firstGlyph: 190, count: 3 }]; }, 'graphics.declarations[3].charMap[0].count'],
    ['an empty range', set => { set[3].charMap = [{ firstCode: 0, firstGlyph: 0, count: 0 }]; }, 'graphics.declarations[3].charMap[0].count'],
  ])('rejects %s as invalid-declaration', (_, mutate, location) => {
    const set = validSet();
    const value = mutate(set) ?? set;
    expectSourceError(() => readGraphicsDeclarations(value), 'invalid-declaration', location);
    try {
      readGraphicsDeclarations(value);
    } catch (error) {
      expect((error as Error).message).not.toMatch(/secretField|palette\/other|flipped|Flight/);
    }
  });
});

describe('layout conversion declarations', () => {
  const layoutSet = () => [
    paletteDeclaration('palette/flight'),
    imageDeclaration('image/front/element-0', 'palette/flight', { role: 'cockpit-element' }),
    imageDeclaration('image/front/element-1', 'palette/flight', { role: 'cockpit-element' }),
    layoutDeclaration('layout/front', ['image/front/element-1', 'image/front/element-0']),
  ];

  it('reads a layout with its frame and element images in stored order', () => {
    const input = layoutSet();
    const declarations = readGraphicsDeclarations(input);
    expect(declarations).toEqual(input);
    const layout = declarations[3] as LayoutDeclaration;
    expect([layout, layout.frame, layout.elements].every(Object.isFrozen)).toBe(true);
  });

  it('accepts 16 element images', () => {
    const images = Array.from({ length: 16 }, (_, index) => imageDeclaration(`image/front/element-${index}`, 'palette/flight'));
    const set = [paletteDeclaration('palette/flight'), ...images, layoutDeclaration('layout/front', images.map(({ asset }) => (asset as { id: string }).id))];
    expect(readGraphicsDeclarations(set)).toHaveLength(18);
  });

  it.each<[string, Mutation, string]>([
    ['an unknown field', set => { set[3].secretField = 1; }, 'graphics.declarations[3]'],
    ['a missing frame', set => { delete set[3].frame; }, 'graphics.declarations[3].frame'],
    ['frame width 0', set => { set[3].frame = { width: 0, height: 480 }; }, 'graphics.declarations[3].frame.width'],
    ['frame width 641', set => { set[3].frame = { width: 641, height: 480 }; }, 'graphics.declarations[3].frame.width'],
    ['frame height 481', set => { set[3].frame = { width: 640, height: 481 }; }, 'graphics.declarations[3].frame.height'],
    ['no element images', set => { set[3].elements = []; }, 'graphics.declarations[3].elements'],
    ['17 element images', set => { set[3].elements = Array.from({ length: 17 }, (_, index) => `image/front/element-${index}`); }, 'graphics.declarations[3].elements'],
    ['a palette element', set => { set[3].elements = ['palette/flight']; }, 'graphics.declarations[3].elements[0]'],
    ['a repeated element image', set => { set[3].elements = ['image/front/element-0', 'image/front/element-0']; }, 'graphics.declarations[3].elements[1]'],
    ['an element image outside the set', set => { set[3].elements = ['image/front/element-0', 'image/other']; }, 'graphics.declarations[3].elements[1]'],
    ['an element image in another group', set => { set[0].group = 'models'; set[1].group = 'models'; set.push(paletteDeclaration('palette/hud')); set[2].palette = 'palette/hud'; }, 'graphics.declarations[3].elements[1]'],
    ['a group that does not own layouts', set => { set[3].group = 'models'; }, 'graphics.declarations[3].group'],
  ])('rejects %s as invalid-declaration', (_, mutate, location) => {
    const set = layoutSet();
    const value = mutate(set) ?? set;
    expectSourceError(() => readGraphicsDeclarations(value), 'invalid-declaration', location);
  });
});

describe('data conversion declarations', () => {
  const dataSet = () => [
    { asset: { id: 'data/hud/status-display/messages', kind: 'data' }, role: 'status-messages', group: 'cockpit-hud-map' },
    { asset: { id: 'data/hud/view-labels', kind: 'data' }, role: 'view-labels', group: 'cockpit-hud-map' },
  ];

  it('reads the status messages and view labels data Assets', () => {
    const input = dataSet();
    const declarations = readGraphicsDeclarations(input);
    expect(declarations).toEqual(input);
    expect(declarations.every(Object.isFrozen)).toBe(true);
  });

  it.each<[string, Mutation, string]>([
    ['another data role', set => { set[1].role = 'view-label'; }, 'graphics.declarations[1].role'],
    ['an extra field', set => { set[1].palette = 'palette/flight'; }, 'graphics.declarations[1]'],
    ['a group that does not own data', set => { set[1].group = 'audio'; }, 'graphics.declarations[1].group'],
  ])('rejects %s as invalid-declaration', (_, mutate, location) => {
    const set = dataSet() as Record<string, unknown>[];
    const value = mutate(set) ?? set;
    expectSourceError(() => readGraphicsDeclarations(value), 'invalid-declaration', location);
  });
});
